import type { Detector, HumanizeConfig, Rewriter } from "./types.ts";
import type { StyleRulesConfig } from "./style.ts";
import { applyDeterministicStyleRules, styleConstraintsForPrompt } from "./style.ts";
import type { RunLogger } from "./logger.ts";

export interface HumanizeArgs {
  inputText: string;
  mode: "polish" | "grounded";
  contextText?: string;
  detectedLang: string;
  detector: Detector;
  rewriter: Rewriter;
  styleRules: StyleRulesConfig;
  config: HumanizeConfig;
  logger: RunLogger;
}

export interface HumanizeResult {
  text: string;
}

/**
 * The core detect -> rewrite -> re-score loop. Always returns the
 * best-scoring text seen; never throws for a missed threshold, and always
 * falls back to style-only output on a flaky detector API or unsupported
 * input rather than blocking the caller.
 */
export async function humanize(args: HumanizeArgs): Promise<HumanizeResult> {
  const { detector, rewriter, styleRules, config, logger, mode, contextText, detectedLang } = args;
  let text = args.inputText;
  let bestText = text;
  let bestScore = -1;

  const byteLength = Buffer.byteLength(text, "utf8");
  if (!detector.supportsLanguage(detectedLang) || byteLength < detector.minChars) {
    text = applyDeterministicStyleRules(text, styleRules);
    logger.log({ event: "detection_skipped", reason: "too short or unsupported language" });
    return { text };
  }

  const styleConstraints = styleConstraintsForPrompt(styleRules);

  for (let i = 1; i <= config.maxIterations; i++) {
    let result;
    try {
      result = await detector.detect(text, { language: detectedLang });
    } catch (err) {
      logger.log({ event: "detector_error", error: (err as Error).message, iteration: i });
      text = applyDeterministicStyleRules(text, styleRules);
      break;
    }

    logger.log({ event: "score", iteration: i, score: result.score, sentences: result.sentences });
    if (result.score > bestScore) {
      bestScore = result.score;
      bestText = text;
    }

    if (result.score >= config.threshold) {
      logger.log({ event: "threshold_met", iteration: i });
      break;
    }

    if (i === config.maxIterations) {
      logger.log({ event: "exhausted", finalScore: bestScore, thresholdMet: false });
      break;
    }

    const flagged = result.sentences.filter((s) => s.score < config.threshold);
    const rewritten = await rewriter.rewrite({
      text,
      mode,
      context: mode === "grounded" ? contextText : undefined,
      flagged,
      styleConstraints,
    });
    text = applyDeterministicStyleRules(rewritten, styleRules);
  }

  return { text: bestText };
}
