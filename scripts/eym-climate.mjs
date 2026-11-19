// Eym's ocean climate at any place and moment (Stage 2 of the physical history and climate programme), read
// from the compact climate section of the cartography asset (made offline by tools/generate-eym-climate.mjs):
//   - the sea-surface temperature anomaly the currents bring, for the four seasons, blended through the year;
//   - a slow El Niño-like oscillation: a fixed warm-east, cool-west pattern over the widest stretch of
//     equatorial ocean, scaled by an index that is a function of the clock alone (three incommensurate periods);
//   - surface currents, for the currents overlay, from the companion ocean file when it has been attached.
// Pure functions; a world without a climate section gives zero anomaly everywhere.

import { DAY_MS, DAYS_PER_YEAR, NORTHWARD_EQUINOX_MS } from "./universal-time.mjs";

const YEAR_MS = DAYS_PER_YEAR * DAY_MS;
const cache = new WeakMap();
const decodeInt8 = (b64) => { const bytes = typeof Buffer !== "undefined" ? Uint8Array.from(Buffer.from(b64, "base64")) : Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); return new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength); };
const yearFraction = (timeMs) => ((((timeMs - NORTHWARD_EQUINOX_MS) / YEAR_MS) % 1) + 1) % 1;

/** The decoded climate section of an asset (null for a world without one). */
function decoded(asset) {
  const c = asset?.climate; if (!c) return null;
  if (cache.has(c)) return cache.get(c);
  const out = {
    res: c.resolutionDeg, cols: Math.round(360 / c.resolutionDeg), rows: Math.round(180 / c.resolutionDeg),
    seasons: c.seasons.map((s) => ({ f: s.yearFraction, sst: Float32Array.from(decodeInt8(s.sstAnomalyInt8Tenths), (v) => v / 10) })),
    enso: { ...c.enso, pattern: Float32Array.from(decodeInt8(c.enso.patternInt8Tenths), (v) => v / 10) },
  };
  cache.set(c, out);
  return out;
}

/** A grid value at a place, bilinear between the cell centres (longitude wraps). */
function sample(d, grid, lat, lon) {
  const y = (lat + 90) / d.res - 0.5, x = (lon + 180) / d.res - 0.5, r0 = Math.floor(y), c0 = Math.floor(x), ty = y - r0, tx = x - c0;
  const at = (r, c) => grid[Math.min(d.rows - 1, Math.max(0, r)) * d.cols + ((c % d.cols) + d.cols) % d.cols];
  return (at(r0, c0) * (1 - tx) + at(r0, c0 + 1) * tx) * (1 - ty) + (at(r0 + 1, c0) * (1 - tx) + at(r0 + 1, c0 + 1) * tx) * ty;
}

/**
 * The El Niño-like index at a moment (about −1.5 to 1.5; positive is a warm year in the eastern basin).
 * Three periods (3.7, 5.3 and 2.6 years by default) that never fall into step, so no two decades repeat.
 */
export function ensoIndex(timeMs, enso = { periodsYears: [3.7, 5.3, 2.6], weights: [0.62, 0.45, 0.28], phases: [1.1, 2.9, 0.4] }) {
  const years = (timeMs - NORTHWARD_EQUINOX_MS) / YEAR_MS;
  const total = enso.weights.reduce((a, b) => a + b, 0) / 1.6;
  return enso.periodsYears.reduce((s, p, i) => s + enso.weights[i] * Math.sin(2 * Math.PI * years / p + enso.phases[i]), 0) / total;
}

/** The phase of the oscillation in words. */
export function describeEnso(index) {
  return index > 0.8 ? "a strong warm year (El Niño-like) in the great equatorial ocean" : index > 0.35 ? "a warm year in the great equatorial ocean"
    : index < -0.8 ? "a strong cool year (La Niña-like) in the great equatorial ocean" : index < -0.35 ? "a cool year in the great equatorial ocean" : "a neutral year in the great equatorial ocean";
}

/** The sea-surface temperature anomaly (°C) at a place and moment: the currents' share for the season plus the oscillation. */
export function sstAnomalyAt(asset, lat, lon, timeMs) {
  const d = decoded(asset); if (!d) return 0;
  const f = yearFraction(timeMs), n = d.seasons.length, x = f * n, i0 = Math.floor(x) % n, i1 = (i0 + 1) % n, t = x - Math.floor(x);
  // The seasons are taken at their fractions (0, ¼, ½, ¾ of the year): blend the two on either side.
  const seasonal = sample(d, d.seasons[i0].sst, lat, lon) * (1 - t) + sample(d, d.seasons[i1].sst, lat, lon) * t;
  return seasonal + ensoIndex(timeMs, d.enso) * sample(d, d.enso.pattern, lat, lon);
}

/** Whether an asset has a climate section. */
export const hasClimate = (asset) => Boolean(asset?.climate);

/** The decoded ocean file of an asset (currents and upwelling for the four seasons), or null before it is attached. */
function decodedOcean(asset) {
  const o = asset?.ocean; if (!o) return null;
  let d = cache.get(o);
  if (!d) {
    d = { res: o.resolutionDeg, cols: Math.round(360 / o.resolutionDeg), rows: Math.round(180 / o.resolutionDeg), seasons: o.seasons.map((s) => ({ u: Float32Array.from(decodeInt8(s.uInt8Cm2), (v) => v / 50), v: Float32Array.from(decodeInt8(s.vInt8Cm2), (v) => v / 50), up: Float32Array.from(decodeInt8(s.upwellingInt8Hundredths), (v) => v / 100) })) };
    cache.set(o, d);
  }
  return d;
}

/** A field of the ocean file at a place and moment, blended between the two seasons on either side. */
function oceanBlend(d, key, lat, lon, timeMs) {
  const f = yearFraction(timeMs), n = d.seasons.length, x = f * n, i0 = Math.floor(x) % n, i1 = (i0 + 1) % n, t = x - Math.floor(x);
  return sample(d, d.seasons[i0][key], lat, lon) * (1 - t) + sample(d, d.seasons[i1][key], lat, lon) * t;
}

/** The surface current (m/s east and north) at a place in a season, once the ocean file is attached; null otherwise. */
export function currentAt(asset, lat, lon, timeMs) {
  const d = decodedOcean(asset); if (!d) return null;
  return { east: oceanBlend(d, "u", lat, lon, timeMs), north: oceanBlend(d, "v", lat, lon, timeMs) };
}

/**
 * Upwelling at a place in a season (0 none, 1 strong, to 1.27), once the ocean file is attached; null otherwise.
 * Cold, rich water rises where the wind's drift pulls the surface apart (the equator, some coasts), where a
 * current runs along a continental slope, and where one crosses a seamount chain.
 */
export function upwellingAt(asset, lat, lon, timeMs) {
  const d = decodedOcean(asset); return d ? Math.max(0, oceanBlend(d, "up", lat, lon, timeMs)) : null;
}

/**
 * The fishing at a place at sea in a season, from its upwelling (what feeds the sea): { richness 0–1, words }.
 * Null without the ocean file.
 */
export function fishingAt(asset, lat, lon, timeMs) {
  const up = upwellingAt(asset, lat, lon, timeMs); if (up == null) return null;
  const richness = Math.min(1, 0.15 + 0.85 * Math.min(1, up / 0.8));
  return { richness, words: richness >= 0.65 ? "rich fishing grounds (cold water wells up here)" : richness >= 0.4 ? "good fishing" : "ordinary fishing" };
}
