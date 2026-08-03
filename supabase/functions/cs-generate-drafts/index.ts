// supabase/functions/cs-generate-drafts/index.ts
// Noch 4.0 Content Studio — generate N draft variants from a concept + brand voice.
// Dialect-aware: when voice profile has dialect_rules / dialect_lexicon / gold_examples /
// forbidden_msa_forms populated, they are injected directly into the system prompt
// so Claude generates in the intended dialect (e.g. Tripoli Libyan) rather than MSA-tinged
// generic Arabic.

import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_MODEL = "claude-sonnet-4-6";
const GEMINI_MODEL = "gemini-2.5-flash";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function extractJsonArray(text: string): unknown[] {
  let s = text.trim();
  if (s.startsWith("```json")) s = s.slice(7);
  else if (s.startsWith("```")) s = s.slice(3);
  if (s.endsWith("```")) s = s.slice(0, -3);
  s = s.trim();
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
}

async function generateWithGemini(prompt: string, apiKey: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
          responseSchema: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                body: { type: "STRING" },
                hook: { type: "STRING" },
                cta: { type: "STRING" },
                hashtags: {
                  type: "ARRAY",
                  items: { type: "STRING" },
                },
              },
              required: ["body", "hook", "cta", "hashtags"],
            },
          },
        },
      }),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini ${response.status}: ${detail}`);
  }

  const payload = await response.json();
  const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Gemini returned no text");
  }
  return text;
}

async function generateDraftText(prompt: string): Promise<{ text: string; model: string }> {
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const failures: string[] = [];

  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey });
      const response = await client.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: 2048,
        messages: [{ role: "user", content: prompt }],
      });
      const block = response.content[0];
      if (!block || block.type !== "text") throw new Error("Unexpected model output");
      return { text: block.text, model: ANTHROPIC_MODEL };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      failures.push(`Anthropic: ${detail}`);
      console.error("cs-generate-drafts Anthropic error", error);
    }
  }

  if (geminiKey) {
    try {
      const text = await generateWithGemini(prompt, geminiKey);
      return { text, model: GEMINI_MODEL };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      failures.push(`Gemini: ${detail}`);
      console.error("cs-generate-drafts Gemini error", error);
    }
  }

  if (!anthropicKey && !geminiKey) {
    throw new Error("No AI provider is configured");
  }
  throw new Error(`All AI providers failed: ${failures.join(" | ")}`);
}

type LexiconEntry = { msa?: string; dialect?: string; note?: string };
type GoldExample = { text?: string; source_type?: string; source_ref?: string; rating?: number };

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function buildDialectSection(vp: Record<string, unknown>): string {
  const rules = asString(vp.dialect_rules).trim();
  const lexicon = asArray<LexiconEntry>(vp.dialect_lexicon).filter(
    (e) => e && (e.msa || e.dialect),
  );
  const goldExamples = asArray<GoldExample>(vp.gold_examples)
    .filter((e) => e && typeof e.text === "string" && e.text.trim())
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 6); // cap to avoid blowing the prompt — pick highest-rated first
  const forbidden = asArray<string>(vp.forbidden_msa_forms).filter(
    (s) => typeof s === "string" && s.trim(),
  );

  const dialect = asString(vp.dialect).trim();
  const language = asString(vp.language).trim();

  // If there's nothing dialect-specific, return empty — behaves as before.
  if (!rules && !lexicon.length && !goldExamples.length && !forbidden.length) {
    return "";
  }

  const parts: string[] = [];
  parts.push("=== DIALECT DIRECTIVES (MANDATORY) ===");
  if (dialect || language) {
    parts.push(
      `Target language/dialect: ${[language, dialect].filter(Boolean).join(" / ")}`,
    );
  }

  if (rules) {
    parts.push("\n--- Dialect rules ---");
    parts.push(rules);
  }

  if (lexicon.length) {
    parts.push("\n--- Lexicon (use the dialect form, NOT the MSA form) ---");
    for (const entry of lexicon) {
      const msa = asString(entry.msa);
      const dia = asString(entry.dialect);
      const note = asString(entry.note);
      const line = `- "${msa}" → "${dia}"${note ? ` (${note})` : ""}`;
      parts.push(line);
    }
  }

  if (forbidden.length) {
    parts.push("\n--- FORBIDDEN FORMS (never use these in output) ---");
    parts.push(forbidden.map((f) => `- ${f}`).join("\n"));
  }

  if (goldExamples.length) {
    parts.push("\n--- Gold examples (match this register exactly) ---");
    goldExamples.forEach((ex, i) => {
      parts.push(`${i + 1}. ${asString(ex.text)}`);
    });
  }

  parts.push(
    "\nIf the output language is Arabic, every sentence MUST follow these directives. Do not revert to MSA or other dialects under any circumstance.",
  );

  return parts.join("\n");
}

function buildPrompt(args: {
  concept: Record<string, unknown>;
  voiceProfile: Record<string, unknown>;
  platform: string;
  format: string;
  n: number;
}) {
  const { concept, voiceProfile, platform, format, n } = args;

  // Copy only fields Claude benefits from — avoids dumping dialect arrays twice.
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
    proven_good_caption_samples: asArray<string>(voiceProfile.good_caption_samples).slice(0, 6),
    avoid_caption_samples: asArray<string>(voiceProfile.bad_caption_samples).slice(0, 6),
    notes: voiceProfile.notes,
  };

  const dialectSection = buildDialectSection(voiceProfile);

  // Strip nested objects (inspiration) from the concept dump to keep it clean.
  // We surface the parts we need explicitly below.
  const { inspiration: _insp, ...slimConcept } = concept as Record<string, unknown>;

  // Pull the original post text from the nested inspiration object if present.
  const inspiration = _insp as Record<string, unknown> | undefined;
  const sourceText = typeof inspiration?.source_text === "string"
    ? inspiration.source_text.trim().slice(0, 800)
    : "";

  const jokeStructure = typeof concept.joke_structure === "string"
    ? concept.joke_structure.trim()
    : "";

  const originalPostBlock = sourceText
    ? `\nORIGINAL POST TEXT (read for voice rhythm and comedic timing — do not copy verbatim):\n${sourceText}\n`
    : "";

  const jokeStructureBlock = jokeStructure
    ? `\nJOKE STRUCTURE TO ADAPT: ${jokeStructure}\n`
    : "";

  return `You are a social copywriter generating ${n} distinct draft variants for one piece of content.

CONCEPT TO ADAPT:
${JSON.stringify(slimConcept, null, 2)}
${originalPostBlock}${jokeStructureBlock}
BRAND VOICE PROFILE:
${JSON.stringify(slimVoice, null, 2)}

${dialectSection}

PLATFORM: ${platform}
FORMAT: ${format}

Rules:
- Return ${n} distinct variants. Each must take a different angle on the same concept.
- Match tone, dialect, formality, and humor tolerance from the voice profile exactly.
- If the DIALECT DIRECTIVES section is present, it OVERRIDES any assumption you have about how Arabic should be written. Follow it literally.
- Avoid the banned_phrases list. Favor preferred_phrases when they fit naturally.
- No filler, no clichés, no generic CTAs ("learn more", "check it out"). Be specific.
- Don't sound like ChatGPT. No "in today's world", no rhetorical-question openers, no "let's dive in".
- Hashtags only if the platform calls for them. Keep CTAs concrete or omit.

Return ONLY a valid JSON array of ${n} objects, this exact shape:
[
  {
    "body":     "the full post body text",
    "hook":     "the opening hook line (may duplicate first line of body)",
    "cta":      "call to action, or empty string if not applicable",
    "hashtags": ["#tag1", "#tag2"]
  }
]
No prose, no markdown, no explanations.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  let body: {
    concept?: Record<string, unknown>;
    voiceProfile?: Record<string, unknown>;
    platform?: string;
    format?: string;
    n?: number;
  } = {};
  try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }

  const { concept, voiceProfile, platform, format, n } = body;
  if (!concept) return jsonResponse({ error: "Missing concept" }, 400);
  if (!voiceProfile) return jsonResponse({ error: "Missing voiceProfile" }, 400);
  if (!format) return jsonResponse({ error: "Missing format" }, 400);

  const count = Math.max(1, Math.min(6, Number(n) || 3));

  try {
    const prompt = buildPrompt({
      concept,
      voiceProfile,
      platform: platform || "instagram",
      format,
      n: count,
    });
    const generated = await generateDraftText(prompt);

    let variants: Record<string, unknown>[];
    try {
      const parsed = extractJsonArray(generated.text);
      if (!Array.isArray(parsed) || !parsed.length) throw new Error("No variants returned");
      variants = parsed.map((variant) => {
        if (!variant || typeof variant !== "object") {
          throw new Error("Variant is not an object");
        }
        const row = variant as Record<string, unknown>;
        const body = typeof row.body === "string"
          ? row.body
          : typeof row.caption === "string"
          ? row.caption
          : typeof row.text === "string"
          ? row.text
          : "";
        if (!body.trim()) throw new Error("Variant body is empty");
        // `caption` keeps already-deployed clients compatible; newer clients use `body`.
        return { ...row, body, caption: body };
      });
    } catch (e) {
      return jsonResponse(
        { error: "The AI service returned an invalid draft format", detail: String(e) },
        502,
      );
    }

    return jsonResponse({ variants, ai_model: generated.model });
  } catch (e) {
    console.error("cs-generate-drafts error", e);
    return jsonResponse(
      {
        error: "Draft generation is temporarily unavailable. Check the configured AI provider credits.",
      },
      502,
    );
  }
});
