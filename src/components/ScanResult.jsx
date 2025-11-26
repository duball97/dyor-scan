import React, { useState } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

// Loading indicator for streaming sections
function SectionLoader({ text = "Generating..." }) {
  return (
    <div className="section-loader">
      <div className="loader-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <span className="loader-text">{text}</span>
    </div>
  );
}

function Pill({ verdict }) {
  const color =
    verdict === "CONFIRMED"
      ? "pill-green"
      : verdict === "PARTIAL"
      ? "pill-yellow"
      : "pill-red";

  return <span className={`pill ${color}`}>{verdict}</span>;
}

function ScoreCircle({ score }) {
  const getScoreColor = (score) => {
    if (score >= 70) return "#4ade80"; // green
    if (score >= 50) return "#fbbf24"; // yellow
    if (score >= 30) return "#f97316"; // orange
    return "#ef4444"; // red
  };

  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="score-circle-container">
      <svg className="score-circle" viewBox="0 0 100 100">
        <circle
          className="score-circle-bg"
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="#2a2a2a"
          strokeWidth="8"
        />
        <circle
          className="score-circle-progress"
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke={getScoreColor(score)}
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
      </svg>
      <div className="score-text">
        <span className="score-number">{score}</span>
        <span className="score-label">/100</span>
      </div>
    </div>
  );
}

// Format price to prevent overflow - intelligently choose decimal places
function formatPrice(price) {
  if (!price) return "N/A";
  
  const numPrice = parseFloat(price);
  if (isNaN(numPrice)) return "N/A";
  
  // For very small prices (< 0.0001), show more decimals
  if (numPrice < 0.0001) {
    return `$${numPrice.toFixed(8)}`;
  }
  // For small prices (< 1), show 6 decimals
  else if (numPrice < 1) {
    return `$${numPrice.toFixed(6)}`;
  }
  // For medium prices (< 1000), show 4 decimals
  else if (numPrice < 1000) {
    return `$${numPrice.toFixed(4)}`;
  }
  // For larger prices, show 2 decimals
  else {
    return `$${numPrice.toFixed(2)}`;
  }
}

// Render text with markdown bold (**text**) converted to <strong> tags
function renderWithBold(text) {
  if (!text) return null;
  
  const parts = [];
  let lastIndex = 0;
  const boldRegex = /\*\*(.+?)\*\*/g;
  let match;
  
  while ((match = boldRegex.exec(text)) !== null) {
    // Add text before the bold
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    // Add the bold text
    parts.push(<strong key={match.index}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }
  
  return parts.length > 0 ? parts : text;
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
    summary,
    fundamentalsAnalysis,
    hypeAnalysis,
    projectSummary,
    entities,
    cached,
    marketData,
    _streaming = false, // Flag indicating if still streaming
    socials,
    securityData,
    confidence,
    sentimentScore,
    fundamentals,
    birdeye,
    tokenScore,
    twitterData,
    tickerTweets,
  } = result;

  const [copySuccess, setCopySuccess] = useState(false);
  const [downloadingPDF, setDownloadingPDF] = useState(false);

  const formatFullReport = () => {
    let report = `DYOR SCAN REPORT\n`;
    report += `${"=".repeat(50)}\n\n`;
    report += `TOKEN: ${tokenName || "Unknown Token"} (${symbol || "N/A"})\n`;
    report += `CONTRACT: ${contractAddress}\n`;
    report += `SCORE: ${tokenScore || 50}/100\n`;

    if (summary) {
      report += `SUMMARY\n`;
      report += `${"-".repeat(50)}\n`;
      report += `${summary}\n\n`;
    }

    if (fundamentalsAnalysis) {
      report += `FUNDAMENTALS\n`;
      report += `${"-".repeat(50)}\n`;
      report += `${fundamentalsAnalysis}\n\n`;
    }

    if (hypeAnalysis) {
      report += `HYPE\n`;
      report += `${"-".repeat(50)}\n`;
      report += `${hypeAnalysis}\n\n`;
    }

    // Legacy support
    if (!summary && !fundamentalsAnalysis && !hypeAnalysis && notesForUser) {
      report += `ANALYSIS\n`;
      report += `${"-".repeat(50)}\n`;
      report += `${notesForUser}\n\n`;
    }

    if (marketData) {
      report += `MARKET DATA\n`;
      report += `${"-".repeat(50)}\n`;
      if (marketData.price) report += `Price: $${parseFloat(marketData.price).toFixed(8)}\n`;
      if (marketData.liquidity) report += `Liquidity: $${(marketData.liquidity / 1000000).toFixed(2)}M\n`;
      if (marketData.volume24h) report += `24h Volume: $${(marketData.volume24h / 1000000).toFixed(2)}M\n`;
      if (marketData.priceChange24h) report += `24h Change: ${marketData.priceChange24h >= 0 ? '+' : ''}${marketData.priceChange24h.toFixed(2)}%\n`;
      report += `\n`;
    }

    if (fundamentals) {
      report += `ON-CHAIN DATA\n`;
      report += `${"-".repeat(50)}\n`;
      if (fundamentals.supply) report += `Supply: ${fundamentals.supply}\n`;
      if (fundamentals.holderCount) report += `Holders: ${fundamentals.holderCount}\n`;
      if (fundamentals.mintAuthority) report += `Mint Authority: ${fundamentals.mintAuthority}\n`;
      if (fundamentals.freezeAuthority) report += `Freeze Authority: ${fundamentals.freezeAuthority}\n`;
      report += `\n`;
    }

    report += `NARRATIVE CLAIM\n`;
    report += `${"-".repeat(50)}\n`;
    report += `${narrativeClaim || "No narrative extracted."}\n\n`;


    if (result.redFlags && result.redFlags.length > 0) {
      report += `CONCERNS\n`;
      report += `${"-".repeat(50)}\n`;
      result.redFlags.forEach((flag, idx) => {
        report += `${idx + 1}. ${flag}\n`;
      });
      report += `\n`;
    }

    if (entities?.topics && entities.topics.length > 0) {
      report += `RELATED TOPICS\n`;
      report += `${"-".repeat(50)}\n`;
      report += `${entities.topics.join(", ")}\n\n`;
    }

    report += `Generated by DYOR Scanner\n`;
    report += `${new Date().toISOString()}\n`;

    return report;
  };

  const handleCopyReport = async () => {
    try {
      const report = formatFullReport();
      await navigator.clipboard.writeText(report);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleDownloadPDF = async () => {
    setDownloadingPDF(true);
    try {
      const element = document.querySelector('.scan-result');
      if (!element) {
        throw new Error("Report element not found");
      }

      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: '#0d0d0d',
        logging: false,
        useCORS: true,
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = Math.min((pdfWidth - 20) / imgWidth, (pdfHeight - 20) / imgHeight);
      
      let heightLeft = imgHeight * ratio;
      let position = 10;
      
      pdf.addImage(imgData, 'PNG', 10, position, imgWidth * ratio, imgHeight * ratio);
      heightLeft -= (pdfHeight - 20);
      
      while (heightLeft > 0) {
        position = heightLeft - imgHeight * ratio + 10;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 10, position, imgWidth * ratio, imgHeight * ratio);
        heightLeft -= (pdfHeight - 20);
      }
      
      const fileName = `${(tokenName || 'token').replace(/\s+/g, '_')}_${(symbol || 'scan').replace(/[^a-zA-Z0-9]/g, '')}_${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(fileName);
      
      setTimeout(() => setDownloadingPDF(false), 1000);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
      alert("Failed to generate PDF. Please try again.");
      setDownloadingPDF(false);
    }
  };

  // Parse summary into structured sections - only if text has clear headers
  const parseSummary = (text) => {
    if (!text) return null;
    
    // Check if text has clear markdown-style section headers
    const markdownHeaderPattern = /\*\*(.+?)\*\*:\s*/g;
    const headers = [...text.matchAll(markdownHeaderPattern)];
    
    if (headers.length > 0) {
      // Text has markdown headers - parse them
      const sections = {};
      let lastIndex = 0;
      
      headers.forEach((match, idx) => {
        const headerText = match[1].toLowerCase();
        const startPos = match.index;
        
        // Get text before this header (if first header, it's the intro)
        if (idx === 0 && startPos > 0) {
          sections.intro = text.substring(0, startPos).trim();
        }
        
        // Get text for this section (until next header or end)
        const nextHeader = headers[idx + 1];
        const endPos = nextHeader ? nextHeader.index : text.length;
        const sectionText = text.substring(startPos + match[0].length, endPos).trim();
        
        // Map headers to section names - updated for new structure
        if (headerText.includes('summary')) {
          sections.summary = sectionText;
        } else if (headerText.includes('narrative')) {
          sections.narrative = sectionText;
        } else if (headerText.includes('fundamentals') || headerText.includes('token fundamentals')) {
          sections.fundamentals = sectionText;
        } else if (headerText.includes('hype')) {
          sections.hype = sectionText;
        }
        // Legacy support for old format
        else if (headerText.includes('what this token') || headerText.includes('about this token')) {
          sections.about = sectionText;
        } else if (headerText.includes('reality check') || headerText.includes('verdict') || headerText.includes('assessment')) {
          sections.assessment = sectionText;
        } else if (headerText.includes('what this means') || headerText.includes('implications') || headerText.includes('what to know')) {
          sections.insights = sectionText;
        }
      });
      
      if (Object.keys(sections).length > 0) {
        return sections;
      }
    }
    
    // No clear headers found - display as single block
    return null;
  };

  const summarySections = parseSummary(notesForUser);

  return (
    <section className="scan-result">
      <div className="result-header">
        <div className="result-header-main">
          <h2>
            {tokenName || "Unknown Token"} {symbol && <span className="symbol">({symbol})</span>}
          </h2>
          <p className="ca">{contractAddress}</p>
        </div>
        <div className="result-header-aside">
          {tokenScore !== undefined && tokenScore !== null ? (
            <div className="score-display">
              <ScoreCircle score={tokenScore} />
              <span className="score-label-text">Overall Score</span>
            </div>
          ) : (
            <div className="score-display">
              <div className="score-loading">
                <div className="loader-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
              <span className="score-label-text">Calculating Score...</span>
            </div>
          )}
          <div className="verdict-block">
            {cached && <span className="cached-tag">cached</span>}
          </div>
        </div>
      </div>

      <div className="result-actions">
        <a 
          href={`https://www.dexview.com/solana/${contractAddress}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-view-chart"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
          View Chart
        </a>
        <button onClick={handleCopyReport} className="btn-copy-report">
          {copySuccess ? "✓ Copied!" : "📋 Copy Report"}
        </button>
        <button onClick={handleDownloadPDF} className="btn-download-pdf" disabled={downloadingPDF}>
          {downloadingPDF ? "⏳ Generating..." : "📄 Download PDF"}
        </button>
      </div>

      {/* Analysis Sections - Show loading states when streaming */}
      <div className="analysis-section summary-section">
        <h3 className="analysis-section-title">SUMMARY</h3>
        {summary ? (
          <div className="analysis-text">
            {summary.split('\n').map((line, idx) => {
              const trimmed = line.trim();
              if (!trimmed) return null;
              // Check if line already has bullet point markers
              if (trimmed.match(/^[•\-\*]\s/) || trimmed.match(/^[0-9]+\.\s/)) {
                return (
                  <div key={idx} style={{ marginBottom: '0.5rem', paddingLeft: '1rem' }}>
                    {renderWithBold(trimmed)}
                  </div>
                );
              }
              // Convert regular lines to bullet points
              return (
                <div key={idx} style={{ marginBottom: '0.5rem', paddingLeft: '1rem' }}>
                  • {renderWithBold(trimmed)}
                </div>
              );
            })}
          </div>
        ) : _streaming ? (
          <SectionLoader text="Generating summary..." />
        ) : null}
      </div>

      <div className="analysis-section fundamentals-section">
        <h3 className="analysis-section-title">FUNDAMENTALS</h3>
        {fundamentalsAnalysis ? (
          <p className="analysis-text">{renderWithBold(fundamentalsAnalysis)}</p>
        ) : _streaming ? (
          <SectionLoader text="Analyzing fundamentals..." />
        ) : null}
      </div>

      <div className="analysis-section hype-section">
        <h3 className="analysis-section-title">HYPE</h3>
        {hypeAnalysis ? (
          <p className="analysis-text">{renderWithBold(hypeAnalysis)}</p>
        ) : _streaming ? (
          <SectionLoader text="Analyzing market sentiment..." />
        ) : null}
      </div>

      {/* Legacy support for old cached results */}
      {!summary && !fundamentalsAnalysis && !hypeAnalysis && notesForUser && (
        <div className="result-summary-section">
          <h3 className="summary-title">Analysis</h3>
          <div className="summary-content">
            {summarySections ? (
              <>
                {Object.entries(summarySections).map(([key, value]) => 
                  value ? (
                    <div className="summary-block" key={key}>
                      {key !== 'intro' && <h4>{key.charAt(0).toUpperCase() + key.slice(1)}</h4>}
                      <p className="summary-text">{value}</p>
                    </div>
                  ) : null
                )}
              </>
            ) : (
              <div className="summary-block">
                <p className="summary-text">{notesForUser}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Key Metrics Grid */}
      <div className="metrics-grid">
        {marketData?.price && (
          <div className="metric-card">
            <div className="metric-label">Price</div>
            <div className="metric-value">{formatPrice(marketData.price)}</div>
          </div>
        )}
        {marketData?.liquidity && (
          <div className="metric-card">
            <div className="metric-label">Liquidity</div>
            <div className="metric-value">${(marketData.liquidity / 1000000).toFixed(2)}M</div>
          </div>
        )}
        {fundamentals?.holderCount && (
          <div className="metric-card">
            <div className="metric-label">Holders</div>
            <div className="metric-value">{fundamentals.holderCount.toLocaleString()}</div>
          </div>
        )}
        {marketData?.volume24h && (
          <div className="metric-card">
            <div className="metric-label">24h Volume</div>
            <div className="metric-value">${(marketData.volume24h / 1000000).toFixed(2)}M</div>
          </div>
        )}
        {marketData?.priceChange24h !== null && marketData?.priceChange24h !== undefined && (
          <div className="metric-card">
            <div className="metric-label">24h Change</div>
            <div className={`metric-value ${marketData.priceChange24h >= 0 ? 'positive' : 'negative'}`}>
              {marketData.priceChange24h >= 0 ? '+' : ''}{marketData.priceChange24h.toFixed(2)}%
            </div>
          </div>
        )}
        {sentimentScore !== null && sentimentScore !== undefined && (
          <div className="metric-card">
            <div className="metric-label">Sentiment</div>
            <div className="metric-value">{sentimentScore}/100</div>
          </div>
        )}
      </div>

      {/* Security Status */}
      {securityData && (
        <div className="result-section">
          <h3>Security Analysis</h3>
          {securityData.risks && securityData.risks.length > 0 ? (
            <div className="security-risks">
              {securityData.risks.map((risk, idx) => (
                <div key={idx} className="risk-item">
                  <span className={`risk-badge risk-${risk.level}`}>{risk.level}</span>
                  <span className="risk-description">{risk.description}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="security-good">
              <span className="check-icon">✓</span>
              <span>No significant security risks detected</span>
            </div>
          )}
          {fundamentals && (
            <div className="security-details">
              {fundamentals.mintAuthority === null && (
                <div className="security-detail good">
                  <span>✓</span> No mint authority (safe)
                </div>
              )}
              {fundamentals.freezeAuthority === null && (
                <div className="security-detail good">
                  <span>✓</span> No freeze authority (safe)
                </div>
              )}
              {fundamentals.mintAuthority && (
                <div className="security-detail warning">
                  <span>⚠</span> Has mint authority (can create new tokens)
                </div>
              )}
              {fundamentals.freezeAuthority && (
                <div className="security-detail warning">
                  <span>⚠</span> Has freeze authority (can freeze accounts)
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Narrative */}
      <div className="result-section">
        <h3>Narrative</h3>
        <p className="narrative-text">{narrativeClaim || "No narrative extracted yet."}</p>
      </div>

      {/* Detailed Analysis */}

      {/* Social Links */}
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

      {/* X Posts About Token */}
      {_streaming && !tickerTweets && (
        <div className="result-section">
          <h3>Recent X Posts About {symbol}</h3>
          <div className="section-loader">
            <div className="loader-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span className="loader-text">Fetching tweets...</span>
          </div>
        </div>
      )}
      {tickerTweets && tickerTweets.tweets && tickerTweets.tweets.length > 0 && (
        <div className="result-section">
          <h3>Recent X Posts About {symbol}</h3>
          <div className="tweets-list">
            {tickerTweets.tweets
              .filter(tweet => tweet.tweetUrl) // Only show tweets with URLs
              .slice(0, 3)
              .map((tweet, idx) => (
                <div key={idx} className="tweet-item">
                  <div className="tweet-content">
                    <p className="tweet-text">{tweet.text || "No text available"}</p>
                    {tweet.date && (
                      <span className="tweet-date">
                        {new Date(tweet.date).toLocaleDateString()}
                      </span>
                    )}
                    {(tweet.likes || tweet.retweets) && (
                      <div className="tweet-stats">
                        {tweet.likes && <span>❤️ {tweet.likes}</span>}
                        {tweet.retweets && <span>🔄 {tweet.retweets}</span>}
                      </div>
                    )}
                  </div>
                  <a 
                    href={tweet.tweetUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="tweet-link"
                  >
                    View on X →
                  </a>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* X Posts from Token Profile */}
      {_streaming && !twitterData && socials?.x && (
        <div className="result-section">
          <h3>Recent X Posts from Profile</h3>
          <div className="section-loader">
            <div className="loader-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span className="loader-text">Fetching profile tweets...</span>
          </div>
        </div>
      )}
      {twitterData && twitterData.tweets && twitterData.tweets.length > 0 && (
        <div className="result-section">
          <h3>Recent X Posts from Profile</h3>
          <div className="tweets-list">
            {twitterData.tweets
              .filter(tweet => tweet.tweetUrl) // Only show tweets with URLs
              .slice(0, 3)
              .map((tweet, idx) => (
                <div key={idx} className="tweet-item">
                  <div className="tweet-content">
                    <p className="tweet-text">{tweet.text || "No text available"}</p>
                    {tweet.date && (
                      <span className="tweet-date">
                        {new Date(tweet.date).toLocaleDateString()}
                      </span>
                    )}
                    {(tweet.likes || tweet.retweets) && (
                      <div className="tweet-stats">
                        {tweet.likes && <span>❤️ {tweet.likes}</span>}
                        {tweet.retweets && <span>🔄 {tweet.retweets}</span>}
                      </div>
                    )}
                  </div>
                  <a 
                    href={tweet.tweetUrl} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="tweet-link"
                  >
                    View on X →
                  </a>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Topics */}
      {entities && entities.topics && entities.topics.length > 0 && (
        <div className="result-section">
          <h3>Related Topics</h3>
          <div className="topics-line">
            {entities.topics.map((topic, idx) => (
              <React.Fragment key={idx}>
                <span className="topic-item">{topic}</span>
                {idx < entities.topics.length - 1 && <span className="topic-separator">,</span>}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default ScanResult;
