// extract-recipe: vision-based recipe extraction from an image. Owner-only.

import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "missing Authorization" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return json({ error: "invalid token" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: callerProfile } = await admin
    .from("profiles").select("role").eq("id", user.id).single();
  if (callerProfile?.role !== "owner") return json({ error: "forbidden — owner only" }, 403);

  try {
    const { base64, mimeType } = await req.json();
    if (!base64 || !mimeType) return json({ error: "Missing base64 or mimeType" }, 400);

    let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" = "image/jpeg";
    if (mimeType.includes("png")) mediaType = "image/png";
    else if (mimeType.includes("gif")) mediaType = "image/gif";
    else if (mimeType.includes("webp")) mediaType = "image/webp";

    const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          {
            type: "text",
            text: `Extract recipe information from this image and return valid JSON only (no markdown, no explanation).
If it's a barista/coffee recipe, extract these fields:
{
  "code": "recipe code like SL-01",
  "name": "recipe name in English",
  "name_ar": "recipe name in Arabic (if visible)",
  "category": "coffee|matcha|specialty|signature",
  "subcategory": "iced|hot|null",
  "description": "short description",
  "description_ar": "short description in Arabic",
  "serve_temp": "iced|hot|room",
  "glass_type": "glass type name",
  "glass_type_ar": "glass type in Arabic",
  "yield_ml": number or null,
  "ingredients": [
    {
      "group": "group name like Base, Topping",
      "group_ar": "Arabic group name",
      "items": [
        { "name": "ingredient", "name_ar": "مكون", "amount": "60", "unit": "ml" }
      ]
    }
  ],
  "layers": [
    { "label": "layer name", "label_ar": "اسم الطبقة", "color": "#hexcolor", "height": 1 }
  ],
  "steps": [
    { "step": 1, "instruction": "do this", "instruction_ar": "افعل هذا", "warning": null, "warning_ar": null }
  ],
  "notes": "any additional notes",
  "notes_ar": "ملاحظات إضافية"
}

Return ONLY the JSON, no other text. If not a recipe, still try to extract as much structured info as possible.`,
          },
        ],
      }],
    });

    const block = response.content[0];
    if (block.type !== "text") return json({ error: "Unexpected response type" }, 500);

    let jsonStr = block.text.trim();
    if (jsonStr.startsWith("```json")) jsonStr = jsonStr.replace(/^```json\n/, "").replace(/\n```$/, "");
    else if (jsonStr.startsWith("```")) jsonStr = jsonStr.replace(/^```\n/, "").replace(/\n```$/, "");

    const recipe = JSON.parse(jsonStr);
    return json({ recipe });
  } catch (err) {
    console.error("extract-recipe error", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
