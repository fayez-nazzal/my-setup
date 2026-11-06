---
name: create-pencil-frames-using-browsershot
description: Create editable OpenPencil frames from a live page through a Browsershot HTML capture. Use for design frames, screen mockups, and page artboards that match a running app.
---

# OpenPencil frames from Browsershot

A Browsershot HTML capture carries the complete rendered page: markup, applied CSS, text, state, and measured layout. OpenPencil imports that document as editable layers in one step. Follow five steps: capture, prepare, import, place icons, verify.

## 1. Capture the page

Run from the target app repository so the saved `baseUrl`, routes, auth, theme, and page definitions apply:

```sh
browsershot <route> --html --format --json --no-auto-open
```

- The saved viewport size applies. Add `--size <WxH>` for a different window.
- Read `outputPath` from the JSON reply.

## 2. Prepare the capture

```sh
node ~/.omp/agent/skills/create-pencil-frames-using-browsershot/scripts/prepare-html.mjs <outputPath> --out openpencil-captures
```

Pass `--size <WxH>` whenever step 1 used one; the script otherwise reads the saved size. The reply reports `importPath`, `iconsPath`, `iconCount`, `width`, and `height`.

The prepared document:

- pins the artboard to the captured viewport width,
- carries the page background, text color, and font,
- expands the scroll container to the page content height, the `--full-page` layout,
- flattens CSS gradients to their average color.

`openpencil-captures/` sits inside the OpenPencil MCP root, the app repository.

## 3. Import and focus the tab

```text
mcp__open_pencil_open_file         { path: "openpencil-captures/<name>.import.html" }
mcp__open_pencil_activate_document { document_id: "<tab>", page_id: "<page>" }
```

`open_file` turns the capture into editable frames, text, borders, radii, and shadows at measured sizes. Take the tab ids from `mcp__open_pencil_list_documents`, matching the file name. Activation brings the tab to the front for export.

## 4. Place the captured icons

Read the `iconsPath` file and pass its full contents as `jsx`:

```text
mcp__open_pencil_render { jsx: "<file contents>", document_id: "<tab>", page_id: "<page>" }
```

One call places every captured SVG at its measured position as editable vectors, with `currentColor` resolved and paint set on each shape.

## 5. Verify against the page

```text
mcp__open_pencil_export_image { format: "PNG", scale: 2, document_id: "<tab>", page_id: "<page>" }
```

The exporter reads the front tab: activate the imported tab, let it render, then export. When the image comes back empty, bring the imported tab to the front in OpenPencil and export again. Inspect the image beside the live page for artboard width and height, shell, section order, exact copy, selected and disabled states, icon placement, and full-height content. Correct visible gaps with OpenPencil tools and export again.

## Finish

- Bind document variables and components where the import shows raw colors or sizes.
- Widen an imported text box a few pixels when the app font measures wider in OpenPencil.
- Delete `openpencil-captures/` once the frame is final.
