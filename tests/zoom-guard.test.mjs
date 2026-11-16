import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { guardPageZoom } from "../scripts/zoom-guard.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const element = () => { const listeners = []; return { dataset: {}, listeners, addEventListener: (type, handler, options) => listeners.push({ type, handler, options }) }; };
const fire = (el, type, event) => { let prevented = false; for (const l of el.listeners) if (l.type === type) l.handler({ ...event, preventDefault: () => { prevented = true; } }); return prevented; };

test("a pinch on the map is refused to the browser; one finger is left alone", () => {
  const el = element(); assert.equal(guardPageZoom(el), true);
  for (const type of ["gesturestart", "gesturechange", "gestureend"]) assert.equal(fire(el, type, {}), true, type);
  assert.equal(fire(el, "touchmove", { touches: [{}, {}] }), true, "two fingers moving"); assert.equal(fire(el, "touchstart", { touches: [{}, {}] }), true, "a second finger down");
  assert.equal(fire(el, "touchmove", { touches: [{}] }), false, "one finger turns the map"); assert.equal(fire(el, "touchstart", { touches: [{}] }), false, "a tap is a tap");
  assert.equal(fire(el, "touchend", { touches: [] }), false, "lifting a finger is not touched, so double-taps still open a body");
  // Cancelling a touch needs a listener that is not passive.
  assert.ok(el.listeners.length === 5 && el.listeners.every((l) => l.options?.passive === false));
});

test("the guard is applied once, and to nothing if there is nothing to guard", () => {
  const el = element(); guardPageZoom(el); assert.equal(guardPageZoom(el), false); assert.equal(el.listeners.length, 5);
  assert.equal(guardPageZoom(null), false); assert.equal(guardPageZoom({}), false);
});

test("the app guards the map's view, and the view takes its own touches", () => {
  assert.match(read("scripts/cluster-map-app.mjs"), /guardPageZoom\(root\.querySelector\("\.oscm-view"\)\)/);
  assert.match(read("styles/cluster-map.css"), /\.oscm-view \{ touch-action: none; \}/);
});
