// api/scan.js
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Helper: Validate Solana address format
function validateSolanaAddress(address) {
  if (!address || typeof address !== "string") return false;
  // Solana addresses are base58 encoded and typically 32-44 characters
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(address.trim());
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
function computeMarketSentiment(birdeye) {
  if (!birdeye) return null;

  const price = birdeye.priceChange24h ?? 0;
  const volume = birdeye.volume24h ?? 0;
  const trades = birdeye.tradeCount24h ?? 0;
  const rank = birdeye.trendingRank ?? 999;

  // Normalize
  const priceScore = Math.max(0, Math.min(1, (price + 50) / 100));
  const tradeScore = Math.max(0, Math.min(1, Math.log10(trades + 1) / 4));
  const volumeScore = Math.max(0, Math.min(1, Math.log10(volume + 1) / 6));
  const trendingScore = Math.max(0, Math.min(1, (500 - rank) / 500));

  const sentiment =
    0.3 * priceScore +
    0.3 * tradeScore +
    0.25 * volumeScore +
    0.15 * trendingScore;

  return Math.round(sentiment * 100); // 0–100 score
}

// Calculate comprehensive token score (1-100)
function calculateTokenScore(tokenData) {
  let score = 50; // Start at neutral
  
  const { marketData, fundamentals, securityData, socials, sentimentScore } = tokenData;
  
  // Liquidity Score (0-20 points)
  if (marketData?.liquidity) {
    const liquidity = marketData.liquidity;
    if (liquidity > 1000000) score += 15; // >$1M
    else if (liquidity > 500000) score += 12; // >$500K
    else if (liquidity > 100000) score += 8; // >$100K
    else if (liquidity > 50000) score += 5; // >$50K
    else if (liquidity > 10000) score += 3; // >$10K
  } else {
    score -= 10; // No liquidity is bad
  }
  
  // Holder Count Score (0-15 points)
  if (fundamentals?.holderCount) {
    const holders = fundamentals.holderCount;
    if (holders > 10000) score += 15;
    else if (holders > 5000) score += 12;
    else if (holders > 1000) score += 10;
    else if (holders > 500) score += 7;
    else if (holders > 100) score += 5;
    else if (holders > 50) score += 3;
  } else {
    score -= 5;
  }
  
  // Market Cap / Supply Score (0-10 points)
  if (fundamentals?.supply && marketData?.price) {
    const supply = parseInt(fundamentals.supply) || 0;
    const price = parseFloat(marketData.price) || 0;
    const marketCap = (supply * price) / Math.pow(10, fundamentals.decimals || 9);
    
    if (marketCap > 10000000) score += 10; // >$10M
    else if (marketCap > 1000000) score += 8; // >$1M
    else if (marketCap > 100000) score += 6; // >$100K
    else if (marketCap > 10000) score += 4; // >$10K
    else if (marketCap > 1000) score += 2;
  }
  
  // Security Score (0-15 points)
  if (securityData) {
    if (!securityData.risks || securityData.risks.length === 0) {
      score += 15; // No risks = good
    } else {
      const highRisks = securityData.risks.filter(r => r.level === 'high').length;
      const mediumRisks = securityData.risks.filter(r => r.level === 'medium').length;
      
      score -= highRisks * 5; // Each high risk = -5
      score -= mediumRisks * 2; // Each medium risk = -2
      
      // Check for rug risks
      if (fundamentals?.mintAuthority === null || fundamentals?.freezeAuthority === null) {
        score += 5; // No mint/freeze authority = good
      }
      if (fundamentals?.mintAuthority) {
        score -= 8; // Has mint authority = risk
      }
      if (fundamentals?.freezeAuthority) {
        score -= 8; // Has freeze authority = risk
      }
    }
  } else {
    score -= 3; // No security data = unknown
  }
  
  // Social Presence Score (0-10 points)
  if (socials) {
    let socialCount = 0;
    if (socials.website) socialCount++;
    if (socials.x) socialCount++;
    if (socials.telegram) socialCount++;
    score += socialCount * 3;
  } else {
    score -= 5;
  }
  
  // Volume/Activity Score (0-10 points)
  if (marketData?.volume24h) {
    const volume = marketData.volume24h;
    if (volume > 1000000) score += 10; // >$1M
    else if (volume > 500000) score += 8;
    else if (volume > 100000) score += 6;
    else if (volume > 50000) score += 4;
    else if (volume > 10000) score += 2;
  }
  
  // Sentiment Score (0-10 points)
  if (sentimentScore !== null && sentimentScore !== undefined) {
    score += (sentimentScore / 100) * 10;
  }
  
  // Clamp between 1 and 100
  return Math.max(1, Math.min(100, Math.round(score)));
}

// Fetch Twitter via Nitter (free Twitter scraper)
async function getTwitterFromNitter(twitterUrl) {
  const startTime = Date.now();
  console.log(`[Twitter] Starting Nitter scrape for: ${twitterUrl}`);
  
  if (!twitterUrl) {
    console.log(`[Twitter] No Twitter URL provided`);
    return null;
  }

  // Convert https://twitter.com/... → https://nitter.net/...
  const nitterUrl = twitterUrl
    .replace("https://twitter.com", "https://nitter.net")
    .replace("http://twitter.com", "https://nitter.net")
    .replace("https://x.com", "https://nitter.net")
    .replace("http://x.com", "https://nitter.net");

  console.log(`[Twitter] Converted to Nitter URL: ${nitterUrl}`);

  try {
    const response = await fetchWithTimeout(nitterUrl, {}, 8000);
    console.log(`[Twitter] Response status: ${response.status}`);
    
    if (!response.ok) {
      console.log(`[Twitter] Request failed: ${response.status}`);
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const tweets = [];

    $(".timeline-item").each((i, el) => {
      if (i >= 5) return; // Only first 5 tweets

      const text = $(el).find(".tweet-content").text().trim();
      const date = $(el).find("time").attr("datetime");
      const likes = $(el).find(".likes .icon-container").text().trim();
      const retweets = $(el).find(".retweets .icon-container").text().trim();

      tweets.push({
        text,
        date,
        likes,
        retweets,
      });
    });

    const result = {
      tweets,
      topTweet: tweets[0] || null,
      tweetCount: tweets.length,
    };
    
    const duration = Date.now() - startTime;
    console.log(`[Twitter] ✅ Success: ${tweets.length} tweets scraped - ${duration}ms`);
    
    return result;
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[Twitter] ❌ Failed after ${duration}ms:`, err.message);
    console.error(`[Twitter] Error details:`, err);
    return null;
  }
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

// Scrape website HTML using CORSProxy (free)
async function scrapeWebsite(websiteUrl) {
  const startTime = Date.now();
  console.log(`[Website] Starting scrape for: ${websiteUrl}`);
  
  if (!websiteUrl) {
    console.log(`[Website] No website URL provided`);
    return null;
  }

  const proxied = `https://corsproxy.io/?${encodeURIComponent(websiteUrl)}`;
  console.log(`[Website] Proxied URL: ${proxied.substring(0, 60)}...`);

  try {
    const response = await fetchWithTimeout(proxied, {}, 8000);
    console.log(`[Website] Response status: ${response.status}`);
    
    if (!response.ok) {
      console.log(`[Website] Request failed: ${response.status}`);
      return null;
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const title = $("title").text();
    const metaDesc = $('meta[name="description"]').attr("content");
    const text = $("body").text().replace(/\s+/g, " ").trim();

    const result = {
      title,
      metaDesc,
      shortText: text.slice(0, 1500), // avoid huge payloads
    };
    
    const duration = Date.now() - startTime;
    console.log(`[Website] ✅ Success: Title="${title.substring(0, 50)}...", ${text.length} chars - ${duration}ms`);
    
    return result;
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[Website] ❌ Failed after ${duration}ms:`, err.message);
    console.error(`[Website] Error details:`, err);
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
  
  const { tokenName, symbol, socials, priceUsd, liquidity } = tokenData;
  
  let summary = `Token ${symbol}`;
  
  if (tokenName && tokenName !== "Unknown Token") {
    summary += ` (${tokenName})`;
  }
  
  summary += ` is a Solana-based token`;
  
  if (liquidity) {
    summary += ` with $${(liquidity / 1000000).toFixed(2)}M in liquidity`;
  }
  
  if (priceUsd) {
    summary += ` trading at $${parseFloat(priceUsd).toFixed(6)}`;
  }
  
  summary += `.`;
  
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
  
  try {
    // Fetch data from multiple sources in parallel
    console.log(`[TokenData] Fetching from 4 sources: DexScreener, RugCheck, Helius, Birdeye`);
    const fetchStart = Date.now();
    
    const [dexData, rugData, heliusData, birdeyeData] =
      await Promise.allSettled([
      getDexScreenerData(contractAddress),
      getRugCheckData(contractAddress),
        getHeliusFundamentals(contractAddress),
        getBirdeyeData(contractAddress),
      ]);

    const fetchDuration = Date.now() - fetchStart;
    console.log(`[TokenData] Initial fetch completed in ${fetchDuration}ms`);

    const dex = dexData.status === "fulfilled" ? dexData.value : null;
    const rug = rugData.status === "fulfilled" ? rugData.value : null;
    const helius = heliusData.status === "fulfilled" ? heliusData.value : null;
    const birdeye = birdeyeData.status === "fulfilled" ? birdeyeData.value : null;

    console.log(`[TokenData] Results: DexScreener=${!!dex}, RugCheck=${!!rug}, Helius=${!!helius}, Birdeye=${!!birdeye}`);
    
    if (dexData.status === "rejected") {
      console.error(`[TokenData] DexScreener failed:`, dexData.reason);
    }
    if (rugData.status === "rejected") {
      console.error(`[TokenData] RugCheck failed:`, rugData.reason);
    }
    if (heliusData.status === "rejected") {
      console.error(`[TokenData] Helius failed:`, heliusData.reason);
    }
    if (birdeyeData.status === "rejected") {
      console.error(`[TokenData] Birdeye failed:`, birdeyeData.reason);
    }

    const sentimentScore = computeMarketSentiment(birdeye);
    console.log(`[TokenData] Sentiment score: ${sentimentScore || "N/A"}`);
    
    const socials = dex?.socials || null;
    
    // Calculate comprehensive token score
    const tokenScoreData = {
      marketData: {
        price: birdeye?.price || dex?.priceUsd || null,
        liquidity: birdeye?.liquidity || dex?.liquidity || null,
        volume24h: birdeye?.volume24h || dex?.volume24h || null,
      },
      fundamentals: helius,
      securityData: rug,
      socials,
      sentimentScore,
    };
    
    const tokenScore = calculateTokenScore(tokenScoreData);
    console.log(`[TokenData] Comprehensive token score: ${tokenScore}/100`);
    console.log(`[TokenData] Social links: website=${!!socials?.website}, twitter=${!!socials?.x}, telegram=${!!socials?.telegram}`);

    // Fetch social data in parallel
    console.log(`[TokenData] Fetching social data...`);
    const socialStart = Date.now();
    
    const [twitterDataResult, telegramDataResult, websiteDataResult] =
      await Promise.allSettled([
        socials?.x ? getTwitterFromNitter(socials.x) : Promise.resolve(null),
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
    const telegramData =
      telegramDataResult.status === "fulfilled"
        ? telegramDataResult.value
        : null;
    const websiteData =
      websiteDataResult.status === "fulfilled"
        ? websiteDataResult.value
        : null;

    console.log(`[TokenData] Social results: Twitter=${!!twitterData}, Telegram=${!!telegramData}, Website=${!!websiteData}`);
    
    if (twitterDataResult.status === "rejected") {
      console.error(`[TokenData] Twitter scrape failed:`, twitterDataResult.reason);
    }
    if (telegramDataResult.status === "rejected") {
      console.error(`[TokenData] Telegram scrape failed:`, telegramDataResult.reason);
    }
    if (websiteDataResult.status === "rejected") {
      console.error(`[TokenData] Website scrape failed:`, websiteDataResult.reason);
    }

    // Generate comprehensive project summary
    const projectSummary = `
Token ${dex?.symbol || helius?.tokenSymbol || "???"} is a Solana token.

Supply: ${helius?.supply || "unknown"}
Holders: ${helius?.holderCount || "unknown"}
Mint Authority: ${helius?.mintAuthority || "unknown"}
Freeze Authority: ${helius?.freezeAuthority || "unknown"}

Price: $${birdeye?.price || dex?.priceUsd || "unknown"}
24h Volume: ${birdeye?.volume24h || dex?.volume24h || "unknown"}
Liquidity: ${birdeye?.liquidity || dex?.liquidity || "unknown"}

Security Risks: ${rug?.risks?.length || 0}
Sentiment Score: ${sentimentScore || "N/A"}
`.trim();
    
    return {
      projectSummary,
      tokenName: dex?.tokenName || helius?.tokenName || "Unknown Token",
      symbol: dex?.symbol || helius?.tokenSymbol || "???",
      socials,
      marketData: {
        price: birdeye?.price || dex?.priceUsd || null,
        volume24h: birdeye?.volume24h || dex?.volume24h || null,
        liquidity: birdeye?.liquidity || dex?.liquidity || null,
        priceChange24h: birdeye?.priceChange24h || dex?.priceChange24h || null,
        dexUrl: dex?.dexUrl || null,
      },
      fundamentals: helius,
      birdeye,
      sentimentScore,
      securityData: rug,
      hasMarketData: !!(dex || birdeye),
      twitterData,
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
    const socialDataText = socialContext
      ? `
SOCIAL CONTEXT:
${socialContext}
`
      : "";

  const fullContext = `
PROJECT SUMMARY:
${projectSummary}
${socialDataText}
`.trim();
    
    console.log(`[Narrative] Full context length: ${fullContext.length} chars`);

  const prompt = `
You are an expert crypto narrative analyst.

Analyze this token's information and extract the core narrative claim - the story this token is telling.

Look for:
- References to real companies, products, or events
- Partnerships or associations being claimed
- Technology or innovation being referenced
- Any real-world narratives being leveraged

Return:
1. A clear, specific narrative claim (what real-world story is this token using?)
2. Entities involved (organizations, products, people, events)
3. Key topics and themes

If the token has no clear narrative beyond "it's a meme token", say so.

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
You are a balanced crypto analyst evaluating token narratives objectively.

Analyze this token's narrative claims with a fair, constructive perspective:

NARRATIVE CLAIM:
${narrativeClaim}

PROJECT SUMMARY:
${projectSummary}

ENTITIES IDENTIFIED:
${JSON.stringify(entities, null, 2)}
${evidenceSummary}
${twitterSummary}

Evaluate:

1. Does the narrative reference real events, products, or concepts?
2. Are the mentioned entities legitimate?
3. What's the nature of the association (official vs. inspired)?

Classify as:
- CONFIRMED: Clear connection to verified real-world elements. The story checks out.
- PARTIAL: Some real elements mixed with community-driven narrative. Common for memecoins.
- UNVERIFIED: Limited evidence to verify claims. Could be legitimate but needs more proof.

Write reasoning (3-4 sentences) that:
- Acknowledges positives when they exist
- Points out legitimate concerns without being alarmist
- Provides balanced perspective - memecoins can be successful even if unverified
- Helps investors make informed decisions

Tone: Professional, fair, and constructive. Avoid being overly negative or dismissive.

Return STRICT JSON:

{
  "verdict": "CONFIRMED" | "PARTIAL" | "UNVERIFIED",
  "reasoning": "balanced explanation (3-4 sentences)",
  "confidence": "high" | "medium" | "low",
  "redFlags": ["only significant concerns, be selective"]
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
    const score = tokenData?.tokenScore || 50;
    const sentiment = tokenData?.sentimentScore || 50;
    
    const prompt = `
You're a crypto analyst. Write a concise bullet-point summary for ${tokenName || "this token"}.

Format as 3-4 bullet points. Be direct and engaging.

Context:
- Narrative: ${narrativeClaim}
- Verdict: ${verdict}
- Score: ${score}/100
- Sentiment: ${sentiment}/100

Use bullet points (• or -). Keep each point short (one line). No fluff.
`;

    console.log(`[Summary] Calling OpenAI...`);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      max_tokens: 100,
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
    
    const prompt = `
Break down the hard numbers for this token. 3-4 sentences.

DATA:
- Score: ${score}/100
- Holders: ${holders || "unknown"}
- Liquidity: ${liquidity ? `$${(liquidity / 1000).toFixed(0)}K` : "unknown"}
- Volume (24h): ${volume24h ? `$${(volume24h / 1000).toFixed(0)}K` : "unknown"}
- Security: ${!hasMintAuth && !hasFreezeAuth ? "✓ Clean (no mint/freeze authority)" : "⚠ " + (hasMintAuth ? "Mint authority present" : "") + (hasFreezeAuth ? " Freeze authority present" : "")}
- Risk flags: ${risks}
- Verdict: ${verdict}

Tell me: Are these numbers good, mid, or concerning? What stands out? Be straight up.

Tone: Direct, analytical, no BS. "This looks solid because X" or "These numbers are weak - here's why"
`;

    console.log(`[Fundamentals] Calling OpenAI...`);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 200,
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
    const hasTwitter = !!tokenData?.twitterData;
    const hasTelegram = !!tokenData?.telegramData;
    
    const prompt = `
What's the vibe around this token? 2-3 sentences.

DATA:
- Sentiment score: ${sentiment}/100
- 24h volume: ${volume24h ? `$${(volume24h / 1000).toFixed(0)}K` : "unknown"}
- Price change (24h): ${priceChange !== null ? `${priceChange > 0 ? "+" : ""}${priceChange.toFixed(2)}%` : "unknown"}
- Social presence: ${hasTwitter ? "✓ Twitter" : "✗ Twitter"}, ${hasTelegram ? "✓ Telegram" : "✗ Telegram"}
- Narrative: ${narrativeClaim.substring(0, 100)}...

Is this heating up or cooling down? Is there real momentum or just noise? Be real about the energy.

Tone: Honest and direct. "Community is buzzing" or "Pretty quiet, not much happening" - call it as you see it.
`;

    console.log(`[Hype] Calling OpenAI...`);
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.8,
      max_tokens: 150,
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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
    
    if (!validateSolanaAddress(trimmedAddress)) {
      console.log(`[Handler] ❌ Validation failed: Invalid Solana address format`);
      return res.status(400).json({
        error: "Invalid Solana address format",
        message:
          "Contract address must be a valid Solana address (32-44 base58 characters)",
      });
    }

    console.log(`[Handler] ✅ Validation passed`);

    // Check cache
    console.log(`[Handler] Checking cache...`);
    const cacheStart = Date.now();
    const cached = await getCachedScan(trimmedAddress);
    const cacheDuration = Date.now() - cacheStart;
    
    if (
      cached?.result_json &&
      cached.result_json.marketData &&
      cached.result_json.socials
    ) {
      const totalDuration = Date.now() - requestStart;
      console.log(`[Handler] ✅ Cache hit! Returning cached result (${totalDuration}ms total)\n`);
        return res.status(200).json({
          cached: true,
          ...cached.result_json,
        });
    }
    
    console.log(`[Handler] Cache miss (${cacheDuration}ms) - proceeding with fresh scan`);

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

    return res.status(200).json({
      cached: false,
      ...result,
    });
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
