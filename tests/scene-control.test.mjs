import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addMapSceneControl, mapButtonControl } from "../scripts/scene-control.mjs";

const tool = { name: "eymPlanetMap", title: "System Map", icon: "fa-solid fa-map", button: true, visible: true, onChange: () => {} };
const control = (...names) => ({ tools: Object.fromEntries(names.map((name, order) => [name, { name, order }])) });

test("Foundry v14 (no template controls): the button joins the Token controls", () => {
  // Control keys from the Foundry v14 SceneControls type (as used by the PF2e 8.x system).
  const controls = { regions: control("select", "cone", "clear"), drawings: control("select"), tiles: control("select"), walls: control("select"), tokens: control("select", "target", "ruler"), sounds: control("select"), lighting: control("light"), notes: control("select") };
  assert.equal(addMapSceneControl(controls, tool), controls.tokens);
  assert.equal(controls.tokens.tools.eymPlanetMap.order, 3);
  assert.equal(controls.regions.tools.eymPlanetMap, undefined);
});

test("Foundry v13: the button joins the Token controls too", () => {
  const controls = { tokens: control("select", "target"), templates: control("circle", "cone", "clear"), regions: control("select") };
  assert.equal(addMapSceneControl(controls, tool), controls.tokens);
  assert.equal(controls.templates.tools.eymPlanetMap, undefined);
});

test("without Token controls the button falls back to template controls, else does nothing", () => {
  const legacy = { templates: control("circle", "clear") };
  assert.equal(mapButtonControl(legacy), legacy.templates);
  const renamed = { measure: control("ruler") };
  assert.equal(mapButtonControl(renamed), renamed.measure);
  assert.equal(addMapSceneControl({ notes: control("select") }, tool), null);
  assert.equal(addMapSceneControl(null, tool), null);
});

test("the button is ordered after existing tools even when their orders are sparse", () => {
  const controls = { tokens: { tools: { a: { name: "a", order: 2 }, b: { name: "b", order: 9 } } } };
  addMapSceneControl(controls, tool);
  assert.equal(controls.tokens.tools.eymPlanetMap.order, 10);
});

test("main registers the button through the shared helper", () => {
  const main = readFileSync(new URL("../scripts/main.mjs", import.meta.url), "utf8");
  assert.match(main, /Hooks\.on\("getSceneControlButtons", \(controls\) => \{\n  addMapSceneControl\(controls, \{/);
  assert.match(main, /onChange: \(\) => openClusterMap\(\)/);
});

test("the module targets the Pathfinder 2e system on Foundry v13–v14, not LANCER", () => {
  const manifest = JSON.parse(readFileSync(new URL("../module.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.relationships, { systems: [{ id: "pf2e", type: "system", compatibility: { minimum: "7.0.0" } }] });
  assert.deepEqual(manifest.compatibility, { minimum: "13", verified: "13", maximum: "14" });
  assert.doesNotMatch(JSON.stringify(manifest), /lancer/i);
});
