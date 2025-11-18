import React, { useState } from "react";

function ScanForm({ onScan, loading }) {
  const [contractAddress, setContractAddress] = useState("");
  const [forceRefresh, setForceRefresh] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!contractAddress.trim()) return;
    onScan(contractAddress.trim(), forceRefresh);
  };

  return (
    <form className="scan-form" onSubmit={handleSubmit}>
      <label>
        Contract address
        <input
          type="text"
          placeholder="Paste Solana CA..."
          value={contractAddress}
          onChange={(e) => setContractAddress(e.target.value)}
        />
      </label>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={forceRefresh}
          onChange={(e) => setForceRefresh(e.target.checked)}
        />
        Force fresh scan (ignore cache)
      </label>

      <button type="submit" disabled={loading}>
        {loading ? "Scanning..." : "Scan"}
      </button>
    </form>
  );
}

export default ScanForm;

