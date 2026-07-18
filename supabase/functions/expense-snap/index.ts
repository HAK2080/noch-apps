// Supabase Edge Function — expense-snap (Noch 5.0 Receipt Snap, v2)
// The shared brain behind photo-only + typed expense submission.
//
// AI extraction chain (first available wins):
//   1. Gemini 2.5 Flash — FREE tier (secret: GEMINI_API_KEY)
//   2. Claude Haiku     — fallback (secret: ANTHROPIC_API_KEY)
//   3. none             — record with amount 0/typed text; office reviews
//
// Actions (POST JSON):
//   extract       { image_base64, mime_type, source, submitted_by? | telegram_chat_id?,
//                   telegram_message_id?, caption? }
//                 -> { snap_id, extracted, receipt_url, cost_centers, suggested_code, needs_amount }
//   manual        { text, source, submitted_by? | telegram_chat_id? }
//                 -> typed expense ("450 قهوة للمخزن"), same return shape (no receipt_url)
//   set_amount    { snap_id, text } -> staff typed the amount after we asked
//   finalize      { snap_id, allocation: {mode:'single',code} | {mode:'even'} | {mode:'custom',parts} }
//   custom_parse  { snap_id, text } -> parse free-text split, then finalize
//   mark_custom   { snap_id }
//
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and
// GEMINI_API_KEY and/or ANTHROPIC_API_KEY (AI optional — degrades gracefully)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "https://kxqjasdvoohiexedtfqw.supabase.co";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SB_HEADERS = {
  apikey: SB_KEY,
  Authorization: "Bearer " + SB_KEY,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
const GEMINI_MODEL = "gemini-2.5-flash";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

// ── Supabase REST helpers ───────────────────────────────────
async function sbGet(path: string) {
  const r = await fetch(SB_URL + "/rest/v1/" + path, { headers: SB_HEADERS });
  return r.json();
}
async function sbPost(table: string, payload: unknown) {
  const r = await fetch(SB_URL + "/rest/v1/" + table, {
    method: "POST", headers: SB_HEADERS, body: JSON.stringify(payload),
  });
  return r.json();
}
async function sbPatch(path: string, payload: unknown) {
  const r = await fetch(SB_URL + "/rest/v1/" + path, {
    method: "PATCH", headers: SB_HEADERS, body: JSON.stringify(payload),
  });
  return r.json();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ── AI provider chain (Gemini free tier first, Claude fallback) ──
function parseAIJson(text: string): Record<string, unknown> | null {
  let s = text.trim();
  if (s.startsWith("```json")) s = s.replace(/^```json\n?/, "").replace(/\n?```$/, "");
  else if (s.startsWith("```")) s = s.replace(/^```\n?/, "").replace(/\n?```$/, "");
  // Tolerate prose around the JSON
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
}

async function geminiGenerate(parts: unknown[]): Promise<string | null> {
  if (!GEMINI_KEY) return null;
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0 } }),
      },
    );
    if (!r.ok) { console.error("gemini error", r.status, await r.text()); return null; }
    const j = await r.json();
    return j?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch (e) { console.error("gemini fetch failed", e); return null; }
}

async function anthropicGenerate(content: unknown[]): Promise<string | null> {
  if (!ANTHROPIC_KEY) return null;
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL, max_tokens: 1024,
        messages: [{ role: "user", content }],
      }),
    });
    if (!r.ok) { console.error("anthropic error", r.status, await r.text()); return null; }
    const j = await r.json();
    const block = j?.content?.[0];
    return block?.type === "text" ? block.text : null;
  } catch (e) { console.error("anthropic fetch failed", e); return null; }
}

async function aiVisionJson(imageB64: string, mimeType: string, prompt: string) {
  let text = await geminiGenerate([
    { inline_data: { mime_type: mimeType, data: imageB64 } },
    { text: prompt },
  ]);
  if (!text) {
    text = await anthropicGenerate([
      { type: "image", source: { type: "base64", media_type: mimeType, data: imageB64 } },
      { type: "text", text: prompt },
    ]);
  }
  return text ? parseAIJson(text) : null;
}

async function aiTextJson(prompt: string) {
  let text = await geminiGenerate([{ text: prompt }]);
  if (!text) text = await anthropicGenerate([{ type: "text", text: prompt }]);
  return text ? parseAIJson(text) : null;
}

// ── number parsing (Arabic-Indic digits supported) ──────────
function normalizeDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
}
function parseAmount(text: string): number | null {
  const m = normalizeDigits(text).replace(/,/g, "").match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Branch alias heuristic for free-text splits (no AI needed)
const CC_ALIASES: Record<string, string[]> = {
  CC01: ["city", "citywalk", "walk", "سيتي", "ووك"],
  CC02: ["galaria", "gallaria", "mall", "قالاريا", "جالاريا", "غالاريا", "مول"],
  CC03: ["bloom", "nawas", "بلوم", "نواس", "ابو"],
  CC00: ["ceo", "hak"],
  CC99: ["md", "kashada"],
};
function heuristicSplit(text: string): { code: string; amount: number }[] {
  const norm = normalizeDigits(text).toLowerCase().replace(/,/g, "،");
  const parts: { code: string; amount: number }[] = [];
  for (const segment of norm.split(/[،;\n]+/)) {
    const m = segment.match(/(\d+(?:\.\d+)?)/);
    if (!m) continue;
    const amount = parseFloat(m[1]);
    const code = Object.keys(CC_ALIASES).find((c) =>
      CC_ALIASES[c].some((alias) => segment.includes(alias)),
    );
    if (code && amount > 0) parts.push({ code, amount });
  }
  return parts;
}

// ── shared: resolve profile + load reference data ───────────
async function resolveProfile(body: Record<string, unknown>): Promise<string | null> {
  if (body.submitted_by) return String(body.submitted_by);
  if (body.telegram_chat_id) {
    const profiles = await sbGet(
      "profiles?select=id&telegram_chat_id=eq." + encodeURIComponent(String(body.telegram_chat_id)) + "&limit=1",
    );
    if (Array.isArray(profiles) && profiles.length) return profiles[0].id;
  }
  return null;
}

// Live schema: cost_centers.id IS the code ('CC01'); categories have only id+name.
async function loadCostCenters() {
  const raw = await sbGet("cost_centers?select=id,name,include_in_split&order=id");
  return (Array.isArray(raw) ? raw : []).map(
    (c: { id: string; name: string; include_in_split: boolean }) => ({
      code: c.id, name: c.name, include_in_split: c.include_in_split,
    }),
  );
}

// ── extract (photo) ─────────────────────────────────────────
async function actionExtract(body: Record<string, unknown>) {
  const imageB64 = body.image_base64 as string;
  const mimeType = (body.mime_type as string) || "image/jpeg";
  const source = body.source as string;
  const caption = (body.caption as string) || "";
  if (!imageB64 || !source) return json({ error: "image_base64 and source are required" }, 400);

  const submittedBy = await resolveProfile(body);
  if (!submittedBy) return json({ error: "unlinked", message: "No profile found for this submitter" }, 403);

  // 1) Store the photo
  const ext = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
  const path = `snaps/${crypto.randomUUID()}.${ext}`;
  const bytes = Uint8Array.from(atob(imageB64), (c) => c.charCodeAt(0));
  const up = await fetch(`${SB_URL}/storage/v1/object/expense-receipts/${path}`, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY, "Content-Type": mimeType },
    body: bytes,
  });
  if (!up.ok) return json({ error: "storage_failed", detail: await up.text() }, 500);
  const receiptUrl = `${SB_URL}/storage/v1/object/public/expense-receipts/${path}`;

  // 2) Reference data
  const [ccList, categories] = await Promise.all([
    loadCostCenters(),
    sbGet("expense_categories?select=name"),
  ]);
  const catNames = (Array.isArray(categories) ? categories : []).map((c: { name: string }) => c.name);

  // 3) AI-read the receipt (Gemini free tier → Claude → none)
  const prompt = `This is a receipt/invoice photo from a cafe business in Tripoli, Libya (may be Arabic, English, or both).
${caption ? `The submitter added this note: "${caption}"\n` : ""}
Extract and return ONLY valid JSON (no markdown):
{
  "vendor": "who was paid (business/person name) or null",
  "amount": total amount as number or null,
  "currency": "LYD|USD|EUR|TRY|EGP|... (default LYD if unclear)",
  "expense_date": "YYYY-MM-DD or null",
  "description": "one short line: what was purchased",
  "category": "best match from: ${catNames.join(", ")}",
  "branch_hint": "best match from: ${ccList.map((c) => c.code + "=" + c.name).join(", ")} — code only, or null if no clue on the receipt/note",
  "confidence": "high|medium|low"
}`;
  const ai = await aiVisionJson(imageB64, mimeType, prompt);
  const extracted: Record<string, unknown> = ai ?? {
    vendor: null, amount: null, currency: "LYD",
    description: caption || null, confidence: "low", note: "no AI provider available",
  };
  // Caption may carry the amount even when the photo is unreadable
  if (!extracted.amount && caption) extracted.amount = parseAmount(caption);

  const needsAmount = !extracted.amount;

  // 4) Create the pending snap
  const snaps = await sbPost("expense_snaps", {
    submitted_by: submittedBy,
    source,
    telegram_chat_id: body.telegram_chat_id ? String(body.telegram_chat_id) : null,
    telegram_message_id: body.telegram_message_id ? String(body.telegram_message_id) : null,
    receipt_url: receiptUrl,
    extracted,
    status: needsAmount ? "awaiting_amount" : "awaiting_branch",
  });
  if (!Array.isArray(snaps) || !snaps.length) return json({ error: "snap_insert_failed", detail: snaps }, 500);

  return json({
    snap_id: snaps[0].id,
    extracted,
    receipt_url: receiptUrl,
    cost_centers: ccList,
    suggested_code: extracted.branch_hint ?? null,
    needs_amount: needsAmount,
  });
}

// ── manual (typed expense, no photo) ────────────────────────
async function actionManual(body: Record<string, unknown>) {
  const text = ((body.text as string) || "").trim();
  const source = body.source as string;
  if (!text || !source) return json({ error: "text and source are required" }, 400);

  const submittedBy = await resolveProfile(body);
  if (!submittedBy) return json({ error: "unlinked", message: "No profile found for this submitter" }, 403);

  const [ccList, categories] = await Promise.all([
    loadCostCenters(),
    sbGet("expense_categories?select=name"),
  ]);
  const catNames = (Array.isArray(categories) ? categories : []).map((c: { name: string }) => c.name);

  // Regex first (free, instant), AI to enrich vendor/category if available
  const amount = parseAmount(text);
  let extracted: Record<string, unknown> = {
    vendor: null, amount, currency: "LYD",
    description: text, category: null, branch_hint: null, confidence: "manual",
  };
  const ai = await aiTextJson(`A cafe staff member in Tripoli, Libya typed this expense (Arabic or English, informal):
"${text}"

Extract and return ONLY valid JSON (no markdown):
{
  "vendor": "who was paid, or null",
  "amount": number or null,
  "currency": "LYD unless another currency is explicit",
  "description": "short clean line: what was paid for",
  "category": "best match from: ${catNames.join(", ")}",
  "branch_hint": "best match from: ${ccList.map((c) => c.code + "=" + c.name).join(", ")} — code only, or null"
}`);
  if (ai) extracted = { ...extracted, ...ai, amount: (ai.amount as number) || amount, confidence: "manual" };

  const needsAmount = !extracted.amount;
  const snaps = await sbPost("expense_snaps", {
    submitted_by: submittedBy,
    source,
    telegram_chat_id: body.telegram_chat_id ? String(body.telegram_chat_id) : null,
    receipt_url: null,
    extracted,
    status: needsAmount ? "awaiting_amount" : "awaiting_branch",
  });
  if (!Array.isArray(snaps) || !snaps.length) return json({ error: "snap_insert_failed", detail: snaps }, 500);

  return json({
    snap_id: snaps[0].id,
    extracted,
    cost_centers: ccList,
    suggested_code: extracted.branch_hint ?? null,
    needs_amount: needsAmount,
  });
}

// ── set_amount (staff typed the amount we asked for) ────────
async function actionSetAmount(body: Record<string, unknown>) {
  const snapId = body.snap_id as string;
  const text = (body.text as string) || "";
  if (!snapId) return json({ error: "snap_id required" }, 400);

  const amount = parseAmount(text);
  if (!amount) return json({ ok: false, error: "bad_amount" });

  const snaps = await sbGet("expense_snaps?select=*&id=eq." + snapId + "&limit=1");
  if (!Array.isArray(snaps) || !snaps.length) return json({ error: "snap_not_found" }, 404);
  const snap = snaps[0];

  const extracted = { ...(snap.extracted || {}), amount };
  await sbPatch("expense_snaps?id=eq." + snapId, { extracted, status: "awaiting_branch" });

  const ccList = await loadCostCenters();
  return json({
    ok: true,
    snap_id: snapId,
    extracted,
    cost_centers: ccList,
    suggested_code: extracted.branch_hint ?? null,
  });
}

// ── finalize ────────────────────────────────────────────────
async function actionFinalize(body: Record<string, unknown>) {
  const snapId = body.snap_id as string;
  const allocation = body.allocation as { mode: string; code?: string; parts?: { code: string; amount: number }[] };
  if (!snapId || !allocation?.mode) return json({ error: "snap_id and allocation required" }, 400);

  const snaps = await sbGet("expense_snaps?select=*&id=eq." + snapId + "&limit=1");
  if (!Array.isArray(snaps) || !snaps.length) return json({ error: "snap_not_found" }, 404);
  const snap = snaps[0];
  if (snap.status === "completed") return json({ error: "already_completed" }, 409);

  const ex = snap.extracted || {};
  const totalAmount = Number(ex.amount) || 0;
  const currency = (ex.currency as string) || "LYD";

  const [costCenters, categories, rates] = await Promise.all([
    loadCostCenters(),
    sbGet("expense_categories?select=id,name"),
    sbGet("cc_exchange_rates?select=currency,rate_to_lyd"),
  ]);
  const ccByCode: Record<string, { code: string; name: string; include_in_split: boolean }> = {};
  for (const c of costCenters) ccByCode[c.code] = c;

  const rate = ((Array.isArray(rates) ? rates : []).find(
    (r: { currency: string }) => r.currency === currency,
  )?.rate_to_lyd) ?? 1;

  // Category: match AI guess by name, fall back to Miscellaneous/first
  const catGuess = String(ex.category || "").toLowerCase();
  const category =
    categories.find((c: { name: string }) => c.name.toLowerCase() === catGuess) ||
    categories.find((c: { name: string }) => catGuess && c.name.toLowerCase().includes(catGuess.split(" ")[0])) ||
    categories.find((c: { name: string }) => /^(other|misc)/i.test(c.name)) ||
    categories[0];
  if (!category) return json({ error: "no_categories" }, 500);

  // Build allocation parts
  let parts: { code: string; amount: number }[] = [];
  if (allocation.mode === "single") {
    if (!allocation.code || !ccByCode[allocation.code]) return json({ error: "bad_code" }, 400);
    parts = [{ code: allocation.code, amount: totalAmount }];
  } else if (allocation.mode === "even") {
    const splitCCs = costCenters.filter((c) => c.include_in_split);
    if (!splitCCs.length) return json({ error: "no_split_centers" }, 500);
    const each = Math.round((totalAmount / splitCCs.length) * 100) / 100;
    parts = splitCCs.map((c, i) => ({
      code: c.code,
      // last part absorbs rounding remainder so the sum matches the receipt
      amount: i === splitCCs.length - 1 ? Math.round((totalAmount - each * (splitCCs.length - 1)) * 100) / 100 : each,
    }));
  } else if (allocation.mode === "custom") {
    parts = (allocation.parts || []).filter((p) => ccByCode[p.code] && p.amount > 0);
    if (!parts.length) return json({ error: "bad_parts" }, 400);
  } else {
    return json({ error: "bad_mode" }, 400);
  }

  // Amount may be 0 (unreadable) — still record; office fixes at review
  const groupId = parts.length > 1 ? crypto.randomUUID() : null;
  const rows = parts.map((p, i) => ({
    submitted_by: snap.submitted_by,
    cost_center_id: p.code, // live schema: cost_center_id is the text code itself
    category_id: category.id,
    amount: p.amount,
    currency,
    exchange_rate_to_lyd: rate,
    amount_lyd: Math.round(p.amount * rate * 100) / 100,
    vendor: ex.vendor || null,
    description: [
      ex.description || "Receipt snap",
      groupId ? `(split ${i + 1}/${parts.length})` : null,
      totalAmount === 0 ? "[AMOUNT MISSING — fill at review]" : null,
      ex.confidence === "low" ? "[AI low confidence — verify]" : null,
    ].filter(Boolean).join(" "),
    receipt_url: snap.receipt_url,
    expense_date: ex.expense_date || new Date().toISOString().slice(0, 10),
    status: "pending",
    receipt_group_id: groupId,
    source: "snap_" + snap.source,
  }));

  const inserted = await sbPost("expenses", rows);
  if (!Array.isArray(inserted) || inserted.length !== rows.length) {
    return json({ error: "expense_insert_failed", detail: inserted }, 500);
  }

  await sbPatch("expense_snaps?id=eq." + snapId, {
    status: "completed",
    completed_at: new Date().toISOString(),
  });

  const summary = parts.map((p) => `${ccByCode[p.code].name}: ${p.amount} ${currency}`).join(" + ");
  return json({ ok: true, summary, vendor: ex.vendor ?? null, total: totalAmount, currency, rows: inserted.length });
}

// ── custom_parse: free-text split → finalize ────────────────
async function actionCustomParse(body: Record<string, unknown>) {
  const snapId = body.snap_id as string;
  const text = (body.text as string) || "";
  if (!snapId || !text.trim()) return json({ error: "snap_id and text required" }, 400);

  const snaps = await sbGet("expense_snaps?select=*&id=eq." + snapId + "&limit=1");
  if (!Array.isArray(snaps) || !snaps.length) return json({ error: "snap_not_found" }, 404);
  const snap = snaps[0];

  // Free heuristic first (branch aliases + numbers), AI fallback
  let parts = heuristicSplit(text);

  if (!parts.length) {
    const costCenters = await loadCostCenters();
    const total = Number(snap.extracted?.amount) || null;
    const ai = await aiTextJson(`A staff member wants to split a receipt${total ? ` of ${total} ${snap.extracted?.currency || "LYD"}` : ""} between branches.
Branches: ${costCenters.map((c) => `${c.code} = ${c.name}`).join("; ")}

Their message (Arabic or English, informal): "${text}"

Map each mentioned branch to its code and amount. If they give percentages, convert using the total. Return ONLY valid JSON:
{"parts": [{"code": "CC01", "amount": 300}], "understood": true}
If you cannot understand the message, return {"parts": [], "understood": false}`);
    if (ai?.understood && Array.isArray(ai.parts)) parts = ai.parts as { code: string; amount: number }[];
  }

  if (!parts.length) {
    return json({ ok: false, error: "not_understood", message: "Could not parse the split. Example: 300 citywalk, 150 galaria" });
  }

  return actionFinalize({ snap_id: snapId, allocation: { mode: "custom", parts } });
}

// ── mark_custom ─────────────────────────────────────────────
async function actionMarkCustom(body: Record<string, unknown>) {
  const snapId = body.snap_id as string;
  if (!snapId) return json({ error: "snap_id required" }, 400);
  await sbPatch("expense_snaps?id=eq." + snapId, { status: "awaiting_custom" });
  return json({ ok: true });
}

// ── router ──────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  try {
    switch (body.action) {
      case "extract": return await actionExtract(body);
      case "manual": return await actionManual(body);
      case "set_amount": return await actionSetAmount(body);
      case "finalize": return await actionFinalize(body);
      case "custom_parse": return await actionCustomParse(body);
      case "mark_custom": return await actionMarkCustom(body);
      default: return json({ error: "unknown_action" }, 400);
    }
  } catch (e) {
    console.error("expense-snap error", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
