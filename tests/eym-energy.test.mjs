// The sunlight each half of Eym keeps, and the rain band's mean latitude from it (scripts/eym-energy.mjs; owner's
// direction of 20 November 2026, "Shifting Caren's rain band south, naturally"). Causal tests: each cause present
// against absent moves the band the expected way, by a meaningful amount.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WORLD_INPUTS } from "../scripts/eym-world-inputs.mjs";
import { ENERGY_MODEL, daySunlightWm2, hemisphereBalance, monthSunDeg, surfaceKind } from "../scripts/eym-energy.mjs";
import { BELT_SWING_MEAN, RAIN_BAND_MEAN_LAT, WESTERLIES, WIND_BELTS_MEAN_LAT } from "../scripts/eym-rain-band.generated.mjs";
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
  assert.equal(doc.sourcesSha256, energySourcesSha256()); assert.equal(doc.bandMeanLatInUse, RAIN_BAND_MEAN_LAT);
  // (By the owner's decision of 20 November 2026 the balance is recorded and not yet in use: the band's mean stays 4° N until step 6.)
  assert.equal(D.bandFollowsBalance, false); assert.equal(RAIN_BAND_MEAN_LAT, D.bandMeanLatUntilThen); assert.equal(WIND_BELTS_MEAN_LAT, 0);
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

test("a shallow bank is sea floor only, and a broad shallow sea in warm latitudes is warmer (both kept ready, neither in the world yet)", async () => {
  // (No bank is in the world for now, by the owner's decision: the one that was measured is tried here by itself.)
  assert.equal(BANKS.length, 0);
  const bank = [{ name: "the southern and eastern banks of Caren", center: [0, 0.5], bearingDeg: [70, 205], fadeDeg: 12, reachKm: 500, withinKm: 1500, depthM: [25, 60], edgeKm: 120 }], floorOverBank = (lat, lon, km, m, banks = bank) => floorOverBanks(lat, lon, km, m, banks);
  // South-east of Caren, 300 km from land: tens of metres with the bank, the ocean's floor without; north-west: no bank.
  assert.ok(floorOverBank(-10, 3, 300, -3000) > -70 && floorOverBank(-10, 3, 300, -3000) < -20); assert.equal(floorOverBank(-10, 3, 300, -3000, []), -3000);
  assert.equal(floorOverBank(8, -6, 300, -3000), -3000); assert.equal(floorOverBank(-10, 3, 900, -3000), -3000);
  // Never deeper than the floor without it; beyond its reach it falls away to the ocean's floor.
  assert.equal(floorOverBank(-9, 2, 100, -30), -30); assert.ok(floorOverBank(-10, 3, 560, -3000) < floorOverBank(-10, 3, 480, -3000));
  assert.equal(floorOverBanks(-10, 3, 300, -3000), -3000);
  // A broad shallow sea in warm latitudes is warmer (the warmth is off in the world for now, and tried here at 1 °C):
  // the same currents, with a sea made shallow over a broad patch south-east of Caren and over one lone cell.
  const { bathymetry, landMask, solveAnomaly, solveSeason, SHALLOW_WARM_C } = await import("../tools/generate-eym-climate.mjs");
  assert.equal(SHALLOW_WARM_C, 0);
  const land = landMask(), floor = bathymetry(), at = (lat, lon) => Math.round((lat + 89) / 2) * 180 + Math.round((lon + 179) / 2);
  const shallow = new Float64Array(land.length); for (let lat = -15; lat <= -9; lat += 2) for (let lon = -1; lon <= 7; lon += 2) shallow[at(lat, lon)] = 1; shallow[at(-25, 30)] = 1;
  const season = solveSeason(land, 0, floor), withBank = solveAnomaly(land, season.u, season.v, season.upwelling, { ...floor, shallow }, 1), without = solveAnomaly(land, season.u, season.v, season.upwelling, { ...floor, shallow }, 0);
  const over = withBank[at(-11, 3)] - without[at(-11, 3)], lone = withBank[at(-25, 30)] - without[at(-25, 30)], away = withBank[at(9, -9)] - without[at(9, -9)];
  assert.ok(over > 0.3 && over <= 1.2 && lone < over * 0.6 && Math.abs(away) < 0.15, `${over} °C over the broad shallow sea, ${lone} °C over a lone shallow cell, ${away} °C north-west of Caren`);
});
  const over = withBank[at(-9, 1)] - without[at(-9, 1)], away = withBank[at(9, -9)] - without[at(9, -9)];
  assert.ok(over > 0.3 && over <= SHALLOW_WARM_C + 0.2 && Math.abs(away) < 0.15, `${over} °C over the bank, ${away} °C north-west of Caren`);
});

test("how far the belts follow the Sun comes from where Eym's land lies, and the westerlies' strength from the land in their path", async () => {
  const { beltSwing, westerlies } = await import("../tools/generate-eym-energy.mjs"), { landAtmosphere } = await import("../scripts/eym-land-atmosphere.mjs");
  const L = WORLD_INPUTS.weather.land, doc = json("data/eym/energy.json"), cells = worldCells();
  assert.deepEqual(doc.beltSwing, beltSwing(cells)); assert.equal(doc.beltSwing.mean, BELT_SWING_MEAN); assert.deepEqual(doc.westerlies.strength, { ...WESTERLIES });
  // Over open ocean the belt follows the Sun little (water is slow to warm); over the most land, as Earth's does over southern Asia; Eym's mean lies between.
  assert.equal(rainBeltLat(20) - rainBeltLat(0), L.oceanSwing * 20); assert.ok(L.oceanSwing <= 0.25 && doc.beltSwing.overTheMostLand > 0.9 && BELT_SWING_MEAN > L.oceanSwing + 0.1 && BELT_SWING_MEAN < doc.beltSwing.overTheMostLand - 0.3);
  // A world of sea alone: the ocean's share everywhere. Land along every longitude: far more. More land, more swing.
  const sea = world(), ringed = world((c) => (Math.abs(c.lat) > 5 && Math.abs(c.lat) < 40 ? { ...c, ocean: false, elevationM: 300 } : c)), half = world((c) => (Math.abs(c.lat) > 5 && Math.abs(c.lat) < 40 && c.lon > 0 ? { ...c, ocean: false, elevationM: 300 } : c));
  assert.equal(beltSwing(sea).mean, L.oceanSwing); assert.ok(beltSwing(ringed).mean > 1 && beltSwing(half).mean > beltSwing(sea).mean + 0.3 && beltSwing(half).mean < beltSwing(ringed).mean - 0.3);
  // Over Eym's own longitudes: the belt swings farthest where Gaffa lies and least over the open ocean round Caren.
  const air = landAtmosphere({ cells }); assert.ok(air.rainBeltLatAt(161, 23.44) - air.rainBeltLatAt(161, 0) > 2 * (air.rainBeltLatAt(-60, 23.44) - air.rainBeltLatAt(-60, 0)));
  // The westerlies: alike over a world of sea; stronger in the hemisphere whose 40° to 60° belt has less land.
  assert.deepEqual(westerlies(sea).strength, { north: 1, south: 1 });
  const northLand = westerlies(world((c) => (c.lat > 40 && c.lat < 60 && c.lon > 0 ? { ...c, ocean: false } : c)));
  assert.ok(northLand.strength.south > northLand.strength.north + 0.1 && Math.abs(northLand.strength.south + northLand.strength.north - 2) < 1e-9);
  const w = doc.westerlies; assert.ok((w.landShare.north > w.landShare.south) === (w.strength.north < w.strength.south) && Math.abs(w.strength.north - 1) < 0.1);
});
