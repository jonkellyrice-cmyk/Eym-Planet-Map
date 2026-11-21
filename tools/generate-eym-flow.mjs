// Fits the monthly climate Eym's rivers run on (Stage 4 of the physical history and climate programme: rivers
// through the year) and writes data/planet-cartography/mitkear/eym-flow.json. Four years of the weather
// (scripts/eym-weather.mjs: the same rain belt, storms, snow and seasons as everywhere else) are sampled every
// 5 hours over every land cell of Caren, Garyk and their islands, and kept month by month: the rain (mm), how much
// of it fell as snow, and the mean temperature at the cell's height. scripts/eym-river-flow.mjs turns these into
// snowpack, soil water, groundwater and the flow of every river. Nothing is random beyond the weather's own storms.
//
//   node tools/generate-eym-flow.mjs           write the data file
//   node tools/generate-eym-flow.mjs --check   rebuild and compare with the data file

import { inputsFingerprint } from "../scripts/eym-world-inputs.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { systemsBetween, systemAt, weatherAt } from "../scripts/eym-weather.mjs";
import { landAtmosphere } from "../scripts/eym-land-atmosphere.mjs";
import { approximateDeclinationDeg, environmentField, yearFraction } from "../scripts/eym-seasons.mjs";
import { attachOcean } from "../scripts/cartography-asset.mjs";
import { rainReader } from "../scripts/eym-rain.mjs";
import { DAY_MS, DAYS_PER_YEAR, NORTHWARD_EQUINOX_MS } from "../scripts/universal-time.mjs";

const root = new URL("../", import.meta.url), OUT = new URL("data/planet-cartography/mitkear/eym-flow.json", root);
export const FLOW_MODEL = "eym-flow-v1";
/** What the monthly climate is made from: this tool, the weather and seasons, and the data they read. */
export const FLOW_SOURCES = ["tools/generate-eym-flow.mjs", "scripts/eym-rain.mjs", "data/eym/rain.json", "scripts/eym-weather.mjs", "scripts/eym-land-atmosphere.mjs", "scripts/eym-seasons.mjs", "scripts/eym-rain-band.generated.mjs", "data/planet-cartography/mitkear/eym.json", "data/planet-cartography/mitkear/eym-ocean.json", "data/eym/climate.json"];
/** The dials it follows (scripts/eym-world-inputs.mjs): the weather's circulation, and the rivers' (which the drainage, made next from this file, follows). */
export const FLOW_INPUTS = ["weather", "rivers"];
export const flowSourcesSha256 = () => { const h = createHash("sha256"); for (const p of FLOW_SOURCES) h.update(readFileSync(new URL(p, root))); h.update(inputsFingerprint(...FLOW_INPUTS)); return h.digest("hex"); };
export const CONTINENTS = ["Caren", "Garyk"];
export const YEARS = 4, STEP_HOURS = 5, MONTHS = 12;

const HOUR_MS = DAY_MS / 24, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const u8 = (values) => Buffer.from(Uint8Array.from(values.map((v) => clamp(Math.round(v), 0, 255)))).toString("base64");
const u16 = (values) => { const b = Buffer.alloc(values.length * 2); values.forEach((v, k) => b.writeUInt16LE(clamp(Math.round(v), 0, 65535), k * 2)); return b.toString("base64"); };

/** Build the whole monthly-climate document. */
export function buildFlow(asset, rainDoc = JSON.parse(readFileSync(new URL("data/eym/rain.json", root), "utf8"))) {
  const field = environmentField(asset);
  const outlines = asset.terrain.coastlines.filter((c) => CONTINENTS.includes(c.continent));
  // Every land cell within a degree of the continents' outlines.
  const cells = new Map();
  for (const name of CONTINENTS) {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const o of outlines.filter((x) => x.continent === name)) for (const [lat, lon] of o.points) { a = Math.min(a, lat); b = Math.max(b, lat); c = Math.min(c, lon); d = Math.max(d, lon); }
    for (let lat = Math.floor(a) - 0.5; lat < Math.ceil(b) + 1; lat += 1) for (let lon = Math.floor(c) - 0.5; lon < Math.ceil(d) + 1; lon += 1) { const cell = field.cellAt(lat, lon); if (!cell.ocean) cells.set(cell.id, cell); }
  }
  const list = [...cells.values()].sort((x, y) => x.id - y.id);
  const rain = list.map(() => new Float64Array(MONTHS)), snow = list.map(() => new Float64Array(MONTHS)), temp = list.map(() => new Float64Array(MONTHS)), count = new Float64Array(MONTHS);

  const isOcean = (lat, lon) => field.cellAt(lat, lon).ocean, landFraction = (lat, lon) => (field.cellAt(lat, lon).ocean ? 0 : 1);
  const h0 = Math.round(NORTHWARD_EQUINOX_MS / HOUR_MS), hours = Math.round(YEARS * DAYS_PER_YEAR * 24);
  let samples = 0;
  for (let hour = h0; hour < h0 + hours; hour += STEP_HOURS) {
    const land = landAtmosphere(field), systems = systemsBetween(hour - 1, hour, isOcean, field.sstC, land), alive = [];
    for (const s of systems) { const at = systemAt(s, hour, landFraction); if (at) alive.push(at); }
    const timeMs = hour * HOUR_MS, declinationDeg = approximateDeclinationDeg(timeMs), month = Math.floor(yearFraction(timeMs) * MONTHS) % MONTHS;
    list.forEach((cell, k) => {
      const w = weatherAt(alive, cell.lat, cell.lon, { cell, timeMs, declinationDeg, solarHour: (((hour % 24) + cell.lon / 15) % 24 + 24) % 24, anomalyC: field.anomalyAt(cell.lat, cell.lon, timeMs), land });
      rain[k][month] += w.precipMmH; if (w.precipKind === "snow") snow[k][month] += w.precipMmH; temp[k][month] += w.tempC;
    });
    count[month] += 1; samples += 1;
  }
  // Monthly totals (mm in the month), the share that fell as snow, and mean temperatures (°C) at each cell's height.
  const hoursPerMonth = DAYS_PER_YEAR * 24 / MONTHS;
  // The rain is the planet's budget of the air's water (data/eym/rain.json: each square's twelve months), so the
  // rivers carry the climate the land has; the weather sampled above gives what the budget does not: how much of
  // each month's fall is snow, and the temperatures. (A square the budget does not hold keeps the weather's rain.)
  const budget = rainDoc ? rainReader(rainDoc) : null, weatherMm = rain.map((r) => [...r].map((v, m) => v / count[m] * hoursPerMonth));
  const rainMm = list.map((cell, k) => budget?.landYear(cell.latIndex, cell.lonIndex)?.monthsMm ?? weatherMm[k]), snowPct = snow.map((s, k) => [...s].map((v, m) => (rain[k][m] > 0 ? 100 * v / rain[k][m] : 0))), tempC = temp.map((t) => [...t].map((v, m) => v / count[m]));
  return {
    schemaVersion: 1, model: FLOW_MODEL, sourcesSha256: flowSourcesSha256(), years: YEARS, stepHours: STEP_HOURS, samples, months: MONTHS,
    // Month 0 begins at the northward equinox (yearFraction 0). rainMm: u16 per cell and month; snowPct: u8; tempHalfC: u8, 2 × (°C + 40).
    cells: list.map((c) => c.id), elevationM: list.map((c) => Math.round(c.elevationM)),
    rainMmU16Base64: u16(rainMm.flat()), snowPctU8Base64: u8(snowPct.flat()), tempHalfCU8Base64: u8(tempC.flat().map((t) => 2 * (t + 40))),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const read = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
  const asset = read("data/planet-cartography/mitkear/eym.json"); attachOcean(asset, read("data/planet-cartography/mitkear/eym-ocean.json"));
  const t0 = Date.now(), data = buildFlow(asset), text = `${JSON.stringify(data)}\n`;
  if (process.argv.includes("--check")) { const same = readFileSync(OUT, "utf8") === text; console.log(same ? "eym-flow.json is up to date" : "eym-flow.json differs"); process.exit(same ? 0 : 1); }
  writeFileSync(OUT, text);
  console.log(`eym-flow.json: ${data.cells.length} land cells, ${data.samples} samples, ${text.length} bytes, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
