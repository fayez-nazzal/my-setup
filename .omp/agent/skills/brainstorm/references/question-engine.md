# Questions that move the idea forward

Use these as lenses, not a questionnaire. Keep the user's words and circumstances in each question. The main skill defines the interaction contract.

## Pick the uncertainty before writing the question

| The conversation is missing… | Ask about… | Why it helps |
|---|---|---|
| A real problem | The most recent frustrating moment | Separates actual behavior from imagined demand. |
| A priority | The one improvement that would make this worthwhile | Exposes the core rather than collecting features. |
| A clear experience | A concrete start-to-finish example | Makes missing steps visible without architecture jargon. |
| A scope boundary | What can stay manual or be omitted without losing value | Finds a smaller complete solution. |
| A meaningful difference | Why the current workaround stops being good enough | Tests whether building something new is justified. |
| An expensive tradeoff | Which cost is acceptable when two goals conflict | Makes preferences actionable. |
| A way to choose | What evidence would make the user reject a direction | Challenges enthusiasm without being adversarial. |
| Confidence in adoption | What would cause someone to abandon it after a month | Connects the late edge review to real disappointment. |

Before asking, answer privately: **What decision will this settle? What changes under each answer? Why can't I settle it from context?** If nothing changes, remove the question.

## Write options the user can reason about

- Use two to five comparable, distinct options. Three is often enough; do not pad to a count.
- A label names the choice. Its description names the cost or consequence.
- Keep alternatives fair: no “simple and reliable” versus “complicated and fragile” framing.
- Match the decision axis. “Fast”, “private”, and “blue” are not alternatives to one question.
- Distinguish a fact question from advice. You can recommend a storage approach from known requirements, not which audience the user secretly has.
- Prefer “Usually under 20 items / hundreds / thousands” to a made-up exact capacity target. Label such ranges as discovery aids, not performance promises.
- Do not infer “personal” means no security, “team” means no onboarding, or “public” automatically means accounts.
- Leave room for custom input. Omp provides it; you do not need an `Other` option.
- Keep decided behavior outside the menu. If one-click saving and sorting later are settled, use an inbox as the working baseline and ask only how repeated saves should behave. Requiring a project at save time is no longer an honest alternative.

## Worked follow-up: stay with the user's answer

**Known:** a personal article library; the problem is retrieval, not capture.

**Previous question:** “When you want an old article, what do you usually remember?”

**Answer:** “What I needed it for. I collect research for several projects.”

**Useful continuation:** “That suggests organizing by the work you were doing, rather than guessing tags. Let's choose where that organization happens.”

```json
{
  "i": "Choosing when to organize",
  "questions": [{
    "id": "organization_moment",
    "header": "Main flow",
    "question": "When would choosing a project feel least annoying?",
    "options": [
      {"label": "When I save", "description": "One extra choice up front; articles are already grouped when you need them."},
      {"label": "When I revisit", "description": "Saving stays quick; some articles remain unorganized until you use them."},
      {"label": "Use my current project", "description": "Fewer repeated choices; you need a clear way to notice and change the active project."}
    ]
  }]
}
```

There is no recommendation because tolerance for organization is still unknown. After the user says “Saving must be one click; I'm happy to sort later”, recommend organizing on revisit and explain the fit. Do not ask the same decision again.

**Wrong continuation:** “What database do you want?” The missing information concerns the experience, not a technical component.

## Worked tradeoff: recommend when grounded

**Known:** the user only needs to collect and search articles on one laptop; they explicitly want no accounts or remote storage.

**Useful continuation:** recommend a local library as the working direction, explain that it cannot sync across devices, and proceed to the normal workflow. Do not offer cloud hosting merely to fill a comparison table. If cross-device access later becomes essential, reopen storage because the constraint changed.

When there are genuinely two viable approaches, show what each enables and gives up before calling `ask`. Do not make the user choose an acronym without those consequences.

## Multi-select: compatible scope, not approval by omission

**Known:** manually saved articles, local-only, one user. Several ways of finding an article could coexist, but supporting all is not necessary.

```json
{
  "i": "Choosing retrieval surfaces",
  "questions": [{
    "id": "retrieval_surfaces",
    "header": "Initial scope",
    "question": "Which ways of finding an article belong in the initial version?",
    "multi": true,
    "options": [
      {"label": "Search by phrase", "description": "Find a known article from words you remember."},
      {"label": "Browse by project", "description": "See articles related to the work you are doing."},
      {"label": "Recently saved", "description": "Retrace what you collected most recently."}
    ]
  }]
}
```

Summarize the proposed scope afterward so omissions can be corrected. Do not combine checkboxes with “all”, “none”, priority ranking, or mutually exclusive architectures. A `recommended` index cannot express several preselected choices.

## Recognize when the picker is the wrong shape

A request for a lived example is not always a list-selection task. Ask “What happened the last time you lost an article?” in plain chat if the answer space is unknown. Then use the answer to build an informed selector. Native selectors are the default for meaningful choices, not a reason to invent categories.

A missing concrete value needs a direct question, not a menu of input methods. For example, ask “Which vendor are we checking?” rather than “Vendor name / Documentation URL / I don't know”. Once you know the vendor, verify what tools can answer before asking again.

If the user says “I don't know”, reduce abstraction: show two tiny examples and name what differs, or offer a reversible proposal. If they say “I'm tired; just choose”, synthesize the best supported design and mark the remaining assumptions. Do not respond with another full form.

## Handling omp results accurately

A single-question result may expose `selectedOptions`, `customInput`, `note`, and `timedOut` under `details`. A multi-question result puts these under each entry in `details.results`. Some callers see only formatted text; use any auto-selection marker or note available there and do not claim access to hidden fields.

- A note qualifies the selection; custom input can replace it. Resolve the meaning, not the bucket label.
- A timed-out recommendation is still unanswered. Reconfirm a consequential decision when interaction resumes, or keep it provisional.
- Discuss a chat redirect before rephrasing the question.
- Pause on cancellation. No immediate replacement form.
- If `ask` is unavailable, provide the same choice in chat, for example `A. Organize when saving` / `B. Organize when revisiting`, and invite a letter or custom answer. Do not claim interactive UI appeared.
