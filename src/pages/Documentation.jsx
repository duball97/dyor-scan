import React from "react";
import { Link } from "react-router-dom";

function Documentation() {
  return (
    <div className="app">
      <header className="site-header">
        <div className="site-header-content">
          <Link to="/" className="logo">
            <span className="logo-text">DYOR</span>
          </Link>
          
          <nav className="site-nav">
            <Link to="/" className="">Home</Link>
            <Link to="/docs" className="active">Documentation</Link>
            <a href="/#how-it-works">How It Works</a>
          </nav>

          <div className="site-header-actions">
            <a href="https://x.com" target="_blank" rel="noopener noreferrer" className="social-link">
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
          <p className="docs-subtitle">AI-Powered Token Narrative Verification for Solana</p>
        </header>

        <section className="docs-section">
          <h2>What is DYOR Scanner?</h2>
          <p>
            DYOR Scanner is an AI-powered tool that analyzes Solana tokens to extract, verify, and classify their narratives. 
            It helps investors make informed decisions by identifying what stories tokens are telling, whether those stories 
            reference real-world events, and what risks might be involved.
          </p>
          <p>
            The scanner combines real-time market data, security analysis, and advanced AI to provide comprehensive token 
            intelligence in seconds.
          </p>
        </section>

        <section className="docs-section">
          <h2>How It Works</h2>
          
          <div className="docs-step">
            <div className="step-number-doc">1</div>
            <div className="step-content-doc">
              <h3>Data Aggregation</h3>
              <p>
                When you paste a Solana contract address, the scanner fetches data from multiple sources:
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
                Our GPT-4 powered AI analyzes the token's information to identify:
              </p>
              <ul>
                <li>The core narrative claim (what story is this token telling?)</li>
                <li>Entities involved (companies, products, people, events)</li>
                <li>Key topics and themes</li>
                <li>References to real-world events or partnerships</li>
              </ul>
            </div>
          </div>

          <div className="docs-step">
            <div className="step-number-doc">3</div>
            <div className="step-content-doc">
              <h3>Reality Verification</h3>
              <p>
                The AI classifies the narrative into one of three categories:
              </p>
              <ul>
                <li><strong>CONFIRMED</strong> - References real, verifiable events/products. Entities are real.</li>
                <li><strong>PARTIAL</strong> - Mix of truth and hype. Real event but exaggerated or unofficial association.</li>
                <li><strong>UNVERIFIED</strong> - Cannot verify claims. Possibly fabricated or misleading.</li>
              </ul>
              <p>
                Each verdict includes a confidence level (high/medium/low) and detailed reasoning.
              </p>
            </div>
          </div>

          <div className="docs-step">
            <div className="step-number-doc">4</div>
            <div className="step-content-doc">
              <h3>Risk Assessment</h3>
              <p>
                The scanner identifies potential red flags such as:
              </p>
              <ul>
                <li>Unverified partnerships or claims</li>
                <li>Security vulnerabilities</li>
                <li>Misleading narratives</li>
                <li>Lack of official affiliation despite claims</li>
              </ul>
            </div>
          </div>

          <div className="docs-step">
            <div className="step-number-doc">5</div>
            <div className="step-content-doc">
              <h3>Comprehensive Report</h3>
              <p>
                You receive a detailed analysis including:
              </p>
              <ul>
                <li>Market data (price, liquidity, volume, 24h change)</li>
                <li>Social links (website, Twitter, Telegram)</li>
                <li>Security risks from RugCheck</li>
                <li>Narrative claim and entities</li>
                <li>Verdict with confidence level</li>
                <li>Red flags (if any)</li>
                <li>Comprehensive notes for investors</li>
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
              The token's narrative references real, verifiable events, products, or announcements. 
              The entities mentioned (companies, products, people) are real. However, this does NOT mean 
              the token is officially affiliated - it may just be referencing real events.
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
              The narrative mixes truth with hype or exaggeration. There may be a real event or product 
              being referenced, but the token's claims are stretched, exaggerated, or imply an unofficial 
              association that doesn't exist.
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
              The narrative's claims cannot be verified through available information. The entities or events 
              mentioned may be fabricated, misleading, or too vague to verify. Exercise extreme caution.
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
              <p>Strong evidence supports this verdict. Multiple sources confirm or deny the narrative claims.</p>
            </div>
            
            <div className="confidence-card">
              <div className="confidence-indicator confidence-medium">MEDIUM</div>
              <h3>Medium Confidence</h3>
              <p>Verdict based on available information, but more research is recommended. Some uncertainty remains.</p>
            </div>
            
            <div className="confidence-card">
              <div className="confidence-indicator confidence-low">LOW</div>
              <h3>Low Confidence</h3>
              <p>Limited information available. Exercise caution and do thorough independent research before investing.</p>
            </div>
          </div>
        </section>

        <section className="docs-section">
          <h2>Data Sources</h2>
          
          <div className="source-grid">
            <div className="source-card">
              <h3>DexScreener</h3>
              <p>Real-time market data including prices, liquidity, volume, and trading pairs across all Solana DEXs.</p>
              <a href="https://dexscreener.com" target="_blank" rel="noopener noreferrer">Visit DexScreener →</a>
            </div>
            
            <div className="source-card">
              <h3>RugCheck</h3>
              <p>Security analysis and risk assessment for Solana tokens. Identifies potential vulnerabilities and scams.</p>
              <a href="https://rugcheck.xyz" target="_blank" rel="noopener noreferrer">Visit RugCheck →</a>
            </div>
            
            <div className="source-card">
              <h3>OpenAI GPT-4</h3>
              <p>Advanced AI for narrative extraction, entity identification, and classification. Powers the analysis engine.</p>
              <a href="https://openai.com" target="_blank" rel="noopener noreferrer">Visit OpenAI →</a>
            </div>
          </div>
        </section>

        <section className="docs-section">
          <h2>API & Technical Details</h2>
          
          <h3>Endpoint</h3>
          <pre className="code-block">POST /api/scan</pre>
          
          <h3>Request Body</h3>
          <pre className="code-block">{`{
  "contractAddress": "string (required)",
  "forceRefresh": boolean (optional, default: false)
}`}</pre>
          
          <h3>Response</h3>
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
  "marketData": { ... },
  "socials": { ... },
  "securityData": { ... },
  "notesForUser": "string"
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
              Verdicts are AI-generated based on available data. Accuracy depends on the quality and completeness 
              of information. Always verify independently. Check the confidence level - high confidence means more 
              reliable, low confidence means less certain.
            </p>
          </div>
          
          <div className="faq-item">
            <h3>What does "CONFIRMED" mean?</h3>
            <p>
              CONFIRMED means the narrative references real events/products. It does NOT mean the token is safe, 
              legitimate, or officially affiliated. A token can reference real events while still being a scam or 
              having no value.
            </p>
          </div>
          
          <div className="faq-item">
            <h3>Why does it take a few seconds?</h3>
            <p>
              The scanner fetches data from multiple APIs (DexScreener, RugCheck), then runs AI analysis. 
              This typically takes 3-5 seconds. Results are cached for faster subsequent scans.
            </p>
          </div>
          
          <div className="faq-item">
            <h3>Can I use this for other blockchains?</h3>
            <p>
              Currently, DYOR Scanner is optimized for Solana tokens. Support for other chains may be added in the future.
            </p>
          </div>
          
          <div className="faq-item">
            <h3>Is my data stored?</h3>
            <p>
              Scan results are cached in Supabase to improve performance. Contract addresses and analysis results 
              are stored, but no personal information is collected.
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

