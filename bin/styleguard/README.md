# styleguard

Provider-agnostic AI-content-detection + personal-style CLI. Detect-scores a
draft against Winston AI, rewrites low-scoring sentences with `gpt-6-astra`
directly through the OpenAI Responses API, and enforces a deterministic
personal style pass (no em/en-dash, contractions expanded, no stacked
punctuation, banned-phrase steer — regex/string rules only, no LLM call is
ever involved in this pass) once before the very first detect call and once
more on whichever candidate is finally chosen. Loops until a candidate
clears BOTH the human-likeness threshold and a readability floor, or
`--max-iterations` is exhausted. Winston is a single vendor's opinion, never
the sole gate on what ships: a candidate that also clears the readability
floor always beats one that scores higher on AI-detection alone but reads
as harder to parse, and the run always returns the best text seen — it
never fails just because a threshold was not reached.

## Requirements

- [Bun](https://bun.sh) on `$PATH`.
- 1Password CLI (`op`) signed in, with two items reachable:
  - `gowinston` — your Winston AI API token.
  - `OMP OPENAI` (vault `Personal`) — already used by `.omp/agent/models.yml`
    for the `openai-api` provider; reused as-is, no new secret created.

No npm dependencies. HTTP calls use Bun's built-in `fetch`.

## Secret setup

Both secrets are resolved at runtime via the `op` CLI, exactly like
`.omp/agent/models.yml` does for its provider keys — never hardcoded.

- **OpenAI** (rewriter): `op read "op://Personal/OMP OPENAI/password" --no-newline`
- **Winston AI** (detector): `op read "op://Personal/gowinston/password" --no-newline`.

  **Live-call status:** this reference could not be exercised end-to-end in
  the environment this CLI was built in — `op`'s CLI here authenticates
  through the 1Password desktop app's biometric integration (Touch ID /
  system auth), which requires an interactive approval that automated
  session could not provide (`op read ...` hangs waiting for it instead of
  returning). Run a real smoke test on your own interactive machine, where
  Touch ID approval is possible, before relying on this in a skill.

Secrets are resolved lazily: a run whose input is shorter than Winston's
300-character minimum (or in an unsupported language) never calls
`detector.detect()` at all, so it never touches 1Password or the Winston API
either — see `lib/loop.ts` / `cli.ts`'s pre-loop gate.

## Usage

```sh
styleguard --mode polish --in draft.txt --out draft.polished.txt
styleguard --mode grounded --in draft.txt --context packet.txt --out draft.polished.txt \
  --threshold 90 --readability-floor 50 --max-iterations 4 --log-dir ~/.local/state/styleguard
```

- `--mode polish|grounded` (required) — `grounded` also requires `--context
  <file>` (a verified facts packet the rewrite must never drift from).
- `--in <file>` / `--out <file>` (required) — both are file paths;
  `--out`'s contents carry **final text only**, never score/JSON/diagnostics.
- `--threshold <0-100>` — default `90`. Winston human-likeness score to stop
  at.
- `--readability-floor <0-100>` — default `50`. Minimum Winston
  `readability_score` (Flesch-Kincaid reading ease, higher = easier) a
  candidate must clear to count as "good enough." A candidate scoring above
  `--threshold` but below this floor is never preferred over one that clears
  both — see [Detection semantics](#detection-semantics) below.
- `--max-iterations <n>` — default `4`.
- `--log-dir <dir>` — default `~/.local/state/styleguard`. A JSON-lines run log
  (score history, iteration count, flagged sentences, API errors) is written
  here per run, for a human to `tail`/read manually. Only the log file
  **path** is printed, to stderr — the calling skill/agent must never pipe
  the log's contents back into an LLM/agent context.
- `--config <file>` — JSON file overriding `lib/style-rules.json`'s
  `bannedPhrases`/`hardRules` and/or the `threshold`/`readabilityFloor`/
  `maxIterations` defaults. Shape:

  ```json
  {
    "bannedPhrases": ["delve", "..."],
    "hardRules": { "noDashPunctuation": true, "expandContractions": true, "noStackedPunctuation": true },
    "defaults": { "threshold": 92, "readabilityFloor": 55, "maxIterations": 3 }
  }
  ```

- `--voice-sample <file>` — reserved for future voice-matching. Accepted and
  ignored in this version (not implemented, explicitly deferred).

Exit code is always `0` on a completed run, including a run that never
reached `--threshold` — that is expected best-effort behavior. Non-zero exit
only for hard usage errors: missing `--in` file, unreadable `--config`, or an
unresolved required secret.

## Detection semantics

Winston's response carries two independent numbers per detect call: the
AI-detection `score` (0-100, higher = more human-like) and a
`readability_score` (0-100, Flesch-Kincaid reading ease, higher = easier to
read; Winston computes this from sentence length/syllable density, it says
nothing about AI authorship). `lib/loop.ts` logs both on every `score`
event and never treats the AI-detection score alone as "done": a candidate
is accepted as best only once it clears `--readability-floor` too, and the
loop separately tracks the best AI-score-only candidate purely as a
never-block fallback for when nothing ever clears the readability floor
(still logged, via `readabilityFloorMet: false` on the `exhausted` event).
This means the loop can, and deliberately does, prefer a *lower*
AI-detection-scoring candidate over a higher-scoring one that reads as
noticeably harder to parse.

Winston is also a single vendor's classifier, not a calibrated cross-vendor
truth: passing its threshold is evidence, not proof, against any other
AI-detection service (see Non-goals — no second detector is implemented).

## Style rules

Hard rules (deterministic, enforced by regex/string ops on every rewrite
before re-scoring, and once more on the final chosen text — never left to
the LLM alone, and no LLM call is ever made to run this pass):

- No em-dash (—) or en-dash (–) used as punctuation (replaced with a comma,
  period, or comma-delimited parenthetical, grammatically as appropriate).
- Contractions expanded to full words (`don't` → `do not`, etc.), except
  `it's`, which is genuinely ambiguous ("it is" vs "it has") and is left as a
  documented limitation — the rewrite prompt is told to avoid it instead.
- No stacked punctuation (`?!`, `!!`, `...`) and no semicolon/colon chains.

`lib/style-rules.json` also ships an editable, non-fixed suggestion list of
overused AI-sounding phrases (`delve`, `tapestry`, `leverage`, ...) folded
into the same rewrite prompt as the style pass. Edit that file (or override
it via `--config`) freely.

## Architecture

```
cli.ts              entry point, arg parsing, secret gating, exit codes
lib/
  types.ts           Detector / Rewriter / DetectionResult / RewriteInput
  detectors/
    winston.ts        WinstonDetector — the only Detector today; a second
                       provider is a drop-in file against the same interface
  rewriter.ts         OpenAiRewriter — direct OpenAI Responses API call
  style.ts            deterministic rule engine
  style-rules.json    editable banned-phrase list + hard-rule config
  secrets.ts          op read wrappers for both keys
  logger.ts           human-readable JSON-lines run log writer
  loop.ts             detect -> rewrite -> re-score loop
  config.ts           defaults + --config override merge
```

## Non-goals (this version)

- No voice-sample-based tone matching (flag reachable, not implemented).
- No second detector implementation (Winston only, behind `Detector`).
- No UI, daemon/watch mode, or plagiarism/fact-checker use of the Winston
  account.
