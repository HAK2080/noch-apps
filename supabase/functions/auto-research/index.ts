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
    const { brand, urls, topics, mode } = await req.json();
    // mode: "urls" | "topics" | "trending"
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "ANTHROPIC_API_KEY not set in Supabase secrets" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const client = new Anthropic({ apiKey });
    const results = [];

    if (mode === "urls" && urls?.length > 0) {
      // Fetch and analyze each URL
      for (const url of urls.slice(0, 5)) { // max 5 URLs at a time
        try {
          let pageContent = "";
          try {
            const res = await fetch(url, {
              headers: { "User-Agent": "Mozilla/5.0 (compatible; research-bot)" },
              signal: AbortSignal.timeout(8000),
            });
            const html = await res.text();
            // Basic text extraction — strip HTML tags
            pageContent = html
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim()
              .slice(0, 3000);
          } catch {
            pageContent = `Could not fetch content from ${url}`;
          }

          const msg = await client.messages.create({
            model: "claude-opus-4-5",
            max_tokens: 512,
            messages: [{
              role: "user",
              content: `You are analyzing content for ${brand.name}, a ${brand.category || "café"} brand in Libya targeting ${brand.target_audience || "Gen Z Libyans"}.

URL: ${url}
Page content: ${pageContent}

Extract insights for this brand's social content strategy. Return a JSON object:
{
  "source_title": "brief title describing what this is",
  "source_platform": "instagram/tiktok/website/news/etc",
  "insight": "1-2 sentences: what does this mean for ${brand.name} content? Be specific and actionable.",
  "content_angle": "one specific post idea this inspires",
  "tags": ["tag1", "tag2", "tag3"],
  "relevance_score": 8
}

Only return JSON, no explanation.`,
            }],
          });

          const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";
          const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
          results.push({ ...parsed, source_url: url, source_type: "url" });
        } catch (e) {
          results.push({
            source_url: url,
            source_type: "url",
            source_title: url,
            insight: "Could not analyze this URL",
            tags: [],
            relevance_score: 1,
          });
        }
      }
    }

    if (mode === "topics" && topics?.length > 0) {
      // Generate research ideas for given topics
      const msg = await client.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 2048,
        messages: [{
          role: "user",
          content: `You are a content strategist for ${brand.name}, a Gen Z café brand in Tripoli, Libya.
Brand voice: ${brand.voice_archetype || "confident-chaotic"}
Target: ${brand.target_audience || "Gen Z Libyans 18-28"}

For each of these topics, generate content research insights:
Topics: ${topics.join(", ")}

For each topic, return a JSON array item:
{
  "source_title": "specific insight title",
  "source_type": "trend",
  "source_platform": "instagram",
  "insight": "specific, actionable insight for ${brand.name} content",
  "content_angle": "exact post idea this could become",
  "tags": ["relevant", "tags"],
  "relevance_score": 8
}

Return a JSON array. Only JSON, no explanation.`,
        }],
      });

      const text = msg.content[0].type === "text" ? msg.content[0].text : "[]";
      try {
        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
        results.push(...(Array.isArray(parsed) ? parsed : [parsed]));
      } catch {}
    }

    if (mode === "trending") {
      // Generate trending content opportunities for the brand
      const msg = await client.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 2048,
        messages: [{
          role: "user",
          content: `You are a content strategist for ${brand.name}, a Gen Z café/matcha brand in Tripoli, Libya.
Brand voice: ${brand.voice_archetype || "confident-chaotic, witty"}
Platforms: ${(brand.platforms || ["instagram", "facebook"]).join(", ")}
Current date context: We're in 2026, post-pandemic café culture boom.

Generate 5 specific, timely content research opportunities for this brand right now. Think about:
- Seasonal content (what's relevant right now)
- Platform trends (what formats are getting engagement)
- Libyan/regional cultural moments
- Café industry trends
- Gen Z cultural references

Return a JSON array. Each item:
{
  "source_title": "specific trend or opportunity title",
  "source_type": "trend",
  "source_platform": "instagram",
  "raw_content": "describe the trend/opportunity in detail",
  "insight": "why this matters for ${brand.name} and how to use it",
  "content_angle": "specific post idea",
  "tags": ["tag1", "tag2"],
  "relevance_score": 8
}

Only JSON, no explanation.`,
        }],
      });

      const text = msg.content[0].type === "text" ? msg.content[0].text : "[]";
      try {
        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
        results.push(...(Array.isArray(parsed) ? parsed : [parsed]));
      } catch {}
    }

    if (mode === "web-scout") {
      // Phase 1: Claude generates search queries from brand fingerprint
      const brandContext = `Brand: ${brand.name}
Voice: ${brand.voice_archetype || "confident-chaotic"}
Inspirations: ${(brand.voice_inspirations || []).join(", ")}
Category: ${brand.category || "café"}
Target: ${brand.target_audience || "Gen Z Libyans"}
Platforms: ${(brand.platforms || ["instagram"]).join(", ")}
Personality: ${brand.personality_notes || ""}
Brand program excerpt: ${(brand.brand_program || "").slice(0, 500)}`;

      let queries: string[] = [];
      try {
        const queryMsg = await client.messages.create({
          model: "claude-opus-4-5",
          max_tokens: 512,
          messages: [{
            role: "user",
            content: `${brandContext}

Generate 6 Google search queries to find social media posts from brands with a SIMILAR voice/personality. Mix these categories:
1. Two queries for similar brands on Instagram/TikTok (caption examples)
2. One query for the brand's inspiration brands' best posts
3. One query for the brand's category + target audience social content
4. One query for Arabic social media content in similar tone
5. One query for competitors or similar cafés in Libya/MENA

Return ONLY a JSON array of strings (the queries). No explanation.`,
          }],
        });
        const qt = queryMsg.content[0].type === "text" ? queryMsg.content[0].text : "[]";
        queries = JSON.parse(qt.replace(/```json|```/g, "").trim());
      } catch {
        queries = [
          `${brand.name} best social media posts`,
          `Gen Z café brand funny Instagram captions`,
          `${(brand.voice_inspirations || ["Wendy's"])[0]} best tweets`,
          `Libya café Instagram posts`,
        ];
      }

      // Phase 2: Search using Google CSE or DuckDuckGo fallback
      const googleKey = Deno.env.get("GOOGLE_CSE_KEY");
      const googleCseId = Deno.env.get("GOOGLE_CSE_ID");

      const searchResults: { query: string; url: string; title: string; snippet: string }[] = [];

      for (const query of queries.slice(0, 6)) {
        try {
          if (googleKey && googleCseId) {
            // Google Custom Search API
            const gUrl = `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${googleCseId}&q=${encodeURIComponent(query)}&num=3`;
            const gRes = await fetch(gUrl, { signal: AbortSignal.timeout(8000) });
            const gData = await gRes.json();
            for (const item of (gData.items || []).slice(0, 3)) {
              searchResults.push({ query, url: item.link, title: item.title, snippet: item.snippet || "" });
            }
          } else {
            // DuckDuckGo HTML fallback
            const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
            const ddgRes = await fetch(ddgUrl, {
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
              signal: AbortSignal.timeout(8000),
            });
            const ddgHtml = await ddgRes.text();
            // Extract result URLs from DDG HTML
            const urlMatches = ddgHtml.match(/href="\/\/duckduckgo\.com\/l\/\?uddg=([^&"]+)/g) || [];
            for (const match of urlMatches.slice(0, 3)) {
              const encoded = match.match(/uddg=([^&"]+)/)?.[1] || "";
              const url = decodeURIComponent(encoded);
              if (url && url.startsWith("http")) {
                searchResults.push({ query, url, title: "", snippet: "" });
              }
            }
          }
        } catch {}
      }

      // Phase 3: Fetch and extract content from top results
      const pageContents: { url: string; content: string; query: string }[] = [];
      const seen = new Set<string>();

      for (const sr of searchResults.slice(0, 15)) {
        if (seen.has(sr.url)) continue;
        seen.add(sr.url);
        try {
          const res = await fetch(sr.url, {
            headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
            signal: AbortSignal.timeout(6000),
          });
          const html = await res.text();
          const text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 2000);
          if (text.length > 100) {
            pageContents.push({ url: sr.url, content: text, query: sr.query });
          }
        } catch {}
      }

      // Phase 4: Claude extracts individual posts and scores voice similarity
      if (pageContents.length > 0) {
        const batchContent = pageContents.slice(0, 8).map((pc, i) =>
          `--- PAGE ${i + 1} (${pc.url}) ---\n${pc.content}`
        ).join("\n\n");

        const extractMsg = await client.messages.create({
          model: "claude-opus-4-5",
          max_tokens: 4096,
          messages: [{
            role: "user",
            content: `${brandContext}

I scraped these web pages looking for social media posts from brands with a similar voice. Extract any individual social media captions/posts you can find. For each, score how similar the voice is to this brand.

${batchContent}

Return a JSON array. For EACH distinct post/caption found:
{
  "caption_text": "the actual caption or post text",
  "source_url": "the page URL it came from",
  "source_platform": "instagram/twitter/tiktok/website/blog",
  "author_handle": "@username if visible, otherwise null",
  "caption_language": "en/ar/mixed",
  "hashtags": ["extracted", "hashtags"],
  "voice_similarity_score": 7.5,
  "why_relevant": "1 sentence explaining why this matches the brand voice",
  "tags": ["relevant", "tags"]
}

Rules:
- Only include posts that ACTUALLY exist in the scraped content (don't invent)
- Score voice similarity 1-10 (10 = perfect match)
- Filter out generic/boring posts — only keep ones with personality
- Include posts in Arabic if found
- Return empty array [] if no good posts found

ONLY return JSON, no explanation.`,
          }],
        });

        const extractText = extractMsg.content[0].type === "text" ? extractMsg.content[0].text : "[]";
        try {
          const entries = JSON.parse(extractText.replace(/```json|```/g, "").trim());
          const swipeEntries = (Array.isArray(entries) ? entries : [entries])
            .filter((e: any) => e.caption_text && e.voice_similarity_score >= 5)
            .map((e: any) => ({ ...e, collected_by: "web-scout" }));
          results.push(...swipeEntries);
        } catch {}
      }
    }

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
