---
name: orchestrate-pr-writer
description: Use when a task needs a pull/merge request description written or rewritten via a stateless writer completion, after the primary agent has gathered and verified the repository's diff, template, and work-item context.
hide: true
disable-model-invocation: true
---

# Orchestrate PR Writer

Use the primary agent for repository access, git/platform CLI calls, decisions, and verification. Use one `gpt-6-astra` completion only for the bounded writing task of drafting a pull/merge request description, after the primary agent has assembled a verified context packet.

## Capability boundary

The `completion` API is stateless and has no repository tools. A `gpt-6-astra` completion can turn supplied evidence into a PR/MR description draft. It cannot read files, list diffs, query the platform (GitHub/GitLab/Azure DevOps/Bitbucket/etc.), run commands, or apply anything. The primary agent owns every tool action, every platform-CLI call, and every final claim.

Do not use this skill for trivial one-line description edits, facts already established, or writing the primary agent can finish directly.

## Decision rule

Delegate only when all of these are true:

- The PR/MR description is a bounded writing task with a concrete output.
- The primary agent has already gathered the diff scope, template (if any), and relevant work-item/CI facts.
- The result can be checked locally (structurally diffed against the template) before it is applied to the live PR/MR.

Keep security decisions, destructive or irreversible operations, external side effects, and final acceptance in the primary session.

## Workflow

1. **Define the unit.** Objective: a PR/MR description for the change under review. Audience: the assigned reviewers. Output format: whatever the repository's own template requires (or a minimal generic structure if none exists). Non-goal: do not draft commit messages, changelogs, or release notes unless explicitly asked.
2. **Find the template, don't assume one.** Look for the repository's own PR/MR template before writing anything:
   - Common locations to check (repo root and `.github/`, `.gitlab/`, `.azuredevops/`, `docs/`): `PULL_REQUEST_TEMPLATE.md`, `pull_request_template.md`, `.github/PULL_REQUEST_TEMPLATE/*.md`, `.gitlab/merge_request_templates/*.md`.
   - If a template exists, read it and treat its exact headings, section order, and checkbox wording as the fixed structure. Never add, remove, reorder, or reword its sections.
   - If no template exists, say so and fall back to a minimal generic structure (e.g. Summary / Changes / Testing) — do not invent a fake "standard" template.
3. **Research the change.** Inspect the actual diff/commit range against the target branch, the repository's own conventions, any linked issues/work items already attached to the PR/MR, and — only if a checklist requires it — real CI/policy/review status queried through the platform's CLI (e.g. `gh pr checks`, `glab mr view`, `az repos pr policy list`). Resolve identifiers and URLs from the repository/platform; never guess them.
4. **Assemble the packet.** Include only verified facts:
   - the discovered template's exact text (or explicit note that none exists), reproduced verbatim in the prompt;
   - the platform and repo/PR identity (host, PR/MR number, source → target branch);
   - a compact description of *what changed and why*, grouped by scope/area — not a raw file list or diff dump;
   - which checklist items (if the template has any) are actually verifiable right now, and the evidence for each, so the model only toggles what is proven true;
   - the required output format: the template's structure filled in, nothing else appended.
5. **Call `gpt-6-astra` once.** In an eval kernel:

   ```js
   const handle = completion(`...verified context packet and bounded PR-description request...`, {
     model: "gpt-6-astra",
     system: "Use only the supplied evidence. Reproduce the given template structure exactly. Do not invent facts, statuses, or checklist results. Be concise and human-readable.",
   });
   const result = await handle.wait();
   ```

   Python is equivalent: `completion(prompt, model="gpt-6-astra", system=...)`, followed by `handle.wait()`.
6. **Run the personal style pass.** Write the packet from step 4 to a context file and the drafted description to a draft file, then shell out to `styleguard --mode grounded --in <draft file> --context <verified packet file> --out <styled draft>` (see `bin/styleguard/README.md`) in the primary session. Passing the same verified-facts packet as `--context` keeps the rewrite pass from drifting off checklist/template facts while it detect-scores the draft against Winston AI, rewrites any low-scoring sentences, and enforces the hard style rules (no em/en-dash, contractions expanded, no stacked punctuation). Use `<styled draft>`'s contents for the next step. The run log (`--log-dir`) is for a human to `tail` manually — never read it into this conversation or treat it as content.
7. **Adjudicate the result.** Treat the response as a draft. Structurally compare it against the discovered template: every heading and checkbox line must match in text and order, with only deliberate `[ ]` → `[x]` changes backed by real evidence from step 3–4. Reject and re-tighten anything that drifted from the template or restates unverified claims.
8. **Act locally.** Apply the finished description through the repository's own platform CLI (`gh pr edit --body`, `glab mr update --description`, `az repos pr update --description`, etc.), matched to whichever host the repo targets. Write long/markdown-heavy content to a temp file first and pass it via the file (e.g. `--description "$(cat file)"`) rather than inlining it in a shell string — this avoids quoting/backtick mangling and silent truncation.
9. **Validate independently.** Re-fetch the applied description. Confirm the stored byte length matches what was sent (catches truncation/mangling), and re-run the structural template diff (heading/checkbox line-for-line match) before reporting done. A locally-drafted description is not "applied" until this re-fetch confirms it.
10. **Report precisely.** State what `gpt-6-astra` contributed, the styleguard result (score/iterations or skip reason), what template was found (or that none was), what was applied, the exact command used, and the validation result.

## Writing style (non-negotiable)

- **Brief.** Use the fewest words that fully convey the change. No filler, no marketing language, no repeated boilerplate.
- **Sufficient, not redundant.** Cover what changed and why. Do not restate file counts, line counts, insertion/deletion stats, or individual file paths — those are already visible in the diff/Files view. Do not re-list every linked issue/work-item ID in prose if they are already linked on the PR/MR itself.
- **Spot on.** Every sentence or bullet must trace to a fact in the assembled packet. No speculation, no invented rationale, no filled-in guesses about testing/security/CI state.
- **Human-readable.** Plain prose, active voice. Never produce one dense paragraph stuffed with inline-code file paths — that reads as noise, not a description.
- **Bullet-list when multi-scope.** If the change touches several independent areas/modules/concerns, use a short bullet list (roughly 4–8 bullets, one line each) instead of a paragraph. If the change is a single narrow scope, 1–3 plain sentences are enough — do not force bullets on a trivial change.
- **Checklists stay honest.** Never check a box without concrete, independently verified evidence (an actual CLI/API query). Leave anything unverifiable unchecked rather than assuming a passing state.

## Failure handling

- **Missing evidence:** do not call; gather the missing diff, template, or work-item/CI fact first.
- **No template found:** state that explicitly in the packet and in the final report; do not fabricate one.
- **Ambiguous response:** resolve from the repository/platform, then make one corrected call only if a separate writing pass remains useful.
- **Validation failure (structural drift or truncation):** fix locally and re-apply; do not report success until the re-fetch confirms an exact structural match.
- **Tool-dependent task:** use the primary agent instead. A `gpt-6-astra` completion cannot operate tools or query the platform.
- **Completion failure (e.g. unsupported model alias in this environment):** diagnose before retrying; fall back to the primary agent's own best available completion tier, preserving the one-bounded-unit limit, and note the substitution in the final report.

## Cost and scope controls

- Default to one `gpt-6-astra` call for one PR/MR description.
- Never fan out speculative completions across multiple candidate drafts.
- Keep the context packet compact and evidence-first — summarized change scope, not a raw diff dump.
- Do not delegate git/platform side effects (pushing, merging, editing checklists based on guesses) or final acceptance.
- Do not mark checklist items complete, merge, or set required reviewers unless explicitly asked and independently verified.
