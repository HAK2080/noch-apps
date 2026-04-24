import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return jsonResponse(
      { success: false, error: "ANTHROPIC_API_KEY not set in Supabase secrets" },
      400
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const client = new Anthropic({ apiKey });

  try {
    const body = await req.json();
    const { mode } = body;

    // ── Mode 2: Generate Executive Report ──────────────────────
    if (mode === "generate_report") {
      const { metrics } = body;
      if (!metrics || !Array.isArray(metrics) || metrics.length === 0) {
        return jsonResponse({ success: false, error: "No metrics provided" }, 400);
      }

      const msg = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: `You are a business analyst for a café in Tripoli, Libya. Here is the performance data across multiple periods:

${JSON.stringify(metrics, null, 2)}

Generate a concise executive business report. Include:
1. Performance Summary (revenue, profit trends)
2. Top Products analysis
3. Margin Health assessment
4. 3 actionable recommendations

Write the report in both Arabic and English. Keep it under 500 words per language.

Return your response as JSON:
\`\`\`json
{
  "report_ar": "...",
  "report_en": "..."
}
\`\`\``,
          },
        ],
      });

      const text =
        msg.content[0].type === "text" ? msg.content[0].text : "";
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
      if (!jsonMatch) {
        return jsonResponse(
          { success: false, error: "Failed to parse report from Claude" },
          500
        );
      }
      const report = JSON.parse(jsonMatch[1].trim());
      return jsonResponse({
        success: true,
        report_ar: report.report_ar,
        report_en: report.report_en,
      });
    }

    // ── Mode 1: Extract Sales Data (default) ──────────────────
    const { upload_id, file_base64, mime_type, file_type } = body;

    if (!upload_id || !file_base64) {
      return jsonResponse(
        { success: false, error: "upload_id and file_base64 are required" },
        400
      );
    }

    // Build the message content based on file type
    let messageContent: Anthropic.MessageParam["content"];

    if (file_type === "csv") {
      // Decode base64 CSV to text
      const csvText = new TextDecoder().decode(
        Uint8Array.from(atob(file_base64), (c) => c.charCodeAt(0))
      );
      messageContent = `Analyze this POS sales data export (CSV). Extract the following into structured JSON:

${csvText}

Return ONLY a JSON object inside a \`\`\`json block:
{
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "period_type": "daily|weekly|monthly",
  "revenue_total": 0,
  "cogs_total": 0,
  "gross_profit": 0,
  "gross_margin_pct": 0,
  "transaction_count": 0,
  "avg_order_value": 0,
  "top_products": [
    { "name": "Product", "qty": 10, "revenue": 100, "cost": 50, "margin_pct": 50 }
  ],
  "category_breakdown": [
    { "category": "Drinks", "revenue": 500, "qty": 100, "pct": 60 }
  ],
  "hourly_breakdown": [
    { "hour": 9, "revenue": 100, "transactions": 10 }
  ]
}

Infer period_type from the data range. If cost data isn't available, estimate cogs_total as 0 and note it. Calculate gross_profit = revenue_total - cogs_total. Calculate avg_order_value = revenue_total / transaction_count.`;
    } else {
      // PDF — Claude supports up to 100 pages. For large Odoo reports, recommend CSV instead.
      // We pass the PDF but catch the page-limit error gracefully.
      messageContent = [
        {
          type: "document" as const,
          source: {
            type: "base64" as const,
            media_type: "application/pdf" as const,
            data: file_base64,
          },
        },
        {
          type: "text" as const,
          text: `Analyze this POS sales data export (PDF). Extract the following into structured JSON:

Return ONLY a JSON object inside a \`\`\`json block:
{
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "period_type": "daily|weekly|monthly",
  "revenue_total": 0,
  "cogs_total": 0,
  "gross_profit": 0,
  "gross_margin_pct": 0,
  "transaction_count": 0,
  "avg_order_value": 0,
  "top_products": [
    { "name": "Product", "qty": 10, "revenue": 100, "cost": 50, "margin_pct": 50 }
  ],
  "category_breakdown": [
    { "category": "Drinks", "revenue": 500, "qty": 100, "pct": 60 }
  ],
  "hourly_breakdown": [
    { "hour": 9, "revenue": 100, "transactions": 10 }
  ]
}

Infer period_type from the data range. If cost data isn't available, estimate cogs_total as 0 and note it. Calculate gross_profit = revenue_total - cogs_total. Calculate avg_order_value = revenue_total / transaction_count.`,
        },
      ];
    }

    const msg = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      messages: [{ role: "user", content: messageContent }],
    });

    const responseText =
      msg.content[0].type === "text" ? msg.content[0].text : "";
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)```/);
    if (!jsonMatch) {
      // Update upload with error
      await supabase
        .from("sales_uploads")
        .update({ status: "error", error_message: "Failed to parse Claude response" })
        .eq("id", upload_id);
      return jsonResponse(
        { success: false, error: "Failed to parse extracted data from Claude" },
        500
      );
    }

    const metrics = JSON.parse(jsonMatch[1].trim());

    // Update sales_uploads row
    await supabase
      .from("sales_uploads")
      .update({
        extracted_json: metrics,
        status: "done",
        period_start: metrics.period_start,
        period_end: metrics.period_end,
      })
      .eq("id", upload_id);

    // Upsert business_metrics
    await supabase.from("business_metrics").upsert(
      {
        period_start: metrics.period_start,
        period_end: metrics.period_end,
        period_type: metrics.period_type,
        revenue_total: metrics.revenue_total,
        cogs_total: metrics.cogs_total,
        gross_profit: metrics.gross_profit,
        gross_margin_pct: metrics.gross_margin_pct,
        transaction_count: metrics.transaction_count,
        avg_order_value: metrics.avg_order_value,
        top_products: metrics.top_products,
        category_breakdown: metrics.category_breakdown,
        hourly_breakdown: metrics.hourly_breakdown,
        source_upload_id: upload_id,
      },
      { onConflict: "period_start,period_end,period_type" }
    );

    return jsonResponse({ success: true, metrics });
  } catch (err) {
    console.error("process-sales-data error:", err);
    const msg = err.message || "Unknown error";
    // Friendly message for PDF page limit
    const friendlyMsg = msg.includes("100 PDF pages")
      ? "PDF is too large (over 100 pages). Please export as CSV instead: Odoo → POS → Reports → Orders → Export CSV"
      : msg;
    return jsonResponse(
      { success: false, error: friendlyMsg },
      500
    );
  }
});
