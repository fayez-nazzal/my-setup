# Finder angles

Read the preamble, then read only the section for the angle you were assigned. The other sections belong to other agents running in parallel.

## Preamble (every angle)

You are one of eleven finder agents reviewing a frontend diff. Surface up to **8 candidates**. Each candidate is:

- `file` — repo-relative path
- `line` — 1-indexed line in the new file
- `summary` — one sentence stating the defect
- `failure_scenario` — for a correctness bug, concrete inputs or state leading to a wrong output or crash. For a rulebook, cleanup, or altitude finding, the concrete cost instead: what is duplicated, what is wasted, which rule is broken and where it is written.

Two habits decide whether this pass is useful.

**Surface, do not self-censor.** A separate verify pass judges every candidate you return. If you can name a failure scenario, pass it through even when you are only half sure. Finders that quietly drop half-believed candidates skip that judgment entirely and are the dominant cause of missed bugs.

**Read past the hunk.** Open the enclosing function for every hunk you review. A bug on an unchanged line of a touched function is in scope, because the change re-exposes it or fails to fix it.

Correctness bugs outrank rulebook and cleanup findings. When you have more than 8 candidates, keep the 8 that would hurt most.

---

## Angle A — line-by-line diff scan

Read every hunk line by line, then read each enclosing function. For every line ask: what input, state, timing, or platform makes this line wrong?

Look for inverted or wrong conditions, off-by-one, null or undefined deref where adjacent lines show the value can be absent, a missing `await`, a falsy-zero check that swallows a real `0`, wrong-variable copy-paste, and an error swallowed in a `catch` that should propagate.

## Angle B — removed-behavior auditor

For every line the diff **deletes or replaces**, name the invariant or behaviour it enforced, then search the new code for where that invariant is re-established. If you cannot find it, that is a candidate.

Watch for a removed guard, a dropped error path, a validation that narrowed, a `RenderIf` condition that disappeared, a subscription that stopped being read, and a deleted spec that was covering a real case.

## Angle C — cross-file tracer

For each function, command, query, or component the diff changes, Grep for its callers and check whether the change breaks a call site: a new precondition, a changed return shape, a new thrown error, a new ordering dependency.

In this repo the call graph runs through the barrels and through the state layer. Check that a changed uikit component is still used correctly by every app importing it through the barrel, that a changed `createQuery` shape matches every `useSubscribe` reading it, and that a changed `createCommand` payload matches every `app.onCommand` handler and every dispatch site.

## Angle D — language-pitfall specialist

Scan for the classic TypeScript, React, and browser pitfalls the diff introduces: falsy-zero, `==` coercion, a loop variable captured in a closure, array mutation of props or state, `Object.keys` order assumptions, a floating promise, `JSON.parse` on an unvalidated response, an unanchored regex, timezone and DST drift in date-library usage, and `as any` or a non-null `!` hiding a real absence.

React-specific: a `useEffect` with a missing or wrong dependency, an effect that writes state it also reads, a key derived from array index over a reorderable list, and state derived from props that goes stale.

## Angle E — reactive state and data flow

The state layer here is CQRS-based, and its failures are quiet ones. Check the diff against the chain: command → PubSub → store → selector → `useSubscribe` → render.

Look for bidirectional sync between the CQRS state store and another state manager (a form library especially) — the state ownership rule says each slice has one owner, and a sync loop shows up as a re-render storm or a cursor jump in an input, not as an exception. Look for an object or array rebuilt every render and fed into a subscription, defeating the `isEqual` gate. Look for a command dispatched during render rather than on an explicit external event.

For the data-fetching layer: the query state is the single source of truth. Flag a hand-rolled loading or error flag beside a query that already carries one, a `.fetch*()` called from a component, a request body built in the component instead of `model.ts`, and an optimistic update that does not snapshot and roll back on error.

---

## Angle F — architecture and CQRS layering

Read this repo's architecture and convention rule docs (wherever it keeps them — e.g. `.ai/knowledge/review-rules.md`, `.ai/knowledge/cqrs-patterns.md`, `.ai/knowledge/framework-boundaries.md`), then check every changed file against the layer it lives in.

- `**/*repo.ts` — every `createQuery` and `createCommand` has a `description`; queries named `get*`/`is*`/`has*`/`should*`; commands named with action verbs; no side effects at all (no axios, fetch, toast, dialog, navigate).
- `**/service.ts` and `**/service.tsx` — side effects belong here, registered through `app.onCommand()`; handlers hold business logic only, with pure work pushed to `utils.ts` and data shaping to `model.ts`.
- `**/utils/**` and `**/helpers/**` — every function pure: deterministic, no I/O, no global state, no time-based values, no parameter mutation.
- `**/api/**` — thin wrappers only, no business logic and no data transformation.
- the shared state library's own source — never imports app-specific modules, and carries no business vocabulary. Business terms in the state layer are an architecture violation even when the code works.
- Components — presentational only. No data fetching, no state management, no `useMemo`/`useCallback` wrapping computation, no `useEffect` body holding conditions. An unavoidable effect holds a single command dispatch and nothing else.
- No component defined inside another component, and no large JSX block assembled into a local variable. Each visual piece is its own file composed through the barrel.

## Angle G — repo conventions

Read `.coderabbit.yaml` `reviews.path_instructions`, the repo `CLAUDE.md`, `CLAUDE.local.md`, and any `CLAUDE.md` in a directory that is an ancestor of a changed file. Then check the diff for clear violations.

Flag only what you can pin down with two quotes: the exact rule and the exact line that breaks it. No style preferences and no spirit-of-the-doc inferences. Name the file the rule came from so the report can cite it.

Common ones here: a relative import where an alias belongs; a magic string, number, or id inline instead of the module root `constants.ts`; a type declared inline instead of the module root `types.ts`; a per-folder `constants.ts` or `types.ts` (colocation is not allowed); `console.log`; `as any`; a missing `I`/`T`/`E` prefix; a raw value where an enum exists; an equality check written variable-first instead of constant-first; a function call nested inside an `if` condition; an early return or guard clause; a ternary; a multi-line statement that should be split; a code comment; and a data-shaping file named `view-models.ts` or colocated instead of the module root `model.ts`.

## Angle H — accessibility and i18n

Read this repo's accessibility rule doc and the `**/*.tsx` path instructions in `.coderabbit.yaml`.

Accessibility: an interactive element with no accessible name, a click handler on a non-interactive element with no keyboard path, state conveyed by colour alone, a missing or wrong `aria-expanded`/`aria-pressed`/`aria-current`, a focus trap or lost focus after a dialog closes, an icon-only button with no label, a heading level that skips, a table built from divs where a real table element belongs, and a focus ring that does not come from `getFocusVisibleClasses()`.

i18n: any user-facing string not going through `t('key')`, a key missing from the app's `locales/en/common.json`, a key not in dot notation, `useTranslation()` used in a service, or `getI18n()` used in a component.

Conditional rendering: prefer `RenderIf` or `Switch` over `&&` and ternaries in JSX, except inside the shared UI kit's motion/animation wrapper.

## Angle I — test coverage

Read this repo's testing rule doc.

Every pure utility the diff adds or changes needs a spec, and the spec mirrors the source one to one. New specs go under the module root `tests/`: a `utils/` directory maps to `tests/utils/<name>.spec.ts`, a single `utils.ts` maps to `tests/utils.spec.ts`.

The repo still holds older specs colocated beside their source (`utils/css.spec.ts`). Leave those alone — a legacy spec the diff never touched is not a finding. What matters is that a touched utility has updated coverage somewhere, and that anything new follows the `tests/` layout.

Flag a util file whose spec was not updated alongside it, a new spec placed beside its source instead of under `tests/`, several util files bundled into one spec, the same util covered twice across two specs, and a non-pure test parked under `tests/utils/` just to make the runner collect it.

Also flag `.test.ts` where `.spec.ts` belongs, `it.skip` or `describe.skip`, a test name that is not a readable sentence, a spec written against a React component (the architecture puts the logic outside components so component tests are not wanted), and a changed non-component function whose existing spec no longer covers the new behaviour.

## Angle J — reuse, simplification, efficiency

Three related cleanup hunts over the changed code.

**Reuse.** Flag new code that re-implements something the codebase already has. Grep the barrels and the files adjacent to the change, and name the existing helper to call instead. The shared utility package already carries a lodash-equivalent, the shared date package carries a dayjs-equivalent, the shared UI package carries a class-name-merge helper — a hand-rolled equivalent of any of those is a finding. Also flag a new component that duplicates an existing composable already exported from the uikit barrel.

**Simplification.** Flag unnecessary complexity the diff adds: redundant or derivable state, copy-paste with slight variation, deep nesting, and dead code left behind. Name the simpler form that does the same job.

**Efficiency.** Flag wasted work the diff introduces: redundant computation, repeated I/O, independent operations run sequentially that could run together, and blocking work added to startup or a hot path. Also flag a long-lived object built from a closure that keeps its whole enclosing scope alive, which leaks when that scope holds large values.

## Angle K — altitude

Check that each change sits at the right depth rather than being a bandaid.

A special case layered onto shared infrastructure is the signal: a component-specific branch inside a uikit composable, a one-review-type condition inside a generic state-layer handler, an `if` on a specific id or route inside a shared utility. Prefer generalising the underlying mechanism over adding the special case, and say which mechanism you would generalise.

Also flag a fix applied at the render layer that belongs in the model or the service, and a workaround compensating for a bug that is still present upstream in the same diff.
