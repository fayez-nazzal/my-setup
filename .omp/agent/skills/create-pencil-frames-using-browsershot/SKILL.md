---
name: create-pencil-frames-using-browsershot
description: Recreate a live web or desktop-app page as an OpenPencil frame using Browsershot's self-contained HTML capture as the source of truth. Use when asked to create, match, or update OpenPencil page frames from a running app.
---

# Create OpenPencil frames from Browsershot

Use the running page—not guesses from the repository—to determine what the user currently sees. The captured HTML supplies the live DOM, applied CSS, responsive state, and dynamic account/capability state. Rebuild that appearance as editable OpenPencil layers, then compare the rendered frame against a Browsershot image.

## 1. Capture the actual page

- Work from the target app's repository so its saved Browsershot `baseUrl`, routes, auth, and page definitions resolve. Inspect repository guidance before running project commands.
- Capture the requested route in HTML form, with auto-open disabled:

  ```sh
  browsershot <route-or-url> --html --format --no-auto-open --json
  ```

- Preserve the requested route, auth context, and relevant viewport/theme settings. If the user specified desktop/mobile dimensions, pass the exact `--size WxH`; otherwise obtain the real target window dimensions from project configuration or the running app. Do not silently substitute the default 1440×900 viewport.
- Read the returned `outputPath` and inspect the saved self-contained HTML. With `--json`, the response may include an `html` field; prefer the saved artifact when the response is large. Inspect the captured DOM, text, checked/pressed/disabled values, and applied CSS. Treat the captured page as authoritative over assumptions based on source code: source conditions, persisted settings, authentication, and platform capabilities can make the live page different.
- Also capture a visual reference with the same route, viewport, theme, and auth context. For a full-page design use a PNG capture such as:

  ```sh
  browsershot <route-or-url> --size <WxH> --full-page --no-html --no-auto-open --json
  ```

  Open and inspect the actual PNG. Its physical dimensions can be device-scaled; determine the CSS-pixel dimensions before sizing the frame. Use a viewport-height frame for a screen mockup, or the full-page content height when the user asks for a full-page/no-scrollbar artboard.

## 2. Rebuild in OpenPencil

- Start with the current OpenPencil document/page and existing screen frame. Preserve unrelated work. Use the current page capture to map the app shell, page header, section order, visible controls, spacing, and content.
- I checked the mounted OpenPencil MCP tools: there is no general HTML-to-layer importer. `import_svg` imports SVG as editable layers; `set_image_fill` applies PNG, JPEG, or WEBP data to an existing node, not HTML. Do **not** pass captured HTML directly to the OpenPencil JSX renderer or assume opening the `.html` file creates editable layers. Translate the captured structure and computed styling into supported OpenPencil design JSX using `mcp__open_pencil_render` (or the corresponding scene/layer tools). Re-check the available tools if the OpenPencil integration changes.
- Reuse existing document variables/components when they exist. Otherwise derive colors, typography, and spacing from the captured CSS and project tokens. Use exact content and live states from the capture; do not invent placeholder account data, settings, or capabilities. Keep the requested app/window width exact.
- If the user says the frame must be full-page with no scrollbar, include the complete captured page content and size the frame to its content. Do not leave the design at the viewport height with the bottom of a card clipped. If the user requests one screen only, use the viewport height and reproduce only what fits on that screen.
- Keep the design native/editable: meaningful frames, text, controls, icons, and separators. Avoid fake HTML imports, oversized frames used merely to force a chosen total height, and a flattened screenshot as the final deliverable.

## 3. Verify against the live capture

- Export the OpenPencil frame as an image and inspect it visually beside the Browsershot PNG. Confirm the frame width/height, app shell, section order, exact copy, selected/disabled states, and that no intended content is clipped or unexpectedly overflows.
- Normalize the reference and design exports to the same CSS-pixel dimensions before a pixel comparison. When ImageMagick is available, use `magick compare -metric RMSE` and inspect the diff image; a numeric score alone does not establish a good match. Correct visible mismatches and re-export.
- Use OpenPencil's bounds/tree and overlap tools as structural checks, not substitutes for visual review. Distinguish intentional scrollable subregions from accidental overflow.
- Do not claim an exact match if dynamic data, an inaccessible state, or capture dimensions were unavailable; state that limitation precisely.

## Deliverable

Leave the requested frame in the active OpenPencil document. In the final reply, report its name and dimensions, confirm the live page was inspected via Browsershot, and mention only genuine remaining differences or access limitations.
