// Eym's rivers through the year (Stage 4 of the physical history and climate programme). The monthly rain, snow
// and temperature over Caren and Garyk (tools/generate-eym-flow.mjs, attached as `asset.flow`) run through a
// simple water balance at every place a river drains:
//   - snow lies while it is freezing and melts as it warms (high headwaters feed the spring flood);
//   - the soil holds some 150 mm; plants draw it down as fast as the warmth allows;
//   - what the soil cannot hold runs off at once or soaks down to the groundwater, which feeds the river
//     slowly through the dry season (and rises as springs where porous rock meets the surface);
//   - a big river smooths and delays its flood as it gathers water from far upstream.
// From that, any river's flow at any moment: its stage (dry, low, normal, high or in flood), its depth and how much
// of its bed the water fills, and whether it can be waded. The year's rain swings with the oscillation of the great
// equatorial ocean (scripts/eym-climate.mjs: El Niño years) and from year to year, so some years bring floods and
// some droughts. Nothing is random.

import { ensoIndex } from "./eym-climate.mjs";
import { yearFraction } from "./eym-seasons.mjs";
import { DAY_MS, DAYS_PER_YEAR, NORTHWARD_EQUINOX_MS } from "./universal-time.mjs";

export const RIVER_FLOW_MODEL = "eym-river-flow-v1";
const MONTHS = 12, LAPSE = 0.0065, SOIL_MM = 150, GROUND_MONTHS = 4, SECONDS_PER_MONTH = DAYS_PER_YEAR * DAY_MS / 1000 / MONTHS;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** The deepest water a person wades across (m). */
export const WADE_M = 0.9;

// ---------------------------------------------------------------- the monthly climate, unpacked

const cache = new WeakMap();
const bytes = (b64) => (typeof Buffer !== "undefined" ? Uint8Array.from(Buffer.from(b64, "base64")) : Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

/** The monthly climate of an asset ({ cells: Map id → { rainMm[12], tempC[12], elevationM } }), or null when it is not attached. */
export function flowClimate(asset) {
  const doc = asset?.flow; if (!doc?.cells) return null;
  const hit = cache.get(doc); if (hit) return hit;
  const rain = bytes(doc.rainMmU16Base64), temp = bytes(doc.tempHalfCU8Base64), cells = new Map();
  doc.cells.forEach((id, k) => cells.set(id, {
    rainMm: Array.from({ length: MONTHS }, (_, m) => rain[2 * (k * MONTHS + m)] + 256 * rain[2 * (k * MONTHS + m) + 1]),
    tempC: Array.from({ length: MONTHS }, (_, m) => temp[k * MONTHS + m] / 2 - 40), elevationM: doc.elevationM[k],
  }));
  const out = { cells, runoff: new Map() };
  cache.set(doc, out);
  return out;
}

// ---------------------------------------------------------------- the water balance

/**
 * A year of a place's water balance, from its monthly rain (mm) and temperature (°C), run until it repeats:
 * { runoffMm[12] (what reaches the streams each month: quick runoff and groundwater together), baseMm[12] (the
 * groundwater's share), snowMm[12] (the snow lying at each month's end), meltMm[12] }.
 */
export function waterBalance(rainMm, tempC) {
  let snow = 0, soil = SOIL_MM / 2, ground = 0;
  const out = { runoffMm: new Array(MONTHS).fill(0), baseMm: new Array(MONTHS).fill(0), snowMm: new Array(MONTHS).fill(0), meltMm: new Array(MONTHS).fill(0) };
  for (let year = 0; year < 4; year += 1) for (let m = 0; m < MONTHS; m += 1) {
    const t = tempC[m], p = rainMm[m];
    // Snow below freezing, rain above 2 °C, a mix between; melt of some 25 mm a month for each degree above freezing.
    const snowShare = clamp((2 - t) / 2, 0, 1); snow += p * snowShare;
    const melt = t > 0 ? Math.min(snow, 25 * t) : 0; snow -= melt;
    // Plants draw the soil down as fast as the warmth allows (some 5.5 mm a month per degree), less as it dries.
    const pet = Math.min(160, 5.5 * Math.max(0, t));
    soil += p * (1 - snowShare) + melt;
    soil -= Math.min(soil, pet * clamp(soil / (0.6 * SOIL_MM), 0, 1));
    const excess = Math.max(0, soil - SOIL_MM); soil -= excess;
    // Of what the soil cannot hold, three parts in five run off at once and two soak down to the groundwater,
    // which gives back a quarter of what it holds each month.
    ground += 0.4 * excess; const base = ground / GROUND_MONTHS; ground -= base;
    if (year === 3) { out.runoffMm[m] = 0.6 * excess + base; out.baseMm[m] = base; out.snowMm[m] = snow; out.meltMm[m] = melt; }
  }
  return out;
}

/** The water balance of a climate cell at a height (m): its temperatures lowered with height (0.65 °C per 100 m). */
function cellBalance(climate, cellId, elevationM) {
  const cell = climate.cells.get(cellId); if (!cell) return null;
  const band = Math.round(elevationM / 250), key = `${cellId}|${band}`;
  let hit = climate.runoff.get(key);
  if (!hit) { const dz = band * 250 - cell.elevationM; hit = waterBalance(cell.rainMm, cell.tempC.map((t) => t - LAPSE * Math.max(0, dz))); climate.runoff.set(key, hit); }
  return hit;
}

// ---------------------------------------------------------------- a river's year

const regimes = new WeakMap();

/**
 * A river's year at one place along it: `river` is { points: [[lat, lon], …] from source to mouth } and `k` the
 * index of the point; the land upstream (points 0…k) sets the climate it drains, at the height of each point
 * (`elevationAt(lat, lon)`), and `areaKm2` the land it drains. Returns { flowM3s[12], meanM3s, bankfullM3s,
 * snowFed (the share of the year's water that fell as snow), months }.
 */
export function riverYear(asset, field, river, k, areaKm2, elevationAt) {
  const climate = flowClimate(asset); if (!climate || !river?.points?.length) return null;
  const upto = clamp(Math.round(k), 0, river.points.length - 1), bucket = Math.round(upto / Math.max(1, river.points.length - 1) * 20);
  let memo = regimes.get(river); if (!memo) regimes.set(river, (memo = new Map()));
  const key = `${bucket}|${Math.round(areaKm2)}`; if (memo.has(key)) return memo.get(key);
  // The upstream land: up to 40 points spread from the source to here.
  const last = Math.round(bucket / 20 * (river.points.length - 1)), step = Math.max(1, Math.ceil((last + 1) / 40));
  const runoff = new Array(MONTHS).fill(0); let n = 0, melt = 0, total = 0;
  for (let i = 0; i <= last; i += step) {
    const [lat, lon] = river.points[i], cell = field.cellAt(lat, lon), balance = cellBalance(climate, cell.id, elevationAt(lat, lon)); if (!balance) continue;
    balance.runoffMm.forEach((v, m) => { runoff[m] += v; }); melt += balance.meltMm.reduce((a, b) => a + b, 0); total += balance.runoffMm.reduce((a, b) => a + b, 0); n += 1;
  }
  if (!n) { memo.set(key, null); return null; }
  // Flow (m³/s) from the land's runoff, then smoothed and delayed by the river's size (a linear store of
  // some days for a brook, a month or more for a great river).
  const inflow = runoff.map((mm) => areaKm2 * 1e6 * (mm / n) / 1000 / SECONDS_PER_MONTH), lag = clamp(0.15 + Math.log10(1 + areaKm2) / 7, 0.15, 1.2);
  const flow = new Array(MONTHS).fill(inflow.reduce((a, b) => a + b, 0) / MONTHS);
  for (let pass = 0; pass < 4; pass += 1) for (let m = 0; m < MONTHS; m += 1) { const prev = flow[(m + MONTHS - 1) % MONTHS]; flow[m] = prev + (inflow[m] - prev) / (1 + lag); }
  // The bed is cut to the flood most years bring: a little below the peak month's flow, so a river overtops its banks
  // for some weeks at the height of an ordinary year's flood, longer in a wet year, and not at all in a drought.
  const meanM3s = flow.reduce((a, b) => a + b, 0) / MONTHS, sorted = [...flow].sort((a, b) => b - a);
  const out = { flowM3s: flow, meanM3s, bankfullM3s: Math.max(meanM3s * 1.3, sorted[0] * 0.9), snowFed: total > 0 ? clamp(melt / n / (total / n), 0, 1) : 0, months: MONTHS };
  memo.set(key, out);
  return out;
}

// ---------------------------------------------------------------- the river now

const STAGE_WORDS = { dry: "dry", low: "low", normal: "at its usual level", high: "high", flood: "in flood" };

/**
 * The river at a moment, from its year (riverYear) and how wide its bed is (m): { stage ("dry" | "low" | "normal"
 * | "high" | "flood"), flowM3s, ratio (to the mean), depthM (at the deepest), fillShare (how much of the bed's width
 * the water covers), fordable (it can be waded where it is shallowest), words }. `wet` (0.6–1.5) scales the
 * flow for a wet or dry year (yearWetness).
 */
export function riverStage(year, bedWidthM, timeMs, wet = 1) {
  if (!year) return null;
  const f = yearFraction(timeMs) * MONTHS - 0.5, m0 = ((Math.floor(f) % MONTHS) + MONTHS) % MONTHS, t = f - Math.floor(f);
  // A smooth curve through the months' flows, round the year, that never overshoots them (a monotone cubic: where the
  // flow rises from one month to the next it rises all the way, without a dip before a flood or a bump after it).
  const q = (k) => year.flowM3s[((m0 + k) % MONTHS + MONTHS) % MONTHS], [p0, p1, p2, p3] = [q(-1), q(0), q(1), q(2)];
  const tangent = (a, b, c) => { const d0 = b - a, d1 = c - b; return d0 * d1 <= 0 ? 0 : (2 * d0 * d1) / (d0 + d1); };
  const m1 = tangent(p0, p1, p2), m2 = tangent(p1, p2, p3), t2 = t * t, t3 = t2 * t;
  const curve = (2 * t3 - 3 * t2 + 1) * p1 + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2 + (t3 - t2) * m2;
  const flowM3s = Math.max(0, curve) * wet, ratio = flowM3s / Math.max(1e-6, year.meanM3s);
  // Depth and width with the flow (the usual hydraulic geometry: depth as Q^0.4, width as Q^0.25 below bankfull).
  const bankDepth = clamp(0.32 * year.bankfullM3s ** 0.4, 0.3, 12), share = flowM3s / Math.max(1e-6, year.bankfullM3s);
  const depthM = bankDepth * share ** 0.4, fillShare = clamp(share ** 0.25, 0.15, 1);
  const stage = share > 1.05 ? "flood" : flowM3s < 0.02 * year.meanM3s || flowM3s < 0.05 ? "dry" : ratio < 0.5 ? "low" : ratio > 1.6 ? "high" : "normal";
  // The shallowest crossing (a riffle or a ford) is some three-fifths as deep as the deepest water.
  const fordable = stage !== "flood" && depthM * 0.6 <= WADE_M && bedWidthM <= 400;
  return { stage, flowM3s, ratio, depthM, fillShare, fordable, words: `${STAGE_WORDS[stage]} (${flowM3s >= 10 ? Math.round(flowM3s) : flowM3s.toFixed(1)} m³/s, ${ratio.toFixed(1)}× its mean)` };
}

/** Smooth keyed noise in −1…1, one new value per unit of `t` (here, per year). */
const keyedNoise = (key, t) => {
  const h = (k) => { let x = 2166136261; for (let i = 0; i < k.length; i += 1) x = Math.imul(x ^ k.charCodeAt(i), 16777619); x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 13; return (x >>> 0) / 4294967296; };
  const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return 2 * ((1 - u) * h(`${key}|${i}`) + u * h(`${key}|${i + 1}`)) - 1;
};

/**
 * How much wetter (or drier) than usual this year is for a river reaching the sea at `mouth` (0.6–1.5). Two parts:
 * the oscillation of the great equatorial ocean (scripts/eym-climate.mjs), which, as on Earth, brings more rain to
 * the eastern side of its basin in a warm year and less to the western side, most in the tropics; and the rest of
 * the year-to-year swing (some ±15%), smooth from year to year and the same for every river in a 5° region.
 */
/** How far beyond each end of the oscillation's basin its shores share in it, as a share of the basin's width. */
export const ENSO_SHORE = 0.15;
export function yearWetness(asset, mouth, timeMs) {
  if (!mouth) return 1;
  const basin = asset?.climate?.enso?.basin, years = (timeMs - NORTHWARD_EQUINOX_MS) / (DAYS_PER_YEAR * DAY_MS);
  let enso = 0;
  if (basin) {
    // Where the mouth lies across the basin: 0 at its west side, 1 at its east. The lands that shut the basin in
    // are its shores and share in the side they stand on, for `ENSO_SHORE` of its width beyond each end (so Caren,
    // the land the warm water piles against, is the western shore: dry years when the basin warms, as with the
    // lands west of Earth's Pacific; owner and world's author, 20 November 2026). Farther off there is no share.
    const beyond = (360 - basin.widthDeg) / 2, east = ((((mouth[1] - basin.westLon + beyond) % 360) + 360) % 360) - beyond, across = east / basin.widthDeg;
    const side = across >= -ENSO_SHORE && across <= 1 + ENSO_SHORE ? clamp(2 * across - 1, -1, 1) : 0, tropics = Math.exp(-((mouth[0] / 25) ** 2));
    enso = 0.25 * ensoIndex(timeMs, asset.climate.enso) * side * tropics;
  }
  const swing = 0.15 * keyedNoise(`${RIVER_FLOW_MODEL}|year|${Math.floor(mouth[0] / 5)}|${Math.floor(mouth[1] / 5)}`, years);
  return clamp(1 + enso + swing, 0.6, 1.5);
}

/**
 * When the river can next be waded, from now: days until its flow at the shallowest crossing falls to wading depth
 * (searched a day at a time over the next year: Eym's days), or null if not within the year.
 */
export function daysUntilFordable(year, bedWidthM, timeMs, wet = 1) {
  if (!year || bedWidthM > 400) return null;
  for (let d = 0; d <= Math.ceil(DAYS_PER_YEAR); d += 1) if (riverStage(year, bedWidthM, timeMs + d * DAY_MS, wet)?.fordable) return d;
  return null;
}

/** The months (0 = from the northward equinox) a river is usually in flood and usually low, for a description. */
export function floodAndLowMonths(year) {
  if (!year) return { flood: [], low: [] };
  return { flood: year.flowM3s.flatMap((q, m) => (q > year.bankfullM3s ? [m] : [])), low: year.flowM3s.flatMap((q, m) => (q < 0.5 * year.meanM3s ? [m] : [])) };
}

// ---------------------------------------------------------------- widths that follow the water

/** A river's yearly runoff (mm): the mean over the climate cells along it, each at its own height. Null without the climate. */
export function runoffAlongMm(asset, field, points) {
  const climate = flowClimate(asset); if (!climate) return null;
  let sum = 0, n = 0; const step = Math.max(1, Math.ceil(points.length / 40));
  for (let i = 0; i < points.length; i += step) { const cell = field.cellAt(points[i][0], points[i][1]), b = cellBalance(climate, cell.id, climate.cells.get(cell.id)?.elevationM ?? 0); if (b) { sum += b.runoffMm.reduce((a, c) => a + c, 0); n += 1; } }
  return n ? sum / n : null;
}

/** The middle yearly runoff (mm) of Caren's and Garyk's land: the yardstick a river's width is measured against. */
export function referenceRunoffMm(asset) {
  const climate = flowClimate(asset); if (!climate) return null;
  if (climate.reference == null) { const all = [...climate.cells.entries()].map(([id, c]) => cellBalance(climate, id, c.elevationM).runoffMm.reduce((a, b) => a + b, 0)).sort((a, b) => a - b); climate.reference = all[Math.floor(all.length / 2)]; }
  return climate.reference;
}

/**
 * How much wider or narrower a river's bed is than its old channel's measure gave (0.7–1.35): a channel cuts its bed
 * to the water it carries, which grows with the square root of the flow; the flow, for the same land drained, with
 * how much of the rain runs off. 1 without the climate.
 */
export function widthFactor(asset, field, points) {
  const along = runoffAlongMm(asset, field, points), ref = referenceRunoffMm(asset);
  return along == null || !ref ? 1 : clamp(Math.sqrt(Math.max(along, 1) / ref), 0.7, 1.35);
}

// ---------------------------------------------------------------- in words, and for battle maps

/**
 * The river by a place in a line for the "Here and now" card, from a river report (riverHere in
 * scripts/eym-local-detail.mjs): its stage and flow, its bed, and whether and when it can be crossed on foot
 * (the delay a crossing adds to a journey).
 */
export function describeRiver(here) {
  if (!here) return "No river within 3 km";
  const bed = here.bedWidthM >= 1000 ? `${(here.bedWidthM / 1000).toFixed(1)} km` : `${Math.round(here.bedWidthM)} m`;
  const crossing = here.bedWidthM > 400 ? "too broad to ford: a bridge or a ferry"
    : here.fordable ? `can be waded at a ford (about ${(here.depthM * 0.6).toFixed(1)} m deep)`
    : here.untilFordableDays != null ? `too deep to wade; fordable again in about ${here.untilFordableDays} days, or find a bridge`
    : "too deep to wade this year: a bridge or a ferry";
  return `${here.channel ? "A stream" : "The river"} ${Math.round(here.distKm * 10) / 10 < 0.5 ? "here" : `${(Math.round(here.distKm * 10) / 10).toFixed(1)} km off`} is ${here.words}; bed ${bed}; ${crossing}`;
}

/** The river's stage for a battle map's conditions (sent to the map server, which checks each field). */
export function battleRiver(here) {
  if (!here || here.distKm > 0.6) return null;
  return { stage: here.stage, depthM: Math.round(here.depthM * 10) / 10, fillShare: Math.round(here.fillShare * 100) / 100, fordable: here.fordable, bedWidthM: Math.round(here.bedWidthM), words: here.words };
}

/** The water that soaks down to the groundwater at a place in a year (mm), at its height: what feeds springs. Null without the climate. */
export function groundwaterMm(asset, field, lat, lon, elevationM) {
  const climate = flowClimate(asset); if (!climate) return null;
  const b = cellBalance(climate, field.cellAt(lat, lon).id, elevationM);
  return b ? b.baseMm.reduce((a, c) => a + c, 0) : null;
}
