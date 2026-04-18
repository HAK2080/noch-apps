import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { brand, research, config, swipeEntries, batchSize } = await req.json();

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!apiKey) {
      // Return simulated response when no API key
      return new Response(
        JSON.stringify({
          success: false,
          error: "No API key configured",
          simulated: true,
          data: {
            caption_en: "okay we're not saying our matcha will fix your week.\n\nwe're just saying no one leaves sad.\n\nallegedly.",
            caption_ar: "ما نقولوش الماتشا بتحل مشاكلك.\n\nبس والله ما راح يطلع منها حد زعلان.\n\nقولوا يا نوشي.",
            image_brief: "Natural light matcha latte in ceramic cup, overhead shot, minimal clean aesthetic",
            hashtags: ["#noch", "#nochmatch", "#طرابلس", "#tripolimatcha"],
            cta: "You know where we are.",
            voice_score_estimate: 8,
            hook_strength: "Opens with subverted expectation — sets up promise then immediately undermines it humorously",
            dialect_notes: "Uses والله naturally, نوشي mascot reference as punctuation",
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the full generation prompt
    const { buildGenerationPrompt, NOCH_VOICE_GUIDE, LIBYAN_DIALECT_GUIDE } = await import("../../../src/lib/contentEngine.js").catch(() => null) || {};

    // Inline prompt since we can't import from src in edge functions
    const prompt = buildFullPrompt(brand, research, config, swipeEntries);
    const count = Math.min(Math.max(batchSize || 1, 1), 5);

    const client = new Anthropic({ apiKey });

    if (count > 1) {
      // Batch generation: ask for multiple variations
      const batchPrompt = prompt + `\n\n## IMPORTANT: Generate ${count} DIFFERENT variations. Return a JSON array of ${count} objects, each with the same schema. Vary the hook, tone intensity, and angle. Return ONLY the JSON array.`;

      const message = await client.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 1024 * count,
        messages: [{ role: "user", content: batchPrompt }],
      });

      const text = message.content[0].type === "text" ? message.content[0].text : "[]";
      let variations;
      try {
        const cleaned = text.replace(/```json|```/g, "").trim();
        const arrMatch = cleaned.match(/\[[\s\S]*\]/);
        variations = arrMatch ? JSON.parse(arrMatch[0]) : null;
      } catch {
        // Fallback: try single object
        try {
          const objMatch = text.match(/\{[\s\S]*\}/);
          variations = objMatch ? [JSON.parse(objMatch[0])] : null;
        } catch { variations = null; }
      }

      return new Response(
        JSON.stringify({ success: true, variations: variations || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Single generation
    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";

    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    } catch {
      parsed = null;
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: parsed || { caption_en: text, caption_ar: "", image_brief: "", hashtags: [], cta: "" },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildFullPrompt(brand: any, research: any, config: any, swipeEntries?: any[]): string {
  const {
    format = "static",
    platform = "instagram",
    language = "bilingual",
    chaosLevel = 3,
    humorLevel = 3,
    localDensity = 3,
    brief = "",
  } = config || {};

  const brandName = brand?.name || "Noch";
  const brandProgram = brand?.brand_program || "";
  const personalityNotes = brand?.personality_notes || "Playful, witty, tongue-in-cheek";

  const researchContext = research
    ? `\n## Inspiration Source\nTitle: ${research.source_title || ""}\nContent: ${research.raw_content || ""}\nInsight: ${research.insight || ""}\n`
    : brief ? `\n## Brief\n${brief}\n` : "";

  const swipeContext = swipeEntries?.length
    ? `\n## Reference Posts (DO NOT COPY — use as voice/tone inspiration only)\n${swipeEntries.slice(0, 5).map((s: any, i: number) => `${i + 1}. [${s.source_platform || 'web'}] "${(s.caption_text || '').slice(0, 200)}" (voice match: ${s.voice_similarity_score}/10)`).join('\n')}\n`
    : "";

  return `You are the content strategist for ${brandName}, a Gen Z matcha/coffee café brand in Tripoli, Libya.

## Brand Voice
${personalityNotes}
Voice archetype: ${brand?.voice_archetype || "confident-chaotic"}
Inspired by: ${(brand?.voice_inspirations || []).join(", ")}

## Libyan Tripoli Dialect Guide
- Use Tripoli dialect, NOT formal Arabic
- Key words: هسّا (now), بزاف (a lot), زين (good), أحنا (we), إيه (yes), شوية (a little)
- Negation with ما...ش pattern
- Code-switch naturally with English
- Warm, conversational, Gen Z energy

## Brand Voice Rules
- First line must stop the scroll
- Never: amazing, incredible, delicious, premium, authentic, elevate
- CTAs feel like punchlines not sales alarms
- Humor must be earned, not try-hard
- Reference mascot Nochi when it adds value

${brand?.brand_program ? `## Brand Program\n${brand.brand_program}\n` : ""}

${researchContext}
${swipeContext}
## Task
Format: ${format} post for ${platform}
Language: ${language === "ar" ? "Arabic (Libyan Tripoli dialect only)" : language === "en" ? "English only" : "Both Arabic AND English versions"}
Chaos level: ${chaosLevel}/5
Humor level: ${humorLevel}/5
Local references: ${localDensity}/5

## Output (JSON only)
{
  "caption_en": "English caption",
  "caption_ar": "Arabic Tripoli dialect caption",
  "image_brief": "Visual description for designer",
  "hashtags": ["#tag1", "#tag2"],
  "cta": "Call to action",
  "voice_score_estimate": 8,
  "hook_strength": "Why the hook works",
  "dialect_notes": "Arabic dialect notes"
}`;
}
