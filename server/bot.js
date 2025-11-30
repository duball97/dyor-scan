// server/bot.js
import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { performFullScan } from './scan.js';

// Initialize bot with token from environment
const bot = new TelegramBot(process.env.TELEGRAM_BOT_KEY, { polling: true });

// Store user states (for tracking conversations)
const userStates = new Map();

// Helper: Format number with commas (returns null if invalid)
function formatNumber(num) {
  if (!num && num !== 0) return null;
  return num.toLocaleString('en-US');
}

// Helper: Format price (returns null if invalid)
function formatPrice(price) {
  if (!price) return null;
  const numPrice = parseFloat(price);
  if (isNaN(numPrice)) return null;
  if (numPrice < 0.0001) {
    return `$${numPrice.toFixed(8)}`;
  } else if (numPrice < 1) {
    return `$${numPrice.toFixed(6)}`;
  } else if (numPrice < 1000) {
    return `$${numPrice.toFixed(4)}`;
  } else {
    return `$${numPrice.toFixed(2)}`;
  }
}

// Helper: Format scan result for Telegram
function formatScanResult(result) {
  // Extract nested properties safely
  const tokenName = result.tokenName;
  const symbol = result.symbol;
  const contractAddress = result.contractAddress;
  
  // Market data is nested
  const marketData = result.marketData || {};
  const priceUsd = marketData.priceUsd || marketData.price;
  const liquidity = marketData.liquidity;
  const volume24h = marketData.volume24h;
  const priceChange24h = marketData.priceChange24h;
  const marketCap = marketData.marketCap;
  
  // Fundamentals data
  const fundamentals = result.fundamentals || {};
  const holders = fundamentals.holderCount || fundamentals.holders;
  
  // Scores
  const score = result.tokenScore;
  const sentiment = result.sentimentScore;
  const verdict = result.verdict;
  
  // Analysis sections
  const summary = result.summary;
  const narrativeClaim = result.narrativeClaim;
  const fundamentalsAnalysis = result.fundamentalsAnalysis;
  const hypeAnalysis = result.hypeAnalysis;
  
  // Tweets
  const tickerTweets = result.tickerTweets;
  
  // Social links
  const socials = result.socials || {};
  
  // Risks
  const risks = result.redFlags || [];

  // Build message with Telegram markdown formatting
  let message = `🔍 *DYOR Token Analysis*\n\n`;
  
  // Token Info
  message += `📊 *Token: ${tokenName || 'Unknown'} (${symbol || '???'})*\n`;
  if (contractAddress) {
    message += `📝 Contract: \`${contractAddress}\`\n`;
  }
  message += `\n`;
  
  // Scores
  message += `⚡ *Overall Score: ${score || 0}/100*\n`;
  message += `💭 *Sentiment: ${sentiment || 0}/100*\n`;
  
  // Only show verdict if it's not UNVERIFIED
  if (verdict && verdict !== 'UNVERIFIED' && verdict !== 'Unknown') {
    message += `🎯 *Verdict: ${verdict}*\n`;
  }
  message += `\n`;
  
  // Market Data (compact format)
  const marketDataItems = [];
  
  const priceText = formatPrice(priceUsd);
  if (priceText) {
    marketDataItems.push(`Price: ${priceText}`);
  }
  
  // Safe price change formatting
  if (priceChange24h !== null && priceChange24h !== undefined && typeof priceChange24h === 'number') {
    const priceChangeText = (priceChange24h > 0 ? '+' : '') + priceChange24h.toFixed(2) + '%';
    marketDataItems.push(`24h: ${priceChangeText}`);
  }
  
  if (liquidity) {
    const liqValue = liquidity >= 1000000 
      ? `$${(liquidity / 1000000).toFixed(2)}M`
      : `$${(liquidity / 1000).toFixed(2)}K`;
    marketDataItems.push(`Liq: ${liqValue}`);
  }
  
  if (volume24h) {
    const volValue = volume24h >= 1000000 
      ? `$${(volume24h / 1000000).toFixed(2)}M`
      : `$${(volume24h / 1000).toFixed(2)}K`;
    marketDataItems.push(`Vol: ${volValue}`);
  }
  
  const holdersFormatted = formatNumber(holders);
  if (holdersFormatted) {
    marketDataItems.push(`Holders: ${holdersFormatted}`);
  }
  
  if (marketDataItems.length > 0) {
    message += `📈 *${marketDataItems.join(' • ')}*\n\n`;
  }
  
  // Narrative (truncate if too long)
  if (narrativeClaim) {
    const maxNarrativeLength = 150;
    const narrative = narrativeClaim.length > maxNarrativeLength 
      ? narrativeClaim.substring(0, maxNarrativeLength) + '...'
      : narrativeClaim;
    message += `🎭 *Narrative*\n${narrative}\n\n`;
  }
  
  // Tweets about the token - only show clickable links
  if (tickerTweets && tickerTweets.tweets && tickerTweets.tweets.length > 0) {
    message += `🐦 *Top X Posts*\n\n`;
    tickerTweets.tweets.slice(0, 5).forEach((tweet) => {
      if (tweet.tweetUrl) {
        message += `${tweet.tweetUrl}\n`;
      }
    });
    message += `\n`;
  }
  
  // Risks (limit to top 3, truncate if too long)
  if (risks && risks.length > 0) {
    message += `⚠️ *Risk Flags*\n`;
    risks.slice(0, 3).forEach(risk => {
      const maxRiskLength = 80;
      const riskText = risk.length > maxRiskLength 
        ? risk.substring(0, maxRiskLength) + '...'
        : risk;
      message += `• ${riskText}\n`;
    });
    if (risks.length > 3) {
      message += `• ...and ${risks.length - 3} more\n`;
    }
    message += `\n`;
  }

  // Social Links
  const socialLinks = [];
  if (socials.website) {
    socialLinks.push(`🌐 [Website](${socials.website})`);
  }
  if (socials.x) {
    socialLinks.push(`𝕏 [Twitter/X](${socials.x})`);
  }
  if (socials.telegram) {
    socialLinks.push(`📱 [Telegram](${socials.telegram})`);
  }
  
  if (socialLinks.length > 0) {
    message += `🔗 *Links*\n${socialLinks.join(' • ')}\n\n`;
  }

  message += `🔗 View full report: https://dyorscan.io\n`;
  message += `📱 Scan more tokens: Send another contract address`;
  
  return message;
}

// Helper: Validate Solana address
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

// Helper: Validate Solana address format
function validateSolanaAddress(address) {
  if (!address || typeof address !== "string") return false;
  const trimmed = address.trim();
  // Solana addresses are base58 encoded and typically 32-44 characters
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(trimmed);
}

// Helper: Validate BNB/BSC address format
function validateBNBAddress(address) {
  if (!address || typeof address !== "string") return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

// Helper: Validate any supported blockchain address
function validateAddress(address) {
  return validateSolanaAddress(address) || validateBNBAddress(address);
}

// Command: /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'there';
  
  const welcomeMessage = `
👋 Welcome to *DYOR Scanner Bot*, ${firstName}!

I analyze Solana and BNB tokens to help you make informed decisions.

🔍 *How it works:*
1. Send me a Solana or BNB contract address
2. I'll automatically detect the blockchain
3. Analyze the token's security, fundamentals, and hype
4. Get a detailed report in seconds

📝 *Just paste a contract address to get started!*

Examples:
• Solana: \`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\`
• BNB: \`0x2170Ed0880ac9A755fd29B2688956BD959F933F8\`

⚡ Powered by AI • Real-time data • Professional analysis
  `.trim();
  
  bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

// Command: /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  
  const helpMessage = `
📖 *DYOR Scanner Bot Help*

*Commands:*
/start - Start the bot and see welcome message
/help - Show this help message
/about - Learn more about DYOR Scanner

*How to use:*
Simply send any Solana or BNB contract address and I'll automatically detect the blockchain and analyze it for you!

*What we analyze:*
• Security (mint/freeze authority, red flags)
• Fundamentals (liquidity, holders, volume)
• Market sentiment and hype
• Social presence (Twitter, Telegram, Website)
• AI-powered narrative verification

*Example contracts:*
• Solana: \`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\`
• BNB: \`0x2170Ed0880ac9A755fd29B2688956BD959F933F8\`

Need help? Contact: @dyorscan
  `.trim();
  
  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

// Command: /about
bot.onText(/\/about/, (msg) => {
  const chatId = msg.chat.id;
  
  const aboutMessage = `
ℹ️ *About DYOR Scanner*

DYOR (Do Your Own Research) Scanner is an AI-powered tool for analyzing Solana and BNB tokens.

*Features:*
✅ Real-time market data
✅ Security risk assessment
✅ AI narrative verification
✅ Social sentiment analysis
✅ Professional scoring system
✅ Multi-chain support (Solana & BNB)

*Data Sources:*
• DexScreener - Market data (Solana & BNB)
• RugCheck - Security analysis (Solana)
• BSCScan - BNB on-chain data
• Helius - Solana on-chain data
• Social media - Community sentiment
• GPT-4 - Intelligent analysis

🌐 Website: https://dyorscan.io
🐦 Twitter: https://x.com/dyorscan
📧 API Access: Available on our website

*Disclaimer:*
This tool is for informational purposes only. Always do your own research and never invest more than you can afford to lose.
  `.trim();
  
  bot.sendMessage(chatId, aboutMessage, { parse_mode: 'Markdown', disable_web_page_preview: true });
});

// Handle text messages (contract addresses)
bot.on('message', async (msg) => {
  // Skip if it's a command
  if (msg.text && msg.text.startsWith('/')) {
    return;
  }
  
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  
  if (!text) {
    return;
  }
  
  // Check if it looks like a valid address (Solana or BNB)
  if (!validateAddress(text)) {
    bot.sendMessage(
      chatId,
      `❌ Invalid contract address format.

Please send a valid contract address:
• Solana: 32-44 characters, base58 encoded (e.g., \`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\`)
• BNB/BSC: 0x followed by 40 hex characters (e.g., \`0x2170Ed0880ac9A755fd29B2688956BD959F933F8\`)`,
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
    return;
  }
  
  // Send "analyzing" message
  const analyzingMsg = await bot.sendMessage(
    chatId,
    `🔍 Analyzing token...\n\nContract: \`${text}\`\n\nThis may take 10-15 seconds...`,
    { parse_mode: 'Markdown', disable_web_page_preview: true }
  );
  
  try {
    console.log(`[Telegram Bot] Scanning contract: ${text} for user ${chatId}`);
    
    // Call the full scan function (includes AI analysis)
    const result = await performFullScan(text);
    
    if (!result || result.error) {
      throw new Error(result?.error || 'Analysis failed');
    }
    
    // Format and send result
    const formattedResult = formatScanResult(result);
    
    // Delete "analyzing" message
    await bot.deleteMessage(chatId, analyzingMsg.message_id);
    
    // Send result (split if too long)
    if (formattedResult.length > 4096) {
      // Telegram message limit is 4096 characters
      const parts = formattedResult.match(/[\s\S]{1,4000}/g) || [];
      for (const part of parts) {
        await bot.sendMessage(chatId, part, { parse_mode: 'Markdown', disable_web_page_preview: true });
      }
    } else {
      await bot.sendMessage(chatId, formattedResult, { parse_mode: 'Markdown', disable_web_page_preview: true });
    }
    
    // Detect blockchain for DexScreener URL
    const blockchain = detectBlockchain(text);
    const chainParam = blockchain === "bnb" ? "bsc" : "solana";
    
    // Add inline keyboard with actions
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔗 View on DexScreener', url: `https://dexscreener.com/${chainParam}/${text}` },
        ],
        [
          { text: '🔍 Scan Another Token', callback_data: 'scan_another' },
          { text: '📊 View on Website', url: 'https://dyorscan.io' },
        ],
      ],
    };
    
    await bot.sendMessage(
      chatId,
      '👆 Quick Actions:',
      { reply_markup: keyboard, disable_web_page_preview: true }
    );
    
    console.log(`[Telegram Bot] ✅ Scan completed for user ${chatId}`);
    
  } catch (error) {
    console.error(`[Telegram Bot] Error scanning token:`, error);
    
    // Delete "analyzing" message
    try {
      await bot.deleteMessage(chatId, analyzingMsg.message_id);
    } catch (e) {
      // Ignore if already deleted
    }
    
    // Send error message
    bot.sendMessage(
      chatId,
      `❌ *Analysis Failed*

${error.message || 'Something went wrong. Please try again or contact support.'}

Common issues:
• Token might be too new or have no trading data
• Invalid contract address
• Temporary API issues

Try again or send /help for more information.`,
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
  }
});

// Handle callback queries (inline button clicks)
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  
  if (query.data === 'scan_another') {
    bot.answerCallbackQuery(query.id);
    bot.sendMessage(
      chatId,
      '📝 Send me another Solana or BNB contract address to analyze!',
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    );
  }
});

// Error handling
bot.on('polling_error', (error) => {
  console.error('[Telegram Bot] Polling error:', error);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[Telegram Bot] Shutting down gracefully...');
  bot.stopPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[Telegram Bot] Shutting down gracefully...');
  bot.stopPolling();
  process.exit(0);
});

console.log('🤖 DYOR Scanner Telegram Bot is running...');
console.log('📱 Waiting for messages...');

