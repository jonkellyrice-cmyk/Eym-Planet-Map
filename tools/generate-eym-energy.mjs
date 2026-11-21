// Works out the sunlight each half of Eym keeps (scripts/eym-energy.mjs) from the land as it is: where the land and
// its high ground lie, where snow and ice lie through the year, where the sea freezes. Writes data/eym/energy.json
// (the account) and scripts/eym-rain-band.generated.mjs (the one number the seasons' rules read: the rain band's
// mean latitude). The ocean, the rain, the weather and the surveys follow it. Nothing is random.
//
//   node tools/generate-eym-energy.mjs           write both files
//   node tools/generate-eym-energy.mjs --check   rebuild and compare

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { buildEymSurface, EYM_LAYOUT } from "../scripts/eym-surface.mjs";
import { inputsFingerprint, WORLD_INPUTS } from "../scripts/eym-world-inputs.mjs";
import { hemisphereBalance } from "../scripts/eym-energy.mjs";
import { landAtmosphere } from "../scripts/eym-land-atmosphere.mjs";
import { annualMeanTemperatureC, seasonalTemperature } from "../scripts/eym-seasons.mjs";
import { DAY_MS, DAYS_PER_YEAR, NORTHWARD_EQUINOX_MS } from "../scripts/universal-time.mjs";

const root = new URL("../", import.meta.url), OUT = new URL("data/eym/energy.json", root), MODULE = new URL("scripts/eym-rain-band.generated.mjs", root);
export const ENERGY_SOURCES = ["tools/generate-eym-energy.mjs", "scripts/eym-energy.mjs", "scripts/eym-land-atmosphere.mjs", "scripts/eym-surface.mjs", "scripts/eym-caren-relief.mjs", "scripts/eym-seasons.mjs", "data/eym/traced-continents.json", "data/eym/tectonics.json", "data/eym/growth.json"];
/** The dial groups the balance follows (scripts/eym-world-inputs.mjs). */
export const ENERGY_INPUTS = ["layout", "caren", "energy", "weather", "ocean"];
export const energySourcesSha256 = () => { const h = createHash("sha256"); for (const p of ENERGY_SOURCES) h.update(readFileSync(new URL(p, root))); h.update(inputsFingerprint(...ENERGY_INPUTS)); return h.digest("hex"); };
const J = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
const YEAR_MS = DAYS_PER_YEAR * DAY_MS;

/** The world by the degree: land or sea, and the land's height. */
export function worldCells(surface = null) {
  const { sampler } = surface ?? buildEymSurface(J("data/eym/traced-continents.json"), EYM_LAYOUT, J("data/eym/tectonics.json"), J("data/eym/growth.json")), cells = [];
  for (let r = 0; r < 180; r += 1) for (let c = 0; c < 360; c += 1) { const lat = -89.5 + r, lon = -179.5 + c, s = sampler(lat, lon), land = Boolean(s?.land && !s.inlandWater); cells.push({ lat, lon, ocean: !land, elevationM: land ? Math.max(0, s.elevationM) : 0 }); }
  return cells;
}
/** A square's mean temperature in a month: its latitude's and height's, with the season's swing (land midway between coast and interior). */
export const monthTemperatureC = (cell, month) => seasonalTemperature({ annualMeanC: annualMeanTemperatureC(cell.lat, cell.elevationM), latDeg: cell.lat, continentality: cell.ocean ? 0 : 0.5, ocean: cell.ocean, timeMs: NORTHWARD_EQUINOX_MS + (month + 0.5) / 12 * YEAR_MS }).dayMeanC;

/** The balance for Eym as it is, or for other cells (a lever taken away) or dials. */
export const eymBalance = ({ cells = worldCells(), dials = WORLD_INPUTS.energy } = {}) => hemisphereBalance(dials, cells, monthTemperatureC);

/**
 * How far the belts follow the Sun, from where the land lies: over each longitude `oceanSwing` of the Sun's
 * declination and `monsoonReach` more for land from end to end of the heated band; the mean over all longitudes and
 * both hemispheres is the winds' and pressure belts' own (they run round the world).
 */
export function beltSwing(cells) {
  const L = WORLD_INPUTS.weather.land, air = landAtmosphere({ cells }); let heat = 0, n = 0, most = 0;
  for (const h of [1, -1]) for (let lon = -177.5; lon < 180; lon += 5) { const v = air.heatingAt(h, lon); heat += v; n += 1; most = Math.max(most, v); }
  const r3 = (v) => Math.round(v * 1000) / 1000;
  return { overOpenOcean: L.oceanSwing, overTheMostLand: r3(L.oceanSwing + L.monsoonReach * most), mean: r3(L.oceanSwing + L.monsoonReach * heat / n), meanHeatedLandShare: r3(heat / n) };
}
/** The westerlies' strength by hemisphere: stronger where more of their path (40° to 60°) is sea, about the two hemispheres' mean. */
export function westerlies(cells) {
  const share = { north: [0, 0], south: [0, 0] };
  for (const c of cells) { const a = Math.abs(c.lat); if (a < 40 || a > 60) continue; const s = share[c.lat > 0 ? "north" : "south"], w = Math.cos(c.lat * Math.PI / 180); s[0] += c.ocean ? 0 : w; s[1] += w; }
  const north = share.north[0] / share.north[1], south = share.south[0] / share.south[1], mean = (north + south) / 2, k = WORLD_INPUTS.ocean.westerliesLandDrag, r3 = (v) => Math.round(v * 1000) / 1000;
  return { landShare: { north: r3(north), south: r3(south) }, strength: { north: r3(1 + k * (mean - north)), south: r3(1 + k * (mean - south)) } };
}

export function buildEnergy() {
  const cells = worldCells(), balance = eymBalance({ cells }), E = WORLD_INPUTS.energy;
  // What each cause adds to the band's place: the same world with that cause taken away.
  const without = (change) => eymBalance({ cells: cells.map(change) }).bandMeanLat, r2 = (v) => Math.round(v * 100) / 100;
  const allSea = without((c) => ({ ...c, ocean: true, elevationM: 0 })), flat = without((c) => ({ ...c, elevationM: 0 }));
  const noIce = eymBalance({ cells, dials: { ...WORLD_INPUTS.energy, albedo: { ...WORLD_INPUTS.energy.albedo, ice: WORLD_INPUTS.energy.albedo.land, snow: WORLD_INPUTS.energy.albedo.land } } }).bandMeanLat;
  return { schemaVersion: 1, sourcesSha256: energySourcesSha256(), ...balance, bandFollowsBalance: E.bandFollowsBalance, bandMeanLatInUse: E.bandFollowsBalance ? balance.bandMeanLat : E.bandMeanLatUntilThen, beltSwing: beltSwing(cells), westerlies: westerlies(cells), causes: { allSeaBandLat: r2(allSea), landAddsDeg: r2(balance.bandMeanLat - allSea), highGroundAddsDeg: r2(balance.bandMeanLat - flat), snowAndIceOnLandAddDeg: r2(balance.bandMeanLat - noIce) } };
}

const moduleText = (data) => `// Written by tools/generate-eym-energy.mjs from the land as it is (data/eym/energy.json): do not edit by hand.
// The tropical rain band's mean latitude over open ocean (degrees north): the hemispheres' balance gives ${data.bandMeanLat}°${data.bandFollowsBalance ? "" : "; not yet in use (dial energy.bandFollowsBalance)"}.
export const RAIN_BAND_MEAN_LAT = ${data.bandMeanLatInUse};
// The latitude the ocean model's wind belts stand about in the tropics (the band's mean once it follows the balance).
export const WIND_BELTS_MEAN_LAT = ${data.bandFollowsBalance ? data.bandMeanLat : 0};
// How far the wind and pressure belts follow the Sun, as a share of its declination: the mean over Eym's longitudes.
export const BELT_SWING_MEAN = ${data.beltSwing.mean};
// The westerlies' strength in each hemisphere (1 = the two hemispheres' mean), from the land in their path.
export const WESTERLIES = Object.freeze({ north: ${data.westerlies.strength.north}, south: ${data.westerlies.strength.south} });
`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const data = buildEnergy(), text = `${JSON.stringify(data, null, 1)}\n`;
  if (process.argv.includes("--check")) { const same = readFileSync(OUT, "utf8") === text && readFileSync(MODULE, "utf8") === moduleText(data); console.log(same ? "energy.json is up to date" : "energy.json differs"); process.exit(same ? 0 : 1); }
  writeFileSync(OUT, text); writeFileSync(MODULE, moduleText(data));
  console.log(`energy.json: the north keeps ${Math.abs(data.keptNorthLessSouthPW)} PW ${data.keptNorthLessSouthPW < 0 ? "less" : "more"} than the south; the air carries ${data.airCarriesNorthPW} PW north; the balance puts the rain band's mean at ${data.bandMeanLat}° (in use: ${data.bandMeanLatInUse}°); the belts follow the Sun by ${data.beltSwing.mean} of its declination in the mean (${data.beltSwing.overOpenOcean} over open ocean, ${data.beltSwing.overTheMostLand} over the most land)`);
}
