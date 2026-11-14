import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url), manifest = JSON.parse(readFileSync(new URL("data/planet-cartography/manifest.json", root), "utf8"));
const load = (entry) => JSON.parse(readFileSync(new URL(entry.path, root), "utf8"));
const expectedProfile = { Abydos: "vadan" };
// Eym's surface is authored (Caren, Garyk) and seeded (eym-surface-v1); the other worlds use the generic pipeline.
const isEym = (world) => world.modelVersion === "eym-surface-v1";

test("all 4 Abydos refined surfaces and hashes are explicitly accepted as working canon", () => {
  assert.equal(manifest.status, "accepted-working-canon");
  assert.equal(manifest.worlds.length, 4);
  for (const entry of manifest.worlds) {
    const text = readFileSync(new URL(entry.path, root), "utf8"), asset = JSON.parse(text);
    assert.equal(asset.status, "accepted-working-canon", entry.body);
    assert.equal(createHash("sha256").update(text).digest("hex"), entry.sha256, entry.body);
    assert.equal(asset.sourceSeed, entry.sourceSeed, entry.body);
    assert.equal(asset.sourceFingerprint, entry.sourceFingerprint, entry.body);
  }
});

test("accepted canon contains detailed physical, ecological and civilization geometry", () => {
  for (const entry of manifest.worlds) {
    const world = load(entry);
    assert.ok(world.terrain.coastlines.length && (isEym(world) ? world.terrain.detail.length : world.terrain.contours.length) && world.terrain.elevationMesh.triangles.length, entry.body);
    assert.ok(world.hydrology.rivers.length && world.hydrology.lakes.length, entry.body);
    assert.ok(world.regions.ecoregions.length && world.regions.soilRegions.length && world.regions.resourceProvinces.length, entry.body);
    if (isEym(world)) {
      // Several realms, so several capitals; no generated road network.
      assert.ok(world.settlements.filter((site) => site.kind === "capital").length >= 3, entry.body);
      assert.equal(world.transportRoutes.length, 0, entry.body);
      continue;
    }
    assert.equal(world.settlements.filter((site) => site.kind === "capital").length, 1, entry.body);
    assert.equal(world.transportRoutes.length, world.settlements.length - 1, entry.body);
  }
});

test("accepted names follow controlling culture and remain collision-free per world", () => {
  for (const entry of manifest.worlds) {
    const world = load(entry), named = [...world.gazetteer, ...world.settlements, ...world.transportRoutes].filter((feature) => !isEym(world) || feature.properName);
    if (isEym(world)) assert.ok(named.every((feature) => feature.origin === "authored" || feature.origin === "seeded"), entry.body);
    else assert.ok(named.every((feature) => feature.profile === expectedProfile[entry.system]), entry.body);
    assert.equal(new Set(named.map((feature) => feature.properName)).size, named.length, entry.body);
  }
});

test("canonical CSV is pinned to the five-continents canon edit", () => {
  // Re-pinned deliberately after the Earth-twin edit (Sun-like star, Earth-twin Eym at 1 AU, orbits rescaled,
  // White and Red Moons added, sci-fi objects removed), then re-pinned deliberately again after removing Cataphract,
  // Sumatra and Ventus: the four "wandering stars" Ramses, Thraximundus, Kandahar and Tribune remain besides Eventide.
  // Re-pinned deliberately again for Eym's new surface: five continents (Caren and Garyk traced from their maps,
  // three seeded) in a 98.6% ocean, replacing the archipelago canon (eym-surface-v1).
  // Any further registry change must re-pin this on purpose.
  const csv = readFileSync(new URL("docs/system-orbital-distances.csv", root));
  assert.equal(createHash("sha256").update(csv).digest("hex"), "59a3cb53023e7917da396598698b6c08053c7bc9732294f8fc0b4a2be681e9b8");
});

test("Eym's accepted canon has five continents in a planet-wide ocean", () => {
  const eym = load(manifest.worlds.find((world) => world.body === "Eventide"));
  assert.ok(eym.terrain.realizedWaterFraction >= .98);
  const continents = eym.gazetteer.filter((feature) => feature.featureClass === "continent");
  assert.equal(continents.length, 5);
  assert.deepEqual(continents.filter((feature) => feature.origin === "authored").map((feature) => feature.properName).sort(), ["Caren", "Garyk"]);
});
