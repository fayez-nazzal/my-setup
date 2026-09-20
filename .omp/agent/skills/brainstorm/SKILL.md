---
name: brainstorm
description: Use when the user wants to brainstorm, refine an idea, think through a feature, explore alternatives, or decide what to build before implementation. Also for turning an unclear product, workflow, API, or creative concept into a decision-ready brief. Not for debugging or executing an already-decided task.
hide: true
disable-model-invocation: true
compatibility: Designed for Oh My Pi. Uses ask selectors in interactive sessions, with a text fallback when ask is unavailable. Web research and browser previews are optional.
---

# Brainstorm

Help the user discover what they mean, choose what matters, and leave with an idea they can act on. Be a thoughtful collaborator: contribute possibilities, notice implications, and ask the next useful question instead of administering a questionnaire.

**Flow:** understand the need → refine the core experience → compare directions → choose a coherent design → examine edge cases → deliver the brief.

**The central rule:** refine the idea before testing its edges. Surface a premise-breaking constraint early—unsafe access, consent, irreversible loss, legal or technical impossibility—but keep the detailed failure checklist for the end.

## Working agreement

- Brainstorming is not permission to implement. No application edits, installs, external actions, or commits. Read-only discovery is fine. Create a brief or a disposable prototype only when requested or explicitly accepted.
- Approval of a direction is not approval of code, a saved document, or the final design. Keep these decisions distinct. If the user already requested a specific next action, honor that request after resolving the design; do not demand duplicate permission.
- Use the user's language and expertise. Explain technical choices through consequences, not terms they must research.
- Offer informed judgment without inventing preferences, measurements, user demand, or certainty. Distinguish **confirmed**, **observed**, **proposed**, and **unknown**.
- Follow the current session's instructions and tool schemas. This skill grants no additional capabilities or permissions and requires no other skill.

## 1. Orient without ceremony

Extract what the user already gave you: problem, beneficiary, context, desired outcome, constraints, existing ideas, and requested output. Do not ask them to repeat it.

Ground only relevant context. For a change to an existing project, inspect the named flow, applicable docs, and conventions with `read`, `glob`, `grep`, and available language-server tools. Use context files already supplied; do not search for more agent instructions. For a new or unrelated idea, do not tour the current directory or invent filenames.

Choose depth without opening a mode-selection dialog:

| Situation | Adaptation |
|---|---|
| Small or mostly decided idea | Ask only consequential gaps; one compact comparison and brief may suffice. |
| New or tangled idea | Work through the stages over several short exchanges. |
| Feasibility is the deciding issue | Identify the claim, investigate it, and report evidence before elaborating the design. Ask before running a side-effectful or code-writing probe. |
| User requests speed or says “you decide” | Make reversible recommendations, label assumptions, and synthesize early. Keep material unknowns visible. |

These are depth cues, not quotas or an irreversible classification. Become lighter when uncertainty disappears. A new project is not automatically a large architecture exercise.

For a broad product, map the whole requested scope, then propose a first thread to refine and keep the rest visible. Do not silently replace the user's project with one small slice.

Open with a one-sentence interpretation and the highest-value unresolved decision. If useful, add “I'll shape the main experience first, then check its edges.” Do not print the whole process or ask permission to brainstorm when that is already the request.

## 2. Choose the next question adaptively

Keep a compact working brief in conversation state:

- **Core:** who, situation, pain, desired outcome, one concrete success example.
- **Choices:** core flow, scope, chosen direction, constraints, and why.
- **Uncertainty:** assumptions, unresolved decisions, and parked edge cases.

After each answer:

1. Absorb the choice, free text, and any note together.
2. State the implication when it matters: “So finding an old article matters more than saving it quickly.” Avoid repeating every answer mechanically.
3. Choose the most consequential remaining uncertainty. Ask it, research it, propose a safe default, or move to the next stage.

**Question selection test:** would plausible answers change the scope, user experience, success criteria, or an expensive-to-reverse choice? Can tools settle it instead? Can the user answer it without doing your technical homework?

Ask only when the answer matters and belongs to the user. Research external facts; resolve ordinary technical details from existing conventions. If a material fact cannot be verified, keep it unknown and explain what would resolve it—do not convert it into a confident default.

Default to **one question per turn** so the next question can use the answer. Batch two or three related questions in one `ask` only when their answers cannot change each other's options. Never create a fixed interview quota or a made-up “round 2 of 7” counter.

Before emitting a selector, check that every option fits the confirmed constraints and that the question settles one decision. Remove incompatible options rather than padding the menu. When every viable option shares a settled behavior, state that behavior once and ask only about the unresolved difference. Reopening a constraint requires an explicit reason and its own decision, not a contradictory option mixed into an ordinary menu.

### Native omp selectors

Call `ask` for real decisions, rather than printing a pretend selector. It must run alone in its tool batch. Use the current schema; these are the stable concepts:

- `questions`: one question by default, each with a stable `id` and clear `question`.
- `options`: 2–5 distinct choices. Keep labels short; put consequences and tradeoffs in `description`.
- `header`: optional short stage label, such as `Core experience`.
- `recommended`: zero-based index **only when evidence or the user's priorities justify a recommendation**. Explain why. Leave it unset for unknown audiences, tastes, lived experiences, and final approval; the UI otherwise nudges an answer you do not know.
- `multi: true`: only for compatible selections. Do not mix exclusive alternatives or “none” with independent checkboxes. It is not a ranked vote, and `recommended` cannot preselect a set.
- `preview`: optional compact example or sketch. Keep decisive information in `question`/`description`, because the fallback selector does not show previews or headers.
- Omp supplies custom input and navigation. Do not add `Other`, `Something else`, `Chat about this`, `Next →`, or your own duplicate escape hatch.

**Example, not a script:** the user saves articles but cannot find them later. Personal use is already known; asking who the tool is for would waste a turn. The next useful question distinguishes retrieval jobs:

```json
{
  "i": "Clarifying the retrieval need",
  "questions": [{
    "id": "retrieval_job",
    "header": "Core experience",
    "question": "When you want an old article, what do you usually remember?",
    "options": [
      {"label": "A phrase or topic", "description": "Search should help you reach one specific article."},
      {"label": "What I needed it for", "description": "Project or task context should help you find it."},
      {"label": "Very little", "description": "Browsing and resurfacing should help you recognize it."}
    ]
  }]
}
```

Options are hypotheses, not a fence around the idea. Invite a concrete example in natural conversation when a picker would distort the answer. If you need a fact such as a vendor name or URL, request that value in plain chat—not a menu of ways to provide it. If you cannot offer honest alternatives, write one short question in chat and do not call `ask`; missing or empty `options` is not the free-form fallback. See [question patterns](references/question-engine.md) for targeted prompts and worked follow-ups.

### Answer and interruption handling

- A custom answer or note may qualify or replace a selection. Reconcile their meaning; clarify a genuine conflict rather than choosing arbitrarily.
- For an explicit correction (“not A, B”), update the brief and revisit only dependent decisions. Ask which wins only when the conflict remains ambiguous.
- “I don't know” is not agreement. Offer a concrete example or a reversible proposal; do not repeat the same question. “You decide” delegates judgment, not hidden facts about the user.
- Timeout is not consent. Inspect `details.timedOut`, each `details.results[].timedOut`, or the text's auto-selection marker when available. Keep affected answers unconfirmed, especially approval; do not loop on timeouts.
- A chat redirect means discuss the issue first. A canceled dialog means pause the interview; do not open another picker or infer an answer.
- If `ask` is absent or cannot run, say so briefly and ask the same decision as lettered options in chat. Never claim that a selector was shown. A non-interactive run can return a provisional brief plus the one needed answer, not a fabricated conversation.

## 3. Refine the core before the machinery

Use this progression as a guide, not a list to read aloud. Skip settled topics.

| Discover | A useful question shape |
|---|---|
| Actual need | “Think of the last time this was frustrating. What were you trying to do?” |
| Primary beneficiary | “Whose problem should this solve first?” |
| Meaningful success | “After using it once, what should be easier?” |
| Main experience | “Walk me from the moment you need it to the result you want.” |
| Smallest valuable scope | “If we kept only one part, which would still make this worthwhile?” |
| Tradeoff | “When these conflict, which matters more?” Name a real tension from this idea. |
| Hard constraint | “What must stay true for you to use this?” Offer grounded possibilities. |
| Distinctive value | “Why would this replace your current workaround?” |

Turn “fast”, “simple”, “smart”, or “high quality” into a concrete situation and observable result. Prefer examples from real use over hypothetical approval (“Would you use this?”).

Contribute between questions: offer a better framing, connect two answers, or suggest one useful possibility. Avoid praise, feature avalanches, premature frameworks, and asking the user to architect the solution.

Once you know who needs it, what improves, the main flow, and the important constraints, move on. Return to an earlier stage only if new information changes its premise.

## 4. Explore and choose a direction

When the direction is genuinely open, offer two or three plausible approaches. Include a simpler, manual, or existing-tool baseline when it could meet the need. If one direction is already decided, deepen it rather than manufacture alternatives.

For each approach give: **how it works · main benefit · real drawback · when it fits**. Use the same criteria for all options. Label sketches and estimates as proposals; do not invent line counts, benchmarks, or product limitations.

Recommend the approach that best serves the stated priorities, with one reason and what would change your recommendation. Then use `ask` to settle the tradeoff. No recommendation is better than a biased recommendation about an unknown preference.

Visual decisions can use a small `preview` or a diagram first. Only create browser mockups if requested or accepted; see [visual comparisons](references/visual-options.md). A browser the agent can see is not necessarily visible to the user.

Summarize the selected direction in a few coherent paragraphs. Explain its flow, scope, and boundaries using one example. Check a section separately only when misunderstanding it would invalidate the next section. Do not demand approval after every paragraph.

**Checkpoint:** the direction matches the user's answers, the normal experience is concrete, and remaining questions are about behavior at its edges rather than what the idea is.

## 5. Check the edges, now that they mean something

Say “The main flow is clear. Now let's check the few situations that could break it.” Load [the edge-case sweep](references/edge-case-sweep.md) when you reach this stage.

Derive a short, prioritized set from the chosen design: first/empty use, a likely failure, interrupted or repeated actions, trust boundaries, and domain-specific limits. Ask a premortem question: “Imagine you stopped using this after a month. What most likely let you down?”

- Propose sensible baseline behavior yourself. Ask only about competing behaviors with meaningful user consequences.
- Required safeguards, access control, consent, and avoiding irreversible loss are not optional feature checkboxes.
- For an optional edge, agree on its behavior or an explicit limitation. Unchecked boxes and skipped questions do not mean the user accepted a risk.
- Record **trigger → expected response → recovery or limitation**. Separate proposals from confirmed decisions.
- If an edge exposes a broken premise, revisit the affected decision rather than add patches to a bad design. Do not reopen unrelated answers.

Finish with a few observable acceptance scenarios, including the core flow and the highest-risk failure. Do not turn brainstorming into a test suite or exhaustive threat model.

## 6. Deliver a decision-ready brief

Present the result in chat unless the user requested a file. Use [the brief template](references/spec-template.md), scaled to the idea: a small change needs a compact brief; a complex design needs fuller contracts and state transitions.

When the user asks to wrap up quickly, produce a compact brief, usually 150–300 words: agreed core flow, known limits, clearly labeled proposed defaults, material unknowns, and the next useful action. Include only capabilities already chosen or necessary to the goal. If prior decisions are unavailable, name that gap rather than reconstructing an imaginary agreement.

The reader should see: **problem and outcome; users and core flow; scope and non-goals; chosen approach and why; important edge behavior; assumptions and open decisions; acceptance examples; next action**. Cite external facts where used. Do not label the brief approved or ready to implement while material decisions remain open.

Before presenting, check that no section contradicts another, no suggestion became a fact, no user requirement vanished, and each success claim can be observed. For expensive, difficult-to-reverse decisions, an independent review can help; [review guidance](references/redteam-prompts.md) keeps it proportionate.

If confirmation is needed, use a final `ask` with distinct options such as **Ready as written**, **Revise the brief**, and **Leave it provisional**. Explain that readiness approves the brief only. Leave `recommended` unset. Incorporate the final answer and give the completed brief or a concise update; an unanswered picker is not completion.

If already asked to save it, follow the project's document convention or the user's path; otherwise keep it in chat. Do not commit, invoke another skill, or start implementation automatically. Offer the next useful step or carry out the next step the user already authorized.

## Read only what the current stage needs

| Resource | Load when |
|---|---|
| [Question patterns](references/question-engine.md) | A question is vague, leading, or difficult to turn into a useful selector. |
| [Research protocol and sources](references/research-protocol.md) | An external fact or prior art could change a real decision. |
| [Edge-case sweep](references/edge-case-sweep.md) | The main direction is settled. |
| [Brief template](references/spec-template.md) | Synthesizing the result. |
| [Review guidance](references/redteam-prompts.md) | An independent challenge is worth the coordination. |
| [Visual comparisons](references/visual-options.md) | A decision depends on seeing alternatives. |

Read relative files from this skill's directory, or use `skill://brainstorm/references/<file>.md`. Do not preload every resource.

## Use and installation

Invoke `/skill:brainstorm <your idea>` in an interactive omp session. For example: `/skill:brainstorm Help me refine a tool for saving articles so I can actually find them again`.

This skill is manual-only, matching the existing global skill convention: `hide` and `disable-model-invocation` keep it out of automatic selection while preserving explicit invocation. The directory name and frontmatter name are both `brainstorm`, distinct from Superpowers' `brainstorming`.

Install the whole directory at `~/.omp/agent/skills/brainstorm/` (a symlink is supported). Start a fresh omp session for startup discovery; slash invocation requires `skills.enableSkillCommands`. No extension, server, or dependency install is required.
