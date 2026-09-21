import type { Detector, StyleguardConfig, Rewriter } from "./types.ts";
import type { StyleRulesConfig } from "./style.ts";
import { applyDeterministicStyleRules, styleConstraintsForPrompt } from "./style.ts";
import type { RunLogger } from "./logger.ts";

export interface StyleguardArgs {
  inputText: string;
  mode: "polish" | "grounded";
  contextText?: string;
  detectedLang: string;
  detector: Detector;
  rewriter: Rewriter;
  styleRules: StyleRulesConfig;
  config: StyleguardConfig;
  logger: RunLogger;
}

export interface StyleguardResult {
  text: string;
}

interface Candidate {
  text: string;
  score: number;
  readabilityScore: number | null;
}

/**
 * The core detect -> rewrite -> re-score loop.
 *
 * Winston is one vendor's opinion, not a verdict, and it is never the sole
 * gate on what ships: a candidate is only "good enough" when its
 * AI-detection score clears `config.threshold` AND its readability score
 * clears `config.readabilityFloor`. The loop tracks the best
 * readability-clearing candidate separately from the best AI-detection
 * score seen overall, and only falls back to the latter if nothing ever
 * cleared the readability floor — best-effort, never blocking, exactly like
 * a missed AI-detection threshold.
 *
 * The deterministic style/tone pass (lib/style.ts — regex-only, no LLM call
 * of any kind) runs twice, unconditionally: once on the raw input before
 * Winston ever sees it, and once more on whichever candidate is finally
 * chosen, regardless of which iteration or fallback path produced it and
 * regardless of a mid-loop detector error. Every rewrite in between is also
 * passed through it before re-scoring, so an LLM rewrite can never
 * reintroduce an em-dash, a stacked punctuation run, or a contraction that
 * survives to the output.
 */
export async function styleguard(args: StyleguardArgs): Promise<StyleguardResult> {
  const { detector, rewriter, styleRules, config, logger, mode, contextText, detectedLang } = args;

  // Personality/tone layer, pass 1 of 2 — deterministic only, no LLM call.
  let text = applyDeterministicStyleRules(args.inputText, styleRules);

  const byteLength = Buffer.byteLength(text, "utf8");
  if (!detector.supportsLanguage(detectedLang) || byteLength < detector.minChars) {
    logger.log({ event: "detection_skipped", reason: "too short or unsupported language" });
    return { text };
  }

  const styleConstraints = styleConstraintsForPrompt(styleRules);

  let best: Candidate | null = null; // best candidate that also clears the readability floor
  let bestOverall: Candidate | null = null; // best AI-detection score seen, any readability

  for (let i = 1; i <= config.maxIterations; i++) {
    let result;
    try {
      result = await detector.detect(text, { language: detectedLang });
    } catch (err) {
      logger.log({ event: "detector_error", error: (err as Error).message, iteration: i });
      break;
    }

    const readabilityScore = result.readabilityScore;
    const floorMet = readabilityScore === null || readabilityScore >= config.readabilityFloor;
    logger.log({
      event: "score",
      iteration: i,
      score: result.score,
      readabilityScore,
      readabilityFloorMet: floorMet,
      sentences: result.sentences,
    });

    const candidate: Candidate = { text, score: result.score, readabilityScore };
    if (candidate.score > (bestOverall?.score ?? -1)) {
      bestOverall = candidate;
    }
    if (floorMet && candidate.score > (best?.score ?? -1)) {
      best = candidate;
    }

    if (result.score >= config.threshold && floorMet) {
      logger.log({ event: "threshold_met", iteration: i });
      break;
    }

    if (i === config.maxIterations) {
      logger.log({
        event: "exhausted",
        finalScore: (best ?? bestOverall)?.score ?? result.score,
        readabilityFloorMet: best !== null,
        thresholdMet: false,
      });
      break;
    }

    const flagged = result.sentences.filter((s) => s.score < config.threshold);
    const rewritten = await rewriter.rewrite({
      text,
      mode,
      context: mode === "grounded" ? contextText : undefined,
      flagged,
      styleConstraints,
      readabilityHint:
        !floorMet && readabilityScore !== null ? { score: readabilityScore, floor: config.readabilityFloor } : undefined,
    });
    text = applyDeterministicStyleRules(rewritten, styleRules);
  }

  const chosen = best ?? bestOverall;
  const finalText = chosen ? chosen.text : text;

  // Personality/tone layer, pass 2 of 2 — deterministic only, no LLM call.
  return { text: applyDeterministicStyleRules(finalText, styleRules) };
}
