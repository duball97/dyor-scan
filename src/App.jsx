import React, { useState } from "react";
import ScanForm from "./components/ScanForm.jsx";
import ScanResult from "./components/ScanResult.jsx";

function App() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleScan = async (contractAddress, forceRefresh) => {
    setLoading(true);
    setErrorMsg("");
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
      <header className="app-header">
        <div className="app-header-content">
          <h1>DYOR Narrative Scan</h1>
          <p>Paste a Solana contract address and we'll unpack the narrative with AI-powered analysis.</p>
        </div>
      </header>

      <main className="app-main">
        <ScanForm onScan={handleScan} loading={loading} />

        {errorMsg && <div className="error">{errorMsg}</div>}

        {result && <ScanResult result={result} />}
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
