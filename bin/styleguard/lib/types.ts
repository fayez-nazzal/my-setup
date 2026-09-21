// Core interfaces for the styleguard CLI. Keeping the detector/rewriter
// surfaces this narrow is what makes a second Detector implementation an
// additive drop-in file instead of a refactor (see lib/detectors/winston.ts).

export interface DetectionResult {
  /** 0-100 human-likeness score, higher = more human-like. */
  score: number;
  /**
   * Winston's `readability_score`: 0-100, Flesch-Kincaid reading ease,
   * higher = easier to read. Independent of the AI-detection score. `null`
   * when the provider response omits the field — callers must never gate on
   * an absent value, only on a present one below the floor.
   */
  readabilityScore: number | null;
  sentences: { text: string; score: number }[];
  /** Full provider payload. Log-only — never surfaced to caller stdout. */
  raw: unknown;
}

export interface Detector {
  readonly name: string;
  /** Below this many characters, detection is skipped entirely. */
  readonly minChars: number;
  supportsLanguage(lang: string): boolean;
  detect(text: string, opts: { language?: string }): Promise<DetectionResult>;
}

export interface RewriteInput {
  text: string;
  mode: "polish" | "grounded";
  /** Verified context packet text. "grounded" mode only. */
  context?: string;
  /** Low-scoring sentences from the last detection pass. */
  flagged: { text: string; score: number }[];
  /** Hard rules, always included in the prompt. */
  styleConstraints: string[];
  /** Present only when the last detection's readability score fell below config.readabilityFloor. */
  readabilityHint?: { score: number; floor: number };
}

export interface Rewriter {
  rewrite(input: RewriteInput): Promise<string>;
}

export interface LogEvent {
  event: string;
  iteration?: number;
  score?: number;
  readabilityScore?: number | null;
  readabilityFloorMet?: boolean;
  sentences?: { text: string; score: number }[];
  error?: string;
  reason?: string;
  finalScore?: number;
  thresholdMet?: boolean;
  [key: string]: unknown;
}

export interface StyleguardConfig {
  threshold: number;
  maxIterations: number;
  /**
   * Minimum acceptable Winston `readability_score` (0-100, Flesch-Kincaid
   * reading ease, higher = easier). A candidate scoring below this is never
   * treated as "good enough," even if its AI-detection score clears
   * `threshold` — see lib/loop.ts.
   */
  readabilityFloor: number;
  voiceSample?: string;
}
