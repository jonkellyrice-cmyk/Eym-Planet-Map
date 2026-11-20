// The Region layer's fingerprint: what its stored tiles were made from, so that a tile made from older code or
// data is known to be stale and is made again, never served (owner's consolidated addenda, 18 November 2026,
// item 6). Two fingerprints:
//   - shapes: every module the shapes are made by (scripts/eym-region-layer.mjs and all it imports, followed
//     automatically) and every data file they read (Eym's cartography and the geology, drainage, wind and
//     river-climate files attached to it);
//   - paint: every module the pictures are painted by (scripts/eym-region-paint.mjs and all it imports).
// A tile whose paint is stale but whose shapes are current is repainted from its stored shapes; one whose shapes
// are stale is made again. Written to data/eym/region-fingerprint.json by `npm run build`; a test checks it is
// current, so the map server (which reads it) can never serve tiles under a fingerprint the code no longer has.
// Usage: node tools/generate-region-fingerprint.mjs

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drainageFileName, flowFileName, windFileName } from "../scripts/cartography-asset.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REGION_FINGERPRINT_FILE = "data/eym/region-fingerprint.json";
const ASSET = "data/planet-cartography/mitkear/eym.json";
// Static and dynamic imports of the repository's own files ("./x.mjs", "../y.json").
const IMPORTS = /\b(?:import|export)\b[^;]*?\bfrom\s*["'](\.{1,2}\/[^"']+)["']|\bimport\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;

/** Every repository file a module imports, at any depth (itself included), as sorted repository-relative paths. */
export function moduleClosure(entry) {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return; seen.add(file);
    if (!/\.m?js$/.test(file)) return;
    for (const m of readFileSync(file, "utf8").matchAll(IMPORTS)) walk(resolve(dirname(file), m[1] ?? m[2]));
  };
  walk(resolve(root, entry));
  return [...seen].map((f) => relative(root, f).split("\\").join("/")).sort();
}

/** The data files the Region layer's shapes are made from: the asset and what the map server attaches to it. */
export function regionDataFiles() {
  const asset = JSON.parse(readFileSync(resolve(root, ASSET), "utf8")), dir = dirname(ASSET);
  return [ASSET, `${dir}/${asset.geologyFile}`, `${dir}/${drainageFileName("eym.json")}`, `${dir}/${windFileName("eym.json")}`, `${dir}/${flowFileName("eym.json")}`]
    .filter((p) => existsSync(resolve(root, p))).sort();
}

const digest = (paths) => { const h = createHash("sha256"); for (const p of paths) { h.update(p); h.update("\0"); h.update(readFileSync(resolve(root, p))); h.update("\0"); } return h.digest("hex"); };

/** The fingerprints now: { shapes, paint } (hex) and the files each covers. */
export function regionFingerprint() {
  const shapesFiles = [...moduleClosure("scripts/eym-region-layer.mjs"), ...regionDataFiles()], paintFiles = moduleClosure("scripts/eym-region-paint.mjs");
  return { shapes: digest(shapesFiles), paint: digest(paintFiles), shapesFiles, paintFiles };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const fp = regionFingerprint();
  writeFileSync(resolve(root, REGION_FINGERPRINT_FILE), `${JSON.stringify(fp, null, 2)}\n`);
  console.log(`Region fingerprint: shapes ${fp.shapes.slice(0, 12)} (${fp.shapesFiles.length} files), paint ${fp.paint.slice(0, 12)} (${fp.paintFiles.length} files)`);
}
