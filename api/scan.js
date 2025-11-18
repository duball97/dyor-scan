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

// TODO: replace with real Chain Insight API call
async function getChainInsightSummaryStub(contractAddress) {
  // For now, just return a fake summary to test the pipeline
  return {
    projectSummary: `
Token $JPM is a Solana meme token riding the narrative that JPMorgan has launched JPM Coin,
a blockchain-based deposit token for institutional clients. It references JPMorgan and
traditional finance, but does not claim to be officially affiliated.
`,
    tokenName: "JPM Meme",
    symbol: "JPM",
    socials: {
      website: "https://example.com",
      x: "https://x.com/jpm_meme",
      telegram: "https://t.me/jpm_meme",
    },
  };
}

async function extractNarrativeClaim(projectSummary) {
  const prompt = `
You are a crypto narrative extractor.

Given the project summary text, do NOT invent facts. Only rephrase what is there.

Return:
- A single sentence that captures the core real-world narrative claim
  (e.g. "JPMorgan has launched a blockchain-based deposit token called JPM Coin for institutional clients.")
- Lists of entities mentioned.

Return STRICT JSON only.

SUMMARY:

${projectSummary}
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

// For v0: we skip web search and use the model to simulate a verdict.
// Later you'll replace this with: gatherEvidence + classify.
async function classifyNarrativeV0({ narrativeClaim, projectSummary }) {
  const prompt = `
You are a cautious crypto fact-checker.

You receive:
- The narrative claim (about some real-world event or product)
- The token's own project summary

You must:
- Decide if the token's story is likely referencing a REAL event (CONFIRMED),
  is plausibly mixing some truth and hype (PARTIAL),
  or is impossible to verify from its own text (UNVERIFIED).

You are NOT allowed to browse the internet. You only guess based on phrasing;
this is just a provisional v0 classification for UX, not final fact-check.

Return STRICT JSON:

{
  "verdict": "CONFIRMED" | "PARTIAL" | "UNVERIFIED",
  "reasoning": "short explanation (1-2 sentences, plain language)"
}

NARRATIVE_CLAIM:
${narrativeClaim}

PROJECT_SUMMARY:
${projectSummary}
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
          },
          required: ["verdict", "reasoning"],
        },
      },
    },
  });

  const parsed = JSON.parse(completion.choices[0].message.content);
  return parsed;
}

async function generateUserNotes({ narrativeClaim, verdict, reasoning }) {
  const prompt = `
Write a short explanation for a degen user, in clear but neutral language.

Explain:
- What the token is saying (the narrative claim),
- What our provisional verdict is (CONFIRMED / PARTIAL / UNVERIFIED),
- Why that matters for them (DYOR, no official link implied, etc.)

Keep it under 120 words. No emojis.

NARRATIVE_CLAIM: ${narrativeClaim}
VERDICT: ${verdict}
REASONING: ${reasoning}
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

    // 1) Check cache
    if (!forceRefresh) {
      const cached = await getCachedScan(contractAddress);
      if (cached?.result_json) {
        return res.status(200).json({
          cached: true,
          ...cached.result_json,
        });
      }
    }

    // 2) Chain Insight summary (stub for now)
    const ci = await getChainInsightSummaryStub(contractAddress);

    // 3) Narrative extraction
    const { narrative_claim, entities } = await extractNarrativeClaim(
      ci.projectSummary
    );

    // 4) provisional v0 classification
    const { verdict, reasoning } = await classifyNarrativeV0({
      narrativeClaim: narrative_claim,
      projectSummary: ci.projectSummary,
    });

    // 5) User notes
    const notesForUser = await generateUserNotes({
      narrativeClaim: narrative_claim,
      verdict,
      reasoning,
    });

    // 6) Assemble result (v0 – minimal)
    const result = {
      contractAddress,
      projectSummary: ci.projectSummary,
      tokenName: ci.tokenName,
      symbol: ci.symbol,
      narrativeClaim: narrative_claim,
      entities,
      loreTweet: null, // TODO: add later
      verdict,
      verdictReasoning: reasoning,
      evidence: [], // TODO: web search + tweets
      socialProfiles: [], // TODO: socials analysis
      notesForUser,
    };

    // 7) Save to Supabase
    await saveScan(contractAddress, result);

    return res.status(200).json({ cached: false, ...result });
  } catch (err) {
    console.error("scan handler error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

