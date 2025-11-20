// Script to generate API keys for external users
// Usage: node scripts/generate-api-key.js "Key Name" "user@example.com" "starter"

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const tiers = {
  free: { perMinute: 10, perDay: 100 },
  starter: { perMinute: 30, perDay: 1000 },
  pro: { perMinute: 100, perDay: 10000 },
  enterprise: { perMinute: 500, perDay: 100000 }
};

async function generateApiKey(keyName, userEmail, tier = 'free') {
  if (!keyName) {
    console.error('Error: Key name is required');
    console.log('Usage: node scripts/generate-api-key.js "Key Name" "user@example.com" "starter"');
    process.exit(1);
  }

  if (!Object.keys(tiers).includes(tier)) {
    console.error(`Error: Invalid tier. Must be one of: ${Object.keys(tiers).join(', ')}`);
    process.exit(1);
  }

  // Generate a secure API key
  const apiKey = `dyor_${crypto.randomBytes(32).toString('hex')}`;
  
  const rateLimits = tiers[tier];
  
  console.log('\nGenerating API key...');
  console.log(`Key Name: ${keyName}`);
  console.log(`User Email: ${userEmail || 'N/A'}`);
  console.log(`Tier: ${tier}`);
  console.log(`Rate Limits: ${rateLimits.perMinute}/min, ${rateLimits.perDay}/day\n`);
  
  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      api_key: apiKey,
      key_name: keyName,
      user_email: userEmail || null,
      tier: tier,
      rate_limit_per_minute: rateLimits.perMinute,
      rate_limit_per_day: rateLimits.perDay
    })
    .select()
    .single();
  
  if (error) {
    console.error('Error creating API key:', error);
    process.exit(1);
  }
  
  console.log('✅ API Key created successfully!\n');
  console.log('='.repeat(60));
  console.log('API KEY (save this securely - it cannot be retrieved):');
  console.log(apiKey);
  console.log('='.repeat(60));
  console.log('\nTier:', tier);
  console.log('Rate Limits:', rateLimits);
  console.log('Created at:', new Date().toISOString());
  console.log('\n⚠️  IMPORTANT: Store this key securely. It will not be shown again.\n');
  
  return apiKey;
}

// Get arguments from command line
const args = process.argv.slice(2);
const keyName = args[0];
const userEmail = args[1] || null;
const tier = args[2] || 'free';

generateApiKey(keyName, userEmail, tier)
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });

