import Anthropic from "npm:@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

// ────────────────────────────────────────────────────────────────────
// Three extraction modes:
//   mechanism — strategic decode (default; pre-mode behavior)
//   copy      — fast Noch-specific adaptation, with copy-risk warning
//   (Do Both is two parallel calls from the client — each call hits
//    this function once with one mode.)
//
// Each mode returns a single flat JSON. The client merges into the
// concept row. Only fields a mode is responsible for are filled by
// that mode's prompt — the others come back null.
// ────────────────────────────────────────────────────────────────────

const SHARED_HEADER = `You are a social media content strategist. Analyze this inspiration carefully — image first if provided, then text context.

If the content includes non-English text (Arabic, Libyan dialect, etc.), analyze it in its original language and respond in English.
Return ONLY valid JSON. No markdown, no explanation.`;

const MECHANISM_PROMPT = `${SHARED_HEADER}

Your job is to extract the *reusable mechanism* — why this worked, the structural pattern, the emotional driver. We will use this as strategic intelligence to inform original content for Noch (a café in Tripoli, Libya). DO NOT write the adaptation; only the strategy.

Return JSON with EXACTLY these fields (use null when not applicable):
{
  "hook_summary": "One sentence — what grabs attention and why",
  "hook_pattern": "The hook archetype in 2-6 words (e.g. 'unexpected reveal', 'relatable frustration → release', 'pov self-roast')",
  "content_pattern": "Structural format (e.g. comparison, before/after, list, POV, reaction, relatable moment)",
  "visual_pattern": "What the visual is doing structurally (e.g. 'split-screen contrast', 'single object hero', 'face cam reaction', 'text overlay only'). Null if no image.",
  "emotional_driver": "Core emotion in one phrase",
  "emotional_trigger": "The specific trigger that fires that emotion (e.g. 'shared embarrassment about being late', 'the smug satisfaction of being right')",
  "target_audience": "Who this resonates with most",
  "why_it_works": "2-3 sentences on the psychological/social mechanics",
  "why_it_worked": "Same as why_it_works but tightened to ONE sentence — the core insight",
  "reusable_mechanism": "How this pattern can be adapted for other brands",
  "mechanism_summary": "The reusable mechanism distilled to one tight sentence Noch can act on",
  "suggested_content_mission": "One sentence — what Noch's version should accomplish strategically (e.g. 'make Tripoli regulars feel seen by naming the small ritual nobody talks about')",
  "suggested_nochi_format": "Concrete Nochi-friendly format suggestion in 4-10 words (e.g. 'Nochi POV: matcha gets jealous of cappuccino', 'before/after with Nochi as the relief')",
  "originality_risk": "Short label: 'low' | 'medium' | 'high' | 'trending format' | 'overused' | 'fresh angle'",
  "source_brand": "The brand/creator if identifiable, max 3 words; 'unknown' otherwise",
  "voice_type": "1-3 word label for the tone of the original (e.g. 'snarky', 'warm expert')",
  "post_nature": "ONE word: meme | text | reaction | tutorial | listicle | story | quote | comparison | poll | image",
  "joke_structure": "If comedic, the structural mechanic (setup → subversion → delivery). null otherwise.",
  "notes": "Any extra observations about format, timing, or platform fit"
}`;

const COPY_PROMPT = `${SHARED_HEADER}

Your job is FAST ADAPTATION. Take this inspiration and rewrite it for Noch — a café in Tripoli, Libya, with a cheeky, warm, Libyan-Arabic-leaning brand voice and a bunny mascot called "Nochi" (نوتشي). Change product, voice, dialect, and brand context. Keep the same general structure of the inspiration. Then flag how risky the copy is.

Return JSON with EXACTLY these fields (use null when not applicable):
{
  "source_brand": "The brand/creator if identifiable, max 3 words; 'unknown' otherwise",
  "copy_angle": "One short sentence describing the angle being copied (e.g. 'use Duolingo's passive-aggressive owl voice on missed visits')",
  "noch_adaptation": "The actual Noch-specific adapted post copy. Multi-line OK. Bilingual OK (Arabic + English). Practical enough to send to a brief next.",
  "localization_angle": "How this is localised for Tripoli — what Libyan/Tripoli reference, dialect, or context anchors the version",
  "copy_risk_level": "ONE of: 'low' | 'medium' | 'high'. Low = format/idea is widely used by anyone, no signature voice copied. Medium = recognizable format, voice still ours. High = directly riffing a specific brand's signature schtick.",
  "risk_reason": "One sentence explaining the level — what specifically is or isn't being borrowed",
  "originality_risk": "Same label space as before for compatibility: 'low' | 'medium' | 'high' | 'trending format' | 'overused' | 'fresh angle'",
  "voice_type": "1-3 word label for the source's tone (e.g. 'snarky', 'warm expert')",
  "post_nature": "ONE word: meme | text | reaction | tutorial | listicle | story | quote | comparison | poll | image",
  "notes": "Any caveats — timing, platform, or things the owner should sanity-check before publishing"
}`;

type MediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function normalizeMediaType(mime: string | undefined): MediaType {
  const m = (mime || "").toLowerCase();
  if (m.includes("png")) return "image/png";
  if (m.includes("gif")) return "image/gif";
  if (m.includes("webp")) return "image/webp";
  return "image/jpeg";
}

function promptFor(mode: string): string {
  if (mode === "copy") return COPY_PROMPT;
  return MECHANISM_PROMPT;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { inspiration, voiceProfile, image, mode = "mechanism" } = await req.json();

    if (!inspiration) {
      return new Response(JSON.stringify({ error: "Missing inspiration" }), {
        status: 400, headers: CORS_HEADERS,
      });
    }
    if (mode !== "copy" && mode !== "mechanism") {
      return new Response(JSON.stringify({ error: `Invalid mode: ${mode}` }), {
        status: 400, headers: CORS_HEADERS,
      });
    }

    const contentBlocks: any[] = [];
    let imageAttached = false;

    if (image?.base64) {
      contentBlocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: normalizeMediaType(image.mimeType),
          data: image.base64,
        },
      });
      imageAttached = true;
    } else if (inspiration.preview_image_url) {
      try {
        const imgRes = await fetch(inspiration.preview_image_url);
        if (imgRes.ok) {
          const arrayBuf = await imgRes.arrayBuffer();
          const bytes = new Uint8Array(arrayBuf);
          let binary = "";
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
          }
          const base64 = btoa(binary);
          contentBlocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: normalizeMediaType(imgRes.headers.get("content-type") || ""),
              data: base64,
            },
          });
          imageAttached = true;
        }
      } catch (e) {
        console.warn("Server-side image fetch failed:", e);
      }
    }

    const lines: string[] = [];
    if (inspiration.title) lines.push(`Title: ${inspiration.title}`);
    if (inspiration.source_url) lines.push(`URL: ${inspiration.source_url}`);
    if (inspiration.source_text) lines.push(`Content:\n${inspiration.source_text}`);
    if (inspiration.platform) lines.push(`Platform: ${inspiration.platform}`);
    if (inspiration.content_pillar) lines.push(`Content pillar: ${inspiration.content_pillar}`);
    if (inspiration.tags?.length) lines.push(`Tags: ${inspiration.tags.join(", ")}`);
    if (voiceProfile?.name) lines.push(`Brand voice: ${voiceProfile.name}`);
    if (imageAttached) lines.push("(The image above is the actual screenshot to analyze.)");

    if (lines.length) contentBlocks.push({ type: "text", text: lines.join("\n") });
    contentBlocks.push({ type: "text", text: promptFor(mode) });

    const startedAt = Date.now();
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      messages: [{ role: "user", content: contentBlocks }],
    });
    const durationMs = Date.now() - startedAt;

    const raw = response.content[0];
    if (raw.type !== "text") {
      return new Response(JSON.stringify({ error: "Unexpected response type" }), {
        status: 500, headers: CORS_HEADERS,
      });
    }

    let jsonStr = raw.text.trim();
    if (jsonStr.startsWith("```json")) jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    else if (jsonStr.startsWith("```")) jsonStr = jsonStr.replace(/^```\n?/, "").replace(/\n?```$/, "");

    const concept = JSON.parse(jsonStr);

    if (!concept.originality_risk || String(concept.originality_risk).trim() === "") {
      concept.originality_risk = "low";
    }

    const capWords = (s: unknown, n: number) => {
      const str = typeof s === "string" ? s.trim() : "";
      if (!str) return null;
      return str.toLowerCase().split(/\s+/).slice(0, n).join(" ");
    };
    concept.source_brand = capWords(concept.source_brand, 3);
    concept.voice_type   = capWords(concept.voice_type, 3);
    concept.post_nature  = capWords(concept.post_nature, 1);

    // Validate copy_risk_level if returned (copy mode only)
    if (concept.copy_risk_level) {
      const lvl = String(concept.copy_risk_level).toLowerCase().trim();
      concept.copy_risk_level = ["low", "medium", "high"].includes(lvl) ? lvl : null;
    }

    return new Response(
      JSON.stringify({
        concept,
        mode,
        ai_model: "claude-sonnet-4-6",
        duration_ms: durationMs,
        image_attached: imageAttached,
      }),
      { headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  } catch (error) {
    console.error("cs-extract-concept error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: CORS_HEADERS },
    );
  }
});
