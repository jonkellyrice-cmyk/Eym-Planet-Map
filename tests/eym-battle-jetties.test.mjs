import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBattleMap, geometryHash } from "../scripts/eym-battle-rules.mjs";
import { buildInteriors, floorOutline } from "../scripts/eym-battle-interiors.mjs";
import { battleScenePlan } from "../scripts/eym-battle-scene.mjs";
import { lineOfSight } from "../scripts/eym-battle-terrain.mjs";
import { MOVE } from "../scripts/eym-battle-settings.mjs";
import { battleMapSpec } from "../scripts/eym-map-presets.mjs";
import { renderBattleLayers } from "../webapp/render/render-battle.mjs";
import { parseRequest } from "../webapp/server.mjs";

const asset = JSON.parse(readFileSync(new URL("../data/planet-cartography/mitkear/eym.json", import.meta.url), "utf8"));
const dree = asset.settlements.find((s) => s.properName === "Dree"), center = [dree.lat, dree.lon];
const spec = battleMapSpec({ size: "custom", columns: 24, rows: 18, density: "custom", gridPx: 70 });
const map = buildBattleMap(asset, { center, spec, setting: "urban", style: "dree" }), plain = buildBattleMap(asset, { center, spec, setting: "urban" });
const interiors = buildInteriors(map), { columns, rows } = spec, g = map.grid;
const within = (a, b) => a.x0 <= b.x0 && a.y0 <= b.y0 && a.x1 >= b.x1 && a.y1 >= b.y1;

test("Dree builds top-heavy: taller houses whose upper floors step out over the street; the generic style does not", () => {
  const jettied = map.buildings.filter((b) => b.floorRects);
  assert.ok(jettied.length >= 3, `${jettied.length} houses overhang`);
  assert.ok(map.buildings.some((b) => b.storeys === 3));
  for (const b of jettied) {
    let prev = { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
    for (let f = 1; f < b.storeys; f += 1) { const r = b.floorRects[f]; assert.ok(within(r, prev), "each storey contains the one below"); prev = r; }
  }
  assert.ok(!plain.buildings.some((b) => b.floorRects)); assert.deepEqual(plain.skybridges, []); assert.ok(!plain.grid.overUnder.some(Boolean));
  assert.notEqual(geometryHash(map), geometryHash(plain), "the style is part of the map");
  assert.equal(geometryHash(buildBattleMap(asset, { center, spec, setting: "urban", style: "dree" })), geometryHash(map), "deterministic");
});

test("under an overhang: street you can walk, with a ceiling; never over a building, a tree or a tall feature", () => {
  let n = 0;
  for (let i = 0; i < columns * rows; i += 1) {
    if (!g.overUnder[i]) continue; n += 1;
    assert.ok(g.building[i] < 0, "not inside a building's ground floor");
    assert.notEqual(g.move[i], MOVE.impassable); assert.ok(g.overUnder[i] >= g.levelFt[i] + 10 && g.overTop[i] > g.overUnder[i]);
  }
  assert.ok(n > 0);
  for (const o of map.objects.filter((o) => o.kind === "tree")) assert.equal(g.overUnder[Math.floor(o.y) * columns + Math.floor(o.x)], 0);
  // Sight: under the slab is clear at eye height; through it, 15 ft up, is not.
  const clear = (p, q) => p >= 0 && q >= 0 && p < columns && q < rows && g.building[q * columns + p] < 0 && g.solidFt[q * columns + p] < 5 && g.levelFt[q * columns + p] === 0;
  let checked = 0;
  for (let i = 0; i < columns * rows && !checked; i += 1) {
    if (!g.overUnder[i] || g.levelFt[i] !== 0) continue; const x = i % columns, y = Math.floor(i / columns);
    const path = [[x - 1, y, x + 1, y], [x, y - 1, x, y + 1]].find(([ax, ay, bx, by]) => clear(ax, ay) && clear(bx, by) && !g.overUnder[ay * columns + ax] && !g.overUnder[by * columns + bx]);
    if (!path) continue;
    const a = path[1] * columns + path[0], b = path[3] * columns + path[2];
    assert.equal(lineOfSight(g, a, b, { eyeA: 5, eyeB: 5 }).visible, true, "clear beneath the slab");
    assert.equal(lineOfSight(g, a, b, { eyeA: 15, eyeB: 15 }).visible, false, "blocked through the slab");
    checked += 1;
  }
  assert.equal(checked, 1, "found a square under an overhang to look across");
});

test("skybridges join two buildings' first floors over open ground; doors at both ends; lifts in the tallest houses", () => {
  assert.ok(map.skybridges.length >= 1);
  for (const k of map.skybridges) {
    const A = map.buildings.find((b) => b.id === k.a), B = map.buildings.find((b) => b.id === k.b);
    assert.ok(A.storeys >= 2 && B.storeys >= 2);
    for (let y = k.y0; y <= k.y1; y += 1) for (let x = k.x0; x <= k.x1; x += 1) { const i = y * columns + x; assert.ok(g.building[i] < 0); assert.equal(g.overUnder[i], k.level + 10); }
    const bridge = interiors.find((b) => b.id === k.id); assert.deepEqual(bridge.floors.map((f) => f.floor), [1]);
    for (const id of [k.a, k.b]) assert.ok(interiors.find((b) => b.id === id).floors.find((f) => f.floor === 1).walls.some((w) => w.door && w.outer), "a door onto the bridge");
  }
  const tall = interiors.filter((b) => b.stairs?.kind === "lift");
  assert.ok(tall.length > 0); for (const b of tall) assert.equal(map.buildings.find((x) => x.id === b.id).storeys, 3);
});

test("interiors and the scene follow each floor's own outline", () => {
  for (const b of map.buildings.filter((x) => x.floorRects)) {
    const inner = interiors.find((x) => x.id === b.id), up = floorOutline(inner, 1);
    assert.deepEqual([up.x0, up.y0, up.x1, up.y1], [b.floorRects[1].x0, b.floorRects[1].y0, b.floorRects[1].x1, b.floorRects[1].y1]);
    const rooms = inner.floors.find((f) => f.floor === 1).rooms, area = rooms.reduce((s, r) => s + (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1), 0);
    assert.equal(area, (up.x1 - up.x0 + 1) * (up.y1 - up.y0 + 1), "the upper floor's rooms fill its larger outline");
  }
  const plan = battleScenePlan(map, interiors, { name: "Dree", images: { ground: "g", roofs: {}, floors: {} }, style: "dree" });
  assert.ok(plan.regions.some((r) => /^Lift/.test(r.name) && r.behaviors[0].type === "changeLevel"));
  assert.ok(plan.regions.some((r) => /^Overhead/.test(r.name)));
  assert.ok(plan.walls.some((w) => String(w.flags?.["eym-planet-map"]?.building).startsWith("bridge") && w.levelKeys[0] === "floor1"));
});

test("the art: the ground layer shows the shaded street under overhangs; the server builds the same map", () => {
  const L = renderBattleLayers(map, interiors, { gridPx: 70, style: "dree" }), P = L.native;
  const i = g.overUnder.findIndex(Boolean), px = ((i % columns) * P + P / 2) | 0, py = (Math.floor(i / columns) * P + P / 2) | 0, k = (py * L.ground.width + px) * 4;
  assert.notDeepEqual([...L.ground.data.subarray(k, k + 3)], [...L.exterior.data.subarray(k, k + 3)], "under the overhang, not on its roof");
  const request = parseRequest({ center, columns: 24, rows: 18, gridPx: 70, setting: "urban" });
  assert.equal(request.style, "dree");
  assert.equal(geometryHash(buildBattleMap(asset, request)), geometryHash(map));
});

test("Dree is packed: narrow streets, back alleys, every lot built, few trees", () => {
  const built = (m) => m.grid.building.filter((v) => v >= 0).length;
  assert.ok(built(map) > built(plain) * 1.15, `${built(map)} built squares vs ${built(plain)}`);
  assert.ok(map.features.filter((f) => f.kind === "planter-tree").length <= 2);
  assert.ok(!map.grid.ground.some((x) => x === "yard"), "no yards: the gaps are alleys");
  // No street run wider than five squares across, between two buildings, in either direction.
  let widest = 0;
  for (let y = 0; y < rows; y += 1) { let run = 0, open = false; for (let x = 0; x < columns; x += 1) { const i = y * columns + x; if (g.building[i] >= 0) { if (open) widest = Math.max(widest, run); run = 0; open = true; } else run += 1; } }
  for (let x = 0; x < columns; x += 1) { let run = 0, open = false; for (let y = 0; y < rows; y += 1) { const i = y * columns + x; if (g.building[i] >= 0) { if (open) widest = Math.max(widest, run); run = 0; open = true; } else run += 1; } }
  assert.ok(widest <= 5, `widest street between houses: ${widest} squares`);
});

test("machinery: boilers on upper-storey fronts, roof machines, pipes across lanes, gizmos inside, each glowing one a Foundry light", async () => {
  const { styleMachinery } = await import("../scripts/eym-building-styles.mjs");
  const m = styleMachinery(map, "dree"), none = styleMachinery(map, "default");
  assert.deepEqual(none, { wall: [], roof: [], pipes: [] });
  assert.ok(m.wall.length >= 3 && m.roof.length >= 2 && m.pipes.length >= 1);
  for (const w of m.wall) { const b = map.buildings.find((x) => x.id === w.building); assert.ok(w.floor >= 1 && w.floor < b.storeys); }
  for (const p of m.pipes) for (let x = p.x0; x <= p.x1; x += 1) assert.ok(g.building[p.y * columns + x] < 0, "pipes span open lane");
  assert.deepEqual(styleMachinery(map, "dree"), m, "deterministic");
  const kinds = new Set(interiors.flatMap((b) => b.floors.flatMap((f) => f.furniture.map((it) => it.kind))));
  for (const k of ["crystal-boiler", "pipework", "gear-press", "aether-coil"]) assert.ok(kinds.has(k), k);
  const plan = battleScenePlan(map, interiors, { name: "Dree", images: { ground: "g", roofs: {}, floors: {} }, style: "dree" }), lit = (k) => plan.lights.filter((l) => l.flags["eym-planet-map"].light === k);
  assert.equal(lit("fire-crystal").length, m.wall.length + interiors.flatMap((b) => b.floors.flatMap((f) => f.furniture)).filter((it) => it.kind === "crystal-boiler").length);
  assert.ok(lit("aether").length >= 1);
  assert.ok(!buildInteriors(plain).some((b) => b.floors.some((f) => f.furniture.some((it) => it.kind === "crystal-boiler"))), "the generic style has none");
});
