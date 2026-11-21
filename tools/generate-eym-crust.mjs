// Works out the crust under Eym's land, how deep it has been unroofed, what it sheds and where that sediment rests
// (owner's direction of 20 November 2026: isostasy, erosion and sediment by their causes), and writes
// data/eym/crust.json. A planet-wide account on the cartography's one-degree squares; the land's shapes are not
// changed by it. For each land square:
//   - the crust's thickness that floats its height (Airy isostasy; under northern Caren the mantle's swell holds
//     part of the height, so the crust there is thinner than the height alone would ask);
//   - how deep the rock at its surface once lay: a range's own unroofing near the range (scripts/eym-orogeny.mjs),
//     at least the basement's depth where rock that formed deep is at the surface, nothing under a cover of
//     sediment or lava;
//   - how fast it wears down, from its relief, its runoff (the rain budget's) and its rock's hardness;
// and for every square, land or sea, the sediment that comes to rest there (scripts/eym-sediment.mjs): alluvial
// plains, closed basins, deltas and shelves, as a thickness. Nothing is random.
//
//   node tools/generate-eym-crust.mjs           write the data file
//   node tools/generate-eym-crust.mjs --check   rebuild and compare with the data file

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { inputsFingerprint, WORLD_INPUTS } from "../scripts/eym-world-inputs.mjs";
import { attachGeology } from "../scripts/cartography-asset.mjs";
import { annualMeanTemperatureC, environmentField } from "../scripts/eym-seasons.mjs";
import { yearRunoffOf } from "../scripts/eym-river-flow.mjs";
import { SEDIMENT_MODEL, denudationMPerMyr, routeSediment } from "../scripts/eym-sediment.mjs";
import { carenRelief } from "../scripts/eym-caren-relief.mjs";
import { fromLocal } from "../scripts/eym-surface.mjs";

const root = new URL("../", import.meta.url), OUT = new URL("data/eym/crust.json", root), DIR = "data/planet-cartography/mitkear/";
export const CRUST_SOURCES = ["tools/generate-eym-crust.mjs", "scripts/eym-sediment.mjs", "scripts/eym-river-flow.mjs", "scripts/eym-caren-relief.mjs", "scripts/eym-seasons.mjs", "scripts/eym-rain-band.generated.mjs", `${DIR}eym.json`, `${DIR}eym-geology.json`, "data/eym/growth.json", "data/eym/tectonics.json"];
/** The dial groups it follows (scripts/eym-world-inputs.mjs). */
export const CRUST_INPUTS = ["sediment", "orogeny", "caren", "rivers"];
export const crustSourcesSha256 = () => { const h = createHash("sha256"); for (const p of CRUST_SOURCES) h.update(readFileSync(new URL(p, root))); h.update(inputsFingerprint(...CRUST_INPUTS)); return h.digest("hex"); };
const J = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8")), DEG = Math.PI / 180;
const b64 = (bytes) => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64");

/** Build the whole crust document. */
export function buildCrust() {
  const S = WORLD_INPUTS.sediment, O = WORLD_INPUTS.orogeny, float = 1 - O.crustDensity / O.mantleDensity;
  const asset = J(`${DIR}eym.json`); attachGeology(asset, J(`${DIR}eym-geology.json`));
  const field = environmentField(asset), rows = field.grid.latCount, cols = field.grid.lonCount, n = rows * cols, growth = J("data/eym/growth.json"), tectonics = J("data/eym/tectonics.json");
  const rockNames = asset.raster.bedrock.categories, rockValues = Buffer.from(asset.raster.bedrock.valuesBase64, "base64"), rockAt = (i) => rockNames[rockValues[i]];
  const swell = carenRelief(WORLD_INPUTS.caren, [], () => 0);
  // The ranges, as lines of places with what their histories gave (the grown continents carry the plate record's too).
  const ranges = []; for (const c of Object.values({ ...tectonics.continents, ...growth.continents })) for (const r of c.ridges) ranges.push({ continent: c.name, kind: r.origin, unroofedKm: r.unroofedKm, crustKm: r.crustKm, halfBeltKm: O.beltWidths * r.widthKm / 2, points: r.points.map(([x, y]) => fromLocal(c.center, x, y)) });
  const nearRange = (lat, lon) => { let best = null; for (const r of ranges) for (const [la, lo] of r.points) { if (Math.abs(la - lat) > 6) continue; const km = Math.hypot((la - lat) * 111.2, ((((lo - lon) % 360) + 540) % 360 - 180) * 111.2 * Math.cos(lat * DEG)); if (km < 1.6 * r.halfBeltKm && (!best || km / r.halfBeltKm < best.share)) best = { range: r, share: km / r.halfBeltKm }; } return best; };
  const DEEP = new Set(["granite-gneiss", "godstone-granite", "godstone-quartzite", "metamorphic", "marble"]);
  const heightM = new Array(n).fill(null), yieldKm3 = new Float64Array(n), crust = [], unroofed = [], wear = [], landIndex = [];
  for (const cell of field.cells) if (!cell.ocean) heightM[cell.id] = Math.max(0, cell.elevationM);
  const widthKmAt = (r) => 111.2 * Math.max(0.05, Math.cos((-89.5 + r) * DEG)), areaKm2 = (r) => 111.2 * widthKmAt(r);
  let shedTotal = 0;
  for (const cell of field.cells) {
    if (cell.ocean) continue; const i = cell.id, r = cell.latIndex, c = cell.lonIndex, h = heightM[i];
    let low = h; for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) { const rr = r + dr; if (rr < 0 || rr >= rows) continue; const hj = heightM[rr * cols + (c + dc + cols) % cols] ?? 0; if (hj < low) low = hj; }
    const rock = rockAt(i), hardness = S.rock[rock] ?? 1, runoffMm = yearRunoffOf(cell.rainMm ?? 0, annualMeanTemperatureC(cell.lat, h));
    const rate = denudationMPerMyr(S, { reliefM: h - low, runoffMm, rock: hardness }); yieldKm3[i] = rate / 1000 * areaKm2(r); shedTotal += yieldKm3[i];
    // The crust that floats this height; under Caren's swell the mantle holds part of it.
    const coastKm = cell.continentality * 1200, held = cell.lat > -12 && cell.lat < 11 && cell.lon > -9 && cell.lon < 10 ? swell.swellM(cell.lat, cell.lon, coastKm) * WORLD_INPUTS.caren.swell.dynamicShare : 0;
    const near = nearRange(cell.lat, cell.lon), crustKm = Math.min(O.maxCrustKm, O.crustKm + Math.max(0, h - held) / (float * 1000));
    const fromRange = near ? near.range.unroofedKm * Math.exp(-(near.share ** 2)) : 0, deep = DEEP.has(rock) ? Math.max(S.basementUnroofedKm, fromRange) : rock === "volcanic" ? 0 : 0;
    landIndex.push(i); crust.push(crustKm); unroofed.push(deep); wear.push(rate);
  }
  const routed = routeSediment(S, { rows, cols, heightM, yieldKm3, widthKmAt });
  // Thickness: today's rates kept up since the break-up, spread over the square, no thicker than a basin can hold.
  const deposits = []; let rested = 0;
  for (let i = 0; i < n; i += 1) { const v = routed.depositKm3[i]; if (v <= 0) continue; rested += v; const km = Math.min(S.maxFillKm, v * S.depositMyr / areaKm2(Math.floor(i / cols))); if (km >= 0.05) deposits.push([i, Math.round(km * 10), routed.kind[i], Math.round(v)]); }
  const place = (i) => [-89.5 + Math.floor(i / cols), -179.5 + (i % cols)];
  const continentOf = (i) => { let k = i; for (let step = 0; step < 4; step += 1) { const cell = field.cells[k]; if (!cell.ocean) break; const r = Math.floor(k / cols), c = k % cols; let found = -1; for (let dr = -1; dr <= 1 && found < 0; dr += 1) for (let dc = -1; dc <= 1; dc += 1) { const rr = r + dr; if (rr < 0 || rr >= rows) continue; const j = rr * cols + (c + dc + cols) % cols; if (!field.cells[j].ocean) { found = j; break; } } if (found < 0) break; k = found; } const [lat, lon] = place(k); return asset.terrain.coastlines.filter((c) => c.kind === "mainland" && c.continent).map((c) => ({ name: c.continent, d: Math.min(...c.points.filter((_, q) => q % 8 === 0).map((p) => Math.hypot(p[0] - lat, ((((p[1] - lon) % 360) + 540) % 360 - 180) * Math.cos(lat * DEG)))) })).sort((a, b) => a.d - b.d)[0]?.name ?? null; };
  const top = (kind, count) => deposits.filter((d) => d[2] === kind).sort((a, b) => b[3] - a[3] || a[0] - b[0]).slice(0, count).map(([i, deciKm, , km3]) => ({ at: place(i), continent: continentOf(i), km3PerMyr: km3, thicknessKm: deciKm / 10 }));
  const u8 = (values, scale) => b64(Uint8Array.from(values, (v) => Math.min(255, Math.round(v * scale)))), u16 = (values) => b64(Uint16Array.from(values, (v) => Math.min(65535, Math.round(v))));
  const mean = (list) => list.reduce((a, b) => a + b, 0) / (list.length || 1), sorted = [...wear].sort((a, b) => a - b);
  return {
    schemaVersion: 1, model: SEDIMENT_MODEL, sourcesSha256: crustSourcesSha256(), resolutionDeg: 1,
    summary: {
      landSquares: landIndex.length, crustKm: [Math.round(Math.min(...crust) * 10) / 10, Math.round(mean(crust) * 10) / 10, Math.round(Math.max(...crust) * 10) / 10],
      wearMPerMyr: { least: Math.round(sorted[0]), middle: Math.round(sorted[sorted.length >> 1]), mean: Math.round(mean(wear)), most: Math.round(sorted.at(-1)) },
      unroofedSquares: unroofed.filter((v) => v > 0).length, deepestUnroofedKm: Math.max(...unroofed),
      shedKm3PerMyr: Math.round(shedTotal), restedKm3PerMyr: Math.round(rested),
      restsBy: Object.fromEntries(["delta", "shelf", "plain", "basin"].map((k) => [k, Math.round(routed.depositKm3.reduce((s, v, i) => s + (routed.kind[i] === k ? v : 0), 0))])),
      greatestDeltas: top("delta", 12), greatestBasins: top("basin", 8), greatestPlains: top("plain", 8),
    },
    // Land squares in the raster's order (rows from the south): crust (km × 3), unroofing (km × 5), wear (m a million years).
    land: { count: landIndex.length, crustThirdKmBase64: u8(crust, 3), unroofedFifthKmBase64: u8(unroofed, 5), wearMPerMyrUint16Base64: u16(wear) },
    // Sediment at rest: [square, thickness in tenths of a km, kind, km³ a million years], squares numbered row by row from the south-west.
    sediment: { depositMyr: S.depositMyr, squares: deposits.map(([i, deciKm, kind, km3]) => [i, deciKm, kind, km3]) },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const began = Date.now(), data = buildCrust(), text = `${JSON.stringify(data)}\n`;
  if (process.argv.includes("--check")) { const same = readFileSync(OUT, "utf8") === text; console.log(same ? "crust.json is up to date" : "crust.json differs"); process.exit(same ? 0 : 1); }
  writeFileSync(OUT, text); const s = data.summary;
  console.log(`crust.json: ${text.length} bytes; crust ${s.crustKm.join(" / ")} km; wear ${s.wearMPerMyr.least} / ${s.wearMPerMyr.middle} / ${s.wearMPerMyr.most} m a million years (mean ${s.wearMPerMyr.mean}); ${s.unroofedSquares} squares of deep rock at the surface; shed ${s.shedKm3PerMyr} km³ a million years, at rest ${JSON.stringify(s.restsBy)}; ${((Date.now() - began) / 1000).toFixed(1)} s`);
  console.log("greatest deltas:", s.greatestDeltas.slice(0, 6).map((d) => `${d.continent} ${d.at.join(",")}: ${d.km3PerMyr} km³/Myr, ${d.thicknessKm} km`).join("; "));
}
