import test from "node:test";
import { BELT_SWING_MEAN } from "../scripts/eym-rain-band.generated.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inputsFingerprint, WORLD_INPUTS } from "../scripts/eym-world-inputs.mjs";
import { buildEymSurface, EYM_LAYOUT } from "../scripts/eym-surface.mjs";
import { ABYSS_KM, SHELF_KM, SLOPE_KM } from "../scripts/eym-seafloor.mjs";
import { buildEymGeography } from "../scripts/eym-cartography.mjs";
import { describeOverrides, overrideProblems, prepareOverrides } from "../scripts/eym-overrides.mjs";
import { parseCsv } from "../scripts/system-data.mjs";
import { FREE_SPEED_MM, OCEAN_FRACTION, SLAB_SHARE, SLAB_SPEED_MM, SPEED_KEPT, TARGET_TOLERANCE, TECTONIC_INPUTS } from "../tools/generate-eym-tectonics.mjs";
import { BELT_SHIFT, CLIMATE_INPUTS, SEAMOUNT_UPWELLING, SLOPE_UPWELLING, STEERING } from "../tools/generate-eym-climate.mjs";
import { moduleClosure } from "../tools/generate-region-fingerprint.mjs";
import { WIND_INPUTS } from "../tools/generate-eym-wind.mjs";
import { FLOW_INPUTS } from "../tools/generate-eym-flow.mjs";
import { GROWTH_INPUTS } from "../tools/generate-eym-growth.mjs";
import { CRUST_INPUTS } from "../tools/generate-eym-crust.mjs";
import { ENERGY_INPUTS } from "../tools/generate-eym-energy.mjs";
import { CAREN_INPUTS } from "../tools/generate-eym-caren.mjs";
import { eymFingerprintFromRepo } from "../tools/eym-world.mjs";

const root = new URL("../", import.meta.url), read = (path) => readFileSync(new URL(path, root), "utf8"), json = (path) => JSON.parse(read(path));

test("Eym's dials live in one file, and everything that uses one reads it from there", () => {
  // The layout is the inputs' layout, each seeded continent's area worked out from its multiple of Caren's.
  const caren = 590_000 * 2.589988110336;
  assert.deepEqual(EYM_LAYOUT.seeded.map((c) => [c.id, c.name, c.areaKm2]), WORLD_INPUTS.layout.seeded.map((c) => [c.id, c.name, c.areaCarens * caren]));
  for (const key of ["seed", "caren", "garyk", "archipelagos"]) assert.deepEqual(EYM_LAYOUT[key], WORLD_INPUTS.layout[key]);
  assert.ok(!("areaCarens" in EYM_LAYOUT.seeded[0]));
  // The other modules' named values are the inputs' own.
  assert.deepEqual([SLAB_SHARE, SLAB_SPEED_MM, FREE_SPEED_MM, SPEED_KEPT, TARGET_TOLERANCE, OCEAN_FRACTION], [WORLD_INPUTS.plates.slabShare, WORLD_INPUTS.plates.slabSpeedMmYr, WORLD_INPUTS.plates.freeSpeedMmYr, WORLD_INPUTS.plates.speedKept, WORLD_INPUTS.plates.targetTolerance, WORLD_INPUTS.plates.oceanFraction]);
  assert.deepEqual([SHELF_KM, SLOPE_KM, ABYSS_KM], [WORLD_INPUTS.seaFloor.shelfKm, WORLD_INPUTS.seaFloor.slopeKm, WORLD_INPUTS.seaFloor.abyssKm]);
  assert.deepEqual([BELT_SHIFT, STEERING, SLOPE_UPWELLING, SEAMOUNT_UPWELLING], [BELT_SWING_MEAN, WORLD_INPUTS.ocean.steering, WORLD_INPUTS.ocean.slopeUpwelling, WORLD_INPUTS.ocean.seamountUpwelling]);
  // Nothing can change a dial by accident at run time.
  assert.ok(Object.isFrozen(WORLD_INPUTS) && Object.isFrozen(WORLD_INPUTS.layout.seeded[0]) && Object.isFrozen(WORLD_INPUTS.ocean));
  assert.throws(() => { "use strict"; WORLD_INPUTS.ocean.steering = 1; });
  // Changing a dial makes the build redo what follows from it and nothing that does not: each generator
  // fingerprints the groups of dials it uses (the plate fit does not follow the ocean's or the shelf seas' dials).
  assert.deepEqual(TECTONIC_INPUTS, ["layout", "plates", "orogeny"]); assert.deepEqual(CLIMATE_INPUTS, ["layout", "seaFloor", "ocean", "rain", "weather"]);
  assert.ok(inputsFingerprint("ocean").includes(`"steering":${WORLD_INPUTS.ocean.steering}`) && !inputsFingerprint("ocean").includes("slabShare"));
  assert.notEqual(inputsFingerprint("layout", "plates"), inputsFingerprint("layout", "ocean"));
  assert.throws(() => inputsFingerprint("nonsense"), /no such group of dials/);
  for (const group of Object.keys(WORLD_INPUTS)) assert.ok([...TECTONIC_INPUTS, ...CLIMATE_INPUTS, ...WIND_INPUTS, ...FLOW_INPUTS, ...GROWTH_INPUTS, ...CAREN_INPUTS, ...CRUST_INPUTS, ...ENERGY_INPUTS, "shelfSeas", "magnetic"].includes(group), `the group ${group} is fingerprinted by a generator`);
  assert.ok(moduleClosure("scripts/eym-region-layer.mjs").includes("scripts/eym-world-inputs.mjs"));
  // The dials are not repeated as numbers where they are used.
  assert.doesNotMatch(read("tools/generate-eym-climate.mjs"), /export const STEERING = \d/);
  assert.doesNotMatch(read("scripts/eym-surface.mjs"), /areaKm2: \d/);
});

test("hand-authored overrides: the file is sound, says why, and an unsound one is refused", () => {
  const doc = json("data/eym/overrides.json");
  assert.deepEqual(overrideProblems(doc), []);
  // (None are in force now; the fingerprint counts the file only when it holds one.)
  if (!doc.overrides.length) assert.deepEqual(describeOverrides(doc), []);
  const good = { id: "caren-basin-dry", note: "The author: Caren's great basin is a desert", layer: "precipitationMm", scale: 0.2, box: { south: 2, north: 6, west: -2, east: 2 } };
  assert.deepEqual(overrideProblems({ overrides: [good] }), []);
  assert.match(describeOverrides({ overrides: [good] })[0], /caren-basin-dry: precipitationMm multiplied by 0\.2 over 2° to 6° latitude, -2° to 2° longitude\. Why: The author/);
  const bad = (change) => overrideProblems({ overrides: [{ ...good, ...change }] });
  assert.match(bad({ note: "" })[0], /needs a note saying why/);
  assert.match(bad({ layer: "height" })[0], /layer must be one of/);
  assert.match(bad({ value: 3 })[0], /exactly one of value, add, scale/);
  assert.match(bad({ layer: "biome", scale: undefined, add: 2 })[0], /sets a named value/);
  assert.match(bad({ places: [[1, 2]] })[0], /a box or a list of places/);
  assert.match(bad({ box: { south: 6, north: 2, west: 0, east: 1 } })[0], /south is north of its north/);
  assert.match(overrideProblems({ overrides: [good, good] })[0], /id is used twice/);
  assert.throws(() => prepareOverrides({ overrides: [{ ...good, note: "" }] }), /overrides\.json/);
});

test("an override changes the cells it names and nothing else; climate overrides act before the biome is chosen", () => {
  // On plain cells: a box across the date line, land only unless the sea is asked for, places by the cell they fall in.
  const cells = () => [{ lat: 0.5, lon: 179.5, landCovered: true, precipitationMm: 1000, temperatureC: 20, biome: "savanna" }, { lat: 0.5, lon: -179.5, landCovered: true, precipitationMm: 1000, temperatureC: 20, biome: "savanna" }, { lat: 0.5, lon: 0.5, landCovered: true, precipitationMm: 1000, temperatureC: 20, biome: "savanna" }, { lat: 0.5, lon: 178.5, landCovered: false, ocean: true, precipitationMm: 1000, temperatureC: 20, biome: "open-ocean" }];
  const run = (overrides) => { const list = cells(), prepared = prepareOverrides({ overrides }); for (const c of list) { prepared.climate(c); prepared.outcome(c); } return { list, applied: prepared.applied }; };
  const box = { south: 0, north: 1, west: 178, east: -179 }, note = "a test of the overrides";
  const dry = run([{ id: "dry", note, layer: "precipitationMm", scale: 0.25, box }, { id: "warm", note, layer: "temperatureC", add: 3, box }, { id: "sand", note, layer: "biome", value: "hot-desert", places: [[0.9, 0.1]] }]);
  assert.deepEqual(dry.list.map((c) => [c.precipitationMm, c.temperatureC, c.biome]), [[250, 23, "savanna"], [250, 23, "savanna"], [1000, 20, "hot-desert"], [1000, 20, "open-ocean"]]);
  assert.deepEqual(dry.applied, { dry: 2, warm: 2, sand: 1 });
  assert.equal(run([{ id: "sea", note, layer: "temperatureC", value: 5, box, sea: true }]).list[3].temperatureC, 5);
  assert.equal(prepareOverrides(null).any, false);

  // On the real world: drying a box of Caren turns its cells to drier biomes and leaves every other cell alone.
  const traced = json("data/eym/traced-continents.json"), tectonics = json("data/eym/tectonics.json"), climate = json("data/eym/climate.json");
  const labels = { caren: json("data/eym/caren-labels.json"), garyk: json("data/eym/garyk-markers.json") }, row = parseCsv(read("docs/system-orbital-distances.csv")).find((r) => r.object === "Eym");
  const build = (overrides) => buildEymGeography({ ...buildEymSurface(traced, EYM_LAYOUT, tectonics), traced, labels, row, fingerprint: eymFingerprintFromRepo(), tectonics, climate, overrides });
  const area = { south: -4, north: 6, west: -3, east: 3 }, plain = build(null), dried = build({ overrides: [{ id: "caren-dry-test", note: "a test: most of Caren dried", layer: "precipitationMm", scale: 0.1, box: area }] });
  const inside = (c) => c.lat >= area.south && c.lat <= area.north && c.lon >= area.west && c.lon <= area.east && c.landCovered;
  let changed = 0, elsewhere = 0, drier = 0;
  plain.cells.forEach((c, i) => { const d = dried.cells[i]; if (c.biome !== d.biome || c.soil !== d.soil) { if (inside(c)) changed += 1; else elsewhere += 1; } if (inside(c) && /desert|steppe/.test(d.biome)) drier += 1; });
  assert.equal(elsewhere, 0, "no cell outside the box changes");
  assert.ok(changed >= 20 && drier >= 20, `${changed} cells changed, ${drier} now desert or steppe`);
  assert.deepEqual(JSON.stringify(build({ overrides: [] }).cells.map((c) => c.biome)), JSON.stringify(plain.cells.map((c) => c.biome)), "an empty list changes nothing");
});
