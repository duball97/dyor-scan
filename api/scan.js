// api/scan.js
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Simple helper: fetch or create scan result for a CA
async function getCachedScan(contractAddress) {
  const { data, error } = await supabaseAdmin
    .from("dyor_scans")
    .select("*")
    .eq("contract_address", contractAddress)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Supabase getCachedScan error:", error);
    return null;
  }
  return data;
}

async function saveScan(contractAddress, result) {
  const { data, error } = await supabaseAdmin
    .from("dyor_scans")
    .insert({
      contract_address: contractAddress,
      result_json: result,
    })
    .select()
    .single();

  if (error) {
    console.error("Supabase saveScan error:", error);
    throw error;
  }
  return data;
}

// Fetch token metadata from Chain Insight (if available) or Helius
async function getChainInsightData(contractAddress) {
  try {
    // If you have Chain Insight API key, use it
    // For now, we'll use a combination of DexScreener + potential future integration
    return null; // Will be populated with real Chain Insight data
  } catch (error) {
    console.error("Chain Insight fetch error:", error);
    return null;
  }
}

// Search web for narrative verification
async function searchWebForNarrative(narrativeClaim, entities) {
  try {
    // Using Brave Search API or similar (you'll need to add API key)
    // For now, return placeholder - will be replaced with real search
    return {
      articles: [],
      searchPerformed: false,
    };
  } catch (error) {
    console.error("Web search error:", error);
    return { articles: [], searchPerformed: false };
  }
}

// Search Twitter for lore tweet and validation
async function searchTwitterForLore(narrativeClaim, entities) {
  try {
    // Using Twitter API v2 (requires API key)
    // For now, return placeholder
    return {
      loreTweet: null,
      validationTweets: [],
    };
  } catch (error) {
    console.error("Twitter search error:", error);
    return { loreTweet: null, validationTweets: [] };
  }
}

// Fetch token data from DexScreener
async function getDexScreenerData(contractAddress) {
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`
    );
    
    if (!response.ok) {
      console.error(`DexScreener API returned status: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.pairs || data.pairs.length === 0) {
      console.log("No trading pairs found on DexScreener for this token");
      return null;
    }
    
    // Get the pair with highest liquidity
    const mainPair = data.pairs.sort((a, b) => 
      (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
    )[0];
    
    return {
      tokenName: mainPair.baseToken.name || "Unknown Token",
      symbol: mainPair.baseToken.symbol || "???",
      priceUsd: mainPair.priceUsd,
      volume24h: mainPair.volume?.h24,
      liquidity: mainPair.liquidity?.usd,
      priceChange24h: mainPair.priceChange?.h24,
      socials: {
        website: mainPair.info?.websites?.[0]?.url || null,
        x: mainPair.info?.socials?.find(s => s.type === "twitter")?.url || null,
        telegram: mainPair.info?.socials?.find(s => s.type === "telegram")?.url || null,
      },
      dexUrl: mainPair.url,
    };
  } catch (error) {
    console.error("DexScreener fetch error:", error);
    return null;
  }
}

// Fetch token safety data from RugCheck
async function getRugCheckData(contractAddress) {
  try {
    const response = await fetch(
      `https://api.rugcheck.xyz/v1/tokens/${contractAddress}/report`
    );
    
    if (!response.ok) {
      // RugCheck might not have data for all tokens
      return null;
    }
    
    const data = await response.json();
    return {
      riskLevel: data.riskLevel || "unknown",
      risks: data.risks || [],
      score: data.score || null,
    };
  } catch (error) {
    console.error("RugCheck fetch error:", error);
    return null;
  }
}

// Generate project summary from available data
async function generateProjectSummary(tokenData, rugCheckData, contractAddress) {
  if (!tokenData) {
    // Fallback when no DEX data is available
    let summary = `Token with contract address ${contractAddress} is a Solana-based token`;
    
    if (rugCheckData && rugCheckData.risks && rugCheckData.risks.length > 0) {
      summary += ` with ${rugCheckData.risks.length} security risk(s) identified`;
    }
    
    summary += `. No trading pairs found on decentralized exchanges yet. This token may be very new, unlaunched, or have no liquidity.`;
    
    return summary;
  }
  
  const { tokenName, symbol, socials, priceUsd, liquidity } = tokenData;
  
  let summary = `Token ${symbol}`;
  
  if (tokenName && tokenName !== "Unknown Token") {
    summary += ` (${tokenName})`;
  }
  
  summary += ` is a Solana-based token`;
  
  if (liquidity) {
    summary += ` with $${(liquidity / 1000000).toFixed(2)}M in liquidity`;
  }
  
  if (priceUsd) {
    summary += ` trading at $${priceUsd}`;
  }
  
  summary += `.`;
  
  if (socials && (socials.website || socials.x || socials.telegram)) {
    summary += ` The project maintains`;
    const socialList = [];
    if (socials.website) socialList.push("a website");
    if (socials.x) socialList.push("Twitter/X presence");
    if (socials.telegram) socialList.push("Telegram community");
    summary += ` ${socialList.join(", ")}.`;
  }
  
  if (rugCheckData && rugCheckData.risks && rugCheckData.risks.length > 0) {
    summary += ` Security analysis identified ${rugCheckData.risks.length} potential risk factor(s).`;
  }
  
  return summary;
}

async function getTokenData(contractAddress) {
  try {
    // Fetch data from multiple sources in parallel
    const [dexData, rugData] = await Promise.all([
      getDexScreenerData(contractAddress),
      getRugCheckData(contractAddress),
    ]);
    
    // Generate summary from collected data
    const projectSummary = await generateProjectSummary(dexData, rugData, contractAddress);
    
    return {
      projectSummary,
      tokenName: dexData?.tokenName || "Unknown Token",
      symbol: dexData?.symbol || "???",
      socials: dexData?.socials || null,
      marketData: dexData ? {
        price: dexData.priceUsd,
        volume24h: dexData.volume24h,
        liquidity: dexData.liquidity,
        priceChange24h: dexData.priceChange24h,
        dexUrl: dexData.dexUrl,
      } : null,
      securityData: rugData,
      hasMarketData: !!dexData,
    };
  } catch (error) {
    console.error("getTokenData error:", error);
    throw new Error(`Failed to fetch token data: ${error.message}`);
  }
}

async function extractNarrativeClaim(projectSummary, tokenDescription) {
  const fullContext = `
PROJECT SUMMARY:
${projectSummary}

${tokenDescription ? `TOKEN DESCRIPTION:\n${tokenDescription}` : ''}
`.trim();

  const prompt = `
You are an expert crypto narrative analyst.

Analyze this token's information and extract the core narrative claim - the story this token is telling.

Look for:
- References to real companies, products, or events
- Partnerships or associations being claimed
- Technology or innovation being referenced
- Any real-world narratives being leveraged

Return:
1. A clear, specific narrative claim (what real-world story is this token using?)
2. Entities involved (organizations, products, people, events)
3. Key topics and themes

If the token has no clear narrative beyond "it's a meme token", say so.

Return STRICT JSON only.

CONTEXT:
${fullContext}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "NarrativeExtraction",
        schema: {
          type: "object",
          properties: {
            narrative_claim: { type: "string" },
            entities: {
              type: "object",
              properties: {
                organizations: {
                  type: "array",
                  items: { type: "string" },
                },
                products: {
                  type: "array",
                  items: { type: "string" },
                },
                topics: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["organizations", "products", "topics"],
            },
          },
          required: ["narrative_claim", "entities"],
        },
      },
    },
  });

  const parsed = JSON.parse(completion.choices[0].message.content);
  return parsed;
}

// Enhanced narrative classification with evidence
async function classifyNarrative({ narrativeClaim, projectSummary, entities, webEvidence, twitterEvidence }) {
  const evidenceSummary = webEvidence && webEvidence.searchPerformed 
    ? `\nWEB EVIDENCE: ${webEvidence.articles.length} articles found`
    : '\nWEB EVIDENCE: No external search performed yet';

  const twitterSummary = twitterEvidence && twitterEvidence.loreTweet
    ? `\nLORE TWEET: Found origin tweet`
    : '\nLORE TWEET: Not identified';

  const prompt = `
You are an expert crypto narrative fact-checker and analyst.

Your job is to analyze whether the narrative this token is claiming has basis in reality.

NARRATIVE CLAIM:
${narrativeClaim}

PROJECT SUMMARY:
${projectSummary}

ENTITIES IDENTIFIED:
${JSON.stringify(entities, null, 2)}
${evidenceSummary}
${twitterSummary}

Analyze this deeply:

1. Is the core narrative referencing a REAL event, product, or announcement?
2. Are the entities (companies, products, people) real?
3. Is this token officially affiliated, or just riding the narrative?
4. What's the credibility level?

Classify as:
- CONFIRMED: The narrative references real, verifiable events/products. The entities are real.
- PARTIAL: Mix of truth and hype. Real event but exaggerated claims or unofficial association.
- UNVERIFIED: Cannot verify the narrative's claims. Possibly fabricated or misleading.

Provide detailed reasoning (3-4 sentences) explaining:
- What's real vs what's questionable
- Any red flags or concerns
- What investors should know

Return STRICT JSON:

{
  "verdict": "CONFIRMED" | "PARTIAL" | "UNVERIFIED",
  "reasoning": "detailed explanation (3-4 sentences)",
  "confidence": "high" | "medium" | "low",
  "redFlags": ["list of concerns if any"]
}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "NarrativeVerdict",
        schema: {
          type: "object",
          properties: {
            verdict: {
              type: "string",
              enum: ["CONFIRMED", "PARTIAL", "UNVERIFIED"],
            },
            reasoning: { type: "string" },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low"],
            },
            redFlags: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["verdict", "reasoning", "confidence", "redFlags"],
        },
      },
    },
  });

  const parsed = JSON.parse(completion.choices[0].message.content);
  return {
    verdict: parsed.verdict,
    reasoning: parsed.reasoning,
    confidence: parsed.confidence || "medium",
    redFlags: parsed.redFlags || [],
  };
}

async function generateUserNotes({ narrativeClaim, verdict, reasoning, confidence, redFlags, entities }) {
  const redFlagsText = redFlags && redFlags.length > 0 
    ? `\nRED FLAGS: ${redFlags.join(", ")}`
    : '';

  const prompt = `
You are writing analysis notes for crypto investors doing their own research (DYOR).

Write a comprehensive but clear analysis (150-200 words) that covers:

1. **What This Token Claims**: Summarize the narrative in plain language
2. **Reality Check**: Our verdict (${verdict}) and why
3. **Key Entities**: Who/what is being referenced (${entities.organizations?.join(", ") || "none"})
4. **What This Means**: Practical implications for investors
5. **Red Flags**: Any concerns or warnings${redFlags && redFlags.length > 0 ? ` (${redFlags.join(", ")})` : ''}

Be direct, informative, and honest. Use a professional but accessible tone.

NARRATIVE: ${narrativeClaim}
VERDICT: ${verdict} (${confidence} confidence)
ANALYSIS: ${reasoning}${redFlagsText}
`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  });

  const text = completion.choices[0].message.content.trim();
  return text;
}

// Vercel serverless function entrypoint
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { contractAddress, forceRefresh = false } = req.body || {};

    if (!contractAddress || typeof contractAddress !== "string") {
      return res
        .status(400)
        .json({ error: "contractAddress (string) is required" });
    }

    // 1) Check cache (only use if it has the new data structure)
    if (!forceRefresh) {
      const cached = await getCachedScan(contractAddress);
      if (cached?.result_json && cached.result_json.marketData && cached.result_json.socials) {
        return res.status(200).json({
          cached: true,
          ...cached.result_json,
        });
      }
    }

    // 2) Fetch real token data from DexScreener + RugCheck
    const tokenData = await getTokenData(contractAddress);

    // 3) Narrative extraction
    const { narrative_claim, entities } = await extractNarrativeClaim(
      tokenData.projectSummary,
      tokenData.tokenDescription
    );

    // 4) Search for evidence (web + Twitter)
    const [webEvidence, twitterEvidence] = await Promise.all([
      searchWebForNarrative(narrative_claim, entities),
      searchTwitterForLore(narrative_claim, entities),
    ]);

    // 5) Enhanced classification with evidence
    const { verdict, reasoning, confidence, redFlags } = await classifyNarrative({
      narrativeClaim: narrative_claim,
      projectSummary: tokenData.projectSummary,
      entities,
      webEvidence,
      twitterEvidence,
    });

    // 6) Generate comprehensive user notes
    const notesForUser = await generateUserNotes({
      narrativeClaim: narrative_claim,
      verdict,
      reasoning,
      confidence,
      redFlags,
      entities,
    });

    // 7) Assemble comprehensive result
    const result = {
      contractAddress,
      projectSummary: tokenData.projectSummary,
      tokenName: tokenData.tokenName,
      symbol: tokenData.symbol,
      narrativeClaim: narrative_claim,
      entities,
      marketData: tokenData.marketData,
      socials: tokenData.socials,
      securityData: tokenData.securityData,
      loreTweet: twitterEvidence?.loreTweet || null,
      verdict,
      verdictReasoning: reasoning,
      confidence,
      redFlags: redFlags || [],
      evidence: {
        articles: webEvidence?.articles || [],
        tweets: twitterEvidence?.validationTweets || [],
      },
      notesForUser,
    };

    // 8) Save to Supabase
    await saveScan(contractAddress, result);

    return res.status(200).json({ cached: false, ...result });
  } catch (err) {
    console.error("scan handler error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

