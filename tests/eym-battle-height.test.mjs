import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBattleMap } from "../scripts/eym-battle-rules.mjs";
import { SETTINGS, FEATURES, MOVE } from "../scripts/eym-battle-settings.mjs";
import { MAP_FEATURES } from "../scripts/eym-battle-features.mjs";
import { INCLINE, applyInclines, inclineDegrees, levelStep, lineOfSight } from "../scripts/eym-battle-terrain.mjs";
import { battleArtDirection, battleReferenceSvg, battleSceneData } from "../scripts/eym-battle-render.mjs";
import { battleMapSpec } from "../scripts/eym-map-presets.mjs";
import { fromLocal } from "../scripts/eym-surface.mjs";

const asset = JSON.parse(readFileSync(new URL("../data/planet-cartography/mitkear/eym.json", import.meta.url), "utf8"));
const bostain = (() => { const s = asset.settlements.find((x) => x.properName === "Bostain"); return fromLocal([s.lat, s.lon], -2.2, -1.8); })();
const spec = battleMapSpec();

/** A tiny bare grid for unit checks. */
function grid(columns, rows) {
  const n = columns * rows;
  return { columns, rows, move: new Array(n).fill("normal"), levelFt: new Int16Array(n), ramp: new Uint8Array(n), void: new Uint8Array(n), elevationFt: new Int16Array(n), solidFt: new Int16Array(n).fill(-999), canopyFt: new Int16Array(n).fill(-999), concealed: new Uint8Array(n), inclineDeg: new Float32Array(n) };
}

test("inclines: 20° is difficult, 32° greater difficult, 45° a climb; never easier than before", () => {
  const g = grid(4, 1), sq = 1.524, rise = (deg) => sq * Math.tan((deg * Math.PI) / 180);
  const heights = [0, rise(21), rise(21) + rise(33), rise(21) + rise(33) + rise(46)];
  const deg = inclineDegrees(heights, 4, 1);
  assert.ok(deg[0] > INCLINE.difficultDeg && deg[3] > INCLINE.climbDeg);
  g.move[0] = "greater";
  applyInclines(g, Float32Array.from([21, 33, 46, 5]), () => false);
  assert.deepEqual(g.move, ["greater", "greater", "climb", "normal"]);
});

test("levels: 5 ft is a step, 10–15 ft a climb, more a cliff; stairs and ramps cross any of them", () => {
  const g = grid(2, 1);
  for (const [d, cost] of [[0, 0], [5, 1], [10, 3], [15, 3], [20, Infinity]]) { g.levelFt[1] = d; assert.equal(levelStep(g, 0, 1), cost, `${d} ft`); }
  g.levelFt[1] = 20; g.ramp[1] = 1; assert.equal(levelStep(g, 0, 1), 1);
});

test("line of sight: blocked by higher ground and solid tops; concealed by canopy above 10 ft; a high eye sees over", () => {
  const g = grid(5, 1);
  assert.equal(lineOfSight(g, 0, 4).visible, true);
  g.elevationFt[2] = 15; assert.equal(lineOfSight(g, 0, 4).visible, false, "a 15-ft rise between");
  assert.equal(lineOfSight(g, 0, 4, { eyeA: 40, eyeB: 40 }).visible, true, "seen over by a flyer");
  g.elevationFt[2] = 0; g.solidFt[2] = 20; assert.equal(lineOfSight(g, 0, 4).visible, false, "a wall");
  g.solidFt[2] = -999; g.canopyFt[2] = 30;
  assert.deepEqual(lineOfSight(g, 0, 4), { visible: true, concealed: false }, "under the crowns");
  assert.deepEqual(lineOfSight(g, 0, 4, { eyeA: 20, eyeB: 20 }), { visible: true, concealed: true }, "through the crowns");
});

test("every fantastic setting builds and stays playable: two routes, sides on walkable ground, heights and notes", () => {
  const fantastic = Object.entries(SETTINGS).filter(([, s]) => s.group === "fantastic").map(([id]) => id);
  assert.ok(fantastic.length >= 14);
  for (const [id, s] of Object.entries(SETTINGS)) for (const kind of [...Object.keys(s.dressing), ...s.high, ...s.hazard, ...s.poi]) assert.ok(FEATURES[kind], `${id}: ${kind}`);
  for (const id of fantastic) {
    const map = buildBattleMap(asset, { center: bostain, spec, setting: id });
    assert.equal(map.setting, id);
    assert.ok(map.routes.length >= 2, `${id}: two routes`);
    for (const zone of map.zones) { assert.ok(zone.length >= 10, `${id}: room to deploy`); for (const i of zone) assert.ok(!map.grid.void[i] && map.grid.move[i] !== MOVE.impassable, `${id}: zone square walkable`); }
    assert.ok(map.notes.some((n) => /Line of sight/.test(n)), id);
    assert.ok(map.analysis.sight.flyView >= 0 && map.analysis.sight.flyView <= 1);
    assert.ok(!/<text/.test(battleReferenceSvg(map, 10)), `${id}: text-free reference`);
  }
});

test("shaped settings: a canyon city in levels joined by stairs; a lake city on canals with bridges; sky islands over a void", () => {
  const canyon = buildBattleMap(asset, { center: bostain, spec, setting: "canyon-city" });
  assert.deepEqual([...new Set(canyon.grid.levelFt)].filter((v) => v >= 0).sort((a, b) => a - b), [0, 20, 40, 60]);
  assert.ok(canyon.cliffs.length > 20 && canyon.features.filter((f) => f.kind === "stairs").length === 6);
  assert.ok(canyon.buildings.some((b) => b.label === "rock-cut dwelling"));
  assert.deepEqual(canyon.axis, ["w", "e"], "the sides face each other along the terraces, each with every level");
  assert.match(battleArtDirection(canyon), /ranges over \d+ ft, in levels with sheer faces/);
  const scene = battleSceneData(canyon, { name: "c", imagePath: "x" });
  const cliffWalls = scene.walls.filter((w) => w.flags?.["eym-planet-map"]?.cliff);
  assert.equal(cliffWalls.length, canyon.cliffs.length); assert.ok(cliffWalls.every((w) => w.sight === 0 && w.move === 20 && w.flags["wall-height"].top > w.flags["wall-height"].bottom));
  assert.ok(scene.regions.some((r) => r.name === "Ground at +60 ft"));
  const lake = buildBattleMap(asset, { center: bostain, spec, setting: "lake-temple-city" });
  assert.ok(lake.grid.water.some(Boolean) && lake.grid.bridge.some(Boolean));
  assert.ok(lake.buildings.some((b) => b.label === "temple"));
  assert.ok(lake.features.some((f) => f.kind === "gondola"));
  const sky = buildBattleMap(asset, { center: bostain, spec, setting: "sky-islands" });
  assert.ok(sky.grid.void.some(Boolean));
  assert.ok(battleSceneData(sky, { name: "s", imagePath: "x" }).regions.some((r) => r.name === "Open air: a fall"));
  const hall = buildBattleMap(asset, { center: bostain, spec, setting: "dwarven-hall" });
  assert.ok(hall.underground); assert.equal(battleSceneData(hall, { name: "h", imagePath: "x", weather: "rain" }).weather, "");
});

test("the checklist has the wonders: every entry is a real feature", () => {
  for (const id of ["crystal-cluster", "giant-mushroom", "fey-ring", "ley-nexus", "planar-rift", "floating-stones", "world-tree", "colossus-head", "dragon-skull", "teleport-circle", "ward-stones", "bone-throne"]) assert.ok(MAP_FEATURES.some((f) => f.id === id), id);
  for (const f of MAP_FEATURES) assert.ok(FEATURES[f.kind], f.id);
});
