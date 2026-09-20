# The late edge-case sweep

Start after the user and assistant share a concrete normal experience and direction. This is a focused check of the chosen idea, not a generic catalog of everything software can do wrong.

Detailed edges come late. A premise-breaking privacy, consent, security, feasibility, or irreversible-loss issue comes up as soon as it is visible; it can invalidate the whole direction.

## Derive and prioritize

Walk one normal use through the design:

1. What starts it? Consider first use, empty inputs, unclear intent, and unsupported inputs.
2. What does it depend on? Consider absent data, unavailable people or services, permissions, and misleading information.
3. What changes? Consider interruption, duplicate actions, concurrent actors, cancellation, and reversibility.
4. What does the user see afterward? Consider partial success, recovery, discovery of mistakes, and accessibility.
5. What would make the user stop using it? Run a short premortem based on the goal, not an abstract disaster.

Select the few cases with the greatest likelihood or consequence. Discuss familiar disappointments first, then less common but serious failures. A small personal workflow may need only a handful. A payment or public-data interface needs stronger coverage, not a checkbox allowing safety to be omitted.

## Three dispositions

| Kind | Treatment |
|---|---|
| Baseline correctness or required safeguard | Propose safe behavior and record it. Do not ask whether unauthorized access or irreversible data loss should be allowed. A request to omit a necessary safeguard needs an explicit risk discussion, not silent acceptance. |
| Meaningful product tradeoff | Use `ask` to choose between behaviors and explain the consequence of each. |
| Optional capability or unusual environment | Propose a limitation, state who it affects, and confirm when material. Unchecked or unanswered options are not accepted limitations. |

An existing rule may already settle the response. Reuse it. Do not invent retry layers, lock services, quotas, telemetry, or recovery systems merely because the category exists. Propose only what this idea needs.

## Relevance lenses

| Lens | Concrete prompt to think with |
|---|---|
| First / empty use | Can someone get value before any data, history, or configuration exists? |
| Boundary / unsupported input | What happens just outside the supported size, type, or scope? |
| Duplicate / repeated action | If the user clicks twice or repeats a step, is the result understandable and safe? |
| Interruption / partial completion | What remains if it stops halfway, and what can the user do next? |
| Missing dependency | Can the user distinguish an unavailable service from an empty result? |
| Trust / consent | Who may see or change this, and did they authorize the access? |
| Time / concurrent changes | Can an old result overwrite newer work or cause the wrong action? |
| Accessibility / comprehension | Can the intended users recognize, operate, and recover from each state? |
| Growth / resource constraints | At the expected scale, what could become slow, expensive, or misleading? |
| Change / compatibility | What happens to existing users and data when this changes or is removed? |
| Domain-specific harm | What failure matters here that a generic software checklist would miss? |

For non-software ideas, translate these lenses into people, handoffs, availability, misunderstandings, constraints, and recovery. Do not force every idea into storage or API design.

## Example: a real late-stage tradeoff

**Known:** local article collection, manual saves, no automated external fetching. The user has approved the core flow. A saved link might later stop working.

```json
{
  "i": "Deciding broken link behavior",
  "questions": [{
    "id": "broken_link",
    "header": "Edge cases",
    "question": "If a saved link stops working, what would still make that entry useful?",
    "options": [
      {"label": "Title and my note", "description": "Keep the context and show that the link is unavailable; no extra capture step."},
      {"label": "An excerpt I saved", "description": "Preserve a passage you chose when saving; adds a manual capture step."}
    ]
  }]
}
```

Do not silently turn this into automated scraping, offline full-page copies, or a new online service. If the user proposes those, discuss the changed scope and permissions explicitly.

## Record observable behavior

Use a compact table. Technical mechanisms belong in a design detail only when already chosen; the contract is what a user or consumer observes.

| Trigger | Expected response and recovery | Status |
|---|---|---|
| No articles yet | Show an empty collection and a clear way to save the first article. | Proposed baseline |
| Save the same link twice | Show the existing entry rather than create an indistinguishable duplicate. | Confirmed choice |
| A link is unavailable | Preserve the title and user's note; explain the failed open without removing the entry. | Confirmed choice |
| The user wants another device | Explain that this version is local-only; no sync is promised. | Confirmed limitation |

End with acceptance examples for the main flow and the highest-risk edge. If a serious risk remains unresolved, label the brief provisional and name the decision or evidence needed. Do not call an incomplete design approved just because the normal path is clear.
