# XML handoff contract

Compose a self-contained XML task for a fresh session, copy it to the user's clipboard, and do not output the XML in chat. The document contains no Markdown fence:

```xml
<request>
  <role>Facilitate a frontend architecture brainstorm. Challenge assumptions and ask focused questions.</role>
  <goal>Evaluate whether checkout should be separated into its own app without choosing a design prematurely.</goal>
  <task>Use /skill:brainstorming-init if available. Explore the proposed checkout separation through questions using the ask tool; do not implement it.</task>
  <constraints>
    <constraint source="user">Focus on the DocClever frontend; treat backend changes in this branch as temporary.</constraint>
    <constraint source="user" status="proposal">A new checkout app at /a/checkout is an idea to examine, not a decision.</constraint>
  </constraints>
  <context>
    <statement source="repo" status="verified">The current checkout entrypoint is in the shell.</statement>
    <relevant-file-tree root="apps" source="repo" coverage="selected">
      <purpose>Locate the current route entrypoint among the neighboring apps.</purpose>
      <tree>apps/
  shell/
    src/
      routes.tsx
  settings/</tree>
    </relevant-file-tree>
  </context>
  <evidence>
    <file source="repo" lines="12-18">
      <file_name>apps/shell/src/routes.tsx</file_name>
      <content>export const routes = [/* exact excerpt, XML-escaped */];</content>
    </file>
  </evidence>
  <open-questions>
    <question>Which integration owns the public checkout URL?</question>
  </open-questions>
  <note>Use the attached, sourced context as a starting point, not a limit. If essential information is missing, ambiguous, or stale, make focused tool calls to inspect whatever additional code, documentation, tests, or configuration are needed for a high-quality result. Avoid repeating included reads unless verification is warranted.</note>
</request>
```

This is a shape example, not a claim about any repository. Rephrase the user's request into role, goal, and task while preserving precise names, commands, uncertainty, and intent. Do not include the input tag, a verbatim original, or an outer enrichment wrapper. Omit unused optional elements. Encode text and attributes (`&`, `<`, `>`, quotes when needed). Cite observed paths and contiguous line ranges only; use `source="user"` for claims from the request, never `source="repo"`. In `<content>`, paste actual relevant source bytes as text, escaping XML special characters; when the whole file is short and necessary, include it in full and omit `lines`. A selected range in a large file must say `lines="start-end"`. Do not invent a path, line number, or snippet. Note any omitted sensitive material or unavailable source as a gap without reproducing it.

When a repository is available, `<relevant-file-tree>` belongs in `<context>` and contains a small, observed hierarchy that helps locate the target, adjacent modules, and relevant entrypoints. `root` is its actual repository-relative directory; `coverage="selected"` makes clear the tree is not complete. Never list a proposed app as an existing directory. When a repository is unavailable, state that limitation and omit the tree rather than fabricating paths. The required `<note>` reminds the next agent that context saves redundant exploration but does not replace necessary investigation.
