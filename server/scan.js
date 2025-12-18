// api/scan.js
import 'dotenv/config';
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";
import { searchTokenOnTwitter } from "./twitterScraper.js";

// ScrapingBee API configuration
const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_KEY;
const SCRAPINGBEE_BASE_URL = 'https://app.scrapingbee.com/api/v1/';

// ScrapingBee concurrency limiter (max 4 concurrent to stay under limit of 5)
let scrapingBeeQueue = [];
let activeScrapingBeeRequests = 0;
const MAX_CONCURRENT_SCRAPINGBEE = 4;

async function waitForScrapingBeeSlot() {
  return new Promise((resolve) => {
    if (activeScrapingBeeRequests < MAX_CONCURRENT_SCRAPINGBEE) {
      activeScrapingBeeRequests++;
      resolve();
    } else {
      scrapingBeeQueue.push(resolve);
    }
  });
}

function releaseScrapingBeeSlot() {
  activeScrapingBeeRequests--;
  if (scrapingBeeQueue.length > 0) {
    const next = scrapingBeeQueue.shift();
    activeScrapingBeeRequests++;
    next();
  }
}

// Fetch HTML from ScrapingBee with concurrency limiting
async function fetchWithScrapingBee(url) {
  if (!SCRAPINGBEE_API_KEY) {
    throw new Error('SCRAPINGBEE_KEY environment variable is not set');
  }

  // Wait for available slot
  await waitForScrapingBeeSlot();
  
  try {
    const apiUrl = `${SCRAPINGBEE_BASE_URL}?api_key=${SCRAPINGBEE_API_KEY}&url=${encodeURIComponent(url)}&render_js=true&premium_proxy=true`;
    
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      if (response.status === 401) {
        throw new Error(`ScrapingBee API authentication failed (401). Please check your SCRAPINGBEE_KEY environment variable. ${errorText ? `Details: ${errorText.substring(0, 100)}` : ''}`);
      }
      throw new Error(`ScrapingBee API error: ${response.status} ${response.statusText}${errorText ? ` - ${errorText.substring(0, 100)}` : ''}`);
    }

    return await response.text();
  } finally {
    // Always release the slot
    releaseScrapingBeeSlot();
  }
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper: Detect blockchain from address format
function detectBlockchain(address) {
  if (!address || typeof address !== "string") return null;
  const trimmed = address.trim();
  
  // BNB/BSC addresses are Ethereum-style: 0x followed by 40 hex characters
  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return "bnb";
  }
  
  // Solana addresses are base58 encoded and typically 32-44 characters
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  if (base58Regex.test(trimmed)) {
    return "solana";
  }
  
  return null;
}

// Helper: Validate Solana address format
function validateSolanaAddress(address) {
  if (!address || typeof address !== "string") return false;
  // Solana addresses are base58 encoded and typically 32-44 characters
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(address.trim());
}

// Helper: Validate BNB/BSC address format
function validateBNBAddress(address) {
  if (!address || typeof address !== "string") return false;
  // BNB addresses are Ethereum-style: 0x followed by 40 hex characters
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

// Helper: Validate any supported blockchain address
function validateAddress(address) {
  return validateSolanaAddress(address) || validateBNBAddress(address);
}

// Helper: Fetch with timeout
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error(`Request timeout: ${url}`);
    }
    throw error;
  }
}

// Helper: Safe JSON parse with fallback
function safeJsonParse(jsonString, fallback = null) {
  try {
    return JSON.parse(jsonString);
  } catch {
    return fallback;
  }
}

// Helper: Cache operations
async function getCachedScan(contractAddress) {
  try {
  const { data, error } = await supabaseAdmin
    .from("dyor_scans")
    .select("*")
    .eq("contract_address", contractAddress)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
      console.error("Cache read error:", error);
    return null;
  }
  return data;
  } catch (error) {
    console.error("Cache read exception:", error);
    return null;
  }
}

async function saveScan(contractAddress, result) {
  try {
  const { data, error } = await supabaseAdmin
    .from("dyor_scans")
    .insert({
      contract_address: contractAddress,
      result_json: result,
    })
    .select()
    .single();

  if (error) {
      console.error("Cache save error:", error);
      // Don't throw - cache save failure shouldn't break the scan
      return null;
  }
  return data;
  } catch (error) {
    console.error("Cache save exception:", error);
    return null;
  }
}

// Fetch token data from DexScreener
async function getDexScreenerData(contractAddress) {
  const startTime = Date.now();
  console.log(`[DexScreener] Starting fetch for ${contractAddress}`);
  
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`;
    console.log(`[DexScreener] Fetching: ${url}`);
    
    const response = await fetchWithTimeout(url, {}, 8000);

    console.log(`[DexScreener] Response status: ${response.status}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[DexScreener] Token not found (404)`);
      return null;
      }
      throw new Error(`DexScreener API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`[DexScreener] Received data: ${data.pairs?.length || 0} pairs`);
    
    if (!data.pairs || data.pairs.length === 0) {
      console.log(`[DexScreener] No trading pairs found`);
      return null;
    }
    
    // Get the pair with highest liquidity
    const mainPair = data.pairs.sort(
      (a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
    )[0];
    
    const result = {
      tokenName: mainPair.baseToken.name || "Unknown Token",
      symbol: mainPair.baseToken.symbol || "???",
      priceUsd: mainPair.priceUsd || null,
      volume24h: mainPair.volume?.h24 || null,
      liquidity: mainPair.liquidity?.usd || null,
      priceChange24h: mainPair.priceChange?.h24 || null,
      socials: {
        website: mainPair.info?.websites?.[0]?.url || null,
        x: mainPair.info?.socials?.find((s) => s.type === "twitter")?.url || null,
        telegram: mainPair.info?.socials?.find((s) => s.type === "telegram")?.url || null,
      },
      dexUrl: mainPair.url || null,
      marketCap: mainPair.marketCap || null, // Use marketCap from DexScreener if available
    };

    const duration = Date.now() - startTime;
    console.log(`[DexScreener] ✅ Success: ${result.symbol} (${result.tokenName}) - ${duration}ms`);
    console.log(`[DexScreener] Socials: website=${!!result.socials.website}, twitter=${!!result.socials.x}, telegram=${!!result.socials.telegram}`);

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[DexScreener] ❌ Failed after ${duration}ms:`, error.message);
    console.error(`[DexScreener] Error details:`, error);
    throw new Error(`Failed to fetch market data: ${error.message}`);
  }
}

// Fetch token safety data from RugCheck
async function getRugCheckData(contractAddress) {
  const startTime = Date.now();
  console.log(`[RugCheck] Starting fetch for ${contractAddress}`);
  
  try {
    const url = `https://api.rugcheck.xyz/v1/tokens/${contractAddress}/report`;
    console.log(`[RugCheck] Fetching: ${url}`);
    
    const response = await fetchWithTimeout(url, {}, 8000);
    console.log(`[RugCheck] Response status: ${response.status}`);
    
    if (!response.ok) {
      if (response.status === 404 || response.status === 400) {
        console.log(`[RugCheck] No data available (${response.status})`);
      return null;
      }
      throw new Error(`RugCheck API error: ${response.status}`);
    }
    
    const data = await response.json();
    const result = {
      riskLevel: data.riskLevel || "unknown",
      risks: data.risks || [],
      score: data.score || null,
    };
    
    const duration = Date.now() - startTime;
    console.log(`[RugCheck] ✅ Success: ${result.risks.length} risks found - ${duration}ms`);
    console.log(`[RugCheck] Risk level: ${result.riskLevel}, Score: ${result.score}`);
    
    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[RugCheck] ❌ Failed after ${duration}ms:`, error.message);
    // Don't throw - security data is optional
    return null;
  }
}

// Fetch token holders from Solscan
async function getSolscanHolders(mint) {
  const startTime = Date.now();
  console.log(`[Solscan] Starting fetch for holders: ${mint}`);
  
  try {
    // Solscan public API endpoint for token holders
    const url = `https://public-api.solscan.io/token/holders?tokenAddress=${mint}&offset=0&size=1`;
    
    const response = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      },
      8000
    );

    if (!response.ok) {
      console.log(`[Solscan] Request failed: ${response.status}`);
      return null;
    }

    const json = await response.json();
    
    // Solscan returns total count in the response
    const holderCount = json?.total || null;
    
    const duration = Date.now() - startTime;
    if (holderCount !== null) {
      console.log(`[Solscan] ✅ Success: ${holderCount} holders - ${duration}ms`);
    } else {
      console.log(`[Solscan] No holder count in response - ${duration}ms`);
    }
    
    return holderCount;
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[Solscan] ❌ Failed after ${duration}ms:`, err.message);
    return null;
  }
}

// Fetch token info from BSCScan (BNB/BSC)
async function getBSCScanTokenInfo(contractAddress) {
  const startTime = Date.now();
  console.log(`[BSCScan] Starting fetch for ${contractAddress}`);
  
  const apiKey = process.env.BSCSCAN_API_KEY;
  if (!apiKey) {
    console.log(`[BSCScan] No API key configured`);
    return null;
  }
  
  try {
    // Get token info (name, symbol, decimals, total supply)
    const tokenInfoUrl = `https://api.bscscan.com/api?module=token&action=tokeninfo&contractaddress=${contractAddress}&apikey=${apiKey}`;
    
    const response = await fetchWithTimeout(
      tokenInfoUrl,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      },
      8000
    );

    if (!response.ok) {
      console.log(`[BSCScan] Request failed: ${response.status}`);
      return null;
    }

    const json = await response.json();
    
    if (json.status !== "1" || !json.result) {
      console.log(`[BSCScan] API returned error: ${json.message || "Unknown error"}`);
      return null;
    }

    const token = json.result;
    const result = {
      tokenName: token.name || null,
      tokenSymbol: token.symbol || null,
      decimals: token.decimals ? parseInt(token.decimals) : null,
      supply: token.totalSupply ? BigInt(token.totalSupply).toString() : null,
      holderCount: null, // Will be fetched separately
    };
    
    const duration = Date.now() - startTime;
    console.log(`[BSCScan] ✅ Success: ${result.tokenSymbol || "N/A"} - ${duration}ms`);
    console.log(`[BSCScan] Supply: ${result.supply}, Decimals: ${result.decimals}`);
    
    return result;
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[BSCScan] ❌ Failed after ${duration}ms:`, err.message);
    return null;
  }
}

// Fetch token holders count from BSCScan (BNB/BSC)
async function getBSCScanHolders(contractAddress) {
  const startTime = Date.now();
  console.log(`[BSCScan] Starting fetch for holders: ${contractAddress}`);
  
  const apiKey = process.env.BSCSCAN_API_KEY;
  if (!apiKey) {
    console.log(`[BSCScan] No API key configured for holders`);
    return null;
  }
  
  try {
    // Get token holder count (using tokenholderlist with page size 1 to get total)
    // Note: BSCScan doesn't directly provide total count, so we'll try to get it from token info
    // Alternative: Use tokenholderlist and count, but that's expensive. 
    // For now, we'll use a workaround - get first page and estimate, or use tokeninfo which sometimes has holder count
    
    // Try to get from token info first (some tokens have this)
    const tokenInfoUrl = `https://api.bscscan.com/api?module=token&action=tokeninfo&contractaddress=${contractAddress}&apikey=${apiKey}`;
    
    const response = await fetchWithTimeout(
      tokenInfoUrl,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      },
      8000
    );

    if (!response.ok) {
      console.log(`[BSCScan] Request failed: ${response.status}`);
      return null;
    }

    const json = await response.json();
    
    if (json.status !== "1" || !json.result) {
      console.log(`[BSCScan] API returned error: ${json.message || "Unknown error"}`);
      return null;
    }

    // BSCScan tokeninfo doesn't directly provide holder count
    // We'll need to use tokenholderlist API, but it's paginated and expensive
    // For now, return null and we can enhance later if needed
    // Alternative: Use a third-party service or DexScreener which might have this
    
    const duration = Date.now() - startTime;
    console.log(`[BSCScan] Holder count not available in tokeninfo - ${duration}ms`);
    
    return null;
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[BSCScan] ❌ Failed after ${duration}ms:`, err.message);
    return null;
  }
}

// Fetch on-chain fundamentals from Helius
async function getHeliusFundamentals(mint) {
  const startTime = Date.now();
  console.log(`[Helius] Starting fetch for ${mint}`);
  
  const url = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_KEY}`;
  const hasApiKey = !!process.env.HELIUS_KEY;
  console.log(`[Helius] API key present: ${hasApiKey}`);

  const body = {
    jsonrpc: "2.0",
    id: "helius-asset",
    method: "getAsset",
    params: { id: mint },
  };

  try {
    console.log(`[Helius] Fetching from: ${url.substring(0, 50)}...`);
    
    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      8000
    );

    console.log(`[Helius] Response status: ${response.status}`);

    if (!response.ok) {
      console.log(`[Helius] Request failed: ${response.status}`);
      return null;
    }

    const json = await response.json();
    console.log(`[Helius] Response received:`, json.result ? "has result" : "no result");
    
    const asset = json?.result;

    if (!asset) {
      console.log(`[Helius] No asset data in response`);
      return null;
    }

    const result = {
      supply: asset.supply ?? null,
      decimals: asset.decimals ?? null,
      creators: asset.creators ?? [],
      mintAuthority: asset.mintAuthority ?? null,
      freezeAuthority: asset.freezeAuthority ?? null,
      holderCount: asset.ownership?.ownerCount ?? null,
      isMutable: asset.mutable ?? null,
      createdAt: asset.createdAt ?? null,
      tokenName: asset.content?.metadata?.name || null,
      tokenSymbol: asset.content?.metadata?.symbol || null,
      description: asset.content?.metadata?.description || null,
    };
    
    const duration = Date.now() - startTime;
    console.log(`[Helius] ✅ Success: ${result.tokenSymbol || "N/A"} - ${duration}ms`);
    console.log(`[Helius] Supply: ${result.supply}, Holders: ${result.holderCount}, Mint Authority: ${result.mintAuthority || "none"}`);
    
    return result;
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[Helius] ❌ Failed after ${duration}ms:`, err.message);
    console.error(`[Helius] Error details:`, err);
    return null;
  }
}

// Fetch market data from Birdeye
async function getBirdeyeData(mint) {
  const startTime = Date.now();
  console.log(`[Birdeye] Starting fetch for ${mint}`);
  
  const url = `https://public-api.birdeye.so/defi/token_overview?address=${mint}`;
  const hasApiKey = !!process.env.BIRDEYE_KEY;
  console.log(`[Birdeye] API key present: ${hasApiKey}`);

  try {
    console.log(`[Birdeye] Fetching: ${url}`);
    
    const response = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: {
          "X-API-KEY": process.env.BIRDEYE_KEY,
          accept: "application/json",
        },
      },
      8000
    );

    console.log(`[Birdeye] Response status: ${response.status}`);

    if (!response.ok) {
      console.log(`[Birdeye] Request failed: ${response.status}`);
      return null;
    }

    const json = await response.json();
    console.log(`[Birdeye] Response received:`, json.data ? "has data" : "no data");

    if (!json.data) {
      console.log(`[Birdeye] No data in response`);
      return null;
    }

    const result = {
      price: json.data.price ?? null,
      priceChange24h: json.data.priceChange24h ?? null,
      volume24h: json.data.volume24h ?? null,
      liquidity: json.data.liquidity ?? null,
      tradeCount24h: json.data.tradeCount24h ?? null,
      trendingRank: json.data.tokenRanking ?? null,
    };
    
    const duration = Date.now() - startTime;
    console.log(`[Birdeye] ✅ Success: Price=$${result.price || "N/A"}, Volume=$${result.volume24h || "N/A"} - ${duration}ms`);
    console.log(`[Birdeye] Trending rank: ${result.trendingRank || "N/A"}`);
    
    return result;
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[Birdeye] ❌ Failed after ${duration}ms:`, err.message);
    console.error(`[Birdeye] Error details:`, err);
    return null;
  }
}

// Compute market sentiment score (0-100)
function computeMarketSentiment(birdeye, dex, tickerTweets, twitterData) {
  let priceChange = 0;
  let volume = 0;
  let totalTweets = 0;
  let totalEngagement = 0;
  let highEngagementTweets = 0;

  // Use Birdeye if available, otherwise fall back to DexScreener
  if (birdeye) {
    priceChange = birdeye.priceChange24h ?? 0;
    volume = birdeye.volume24h ?? 0;
  } else if (dex) {
    priceChange = dex.priceChange24h ?? 0;
    volume = dex.volume24h ?? 0;
  }

  // Factor in social activity (tweets, engagement)
  const allTweets = [
    ...(tickerTweets?.tweets || []),
    ...(twitterData?.tweets || [])
  ];
  
  if (allTweets.length > 0) {
    totalTweets = allTweets.length;
    allTweets.forEach(tweet => {
      const likes = parseInt(tweet.likes || tweet.likeCount || 0);
      const retweets = parseInt(tweet.retweets || tweet.retweetCount || 0);
      const engagement = likes + (retweets * 2);
      totalEngagement += engagement;
      if (engagement > 50) highEngagementTweets++;
    });
  }

  // If no market data at all, but we have tweets, use tweet-based sentiment
  if (!birdeye && !dex && totalTweets === 0) {
    return null;
  }

  // Calculate component scores (0-1 scale)
  
  // Price momentum: -50% to +50% maps to 0-1, with bonus for positive
  let priceScore = 0.5; // neutral baseline
  if (priceChange !== 0) {
    priceScore = Math.max(0, Math.min(1, (priceChange + 30) / 60));
    // Bonus for strong positive momentum
    if (priceChange > 10) priceScore = Math.min(1, priceScore + 0.1);
  }

  // Volume score: logarithmic scale, higher volume = higher score
  let volumeScore = 0.3; // baseline
  if (volume > 0) {
    volumeScore = Math.max(0.2, Math.min(1, Math.log10(volume) / 7));
  }
  
  // Social engagement score: based on tweets + engagement quality
  let socialScore = 0;
  if (totalTweets > 0) {
    const avgEngagement = totalEngagement / totalTweets;
    
    // Tweet count contribution (more tweets = more buzz)
    const tweetCountScore = Math.min(0.3, totalTweets * 0.03);
    
    // Engagement quality (avg engagement per tweet)
    const engagementScore = Math.min(0.4, Math.log10(avgEngagement + 1) / 3);
    
    // High-engagement tweets bonus (viral potential)
    const viralScore = Math.min(0.3, highEngagementTweets * 0.06);
    
    socialScore = tweetCountScore + engagementScore + viralScore;
  }

  // Calculate weighted sentiment
  // Weight distribution: Price 25%, Volume 25%, Social 50% (social is key for memecoins)
  const sentiment = (0.25 * priceScore) + (0.25 * volumeScore) + (0.5 * socialScore);

  // Scale to 0-100 and apply minimum thresholds
  let finalSentiment = Math.round(sentiment * 100);
  
  // Minimum scores based on activity
  if (totalTweets > 0) {
    if (highEngagementTweets >= 3) finalSentiment = Math.max(finalSentiment, 55);
    else if (totalTweets >= 5) finalSentiment = Math.max(finalSentiment, 40);
    else finalSentiment = Math.max(finalSentiment, 30);
  }
  
  // Cap at 100
  return Math.min(100, finalSentiment);
}

// Calculate comprehensive token score (1-100)
// Format liquidity/volume: use K for < 1M, M for >= 1M
function formatLiquidityVolume(value) {
  if (!value) return "unknown";
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  } else {
    return `$${(value / 1000).toFixed(0)}K`;
  }
}

// Detect official exchange backing
function detectOfficialBacking(tokenName, symbol, websiteData, socials) {
  const nameLower = (tokenName || "").toLowerCase();
  const symbolLower = (symbol || "").toLowerCase();
  const websiteText = websiteData ? 
    `${websiteData.title || ""} ${websiteData.metaDesc || ""} ${websiteData.shortText || ""}`.toLowerCase() : "";
  
  // Check for major exchange indicators
  const exchangeIndicators = [
    { name: "binance", keywords: ["binance", "bibi", "official binance", "binance official", "binance verified"] },
    { name: "coinbase", keywords: ["coinbase", "official coinbase", "coinbase official", "coinbase verified"] },
    { name: "okx", keywords: ["okx", "okex", "official okx", "okx official"] },
    { name: "kraken", keywords: ["kraken", "official kraken", "kraken official"] },
  ];
  
  for (const exchange of exchangeIndicators) {
    for (const keyword of exchange.keywords) {
      if (nameLower.includes(keyword) || 
          symbolLower.includes(keyword) || 
          websiteText.includes(keyword) ||
          (socials?.x && socials.x.toLowerCase().includes(keyword))) {
        console.log(`[Scoring] ✅ Detected official ${exchange.name.toUpperCase()} backing`);
        return { exchange: exchange.name, confidence: "high" };
      }
    }
  }
  
  // Check for "official" or "verified" in website/twitter
  if (websiteText.includes("official") || websiteText.includes("verified")) {
    if (websiteText.includes("binance") || nameLower.includes("binance") || symbolLower.includes("binance")) {
      return { exchange: "binance", confidence: "medium" };
    }
  }
  
  return null;
}

function calculateTokenScore(tokenData) {
  let score = 30; // Start lower - be more conservative
  
  const { marketData, fundamentals, securityData, socials, sentimentScore, blockchain, websiteData, tokenName, symbol } = tokenData;
  
  // Check for official exchange backing - MAJOR BONUS
  const officialBacking = detectOfficialBacking(tokenName, symbol, websiteData, socials);
  if (officialBacking) {
    if (officialBacking.confidence === "high") {
      score += 25; // Major exchange official token = huge boost
      console.log(`[Scoring] Official ${officialBacking.exchange} backing detected: +25 points`);
  } else {
      score += 15; // Possible official backing
      console.log(`[Scoring] Possible ${officialBacking.exchange} backing detected: +15 points`);
    }
  }
  
  // CRITICAL: Low liquidity is a major red flag - penalize heavily
  // Note: For meme coins, $500K+ liquidity is actually huge and excellent
  if (marketData?.liquidity) {
    const liquidity = marketData.liquidity;
    if (liquidity > 1000000) score += 13; // >$1M - excellent
    else if (liquidity > 500000) score += 12; // >$500K - huge for meme coins, treat as excellent
    else if (liquidity > 100000) score += 8; // >$100K - good for meme coins
    else if (liquidity > 50000) score += 5; // >$50K - decent
    else if (liquidity > 10000) score += 2; // >$10K
    else if (liquidity > 5000) score += 1; // >$5K
    else {
      // Very low liquidity = major red flag
      score -= 15;
    }
  } else {
    score -= 20; // No liquidity = very bad
  }
  
  // Holder Count Score - IGNORED for now due to unreliable data
  // Holder data is often incorrect, so we don't penalize for missing or low holder counts
  // if (fundamentals?.holderCount) {
  //   const holders = fundamentals.holderCount;
  //   if (holders > 10000) score += 10;
  //   else if (holders > 5000) score += 8;
  //   else if (holders > 1000) score += 6;
  //   else if (holders > 500) score += 4;
  //   else if (holders > 100) score += 2;
  //   else if (holders > 50) score += 1;
  // }
  
  // Market Cap / Supply Score - use marketCap from marketData if available, otherwise calculate
  let marketCap = marketData?.marketCap;
  if (!marketCap && fundamentals?.supply && marketData?.price) {
    const supply = parseInt(fundamentals.supply) || 0;
    const price = parseFloat(marketData.price) || 0;
    const decimals = fundamentals.decimals || (blockchain === "bnb" ? 18 : 9);
    marketCap = (supply * price) / Math.pow(10, decimals);
  }
  
  if (marketCap) {
    if (marketCap > 10000000) score += 10; // >$10M - excellent
    else if (marketCap > 5000000) score += 8; // >$5M - very good
    else if (marketCap > 1000000) score += 7; // >$1M - good
    else if (marketCap > 500000) score += 5; // >$500K - decent for meme coins
    else if (marketCap > 100000) score += 3; // >$100K
    else if (marketCap > 10000) score += 1; // >$10K
    else {
      // Very low market cap = red flag
      score -= 5;
    }
  } else {
    score -= 3; // Missing market cap data (reduced penalty)
  }
  
  // Security Score - CRITICAL for safety
  if (securityData) {
    if (!securityData.risks || securityData.risks.length === 0) {
      score += 10; // No risks = good (reduced from 15)
    } else {
      const highRisks = securityData.risks.filter(r => r.level === 'high').length;
      const mediumRisks = securityData.risks.filter(r => r.level === 'medium').length;
      
      // Heavier penalties for risks
      score -= highRisks * 15; // Each high risk = -15 (was -5)
      score -= mediumRisks * 8; // Each medium risk = -8 (was -2)
      
      // Mint/Freeze authority checks (Solana-specific)
      if (blockchain === "solana") {
        if (fundamentals?.mintAuthority === null && fundamentals?.freezeAuthority === null) {
          score += 3; // No mint/freeze authority = good (reduced from 5)
      }
      if (fundamentals?.mintAuthority) {
          score -= 15; // Has mint authority = MAJOR risk (was -8)
      }
      if (fundamentals?.freezeAuthority) {
          score -= 15; // Has freeze authority = MAJOR risk (was -8)
        }
      }
    }
  } else {
    // For BNB tokens, securityData is null (RugCheck doesn't support it)
    if (blockchain === "bnb") {
      score -= 5; // Penalty for missing security data on BNB (increased from 1)
    } else {
      score -= 10; // No security data = very suspicious (increased from 3)
    }
  }
  
  // Social Presence Score - require real presence
  if (socials) {
    let socialCount = 0;
    if (socials.website) socialCount++;
    if (socials.x) socialCount++;
    if (socials.telegram) socialCount++;
    if (socialCount >= 3) score += 5; // All 3 = good
    else if (socialCount === 2) score += 3;
    else if (socialCount === 1) score += 1;
  } else {
    score -= 8; // No socials = suspicious (increased from 5)
  }
  
  // Volume/Activity Score - require substantial volume
  if (marketData?.volume24h) {
    const volume = marketData.volume24h;
    if (volume > 1000000) score += 8; // >$1M
    else if (volume > 500000) score += 6;
    else if (volume > 100000) score += 4;
    else if (volume > 50000) score += 2;
    else if (volume > 10000) score += 1;
    else {
      // Very low volume = red flag
      score -= 5;
    }
  } else {
    score -= 5; // No volume data
  }
  
  // Sentiment Score - important component
  // Calculate fundamentals score first (before sentiment)
  const fundamentalsScore = score;
  
  // Now add sentiment as a separate component
  let sentimentComponent = 50; // Default neutral
  if (sentimentScore !== null && sentimentScore !== undefined) {
    sentimentComponent = sentimentScore;
  }
  
  // Final score is weighted average: 60% fundamentals, 40% sentiment
  score = Math.round((fundamentalsScore * 0.6) + (sentimentComponent * 0.4));
  
  // HARD CAPS: Prevent high scores for tokens with red flags
  const liquidity = marketData?.liquidity || 0;
  const holders = fundamentals?.holderCount || 0;
  const hasRisks = securityData?.risks?.length > 0;
  const hasMintAuth = blockchain === "solana" && fundamentals?.mintAuthority;
  const hasFreezeAuth = blockchain === "solana" && fundamentals?.freezeAuthority;
  
  // Cap at 60 if liquidity is too low
  if (liquidity < 50000) {
    score = Math.min(score, 60);
  }
  
  // Holder cap removed - holder data is unreliable
  
  // Cap at 40 if there are security risks
  if (hasRisks) {
    score = Math.min(score, 40);
  }
  
  // Cap at 30 if mint/freeze authority exists
  if (hasMintAuth || hasFreezeAuth) {
    score = Math.min(score, 30);
  }
  
  // Require multiple strong indicators for scores above 70
  const strongIndicators = [
    liquidity > 100000,
    // holders > 1000, // Removed - holder data unreliable
    !hasRisks,
    !hasMintAuth && !hasFreezeAuth,
    socials && (socials.website || socials.x || socials.telegram),
    marketData?.volume24h > 100000,
    marketCap > 1000000 // Market cap > $1M
  ].filter(Boolean).length;
  
  if (score > 70 && strongIndicators < 4) {
    score = Math.min(score, 70); // Need at least 4 strong indicators for 70+
  }
  
  // Clamp between 1 and 100
  return Math.max(1, Math.min(100, Math.round(score)));
}

// Search Nitter for tweets containing a ticker/symbol
async function searchNitterForTicker(ticker) {
  const startTime = Date.now();
  console.log(`[Twitter Search] Starting Twitter search for ticker: ${ticker}`);
  
  if (!ticker || ticker === "???") {
    console.log(`[Twitter Search] No valid ticker provided`);
    return null;
  }

  // For ticker search, we'll try multiple Nitter mirrors with proper error detection
  const nitterMirrors = [
    'https://nitter.privacydev.net',
    'https://nitter.net',
    'https://nitter.poast.org',
  ];

  for (const mirror of nitterMirrors) {
    try {
      // Search for tweets containing the ticker symbol (with $)
      const searchQuery = `$${ticker}`;
      const searchUrl = `${mirror}/search?f=tweets&q=${encodeURIComponent(searchQuery)}`;
      console.log(`[Twitter Search] Trying mirror: ${searchUrl}`);

      const response = await fetchWithTimeout(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }, 8000);
      
      console.log(`[Twitter Search] Response status: ${response.status}`);
      
      if (!response.ok) {
        console.log(`[Twitter Search] Mirror ${mirror} failed with status ${response.status}`);
        continue;
      }

      const html = await response.text();

      // Detect if Nitter actually returned content
      if (!html.includes('timeline-item') && !html.includes('tweet-content')) {
        console.log(`[Twitter Search] Mirror ${mirror} returned no tweets`);
        continue;
      }

      // Detect rate limiting
      if (html.includes('rate limit') || html.includes('Too many requests')) {
        console.log(`[Twitter Search] Mirror ${mirror} is rate limited`);
        continue;
      }

      const $ = cheerio.load(html);
      const tweets = [];

      $(".timeline-item").each((i, el) => {
        if (i >= 3) return; // Only first 3 tweets

        const text = $(el).find(".tweet-content").text().trim();
        const date = $(el).find("time").attr("datetime");
        const likes = $(el).find(".icon-heart").parent().text().trim() || '0';
        const retweets = $(el).find(".icon-retweet").parent().text().trim() || '0';
        
        const tweetLink = $(el).find("a.tweet-link").attr("href");
        let tweetId = null;
        let tweetUrl = null;
        let username = null;
        
        if (tweetLink) {
          const linkMatch = tweetLink.match(/\/([^\/]+)\/status\/(\d+)/);
          if (linkMatch) {
            username = linkMatch[1];
            tweetId = linkMatch[2];
            tweetUrl = `https://x.com/${username}/status/${tweetId}`;
          }
        }

        // Only include tweets that actually mention the ticker
        if (text && (text.includes(`$${ticker}`) || text.toLowerCase().includes(ticker.toLowerCase()))) {
          tweets.push({
            text,
            date,
            likes,
            retweets,
            tweetId,
            tweetUrl,
            username,
          });
        }
      });

      if (tweets.length > 0) {
        const result = {
          tweets,
          ticker,
          tweetCount: tweets.length,
        };
        
        const duration = Date.now() - startTime;
        console.log(`[Twitter Search] ✅ Success via ${mirror}: ${tweets.length} ticker tweets found - ${duration}ms`);
        return result;
      } else {
        console.log(`[Twitter Search] Mirror ${mirror} returned 0 relevant tweets`);
      }
    } catch (mirrorErr) {
      console.log(`[Twitter Search] Mirror error: ${mirrorErr.message}`);
      continue;
    }
  }

  const duration = Date.now() - startTime;
  console.log(`[Twitter Search] ❌ All mirrors failed or returned no tweets after ${duration}ms`);
  
  // Return empty result instead of null so the scan doesn't fail
  return {
    tweets: [],
    ticker,
    tweetCount: 0,
  };
}

// Fetch Twitter via Nitter using ScrapingBee
async function getTwitterFromNitter(twitterUrl) {
  const startTime = Date.now();
  console.log(`[Nitter Scraper] Starting Twitter scrape for: ${twitterUrl}`);
  
  if (!twitterUrl) {
    console.log(`[Nitter Scraper] No Twitter URL provided`);
    return null;
  }

  // Extract username from Twitter URL
  const usernameMatch = twitterUrl.match(/(?:twitter\.com|x\.com)\/([^\/\?]+)/);
  const username = usernameMatch ? usernameMatch[1] : null;

  if (!username) {
    console.log(`[Nitter Scraper] Could not extract username from URL`);
    return null;
  }

  console.log(`[Nitter Scraper] Extracted username: ${username}`);

  if (!SCRAPINGBEE_API_KEY) {
    console.log(`[Nitter Scraper] SCRAPINGBEE_KEY not set, skipping`);
    return null;
  }

  // Nitter mirrors to try (in order of preference)
    const nitterMirrors = [
      'https://nitter.net',
    'https://nitter.privacydev.net',
      'https://nitter.poast.org',
    ];

    for (const mirror of nitterMirrors) {
      try {
      console.log(`[Nitter Scraper] Trying mirror: ${mirror}`);
      
      // Build Nitter user profile URL
        const nitterUrl = `${mirror}/${username}`;
      console.log(`[Nitter Scraper] Fetching via ScrapingBee: ${nitterUrl}`);
      
      // Fetch HTML using ScrapingBee
      const html = await fetchWithScrapingBee(nitterUrl);
      
      // Check for rate limiting or errors
        if (html.includes('rate limit') || html.includes('Too many requests')) {
        console.log(`[Nitter Scraper] ${mirror} is rate limited`);
        continue; // Try next mirror
        }

      // Parse HTML with cheerio
        const $ = cheerio.load(html);
      
      // Check if we have tweets
      const tweetElements = $('.timeline-item');
      if (tweetElements.length === 0) {
        console.log(`[Nitter Scraper] No tweets found on ${mirror}`);
        continue; // Try next mirror
      }

      // Extract tweets using Nitter's HTML structure
        const tweets = [];

      tweetElements.slice(0, 5).each((i, el) => {
        const $tweet = $(el);
        
        // Extract tweet text
        const text = $tweet.find('.tweet-content').text().trim();
        
        // Extract time
        const timeElement = $tweet.find('time');
        const date = timeElement.attr('datetime') || '';
        const timeText = timeElement.text().trim();
        
        // Extract engagement metrics (Nitter format)
        const replyElement = $tweet.find('.icon-reply').parent();
        const retweetElement = $tweet.find('.icon-retweet').parent();
        const likeElement = $tweet.find('.icon-heart').parent();
        
        const replies = replyElement.text().match(/\d+/) ? replyElement.text().match(/\d+/)[0] : '0';
        const retweets = retweetElement.text().match(/\d+/) ? retweetElement.text().match(/\d+/)[0] : '0';
        const likes = likeElement.text().match(/\d+/) ? likeElement.text().match(/\d+/)[0] : '0';
        
        // Extract tweet URL
        const linkElement = $tweet.find('a[href*="/status/"]').first();
          let tweetUrl = null;
        let tweetId = null;
        
        if (linkElement.length > 0) {
          const href = linkElement.attr('href') || '';
          if (href) {
            // Convert Nitter URL to X.com URL
            const statusMatch = href.match(/\/status\/(\d+)/);
            if (statusMatch) {
              tweetId = statusMatch[1];
              tweetUrl = `https://x.com/${username}/status/${tweetId}`;
            } else {
              tweetUrl = href.startsWith('http') ? href : `https://x.com${href}`;
            }
            }
          }

          if (text) {
          tweets.push({
            text,
            date,
            timeText,
            likes: parseInt(likes) || 0,
            retweets: parseInt(retweets) || 0,
            replies: parseInt(replies) || 0,
            tweetId,
            tweetUrl,
          });
          }
        });

        if (tweets.length > 0) {
        const duration = Date.now() - startTime;
        console.log(`[Nitter Scraper] ✅ Success via ${mirror}: Found ${tweets.length} tweets - ${duration}ms`);

          const result = {
            tweets,
            topTweet: tweets[0] || null,
            tweetCount: tweets.length,
          };
          
          return result;
      } else {
        console.log(`[Nitter Scraper] ${mirror} returned 0 tweets`);
    }
    } catch (error) {
      console.log(`[Nitter Scraper] Error with ${mirror}: ${error.message}`);
      continue; // Try next mirror
    }
  }

  const duration = Date.now() - startTime;
  console.error(`[Nitter Scraper] ❌ All mirrors failed after ${duration}ms`);
  return null;
}

// Fetch Telegram via public t.me/s/{channel}
async function getTelegramFeed(telegramUrl) {
  const startTime = Date.now();
  console.log(`[Telegram] Starting scrape for: ${telegramUrl}`);
  
  if (!telegramUrl) {
    console.log(`[Telegram] No Telegram URL provided`);
    return null;
  }

  const publicUrl = telegramUrl
    .replace("https://t.me/", "https://t.me/s/")
    .replace("http://t.me/", "https://t.me/s/");

  console.log(`[Telegram] Converted to public URL: ${publicUrl}`);

  try {
    const response = await fetchWithTimeout(publicUrl, {}, 8000);
    console.log(`[Telegram] Response status: ${response.status}`);
    
    if (!response.ok) {
      console.log(`[Telegram] Request failed: ${response.status}`);
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const messages = [];

    $(".tgme_widget_message").each((i, el) => {
      if (i >= 10) return; // limit

      const text = $(el).find(".tgme_widget_message_text").text().trim();
      const date = $(el).find("time").attr("datetime");

      messages.push({ text, date });
    });

    const result = {
      messages,
      recentMessageCount: messages.length,
      lastMessage: messages[0] || null,
    };
    
    const duration = Date.now() - startTime;
    console.log(`[Telegram] ✅ Success: ${messages.length} messages scraped - ${duration}ms`);
    
    return result;
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[Telegram] ❌ Failed after ${duration}ms:`, err.message);
    console.error(`[Telegram] Error details:`, err);
    return null;
  }
}

// Fetch website URL from four.meme for BNB tokens
async function getWebsiteFromFourMeme(contractAddress) {
  const startTime = Date.now();
  console.log(`[FourMeme] Starting fetch for website: ${contractAddress}`);
  
  if (!SCRAPINGBEE_API_KEY) {
    console.log(`[FourMeme] SCRAPINGBEE_KEY not set, skipping`);
    return null;
  }
  
  try {
    const fourMemeUrl = `https://four.meme/token/${contractAddress}`;
    console.log(`[FourMeme] Fetching: ${fourMemeUrl}`);
    
    const html = await fetchWithScrapingBee(fourMemeUrl);
    
    if (!html || html.length < 100) {
      console.log(`[FourMeme] Empty or invalid response`);
      return null;
    }
    
    const $ = cheerio.load(html);
    
    // Look for website links in various places
    // Common patterns: href attributes, social links, etc.
    let websiteUrl = null;
    
    // Method 1: Look for links with "website" or "site" in text or aria-label
    $('a[href]').each((i, elem) => {
      const $elem = $(elem);
      const linkText = $elem.text().toLowerCase();
      const ariaLabel = ($elem.attr('aria-label') || '').toLowerCase();
      const href = $elem.attr('href');
      
      if (href && (linkText.includes('website') || linkText.includes('site') || 
                   linkText.includes('web') || ariaLabel.includes('website') || 
                   ariaLabel.includes('site'))) {
        let fullUrl = href;
        if (href.startsWith('/')) {
          fullUrl = `https://four.meme${href}`;
        } else if (!href.startsWith('http://') && !href.startsWith('https://')) {
          fullUrl = `https://${href}`;
        }
        
        if (fullUrl.startsWith('http://') || fullUrl.startsWith('https://')) {
          const urlLower = fullUrl.toLowerCase();
          // Strictly exclude four.meme and all common non-website links
          if (!urlLower.includes('twitter.com') && 
              !urlLower.includes('x.com') && 
              !urlLower.includes('telegram.org') && 
              !urlLower.includes('t.me') &&
              !urlLower.includes('dexscreener.com') &&
              !urlLower.includes('bscscan.com') &&
              !urlLower.includes('four.meme') &&
              !urlLower.includes('fourmeme') &&
              !urlLower.match(/four[.\-]?meme/i) &&
              !urlLower.includes('github.com') &&
              !urlLower.includes('discord.com') &&
              !urlLower.includes('medium.com') &&
              !urlLower.includes('reddit.com') &&
              !urlLower.includes('etherscan.io') &&
              !urlLower.includes('solscan.io') &&
              !urlLower.includes('solana.com')) {
            websiteUrl = fullUrl;
            return false; // break
          }
        }
      }
    });
    
    // Method 1b: Look for links in the token info section (the div with bg-darkGray900)
    if (!websiteUrl) {
      const tokenInfoSection = $('.bg-darkGray900, [class*="darkGray900"]').first();
      if (tokenInfoSection.length > 0) {
        tokenInfoSection.find('a[href]').each((i, elem) => {
          const href = $(elem).attr('href');
          if (href) {
            // Convert relative URLs to absolute
            let fullUrl = href;
            if (href.startsWith('/')) {
              fullUrl = `https://four.meme${href}`;
            } else if (!href.startsWith('http://') && !href.startsWith('https://')) {
              fullUrl = `https://${href}`;
            }
            
            if (fullUrl.startsWith('http://') || fullUrl.startsWith('https://')) {
              const urlLower = fullUrl.toLowerCase();
              // Strictly exclude four.meme and all common non-website links
              if (!urlLower.includes('twitter.com') && 
                  !urlLower.includes('x.com') && 
                  !urlLower.includes('telegram.org') && 
                  !urlLower.includes('t.me') &&
                  !urlLower.includes('dexscreener.com') &&
                  !urlLower.includes('bscscan.com') &&
                  !urlLower.includes('four.meme') &&
                  !urlLower.includes('fourmeme') &&
                  !urlLower.match(/four[.\-]?meme/i) &&
                  !urlLower.includes('github.com') &&
                  !urlLower.includes('discord.com') &&
                  !urlLower.includes('medium.com') &&
                  !urlLower.includes('reddit.com') &&
                  !urlLower.includes('etherscan.io') &&
                  !urlLower.includes('solscan.io') &&
                  !urlLower.includes('solana.com')) {
                // This might be the website
                if (!websiteUrl) {
                  websiteUrl = fullUrl;
                  return false; // break
                }
              }
            }
          }
        });
      }
    }
    
    // Method 1c: Search all links more aggressively - look for external links
    if (!websiteUrl) {
      $('a[href]').each((i, elem) => {
        const href = $(elem).attr('href');
        if (href) {
          // Convert relative URLs to absolute
          let fullUrl = href;
          if (href.startsWith('/')) {
            fullUrl = `https://four.meme${href}`;
          } else if (!href.startsWith('http://') && !href.startsWith('https://')) {
            fullUrl = `https://${href}`;
          }
          
          if (fullUrl.startsWith('http://') || fullUrl.startsWith('https://')) {
            const urlLower = fullUrl.toLowerCase();
            // Strictly exclude four.meme and all common non-website links
            if (!urlLower.includes('twitter.com') && 
                !urlLower.includes('x.com') && 
                !urlLower.includes('telegram.org') && 
                !urlLower.includes('t.me') &&
                !urlLower.includes('dexscreener.com') &&
                !urlLower.includes('bscscan.com') &&
                !urlLower.includes('four.meme') &&
                !urlLower.includes('fourmeme') &&
                !urlLower.match(/four[.\-]?meme/i) &&
                !urlLower.includes('github.com') &&
                !urlLower.includes('discord.com') &&
                !urlLower.includes('medium.com') &&
                !urlLower.includes('reddit.com') &&
                !urlLower.includes('etherscan.io') &&
                !urlLower.includes('solscan.io') &&
                !urlLower.includes('solana.com')) {
              // This might be the website - prioritize links that look like domains
              if (!websiteUrl || (fullUrl.match(/^https?:\/\/[^\/]+$/))) {
                websiteUrl = fullUrl;
              }
            }
          }
        }
      });
    }
    
    // Method 2: Look in meta tags (og:url, canonical, etc.)
    if (!websiteUrl) {
      const ogUrl = $('meta[property="og:url"]').attr('content');
      const canonical = $('link[rel="canonical"]').attr('href');
      
      if (ogUrl && (ogUrl.startsWith('http://') || ogUrl.startsWith('https://'))) {
        websiteUrl = ogUrl;
      } else if (canonical && (canonical.startsWith('http://') || canonical.startsWith('https://'))) {
        websiteUrl = canonical;
      }
    }
    
    // Method 3: Look for website in JSON-LD structured data
    if (!websiteUrl) {
      $('script[type="application/ld+json"]').each((i, elem) => {
        try {
          const json = JSON.parse($(elem).html());
          if (json.url && (json.url.startsWith('http://') || json.url.startsWith('https://'))) {
            websiteUrl = json.url;
            return false; // break
          }
        } catch (e) {
          // Ignore JSON parse errors
        }
      });
    }
    
    const duration = Date.now() - startTime;
    
    // Final validation: Make absolutely sure we're not returning four.meme
    if (websiteUrl) {
      // Check if the URL is actually four.meme (in any form)
      const urlLower = websiteUrl.toLowerCase();
      if (urlLower.includes('four.meme') || 
          urlLower.includes('fourmeme') ||
          urlLower.match(/four[.\-]?meme/i)) {
        console.log(`[FourMeme] ⚠️  Rejected four.meme URL: ${websiteUrl}`);
        websiteUrl = null;
      } else {
        // Extract domain to verify it's not four.meme
        try {
          const urlObj = new URL(websiteUrl);
          const hostname = urlObj.hostname.toLowerCase();
          if (hostname.includes('four.meme') || hostname.includes('fourmeme')) {
            console.log(`[FourMeme] ⚠️  Rejected four.meme domain: ${hostname}`);
            websiteUrl = null;
          }
        } catch (e) {
          // URL parsing failed, but we already validated it starts with http/https
        }
      }
    }
    
    if (websiteUrl) {
      console.log(`[FourMeme] ✅ Found website: ${websiteUrl} - ${duration}ms`);
      return websiteUrl;
    } else {
      console.log(`[FourMeme] No website found - ${duration}ms`);
      return null;
    }
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[FourMeme] ❌ Failed after ${duration}ms:`, err.message);
    if (err.message.includes('401') || err.message.includes('authentication')) {
      console.error(`[FourMeme] ⚠️  ScrapingBee API key issue. Please verify SCRAPINGBEE_KEY is set correctly in your environment.`);
    }
    return null;
  }
}

// Scrape website HTML using ScrapingBee (primary) with fallback
async function scrapeWebsite(websiteUrl) {
  const startTime = Date.now();
  console.log(`[Website] Starting scrape for: ${websiteUrl}`);
  
  if (!websiteUrl) {
    console.log(`[Website] No website URL provided`);
    return null;
  }

  // Check if URL is x.com or twitter.com - route to Twitter scraper instead
  const isTwitterUrl = /^(https?:\/\/)?(www\.)?(x\.com|twitter\.com)/i.test(websiteUrl);
  if (isTwitterUrl) {
    console.log(`[Website] Detected Twitter/X.com URL, routing to Twitter scraper...`);
    
    // Extract username from URL (handles both profile and tweet URLs)
    // Examples: x.com/username, x.com/username/status/123456, twitter.com/username
    const twitterMatch = websiteUrl.match(/(?:twitter\.com|x\.com)\/([^\/\?]+)/);
    const username = twitterMatch ? twitterMatch[1] : null;
    
    if (username && username !== 'status' && username !== 'i' && username !== 'search') {
      // Route to Twitter scraper
      const twitterData = await getTwitterFromNitter(websiteUrl);
      
      if (twitterData && twitterData.tweets && twitterData.tweets.length > 0) {
        // Convert Twitter data to website-like format for compatibility
        const topTweet = twitterData.topTweet || twitterData.tweets[0];
        const tweetTexts = twitterData.tweets.slice(0, 3).map(t => t.text || '').filter(Boolean);
        const result = {
          url: websiteUrl,
          title: `Twitter: @${username}`,
          metaDesc: (topTweet && topTweet.text) ? topTweet.text.substring(0, 200) : '',
          shortText: tweetTexts.join('\n\n'),
          headings: [],
          twitterData: twitterData, // Include full Twitter data
        };
        
        const duration = Date.now() - startTime;
        console.log(`[Website] ✅ Twitter data extracted: ${twitterData.tweets.length} tweets - ${duration}ms`);
        return result;
      } else {
        console.log(`[Website] Twitter scraper returned no data for ${websiteUrl}`);
        return null;
      }
    } else {
      console.log(`[Website] Could not extract valid username from Twitter URL: ${websiteUrl}`);
      return null;
    }
  }

  // Method 1: Try ScrapingBee first (best for Cloudflare-protected sites)
  if (SCRAPINGBEE_API_KEY) {
    try {
      console.log(`[Website] Trying ScrapingBee...`);
      const html = await fetchWithScrapingBee(websiteUrl);
      
      if (html && html.length > 100) {
        const $ = cheerio.load(html);
        
        // Remove script and style tags
        $('script, style, noscript').remove();
        
        const title = $("title").text().trim();
        const metaDesc = $('meta[name="description"]').attr("content") || 
                         $('meta[property="og:description"]').attr("content") || 
                         $('meta[name="og:description"]').attr("content") || '';
        const ogTitle = $('meta[property="og:title"]').attr("content") || '';
        
        // Get main content - prioritize article, main, or body
        let text = '';
        const article = $('article').first();
        const main = $('main').first();
        const body = $('body');
        
        if (article.length > 0) {
          text = article.text().replace(/\s+/g, " ").trim();
        } else if (main.length > 0) {
          text = main.text().replace(/\s+/g, " ").trim();
        } else {
          text = body.text().replace(/\s+/g, " ").trim();
        }
        
        // Extract key headings
        const headings = [];
        $('h1, h2, h3').each((i, el) => {
          const headingText = $(el).text().trim();
          if (headingText && headingText.length < 200) {
            headings.push(headingText);
          }
        });

        // Validate we got actual content
        if (text.length < 100 && !title && !metaDesc) {
          throw new Error('No meaningful content extracted');
        }

        const result = {
          url: websiteUrl,
          title: title || ogTitle || 'No title',
          metaDesc: metaDesc || '',
          shortText: text.slice(0, 2000), // Increased from 1500 to 2000
          headings: headings.slice(0, 10), // Top 10 headings
        };
        
        const duration = Date.now() - startTime;
        console.log(`[Website] ✅ Success via ScrapingBee: Title="${result.title.substring(0, 50)}...", ${text.length} chars, ${headings.length} headings - ${duration}ms`);
        
        return result;
      }
    } catch (sbErr) {
      console.log(`[Website] ScrapingBee method failed: ${sbErr.message}`);
    }
  }

  // Method 2: Try allorigins proxy (fallback)
  try {
    const proxied = `https://api.allorigins.win/raw?url=${encodeURIComponent(websiteUrl)}`;
    console.log(`[Website] Trying allorigins proxy...`);

    const response = await fetchWithTimeout(proxied, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    }, 10000);
    
    console.log(`[Website] Response status: ${response.status}`);
    
    if (!response.ok) {
      throw new Error(`Response not OK: ${response.status}`);
    }

    const html = await response.text();

    // Detect Cloudflare protection
    if (html.includes('Just a moment') || 
        html.includes('cf-browser-verification') || 
        html.includes('Checking your browser')) {
      console.log(`[Website] Cloudflare protection detected, trying direct fetch...`);
      throw new Error('Cloudflare protected');
    }

    // Detect empty or error responses
    if (html.length < 100) {
      console.log(`[Website] Response too short (${html.length} chars), likely empty`);
      throw new Error('Empty response from proxy');
    }

    const $ = cheerio.load(html);
    $('script, style, noscript').remove();

    const title = $("title").text().trim();
    const metaDesc = $('meta[name="description"]').attr("content") || 
                     $('meta[property="og:description"]').attr("content") || '';
    const text = $("body").text().replace(/\s+/g, " ").trim();

    // Validate we got actual content
    if (!title && text.length < 100) {
      console.log(`[Website] No meaningful content extracted`);
      throw new Error('No content extracted');
    }

    const result = {
      url: websiteUrl,
      title,
      metaDesc,
      shortText: text.slice(0, 2000),
      headings: [],
    };
    
    const duration = Date.now() - startTime;
    console.log(`[Website] ✅ Success via allorigins: Title="${title.substring(0, 50)}...", ${text.length} chars - ${duration}ms`);
    
    return result;
  } catch (proxyErr) {
    console.log(`[Website] Proxy method failed: ${proxyErr.message}`);
  }

  // Method 2: Direct fetch with proper headers (bypasses most Cloudflare)
  try {
    console.log(`[Website] Attempting direct fetch with browser headers...`);
    
    const response = await fetchWithTimeout(websiteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
      }
    }, 8000);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();

    // Same validation checks
    if (html.includes('Just a moment') || 
        html.includes('cf-browser-verification') ||
        html.length < 100) {
      throw new Error('Cloudflare or empty response');
    }

    const $ = cheerio.load(html);

    const title = $("title").text().trim();
    const metaDesc = $('meta[name="description"]').attr("content") || 
                     $('meta[property="og:description"]').attr("content") || '';
    const text = $("body").text().replace(/\s+/g, " ").trim();

    if (!title && text.length < 100) {
      throw new Error('No content extracted');
    }

    const result = {
      title,
      metaDesc,
      shortText: text.slice(0, 1500),
    };
    
    const duration = Date.now() - startTime;
    console.log(`[Website] ✅ Success via direct fetch: Title="${title.substring(0, 50)}...", ${text.length} chars - ${duration}ms`);
    
    return result;
  } catch (directErr) {
    const duration = Date.now() - startTime;
    console.error(`[Website] ❌ All methods failed after ${duration}ms`);
    console.error(`[Website] Final error:`, directErr.message);
    return null;
  }
}

// Generate project summary from available data
function generateProjectSummary(tokenData, rugCheckData, contractAddress) {
  if (!tokenData) {
    let summary = `Token with contract address ${contractAddress} is a Solana-based token`;
    
    if (rugCheckData?.risks?.length > 0) {
      summary += ` with ${rugCheckData.risks.length} security risk(s) identified`;
    }
    
    summary += `. No trading pairs found on decentralized exchanges yet. This token may be very new, unlaunched, or have no liquidity.`;
    
    return summary;
  }
  
  const { tokenName, symbol, socials, priceUsd, liquidity, twitterData, tickerTweets, websiteData } = tokenData;
  
  let summary = `Token ${symbol}`;
  
  if (tokenName && tokenName !== "Unknown Token") {
    summary += ` (${tokenName})`;
  }
  
  summary += ` is a Solana-based token`;
  
  if (liquidity) {
    summary += ` with ${formatLiquidityVolume(liquidity)} in liquidity`;
  }
  
  if (priceUsd) {
    summary += ` trading at $${parseFloat(priceUsd).toFixed(6)}`;
  }
  
  summary += `.`;
  
  // Include website content if available
  if (websiteData && websiteData.title) {
    summary += ` The project website (${websiteData.url || 'available'}) indicates: ${websiteData.title}`;
    if (websiteData.metaDesc) {
      summary += ` - ${websiteData.metaDesc.substring(0, 200)}`;
    }
    if (websiteData.shortText) {
      summary += ` Additional website content: ${websiteData.shortText.substring(0, 300)}`;
    }
    summary += `.`;
  }
  
  // Include Twitter/X content prominently
  const allTweets = [
    ...(twitterData?.tweets || []),
    ...(tickerTweets?.tweets || [])
  ];
  
  if (allTweets.length > 0) {
    summary += ` Recent Twitter/X posts about this token include:`;
    // Include up to 5 most relevant tweets with full content
    allTweets.slice(0, 5).forEach((tweet, idx) => {
      const tweetText = tweet.text || tweet.content || '';
      if (tweetText) {
        summary += ` Post ${idx + 1}: "${tweetText.substring(0, 250)}"`;
        if (tweet.likes || tweet.retweets) {
          summary += ` (${tweet.likes || 0} likes, ${tweet.retweets || 0} retweets)`;
        }
        summary += `.`;
      }
    });
  }
  
  if (socials && (socials.website || socials.x || socials.telegram)) {
    summary += ` The project maintains`;
    const socialList = [];
    if (socials.website) socialList.push("a website");
    if (socials.x) socialList.push("Twitter/X presence");
    if (socials.telegram) socialList.push("Telegram community");
    summary += ` ${socialList.join(", ")}.`;
  }
  
  if (rugCheckData?.risks?.length > 0) {
    summary += ` Security analysis identified ${rugCheckData.risks.length} potential risk factor(s).`;
  }
  
  return summary;
}

// Fetch all token data
async function getTokenData(contractAddress) {
  const overallStart = Date.now();
  console.log(`\n[TokenData] ===== Starting token data fetch for ${contractAddress} =====`);
  
  // Detect blockchain
  const blockchain = detectBlockchain(contractAddress);
  if (!blockchain) {
    throw new Error("Invalid address format. Must be a valid Solana or BNB/BSC address.");
  }
  console.log(`[TokenData] Detected blockchain: ${blockchain.toUpperCase()}`);
  
  try {
    const fetchStart = Date.now();
    
    // Branch API calls based on blockchain
    let dexData, rugData, fundamentalsData, birdeyeData, holdersData;
    
    if (blockchain === "bnb") {
      // BNB/BSC: Use DexScreener, BSCScan (skip RugCheck, Birdeye, Helius, Solscan)
      console.log(`[TokenData] Fetching from 3 sources: DexScreener, BSCScan`);
      [dexData, fundamentalsData, holdersData] = await Promise.allSettled([
        getDexScreenerData(contractAddress),
        getBSCScanTokenInfo(contractAddress),
        getBSCScanHolders(contractAddress),
      ]);
      rugData = { status: "fulfilled", value: null }; // RugCheck doesn't support BNB
      birdeyeData = { status: "fulfilled", value: null }; // Birdeye is Solana-only
    } else {
      // Solana: Use existing sources
      console.log(`[TokenData] Fetching from 5 sources: DexScreener, RugCheck, Helius, Birdeye, Solscan`);
      [dexData, rugData, fundamentalsData, birdeyeData, holdersData] = await Promise.allSettled([
      getDexScreenerData(contractAddress),
      getRugCheckData(contractAddress),
        getHeliusFundamentals(contractAddress),
        getBirdeyeData(contractAddress),
        getSolscanHolders(contractAddress),
      ]);
    }

    const fetchDuration = Date.now() - fetchStart;
    console.log(`[TokenData] Initial fetch completed in ${fetchDuration}ms`);

    const dex = dexData.status === "fulfilled" ? dexData.value : null;
    const rug = rugData.status === "fulfilled" ? rugData.value : null;
    const fundamentals = fundamentalsData.status === "fulfilled" ? fundamentalsData.value : null;
    const birdeye = birdeyeData.status === "fulfilled" ? birdeyeData.value : null;
    const holders = holdersData.status === "fulfilled" ? holdersData.value : null;

    // Get holder count based on blockchain
    let holderCount = null;
    if (blockchain === "bnb") {
      holderCount = holders || fundamentals?.holderCount || null;
    } else {
      holderCount = holders || fundamentals?.holderCount || null;
    }

    if (blockchain === "bnb") {
      console.log(`[TokenData] Results: DexScreener=${!!dex}, BSCScan=${!!fundamentals}`);
      console.log(`[TokenData] Holders: ${holderCount} (BSCScan: ${holders || fundamentals?.holderCount || "N/A"})`);
    } else {
      console.log(`[TokenData] Results: DexScreener=${!!dex}, RugCheck=${!!rug}, Helius=${!!fundamentals}, Birdeye=${!!birdeye}, Solscan=${holders !== null}`);
      console.log(`[TokenData] Holders: ${holderCount} (Solscan: ${holders}, Helius: ${fundamentals?.holderCount})`);
    }
    
    if (dexData.status === "rejected") {
      console.error(`[TokenData] DexScreener failed:`, dexData.reason);
    }
    if (rugData.status === "rejected") {
      console.error(`[TokenData] RugCheck failed:`, rugData.reason);
    }
    if (fundamentalsData.status === "rejected") {
      console.error(`[TokenData] ${blockchain === "bnb" ? "BSCScan" : "Helius"} failed:`, fundamentalsData.reason);
    }
    if (birdeyeData.status === "rejected") {
      console.error(`[TokenData] Birdeye failed:`, birdeyeData.reason);
    }

    let socials = dex?.socials || null;
    
    // For BNB tokens, check four.meme if DexScreener doesn't have a website
    if (blockchain === "bnb" && (!socials || !socials.website)) {
      console.log(`[TokenData] No website from DexScreener for BNB token, checking four.meme...`);
      const fourMemeWebsite = await getWebsiteFromFourMeme(contractAddress);
      if (fourMemeWebsite) {
        console.log(`[TokenData] ✅ Found website from four.meme: ${fourMemeWebsite}`);
        if (!socials) {
          socials = { website: null, x: null, telegram: null };
        }
        socials.website = fourMemeWebsite;
      } else {
        console.log(`[TokenData] No website found on four.meme either`);
      }
    }
    
    // Console log the final website URL
    if (socials?.website) {
      console.log(`[TokenData] 🌐 FINAL WEBSITE URL: ${socials.website}`);
    } else {
      console.log(`[TokenData] 🌐 No website URL found for this token`);
    }

    // Fetch social data in parallel
    console.log(`[TokenData] Fetching social data...`);
    const socialStart = Date.now();
    
    const symbol = dex?.symbol || fundamentals?.tokenSymbol || "???";
    const tokenName = dex?.tokenName || fundamentals?.tokenName || null;
    
    const [twitterDataResult, twitterSearchResult, telegramDataResult, websiteDataResult] =
      await Promise.allSettled([
        socials?.x ? getTwitterFromNitter(socials.x) : Promise.resolve(null),
        searchTokenOnTwitter(symbol, tokenName),
        socials?.telegram
          ? getTelegramFeed(socials.telegram)
          : Promise.resolve(null),
        socials?.website ? scrapeWebsite(socials.website) : Promise.resolve(null),
      ]);
    
    const socialDuration = Date.now() - socialStart;
    console.log(`[TokenData] Social fetch completed in ${socialDuration}ms`);

    const twitterData =
      twitterDataResult.status === "fulfilled"
        ? twitterDataResult.value
        : null;
    const tickerTweets =
      twitterSearchResult.status === "fulfilled"
        ? twitterSearchResult.value
        : null;
    const telegramData =
      telegramDataResult.status === "fulfilled"
        ? telegramDataResult.value
        : null;
    const websiteData =
      websiteDataResult.status === "fulfilled"
        ? websiteDataResult.value
        : null;

    // Calculate sentiment AFTER social data is fetched (so we can include tweet engagement)
    const sentimentScore = computeMarketSentiment(birdeye, dex, tickerTweets, twitterData);
    console.log(`[TokenData] Sentiment score: ${sentimentScore || "N/A"}`);
    
    // Calculate comprehensive token score
    const tokenScoreData = {
      marketData: {
        price: birdeye?.price || dex?.priceUsd || null,
        liquidity: birdeye?.liquidity || dex?.liquidity || null,
        volume24h: birdeye?.volume24h || dex?.volume24h || null,
      },
      fundamentals: fundamentals,
      securityData: rug,
      socials,
      sentimentScore,
      blockchain, // Include blockchain for proper BNB vs Solana handling
      websiteData, // Include website data for official backing detection
      tokenName: dex?.name || fundamentals?.tokenName || null,
      symbol: dex?.symbol || fundamentals?.tokenSymbol || null,
    };
    
    const tokenScore = calculateTokenScore(tokenScoreData);
    console.log(`[TokenData] Comprehensive token score: ${tokenScore}/100`);
    console.log(`[TokenData] Social links: website=${!!socials?.website}, twitter=${!!socials?.x}, telegram=${!!socials?.telegram}`);

    console.log(`[TokenData] Social results: Twitter=${!!twitterData}, TickerTweets=${!!tickerTweets}, Telegram=${!!telegramData}, Website=${!!websiteData}`);
    
    if (twitterDataResult.status === "rejected") {
      console.error(`[TokenData] Twitter scrape failed:`, twitterDataResult.reason);
    }
    if (twitterSearchResult.status === "rejected") {
      console.error(`[TokenData] Twitter search failed:`, twitterSearchResult.reason);
    }
    if (telegramDataResult.status === "rejected") {
      console.error(`[TokenData] Telegram scrape failed:`, telegramDataResult.reason);
    }
    if (websiteDataResult.status === "rejected") {
      console.error(`[TokenData] Website scrape failed:`, websiteDataResult.reason);
    }

    // Generate comprehensive project summary based on blockchain
    const blockchainName = blockchain === "bnb" ? "BNB/BSC" : "Solana";
    const projectSummary = blockchain === "bnb" ? `
Token ${dex?.symbol || fundamentals?.tokenSymbol || "???"} is a ${blockchainName} token.

Supply: ${fundamentals?.supply || "unknown"}
Decimals: ${fundamentals?.decimals || "unknown"}
Holders: ${holderCount || "unknown"}

Price: $${birdeye?.price || dex?.priceUsd || "unknown"}
24h Volume: ${birdeye?.volume24h || dex?.volume24h || "unknown"}
Liquidity: ${birdeye?.liquidity || dex?.liquidity || "unknown"}

Sentiment Score: ${sentimentScore || "N/A"}
`.trim() : `
Token ${dex?.symbol || fundamentals?.tokenSymbol || "???"} is a ${blockchainName} token.

Supply: ${fundamentals?.supply || "unknown"}
Holders: ${holderCount || "unknown"}
Mint Authority: ${fundamentals?.mintAuthority || "unknown"}
Freeze Authority: ${fundamentals?.freezeAuthority || "unknown"}

Price: $${birdeye?.price || dex?.priceUsd || "unknown"}
24h Volume: ${birdeye?.volume24h || dex?.volume24h || "unknown"}
Liquidity: ${birdeye?.liquidity || dex?.liquidity || "unknown"}

Security Risks: ${rug?.risks?.length || 0}
Sentiment Score: ${sentimentScore || "N/A"}
`.trim();
    
    // Calculate market cap
    const price = birdeye?.price || dex?.priceUsd;
    const supply = fundamentals?.supply;
    const decimals = fundamentals?.decimals || (blockchain === "bnb" ? 18 : 9);
    let marketCap = null;
    if (price && supply) {
      marketCap = (BigInt(supply) * BigInt(Math.round(price * Math.pow(10, decimals)))) / BigInt(Math.pow(10, decimals));
      marketCap = Number(marketCap) / Math.pow(10, decimals);
    }
    
    return {
      projectSummary,
      blockchain, // Include blockchain in response
      tokenName: dex?.tokenName || fundamentals?.tokenName || "Unknown Token",
      symbol: dex?.symbol || fundamentals?.tokenSymbol || "???",
      socials,
      marketData: {
        price: birdeye?.price || dex?.priceUsd || null,
        volume24h: birdeye?.volume24h || dex?.volume24h || null,
        liquidity: birdeye?.liquidity || dex?.liquidity || null,
        priceChange24h: birdeye?.priceChange24h || dex?.priceChange24h || null,
        dexUrl: dex?.dexUrl || null,
        marketCap: dex?.marketCap || marketCap, // Prefer DexScreener marketCap, fallback to calculated
      },
      fundamentals: {
        ...fundamentals,
        holderCount: holderCount,
        holders: holderCount, // Alias for compatibility
      },
      birdeye,
      sentimentScore,
      securityData: rug,
      hasMarketData: !!(dex || birdeye),
      twitterData,
      tickerTweets, // Tweets mentioning the token ticker
      telegramData,
      websiteData,
      tokenScore,
    };
  } catch (error) {
    const overallDuration = Date.now() - overallStart;
    console.error(`[TokenData] ❌ Failed after ${overallDuration}ms:`, error.message);
    console.error(`[TokenData] Error stack:`, error.stack);
    throw new Error(`Failed to fetch token data: ${error.message}`);
  }
}

// Extract narrative claim using AI
async function extractNarrativeClaim(projectSummary, socialContext) {
  const startTime = Date.now();
  console.log(`\n[Narrative] ===== Starting narrative extraction =====`);
  console.log(`[Narrative] Project summary length: ${projectSummary?.length || 0} chars`);
  console.log(`[Narrative] Social context provided: ${!!socialContext}`);
  
  try {
    // Parse social context to extract website data
    let websiteText = "";
    let twitterText = "";
    let telegramText = "";
    
    if (socialContext) {
      try {
        const socialData = JSON.parse(socialContext);
        
        // Format website content prominently
        if (socialData.website) {
          const website = socialData.website;
          websiteText = `
WEBSITE CONTENT (${website.url || 'Unknown URL'}):
Title: ${website.title || 'No title'}
Description: ${website.metaDesc || 'No description'}
${website.headings && website.headings.length > 0 ? `Key Headings:\n${website.headings.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n` : ''}
Content: ${website.shortText || 'No content available'}
`;
        }
        
        // Format Twitter data - include more tweets with full content
        const twitterTweets = socialData.twitter?.tweets || [];
        const tickerTweets = socialData.tickerTweets?.tweets || [];
        const allTwitterTweets = [...twitterTweets, ...tickerTweets].slice(0, 10); // Include up to 10 tweets
        
        if (allTwitterTweets.length > 0) {
          const tweets = allTwitterTweets.map((t, idx) => {
            const text = t.text || t.content || '';
            const likes = t.likes || t.likeCount || 0;
            const retweets = t.retweets || t.retweetCount || 0;
            const username = t.username || t.author || 'Unknown';
            // Include full tweet text, not truncated
            return `${idx + 1}. @${username}: "${text}" (${likes} likes, ${retweets} retweets)`;
          }).join('\n');
          twitterText = `\n\nTWITTER/X POSTS (${allTwitterTweets.length} recent posts):\n${tweets}`;
        }
        
        // Format Telegram data
        if (socialData.telegram && socialData.telegram.messages && socialData.telegram.messages.length > 0) {
          const messages = socialData.telegram.messages.slice(0, 5).map(m => 
            `- ${m.text || ''}`
          ).join('\n');
          telegramText = `\nTELEGRAM MESSAGES:\n${messages}`;
        }
      } catch (e) {
        // If parsing fails, use raw context
        console.log(`[Narrative] Could not parse social context, using raw: ${e.message}`);
      }
    }

  const fullContext = `
PROJECT SUMMARY:
${projectSummary}
${websiteText}${twitterText}${telegramText}
`.trim();
    
    console.log(`[Narrative] Full context length: ${fullContext.length} chars`);
    if (websiteText) {
      console.log(`[Narrative] Website content included: ${websiteText.length} chars`);
    }

  const prompt = `
You are an expert crypto narrative analyst.

Analyze this token's information and extract the core narrative claim - the story this token is telling.

Pay special attention to the WEBSITE CONTENT - this is often the most reliable source of the token's claimed narrative, partnerships, and purpose.

Look for:
- References to real companies, products, or events (especially in website content)
- Partnerships or associations being claimed
- Technology or innovation being referenced
- Any real-world narratives being leveraged
- Claims about utility, use cases, or real-world applications
- EXCHANGE ASSOCIATION (Binance, Coinbase, etc.) - if the website content indicates this, it's important

The website content is particularly important - analyze it carefully for:
- Claims about the project
- Partnerships or integrations mentioned (especially major exchanges)
- Technology or features described
- Roadmap or future plans
- Team or organization information
- Exchange association or verification mentioned in the content

If the website content indicates exchange association, mention this naturally but NEVER use the word "official". Use neutral language like "associated with [Exchange]" or "[Exchange] mascot token" or "linked to [Exchange]". For example, if it's Binance's mascot token (like Bibi), say "Binance's mascot token" or "associated with Binance" - NOT "official".

Return:
1. A clear, specific narrative claim (what real-world story is this token using?)
   - If the website content shows exchange association, mention it naturally: "This is [Exchange]'s mascot token" or "Associated with [Exchange]" - NEVER say "official"
   - Use neutral, factual language without claiming official status
2. Entities involved (organizations, products, people, events)
3. Key topics and themes

If the token has no clear narrative beyond "it's a meme token", say so.
However, if the website content indicates exchange association, this may be more than just a meme token - it could be an exchange mascot token or associated with an exchange. Mention this naturally but NEVER claim it's "official".

Return STRICT JSON only.

CONTEXT:
${fullContext}
`;

    console.log(`[Narrative] Calling OpenAI API (gpt-4o-mini)...`);
    const aiStart = Date.now();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "NarrativeExtraction",
        schema: {
          type: "object",
          properties: {
            narrative_claim: { type: "string" },
            entities: {
              type: "object",
              properties: {
                organizations: {
                  type: "array",
                  items: { type: "string" },
                },
                products: {
                  type: "array",
                  items: { type: "string" },
                },
                topics: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["organizations", "products", "topics"],
            },
          },
          required: ["narrative_claim", "entities"],
        },
      },
    },
      temperature: 0.7,
      max_tokens: 1000,
    });

    const aiDuration = Date.now() - aiStart;
    console.log(`[Narrative] OpenAI response received in ${aiDuration}ms`);

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI model");
    }

    console.log(`[Narrative] Response content length: ${content.length} chars`);

    const parsed = safeJsonParse(content);
    if (!parsed || !parsed.narrative_claim) {
      console.error(`[Narrative] Invalid response format:`, content.substring(0, 200));
      throw new Error("Invalid AI response format");
    }

    const duration = Date.now() - startTime;
    console.log(`[Narrative] ✅ Success: "${parsed.narrative_claim.substring(0, 100)}..." - ${duration}ms`);
    console.log(`[Narrative] Entities: ${parsed.entities?.organizations?.length || 0} orgs, ${parsed.entities?.products?.length || 0} products, ${parsed.entities?.topics?.length || 0} topics\n`);

  return parsed;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Narrative] ❌ Failed after ${duration}ms:`, error.message);
    console.error(`[Narrative] Error details:`, error);
    throw new Error(`Failed to extract narrative: ${error.message}`);
  }
}

// Search web for narrative verification (placeholder)
async function searchWebForNarrative(narrativeClaim, entities) {
  try {
    // Placeholder for web search API integration
    return {
      articles: [],
      searchPerformed: false,
    };
  } catch (error) {
    console.error("Web search error:", error);
    return { articles: [], searchPerformed: false };
  }
}

// Search Twitter for lore tweet (placeholder)
async function searchTwitterForLore(narrativeClaim, entities) {
  try {
    // Placeholder for Twitter API integration
    return {
      loreTweet: null,
      validationTweets: [],
    };
  } catch (error) {
    console.error("Twitter search error:", error);
    return { loreTweet: null, validationTweets: [] };
  }
}

// Classify narrative with AI
async function classifyNarrative({
  narrativeClaim,
  projectSummary,
  entities,
  webEvidence,
  twitterEvidence,
}) {
  const startTime = Date.now();
  console.log(`\n[Classification] ===== Starting narrative classification =====`);
  console.log(`[Classification] Narrative claim: "${narrativeClaim.substring(0, 100)}..."`);
  
  try {
    const evidenceSummary =
      webEvidence && webEvidence.searchPerformed
    ? `\nWEB EVIDENCE: ${webEvidence.articles.length} articles found`
        : "\nWEB EVIDENCE: No external search performed yet";

    const twitterSummary =
      twitterEvidence && twitterEvidence.loreTweet
    ? `\nLORE TWEET: Found origin tweet`
        : "\nLORE TWEET: Not identified";
    
    console.log(`[Classification] Web evidence: ${webEvidence?.articles?.length || 0} articles`);
    console.log(`[Classification] Twitter evidence: ${twitterEvidence?.loreTweet ? "found" : "none"}`);

    const prompt = `
You are a professional cryptocurrency analyst conducting objective narrative verification.

Analyze this token's narrative claims using rigorous analytical standards:

NARRATIVE CLAIM:
${narrativeClaim}

PROJECT SUMMARY:
${projectSummary}

ENTITIES IDENTIFIED:
${JSON.stringify(entities, null, 2)}
${evidenceSummary}
${twitterSummary}

Evaluation Criteria:

1. Does the narrative reference verifiable real-world events, products, or concepts?
2. Are the mentioned entities legitimate and accurately represented?
3. What is the nature of the association (official partnership vs. inspiration vs. unsubstantiated claim)?

IMPORTANT: Default to PARTIAL when evidence is mixed or limited. Only use UNVERIFIED when there is clear evidence that claims are false or misleading. Many legitimate tokens may not have extensive external documentation - this does not make them UNVERIFIED.

Classification:
- CONFIRMED: Strong verified connection to legitimate real-world elements with clear supporting evidence.
- PARTIAL: Mix of verified elements and unverified claims, or limited evidence but no clear falsehoods. Most tokens fall here.
- UNVERIFIED: Clear evidence that claims are false, misleading, or completely fabricated. Use sparingly.

Provide reasoning (3-4 sentences) that:
- Presents factual findings objectively
- Focuses on what IS known rather than what is unknown
- Highlights material risks only when significant
- Enables informed investment decision-making

Tone: Professional, analytical, and balanced. Avoid being overly cautious. Focus on evidence-based assessment.

Return STRICT JSON:

{
  "verdict": "CONFIRMED" | "PARTIAL" | "UNVERIFIED",
  "reasoning": "objective analysis (3-4 sentences)",
  "confidence": "high" | "medium" | "low",
  "redFlags": ["only material concerns, be selective"]
}
`;

    console.log(`[Classification] Calling OpenAI API (gpt-4o-mini)...`);
    const aiStart = Date.now();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "NarrativeVerdict",
        schema: {
          type: "object",
          properties: {
            verdict: {
              type: "string",
              enum: ["CONFIRMED", "PARTIAL", "UNVERIFIED"],
            },
            reasoning: { type: "string" },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low"],
            },
            redFlags: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["verdict", "reasoning", "confidence", "redFlags"],
        },
      },
    },
      temperature: 0.7,
      max_tokens: 800,
    });

    const aiDuration = Date.now() - aiStart;
    console.log(`[Classification] OpenAI response received in ${aiDuration}ms`);

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from AI model");
    }

    const parsed = safeJsonParse(content);
    if (!parsed || !parsed.verdict) {
      console.error(`[Classification] Invalid response format:`, content.substring(0, 200));
      throw new Error("Invalid AI response format");
    }

    const result = {
    verdict: parsed.verdict,
      reasoning: parsed.reasoning || "Analysis completed",
    confidence: parsed.confidence || "medium",
    redFlags: parsed.redFlags || [],
  };
    
    const duration = Date.now() - startTime;
    console.log(`[Classification] ✅ Success: ${result.verdict} (${result.confidence} confidence) - ${duration}ms`);
    console.log(`[Classification] Red flags: ${result.redFlags.length}\n`);

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Classification] ❌ Failed after ${duration}ms:`, error.message);
    console.error(`[Classification] Error details:`, error);
    throw new Error(`Failed to classify narrative: ${error.message}`);
  }
}

// Generate summary (TL;DR)
async function generateSummary({ narrativeClaim, verdict, tokenData, tokenName }) {
  const startTime = Date.now();
  console.log(`\n[Summary] ===== Starting summary generation =====`);
  
  try {
    const tokenNameValue = tokenName || tokenData?.tokenName || "this token";
    const score = tokenData?.tokenScore || 50;
    const sentiment = tokenData?.sentimentScore || 50;
    const holders = tokenData?.fundamentals?.holderCount || null;
    const liquidity = tokenData?.marketData?.liquidity || null;
    const volume24h = tokenData?.marketData?.volume24h || null;
    const priceChange = tokenData?.marketData?.priceChange24h || null;
    
    const tickerTweets = tokenData?.tickerTweets?.tweets || [];
    const twitterData = tokenData?.twitterData?.tweets || [];
    const allTweets = [...tickerTweets, ...twitterData].slice(0, 10);
    
    let tweetContext = "";
    if (allTweets.length > 0) {
      // Include full tweet content, not truncated
      const tweetSummaries = allTweets.map((tweet, idx) => {
        const text = tweet.text || tweet.content || "";
        const likes = tweet.likes || tweet.likeCount || 0;
        const retweets = tweet.retweets || tweet.retweetCount || 0;
        const username = tweet.username || tweet.author || 'Unknown';
        // Include full tweet text for better AI analysis
        return `${idx + 1}. @${username}: "${text}" (${likes} likes, ${retweets} retweets)`;
      }).join("\n");
      tweetContext = `\n\nRECENT TWEETS ABOUT THIS TOKEN (${allTweets.length} posts):\n${tweetSummaries}`;
    }
    
    // Check for official backing
    const websiteData = tokenData?.websiteData;
    const symbol = tokenData?.symbol;
    const officialBacking = detectOfficialBacking(tokenNameValue, symbol, websiteData, tokenData?.socials);
    
    const dataLines = [`- Score: ${score}/100`, `- Sentiment: ${sentiment}/100`];
    if (holders) dataLines.push(`- Holders: ${holders.toLocaleString()}`);
    if (liquidity) dataLines.push(`- Liquidity: ${formatLiquidityVolume(liquidity)}`);
    if (volume24h) dataLines.push(`- 24h Volume: ${formatLiquidityVolume(volume24h)}`);
    if (priceChange !== null) dataLines.push(`- 24h Price Change: ${priceChange > 0 ? "+" : ""}${priceChange.toFixed(2)}%`);
    if (narrativeClaim) dataLines.push(`- Narrative: ${narrativeClaim}`);
    if (officialBacking) {
      dataLines.push(`- Exchange Association: ${officialBacking.exchange.toUpperCase()} (${officialBacking.confidence} confidence) - DO NOT claim this is "official"`);
    }
    if (websiteData) {
      dataLines.push(`- Website: ${websiteData.title || 'Available'} - ${websiteData.shortText?.substring(0, 200) || ''}`);
    }
    
    const prompt = `
You are a professional crypto analyst writing a clear, informative summary. Write in a balanced tone - professional but not overly formal, informative but not dry.

Analyze the website content and token data carefully. If the website or token information indicates association with a major exchange (like Binance, Coinbase, etc.), mention this naturally but DO NOT claim it's "official" - we cannot verify official status. Use neutral language like "associated with", "linked to", or "mascot token" without claiming official backing.

Format:
1. Two sentences - what makes this token notable. Use **bold** for key points. Be informative and clear.
2. Three bullet points - one line each, **bold** the important numbers

DATA:
${dataLines.join('\n')}${tweetContext}

RULES:
- Write professionally but naturally - avoid overly casual phrases like "cool vibe", "not too shabby", "people are really getting into it", "pretty hyped"
- Also avoid corporate jargon like 'boasts', 'significantly enhances', 'positions as', 'institutional support'
- NEVER use the word "official" - we cannot verify official status. Use neutral language like "associated with Binance" or "Binance mascot token" or "linked to Binance" instead
- Analyze the website content and data to determine if there's exchange association - only mention it if the data clearly shows it
- ONLY use data provided - don't mention missing data or make assumptions
- Don't mention "Solana blockchain" - obvious
- Don't mention "UNVERIFIED" status
- Focus on facts and metrics, not opinions or casual observations

Write like this:
[Two informative sentences with **bold** for key points]

• [Bullet 1 - clear statement, **bold** numbers]
• [Bullet 2 - clear statement, **bold** numbers]
• [Bullet 3 - clear statement, **bold** numbers]
`;

    console.log(`[Summary] Calling OpenAI...`);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 250,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    const duration = Date.now() - startTime;
    console.log(`[Summary] ✅ Generated in ${duration}ms\n`);
    
    return text || "No summary available.";
  } catch (error) {
    console.error(`[Summary] ❌ Failed:`, error.message);
    return "Analysis in progress...";
  }
}

// Generate fundamentals analysis
async function generateFundamentals({ tokenData, verdict, reasoning }) {
  const startTime = Date.now();
  console.log(`\n[Fundamentals] ===== Starting fundamentals generation =====`);
  
  try {
    const score = tokenData?.tokenScore || 50;
    const holders = tokenData?.fundamentals?.holderCount || null;
    const liquidity = tokenData?.marketData?.liquidity || null;
    const volume24h = tokenData?.marketData?.volume24h || null;
    const hasMintAuth = tokenData?.fundamentals?.mintAuthority || null;
    const hasFreezeAuth = tokenData?.fundamentals?.freezeAuthority || null;
    const risks = tokenData?.securityData?.risks?.length || 0;
    
    // Check for official backing
    const websiteData = tokenData?.websiteData;
    const tokenName = tokenData?.tokenName;
    const symbol = tokenData?.symbol;
    const officialBacking = detectOfficialBacking(tokenName, symbol, websiteData, tokenData?.socials);
    
    const fundDataLines = [`- Score: ${score}/100`];
    if (holders) fundDataLines.push(`- Holders: ${holders.toLocaleString()}`);
    if (liquidity) fundDataLines.push(`- Liquidity: ${formatLiquidityVolume(liquidity)}`);
    if (volume24h) fundDataLines.push(`- Volume (24h): ${formatLiquidityVolume(volume24h)}`);
    fundDataLines.push(`- Security: ${!hasMintAuth && !hasFreezeAuth ? "✓ Clean (no mint/freeze)" : "⚠ " + (hasMintAuth ? "Mint authority" : "") + (hasFreezeAuth ? " Freeze authority" : "")}`);
    if (risks > 0) fundDataLines.push(`- Risk flags: ${risks}`);
    if (officialBacking) {
      fundDataLines.push(`- Exchange Association: ${officialBacking.exchange.toUpperCase()} (${officialBacking.confidence} confidence) - DO NOT claim this is "official"`);
    }
    
    const prompt = `
Analyze the fundamentals. Write 2 sentences in a natural, conversational way.

Look at the data provided - if there's information about exchange association in the data, mention it naturally but NEVER use the word "official". Use neutral language like "associated with" or "linked to". Don't assume or make things up.

DATA:
${fundDataLines.join('\n')}

RULES:
- Write naturally - avoid corporate jargon like 'boasts', 'significantly', 'positions', 'institutional support'
- NEVER use the word "official" - use neutral language like "associated with" or "linked to" instead
- Use simple, direct language - analyze the data and mention exchange association only if the data clearly shows it
- ONLY use data provided - don't mention missing data or make assumptions
- Don't mention "Solana" - obvious
- Use **bold** for key numbers
- Connect the numbers - what story do they tell?
- If the data shows exchange association, mention it casually like 'This is [Exchange]'s mascot token' or 'Associated with [Exchange]' - NEVER say "official" - keep it natural

Write 2 casual sentences based on the actual data provided.
`;

    console.log(`[Fundamentals] Calling OpenAI...`);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 150,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    const duration = Date.now() - startTime;
    console.log(`[Fundamentals] ✅ Generated in ${duration}ms\n`);
    
    return text || "No fundamentals data available.";
  } catch (error) {
    console.error(`[Fundamentals] ❌ Failed:`, error.message);
    return "Fundamentals data unavailable.";
  }
}

// Generate hype analysis
async function generateHype({ tokenData, narrativeClaim }) {
  const startTime = Date.now();
  console.log(`\n[Hype] ===== Starting hype generation =====`);
  
  try {
    const sentiment = tokenData?.sentimentScore || 50;
    const volume24h = tokenData?.marketData?.volume24h || null;
    const priceChange = tokenData?.marketData?.priceChange24h || null;
    const holders = tokenData?.fundamentals?.holderCount || null;
    const liquidity = tokenData?.marketData?.liquidity || null;
    
    // Format tweet data for deep analysis
    const tickerTweets = tokenData?.tickerTweets?.tweets || [];
    const twitterData = tokenData?.twitterData?.tweets || [];
    const allTweets = [...tickerTweets, ...twitterData].slice(0, 15); // Analyze up to 15 tweets
    
    let tweetAnalysis = "";
    if (allTweets.length > 0) {
      const totalEngagement = allTweets.reduce((sum, tweet) => {
        const likes = parseInt(tweet.likes || tweet.likeCount || 0);
        const retweets = parseInt(tweet.retweets || tweet.retweetCount || 0);
        return sum + likes + (retweets * 2);
      }, 0);
      const avgEngagement = Math.round(totalEngagement / allTweets.length);
      const highEngagementTweets = allTweets.filter(tweet => {
        const likes = parseInt(tweet.likes || tweet.likeCount || 0);
        const retweets = parseInt(tweet.retweets || tweet.retweetCount || 0);
        return (likes + retweets) > 50;
      }).length;
      
      const tweetTexts = allTweets.map(t => (t.text || t.content || "").substring(0, 100)).join(" | ");
      
      tweetAnalysis = `
TWEET ANALYSIS:
- Total tweets analyzed: ${allTweets.length}
- Average engagement per tweet: ${avgEngagement} (likes + retweets)
- High-engagement tweets (>50 interactions): ${highEngagementTweets}
- Tweet content themes: ${tweetTexts.substring(0, 500)}...
`;
    }
    
    const prompt = `
You are a market sentiment and social media analyst specializing in cryptocurrency communities. Assess the hype, momentum, and community engagement for this token. Provide sophisticated analysis in 1-2 sentences maximum.

DATA:
- Sentiment score: ${sentiment}/100
- 24h volume: ${volume24h ? `$${(volume24h / 1000000).toFixed(2)}M` : "unknown"}
- Price change (24h): ${priceChange !== null ? `${priceChange > 0 ? "+" : ""}${priceChange.toFixed(2)}%` : "unknown"}
- Holders: ${holders ? holders.toLocaleString() : "unknown"}
- Liquidity: ${liquidity ? formatLiquidityVolume(liquidity) : "unknown"}
- Narrative: ${narrativeClaim.substring(0, 200)}...${tweetAnalysis}

CRITICAL ANALYSIS REQUIRED:
- NEVER mention "Solana" or blockchain basics
- Analyze tweet engagement patterns: Is engagement organic or artificial? Are there influencer mentions? What sentiment do the tweets convey?
- Connect social activity to market metrics: Does the ${sentiment}/100 sentiment align with ${priceChange !== null ? `${priceChange > 0 ? "positive" : "negative"}` : "the"} price action? Is volume driven by hype or fundamentals?
- Holder engagement: With ${holders ? holders.toLocaleString() : "this many"} holders, what does the volume-to-holder ratio suggest about community participation?
- Momentum assessment: Is this sustainable growth or pump-and-dump patterns? What do engagement metrics reveal about community quality?

Use markdown **bold** syntax for: sentiment scores, volume numbers, price changes, engagement metrics, and key conclusions.

Tone: Professional, analytical, and insightful. Maximum 2 sentences. Provide deep analysis connecting social signals to market behavior.
`;

    console.log(`[Hype] Calling OpenAI...`);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 180,
    });

    const text = completion.choices[0]?.message?.content?.trim();
    const duration = Date.now() - startTime;
    console.log(`[Hype] ✅ Generated in ${duration}ms\n`);
    
    return text || "No hype data available.";
  } catch (error) {
    console.error(`[Hype] ❌ Failed:`, error.message);
    return "Hype analysis unavailable.";
  }
}

// Main handler
export default async function handler(req, res) {
  const requestStart = Date.now();
  console.log(`\n\n========================================`);
  console.log(`[Handler] ===== NEW SCAN REQUEST =====`);
  console.log(`[Handler] Method: ${req.method}`);
  console.log(`[Handler] Timestamp: ${new Date().toISOString()}`);
  console.log(`========================================\n`);

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    console.log(`[Handler] OPTIONS request - returning 200`);
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    console.log(`[Handler] Invalid method: ${req.method}`);
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Method not allowed",
      message: "Only POST requests are supported",
    });
  }

  // API Key authentication (optional - only if enabled)
  let apiKeyData = null;
  let rateLimitInfo = null;
  let apiAuth = null;
  
  if (process.env.ENABLE_API_KEYS === 'true') {
    try {
      apiAuth = await import('./utils/apiAuth.js');
      const apiKey = apiAuth.extractApiKey(req);
      const validation = await apiAuth.validateApiKey(apiKey);
    
    if (!validation.valid) {
      // If API key is provided but invalid, reject
      if (apiKey) {
        console.log(`[Handler] ❌ Invalid API key`);
        return res.status(401).json({
          error: "Unauthorized",
          message: validation.error || "Invalid API key"
        });
      }
      // If no API key and API keys are required, reject
      if (process.env.REQUIRE_API_KEYS === 'true') {
        return res.status(401).json({
          error: "Unauthorized",
          message: "API key is required"
        });
      }
      // Otherwise, continue without API key (for frontend usage)
    } else {
      apiKeyData = validation.keyData;
      console.log(`[Handler] ✅ API key validated - Tier: ${apiKeyData.tier}`);
      
      // Check rate limits
      rateLimitInfo = await apiAuth.checkRateLimit(
        apiKeyData.id,
        apiKeyData.rateLimitPerMinute,
        apiKeyData.rateLimitPerDay
      );
      
      if (!rateLimitInfo.allowed) {
        console.log(`[Handler] ❌ Rate limit exceeded - ${rateLimitInfo.limit}`);
        const retryAfter = Math.ceil((rateLimitInfo.resetAt.getTime() - Date.now()) / 1000);
        res.setHeader('Retry-After', retryAfter);
        res.setHeader('X-RateLimit-Limit', apiKeyData.rateLimitPerMinute);
        res.setHeader('X-RateLimit-Remaining', 0);
        res.setHeader('X-RateLimit-Reset', Math.floor(rateLimitInfo.resetAt.getTime() / 1000));
        
        return res.status(429).json({
          error: "Rate limit exceeded",
          message: `You have exceeded your rate limit of ${apiKeyData.rateLimitPerMinute} requests per ${rateLimitInfo.limit}`,
          retryAfter: retryAfter
        });
      }
      
      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', apiKeyData.rateLimitPerMinute);
      res.setHeader('X-RateLimit-Remaining', rateLimitInfo.remaining?.perMinute || 0);
      res.setHeader('X-RateLimit-Reset', Math.floor(rateLimitInfo.resetAt?.perMinute?.getTime() / 1000) || 0);
    }
    } catch (apiAuthErr) {
      console.error('[Handler] API auth error:', apiAuthErr);
      // Continue without API auth if there's an error
    }
  }

  try {
    const { contractAddress } = req.body || {};
    console.log(`[Handler] Request body:`, { contractAddress: contractAddress?.substring(0, 20) + "..." });

    // Validation
    if (!contractAddress) {
      console.log(`[Handler] ❌ Validation failed: Missing contract address`);
      return res.status(400).json({
        error: "Missing contract address",
        message: "contractAddress is required",
      });
    }

    if (typeof contractAddress !== "string") {
      console.log(`[Handler] ❌ Validation failed: Invalid type`);
      return res.status(400).json({
        error: "Invalid contract address type",
        message: "contractAddress must be a string",
      });
    }

    const trimmedAddress = contractAddress.trim();
    console.log(`[Handler] Trimmed address: ${trimmedAddress.substring(0, 20)}...`);
    
    if (!validateAddress(trimmedAddress)) {
      console.log(`[Handler] ❌ Validation failed: Invalid address format`);
      return res.status(400).json({
        error: "Invalid address format",
        message:
          "Contract address must be a valid Solana address (32-44 base58 characters) or BNB/BSC address (0x followed by 40 hex characters)",
      });
    }

    console.log(`[Handler] ✅ Validation passed`);

    // Always fetch fresh data (cache disabled to ensure accurate market data)
    console.log(`[Handler] Fetching fresh data (cache disabled)...`);

    // Fetch token data
    console.log(`[Handler] Starting fresh scan...`);
    const scanStart = Date.now();
    const tokenData = await getTokenData(trimmedAddress);
    const scanDuration = Date.now() - scanStart;
    console.log(`[Handler] Token data fetched in ${scanDuration}ms`);

    // Prepare social context for narrative extraction
    const socialContext = JSON.stringify({
      website: tokenData.websiteData,
      twitter: tokenData.twitterData,
      tickerTweets: tokenData.tickerTweets, // Include ticker search tweets
      telegram: tokenData.telegramData,
    });
    console.log(`[Handler] Prepared social context for narrative extraction`);

    // Extract narrative
    const narrativeStart = Date.now();
    const { narrative_claim, entities } = await extractNarrativeClaim(
      tokenData.projectSummary,
      socialContext
    );
    const narrativeDuration = Date.now() - narrativeStart;
    console.log(`[Handler] Narrative extracted in ${narrativeDuration}ms`);

    // Search for evidence (parallel)
    console.log(`[Handler] Searching for evidence...`);
    const evidenceStart = Date.now();
    const [webEvidence, twitterEvidence] = await Promise.allSettled([
      searchWebForNarrative(narrative_claim, entities),
      searchTwitterForLore(narrative_claim, entities),
    ]);
    const evidenceDuration = Date.now() - evidenceStart;
    console.log(`[Handler] Evidence search completed in ${evidenceDuration}ms`);

    const webResult =
      webEvidence.status === "fulfilled" ? webEvidence.value : { articles: [], searchPerformed: false };
    const twitterResult =
      twitterEvidence.status === "fulfilled"
        ? twitterEvidence.value
        : { loreTweet: null, validationTweets: [] };

    // Classify narrative
    const classifyStart = Date.now();
    const { verdict, reasoning, confidence, redFlags } =
      await classifyNarrative({
      narrativeClaim: narrative_claim,
      projectSummary: tokenData.projectSummary,
      entities,
        webEvidence: webResult,
        twitterEvidence: twitterResult,
    });
    const classifyDuration = Date.now() - classifyStart;
    console.log(`[Handler] Classification completed in ${classifyDuration}ms`);

    // Generate analysis sections in parallel
    const analysisStart = Date.now();
    console.log(`[Handler] Generating analysis sections in parallel...`);
    const [summaryResult, fundamentalsResult, hypeResult] = await Promise.allSettled([
      generateSummary({ 
        narrativeClaim: narrative_claim, 
        verdict, 
        tokenData,
        tokenName: tokenData.tokenName 
      }),
      generateFundamentals({ 
        tokenData, 
        verdict, 
        reasoning 
      }),
      generateHype({ 
        tokenData, 
        narrativeClaim: narrative_claim 
      }),
    ]);
    
    const summary = summaryResult.status === "fulfilled" ? summaryResult.value : "Summary unavailable.";
    const fundamentals = fundamentalsResult.status === "fulfilled" ? fundamentalsResult.value : "Fundamentals unavailable.";
    const hype = hypeResult.status === "fulfilled" ? hypeResult.value : "Hype analysis unavailable.";
    
    const analysisDuration = Date.now() - analysisStart;
    console.log(`[Handler] Analysis sections generated in ${analysisDuration}ms`);

    // Assemble result
    const result = {
      contractAddress: trimmedAddress,
      projectSummary: tokenData.projectSummary,
      tokenName: tokenData.tokenName,
      symbol: tokenData.symbol,
      narrativeClaim: narrative_claim,
      entities,
      marketData: tokenData.marketData,
      socials: tokenData.socials,
      securityData: tokenData.securityData,
      fundamentals: tokenData.fundamentals,
      birdeye: tokenData.birdeye,
      sentimentScore: tokenData.sentimentScore,
      tokenScore: tokenData.tokenScore,
      twitterData: tokenData.twitterData,
      tickerTweets: tokenData.tickerTweets, // Tweets mentioning the token ticker
      telegramData: tokenData.telegramData,
      websiteData: tokenData.websiteData,
      loreTweet: twitterResult?.loreTweet || null,
      verdict,
      verdictReasoning: reasoning,
      confidence,
      redFlags: redFlags || [],
      evidence: {
        articles: webResult?.articles || [],
        tweets: twitterResult?.validationTweets || [],
      },
      // Analysis sections
      summary,
      fundamentalsAnalysis: fundamentals,
      hypeAnalysis: hype,
    };

    // Save to cache (don't wait for it)
    console.log(`[Handler] Saving to cache (background)...`);
    saveScan(trimmedAddress, result).catch((err) =>
      console.error("[Handler] Background cache save failed:", err)
    );

    const totalDuration = Date.now() - requestStart;
    console.log(`\n[Handler] ===== SCAN COMPLETE =====`);
    console.log(`[Handler] Total duration: ${totalDuration}ms`);
    console.log(`[Handler] Verdict: ${verdict} (${confidence} confidence)`);
    console.log(`[Handler] Returning result to client\n`);

    // Track usage if API key is present
    if (apiKeyData && apiAuth) {
      apiAuth.trackUsage(apiKeyData.id, trimmedAddress, totalDuration, false).catch(console.error);
    }

    const response = {
      success: apiKeyData ? true : undefined,
      cached: false,
      ...result,
    };
    
    if (apiKeyData && rateLimitInfo) {
      response.usage = {
        requestsRemaining: rateLimitInfo.remaining?.perMinute || 0,
        resetAt: rateLimitInfo.resetAt?.perMinute?.toISOString()
      };
    }

    return res.status(200).json(response);
  } catch (err) {
    const totalDuration = Date.now() - requestStart;
    console.error(`\n[Handler] ===== ERROR =====`);
    console.error(`[Handler] Error after ${totalDuration}ms:`, err.message);
    console.error(`[Handler] Error stack:`, err.stack);
    console.error(`[Handler] ====================\n`);

    // Provide specific error messages
    if (err.message?.includes("timeout")) {
      return res.status(504).json({
        error: "Request timeout",
        message: "External API request timed out. Please try again.",
      });
    }

    if (err.message?.includes("Failed to fetch")) {
      return res.status(503).json({
        error: "External service unavailable",
        message: "Unable to reach external data sources. Please try again later.",
      });
    }

    if (err.message?.includes("AI")) {
      return res.status(500).json({
        error: "AI processing error",
        message: "Failed to process with AI. Please try again.",
      });
    }

    return res.status(500).json({
      error: "Internal server error",
      message: err.message || "An unexpected error occurred",
    });
  }
}

// Perform full scan with AI analysis (for Telegram bot and other services)
export async function performFullScan(contractAddress) {
  const requestStart = Date.now();
  console.log(`\n[FullScan] ===== Starting full scan for ${contractAddress} =====`);
  
  const trimmedAddress = contractAddress.trim();
  
  // Always fetch fresh data (cache disabled to ensure accurate market data)
  console.log(`[FullScan] Fetching fresh data (cache disabled)...`);
  
  // Fetch token data
  const tokenData = await getTokenData(trimmedAddress);
  
  // Prepare social context for narrative extraction
  const socialContext = JSON.stringify({
    website: tokenData.websiteData,
    twitter: tokenData.twitterData,
    tickerTweets: tokenData.tickerTweets, // Include ticker search tweets
    telegram: tokenData.telegramData,
  });
  
  // Extract narrative
  const { narrative_claim, entities } = await extractNarrativeClaim(
    tokenData.projectSummary,
    socialContext
  );
  
  // Search for evidence (parallel)
  const [webEvidence, twitterEvidence] = await Promise.allSettled([
    searchWebForNarrative(narrative_claim, entities),
    searchTwitterForLore(narrative_claim, entities),
  ]);
  
  const webResult = webEvidence.status === "fulfilled" ? webEvidence.value : { articles: [], searchPerformed: false };
  const twitterResult = twitterEvidence.status === "fulfilled" ? twitterEvidence.value : { loreTweet: null, validationTweets: [] };
  
  // Classify narrative
  const { verdict, reasoning, confidence, redFlags } = await classifyNarrative({
    narrativeClaim: narrative_claim,
    projectSummary: tokenData.projectSummary,
    entities,
    webEvidence: webResult,
    twitterEvidence: twitterResult,
  });
  
  // Generate analysis sections in parallel
  const [summaryResult, fundamentalsResult, hypeResult] = await Promise.allSettled([
    generateSummary({ 
      narrativeClaim: narrative_claim, 
      verdict, 
      tokenData,
      tokenName: tokenData.tokenName 
    }),
    generateFundamentals({ 
      tokenData, 
      verdict, 
      reasoning 
    }),
    generateHype({ 
      tokenData, 
      narrativeClaim: narrative_claim 
    }),
  ]);
  
  const summary = summaryResult.status === "fulfilled" ? summaryResult.value : "Summary unavailable.";
  const fundamentals = fundamentalsResult.status === "fulfilled" ? fundamentalsResult.value : "Fundamentals unavailable.";
  const hype = hypeResult.status === "fulfilled" ? hypeResult.value : "Hype analysis unavailable.";
  
  // Assemble result
  const result = {
    contractAddress: trimmedAddress,
    projectSummary: tokenData.projectSummary,
    tokenName: tokenData.tokenName,
    symbol: tokenData.symbol,
    narrativeClaim: narrative_claim,
    entities,
    marketData: tokenData.marketData,
    socials: tokenData.socials,
    securityData: tokenData.securityData,
    fundamentals: tokenData.fundamentals,
    birdeye: tokenData.birdeye,
    sentimentScore: tokenData.sentimentScore,
    tokenScore: tokenData.tokenScore,
    twitterData: tokenData.twitterData,
    tickerTweets: tokenData.tickerTweets,
    telegramData: tokenData.telegramData,
    websiteData: tokenData.websiteData,
    loreTweet: twitterResult?.loreTweet || null,
    verdict,
    verdictReasoning: reasoning,
    confidence,
    redFlags: redFlags || [],
    evidence: {
      articles: webResult?.articles || [],
      tweets: twitterResult?.validationTweets || [],
    },
    summary,
    fundamentalsAnalysis: fundamentals,
    hypeAnalysis: hype,
  };
  
  // Save to cache (don't wait for it)
  saveScan(trimmedAddress, result).catch((err) =>
    console.error("[FullScan] Background cache save failed:", err)
  );
  
  const totalDuration = Date.now() - requestStart;
  console.log(`[FullScan] ✅ Scan complete in ${totalDuration}ms`);
  
  return result;
}

// Export for use by Telegram bot and other services
// Note: performFullScan is already exported above, so we only export getTokenData here
export { getTokenData };
