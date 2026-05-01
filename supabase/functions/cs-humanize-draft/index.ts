// supabase/functions/cs-humanize-draft/index.ts
// Noch 4.0 Content Studio — apply ONE rewrite action to a draft.
// Returns rewritten text. Caller persists it as a new cs_draft_variants row
// with parent_draft_id → previous draft (preserves the full chain).

import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const MODEL = "claude-sonnet-4-20250514";

const ACTIONS: Record<string, string> = {
  shorter:          "Rewrite shorter. Cut 30–50% of the length without losing the hook.",
  stronger_hook:    "Rewrite with a stronger opening hook. The first line must grab attention.",
  less_salesy:      "Rewrite less salesy. Remove CTA-like phrasing and marketing language.",
  more_casual:      "Rewrite more casual. Sound like a real person texting a friend.",
  more_dialect:     "Rewrite using more of the brand's local dialect where natural.",
  remove_joke:      "Rewrite removing the humor. Keep the core message, strip jokes and emoji.",
  more_direct:      "Rewrite more direct. No hedging, no filler, state the point.",
  more_polished:    "Rewrite more polished while keeping the voice. Clean up grammar and flow.",
  simplify:         "Simplify wording. Shorter sentences, everyday vocabulary.",
  more_natural:     "Rewrite to sound more natural. Break AI patterns — no em-dash symmetry, no rhetorical openers.",
  remove_corporate: "Remove corporate phrasing. No 'elevate', 'unlock', 'synergy', 'leverage', 'empower'.",
  reduce_slang:     "Reduce slang. Keep it casual but readable to non-native speakers.",
  add_specificity:  "Add specificity. Replace vague nouns with concrete details.",
  more_human:       "Rewrite to sound more human. Small imperfections, natural rhythm, no AI tells.",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function extractJson(text: string) {
  let s = text.trim();
  if (s.startsWith("```json")) s = s.slice(7);
  else if (s.startsWith("```")) s = s.slice(3);
  if (s.endsWith("```")) s = s.slice(0, -3);
  s = s.trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
}

function buildPrompt(draft: Record<string, unknown>, action: string, voiceProfile: Record<string, unknown>) {
  const instruction = ACTIONS[action] || action;
  return `Apply ONE rewrite action to this draft. Return ONLY the rewritten draft as JSON.

ACTION: ${instruction}

BRAND VOICE:
${JSON.stringify(voiceProfile, null, 2)}

ORIGINAL DRAFT:
${JSON.stringify({ body: draft.body_text, hook: draft.hook, cta: draft.cta, hashtags: draft.hashtags }, null, 2)}

Return ONLY this JSON shape:
{
  "body":     "rewritten body text",
  "hook":     "rewritten hook (or same as body opener)",
  "cta":      "rewritten CTA or empty string",
  "hashtags": ["#tag1", "#tag2"]
}

Keep the core message and concept. Only apply the one action. Do not invent new claims.`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return jsonResponse({ error: "ANTHROPIC_API_KEY not set" }, 500);

  let body: { draft?: Record<string, unknown>; action?: string; voiceProfile?: Record<string, unknown> } = {};
  try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }
  const { draft, action, voiceProfile } = body;
  if (!draft) return jsonResponse({ error: "Missing draft" }, 400);
  if (!action) return jsonResponse({ error: "Missing action" }, 400);

  const client = new Anthropic({ apiKey });

  try {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: buildPrompt(draft, action, voiceProfile || {}) }],
    });
    const block = resp.content[0];
    if (!block || block.type !== "text") return jsonResponse({ error: "Unexpected model output" }, 502);

    let rewritten;
    try { rewritten = extractJson(block.text); }
    catch (e) {
      return jsonResponse({ error: "Failed to parse JSON", raw: block.text, detail: String(e) }, 502);
    }

    return jsonResponse({ rewritten, action, ai_model: MODEL });
  } catch (e) {
    console.error("cs-humanize-draft error", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
