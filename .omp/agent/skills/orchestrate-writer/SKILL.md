---
name: orchestrate-writer
description: Use when a bounded writing task benefits from one writer task-agent pass after the primary agent has gathered and verified repository context.
hide: true
disable-model-invocation: true
---

# Orchestrate Writer

Use the primary agent for repository access, implementation, decisions, and verification. Use one `writer` task agent only for a bounded writing task after the primary agent has assembled a verified context packet.

## Capability boundary

The `writer` agent receives only the supplied prompt and context and has no repository tools. Its `model: "@writer"` setting resolves through `modelRoles.writer` in `~/.omp/agent/config.yml`.
Use OMP's `agent()` helper to dispatch this task agent. `completion()` accepts only the `"smol"`, `"default"`, or `"slow"` tiers; it cannot select the `writer` agent.

Do not use this skill for trivial transformations, facts already established, or work the primary agent can finish directly.

## Decision rule

Delegate only when all of these are true:

- The writing task is bounded and has a concrete output.
- The primary agent has already gathered the relevant evidence.
- The task benefits from a separate writing pass.
- The result can be checked locally before it affects the worktree or delivery.

Keep security decisions, destructive or irreversible operations, external side effects, and final acceptance in the primary session.

## Workflow

1. **Define the unit.** State the objective, audience, non-goals, output format, voice, and success condition. Choose draft, rewrite, structured content, or narrow patch proposal; do not ask for open-ended writing.
2. **Research first.** Inspect the repository, callers, configuration, conventions, source material, failure output, reproduction, and required validation command. Resolve identifiers and URLs. Never send guesses.
3. **Assemble the packet.** Include only verified facts:
   - repository root, branch, and relevant commit or PR facts;
   - exact file paths and line-ranged excerpts;
   - observed behavior, failure, and reproduction output;
   - applicable constraints and conventions;
   - candidate files and symbols;
   - audience, acceptance criteria, and validation command;
   - required response format and tone.
4. **Call `writer` once.** Its model resolves from the agent's `model` frontmatter and configured role mapping; do not assume a fixed provider/model. In an eval kernel:

   ```js
   const handle = await agent(`...verified context packet and bounded writing request...`, {
     agent: "writer",
   });
   const result = await handle.wait();
   display(result);
   ```

   Python equivalent:

   ```python
   handle = await agent("...verified context packet and bounded writing request...", agent="writer")
   result = await handle.wait()
   display(result)
   ```

5. **Review style locally.** Do one concise editorial pass in the primary session against the requested voice and explicit style constraints. Do not run `styleguard`, invoke `completion()`, or make a second writer call for polishing. Keep the draft unchanged when it already meets the constraints.
6. **Adjudicate the result.** Treat the response as a draft or proposal. Re-check every path, symbol, assumption, claim, and command against the repository. Resolve ambiguity from source, not intuition.
7. **Act locally.** Apply the smallest correct change in the primary session. Never paste a proposed commit, push, or success claim without executing it.
8. **Validate independently.** Run the narrow reproduction or acceptance command in the primary session, then the repository-required checks. The `writer` response is never validation evidence.
9. **Report precisely.** State what `writer` contributed, what the primary agent changed, and the exact validation commands and observed outcomes. Mention any local editorial changes.

## Packet quality

Put the writing objective and audience at the top, followed by target symbols, source constraints, and acceptance criteria. Prefer short excerpts over whole files and omit duplicate boilerplate. Include line ranges so proposed edits can be grounded. Do not ask `writer` to repeat searches, explain obvious syntax, or invent missing context.

Request a compact fixed format, for example:

```text
Draft:
Rationale:
Unverified claims:
Validation:
```

If the packet is incomplete, research before calling. Repeated calls are not a substitute for missing evidence.

## Failure handling

- **Missing evidence:** do not call; gather the missing file, symbol, command, or failure.
- **Ambiguous response:** resolve the ambiguity from source, then make one corrected call only if a separate writing pass remains useful.
- **Validation failure:** debug in the primary session first; call again only with the new evidence and a revised bounded question.
- **Tool-dependent task:** use the primary agent or a persistent tool-capable task agent instead. The `writer` agent cannot operate tools.
- **Writer-agent failure:** diagnose the failure before retrying, and preserve the one-bounded-unit limit.

## Cost and scope controls

- Default to one `writer` agent call for one bounded writing unit.
- Never fan out speculative agent calls or run model-based style rewrites.
- Keep the context packet compact and evidence-first to limit token use.
- Do not delegate git side effects or final accountability.
- Do not commit or push unless explicitly requested and local validation is green; verify remote results separately.
