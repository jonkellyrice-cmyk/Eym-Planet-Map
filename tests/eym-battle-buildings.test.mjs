import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildingShape, chamferSegment, doorEdge, footprintPolygon, shapeEdges, shapeSquares } from "../scripts/eym-battle-buildings.mjs";
import { buildBattleMap } from "../scripts/eym-battle-rules.mjs";
import { buildInteriors } from "../scripts/eym-battle-interiors.mjs";
import { battleScenePlan } from "../scripts/eym-battle-scene.mjs";
import { battleMapSpec } from "../scripts/eym-map-presets.mjs";
import { fromLocal } from "../scripts/eym-surface.mjs";

const asset = JSON.parse(readFileSync(new URL("../data/planet-cartography/mitkear/eym.json", import.meta.url), "utf8"));
const at = (n, dx, dy) => { const s = asset.settlements.find((x) => x.properName === n); return fromLocal([s.lat, s.lon], dx, dy); };

test("shapes: an L leaves a back corner as yard and keeps the front whole; cut corners are on the street side; temples are cut all round", () => {
  const rect = { x0: 0, y0: 0, x1: 5, y1: 3 };
  let L = null, cut = null;
  for (let k = 0; k < 200 && (!L || !cut); k += 1) { const s = buildingShape(rect, { door: "s", key: `k${k}` }); if (s.rects.length > 1) L = L ?? s; if (s.chamfers.length) cut = cut ?? s; }
  assert.ok(L && cut);
  const sq = shapeSquares(L); assert.ok(sq.size < 24 && sq.size >= 16);
  for (let x = 0; x <= 5; x += 1) assert.ok(sq.has(`${x},3`), "the street front is whole");
  assert.ok(!sq.has("0,0") || !sq.has("5,0"), "a back corner is yard");
  assert.ok(cut.chamfers.every((c) => c.corner.startsWith("s")), "cut corners face the street");
  assert.deepEqual(buildingShape({ x0: 0, y0: 0, x1: 4, y1: 4 }, { label: "temple" }).chamfers.map((c) => c.corner), ["nw", "ne", "sw", "se"]);
  assert.deepEqual(buildingShape(rect, { label: "mausoleum", shapes: false }).rects, [rect]);
  // The door is on a straight wall of the front; the outline has the diagonals.
  const d = doorEdge(cut, "s"); assert.equal(d.side, "s"); assert.ok(!d.chamfer);
  assert.equal(shapeEdges(cut).filter((e) => e.chamfer).length, cut.chamfers.length * 2);
  assert.deepEqual(chamferSegment({ x: 2, y: 3, corner: "se" }), [3, 3, 2, 4]);
  assert.equal(footprintPolygon({ rects: [rect], chamfers: [{ x: 5, y: 3, corner: "se" }] }).length, 5);
});

test("towns get L-shaped and cut-corner houses; interiors, walls and scene follow the true outline", () => {
  const map = buildBattleMap(asset, { center: at("Lyle", 0.2, 0.15), spec: battleMapSpec() });
  const Ls = map.buildings.filter((b) => b.rects.length > 1), cuts = map.buildings.filter((b) => b.chamfers.length);
  assert.ok(Ls.length >= 2 && cuts.length >= 3, `${Ls.length} L, ${cuts.length} cut`);
  for (const b of cuts) for (const c of b.chamfers) assert.equal(map.grid.building[c.y * 24 + c.x] === b.id || c.x < 0 || c.y < 0 || c.x >= 24 || c.y >= 30, true, "a cut corner square stays inside");
  const interiors = buildInteriors(map);
  for (const b of interiors.filter((x) => x.rects.length > 1)) for (const f of b.floors) {
    const joinDoors = f.walls.filter((w) => !w.outer && w.door && !w.diag); assert.ok(joinDoors.length >= f.rooms.length - 1, "a door joins the wings");
  }
  for (const b of interiors.filter((x) => x.chamfers.length)) {
    const ground = b.floors.find((f) => f.floor === 0);
    assert.equal(ground.walls.filter((w) => w.diag).length, b.chamfers.length, "a diagonal wall per cut corner");
    for (const it of ground.furniture) for (const c of b.chamfers) assert.ok(!(c.x >= it.x && c.x < it.x + it.w && c.y >= it.y && c.y < it.y + it.h), "nothing stands in a cut corner");
  }
  const plan = battleScenePlan(map, interiors, { name: "x", images: { ground: "g", roofs: {}, floors: {} } });
  const diagonal = plan.walls.filter((w) => w.c[0] !== w.c[2] && w.c[1] !== w.c[3]);
  assert.ok(diagonal.length >= cuts.reduce((s, b) => s + b.chamfers.length, 0), "Foundry gets the diagonal walls");
  assert.ok(map.routes.length >= 2);
});
