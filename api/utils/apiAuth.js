// API Authentication and Rate Limiting Utilities
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Extract API key from request
export function extractApiKey(req) {
  // Check Authorization header
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  
  // Check query parameter (less secure, for backwards compatibility)
  if (req.query && req.query.apiKey) {
    return req.query.apiKey;
  }
  
  return null;
}

// Validate API key and get key details
export async function validateApiKey(apiKey) {
  if (!apiKey) {
    return { valid: false, error: 'Missing API key' };
  }
  
  try {
    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .select('*')
      .eq('api_key', apiKey)
      .eq('is_active', true)
      .single();
    
    if (error || !data) {
      return { valid: false, error: 'Invalid API key' };
    }
    
    // Check if key is expired
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return { valid: false, error: 'API key has expired' };
    }
    
    return {
      valid: true,
      keyData: {
        id: data.id,
        tier: data.tier,
        rateLimitPerMinute: data.rate_limit_per_minute,
        rateLimitPerDay: data.rate_limit_per_day,
        keyName: data.key_name,
        userEmail: data.user_email
      }
    };
  } catch (err) {
    console.error('[API Auth] Error validating API key:', err);
    return { valid: false, error: 'Error validating API key' };
  }
}

// Check rate limits
export async function checkRateLimit(apiKeyId, rateLimitPerMinute, rateLimitPerDay) {
  const now = new Date();
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  try {
    // Check per-minute limit
    const { count: minuteCount } = await supabaseAdmin
      .from('api_usage')
      .select('*', { count: 'exact', head: true })
      .eq('api_key_id', apiKeyId)
      .gte('created_at', oneMinuteAgo.toISOString());
    
    if (minuteCount >= rateLimitPerMinute) {
      return {
        allowed: false,
        limit: 'minute',
        remaining: 0,
        resetAt: new Date(now.getTime() + 60 * 1000)
      };
    }
    
    // Check per-day limit
    const { count: dayCount } = await supabaseAdmin
      .from('api_usage')
      .select('*', { count: 'exact', head: true })
      .eq('api_key_id', apiKeyId)
      .gte('created_at', oneDayAgo.toISOString());
    
    if (dayCount >= rateLimitPerDay) {
      return {
        allowed: false,
        limit: 'day',
        remaining: 0,
        resetAt: new Date(now.setHours(24, 0, 0, 0))
      };
    }
    
    return {
      allowed: true,
      remaining: {
        perMinute: rateLimitPerMinute - minuteCount,
        perDay: rateLimitPerDay - dayCount
      },
      resetAt: {
        perMinute: new Date(now.getTime() + 60 * 1000),
        perDay: new Date(now.setHours(24, 0, 0, 0))
      }
    };
  } catch (err) {
    console.error('[API Auth] Error checking rate limit:', err);
    // On error, allow the request but log it
    return { allowed: true, error: true };
  }
}

// Track API usage
export async function trackUsage(apiKeyId, contractAddress, responseTime, cached = false) {
  try {
    await supabaseAdmin
      .from('api_usage')
      .insert({
        api_key_id: apiKeyId,
        contract_address: contractAddress,
        response_time_ms: responseTime,
        cached: cached
      });
    
    // Update last_used_at on api_keys table
    await supabaseAdmin
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', apiKeyId);
  } catch (err) {
    console.error('[API Auth] Error tracking usage:', err);
    // Don't throw - usage tracking failure shouldn't break the API
  }
}

// Get usage statistics
export async function getUsageStats(apiKeyId) {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  try {
    const { count: todayCount } = await supabaseAdmin
      .from('api_usage')
      .select('*', { count: 'exact', head: true })
      .eq('api_key_id', apiKeyId)
      .gte('created_at', oneDayAgo.toISOString());
    
    const { count: monthCount } = await supabaseAdmin
      .from('api_usage')
      .select('*', { count: 'exact', head: true })
      .eq('api_key_id', apiKeyId)
      .gte('created_at', oneMonthAgo.toISOString());
    
    return {
      today: todayCount || 0,
      thisMonth: monthCount || 0
    };
  } catch (err) {
    console.error('[API Auth] Error getting usage stats:', err);
    return { today: 0, thisMonth: 0 };
  }
}

