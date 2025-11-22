# Nitter Scraper Setup Guide

This guide explains how the ScrapingBee-based Nitter scraper works for searching tweets.

## Overview

The scraper uses ScrapingBee API to:
- Search Nitter for tweets mentioning your token (e.g., `$PEPE`)
- Extract tweet data (text, author, engagement metrics, URLs)
- **No login required** - Nitter is a public Twitter frontend
- **Uses ScrapingBee** - Handles proxies, JavaScript rendering, and anti-bot measures

## How It Works

### Search URL Format

The scraper searches using Nitter's search endpoint:
```
https://nitter.net/search?f=tweets&q=$PEPE
```

Where:
- `f=tweets` filters to show only tweets
- `q=$PEPE` is the search query (token symbol with $ prefix)

### Multiple Mirror Support

The scraper tries multiple Nitter mirrors in order:
1. `https://nitter.net` (primary)
2. `https://nitter.privacydev.net` (fallback)
3. `https://nitter.poast.org` (fallback)

If one mirror is down or rate-limited, it automatically tries the next.

### Extracted Data

For each tweet, the scraper extracts:
- **Text**: Tweet content
- **Author**: Display name and username
- **Date**: Timestamp and relative time
- **Engagement**: Replies, retweets, likes
- **URL**: Direct link to the tweet on X.com (converted from Nitter URL)
- **Tweet ID**: Unique identifier

## Setup

### Prerequisites

1. **ScrapingBee API Key**: Get one from [scrapingbee.com](https://www.scrapingbee.com/)
2. **Environment Variable**: Add to your `.env` file:
   ```env
   SCRAPINGBEE_KEY=your_scrapingbee_api_key_here
   ```

### Installation

No additional packages needed - the scraper uses:
- `cheerio` (already installed)
- `fetch` (built-in Node.js)
- ScrapingBee API (external service)

## Usage

The scraper is automatically called by `scan.js` when:
- A token has a symbol or name
- Social data fetching is triggered
- It runs in parallel with other scrapers

### Example

When scanning a token with symbol "PEPE":
1. Scraper searches: `https://nitter.net/search?f=tweets&q=$PEPE`
2. Extracts up to 5 most relevant tweets
3. Returns formatted data compatible with existing code

## Troubleshooting

### "SCRAPINGBEE_KEY not set"

**Problem**: Environment variable is missing.

**Solution**:
1. Get API key from [scrapingbee.com](https://www.scrapingbee.com/)
2. Add to `.env` file: `SCRAPINGBEE_KEY=your_key_here`
3. Restart your application

### "All mirrors failed"

**Problem**: All Nitter mirrors are down or rate-limited.

**Solution**:
- Wait a few minutes and try again
- Nitter mirrors can be unstable
- The scraper will automatically retry on next scan

### "ScrapingBee API error"

**Problem**: API request failed.

**Possible causes**:
- Invalid API key
- Exceeded quota/credits
- Network issues

**Solution**:
- Check your ScrapingBee dashboard for quota
- Verify API key is correct
- Check ScrapingBee status page

### "No tweets found"

**Possible causes**:
1. Token symbol/name doesn't exist or is too new
2. Search query is invalid
3. Nitter changed their HTML structure (scraper needs update)

**Check**:
- Verify the token has a Twitter presence
- Check logs for the actual search query used
- Try searching manually on Nitter with the same query

### Rate Limiting

**Problem**: Nitter mirror returns "rate limit" or "Too many requests".

**Solution**:
- The scraper automatically tries the next mirror
- Wait a few minutes between scans
- Nitter has rate limits to prevent abuse

## Performance

- **Average time**: ~3-8 seconds per search (faster than Puppeteer)
- **No browser overhead**: Uses API instead of launching browser
- **Mirror fallback**: Adds ~2-3 seconds per failed mirror
- **ScrapingBee**: Handles JavaScript rendering and proxies automatically

## File Structure

```
server/
├── twitterScraper.js      # Main scraper logic (uses Nitter)
└── TWITTER_SCRAPER_SETUP.md  # This file
```

## Advantages

✅ **No login required** - Public access, no cookies needed  
✅ **No rate limits from X.com** - Uses Nitter's public API  
✅ **Privacy-friendly** - Doesn't require X.com account  
✅ **Multiple mirrors** - Automatic fallback if one is down  
✅ **ScrapingBee API** - Handles proxies, JavaScript, and anti-bot measures  
✅ **Faster** - No browser overhead, direct API calls  
✅ **Reliable** - ScrapingBee handles retries and errors  

## Limitations

⚠️ **Nitter mirrors can be unstable** - May go down temporarily  
⚠️ **Rate limiting** - Nitter mirrors have their own rate limits  
⚠️ **HTML structure changes** - If Nitter updates, scraper may need updates  
⚠️ **ScrapingBee costs** - API usage costs money (check ScrapingBee pricing)  

## Integration

The scraper is automatically called by `scan.js`:

```javascript
import { searchTokenOnTwitter } from "./twitterScraper.js";

// In getTokenData function:
const twitterSearchResult = await searchTokenOnTwitter(symbol, tokenName);
```

Results are stored in `tickerTweets` and included in the scan result.

## Customization

### Change Max Results

Default is 5 tweets. Change in `searchTokenOnTwitter()` call:

```javascript
// In twitterScraper.js, modify scrapeTwitterSearch call:
scrapeTwitterSearch(searchQuery, 10) // Get 10 tweets
```

### Add More Mirrors

Add to `NITTER_MIRRORS` array in `twitterScraper.js`:

```javascript
const NITTER_MIRRORS = [
  'https://nitter.net',
  'https://nitter.privacydev.net',
  'https://nitter.poast.org',
  'https://your-mirror.com', // Add more
];
```

### Adjust Timeouts

In `twitterScraper.js`, modify:
- Page load timeout: `15000` (15 seconds) - line ~60
- Selector wait timeout: `8000` (8 seconds) - line ~70

## Support

If you encounter issues:
1. Check the logs for specific error messages
2. Verify Nitter mirrors are accessible
3. Try searching manually on Nitter with the same query
4. Check if Nitter changed their page structure

---

**Note**: This scraper uses Nitter, a public Twitter frontend. It respects Nitter's rate limits and terms of service.
