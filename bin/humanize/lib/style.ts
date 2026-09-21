// Deterministic style-rule engine. This is the guaranteed-enforcement layer
// described in the loop algorithm: applied to every rewrite's output BEFORE
// it is re-scored, never left to the LLM alone.

export interface StyleRulesConfig {
  bannedPhrases: string[];
  hardRules: {
    noDashPunctuation: boolean;
    expandContractions: boolean;
    noStackedPunctuation: boolean;
  };
}

const DASH_CHARS = "\u2014\u2013"; // em-dash, en-dash
const DASH_CLASS = `[${DASH_CHARS}]`;

/**
 * Strip em/en-dashes used as punctuation, replacing with a comma, period, or
 * parenthetical as grammatically appropriate. Guaranteed to leave zero
 * em/en-dash characters in the output (final catch-all pass below).
 */
function stripDashes(input: string): string {
  let text = input;

  // 1. Numeric ranges ("10-20", "pages 4-9"): the dash is not punctuation
  //    between clauses, it means "to".
  text = text.replace(new RegExp(`(\\d)\\s*${DASH_CLASS}\\s*(\\d)`, "g"), "$1 to $2");

  // 2. Paired dashes wrapping a parenthetical aside ("word — aside — word"):
  //    convert to a comma-delimited parenthetical.
  text = text.replace(
    new RegExp(`\\s*${DASH_CLASS}\\s*([^${DASH_CHARS}]+?)\\s*${DASH_CLASS}\\s*`, "g"),
    ", $1, "
  );

  // 3. Remaining single dashes: split into two sentences if what follows
  //    reads as an independent clause (starts with a capital letter after
  //    trimming), otherwise fold into the sentence with a comma.
  text = text.replace(new RegExp(`\\s*${DASH_CLASS}\\s*`, "g"), (_match, offset, full) => {
    const after = full.slice(offset + _match.length);
    const afterTrimmed = after.trimStart();
    const startsUpper = /^[A-Z]/.test(afterTrimmed);
    if (startsUpper) {
      return ". ";
    }
    return ", ";
  });

  // 4. Catch-all: guarantee no em/en-dash survives, however it appeared.
  text = text.replace(new RegExp(DASH_CLASS, "g"), ", ");

  return text;
}

// [pattern, canonical-lowercase-expansion]. "it's" is deliberately excluded
// per the documented ambiguity ("it is" vs "it has") — see README.
const CONTRACTIONS: [string, string][] = [
  ["don't", "do not"],
  ["doesn't", "does not"],
  ["didn't", "did not"],
  ["won't", "will not"],
  ["wouldn't", "would not"],
  ["can't", "cannot"],
  ["couldn't", "could not"],
  ["shouldn't", "should not"],
  ["isn't", "is not"],
  ["aren't", "are not"],
  ["wasn't", "was not"],
  ["weren't", "were not"],
  ["haven't", "have not"],
  ["hasn't", "has not"],
  ["hadn't", "had not"],
  ["I'm", "I am"],
  ["you're", "you are"],
  ["we're", "we are"],
  ["they're", "they are"],
  ["that's", "that is"],
  ["what's", "what is"],
  ["let's", "let us"],
  ["I've", "I have"],
  ["you've", "you have"],
  ["we've", "we have"],
  ["they've", "they have"],
  ["I'll", "I will"],
  ["you'll", "you will"],
  ["we'll", "we will"],
  ["they'll", "they will"],
  ["he'll", "he will"],
  ["she'll", "she will"],
  ["I'd", "I would"],
  ["you'd", "you would"],
];

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Preserve the matched token's case in the (multi-word) expansion. */
function applyCase(matched: string, expansion: string): string {
  // "I" is always capitalized in English regardless of source casing.
  if (/^i\b/i.test(expansion)) {
    return expansion;
  }
  const letters = matched.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 0 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) {
    return expansion.toUpperCase();
  }
  if (matched[0] && matched[0] === matched[0].toUpperCase() && matched[0] !== matched[0].toLowerCase()) {
    return expansion.charAt(0).toUpperCase() + expansion.slice(1);
  }
  return expansion;
}

const CONTRACTION_MATCHERS = CONTRACTIONS.map(([contraction, expansion]) => {
  const parts = contraction.split("'").map(escapeRegex);
  const pattern = new RegExp(`\\b${parts.join("['\u2019]")}\\b`, "gi");
  return { pattern, expansion };
});

/** Word-boundary-safe, case-preserving contraction expansion. */
function expandContractions(input: string): string {
  let text = input;
  for (const { pattern, expansion } of CONTRACTION_MATCHERS) {
    text = text.replace(pattern, (matched) => applyCase(matched, expansion));
  }
  return text;
}

/** Collapse stacked punctuation (?!, !!, ..., ;; ::) to a single mark. */
function collapseStackedPunctuation(input: string): string {
  let text = input;
  // Ellipsis / repeated periods -> single period.
  text = text.replace(/\.{2,}/g, ".");
  // Mixed or repeated ?/! runs -> keep the first mark only.
  text = text.replace(/([!?]){1}[!?]+/g, "$1");
  // Repeated semicolons/colons -> single.
  text = text.replace(/;{2,}/g, ";");
  text = text.replace(/:{2,}/g, ":");
  return text;
}

/** Tidy up whitespace/punctuation artifacts left behind by the passes above. */
function cleanupWhitespace(input: string): string {
  let text = input;
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/ +([,.;:!?])/g, "$1");
  text = text.replace(/,\s*,/g, ",");
  text = text.replace(/\.\s*,/g, ".");
  text = text.replace(/,\s*\./g, ".");
  text = text.replace(/\n[ \t]+/g, "\n");
  return text;
}

export function applyDeterministicStyleRules(text: string, rules: StyleRulesConfig): string {
  let out = text;
  if (rules.hardRules.noDashPunctuation) {
    out = stripDashes(out);
  }
  if (rules.hardRules.expandContractions) {
    out = expandContractions(out);
  }
  if (rules.hardRules.noStackedPunctuation) {
    out = collapseStackedPunctuation(out);
  }
  out = cleanupWhitespace(out);
  return out.trim();
}

/** Hard rules to embed verbatim in every rewrite prompt (see rewriter.ts). */
export function styleConstraintsForPrompt(rules: StyleRulesConfig): string[] {
  const constraints: string[] = [];
  if (rules.hardRules.noDashPunctuation) {
    constraints.push(
      "Never use an em-dash (\u2014) or en-dash (\u2013) as punctuation. Use a comma, period, or parenthetical instead."
    );
  }
  if (rules.hardRules.expandContractions) {
    constraints.push(
      'Write contractions out in full (do not, does not, cannot, I am, you are, and so on). Exception: "it\'s" may be left as-is because it is ambiguous between "it is" and "it has" — prefer rewriting the sentence to avoid it when natural.'
    );
  }
  if (rules.hardRules.noStackedPunctuation) {
    constraints.push(
      "Do not stack punctuation (no ?!, !!, or ellipses) and avoid chains of semicolons or colons. Prefer plain sentence structure."
    );
  }
  if (rules.bannedPhrases.length > 0) {
    constraints.push(`Avoid these overused AI-sounding phrases/words: ${rules.bannedPhrases.join(", ")}.`);
  }
  constraints.push("Use a casual, simple, human tone.");
  return constraints;
}
