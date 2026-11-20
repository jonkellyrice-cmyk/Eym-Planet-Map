import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COVER, insideCoast, localContext, roadsNear } from "../scripts/eym-local-detail.mjs";
import { toLocal } from "../scripts/eym-surface.mjs";
import { REGION_CELL_KM, REGION_TILE_CELLS, REGION_TILE_KM, buildRegionTile, regionFrameFor, regionFrameHasTile, regionFrames, regionTileAt } from "../scripts/eym-region-layer.mjs";
import { destination, greatCircleKm } from "../scripts/eym-surface.mjs";
import { REGION_PALETTE, flatRegionTile, renderRegionTile } from "../scripts/eym-region-paint.mjs";
import { REGION_FINGERPRINT_FILE, moduleClosure, regionFingerprint } from "../tools/generate-region-fingerprint.mjs";
import { attachCoasts, attachDrainage, attachFlow, attachGeology, attachWind, coastsFileName, drainageFileName, flowFileName, geologyFileName, windFileName } from "../scripts/cartography-asset.mjs";

const asset = JSON.parse(readFileSync(new URL("../data/planet-cartography/abydos/eventide.json", import.meta.url), "utf8"));
const frames = regionFrames(asset), caren = frames.find((f) => f.id === "caren"), DREE = [-6.79, 0.412];
const home = regionTileAt(caren, ...DREE), tile = buildRegionTile(asset, caren, home.tx, home.ty), N = REGION_TILE_CELLS, at = (t, c, r) => (r + t.pad) * (N + 2 * t.pad) + c + t.pad;

test("a flat frame is laid over Caren, Garyk and the sea between them, and a place falls in one tile of it", () => {
  assert.deepEqual(frames.map((f) => f.id).sort(), ["caren", "caren-garyk-sea", "garyk"]);
  assert.equal(REGION_TILE_KM, REGION_CELL_KM * REGION_TILE_CELLS); assert.equal(REGION_CELL_KM, 0.3);
  for (const f of frames) assert.ok(f.tiles.tx0 <= 0 && f.tiles.tx1 >= 0 && f.tiles.ty0 <= 0 && f.tiles.ty1 >= 0, `${f.id} holds its own centre`);
  assert.ok(home.px >= 0 && home.px < N && home.py >= 0 && home.py < N);
  // Dree lies south of Caren's centre: a tile or more down, and inside the frame's range.
  assert.ok(home.ty > 0 && home.ty <= caren.tiles.ty1 && home.tx >= caren.tiles.tx0 && home.tx <= caren.tiles.tx1);
});

test("only Caren, Garyk and the sea between them are framed, each under the store number it keeps for good", () => {
  const byId = Object.fromEntries(frames.map((f) => [f.id, f])), garyk = byId.garyk, sea = byId["caren-garyk-sea"];
  assert.deepEqual([caren.store, garyk.store, sea.store], [1, 2, 5], "Caren and Garyk keep the numbers they had among five frames");
  assert.deepEqual(caren.center, [-0.36, 0.06]); assert.deepEqual(garyk.center, [14.74, -79.25]);
  const count = (f) => { let n = 0; for (let ty = f.tiles.ty0; ty <= f.tiles.ty1; ty += 1) for (let tx = f.tiles.tx0; tx <= f.tiles.tx1; tx += 1) if (regionFrameHasTile(f, tx, ty)) n += 1; return n; };
  // Each continent holds its own islands only: no far-off island that belongs to no continent stretches it.
  assert.equal(count(caren), 464); assert.equal(count(garyk), 798);
  // The sea between: a corridor some 600 km wide along the shortest line between the two coasts.
  assert.ok(sea.corridor.halfWidthKm === 300 && count(sea) > 700 && count(sea) < 1000, `${count(sea)} tiles in the corridor`);
  for (const f of frames) assert.ok(regionFrameHasTile(f, 0, 0), `${f.id} holds its own centre`);
  const nearCaren = regionTileAt(sea, 8.6, -6), nearGaryk = regionTileAt(sea, 12.8, -64.5), offLine = regionTileAt(sea, 25, -35), gaffa = regionTileAt(caren, 5, 161);
  assert.ok(regionFrameHasTile(sea, nearCaren.tx, nearCaren.ty) && regionFrameHasTile(sea, nearGaryk.tx, nearGaryk.ty), "the corridor reaches both coasts");
  assert.ok(!regionFrameHasTile(sea, offLine.tx, offLine.ty), "open ocean away from the line is not in it");
  assert.ok(!regionFrameHasTile(caren, gaffa.tx, gaffa.ty), "Gaffa is in no frame");
});

test("a region tile is its shapes: cover by the local layer's kinds, height, shade, and the town on it", () => {
  assert.equal(tile.cover.length, (N + 4) ** 2); assert.equal(tile.pad, 2); assert.equal(tile.sea, false);
  const kinds = new Set(tile.cover); for (const k of kinds) assert.ok(Object.values(COVER).includes(k), `cover ${k}`);
  assert.ok(kinds.has(COVER.woods) || kinds.has(COVER.meadow) || kinds.has(COVER.scrub)); assert.ok(kinds.has(COVER.river) && !kinds.has(COVER.lake), "the river by Dree, not the old channel");
  const dree = tile.settlements.find((s) => s.name === "Dree"); assert.ok(dree, "Dree is on its tile");
  assert.ok(Math.abs(dree.px - home.px) < 1e-6 && Math.abs(dree.py - home.py) < 1e-6);
  assert.equal(tile.cover[at(tile, Math.floor(dree.px), Math.floor(dree.py))], COVER.built, "a town is at least a square of roofs");
  assert.ok(tile.roads.length > 0, "a road reaches it"); assert.ok(tile.elevation.some((v) => v > 20));
  assert.deepEqual(buildRegionTile(asset, caren, home.tx, home.ty).cover, tile.cover, "the same every time");
});

test("neighbouring tiles meet exactly: each one's margin is the other's edge", () => {
  const east = buildRegionTile(asset, caren, home.tx + 1, home.ty), south = buildRegionTile(asset, caren, home.tx, home.ty + 1);
  for (let k = 0; k < N; k += 1) {
    assert.equal(tile.cover[at(tile, N, k)], east.cover[at(east, 0, k)], `east edge, row ${k}`); assert.equal(east.cover[at(east, -1, k)], tile.cover[at(tile, N - 1, k)]);
    assert.equal(tile.cover[at(tile, k, N)], south.cover[at(south, k, 0)], `south edge, column ${k}`); assert.equal(tile.elevation[at(tile, N, k)], east.elevation[at(east, 0, k)]);
  }
});

test("open sea is a tile of sea, quickly made", () => {
  const sea = buildRegionTile(asset, caren, caren.tiles.tx1 + 6, caren.tiles.ty0 - 6);
  assert.equal(sea.sea, true); assert.ok(sea.cover.every((k) => k === COVER.sea)); assert.equal(sea.settlements.length, 0);
  const picture = renderRegionTile(sea), seaTones = new Set(REGION_PALETTE.sea.map((c) => c.join()));
  for (let i = 0; i < picture.length; i += 4) assert.ok(seaTones.has([picture[i], picture[i + 1], picture[i + 2]].join()));
});

test("pictures of a tile: a flat one for checking, and the pixel art from a fixed palette", () => {
  const flat = flatRegionTile(tile), art = renderRegionTile(tile);
  assert.equal(flat.length, N * N * 4); assert.equal(art.length, N * N * 4); assert.deepEqual(renderRegionTile(tile), art);
  for (let i = 3; i < art.length; i += 4) { assert.equal(art[i], 255); assert.equal(flat[i], 255); }
  const palette = new Set([REGION_PALETTE.coast, REGION_PALETTE.road, REGION_PALETTE.highway, ...Object.values(REGION_PALETTE).filter((v) => Array.isArray(v[0])).flat()].map((c) => c.join()));
  const used = new Set(); for (let i = 0; i < art.length; i += 4) used.add([art[i], art[i + 1], art[i + 2]].join());
  for (const colour of used) assert.ok(palette.has(colour), `${colour} is not in the palette`);
  assert.ok(used.size >= 8, "several kinds of ground in several tones");
});

test("the sea's bands follow the shore smoothly: no blocks of coarse squares, no octagons", () => {
  const coast = buildRegionTile(asset, caren, home.tx, home.ty + 1); let sea = 0, step = 0;
  for (let r = 0; r < N; r += 1) for (let c = 0; c + 1 < N; c += 1) { const i = at(coast, c, r), j = at(coast, c + 1, r); if (coast.cover[i] === COVER.sea && coast.cover[j] === COVER.sea) { sea += 1; step = Math.max(step, Math.abs(coast.coastKm[i] - coast.coastKm[j])); } }
  assert.ok(sea > 5000, "the tile south of Dree reaches the sea"); assert.ok(step <= 1, `neighbouring sea squares differ by ${step} km off the shore`);
});

test("lowland country is farmed well beyond the named towns", () => {
  for (const place of [[-1.202, -0.98], DREE]) {
    const h = regionTileAt(caren, ...place), t = buildRegionTile(asset, caren, h.tx, h.ty); let land = 0, farm = 0;
    for (let r = 0; r < N; r += 1) for (let c = 0; c < N; c += 1) { const k = t.cover[at(t, c, r)]; if (k !== COVER.sea) { land += 1; if (k === COVER.farmland) farm += 1; } }
    assert.ok(farm / land > 0.08, `${place}: ${(100 * farm / land).toFixed(1)}% farmland`);
  }
});

test("roads follow the land, not the lattice's eight directions", () => {
  const roads = roadsNear(localContext(asset), [-1.2, -0.98], 60); let total = 0, aligned = 0;
  for (const road of roads) {
    const pts = road.points.map((p) => toLocal(road.points[0], p[0], p[1])), along = [0];
    for (let k = 1; k < pts.length; k += 1) along.push(along[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    for (let k = 0, j = 0; k < pts.length; k += 1) {
      while (j < pts.length - 1 && along[j] - along[k] < 5) j += 1; if (along[j] - along[k] < 4.5) break;
      const heading = Math.atan2(pts[j][1] - pts[k][1], pts[j][0] - pts[k][0]) * 180 / Math.PI, off = ((heading % 45) + 45) % 45;
      total += 1; if (Math.min(off, 45 - off) < 3) aligned += 1;
    }
  }
  // Before roads followed the land, three quarters of their length ran within 3° of a lattice direction; chance alone gives about 13%.
  assert.ok(roads.length > 5 && aligned / total < 0.3, `${(100 * aligned / total).toFixed(0)}% of road length on lattice headings`);
});

test("the Region layer's fingerprint is current, covers its code and data, and keeps the painting apart", () => {
  const kept = JSON.parse(readFileSync(new URL(`../${REGION_FINGERPRINT_FILE}`, import.meta.url), "utf8")), now = regionFingerprint();
  assert.equal(kept.shapes, now.shapes, "npm run build would make it again"); assert.equal(kept.paint, now.paint, "npm run build would make it again");
  // The shapes' fingerprint follows the generator's imports, however deep, and the data the map server attaches.
  for (const f of ["scripts/eym-region-layer.mjs", "scripts/eym-local-detail.mjs", "scripts/eym-landforms.mjs", "scripts/eym-river-flow.mjs", "scripts/eym-geology.mjs", "data/planet-cartography/abydos/eventide.json", "data/planet-cartography/abydos/eventide-drainage.json", "data/planet-cartography/abydos/eventide-wind.json", "data/planet-cartography/abydos/eventide-flow.json", "data/planet-cartography/abydos/eventide-geology.json"]) assert.ok(now.shapesFiles.includes(f), f);
  // The painting depends on itself and the shared cover classes only, so a change to it alone repaints the kept shapes.
  assert.deepEqual(now.paintFiles, ["scripts/eym-cover.mjs", "scripts/eym-region-paint.mjs"]);
  assert.ok(!now.shapesFiles.includes("scripts/eym-region-paint.mjs"));
  assert.ok(moduleClosure("scripts/eym-local-detail.mjs").includes("scripts/eym-cover.mjs"));
});

test("a tile is the same whichever tiles were made before it", () => {
  // Tiles along coasts whose character once depended on which tile asked first (found when the store was refreshed
  // several ranges at once): each must come out the same alone, after its neighbours, and in the opposite order.
  const garyk = frames.find((f) => f.id === "garyk"), wanted = [["caren", -5, 2], ["caren", -5, 3], ["garyk", 7, 1], ["garyk", 8, 1], ["garyk", 7, 2], ["garyk", 8, 2]];
  // The world as the map server holds it: with its geology, drainage, wind, river flow and coasts attached.
  const part = (name) => JSON.parse(readFileSync(new URL(`../data/planet-cartography/abydos/${name}`, import.meta.url), "utf8"));
  const whole = () => { const copy = structuredClone(asset); attachGeology(copy, part(geologyFileName("eventide.json"))); attachDrainage(copy, part(drainageFileName("eventide.json"))); attachWind(copy, part(windFileName("eventide.json"))); attachFlow(copy, part(flowFileName("eventide.json"))); attachCoasts(copy, part(coastsFileName("eventide.json"))); return copy; };
  const fresh = () => { const copy = whole(), own = regionFrames(copy); return (id, tx, ty) => buildRegionTile(copy, own.find((f) => f.id === id), tx, ty); };
  const digest = (t) => [t.cover, t.elevation, t.shade, t.coastKm].map((a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString("base64")).join("|") + JSON.stringify([t.rivers, t.roads, t.settlements]);
  const forward = fresh(), backward = fresh(), a = new Map(), b = new Map();
  for (const w of wanted) a.set(w.join(), digest(forward(...w)));
  for (const w of [...wanted].reverse()) b.set(w.join(), digest(backward(...w)));
  for (const w of wanted) assert.equal(b.get(w.join()), a.get(w.join()), `${w.join(" ")} depends on the order of making`);
  // And alone, in a world that has made nothing else.
  for (const w of [wanted[1], wanted[3]]) assert.equal(digest(fresh()(...w)), a.get(w.join()), `${w.join(" ")} alone`);
  assert.ok(garyk);
});

// ---------------------------------------------------------------- frames across ±180° and out of scope (land-growth scaling, Fix 6)

test("a detailed land that lay across ±180° would get a frame about its true middle, and tiles that join across the seam", () => {
  // Caren's name on a land 1,000 km across that straddles the date line, with an island beyond it.
  const center = [12, -179.4], round = (at, km) => Array.from({ length: 90 }, (_, i) => destination(at, i * 4, km));
  const world = { terrain: { coastlines: [{ continent: "Caren", kind: "mainland", points: round(center, 500) }, { continent: "Caren", kind: "island", points: round(destination(center, 90, 700), 60) }] } };
  const frame = regionFrameFor(world, { name: "Caren", store: 1 });
  assert.ok(greatCircleKm(frame.center, center) < 15, `its centre ${frame.center} is the middle of the land`);
  const { tx0, tx1, ty0, ty1 } = frame.tiles;
  // 1,000 km of mainland and an island 760 km east of its middle: some 16 tiles by 14, not a band round the world.
  assert.ok(tx0 >= -8 && tx0 <= -6 && tx1 >= 9 && tx1 <= 11 && ty0 >= -8 && ty0 <= -6 && ty1 >= 6 && ty1 <= 8, JSON.stringify(frame.tiles));
  // Two places 20 km apart on either side of the seam fall in the same or neighbouring tiles, the right way round.
  const west = regionTileAt(frame, 12, 179.95), east = regionTileAt(frame, 12, -179.87);
  assert.ok(east.tx - west.tx >= 0 && east.tx - west.tx <= 1 && east.ty === west.ty);
  assert.ok(Math.abs((east.tx - west.tx) * REGION_TILE_CELLS + east.px - west.px - 19.6 / REGION_CELL_KM) < 2, "20 km apart on the frame too");
});

test("the Region layer refuses a frame for land outside the detailed scope, by name and by size", () => {
  assert.throws(() => regionFrameFor(asset, { name: "Gaffa", store: 9 }), /Caren and Garyk and the sea between them only: Gaffa is outside it/);
  // Caren's name on a land the size the far continents are to become: no flat frame holds it.
  const huge = { terrain: { coastlines: [{ continent: "Caren", kind: "mainland", points: Array.from({ length: 180 }, (_, i) => destination([10, 40], i * 2, 3200)) }] } };
  assert.throws(() => regionFrameFor(huge, { name: "Caren", store: 1 }), /too large for the Region layer/);
  // Today's frames are well inside the limit and are what they were.
  assert.deepEqual(frames.map((f) => f.id), ["caren", "garyk", "caren-garyk-sea"]);
  assert.deepEqual(regionFrameFor(asset, { name: "Caren", store: 1 }), caren);
});

// ---------------------------------------------------------------- lands on the far side of the world (the rebuild after the growth)

test("a continent that covers the point opposite a frame's centre is not drawn round the frame", () => {
  // Since the canon of 19 November 2026 Gaffa is 65 million km² and holds the points opposite Caren's middle and the
  // strait's. On a flat frame the far side of the world is the rim, so Gaffa's outline, laid on Caren's frame, went
  // right round it and every square of Caren counted as inside two lands: as sea.
  const ctx = localContext(asset), strait = frames.find((f) => f.id === "caren-garyk-sea");
  for (const frame of [caren, strait]) assert.ok(insideCoast(ctx, -frame.center[0], frame.center[1] > 0 ? frame.center[1] - 180 : frame.center[1] + 180), `${frame.id}: the opposite point is on land`);
  const middle = buildRegionTile(asset, caren, 0, 0); assert.ok(!middle.sea, "the middle of Caren is land");
  let land = 0; for (const v of middle.cover) if (v !== COVER.sea) land += 1; assert.ok(land > middle.cover.length * 0.9, `${land} squares of land`);
  const open = buildRegionTile(asset, strait, 0, 0); assert.ok(open.sea, "the middle of the strait is sea");
});
