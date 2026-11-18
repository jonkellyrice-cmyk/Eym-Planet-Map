#!/usr/bin/env node
// Measures how much rain the weather model makes, band by band, against the climate it should
// reproduce, and prints RAIN_NORMALIZATION for scripts/eym-weather.mjs. Run after changing the model:
//   node tools/calibrate-eym-weather.mjs
import { readFileSync } from "node:fs";
import { environmentField } from "../scripts/eym-seasons.mjs";
import { BIOME_RAIN, RAIN_NORMALIZATION, systemAt, systemsBetween, weatherAt } from "../scripts/eym-weather.mjs";
import { DAY_MS, NORTHWARD_EQUINOX_MS } from "../scripts/universal-time.mjs";
import { zonalPrecipitationMm } from "../scripts/eym-seasons.mjs";

const asset = JSON.parse(readFileSync(new URL("../data/planet-cartography/abydos/eventide.json", import.meta.url), "utf8"));
const field = environmentField(asset), HOUR_MS = DAY_MS / 24, isOcean = (lat, lon) => field.cellAt(lat, lon).ocean;
const BANDS = RAIN_NORMALIZATION.length, WIDTH = 180 / BANDS;
const sums = new Float64Array(BANDS), counts = new Float64Array(BANDS);
const startHour = Math.round(NORTHWARD_EQUINOX_MS / HOUR_MS);
for (let k = 0; k < 6 * 350 * 4; k += 1) { // six years, every 6 hours
  const hour = startHour + k * 6 + 5, t = hour * HOUR_MS, f = ((k * 6) / 24 % 350) / 350;
  const declinationDeg = 23.44 * Math.sin(2 * Math.PI * f);
  const systems = systemsBetween(hour, hour, isOcean).map((s) => systemAt(s, hour, (a, b) => (isOcean(a, b) ? 0 : 1))).filter(Boolean);
  for (let band = 0; band < BANDS; band += 1) for (let j = 0; j < 12; j += 1) {
    const lat = -90 + band * WIDTH + ((k * 7 + j * 3) % 25) / 25 * WIDTH, lon = -180 + ((j * 30 + k * 13) % 360);
    const cell = field.cellAt(lat, lon);
    const solarHour = (j * 5 + k * 6) % 24;
    const w = weatherAt(systems, lat, lon, { cell, declinationDeg, solarHour, timeMs: t, anomalyC: field.anomalyAt(lat, lon, t) });
    const wet = cell.ocean ? 1 : BIOME_RAIN[cell.biome] ?? 0.8;
    const climateMmH = zonalPrecipitationMm(lat) * wet / (350 * 24);
    sums[band] += w.precipMmH / climateMmH; counts[band] += 1;
  }
}
// Each band's entry is divided by the ratio of rain made to rain wanted there; run until it settles.
const table = Array.from(sums, (s, i) => Number((RAIN_NORMALIZATION[i] / Math.max(1e-6, s / counts[i])).toFixed(2)));
console.log(JSON.stringify(table));
