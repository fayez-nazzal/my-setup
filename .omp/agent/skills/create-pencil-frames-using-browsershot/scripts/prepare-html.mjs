#!/usr/bin/env node
// Prepare a Browsershot HTML capture for OpenPencil's HTML import.
//
//   node prepare-html.mjs <captured.html> --size 1440x900 [--out <dir>]
//
// Writes <name>.import.html and <name>.icons.jsx, then prints a JSON summary.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

function usage(message) {
  if (message) process.stderr.write(`${message}\n`);
  process.stderr.write(
    "usage: prepare-html.mjs <captured.html> [--size WxH] [--out <dir>]\n",
  );
  process.exit(2);
}

const args = process.argv.slice(2);
let input;
let size;
let outDir = "openpencil-captures";
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--size") {
    size = args[++index] ?? usage("--size needs WxH");
  } else if (arg === "--out") {
    outDir = args[++index] ?? usage("--out needs a directory");
  } else if (arg.startsWith("--")) {
    usage(`Unknown option: ${arg}`);
  } else if (input === undefined) {
    input = arg;
  } else {
    usage(`Unexpected argument: ${arg}`);
  }
}
if (!input) usage("Pass the captured HTML path");

if (size === undefined) {
  // Keep the capture and the measurement on the same viewport: Browsershot
  // applies the saved size when --size is omitted, so reuse that value.
  try {
    const saved = JSON.parse(readFileSync(".browsershot/config.json", "utf8"));
    size = saved.size;
  } catch {
    size = undefined;
  }
  if (!/^\d+x\d+$/.test(size ?? "")) usage("Pass --size WxH (the saved browsershot size is unavailable)");
}

const match = /^(\d+)x(\d+)$/.exec(size);
if (!match) usage(`--size must look like 1440x900, received: ${size}`);
const viewport = { width: Number(match[1]), height: Number(match[2]) };

function resolvePlaywright() {
  const binary = execFileSync("sh", ["-c", "command -v browsershot"], {
    encoding: "utf8",
  }).trim();
  if (!binary) throw new Error("browsershot is missing from PATH");
  const require = createRequire(realpathSync(binary));
  return require("playwright");
}

const capturePath = path.resolve(input);
if (!existsSync(capturePath)) usage(`Capture file is missing: ${capturePath}`);
const capture = readFileSync(capturePath, "utf8");
const baseHref = /<base\b[^>]*\bhref="([^"]+)"/i.exec(capture)?.[1];
const pageUrl = baseHref
  ? new URL("/__openpencil_capture__", baseHref).href
  : "http://openpencil.local/__openpencil_capture__";

const { chromium } = resolvePlaywright();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport,
  deviceScaleFactor: 1,
});

try {
  await page.route(pageUrl, (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: capture }),
  );
  await page.goto(pageUrl, { waitUntil: "load", timeout: 30_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);

  const prepared = await page.evaluate(({ width, height }) => {
    // Expand the scroll container under the viewport centre, as a full-page
    // screenshot does, so the document lays out at its full content height.
    const centerX = width / 2;
    const centerY = height / 2;
    let node = document.elementFromPoint(centerX, centerY);
    while (node && node !== document.body && node !== document.documentElement) {
      const style = getComputedStyle(node);
      if (/(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) break;
      node = node.parentElement;
    }
    if (node instanceof HTMLElement && node !== document.body && node !== document.documentElement) {
      for (let element = node; element; element = element.parentElement) {
        element.style.setProperty("height", "auto");
        element.style.setProperty("max-height", "none");
        element.style.setProperty("flex", "0 0 auto");
        if (element === node) {
          element.style.setProperty("overflow-x", "visible");
          element.style.setProperty("overflow-y", "visible");
        }
        element.scrollTop = 0;
      }
    }

    const htmlStyle = getComputedStyle(document.documentElement);
    const bodyStyle = getComputedStyle(document.body);
    const transparent = (value) =>
      !value || value === "transparent" || /rgba\([^)]*,\s*0\s*\)$/.test(value);
    const background = !transparent(bodyStyle.backgroundColor)
      ? bodyStyle.backgroundColor
      : !transparent(htmlStyle.backgroundColor)
        ? htmlStyle.backgroundColor
        : "#FFFFFF";

    // A fixed-width root keeps the artboard at the captured viewport width and
    // carries the body paint that OpenPencil's HTML import reads from elements.
    const root = document.createElement("div");
    root.setAttribute("data-openpencil-root", "");
    const rootStyle = [
      "box-sizing: border-box",
      `width: ${width}px`,
      `background: ${background}`,
      `color: ${bodyStyle.color}`,
      `font-family: ${bodyStyle.fontFamily}`,
      `font-size: ${bodyStyle.fontSize}`,
    ];
    if (bodyStyle.lineHeight !== "normal") rootStyle.push(`line-height: ${bodyStyle.lineHeight}`);
    if (bodyStyle.letterSpacing !== "normal") rootStyle.push(`letter-spacing: ${bodyStyle.letterSpacing}`);
    root.style.cssText = rootStyle.join("; ");
    while (document.body.firstChild) root.appendChild(document.body.firstChild);
    document.body.appendChild(root);
    document.body.style.setProperty("margin", "0");
    document.body.style.setProperty("background", "transparent");
    document.body.style.setProperty("padding", "0");
    document.documentElement.style.setProperty("background", "transparent");

    const resolveCurrentColor = (svg, color) => {
      const paint = (element) => {
        for (const name of ["stroke", "fill", "color"]) {
          const value = element.getAttribute(name);
          if (value && value.includes("currentColor")) {
            element.setAttribute(name, value.replaceAll("currentColor", color));
          }
        }
        const style = element.getAttribute("style");
        if (style && style.includes("currentColor")) {
          element.setAttribute("style", style.replaceAll("currentColor", color));
        }
      };
      paint(svg);
      for (const child of svg.querySelectorAll("*")) paint(child);
    };

    const icons = [];
    const INHERITED_SVG = [
      "fill",
      "stroke",
      "stroke-width",
      "stroke-linecap",
      "stroke-linejoin",
      "stroke-miterlimit",
      "stroke-dasharray",
      "fill-rule",
      "clip-rule",
      "opacity",
    ];
    for (const svg of root.querySelectorAll("svg")) {
      const box = svg.getBoundingClientRect();
      const style = getComputedStyle(svg);
      if (box.width < 1 || box.height < 1) continue;
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      const clone = svg.cloneNode(true);
      resolveCurrentColor(clone, style.color);
      // SVG properties on the root apply to its shapes; OpenPencil reads them per path.
      const inherited = INHERITED_SVG.map((name) => [name, clone.getAttribute(name)]).filter(
        ([, value]) => value !== null,
      );
      for (const child of clone.querySelectorAll("path, rect, circle, ellipse, line, polyline, polygon, g")) {
        for (const [name, value] of inherited) {
          if (!child.hasAttribute(name)) child.setAttribute(name, value);
        }
      }
      for (const [name] of inherited) clone.removeAttribute(name);
      clone.removeAttribute("class");
      clone.removeAttribute("style");
      clone.removeAttribute("width");
      clone.removeAttribute("height");
      clone.removeAttribute("xmlns");
      icons.push({
        x: Math.round((box.left + window.scrollX) * 100) / 100,
        y: Math.round((box.top + window.scrollY) * 100) / 100,
        w: Math.round(box.width * 100) / 100,
        h: Math.round(box.height * 100) / 100,
        svg: clone.outerHTML.replace(/>\s+</g, "><").trim(),
      });
    }

    // Flat approximation for CSS gradients; the layer keeps its shape and paint area.
    for (const element of root.querySelectorAll("*")) {
      const style = getComputedStyle(element);
      if (!style.backgroundImage || !style.backgroundImage.includes("gradient")) continue;
      const colors = style.backgroundImage.match(/rgba?\([^)]+\)/g) ?? [];
      if (colors.length === 0) continue;
      const channels = colors.map((value) => value.match(/[\d.]+/g).slice(0, 3).map(Number));
      const average = [0, 1, 2].map((channel) =>
        Math.round(channels.reduce((sum, entry) => sum + entry[channel], 0) / channels.length),
      );
      element.style.setProperty("background-image", "none");
      element.style.setProperty("background-color", `rgb(${average.join(", ")})`);
    }

    void root.offsetHeight;
    const rootBox = root.getBoundingClientRect();
    return {
      html: `<!doctype html>\n${document.documentElement.outerHTML}`,
      icons,
      width: Math.round(rootBox.width * 100) / 100,
      height: Math.round(rootBox.height * 100) / 100,
      background,
    };
  }, viewport);

  mkdirSync(outDir, { recursive: true });
  const stem = path.basename(capturePath).replace(/\.html?$/i, "");
  const importPath = path.resolve(outDir, `${stem}.import.html`);
  const iconsPath = path.resolve(outDir, `${stem}.icons.jsx`);
  writeFileSync(importPath, prepared.html);

  const number = (value) => String(Math.round(value * 100) / 100);
  const iconJsx = prepared.icons
    .map((icon) => {
      const size = Math.max(icon.w, icon.h);
      const markup = icon.svg.replace(
        /^<svg\b/i,
        `<svg x={${number(icon.x)}} y={${number(icon.y)}} size={${number(size)}}`,
      );
      return `  ${markup}`;
    })
    .join("\n");
  writeFileSync(
    iconsPath,
    `<Frame name="icons" w={${number(prepared.width)}} h={${number(prepared.height)}}>\n${iconJsx}\n</Frame>\n`,
  );

  process.stdout.write(
    `${JSON.stringify(
      {
        importPath,
        iconsPath,
        iconCount: prepared.icons.length,
        width: prepared.width,
        height: prepared.height,
        background: prepared.background,
      },
      null,
      2,
    )}\n`,
  );
} finally {
  await browser.close();
}
