import Anthropic from "npm:@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

const SYSTEM_PROMPT = `You are a senior financial and operations consultant for a specialty café chain in Libya.
Analyze the provided business data and return a JSON object with exactly these keys:
- opportunities: array of 3 objects {title, detail, estimated_impact}
- cost_cuts: array of 3 objects {title, detail, estimated_saving}
- anomalies: array of detected anomalies {title, detail}
- actions: array of 5 priority actions {priority (1-5), action, expected_impact}
Be specific, quantitative, and practical for the Libyan café market.
Return ONLY the JSON object. No markdown, no explanation.`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { salesData, costsData, lowStockItems } = await req.json();

    const summary = `
SALES (last 30 days):
Total revenue: ${(salesData?.totalRevenue || 0).toFixed(0)} LYD
Total orders: ${salesData?.orderCount || 0}
Top categories: ${(salesData?.topCategories || []).slice(0, 5).map((c: { label: string; revenue: number }) => `${c.label}: ${c.revenue.toFixed(0)} LYD`).join(", ")}
Avg order value: ${(salesData?.avgOrder || 0).toFixed(1)} LYD

OPERATING COSTS:
${(costsData || []).map((c: { cost_type: string; amount: number; period_start: string; period_end: string }) => `${c.cost_type}: ${c.amount} LYD (${c.period_start} to ${c.period_end})`).join("\n") || "No cost data entered yet"}

INVENTORY ALERTS:
${(lowStockItems || []).slice(0, 10).map((i: { name: string; qty_available: number; base_unit: string; min_threshold: number }) => `${i.name}: ${i.qty_available} ${i.base_unit} (min: ${i.min_threshold})`).join("\n") || "No critical stock issues"}
`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `Analyze this business data:\n\n${summary}` }],
    });

    const raw = response.content[0];
    if (raw.type !== "text") {
      throw new Error("Unexpected AI response type");
    }

    let jsonStr = raw.text.trim();
    if (jsonStr.startsWith("```json")) jsonStr = jsonStr.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    else if (jsonStr.startsWith("```")) jsonStr = jsonStr.replace(/^```\n?/, "").replace(/\n?```$/, "");

    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Could not parse AI response");
    const result = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    });
  } catch (error) {
    console.error("analytics-ai-insights error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...CORS_HEADERS } },
    );
  }
});
