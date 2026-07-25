export type GeneratedEvaluation = {
  text: string;
  model: string;
};

export function extractEvaluationJson(text: string): Record<string, unknown> {
  let source = text.trim();
  source = source
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  const candidates = [source];
  const objectStart = source.indexOf("{");
  const objectEnd = source.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    candidates.push(source.slice(objectStart, objectEnd + 1));
  }

  let lastError: unknown = new Error("Evaluation output is not a JSON object");
  for (const candidate of [...new Set(candidates)]) {
    try {
      let parsed: unknown = JSON.parse(candidate);
      if (typeof parsed === "string") parsed = JSON.parse(parsed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function generateParsedEvaluation(
  generate: (prompt: string) => Promise<GeneratedEvaluation>,
  prompt: string,
): Promise<{ parsed: Record<string, unknown>; generated: GeneratedEvaluation }> {
  let lastError: unknown = new Error("Evaluation generation failed");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const generated = await generate(prompt);
    try {
      return {
        parsed: extractEvaluationJson(generated.text),
        generated,
      };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
