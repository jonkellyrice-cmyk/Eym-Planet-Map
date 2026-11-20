import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv, buildSystemModel } from "../scripts/system-data.mjs";
import { DAYS_PER_YEAR } from "../scripts/universal-time.mjs";

const rows = parseCsv(readFileSync(new URL("../docs/system-orbital-distances.csv", import.meta.url), "utf8"));
const row = (name) => rows.find((r) => r.object === name);
const num = (name, key) => Number(row(name)[key]);
const GM_EARTH = 398600.4418; // km^3/s^2
const EYM_SECOND_SI = 365.2422 / 350;
const synodic = (sidereal, year) => 1 / (1 / sidereal - 1 / year);

test("the Sun is as bright as Earth's Sun: a little heavier, and younger (the world's author, 19 November 2026)", () => {
  assert.equal(row("Abydos").type, "G2V star");
  // 1.00 solar luminosity stays exactly (the climate is calibrated to it); the mass makes up for the younger age.
  assert.match(row("Abydos").notes, /1\.02 solar masses and 3\.5 billion years old: 1\.00 solar luminosity/);
  assert.equal(num("Abydos", "system_age_gyr_est"), 3.5); assert.equal(num("Eventide", "system_age_gyr_est"), 3.5);
  // Nothing in the system is older than its star.
  for (const r of rows) if (r.system_age_gyr_est) assert.ok(Number(r.system_age_gyr_est) <= 3.5, r.object);
});

test("Eym is an Earth twin at 1 AU with a 350-day year of 24-hour days", () => {
  for (const [key, value] of [["distance_from_parent", 1], ["radius_re", 1], ["mass_me", 1], ["surface_gravity_g", 1], ["axial_tilt_deg", 23.44], ["orbital_eccentricity", 0.0167], ["orbital_period_days", 350]]) {
    assert.equal(num("Eventide", key), value, key);
  }
  assert.equal(DAYS_PER_YEAR, num("Eventide", "orbital_period_days"));
  // Sidereal spin that makes the solar day exactly 24 hours for a prograde 350-day orbit.
  assert.ok(Math.abs(num("Eventide", "rotation_hours") - 24 * 350 / 351) < 1e-4);
  assert.equal(num("Eventide", "axial_precession_period_years"), 25772);
  assert.equal(row("Eventide").obliquity_range_deg, "22.1-24.5");
  assert.match(row("Eventide").magnetosphere_radiation, /geodynamo/);
});

test("one Eym second is 1.0435 SI seconds, so Earth's year holds exactly 350 Eym days", () => {
  assert.ok(Math.abs(EYM_SECOND_SI - 1.043549) < 1e-6);
  assert.ok(Math.abs(350 * 86400 * EYM_SECOND_SI / 86400 - 365.2422) < 1e-9);
});

test("the rest of the system keeps its architecture: every heliocentric orbit scaled by 1/0.68, then set on its resonant period; periods from Kepler", () => {
  // (Canon of 20 November 2026: each wanderer's period was set to a whole-number ratio of Eym's year and its
  // distance moved with it by Kepler's third law. Before that the distance was the scaled one, to four decimals,
  // with the period that went with it.)
  const before = { Ramses: [0.52, 234.051], Thraximundus: [0.82, 463.474], Kandahar: [1.04, 661.995], Tribune: [1.95, 1699.639] };
  for (const [name, [old, period]] of Object.entries(before)) {
    const a = num(name, "distance_from_parent"), scaled = Number((old / 0.68).toFixed(4));
    assert.ok(Math.abs(a - scaled * (num(name, "orbital_period_days") / period) ** (2 / 3)) < 1e-9, name);
    assert.ok(Math.abs(a / scaled - 1) < 5e-3, `${name} is where it was to half a percent`);
    // Distances are stored to 4 decimals, so compare periods to 1 part in 10,000.
    assert.ok(Math.abs(num(name, "orbital_period_days") / (350 * a ** 1.5) - 1) < 1e-4, `${name} period`);
  }
});

test("exactly four planets besides Eventide orbit the Sun: the wandering stars Ramses, Thraximundus, Kandahar and Tribune", () => {
  const planets = rows.filter((r) => r.parent === "Abydos" && r.object !== "Eventide").map((r) => r.object).sort();
  assert.deepEqual(planets, ["Kandahar", "Ramses", "Thraximundus", "Tribune"]);
});

test("the White Moon's phases make the 28-day month; the Red Moon's do not line up with it", () => {
  const white = num("White Moon", "orbital_period_days"), red = num("Red Moon", "orbital_period_days");
  assert.ok(Math.abs(synodic(white, 350) - 28) < 1e-3);
  const redSynodic = synodic(red, 350);
  // The red moon's phase on white-full nights drifts each month, so double full moons are occasional events.
  const drift = Math.abs(28 / redSynodic - Math.round(28 / redSynodic));
  assert.ok(drift > 0.08 && drift < 0.2, `drift ${drift}`);
});

test("moon orbits follow Kepler around Eym's mass", () => {
  for (const name of ["White Moon", "Red Moon"]) {
    const a = num(name, "distance_from_parent"), mass = num(name, "mass_me");
    const periodSi = 2 * Math.PI * Math.sqrt(a ** 3 / (GM_EARTH * (1 + mass)));
    assert.ok(Math.abs(periodSi / 86400 / EYM_SECOND_SI - num(name, "orbital_period_days")) < 2e-3, name);
    assert.match(row(name).tidally_locked, /^yes/);
    assert.ok(Math.abs(num(name, "rotation_hours") - 24 * num(name, "orbital_period_days")) < 0.01, `${name} synchronous`);
  }
});

test("two moons give Earth-like tides on average", () => {
  const white = num("White Moon", "tide_contribution_on_parent_earth"), red = num("Red Moon", "tide_contribution_on_parent_earth");
  assert.ok(Math.abs(Math.hypot(white, red) - 1) < 0.01, "RMS combined tide ≈ Earth's lunar tide");
  assert.ok(Math.abs(num("Eventide", "aggregate_lunar_tide_strength_earth") - Math.hypot(white, red)) < 1e-3);
  // Tide strength scales as mass / distance³ relative to Earth's Moon (0.0123 Earth masses at 384,400 km).
  for (const [name, share] of [["White Moon", white], ["Red Moon", red]]) {
    const tide = (num(name, "mass_me") / 0.0123) * (384_400 / num(name, "distance_from_parent")) ** 3;
    assert.ok(Math.abs(tide - share) < 0.01, `${name} tide ${tide}`);
  }
});

test("the two moons are dynamically stable and both visible from Eym", () => {
  const white = row("White Moon"), red = row("Red Moon");
  const aw = Number(white.distance_from_parent), ar = Number(red.distance_from_parent);
  const masses = Number(white.mass_me) + Number(red.mass_me);
  const mutualHill = ((masses / 3) ** (1 / 3)) * (aw + ar) / 2;
  assert.ok((aw - ar) / mutualHill > 2 * Math.sqrt(3), "Hill-stable separation");
  const ratio = num("White Moon", "orbital_period_days") / num("Red Moon", "orbital_period_days");
  for (const resonance of [2, 3, 5 / 2, 3 / 2]) assert.ok(Math.abs(ratio - resonance) > 0.05, `near ${resonance}:1 resonance`);
  const hillRadiusKm = 149_597_870.7 * (3.003e-6 / 3) ** (1 / 3);
  assert.ok(aw < 0.49 * hillRadiusKm, "inside Eym's stable prograde region");
  // Apparent sizes: the white moon about matches the Sun (0.53°); the red moon is smaller.
  const size = (r) => 2 * Number(r.radius_re) * 6371 / Number(r.distance_from_parent) * 180 / Math.PI;
  assert.ok(size(white) > 0.48 && size(white) < 0.53);
  assert.ok(size(red) > 0.35 && size(red) < 0.45);
});

test("no artificial or sci-fi objects remain", () => {
  for (const name of ["Vada Anchorage", "Thornwatch Array", "Thornfield"]) assert.equal(row(name), undefined, name);
  const classes = new Set(buildSystemModel(rows, "Abydos").objects.map((object) => object.objectClass));
  for (const artificial of ["installation", "vessel", "anomaly"]) assert.ok(!classes.has(artificial), artificial);
});
