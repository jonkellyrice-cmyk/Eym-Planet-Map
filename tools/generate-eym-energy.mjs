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
import { annualMeanTemperatureC, seasonalTemperature } from "../scripts/eym-seasons.mjs";
import { DAY_MS, DAYS_PER_YEAR, NORTHWARD_EQUINOX_MS } from "../scripts/universal-time.mjs";

const root = new URL("../", import.meta.url), OUT = new URL("data/eym/energy.json", root), MODULE = new URL("scripts/eym-rain-band.generated.mjs", root);
export const ENERGY_SOURCES = ["tools/generate-eym-energy.mjs", "scripts/eym-energy.mjs", "scripts/eym-surface.mjs", "scripts/eym-caren-relief.mjs", "scripts/eym-seasons.mjs", "data/eym/traced-continents.json", "data/eym/tectonics.json", "data/eym/growth.json"];
/** The dial groups the balance follows (scripts/eym-world-inputs.mjs). */
export const ENERGY_INPUTS = ["layout", "caren", "energy", "weather"];
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

export function buildEnergy() {
  const cells = worldCells(), balance = eymBalance({ cells });
  // What each cause adds to the band's place: the same world with that cause taken away.
  const without = (change) => eymBalance({ cells: cells.map(change) }).bandMeanLat, r2 = (v) => Math.round(v * 100) / 100;
  const allSea = without((c) => ({ ...c, ocean: true, elevationM: 0 })), flat = without((c) => ({ ...c, elevationM: 0 }));
  const noIce = eymBalance({ cells, dials: { ...WORLD_INPUTS.energy, albedo: { ...WORLD_INPUTS.energy.albedo, ice: WORLD_INPUTS.energy.albedo.land, snow: WORLD_INPUTS.energy.albedo.land } } }).bandMeanLat;
  return { schemaVersion: 1, sourcesSha256: energySourcesSha256(), ...balance, causes: { allSeaBandLat: r2(allSea), landAddsDeg: r2(balance.bandMeanLat - allSea), highGroundAddsDeg: r2(balance.bandMeanLat - flat), snowAndIceOnLandAddDeg: r2(balance.bandMeanLat - noIce) } };
}

const moduleText = (data) => `// Written by tools/generate-eym-energy.mjs from the land as it is (data/eym/energy.json): do not edit by hand.\n// The tropical rain band's mean latitude over open ocean (degrees north), from the sunlight each half of Eym keeps.\nexport const RAIN_BAND_MEAN_LAT = ${data.bandMeanLat};\n`;

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const data = buildEnergy(), text = `${JSON.stringify(data, null, 1)}\n`;
  if (process.argv.includes("--check")) { const same = readFileSync(OUT, "utf8") === text && readFileSync(MODULE, "utf8") === moduleText(data); console.log(same ? "energy.json is up to date" : "energy.json differs"); process.exit(same ? 0 : 1); }
  writeFileSync(OUT, text); writeFileSync(MODULE, moduleText(data));
  console.log(`energy.json: the north keeps ${data.keptNorthLessSouthPW} PW ${data.keptNorthLessSouthPW < 0 ? "less" : "more"} than the south; the air carries ${data.airCarriesNorthPW} PW north; the rain band's mean latitude ${data.bandMeanLat}°`);
}
