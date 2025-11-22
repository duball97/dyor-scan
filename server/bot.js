// server/bot.js
import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import { performFullScan } from './scan.js';

// Initialize bot with token from environment
const bot = new TelegramBot(process.env.TELEGRAM_BOT_KEY, { polling: true });

// Store user states (for tracking conversations)
const userStates = new Map();

// Helper: Format number with commas
function formatNumber(num) {
  if (!num && num !== 0) return 'N/A';
  return num.toLocaleString('en-US');
}

// Helper: Format price
function formatPrice(price) {
  if (!price) return "N/A";
  const numPrice = parseFloat(price);
  if (isNaN(numPrice)) return "N/A";
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
  
  // Risks
  const risks = result.redFlags || [];

  // Build message with Telegram markdown formatting
  let message = `🔍 *DYOR Token Analysis*\n\n`;
  
  // Token Info
  message += `📊 *Token: ${tokenName || 'Unknown'} (${symbol || '???'})*\n`;
  message += `📝 Contract: \`${contractAddress || 'N/A'}\`\n\n`;
  
  // Scores
  message += `⚡ *Overall Score: ${score || 0}/100*\n`;
  message += `💭 *Sentiment: ${sentiment || 0}/100*\n`;
  message += `🎯 *Verdict: ${verdict || 'Unknown'}*\n\n`;
  
  // Market Data
  message += `📈 *Market Data*\n`;
  message += `• Price: ${formatPrice(priceUsd)}\n`;
  
  // Safe price change formatting
  let priceChangeText = 'N/A';
  if (priceChange24h !== null && priceChange24h !== undefined && typeof priceChange24h === 'number') {
    priceChangeText = (priceChange24h > 0 ? '+' : '') + priceChange24h.toFixed(2) + '%';
  }
  message += `• 24h Change: ${priceChangeText}\n`;
  
  message += `• Liquidity: ${liquidity ? '$' + formatNumber(Math.round(liquidity)) : 'N/A'}\n`;
  message += `• Volume (24h): ${volume24h ? '$' + formatNumber(Math.round(volume24h)) : 'N/A'}\n`;
  message += `• Market Cap: ${marketCap ? '$' + formatNumber(Math.round(marketCap)) : 'N/A'}\n`;
  message += `• Holders: ${formatNumber(holders)}\n\n`;
  
  // Narrative
  if (narrativeClaim) {
    message += `🎭 *Narrative*\n${narrativeClaim}\n\n`;
  }
  
  // Summary (AI-generated)
  if (summary) {
    message += `📋 *AI Summary*\n${summary}\n\n`;
  }
  
  // Fundamentals
  if (fundamentalsAnalysis) {
    message += `🔬 *Fundamentals*\n${fundamentalsAnalysis}\n\n`;
  }
  
  // Hype Analysis
  if (hypeAnalysis) {
    message += `🔥 *Hype Meter*\n${hypeAnalysis}\n\n`;
  }
  
  // Tweets about the token
  if (tickerTweets && tickerTweets.tweets && tickerTweets.tweets.length > 0) {
    message += `🐦 *Recent X Posts About ${symbol || 'Token'}*\n\n`;
    tickerTweets.tweets.slice(0, 3).forEach((tweet, idx) => {
      const tweetText = tweet.text ? tweet.text.substring(0, 150) + (tweet.text.length > 150 ? '...' : '') : '';
      const likes = tweet.likes || '0';
      const retweets = tweet.retweets || '0';
      const author = tweet.author || tweet.username || 'Unknown';
      
      message += `*${idx + 1}.* ${tweetText}\n`;
      message += `👤 ${author} | ❤️ ${likes} | 🔄 ${retweets}\n`;
      if (tweet.tweetUrl) {
        message += `🔗 ${tweet.tweetUrl}\n`;
      }
      message += `\n`;
    });
  }
  
  // Risks
  if (risks && risks.length > 0) {
    message += `⚠️ *Risk Flags*\n`;
    risks.forEach(risk => {
      message += `• ${risk}\n`;
    });
    message += `\n`;
  }
  
  message += `🔗 View full report: https://dyorscan.io\n`;
  message += `📱 Scan more tokens: Send another contract address`;
  
  return message;
}

// Helper: Validate Solana address
function validateSolanaAddress(address) {
  if (!address || typeof address !== "string") return false;
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(address.trim());
}

// Command: /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'there';
  
  const welcomeMessage = `
👋 Welcome to *DYOR Scanner Bot*, ${firstName}!

I analyze Solana tokens to help you make informed decisions.

🔍 *How it works:*
1. Send me a Solana contract address
2. I'll analyze the token's security, fundamentals, and hype
3. Get a detailed report in seconds

📝 *Just paste a contract address to get started!*

Example:
\`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\`

⚡ Powered by AI • Real-time data • Professional analysis
  `.trim();
  
  bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
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
Simply send any Solana contract address and I'll analyze it for you!

*What we analyze:*
• Security (mint/freeze authority, red flags)
• Fundamentals (liquidity, holders, volume)
• Market sentiment and hype
• Social presence (Twitter, Telegram, Website)
• AI-powered narrative verification

*Example contract:*
\`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\`

Need help? Contact: @dyorscan
  `.trim();
  
  bot.sendMessage(chatId, helpMessage, { parse_mode: 'Markdown' });
});

// Command: /about
bot.onText(/\/about/, (msg) => {
  const chatId = msg.chat.id;
  
  const aboutMessage = `
ℹ️ *About DYOR Scanner*

DYOR (Do Your Own Research) Scanner is an AI-powered tool for analyzing Solana tokens.

*Features:*
✅ Real-time market data
✅ Security risk assessment
✅ AI narrative verification
✅ Social sentiment analysis
✅ Professional scoring system

*Data Sources:*
• DexScreener - Market data
• RugCheck - Security analysis
• Social media - Community sentiment
• GPT-4 - Intelligent analysis

🌐 Website: https://dyorscan.io
🐦 Twitter: https://x.com/dyorscan
📧 API Access: Available on our website

*Disclaimer:*
This tool is for informational purposes only. Always do your own research and never invest more than you can afford to lose.
  `.trim();
  
  bot.sendMessage(chatId, aboutMessage, { parse_mode: 'Markdown' });
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
  
  // Check if it looks like a Solana address
  if (!validateSolanaAddress(text)) {
    bot.sendMessage(
      chatId,
      `❌ Invalid contract address format.

Please send a valid Solana contract address (32-44 characters, base58 encoded).

Example:
\`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v\``,
      { parse_mode: 'Markdown' }
    );
    return;
  }
  
  // Send "analyzing" message
  const analyzingMsg = await bot.sendMessage(
    chatId,
    `🔍 Analyzing token...\n\nContract: \`${text}\`\n\nThis may take 10-15 seconds...`,
    { parse_mode: 'Markdown' }
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
        await bot.sendMessage(chatId, part, { parse_mode: 'Markdown' });
      }
    } else {
      await bot.sendMessage(chatId, formattedResult, { parse_mode: 'Markdown' });
    }
    
    // Add inline keyboard with actions
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔗 View on DexScreener', url: `https://dexscreener.com/solana/${text}` },
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
      { reply_markup: keyboard }
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
      { parse_mode: 'Markdown' }
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
      '📝 Send me another Solana contract address to analyze!',
      { parse_mode: 'Markdown' }
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

