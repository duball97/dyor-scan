# API Distribution Guide

This guide explains how to distribute DYOR Scanner as an API for external platforms and users.

## Overview

The DYOR Scanner API allows third-party platforms to integrate token analysis capabilities into their own applications. The API includes:

- API key authentication
- Rate limiting per API key
- Usage tracking and analytics
- Webhook support (optional)
- Multiple pricing tiers

## Setup

### 1. Database Schema

Add these tables to your Supabase database:

```sql
-- API Keys table
create table public.api_keys (
  id bigint generated always as identity primary key,
  api_key text not null unique,
  key_name text not null,
  user_email text,
  tier text default 'free' check (tier in ('free', 'starter', 'pro', 'enterprise')),
  rate_limit_per_minute integer default 10,
  rate_limit_per_day integer default 100,
  is_active boolean default true,
  created_at timestamptz default now(),
  expires_at timestamptz,
  last_used_at timestamptz
);

create index api_keys_api_key_idx on public.api_keys (api_key);
create index api_keys_user_email_idx on public.api_keys (user_email);

-- Usage tracking table
create table public.api_usage (
  id bigint generated always as identity primary key,
  api_key_id bigint references public.api_keys(id),
  contract_address text,
  response_time_ms integer,
  cached boolean default false,
  created_at timestamptz default now()
);

create index api_usage_api_key_id_idx on public.api_usage (api_key_id);
create index api_usage_created_at_idx on public.api_usage (created_at);

-- Rate limit tracking (for in-memory or Redis alternative)
-- This can be handled in application code or with Supabase Realtime
```

### 2. Environment Variables

Add to your `.env.local`:

```env
# API Distribution
API_KEY_SECRET=your-secret-for-generating-api-keys
ENABLE_API_KEYS=true
DEFAULT_RATE_LIMIT_PER_MINUTE=10
DEFAULT_RATE_LIMIT_PER_DAY=100
```

### 3. API Key Generation

Create a utility script to generate API keys:

```javascript
// scripts/generate-api-key.js
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function generateApiKey(keyName, userEmail, tier = 'free') {
  // Generate a secure API key
  const apiKey = `dyor_${crypto.randomBytes(32).toString('hex')}`;
  
  // Determine rate limits based on tier
  const rateLimits = {
    free: { perMinute: 10, perDay: 100 },
    starter: { perMinute: 30, perDay: 1000 },
    pro: { perMinute: 100, perDay: 10000 },
    enterprise: { perMinute: 500, perDay: 100000 }
  };
  
  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      api_key: apiKey,
      key_name: keyName,
      user_email: userEmail,
      tier: tier,
      rate_limit_per_minute: rateLimits[tier].perMinute,
      rate_limit_per_day: rateLimits[tier].perDay
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating API key:', error);
    return null;
  }
  
  console.log('API Key created successfully:');
  console.log('Key:', apiKey);
  console.log('Tier:', tier);
  console.log('Rate Limits:', rateLimits[tier]);
  
  return apiKey;
}

// Usage
generateApiKey('My App', 'user@example.com', 'starter');
```

## API Authentication

### Request Format

All API requests must include an API key in the `Authorization` header:

```
Authorization: Bearer dyor_your_api_key_here
```

Or as a query parameter (less secure, not recommended):

```
GET /api/scan?apiKey=dyor_your_api_key_here
```

### Response Format

Success response (200):
```json
{
  "success": true,
  "data": {
    "cached": false,
    "contractAddress": "...",
    "tokenName": "...",
    "verdict": "CONFIRMED",
    ...
  },
  "usage": {
    "requestsRemaining": 95,
    "resetAt": "2024-01-01T00:00:00Z"
  }
}
```

Error response (401):
```json
{
  "error": "Unauthorized",
  "message": "Invalid or missing API key"
}
```

Error response (429):
```json
{
  "error": "Rate limit exceeded",
  "message": "You have exceeded your rate limit of 10 requests per minute",
  "retryAfter": 60
}
```

## Rate Limiting

Rate limits are enforced per API key:

- **Free Tier**: 10 requests/minute, 100 requests/day
- **Starter Tier**: 30 requests/minute, 1,000 requests/day
- **Pro Tier**: 100 requests/minute, 10,000 requests/day
- **Enterprise Tier**: 500 requests/minute, 100,000 requests/day

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 9
X-RateLimit-Reset: 1704067200
```

## Usage Examples

### JavaScript/Node.js

```javascript
async function scanToken(contractAddress, apiKey) {
  const response = await fetch('https://your-domain.com/api/scan', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      contractAddress: contractAddress
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  const data = await response.json();
  return data.data;
}

// Usage
const result = await scanToken(
  'So11111111111111111111111111111111111111112',
  'dyor_your_api_key_here'
);
console.log(result.verdict); // CONFIRMED, PARTIAL, or UNVERIFIED
```

### Python

```python
import requests

def scan_token(contract_address, api_key):
    url = 'https://your-domain.com/api/scan'
    headers = {
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {api_key}'
    }
    data = {
        'contractAddress': contract_address
    }
    
    response = requests.post(url, json=data, headers=headers)
    response.raise_for_status()
    
    result = response.json()
    return result['data']

# Usage
result = scan_token(
    'So11111111111111111111111111111111111111112',
    'dyor_your_api_key_here'
)
print(result['verdict'])
```

### cURL

```bash
curl -X POST https://your-domain.com/api/scan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dyor_your_api_key_here" \
  -d '{
    "contractAddress": "So11111111111111111111111111111111111111112"
  }'
```

## Webhooks (Optional)

You can configure webhooks to receive scan results asynchronously:

```javascript
// Request with webhook
{
  "contractAddress": "...",
  "webhookUrl": "https://your-app.com/webhook",
  "webhookSecret": "your-secret-for-verification"
}
```

The webhook will receive a POST request with the scan result.

## API Documentation

### Endpoint: POST /api/scan

Analyze a Solana token contract address.

**Headers:**
- `Authorization: Bearer {api_key}` (required)
- `Content-Type: application/json`

**Request Body:**
```json
{
  "contractAddress": "string (required)",
  "forceRefresh": boolean (optional, default: false),
  "webhookUrl": "string (optional)",
  "webhookSecret": "string (optional)"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "cached": boolean,
    "contractAddress": "string",
    "tokenName": "string",
    "symbol": "string",
    "narrativeClaim": "string",
    "verdict": "CONFIRMED | PARTIAL | UNVERIFIED",
    "confidence": "high | medium | low",
    "tokenScore": number,
    "marketData": { ... },
    "securityData": { ... },
    ...
  },
  "usage": {
    "requestsRemaining": number,
    "resetAt": "ISO 8601 timestamp"
  }
}
```

### Endpoint: GET /api/usage

Get usage statistics for your API key.

**Headers:**
- `Authorization: Bearer {api_key}` (required)

**Response:**
```json
{
  "tier": "free",
  "usage": {
    "today": 45,
    "thisMonth": 1200,
    "limit": {
      "perMinute": 10,
      "perDay": 100
    }
  },
  "resetAt": "2024-01-01T00:00:00Z"
}
```

## Pricing Tiers

### Free Tier
- 10 requests/minute
- 100 requests/day
- Basic support
- Public API access

### Starter Tier ($29/month)
- 30 requests/minute
- 1,000 requests/day
- Email support
- Usage analytics

### Pro Tier ($99/month)
- 100 requests/minute
- 10,000 requests/day
- Priority support
- Custom rate limits
- Webhook support

### Enterprise Tier (Custom)
- 500+ requests/minute
- 100,000+ requests/day
- Dedicated support
- SLA guarantee
- Custom integrations

## Security Best Practices

1. **Never expose API keys in client-side code**
2. **Use environment variables** to store API keys
3. **Rotate API keys** regularly
4. **Monitor usage** for suspicious activity
5. **Use HTTPS** for all API requests
6. **Implement IP whitelisting** for enterprise customers

## Support

For API support, email: api@dyorscanner.com

For documentation: https://docs.dyorscanner.com

