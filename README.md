# DYOR Scanner

AI-powered token narrative verification tool for Solana. Analyze token claims, verify narratives, and assess risks before investing.

## Overview

DYOR Scanner is an intelligent analysis platform that helps investors make informed decisions by extracting, verifying, and classifying token narratives. It combines real-time market data, security analysis, and advanced AI to provide comprehensive token intelligence in seconds.

## Features

### Core Capabilities

- **Narrative Extraction**: AI-powered analysis that identifies core claims, entities, and themes from token information
- **Reality Verification**: Classifies narratives as CONFIRMED, PARTIAL, or UNVERIFIED with confidence levels
- **Security Analysis**: Automated risk assessment including mint authority, freeze risks, and red flags
- **Market Intelligence**: Real-time price, liquidity, volume, and trading metrics
- **Social Presence**: Aggregates social links and community activity
- **Comprehensive Reports**: Detailed analysis with actionable insights, downloadable as PDF

### Analysis Components

- **Narrative Analysis**: Extracts and verifies token claims using GPT-4
- **Security Check**: Identifies potential vulnerabilities and risks
- **Hype Meter**: Measures community sentiment and momentum
- **Overall Score**: 0-100 rating based on all metrics
- **Red Flags Detection**: Automatically identifies concerns and warnings

## Tech Stack

- **Frontend**: React 19, Vite, React Router
- **Backend**: Vercel Serverless Functions, Node.js
- **AI**: OpenAI GPT-4o-mini
- **Database**: Supabase (PostgreSQL)
- **APIs**: DexScreener, RugCheck, Helius
- **Telegram**: node-telegram-bot-api
- **PDF Generation**: jsPDF, html2canvas

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account
- OpenAI API key

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/dyor.git
cd dyor
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:

Create a `.env.local` file in the root directory:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=sk-your-openai-key
```

4. Set up Supabase:

Create a new Supabase project and run this SQL in the SQL editor:

```sql
create table public.dyor_scans (
  id bigint generated always as identity primary key,
  contract_address text not null,
  result_json jsonb not null,
  created_at timestamptz default now()
);

create index dyor_scans_contract_address_idx
  on public.dyor_scans (contract_address);
```

5. Run the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173`

## Usage

1. Enter a Solana token contract address in the scanner
2. Wait for the analysis to complete (typically 3-5 seconds)
3. Review the comprehensive report including:
   - Narrative claim and entities
   - Verdict (CONFIRMED/PARTIAL/UNVERIFIED) with confidence level
   - Market data and metrics
   - Security analysis
   - Red flags (if any)
   - Detailed reasoning and notes

4. Export results as PDF or copy the full report

## Telegram Bot

DYOR Scanner is also available as a Telegram bot! Analyze tokens directly in Telegram by sending contract addresses to the bot.

### Features

- Instant token analysis via Telegram
- Same powerful AI analysis as the web app
- Real-time market data and security checks
- Simple conversational interface
- No need to open a browser

### Quick Start

1. Get a Telegram bot token from [@BotFather](https://t.me/botfather)
2. Add `TELEGRAM_BOT_KEY` to your `.env` file
3. Run: `npm run bot`
4. Start chatting with your bot!

For detailed setup instructions, see [TELEGRAM_BOT_SETUP.md](./TELEGRAM_BOT_SETUP.md)

## API

### Endpoint

```
POST /api/scan
```

### Request Body

```json
{
  "contractAddress": "string (required)",
  "forceRefresh": boolean (optional, default: false)
}
```

### Response

```json
{
  "cached": boolean,
  "contractAddress": "string",
  "tokenName": "string",
  "symbol": "string",
  "narrativeClaim": "string",
  "entities": {
    "organizations": ["string"],
    "products": ["string"],
    "topics": ["string"]
  },
  "verdict": "CONFIRMED | PARTIAL | UNVERIFIED",
  "confidence": "high | medium | low",
  "redFlags": ["string"],
  "marketData": { ... },
  "socials": { ... },
  "securityData": { ... },
  "tokenScore": number,
  "sentimentScore": number,
  "summary": "string",
  "fundamentalsAnalysis": "string",
  "hypeAnalysis": "string",
  "notesForUser": "string"
}
```

## Understanding Verdicts

### CONFIRMED
The narrative references real, verifiable events, products, or announcements. Entities mentioned are real. **Note**: This does NOT mean the token is officially affiliated or safe.

### PARTIAL
The narrative mixes truth with hype or exaggeration. Real events may be referenced, but claims are stretched or imply unofficial associations.

### UNVERIFIED
The narrative's claims cannot be verified through available information. Entities or events may be fabricated, misleading, or too vague to verify. Exercise extreme caution.

## Project Structure

```
dyor/
├── api/
│   ├── scan.js              # Vercel serverless function
│   ├── request-api-key.js   # API key generation
│   ├── usage.js             # API usage tracking
│   └── utils/
│       └── apiAuth.js       # API authentication
├── server/
│   ├── bot.js               # Telegram bot
│   ├── scan.js              # Shared scan logic
│   └── README.md            # Bot documentation
├── src/
│   ├── components/
│   │   ├── ScanForm.jsx     # Input form component
│   │   └── ScanResult.jsx   # Results display component
│   ├── pages/
│   │   ├── Documentation.jsx # Documentation page
│   │   └── ApiKeys.jsx      # API key management
│   ├── lib/
│   │   └── supabaseClient.js # Supabase client
│   ├── App.jsx              # Main application
│   ├── main.jsx             # Entry point
│   └── styles.css           # Global styles
├── public/                  # Static assets
├── package.json
├── vite.config.js
├── TELEGRAM_BOT_SETUP.md    # Bot quick start guide
└── README.md
```

## Data Sources

- **DexScreener**: Real-time market data, prices, liquidity, volume, and social links
- **RugCheck**: Security analysis and risk assessment
- **OpenAI GPT-4**: Narrative extraction, entity identification, and classification

## Deployment

### Vercel

1. Connect your repository to Vercel
2. Add environment variables in the Vercel dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
3. Deploy

The API routes will automatically be deployed as serverless functions.

## Development

```bash
# Start development server (web app)
npm run dev

# Start Telegram bot
npm run bot

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint
```

## Limitations & Disclaimers

- **Not Financial Advice**: DYOR Scanner provides analysis, not investment advice. Always do your own research.
- **No Guarantees**: Verdicts are AI-generated assessments, not definitive truth. Use as one tool among many.
- **Data Accuracy**: We rely on third-party APIs. Data may be incomplete or delayed.
- **Narrative vs Reality**: A CONFIRMED verdict means the narrative references real events, NOT that the token is legitimate or safe.
- **Always DYOR**: This tool is meant to assist your research, not replace it.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.

## Support

For issues, suggestions, or contributions, please open an issue on GitHub.

---

Built with React, Vite, OpenAI GPT-4, and Supabase. Always DYOR.
