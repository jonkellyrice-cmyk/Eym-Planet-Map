import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../scripts/cluster-map-app.mjs", import.meta.url), "utf8");
const system = readFileSync(new URL("../scripts/system-view.mjs", import.meta.url), "utf8");
const template = readFileSync(new URL("../templates/cluster-map.hbs", import.meta.url), "utf8");

test("application owns a coherent system-body state machine", () => {
  for (const token of ['mode = "system"', 'this.mode = "system"', 'this.mode = "body"', "#enterBody", "#showSystem"]) assert.match(app, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("system activation defers single selection and supports desktop/mobile double activation", () => {
  assert.match(system, /pendingSelectionTimer/); assert.match(system, /lastActivation/); assert.match(system, /onObjectActivate/); assert.match(system, /dblclick/);
  assert.match(system, /state\.zoom > 4\.1/);
});

test("the body level has an outward breadcrumb to the system, which is the outermost level", () => {
  assert.doesNotMatch(template, /data-action="back-to-cluster"/); assert.match(template, /data-action="back-to-system"/);
  assert.match(app, /onExitRequested: \(\) => this\.#showSystem\(\)/);
});
