import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { AU_KM, buildSystemModel, displayPosition, parseCsv, physicalDistanceAu } from "../scripts/system-data.mjs";

const rows = parseCsv(readFileSync(new URL("../docs/system-orbital-distances.csv", import.meta.url), "utf8"));

// Synthetic two-star system: the only canonical binary (Tanis) was removed with the other systems,
// but buildSystemModel still supports barycentric binaries, so they are exercised with a fixture.
const binaryRow = (object, type, parent, distance, phase, extra = {}) => ({
  system: "Binary Test", object, type, parent, distance_from_parent: String(distance), distance_unit: "AU",
  reference_phase_deg: phase === null ? "" : String(phase), inclination_deg: "", selectable: type === "barycenter" ? "no" : "yes",
  owner_faction: "Test Faction", orbital_period_days: "", orbital_eccentricity: "", ...extra,
});
const BINARY_FIXTURE_ROWS = [
  binaryRow("Test barycenter", "barycenter", "System barycenter", 0, null, { orbital_eccentricity: "0" }),
  binaryRow("Test A", "G8V star", "Test barycenter", 0.044, 165, { orbital_period_days: "9.131", orbital_eccentricity: "0.025" }),
  binaryRow("Test B", "K4V star", "Test barycenter", 0.056, 345, { orbital_period_days: "9.131", orbital_eccentricity: "0.025" }),
  binaryRow("Test World", "habitable terrestrial", "Test barycenter", 1.0, 35, { orbital_period_days: "288.755", orbital_eccentricity: "0.0447" }),
];

test("canonical registry parses all 13 Abydos objects in one system", () => {
  assert.equal(rows.length, 13);
  assert.deepEqual([...new Set(rows.map((row) => row.system))], ["Abydos"]);
});

test("parent-relative moon positions convert canonical semi-major axes and apply the epoch radial solution", () => {
  const model = buildSystemModel(rows, "Abydos");
  const tribune = model.byName.get("Tribune");
  const enoch = model.byName.get("Enoch");
  assert.ok(Math.abs(enoch.semiMajorAxisAu - 620_000 / AU_KM) < 1e-12);
  assert.ok(Math.abs(physicalDistanceAu(tribune, enoch) - enoch.orbitalState.radiusAu) < 1e-12);
});

test("station infrastructure resolves through its planetary parent hierarchy", () => {
  const model = buildSystemModel(rows, "Abydos");
  const eventide = model.byName.get("Eventide");
  const anchorage = model.byName.get("Vada Anchorage");
  assert.equal(anchorage.parentObject, eventide);
  assert.equal(eventide.parentObject, model.byName.get("Abydos"));
  assert.ok(Math.abs(physicalDistanceAu(eventide, anchorage) - anchorage.orbitalState.radiusAu) < 1e-12);
});

test("system models preserve canonical ownership and reject conflicting owners", () => {
  assert.equal(buildSystemModel(rows, "Abydos").ownerFaction, "Eventide");
  const mandate = BINARY_FIXTURE_ROWS.map((row) => ({ ...row, owner_faction: "Xuanjia Mandate" }));
  assert.equal(buildSystemModel(mandate, "Binary Test").ownerFaction, "Xuanjia Mandate");
  const conflicting = BINARY_FIXTURE_ROWS.map((row, index) => ({ ...row, owner_faction: index ? "Xuanjia Mandate" : "Adanian Conclave" }));
  assert.throws(() => buildSystemModel(conflicting, "Binary Test"), /Conflicting canonical ownership/);
});

test("display compression does not alter physical route coordinates", () => {
  const model = buildSystemModel(rows, "Abydos");
  const eventide = model.byName.get("Eventide");
  const station = model.byName.get("Vada Anchorage");
  const physical = physicalDistanceAu(eventide, station);
  const a = displayPosition(eventide, model), b = displayPosition(station, model);
  assert.ok(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) > physical * 100);
  assert.ok(Math.abs(station.semiMajorAxisAu - 180_000 / AU_KM) < 1e-12);
  assert.ok(Math.abs(physical - station.orbitalState.radiusAu) < 1e-12);
});

test("Abydos is a single-star system", () => {
  const model = buildSystemModel(rows, "Abydos");
  assert.deepEqual(model.objects.filter((object) => object.objectClass === "star").map((object) => object.name), ["Abydos"]);
  assert.equal(model.byName.get("Abydos").parent, "System barycenter");
});

test("a binary system preserves two stars around the barycenter (synthetic fixture)", () => {
  const model = buildSystemModel(BINARY_FIXTURE_ROWS, "Binary Test");
  assert.equal(model.objects.filter((object) => object.objectClass === "star").length, 2);
  assert.equal(model.ownerFaction, "Test Faction");
  assert.equal(model.byName.get("Test A").parent, "Test barycenter");
  assert.equal(model.byName.get("Test B").parent, "Test barycenter");
  assert.equal(model.byName.get("Test B").orbitalState.binaryCompanionOf, "Test A");
});
