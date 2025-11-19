import React, { useState, useEffect, useRef } from "react";
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from "react-router-dom";
import ScanForm from "./components/ScanForm.jsx";
import ScanResult from "./components/ScanResult.jsx";
import Documentation from "./pages/Documentation.jsx";

const loadingMessages = [
  "Analyzing contract data...",
  "Extracting narrative claims...",
  "Identifying entities...",
  "Cross-referencing sources...",
  "Generating insights...",
  "Finalizing report..."
];

function AppContent() {
  const location = useLocation();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [loadingMessage, setLoadingMessage] = useState(loadingMessages[0]);
  const scanSectionRef = useRef(null);

  useEffect(() => {
    if (loading) {
      let index = 0;
      const interval = setInterval(() => {
        index = (index + 1) % loadingMessages.length;
        setLoadingMessage(loadingMessages[index]);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [loading]);

  const scrollToScan = () => {
    scanSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleScan = async (contractAddress) => {
    setLoading(true);
    setErrorMsg("");
    setResult(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractAddress }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Scan failed");
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="site-header">
        <div className="site-header-content">
          <div className="logo">
            <span className="logo-text">DYOR</span>
          </div>
          
          <nav className="site-nav">
            <Link to="/" className={location.pathname === '/' ? 'active' : ''}>Home</Link>
            <Link to="/docs" className={location.pathname === '/docs' ? 'active' : ''}>Documentation</Link>
            <a href="#how-it-works">How It Works</a>
          </nav>

          <div className="site-header-actions">
            <a href="https://x.com" target="_blank" rel="noopener noreferrer" className="social-link">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
            <button onClick={scrollToScan} className="btn-scan-header">Scan Token</button>
          </div>
        </div>
      </header>

      <main className="app-main">
        <section className="hero-section">
          <div className="hero-content">
            <div className="hero-badge">POWERED BY AI</div>
            <h1 className="hero-title">Verify Token Narratives<br/>Before You Invest</h1>
            <p className="hero-subtitle">AI-powered analysis that extracts claims, identifies entities, and verifies narratives from Solana token data. Make informed decisions with real-time market intelligence.</p>
            <button onClick={scrollToScan} className="btn-hero">Start Scanning</button>
          </div>
          <div className="hero-visual">
            <div className="visual-grid">
              <div className="grid-item">
                <div className="stat-number">10K+</div>
                <div className="stat-label">Tokens Analyzed</div>
              </div>
              <div className="grid-item">
                <div className="stat-number">98%</div>
                <div className="stat-label">Accuracy Rate</div>
              </div>
              <div className="grid-item">
                <div className="stat-number">&lt;5s</div>
                <div className="stat-label">Scan Time</div>
              </div>
            </div>
          </div>
        </section>

        <section className="features-section">
          <div className="section-header">
            <h2 className="section-title">Advanced Token Intelligence</h2>
            <p className="section-subtitle">Multi-source data aggregation with AI-powered narrative analysis</p>
          </div>
          
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h3>Market Data</h3>
              <p>Real-time price, liquidity, and volume from DexScreener. Track 24h changes and trading metrics across all Solana DEXs.</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">🔍</div>
              <h3>Narrative Extraction</h3>
              <p>AI analyzes token descriptions to extract core claims, identify key entities, and understand the project's story.</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">🛡️</div>
              <h3>Security Analysis</h3>
              <p>Automated risk assessment from RugCheck. Detect potential vulnerabilities and security concerns before investing.</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">🤖</div>
              <h3>AI Verification</h3>
              <p>GPT-4 powered classification system that evaluates narratives as CONFIRMED, PARTIAL, or UNVERIFIED with detailed reasoning.</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">🌐</div>
              <h3>Social Tracking</h3>
              <p>Aggregate social links including websites, Twitter, and Telegram. Monitor community presence and engagement.</p>
            </div>
            
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <h3>Instant Results</h3>
              <p>Sub-5 second analysis with cached results. Get comprehensive insights without waiting for slow data aggregation.</p>
            </div>
          </div>
        </section>

        <section className="how-it-works-section">
          <div className="section-header">
            <h2 className="section-title">How It Works</h2>
            <p className="section-subtitle">From contract address to verified intelligence in seconds</p>
          </div>
          
          <div className="steps-container">
            <div className="step">
              <div className="step-number">01</div>
              <div className="step-content">
                <h3>Enter Contract Address</h3>
                <p>Paste any Solana token contract address into the scanner</p>
              </div>
            </div>
            
            <div className="step-connector"></div>
            
            <div className="step">
              <div className="step-number">02</div>
              <div className="step-content">
                <h3>Data Aggregation</h3>
                <p>Fetch market data, security scores, and social profiles from multiple sources</p>
              </div>
            </div>
            
            <div className="step-connector"></div>
            
            <div className="step">
              <div className="step-number">03</div>
              <div className="step-content">
                <h3>AI Analysis</h3>
                <p>Extract narrative claims, identify entities, and classify credibility</p>
              </div>
            </div>
            
            <div className="step-connector"></div>
            
            <div className="step">
              <div className="step-number">04</div>
              <div className="step-content">
                <h3>Verified Report</h3>
                <p>Receive comprehensive analysis with actionable insights</p>
              </div>
            </div>
          </div>
        </section>

        <section className="scan-section" ref={scanSectionRef}>
          <div className="scan-container">
            <div className="scan-header">
              <h2 className="scan-title">Token Scanner</h2>
              <p className="scan-subtitle">Enter a Solana contract address to analyze token claims, extract entities, and verify narratives</p>
            </div>
            
            <ScanForm onScan={handleScan} loading={loading} />

            {loading && (
              <div className="loading-state">
                <div className="loading-spinner"></div>
                <p className="loading-message">{loadingMessage}</p>
              </div>
            )}

            {errorMsg && <div className="error">{errorMsg}</div>}

            {result && <ScanResult result={result} />}
          </div>
        </section>

        <section className="cta-section">
          <div className="cta-content">
            <h2>Ready to Verify Token Narratives?</h2>
            <p>Join thousands of traders making smarter decisions with AI-powered token intelligence</p>
            <button onClick={scrollToScan} className="btn-cta">Scan Your First Token</button>
          </div>
        </section>
      </main>

      <footer className="app-footer">
        <div className="app-footer-content">
          <div className="app-footer-links">
            <Link to="/">Home</Link>
            <Link to="/docs">Documentation</Link>
            <a href="#how-it-works">How It Works</a>
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

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/docs" element={<Documentation />} />
        <Route path="/" element={<AppContent />} />
      </Routes>
    </Router>
  );
}

export default App;
