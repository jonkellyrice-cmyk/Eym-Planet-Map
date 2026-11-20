import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildRefinedHydrology, buildRefinedTerrain } from "../scripts/planet-cartography.mjs";
import { buildCartographicRegions } from "../scripts/cartography-regions.mjs";
import { buildNamedGeography } from "../scripts/cartography-names.mjs";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(readFileSync(new URL("data/planet-geography/manifest.json", root), "utf8"));
const load = (body) => JSON.parse(readFileSync(new URL(manifest.worlds.find((world) => world.body === body).path, root), "utf8"));
const cache = new Map();
function build(body) {
  if (cache.has(body)) return cache.get(body);
  const coarse = load(body), terrain = buildRefinedTerrain(coarse), hydrology = buildRefinedHydrology(coarse, terrain), regions = buildCartographicRegions(coarse, hydrology);
  const result = { coarse, terrain, hydrology, regions, names: buildNamedGeography({ coarse, terrain, hydrology, regions }) }; cache.set(body, result); return result;
}

test("the controlling Vadan culture governs every Mitkear world's permanent physical-feature names", () => {
  const expected = { Bruthi: ["vadan", "Vadan"], Eym: ["vadan", "Vadan"], Esonth: ["vadan", "Vadan"], Lilta: ["vadan", "Vadan"] };
  for (const [body, [profile, language]] of Object.entries(expected)) {
    const { names } = build(body);
    assert.equal(names.namingProfile, profile, body);
    assert.equal(names.language, language, body);
    assert.ok(names.features.every((feature) => feature.profile === profile && feature.language === language));
  }
});

test("gazetteer identities and names are stable, unique and tied to literal geometry", () => {
  const first = build("Bruthi"), second = buildNamedGeography(first);
  assert.deepEqual(first.names, second);
  assert.equal(new Set(first.names.features.map((feature) => feature.properName)).size, first.names.features.length);
  assert.ok(first.names.features.every((feature) => feature.at?.length === 2 && feature.at.every(Number.isFinite)));
  assert.ok(first.names.features.every((feature) => feature.generatedFrom.seed === first.coarse.seed));
});

test("major physical layers receive proper names without renaming scientific identities", () => {
  const { names } = build("Esonth");
  const classes = new Set(names.features.map((feature) => feature.featureClass));
  for (const required of ["continent", "island", "ocean", "sea", "river", "lake", "wetland", "glacier", "mountain", "desert", "forest"]) assert.ok(classes.has(required), required);
  assert.ok(names.features.every((feature) => !feature.id.startsWith("plate-")));
  assert.ok(names.features.every((feature) => feature.scientificClassification && feature.properName !== feature.scientificClassification));
});

test("generic naming names the oceans of a generated world", () => {
  const { names } = build("Esonth");
  assert.ok(names.features.some((feature) => feature.featureClass === "ocean"));
});

test("wrong-world geometry is rejected before names can become canon", () => {
  const eym = build("Eym"), bruthi = build("Bruthi");
  assert.throws(() => buildNamedGeography({ coarse: eym.coarse, terrain: bruthi.terrain, hydrology: eym.hydrology, regions: eym.regions }), /does not match/);
});
