// supabase/functions/cs-scrape-wattpad/index.ts
// Scrapes a Wattpad story — title, author, and every chapter's raw text.
// Uses Wattpad's public API endpoints (apiv2) to avoid JS-rendered HTML.
// Zero token cost. Polite ~250ms delay between chapter fetches.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/json,*/*",
      "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
    },
    signal: AbortSignal.timeout(15000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// Extract story ID from any Wattpad URL. Returns {id, kind} where kind is
// "story" (already a story ID) or "part" (a chapter/part ID — must be resolved to parent story).
function extractStoryId(url: string): { id: string; kind: "story" | "part" } | null {
  const s = url.match(/wattpad\.com\/story\/(\d+)/i);
  if (s) return { id: s[1], kind: "story" };
  const p = url.match(/wattpad\.com\/(\d+)(?:[-/?#]|$)/i);
  if (p) return { id: p[1], kind: "part" };
  return null;
}

// Given a part (chapter) ID, ask Wattpad for its parent story (groupId).
async function resolvePartToStory(partId: string): Promise<string> {
  const url = `https://www.wattpad.com/api/v3/story_parts/${partId}?fields=groupId`;
  const text = await fetchText(url);
  const body = JSON.parse(text) as { groupId?: string | number };
  if (!body.groupId) throw new Error(`Could not resolve chapter ${partId} to a story`);
  return String(body.groupId);
}

// Wattpad's apiv2 returns story info including parts (chapters).
// Public endpoint, no auth required.
type WattpadPart = { id: number; title: string; url: string };
type WattpadStory = {
  id: string;
  title: string;
  author?: { name?: string; username?: string };
  user?: { name?: string; username?: string };
  parts?: WattpadPart[];
  storyParts?: WattpadPart[];
};

async function fetchStoryInfo(storyId: string): Promise<WattpadStory> {
  // Fields param limits the payload size
  const fields =
    "id,title,user(name,username),parts(id,title,url)";
  const url =
    `https://www.wattpad.com/api/v3/stories/${storyId}?fields=${
      encodeURIComponent(fields)
    }`;
  const text = await fetchText(url);
  return JSON.parse(text);
}

// Fetch raw text of a chapter. Wattpad exposes:
//   https://www.wattpad.com/apiv2/?m=storytext&id={chapterId}&page={n}&output=json
// Returns JSON: { text: "<html...>", lastPage: 1|0 }
async function fetchChapterText(chapterId: number): Promise<string> {
  const parts: string[] = [];
  let page = 1;
  while (page <= 15) {
    const url =
      `https://www.wattpad.com/apiv2/?m=storytext&id=${chapterId}&page=${page}&output=json`;
    let body: { text?: string; lastPage?: number; last_page?: boolean };
    try {
      const raw = await fetchText(url);
      body = JSON.parse(raw);
    } catch (_e) {
      break;
    }
    if (body.text) parts.push(stripTags(body.text));
    const last = body.last_page === true || body.lastPage === 1 ||
      body.lastPage === true as unknown as number;
    if (last) break;
    page += 1;
    await sleep(200);
  }
  return parts.join("\n\n").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: { storyUrl?: string; maxChapters?: number } = {};
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const storyUrl = (body.storyUrl || "").trim();
  const maxChapters = Math.max(1, Math.min(body.maxChapters || 50, 200));

  const parsed = extractStoryId(storyUrl);
  if (!parsed) {
    return jsonResponse({
      error:
        "Could not find a story ID in that URL. Use a Wattpad story or chapter URL.",
    }, 400);
  }

  try {
    const storyId = parsed.kind === "story"
      ? parsed.id
      : await resolvePartToStory(parsed.id);
    const story = await fetchStoryInfo(storyId);
    const title = story.title || "Untitled";
    const author = story.user?.name || story.user?.username ||
      story.author?.name || story.author?.username || "";
    const rawParts = story.parts || story.storyParts || [];

    if (!Array.isArray(rawParts) || rawParts.length === 0) {
      return jsonResponse({
        error:
          "Wattpad API returned no chapters for this story. The story might be private or removed.",
        storyTitle: title,
        debug: {
          storyId,
          apiKeys: Object.keys(story),
        },
      }, 422);
    }

    const limit = Math.min(rawParts.length, maxChapters);
    const results: Array<{
      url: string;
      title: string;
      text: string;
      chars: number;
      skipped?: boolean;
    }> = [];
    let totalChars = 0;

    for (let i = 0; i < limit; i++) {
      const part = rawParts[i];
      const chapterUrl = part.url?.startsWith("http")
        ? part.url
        : `https://www.wattpad.com${part.url || `/${part.id}`}`;
      try {
        const text = await fetchChapterText(part.id);
        if (text.length < 200) {
          results.push({
            url: chapterUrl,
            title: part.title || `Chapter ${i + 1}`,
            text: "",
            chars: 0,
            skipped: true,
          });
        } else {
          results.push({
            url: chapterUrl,
            title: part.title || `Chapter ${i + 1}`,
            text,
            chars: text.length,
          });
          totalChars += text.length;
        }
      } catch (e) {
        console.error("chapter fetch failed", part.id, e);
        results.push({
          url: chapterUrl,
          title: part.title || `Chapter ${i + 1}`,
          text: "",
          chars: 0,
          skipped: true,
        });
      }
      if (i < limit - 1) await sleep(250);
    }

    return jsonResponse({
      storyTitle: title,
      author,
      storyUrl,
      chaptersFound: rawParts.length,
      chaptersFetched: results.filter((r) => !r.skipped).length,
      chaptersSkipped: results.filter((r) => r.skipped).length,
      totalChars,
      chapters: results,
    });
  } catch (e) {
    console.error("cs-scrape-wattpad error", e);
    return jsonResponse(
      {
        error: e instanceof Error ? e.message : "Unknown error",
        hint:
          "If this persists, paste a chapter text manually into the Paste tab.",
      },
      500,
    );
  }
});
