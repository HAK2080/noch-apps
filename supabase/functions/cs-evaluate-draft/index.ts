// supabase/functions/cs-evaluate-draft/index.ts
// Noch 4.0 Content Studio — evaluate a generated draft against the brand voice profile.
// Returns numeric scores (1-5) on key dimensions + categorical labels (e.g. "humor_weak").

import Anthropic from "npm:@anthropic-ai/sdk";
import {
  EvaluationJsonError,
  generateParsedEvaluation,
} from "../_shared/evaluationJson.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_FALLBACK_MODEL = "gemini-2.5-flash-lite";
const OPENAI_MODEL = "gpt-4.1-mini";
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

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

async function generateWithGemini(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              scores: {
                type: "OBJECT",
                properties: {
                  voice_match: { type: "INTEGER" },
                  dialect_fidelity: { type: "INTEGER" },
                  humor_strength: { type: "INTEGER" },
                  specificity: { type: "INTEGER" },
                  originality: { type: "INTEGER" },
                  ai_smell: { type: "INTEGER" },
                },
                required: [
                  "voice_match",
                  "dialect_fidelity",
                  "humor_strength",
                  "specificity",
                  "originality",
                  "ai_smell",
                ],
              },
              labels: {
                type: "ARRAY",
                items: {
                  type: "STRING",
                  enum: ALLOWED_LABELS,
                },
              },
              explanations: {
                type: "OBJECT",
                properties: Object.fromEntries(
                  ALLOWED_LABELS.map((label) => [label, { type: "STRING" }]),
                ),
              },
            },
            required: ["scores", "labels", "explanations"],
          },
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini ${model} ${response.status}: ${detail}`);
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Gemini returned no text");
  }
  return text;
}

async function generateWithOpenAI(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "content_evaluation",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              scores: {
                type: "object",
                additionalProperties: false,
                properties: {
                  voice_match: { type: "integer", minimum: 1, maximum: 5 },
                  dialect_fidelity: { type: "integer", minimum: 1, maximum: 5 },
                  humor_strength: { type: "integer", minimum: 1, maximum: 5 },
                  specificity: { type: "integer", minimum: 1, maximum: 5 },
                  originality: { type: "integer", minimum: 1, maximum: 5 },
                  ai_smell: { type: "integer", minimum: 1, maximum: 5 },
                },
                required: [
                  "voice_match",
                  "dialect_fidelity",
                  "humor_strength",
                  "specificity",
                  "originality",
                  "ai_smell",
                ],
              },
              labels: {
                type: "array",
                items: {
                  type: "string",
                  enum: ALLOWED_LABELS,
                },
              },
              explanations: {
                type: "object",
                additionalProperties: false,
                properties: Object.fromEntries(
                  ALLOWED_LABELS.map((label) => [label, { type: "string" }]),
                ),
                required: ALLOWED_LABELS,
              },
            },
            required: ["scores", "labels", "explanations"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1200);
    throw new Error(`OpenAI ${response.status}: ${detail}`);
  }

  const payload = await response.json();
  const message = payload?.choices?.[0]?.message;
  if (typeof message?.refusal === "string" && message.refusal.trim()) {
    throw new Error(`OpenAI refused the evaluation: ${message.refusal}`);
  }
  if (typeof message?.content !== "string" || !message.content.trim()) {
    throw new Error("OpenAI returned no text");
  }
  return message.content;
}

async function generateEvaluationText(
  prompt: string,
): Promise<{ text: string; model: string }> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const openaiKey = Deno.env.get("Openai_API_KEY") ||
    Deno.env.get("OPENAI_API_KEY");
  const failures: string[] = [];

  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey });
      const response = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      });
      const block = response.content[0];
      if (!block || block.type !== "text") throw new Error("Unexpected model output");
      return { text: block.text, model: ANTHROPIC_MODEL };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      failures.push(`Anthropic: ${detail}`);
      console.error("cs-evaluate-draft Anthropic error", error);
    }
  }

  if (geminiKey) {
    for (const model of [GEMINI_MODEL, GEMINI_FALLBACK_MODEL]) {
      try {
        const text = await generateWithGemini(prompt, geminiKey, model);
        return { text, model };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        failures.push(`Gemini ${model}: ${detail}`);
        console.error(`cs-evaluate-draft Gemini ${model} error`, error);
      }
    }
  }

  if (openaiKey) {
    try {
      const text = await generateWithOpenAI(prompt, openaiKey);
      return { text, model: OPENAI_MODEL };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      failures.push(`OpenAI: ${detail}`);
      console.error("cs-evaluate-draft OpenAI error", error);
    }
  }

  if (!anthropicKey && !geminiKey && !openaiKey) {
    throw new Error("No AI provider is configured");
  }
  throw new Error(`All AI providers failed: ${failures.join(" | ")}`);
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

  const goodSamples = asArray<string>(voiceProfile.good_caption_samples)
    .filter((sample) => typeof sample === "string" && sample.trim())
    .slice(-12);
  const badSamples = asArray<string>(voiceProfile.bad_caption_samples)
    .filter((sample) => typeof sample === "string" && sample.trim())
    .slice(-12);
  const hybridNotes = asString(voiceProfile.hybrid_language_notes).trim();
  const trainingContext = (goodSamples.length || badSamples.length || hybridNotes)
    ? `\nBRAND MANIFESTO EVIDENCE:
${goodSamples.length ? `Approved real captions:\n${goodSamples.map((sample, index) => `${index + 1}. ${sample}`).join("\n")}\n` : ""}${badSamples.length ? `Rejected / off-brand captions:\n${badSamples.map((sample, index) => `${index + 1}. ${sample}`).join("\n")}\n` : ""}${hybridNotes ? `Hybrid-language rules: ${hybridNotes}\n` : ""}`
    : "";

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
${trainingContext}

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
- voice_match: how closely it matches the profile and approved real captions while avoiding rejected examples (1=way off, 5=spot on)
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

  let body: {
    draft?: Record<string, unknown>;
    voiceProfile?: Record<string, unknown>;
  } = {};
  try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }

  const { draft, voiceProfile } = body;
  if (!draft) return jsonResponse({ error: "Missing draft" }, 400);
  if (!voiceProfile) return jsonResponse({ error: "Missing voiceProfile" }, 400);

  try {
    const prompt = buildPrompt({ draft, voiceProfile });
    const { parsed, generated } = await generateParsedEvaluation(
      generateEvaluationText,
      prompt,
    );

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
      ai_model: generated.model,
    });
  } catch (e) {
    console.error("cs-evaluate-draft error", e);
    if (e instanceof EvaluationJsonError) {
      return jsonResponse(
        {
          error: "The AI service returned an invalid evaluation format",
          error_code: "evaluation_json_invalid",
          detail: e.message,
        },
        502,
      );
    }
    return jsonResponse(
      {
        error:
          "Content evaluation is temporarily unavailable. Check the configured AI provider credits.",
        error_code: "evaluation_provider_unavailable",
      },
      502,
    );
  }
});
