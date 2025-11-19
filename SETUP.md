# DYOR Scan Setup

## Quick Start

1. **Install dependencies** (already done):
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   - Copy `.env.local.example` to `.env.local`
   - Fill in your Supabase and OpenAI credentials

3. **Set up Supabase**:
   - Create a new Supabase project
   - Run this SQL in the Supabase SQL editor:
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
   - Get your project URL and anon key from Settings > API
   - Get your service role key from Settings > API (keep this secret!)

4. **Get OpenAI API key**:
   - Sign up at https://platform.openai.com
   - Create an API key

5. **Run locally**:
   ```bash
   npm run dev
   ```

6. **Deploy to Vercel**:
   - Connect your repo to Vercel
   - Add environment variables in Vercel dashboard
   - Deploy

## Environment Variables

### Local (.env.local)
```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=sk-...
```

### Vercel
Add the same variables in the Vercel dashboard (Settings > Environment Variables)

## Project Structure

```
dyor-scan/
  api/
    scan.js          # Vercel serverless function
  src/
    components/
      ScanForm.jsx   # Input form
      ScanResult.jsx # Results display
    lib/
      supabaseClient.js  # Supabase client (frontend)
    App.jsx          # Main app
    main.jsx         # Entry point
    styles.css       # Styles
  vercel.json        # Vercel config
```

## Data Sources

The scanner fetches data from:
- **DexScreener API** (FREE) - Token prices, liquidity, volume, social links
- **RugCheck API** (FREE) - Token safety analysis and risk assessment

## Next Steps / TODOs

- [ ] Add Helius API for enhanced metadata (optional)
- [ ] Add web search for evidence gathering
- [ ] Add Twitter/X lore tweet analysis  
- [ ] Add Solscan API for transaction history
- [ ] Add authentication (optional)
- [ ] Add RLS policies in Supabase

## API Keys Needed

- Supabase URL and keys (required)
- OpenAI API key (required)
- Helius API key (optional - for better metadata)
- No keys needed for DexScreener or RugCheck!

