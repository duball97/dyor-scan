import React from "react";
import { Link } from "react-router-dom";

function Documentation() {
  return (
    <div className="app">
      <header className="site-header">
        <div className="site-header-content">
          <Link to="/" className="logo">
            <img src="/logo.png" alt="DYOR" className="logo-image" />
            <span className="logo-text">DYOR</span>
          </Link>
          <nav className="site-nav">
            <Link to="/" className="">Home</Link>
            <Link to="/docs" className="active">Documentation</Link>
            <a href="/#how-it-works">How It Works</a>
            <Link to="/api-keys">API</Link>
          </nav>

          <div className="site-header-actions">
            <a href="https://x.com/dyorscan" target="_blank" rel="noopener noreferrer" className="social-link">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
            <Link to="/#scan" className="btn-scan-header">Scan Token</Link>
          </div>
        </div>
      </header>

      <div className="docs-page">
        <div className="docs-container">
        <header className="docs-header">
          <h1>DYOR Scanner Documentation</h1>
          <p className="docs-subtitle">AI-Powered Token Narrative Verification for Solana & BNB</p>
        </header>

        <section className="docs-section">
          <h2>What is DYOR Scanner?</h2>
          <p>
            DYOR Scanner is an <strong>AI-powered tool</strong> that analyzes <strong>Solana and BNB tokens</strong> to extract, verify, and classify their narratives. 
            It helps investors make informed decisions by identifying what stories tokens are telling, whether those stories 
            reference <strong>real-world events</strong>, and what <strong>risks</strong> might be involved.
          </p>
          <p>
            The scanner combines <strong>real-time market data</strong>, <strong>security analysis</strong>, and <strong>advanced AI</strong> to provide comprehensive token 
            intelligence in <strong>seconds</strong>.
          </p>
        </section>

        <section className="docs-section">
          <h2>How It Works</h2>
          
          <div className="docs-step">
            <div className="step-number-doc">1</div>
            <div className="step-content-doc">
              <h3>Data Aggregation</h3>
              <p>
                When you paste a Solana or BNB contract address, the scanner automatically detects the blockchain and fetches data from multiple sources:
              </p>
              <ul>
                <li><strong>DexScreener</strong> - Real-time market data, prices, liquidity, volume, and social links</li>
                <li><strong>RugCheck</strong> - Security analysis and risk assessment</li>
                <li><strong>Chain Insight</strong> - Enhanced token metadata (when available)</li>
              </ul>
            </div>
          </div>

          <div className="docs-step">
            <div className="step-number-doc">2</div>
            <div className="step-content-doc">
              <h3>Narrative Extraction</h3>
              <p>
                Our <strong>GPT-4 powered AI</strong> analyzes the token's information to identify:
              </p>
              <ul>
                <li>The <strong>core narrative claim</strong> (what story is this token telling?)</li>
                <li><strong>Entities involved</strong> (companies, products, people, events)</li>
                <li><strong>Key topics and themes</strong></li>
                <li><strong>References to real-world events or partnerships</strong></li>
              </ul>
            </div>
          </div>

          <div className="docs-step">
            <div className="step-number-doc">3</div>
            <div className="step-content-doc">
              <h3>Reality Verification</h3>
              <p>
                The AI classifies the narrative into <strong>one of three categories</strong>:
              </p>
              <ul>
                <li><strong>CONFIRMED</strong> - References <strong>real, verifiable events/products</strong>. Entities are real.</li>
                <li><strong>PARTIAL</strong> - <strong>Mix of truth and hype</strong>. Real event but exaggerated or unofficial association.</li>
                <li><strong>UNVERIFIED</strong> - <strong>Cannot verify claims</strong>. Possibly fabricated or misleading.</li>
              </ul>
              <p>
                Each verdict includes a <strong>confidence level (high/medium/low)</strong> and <strong>detailed reasoning</strong>.
              </p>
            </div>
          </div>

          <div className="docs-step">
            <div className="step-number-doc">4</div>
            <div className="step-content-doc">
              <h3>Risk Assessment</h3>
              <p>
                The scanner identifies <strong>potential red flags</strong> such as:
              </p>
              <ul>
                <li><strong>Unverified partnerships or claims</strong></li>
                <li><strong>Security vulnerabilities</strong></li>
                <li><strong>Misleading narratives</strong></li>
                <li><strong>Lack of official affiliation</strong> despite claims</li>
              </ul>
            </div>
          </div>

          <div className="docs-step">
            <div className="step-number-doc">5</div>
            <div className="step-content-doc">
              <h3>Comprehensive Report</h3>
              <p>
                You receive a <strong>detailed analysis</strong> including:
              </p>
              <ul>
                <li><strong>Market data</strong> (price, liquidity, volume, 24h change)</li>
                <li><strong>Social links</strong> (website, Twitter, Telegram)</li>
                <li><strong>Security risks</strong> from RugCheck</li>
                <li><strong>Narrative claim and entities</strong></li>
                <li><strong>Verdict with confidence level</strong></li>
                <li><strong>Red flags</strong> (if any)</li>
                <li><strong>Comprehensive notes for investors</strong></li>
              </ul>
            </div>
          </div>
        </section>

        <section className="docs-section">
          <h2>Understanding Verdicts</h2>
          
          <div className="verdict-card">
            <div className="verdict-header verdict-confirmed">
              <h3>CONFIRMED</h3>
              <span className="verdict-badge">Verified</span>
            </div>
            <p>
              The token's narrative references <strong>real, verifiable events, products, or announcements</strong>. 
              The entities mentioned (companies, products, people) are <strong>real</strong>. However, <strong>this does NOT mean 
              the token is officially affiliated</strong> - it may just be referencing real events.
            </p>
            <p className="verdict-note">
              <strong>Example:</strong> Token claims to be inspired by JPMorgan's JPM Coin launch. 
              JPM Coin is a real product, but the token has no official connection.
            </p>
          </div>

          <div className="verdict-card">
            <div className="verdict-header verdict-partial">
              <h3>PARTIAL</h3>
              <span className="verdict-badge">Mixed</span>
            </div>
            <p>
              The narrative mixes <strong>truth with hype or exaggeration</strong>. There may be a <strong>real event or product 
              being referenced</strong>, but the token's claims are <strong>stretched, exaggerated, or imply an unofficial 
              association that doesn't exist</strong>.
            </p>
            <p className="verdict-note">
              <strong>Example:</strong> Token references a real company's product but implies partnership 
              or endorsement that doesn't exist.
            </p>
          </div>

          <div className="verdict-card">
            <div className="verdict-header verdict-unverified">
              <h3>UNVERIFIED</h3>
              <span className="verdict-badge">Unclear</span>
            </div>
            <p>
              The narrative's claims <strong>cannot be verified</strong> through available information. The entities or events 
              mentioned may be <strong>fabricated, misleading, or too vague to verify</strong>. <strong>Exercise extreme caution</strong>.
            </p>
            <p className="verdict-note">
              <strong>Example:</strong> Token claims partnership with a major company, but no evidence 
              exists of such partnership.
            </p>
          </div>
        </section>

        <section className="docs-section">
          <h2>Confidence Levels</h2>
          
          <div className="confidence-grid">
            <div className="confidence-card">
              <div className="confidence-indicator confidence-high">HIGH</div>
              <h3>High Confidence</h3>
              <p><strong>Strong evidence</strong> supports this verdict. <strong>Multiple sources</strong> confirm or deny the narrative claims.</p>
            </div>
            
            <div className="confidence-card">
              <div className="confidence-indicator confidence-medium">MEDIUM</div>
              <h3>Medium Confidence</h3>
              <p>Verdict based on <strong>available information</strong>, but <strong>more research is recommended</strong>. Some uncertainty remains.</p>
            </div>
            
            <div className="confidence-card">
              <div className="confidence-indicator confidence-low">LOW</div>
              <h3>Low Confidence</h3>
              <p><strong>Limited information available</strong>. <strong>Exercise caution</strong> and do <strong>thorough independent research</strong> before investing.</p>
            </div>
          </div>
        </section>

        <section className="docs-section">
          <h2>Data Sources</h2>
          
          <div className="source-grid">
            <div className="source-card">
              <h3>DexScreener</h3>
              <p><strong>Real-time market data</strong> including prices, liquidity, volume, and trading pairs across Solana and BNB DEXs.</p>
              <a href="https://dexscreener.com" target="_blank" rel="noopener noreferrer">Visit DexScreener →</a>
            </div>
            
            <div className="source-card">
              <h3>RugCheck</h3>
              <p><strong>Security analysis and risk assessment</strong> for Solana tokens (BNB support coming soon). Identifies <strong>potential vulnerabilities and scams</strong>.</p>
              <a href="https://rugcheck.xyz" target="_blank" rel="noopener noreferrer">Visit RugCheck →</a>
            </div>
            
            <div className="source-card">
              <h3>OpenAI GPT-4</h3>
              <p><strong>Advanced AI</strong> for narrative extraction, entity identification, and classification. Powers the <strong>analysis engine</strong>.</p>
              <a href="https://openai.com" target="_blank" rel="noopener noreferrer">Visit OpenAI →</a>
            </div>
          </div>
        </section>

        <section className="docs-section">
          <h2>API Access</h2>
          <p>
            Integrate DYOR Scanner into your platform with our <strong>REST API</strong>. 
            Build token analysis into your application with <strong>simple HTTP requests</strong>.
          </p>
          
          <div className="api-info-box">
            <h3>Getting Started</h3>
            <p>
              To use the API, you'll need an <strong>API key</strong>. Get your free API key from the 
              <Link to="/api-keys" style={{ color: '#c0c0c0', textDecoration: 'underline', marginLeft: '5px' }}>API Keys page</Link>.
            </p>
            <ul>
              <li><strong>Simple REST API</strong> - works with any programming language</li>
              <li><strong>No database setup required</strong> on your end</li>
              <li><strong>Real-time token analysis</strong> with AI-powered verification</li>
              <li><strong>Rate limits</strong> based on your tier (Free: 10/min, 100/day)</li>
              <li><strong>Comprehensive documentation</strong> and examples</li>
            </ul>
          </div>

          <h3>Endpoint</h3>
          <pre className="code-block">POST /api/scan</pre>
          
          <h3>Authentication</h3>
          <p>
            Include your API key in the <strong>Authorization header</strong>:
          </p>
          <pre className="code-block">{`Authorization: Bearer YOUR_API_KEY`}</pre>
          <p style={{ fontSize: '14px', color: '#909090', marginTop: '8px' }}>
            Note: API key is optional for testing, but required for production use and higher rate limits.
          </p>
          
          <h3>Request Body</h3>
          <pre className="code-block">{`{
  "contractAddress": "string (required)",
  "forceRefresh": boolean (optional, default: false)
}`}</pre>
          
          <h3>Example Request</h3>
          <pre className="code-block">{`fetch('https://your-domain.com/api/scan', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_API_KEY'
  },
  body: JSON.stringify({
    contractAddress: 'So11111111111111111111111111111111111111112'
  })
})
.then(res => res.json())
.then(data => {
  console.log('Verdict:', data.verdict);
  console.log('Score:', data.tokenScore);
  console.log('Narrative:', data.narrativeClaim);
});`}</pre>
          
          <h3>Response Format</h3>
          <pre className="code-block">{`{
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
  "tokenScore": number (0-100),
  "sentiment": number (0-100),
  "marketData": {
    "price": number,
    "liquidity": number,
    "volume24h": number,
    "priceChange24h": number
  },
  "socials": {
    "website": "string",
    "twitter": "string",
    "telegram": "string"
  },
  "securityData": {
    "riskFlags": ["string"],
    "mintAuthority": "string",
    "freezeAuthority": "string"
  },
  "notesForUser": "string",
  "fundamentals": "string",
  "hype": "string"
}`}</pre>

          <h3>Rate Limits</h3>
          <div className="source-grid">
            <div className="source-card">
              <h3>Free Tier</h3>
              <p><strong>10 requests/minute</strong></p>
              <p><strong>100 requests/day</strong></p>
              <p>Perfect for testing and low-volume applications</p>
            </div>
          </div>
          <p style={{ marginTop: '16px', fontSize: '14px', color: '#909090' }}>
            Additional tiers (Starter, Pro, Enterprise) will be available soon. Contact us for custom solutions.
          </p>

          <h3>Error Responses</h3>
          <pre className="code-block">{`// Rate limit exceeded
{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please try again later."
}

// Invalid API key
{
  "error": "Unauthorized",
  "message": "Invalid or missing API key"
}

// Invalid request
{
  "error": "Bad Request",
  "message": "contractAddress is required"
}`}</pre>
        </section>

        <section className="docs-section">
          <h2>Limitations & Disclaimers</h2>
          
          <div className="warning-box-doc">
            <h3>⚠️ Important Disclaimers</h3>
            <ul>
              <li><strong>Not Financial Advice:</strong> DYOR Scanner provides analysis, not investment advice. Always do your own research.</li>
              <li><strong>No Guarantees:</strong> Verdicts are AI-generated assessments, not definitive truth. Use as one tool among many.</li>
              <li><strong>Data Accuracy:</strong> We rely on third-party APIs. Data may be incomplete or delayed.</li>
              <li><strong>Narrative vs Reality:</strong> A CONFIRMED verdict means the narrative references real events, NOT that the token is legitimate or safe.</li>
              <li><strong>Always DYOR:</strong> This tool is meant to assist your research, not replace it.</li>
            </ul>
          </div>
        </section>

        <section className="docs-section">
          <h2>FAQ</h2>
          
          <div className="faq-item">
            <h3>How accurate are the verdicts?</h3>
            <p>
              Verdicts are <strong>AI-generated</strong> based on available data. <strong>Accuracy depends on the quality and completeness 
              of information</strong>. <strong>Always verify independently</strong>. Check the <strong>confidence level</strong> - <strong>high confidence means more 
              reliable</strong>, <strong>low confidence means less certain</strong>.
            </p>
          </div>
          
          <div className="faq-item">
            <h3>What does "CONFIRMED" mean?</h3>
            <p>
              <strong>CONFIRMED</strong> means the narrative references <strong>real events/products</strong>. <strong>It does NOT mean the token is safe, 
              legitimate, or officially affiliated</strong>. A token can reference real events while still being <strong>a scam or 
              having no value</strong>.
            </p>
          </div>
          
          <div className="faq-item">
            <h3>Why does it take a few seconds?</h3>
            <p>
              The scanner fetches data from <strong>multiple APIs</strong> (DexScreener, RugCheck), then runs <strong>AI analysis</strong>. 
              This typically takes <strong>3-5 seconds</strong>. Results are <strong>cached</strong> for faster subsequent scans.
            </p>
          </div>
          
          <div className="faq-item">
            <h3>Can I use this for other blockchains?</h3>
            <p>
              DYOR Scanner currently supports <strong>Solana and BNB/BSC tokens</strong>. The system automatically detects the blockchain from the contract address format and uses the appropriate data sources.
            </p>
          </div>
          
          <div className="faq-item">
            <h3>Is my data stored?</h3>
            <p>
              Scan results are <strong>cached in Supabase</strong> to improve performance. <strong>Contract addresses and analysis results 
              are stored</strong>, but <strong>no personal information is collected</strong>.
            </p>
          </div>
        </section>

        <section className="docs-section">
          <h2>Contributing & Support</h2>
          <p>
            DYOR Scanner is built with React, Vite, OpenAI, and Supabase. For issues, suggestions, or contributions, 
            visit our GitHub repository.
          </p>
          <p>
            <strong>Built with:</strong> React • Vite • OpenAI GPT-4 • Supabase • DexScreener API • RugCheck API
          </p>
        </section>
        </div>
      </div>

      <footer className="app-footer">
        <div className="app-footer-content">
          <div className="app-footer-logo">
            <img src="/logo.png" alt="DYOR" className="footer-logo-image" />
          </div>
          <div className="app-footer-links">
            <Link to="/">Home</Link>
            <Link to="/docs">Documentation</Link>
            <a href="/#how-it-works">How It Works</a>
            <a href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</a>
          </div>
          <div className="app-footer-text">
            Built with React, Vite, OpenAI & Supabase • Always DYOR
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Documentation;

