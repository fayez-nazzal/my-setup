import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

type SearchParams = {
  query: string;
  recency?: "day" | "week" | "month" | "year";
  limit?: number;
  max_tokens?: number;
  temperature?: number;
  num_search_results?: number;
};

type SearchPage = {
  title: string;
  url: string;
  snippet: string;
  date?: string | null;
  last_updated?: string | null;
};

type SearchPayload = {
  id?: string;
  results?: SearchPage[];
  detail?: unknown;
};

function resultText(results: SearchPage[]): string {
  if (results.length === 0) {
    return "Perplexity Search API returned no results.";
  }

  const lines = [`Perplexity Search API returned ${results.length} result(s):`];
  for (const [index, result] of results.entries()) {
    lines.push(`[${index + 1}] ${result.title}`);
    lines.push(`    ${result.url}`);
    if (result.snippet) lines.push(`    ${result.snippet}`);
    const date = result.date ?? result.last_updated;
    if (date) lines.push(`    Date: ${date}`);
  }
  return lines.join("\n");
}

export default function perplexitySearchApi(pi: ExtensionAPI) {
  const z = pi.zod;

  pi.registerTool({
    name: "web_search",
    label: "Web Search (Perplexity)",
    description:
      "Search the web through Perplexity's direct Search API and return ranked sources. Uses the 1Password-backed Perplexity Web Search key.",
    parameters: z.object({
      query: z.string(),
      recency: z.enum(["day", "week", "month", "year"]).optional(),
      limit: z.number().optional(),
      max_tokens: z.number().optional(),
      temperature: z.number().optional(),
      num_search_results: z.number().optional(),
    }),
    async execute(_toolCallId, params: SearchParams, signal) {
      const key = await pi.exec(
        "op",
        ["read", "op://Personal/Perplexity Web Search/password", "--no-newline"],
        { signal },
      );
      const apiKey = key.stdout.trim();
      if (key.code !== 0 || !apiKey) {
        return {
          content: [
            {
              type: "text",
              text: "Error: could not resolve the Perplexity Web Search key from 1Password.",
            },
          ],
          details: { response: { provider: "perplexity" }, error: key.stderr.trim() },
        };
      }

      const requestedResults = params.num_search_results ?? params.limit ?? 10;
      const maxResults = Math.max(1, Math.min(20, Math.floor(requestedResults)));
      const request: Record<string, unknown> = {
        query: params.query,
        max_results: maxResults,
        search_context_size: "high",
      };
      if (params.recency) request.search_recency_filter = params.recency;
      if (params.max_tokens !== undefined) {
        request.max_tokens = Math.max(1, Math.floor(params.max_tokens));
        delete request.search_context_size;
      }

      let response: Response;
      try {
        response = await fetch("https://api.perplexity.ai/search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(request),
          signal,
        });
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error: Perplexity Search API request failed: ${String(error)}` }],
          details: { response: { provider: "perplexity" }, error: String(error) },
        };
      }

      const payload = (await response.json().catch(() => ({}))) as SearchPayload;
      if (!response.ok) {
        const detail = typeof payload.detail === "string" ? payload.detail : response.statusText;
        return {
          content: [{ type: "text", text: `Error: Perplexity Search API returned ${response.status}: ${detail}` }],
          details: { response: { provider: "perplexity" }, error: detail, status: response.status },
        };
      }

      const results = Array.isArray(payload.results) ? payload.results : [];
      return {
        content: [{ type: "text", text: resultText(results) }],
        details: {
          response: {
            provider: "perplexity",
            sources: results,
            requestId: payload.id,
          },
        },
      };
    },
  });
}
