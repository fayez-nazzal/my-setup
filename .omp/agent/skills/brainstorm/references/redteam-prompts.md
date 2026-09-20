# Challenge a costly design

Use when being wrong is expensive: irreversible migrations, sensitive information, money, public contracts, or coupled subsystems. Do not turn every brainstorm into a review pipeline.

## First, review it yourself

Take one pass from three perspectives:

- **User:** Does this solve the actual problem, including the constraints and non-goals?
- **Implementer:** Which missing decision would I be forced to invent?
- **Operator or affected person:** What plausible failure would be hardest to recover from?

Fix contradictions and ordinary omissions directly. Ask the user only about genuine tradeoffs.

## Independent review when it earns its cost

If two substantial, independent questions remain, use one `task` batch. Otherwise work inline. Keep the conversation and final decisions with the main agent. Do not delegate the user interview.

Provide the approved scope, assumptions, and the actual draft path or artifact URI. Do not invent a dated filename or copy a long draft into each task. Every task is read-only and must skip formatters, linters, builds, and tests.

Use the runtime's `# Goal / # Constraints / # Contract` shared context and `# Target / # Change / # Acceptance` task format. Appropriate independent slices:

1. **Intent and consistency — `reviewer`.** Compare the draft against the user's stated outcome and decisions. Find contradictions, unjustified scope, ambiguous contracts, or acceptance examples that cannot establish the goals. Return the affected section, evidence, user consequence, and smallest correction.
2. **Feasibility — `scout`.** Only when a relevant project exists: verify named integration points and current project constraints against the draft. Return supported, contradicted, or unknown claims with file/line evidence. Do not turn “not found” into proof of impossibility.
3. **Failure and recovery — `reviewer`.** For a sufficiently distinct risk surface: identify plausible harmful failures absent from the late edge review. Respect explicit scope; flag an exclusion only if it invalidates a promised guarantee or necessary safeguard. Return trigger, impact, and proposed decision.

Choose only the slices justified by the design; do not spawn all three by ritual. No quota of findings, no “find at least two issues”, and no unsupported claim that the design is proven safe.

## Reconcile before involving the user

For each grounded finding: fix an ordinary defect, reject it with a reason, or turn an unresolved user tradeoff into a focused `ask` question. A reviewer's preference is not the user's requirement. Duplicate findings collapse to one decision.

Do not forward raw review dumps. Show what changed and the remaining decision, if any. Revisit approval if a finding materially changes the brief the user already saw.
