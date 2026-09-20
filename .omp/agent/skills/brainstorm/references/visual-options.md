# Optional visual comparisons

Use only when seeing alternatives changes the user's ability to choose. A question about UI behavior can still be a text question; a layout comparison usually benefits from a picture.

## Cheapest useful surface

1. **`ask` descriptions and previews:** compact ASCII layouts, examples, or mini-flows. Keep essential distinctions in descriptions because fallback selectors omit previews.
2. **Diagram in chat:** a small Mermaid flow or state diagram for genuine structure, not a decoration for a numbered list.
3. **Browser mockup:** only if the user requested or accepted a visual artifact and the available runtime can present it usefully.

Never turn a browser or a separate server into a brainstorming prerequisite.

## Browser workflow

- Use omp's actual `eval` browser API, not a Superpowers companion script or an invented tool.
- Create a disposable, self-contained mockup with complete, meaningful content for each alternative. Use the same labels as the subsequent selector. Keep differences focused on the decision; do not build a product prototype to answer a layout question.
- Prefer a dedicated spawned tab opened with `browser.open` and a local file URL or an already-authorized preview URL. Do not navigate an existing user tab or attach to a logged-in relay without authorization.
- Inspect the rendered result with `tab.observe()` and a screenshot. If one layout is broken or incomplete, fix it before asking the user to compare it.
- A screenshot visible to the agent does not prove the user can see the browser. Show the comparison in a supported user-visible surface or give the actual accessible artifact location. Do not say “you can see it” without that path.
- Then use `ask` for the decision, naming the alternatives exactly as shown. Keep enough explanation in the selector to answer without a browser.
- Close the managed tab when finished and remove only temporary artifacts created for this comparison unless the user wants them retained. Report what was retained.

Use `hub` to supervise a preview server only if an existing project genuinely requires one; do not install dependencies just to display options. If the runtime cannot render or expose a useful comparison, state the limitation and fall back to a text sketch without inventing visual verification.
