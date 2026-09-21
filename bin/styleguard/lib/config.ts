import type { StyleguardConfig } from "./types.ts";
import type { StyleRulesConfig } from "./style.ts";

export const DEFAULT_CONFIG: StyleguardConfig = {
  threshold: 90,
  maxIterations: 4,
  // Winston's readability_score is 0-100, Flesch-Kincaid reading ease,
  // higher = easier to read. Winston's own docs mark 50 as the boundary
  // between "fairly difficult" and "difficult" prose
  // (https://help.gowinston.ai/understanding-winston-ai/how-do-we-interpret-the-results-from-an-ai-text-scan) —
  // below it, text reads as dense; above it, normal blog/marketing prose
  // stays plain-English without being forced to elementary-grade sentences.
  readabilityFloor: 50,
};

/** Loads bundled lib/style-rules.json, optionally merged with a --config file override. */
export async function loadStyleRules(overridePath?: string): Promise<StyleRulesConfig> {
  const bundledPath = new URL("./style-rules.json", import.meta.url);
  const bundled = JSON.parse(await Bun.file(bundledPath).text()) as StyleRulesConfig;
  if (!overridePath) {
    return bundled;
  }

  const file = Bun.file(overridePath);
  if (!(await file.exists())) {
    throw new Error(`--config file not found: ${overridePath}`);
  }
  let overrideJson: Partial<StyleRulesConfig>;
  try {
    overrideJson = JSON.parse(await file.text());
  } catch (err) {
    throw new Error(`--config file is not valid JSON (${overridePath}): ${(err as Error).message}`);
  }
  return {
    bannedPhrases: overrideJson.bannedPhrases ?? bundled.bannedPhrases,
    hardRules: { ...bundled.hardRules, ...(overrideJson.hardRules ?? {}) },
  };
}

/** Merges an optional --config file's `defaults` block over DEFAULT_CONFIG. */
export async function loadDefaults(overridePath?: string): Promise<StyleguardConfig> {
  if (!overridePath) {
    return { ...DEFAULT_CONFIG };
  }
  const file = Bun.file(overridePath);
  if (!(await file.exists())) {
    throw new Error(`--config file not found: ${overridePath}`);
  }
  const json = JSON.parse(await file.text()) as { defaults?: Partial<StyleguardConfig> };
  return { ...DEFAULT_CONFIG, ...(json.defaults ?? {}) };
}
