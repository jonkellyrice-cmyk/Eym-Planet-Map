// Earthquakes and eruptions on Eym, drawn by rule (Stage 1b of the physical history and climate programme).
// Every stretch of plate boundary in the cartography's geology section is a fault with a yearly rate of
// earthquakes, and so is each of the small faults inside an old continent (Caren's: scattered, small and seldom);
// every volcano erupts at a rate set by its activity. Each (source, Eym year) pair seeds its own
// draws, so the catalogue is the same whenever and wherever it is asked for: a quake that shook a town on a
// given day shook it on every map and in every session. Ask by place and date range; each event comes with
// how strongly it was felt there (the Mercalli scale).

import { DAY_MS, DAYS_PER_YEAR } from "./universal-time.mjs";

export const QUAKE_MODEL = "eym-quakes-v1";
const DEG = Math.PI / 180, YEAR_MS = DAYS_PER_YEAR * DAY_MS;
/** Smallest magnitude drawn (smaller ones are hardly felt beyond their epicentre). */
export const MIN_MAGNITUDE = 3.5;
/** Quakes of at least MIN_MAGNITUDE per boundary point per year (ten times the rate at 4.5: Gutenberg–Richter), the largest possible, and the usual depth. */
export const FAULTS = Object.freeze({
  trenches: { rate: 110, maxMagnitude: 9.1, depthKm: 35, words: "a subduction quake" },
  collisions: { rate: 40, maxMagnitude: 8.2, depthKm: 15, words: "a collision-belt quake" },
  ridges: { rate: 15, maxMagnitude: 6.8, depthKm: 10, words: "a mid-ocean-ridge quake" },
  // Inside an old continent far from any plate edge (Caren; canon of 20 November 2026: as small as may be, then as
  // seldom, and spread out). Each of some sixty-odd small faults gives a quake of 3.5 or more about once in fifty
  // years: over the whole land about one a year of 3.5 to 4, one of 4 to 5 every two years, one of 5 or a little
  // more in a generation, and none of 6.
  intraplate: { rate: 0.02, maxMagnitude: 5.9, depthKm: 8, reachKm: 75, words: "a small quake on an old fault" },
});
/** Eruptions per year by activity, and the explosivity (VEI 0–6) they reach, by share. */
const ERUPTION_RATE = { active: 1 / 5, dormant: 1 / 400, extinct: 0 };
// (The great eruptions are as rare as on Earth, now that they cool the weather: with some twenty eruptions a year
// on Eym, a cataclysmic one, VEI 5, about once in ten years and a colossal one, VEI 6, about once in a century.
// They were five times as common.)
const VEI_SHARES = { subduction: [0.14, 0.33, 0.32, 0.165, 0.04, 0.0045, 0.0005], hotspot: [0.45, 0.35, 0.15, 0.04, 0.01, 0, 0] };
const VEI_WORDS = ["gentle lava flows", "small explosions and lava", "an explosive eruption with an ash column", "a large explosive eruption", "a great explosive eruption", "a cataclysmic eruption", "a colossal eruption"];
/** Felt-intensity words, Mercalli I–XII. */
export const MERCALLI = Object.freeze(["", "not felt", "weak (felt by a few at rest)", "weak (felt indoors)", "light (windows rattle, sleepers wake)", "moderate (felt by all, crockery breaks)", "strong (plaster cracks, chimneys fall)", "very strong (poor buildings damaged)", "severe (walls collapse)", "violent (houses shift off foundations)", "extreme (most stone buildings fall)", "extreme (bridges and roads destroyed)", "total destruction"]);
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

// ---------------------------------------------------------------- small helpers

function rngFor(text) {
  let h = 2166136261; for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  let s = h >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function poisson(rng, mean) { if (mean <= 0) return 0; const l = Math.exp(-mean); let k = 0, p = 1; do { k += 1; p *= rng(); } while (p > l); return k - 1; }
function distanceKm(a, b) {
  const p1 = a[0] * DEG, p2 = b[0] * DEG, dl = (b[1] - a[1]) * DEG;
  return 6371 * Math.acos(Math.min(1, Math.max(-1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl))));
}
/** The point `km` from p towards a bearing (degrees). */
function offset([lat, lon], bearingDeg, km) {
  const d = km / 6371, b = bearingDeg * DEG, la = lat * DEG;
  const lat2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lon2 = lon * DEG + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(lat2));
  return [Math.round(lat2 / DEG * 1000) / 1000, Math.round(((lon2 / DEG + 540) % 360 - 180) * 1000) / 1000];
}

/** Felt intensity (Mercalli, unrounded) at hypocentral distance R km from a quake of magnitude M. */
export function feltIntensity(magnitude, distanceKmValue, depthKm) {
  const r = Math.max(5, Math.hypot(distanceKmValue, depthKm));
  return 3.67 + 1.17 * magnitude - 3.19 * Math.log10(r);
}

/** The plate boundaries of a geology section, unpacked once: { trenches, collisions, ridges } as [lat, lon] lists. */
const unpacked = new WeakMap();
export function boundaryPoints(geology) {
  const b = geology?.boundaries; if (!b) return null;
  if (b.encoding !== "int16-le-tenth-degree") return b;
  if (unpacked.has(b)) return unpacked.get(b);
  const bytes = (b64) => (typeof Buffer !== "undefined" ? Uint8Array.from(Buffer.from(b64, "base64")) : Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  const read = (b64) => { const u = bytes(b64), v = new DataView(u.buffer), out = []; for (let i = 0; i + 3 < u.length; i += 4) out.push([v.getInt16(i, true) / 10, v.getInt16(i + 2, true) / 10]); return out; };
  const out = { trenches: read(b.trenches), collisions: read(b.collisions), ridges: read(b.ridges), intraplate: b.intraplate ? read(b.intraplate) : [] };
  // Each point's own measure (see `faultScale`): how fast its plates move against each other, and how long the
  // unbroken stretch of boundary it lies on is.
  const scales = {};
  for (const kind of ["trenches", "collisions", "ridges"]) {
    const points = out[kind], rates = b.ratesMmYr?.[kind] ? bytes(b.ratesMmYr[kind]) : null, group = points.map((_, i) => i), find = (i) => { while (group[i] !== i) { group[i] = group[group[i]]; i = group[i]; } return i; };
    for (let i = 0; i < points.length; i += 1) for (let j = i + 1; j < points.length; j += 1) { if (Math.abs(points[i][0] - points[j][0]) > 3) continue; if (distanceKm(points[i], points[j]) <= STRETCH_GAP_KM) group[find(i)] = find(j); }
    const size = new Map(); points.forEach((_, i) => { const g = find(i); size.set(g, (size.get(g) ?? 0) + 1); });
    scales[kind] = points.map((_, i) => faultMeasure(kind, rates ? rates[i] : null, size.get(find(i)) * STRETCH_STEP_KM));
  }
  out.scales = scales;
  unpacked.set(b, out);
  return out;
}

// ---------------------------------------------------------------- faults by their causes

/**
 * A boundary's earthquakes follow what drives them (owner's direction of 20 November 2026). The rate of quakes
 * grows with how fast the plates move against each other there (the strain to be released: in proportion, against
 * the `REFERENCE_MM_YR` the kind's rate was set for, between a fifth and three times). The largest quake a fault can
 * make grows with the length that can break at once: about magnitude 5.1 + 1.16 × log10(km) for a rupture's
 * length (Wells and Coppersmith 1994), a megathrust breaking far deeper and so greater by `DEPTH_BONUS`; never
 * more than the kind's own greatest.
 */
export const REFERENCE_MM_YR = Object.freeze({ trenches: 50, collisions: 30, ridges: 40 });
const STRETCH_GAP_KM = 260, STRETCH_STEP_KM = 111, DEPTH_BONUS = Object.freeze({ trenches: 1.4, collisions: 0.6, ridges: 0 });
/** A fault point's own measure from its plates' speed (mm a year, or null where it is not recorded) and its stretch's length (km): { rate (times the kind's), maxMagnitude }. */
export function faultMeasure(kind, speedMmYr, stretchKm) {
  const f = FAULTS[kind], rate = speedMmYr == null ? 1 : Math.min(3, Math.max(0.2, speedMmYr / REFERENCE_MM_YR[kind]));
  const byLength = stretchKm == null ? f.maxMagnitude : 5.08 + 1.16 * Math.log10(Math.max(20, stretchKm)) + DEPTH_BONUS[kind];
  return { rate, maxMagnitude: Math.round(Math.min(f.maxMagnitude, Math.max(MIN_MAGNITUDE + 1, byLength)) * 10) / 10, speedMmYr, stretchKm };
}
/** The measure of fault point `index` of a kind in a geology section ({ rate: 1, maxMagnitude: the kind's } where there is none, as for the small faults inside a continent). */
export function faultScale(geology, kind, index) {
  return boundaryPoints(geology)?.scales?.[kind]?.[index] ?? { rate: 1, maxMagnitude: FAULTS[kind].maxMagnitude };
}

// ---------------------------------------------------------------- the catalogue

/**
 * Every quake from one boundary point in one Eym year with a magnitude in [band, band + 1). Each band has its
 * own draws, so asking for the large quakes only (from far away) gives exactly the large quakes of the full list.
 */
function quakesOf(kind, index, at, year, band, scale = null) {
  const f = FAULTS[kind], lo = band, hi = Math.min(band + 1, scale?.maxMagnitude ?? f.maxMagnitude); if (lo >= hi) return [];
  const share = (m) => 10 ** -(m - MIN_MAGNITUDE), rng = rngFor(`${QUAKE_MODEL}|${kind}|${index}|${year}|${band}`), out = [];
  const count = poisson(rng, f.rate * (scale?.rate ?? 1) * (share(lo) - share(hi)));
  for (let k = 0; k < count; k += 1) {
    const timeMs = year * YEAR_MS + Math.floor(rng() * YEAR_MS);
    // Gutenberg–Richter within the band.
    const magnitude = Math.round(Math.min(hi - 0.05, lo - Math.log10(1 - rng() * (1 - 10 ** -(hi - lo)))) * 10) / 10;
    // Under a trench the sinking slab carries quakes up to 160 km inland, deeper the farther they are (a 30° dip).
    const reachKm = kind === "trenches" ? 160 * rng() ** 1.5 : (f.reachKm ?? 40) * rng();
    const epicentre = offset(at, rng() * 360, reachKm), depthKm = Math.round(f.depthKm * (0.5 + rng()) + (kind === "trenches" ? reachKm * 0.55 : 0));
    out.push({ kind: "earthquake", source: kind, timeMs, magnitude, depthKm, at: epicentre, words: f.words });
  }
  return out;
}

/** Every quake of MIN_MAGNITUDE or more from one fault point in one Eym year (all its bands): the catalogue itself, wherever it is felt. */
export function faultQuakes(kind, index, at, year, scale = null) {
  const out = []; for (let band = MIN_MAGNITUDE; band < (scale?.maxMagnitude ?? FAULTS[kind].maxMagnitude); band += 1) out.push(...quakesOf(kind, index, at, year, band, scale));
  return out;
}

/** The smallest magnitude that can be felt (intensity II) at d km. */
const feltFromMagnitude = (d) => (2 + 3.19 * Math.log10(Math.max(5, d)) - 3.67) / 1.17;

/** Every eruption of one volcano that starts in one Eym year. */
function eruptionsOf(volcano, index, year) {
  const rate = ERUPTION_RATE[volcano.activity] ?? 0; if (!rate) return [];
  const rng = rngFor(`${QUAKE_MODEL}|volcano|${index}|${year}`), out = [], shares = VEI_SHARES[volcano.setting] ?? VEI_SHARES.subduction;
  for (let k = poisson(rng, rate); k > 0; k -= 1) {
    const timeMs = year * YEAR_MS + Math.floor(rng() * YEAR_MS);
    let u = rng(), vei = 0; while (vei < shares.length - 1 && u > shares[vei]) { u -= shares[vei]; vei += 1; }
    const days = Math.max(1, Math.round((1 + 3 * vei) * (0.5 + 2 * rng()) * (volcano.setting === "hotspot" ? 4 : 1)));
    out.push({ kind: "eruption", timeMs, endMs: timeMs + days * DAY_MS, vei, at: volcano.at, volcano: { kind: volcano.kind, setting: volcano.setting, heightM: volcano.heightM, activity: volcano.activity }, words: VEI_WORDS[vei] });
  }
  return out;
}

/**
 * How much a great eruption cools the air at a latitude at a time (°C, a negative number or 0): ash and sulphur
 * thrown into the high air dim the Sun for one to three years. A cataclysmic eruption (VEI 5) cools by about a
 * tenth of a degree, a colossal one (VEI 6) by about half a degree at its worst, some months after it; the veil
 * thins by half every `COOLING_HALF_YEARS`. An eruption within 25° of the equator veils the whole world; one
 * farther from it mostly its own hemisphere. The eruptions are the catalogue's own (the same that shake and darken
 * the places near them).
 */
export const COOLING_C = Object.freeze({ 5: 0.12, 6: 0.5 }), COOLING_HALF_YEARS = 0.9, COOLING_RISE_YEARS = 0.25;
export function greatEruptions(geology, fromMs, toMs, minVei = 5) {
  const out = [], firstYear = Math.floor(fromMs / YEAR_MS), lastYear = Math.floor(toMs / YEAR_MS);
  (geology?.volcanoes ?? []).forEach((v, index) => { for (let year = firstYear; year <= lastYear; year += 1) for (const e of eruptionsOf(v, index, year)) if (e.vei >= minVei && e.timeMs >= fromMs && e.timeMs <= toMs) out.push(e); });
  return out.sort((a, b) => a.timeMs - b.timeMs);
}
const coolingCache = new WeakMap();
export function volcanicCoolingC(geology, timeMs, lat = 0) {
  if (!geology?.volcanoes?.length) return 0;
  // (The great eruptions of the four years before a year are found once for that year and kept.)
  let years = coolingCache.get(geology); if (!years) coolingCache.set(geology, (years = new Map()));
  const year = Math.floor(timeMs / YEAR_MS); let list = years.get(year); if (!list) { list = greatEruptions(geology, (year - 4) * YEAR_MS, (year + 1) * YEAR_MS); years.set(year, list); }
  let cooling = 0;
  for (const e of list) {
    const t = (timeMs - e.timeMs) / YEAR_MS; if (t <= 0 || t > 4) continue;
    const veil = Math.min(1, t / COOLING_RISE_YEARS) * 0.5 ** (Math.max(0, t - COOLING_RISE_YEARS) / COOLING_HALF_YEARS);
    const reach = Math.abs(e.at[0]) <= 25 ? 1 : (e.at[0] >= 0) === (lat >= 0) ? 1 : 0.25;
    cooling -= (COOLING_C[Math.min(6, e.vei)] ?? 0) * veil * reach;
  }
  return Math.round(cooling * 100) / 100;
}

/** How an eruption reaches a place `d` km away: the effects, or null if it does not. */
function eruptionEffect(e, d) {
  const effects = [];
  if (d <= 30) effects.push("tremors and booming");
  if (d <= 8 * 2 ** e.vei) effects.push(e.vei <= 1 ? "lava flows nearby" : "falling ash");
  if (d <= 60 + 60 * e.vei) effects.push(e.vei >= 2 ? "an ash column on the horizon" : "a glow at night");
  return effects.length ? effects : null;
}

/**
 * Earthquakes felt and eruptions noticed at a place between two times (ms). `geology` is the cartography
 * asset's geology section. A place on hard, unbroken rock (granite, quartzite, marble) shakes less than one on
 * soft ground: one step of intensity less, as on Earth. At most ten Eym years are searched.
 */
export function tremorsAt(geology, { lat, lon, fromMs, toMs, hardRock = false }) {
  const boundaries = boundaryPoints(geology); if (!boundaries) return { quakes: [], eruptions: [] };
  const firstYear = Math.floor(fromMs / YEAR_MS), lastYear = Math.min(Math.floor(toMs / YEAR_MS), firstYear + 9), here = [lat, lon];
  const quakes = [], eruptions = [];
  for (const kind of Object.keys(FAULTS)) {
    const f = FAULTS[kind];
    (boundaries[kind] ?? []).forEach((at, index) => {
      // Only the bands that could be felt here (allowing for the epicentre's spread round the source point).
      const k0 = Math.max(0, Math.floor(feltFromMagnitude(distanceKm(here, at) - 170) - MIN_MAGNITUDE));
      const scale = boundaries.scales?.[kind]?.[index] ?? null;
      for (let band = MIN_MAGNITUDE + k0; band < (scale?.maxMagnitude ?? f.maxMagnitude); band += 1) for (let year = firstYear; year <= lastYear; year += 1) for (const q of quakesOf(kind, index, at, year, band, scale)) {
        if (q.timeMs < fromMs || q.timeMs > toMs) continue;
        const d = distanceKm(here, q.at); let intensity = feltIntensity(q.magnitude, d, q.depthKm);
        if (hardRock) intensity -= 1;
        if (intensity < 2) continue;
        const level = Math.min(12, Math.round(intensity));
        quakes.push({ ...q, distanceKm: Math.round(d), intensity: Math.round(intensity * 10) / 10, mercalli: ROMAN[level], felt: MERCALLI[level] });
      }
    });
  }
  (geology.volcanoes ?? []).forEach((v, index) => {
    const d = distanceKm(here, v.at); if (d > 500) return;
    for (let year = firstYear - 1; year <= lastYear; year += 1) for (const e of eruptionsOf(v, index, year)) {
      if (e.endMs < fromMs || e.timeMs > toMs) continue;
      const effects = eruptionEffect(e, d); if (!effects) continue;
      eruptions.push({ ...e, distanceKm: Math.round(d), effects });
    }
  });
  quakes.sort((a, b) => a.timeMs - b.timeMs); eruptions.sort((a, b) => a.timeMs - b.timeMs);
  return { quakes, eruptions };
}

/** A short line for the "Here and now" card: the strongest quake felt and any eruption, over the last 30 days. */
export function describeTremors(result, nowMs) {
  const ago = (t) => { const days = Math.floor((nowMs - t) / DAY_MS); return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`; };
  const parts = [];
  const strongest = [...result.quakes].sort((a, b) => b.intensity - a.intensity || b.timeMs - a.timeMs)[0];
  if (strongest) parts.push(`${result.quakes.length} felt; strongest ${strongest.mercalli}, ${strongest.felt.split(" (")[0]}: M${strongest.magnitude.toFixed(1)} ${strongest.distanceKm} km away, ${ago(strongest.timeMs)}`);
  const going = result.eruptions.filter((e) => e.timeMs <= nowMs && e.endMs >= nowMs), recent = result.eruptions.filter((e) => e.endMs < nowMs);
  for (const e of going) parts.push(`volcano erupting ${e.distanceKm} km away (${e.effects.join(", ")})`);
  const last = recent.at(-1); if (!going.length && last) parts.push(`volcano erupted ${last.distanceKm} km away, ${ago(last.timeMs)}`);
  return parts.length ? parts.join("; ") : "none felt in the last 30 days";
}
