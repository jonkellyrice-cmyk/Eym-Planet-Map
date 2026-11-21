// The sunlight each half of Eym keeps, and the rain band's mean latitude from it (scripts/eym-energy.mjs; owner's
// direction of 20 November 2026, "Shifting Caren's rain band south, naturally"). Causal tests: each cause present
// against absent moves the band the expected way, by a meaningful amount.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WORLD_INPUTS } from "../scripts/eym-world-inputs.mjs";
import { ENERGY_MODEL, daySunlightWm2, hemisphereBalance, monthSunDeg, surfaceKind } from "../scripts/eym-energy.mjs";
import { RAIN_BAND_MEAN_LAT } from "../scripts/eym-rain-band.generated.mjs";
import { rainBeltLat, zonalPrecipitationMm } from "../scripts/eym-seasons.mjs";
import { ENERGY_INPUTS, ENERGY_SOURCES, energySourcesSha256, eymBalance, monthTemperatureC, worldCells } from "../tools/generate-eym-energy.mjs";
import { floorOverBanks, BANKS } from "../scripts/eym-seafloor.mjs";

const D = WORLD_INPUTS.energy, json = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
/** A world of sea by the two degrees, with whatever `change` makes of each cell. */
const world = (change = (c) => c) => { const cells = []; for (let lat = -89; lat < 90; lat += 2) for (let lon = -179; lon < 180; lon += 2) cells.push(change({ lat, lon, ocean: true, elevationM: 0 })); return cells; };
const band = (cells, dials = D) => hemisphereBalance(dials, cells, monthTemperatureC).bandMeanLat;

test("sunlight by latitude and season, and what a surface is by its temperatures", () => {
  // The year's sunlight over the whole world is a quarter of the Sun's 1,361 W/m²; the pole is dark in its winter.
  let sum = 0, weight = 0; for (let lat = -89.5; lat < 90; lat += 1) for (let m = 0; m < 12; m += 1) { const w = Math.cos(lat * Math.PI / 180); sum += w * daySunlightWm2(lat, monthSunDeg(m)); weight += w; }
  assert.ok(Math.abs(sum / weight - 1361 / 4) < 4, `${sum / weight} W/m²`);
  assert.equal(daySunlightWm2(85, -20), 0); assert.ok(daySunlightWm2(85, 23) > daySunlightWm2(0, 23) && daySunlightWm2(0, 0) > 420);
  assert.equal(surfaceKind(D, { ocean: true, monthC: 5, warmestC: 9 }), "sea"); assert.equal(surfaceKind(D, { ocean: true, monthC: -3, warmestC: 9 }), "seaIce");
  assert.equal(surfaceKind(D, { ocean: false, monthC: 5, warmestC: 9 }), "land"); assert.equal(surfaceKind(D, { ocean: false, monthC: -3, warmestC: 9 }), "snow"); assert.equal(surfaceKind(D, { ocean: false, monthC: -3, warmestC: -1 }), "ice");
  assert.equal(ENERGY_MODEL, "eym-energy-v1");
});

test("the rain band stands toward the half of the world that keeps more sunlight: each cause moves it the right way", () => {
  // A world of sea alone: the halves are alike and the band's mean is the equator.
  assert.ok(Math.abs(band(world())) < 0.01);
  // Land in the north (brighter than sea): the band moves south; the same land in the south: north, as far.
  const landAt = (sign) => world((c) => (c.lat * sign > 10 && c.lat * sign < 40 && Math.abs(c.lon) < 60 ? { ...c, ocean: false, elevationM: 300 } : c));
  const north = band(landAt(1)), south = band(landAt(-1));
  assert.ok(north < -0.3 && Math.abs(north + south) < 0.02, `${north}° and ${south}°`);
  // A high, ice-capped plateau in the far north (as a young collision would raise) moves it farther south than the
  // same land low and green; taking the ice's brightness away gives most of that back.
  const farNorth = (heightM) => world((c) => (c.lat > 42 && c.lat < 62 && Math.abs(c.lon) < 50 ? { ...c, ocean: false, elevationM: heightM } : c));
  const low = band(farNorth(300)), high = band(farNorth(4800)), dark = band(farNorth(4800), { ...D, albedo: { ...D.albedo, ice: D.albedo.land, snow: D.albedo.land } });
  assert.ok(high < low - 0.3 && dark > high + 0.3, `low ${low}°, high and iced ${high}°, high without its ice ${dark}°`);
  // The same plateau in the far south pushes the band north (why Demani's ice is kept modest).
  const farSouth = band(world((c) => (c.lat < -42 && c.lat > -62 && Math.abs(c.lon) < 50 ? { ...c, ocean: false, elevationM: 4800 } : c)));
  assert.ok(farSouth > 0.3 && Math.abs(farSouth + high) < 0.05);
  // Heat carried south across the equator by the sea moves the band south (kept at none: the world's author's yes is needed).
  assert.equal(D.seaCarriesSouthPW, 0); assert.ok(band(world(), { ...D, seaCarriesSouthPW: 0.5 }) < -0.5);
  // Never past the limit.
  assert.ok(band(world(), { ...D, seaCarriesSouthPW: 50 }) === -D.mostDeg);
});

test("Eym's own balance is the one the seasons read, and every rule that uses the band's mean follows it", () => {
  const doc = json("data/eym/energy.json");
  assert.equal(doc.sourcesSha256, energySourcesSha256()); assert.equal(doc.bandMeanLat, RAIN_BAND_MEAN_LAT);
  assert.equal(eymBalance({ cells: worldCells() }).bandMeanLat, doc.bandMeanLat);
  assert.ok(ENERGY_INPUTS.includes("energy") && ENERGY_SOURCES.includes("scripts/eym-energy.mjs") && !ENERGY_SOURCES.includes("scripts/eym-rain-band.generated.mjs"));
  // The north has more land, snow and land ice than the south, so it keeps less and the band's mean is a little south.
  assert.ok(doc.keptNorthLessSouthPW < 0 && doc.airCarriesNorthPW > 0 && doc.bandMeanLat < 0 && doc.bandMeanLat > -3);
  assert.ok(doc.areaMkm2.north.land + doc.areaMkm2.north.snow + doc.areaMkm2.north.ice > doc.areaMkm2.south.land + doc.areaMkm2.south.snow + doc.areaMkm2.south.ice);
  assert.ok(doc.causes.landAddsDeg < 0 && doc.causes.snowAndIceOnLandAddDeg < 0 && Math.abs(doc.causes.allSeaBandLat) < 0.01);
  // The seasons' rules: the band over open ocean swings about that mean; the rain by latitude peaks there.
  assert.equal(rainBeltLat(0), RAIN_BAND_MEAN_LAT); assert.equal(rainBeltLat(10, 4), 8); assert.ok(Math.abs(rainBeltLat(23.44) + rainBeltLat(-23.44) - 2 * RAIN_BAND_MEAN_LAT) < 1e-9);
  assert.ok(zonalPrecipitationMm(-3, -3) > zonalPrecipitationMm(3, -3) && zonalPrecipitationMm(4, 4) > zonalPrecipitationMm(-3, 4)); assert.equal(zonalPrecipitationMm(10), zonalPrecipitationMm(10, 4));
  // Every generator that reads the seasons' rules is made again when the band's mean moves.
  for (const tool of ["climate", "rain", "caren", "flow", "wind", "crust"]) assert.ok(readFileSync(new URL(`../tools/generate-eym-${tool}.mjs`, import.meta.url), "utf8").includes('"scripts/eym-rain-band.generated.mjs"'), tool);
});

test("the shallow bank south and east of Caren is sea floor only, and a broad shallow sea in warm latitudes is warmer", async () => {
  assert.equal(BANKS.length, 1);
  // South-east of Caren, 300 km from land: tens of metres with the bank, the ocean's floor without; north-west: no bank.
  assert.ok(floorOverBanks(-10, 3, 300, -3000) > -70 && floorOverBanks(-10, 3, 300, -3000) < -20); assert.equal(floorOverBanks(-10, 3, 300, -3000, []), -3000);
  assert.equal(floorOverBanks(8, -6, 300, -3000), -3000); assert.equal(floorOverBanks(-10, 3, 900, -3000), -3000);
  // Never deeper than the floor without it; beyond its reach it falls away to the ocean's floor.
  assert.equal(floorOverBanks(-9, 2, 100, -30), -30); assert.ok(floorOverBanks(-10, 3, 560, -3000) < floorOverBanks(-10, 3, 480, -3000));
  // No drawn land or coast is changed: the land mask is Dave's.
  const { bathymetry, landMask, solveAnomaly, solveSeason, SHALLOW_WARM_C } = await import("../tools/generate-eym-climate.mjs");
  const land = landMask(), floor = bathymetry(), at = (lat, lon) => Math.round((lat + 89) / 2) * 180 + Math.round((lon + 179) / 2);
  assert.ok(floor.shallow[at(-9, 1)] > 0.9 && floor.shallow[at(-1, 7)] > 0.9 && floor.shallow[at(7, -9)] < 0.5 && floor.depthM[at(-9, 1)] < 70 && floor.depthM[at(-15, 1)] > 3000);
  // The same currents with and without the shallow seas' warmth: the sea over the bank is warmer with it by a
  // meaningful amount, and the sea north-west of Caren is not.
  const season = solveSeason(land, 0, floor), withBank = solveAnomaly(land, season.u, season.v, season.upwelling, floor), without = solveAnomaly(land, season.u, season.v, season.upwelling, { ...floor, shallow: null });
  const over = withBank[at(-9, 1)] - without[at(-9, 1)], away = withBank[at(9, -9)] - without[at(9, -9)];
  assert.ok(over > 0.3 && over <= SHALLOW_WARM_C + 0.2 && Math.abs(away) < 0.15, `${over} °C over the bank, ${away} °C north-west of Caren`);
});
