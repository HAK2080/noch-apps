import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
});

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { base64, mimeType, fileName } = await req.json();

    if (!base64 || !mimeType) {
      return new Response(
        JSON.stringify({ error: "Missing base64 or mimeType" }),
        { status: 400 }
      );
    }

    // Determine media type for Claude API
    let mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp" =
      "image/jpeg";
    if (mimeType.includes("png")) {
      mediaType = "image/png";
    } else if (mimeType.includes("gif")) {
      mediaType = "image/gif";
    } else if (mimeType.includes("webp")) {
      mediaType = "image/webp";
    }

    // Call Claude with vision to extract recipe data
    const response = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64,
              },
            },
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
        },
      ],
    });

    // Parse the response
    const content = response.content[0];
    if (content.type !== "text") {
      return new Response(
        JSON.stringify({ error: "Unexpected response type" }),
        { status: 500 }
      );
    }

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = content.text.trim();
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.replace(/^```json\n/, "").replace(/\n```$/, "");
    } else if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/^```\n/, "").replace(/\n```$/, "");
    }

    const recipe = JSON.parse(jsonStr);

    return new Response(JSON.stringify({ recipe }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500 }
    );
  }
});
