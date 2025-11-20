# API Distribution Guide

This guide explains how external platforms and users can integrate DYOR Scanner into their applications.

## Overview

The DYOR Scanner API allows third-party platforms to analyze Solana tokens programmatically. Simply make HTTP requests to our API endpoint - no database setup or infrastructure required on your end.

## Quick Start

### Basic Usage (No API Key Required)

You can use the API without an API key for testing and low-volume usage:

```javascript
const response = await fetch('https://your-domain.com/api/scan', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    contractAddress: 'So11111111111111111111111111111111111111112'
  })
});

const result = await response.json();
console.log(result.verdict); // CONFIRMED, PARTIAL, or UNVERIFIED
```

### With API Key (Recommended)

For production use and higher rate limits, get an API key from us:

```javascript
const response = await fetch('https://your-domain.com/api/scan', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer dyor_your_api_key_here'
  },
  body: JSON.stringify({
    contractAddress: 'So11111111111111111111111111111111111111112'
  })
});

const result = await response.json();
console.log(result.verdict);
```

## API Endpoint

### POST /api/scan

Analyze a Solana token contract address.

**Headers:**
- `Content-Type: application/json` (required)
- `Authorization: Bearer {api_key}` (optional, recommended for production)

**Request Body:**
```json
{
  "contractAddress": "string (required)",
  "forceRefresh": boolean (optional, default: false)
}
```

**Response:**
```json
{
  "cached": false,
  "contractAddress": "string",
  "tokenName": "string",
  "symbol": "string",
  "narrativeClaim": "string",
  "entities": {
    "organizations": ["string"],
    "products": ["string"],
    "topics": ["string"]
  },
  "verdict": "CONFIRMED | PARTIAL | UNVERIFIED",
  "confidence": "high | medium | low",
  "tokenScore": 75,
  "sentimentScore": 65,
  "marketData": {
    "price": "0.000123",
    "liquidity": 500000,
    "volume24h": 100000,
    "priceChange24h": 5.2
  },
  "securityData": {
    "risks": []
  },
  "socials": {
    "website": "https://...",
    "x": "https://...",
    "telegram": "https://..."
  },
  "summary": "Bullet point summary...",
  "fundamentalsAnalysis": "...",
  "hypeAnalysis": "...",
  "notesForUser": "..."
}
```

**Rate Limit Headers (when using API key):**
```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 29
X-RateLimit-Reset: 1704067200
```

## Usage Examples

### JavaScript/Node.js

```javascript
async function scanToken(contractAddress, apiKey = null) {
  const headers = {
    'Content-Type': 'application/json'
  };
  
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  
  const response = await fetch('https://your-domain.com/api/scan', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      contractAddress: contractAddress
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'API request failed');
  }
  
  return await response.json();
}

// Usage
const result = await scanToken(
  'So11111111111111111111111111111111111111112',
  'dyor_your_api_key_here' // optional
);
console.log(result.verdict);
```

### Python

```python
import requests

def scan_token(contract_address, api_key=None):
    url = 'https://your-domain.com/api/scan'
    headers = {
        'Content-Type': 'application/json'
    }
    
    if api_key:
        headers['Authorization'] = f'Bearer {api_key}'
    
    data = {
        'contractAddress': contract_address
    }
    
    response = requests.post(url, json=data, headers=headers)
    response.raise_for_status()
    
    return response.json()

# Usage
result = scan_token(
    'So11111111111111111111111111111111111111112',
    'dyor_your_api_key_here'  # optional
)
print(result['verdict'])
```

### cURL

```bash
# Without API key
curl -X POST https://your-domain.com/api/scan \
  -H "Content-Type: application/json" \
  -d '{
    "contractAddress": "So11111111111111111111111111111111111111112"
  }'

# With API key
curl -X POST https://your-domain.com/api/scan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dyor_your_api_key_here" \
  -d '{
    "contractAddress": "So11111111111111111111111111111111111111112"
  }'
```

## Rate Limits

### Without API Key (Public Access)
- 10 requests per minute
- 100 requests per day per IP address

### With API Key
Rate limits depend on your tier:
- **Free**: 10 requests/minute, 100 requests/day
- **Starter**: 30 requests/minute, 1,000 requests/day
- **Pro**: 100 requests/minute, 10,000 requests/day
- **Enterprise**: Custom limits

When rate limits are exceeded, you'll receive a `429 Too Many Requests` response:

```json
{
  "error": "Rate limit exceeded",
  "message": "You have exceeded your rate limit of 10 requests per minute",
  "retryAfter": 60
}
```

## Error Handling

### 400 Bad Request
```json
{
  "error": "Invalid Solana address format",
  "message": "Contract address must be a valid Solana address"
}
```

### 401 Unauthorized
```json
{
  "error": "Unauthorized",
  "message": "Invalid API key"
}
```

### 429 Too Many Requests
```json
{
  "error": "Rate limit exceeded",
  "message": "You have exceeded your rate limit",
  "retryAfter": 60
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "message": "An error occurred while processing your request"
}
```

## Getting an API Key

To get an API key for production use:

1. Contact us at api@dyorscanner.com
2. Provide:
   - Your use case
   - Expected request volume
   - Your application name
3. We'll provide you with an API key and appropriate rate limits

## Understanding Verdicts

### CONFIRMED
The narrative references real, verifiable events or products. **Note**: This does NOT mean the token is safe or officially affiliated.

### PARTIAL
The narrative mixes truth with hype. Real events may be referenced, but claims are exaggerated.

### UNVERIFIED
The narrative's claims cannot be verified. Exercise extreme caution.

## Best Practices

1. **Cache results**: Token analysis results are cached. Use `forceRefresh: true` only when needed.

2. **Handle errors gracefully**: Implement retry logic with exponential backoff for rate limit errors.

3. **Store API keys securely**: Never expose API keys in client-side code or public repositories.

4. **Monitor rate limits**: Check the `X-RateLimit-Remaining` header to avoid hitting limits.

5. **Use HTTPS**: Always use HTTPS for API requests.

## Support

- **Email**: api@dyorscanner.com
- **Documentation**: https://docs.dyorscanner.com
- **Issues**: Open an issue on GitHub

---

**No setup required** - just make HTTP requests and get results. Simple as that.
