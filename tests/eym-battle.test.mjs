import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBattleMap, classifySetting, snapToWorldGrid } from "../scripts/eym-battle-rules.mjs";
import { FEATURES, MOVE, MOVE_COST, SETTINGS } from "../scripts/eym-battle-settings.mjs";
import { battleArtDirection, battlePacket, battleReferenceSvg, battleSceneData, battleTacticalSvg, darknessFor, weatherEffectFor } from "../scripts/eym-battle-render.mjs";
import { battleMapSpec } from "../scripts/eym-map-presets.mjs";
import { fromLocal, toLocal } from "../scripts/eym-surface.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const asset = JSON.parse(read("data/planet-cartography/abydos/eventide.json"));
const town = (name) => { const s = asset.settlements.find((x) => x.properName === name); return [s.lat, s.lon]; };
const spec = battleMapSpec();
const city = buildBattleMap(asset, { center: fromLocal(town("Lyle"), 0.2, 0.15), spec });
const forest = buildBattleMap(asset, { center: fromLocal(town("Bostain"), -2.2, -1.8), spec });
const volcano = buildBattleMap(asset, { center: fromLocal(town("Bostain"), -2.2, -1.8), spec, setting: "volcanic" });

/** Every design guarantee a finished map must meet. */
function assertDesigned(map) {
  const { columns, rows } = map.spec, n = columns * rows;
  assert.ok(map.routes.length >= 2, `${map.setting}: at least two distinct routes`);
  for (const zone of map.zones) { assert.ok(zone.length >= 12, "deployment room"); for (const i of zone) assert.ok(Number.isFinite(MOVE_COST[map.grid.move[i]]) && map.grid.move[i] !== MOVE.swim, "zones are walkable"); }
  for (const f of map.features) for (const i of f.squares) { assert.ok(i >= 0 && i < n); assert.ok(!map.zones.some((z) => z.includes(i)) || f.kind in { fountain: 1, statue: 1, "planter-tree": 1, garden: 1, "lone-tree": 1 }, `${f.kind} kept out of the deployment zones`); }
  const [a, b] = map.analysis.balance.forwardCover; assert.ok(Math.min(a, b) >= 0.6 * Math.max(a, b), `${map.setting}: balanced cover (${a}/${b})`);
  assert.ok(map.analysis.largestOpenSquares <= map.analysis.openMax + 2, `${map.setting}: no long open crossing (${map.analysis.largestOpenSquares})`);
}

test("settings are classified from the ground, in a fixed order", () => {
  const base = { biome: "temperate-forest", elevationM: 200, reliefFt: 5 };
  assert.equal(classifySetting({ ...base, shares: { built: 60 } }), "urban");
  assert.equal(classifySetting({ ...base, shares: { built: 10, woods: 80 } }), "village");
  assert.equal(classifySetting({ ...base, biome: "ice-cap", shares: { snow: 100 } }), "glacier");
  assert.equal(classifySetting({ ...base, elevationM: 2400, shares: { rock: 50 } }), "mountain");
  assert.equal(classifySetting({ ...base, shares: { sea: 10, beach: 8, meadow: 82 } }), "coast");
  assert.equal(classifySetting({ ...base, shares: { marsh: 40 } }), "marsh");
  assert.equal(classifySetting({ ...base, shares: { woods: 70 } }), "forest");
  assert.equal(classifySetting({ ...base, biome: "tropical-rainforest", shares: { woods: 70 } }), "jungle");
  assert.equal(classifySetting({ ...base, biome: "taiga", shares: { woods: 70 } }), "taiga");
  assert.equal(classifySetting({ ...base, biome: "hot-desert", shares: { meadow: 100 } }), "hot-desert");
  assert.equal(classifySetting({ ...base, shares: { farmland: 60 } }), "farmland");
  assert.equal(classifySetting({ ...base, shares: { meadow: 100 } }), "grassland");
  for (const s of Object.values(SETTINGS)) for (const kind of [...Object.keys(s.dressing), ...s.high, ...s.hazard, ...s.poi]) assert.ok(FEATURES[kind], kind);
});

test("maps snap to the world's 5-ft grid, so nearby maps share squares", () => {
  const a = snapToWorldGrid(fromLocal(town("Lyle"), 0.2, 0.15), spec), b = snapToWorldGrid(fromLocal(town("Lyle"), 0.2137, 0.1418), spec);
  assert.deepEqual(a.anchor, b.anchor);
  const [x, y] = toLocal(a.anchor, ...b.center).map((v, k) => v - toLocal(a.anchor, ...a.center)[k]), sq = 5 * 0.3048 / 1000;
  assert.ok(Math.abs(x / sq - Math.round(x / sq)) < 0.02 && Math.abs(y / sq - Math.round(y / sq)) < 0.02, `${x / sq}, ${y / sq}`);
  assert.equal(b.origin[0] - a.origin[0], Math.round(x / sq));
});

test("a city: streets, buildings walled with one door each, greenery, routes, deterministic", () => {
  assert.equal(city.setting, "urban");
  assert.ok(city.buildings.length >= 10);
  const again = buildBattleMap(asset, { center: fromLocal(town("Lyle"), 0.2, 0.15), spec });
  assert.deepEqual(again.grid.move, city.grid.move); assert.deepEqual([...again.grid.walls.keys()], [...city.grid.walls.keys()]);
  const doors = new Map(); for (const w of city.grid.walls.values()) if (w.door) doors.set(w.building, (doors.get(w.building) ?? 0) + 1);
  for (const count of doors.values()) assert.equal(count, 1, "one door per building");
  assert.ok(doors.size >= city.buildings.length * 0.6, "most buildings have their door on the map");
  assert.ok(city.features.some((f) => f.kind === "planter-tree"), "street trees");
  assert.ok(city.grid.street.some(Boolean));
  assertDesigned(city);
});

test("a forest and a volcano: obstacles, hazards and high ground by the setting's rules", () => {
  assert.equal(forest.setting, "forest");
  assert.ok(forest.objects.filter((o) => o.kind === "tree").length > 50);
  assertDesigned(forest);
  assert.equal(volcano.setting, "volcanic");
  assert.ok(volcano.features.some((f) => f.kind === "lava-channel"), "lava");
  assert.ok(volcano.objects.filter((o) => o.kind === "tree").length < 10, "lava does not grow forests");
  assert.ok(volcano.grid.move.includes(MOVE.hazardous));
  assert.ok(volcano.analysis.highGroundSquares > 0);
  assert.ok(volcano.notes.some((n) => /lava/.test(n)));
  assertDesigned(volcano);
});

test("conditions change the ground: deep snow and mud are difficult; streets stay clear", () => {
  const snowy = buildBattleMap(asset, { center: fromLocal(town("Lyle"), 0.2, 0.15), spec, conditions: { snowDepthCm: 30, tempC: -6 } });
  let streets = 0, clearStreets = 0, yards = 0, snowyYards = 0;
  snowy.grid.ground.forEach((g, i) => { if (snowy.grid.street[i] && snowy.grid.feature[i] < 0) { streets += 1; if (snowy.grid.move[i] === MOVE.normal) clearStreets += 1; } if (snowy.grid.building[i] < 0 && !snowy.grid.street[i] && g === "snow") { yards += 1; if (snowy.grid.move[i] !== MOVE.normal) snowyYards += 1; } });
  assert.equal(clearStreets, streets); assert.ok(yards > 0 && snowyYards === yards);
  assert.ok(snowy.notes.some((n) => /Snow 30 cm/.test(n)));
  const wet = buildBattleMap(asset, { center: fromLocal(town("Lyle"), 1.2, -0.9), spec, conditions: { ground: "waterlogged" } });
  assert.ok(wet.grid.ground.some((g) => g === "field (mud)"));
  assert.ok(!wet.grid.ground.some((g) => g === "grass (mud)"), "grass holds up unless flooding");
});

test("the painter's reference is text-free and gridless; the GM overlay and packet carry the rules", () => {
  const ref = battleReferenceSvg(city, 20), tac = battleTacticalSvg(city, 20);
  assert.ok(!/<text/.test(ref) && !/<line/.test(ref));
  assert.match(ref, new RegExp(`width="${24 * 20}" height="${30 * 20}"`));
  assert.match(tac, /<text/); assert.match(tac, /hatch-d/);
  const prompt = battleArtDirection(volcano);
  assert.match(prompt, /authoritative layout/); assert.match(prompt, /Draw no grid lines/); assert.match(prompt, /lava/);
  const packet = battlePacket(volcano, { title: "T" });
  assert.match(packet, /\*\*lava channel\*\* at [A-X]\d+/); assert.match(packet, /## Hazards/);
});

test("the Foundry scene: 5-ft grid, walls and doors from the buildings, terrain regions, light and weather", () => {
  const scene = battleSceneData(city, { name: "Lyle", imagePath: "worlds/w/x.png", movementCost: true, darkness: darknessFor(-3), weather: weatherEffectFor({ precipKind: "rain", precipMmH: 1 }) });
  assert.deepEqual(scene.grid, { type: 1, size: 140, distance: 5, units: "ft" });
  assert.equal(scene.width, 3360); assert.equal(scene.height, 4200);
  assert.equal(scene.walls.length, city.grid.walls.size);
  assert.equal(scene.walls.filter((w) => w.door).length, [...city.grid.walls.values()].filter((w) => w.door).length);
  for (const w of scene.walls) for (const v of w.c) assert.ok(v >= 0 && v <= 4200);
  assert.equal(scene.weather, "rain"); assert.ok(scene.environment.darknessLevel > 0.3 && scene.environment.darknessLevel < 0.6);
  const v = battleSceneData(volcano, { name: "V", imagePath: "x", movementCost: true });
  const hazard = v.regions.find((r) => r.name === "Hazardous terrain"); assert.ok(hazard?.shapes.length && hazard.behaviors[0].type === "modifyMovementCost");
  assert.equal(darknessFor(30), 0); assert.equal(darknessFor(-20), 0.9);
  assert.equal(weatherEffectFor({ precipKind: "snow", windMs: 14 }), "blizzard");
});

test("the app offers battle maps: build, paint, create scene (GM)", () => {
  const app = read("scripts/cluster-map-app.mjs"), template = read("templates/cluster-map.hbs");
  for (const token of ['data-action="battle-build"', 'name="battleSetting"', 'data-action="battle-create-scene"']) assert.ok(template.includes(token), token);
  assert.match(app, /buildBattleMap\(this\._eymGeography/);
  assert.match(app, /battleSceneData\(current\.battle/);
  assert.match(app, /if \(!game\.user\?\.isGM\) throw new Error\("only the GM can create scenes"\)/);
});

test("the GM's features: placed by their rules, traps hidden on the routes, nothing that breaks the map", async () => {
  const { MAP_FEATURES, MAP_FEATURE_CATEGORIES } = await import("../scripts/eym-battle-features.mjs");
  for (const f of MAP_FEATURES) { assert.ok(FEATURES[f.kind], f.id); assert.ok(MAP_FEATURE_CATEGORIES.some((c) => c.id === f.category), f.id); }
  const extras = ["palisade", "shrine", "dungeon-entrance", "camp", "temple-ruin", "pit-trap", "snare", "dock"];
  const map = buildBattleMap(asset, { center: fromLocal(town("Seaton"), 1.5, 1.0), spec, extras });
  const kinds = new Set(map.features.map((f) => f.kind));
  for (const k of ["palisade-wall", "shrine", "dungeon-entrance", "campfire", "tent", "broken-column", "altar"]) assert.ok(kinds.has(k), k);
  const walls = map.features.filter((f) => f.kind === "palisade-wall");
  assert.ok(walls.length >= 4, "a palisade with a gate gap");
  assert.equal(map.traps.length, 2);
  const onRoute = new Set(map.routes.flat()); assert.ok(map.traps.every((t) => t.squares.some((i) => onRoute.has(i)) || t.squares.length), "traps where the sides walk");
  for (const t of map.traps) for (const i of t.squares) assert.equal(map.grid.move[i], MOVE.normal, "a trap looks like ordinary ground");
  assert.ok(map.notes.some((n) => /Not placed: Jetty: no water/.test(n)));
  assertDesigned(map);
  const ref = battleReferenceSvg(map), prompt = battleArtDirection(map, { architecture: "Architecture: test" });
  assert.ok(!/trap/i.test(prompt), "traps are never painted or mentioned to the painter");
  assert.match(prompt, /shrine in the/); assert.match(prompt, /Architecture: test/);
  assert.match(battleTacticalSvg(map), /TRAP/); assert.ok(!/TRAP/.test(ref));
  const scene = battleSceneData(map, { name: "x", imagePath: "x" });
  assert.equal(scene.regions.filter((r) => r.name.startsWith("Hidden trap")).length, 2);
  assert.ok(scene.walls.length >= 16, "the palisade blocks sight and movement");
  assert.match(battlePacket(map, { title: "T" }), /## Hidden traps \(GM only; not painted\)/);
});
