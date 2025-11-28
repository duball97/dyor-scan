# Deployment Guide for Telegram Bot on Hetzner

This guide explains how to deploy the Telegram bot to a Hetzner server using Docker.

## Prerequisites

1. A Hetzner server (Ubuntu 22.04 or later recommended)
2. Docker and Docker Compose installed on the server
3. All required API keys (see ENV_TEMPLATE.txt)

## Step 1: Install Docker on Hetzner Server

SSH into your Hetzner server and run:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Add your user to docker group (optional, to run without sudo)
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker compose version
```

## Step 2: Clone Repository and Set Up

```bash
# Clone your repository
git clone <your-repo-url> dyor-bot
cd dyor-bot

# Create .env file from template
cp ENV_TEMPLATE.txt .env

# Edit .env with your actual API keys
nano .env
```

Required environment variables for the bot:
- `TELEGRAM_BOT_KEY` - Your Telegram bot token
- `OPENAI_API_KEY` - OpenAI API key
- `SCRAPINGBEE_KEY` - ScrapingBee API key
- `HELIUS_KEY` - Helius API key (for Solana)
- `BSCSCAN_API_KEY` - BSCScan API key (for BNB)
- `SUPABASE_URL` - Supabase URL (optional, for caching)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (optional)

## Step 3: Build and Run with Docker Compose

```bash
# Build and start the bot
docker compose -f docker-compose.bot.yml up -d

# View logs
docker compose -f docker-compose.bot.yml logs -f

# Check if bot is running
docker compose -f docker-compose.bot.yml ps
```

## Step 4: Verify Bot is Working

Check the logs to ensure the bot started successfully:

```bash
docker compose -f docker-compose.bot.yml logs telegram-bot
```

You should see messages indicating the bot is connected and polling for messages.

## Step 5: Manage the Bot

```bash
# Stop the bot
docker compose -f docker-compose.bot.yml stop

# Start the bot
docker compose -f docker-compose.bot.yml start

# Restart the bot
docker compose -f docker-compose.bot.yml restart

# View real-time logs
docker compose -f docker-compose.bot.yml logs -f telegram-bot

# Stop and remove containers
docker compose -f docker-compose.bot.yml down

# Rebuild after code changes
docker compose -f docker-compose.bot.yml up -d --build
```

## Alternative: Manual Docker Build

If you prefer not to use Docker Compose:

```bash
# Build the image
docker build -f Dockerfile.bot -t dyor-telegram-bot .

# Run the container
docker run -d \
  --name dyor-telegram-bot \
  --restart unless-stopped \
  --env-file .env \
  dyor-telegram-bot

# View logs
docker logs -f dyor-telegram-bot
```

## Updating the Bot

When you make changes to the code:

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker compose -f docker-compose.bot.yml up -d --build
```

## Troubleshooting

### Bot not responding
- Check logs: `docker compose -f docker-compose.bot.yml logs telegram-bot`
- Verify `.env` file has correct `TELEGRAM_BOT_KEY`
- Ensure server has internet connectivity

### Container keeps restarting
- Check logs for errors: `docker compose -f docker-compose.bot.yml logs`
- Verify all required environment variables are set
- Check if port conflicts exist (if using webhooks)

### Out of memory errors
- Increase server RAM or add swap space
- Check if other processes are consuming memory

## Security Notes

1. Never commit `.env` file to git
2. Use strong API keys and rotate them regularly
3. Keep Docker and system packages updated
4. Consider using Docker secrets for sensitive data in production
5. Set up firewall rules if exposing ports

## Monitoring

Consider setting up monitoring for:
- Container health (Docker healthcheck)
- Log aggregation (e.g., with `docker logs` or external tools)
- Resource usage (`docker stats`)

## Backup

Regularly backup:
- Your `.env` file (securely)
- Database (if using Supabase)
- Configuration files

