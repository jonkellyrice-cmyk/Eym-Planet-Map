import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { BUILDING_STYLES, STYLE_KITS, buildingStyle, styleForPlace, styleStreetLamps } from "../scripts/eym-building-styles.mjs";
import { normalizeLibrary, styleArchitecturePrompt, styleForDossier, updateDossier, createDossier } from "../scripts/eym-architecture.mjs";
import { buildBattleMap, geometryHash } from "../scripts/eym-battle-rules.mjs";
import { buildInteriors } from "../scripts/eym-battle-interiors.mjs";
import { battleScenePlan } from "../scripts/eym-battle-scene.mjs";
import { battleMapSpec } from "../scripts/eym-map-presets.mjs";
import { renderBattleLayers } from "../webapp/render/render-battle.mjs";
import { parseRequest } from "../webapp/server.mjs";

const asset = JSON.parse(readFileSync(new URL("../data/planet-cartography/abydos/eventide.json", import.meta.url), "utf8"));
const dree = asset.settlements.find((s) => s.properName === "Dree");
const spec = battleMapSpec({ size: "custom", columns: 16, rows: 12, density: "custom", gridPx: 70 });
const map = buildBattleMap(asset, { center: [dree.lat, dree.lon], spec, setting: "urban" }), interiors = buildInteriors(map);

test("every style uses only the shared kits; Dree is linked to Dree on Caren", () => {
  for (const s of Object.values(BUILDING_STYLES)) for (const [kit, choices] of Object.entries(STYLE_KITS)) assert.ok(choices.includes(s[kit]), `${s.id}.${kit}`);
  assert.equal(dree.continent, "Caren");
  assert.equal(styleForPlace(dree.lat, dree.lon), "dree");
  assert.equal(styleForPlace(dree.lat + 1, dree.lon), "default");
  assert.equal(buildingStyle("nope").id, "default");
});

test("a dossier can name a style; its own choice wins over the place's", () => {
  let lib = createDossier(normalizeLibrary({}), { name: "Dree" }, "d1", "t");
  lib = updateDossier(lib, "d1", { style: "dree" }, "t"); assert.equal(lib.dossiers[0].style, "dree");
  assert.equal(normalizeLibrary({ dossiers: [{ id: "x", style: "bogus" }] }).dossiers[0].style, "");
  assert.equal(styleForDossier(lib.dossiers[0], "default"), "dree"); assert.equal(styleForDossier(null, "dree"), "dree"); assert.equal(styleForDossier(null, null), "default");
  assert.match(styleArchitecturePrompt("dree"), /brick.*slate.*sash/s); assert.equal(styleArchitecturePrompt("default"), "");
});

test("the same request builds the same map; lamps line the streets as Foundry lights", () => {
  assert.equal(geometryHash(buildBattleMap(asset, { center: [dree.lat, dree.lon], spec, setting: "urban" })), geometryHash(map));
  const lamps = styleStreetLamps(map, "dree");
  assert.ok(lamps.length > 0); assert.deepEqual(styleStreetLamps(map, "default"), []);
  for (const l of lamps) { const i = Math.floor(l.y) * spec.columns + Math.floor(l.x); assert.ok(map.grid.building[i] < 0, "on the street, not in a house"); }
  const lit = battleScenePlan(map, interiors, { name: "t", images: { ground: "g", roofs: {}, floors: {} }, style: "dree" }).lights.filter((l) => l.flags["eym-planet-map"].light === "arc-lamp");
  assert.equal(lit.length, lamps.length); assert.ok(lit.every((l) => l.config.darkness.min > 0 && l.elevation >= 9));
});

test("Dree renders differently from the generic style, deterministically; the server takes and checks a style", () => {
  const a = renderBattleLayers(map, interiors, { gridPx: 70, style: "dree" }), b = renderBattleLayers(map, interiors, { gridPx: 70, style: "default" }), c = renderBattleLayers(map, interiors, { gridPx: 70, style: "dree" });
  assert.equal(a.style, "dree"); assert.notDeepEqual(a.exterior.data, b.exterior.data); assert.deepEqual(a.exterior.data, c.exterior.data);
  const req = { center: [dree.lat, dree.lon], columns: 16, rows: 12, gridPx: 70 };
  assert.equal(parseRequest(req).style, "dree"); assert.equal(parseRequest({ ...req, style: "default" }).style, "default");
  assert.throws(() => parseRequest({ ...req, style: "bogus" }), /style/);
});
