// Fits Eym's wind and wave climate for its landforms (the wind addendum to Stage 3 of the physical history and
// climate programme) and writes data/planet-cartography/abydos/eventide-wind.json. Four years of the weather and
// the swell (scripts/eym-weather.mjs, scripts/eym-sea.mjs: the same storms, winds and swell as everywhere else)
// are sampled every 7 hours over Caren, Garyk and their islands:
//   - at the sea off every coast: the wave energy arriving from each of 16 directions (wind sea and swell), and
//     the sand-moving power of the wind from each direction, which drive the coasts (scripts/eym-landforms.mjs);
//   - over the land: the sand-moving power of the wind by direction, the year's rain and how dry the driest season is;
//   - loess: dust lifted from dry, bare, windy ground with fine sediment, carried downwind and settled where
//     grass and woods trap it, as a thickness on a 0.25° grid.
// Nothing is random beyond the weather's own seeded storms.
//
//   node tools/generate-eym-wind.mjs           write the data file
//   node tools/generate-eym-wind.mjs --check   rebuild and compare with the data file

import { inputsFingerprint } from "../scripts/eym-world-inputs.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { systemsBetween, systemAt, weatherAt } from "../scripts/eym-weather.mjs";
import { destination, nearestSea, seaState, swellSources } from "../scripts/eym-sea.mjs";
import { approximateDeclinationDeg, environmentField, yearFraction } from "../scripts/eym-seasons.mjs";
import { attachGeology, attachOcean } from "../scripts/cartography-asset.mjs";
import { geologyAt } from "../scripts/eym-geology.mjs";
import { DAY_MS, DAYS_PER_YEAR, NORTHWARD_EQUINOX_MS } from "../scripts/universal-time.mjs";

const root = new URL("../", import.meta.url), OUT = new URL("data/planet-cartography/abydos/eventide-wind.json", root);
export const WIND_MODEL = "eym-wind-v1";
/** What the wind climate is made from: this tool, the weather and sea models, and the data they read. */
export const WIND_SOURCES = ["tools/generate-eym-wind.mjs", "scripts/eym-weather.mjs", "scripts/eym-sea.mjs", "scripts/eym-seasons.mjs", "scripts/eym-geology.mjs", "data/planet-cartography/abydos/eventide.json", "data/planet-cartography/abydos/eventide-geology.json", "data/planet-cartography/abydos/eventide-ocean.json", "data/eym/climate.json"];
/** The dials it follows (scripts/eym-world-inputs.mjs): the weather's circulation. */
export const WIND_INPUTS = ["weather"];
export const windSourcesSha256 = () => { const h = createHash("sha256"); for (const p of WIND_SOURCES) h.update(readFileSync(new URL(p, root))); h.update(inputsFingerprint(...WIND_INPUTS)); return h.digest("hex"); };
export const CONTINENTS = ["Caren", "Garyk"];
export const YEARS = 4, STEP_HOURS = 7, SECTORS = 16;
/** The wind (m/s at 10 m) at which dry sand starts to move. */
export const SAND_THRESHOLD_MS = 6;
export const LOESS_RES_DEG = 0.25;

const DEG = Math.PI / 180, HOUR_MS = DAY_MS / 24, clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sectorOf = (fromDeg) => Math.round((((fromDeg % 360) + 360) % 360) / (360 / SECTORS)) % SECTORS;
/** The sand-moving power of a wind (Fryberger's drift potential, per sample, in m/s units): u²(u − ut) above the threshold. */
export const driftPower = (windMs) => (windMs > SAND_THRESHOLD_MS ? windMs * windMs * (windMs - SAND_THRESHOLD_MS) : 0);
/** How bare the ground of a biome is (the share of the year it lies open to the wind). */
export const BARE = Object.freeze({ "hot-desert": 1, "cold-desert": 1, "ice-cap": 0, tundra: 0.5, steppe: 0.6, savanna: 0.45, "seasonal-forest": 0.12, "temperate-forest": 0.05, taiga: 0.05, "temperate-rainforest": 0.02, "tropical-rainforest": 0.02 });
/** How much fine, liftable sediment a soil holds (silt and fine sand). */
export const FINES = Object.freeze({ "alluvial-fertile": 1, "glacial-mineral": 1, "arid-mineral": 0.8, "black-earth": 0.35, "temperate-loam": 0.3, "terra-rossa": 0.25, rendzina: 0.2, "sandy-acid": 0.5, "stony-loam": 0.2, "thin-rocky": 0.1, laterite: 0.2, podzol: 0.25, "leached-humid": 0.2, "tundra-peat": 0.1 });
/** How well a biome's plants trap settling dust. */
export const TRAP = Object.freeze({ steppe: 1, savanna: 0.9, "temperate-forest": 0.75, "seasonal-forest": 0.7, taiga: 0.6, tundra: 0.5, "temperate-rainforest": 0.6, "tropical-rainforest": 0.5, "hot-desert": 0.15, "cold-desert": 0.2, "ice-cap": 0 });

/** How dry a place is (0–1): from the year's rain, or a long dry season. */
export const dryness = (annualMm, driestShare) => Math.max(clamp((800 - annualMm) / 600, 0, 1), 0.7 * clamp((0.35 - driestShare) / 0.3, 0, 1));

const u8 = (values) => Buffer.from(Uint8Array.from(values.map((v) => clamp(Math.round(v), 0, 255)))).toString("base64");
const u16 = (values) => { const b = Buffer.alloc(values.length * 2); values.forEach((v, k) => b.writeUInt16LE(clamp(Math.round(v), 0, 65535), k * 2)); return b.toString("base64"); };

/** Build the whole wind document. */
export function buildWind(asset) {
  const field = environmentField(asset);
  const outlines = asset.terrain.coastlines.filter((c) => CONTINENTS.includes(c.continent));
  // The sea off every coast: the field's sea cells nearest each coast point.
  const seaCells = new Map();
  for (const c of outlines) for (let k = 0; k < c.points.length; k += 2) { const s = nearestSea(field, c.points[k][0], c.points[k][1]); if (s) { const cell = field.cellAt(s[0], s[1]); seaCells.set(cell.id, cell); } }
  // The land: every land cell within a degree of the continents' outlines.
  const landCells = new Map(), boxes = [];
  for (const name of CONTINENTS) {
    let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
    for (const o of outlines.filter((x) => x.continent === name)) for (const [lat, lon] of o.points) { a = Math.min(a, lat); b = Math.max(b, lat); c = Math.min(c, lon); d = Math.max(d, lon); }
    boxes.push({ name, lat0: Math.floor(a) - 1, lat1: Math.ceil(b) + 1, lon0: Math.floor(c) - 1, lon1: Math.ceil(d) + 1 });
  }
  for (const box of boxes) for (let lat = box.lat0 + 0.5; lat < box.lat1; lat += 1) for (let lon = box.lon0 + 0.5; lon < box.lon1; lon += 1) { const cell = field.cellAt(lat, lon); if (!cell.ocean) landCells.set(cell.id, cell); }
  const seaList = [...seaCells.values()].sort((x, y) => x.id - y.id), landList = [...landCells.values()].sort((x, y) => x.id - y.id);
  const wave = seaList.map(() => new Float64Array(SECTORS)), seaDrift = seaList.map(() => new Float64Array(SECTORS)), seaHs = new Float64Array(seaList.length);
  const landDrift = landList.map(() => new Float64Array(SECTORS)), rain = landList.map(() => new Float64Array(4)), rainCount = new Float64Array(4);

  const isOcean = (lat, lon) => field.cellAt(lat, lon).ocean, landFraction = (lat, lon) => (field.cellAt(lat, lon).ocean ? 0 : 1);
  const h0 = Math.round(NORTHWARD_EQUINOX_MS / HOUR_MS), hours = Math.round(YEARS * DAYS_PER_YEAR * 24);
  let samples = 0;
  for (let hour = h0; hour < h0 + hours; hour += STEP_HOURS) {
    const systems = systemsBetween(hour - 120, hour, isOcean, field.sstC), sources = swellSources(systems, hour - 120, hour, landFraction);
    const alive = []; for (const s of systems) { const at = systemAt(s, hour, landFraction); if (at) alive.push(at); }
    const timeMs = hour * HOUR_MS, declinationDeg = approximateDeclinationDeg(timeMs), season = Math.floor(yearFraction(timeMs) * 4) % 4;
    const ctx = (cell) => ({ cell, timeMs, declinationDeg, solarHour: (((hour % 24) + cell.lon / 15) % 24 + 24) % 24, anomalyC: field.anomalyAt(cell.lat, cell.lon, timeMs) });
    seaList.forEach((cell, k) => {
      const w = weatherAt(alive, cell.lat, cell.lon, ctx(cell)), sea = seaState(field, sources, cell.lat, cell.lon, hour, w);
      wave[k][sectorOf(w.windFromDeg)] += sea.wind.hsM ** 2;
      for (const s of sea.swell) wave[k][sectorOf(s.fromDeg)] += s.hsM ** 2;
      seaDrift[k][sectorOf(w.windFromDeg)] += driftPower(w.windMs);
      seaHs[k] += sea.hsM ** 2;
    });
    landList.forEach((cell, k) => {
      const w = weatherAt(alive, cell.lat, cell.lon, ctx(cell));
      landDrift[k][sectorOf(w.windFromDeg)] += driftPower(w.windMs);
      rain[k][season] += w.precipMmH;
    });
    rainCount[season] += 1; samples += 1;
  }

  // Per land cell: the year's rain (mm), the driest season's share of an even year (1 = even), drift by direction.
  const annualMm = rain.map((r) => r.reduce((s, v, q) => s + v / rainCount[q], 0) / 4 * DAYS_PER_YEAR * 24);
  const driestShare = rain.map((r) => { const means = r.map((v, q) => v / rainCount[q]), mean = means.reduce((a, b) => a + b, 0) / 4; return mean > 0 ? Math.min(...means) / mean : 1; });
  const landDp = landDrift.map((rose) => [...rose].map((v) => v / samples));

  // Loess: dust lifted from dry, bare, windy ground with fine sediment, carried with the year's net drift and
  // settled where plants trap it. Thickness (m) on a 0.25° grid over each continent's box.
  const dpTotal = landDp.map((rose) => rose.reduce((a, b) => a + b, 0)), dpRef = Math.max(1, [...dpTotal].sort((a, b) => a - b)[Math.floor(dpTotal.length * 0.9)]);
  const landIndex = new Map(landList.map((cell, k) => [cell.id, k]));
  const loessGrids = boxes.map((box) => {
    const rows = Math.round((box.lat1 - box.lat0) / LOESS_RES_DEG), cols = Math.round((box.lon1 - box.lon0) / LOESS_RES_DEG), dust = new Float64Array(rows * cols);
    for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
      const lat = box.lat0 + (r + 0.5) * LOESS_RES_DEG, lon = box.lon0 + (c + 0.5) * LOESS_RES_DEG, cell = field.cellAt(lat, lon), k = landIndex.get(cell.id);
      if (k === undefined || cell.ocean) continue;
      const soil = geologyAt(asset, lat, lon)?.soil ?? null;
      const source = dryness(annualMm[k], driestShare[k]) * (BARE[cell.biome] ?? 0.1) * clamp(dpTotal[k] / dpRef, 0, 1.5) * (FINES[soil] ?? 0.2);
      if (source < 0.01) continue;
      // The year's net drift: the wind's sand-moving power by direction, summed as vectors (toward where it blows).
      let e = 0, n = 0; landDp[k].forEach((v, s) => { const to = (s * 360 / SECTORS + 180) * DEG; e += v * Math.sin(to); n += v * Math.cos(to); });
      const net = Math.hypot(e, n); if (net <= 0) continue;
      const bearing = (Math.atan2(e, n) / DEG + 360) % 360, carried = source * clamp(net / dpTotal[k] + 0.3, 0, 1);
      for (let km = 20; km <= 500; km += 20) {
        const [la, lo] = destination(lat, lon, bearing, km), there = field.cellAt(la, lo);
        if (there.ocean) continue;
        const rr = Math.floor((la - box.lat0) / LOESS_RES_DEG), cc = Math.floor((lo - box.lon0) / LOESS_RES_DEG); if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
        // Plants trap the dust; high, steep, cold ground sheds it (loess blankets lowlands and gentle uplands).
        dust[rr * cols + cc] += carried * Math.exp(-km / 150) * (TRAP[there.biome] ?? 0.5) * clamp(1 - there.elevationM / 2500, 0, 1);
      }
    }
    // A strong source upwind for some 200 km leaves about 30 m of loess; kept in 0.2 m steps.
    const thicknessM = Array.from(dust, (v) => 30 * v / 6);
    return { name: box.name, lat0: box.lat0, lon0: box.lon0, rows, cols, thicknessDmU8Base64: u8(thicknessM.map((m) => m * 5)) };
  });

  const cbrtScale = (v) => Math.cbrt(v) * 20;
  return {
    schemaVersion: 1, model: WIND_MODEL, sourcesSha256: windSourcesSha256(), years: YEARS, stepHours: STEP_HOURS, samples, sectors: SECTORS, sandThresholdMs: SAND_THRESHOLD_MS,
    // Roses: 16 directions from north, clockwise, by where the wind or waves come FROM.
    // waveU8: 40 × √(mean Hs² from that direction, m²); driftU8: 20 × ∛(mean drift power from that direction); hsDm: overall significant height (dm).
    sea: { cells: seaList.map((c) => c.id), waveU8Base64: u8(wave.flatMap((rose) => [...rose].map((v) => 40 * Math.sqrt(v / samples)))), driftU8Base64: u8(seaDrift.flatMap((rose) => [...rose].map((v) => cbrtScale(v / samples)))), hsDmU8Base64: u8([...seaHs].map((v) => 10 * Math.sqrt(v / samples))) },
    land: { cells: landList.map((c) => c.id), driftU8Base64: u8(landDp.flatMap((rose) => [...rose].map(cbrtScale))), annualMmU16Base64: u16(annualMm), driestSharePctU8Base64: u8(driestShare.map((v) => 100 * v)) },
    loess: { resDeg: LOESS_RES_DEG, grids: loessGrids },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const read = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));
  const asset = read("data/planet-cartography/abydos/eventide.json");
  attachGeology(asset, read(`data/planet-cartography/abydos/${asset.geologyFile}`)); attachOcean(asset, read("data/planet-cartography/abydos/eventide-ocean.json"));
  const t0 = Date.now(), data = buildWind(asset), text = `${JSON.stringify(data)}\n`;
  if (process.argv.includes("--check")) { const same = readFileSync(OUT, "utf8") === text; console.log(same ? "eventide-wind.json is up to date" : "eventide-wind.json differs"); process.exit(same ? 0 : 1); }
  writeFileSync(OUT, text);
  console.log(`eventide-wind.json: ${data.sea.cells.length} sea cells, ${data.land.cells.length} land cells, ${data.samples} samples, ${text.length} bytes, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
