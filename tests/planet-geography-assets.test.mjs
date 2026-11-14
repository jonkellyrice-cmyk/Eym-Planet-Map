import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("data/planet-geography/manifest.json", root), "utf8"));
const load = (entry) => JSON.parse(readFileSync(new URL(entry.path, root), "utf8"));

test("manifest contains 4 unique accepted-seed terrestrial realizations", () => {
  assert.equal(manifest.worlds.length, 4);
  assert.equal(new Set(manifest.worlds.map((world) => `${world.system}/${world.body}`)).size, 4);
  assert.ok(manifest.worlds.every((world) => world.seed && world.inputFingerprint && world.path));
});

test("every inhabited world has literal physical and civilization geometry", () => {
  for (const entry of manifest.worlds) {
    const world = load(entry);
    assert.ok(world.cells.length && world.plateModel.length, `${entry.body}: terrain`);
    assert.ok(world.coastlines.length, `${entry.body}: coastlines`);
    assert.ok(world.rivers.length && world.lakes.length, `${entry.body}: hydrology`);
    assert.ok(world.cells.every((cell) => cell.biome && cell.soil && cell.resource), `${entry.body}: surface layers`);
    assert.ok(world.settlements.length, `${entry.body}: settlements`);
    assert.equal(world.transportRoutes.length, world.settlements.length - 1, `${entry.body}: routes`);
  }
});

test("Eym's coarse summary records its five continents in a planet-wide ocean", () => {
  const entry = manifest.worlds.find((world) => world.body === "Eventide");
  const world = load(entry);
  assert.ok(world.realizedWaterFraction >= .98);
  assert.equal(world.surface.continents.length, 5);
  assert.ok(world.cells.filter((cell) => !cell.ocean).length < world.cells.length * .03);
});
