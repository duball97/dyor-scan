# Coolify Deployment Guide for Telegram Bot

## Configuration Settings

When setting up the application in Coolify, use these settings:

### Basic Configuration
- **Repository**: `dyor-scan` (or your repo name)
- **Branch**: `master` (or your main branch)
- **Build Pack**: **Dockerfile** (not Nixpacks!)
- **Dockerfile Path**: `Dockerfile.bot`
- **Base Directory**: `/`
- **Port**: `3000` (Coolify requires a port, but the bot uses polling so it doesn't actually listen)
- **Is it a static site?**: ❌ **NO** (unchecked)

### Environment Variables

Make sure to add all required environment variables in Coolify's environment settings:

- `TELEGRAM_BOT_KEY` - Your Telegram bot token
- `OPENAI_API_KEY` - OpenAI API key
- `SCRAPINGBEE_KEY` - ScrapingBee API key
- `HELIUS_KEY` - Helius API key (for Solana)
- `BSCSCAN_API_KEY` - BSCScan API key (for BNB)
- `SUPABASE_URL` - Supabase URL (optional, for caching)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (optional)
- `NODE_ENV` - Set to `production`

### Important Notes

1. **Use Dockerfile, not Nixpacks**: Since we have a custom `Dockerfile.bot`, select "Dockerfile" as the build pack and specify `Dockerfile.bot` as the Dockerfile path.

2. **Port**: The bot doesn't actually listen on a port (it uses Telegram polling), but Coolify requires a port number. Use `3000` or any port - it won't matter.

3. **Health Check**: The Dockerfile includes a health check, but since the bot doesn't expose HTTP endpoints, you may want to disable health checks in Coolify or configure them to just check if the container is running.

4. **Restart Policy**: Make sure Coolify is set to restart the container automatically if it crashes.

### After Deployment

Once deployed, check the logs in Coolify to verify the bot is running:

```
docker logs <container-name>
```

You should see messages indicating the bot is connected and polling for messages.

