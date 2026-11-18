// How a refined cartography asset is stored on disk and read back. Two things keep the asset that every view
// loads within its mobile budget:
//   - the height grid is stored as little-endian int16 in base64 (raster.elevationInt16Base64), not as a JSON
//     list of numbers; elevationGrid() reads either form;
//   - Eym's geology (the bedrock grid, plates, volcanoes, fault lines and history) is a separate file beside the
//     asset (asset.geologyFile names it), loaded only when something asks about rock or earthquakes; attachGeology()
//     puts it back where scripts/eym-geology.mjs and scripts/eym-quakes.mjs read it (asset.geology, raster.bedrock).
// Pure functions; reading files is left to the caller.

const decodeBase64 = (value) => (typeof Buffer !== "undefined" ? Uint8Array.from(Buffer.from(value, "base64")) : Uint8Array.from(atob(value), (c) => c.charCodeAt(0)));
const encodeBase64 = (bytes) => { if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64"); let text = ""; for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(text); };

/** The geology file's name beside an asset's ("eventide.json" → "eventide-geology.json"). */
export const geologyFileName = (assetPath) => assetPath.replace(/^.*\//, "").replace(/\.json$/, "-geology.json");

/**
 * Split a built asset into what is written: the main asset (height grid packed, geology taken out) and, when it
 * has geology, the geology document. `fileName` is the asset's own file name.
 */
export function packCartography(asset, fileName) {
  const { geology, ocean, ...rest } = asset, { elevationM, bedrock, ...raster } = asset.raster;
  const grid = new DataView(new ArrayBuffer(elevationM.length * 2));
  elevationM.forEach((value, i) => grid.setInt16(i * 2, Math.round(value), true));
  const main = { ...rest, raster: { elevationInt16Base64: encodeBase64(new Uint8Array(grid.buffer)), ...raster } };
  if (ocean) main.oceanFile = oceanFileName(fileName);
  const oceanDoc = ocean ? { schemaVersion: 1, system: asset.system, body: asset.body, sourceFingerprint: asset.sourceFingerprint, ocean } : null;
  if (!geology) return { main, geology: null, ocean: oceanDoc };
  main.geologyFile = geologyFileName(fileName);
  return { main, geology: { schemaVersion: 1, system: asset.system, body: asset.body, sourceFingerprint: asset.sourceFingerprint, geology, bedrock }, ocean: oceanDoc };
}

/** The ocean file's name beside an asset's ("eventide.json" → "eventide-ocean.json"): currents, loaded for the currents overlay. */
export const oceanFileName = (assetPath) => assetPath.replace(/^.*\//, "").replace(/\.json$/, "-ocean.json");

/** Put an ocean document back into its asset (returns the asset). */
export function attachOcean(asset, document) { if (document) asset.ocean = document.ocean; return asset; }

const grids = new WeakMap();
/** The height grid (m) of an asset, in either stored form (decoded once). */
export function elevationGrid(asset) {
  const raster = asset.raster;
  if (raster.elevationM) return raster.elevationM;
  if (grids.has(raster)) return grids.get(raster);
  const bytes = decodeBase64(raster.elevationInt16Base64), view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out = new Int16Array(bytes.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = view.getInt16(i * 2, true);
  grids.set(raster, out);
  return out;
}

/** Put a geology document back into its asset (returns the asset). */
export function attachGeology(asset, document) {
  if (!document) return asset;
  asset.geology = document.geology;
  asset.raster.bedrock = document.bedrock;
  return asset;
}

/** The drainage file's name beside an asset's ("eventide.json" → "eventide-drainage.json"): the valleys the land's water has cut (tools/generate-eym-drainage.mjs), loaded for the local detail, the Region layer and battle maps. */
export const drainageFileName = (assetPath) => assetPath.replace(/^.*\//, "").replace(/\.json$/, "-drainage.json");

/** Put a drainage document into its asset (returns the asset). */
export function attachDrainage(asset, document) { if (document) asset.drainage = document; return asset; }

/** The wind file's name beside an asset's ("eventide.json" → "eventide-wind.json"): the wind and wave climate of its landforms (tools/generate-eym-wind.mjs). */
export const windFileName = (assetPath) => assetPath.replace(/^.*\//, "").replace(/\.json$/, "-wind.json");

/** Put a wind document into its asset (returns the asset). */
export function attachWind(asset, document) { if (document) asset.wind = document; return asset; }

/** The rivers' monthly-climate file beside an asset's ("eventide.json" → "eventide-flow.json"): rain, snow and warmth by month (tools/generate-eym-flow.mjs). */
export const flowFileName = (assetPath) => assetPath.replace(/^.*\//, "").replace(/\.json$/, "-flow.json");

/** Put a monthly-climate document into its asset (returns the asset). */
export function attachFlow(asset, document) { if (document) asset.flow = document; return asset; }

/** Whether an asset has geology, loaded or not (the globe draws its sea floor from the plates when it has). */
export const hasGeology = (asset) => Boolean(asset?.geology || asset?.geologyFile);
