import Anthropic from "npm:@anthropic-ai/sdk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth: this function spends Anthropic credit, so the caller must be an
    // authenticated owner/staff user (POS inventory pages invoke it with the
    // user JWT).
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "missing Authorization" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const uRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { "apikey": Deno.env.get("SUPABASE_ANON_KEY")!, "Authorization": authHeader },
    });
    if (!uRes.ok) {
      return new Response(JSON.stringify({ success: false, error: "invalid token" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 401 });
    }
    const caller = await uRes.json();
    const pRes = await fetch(`${supabaseUrl}/rest/v1/profiles?select=role&id=eq.${caller.id}&limit=1`, {
      headers: { "apikey": serviceKey!, "Authorization": `Bearer ${serviceKey}` },
    });
    const profiles = await pRes.json();
    const role = Array.isArray(profiles) && profiles.length ? profiles[0].role : null;
    if (role !== "owner" && role !== "staff") {
      return new Response(JSON.stringify({ success: false, error: "forbidden — owner/staff only" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 });
    }

    const { file_base64, mime_type, known_ingredients } = await req.json();
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return new Response(JSON.stringify({ success: false, error: "ANTHROPIC_API_KEY not set" }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 });

    const client = new Anthropic({ apiKey });

    const ingredientList = (known_ingredients || []).map((i: any) => `${i.id}: ${i.name}`).join('\n');

    const content: any[] = [];
    // Add the image/PDF
    if (mime_type === 'application/pdf') {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: file_base64 } });
    } else {
      content.push({ type: "image", source: { type: "base64", media_type: mime_type, data: file_base64 } });
    }
    content.push({ type: "text", text: `Extract all items from this delivery note/invoice. For each item, identify the item name, quantity received, and unit.

Then match each extracted item to the closest known ingredient from this list:
${ingredientList}

Return ONLY a JSON array inside a \`\`\`json block:
\`\`\`json
[
  { "raw_name": "original name from document", "quantity": 5, "unit": "kg", "matched_ingredient_id": "uuid-here", "matched_ingredient_name": "Matched Name", "confidence": 0.9 }
]
\`\`\`

If no match is found, set matched_ingredient_id to null and confidence to 0. Be generous with fuzzy matching (e.g. "sugar" matches "White Sugar", "milk" matches "Fresh Milk").` });

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      messages: [{ role: "user", content }],
    });

    const rawText = message.content[0].type === "text" ? message.content[0].text : "[]";
    let items: any[] = [];
    try {
      const jsonMatch = rawText.match(/```json\s*([\s\S]*?)```/);
      if (jsonMatch) items = JSON.parse(jsonMatch[1].trim());
    } catch { items = []; }

    return new Response(JSON.stringify({ success: true, items }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 });
  }
});
