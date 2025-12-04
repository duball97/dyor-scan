// Streaming scan endpoint using Server-Sent Events
import OpenAI from "openai";
import * as cheerio from "cheerio";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ScrapingBee API configuration
const SCRAPINGBEE_API_KEY = process.env.SCRAPINGBEE_KEY;
const SCRAPINGBEE_BASE_URL = 'https://app.scrapingbee.com/api/v1/';

// Fetch HTML from ScrapingBee
async function fetchWithScrapingBee(url) {
  if (!SCRAPINGBEE_API_KEY) {
    throw new Error('SCRAPINGBEE_KEY environment variable is not set');
  }

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
}

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
    let websiteUrl = null;
    
    // Method 1: Look for links in the token info section (the div with bg-darkGray900)
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
            // Skip common non-website links
            if (!fullUrl.includes('twitter.com') && 
                !fullUrl.includes('x.com') && 
                !fullUrl.includes('telegram.org') && 
                !fullUrl.includes('t.me') &&
                !fullUrl.includes('dexscreener.com') &&
                !fullUrl.includes('bscscan.com') &&
                !fullUrl.includes('four.meme') &&
                !fullUrl.includes('github.com') &&
                !fullUrl.includes('discord.com') &&
                !fullUrl.includes('medium.com') &&
                !fullUrl.includes('reddit.com')) {
              // This might be the website
              if (!websiteUrl) {
                websiteUrl = fullUrl;
              }
            }
          }
        }
      });
    }
    
    // Method 1b: If not found in token section, search all links
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
            // Skip common non-website links
            if (!fullUrl.includes('twitter.com') && 
                !fullUrl.includes('x.com') && 
                !fullUrl.includes('telegram.org') && 
                !fullUrl.includes('t.me') &&
                !fullUrl.includes('dexscreener.com') &&
                !fullUrl.includes('bscscan.com') &&
                !fullUrl.includes('four.meme') &&
                !fullUrl.includes('github.com') &&
                !fullUrl.includes('discord.com') &&
                !fullUrl.includes('medium.com') &&
                !fullUrl.includes('reddit.com')) {
              // This might be the website
              if (!websiteUrl) {
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

// Helper: Fetch with timeout
async function fetchWithTimeout(url, options, timeoutMs = 4000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// Fetch token holders from Solscan
async function getSolscanHolders(mint) {
  try {
    const url = `https://public-api.solscan.io/token/holders?tokenAddress=${mint}&offset=0&size=1`;
    const response = await fetchWithTimeout(url, { method: "GET", headers: { "Content-Type": "application/json" } }, 5000);
    if (!response.ok) return null;
    const json = await response.json();
    return json?.total || null;
  } catch (err) {
    return null;
  }
}

// Fetch DexScreener data
async function getDexScreenerData(contractAddress) {
  try {
    const response = await fetchWithTimeout(
      `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`,
      { headers: { Accept: "application/json" } },
      5000
    );
    if (!response.ok) return null;
    const data = await response.json();
    const pair = data?.pairs?.[0];
    if (!pair) return null;
    
    return {
      tokenName: pair.baseToken?.name || null,
      symbol: pair.baseToken?.symbol || null,
      priceUsd: pair.priceUsd || null,
      liquidity: pair.liquidity?.usd || null,
      volume24h: pair.volume?.h24 || null,
      priceChange24h: pair.priceChange?.h24 || null,
      dexUrl: pair.url || null,
      socials: {
        website: pair.info?.websites?.[0]?.url || null,
        x: pair.info?.socials?.find(s => s.type === "twitter")?.url || null,
        telegram: pair.info?.socials?.find(s => s.type === "telegram")?.url || null,
      }
    };
  } catch (err) {
    return null;
  }
}

// Fetch RugCheck data
async function getRugCheckData(contractAddress) {
  try {
    const response = await fetchWithTimeout(
      `https://api.rugcheck.xyz/v1/tokens/${contractAddress}/report`,
      { headers: { Accept: "application/json" } },
      5000
    );
    if (!response.ok) return null;
    const data = await response.json();
    return {
      riskLevel: data.riskLevel || "unknown",
      risks: data.risks || [],
      score: data.score || null,
    };
  } catch (error) {
    return null;
  }
}

// Fetch token info from BSCScan (BNB/BSC)
async function getBSCScanTokenInfo(contractAddress) {
  try {
    const apiKey = process.env.BSCSCAN_API_KEY;
    if (!apiKey) return null;
    
    const url = `https://api.bscscan.com/api?module=token&action=tokeninfo&contractaddress=${contractAddress}&apikey=${apiKey}`;
    const response = await fetchWithTimeout(url, { method: "GET", headers: { "Content-Type": "application/json" } }, 5000);
    if (!response.ok) return null;
    
    const json = await response.json();
    if (json.status !== "1" || !json.result) return null;
    
    const token = json.result;
    return {
      tokenName: token.name || null,
      tokenSymbol: token.symbol || null,
      decimals: token.decimals ? parseInt(token.decimals) : null,
      supply: token.totalSupply ? BigInt(token.totalSupply).toString() : null,
      holderCount: null,
    };
  } catch (err) {
    return null;
  }
}

// Fetch token holders count from BSCScan (BNB/BSC)
async function getBSCScanHolders(contractAddress) {
  try {
    const apiKey = process.env.BSCSCAN_API_KEY;
    if (!apiKey) return null;
    // BSCScan doesn't directly provide total holder count in free tier
    return null;
  } catch (err) {
    return null;
  }
}

// Fetch Helius fundamentals
async function getHeliusFundamentals(mint) {
  try {
    const url = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_KEY}`;
    const response = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "helius-asset",
          method: "getAsset",
          params: { id: mint },
        }),
      },
      5000
    );
    if (!response.ok) return null;
    const json = await response.json();
    const asset = json?.result;
    if (!asset) return null;
    
    return {
      supply: asset.supply ?? null,
      decimals: asset.decimals ?? null,
      mintAuthority: asset.mintAuthority ?? null,
      freezeAuthority: asset.freezeAuthority ?? null,
      holderCount: asset.ownership?.ownerCount ?? null,
      tokenName: asset.content?.metadata?.name || null,
      tokenSymbol: asset.content?.metadata?.symbol || null,
    };
  } catch (err) {
    return null;
  }
}

// Search Nitter for tweets containing a ticker/symbol
async function searchNitterForTicker(ticker) {
  if (!ticker || ticker === "???" || !SCRAPINGBEE_API_KEY) {
    return { tweets: [], ticker, tweetCount: 0 };
  }

  const nitterMirrors = [
    'https://nitter.net',
    'https://nitter.privacydev.net',
    'https://nitter.poast.org',
  ];

  const searchQuery = `$${ticker}`;

  // Try all mirrors in parallel, return first successful result
  const mirrorPromises = nitterMirrors.map(async (mirror) => {
    try {
      const searchUrl = `${mirror}/search?f=top&q=${encodeURIComponent(searchQuery)}`;
      const html = await fetchWithScrapingBee(searchUrl);
      
      if (html.includes('rate limit') || html.includes('Too many requests')) {
        return null;
      }

      const $ = cheerio.load(html);
      const tweetElements = $('.timeline-item');
      if (tweetElements.length === 0) return null;

      const tweets = [];
      tweetElements.slice(0, 3).each((i, el) => {
        const $tweet = $(el);
        const text = $tweet.find('.tweet-content').text().trim();
        const authorElement = $tweet.find('.tweet-header a').first();
        const author = authorElement.text().trim();
        const usernameHref = authorElement.attr('href') || '';
        const username = usernameHref ? usernameHref.replace('/', '') : '';
        const timeElement = $tweet.find('time');
        const date = timeElement.attr('datetime') || '';
        const timeText = timeElement.text().trim();
        const replyElement = $tweet.find('.icon-reply').parent();
        const retweetElement = $tweet.find('.icon-retweet').parent();
        const likeElement = $tweet.find('.icon-heart').parent();
        const replies = replyElement.text().match(/\d+/) ? replyElement.text().match(/\d+/)[0] : '0';
        const retweets = retweetElement.text().match(/\d+/) ? retweetElement.text().match(/\d+/)[0] : '0';
        const likes = likeElement.text().match(/\d+/) ? likeElement.text().match(/\d+/)[0] : '0';
        const linkElement = $tweet.find('a[href*="/status/"]').first();
        let tweetUrl = null;
        let tweetId = null;
        
        if (linkElement.length > 0) {
          const href = linkElement.attr('href') || '';
          if (href) {
            const statusMatch = href.match(/\/status\/(\d+)/);
            if (statusMatch) {
              tweetId = statusMatch[1];
              tweetUrl = username ? `https://x.com/${username}/status/${tweetId}` : `https://x.com${href}`;
            } else {
              tweetUrl = href.startsWith('http') ? href : `https://x.com${href}`;
            }
          }
        }

        if (text && (text.includes(`$${ticker}`) || text.toLowerCase().includes(ticker.toLowerCase()))) {
          tweets.push({
            text,
            author,
            username,
            date,
            timeText,
            replies: parseInt(replies) || 0,
            retweets: parseInt(retweets) || 0,
            likes: parseInt(likes) || 0,
            tweetId,
            tweetUrl,
          });
        }
      });

      if (tweets.length > 0) {
        const formattedTweets = tweets.map(tweet => ({
          text: tweet.text,
          date: tweet.date || tweet.timeText,
          likes: tweet.likes.toString(),
          retweets: tweet.retweets.toString(),
          tweetId: tweet.tweetId,
          tweetUrl: tweet.tweetUrl,
          username: tweet.username,
          author: tweet.author,
        }));

        return {
          tweets: formattedTweets,
          query: searchQuery,
          ticker,
          tweetCount: formattedTweets.length,
        };
      }
      return null;
    } catch (error) {
      return null;
    }
  });

  // Wait for first successful result
  const results = await Promise.allSettled(mirrorPromises);
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      return result.value;
    }
  }

  return { tweets: [], ticker, tweetCount: 0 };
}

// Fetch Twitter via Nitter using ScrapingBee
async function getTwitterFromNitter(twitterUrl) {
  if (!twitterUrl || !SCRAPINGBEE_API_KEY) return null;

  const usernameMatch = twitterUrl.match(/(?:twitter\.com|x\.com)\/([^\/\?]+)/);
  const username = usernameMatch ? usernameMatch[1] : null;
  if (!username) return null;

  const nitterMirrors = [
    'https://nitter.net',
    'https://nitter.privacydev.net',
    'https://nitter.poast.org',
  ];

  // Try all mirrors in parallel, return first successful result
  const mirrorPromises = nitterMirrors.map(async (mirror) => {
    try {
      const nitterUrl = `${mirror}/${username}`;
      const html = await fetchWithScrapingBee(nitterUrl);
      
      if (html.includes('rate limit') || html.includes('Too many requests')) {
        return null;
      }

      const $ = cheerio.load(html);
      const tweetElements = $('.timeline-item');
      if (tweetElements.length === 0) return null;

      // Get author name from profile (usually in the header)
      const authorElement = $('.profile-card-fullname, .profile-card-name, .fullname').first();
      const author = authorElement.text().trim() || username;

      const tweets = [];
      tweetElements.slice(0, 3).each((i, el) => {
        const $tweet = $(el);
        const text = $tweet.find('.tweet-content').text().trim();
        const timeElement = $tweet.find('time');
        const date = timeElement.attr('datetime') || '';
        const timeText = timeElement.text().trim();
        const replyElement = $tweet.find('.icon-reply').parent();
        const retweetElement = $tweet.find('.icon-retweet').parent();
        const likeElement = $tweet.find('.icon-heart').parent();
        const replies = replyElement.text().match(/\d+/) ? replyElement.text().match(/\d+/)[0] : '0';
        const retweets = retweetElement.text().match(/\d+/) ? retweetElement.text().match(/\d+/)[0] : '0';
        const likes = likeElement.text().match(/\d+/) ? likeElement.text().match(/\d+/)[0] : '0';
        const linkElement = $tweet.find('a[href*="/status/"]').first();
        let tweetUrl = null;
        let tweetId = null;
        
        if (linkElement.length > 0) {
          const href = linkElement.attr('href') || '';
          if (href) {
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
            author,
            username,
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
        // Sort tweets by engagement (likes + retweets) - highest first
        const sortedTweets = tweets.sort((a, b) => {
          const engagementA = (a.likes || 0) + (a.retweets || 0) * 2;
          const engagementB = (b.likes || 0) + (b.retweets || 0) * 2;
          return engagementB - engagementA;
        });
        
        // Ensure all tweets have author and username
        const formattedTweets = sortedTweets.map(tweet => ({
          ...tweet,
          author: tweet.author || author,
          username: tweet.username || username,
        }));
        
        return {
          tweets: formattedTweets,
          topTweet: formattedTweets[0] || null,
          tweetCount: formattedTweets.length,
        };
      }
      return null;
    } catch (error) {
      return null;
    }
  });

  // Wait for first successful result
  const results = await Promise.allSettled(mirrorPromises);
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      return result.value;
    }
  }

  return null;
}

// Compute market sentiment score (0-100)
function computeMarketSentiment(birdeye, dex, tickerTweets, twitterData) {
  let priceChange = 0;
  let volume = 0;
  let totalTweets = 0;
  let totalEngagement = 0;
  let highEngagementTweets = 0;

  if (birdeye) {
    priceChange = birdeye.priceChange24h ?? 0;
    volume = birdeye.volume24h ?? 0;
  } else if (dex) {
    priceChange = dex.priceChange24h ?? 0;
    volume = dex.volume24h ?? 0;
  }

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

  if (!birdeye && !dex && totalTweets === 0) {
    return null;
  }

  let priceScore = 0.5;
  if (priceChange !== 0) {
    priceScore = Math.max(0, Math.min(1, (priceChange + 30) / 60));
    if (priceChange > 10) priceScore = Math.min(1, priceScore + 0.1);
  }

  let volumeScore = 0.3;
  if (volume > 0) {
    volumeScore = Math.max(0.2, Math.min(1, Math.log10(volume) / 7));
  }
  
  let socialScore = 0;
  if (totalTweets > 0) {
    const avgEngagement = totalEngagement / totalTweets;
    const tweetCountScore = Math.min(0.3, totalTweets * 0.03);
    const engagementScore = Math.min(0.4, Math.log10(avgEngagement + 1) / 3);
    const viralScore = Math.min(0.3, highEngagementTweets * 0.06);
    socialScore = tweetCountScore + engagementScore + viralScore;
  }

  const sentiment = (0.25 * priceScore) + (0.25 * volumeScore) + (0.5 * socialScore);
  let finalSentiment = Math.round(sentiment * 100);
  
  if (totalTweets > 0) {
    if (highEngagementTweets >= 3) finalSentiment = Math.max(finalSentiment, 55);
    else if (totalTweets >= 5) finalSentiment = Math.max(finalSentiment, 40);
    else finalSentiment = Math.max(finalSentiment, 30);
  }
  
  return Math.min(100, finalSentiment);
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

// Format liquidity/volume: use K for < 1M, M for >= 1M
function formatLiquidityVolume(value) {
  if (!value) return "unknown";
  if (value >= 1000000) {
    return `$${(value / 1000000).toFixed(2)}M`;
  } else {
    return `$${(value / 1000).toFixed(0)}K`;
  }
}

// Calculate token score
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
  // const holders = fundamentals?.holderCount || 0; // Removed - holder data unreliable
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

// Scrape website HTML using ScrapingBee (primary) with fallback
async function scrapeWebsite(websiteUrl) {
  const startTime = Date.now();
  console.log(`[Website] Starting scrape for: ${websiteUrl}`);
  
  if (!websiteUrl) {
    console.log(`[Website] No website URL provided`);
    return null;
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
          shortText: text.slice(0, 2000),
          headings: headings.slice(0, 10),
        };
        
        const duration = Date.now() - startTime;
        console.log(`[Website] ✅ Success via ScrapingBee: Title="${result.title.substring(0, 50)}...", ${text.length} chars, ${headings.length} headings - ${duration}ms`);
        
        return result;
      }
    } catch (sbErr) {
      console.log(`[Website] ScrapingBee method failed: ${sbErr.message}`);
    }
  }

  // Method 2: Try direct fetch (fallback)
  try {
    console.log(`[Website] Trying direct fetch...`);
    const response = await fetchWithTimeout(websiteUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      }
    }, 8000);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    if (html.length < 100) {
      throw new Error('Empty response');
    }

    const $ = cheerio.load(html);
    $('script, style, noscript').remove();

    const title = $("title").text().trim();
    const metaDesc = $('meta[name="description"]').attr("content") || 
                     $('meta[property="og:description"]').attr("content") || '';
    const text = $("body").text().replace(/\s+/g, " ").trim();

    if (!title && text.length < 100) {
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
    console.log(`[Website] ✅ Success via direct fetch: Title="${title.substring(0, 50)}...", ${text.length} chars - ${duration}ms`);
    
    return result;
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[Website] ❌ All methods failed after ${duration}ms:`, err.message);
    return null;
  }
}

// Extract narrative claim based on tweets, website, and token data
async function extractNarrative(tokenData, tickerTweets, twitterData) {
  try {
    const symbol = tokenData.symbol || "???";
    const tokenName = tokenData.tokenName || "Unknown Token";
    const liquidity = tokenData.marketData?.liquidity || 0;
    const holders = tokenData.fundamentals?.holderCount || null;
    const websiteData = tokenData.websiteData;
    
    // Format website content prominently
    let websiteContext = "";
    if (websiteData) {
      websiteContext = `
WEBSITE CONTENT (${websiteData.url || 'Unknown URL'}):
Title: ${websiteData.title || 'No title'}
Description: ${websiteData.metaDesc || 'No description'}
${websiteData.headings && websiteData.headings.length > 0 ? `Key Headings:\n${websiteData.headings.map((h, i) => `${i + 1}. ${h}`).join('\n')}\n` : ''}
Content: ${websiteData.shortText || 'No content available'}
`;
    }
    
    // Combine all tweets
    const allTweets = [
      ...(tickerTweets?.tweets || []),
      ...(twitterData?.tweets || [])
    ];
    
    let tweetContext = "";
    if (allTweets.length > 0) {
      // Get top 10 tweets by engagement, including author info
      const sortedTweets = allTweets
        .map(tweet => ({
          text: tweet.text || tweet.content || "",
          author: tweet.author || tweet.username || "Unknown",
          username: tweet.username || null,
          likes: parseInt(tweet.likes || tweet.likeCount || 0),
          retweets: parseInt(tweet.retweets || tweet.retweetCount || 0),
          engagement: parseInt(tweet.likes || tweet.likeCount || 0) + (parseInt(tweet.retweets || tweet.retweetCount || 0) * 2)
        }))
        .sort((a, b) => b.engagement - a.engagement)
        .slice(0, 10);
      
      const tweetTexts = sortedTweets.map((t, idx) => {
        const authorInfo = t.username ? `@${t.username} (${t.author})` : t.author;
        return `${idx + 1}. ${authorInfo}: "${t.text.substring(0, 200)}..." (${t.likes} likes, ${t.retweets} retweets)`;
      }).join("\n");
      
      tweetContext = `\n\nTWEETS ABOUT THIS TOKEN:\n${tweetTexts}`;
    }
    
    const baseInfo = `Token: ${symbol} (${tokenName}). Liquidity: ${formatLiquidityVolume(liquidity)}. Holders: ${holders ? holders.toLocaleString() : "unknown"}.`;
    
    const prompt = `Analyze the information below to extract the core narrative/story of this token. Pay special attention to the WEBSITE CONTENT - this is often the most reliable source of the token's claimed narrative, partnerships, and purpose.

What real-world narrative, theme, or story is this token using to promote itself?

${baseInfo}${websiteContext}${tweetContext}

Based on the website content (if available) and community discussion, what is the main narrative or story being told about this token? The website content is particularly important - analyze it carefully for:
- Official claims about the project
- Partnerships or integrations mentioned (especially with major exchanges)
- Technology or features described
- Use cases or utility
- Whether it's an official exchange token/mascot

If the website content indicates association with a major exchange (Binance, Coinbase, etc.), mention this naturally but DO NOT claim it's "official". Use neutral language like "associated with [Exchange]" or "[Exchange] mascot token" or "linked to [Exchange]". Never use the word "official" as we cannot verify official status.

Provide 1-2 sentences that capture the core narrative based on what you find in the data.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 80,
    });
    return completion.choices[0]?.message?.content?.trim() || "Meme token with no specific narrative.";
  } catch (error) {
    return "Unable to extract narrative.";
  }
}

// Generate AI summary
async function generateSummary({ tokenData, narrativeClaim }) {
  try {
    const tokenName = tokenData?.tokenName || "this token";
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
      const tweetSummaries = allTweets.map((tweet, idx) => {
        const text = tweet.text || tweet.content || "";
        const likes = tweet.likes || tweet.likeCount || 0;
        const retweets = tweet.retweets || tweet.retweetCount || 0;
        return `${idx + 1}. "${text.substring(0, 150)}..." (${likes} likes, ${retweets} retweets)`;
      }).join("\n");
      tweetContext = `\n\nRECENT TWEETS ABOUT THIS TOKEN:\n${tweetSummaries}`;
    }
    
    // Check for official backing
    const websiteData = tokenData?.websiteData;
    const symbol = tokenData?.symbol;
    const officialBacking = detectOfficialBacking(tokenName, symbol, websiteData, tokenData?.socials);
    
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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 150,
    });

    return completion.choices[0]?.message?.content?.trim() || "No summary available.";
  } catch (error) {
    return "Analysis in progress...";
  }
}

// Generate fundamentals analysis
async function generateFundamentals({ tokenData }) {
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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 100,
    });

    return completion.choices[0]?.message?.content?.trim() || "No fundamentals data available.";
  } catch (error) {
    return "Fundamentals data unavailable.";
  }
}

// Generate hype analysis
async function generateHype({ tokenData, narrativeClaim }) {
  try {
    const sentiment = tokenData?.sentimentScore || 50;
    const volume24h = tokenData?.marketData?.volume24h || null;
    const priceChange = tokenData?.marketData?.priceChange24h || null;
    const holders = tokenData?.fundamentals?.holderCount || null;
    const liquidity = tokenData?.marketData?.liquidity || null;
    
    const tickerTweets = tokenData?.tickerTweets?.tweets || [];
    const twitterData = tokenData?.twitterData?.tweets || [];
    const allTweets = [...tickerTweets, ...twitterData].slice(0, 15);
    
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
    
    const hypeDataLines = [`- Sentiment score: ${sentiment}/100`];
    if (volume24h) hypeDataLines.push(`- 24h volume: $${(volume24h / 1000000).toFixed(2)}M`);
    if (priceChange !== null) hypeDataLines.push(`- Price change (24h): ${priceChange > 0 ? "+" : ""}${priceChange.toFixed(2)}%`);
    if (holders) hypeDataLines.push(`- Holders: ${holders.toLocaleString()}`);
    if (liquidity) hypeDataLines.push(`- Liquidity: ${formatLiquidityVolume(liquidity)}`);
    if (narrativeClaim) hypeDataLines.push(`- Narrative: ${narrativeClaim.substring(0, 150)}...`);
    
    const prompt = `
Assess market sentiment and community hype for this token. Provide analysis in 2 sentences max.

AVAILABLE DATA:
${hypeDataLines.join('\n')}${tweetAnalysis}

RULES:
- ONLY discuss data provided - never mention missing/unknown data
- NEVER mention "Solana" or blockchain basics
- Use **bold** for sentiment scores, volumes, price changes, engagement metrics
- If tweet data is provided, analyze engagement quality and community momentum
- Connect social signals to market behavior

Provide 2 concise, insightful sentences about hype and momentum.
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
      max_tokens: 120,
    });

    return completion.choices[0]?.message?.content?.trim() || "No hype data available.";
  } catch (error) {
    return "Hype analysis unavailable.";
  }
}

// Main streaming handler
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { contractAddress } = req.body;
  if (!contractAddress) {
    return res.status(400).json({ error: "Contract address is required" });
  }

  const trimmedAddress = contractAddress.trim();
  
  // Detect blockchain
  const blockchain = detectBlockchain(trimmedAddress);
  if (!blockchain) {
    return res.status(400).json({ error: "Invalid address format. Must be a valid Solana or BNB/BSC address." });
  }
  
  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  
  // Helper to send SSE events
  const sendEvent = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
  };

  try {
    sendEvent("status", { message: "Starting analysis...", phase: 1 });

    // Phase 1: Fetch basic data
    sendEvent("status", { message: "Fetching token data...", phase: 2 });
    
    let dex, rug, fundamentals, holders;
    
    if (blockchain === "bnb") {
      // BNB/BSC: Use DexScreener, BSCScan (skip RugCheck, Helius, Solscan)
      [dex, fundamentals, holders] = await Promise.all([
        getDexScreenerData(trimmedAddress),
        getBSCScanTokenInfo(trimmedAddress),
        getBSCScanHolders(trimmedAddress),
      ]);
      rug = null; // RugCheck doesn't support BNB
    } else {
      // Solana: Use existing sources
      [dex, rug, fundamentals, holders] = await Promise.all([
        getDexScreenerData(trimmedAddress),
        getRugCheckData(trimmedAddress),
        getHeliusFundamentals(trimmedAddress),
        getSolscanHolders(trimmedAddress),
      ]);
    }

    const holderCount = holders || fundamentals?.holderCount || null;
    const symbol = dex?.symbol || fundamentals?.tokenSymbol || "???";
    
    // Calculate market cap
    const price = dex?.priceUsd || null;
    const supply = fundamentals?.supply;
    const decimals = fundamentals?.decimals || (blockchain === "bnb" ? 18 : 9);
    let marketCap = null;
    if (price && supply) {
      marketCap = (BigInt(supply) * BigInt(Math.round(price * Math.pow(10, decimals)))) / BigInt(Math.pow(10, decimals));
      marketCap = Number(marketCap) / Math.pow(10, decimals);
    }
    
    // For BNB tokens, check four.meme if DexScreener doesn't have a website
    let socials = dex?.socials || null;
    if (blockchain === "bnb" && (!socials || !socials.website)) {
      console.log(`[ScanStream] No website from DexScreener for BNB token, checking four.meme...`);
      const fourMemeWebsite = await getWebsiteFromFourMeme(trimmedAddress);
      if (fourMemeWebsite) {
        console.log(`[ScanStream] ✅ Found website from four.meme: ${fourMemeWebsite}`);
        if (!socials) {
          socials = { website: null, x: null, telegram: null };
        }
        socials.website = fourMemeWebsite;
      } else {
        console.log(`[ScanStream] No website found on four.meme either`);
      }
    }
    
    // Console log the final website URL
    if (socials?.website) {
      console.log(`[ScanStream] 🌐 FINAL WEBSITE URL: ${socials.website}`);
    } else {
      console.log(`[ScanStream] 🌐 No website URL found for this token`);
    }
    
    // Build initial token data
    const tokenData = {
      contractAddress: trimmedAddress,
      blockchain, // Include blockchain
      tokenName: dex?.tokenName || fundamentals?.tokenName || "Unknown Token",
      symbol: symbol,
      socials: socials,
      marketData: {
        price: dex?.priceUsd || null,
        volume24h: dex?.volume24h || null,
        liquidity: dex?.liquidity || null,
        priceChange24h: dex?.priceChange24h || null,
        dexUrl: dex?.dexUrl || null,
        marketCap: marketCap,
      },
      fundamentals: {
        ...fundamentals,
        holderCount: holderCount,
      },
      securityData: rug,
    };

    // Don't calculate score yet - wait for sentiment
    tokenData.sentimentScore = null; // Will be updated after tweets
    tokenData.tokenScore = null; // Will be calculated after sentiment

    // Send initial data (without score - it will be sent later)
    sendEvent("tokenInfo", {
      contractAddress: trimmedAddress,
      tokenName: tokenData.tokenName,
      symbol: tokenData.symbol,
      tokenScore: null, // Score not ready yet
    });
    sendEvent("marketData", tokenData.marketData);
    sendEvent("securityData", tokenData.securityData);
    sendEvent("fundamentals", tokenData.fundamentals);
    sendEvent("socials", tokenData.socials);

    // Phase 2: Fetch social data (tweets and website)
    sendEvent("status", { message: "Fetching social data...", phase: 3 });
    
    const [twitterDataResult, tickerTweetsResult, websiteDataResult] = await Promise.allSettled([
      tokenData.socials?.x ? getTwitterFromNitter(tokenData.socials.x) : Promise.resolve(null),
      searchNitterForTicker(symbol),
      tokenData.socials?.website ? scrapeWebsite(tokenData.socials.website) : Promise.resolve(null),
    ]);

    const twitterData = twitterDataResult.status === "fulfilled" ? twitterDataResult.value : null;
    const tickerTweets = tickerTweetsResult.status === "fulfilled" ? tickerTweetsResult.value : null;
    const websiteData = websiteDataResult.status === "fulfilled" ? websiteDataResult.value : null;

    tokenData.twitterData = twitterData;
    tokenData.tickerTweets = tickerTweets;
    tokenData.websiteData = websiteData;

    // Update sentiment with tweet data
    tokenData.sentimentScore = computeMarketSentiment(null, dex, tickerTweets, twitterData) || 50;
    
    // Ensure tokenData has all fields needed for scoring
    tokenData.websiteData = websiteData;
    tokenData.tokenName = tokenData.tokenName || dex?.name || null;
    tokenData.symbol = tokenData.symbol || symbol || null;
    
    // Now calculate the final score with all data including sentiment
    tokenData.tokenScore = calculateTokenScore(tokenData);

    // Send social data
    if (twitterData) sendEvent("twitterData", twitterData);
    if (tickerTweets) sendEvent("tickerTweets", tickerTweets);
    sendEvent("sentimentScore", { sentimentScore: tokenData.sentimentScore });
    sendEvent("tokenScore", { tokenScore: tokenData.tokenScore });

    // Phase 3: Extract narrative and generate fundamentals in parallel (fundamentals doesn't need narrative)
    sendEvent("status", { message: "Extracting narrative and generating analysis...", phase: 4 });
    
    const narrativePromise = extractNarrative(tokenData, tickerTweets, twitterData).then(narrativeClaim => {
      sendEvent("narrative", { narrativeClaim });
      return narrativeClaim;
    });

    const fundamentalsPromise = generateFundamentals({ tokenData }).then(fundamentalsAnalysis => {
      sendEvent("fundamentalsAnalysis", { fundamentalsAnalysis });
      return fundamentalsAnalysis;
    });

    // Wait for narrative before starting summary/hype (they need narrative)
    const narrativeClaim = await narrativePromise;
    await fundamentalsPromise; // Wait for fundamentals to complete

    // Phase 4: Generate remaining AI analysis (stream as they complete)
    sendEvent("status", { message: "Generating AI analysis...", phase: 5 });
    
    const summaryPromise = generateSummary({ tokenData, narrativeClaim }).then(summary => {
      sendEvent("summary", { summary });
      return summary;
    });

    const hypePromise = generateHype({ tokenData, narrativeClaim }).then(hypeAnalysis => {
      sendEvent("hypeAnalysis", { hypeAnalysis });
      return hypeAnalysis;
    });

    await Promise.all([summaryPromise, hypePromise]);

    // Complete
    sendEvent("complete", { 
      message: "Analysis complete",
      tokenScore: tokenData.tokenScore,
    });
    
    res.end();

  } catch (error) {
    console.error("Stream error:", error);
    sendEvent("error", { message: error.message || "Analysis failed" });
    res.end();
  }
}
