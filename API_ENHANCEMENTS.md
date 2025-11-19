# Scanner Enhancements - v2.0

## What's Been Added

### ✅ Enhanced AI Analysis
- **Deeper Narrative Extraction**: AI now identifies specific real-world events, companies, and products being referenced
- **Evidence-Based Classification**: Verdict system now includes confidence levels (high/medium/low)
- **Red Flags Detection**: Automatically identifies concerns and warnings for investors
- **Comprehensive Notes**: 150-200 word analysis instead of basic summary

### ✅ Removed
- Debug JSON section (cleaner UI)

### ✅ New UI Components
- **Confidence Indicator**: Visual display of analysis confidence (high/medium/low)
- **Red Flags Section**: Lists specific concerns if detected
- **Enhanced Reasoning**: More detailed explanations (3-4 sentences vs 1-2)

### ✅ Better Data Analysis
- **Market Context**: Now includes volume, price changes in summary
- **Social Validation**: Checks if socials exist and adds to summary
- **Security Integration**: RugCheck data integrated into narrative assessment

## What Needs API Keys (Placeholders Added)

### 🔧 Chain Insight API
**Function**: `getChainInsightData()`  
**Purpose**: Get enhanced token metadata and project descriptions  
**Status**: Placeholder - needs API key  
**Add to `.env`**: `CHAIN_INSIGHT_API_KEY=your_key_here`

### 🔧 Web Search API
**Function**: `searchWebForNarrative()`  
**Purpose**: Find articles verifying narratives (Bloomberg, press releases, etc.)  
**Options**:
- Brave Search API (recommended, free tier)
- Google Custom Search API
- Serper API

**Add to `.env`**: `BRAVE_SEARCH_API_KEY=your_key_here`

### 🔧 Twitter/X API
**Function**: `searchTwitterForLore()`  
**Purpose**: Find origin lore tweets and validation from official accounts  
**Status**: Placeholder - needs Twitter API v2 access  
**Add to `.env`**: `TWITTER_BEARER_TOKEN=your_token_here`

### 🔧 Social Scraping
**Function**: `scrapeTokenDescription()`  
**Purpose**: Get token description from website/Twitter bio  
**Options**:
- Puppeteer (requires server setup)
- Playwright
- Bright Data API

## How It Works Now

1. **Data Collection** (Working ✅)
   - DexScreener: Market data, socials, price
   - RugCheck: Security analysis
   - Chain Insight: (Placeholder) Enhanced metadata

2. **Narrative Extraction** (Enhanced ✅)
   - AI identifies core claim
   - Extracts entities (companies, products, people)
   - Detects topics and themes

3. **Evidence Gathering** (Placeholder 🔧)
   - Web search: Articles validating narrative
   - Twitter search: Lore tweets + official validation

4. **Classification** (Enhanced ✅)
   - CONFIRMED/PARTIAL/UNVERIFIED verdict
   - Confidence level (high/medium/low)
   - Red flags detection
   - Detailed reasoning (3-4 sentences)

5. **User Notes** (Enhanced ✅)
   - Comprehensive 150-200 word analysis
   - Covers: narrative, reality check, entities, implications, warnings

## Current Capabilities (No Extra APIs Needed)

The scanner ALREADY provides valuable analysis using:
- Real market data from DexScreener
- Security risks from RugCheck
- Advanced AI analysis with GPT-4
- Entity extraction
- Narrative classification
- Confidence scoring
- Red flags detection

## Next Steps to Add Full Features

### To Add Web Search:
```javascript
// api/scan.js - searchWebForNarrative()
async function searchWebForNarrative(narrativeClaim, entities) {
  const response = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(narrativeClaim)}`,
    {
      headers: {
        'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY
      }
    }
  );
  const data = await response.json();
  
  return {
    articles: data.web.results.slice(0, 5).map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.description,
      source: new URL(r.url).hostname
    })),
    searchPerformed: true,
  };
}
```

### To Add Twitter Search:
```javascript
// api/scan.js - searchTwitterForLore()
async function searchTwitterForLore(narrativeClaim, entities) {
  const query = `${entities.organizations?.[0] || ''} ${entities.products?.[0] || ''}`;
  
  const response = await fetch(
    `https://api.twitter.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=10`,
    {
      headers: {
        'Authorization': `Bearer ${process.env.TWITTER_BEARER_TOKEN}`
      }
    }
  );
  const data = await response.json();
  
  return {
    loreTweet: data.data?.[0] ? {
      url: `https://twitter.com/i/status/${data.data[0].id}`,
      text: data.data[0].text,
      author: data.includes?.users?.[0]?.username
    } : null,
    validationTweets: data.data?.slice(1, 4) || [],
  };
}
```

## Environment Variables Summary

```bash
# REQUIRED (Already in use)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=

# OPTIONAL (For enhanced features)
CHAIN_INSIGHT_API_KEY=       # Enhanced token metadata
BRAVE_SEARCH_API_KEY=        # Web article search
TWITTER_BEARER_TOKEN=        # Twitter lore tweet search
```

## Testing the Enhanced Scanner

Try scanning a token like BONK or any popular Solana token:
- You'll see **confidence levels** now
- **Red flags** if concerns are detected
- **Deeper reasoning** (3-4 sentences)
- **Comprehensive notes** (150-200 words)
- Better narrative extraction

The analysis is significantly more thorough even without the additional APIs!

