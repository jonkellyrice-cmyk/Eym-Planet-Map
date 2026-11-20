// Works out Eym's rain (scripts/eym-rain.mjs: a budget of the water the air carries, month by month) for the whole
// planet and writes data/eym/rain.json: the twelve months of every land square of the one-degree grid (the mean of four places in it), and the
// year's rain over the sea on a coarser grid. The cartography, the rivers and the surveys read it. Nothing is
// random, and nothing is set to a wanted answer for any place.
//
//   node tools/generate-eym-rain.mjs           write the data file
//   node tools/generate-eym-rain.mjs --check   rebuild and compare with the data file

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { buildEymSurface, EYM_LAYOUT } from "../scripts/eym-surface.mjs";
import { inputsFingerprint, WORLD_INPUTS } from "../scripts/eym-world-inputs.mjs";
import { RAIN_MODEL, rainFor } from "../scripts/eym-rain.mjs";
import { landAtmosphere } from "../scripts/eym-land-atmosphere.mjs";
import { rainBeltLat, seaLevelTemperatureC } from "../scripts/eym-seasons.mjs";

const root = new URL("../", import.meta.url), OUT = new URL("data/eym/rain.json", root);
export const RAIN_SOURCES = ["tools/generate-eym-rain.mjs", "scripts/eym-rain.mjs", "scripts/eym-land-atmosphere.mjs", "scripts/eym-surface.mjs", "scripts/eym-caren-relief.mjs", "scripts/eym-seasons.mjs", "data/eym/traced-continents.json", "data/eym/tectonics.json", "data/eym/growth.json", "data/eym/climate.json"];
/** The dial groups the rain is made from (scripts/eym-world-inputs.mjs). */
export const RAIN_INPUTS = ["layout", "caren", "rain", "weather"];
export const rainSourcesSha256 = () => { const h = createHash("sha256"); for (const p of RAIN_SOURCES) h.update(readFileSync(new URL(p, root))); h.update(inputsFingerprint(...RAIN_INPUTS)); return h.digest("hex"); };
const J = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));

/**
 * The rain rule made ready for Eym as it is (or, with `wall`, as it was before a range fell; with `causes`, with
 * some causes switched off). The rain belt's seasonal place is the weather's: the Sun's, carried on over heated
 * land (scripts/eym-land-atmosphere.mjs, read from the land by the degree).
 */
export function eymRain({ wall = null, causes = undefined, dials = WORLD_INPUTS.rain, climate = J("data/eym/climate.json"), surface = null } = {}) {
  const { sampler } = surface ?? buildEymSurface(J("data/eym/traced-continents.json"), EYM_LAYOUT, J("data/eym/tectonics.json"), J("data/eym/growth.json"));
  const cells = []; for (let r = 0; r < 180; r += 1) for (let c = 0; c < 360; c += 1) { const lat = -89.5 + r, lon = -179.5 + c, s = sampler(lat, lon), land = Boolean(s?.land && !s.inlandWater); cells.push({ lat, lon, ocean: !land, elevationM: land ? Math.max(0, s.elevationM) : 0 }); }
  const atmosphere = landAtmosphere({ cells });
  return { ...rainFor({ dials, sampler, climate, seaLevelC: seaLevelTemperatureC, beltLatAt: (lon, declinationDeg) => atmosphere.rainBeltLatAt(lon, declinationDeg), openBeltLat: rainBeltLat, wall, causes }), sampler };
}

const b64 = (bytes) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");

/** Build the whole rain document. */
export function buildRain() {
  const air = eymRain(), rows = 180, cols = 360, mask = new Uint8Array(rows * cols / 8), S = WORLD_INPUTS.rain.grid.seaDeg, raw = new Map();
  const byLat = Array.from({ length: 18 }, () => ({ land: 0, landMm: 0 })); let wettest = { mm: 0 }, driest = { mm: Infinity };
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    const lat = -89.5 + r, lon = -179.5 + c;
    // Four places in each square (a single place would catch one slope or one gap and call it the square).
    const places = [[-0.25, -0.25], [-0.25, 0.25], [0.25, -0.25], [0.25, 0.25]].map(([a, b]) => [lat + a, lon + b]).filter(([la, lo]) => air.heightAt(la, lo) != null);
    if (!places.length) continue;
    const years = places.map(([la, lo]) => air.yearAt(la, lo)), mm = Array.from({ length: 12 }, (_, m) => Math.min(65535, Math.round(years.reduce((s, y) => s + y.monthsMm[m], 0) / years.length)));
    const i = r * cols + c; mask[i >> 3] |= 1 << (i & 7); raw.set(i, mm);
  }
  // The paths are followed in steps along three winds, which draws finer stripes than the air does: each square
  // shares a third of its rain with the land squares beside it (the wandering of the weather does the same).
  const months = [], share = WORLD_INPUTS.rain.grid.neighbourShare;
  for (const [i, own] of [...raw].sort((a, b) => a[0] - b[0])) {
    const r = Math.floor(i / cols), c = i % cols, near = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dr, dc]) => (r + dr < 0 || r + dr >= rows ? null : raw.get((r + dr) * cols + (c + dc + cols) % cols))).filter(Boolean);
    const mm = own.map((v, m) => (near.length ? Math.round((1 - share) * v + share * near.reduce((s, x) => s + x[m], 0) / near.length) : v)); months.push(...mm);
    const lat = -89.5 + r, lon = -179.5 + c, annual = mm.reduce((a, b) => a + b, 0), band = byLat[Math.floor(r / 10)]; band.land += 1; band.landMm += annual;
    if (annual > wettest.mm) wettest = { mm: annual, at: [lat, lon] }; if (annual < driest.mm) driest = { mm: annual, at: [lat, lon] };
  }
  const sRows = 180 / S, sCols = 360 / S, sea = new Uint16Array(sRows * sCols);
  for (let r = 0; r < sRows; r += 1) for (let c = 0; c < sCols; c += 1) { const lat = -90 + S * (r + 0.5), lon = -180 + S * (c + 0.5); sea[r * sCols + c] = Math.abs(lat) > 88 ? 0 : Math.min(65535, Math.round(air.yearAt(lat, lon).annualMm)); }
  return {
    schemaVersion: 1, model: RAIN_MODEL, sourcesSha256: rainSourcesSha256(), resolutionDeg: 1,
    summary: { landSquares: months.length / 12, wettest, driest, landMeanMmByLatBand: byLat.map((b, k) => ({ fromLat: -90 + 10 * k, squares: b.land, meanMm: b.land ? Math.round(b.landMm / b.land) : null })) },
    land: { maskBase64: b64(mask), monthsMmUint16Base64: b64(Uint16Array.from(months)) },
    sea: { resolutionDeg: S, annualMmUint16Base64: b64(sea) },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const began = Date.now(), data = buildRain(), text = `${JSON.stringify(data)}\n`;
  if (process.argv.includes("--check")) { const same = readFileSync(OUT, "utf8") === text; console.log(same ? "rain.json is up to date" : "rain.json differs"); process.exit(same ? 0 : 1); }
  writeFileSync(OUT, text);
  console.log(`rain.json: ${text.length} bytes; ${data.summary.landSquares} land squares; wettest ${data.summary.wettest.mm} mm at ${data.summary.wettest.at}; driest ${data.summary.driest.mm} mm at ${data.summary.driest.at}; ${((Date.now() - began) / 1000).toFixed(0)} s`);
  console.log(data.summary.landMeanMmByLatBand.filter((b) => b.squares).map((b) => `${b.fromLat}..${b.fromLat + 10}: ${b.meanMm} mm (${b.squares})`).join("; "));
}
