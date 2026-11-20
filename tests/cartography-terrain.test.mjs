import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRefinedTerrain } from "../scripts/planet-cartography.mjs";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("data/planet-geography/manifest.json", root), "utf8"));
const load = (body) => JSON.parse(readFileSync(new URL(manifest.worlds.find((world) => world.body === body).path, root), "utf8"));

test("accepted coarse geography deterministically anchors a two-degree terrain mesh", () => {
  const eym = load("Eym"), first = buildRefinedTerrain(eym), second = buildRefinedTerrain(eym);
  assert.equal(first.grid.latCount, 90); assert.equal(first.grid.lonCount, 180); assert.equal(first.cells.length, 16_200);
  assert.deepEqual(first, second);
  assert.equal(first.sourceSeed, eym.seed); assert.equal(first.sourceFingerprint, eym.inputFingerprint);
});

test("sea-level fitting preserves canonical water coverage at refined resolution", () => {
  for (const body of ["Eym", "Bruthi", "Esonth", "Lilta"]) {
    const coarse = load(body), refined = buildRefinedTerrain(coarse);
    assert.ok(Math.abs(refined.realizedWaterFraction - coarse.realizedWaterFraction) <= .001, body);
  }
});

test("coastlines are smoothed closed vectors rather than coarse cell markers", () => {
  const refined = buildRefinedTerrain(load("Esonth"));
  assert.ok(refined.coastlines.length); assert.ok(refined.landPolygons.length);
  for (const coast of refined.coastlines) { assert.equal(coast.closed, true); assert.deepEqual(coast.points[0], coast.points.at(-1)); assert.ok(coast.points.length >= 9); }
});

test("generic refinement splits a generated world's land into several polygons", () => {
  const refined = buildRefinedTerrain(load("Esonth"));
  assert.ok(refined.landPolygons.length >= 2);
});

test("refinement rejects resolutions that cannot preserve accepted grid alignment", () => {
  assert.throws(() => buildRefinedTerrain(load("Eym"), { resolutionDeg: 4 }), /evenly subdivide/);
});
