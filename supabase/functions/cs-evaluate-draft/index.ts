// supabase/functions/cs-evaluate-draft/index.ts
// Noch 4.0 Content Studio — evaluate a generated draft against the brand voice profile.
// Returns numeric scores (1-5) on key dimensions + categorical labels (e.g. "humor_weak").

import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-4-6";
const EVALUATOR_VERSION = "v1";

const ALLOWED_LABELS = [
  "safe",
  "needs_review",
  "too_generic",
  "off_brand",
  "sounds_ai",
  "humor_weak",
  "dialect_uncertain",
];

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function extractJson(text: string): Record<string, unknown> {
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("no JSON object in model output");
  return JSON.parse(s.slice(start, end + 1));
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function buildPrompt(args: {
  draft: Record<string, unknown>;
  voiceProfile: Record<string, unknown>;
}) {
  const { draft, voiceProfile } = args;

  const slimVoice = {
    name: voiceProfile.name,
    tone: voiceProfile.tone,
    language: voiceProfile.language,
    dialect: voiceProfile.dialect,
    formality: voiceProfile.formality,
    humor_tolerance: voiceProfile.humor_tolerance,
    cta_style: voiceProfile.cta_style,
    audience_descriptors: voiceProfile.audience_descriptors,
    banned_phrases: voiceProfile.banned_phrases,
    preferred_phrases: voiceProfile.preferred_phrases,
    notes: voiceProfile.notes,
  };

  const dialect = asString(voiceProfile.dialect).trim();
  const dialectRules = asString(voiceProfile.dialect_rules).trim();
  const forbidden = asArray<string>(voiceProfile.forbidden_msa_forms).filter(
    (s) => typeof s === "string" && s.trim(),
  );
  const lexicon = asArray<{ msa?: string; dialect?: string }>(voiceProfile.dialect_lexicon)
    .filter((e) => e && (e.msa || e.dialect))
    .slice(0, 30);

  const dialectContext = (dialect || dialectRules || forbidden.length || lexicon.length)
    ? `\nDIALECT CONTEXT (${dialect || "n/a"}):
${dialectRules ? `Rules: ${dialectRules.slice(0, 600)}\n` : ""}${forbidden.length ? `Forbidden forms: ${forbidden.join(", ")}\n` : ""}${lexicon.length ? `Lexicon (sample): ${lexicon.map((e) => `${e.msa}→${e.dialect}`).join(", ")}\n` : ""}`
    : "";

  return `You are evaluating a draft social post against a brand voice profile. Your job is to produce honest, calibrated scores and concise labels — no fluff.

DRAFT TO EVALUATE:
Body: ${asString(draft.body_text)}
${draft.hook ? `Hook: ${asString(draft.hook)}\n` : ""}${draft.cta ? `CTA: ${asString(draft.cta)}\n` : ""}${asArray<string>(draft.hashtags).length ? `Hashtags: ${asArray<string>(draft.hashtags).join(" ")}\n` : ""}Platform: ${asString(draft.platform)}
Format: ${asString(draft.format)}

BRAND VOICE PROFILE:
${JSON.stringify(slimVoice, null, 2)}
${dialectContext}

Return ONLY a single JSON object, no prose, no markdown fences. Use this exact schema:
{
  "scores": {
    "voice_match": 1-5,
    "dialect_fidelity": 1-5,
    "humor_strength": 1-5,
    "specificity": 1-5,
    "originality": 1-5,
    "ai_smell": 1-5
  },
  "labels": ["safe" or any of: needs_review, too_generic, off_brand, sounds_ai, humor_weak, dialect_uncertain],
  "explanations": {
    "<label>": "one short sentence explaining the label"
  }
}

Scoring guide:
- voice_match: how closely does it match tone, formality, humor_tolerance from the profile (1=way off, 5=spot on)
- dialect_fidelity: if Arabic, how authentic to the target dialect (1=wrong dialect/MSA, 5=native register). Score 3 if non-Arabic content.
- humor_strength: does the joke land? (1=cringe/wacky, 3=okay, 5=actually funny). Score 3 if not comedic content.
- specificity: is it concrete and brand-specific, or generic copy? (1=template-y, 5=specific and grounded)
- originality: does it feel fresh, or like a retread? (1=cliché, 5=fresh angle)
- ai_smell: does it sound AI-generated? (1=heavy ChatGPT cadence, 5=sounds human)

Labels guide:
- "safe": ship-ready. Use ONLY when scores are mostly 4+ and there are no concerns. If "safe", labels should ONLY contain "safe".
- "needs_review": borderline — human should decide
- "too_generic": specificity is low
- "off_brand": voice_match is low
- "sounds_ai": ai_smell is low
- "humor_weak": comedic content where the joke doesn't land
- "dialect_uncertain": Arabic content where dialect feels mixed or unsure

Be honest. Most drafts deserve at least one warning label — only mark "safe" when truly clean.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return jsonResponse({ error: "ANTHROPIC_API_KEY not set" }, 500);

  let body: {
    draft?: Record<string, unknown>;
    voiceProfile?: Record<string, unknown>;
  } = {};
  try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }

  const { draft, voiceProfile } = body;
  if (!draft) return jsonResponse({ error: "Missing draft" }, 400);
  if (!voiceProfile) return jsonResponse({ error: "Missing voiceProfile" }, 400);

  const client = new Anthropic({ apiKey });

  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: buildPrompt({ draft, voiceProfile }),
      }],
    });

    const block = resp.content[0];
    if (!block || block.type !== "text") {
      return jsonResponse({ error: "Unexpected model output" }, 502);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = extractJson(block.text);
    } catch (e) {
      return jsonResponse(
        { error: "Failed to parse JSON", raw: block.text, detail: String(e) },
        502,
      );
    }

    // Sanitize: clamp scores to 1-5, restrict labels to allowed set.
    const rawScores = (parsed.scores ?? {}) as Record<string, unknown>;
    const scores: Record<string, number> = {};
    for (const [k, v] of Object.entries(rawScores)) {
      const n = Number(v);
      if (Number.isFinite(n)) scores[k] = Math.max(1, Math.min(5, Math.round(n)));
    }

    const labels = asArray<string>(parsed.labels)
      .filter((l) => typeof l === "string" && ALLOWED_LABELS.includes(l));

    const explanations = (parsed.explanations ?? {}) as Record<string, unknown>;
    const cleanExplanations: Record<string, string> = {};
    for (const [k, v] of Object.entries(explanations)) {
      if (typeof v === "string" && ALLOWED_LABELS.includes(k)) {
        cleanExplanations[k] = v.slice(0, 240);
      }
    }

    return jsonResponse({
      scores,
      labels,
      explanations: cleanExplanations,
      evaluator_version: EVALUATOR_VERSION,
      ai_model: MODEL,
    });
  } catch (e) {
    console.error("cs-evaluate-draft error", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
