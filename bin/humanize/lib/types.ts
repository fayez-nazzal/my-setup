// Core interfaces for the humanize CLI. Keeping the detector/rewriter
// surfaces this narrow is what makes a second Detector implementation an
// additive drop-in file instead of a refactor (see lib/detectors/winston.ts).

export interface DetectionResult {
  /** 0-100 human-likeness score, higher = more human-like. */
  score: number;
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
}

export interface Rewriter {
  rewrite(input: RewriteInput): Promise<string>;
}

export interface LogEvent {
  event: string;
  iteration?: number;
  score?: number;
  sentences?: { text: string; score: number }[];
  error?: string;
  reason?: string;
  finalScore?: number;
  thresholdMet?: boolean;
  [key: string]: unknown;
}

export interface HumanizeConfig {
  threshold: number;
  maxIterations: number;
  voiceSample?: string;
}
