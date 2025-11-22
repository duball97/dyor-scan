// server/twitterScraper.js
import * as cheerio from 'cheerio';

// Nitter mirrors to try (in order of preference)
const NITTER_MIRRORS = [
  'https://nitter.net',
  'https://nitter.privacydev.net',
  'https://nitter.poast.org',
];

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
    throw new Error(`ScrapingBee API error: ${response.status} ${response.statusText}`);
  }

  return await response.text();
}

// Scrape Nitter search results using ScrapingBee
export async function scrapeTwitterSearch(query, maxResults = 5) {
  const startTime = Date.now();
  console.log(`[Nitter Scraper] Starting search for: "${query}"`);
  
  if (!query || typeof query !== 'string') {
    console.log('[Nitter Scraper] Invalid query provided');
    return null;
  }

  if (!SCRAPINGBEE_API_KEY) {
    console.error('[Nitter Scraper] ❌ SCRAPINGBEE_KEY not set in environment');
    return {
      tweets: [],
      query,
      ticker: query.replace('$', ''),
      tweetCount: 0,
    };
  }
  
  // Try each Nitter mirror until one works
  for (const mirror of NITTER_MIRRORS) {
    try {
      console.log(`[Nitter Scraper] Trying mirror: ${mirror}`);
      
      // Build Nitter search URL
      const searchUrl = `${mirror}/search?f=tweets&q=${encodeURIComponent(query)}`;
      console.log(`[Nitter Scraper] Fetching via ScrapingBee: ${searchUrl}`);
      
      // Fetch HTML using ScrapingBee
      const html = await fetchWithScrapingBee(searchUrl);
      
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
      
      tweetElements.slice(0, maxResults).each((i, el) => {
        const $tweet = $(el);
        
        // Extract tweet text
        const text = $tweet.find('.tweet-content').text().trim();
        
        // Extract author and username
        const authorElement = $tweet.find('.tweet-header a').first();
        const author = authorElement.text().trim();
        const usernameHref = authorElement.attr('href') || '';
        const username = usernameHref ? usernameHref.replace('/', '') : '';
        
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
              if (username) {
                tweetUrl = `https://x.com/${username}/status/${tweetId}`;
              } else {
                tweetUrl = href.startsWith('http') ? href : `https://x.com${href}`;
              }
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
            replies: parseInt(replies) || 0,
            retweets: parseInt(retweets) || 0,
            likes: parseInt(likes) || 0,
            tweetId,
            tweetUrl,
          });
        }
      });

      if (tweets.length === 0) {
        console.log(`[Nitter Scraper] ${mirror} returned 0 tweets`);
        continue; // Try next mirror
      }

      const duration = Date.now() - startTime;
      console.log(`[Nitter Scraper] ✅ Success via ${mirror}: Found ${tweets.length} tweets - ${duration}ms`);

      // Format to match expected structure
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

      const result = {
        tweets: formattedTweets,
        query,
        ticker: query.replace('$', ''), // Extract ticker from query
        tweetCount: formattedTweets.length,
      };
      
      return result;
      
    } catch (error) {
      console.log(`[Nitter Scraper] Error with ${mirror}: ${error.message}`);
      continue; // Try next mirror
    }
  }

  // All mirrors failed
  const duration = Date.now() - startTime;
  console.log(`[Nitter Scraper] ❌ All mirrors failed after ${duration}ms`);
  
  return {
    tweets: [],
    query,
    ticker: query.replace('$', ''),
    tweetCount: 0,
  };
}

// Helper function to search for token ticker/symbol
export async function searchTokenOnTwitter(tokenSymbol, tokenName = null) {
  if (!tokenSymbol && !tokenName) {
    return null;
  }
  
  // Search for token with $ symbol (e.g., "$PEPE")
  // Use symbol if available, otherwise fall back to token name
  const searchQuery = tokenSymbol && tokenSymbol !== "???" ? `$${tokenSymbol}` : (tokenName || "");
  
  if (!searchQuery) {
    console.log(`[Nitter Scraper] No valid search query (symbol or name required)`);
    return null;
  }
  
  console.log(`[Nitter Scraper] Searching for token: ${searchQuery}`);
  
  const result = await scrapeTwitterSearch(searchQuery, 5);
  
  // Return empty result if no tweets found to maintain compatibility
  if (!result || result.tweetCount === 0) {
    return {
      tweets: [],
      ticker: tokenSymbol,
      tweetCount: 0,
    };
  }
  
  return result;
}
