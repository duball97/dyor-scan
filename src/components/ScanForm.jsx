import React, { useState } from "react";

function ScanForm({ onScan, loading }) {
  const [contractAddress, setContractAddress] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!contractAddress.trim()) return;
    onScan(contractAddress.trim());
  };

  return (
    <form className="scan-form" onSubmit={handleSubmit}>
      <label>
        Contract address
        <input
          type="text"
          placeholder="Paste Solana or BNB contract address..."
          value={contractAddress}
          onChange={(e) => setContractAddress(e.target.value)}
        />
      </label>

      <button type="submit" disabled={loading}>
        {loading ? "Scanning..." : "Scan"}
      </button>
    </form>
  );
}

export default ScanForm;

