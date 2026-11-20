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

test("canonical CSV is pinned to the world as accepted (a managed pin)", () => {
  // The registry file carries Eventide's input fingerprint, which covers everything Eym's surface is made from
  // (the traced continents, the labels, the layout, the tectonic history, the ocean climate). So any accepted change
  // to the world moves this hash. Until 0.26.1 the hash was written here and re-pinned by hand each time (eight
  // times, from the Earth-twin edit to the sea floor in the ocean model). It is now a managed pin in
  // tools/world-pins.json: a rebuild that moves it says so in its report (npm run world), and it is recorded, with a
  // note saying why, only by `node tools/world.mjs --accept-pins --note "…"`. The check is as strict as before: the
  // file must hash to exactly the recorded value, and the record must say why it holds that value.
  const csv = readFileSync(new URL("docs/system-orbital-distances.csv", root)), pin = JSON.parse(readFileSync(new URL("tools/world-pins.json", root), "utf8")).managed.registryCsvSha256;
  assert.match(pin.value, /^[0-9a-f]{64}$/);
  assert.ok(pin.note && pin.note.length >= 10, "the pin says why it holds this value");
  assert.equal(createHash("sha256").update(csv).digest("hex"), pin.value);
});

test("Eym's accepted canon has five continents in an ocean that covers about four fifths of it", () => {
  const eym = load(manifest.worlds.find((world) => world.body === "Eventide"));
  // Canon of 19 November 2026: about 80% water (it was 98.6% before Gaffa, Khohalis and Demani were grown).
  assert.ok(eym.terrain.realizedWaterFraction >= .79 && eym.terrain.realizedWaterFraction <= .81, String(eym.terrain.realizedWaterFraction));
  const continents = eym.gazetteer.filter((feature) => feature.featureClass === "continent");
  assert.equal(continents.length, 5);
  assert.deepEqual(continents.filter((feature) => feature.origin === "authored").map((feature) => feature.properName).sort(), ["Caren", "Garyk"]);
});
