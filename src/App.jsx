import React, { useState, useEffect, useRef } from "react";
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from "react-router-dom";
import ScanForm from "./components/ScanForm.jsx";
import ScanResult from "./components/ScanResult.jsx";
import Documentation from "./pages/Documentation.jsx";
import ApiKeys from "./pages/ApiKeys.jsx";

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
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [loadingMessage, setLoadingMessage] = useState(loadingMessages[0]);
  const scanSectionRef = useRef(null);
  const howItWorksRef = useRef(null);

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

  useEffect(() => {
    // Handle hash navigation when on home page
    if (location.pathname === '/' && window.location.hash === '#how-it-works') {
      setTimeout(() => {
        const element = document.getElementById('how-it-works');
        element?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [location]);

  const scrollToScan = () => {
    scanSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const scrollToHowItWorks = (e) => {
    if (e) {
      e.preventDefault();
    }
    
    const scrollToElement = () => {
      const element = howItWorksRef.current || document.getElementById('how-it-works');
      if (element) {
        const headerOffset = 80; // Account for fixed header
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    };
    
    if (location.pathname !== '/') {
      // Navigate to home first, then scroll after a delay
      navigate('/');
      setTimeout(scrollToElement, 500);
    } else {
      // Already on home page, scroll immediately
      scrollToElement();
    }
  };

  const handleScan = async (contractAddress) => {
    setLoading(true);
    setErrorMsg("");
    setResult(null);
    
    try {
      const response = await fetch("/api/scan-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractAddress }),
      });

      if (!response.ok) {
        throw new Error(`Scan failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let partialResult = { _streaming: true };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const { type, data } = JSON.parse(line.slice(6));
              
              switch (type) {
                case "status":
                  setLoadingMessage(data.message);
                  break;
                case "tokenInfo":
                  partialResult = { ...partialResult, ...data };
                  setResult({ ...partialResult });
                  break;
                case "marketData":
                  partialResult.marketData = data;
                  setResult({ ...partialResult });
                  break;
                case "securityData":
                  partialResult.securityData = data;
                  setResult({ ...partialResult });
                  break;
                case "fundamentals":
                  partialResult.fundamentals = data;
                  setResult({ ...partialResult });
                  break;
                case "socials":
                  partialResult.socials = data;
                  setResult({ ...partialResult });
                  break;
                case "twitterData":
                  partialResult.twitterData = data;
                  setResult({ ...partialResult });
                  break;
                case "tickerTweets":
                  partialResult.tickerTweets = data;
                  setResult({ ...partialResult });
                  break;
                case "sentimentScore":
                  partialResult.sentimentScore = data.sentimentScore;
                  setResult({ ...partialResult });
                  break;
                case "tokenScore":
                  partialResult.tokenScore = data.tokenScore;
                  setResult({ ...partialResult });
                  break;
                case "narrative":
                  partialResult.narrativeClaim = data.narrativeClaim;
                  setResult({ ...partialResult });
                  break;
                case "summary":
                  partialResult.summary = data.summary;
                  setResult({ ...partialResult });
                  break;
                case "fundamentalsAnalysis":
                  partialResult.fundamentalsAnalysis = data.fundamentalsAnalysis;
                  setResult({ ...partialResult });
                  break;
                case "hypeAnalysis":
                  partialResult.hypeAnalysis = data.hypeAnalysis;
                  setResult({ ...partialResult });
                  break;
                case "complete":
                  partialResult._streaming = false;
                  partialResult.tokenScore = data.tokenScore || partialResult.tokenScore;
                  setResult({ ...partialResult });
                  break;
                case "error":
                  throw new Error(data.message);
              }
            } catch (parseErr) {
              console.warn("Parse error:", parseErr);
            }
          }
        }
      }
    } catch (err) {
      console.error("Scan error:", err);
      setErrorMsg(err.message || "Something went wrong. Please try again.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      <header className="site-header">
        <div className="site-header-content">
          <Link to="/" className="logo">
            <img src="/logo.png" alt="DYOR" className="logo-image" />
            <span className="logo-text">DYOR</span>
          </Link>
          <nav className="site-nav">
            <Link to="/" className={location.pathname === '/' ? 'active' : ''}>Home</Link>
            <Link to="/docs" className={location.pathname === '/docs' ? 'active' : ''}>Documentation</Link>
            <a href="#how-it-works" onClick={scrollToHowItWorks}>How It Works</a>
            <Link to="/api-keys" className={location.pathname === '/api-keys' ? 'active' : ''}>API</Link>
          </nav>

          <div className="site-header-actions">
            <a href="https://x.com/dyorscan" target="_blank" rel="noopener noreferrer" className="social-link">
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
            <p className="hero-subtitle">AI-powered analysis that extracts claims, identifies entities, and verifies narratives from Solana and BNB token data. Make informed decisions with real-time market intelligence.</p>
            
            <div className="hero-scanner">
              <ScanForm onScan={handleScan} loading={loading} />
              
              {loading && (
                <div className="loading-state">
                  <div className="loading-spinner"></div>
                  <p className="loading-message">{loadingMessage}</p>
                </div>
              )}

              {errorMsg && <div className="error">{errorMsg}</div>}
            </div>
          </div>
          <div className="hero-visual">
            {result ? (
              <div className="hero-result">
                <ScanResult result={result} />
              </div>
            ) : (
              <div className="scanner-preview">
                <div className="preview-header">
                  <div className="preview-title">What We Analyze</div>
                  <div className="preview-subtitle">Real-time insights from multiple sources</div>
                </div>
                
                <div className="preview-items">
                  <div className="preview-item">
                    <div className="preview-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                        <line x1="16" y1="13" x2="8" y2="13"></line>
                        <line x1="16" y1="17" x2="8" y2="17"></line>
                        <polyline points="10 9 9 9 8 9"></polyline>
                      </svg>
                    </div>
                    <div className="preview-content">
                      <div className="preview-label">Narrative</div>
                      <div className="preview-detail">AI-powered claim verification</div>
                    </div>
                  </div>

                  <div className="preview-item">
                    <div className="preview-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                      </svg>
                    </div>
                    <div className="preview-content">
                      <div className="preview-label">Social Presence</div>
                      <div className="preview-detail">Twitter, Telegram & website activity</div>
                    </div>
                  </div>

                  <div className="preview-item">
                    <div className="preview-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                      </svg>
                    </div>
                    <div className="preview-content">
                      <div className="preview-label">Security Check</div>
                      <div className="preview-detail">Mint authority, freeze risks & red flags</div>
                    </div>
                  </div>

                  <div className="preview-item">
                    <div className="preview-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                        <polyline points="17 6 23 6 23 12"></polyline>
                      </svg>
                    </div>
                    <div className="preview-content">
                      <div className="preview-label">Hype Meter</div>
                      <div className="preview-detail">Community sentiment & momentum</div>
                    </div>
                  </div>

                  <div className="preview-item">
                    <div className="preview-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <circle cx="12" cy="12" r="6"></circle>
                        <circle cx="12" cy="12" r="2"></circle>
                      </svg>
                    </div>
                    <div className="preview-content">
                      <div className="preview-label">Overall Score</div>
                      <div className="preview-detail">0-100 rating based on all metrics</div>
                    </div>
                  </div>
                </div>

                <div className="preview-footer">
                  <div className="preview-badge">
                    <span className="badge-icon">⚡</span>
                    <span className="badge-text">Results in ~10 seconds</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="features-section">
          <div className="section-header">
            <h2 className="section-title">Advanced Token Intelligence</h2>
            <p className="section-subtitle">Multi-source data aggregation with AI-powered narrative analysis</p>
          </div>
          
          <div className="features-grid">
            <div className="feature-card">
              <h3>Market Data</h3>
              <p>Real-time price, liquidity, and volume from DexScreener. Track 24h changes and trading metrics across Solana and BNB DEXs.</p>
            </div>
            
            <div className="feature-card">
              <h3>Narrative Extraction</h3>
              <p>AI analyzes token descriptions to extract core claims, identify key entities, and understand the project's story.</p>
            </div>
            
            <div className="feature-card">
              <h3>Security Analysis</h3>
              <p>Automated risk assessment from RugCheck. Detect potential vulnerabilities and security concerns before investing.</p>
            </div>
            
            <div className="feature-card">
              <h3>AI Verification</h3>
              <p>GPT-4 powered classification system that evaluates narratives as CONFIRMED, PARTIAL, or UNVERIFIED with detailed reasoning.</p>
            </div>
            
            <div className="feature-card">
              <h3>Social Tracking</h3>
              <p>Aggregate social links including websites, Twitter, and Telegram. Monitor community presence and engagement.</p>
            </div>
            
            <div className="feature-card">
              <h3>Instant Results</h3>
              <p>Sub-5 second analysis with cached results. Get comprehensive insights without waiting for slow data aggregation.</p>
            </div>
          </div>
        </section>

        <section id="how-it-works" ref={howItWorksRef} className="how-it-works-section">
          <div className="section-header">
            <h2 className="section-title">How It Works</h2>
            <p className="section-subtitle">From contract address to verified intelligence in seconds</p>
          </div>
          
          <div className="steps-container">
            <div className="step">
              <div className="step-number">01</div>
              <div className="step-content">
                <h3>Enter Contract Address</h3>
                <p>Paste any Solana or BNB token contract address into the scanner</p>
              </div>
            </div>
            
            <div className="step-connector"></div>
            
            <div className="step">
              <div className="step-number">02</div>
              <div className="step-content">
                <h3>AI-Powered Analysis</h3>
                <p>Aggregate data from multiple sources and extract narrative claims with AI verification</p>
              </div>
            </div>
            
            <div className="step-connector"></div>
            
            <div className="step">
              <div className="step-number">03</div>
              <div className="step-content">
                <h3>Verified Report</h3>
                <p>Receive comprehensive analysis with actionable insights</p>
              </div>
            </div>
          </div>
        </section>

        <section className="api-section">
          <div className="section-header">
            <h2 className="section-title">API Access</h2>
            <p className="section-subtitle">Integrate DYOR Scanner into your platform with our REST API</p>
          </div>
          
          <div className="api-content">
            <div className="api-description">
              <p>
                Build token analysis into your application with our simple REST API. 
                No setup required - just make HTTP requests and get comprehensive token intelligence.
              </p>
              <ul>
                <li>Simple REST API - works with any programming language</li>
                <li>No database setup required on your end</li>
                <li>Real-time token analysis with AI-powered verification</li>
                <li>Rate limits based on your tier</li>
                <li>Comprehensive documentation and examples</li>
              </ul>
              <Link to="/api-keys" className="btn-cta" style={{ display: 'inline-block', marginTop: '20px' }}>
                Get Your API Key
              </Link>
            </div>
            
            <div className="api-example">
              <h3>Quick Example</h3>
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
});`}</pre>
            </div>
          </div>
        </section>

        <section className="scan-section" ref={scanSectionRef}>
          <div className="scan-container">
            <div className="scan-header">
              <h2 className="scan-title">Token Scanner</h2>
              <p className="scan-subtitle">Enter a Solana or BNB contract address to analyze token claims, extract entities, and verify narratives</p>
            </div>
            
            <ScanForm onScan={handleScan} loading={loading} />

            {loading && (
              <div className="loading-state">
                <div className="loading-spinner"></div>
                <p className="loading-message">{loadingMessage}</p>
              </div>
            )}

            {errorMsg && <div className="error">{errorMsg}</div>}
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
          <div className="app-footer-logo">
            <img src="/logo.png" alt="DYOR" className="footer-logo-image" />
          </div>
          <div className="app-footer-links">
            <Link to="/">Home</Link>
            <Link to="/docs">Documentation</Link>
            <a href="#how-it-works" onClick={scrollToHowItWorks}>How It Works</a>
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
        <Route path="/api-keys" element={<ApiKeys />} />
        <Route path="/" element={<AppContent />} />
      </Routes>
    </Router>
  );
}

export default App;
