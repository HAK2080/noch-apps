import Anthropic from "npm:@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

const CONCEPT_PROMPT = `You are a social media content strategist. Analyze this inspiration and extract a reusable content concept.

Return ONLY valid JSON with these fields:
{
  "hook_summary": "One sentence — what grabs attention and why",
  "content_pattern": "The structural format (e.g. comparison, before/after, list, POV, reaction, relatable moment)",
  "emotional_driver": "The core emotion triggered (e.g. nostalgia, humor, relatability, FOMO, aspiration)",
  "target_audience": "Who this resonates with most",
  "why_it_works": "2-3 sentences on the psychological/social mechanics behind its performance",
  "reusable_mechanism": "How this pattern can be adapted for other brands or topics",
  "originality_risk": "Short label describing how copied/unoriginal this feels (e.g. 'low', 'medium', 'high', 'trending format', 'overused', 'fresh angle')",
  "source_brand": "The brand, creator, or account this post appears to come from if identifiable (e.g. 'Duolingo', 'Nike', 'anonymous meme account'). Use 'unknown' if not identifiable. Keep under 3 words.",
  "voice_type": "1-3 word label for the voice tone of the original (e.g. 'snarky', 'warm expert', 'unhinged gen-z', 'dry corporate'). Max 3 words — be terse.",
  "post_nature": "One word for the structural nature: 'meme', 'text', 'reaction', 'tutorial', 'listicle', 'story', 'quote', 'comparison', 'poll', 'image'. Pick the single best fit.",
  "joke_structure": "If this content is comedic, describe the exact structural mechanic: setup, the subversion point, and delivery style (e.g. 'sets up relatable frustration → cuts to absurd product as solution → dry tone closes it'). Return null if not comedic.",
  "notes": "Any extra observations about format, timing, or platform fit"
}

If the content includes non-English text (Arabic, etc.), analyze it in its original language and respond in English.
Return ONLY the JSON. No markdown, no explanation.`;

type MediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function normalizeMediaType(mime: string | undefined): MediaType {
  const m = (mime || "").toLowerCase();
  if (m.includes("png")) return "image/png";
  if (m.includes("gif")) return "image/gif";
  if (m.includes("webp")) return "image/webp";
  return "image/jpeg";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { inspiration, voiceProfile, image } = await req.json();

    if (!inspiration) {
      return new Response(JSON.stringify({ error: "Missing inspiration" }), { status: 400 });
    }

    const contentBlocks: any[] = [];
    let imageAttached = false;

    // Prefer client-provided base64 image
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
      // Fallback: server-side fetch
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

    // Build text context
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
    contentBlocks.push({ type: "text", text: CONCEPT_PROMPT });

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: contentBlocks }],
    });

    const raw = response.content[0];
    if (raw.type !== "text") {
      return new Response(JSON.stringify({ error: "Unexpected response type" }), { status: 500 });
    }

    let jsonStr = raw.text.trim();
    if (jsonStr.startsWith("```json")) jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    else if (jsonStr.startsWith("```")) jsonStr = jsonStr.replace(/^```\n?/, "").replace(/\n?```$/, "");

    const concept = JSON.parse(jsonStr);
    // originality_risk is a free-form label/flag — admin reviews, ignores, or acts on it.
    // Default to "low" when missing/empty so the bank has a consistent starting state.
    if (!concept.originality_risk || String(concept.originality_risk).trim() === "") {
      concept.originality_risk = "low";
    }
    // Normalize the short categorical fields — trim, lowercase, cap at 3 words.
    const capWords = (s: unknown, n: number) => {
      const str = typeof s === "string" ? s.trim() : "";
      if (!str) return null;
      return str.toLowerCase().split(/\s+/).slice(0, n).join(" ");
    };
    concept.source_brand = capWords(concept.source_brand, 3);
    concept.voice_type = capWords(concept.voice_type, 3);
    concept.post_nature = capWords(concept.post_nature, 1);

    return new Response(
      JSON.stringify({ concept, ai_model: "claude-sonnet-4-6", image_attached: imageAttached }),
      { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } },
    );
  } catch (error) {
    console.error("cs-extract-concept error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } },
    );
  }
});
