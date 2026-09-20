---
name: orchestrate-slow
description: Use when a task needs deep reasoning from a stateless completion after the primary agent has gathered and verified repository context.
hide: true
disable-model-invocation: true
---

# Orchestrate Slow

Use the primary agent for repository access, implementation, decisions, and verification. Use one `slow` completion only for a bounded reasoning task after the primary agent has assembled a verified context packet.

## Capability boundary

The `completion` API is stateless and has no repository tools. A `slow` completion can reason over supplied evidence and return a diagnosis, design, patch proposal, or review. It cannot read files, edit files, run commands, test code, commit, or push. The primary agent owns every tool action and every final claim.

Do not use this skill for trivial transformations, facts already established, or work the primary agent can finish directly.

## Decision rule

Delegate only when all of these are true:

- The question is bounded and has a concrete output.
- The primary agent has already gathered the relevant evidence.
- The task benefits from deeper independent reasoning.
- The result can be checked locally before it affects the worktree or delivery.

Keep security decisions, destructive or irreversible operations, external side effects, and final acceptance in the primary session.

## Workflow

1. **Define the unit.** State the objective, non-goals, output format, and success condition. Choose diagnosis, design, narrow diff proposal, or review; do not ask for an open-ended investigation.
2. **Research first.** Inspect the repository, callers, configuration, conventions, failure output, reproduction, and required validation command. Resolve identifiers and URLs. Never send guesses.
3. **Assemble the packet.** Include only verified facts:
   - repository root, branch, and relevant commit or PR facts;
   - exact file paths and line-ranged excerpts;
   - observed behavior, failure, and reproduction output;
   - applicable constraints and conventions;
   - candidate files and symbols;
   - acceptance criteria and validation command;
   - required response format.
4. **Call `slow` once.** In an eval kernel:

   ```js
   const handle = completion(`...verified context packet and bounded request...`, {
     model: "slow",
     system: "Use only the supplied evidence. Do not invent facts. Return the requested bounded result.",
   });
   const result = await handle.wait();
   ```

   Python is equivalent: `completion(prompt, model="slow", system=...)`, followed by `handle.wait()`. Add a schema only when structured output materially improves reliability.
5. **Adjudicate the result.** Treat the response as advice. Re-check every path, symbol, assumption, and command against the repository. Resolve ambiguity from source, not intuition.
6. **Act locally.** Apply the smallest correct change in the primary session. Never paste a proposed commit, push, or success claim without executing it.
7. **Validate independently.** Run the narrow reproduction or acceptance command in the primary session, then the repository-required checks. The `slow` response is never validation evidence.
8. **Report precisely.** State what `slow` contributed, what the primary agent changed, exact commands run, and their observed outcomes.

## Packet quality

Put the failure or decision at the top, followed by target symbols, constraints, and acceptance criteria. Prefer short excerpts over whole files and omit duplicate boilerplate. Include line ranges so proposed edits can be grounded. Do not ask `slow` to repeat searches, explain obvious syntax, or invent missing context.

Request a compact fixed format, for example:

```text
Diagnosis:
Change:
Risks:
Validation:
```

If the packet is incomplete, research before calling. Repeated calls are not a substitute for missing evidence.

## Failure handling

- **Missing evidence:** do not call; gather the missing file, symbol, command, or failure.
- **Ambiguous response:** resolve the ambiguity from source, then make one corrected call only if deeper reasoning remains useful.
- **Validation failure:** debug in the primary session first; call again only with the new evidence and a revised bounded question.
- **Tool-dependent task:** use the primary session or a persistent tool-capable task agent instead. A `slow` completion cannot operate tools.
- **Completion failure:** diagnose the failure before retrying, and preserve the one-bounded-unit limit.

## Cost and scope controls

- Default to one `slow` call for one bounded unit.
- Never fan out speculative completions.
- Keep the context packet compact and evidence-first.
- Do not delegate git side effects or final accountability.
- Do not commit or push unless explicitly requested and local validation is green; verify remote results separately.

## PR example

For a failing PR check, the primary agent fetches metadata, changed files, logs, relevant tests, and repository commands. It sends those verified facts plus one narrow fix request to `slow`, applies the advice locally, and independently reruns the failing check and required project gate.

