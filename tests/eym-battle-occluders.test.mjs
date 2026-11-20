import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBattleMap } from "../scripts/eym-battle-rules.mjs";
import { FURNITURE, buildInteriors } from "../scripts/eym-battle-interiors.mjs";
import { battleScenePlan } from "../scripts/eym-battle-scene.mjs";
import { battleSceneData } from "../scripts/eym-battle-render.mjs";
import { EYE_HEIGHT_FT, battleOccluders, occluderOutline, occluderWalls, shadowingOccluders } from "../scripts/eym-battle-occluders.mjs";
import { battleMapSpec } from "../scripts/eym-map-presets.mjs";

const asset = JSON.parse(readFileSync(new URL("../data/planet-cartography/mitkear/eym.json", import.meta.url), "utf8"));
const s = asset.settlements.find((x) => x.properName);
const spec = battleMapSpec({ size: "custom", columns: 30, rows: 24, density: "custom", gridPx: 140 });
const make = (setting) => { const map = buildBattleMap(asset, { center: [s.lat, s.lon], spec, setting, extras: [] }), interiors = buildInteriors(map); return { map, interiors, plan: battleScenePlan(map, interiors, { name: "t", images: { ground: "g.png", roofs: {}, floors: {} } }) }; };
const town = make("urban"), hall = make("dwarven-hall");
const light = (x, y, elevation, levelKey = "floor0", dim = 20) => ({ levelKeys: [levelKey], x, y, elevation, config: { dim } });

test("every piece of furniture has a height; rugs lie flat", () => {
  for (const [k, f] of Object.entries(FURNITURE)) assert.ok(Number.isFinite(f.heightFt), k);
  assert.equal(FURNITURE.rug.heightFt, 0); assert.ok(FURNITURE.wardrobe.heightFt >= EYE_HEIGHT_FT); assert.ok(FURNITURE.table.heightFt < 4);
});

test("occluders: furniture on its floor's level, features outside, never walls, rises or the lights themselves", () => {
  const occ = battleOccluders(town.map, town.interiors);
  assert.ok(occ.some((o) => FURNITURE[o.kind]) && occ.every((o) => o.top > o.base && o.levelKey === `floor${o.floor}`));
  assert.ok(!occ.some((o) => ["hearth", "rug", "rise", "campfire"].includes(o.kind)));
  for (const o of occ.filter((o) => o.floor > 0)) assert.ok(o.base >= 10 * o.floor);
});

test("only an object taller than a light near it shadows it", () => {
  const P = 100, table = { levelKey: "floor0", floor: 0, kind: "table", x: 2, y: 2, w: 2, h: 1, base: 0, heightFt: 2.5, top: 2.5 }, wardrobe = { ...table, kind: "wardrobe", w: 1, heightFt: 7, top: 7 };
  const candle = [light(150, 450, 4)];
  assert.equal(shadowingOccluders([table], candle, { gridPx: P })[0].shadows, 0);
  assert.equal(shadowingOccluders([wardrobe], candle, { gridPx: P })[0].shadows, 1);
  assert.equal(shadowingOccluders([wardrobe], [light(150, 450, 4, "floor1")], { gridPx: P })[0].shadows, 0, "another floor");
  assert.equal(shadowingOccluders([wardrobe], [light(2000, 2000, 4)], { gridPx: P })[0].shadows, 0, "out of reach");
  assert.equal(shadowingOccluders([wardrobe], [light(150, 450, 9)], { gridPx: P })[0].shadows, 0, "a light above it");
  const walls = occluderWalls([wardrobe], candle, { gridPx: P });
  assert.equal(walls.length, 4); for (const w of walls) { assert.equal(w.move, 0); assert.equal(w.light, 20); assert.equal(w.sight, 20); assert.deepEqual(w.flags["wall-height"], { bottom: 0, top: 7 }); }
  const crates = occluderWalls([{ ...wardrobe, kind: "crates", heightFt: 5, top: 5 }], candle, { gridPx: P });
  assert.ok(crates.every((w) => w.sight === 0 && w.light === 20), "below eye height: light only");
  assert.equal(occluderOutline({ ...wardrobe, round: true }, P).length, 8);
});

test("scenes carry the occluder walls and the full list in their flags; candles never stand in a tall piece", () => {
  for (const { plan } of [town, hall]) {
    const ow = plan.walls.filter((w) => w.flags?.["eym-planet-map"]?.occluder);
    assert.ok(ow.length > 0); assert.ok(ow.every((w) => w.flags["wall-height"].top > w.flags["wall-height"].bottom && w.move === 0 && w.sound === 0));
    assert.ok(plan.scene.flags["eym-planet-map"].occluders.length >= ow.length / 8);
  }
  assert.ok(hall.plan.walls.some((w) => ["pillar", "statue"].includes(w.flags?.["eym-planet-map"]?.occluder)));
  for (const b of town.interiors) for (const f of b.floors) for (const it of f.furniture) if (FURNITURE[it.kind].heightFt > 3)
    for (const l of town.plan.lights.filter((l) => l.levelKeys[0] === `floor${f.floor}` && /candle|lamp/.test(l.name))) assert.ok(!(l.x > it.x * 140 && l.x < (it.x + it.w) * 140 && l.y > it.y * 140 && l.y < (it.y + it.h) * 140), `${l.name} inside ${it.kind}`);
  const legacy = battleSceneData(hall.map, { name: "x", imagePath: "a.png" });
  assert.ok(legacy.walls.some((w) => w.flags?.["eym-planet-map"]?.occluder) && legacy.flags["eym-planet-map"].occluders.length > 0);
});
