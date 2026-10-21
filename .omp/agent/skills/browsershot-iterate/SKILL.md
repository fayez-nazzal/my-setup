---
name: browsershot-iterate
description: Implement a task with a browsershot before-and-after visual feedback loop. Use with two arguments—a task and a browsershot capture command—for features, bug fixes, or UI improvements that must be verified visually.
---

# Browsershot iterate

## Arguments

Accept exactly two arguments, in this order:

1. **Task**: the feature, bug fix, or UI improvement to implement.
2. **Browsershot command**: the complete capture command, including its URL or saved page/library target and any actions, viewport, theme, or assertions.

Invocation:

```text
/skill:browsershot-iterate "Fix the clipped pricing card on mobile" "browsershot http://localhost:3000/pricing --size 390x844 --json"
```

Treat each quoted value as one argument; preserve quoting inside the command. If either argument is missing or their boundary is ambiguous, ask only for the missing clarification before running anything.

## Workflow

Read the `browsershot` skill for capture semantics. Follow the target repository's instructions and existing implementation patterns.

### 1. Capture before editing

- The first task action must be running the supplied browsershot capture command with `--no-auto-open` enabled. Do not start implementing before obtaining and viewing the baseline.
- Normalize the capture command once: preserve the supplied executable, target, options, and actions; add `--no-auto-open` if absent. If it explicitly enables auto-open, replace that option with `--no-auto-open`. Use this same normalized command, unchanged and from the same working directory, for every capture.
- Accept only a browsershot capture invocation, not `open`, configuration commands, or arbitrary shell chains. Do not execute embedded substitutions or unrelated shell operations. Ask for a capture command if the supplied value is not one.
- Run from the target application's repository so saved routes, auth, and page definitions resolve consistently. Do not guess missing route or page configuration.
- If the app is unavailable or capture fails, diagnose the actual failure, start the documented local server when appropriate, then retry the same command. Preserve valid capture artifacts even if an assertion exits nonzero. An assertion failure is evidence, not automatic proof that no image exists.
- Locate the image using the command's reported output path. Open the actual image with an image-capable tool and inspect it visually; a path, hash, DOM dump, or successful exit is not a substitute for vision. Do not use an external auto-opening viewer.
- Record the baseline image path and observable problem or relevant initial state. Derive concrete acceptance criteria from the task and what is visible. For a feature not present yet, inspect its intended location and surrounding UI rather than requiring an existing defect.
- Preserve the baseline image before another capture if the command uses a fixed output filename; never change the capture command to distinguish runs.

### 2. Do the task

- Investigate and implement the requested change, whether a feature, bug fix, or UI improvement. Keep scope limited to the task; fix the cause rather than hiding the symptom.
- Use the baseline and acceptance criteria to guide the implementation. Follow applicable coding and UI skills.
- Exercise changed behavior where needed; a screenshot alone does not prove interactions, persistence, or nonvisual logic.

### 3. Capture, see, and verify

- Re-run the exact normalized browsershot command after the change is served by the application. Keep the same target, actions, viewport, theme, auth context, and working directory so the comparison is meaningful.
- Open the newly produced image with an image-capable tool. Inspect the actual after image and compare it with the baseline and task acceptance criteria. Do not infer success from a zero exit code or a changed image hash.
- Check relevant capture assertions and inspection metadata as additional evidence. Readiness checks such as `--expect-text` and `--expect-element` are not proof of the post-action result.
- If the task is visibly satisfied, required behavior works, and no relevant regression is apparent, stop editing.
- Otherwise, use the observed mismatch to investigate and make the next targeted correction, then repeat this capture-and-vision step with the same command. Do not stop at an unverified implementation or merely describe the next iteration.
- If progress requires unavailable access, a missing service, or unavailable image viewing, report the exact blocker and evidence. Never claim visual verification without seeing both baseline and after images.

## Final response

Report the implemented change, the before and final image paths, and the concrete visual and behavioral checks performed. Mention any remaining blocker or verification limit. Keep intermediate captures and debugging details out of the final response unless they explain an unresolved issue.
