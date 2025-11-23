# DYOR Scanner Telegram Bot

A Telegram bot that allows users to scan and analyze Solana tokens directly through Telegram.

## Features

- 🔍 **Token Analysis**: Analyze any Solana token by sending its contract address
- 🤖 **AI-Powered**: Uses GPT-4 for intelligent narrative verification and analysis
- 📊 **Real-time Data**: Fetches live market data, security info, and social metrics
- 💬 **Easy to Use**: Simple conversational interface
- ⚡ **Fast Results**: Get comprehensive analysis in 10-15 seconds

## What It Analyzes

- **Security**: Mint/freeze authority, risk flags, RugCheck scores
- **Fundamentals**: Liquidity, holders, volume, market cap
- **Market Data**: Price, 24h change, trading volume
- **Social Presence**: Twitter, Telegram, website activity
- **Sentiment**: Community hype and momentum
- **Narrative**: AI-powered claim verification

## Setup

### Prerequisites

- Node.js 18+ installed
- Telegram Bot Token (get from [@BotFather](https://t.me/botfather))
- OpenAI API Key
- Supabase project (optional, for caching)

### Environment Variables

Create a `.env` file in the root directory:

```env
# Required
TELEGRAM_BOT_KEY=your_telegram_bot_token_here
OPENAI_API_KEY=your_openai_api_key_here

# Optional (for caching and enhanced features)
SUPABASE_URL=your_supabase_url_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_key_here
```

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the bot:
```bash
npm run bot
```

The bot will start polling for messages and log:
```
🤖 DYOR Scanner Telegram Bot is running...
📱 Waiting for messages...
```

## Usage

### For Users

1. **Start the bot**: Search for your bot on Telegram and send `/start`

2. **Send a contract address**: Simply paste any Solana contract address

   Example:
   ```
   EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
   ```

3. **Get results**: The bot will analyze the token and send a detailed report

### Commands

- `/start` - Welcome message and instructions
- `/help` - Show help and usage information
- `/about` - Learn about DYOR Scanner

### Sample Interaction

```
User: /start
Bot: 👋 Welcome to DYOR Scanner Bot!
     Send me a Solana contract address to analyze...

User: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
Bot: 🔍 Analyzing token...
     [After 10-15 seconds]
     
     🔍 DYOR Token Analysis
     
     📊 Token: USD Coin (USDC)
     Overall Score: 95/100
     Sentiment: 88/100
     ...
```

## Architecture

```
server/
├── bot.js          # Telegram bot logic and message handlers
├── scan.js         # Core token analysis logic (shared with web app)
└── README.md       # This file
```

### How It Works

1. **User sends contract address** → Telegram bot receives message
2. **Validation** → Checks if address is valid Solana format
3. **Analysis** → Calls `getTokenData()` from `scan.js`
4. **Data Collection** → Fetches from:
   - DexScreener (market data)
   - RugCheck (security)
   - Helius (on-chain data)
   - Social media (Twitter, Telegram, Website)
5. **AI Processing** → GPT-4 analyzes and generates insights
6. **Formatting** → Results formatted for Telegram with markdown
7. **Response** → Bot sends comprehensive report to user

## Features in Detail

### Message Formatting

Results are formatted with Telegram markdown for readability:
- **Bold** text for emphasis
- Inline code blocks for contract addresses
- Emojis for visual appeal
- Structured sections for easy scanning

### Error Handling

- Invalid addresses → Clear error message with example
- API failures → Graceful error handling with retry suggestions
- Timeout handling → User-friendly timeout messages

### Rate Limiting

The bot uses the same scan logic as the web app, which includes:
- Caching of recent scans (5-minute TTL)
- Parallel API requests for speed
- Timeout protection

### Inline Actions

After sending results, the bot provides quick action buttons:
- 🔗 View on DexScreener
- 🔍 Scan Another Token
- 📊 View on Website

## Deployment

### Local Development

```bash
npm run bot
```

### Production Deployment

**Option 1: PM2 (Recommended)**

```bash
# Install PM2 globally
npm install -g pm2

# Start bot with PM2
pm2 start server/bot.js --name dyor-bot

# Save PM2 config
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

**Option 2: Docker**

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
CMD ["node", "server/bot.js"]
```

**Option 3: Systemd Service**

Create `/etc/systemd/system/dyor-bot.service`:

```ini
[Unit]
Description=DYOR Scanner Telegram Bot
After=network.target

[Service]
Type=simple
User=your_user
WorkingDirectory=/path/to/dyor
ExecStart=/usr/bin/node server/bot.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl enable dyor-bot
sudo systemctl start dyor-bot
```

## Monitoring

### Logs

The bot logs important events:
- User requests with chat IDs
- Scan start/completion
- Errors and failures

Example logs:
```
[Telegram Bot] Scanning contract: ABC123... for user 123456789
[TokenData] ===== Starting token data fetch...
[Telegram Bot] ✅ Scan completed for user 123456789
```

### Health Check

Monitor bot status:
```bash
# If using PM2
pm2 status dyor-bot
pm2 logs dyor-bot

# If using systemd
sudo systemctl status dyor-bot
sudo journalctl -u dyor-bot -f
```

## Troubleshooting

### Bot Not Responding

1. Check if bot is running: `ps aux | grep bot.js`
2. Check environment variables are set
3. Verify Telegram Bot Token is correct
4. Check logs for errors

### "Analysis Failed" Errors

Common causes:
- Token is too new (no market data available)
- Invalid contract address
- OpenAI API quota exceeded
- Network timeout

### High Response Time

- Check if caching is enabled (requires Supabase)
- Verify API keys are valid
- Check network connectivity to external APIs

## API Rate Limits

The bot respects rate limits from:
- **OpenAI**: 3,500 TPM (tokens per minute)
- **DexScreener**: Public API, rate limit varies
- **RugCheck**: Public API, no official limit

## Security

- Bot token should be kept secret
- Never commit `.env` file to version control
- Use environment variables in production
- Consider implementing user rate limiting for high traffic

## Cost Estimation

Approximate costs per scan:
- **OpenAI GPT-4o-mini**: ~$0.001-0.002 per scan
- **Supabase**: Free tier covers most use cases
- **Hosting**: Varies by provider

For 1,000 scans/month: ~$1-2 in AI costs

## Future Enhancements

- [ ] Add support for multi-language responses
- [ ] Implement user favorites/watchlist
- [ ] Add price alerts functionality
- [ ] Support for bulk scanning
- [ ] Integration with wallet tracking
- [ ] Advanced filtering options

## Support

- Website: https://dyorscan.io
- Twitter: https://x.com/dyorscan
- Issues: GitHub Issues page

## License

Same as main DYOR Scanner project.

