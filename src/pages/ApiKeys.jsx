import React, { useState } from "react";
import { Link } from "react-router-dom";

function ApiKeys() {
  const [apiKey, setApiKey] = useState("");
  const [keyName, setKeyName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [tier] = useState("free"); // Only free tier available for now
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleRequestKey = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch("/api/request-api-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyName,
          userEmail,
          tier,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to request API key");
      }

      setApiKey(data.apiKey);
      setSuccess("API key generated successfully!");
      setKeyName("");
      setUserEmail("");
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
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
            <Link to="/" className="">Home</Link>
            <Link to="/docs" className="">Documentation</Link>
            <a href="/#how-it-works" onClick={(e) => { e.preventDefault(); window.location.href = '/#how-it-works'; }}>How It Works</a>
            <Link to="/api-keys" className="active">API</Link>
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
            <h1>API Keys</h1>
            <p className="docs-subtitle">Get your API key to integrate DYOR Scanner into your platform</p>
          </header>

          <section className="docs-section">
            <h2>Request an API Key</h2>
            <p style={{ marginBottom: "32px" }}>
              API keys allow you to use DYOR Scanner programmatically in your applications. 
              Fill out the form below to generate a new API key.
            </p>

            {error && (
              <div className="error" style={{ marginBottom: "24px", padding: "16px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", borderRadius: "6px", color: "#ef4444", fontSize: "14px" }}>
                {error}
              </div>
            )}

            {success && (
              <div className="success" style={{ marginBottom: "24px", padding: "16px", background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.3)", borderRadius: "6px", color: "#22c55e", fontSize: "14px" }}>
                {success}
              </div>
            )}

            {apiKey && (
              <div className="api-key-display" style={{ 
                marginBottom: "30px", 
                padding: "24px", 
                background: "#0a0a0a", 
                border: "1px solid #2a2a2a", 
                borderRadius: "8px" 
              }}>
                <h3 style={{ marginTop: 0, marginBottom: "12px", color: "#e0e0e0" }}>Your API Key</h3>
                <p style={{ marginBottom: "16px", color: "#909090", fontSize: "14px" }}>
                  <strong>Important:</strong> Copy this key now. It will not be shown again.
                </p>
                <div style={{ 
                  display: "flex", 
                  gap: "12px", 
                  alignItems: "center",
                  background: "#000000",
                  padding: "16px",
                  borderRadius: "6px",
                  fontFamily: "monospace",
                  fontSize: "14px",
                  wordBreak: "break-all",
                  border: "1px solid #2a2a2a"
                }}>
                  <code style={{ color: "#c0c0c0", flex: 1 }}>{apiKey}</code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(apiKey);
                      alert("API key copied to clipboard!");
                    }}
                    style={{
                      padding: "8px 16px",
                      background: "#ffffff",
                      color: "#000000",
                      border: "1px solid #404040",
                      borderRadius: "4px",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: 600,
                      transition: "all 0.2s"
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = "#f0f0f0";
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = "#ffffff";
                    }}
                  >
                    Copy
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleRequestKey} style={{ maxWidth: "600px", margin: "0 auto" }}>
              <div style={{ marginBottom: "24px" }}>
                <label htmlFor="keyName" style={{ display: "block", marginBottom: "10px", fontWeight: 500, color: "#c0c0c0" }}>
                  Key Name <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="text"
                  id="keyName"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  required
                  placeholder="My Application"
                  style={{
                    width: "100%",
                    padding: "14px",
                    background: "#0a0a0a",
                    border: "1px solid #2a2a2a",
                    borderRadius: "6px",
                    color: "#e0e0e0",
                    fontSize: "14px",
                    boxSizing: "border-box"
                  }}
                />
                <p style={{ marginTop: "8px", fontSize: "12px", color: "#606060" }}>
                  A descriptive name for your API key (e.g., "Production App", "Testing")
                </p>
              </div>

              <div style={{ marginBottom: "24px" }}>
                <label htmlFor="userEmail" style={{ display: "block", marginBottom: "10px", fontWeight: 500, color: "#c0c0c0" }}>
                  Email Address <span style={{ color: "#ef4444" }}>*</span>
                </label>
                <input
                  type="email"
                  id="userEmail"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  required
                  placeholder="your@email.com"
                  style={{
                    width: "100%",
                    padding: "14px",
                    background: "#0a0a0a",
                    border: "1px solid #2a2a2a",
                    borderRadius: "6px",
                    color: "#e0e0e0",
                    fontSize: "14px",
                    boxSizing: "border-box"
                  }}
                />
                <p style={{ marginTop: "8px", fontSize: "12px", color: "#606060" }}>
                  We'll use this to contact you about your API usage
                </p>
              </div>

              <div style={{ marginBottom: "32px" }}>
                <label htmlFor="tier" style={{ display: "block", marginBottom: "10px", fontWeight: 500, color: "#c0c0c0" }}>
                  Tier
                </label>
                <div style={{
                  width: "100%",
                  padding: "14px",
                  background: "#0a0a0a",
                  border: "1px solid #2a2a2a",
                  borderRadius: "6px",
                  color: "#e0e0e0",
                  fontSize: "14px",
                  boxSizing: "border-box"
                }}>
                  Free - 10 requests/minute, 100 requests/day
                </div>
                <p style={{ marginTop: "8px", fontSize: "12px", color: "#606060" }}>
                  Free tier is currently the only available option
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: "100%",
                  padding: "14px",
                  background: loading ? "#2a2a2a" : "#000000",
                  color: loading ? "#606060" : "#ffffff",
                  border: "1px solid #404040",
                  borderRadius: "6px",
                  fontSize: "16px",
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "all 0.2s"
                }}
              >
                {loading ? "Generating..." : "Generate API Key"}
              </button>
            </form>
          </section>

          <section className="docs-section">
            <h2>How to Use Your API Key</h2>
            <p>Include your API key in the <code>Authorization</code> header:</p>
            <pre className="code-block">{`fetch('https://your-domain.com/api/scan', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_API_KEY_HERE'
  },
  body: JSON.stringify({
    contractAddress: 'So11111111111111111111111111111111111111112'
  })
})`}</pre>
          </section>

          <section className="docs-section">
            <h2>Rate Limits</h2>
            <div className="source-grid">
              <div className="source-card">
                <h3>Free</h3>
                <p><strong>10 requests/minute</strong></p>
                <p><strong>100 requests/day</strong></p>
                <p>Perfect for testing and low-volume applications</p>
              </div>
            </div>
            <p style={{ marginTop: "24px", color: "#909090", fontSize: "14px" }}>
              Additional tiers (Starter, Pro, Enterprise) will be available soon. Contact us at <a href="mailto:api@dyorscanner.com" style={{ color: "#c0c0c0", textDecoration: "underline" }}>api@dyorscanner.com</a> for custom solutions.
            </p>
          </section>

          <section className="docs-section">
            <h2>API Documentation</h2>
            <p>
              For complete API documentation, including request/response formats, error handling, and examples, 
              see our <Link to="/docs" style={{ color: "#c0c0c0", textDecoration: "underline" }}>Documentation</Link> page.
            </p>
            <p style={{ marginTop: "12px" }}>
              You can also check out the <a href="/API_DISTRIBUTION.md" target="_blank" rel="noopener noreferrer" style={{ color: "#c0c0c0", textDecoration: "underline" }}>API Distribution Guide</a> for detailed integration examples.
            </p>
          </section>

          <section className="docs-section">
            <h2>Support</h2>
            <p>
              Need help? Contact us at <a href="mailto:api@dyorscanner.com" style={{ color: "#c0c0c0", textDecoration: "underline" }}>api@dyorscanner.com</a>
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
            <a href="/#how-it-works" onClick={(e) => { e.preventDefault(); window.location.href = '/#how-it-works'; }}>How It Works</a>
            <Link to="/api-keys">API Keys</Link>
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

export default ApiKeys;

