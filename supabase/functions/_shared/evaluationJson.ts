export type GeneratedEvaluation = {
  text: string;
  model: string;
};

export class EvaluationJsonError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "EvaluationJsonError";
  }
}

function parseWithMissingCommaRepair(source: string): unknown {
  let candidate = source;
  let lastError: unknown;

  for (let repair = 0; repair < 8; repair += 1) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
      const position = Number(
        error instanceof SyntaxError
          ? error.message.match(/position\s+(\d+)/i)?.[1]
          : NaN,
      );
      if (!Number.isInteger(position) || position < 1) break;

      const next = candidate[position];
      const previous = candidate.slice(0, position).match(/\S(?=\s*$)/)?.[0];
      const isValueBoundary = previous === '"' ||
        previous === "}" ||
        previous === "]" ||
        /[0-9eE]/.test(previous || "");
      const isNextProperty = next === '"';
      if (!isValueBoundary || !isNextProperty) break;

      candidate = `${candidate.slice(0, position)},${candidate.slice(position)}`;
    }
  }

  throw new EvaluationJsonError(lastError);
}

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
      let parsed: unknown = parseWithMissingCommaRepair(candidate);
      if (typeof parsed === "string") {
        parsed = parseWithMissingCommaRepair(parsed);
      }
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
