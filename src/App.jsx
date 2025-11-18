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
        <h1>DYOR Narrative Scan</h1>
        <p>Paste a Solana contract address and we'll unpack the narrative.</p>
      </header>

      <main className="app-main">
        <ScanForm onScan={handleScan} loading={loading} />

        {errorMsg && <div className="error">{errorMsg}</div>}

        {result && <ScanResult result={result} />}
      </main>
    </div>
  );
}

export default App;
