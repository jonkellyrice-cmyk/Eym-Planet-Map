import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv } from "../scripts/system-data.mjs";
import { createRng, generatePlanetGeography, generatePlateModel } from "../scripts/planet-geography.mjs";

const rows = parseCsv(readFileSync(new URL("../docs/system-orbital-distances.csv", import.meta.url), "utf8"));
const byName = Object.fromEntries(rows.filter((row) => row.geography_seed).map((row) => [row.object, row]));

test("seeded random stream and plate model are reproducible", () => {
  const a = createRng("fixed"), b = createRng("fixed");
  assert.deepEqual(Array.from({ length: 12 }, () => a()), Array.from({ length: 12 }, () => b()));
  assert.deepEqual(generatePlateModel(byName.Eym), generatePlateModel(byName.Eym));
});

test("same inputs recreate byte-equivalent literal geography", () => {
  const a = generatePlanetGeography(byName.Eym, { resolutionDeg: 12 });
  const b = generatePlanetGeography(byName.Eym, { resolutionDeg: 12 });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("sea-level fitting tracks canonical water inventory", () => {
  for (const name of ["Eym", "Bruthi", "Esonth", "Lilta"]) {
    const world = generatePlanetGeography(byName[name], { resolutionDeg: 12 });
    assert.ok(Math.abs(world.realizedWaterFraction - Number(byName[name].water_pct) / 100) <= .02, name);
  }
});

test("generated world contains causal physical and human feature layers", () => {
  const world = generatePlanetGeography(byName.Esonth, { resolutionDeg: 12 });
  assert.equal(world.plateModel.length, Number(byName.Esonth.major_plate_count));
  assert.ok(world.coastlines.length > 10);
  assert.ok(world.rivers.length > 0);
  assert.ok(world.cells.some((cell) => cell.biome.includes("forest")));
  assert.ok(world.cells.some((cell) => cell.resource));
  assert.equal(world.settlements[0].kind, "capital");
  assert.ok(world.transportRoutes.length > 0);
});

test("physical extremes produce distinct deterministic realizations", () => {
  const ocean = generatePlanetGeography(byName.Eym, { resolutionDeg: 12 });
  const dry = generatePlanetGeography(byName.Bruthi, { resolutionDeg: 12 });
  const cold = generatePlanetGeography(byName.Lilta, { resolutionDeg: 12 });
  // Mitkear's driest seeded world (Bruthi, 18% water) is not as dry as the removed fixture, so the
  // fixed 5× contrast is replaced by the canonical contrast itself, held to 5%. (It was 86% ÷ 18% ≈ 4.8×; since the
  // canon of 19 November 2026, Eym about 80% water, it is 79.9% ÷ 18% ≈ 4.4×.)
  const canonicalRatio = Number(byName.Eym.water_pct) / Number(byName.Bruthi.water_pct);
  assert.ok(Math.abs(ocean.realizedWaterFraction / dry.realizedWaterFraction - canonicalRatio) <= canonicalRatio * .05);
  assert.ok(canonicalRatio > 4);
  assert.ok(dry.cells.filter((cell) => cell.biome.includes("desert")).length > ocean.cells.filter((cell) => cell.biome.includes("desert")).length);
  assert.ok(cold.cells.filter((cell) => ["ice-cap", "tundra", "cold-desert"].includes(cell.biome)).length > 0);
});
