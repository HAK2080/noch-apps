// ocr-invoice — extract invoice data from a photo via Anthropic vision.
// Returns structured JSON; client creates the expense_entries row.
//
// Deploy: npx supabase functions deploy ocr-invoice
// Secret: ANTHROPIC_API_KEY (already set in this project)
//
// POST body: { image_base64: string, mime_type?: string }
// Response: { ok: true, data: {...}, confidence: 0..1 }
//          | { ok: false, error: string }

import Anthropic from "npm:@anthropic-ai/sdk@0.88.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You extract structured data from supplier invoices for a Libyan café. The invoice may be in Arabic, English, or mixed. Extract:

- vendor: the supplier/company name (e.g. "Tripoli Dairy Co", "شركة الخير")
- invoice_number: the document/invoice number if present
- date: ISO date YYYY-MM-DD (the invoice issue date, not due date)
- currency: 3-letter code: LYD, USD, EUR, TND, etc. Default LYD if unclear.
- total: numeric grand total in the stated currency
- line_items: array of { name, qty, unit_cost, line_total } — limit to 10 lines
- category_guess: one of [rent, utilities, marketing, supplies, maintenance, wages_one_off, professional_fees, licenses, bank_fees, other_opex, capex] — best guess
- confidence: 0..1 — your overall confidence the extraction is correct
- notes: any caveat the operator should know (handwritten, partial, foreign currency, missing tax line)

Output ONLY a JSON object matching this schema. No prose. No code fences.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json({ ok: false, error: "ANTHROPIC_API_KEY not set" }, 500);
    }

    const body = await req.json();
    const { image_base64, mime_type } = body || {};
    if (!image_base64) return json({ ok: false, error: "image_base64 required" }, 400);

    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mime_type || "image/jpeg",
              data: image_base64,
            },
          },
          {
            type: "text",
            text: "Extract the invoice into the JSON schema described in the system prompt. Output JSON only.",
          },
        ],
      }],
    });

    const raw = message.content?.[0]?.type === "text" ? message.content[0].text : "";
    let data: any = null;
    try {
      // Strip code fences if model added them despite instructions.
      const cleaned = raw.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
      data = JSON.parse(cleaned);
    } catch (e) {
      return json({ ok: false, error: "Could not parse model JSON", raw }, 502);
    }

    return json({ ok: true, data, raw });
  } catch (err) {
    return json({ ok: false, error: err?.message || String(err) }, 500);
  }
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}
