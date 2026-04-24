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
    const { brand, materials, currentProgram, mode, negativeExamples } = await req.json();
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "ANTHROPIC_API_KEY not set in Supabase secrets" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const client = new Anthropic({ apiKey });

    // Voice comparison mode — score a text against brand voice
    if (mode === "score_only") {
      const text = materials?.[0]?.content || "";

      // Use voice_fingerprint_json for more accurate scoring if available
      const fingerprintContext = brand.voice_fingerprint_json
        ? `\nVoice Fingerprint (scored dimensions):\n${JSON.stringify(brand.voice_fingerprint_json, null, 2)}`
        : "";

      const extractedPatterns = brand.extracted_patterns
        ? `\nExtracted Patterns:\n${JSON.stringify(brand.extracted_patterns, null, 2)}`
        : "";

      const msg = await client.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 512,
        messages: [{
          role: "user",
          content: `You are scoring text against a brand voice.

Brand: ${brand.name}
Voice: ${brand.voice_archetype || "confident-chaotic"}
Brand program: ${(brand.brand_program || "").slice(0, 1500)}
${fingerprintContext}
${extractedPatterns}

Text to score:
"${text}"

Score this text on 5 dimensions (1-10 each). Use the voice fingerprint dimensions above to inform your scoring — a text that matches the brand's fingerprint scores should score higher. Return ONLY JSON:
{
  "voice": 7,
  "dialect": 5,
  "hook": 8,
  "humor": 6,
  "relevance": 7,
  "feedback": "1-2 sentences explaining the scores"
}`,
        }],
      });

      const scoreText = msg.content[0].type === "text" ? msg.content[0].text : "{}";
      try {
        const parsed = JSON.parse(scoreText.replace(/```json|```/g, "").trim());
        return new Response(
          JSON.stringify({ success: true, ...parsed }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch {
        return new Response(
          JSON.stringify({ success: true, voice: 5, dialect: 5, hook: 5, humor: 5, relevance: 5, feedback: "Could not parse scores" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── DEFAULT MODE: Full structured analysis ──

    // Build content blocks — text materials + images
    const imageBlocks: Anthropic.ImageBlockParam[] = [];

    const systemPrompt = `You are a brand voice analyst. Your job is to study a brand's real content examples and extract precise voice patterns that can be used to generate more content in the same style.

Be specific, not generic. Don't say "casual tone" — say exactly what linguistic patterns make it casual. Don't say "uses humor" — describe the exact humor mechanics with examples.

You MUST output your response as a single JSON object wrapped in a \`\`\`json code block. No other text outside the JSON block.`;

    // Build the message
    let textContext = `# Brand: ${brand.name}${brand.name_ar ? ` / ${brand.name_ar}` : ""}
Voice archetype: ${brand.voice_archetype || "not set"}
Dialect: ${brand.dialect || "libyan-tripoli"}
Inspirations: ${(brand.voice_inspirations || []).join(", ")}

# Training Materials to Analyze:
`;

    let imageCount = 0;
    for (const mat of materials) {
      if (mat.type === "post_screenshot" && mat.file_url) {
        textContext += `\n[IMAGE: ${mat.title || "Post screenshot"} — ${mat.notes || "analyze voice/tone"}]\n`;
        if (imageCount < 5) {
          try {
            const res = await fetch(mat.file_url, { signal: AbortSignal.timeout(5000) });
            if (res.ok) {
              const blob = await res.arrayBuffer();
              const base64 = btoa(String.fromCharCode(...new Uint8Array(blob)));
              const mimeType = res.headers.get("content-type") || "image/jpeg";
              imageBlocks.push({
                type: "image",
                source: { type: "base64", media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp", data: base64 },
              });
              imageCount++;
            }
          } catch { /* skip failed image fetches */ }
        }
      } else if (mat.content) {
        textContext += `\n## ${mat.type?.replace(/_/g, " ").toUpperCase()}: ${mat.title || ""}\n${mat.content}\n${mat.notes ? `Notes: ${mat.notes}` : ""}\n`;
      } else if (mat.url && !mat.file_url) {
        textContext += `\n## REFERENCE URL: ${mat.title || mat.url}\n${mat.url}\n${mat.notes ? `Notes: ${mat.notes}` : ""}\n`;
      }
    }

    // Add negative examples if provided
    if (negativeExamples && negativeExamples.length > 0) {
      textContext += `\n\n# Examples the brand EXPLICITLY REJECTED — learn what to avoid:\n`;
      for (const neg of negativeExamples) {
        textContext += `\n## REJECTED CONTENT:\n${neg.content}\n`;
        if (neg.why_bad) textContext += `Why it was rejected: ${neg.why_bad}\n`;
        if (neg.tags && neg.tags.length > 0) textContext += `Tags: ${neg.tags.join(", ")}\n`;
        if (neg.platform) textContext += `Platform: ${neg.platform}\n`;
      }
    }

    textContext += `

# Your Task:
Analyze ALL the above materials and produce a structured analysis. You MUST return ONLY a JSON object inside a \`\`\`json code block with this exact structure:

\`\`\`json
{
  "fingerprint": {
    "formality": { "score": 3, "confidence": 8, "evidence": "Uses slang like X, drops formal Arabic entirely..." },
    "humor": { "score": 7, "confidence": 7, "evidence": "Self-deprecating jokes about coffee addiction, meme references..." },
    "sarcasm": { "score": 6, "confidence": 6, "evidence": "..." },
    "warmth": { "score": 8, "confidence": 7, "evidence": "..." },
    "aggression": { "score": 2, "confidence": 8, "evidence": "..." },
    "code_switching": { "score": 7, "confidence": 6, "evidence": "Mixes Arabic and English mid-sentence..." },
    "dialect_density": { "score": 8, "confidence": 7, "evidence": "Heavy Libyan Tripoli dialect usage..." },
    "meme_native": { "score": 5, "confidence": 5, "evidence": "..." },
    "cta_directness": { "score": 4, "confidence": 6, "evidence": "..." },
    "religious_refs": { "score": 3, "confidence": 7, "evidence": "..." }
  },
  "self_assessment": {
    "overall_confidence": 7,
    "gaps": ["Need more story-type posts to assess narrative voice", "No video scripts analyzed"],
    "recommendations": ["Upload competitor examples for comparison", "Add 3-5 more caption examples"]
  },
  "dialect_extractions": [
    { "phrase_ar": "هسا", "phrase_en": "right now", "context": "Used in CTAs", "category": "time_expressions" },
    { "phrase_ar": "يا زين", "phrase_en": "how beautiful", "context": "Product praise", "category": "exclamations" }
  ],
  "analysis_text": "## VOICE FINGERPRINT\\nList 5-8 specific patterns...\\n\\n## WHAT MAKES THEM LAUGH\\n...\\n\\n## HOOK PATTERNS THAT WORK\\n...\\n\\n## VOCABULARY\\n...\\n\\n## CTA STYLE\\n...\\n\\n## CONTENT FORMAT PATTERNS\\n...\\n\\n## RED FLAGS\\n...\\n\\n## IMPROVEMENT SUGGESTIONS\\n...\\n\\n## UPDATED GENERATION RULES\\n..."
}
\`\`\`

IMPORTANT RULES for the JSON:
- "fingerprint": Score each of the 10 dimensions from 1-10. Confidence is also 1-10 (how sure you are given available data). Evidence must cite specific examples from the materials.
- "self_assessment": Be honest about what data is missing. overall_confidence is 1-10.
- "dialect_extractions": Extract ALL Arabic dialect phrases you find in the materials. Categories: greetings, exclamations, time_expressions, food_drink, slang, filler_words, religious, humor, cta_phrases, other.
- "analysis_text": This should contain the full detailed text analysis with the sections: VOICE FINGERPRINT, WHAT MAKES THEM LAUGH, HOOK PATTERNS THAT WORK, VOCABULARY, CTA STYLE, CONTENT FORMAT PATTERNS, RED FLAGS, IMPROVEMENT SUGGESTIONS, UPDATED GENERATION RULES.
${negativeExamples && negativeExamples.length > 0 ? '- Pay special attention to the REJECTED examples. Your analysis should clearly note what patterns to AVOID based on them.' : ''}`;

    // Build message content
    const msgContent: Anthropic.MessageParam["content"] = [];
    msgContent.push({ type: "text", text: textContext });
    for (const img of imageBlocks) {
      msgContent.push(img);
    }

    const message = await client.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 6000,
      system: systemPrompt,
      messages: [{ role: "user", content: msgContent }],
    });

    const rawResponse = message.content[0].type === "text" ? message.content[0].text : "";

    // Try to parse structured JSON from the response
    let fingerprint = null;
    let selfAssessment = null;
    let dialectExtractions = null;
    let analysisText = rawResponse;

    try {
      const jsonMatch = rawResponse.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1].trim());
        fingerprint = parsed.fingerprint || null;
        selfAssessment = parsed.self_assessment || null;
        dialectExtractions = parsed.dialect_extractions || null;
        analysisText = parsed.analysis_text || rawResponse;
      }
    } catch {
      // If JSON parsing fails, use the raw text as analysis_text
      analysisText = rawResponse;
    }

    // Build updated brand program
    const updatedProgram = `# Brand Program: ${brand.name}
Last Analyzed: ${new Date().toISOString()}
Materials Analyzed: ${materials.length}

${analysisText}

---
${currentProgram ? `## Previous Program Notes\n${currentProgram.slice(0, 500)}...` : ""}`;

    return new Response(
      JSON.stringify({
        success: true,
        analysis: analysisText,
        updatedProgram,
        fingerprint,
        selfAssessment,
        dialectExtractions,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
