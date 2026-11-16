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
