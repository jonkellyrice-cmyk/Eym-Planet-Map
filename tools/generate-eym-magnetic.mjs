// Surveys Eym's magnetic field against its canon (docs/eym-canon.md) and writes data/eym/magnetic.json: for the
// north magnetic pole at every step of its loop, the magnetic latitude of every coast point of the continents the
// dials name (Caren and Garyk) and the compass's declination there, how fast the pole moves, and how much open sea
// lies between each magnetic pole and the nearest land. The world's standing checks read it
// (tools/world-checks.mjs): a rebuild that grew land under the pole, or a dial that let an aurora reach Caren,
// fails there. Drawn by rule from the cartography and the dials; nothing is random.
//
//   node tools/generate-eym-magnetic.mjs           write the data file
//   node tools/generate-eym-magnetic.mjs --check   rebuild and compare with the data file

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { antipode, auroraNeverBelowDeg, driftKmPerYear, EYM_MAGNETIC_MODEL, fieldAt, greatCircleKm, MAGNETIC, poleOnLoop } from "../scripts/eym-magnetic.mjs";
import { inputsFingerprint } from "../scripts/eym-world-inputs.mjs";

const root = new URL("../", import.meta.url), ASSET = "data/planet-cartography/mitkear/eym.json", OUT = new URL("data/eym/magnetic.json", root);
/** What the survey is made from: this tool, the field's rules and the cartography (and its dials, below). */
export const MAGNETIC_SOURCES = ["tools/generate-eym-magnetic.mjs", "scripts/eym-magnetic.mjs", ASSET];
/** The groups of dials (scripts/eym-world-inputs.mjs) the survey follows. */
export const MAGNETIC_INPUTS = ["magnetic"];
export const magneticSourcesSha256 = () => { const h = createHash("sha256"); for (const p of MAGNETIC_SOURCES) h.update(readFileSync(new URL(p, root))); h.update(inputsFingerprint(...MAGNETIC_INPUTS)); return h.digest("hex"); };
/** How many places round its loop the pole is tried at. */
export const LOOP_STEPS = 72;

/** Survey the field over a cartography asset; returns the whole document. */
export function buildMagnetic(asset = JSON.parse(readFileSync(new URL(ASSET, root), "utf8")), dials = MAGNETIC) {
  const r = (x, k = 10) => Math.round(x * k) / k, poles = [], speeds = [];
  for (let k = 0; k < LOOP_STEPS; k += 1) { poles.push(poleOnLoop(k * 360 / LOOP_STEPS, dials)); speeds.push(driftKmPerYear(k * 360 / LOOP_STEPS, dials)); }
  const coasts = asset.terrain.coastlines;
  // The protected continents: every coast point (islands included), for every pole.
  const continents = {};
  for (const name of dials.continents) {
    const points = coasts.filter((c) => c.continent === name).flatMap((c) => c.points);
    let lo = Infinity, hi = -Infinity, turn = 0;
    for (const pole of poles) for (const [lat, lon] of points) { const f = fieldAt(lat, lon, pole, dials); lo = Math.min(lo, f.magneticLatDeg); hi = Math.max(hi, f.magneticLatDeg); turn = Math.max(turn, Math.abs(f.declinationDeg)); }
    continents[name] = { coastPoints: points.length, coastMagneticLatDeg: [r(lo), r(hi)], worstDeclinationDeg: r(turn), auroraMarginDeg: r(auroraNeverBelowDeg(dials) - Math.max(Math.abs(lo), Math.abs(hi))) };
  }
  // The open sea round each magnetic pole: the nearest coast point of any land, over the whole loop.
  const nearest = (which) => { let best = { km: Infinity }; for (const pole of poles) { const at = which === "north" ? pole : antipode(pole); for (const c of coasts) for (const [lat, lon] of c.points) { const km = greatCircleKm(at.lat, at.lon, lat, lon); if (km < best.km) best = { km, continent: c.continent, lat, lon, pole: at }; } } return { km: Math.round(best.km), continent: best.continent, at: [r(best.lat), r(best.lon)], pole: [r(best.pole.lat, 100), r(best.pole.lon, 100)] }; };
  return {
    schemaVersion: 1, model: EYM_MAGNETIC_MODEL, sourcesSha256: magneticSourcesSha256(),
    poleBox: dials.poleBox, loopSteps: LOOP_STEPS, loopYears: dials.loop.years,
    poleLatDeg: [r(Math.min(...poles.map((p) => p.lat)), 1000), r(Math.max(...poles.map((p) => p.lat)), 1000)], poleLonDeg: [r(Math.min(...poles.map((p) => p.lon)), 1000), r(Math.max(...poles.map((p) => p.lon)), 1000)],
    driftKmYr: [r(Math.min(...speeds)), r(Math.max(...speeds))],
    nearestLand: { north: nearest("north"), south: nearest("south") },
    auroraNeverBelowDeg: auroraNeverBelowDeg(dials), continents,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const began = Date.now(), data = buildMagnetic(), text = `${JSON.stringify(data, null, 1)}\n`;
  if (process.argv.includes("--check")) { const same = readFileSync(OUT, "utf8") === text; console.log(same ? "magnetic.json is up to date" : "magnetic.json differs"); process.exit(same ? 0 : 1); }
  writeFileSync(OUT, text);
  console.log(`magnetic.json: the pole moves ${data.driftKmYr.join(" to ")} km a year; nearest land ${data.nearestLand.north.km} km (${data.nearestLand.north.continent}) from the north pole, ${data.nearestLand.south.km} km (${data.nearestLand.south.continent}) from the south; ${Object.entries(data.continents).map(([n, c]) => `${n} coasts ${c.coastMagneticLatDeg.join(" to ")}°, compass up to ${c.worstDeclinationDeg}°`).join("; ")}; ${((Date.now() - began) / 1000).toFixed(1)} s`);
}
