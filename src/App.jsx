import React, { useState, useEffect, useRef } from "react";
import ScanForm from "./components/ScanForm.jsx";
import ScanResult from "./components/ScanResult.jsx";

const loadingMessages = [
  "Analyzing contract data...",
  "Extracting narrative claims...",
  "Identifying entities...",
  "Cross-referencing sources...",
  "Generating insights...",
  "Finalizing report..."
];

function App() {
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

  const handleScan = async (contractAddress, forceRefresh) => {
    setLoading(true);
    setErrorMsg("");
    setResult(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractAddress, forceRefresh }),
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
            <a href="#about">About</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#docs">Docs</a>
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
        <section className="hero-section" ref={scanSectionRef}>
          <h1 className="hero-title">Scan Token Narratives</h1>
          <p className="hero-subtitle">Enter a Solana contract address to analyze token claims, extract entities, and verify narratives with AI</p>
        </section>

        <section className="scan-section">
          <ScanForm onScan={handleScan} loading={loading} />

          {loading && (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <p className="loading-message">{loadingMessage}</p>
            </div>
          )}

          {errorMsg && <div className="error">{errorMsg}</div>}

          {result && <ScanResult result={result} />}
        </section>
      </main>

      <footer className="app-footer">
        <div className="app-footer-content">
          <div className="app-footer-links">
            <a href="#about">About</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#docs">Documentation</a>
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

export default App;
