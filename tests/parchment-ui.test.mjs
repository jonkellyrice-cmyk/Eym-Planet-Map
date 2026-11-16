import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the panel is dressed as parchment: loaded last, a legible old-style serif, ink on vellum", () => {
  const manifest = JSON.parse(read("module.json")), css = read("styles/parchment.css");
  assert.equal(manifest.styles.at(-1), "styles/parchment.css", "it re-dresses the other stylesheets, so it loads last");
  for (const path of manifest.styles) assert.ok(existsSync(new URL(`../${path}`, import.meta.url)), path);
  assert.match(css, /--oscm-serif: "Palatino Linotype", Palatino, "Book Antiqua"[^;]*Georgia, serif;/);
  assert.match(css, /--oscm-display: "Modesto Condensed"/);
  assert.match(css, /\.eym-planet-map \.oscm-panel \{[^}]*--oscm-text: var\(--oscm-ink\)/, "the panel's text is ink");
  assert.ok(!/monospace|Orbitron/.test(css), "no instrument-panel type on the parchment");
  // The map keeps its own colours: the palette is changed on the panel, not on the whole window.
  assert.ok(!/\.eym-planet-map \{[^}]*--oscm-text:/.test(css));
  // Nothing on the parchment is set smaller than 11 px.
  for (const [, size] of css.matchAll(/font(?:-size)?: (?:[a-z0-9 ]*? )?(\d+(?:\.\d+)?)px/g)) assert.ok(Number(size) >= 11, `${size}px is too small to read`);
});

test("on a narrow screen the window scrolls, and the map is short enough to reach the panel under it", () => {
  const css = read("styles/cluster-map.css"), narrow = css.slice(css.indexOf("@media (max-width: 900px)"));
  assert.match(narrow, /\.eym-planet-map \.window-content \{[^}]*overflow-y: auto/);
  assert.match(narrow, /\.oscm-shell \{[^}]*height: auto;[^}]*grid-template-rows: clamp\(300px, 52vh, 520px\) auto/);
  assert.match(narrow, /\.oscm-panel \{ max-height: none; overflow: visible; \}/);
  assert.match(narrow, /\.oscm-cluster-svg \{ min-height: 0; \}/);
});

test("the pixel globe covers all of the view that shows, not only the 900×680 frame", () => {
  const view = read("scripts/body-view-core.mjs");
  assert.match(view, /getBoundingClientRect\?\.\(\)/); assert.match(view, /\["x", 450 - W \* 1\.25\], \["y", 340 - H \* 1\.25\]/);
});
