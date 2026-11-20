// Builds Eym's surface and geography from the repository's inputs: the traced
// continents (tools/trace-eym-continents.py), the Caren labels and Garyk
// markers transcribed from their maps, the layout in scripts/eym-surface.mjs
// and Eym's registry row. Shared by the geography and cartography generators
// and validators; the result is cached per process.
import { existsSync, readFileSync } from "node:fs";
import { buildEymSurface, EYM_LAYOUT, EYM_SURFACE_MODEL } from "../scripts/eym-surface.mjs";
import { buildEymGeography, eymInputFingerprint } from "../scripts/eym-cartography.mjs";

const root = new URL("../", import.meta.url);
let cached = null;

/** The fitted tectonic history (tools/generate-eym-tectonics.mjs), as text and parsed, or nulls before it exists. */
function tectonicsInput() {
  const url = new URL("data/eym/tectonics.json", root);
  if (!existsSync(url)) return { text: "", data: null };
  const text = readFileSync(url, "utf8"); return { text, data: JSON.parse(text) };
}

/** The growth of the three far continents (tools/generate-eym-growth.mjs), as text and parsed, or nulls before it exists. */
function growthInput() {
  const url = new URL("data/eym/growth.json", root);
  if (!existsSync(url)) return { text: "", data: null };
  const text = readFileSync(url, "utf8"); return { text, data: JSON.parse(text) };
}

/** The fitted ocean climate (tools/generate-eym-climate.mjs), as text and parsed, or nulls before it exists. */
function climateInput() {
  const url = new URL("data/eym/climate.json", root);
  if (!existsSync(url)) return { text: "", data: null };
  const text = readFileSync(url, "utf8"); return { text, data: JSON.parse(text) };
}

/** The hand-authored exceptions (data/eym/overrides.json), as text and parsed; its text counts toward the fingerprint only when it holds any. */
function overridesInput() {
  const url = new URL("data/eym/overrides.json", root);
  if (!existsSync(url)) return { text: "", data: null };
  const data = JSON.parse(readFileSync(url, "utf8")); return { text: data.overrides?.length ? JSON.stringify(data.overrides) : "", data };
}

/** The code of Caren's relief rule (scripts/eym-caren-relief.mjs): the surface's heights follow it, so a change to it is a change of input. */
const carenRuleText = () => readFileSync(new URL("scripts/eym-caren-relief.mjs", root), "utf8");

export const isEymRow = (row) => row?.geography_model_version === EYM_SURFACE_MODEL;

export function loadEymWorld(row) {
  if (cached?.row === row) return cached.world;
  const tracedText = readFileSync(new URL("data/eym/traced-continents.json", root), "utf8");
  const traced = JSON.parse(tracedText);
  const labels = {
    caren: JSON.parse(readFileSync(new URL("data/eym/caren-labels.json", root), "utf8")),
    garyk: JSON.parse(readFileSync(new URL("data/eym/garyk-markers.json", root), "utf8")),
  };
  const tectonics = tectonicsInput(), growth = growthInput(), climate = climateInput(), overrides = overridesInput();
  const fingerprint = eymInputFingerprint(tracedText + JSON.stringify(labels) + tectonics.text + growth.text + climate.text + overrides.text + carenRuleText(), EYM_LAYOUT);
  if (row.geography_input_fingerprint !== fingerprint) throw new Error(`Eym's surface inputs changed: set geography_input_fingerprint for ${row.object} to ${fingerprint} in docs/system-orbital-distances.csv`);
  const surface = buildEymSurface(traced, EYM_LAYOUT, tectonics.data, growth.data);
  const world = { ...buildEymGeography({ ...surface, traced, labels, row, fingerprint, tectonics: tectonics.data, climate: climate.data, overrides: overrides.data }), surface: surface.surface, fingerprint };
  cached = { row, world };
  return world;
}

export function eymFingerprintFromRepo() {
  const tracedText = readFileSync(new URL("data/eym/traced-continents.json", root), "utf8");
  const labels = { caren: JSON.parse(readFileSync(new URL("data/eym/caren-labels.json", root), "utf8")), garyk: JSON.parse(readFileSync(new URL("data/eym/garyk-markers.json", root), "utf8")) };
  return eymInputFingerprint(tracedText + JSON.stringify(labels) + tectonicsInput().text + growthInput().text + climateInput().text + overridesInput().text + carenRuleText(), EYM_LAYOUT);
}
