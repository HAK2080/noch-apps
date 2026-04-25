// supabase/functions/cs-train-dialect/index.ts
// Noch Content Studio — Dialect Trainer extraction function.
// Accepts a training item (screenshot, URL, or pasted text) and returns
// extracted dialect features: new lexicon entries, gold examples, forbidden forms.
// The caller deduplicates + merges these into the voice profile.

import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-4-6";

type MediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function normalizeMediaType(mime: string | undefined): MediaType {
  const m = (mime || "").toLowerCase();
  if (m.includes("png")) return "image/png";
  if (m.includes("gif")) return "image/gif";
  if (m.includes("webp")) return "image/webp";
  return "image/jpeg";
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function extractJson(text: string): Record<string, unknown> {
  let s = text.trim();
  // Strip code fences (```json ... ``` or ``` ... ```)
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  const start = s.indexOf("{");
  if (start < 0) throw new Error("no opening brace in model output");
  s = s.slice(start);

  // Try full parse first
  try { return JSON.parse(s); } catch { /* fall through */ }

  // Truncated response? Walk backward to the last balanced `}` and try that.
  let depth = 0, inStr = false, esc = false, lastBalanced = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) lastBalanced = i; }
  }
  if (lastBalanced > 0) {
    try { return JSON.parse(s.slice(0, lastBalanced + 1)); } catch { /* fall through */ }
  }

  // Last resort — if truncated mid-array, try closing open structures.
  // Strip trailing partial line + close arrays/object.
  const trimmed = s.replace(/,\s*[^,}\]]*$/, "");
  const opens = (trimmed.match(/[[{]/g) || []).length;
  const closes = (trimmed.match(/[\]}]/g) || []).length;
  const missing = opens - closes;
  if (missing > 0) {
    // Guess closing tokens: most likely ] then } pattern
    const closing = "]".repeat(Math.max(0, missing - 1)) + "}";
    try { return JSON.parse(trimmed + closing); } catch { /* give up */ }
  }
  throw new Error("model output not parseable as JSON");
}

async function fetchUrlText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; NochBot/1.0; +https://noch.cloud)",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    // Extract og:description and og:title — most public FB posts expose these
    const ogDesc =
      (html.match(
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      ) || [])[1] ||
      (html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
      ) || [])[1] ||
      "";
    const ogTitle =
      (html.match(
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      ) || [])[1] ||
      (html.match(
        /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
      ) || [])[1] ||
      "";
    return [ogTitle, ogDesc].filter(Boolean).join("\n").trim();
  } catch {
    return "";
  }
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return jsonResponse({ error: "ANTHROPIC_API_KEY not set" }, 500);

  let body: {
    item?: {
      source_type?: string;
      raw_url?: string;
      raw_text?: string;
      image?: { base64: string; mimeType?: string };
    };
    voiceProfile?: Record<string, unknown>;
  } = {};

  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const { item, voiceProfile } = body;
  if (!item?.source_type) {
    return jsonResponse({ error: "Missing item.source_type" }, 400);
  }

  // Resolve text content
  let rawText = item.raw_text || "";
  if (!rawText && item.raw_url && item.source_type === "url") {
    rawText = await fetchUrlText(item.raw_url);
  }
  // Cap input to avoid Supabase's 150s timeout. Dialect patterns are dense in
  // the first few thousand chars — truncating loses little signal.
  const MAX_CHARS = 3000;
  if (rawText.length > MAX_CHARS) {
    rawText = rawText.slice(0, MAX_CHARS);
  }

  // Build content blocks
  const contentBlocks: Anthropic.MessageParam["content"] = [];
  let imageAttached = false;

  if (item.source_type === "screenshot" && item.image?.base64) {
    contentBlocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: normalizeMediaType(item.image.mimeType),
        data: item.image.base64,
      },
    });
    imageAttached = true;
  }

  // Serialize existing profile data for deduplication context
  const existingLexicon = Array.isArray(voiceProfile?.dialect_lexicon)
    ? (voiceProfile.dialect_lexicon as Array<{
        msa?: string;
        dialect?: string;
      }>)
        .slice(0, 40) // cap to avoid bloating the prompt
        .map((e) => `${e.msa || ""} → ${e.dialect || ""}`)
        .join(", ")
    : "";

  const existingForbidden = Array.isArray(voiceProfile?.forbidden_msa_forms)
    ? (voiceProfile.forbidden_msa_forms as string[]).join(", ")
    : "";

  const dialect = typeof voiceProfile?.dialect === "string"
    ? voiceProfile.dialect
    : "Tripoli Libyan";

  const textPrompt = `You are a ${dialect} dialect linguist. Analyze the ${imageAttached ? "image" : "text"} above and extract dialect training data.

${rawText ? `TEXT CONTENT:\n${rawText}\n` : ""}
EXISTING LEXICON IN PROFILE (do NOT re-extract these): ${existingLexicon || "none yet"}
EXISTING FORBIDDEN FORMS (do NOT re-extract): ${existingForbidden || "none yet"}

Extract only NEW material not already covered.

CRITICAL OUTPUT FORMAT: Your entire response must be a single JSON object and nothing else — no prose, no markdown fences, no commentary before or after. Start with { and end with }. Use this exact schema:
{
  "extracted_lexicon": [
    { "msa": "MSA equivalent", "dialect": "dialect form used", "note": "short context note" }
  ],
  "extracted_gold": [
    { "text": "complete natural sentence or phrase from the content", "source_type": "training_item", "rating": 4 }
  ],
  "extracted_forbidden": ["word_or_phrase_that_is_non_Tripoli_usage"],
  "extraction_notes": "One sentence: what does this material demonstrate about the dialect?"
}

Rules:
- Only extract genuine ${dialect} markers. Ignore MSA, Egyptian, Levantine, Gulf forms unless they appear as examples of what NOT to use (in which case add to extracted_forbidden).
- extracted_gold items must be complete natural sentences or phrases, not single words.
- extracted_forbidden items are non-Tripoli words/forms that appear as usage to avoid.
- Return empty arrays if there is nothing new to extract.
- No markdown, no prose outside the JSON object.`;

  contentBlocks.push({ type: "text", text: textPrompt });

  if (!imageAttached && !rawText) {
    return jsonResponse({
      extracted_lexicon: [],
      extracted_gold: [],
      extracted_forbidden: [],
      extraction_notes:
        item.source_type === "url"
          ? "Could not fetch URL content — try pasting the text directly."
          : "No content provided.",
      ai_model: MODEL,
    });
  }

  const client = new Anthropic({ apiKey });

  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 3000,
      messages: [{ role: "user", content: contentBlocks }],
    });

    const block = resp.content[0];
    if (!block || block.type !== "text") {
      return jsonResponse({ error: "Unexpected model output" }, 502);
    }

    const rawText = block.text;

    let result: Record<string, unknown>;
    try {
      result = extractJson(rawText);
    } catch (e) {
      // Soft-fail: log full raw output to Supabase function logs and return
      // empty arrays so the UI doesn't show a red error.
      console.error("PARSE_FAIL detail:", String(e));
      console.error("PARSE_FAIL stop_reason:", resp.stop_reason);
      console.error("PARSE_FAIL raw_length:", rawText.length);
      console.error("PARSE_FAIL raw_full:", rawText);
      return jsonResponse({
        extracted_lexicon: [],
        extracted_gold: [],
        extracted_forbidden: [],
        extraction_notes:
          `Model output was not parseable JSON (stop_reason=${resp.stop_reason}, len=${rawText.length}). First 300 chars: ${rawText.slice(0, 300)}`,
        ai_model: MODEL,
      });
    }

    return jsonResponse({
      extracted_lexicon: Array.isArray(result.extracted_lexicon)
        ? result.extracted_lexicon
        : [],
      extracted_gold: Array.isArray(result.extracted_gold)
        ? result.extracted_gold
        : [],
      extracted_forbidden: Array.isArray(result.extracted_forbidden)
        ? result.extracted_forbidden
        : [],
      extraction_notes: typeof result.extraction_notes === "string"
        ? result.extraction_notes
        : "",
      ai_model: MODEL,
    });
  } catch (e) {
    console.error("cs-train-dialect error", e);
    return jsonResponse(
      { error: e instanceof Error ? e.message : "Unknown error" },
      500,
    );
  }
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (e) {
    console.error("cs-train-dialect TOP-LEVEL", e);
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    return jsonResponse({ error: `Top-level crash — ${msg}` }, 500);
  }
});
