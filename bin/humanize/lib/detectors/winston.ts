import type { DetectionResult, Detector } from "../types.ts";

const ENDPOINT = "https://api.gowinston.ai/v2/ai-content-detection";

// en fr es pt nl de pl it ro id tl ru bg zh, plus "auto".
const SUPPORTED_LANGUAGES: Record<string, true> = {
  auto: true,
  en: true,
  fr: true,
  es: true,
  pt: true,
  nl: true,
  de: true,
  pl: true,
  it: true,
  ro: true,
  id: true,
  tl: true,
  ru: true,
  bg: true,
  zh: true,
};

interface WinstonSentence {
  text: string;
  score: number;
}

interface WinstonResponse {
  status: number;
  score: number;
  sentences?: WinstonSentence[];
  input?: string;
  attack_detected?: { zero_width_space: boolean; homoglyph_attack: boolean };
  readability_score?: number;
  credits_used?: number;
  credits_remaining?: number;
  version?: string;
  language?: string;
  error?: string;
  description?: string;
}

/**
 * The only Detector implementation today. Written against the narrow
 * `Detector` interface (types.ts) so a second provider is a drop-in file,
 * not a refactor.
 */
export class WinstonDetector implements Detector {
  // Static so cli.ts can gate detection (skip for short/unsupported input)
  // before resolving the Winston API key. A short run should never touch
  // 1Password for a secret it will not use.
  static readonly minChars = 300;
  static supportsLanguage(lang: string): boolean {
    return SUPPORTED_LANGUAGES[lang.toLowerCase()] === true;
  }

  readonly name = "winston";
  readonly minChars = WinstonDetector.minChars;

  constructor(private readonly apiKey: string) {}

  supportsLanguage(lang: string): boolean {
    return WinstonDetector.supportsLanguage(lang);
  }

  async detect(text: string, opts: { language?: string }): Promise<DetectionResult> {
    const body: Record<string, unknown> = {
      text,
      version: "latest",
      sentences: true,
    };
    if (opts.language) {
      body.language = opts.language;
    }

    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const payload = (await res.json().catch(() => ({}))) as WinstonResponse;

    if (!res.ok) {
      const detail = payload.error || payload.description || res.statusText;
      throw new Error(`Winston AI detection failed (HTTP ${res.status}): ${detail}`);
    }

    return {
      score: payload.score,
      sentences: (payload.sentences ?? []).map((s) => ({ text: s.text, score: s.score })),
      raw: payload,
    };
  }
}
