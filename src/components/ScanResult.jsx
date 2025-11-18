import React from "react";

function Pill({ verdict }) {
  const color =
    verdict === "CONFIRMED"
      ? "pill-green"
      : verdict === "PARTIAL"
      ? "pill-yellow"
      : "pill-red";

  return <span className={`pill ${color}`}>{verdict}</span>;
}

function ScanResult({ result }) {
  const {
    tokenName,
    symbol,
    contractAddress,
    narrativeClaim,
    verdict,
    verdictReasoning,
    notesForUser,
    projectSummary,
    entities,
    cached,
  } = result;

  return (
    <section className="scan-result">
      <div className="result-header">
        <div>
          <h2>
            {tokenName || "Unknown Token"} {symbol && <span>({symbol})</span>}
          </h2>
          <p className="ca">CA: {contractAddress}</p>
        </div>
        <div className="verdict-block">
          {verdict && <Pill verdict={verdict} />}
          {cached && <span className="cached-tag">cached</span>}
        </div>
      </div>

      <div className="result-section">
        <h3>What this token is saying</h3>
        <p>{narrativeClaim || "No narrative extracted yet."}</p>
      </div>

      <div className="result-section">
        <h3>Our provisional read</h3>
        <p className="notes">{notesForUser}</p>
        <p className="reasoning">Model reasoning: {verdictReasoning}</p>
      </div>

      <div className="result-section">
        <h3>Entities</h3>
        {entities ? (
          <div className="entities">
            <div>
              <h4>Organizations</h4>
              <ul>
                {entities.organizations?.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Products</h4>
              <ul>
                {entities.products?.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4>Topics</h4>
              <ul>
                {entities.topics?.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p>No entities parsed.</p>
        )}
      </div>

      <div className="result-section">
        <h3>Raw summary</h3>
        <pre className="summary-pre">{projectSummary}</pre>
      </div>

      <div className="result-section">
        <h3>Debug JSON</h3>
        <pre className="debug-pre">
          {JSON.stringify(result, null, 2)}
        </pre>
      </div>
    </section>
  );
}

export default ScanResult;

