import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBattleMap } from "../scripts/eym-battle-rules.mjs";
import { buildInteriors, buildingFloors, floorSvg, footprintMaskSvg, mapFloors, roofMaskSvg } from "../scripts/eym-battle-interiors.mjs";
import { OCCLUSION_VISION, battleScenePlan, levelBands } from "../scripts/eym-battle-scene.mjs";
import { battleMapSpec } from "../scripts/eym-map-presets.mjs";
import { fromLocal } from "../scripts/eym-surface.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const asset = JSON.parse(read("data/planet-cartography/mitkear/eym.json"));
const lyle = (() => { const s = asset.settlements.find((x) => x.properName === "Lyle"); return fromLocal([s.lat, s.lon], 0.2, 0.15); })();
const map = buildBattleMap(asset, { center: lyle, spec: battleMapSpec() }), interiors = buildInteriors(map);
const images = { ground: "g.png", roofs: { 0: "r0.png", 1: "r1.png" }, floors: { 1: "f1.png", "-1": "b.png" } };

test("every building has rooms you can walk between, on each of its floors; stairs line up floor to floor", () => {
  assert.equal(interiors.length, map.buildings.length);
  assert.deepEqual(buildInteriors(map), interiors, "deterministic");
  assert.deepEqual(mapFloors(interiors), [-1, 0, 1]);
  for (const b of interiors) {
    assert.ok(b.floors.some((f) => f.floor === 0));
    if (b.floors.length > 1) assert.ok(b.stairs, `building ${b.id} has stairs between its floors`);
    for (const f of b.floors) {
      const area = b.rects.reduce((s, r) => s + (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1), 0);
      assert.equal(f.rooms.reduce((s, r) => s + (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1), 0), area, "rooms tile the footprint (every block of an L)");
      // Rooms connect: inner walls have one door per split, so rooms - 1 doors at least.
      assert.ok(f.walls.filter((wl) => !wl.outer && wl.door).length >= f.rooms.length - 1);
      if (f.floor === 0) assert.ok(f.walls.filter((wl) => wl.outer && wl.door).length <= 1);
      if (f.floor !== 0) assert.equal(f.walls.filter((wl) => wl.outer && wl.door).length, 0, "only the ground floor has a street door");
      for (const it of f.furniture) { assert.ok(!(b.stairs && it.x < b.stairs.x + b.stairs.w && it.x + it.w > b.stairs.x && it.y < b.stairs.y + b.stairs.h && it.y + it.h > b.stairs.y), "nothing on the stairs"); }
    }
  }
  assert.deepEqual(buildingFloors({ label: "mausoleum" }, "k"), [-1, 0]);
  assert.deepEqual(buildingFloors({ label: "temple", storeys: 2 }, "k").filter((f) => f > 0), []);
});

test("floor images: the ground floor opens every building; above, only buildings that reach it; below, darkness outside", () => {
  const ground = floorSvg(map, interiors, 0, { outdoorSvg: "<svg><rect id='outdoor'/></svg>" });
  assert.match(ground, /id='outdoor'/);
  assert.ok(!/fill="#141210"/.test(ground.slice(0, 300)));
  assert.match(floorSvg(map, interiors, -1), /^<svg[^>]+><rect width="24" height="30" fill="#141210"\/>/);
  const upper = floorSvg(map, interiors, 1); assert.ok(!/fill="#141210"/.test(upper.slice(0, 300)), "transparent around the upper floors");
  const count = (svg) => (svg.match(/<rect |<path /g) ?? []).length, pieces = (bs) => bs.reduce((s, b) => s + (b.chamfers.length ? 1 : b.rects.length), 0);
  assert.equal(count(roofMaskSvg(map, interiors, 0)), pieces(interiors), "every roof on the ground level");
  assert.equal(count(roofMaskSvg(map, interiors, 1)), pieces(interiors.filter((b) => Math.max(...b.floors.map((f) => f.floor)) === 1)));
  assert.equal(count(footprintMaskSvg(map, interiors, -1)), pieces(interiors.filter((b) => b.floors.some((f) => f.floor === -1))));
});

test("the v14 scene: a Level per floor, the ground seen from upstairs but not from the basement, roofs revealed by sight, stairs that change level", () => {
  const plan = battleScenePlan(map, interiors, { name: "Lyle", images });
  assert.deepEqual(plan.levels.map((l) => l.name), ["Basement", "Ground", "Upper floor"]);
  const [basement, ground, upper] = plan.levels;
  assert.ok(basement.elevation.top <= ground.elevation.bottom && ground.elevation.top <= upper.elevation.bottom, "floors stack");
  assert.deepEqual(upper.visibility.levelKeys, ["floor0"], "from upstairs the outside (ground level) is in view");
  assert.deepEqual(basement.visibility.levelKeys, [], "from the basement nothing outside is");
  assert.equal(ground.background.src, "g.png"); assert.equal(upper.background.src, "f1.png"); assert.equal(basement.background.src, "b.png");
  assert.ok(!("background" in plan.scene), "v14 scenes keep their images on the Levels");
  for (const t of plan.tiles) { assert.deepEqual(t.occlusion, { modes: [OCCLUSION_VISION], alpha: 0 }); assert.equal(t.elevation, plan.levels.find((l) => l.key === t.levelKey).elevation.top, "roofs sit at the top of their floor"); }
  const stairs = plan.regions.filter((r) => r.behaviors.some((b) => b.type === "changeLevel"));
  assert.equal(stairs.length, interiors.filter((b) => b.stairs).length);
  for (const r of stairs) { assert.ok(r.levelKeys.length >= 2); assert.ok(r.behaviors[0].system.movementActions.includes("walk")); }
  const windows = plan.walls.filter((w) => w.flags?.["eym-planet-map"]?.window);
  assert.ok(windows.length > 0 && windows.every((w) => w.move === 20 && w.sight === 0), "windows: seen through, not walked through");
  assert.ok(plan.walls.some((w) => w.levelKeys[0] === "floor1") && plan.walls.some((w) => w.levelKeys[0] === "floor-1"));
  assert.ok(plan.walls.filter((w) => w.door).length >= interiors.length * 0.5);
  assert.deepEqual(levelBands(map, interiors).map((b) => b.floor), [-1, 0, 1]);
});

test("a city chosen by hand is built even on open ground; the app makes Levels on v14 and keeps one image before", () => {
  const s = asset.settlements.find((x) => x.properName === "Seaton");
  const city = buildBattleMap(asset, { center: fromLocal([s.lat, s.lon], 1.5, 1.0), spec: battleMapSpec(), setting: "urban" });
  assert.ok(city.buildings.length >= 8);
  const app = read("scripts/cluster-map-app.mjs");
  assert.match(app, /SceneClass\.create\(\{ \.\.\.plan\.scene, levels:/);
  assert.match(app, /createEmbeddedDocuments\?\.\("Wall"/); assert.match(app, /createEmbeddedDocuments\?\.\("Tile"/); assert.match(app, /createEmbeddedDocuments\?\.\("Region"/);
  assert.match(app, /if \(!hasLevels\)/);
  assert.match(read("templates/cluster-map.hbs"), /data-action="battle-paint-interiors"/);
});
