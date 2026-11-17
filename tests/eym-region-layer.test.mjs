import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COVER } from "../scripts/eym-local-detail.mjs";
import { REGION_CELL_KM, REGION_PALETTE, REGION_TILE_CELLS, REGION_TILE_KM, buildRegionTile, flatRegionTile, regionFrames, regionTileAt, renderRegionTile } from "../scripts/eym-region-layer.mjs";

const asset = JSON.parse(readFileSync(new URL("../data/planet-cartography/abydos/eventide.json", import.meta.url), "utf8"));
const frames = regionFrames(asset), caren = frames.find((f) => f.id === "caren"), DREE = [-6.79, 0.412];
const home = regionTileAt(caren, ...DREE), tile = buildRegionTile(asset, caren, home.tx, home.ty), N = REGION_TILE_CELLS, at = (t, c, r) => (r + t.pad) * (N + 2 * t.pad) + c + t.pad;

test("a flat frame is laid over each continent, and a place falls in one tile of it", () => {
  assert.deepEqual(frames.map((f) => f.id).sort(), ["caren", "eastern-continent", "garyk", "northern-continent", "southern-continent"]);
  assert.equal(REGION_TILE_KM, REGION_CELL_KM * REGION_TILE_CELLS); assert.equal(REGION_CELL_KM, 0.3);
  for (const f of frames) assert.ok(f.tiles.tx0 <= 0 && f.tiles.tx1 >= 0 && f.tiles.ty0 <= 0 && f.tiles.ty1 >= 0, `${f.id} holds its own centre`);
  assert.ok(home.px >= 0 && home.px < N && home.py >= 0 && home.py < N);
  // Dree lies south of Caren's centre: a tile or more down, and inside the frame's range.
  assert.ok(home.ty > 0 && home.ty <= caren.tiles.ty1 && home.tx >= caren.tiles.tx0 && home.tx <= caren.tiles.tx1);
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
