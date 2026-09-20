---
name: arch-pr-review
description: >
  Use when reviewing a app arch diff, branch, PR, work item, or rereview and the change must be checked for runtime defects and arch architecture and repository-rule violations.
  Prefer this over the plain `review` and `/code-review` skills; use `pr` for PR creation, `pre-pr-review` for the pre-PR gate, and `a11y` for a standalone accessibility audit.
---

# arch PR Review

Two reviews normally run over a app arch change and each one misses what the other catches.

- `/code-review max` hunts runtime bugs with a wide fan-out of finder agents and a verify pass, but it knows nothing about state, CQRS layering, or the repo rulebook.
- The `review` skill enforces the rulebook precisely, but it reads the diff once and never hunts for a bug the rules do not name.

This skill runs both as one pass: the same finder-verify-sweep machinery, with the arch rulebook wired in as first-class finder angles, then applies the fixes. It uses staged bundles to avoid paying for eleven repeated full-diff reads.

## Contract

Every run produces, in this order:

1. A **scope report** (what was diffed, and for a remote target the merge-base and rebase status).
2. A **findings report** via the `ReportFindings` tool, ranked most-severe first, at most 15 entries.
3. **Applied fixes** in the working tree, then a second `ReportFindings` call carrying each finding's `outcome`.
4. A short **text summary** with the two-tier checklist and one line per skipped finding.

Step 4 exists because `.ai/knowledge/review-rules.md` classifies every finding as **Issue** (must fix) or **Suggestion** (nice to have), and `ReportFindings` has no tier field. Rank all Issues above all Suggestions in the tool call, then restate them grouped by tier in the text so the tier survives.

`ReportFindings` is a host tool and it is often absent — subagents rarely have it. Check once at the start rather than discovering it at the end. When it is missing, keep the same records and emit them as a JSON array instead, adding a `tier` field (`issue` or `suggestion`) and the `outcome` field so nothing is lost, and say in the summary that you reported this way.
## Routing and capability policy

An **angle** is a coverage unit, an **agent** is an execution slot, and a **wave** is a bounded set of independent calls. Model names are routing labels, not permission to reduce angle coverage, candidate caps, or evidence quality.

| Situation | Route | Use |
| --- | --- | --- |
| Deterministic record normalization, schema checks, dedup bookkeeping, or summary formatting | `tiny` | Evidence-local work only. Never the sole correctness finder. |
| Genuinely simple 1–3-file, low-risk scan or straightforward verifier | `sonic` | Fast direct checks. Escalate any uncertainty, cross-file behavior, or rule interpretation. |
| Ordinary repository-aware review, including small/medium finder and verifier bundles | `smol` | Default tool-capable review agent. Preserve all assigned angles and caps. |
| Difficult bounded adjudication of a disputed plausible finding, race, CQRS, architecture boundary, or final synthesis | `slow` | Use one evidence-packed reasoning unit, not a blanket duplicate review. |
| Security, data loss, destructive behavior, concurrency/CQRS cross-cutting risk, or unresolved high-impact disagreement | `ultra` | Exceptional tool-capable escalation, scoped to the concrete concern. Never the default whole-review fleet. |

Select by both diff size and risk. A low-risk large diff can retain `smol` finder bundles; a tiny diff with data loss or security impact escalates. State the selected route and reason in the run notes. If a named route is unavailable, use the next capable cheaper route or the primary session; do not silently create a larger fleet.

Use stateless `completion` instead of an agent only when the task is read-only judgment, all required evidence fits a compact verified packet, and the output is bounded and structured. Suitable work includes deduplication, severity ordering, report synthesis, and adjudicating one supplied candidate. The packet must contain exact paths and lines, relevant diff and enclosing code, cited rules, the question, and the output schema. `completion` has no repository access: it MUST NOT search, fetch, edit, reproduce, validate, or make final acceptance claims. Call it at most once per bounded unit. `INSUFFICIENT_EVIDENCE` means the primary repacks once with the named evidence; a second failure becomes a tool-capable agent task.

## Parallel waves and bottleneck control

Wave 0 is primary-owned: resolve scope, fetch or select the tree, count files, load rules, check host-tool availability once, and build one compact packet. Do not start a remote fan-out before the diff is fetched and classified.

Wave 1 runs independent finder bundles concurrently, with a hard maximum of six agents. Finder packets are read-only and have no shared mutable ledger. Split large packets by top-level directory only when each split retains the callers and rules it needs.

After fan-in, deduplicate by line and mechanism without suppressing different reasons. Verification may run in parallel batches of at most five candidates, partitioned by unrelated top-level area. Each candidate receives exactly one verdict, and the phase does not close until every finder result has been processed. Report generation, `ReportFindings`, working-tree fixes, and validation are shared-state boundaries and remain serial. Parallel fixes are allowed only for disjoint files; otherwise the primary agent serializes them.

Do not block verification on unrelated finder work once the deduplicated batch is ready, but do not lose late candidates. Cap verifier concurrency at five batches. Run at most one targeted gap sweep after verification; never use it as a default second full review.

Escalate one step for a finder disagreement, a cross-file or cross-layer finding, a realistic race, or a high-impact fix. Retry a failed bundle once at the same route, then record that coverage is unavailable; do not loop. Escalation is item-scoped, not a reason to rerun the whole review. Deterministic checks and final acceptance stay in the primary session.


## Phase 0 — Establish scope

Decide local or remote from what the user gave you.

**Remote** — a PR link or number, a work item id, a branch name, or `rereview`. Read `references/remote-target.md` and follow it. It resolves the target, produces the three-dot diff, and loads the ticket acceptance criteria that Phase 3 verifies against.

**Local** — anything else. Run `git diff @{upstream}...HEAD` for committed work and `git diff HEAD` for the working tree, and review both. The review usually runs before the commit, so the working tree is in scope by default.

Whatever the source, that diff is the review scope. Then:

- **Skip generated AI-rule targets.** `.cursor/rules/*.mdc`, `.claude/skills/**/*.md`, `AGENTS.md`, and `.windsurfrules` are generated from `.ai/`. If one shows up in the diff, review its `.ai/` source instead and say so.
- **Do not skip test files.** The rulebook requires a `.spec.ts` for every touched pure utility and forbids `it.skip`, so tests are review surface here, unlike in a generic review.
- **Announce the scope in one line** before the finders run, so the user can stop you if you picked the wrong target.

### Get the reviewed code into a working tree

Do this now, before the finders run. Every angle is told to open the enclosing function around each hunk, and on a remote review half those files do not exist in the current checkout — so finders that start early are reading the wrong tree, or no tree at all.

A local review already has the code. A remote review needs the source tip checked out somewhere, and the choice is yours to offer, not to make: run `git rev-parse --abbrev-ref HEAD` and `git worktree list` first.

- Already on `<sourceBranch>` with a clean tree — work here.
- The branch is checked out in another worktree — a second checkout of it will fail, so check out its tip SHA detached instead. The tree is identical and `git diff` still works.
- Neither — offer to check the branch out or to create a worktree for it, and wait. Do not switch branches on your own, since the user may have work in progress.
- Declined, or the tree is dirty — say so, then review from the diff text alone and expect weaker findings, because the angles lose their file access.

### Scale the fan-out to the diff

Review size controls coverage, not model quality:

- **1 to 3 files** — run one `smol` bundled finder covering A through E and one F through K finder. For a genuinely low-risk diff, `sonic` may run both bundles. Use `tiny` only for deterministic packet or record work, never as the sole correctness finder. Skip the sweep unless a confirmed issue triggers it.
- **4 to 20 files** — run the three existing bundles (`smol`): A–B, C–E, and F–K. Parallelize them in one wave.
- **More than 20 files** — run six `smol` bundles: three correctness and three arch, split by top-level directory when useful. Escalate a high-risk cross-cutting concern to one scoped `slow` or `ultra` task rather than duplicating the whole fleet.

All selected bundles inspect every file in their packet and return every nameable candidate up to the cap. A cheaper model does not justify self-censoring. State the size tier, selected models, and risk reason before agents run.

Create one compact review packet before starting agents. It contains the exact diff, changed-file list, relevant enclosing functions, and the rule sources needed by changed file type. Pass the packet path and a candidate schema to agents. Do not paste the diff or rules into each prompt. Agents must return only candidates in the required schema. Do not include explanations, repeated diff hunks, or rule text in finder output.

If the Agent tool is unavailable, use the primary session or the completion path only where its evidence-only contract fits; never claim that completion performed repository inspection.

## Phase 1 — Find candidates

Run the finder angles chosen in Phase 0 as parallel subagents via the Agent tool. Each returns candidates up to that tier's cap, every candidate carrying `file`, `line`, a one-line `summary`, and a concrete `failure_scenario`.

The angle briefs live in `references/angles.md`. Use these bundles:

- **Small diff, 1 to 3 files**: one `smol` correctness agent covering A through E and one `smol` arch agent covering F through K. Require both to inspect every changed file.
- **Medium diff, 4 to 20 files**: three `smol` agents. One covers A and B. One covers C through E. One covers F through K. Give each only the packet and its assigned sections.
- **Large diff, more than 20 files**: six `smol` agents. Use three correctness bundles and three arch bundles. Split the packet by top-level directory when that reduces unrelated context. Run no more than six agents per wave.


This preserves independent coverage while reducing duplicated context. The bundle is a coverage unit, not permission to self-censor. Every agent still returns all nameable candidates up to the tier cap.

Two things decide whether this phase is worth its cost:

- **Do not let one angle silence another.** If two angles flag the same line for different reasons, keep both. Dedup happens in Phase 2, where you can see all of them.
- **Pass through every candidate with a nameable failure scenario.** A finder that quietly drops half-believed candidates bypasses the verify step, and that is the single biggest cause of missed bugs. Uncertainty is Phase 2's job, not Phase 1's.

If the Agent tool is unavailable, use the primary session or the completion path only where its evidence-only contract fits; never claim that completion performed repository inspection.

## Phase 2 — Verify

Dedup candidates that point at the same line and mechanism, keeping the one with the most concrete failure scenario. Build a verification packet with only the relevant hunks, enclosing functions, candidate claims, and cited rules. For up to five low-risk candidates, use `sonic`; use `smol` for ordinary repository-aware verification. Use `completion` only for evidence-complete, read-only verdicts. Use `slow` for disputed PLAUSIBLE findings, races, CQRS, architecture boundaries, or synthesis; use `ultra` only for high-impact or unresolved cross-cutting concerns. Verify in parallel batches of up to five candidates when they belong to unrelated top-level areas. Never send the full diff to a verifier when the relevant excerpt is sufficient. Each candidate still gets exactly one verdict, and every finder result must be processed:

- **CONFIRMED** — can name the inputs or state that trigger it and the wrong output. Quotes the line.
- **PLAUSIBLE** — the mechanism is real, the trigger is uncertain. States what would confirm it.
- **REFUTED** — factually wrong, or guarded elsewhere. Quotes the line that proves it.

This is recall mode. Keep CONFIRMED and PLAUSIBLE, drop only REFUTED. Do not refute a candidate for being speculative when the state is realistic: races, undefined on a rare but reachable path, falsy-zero treated as missing, off-by-one on a boundary the code does not exclude.

Rulebook findings verify differently and the distinction matters. A rule violation is a fact about the file, not a hypothesis about runtime, so the verifier's job is to quote the rule and quote the line that breaks it. If it cannot produce both quotes, the candidate is REFUTED — that guard is what keeps this skill from inventing style complaints.
## Phase 3 — Sweep, and check the ticket

Two passes here.

**Sweep for gaps.** Run one fresh gap finder only for a large diff, a remote target with acceptance criteria, or a review whose first pass produced a confirmed correctness issue. Give it the verified list and only changed-file excerpts. Its job is defects not already listed. Focus it where first passes go blind: moved code that dropped a guard, mismatched setup and teardown, flipped config defaults, missing barrel exports, or missing i18n keys. Up to 8 new candidates. Skip this sweep for a small clean review. Nothing new means an empty sweep. Do not pad it.

**Check the ticket** (remote targets with a work item only). Verify the task-scoped acceptance criteria from `references/remote-target.md` against the diff and report each as met, partial, or not met with file evidence. An unmet task-scoped criterion, or a reported bug the diff does not fix, is an Issue like any other. Scope drift — unrelated changes with no justification — is a Suggestion.

## Phase 4 — Report and fix

Report first, then fix, so the findings survive even if a fix goes sideways.

**Report.** Call `ReportFindings` once with `{level: "max", findings}`. At most 15 entries, Issues ranked above Suggestions and severity ranked within each tier. Each entry carries `file`, `line`, `summary`, `short_summary` (the claim alone in 60 characters or less), `failure_scenario`, `category` (a kebab slug: `correctness`, `architecture`, `conventions`, `a11y`, `i18n`, `test-coverage`, `reuse`, `simplification`, `efficiency`, `altitude`), and `verdict`. When the cap forces a cut, correctness bugs outrank everything else.

**Fix.** Apply every finding to the working tree — correctness bugs and cleanup alike. Skip a finding when the fix would change intended behaviour, would need changes well outside the reviewed diff, or you judge it a false positive. Note the skip rather than arguing with it.

Fix in the tree Phase 0 established. It is already the right one, so nothing to re-decide here.

Route fixes by scope: use `smol` for ordinary single-file fixes, `slow` for difficult multi-file or architectural fixes, and `ultra` only for high-impact cross-cutting fixes. `tiny` may make deterministic record-only edits; `sonic` may make the simplest mechanical fix after a direct check. Agents must not share a mutable working tree: parallel fixes require disjoint files, otherwise the primary session applies them serially.

Some findings are coupled: applying one forecloses another, usually because a cleanup wants to delete a symbol that a correctness fix now depends on. When two collide, take the correctness fix and skip the cleanup, then say in the skip line that the two are coupled and which decision would unblock it. Do not half-apply both.

Fix within the repo's own rules, since a fix that breaks the rulebook just moves the finding. Angle G already gathered those rules from `.coderabbit.yaml`, `CLAUDE.md`, and `CLAUDE.local.md` — fix against what it cited rather than a remembered summary of it, because the rules change and the citation is current.

Two of those rules collide often enough to call out. "Single return, no early returns" and "never assemble large JSX blocks into local variables" cannot both hold for a component whose branches return different JSX trees. When repo rules genuinely conflict, satisfy the one governing the narrower scope — the JSX rule here, since it is specific to components — leave the other, and say which you chose. Do not contort the code to half-satisfy both, and do not open a finding about the conflict.

**Validate.** Run `npm run check-types`. Run `npm test` when any utility or spec was touched. Use the narrowest relevant project test command first when the repository supports it, then run the required full command before reporting done. A fix that does not typecheck is not a fix — repair it or revert it and downgrade the finding to skipped with the reason.

**Close out.** Call `ReportFindings` again with the same findings, each carrying `outcome`: `fixed`, `no_change_needed` (the finding was wrong or already handled), or `skipped` (real but not applied). Then write the text summary — the two-tier checklist with `file:line` references, and one line per skipped finding saying why.

If findings from this review get fixed later in the same session, call `ReportFindings` again the moment those fixes land. The per-finding status in the UI updates only from that call, so without it they stay marked unresolved.

## What this skill does not do

- It does not write the pre-PR marker that unblocks `az repos pr create`. That gate belongs to the `pre-pr-review` skill, so run that too before opening a PR.
- It does not post comments to Azure DevOps. Reviewing an existing PR leaves the threads alone unless the user asks for a reply.
- It does not create, retarget, or publish a PR. That is the `pr` skill.
