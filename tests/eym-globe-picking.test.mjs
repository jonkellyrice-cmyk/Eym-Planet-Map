import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { orthographicProject, orthographicUnproject, formatLatLon, latLonDecimals } from "../scripts/body-view-core.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("a point on the globe unprojects to the latitude and longitude it came from, at any turn and zoom", () => {
  for (const [lat, lon, yaw, pitch, r] of [[-6.79, 0.412, -0.35, 0.18, 250], [60, -100, 1.7, 0.9, 3000], [-60, 170, -2.9, -0.9, 7500], [0, 0, 0, 0, 250]]) {
    const p = orthographicProject(lat, lon, yaw, pitch, r); assert.ok(p.visible);
    const q = orthographicUnproject(p.x, p.y, yaw, pitch, r);
    assert.ok(Math.abs(q.lat - lat) < 1e-9); assert.ok(Math.abs(((q.lon - lon + 540) % 360) - 180) < 1e-9);
  }
  assert.equal(orthographicUnproject(260, 0, 0, 0, 250), null, "off the globe");
});

test("the readout's wording and precision", () => {
  assert.equal(formatLatLon(-6.79, 0.412, 2), "6.79°S 0.41°E");
  assert.equal(formatLatLon(15, -79.8, 1), "15.0°N 79.8°W");
  assert.deepEqual([1, 4, 20].map(latLonDecimals), [1, 2, 3]);
});

test("clicking the globe picks a settlement or a place; the cursor shows where it is; the app takes the place", () => {
  const core = read("scripts/body-view-core.mjs"), app = read("scripts/cluster-map-app.mjs");
  assert.match(core, /Math\.hypot\(event\.clientX - press\.x, event\.clientY - press\.y\) < 6\) this\.#click\(event\)/, "a press that does not move is a click");
  assert.match(core, /onPlaceSelected\(place\)/); assert.match(core, /oscm-cursor-readout/); assert.match(core, /pointerleave/);
  assert.match(app, /onPlaceSelected: \(place\) => this\.#selectPlace\(place\)/);
  assert.match(app, /latInput\.value = String\(Math\.round\(lat \* 1e4\) \/ 1e4\)/, "four decimals, not one");
  assert.match(read("styles/body-map.css"), /\.oscm-cursor-readout text/);
});

test("map names come in by tiers as the view closes in, and keep one size on the screen", async () => {
  const { labelTier, LABEL_TIER_ZOOM, LABEL_TIER0_MAX_ZOOM, labelScreenPx } = await import("../scripts/body-view-core.mjs");
  // Continents first; then what can be seen from space; then realms and capitals; then cities and the larger
  // natural features; last the towns (owner, 19 November 2026).
  assert.deepEqual(["continent", "range", "forest", "capital", "region", "city", "lake", "river", "town", "fort"].map(labelTier), [0, 1, 1, 2, 2, 3, 3, 3, 4, 4]);
  for (let i = 1; i < LABEL_TIER_ZOOM.length; i += 1) assert.ok(LABEL_TIER_ZOOM[i] > LABEL_TIER_ZOOM[i - 1]);
  assert.ok(LABEL_TIER0_MAX_ZOOM > LABEL_TIER_ZOOM[3], "the continent's name gives way only once cities show");
  // Legible on a phone: no name under 12 CSS pixels, and the larger tiers larger.
  assert.ok(labelScreenPx("town") >= 12 && labelScreenPx("city") > labelScreenPx("town") && labelScreenPx("continent") > labelScreenPx("capital"));
  // The sizes are screen pixels: the view sets --body-px and the stylesheet scales every name by it, with a dark halo.
  const core = readFileSync(new URL("../scripts/body-view-core.mjs", import.meta.url), "utf8"), css = readFileSync(new URL("../styles/body-map.css", import.meta.url), "utf8");
  assert.match(core, /setProperty\?\.\("--body-px"/);
  const rule = /\.oscm-cartography-label \{([^}]*)\}/.exec(css)[1];
  assert.match(rule, /font-size: calc\(var\(--body-px, 1\) \* var\(--label-px\) \* 1px\)/);
  assert.match(rule, /stroke-width: calc\(var\(--body-px, 1\)/);
  for (const [cls, px] of [["continent", 20], ["capital", 15], ["city", 13]]) assert.match(css, new RegExp(`is-${cls}[^{]*\\{ --label-px: ${px};`), cls);
});
