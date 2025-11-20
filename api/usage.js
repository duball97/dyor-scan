// GET /api/usage - Get usage statistics for API key
import { extractApiKey, validateApiKey, getUsageStats } from './utils/apiAuth.js';

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      error: "Method not allowed",
      message: "Only GET requests are supported",
    });
  }

  try {
    // Extract and validate API key
    const apiKey = extractApiKey(req);
    const validation = await validateApiKey(apiKey);
    
    if (!validation.valid) {
      return res.status(401).json({
        error: "Unauthorized",
        message: validation.error || "Invalid or missing API key"
      });
    }

    const { keyData } = validation;
    const usage = await getUsageStats(keyData.id);
    
    // Calculate reset times
    const now = new Date();
    const resetAt = new Date(now.setHours(24, 0, 0, 0));
    
    return res.status(200).json({
      tier: keyData.tier,
      usage: {
        today: usage.today,
        thisMonth: usage.thisMonth,
        limit: {
          perMinute: keyData.rateLimitPerMinute,
          perDay: keyData.rateLimitPerDay
        }
      },
      resetAt: resetAt.toISOString()
    });
  } catch (err) {
    console.error('[Usage API] Error:', err);
    return res.status(500).json({
      error: "Internal server error",
      message: "Failed to retrieve usage statistics"
    });
  }
}

