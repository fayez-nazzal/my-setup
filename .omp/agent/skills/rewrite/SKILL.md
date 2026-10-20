---
name: rewrite
description: Use when a bounded writing task (doc section, PR text, message, plain-language rewrite) should be drafted by Gemini 4 Argon after the primary agent has gathered and verified the facts.
---

# Rewrite

Send a focused writing job to Gemini 4 Argon with one inline script call. You keep the research, the decisions, and the final check.

The call runs `omp -p` in print mode with no tools, no session, no skills, and no rules, so the model sees only your brief. The brief has to stand on its own.

## When to use it

Use it when the job is clear, the output is concrete (a PR description, a doc section, a message, a plain-language rewrite), and you already know the facts. For small edits, write it yourself.

## How to use it

1. **Gather the facts first.** Read the code, the diff, and any errors or test results you need. Don't send guesses.
2. **Write the brief to a file.** Say what to write, who it's for, the tone, and the format to return. Add the facts that matter: file paths, short excerpts, observed results. For a rewrite, include the full source text and the rules for what must stay unchanged.
3. **Call the script once, inline from Eval** (no subagent):

   ```js
   const brief = `...your brief...`;
   await Bun.write("/tmp/rewrite-brief.md", brief);
   const run = await Bun.$`bun ${"/Users/fayez/.omp/agent/skills/rewrite/scripts/rewrite.ts"} /tmp/rewrite-brief.md /tmp/rewrite-draft.md`.nothrow();
   if (run.exitCode !== 0) throw new Error(run.stderr.toString());
   display(run.stderr.toString()); // "model: openrouter/google/gemini-4-argon"
   const draft = await Bun.file("/tmp/rewrite-draft.md").text();
   ```

   The script uses `openrouter/google/gemini-4-argon` with high thinking, the same model as the `writer` role in `config.yml`. It exits non-zero, with the reason on stderr, if `omp` fails, the reply is empty, or a different model answered.
4. **Review the draft.** Treat it as a draft. Check every path, name, number, and claim against the source, and fix the tone yourself if needed. For rewrites, diff the facts (URLs, code spans, numbers, `[INFERENCE]` markers, diagrams) against the original.
5. **Apply it and verify.** Make the change yourself and run the real checks. The draft is never proof that something works. Delete the temporary brief and draft files.

## If something goes wrong

- `No API key found for openrouter`: the key comes from 1Password (`models.yml`, provider `openrouter`). Sign in to the 1Password CLI (`op signin`) and retry.
- Missing facts: find them before calling.
- Unclear draft: clarify from the source, then call again only if a second pass would help.
- The task needs tools: do it yourself.

Commits, pushes, and anything with side effects stay with you.
