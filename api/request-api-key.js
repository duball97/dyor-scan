// POST /api/request-api-key - Generate a new API key
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const tiers = {
  free: { perMinute: 10, perDay: 100 },
  starter: { perMinute: 30, perDay: 1000 },
  pro: { perMinute: 100, perDay: 10000 },
  enterprise: { perMinute: 500, perDay: 100000 }
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Method not allowed",
      message: "Only POST requests are supported",
    });
  }

  try {
    const { keyName, userEmail, tier = 'free' } = req.body || {};

    // Validation
    if (!keyName || !userEmail) {
      return res.status(400).json({
        error: "Missing required fields",
        message: "keyName and userEmail are required",
      });
    }

    // Only allow free tier for now
    if (tier !== 'free') {
      return res.status(400).json({
        error: "Invalid tier",
        message: "Only free tier is currently available. Other tiers coming soon.",
      });
    }

    // Generate API key
    const apiKey = `dyor_${crypto.randomBytes(32).toString('hex')}`;
    const rateLimits = tiers[tier];

    // Insert into database
    const { data, error } = await supabaseAdmin
      .from('api_keys')
      .insert({
        api_key: apiKey,
        key_name: keyName,
        user_email: userEmail,
        tier: tier,
        rate_limit_per_minute: rateLimits.perMinute,
        rate_limit_per_day: rateLimits.perDay,
        is_active: true, // Free tier is always active
      })
      .select()
      .single();

    if (error) {
      console.error('[Request API Key] Database error:', error);
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to create API key",
      });
    }

    return res.status(200).json({
      success: true,
      apiKey: apiKey,
      tier: tier,
      rateLimits: rateLimits,
      message: "API key generated successfully",
    });
  } catch (err) {
    console.error('[Request API Key] Error:', err);
    return res.status(500).json({
      error: "Internal server error",
      message: "An error occurred while generating your API key",
    });
  }
}

