// Surveys the coasts of Eym's mapped continents (the second half of the sea floor in the ocean model) and writes
// data/planet-cartography/abydos/eventide-coasts.json: a point every 25 km along the coastlines of Caren and
// Garyk (the dials name them), each with the way out to sea, the shelf in front of it (width and mean depth, from
// the fine sea floor), the bay it lies in if any (how shut in by land, how long, how much it narrows) and the gain that
// bay's funnel gives the tide. The tide report and the storm surge read it (scripts/eym-shelf-seas.mjs).
// Drawn by rule from the cartography and the plates; nothing is random.
//
//   node tools/generate-eym-coasts.mjs           write the data file
//   node tools/generate-eym-coasts.mjs --check   rebuild and compare with the data file

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { attachGeology } from "../scripts/cartography-asset.mjs";
import { coarseAt, coastDistanceKm, localContext } from "../scripts/eym-local-detail.mjs";
import { bearingDeg, destination, distanceKm } from "../scripts/eym-sea.mjs";
import { bayFunnel, EYM_COASTS_MODEL, fineSeaFloor, SHELF_SEAS, shelfOff } from "../scripts/eym-shelf-seas.mjs";
import { inputsFingerprint } from "../scripts/eym-world-inputs.mjs";

const root = new URL("../", import.meta.url), DIR = "data/planet-cartography/abydos", OUT = new URL(`${DIR}/eventide-coasts.json`, root);
/** What the survey is made from: this tool, the shelf-sea rules, the sea floor's shape, the asset and its geology (and its dials, below). */
export const COAST_SOURCES = ["tools/generate-eym-coasts.mjs", "scripts/eym-shelf-seas.mjs", "scripts/eym-seafloor.mjs", `${DIR}/eventide.json`, `${DIR}/eventide-geology.json`];
/** The groups of dials (scripts/eym-world-inputs.mjs) the survey follows. */
export const COAST_INPUTS = ["seaFloor", "shelfSeas"];
export const coastSourcesSha256 = () => { const h = createHash("sha256"); for (const p of COAST_SOURCES) h.update(readFileSync(new URL(p, root))); h.update(inputsFingerprint(...COAST_INPUTS)); return h.digest("hex"); };
/** The columns of a sample, in order. */
export const COAST_FIELDS = Object.freeze(["continent", "lat", "lon", "seawardDeg", "shelfKm", "shelfDepthM", "bay", "enclosed", "bayLengthKm", "bayWidthKm", "mouthWidthKm", "funnelGain"]);

/** Survey the coasts; returns the whole document. */
export function buildCoasts() {
  const json = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
  const asset = attachGeology(json(`${DIR}/eventide.json`), json(`${DIR}/eventide-geology.json`)), ctx = localContext(asset);
  const landAt = (lat, lon) => coarseAt(ctx, lat, lon).land, floorAt = fineSeaFloor(asset, (lat, lon) => coastDistanceKm(ctx, lat, lon));
  const r = (x, k = 100) => Math.round(x * k) / k, samples = [];
  for (const coast of asset.terrain.coastlines) {
    if (!SHELF_SEAS.continents.includes(coast.continent)) continue;
    // Walk the coastline; every `sampleSpacingKm` take a point, find which side is the sea, and stand 6 km out.
    let walked = SHELF_SEAS.sampleSpacingKm / 2;
    for (let k = 0; k + 1 < coast.points.length; k += 1) {
      const a = coast.points[k], b = coast.points[k + 1], len = distanceKm(a[0], a[1], b[0], b[1]); if (!(len > 0)) continue;
      for (; walked <= len; walked += SHELF_SEAS.sampleSpacingKm) {
        const along = bearingDeg(a[0], a[1], b[0], b[1]), at = destination(a[0], a[1], along, walked);
        const sides = [along + 90, along - 90].map((bearing) => ({ bearing: ((bearing % 360) + 360) % 360, p: destination(at[0], at[1], bearing, 6) })).filter((s) => !landAt(s.p[0], s.p[1]));
        if (sides.length !== 1) continue; // an islet's neck or a sliver of water: no clear seaward side
        const { bearing, p } = sides[0], shelf = shelfOff(landAt, floorAt, p[0], p[1], bearing), bay = bayFunnel(landAt, floorAt, p[0], p[1]);
        samples.push([coast.continent, r(p[0], 1000), r(p[1], 1000), Math.round(bearing) % 360, shelf.shelfKm, Math.round(shelf.depthM), bay.bay ? 1 : 0, r(bay.enclosed), bay.lengthKm, bay.widthKm == null ? null : Math.round(bay.widthKm), bay.mouthWidthKm == null ? null : Math.round(bay.mouthWidthKm), r(bay.gain)]);
      }
      walked -= len;
    }
  }
  return { schemaVersion: 1, model: EYM_COASTS_MODEL, sourcesSha256: coastSourcesSha256(), spacingKm: SHELF_SEAS.sampleSpacingKm, continents: SHELF_SEAS.continents, fields: COAST_FIELDS, samples };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const began = Date.now(), data = buildCoasts(), text = `${JSON.stringify(data)}\n`;
  if (process.argv.includes("--check")) { const same = readFileSync(OUT, "utf8") === text; console.log(same ? "eventide-coasts.json is up to date" : "eventide-coasts.json differs"); process.exit(same ? 0 : 1); }
  writeFileSync(OUT, text);
  const gain = data.samples.map((s) => s[11]), bays = data.samples.filter((s) => s[6]).length;
  console.log(`eventide-coasts.json: ${data.samples.length} coast points, ${bays} in bays, ${gain.filter((g) => g > 1.2).length} with a funnel gain over 1.2 (largest ${Math.max(...gain)}), ${text.length} bytes, ${((Date.now() - began) / 1000).toFixed(1)} s`);
}
