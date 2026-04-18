import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { ingredient_name, unit } = await req.json();
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ success: false, error: "ANTHROPIC_API_KEY not set" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });

    // Build DuckDuckGo search URL
    const searchQuery = `${ingredient_name} price Libya LYD`;
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;

    // Fetch with mobile UA and 10s timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    let snippets: string[] = [];
    let resultUrls: string[] = [];

    try {
      const response = await fetch(searchUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const html = await response.text();

      // Extract snippets
      const snippetRegex = /<a class="result__snippet">(.*?)<\/a>/gs;
      let match;
      while ((match = snippetRegex.exec(html)) !== null) {
        // Strip HTML tags from snippet
        const cleanSnippet = match[1].replace(/<[^>]*>/g, '').trim();
        if (cleanSnippet) snippets.push(cleanSnippet);
      }

      // Extract result URLs
      const urlRegex = /<a class="result__url"[^>]*href="([^"]*)"[^>]*>/g;
      while ((match = urlRegex.exec(html)) !== null) {
        resultUrls.push(match[1].trim());
      }

      // Fallback: also try result__a links
      if (snippets.length === 0) {
        const altSnippetRegex = /<a class="result__a"[^>]*>(.*?)<\/a>/gs;
        while ((match = altSnippetRegex.exec(html)) !== null) {
          const cleanSnippet = match[1].replace(/<[^>]*>/g, '').trim();
          if (cleanSnippet) snippets.push(cleanSnippet);
        }
      }
    } catch (fetchErr) {
      clearTimeout(timeout);
      snippets = [`Search failed: ${fetchErr.message}`];
    }

    // Send snippets to Claude for price extraction
    const client = new Anthropic({ apiKey });

    const snippetText = snippets.slice(0, 15).map((s, i) => `${i + 1}. ${s}`).join('\n');
    const urlText = resultUrls.slice(0, 10).map((u, i) => `${i + 1}. ${u}`).join('\n');

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `Extract any price mentions for "${ingredient_name}" (unit: ${unit || 'any'}) from these web search snippets and URLs.

Search snippets:
${snippetText || 'No snippets found'}

Result URLs:
${urlText || 'No URLs found'}

Return ONLY valid JSON (no markdown, no code blocks):
{
  "estimated_price_lyd": null or number,
  "price_range": { "min": null or number, "max": null or number },
  "sources": ["url1", "url2"],
  "confidence": "low" or "medium" or "high",
  "notes": "brief explanation"
}

If no prices found, set estimated_price_lyd to null and confidence to "low" with a note explaining why.`
      }],
    });

    const rawText = message.content[0].type === "text" ? message.content[0].text : "{}";
    let result: any = {};
    try {
      // Try to parse directly, or extract from code block
      const cleaned = rawText.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
      result = JSON.parse(cleaned);
    } catch {
      result = { estimated_price_lyd: null, price_range: { min: null, max: null }, sources: [], confidence: "low", notes: "Failed to parse price data" };
    }

    return new Response(JSON.stringify({ success: true, ...result }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});
