import type { RewriteInput, Rewriter } from "./types.ts";

const ENDPOINT = "https://api.openai.com/v1/responses";
const MODEL = "gpt-6-astra";

function buildPrompt(input: RewriteInput): string {
  const sections: string[] = [];

  sections.push(
    input.mode === "grounded"
      ? "Rewrite the following text. Stay strictly grounded in the verified context provided below; do not invent or alter any fact, name, number, or claim not present in the source text or context."
      : "Rewrite the following text to read as natural, human-written prose while preserving its meaning."
  );

  if (input.mode === "grounded" && input.context) {
    sections.push(`Verified context (do not contradict or add facts beyond this):\n${input.context}`);
  }

  if (input.flagged.length > 0) {
    const flaggedList = input.flagged.map((s) => `- "${s.text}" (human-likeness score: ${s.score})`).join("\n");
    sections.push(
      `The following sentences scored low on an AI-content detector in the previous pass. Rewrite them (and only them, in place) so they read as naturally human-written, without changing their meaning:\n${flaggedList}`
    );
  }

  if (input.readabilityHint) {
    const { score, floor } = input.readabilityHint;
    sections.push(
      `The text scored ${score}/100 on a Flesch-Kincaid readability scale (target: ${floor}+, higher = easier to read). Simplify it: shorten sentences, cut nested/subordinate clauses, do not merge multiple ideas into one sentence, prefer plain subject-verb-object structure.`
    );
  }

  sections.push(`Style rules (must follow exactly):\n${input.styleConstraints.map((c) => `- ${c}`).join("\n")}`);

  sections.push(`Text to rewrite:\n${input.text}`);

  sections.push("Return only the rewritten text. No preamble, no explanation, no markdown formatting.");

  return sections.join("\n\n");
}

/**
 * Calls gpt-6-astra directly via the OpenAI Responses API
 * (POST https://api.openai.com/v1/responses) — not via omp's completion(),
 * since this CLI has no omp runtime access.
 */
export class OpenAiRewriter implements Rewriter {
  constructor(private readonly apiKey: string) {}

  async rewrite(input: RewriteInput): Promise<string> {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        input: buildPrompt(input),
      }),
    });

    const payload = await res.json().catch(() => ({}) as Record<string, unknown>);

    if (!res.ok) {
      const err = payload as { error?: { message?: string; type?: string; code?: string } };
      const detail = err.error?.message || res.statusText;
      const code = err.error?.code;
      const isModelError =
        res.status === 404 || res.status === 400 || (typeof code === "string" && code.includes("model"));
      const hint = isModelError
        ? ` Model id "${MODEL}" may not be a valid direct OpenAI API model id — this is a blocking discrepancy, do not silently substitute a different model.`
        : "";
      throw new Error(`OpenAI rewrite call failed (HTTP ${res.status}): ${detail}${hint}`);
    }

    const text = extractOutputText(payload);
    if (!text) {
      throw new Error(`OpenAI rewrite call returned no output text. Raw response: ${JSON.stringify(payload)}`);
    }
    return text;
  }
}

/** Pull the plain text out of a Responses API payload's output array. */
function extractOutputText(payload: unknown): string | undefined {
  const p = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (typeof p.output_text === "string" && p.output_text.length > 0) {
    return p.output_text;
  }
  for (const item of p.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return undefined;
}
