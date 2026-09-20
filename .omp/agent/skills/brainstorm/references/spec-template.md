# Decision-ready brief

Use the sections that serve this idea, not a blank form to fill mechanically. For a small change, combine related sections into a few paragraphs. For a complex design, add the contracts and state transitions someone would otherwise have to invent.

## Content, in order

1. **Problem and outcome.** Who has the problem, in which situation, and what observable improvement matters. Keep the need distinct from the proposed solution.
2. **Core experience.** One concrete path from the user's starting situation to the useful result. For non-software work, describe the real activity or handoff.
3. **Scope and non-goals.** What is included, what is intentionally excluded, and why. Retain every requirement the user named or show its explicit disposition.
4. **Chosen direction.** How it works, why it fits the priorities, and why serious alternatives were rejected. For software, state only the interfaces, data ownership, persistence, and integration boundaries needed to make this buildable.
5. **Important edge behavior.** Trigger, user-visible response, and recovery or limitation. Identify confirmed behavior separately from proposed defaults. Do not hide unresolved harm under a generic “later”.
6. **Decisions and assumptions.** Record consequential choices with reasons, not a transcript. Separate user-confirmed choices, observed facts, assistant proposals, and unknowns.
7. **Acceptance examples.** The main success scenario and important failure/boundary scenarios with observable outcomes. Describe how to check them; do not claim a design document is tested implementation.
8. **Remaining decisions.** Only material unknowns, the decision they block, and the evidence or person needed to resolve them. Say “None” only if true.
9. **Next action.** The smallest useful validation, design revision, plan, or implementation step. Distinguish a suggestion from already-authorized work.

Cite external evidence alongside the load-bearing claims or in a short sources section. Date facts that may drift. Avoid an unrelated research appendix.

## State is explicit

- **Provisional:** material choices or evidence are still missing.
- **Draft for review:** coherent and ready for the user to inspect, but not approved.
- **Approved brief:** the user explicitly approved this version after seeing the important edge behavior and assumptions.

An approved direction from an earlier stage does not make the final brief approved. A timeout, cancellation, or silence cannot approve it. Approval also does not establish market demand, technical feasibility not investigated, or permission to implement.

When final confirmation is needed, use a neutral selector: **Ready as written**, **Revise the brief**, **Leave it provisional**. Describe that readiness approves the brief only; leave the default recommendation unset. After the user answers, apply changes or update status and give a clear completed result.

## If the user asks for a file

Follow the supplied path or existing project convention. If neither exists, propose or use a clearly named project-relative design file appropriate to the request, and report its actual path. Saving must already be requested or accepted; otherwise deliver in chat. `local://` is an internal artifact locator, not a promise of a user-managed project file.

Do not label a draft approved in its header. Do not create a speculative project tree, run a commit, or invoke a planning skill just because the design is long. A user request to save is not a request to publish or commit.

## Final quality pass

- Does the normal flow actually produce the desired outcome?
- Do the scope, chosen approach, interfaces, and edge behavior agree?
- Did any suggestion quietly become a user requirement or verified fact?
- Did every named user requirement survive, or get explicitly excluded by the user?
- Are claims such as “simple”, “fast”, and “reliable” tied to observable situations?
- Are unresolved questions visible instead of filled with invented answers?
- Could someone act on this without guessing a load-bearing decision?

Fix defects before presenting. If a material unknown remains, a clearly provisional brief is the honest deliverable—not a forced approval or a confident placeholder.
