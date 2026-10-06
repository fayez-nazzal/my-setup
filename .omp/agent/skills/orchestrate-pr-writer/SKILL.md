---
name: orchestrate-pr-writer
description: Use when preparing a pull request description after the primary agent has verified the change, discovered the repository's pull request template, and gathered test and review facts.
---

# Orchestrate PR Writer

Use the primary agent for repository access, implementation, platform actions, and verification. Use one `writer` task agent for a bounded pull request description after the primary agent has gathered and checked all supporting facts.

## Capability boundary

The `writer` agent has no repository or platform tools. It can only draft from the context packet provided by the primary agent. The primary agent owns discovery, template verification, PR creation or updates, and every final claim.

Do not use this skill for a trivial description that the primary agent can write directly.

## Workflow

1. **Find the repository template first.** Search the invoked repository for pull request templates, starting at the root and common platform folders such as `.github/`, `.gitlab/`, and `.azuredevops/`. Read any matching template files. If multiple templates exist, select the one the repository or hosting platform actually uses for this PR; record how it was identified.
2. **Keep the template exact.** When a template exists, preserve every heading, section, checkbox, and their order and wording. Fill in its sections without adding, removing, renaming, or reordering them. Change a checkbox only when the primary agent has verified its claim. Leave unverified boxes unchecked. Never append an extra section outside the template. If no template exists, state that in the packet and use a short structure with `Summary`, `Changes`, and `Testing` headings.
3. **Gather verified facts.** The primary agent inspects the actual change against its target branch and supplies a compact packet containing:
   - the complete template text, copied exactly, or confirmation that none exists;
   - the PR title, repository, source and target branches, and linked work item when known;
   - the change's purpose and user-visible behavior;
   - exact checks run and their observed results;
   - checks not run, environmental limits, and unresolved risks;
   - evidence for each proposed checked box.
4. **Call `writer` once.** In an eval kernel, dispatch through `agent()` and select `writer`:

   ```js
   const handle = await agent(`Draft the pull request description using only this verified packet. Follow the supplied template exactly. Write for human reviewers in plain language. Do not invent facts or checklists.\n\n${packet}`, {
     agent: "writer",
   });
   const result = await handle.wait();
   display(result);
   ```

   Python equivalent: `handle = await agent(prompt, agent="writer")`, then `result = await handle.wait()`.
5. **Review locally.** Treat the draft as a proposal. Compare it line by line with the template. Keep all template headings and checkbox wording exactly as supplied and in the same order. Confirm every claim against the packet and remove jargon, vague claims, excessive punctuation, and repeated detail. Use short, clear sections and bullets when they improve readability. Do not add claims about security, tests, or compliance without evidence.
6. **Return the draft.** Give the primary agent only the completed description and a short note identifying the template used or that none was found. The primary agent applies it through the repository's PR tooling and verifies the final stored description. This skill does not create or update the PR itself.

## Writing style

- Write for a person reviewing the change. Use familiar words, short sentences, and active voice.
- State what changed and why. Organize separate areas into a few clear bullets.
- Avoid internal shorthand, unexplained abbreviations, implementation jargon, marketing language, and dense paragraphs.
- Use normal punctuation. Avoid repeated exclamation marks, stacked punctuation, and unnecessary parentheses.
- Include exact check results and honest limits. Never turn an unrun check into a pass.
- Do not repeat file lists, line counts, or facts already visible in the PR unless the template asks for them.

## Failure handling

- If the template has not been inspected, gather it before calling the writer.
- If the packet omits a fact needed to fill a section, ask the primary agent to verify that fact; do not guess. Keep the section and mark its status accurately.
- If a draft changes the template structure or wording, correct it locally before returning it.
- If no template exists, use only the stated short fallback structure and report that no template was found.
- If the writer agent is unavailable, the primary agent writes the description using the same template and evidence rules. Do not abandon PR preparation.

## Scope controls

- Use one writer call for one PR description.
- Keep the packet focused. Do not send a raw diff when a verified summary is sufficient.
- Do not ask the writer to inspect files, run checks, make platform changes, or decide what is safe to claim.
- Never let the writer's draft substitute for independent template, fact, or final-description verification.
