import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function safeFetch(url: string, opts: RequestInit = {}): Promise<string> {
  const res = await fetch(url, {
    ...opts,
    headers: { "User-Agent": MOBILE_UA, ...(opts.headers as Record<string, string> || {}) },
    signal: AbortSignal.timeout(10000),
  });
  return await res.text();
}

function extractHandle(pageUrl: string): string {
  try {
    const u = new URL(pageUrl);
    // e.g. https://facebook.com/cafename or https://www.instagram.com/handle/
    return u.pathname.replace(/^\/+|\/+$/g, "").split("/")[0];
  } catch {
    return pageUrl;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Facebook scraping (best-effort from mobile HTML)
// ---------------------------------------------------------------------------

interface RawPost {
  text: string;
  reactions: number;
  comments: number;
  shares: number;
}

function extractFacebookPosts(html: string, handle: string): RawPost[] {
  const posts: RawPost[] = [];

  // Strategy 1: look for story_body_container / userContent divs
  const patterns = [
    /class="[^"]*(?:story_body_container|userContent)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    /data-ft[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/gi,
    /<div[^>]*class="[^"]*(?:_5pbx|_3x-2)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
  ];

  for (const pat of patterns) {
    let match;
    while ((match = pat.exec(html)) !== null) {
      const text = stripHtml(match[1]).trim();
      if (text.length > 20 && text.length < 3000) {
        posts.push({ text, reactions: 0, comments: 0, shares: 0 });
      }
    }
    if (posts.length > 0) break;
  }

  // Strategy 2: if nothing matched, try splitting on common separators and looking for Arabic or long text
  if (posts.length === 0) {
    const cleaned = stripHtml(html);
    // Look for paragraphs that contain Arabic characters (at least 20 chars)
    const arabicBlocks = cleaned.match(/[\u0600-\u06FF][\s\S]{20,500}/g);
    if (arabicBlocks) {
      for (const block of arabicBlocks.slice(0, 10)) {
        const trimmed = block.trim();
        if (trimmed.length > 20) {
          posts.push({ text: trimmed, reactions: 0, comments: 0, shares: 0 });
        }
      }
    }
  }

  // Try to extract reaction / comment counts from nearby HTML
  const reactionMatch = html.match(/(\d+)\s*(?:reactions?|likes?|إعجاب)/gi);
  const commentMatch = html.match(/(\d+)\s*(?:comments?|تعليق)/gi);
  const shareMatch = html.match(/(\d+)\s*(?:shares?|مشاركة)/gi);

  // Apply counts to first post as rough approximation
  if (posts.length > 0) {
    if (reactionMatch) {
      const n = parseInt(reactionMatch[0]);
      if (!isNaN(n)) posts[0].reactions = n;
    }
    if (commentMatch) {
      const n = parseInt(commentMatch[0]);
      if (!isNaN(n)) posts[0].comments = n;
    }
    if (shareMatch) {
      const n = parseInt(shareMatch[0]);
      if (!isNaN(n)) posts[0].shares = n;
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return posts.filter((p) => {
    const key = p.text.slice(0, 80);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function scrapeFacebook(
  handle: string,
): Promise<RawPost[]> {
  const urls = [
    `https://m.facebook.com/${handle}/`,
    `https://m.facebook.com/${handle}/posts/`,
  ];

  let allPosts: RawPost[] = [];

  for (const url of urls) {
    try {
      const html = await safeFetch(url);
      const posts = extractFacebookPosts(html, handle);
      allPosts = allPosts.concat(posts);
    } catch {
      // skip this URL
    }
    if (allPosts.length >= 5) break;
  }

  return allPosts.slice(0, 15);
}

// ---------------------------------------------------------------------------
// Instagram scraping (best-effort)
// ---------------------------------------------------------------------------

function extractInstagramPosts(html: string, handle: string): RawPost[] {
  const posts: RawPost[] = [];

  // Try JSON-LD
  const jsonLdMatch = html.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i,
  );
  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch[1]);
      if (ld.description) {
        posts.push({
          text: ld.description,
          reactions: 0,
          comments: 0,
          shares: 0,
        });
      }
    } catch {
      // ignore
    }
  }

  // Try window._sharedData or similar embedded JSON
  const sharedData = html.match(
    /window\._sharedData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/i,
  );
  if (sharedData) {
    try {
      const sd = JSON.parse(sharedData[1]);
      const edges =
        sd?.entry_data?.ProfilePage?.[0]?.graphql?.user
          ?.edge_owner_to_timeline_media?.edges || [];
      for (const edge of edges.slice(0, 10)) {
        const node = edge.node;
        const caption =
          node?.edge_media_to_caption?.edges?.[0]?.node?.text || "";
        if (caption) {
          posts.push({
            text: caption,
            reactions: node?.edge_liked_by?.count || 0,
            comments: node?.edge_media_to_comment?.count || 0,
            shares: 0,
          });
        }
      }
    } catch {
      // ignore
    }
  }

  return posts.slice(0, 10);
}

async function scrapeInstagram(handle: string): Promise<RawPost[]> {
  try {
    const html = await safeFetch(`https://www.instagram.com/${handle}/`);
    const posts = extractInstagramPosts(html, handle);
    if (posts.length === 0) {
      // Try ?__a=1 endpoint
      try {
        const jsonText = await safeFetch(
          `https://www.instagram.com/${handle}/?__a=1`,
        );
        const data = JSON.parse(jsonText);
        const edges =
          data?.graphql?.user?.edge_owner_to_timeline_media?.edges || [];
        for (const edge of edges.slice(0, 10)) {
          const caption =
            edge.node?.edge_media_to_caption?.edges?.[0]?.node?.text || "";
          if (caption) {
            posts.push({
              text: caption,
              reactions: edge.node?.edge_liked_by?.count || 0,
              comments: edge.node?.edge_media_to_comment?.count || 0,
              shares: 0,
            });
          }
        }
      } catch {
        // Instagram likely requires API access
      }
    }
    return posts;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Claude analysis for Arabic posts
// ---------------------------------------------------------------------------

interface AnalysisResult {
  voice_similarity_score: number;
  content_category: string;
  dialect_phrases: Array<{
    phrase_ar: string;
    phrase_en: string;
    context: string;
    category: string;
  }>;
}

async function analyzePostWithClaude(
  client: InstanceType<typeof Anthropic>,
  postText: string,
  brandFingerprint: string,
): Promise<AnalysisResult> {
  const msg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: `You are analyzing a social media post from Tripoli, Libya for a coffee/F&B brand content engine.

Brand voice fingerprint:
${brandFingerprint || "Confident, warm, unapologetic Libyan coffee brand. Uses Tripoli dialect. Meme-native."}

Post text:
${postText}

Respond in JSON only (no markdown):
{
  "voice_similarity_score": <1-10, how close is this post's voice/tone to the brand>,
  "content_category": "<one of: product_showcase, humor_meme, behind_scenes, cultural_moment, ugc, promotion, educational>",
  "dialect_phrases": [
    {"phrase_ar": "...", "phrase_en": "...", "context": "how it's used", "category": "slang|greeting|expression|food_term|exclamation"}
  ]
}

Extract any Libyan Tripoli dialect phrases. If no Arabic dialect found, return empty dialect_phrases array.`,
      },
    ],
  });

  const text =
    msg.content[0].type === "text" ? msg.content[0].text : "";
  try {
    // Strip potential markdown code fences
    const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return {
      voice_similarity_score: 5,
      content_category: "educational",
      dialect_phrases: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Mode: SCRAPE
// ---------------------------------------------------------------------------

async function handleScrape(
  body: Record<string, unknown>,
): Promise<Response> {
  const { brand, sources, brand_fingerprint } = body as {
    brand: Record<string, unknown>;
    sources: Array<{ id: string; platform: string; page_url: string }>;
    brand_fingerprint?: string;
  };

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  const client = apiKey ? new Anthropic({ apiKey }) : null;

  const allPosts: Record<string, unknown>[] = [];
  const allDialect: Record<string, unknown>[] = [];
  let pagesAttempted = 0;
  let pagesSucceeded = 0;

  for (const source of (sources || []).slice(0, 10)) {
    pagesAttempted++;
    try {
      const handle = extractHandle(source.page_url);
      let rawPosts: RawPost[] = [];

      if (source.platform === "facebook") {
        rawPosts = await scrapeFacebook(handle);
      } else if (source.platform === "instagram") {
        rawPosts = await scrapeInstagram(handle);
      }

      if (rawPosts.length > 0) pagesSucceeded++;

      for (const raw of rawPosts) {
        const hasArabic = /[\u0600-\u06FF]/.test(raw.text);
        let analysis: AnalysisResult | null = null;

        if (hasArabic && client) {
          try {
            analysis = await analyzePostWithClaude(
              client,
              raw.text,
              (brand_fingerprint as string) ||
                (brand as Record<string, unknown>)?.brand_program as string ||
                "",
            );
          } catch {
            // Claude analysis failed — continue without it
          }
        }

        const engagementScore =
          raw.reactions + raw.comments * 2 + raw.shares * 3;

        allPosts.push({
          source_url: source.page_url,
          source_platform: source.platform,
          caption_text: raw.text,
          caption_language: hasArabic ? "ar" : "en",
          author_handle: handle,
          voice_similarity_score: analysis?.voice_similarity_score || 5,
          content_category: analysis?.content_category || "educational",
          engagement_score: engagementScore,
          reactions: raw.reactions,
          comments_count: raw.comments,
          shares_count: raw.shares,
          scraped_from_source: source.id,
        });

        if (analysis?.dialect_phrases) {
          for (const dp of analysis.dialect_phrases) {
            allDialect.push({
              phrase_ar: dp.phrase_ar,
              phrase_en: dp.phrase_en,
              context: dp.context,
              category: dp.category,
              source: `scrape:${source.platform}:${handle}`,
            });
          }
        }
      }
    } catch {
      // Skip failed source, continue with next
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      posts: allPosts,
      dialect_extractions: allDialect,
      scrape_stats: {
        pages_attempted: pagesAttempted,
        pages_succeeded: pagesSucceeded,
        posts_found: allPosts.length,
      },
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

// ---------------------------------------------------------------------------
// Mode: DISCOVER
// ---------------------------------------------------------------------------

async function handleDiscover(
  body: Record<string, unknown>,
): Promise<Response> {
  const { brand, city } = body as {
    brand: Record<string, unknown>;
    city?: string;
  };
  const cityName = city || "tripoli";

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({
        success: false,
        error: "ANTHROPIC_API_KEY not set in Supabase secrets",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      },
    );
  }

  const client = new Anthropic({ apiKey });

  // Ask Claude to generate search queries
  const queryMsg = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: `Generate 8 DuckDuckGo search queries to find public Facebook pages of cafes, restaurants, food bloggers, meme pages, and lifestyle pages in ${cityName}, Libya. Mix Arabic and English queries. Include "site:facebook.com" in each.

Respond as JSON array of strings only, no markdown:
["query1", "query2", ...]`,
      },
    ],
  });

  let queries: string[] = [];
  try {
    const raw =
      queryMsg.content[0].type === "text" ? queryMsg.content[0].text : "[]";
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    queries = JSON.parse(cleaned);
  } catch {
    queries = [
      `site:facebook.com مقهى ${cityName === "tripoli" ? "طرابلس" : cityName}`,
      `site:facebook.com coffee ${cityName} libya`,
      `site:facebook.com ${cityName === "tripoli" ? "طرابلس" : cityName} اكل`,
      `site:facebook.com ${cityName} cafe restaurant`,
      `site:facebook.com ${cityName === "tripoli" ? "طرابلس" : cityName} ميمز`,
      `site:facebook.com ${cityName} food blogger libya`,
      `site:facebook.com ${cityName === "tripoli" ? "مطعم طرابلس" : "مطعم " + cityName}`,
      `site:facebook.com libya coffee shop ${cityName}`,
    ];
  }

  const discovered: Array<{
    page_url: string;
    page_name: string;
    category: string;
    platform: string;
  }> = [];
  const seenHandles = new Set<string>();

  for (const query of queries.slice(0, 8)) {
    try {
      const html = await safeFetch(
        `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      );

      // Extract result links
      const linkPattern =
        /class="result__a"[^>]*href="([^"]*facebook\.com[^"]*)"/gi;
      let match;
      while ((match = linkPattern.exec(html)) !== null) {
        let url = match[1];
        // DuckDuckGo sometimes wraps URLs
        if (url.includes("uddg=")) {
          const decoded = decodeURIComponent(
            url.split("uddg=")[1]?.split("&")[0] || "",
          );
          if (decoded) url = decoded;
        }

        // Normalize
        try {
          const parsed = new URL(url);
          const handle = parsed.pathname
            .replace(/^\/+|\/+$/g, "")
            .split("/")[0];
          if (
            handle &&
            !seenHandles.has(handle.toLowerCase()) &&
            handle !== "pages" &&
            handle !== "groups" &&
            handle !== "watch" &&
            handle !== "events"
          ) {
            seenHandles.add(handle.toLowerCase());

            // Guess category from context
            const snippet = stripHtml(html.slice(Math.max(0, match.index - 200), match.index + 200)).toLowerCase();
            let category = "inspiration";
            if (snippet.includes("مقهى") || snippet.includes("cafe") || snippet.includes("coffee")) {
              category = "competitor";
            } else if (snippet.includes("ميم") || snippet.includes("meme") || snippet.includes("ضحك")) {
              category = "meme";
            } else if (snippet.includes("اكل") || snippet.includes("food") || snippet.includes("مطعم")) {
              category = "food";
            } else if (snippet.includes("blog") || snippet.includes("مدون")) {
              category = "lifestyle";
            }

            discovered.push({
              page_url: `https://facebook.com/${handle}`,
              page_name: handle.replace(/[.-]/g, " "),
              category,
              platform: "facebook",
            });
          }
        } catch {
          // skip invalid URL
        }
      }
    } catch {
      // skip failed query
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      discovered: discovered.slice(0, 30),
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const mode = body.mode || "scrape";

    if (mode === "scrape") {
      return await handleScrape(body);
    } else if (mode === "discover") {
      return await handleDiscover(body);
    } else {
      return new Response(
        JSON.stringify({ success: false, error: `Unknown mode: ${mode}` }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }
  } catch (err) {
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
