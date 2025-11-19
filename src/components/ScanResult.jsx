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
    marketData,
    socials,
    securityData,
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

      {marketData && (
        <div className="result-section">
          <h3>Market Data</h3>
          <div className="market-stats">
            {marketData.price && (
              <div className="stat">
                <span className="stat-label">Price</span>
                <span className="stat-value">${parseFloat(marketData.price).toFixed(8)}</span>
              </div>
            )}
            {marketData.liquidity && (
              <div className="stat">
                <span className="stat-label">Liquidity</span>
                <span className="stat-value">${(marketData.liquidity / 1000000).toFixed(2)}M</span>
              </div>
            )}
            {marketData.volume24h && (
              <div className="stat">
                <span className="stat-label">24h Volume</span>
                <span className="stat-value">${(marketData.volume24h / 1000000).toFixed(2)}M</span>
              </div>
            )}
            {marketData.priceChange24h && (
              <div className="stat">
                <span className="stat-label">24h Change</span>
                <span className={`stat-value ${marketData.priceChange24h >= 0 ? 'positive' : 'negative'}`}>
                  {marketData.priceChange24h >= 0 ? '+' : ''}{marketData.priceChange24h.toFixed(2)}%
                </span>
              </div>
            )}
          </div>
          {marketData.dexUrl && (
            <a href={marketData.dexUrl} target="_blank" rel="noopener noreferrer" className="dex-link">
              View on DexScreener →
            </a>
          )}
        </div>
      )}

      {socials && (socials.website || socials.x || socials.telegram) && (
        <div className="result-section">
          <h3>Social Links</h3>
          <div className="socials-list">
            {socials.website && (
              <a href={socials.website} target="_blank" rel="noopener noreferrer" className="social-item">
                🌐 Website
              </a>
            )}
            {socials.x && (
              <a href={socials.x} target="_blank" rel="noopener noreferrer" className="social-item">
                𝕏 Twitter
              </a>
            )}
            {socials.telegram && (
              <a href={socials.telegram} target="_blank" rel="noopener noreferrer" className="social-item">
                📱 Telegram
              </a>
            )}
          </div>
        </div>
      )}

      {securityData && securityData.risks && securityData.risks.length > 0 && (
        <div className="result-section">
          <h3>Security Risks</h3>
          <div className="security-risks">
            {securityData.risks.map((risk, idx) => (
              <div key={idx} className="risk-item">
                <span className="risk-level">{risk.level}</span>
                <span className="risk-description">{risk.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

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

