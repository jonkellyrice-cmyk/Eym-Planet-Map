// Builds Eym's surface and geography from the repository's inputs: the traced
// continents (tools/trace-eym-continents.py), the Caren labels and Garyk
// markers transcribed from their maps, the layout in scripts/eym-surface.mjs
// and Eym's registry row. Shared by the geography and cartography generators
// and validators; the result is cached per process.
import { readFileSync } from "node:fs";
import { buildEymSurface, EYM_LAYOUT, EYM_SURFACE_MODEL } from "../scripts/eym-surface.mjs";
import { buildEymGeography, eymInputFingerprint } from "../scripts/eym-cartography.mjs";

const root = new URL("../", import.meta.url);
let cached = null;

export const isEymRow = (row) => row?.geography_model_version === EYM_SURFACE_MODEL;

export function loadEymWorld(row) {
  if (cached?.row === row) return cached.world;
  const tracedText = readFileSync(new URL("data/eym/traced-continents.json", root), "utf8");
  const traced = JSON.parse(tracedText);
  const labels = {
    caren: JSON.parse(readFileSync(new URL("data/eym/caren-labels.json", root), "utf8")),
    garyk: JSON.parse(readFileSync(new URL("data/eym/garyk-markers.json", root), "utf8")),
  };
  const fingerprint = eymInputFingerprint(tracedText + JSON.stringify(labels), EYM_LAYOUT);
  if (row.geography_input_fingerprint !== fingerprint) throw new Error(`Eym's surface inputs changed: set geography_input_fingerprint for ${row.object} to ${fingerprint} in docs/system-orbital-distances.csv`);
  const surface = buildEymSurface(traced, EYM_LAYOUT);
  const world = { ...buildEymGeography({ ...surface, traced, labels, row, fingerprint }), surface: surface.surface, fingerprint };
  cached = { row, world };
  return world;
}

export function eymFingerprintFromRepo() {
  const tracedText = readFileSync(new URL("data/eym/traced-continents.json", root), "utf8");
  const labels = { caren: JSON.parse(readFileSync(new URL("data/eym/caren-labels.json", root), "utf8")), garyk: JSON.parse(readFileSync(new URL("data/eym/garyk-markers.json", root), "utf8")) };
  return eymInputFingerprint(tracedText + JSON.stringify(labels), EYM_LAYOUT);
}
