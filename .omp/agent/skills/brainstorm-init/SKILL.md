---
name: brainstorming-init
description: Use when a user has rough product thoughts, short idea fragments, an Obsidian note, an existing brainstorm, or partial design context and wants to prepare a separate high-quality brainstorming session.
---

# Brainstorming Init

Turn raw thinking into a self-contained prompt for a separate brainstorming agent. Do **not** perform the brainstorming itself.

## Hard Gate

Do not choose the design, resolve architecture, or implement. Preserve uncertainty exactly:
- facts stay facts;
- preferences stay preferences;
- examples stay examples;
- proposals stay tentative;
- contradictions stay visible;
- unknowns stay unknown.

Never invent project facts or silently promote an idea into a requirement.

## Input and Evidence

Accept a sentence, rough notes, an Obsidian document, prior brainstorm, transcript, examples, commands, or repository context.

Treat provided material as the primary source. If a repository is referenced and current behavior matters, inspect relevant code, docs, configuration, tests, and conventions before asserting project facts. Outside knowledge may inform the future agent's expertise, but is not evidence about the project.

Do not ask for more input unless proceeding would materially misrepresent the idea. Carry genuine gaps forward as questions instead.

## Distill Without Solving

Extract only what the source supports:
- core problem and motivation;
- desired outcome;
- established facts;
- priorities, constraints, and anti-goals;
- tentative ideas already considered;
- tensions, dilemmas, and competing abstractions;
- concrete workflows or examples worth testing against;
- important unknowns.

Separate the user problem from proposed implementations. Omit empty categories rather than inventing content.

## Output

Return one ready-to-use prompt. Default to semantic XML; keep natural prose inside tags and omit unnecessary tags.

```xml
<prompt>
  <role>Only expertise relevant to this problem.</role>

  <objective>
    Explore the problem collaboratively. Do not implement yet.
  </objective>

  <interaction-mode>
    Ask one important question at a time.
    Briefly reason from what is established, identify the highest-value uncertainty, ask one focused question, then wait.
    Challenge assumptions and terminology when useful.
    Periodically summarize only what has actually been established.
  </interaction-mode>

  <evidence-discipline>
    Distinguish verified facts, user-provided context, tentative proposals, external knowledge, and unknowns. Do not invent project facts.
  </evidence-discipline>

  <context>
    <core-problem>...</core-problem>
    <goals>...</goals>
    <established-facts>...</established-facts>
    <priorities>...</priorities>
    <constraints>...</constraints>
    <proposals status="tentative">...</proposals>
    <tensions>...</tensions>
    <unknowns>...</unknowns>
  </context>

  <workflow-tests>Concrete scenarios future ideas should survive.</workflow-tests>

  <questions-to-explore>
    Important areas for later exploration, not a questionnaire or decisions.
  </questions-to-explore>

  <starting-procedure>
    Inspect relevant evidence first when applicable.
    Give a very short framing of the core problem, separating facts from interpretation.
    Ask the single most useful first question.
  </starting-procedure>

  <completion-boundary>
    Do not race to a final design before the important uncertainties are explored.
  </completion-boundary>
</prompt>
```

## Quality Bar

Make the prompt self-contained for a fresh capable agent. Preserve precise names, commands, examples, and wording when they matter. Compress repetition, not meaning. Mark candidate abstractions and architectures as tentative. Prefer deterministic evidence over guesswork. Let the future agent discover a better abstraction than those already proposed. Do not force concerns into features; simplification is a valid outcome.

Before returning, verify that no unsupported fact appeared, no uncertainty became a requirement, the problem is clearer than the proposed solution, the important tensions survived, and the first turn naturally begins a step-by-step conversation.

Return the prompt only unless the user asks for commentary. Do not continue into brainstorming unless explicitly asked.
