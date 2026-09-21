#!/usr/bin/env bun
// styleguard: provider-agnostic AI-content-detection + personal-style CLI.
// See README.md for usage, secret setup, and config format.

import { WinstonDetector } from "./lib/detectors/winston.ts";
import { OpenAiRewriter } from "./lib/rewriter.ts";
import { resolveOpenAiKey, resolveWinstonKey } from "./lib/secrets.ts";
import { loadDefaults, loadStyleRules } from "./lib/config.ts";
import { applyDeterministicStyleRules } from "./lib/style.ts";
import { RunLogger } from "./lib/logger.ts";
import { styleguard } from "./lib/loop.ts";

const HELP = `styleguard --mode polish|grounded --in <file> --out <file>

Detect-scores a draft against Winston AI, rewrites low-scoring sentences with
gpt-6-astra, and enforces a deterministic personal style pass (no em/en-dash,
contractions expanded, no stacked punctuation, no LLM involved in this pass)
once before the first detection call and once more on the final chosen text,
looping until a candidate clears BOTH the human-likeness threshold and the
readability floor, or --max-iterations is exhausted. Winston is a single
vendor's opinion, never the sole gate: a candidate that clears the
readability floor is always preferred over one that scores higher on
AI-detection alone but reads as harder to parse. Always exits 0 on a
completed run, even when the threshold is not met, and always returns the
best text seen.

Flags:
  --mode <polish|grounded>   Required. "grounded" also requires --context.
  --in <file>                Required. Input text file to process.
  --out <file>                Required. Where the final text is written.
                              stdout/--out carry FINAL TEXT ONLY, never
                              score/JSON/diagnostics.
  --context <file>           Verified context packet (grounded mode only).
  --threshold <0-100>        Human-likeness score to stop at. Default: 90.
  --readability-floor <0-100>
                              Minimum Winston readability_score (Flesch-Kincaid
                              reading ease, higher = easier) a candidate must
                              clear to count as "good enough." Default: 50.
  --max-iterations <n>       Max detect/rewrite cycles. Default: 4.
  --log-dir <dir>            Run log directory. Default: ~/.local/state/styleguard
                              Only the log file *path* is printed, to stderr.
                              Never pipe the log itself back into an LLM/agent
                              context.
  --config <file>            JSON file overriding style-rules / defaults.
                              See README.md for the shape.
  --voice-sample <file>      Reserved for future voice-matching (not
                              implemented in this version; accepted and
                              ignored so the flag is reachable later).
  -h, --help                 Show this help and exit.

Exit code: always 0 on a completed run. Non-zero only for hard usage errors:
missing --in file, unreadable --config, or an unresolved required secret.
`;

interface Args {
  mode?: "polish" | "grounded";
  in?: string;
  out?: string;
  context?: string;
  threshold?: number;
  readabilityFloor?: number;
  maxIterations?: number;
  logDir?: string;
  config?: string;
  voiceSample?: string;
  help: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { help: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = () => argv[++i];
    switch (flag) {
      case "-h":
      case "--help":
        args.help = true;
        break;
      case "--mode": {
        const v = next();
        if (v !== "polish" && v !== "grounded") {
          throw new UsageError(`--mode must be "polish" or "grounded", got: ${v}`);
        }
        args.mode = v;
        break;
      }
      case "--in":
        args.in = next();
        break;
      case "--out":
        args.out = next();
        break;
      case "--context":
        args.context = next();
        break;
      case "--threshold":
        args.threshold = Number(next());
        break;
      case "--readability-floor":
        args.readabilityFloor = Number(next());
        break;
      case "--max-iterations":
        args.maxIterations = Number(next());
        break;
      case "--log-dir":
        args.logDir = next();
        break;
      case "--config":
        args.config = next();
        break;
      case "--voice-sample":
        args.voiceSample = next();
        break;
      default:
        throw new UsageError(`Unknown flag: ${flag}`);
    }
  }
  return args;
}

class UsageError extends Error {}

async function readFileOrFail(path: string, label: string): Promise<string> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new UsageError(`${label} file not found: ${path}`);
  }
  return file.text();
}

async function main(): Promise<number> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error((err as Error).message);
    console.error(HELP);
    return 1;
  }

  if (args.help) {
    console.log(HELP);
    return 0;
  }

  if (!args.mode) {
    console.error("Missing required flag: --mode polish|grounded");
    console.error(HELP);
    return 1;
  }
  if (!args.in) {
    console.error("Missing required flag: --in <file>");
    return 1;
  }
  if (!args.out) {
    console.error("Missing required flag: --out <file>");
    return 1;
  }
  if (args.mode === "grounded" && !args.context) {
    console.error("--mode grounded requires --context <file>");
    return 1;
  }

  let inputText: string;
  let contextText: string | undefined;
  try {
    inputText = await readFileOrFail(args.in, "--in");
    if (args.context) {
      contextText = await readFileOrFail(args.context, "--context");
    }
  } catch (err) {
    console.error((err as Error).message);
    return 1;
  }

  let styleRules;
  let defaults;
  try {
    styleRules = await loadStyleRules(args.config);
    defaults = await loadDefaults(args.config);
  } catch (err) {
    console.error((err as Error).message);
    return 1;
  }

  const config = {
    threshold: args.threshold ?? defaults.threshold,
    readabilityFloor: args.readabilityFloor ?? defaults.readabilityFloor,
    maxIterations: args.maxIterations ?? defaults.maxIterations,
  };
  const logDir = args.logDir ?? `${process.env.HOME}/.local/state/styleguard`;

  const logger = new RunLogger();
  logger.log({
    event: "run_started",
    mode: args.mode,
    threshold: config.threshold,
    readabilityFloor: config.readabilityFloor,
    maxIterations: config.maxIterations,
  });

  // Winston's auto-detect language mode. No local language-detection
  // dependency is pulled in for this (no external deps allowed); Winston
  // supports "auto" natively per its API contract.
  const detectedLang = "auto";
  const byteLength = Buffer.byteLength(inputText, "utf8");

  let finalText: string;

  if (!WinstonDetector.supportsLanguage(detectedLang) || byteLength < WinstonDetector.minChars) {
    // Gate check only, no secrets touched, no Winston call ever made for
    // input this short.
    finalText = applyDeterministicStyleRules(inputText, styleRules);
    logger.log({ event: "detection_skipped", reason: "too short or unsupported language" });
  } else {
    let winstonKey: string;
    let openAiKey: string;
    try {
      [winstonKey, openAiKey] = await Promise.all([resolveWinstonKey(), resolveOpenAiKey()]);
    } catch (err) {
      console.error(`Startup secret resolution failed: ${(err as Error).message}`);
      return 1;
    }

    const detector = new WinstonDetector(winstonKey);
    const rewriter = new OpenAiRewriter(openAiKey);

    const result = await styleguard({
      inputText,
      mode: args.mode,
      contextText,
      detectedLang,
      detector,
      rewriter,
      styleRules,
      config,
      logger,
    });
    finalText = result.text;
  }

  await Bun.write(args.out, finalText);
  const logPath = await logger.flush(logDir);
  console.error(logPath);

  return 0;
}

process.exit(await main());
