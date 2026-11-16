// Eym's local detail: the land at tens of metres, and down to 5-ft battle squares, generated from the
// accepted cartography and the place's coordinates. Nothing is stored: the same place always gives the
// same hills, streams, woods, fields, roads and farmsteads, because
//   - the coarse facts (land or sea, lakes and rivers, relief class, forest, distance to the coast, biome
//     and climate) are read on a lattice pinned to fixed latitude/longitude steps, so every tile reads the
//     same values, and
//   - the fine variation is noise keyed to absolute position on the globe, never to the tile.
// Streams are routed downhill over the refined terrain into the known rivers, lakes and sea; roads join
// settlements along least-cost paths on the same pinned lattice. Painted maps registered as canon
// outrank all of this.

import { fromLocal, greatCircleKm, toLocal } from "./eym-surface.mjs";
import { annualMeanTemperatureC, environmentField, zonalPrecipitationMm } from "./eym-seasons.mjs";

export const LOCAL_DETAIL_MODEL = "eym-local-detail-v1";
const DEG = Math.PI / 180;
const R_KM = 6371;
const LATTICE_DEG = 0.02; // ~2.2 km: finer than the source detail (~6 km), so its edges are kept
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Ground cover classes. */
export const COVER = Object.freeze({ sea: 0, lake: 1, river: 2, stream: 3, beach: 4, marsh: 5, meadow: 6, farmland: 7, scrub: 8, woods: 9, rock: 10, snow: 11, built: 12, road: 13 });
export const COVER_NAMES = Object.freeze(Object.fromEntries(Object.entries(COVER).map(([k, v]) => [v, k])));

// ---------------------------------------------------------------- noise keyed to the globe

function lattice3(i, j, k, salt) {
  let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 1440662683) ^ Math.imul(salt, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}
const smoothstep = (t) => t * t * (3 - 2 * t);
function valueNoise3(x, y, z, salt) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), fx = smoothstep(x - i), fy = smoothstep(y - j), fz = smoothstep(z - k);
  let total = 0;
  for (let a = 0; a < 2; a += 1) for (let b = 0; b < 2; b += 1) for (let c = 0; c < 2; c += 1) total += lattice3(i + a, j + b, k + c, salt) * (a ? fx : 1 - fx) * (b ? fy : 1 - fy) * (c ? fz : 1 - fz);
  return total;
}
/** Fractal noise at a point on the globe (unit vector scaled to km), wavelengths from `longKm` down to `shortKm`. */
export function globeNoise(p, longKm, shortKm, salt = 1) {
  let total = 0, amp = 1, norm = 0;
  for (let wave = longKm; wave >= shortKm; wave /= 2) { total += amp * valueNoise3(p[0] / wave, p[1] / wave, p[2] / wave, salt); norm += amp; amp *= 0.55; salt += 7; }
  return total / norm;
}
const toKmVector = (lat, lon) => { const a = lat * DEG, b = lon * DEG; return [R_KM * Math.cos(a) * Math.cos(b), R_KM * Math.cos(a) * Math.sin(b), R_KM * Math.sin(a)]; };
// FNV-1a with a final avalanche (keys differing only in their last digits must not give correlated values).
export const hashUnit = (text) => {
  let h = 2166136261; for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

// ---------------------------------------------------------------- the coarse facts, on a pinned lattice

const contextCache = new WeakMap();

function ringIndex(rings, extra = () => ({})) {
  return rings.map((ring) => {
    let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
    for (const [lat, lon] of ring) { minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat); minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon); }
    return { ring, minLat, maxLat, minLon, maxLon, ...extra(ring) };
  });
}
function pointInRing(lat, lon, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ya, xa] = ring[i], [yb, xb] = ring[j];
    if ((ya > lat) !== (yb > lat) && lon < (xb - xa) * (lat - ya) / (yb - ya) + xa) inside = !inside;
  }
  return inside;
}
const insideAny = (index, lat, lon) => { let inside = false; for (const r of index) if (lat >= r.minLat && lat <= r.maxLat && lon >= r.minLon && lon <= r.maxLon && pointInRing(lat, lon, r.ring)) inside = !inside; return inside; };

/** Everything the generator reads from the accepted cartography, indexed once per asset. */
export function localContext(asset) {
  if (contextCache.has(asset)) return contextCache.get(asset);
  const coasts = ringIndex(asset.terrain.coastlines.map((c) => c.points));
  const waters = ringIndex(asset.hydrology.lakes.flatMap((l) => [l.polygon, ...(l.islands ?? [])]));
  const detail = {}; for (const kind of ["forest", "upland", "mountains", "peaks"]) detail[kind] = ringIndex((asset.terrain.detail ?? []).filter((d) => d.kind === kind).flatMap((d) => d.rings));
  // Coast segments bucketed by 1° cell, for nearest-coast searches.
  const coastSegments = new Map();
  for (const c of coasts) for (let i = 0; i + 1 < c.ring.length; i += 1) {
    const seg = [c.ring[i], c.ring[i + 1]], key = Math.floor(seg[0][0]) * 1000 + Math.floor(((seg[0][1] % 360) + 540) % 360 - 180);
    if (!coastSegments.has(key)) coastSegments.set(key, []); coastSegments.get(key).push(seg);
  }
  const rivers = asset.hydrology.rivers.map((r) => ({ points: r.points, widthM: clamp(30 + 40 * Math.log10(1 + r.dischargeIndex), 30, 400) }));
  const settlements = asset.settlements.filter((s) => s.lat != null);
  const peakM = (lat, lon) => { const c = asset.terrain.coastlines.find((line) => line.kind === "mainland" && line.continent && greatCircleKm(line.points[0], [lat, lon]) < 4000); return c?.continent === "Caren" ? 5200 : c?.continent === "Garyk" ? 3900 : 3500; };
  const ctx = { asset, coasts, waters, detail, coastSegments, rivers, settlements, field: environmentField(asset), lattice: new Map(), smoothed: new Map(), peakM };
  contextCache.set(asset, ctx);
  return ctx;
}

/** Distance (km) from a point to the nearest coastline, searched out to 160 km. */
function coastKm(ctx, lat, lon) {
  const k = Math.cos(lat * DEG); let best = 160;
  const lonReach = Math.min(179, Math.ceil(1.5 / Math.max(0.2, k)));
  const nearby = [];
  for (let a = Math.floor(lat) - 2; a <= Math.floor(lat) + 2; a += 1) for (let b = Math.floor(lon) - lonReach; b <= Math.floor(lon) + lonReach; b += 1) { const bucket = ctx.coastSegments.get(a * 1000 + (((b % 360) + 540) % 360 - 180)); if (bucket) nearby.push(...bucket); }
  for (const [a, b] of nearby) {
    const ax = (a[1] - lon) * 111.2 * k, ay = (a[0] - lat) * 111.2, bx = (b[1] - lon) * 111.2 * k, by = (b[0] - lat) * 111.2;
    const dx = bx - ax, dy = by - ay, t = clamp(-(ax * dx + ay * dy) / (dx * dx + dy * dy || 1), 0, 1);
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/** The coarse facts at one lattice node (cached). */
function node(ctx, i, j) {
  const key = i * 100000 + j; let v = ctx.lattice.get(key); if (v) return v;
  const lat = i * LATTICE_DEG, lon = j * LATTICE_DEG;
  const land = insideAny(ctx.coasts, lat, lon), water = land && insideAny(ctx.waters, lat, lon);
  const relief = !land ? 0 : insideAny(ctx.detail.peaks, lat, lon) ? 3 : insideAny(ctx.detail.mountains, lat, lon) ? 2 : insideAny(ctx.detail.upland, lat, lon) ? 1 : 0;
  const forest = land && insideAny(ctx.detail.forest, lat, lon);
  const coast = coastKm(ctx, lat, lon), cell = ctx.field.cellAt(lat, lon);
  const reliefM = [0, 750, 2300, ctx.peakM(lat, lon)][relief];
  const elevationM = land ? 12 + 300 * (1 - Math.exp(-coast / 140)) + reliefM : -Math.min(200, 15 + coast * 1.6);
  v = { land, water, relief, forest, coastKm: coast, elevationM, biome: cell.biome, annualMeanC: cell.annualMeanC, precipMm: zonalPrecipitationMm(lat) };
  ctx.lattice.set(key, v);
  return v;
}

const bspline = (t) => [(1 - t) ** 3 / 6, (3 * t ** 3 - 6 * t ** 2 + 4) / 6, (-3 * t ** 3 + 3 * t ** 2 + 3 * t + 1) / 6, t ** 3 / 6];

/**
 * Smoothed coarse values at any point: a cubic B-spline over the lattice nodes (each averaged with its
 * neighbours), smooth in value and slope, so hill shading shows no lattice lines.
 */
export function coarseAt(ctx, lat, lon) {
  const x = lat / LATTICE_DEG, y = lon / LATTICE_DEG, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const smooth = (a, b) => {
    const key = a * 100000 + b; let s = ctx.smoothed.get(key); if (s) return s;
    let e = 0, r = 0, f = 0; for (let di = -1; di <= 1; di += 1) for (let dj = -1; dj <= 1; dj += 1) { const v = node(ctx, a + di, b + dj); e += v.elevationM; r += v.relief; f += v.forest ? 1 : 0; }
    s = { e: e / 9, r: r / 9, f: f / 9 }; ctx.smoothed.set(key, s); return s;
  };
  const wx = bspline(fx), wy = bspline(fy), acc = { e: 0, r: 0, f: 0 };
  for (let a = 0; a < 4; a += 1) for (let b = 0; b < 4; b += 1) { const s = smooth(i - 1 + a, j - 1 + b), w = wx[a] * wy[b]; acc.e += s.e * w; acc.r += s.r * w; acc.f += s.f * w; }
  const mix = (k) => acc[k];
  const nearest = node(ctx, Math.round(x), Math.round(y));
  return { elevationM: mix("e"), relief: mix("r"), forestShare: mix("f"), land: nearest.land, water: nearest.water, coastKm: nearest.coastKm, biome: nearest.biome, annualMeanC: nearest.annualMeanC, precipMm: nearest.precipMm };
}

// ---------------------------------------------------------------- terrain and cover at a point

const BIOME_WOODS = { "tropical-rainforest": 0.85, "temperate-rainforest": 0.85, "temperate-forest": 0.7, taiga: 0.7, "seasonal-forest": 0.45, savanna: 0.15, steppe: 0.06, tundra: 0.03, "cold-desert": 0.02, "hot-desert": 0.01, "ice-cap": 0 };

/** Fine elevation (m) at a point: the coarse surface plus relief-scaled detail down to `shortKm`. */
export function elevationAt(ctx, lat, lon, shortKm = 0.02) {
  const c = coarseAt(ctx, lat, lon), p = toKmVector(lat, lon);
  const rough = 15 + 70 * c.relief + 120 * Math.max(0, c.relief - 1.5) ** 2;
  return c.elevationM + rough * globeNoise(p, 6, Math.max(shortKm, 0.01), 11) + 4 * globeNoise(p, 0.4, Math.max(shortKm, 0.005), 23);
}

// ---------------------------------------------------------------- tiles

class MinHeap {
  constructor(keys) { this.keys = keys; this.a = []; }
  push(i) { const a = this.a; a.push(i); let n = a.length - 1; while (n) { const p = (n - 1) >> 1; if (this.keys[a[p]] <= this.keys[a[n]]) break; [a[p], a[n]] = [a[n], a[p]]; n = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let n = 0; for (;;) { const l = 2 * n + 1, r = l + 1; let m = n; if (l < a.length && this.keys[a[l]] < this.keys[a[m]]) m = l; if (r < a.length && this.keys[a[r]] < this.keys[a[m]]) m = r; if (m === n) break; [a[m], a[n]] = [a[n], a[m]]; n = m; } } return top; }
  get size() { return this.a.length; }
}

/** Built-up radius and the farmland around it (km), by settlement kind; pre-modern towns are compact. */
const SETTLEMENT_RADIUS_M = { capital: 1200, city: 750, port: 420, town: 380, fort: 160, village: 180 };
const FARMLAND_KM = { capital: 9, city: 6, port: 3, town: 3.5, fort: 1.2, village: 2 };

/** Roads between settlements: each joined to its two nearest neighbours by a least-cost path on the pinned lattice. */
export function roadsNear(ctx, center, reachKm) {
  const near = ctx.settlements.filter((s) => greatCircleKm([s.lat, s.lon], center) < reachKm + 250);
  const pairs = new Set();
  for (const s of near) {
    const others = ctx.settlements.filter((o) => o !== s && greatCircleKm([o.lat, o.lon], [s.lat, s.lon]) < 250).sort((a, b) => greatCircleKm([a.lat, a.lon], [s.lat, s.lon]) - greatCircleKm([b.lat, b.lon], [s.lat, s.lon]));
    for (const o of others.slice(0, 2)) pairs.add([s.id, o.id].sort().join("|"));
  }
  const byId = new Map(ctx.settlements.map((s) => [s.id, s])), roads = [];
  for (const pair of [...pairs].sort()) {
    const [a, b] = pair.split("|").map((id) => byId.get(id)); const path = latticePath(ctx, a, b);
    if (path) roads.push({ id: pair, from: a.id, to: b.id, kind: ["capital", "city"].includes(a.kind) && ["capital", "city"].includes(b.kind) ? "highway" : "road", points: path });
  }
  return roads;
}
function latticePath(ctx, a, b) {
  const i0 = Math.round(a.lat / LATTICE_DEG), j0 = Math.round(a.lon / LATTICE_DEG), i1 = Math.round(b.lat / LATTICE_DEG), j1 = Math.round(b.lon / LATTICE_DEG);
  const margin = 8, minI = Math.min(i0, i1) - margin, minJ = Math.min(j0, j1) - margin, rows = Math.abs(i1 - i0) + 2 * margin + 1, cols = Math.abs(j1 - j0) + 2 * margin + 1;
  if (rows * cols > 60000) return null;
  const n = rows * cols, cost = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), heap = new MinHeap(cost), idx = (i, j) => (i - minI) * cols + (j - minJ);
  const start = idx(i0, j0), goal = idx(i1, j1); cost[start] = 0; heap.push(start);
  while (heap.size) {
    const c = heap.pop(); if (c === goal) break;
    const ci = Math.floor(c / cols) + minI, cj = (c % cols) + minJ, here = node(ctx, ci, cj);
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = ci + di, nj = cj + dj; if (ni < minI || nj < minJ || ni >= minI + rows || nj >= minJ + cols) continue;
      const there = node(ctx, ni, nj); if (!there.land) continue;
      const step = Math.hypot(di, dj) * (1 + Math.abs(there.elevationM - here.elevationM) / 60 + (there.water ? 7 : 0) + (there.forest ? 0.4 : 0) + there.relief * 0.8);
      const k = idx(ni, nj); if (cost[c] + step < cost[k]) { cost[k] = cost[c] + step; prev[k] = c; heap.push(k); }
    }
  }
  if (!Number.isFinite(cost[goal])) return null;
  const out = []; for (let c = goal; c >= 0; c = prev[c]) out.push([(Math.floor(c / cols) + minI) * LATTICE_DEG, ((c % cols) + minJ) * LATTICE_DEG]);
  out.reverse(); out[0] = [a.lat, a.lon]; out[out.length - 1] = [b.lat, b.lon];
  // Round the lattice corners and let the road wander a little, the same way wherever it is drawn.
  let pts = out; for (let pass = 0; pass < 3; pass += 1) pts = [pts[0], ...pts.slice(0, -1).flatMap((p, i) => { const q = pts[i + 1]; return [[p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]]; }), pts.at(-1)];
  return pts.map(([lat, lon]) => { const v = toKmVector(lat, lon), w = 0.004 * globeNoise(v, 3, 0.4, 41); return [lat + w, lon + w * 0.7]; });
}

/** Even-odd scanline fill of [lat, lon] rings onto a tile grid (cells of `res` km, centred on `center`). */
function fillRings(index, center, n, half, res, reachKm) {
  const out = new Uint8Array(n * n), edges = [];
  for (const r of index) {
    if (greatCircleKm([(r.minLat + r.maxLat) / 2, (r.minLon + r.maxLon) / 2], center) > reachKm + 111.2 * Math.max(r.maxLat - r.minLat, (r.maxLon - r.minLon) * Math.cos(center[0] * DEG)) / 2 + 5) continue;
    const pts = r.ring.map(([lat, lon]) => toLocal(center, lat, lon));
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) edges.push([pts[j], pts[i]]);
  }
  if (!edges.length) return out;
  for (let row = 0; row < n; row += 1) {
    const y = half - (row + 0.5) * res, xs = [];
    for (const [a, b] of edges) if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) { const c0 = Math.max(0, Math.ceil((xs[k] + half) / res - 0.5)), c1 = Math.min(n - 1, Math.floor((xs[k + 1] + half) / res - 0.5)); for (let c = c0; c <= c1; c += 1) out[row * n + c] = 1; }
  }
  return out;
}

const segmentDistanceM = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1); return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };

/**
 * A square tile of local detail around a place.
 * @param options { center: [lat, lon], sizeKm, resolutionM, marginFraction }
 * @returns { center, sizeKm, resolutionM, cols, rows, elevation, cover, streams, roads, structures, settlements, x/y helpers }
 */
export function buildLocalTile(asset, { center, sizeKm = 8, resolutionM = 25, marginFraction = 0.3 } = {}) {
  const ctx = localContext(asset), res = resolutionM / 1000, fullKm = sizeKm * (1 + 2 * marginFraction);
  const n = Math.round(fullKm / res), half = fullKm / 2, inner = Math.round(sizeKm / res), offset = Math.round((n - inner) / 2);
  const latlon = (c, r) => fromLocal(center, -half + (c + 0.5) * res, half - (r + 0.5) * res);
  const elevation = new Float32Array(n * n), cover = new Uint8Array(n * n), land = new Uint8Array(n * n), shade = new Float32Array(n * n);
  // Land, water, forest and relief straight from the vector outlines, so their edges are exact.
  const reach = fullKm * 0.75, landMask = fillRings(ctx.coasts, center, n, half, res, reach), waterMask = fillRings(ctx.waters, center, n, half, res, reach);
  const forestMask = fillRings(ctx.detail.forest, center, n, half, res, reach), reliefMasks = ["upland", "mountains", "peaks"].map((kind) => fillRings(ctx.detail[kind], center, n, half, res, reach));
  // The traced shores are straight between vertices ~1 km apart; roughen them by up to ~400 m with
  // world-pinned noise (distance to the outline inside and out, shifted by the noise).
  const chamfer = (mask, value) => {
    const d = new Float32Array(n * n).fill(1e9); for (let i = 0; i < n * n; i += 1) if (mask[i] !== value) d[i] = 0;
    for (const pass of [0, 1]) for (let k = 0; k < n * n; k += 1) {
      const i = pass ? n * n - 1 - k : k, r = Math.floor(i / n), c = i % n; if (!d[i]) continue;
      for (const [dr, dc, w] of pass ? [[0, 1, 1], [1, 0, 1], [1, 1, 1.414], [1, -1, 1.414]] : [[0, -1, 1], [-1, 0, 1], [-1, -1, 1.414], [-1, 1, 1.414]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < n && cc < n) d[i] = Math.min(d[i], d[rr * n + cc] + w * res); }
    }
    return d;
  };
  const roughen = (mask) => {
    const inside = chamfer(mask, 1), outside = chamfer(mask, 0), out = new Uint8Array(n * n);
    for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) { const i = r * n + c, [lat, lon] = latlon(c, r), shift = 0.4 * globeNoise(toKmVector(lat, lon), 3, Math.max(0.03, res), 61); out[i] = mask[i] ? (inside[i] > -shift ? 1 : 0) : (outside[i] < shift ? 1 : 0); }
    return out;
  };
  const shore = roughen(landMask), lakeShore = roughen(waterMask);
  const facts = new Array(n * n);
  for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) {
    const i = r * n + c, [lat, lon] = latlon(c, r), f = coarseAt(ctx, lat, lon);
    f.land = Boolean(shore[i]); f.water = f.land && Boolean(lakeShore[i]); f.forestMask = Boolean(forestMask[i]);
    f.reliefClass = reliefMasks[2][i] ? 3 : reliefMasks[1][i] ? 2 : reliefMasks[0][i] ? 1 : 0;
    facts[i] = f; elevation[i] = f.land ? Math.max(f.water ? 2 : 1, elevationAt(ctx, lat, lon, res * 2)) : Math.min(-2, f.elevationM);
    land[i] = f.land && !f.water ? 1 : 0;
  }
  // Distance to the sea within the tile, for beaches.
  const seaKm = new Float32Array(n * n).fill(1e9);
  for (let i = 0; i < n * n; i += 1) if (!facts[i].land) seaKm[i] = 0;
  for (const pass of [0, 1]) for (let k = 0; k < n * n; k += 1) {
    const i = pass ? n * n - 1 - k : k, r = Math.floor(i / n), c = i % n; if (!seaKm[i]) continue;
    for (const [dr, dc, w] of pass ? [[0, 1, 1], [1, 0, 1], [1, 1, 1.414], [1, -1, 1.414]] : [[0, -1, 1], [-1, 0, 1], [-1, -1, 1.414], [-1, 1, 1.414]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && cc >= 0 && rr < n && cc < n) seaKm[i] = Math.min(seaKm[i], seaKm[rr * n + cc] + w * res); }
  }
  // Known rivers burned in as water.
  const localOf = (p) => toLocal(center, p[0], p[1]);
  const riverMask = new Uint8Array(n * n);
  for (const river of ctx.rivers) {
    if (!river.points.some((p) => greatCircleKm(p, center) < fullKm)) continue;
    const pts = river.points.map(localOf), w = river.widthM / 1000 / 2;
    for (let k = 0; k + 1 < pts.length; k += 1) {
      const [a, b] = [pts[k], pts[k + 1]], c0 = Math.floor((Math.min(a[0], b[0]) - w + half) / res), c1 = Math.ceil((Math.max(a[0], b[0]) + w + half) / res), r0 = Math.floor((half - Math.max(a[1], b[1]) - w) / res), r1 = Math.ceil((half - Math.min(a[1], b[1]) + w) / res);
      for (let r = Math.max(0, r0); r <= Math.min(n - 1, r1); r += 1) for (let c = Math.max(0, c0); c <= Math.min(n - 1, c1); c += 1) { const x = -half + (c + 0.5) * res, y = half - (r + 0.5) * res; if (segmentDistanceM(x, y, a, b) <= w) riverMask[r * n + c] = 1; }
    }
  }
  // Water runs downhill over the refined land (priority flood from the sea, lakes, rivers and the tile's edge).
  const filled = new Float32Array(n * n), done = new Uint8Array(n * n), receiver = new Int32Array(n * n).fill(-1), order = [], heap = new MinHeap(filled);
  const outlet = (i) => !land[i] || riverMask[i];
  for (let i = 0; i < n * n; i += 1) { const r = Math.floor(i / n), c = i % n; if (outlet(i) || r === 0 || c === 0 || r === n - 1 || c === n - 1) { filled[i] = outlet(i) ? Math.min(elevation[i], 0) : elevation[i]; done[i] = 1; heap.push(i); } }
  while (heap.size) {
    const i = heap.pop(); order.push(i); const r = Math.floor(i / n), c = i % n;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue; const j = rr * n + cc; if (done[j]) continue; done[j] = 1; filled[j] = Math.max(elevation[j], filled[i] + 0.001); receiver[j] = i; heap.push(j); }
  }
  const area = new Float32Array(n * n), cellKm2 = res * res;
  for (let k = order.length - 1; k >= 0; k -= 1) { const i = order[k]; area[i] += cellKm2; if (receiver[i] >= 0) area[receiver[i]] += area[i]; }
  // Hollows the water had to fill: deep ones hold ponds, shallow ones marsh in wet country.
  const pondDepth = new Float32Array(n * n); for (let i = 0; i < n * n; i += 1) if (land[i] && !riverMask[i]) pondDepth[i] = filled[i] - elevation[i];
  // Wetter country carries more streams.
  const precip = facts[Math.floor(n / 2) * n + Math.floor(n / 2)].precipMm, streamAreaKm2 = clamp(3 * 1000 / precip, 0.8, 12);
  const streamCell = (i) => land[i] && !riverMask[i] && area[i] >= streamAreaKm2 && pondDepth[i] <= 2;
  // Settlements and their footprints.
  const near = ctx.settlements.filter((s) => greatCircleKm([s.lat, s.lon], center) < fullKm + 12).map((s) => { const [x, y] = localOf([s.lat, s.lon]); return { ...s, x, y, radiusKm: (SETTLEMENT_RADIUS_M[s.kind] ?? 300) / 1000, farmKm: FARMLAND_KM[s.kind] ?? 2 }; });
  const roads = roadsNear(ctx, center, fullKm).map((road) => ({ ...road, local: road.points.map(localOf) })).filter((road) => road.local.some(([x, y]) => Math.abs(x) < half + 2 && Math.abs(y) < half + 2));
  // How close each cell is to a road (fields line the roads a little way out from town).
  const roadSide = new Float32Array(n * n), band = 0.6;
  for (const road of roads) for (let k = 0; k + 1 < road.local.length; k += 1) {
    const [a, b] = [road.local[k], road.local[k + 1]]; if (Math.max(Math.abs(a[0]), Math.abs(a[1])) > half + band + 2 && Math.max(Math.abs(b[0]), Math.abs(b[1])) > half + band + 2) continue;
    const c0 = Math.floor((Math.min(a[0], b[0]) - band + half) / res), c1 = Math.ceil((Math.max(a[0], b[0]) + band + half) / res), r0 = Math.floor((half - Math.max(a[1], b[1]) - band) / res), r1 = Math.ceil((half - Math.min(a[1], b[1]) + band) / res);
    for (let r = Math.max(0, r0); r <= Math.min(n - 1, r1); r += 1) for (let c = Math.max(0, c0); c <= Math.min(n - 1, c1); c += 1) { const d = segmentDistanceM(-half + (c + 0.5) * res, half - (r + 0.5) * res, a, b); if (d < band) roadSide[r * n + c] = Math.max(roadSide[r * n + c], 0.35 * (1 - d / band)); }
  }
  // Cover, cell by cell.
  for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) {
    const i = r * n + c, f = facts[i];
    if (!f.land) { cover[i] = COVER.sea; continue; }
    if (f.water) { cover[i] = COVER.lake; continue; }
    if (riverMask[i]) { cover[i] = COVER.river; continue; }
    const [lat, lon] = latlon(c, r), p = toKmVector(lat, lon), x = -half + (c + 0.5) * res, y = half - (r + 0.5) * res;
    const e = elevation[i], dzx = (elevation[r * n + Math.min(n - 1, c + 1)] - elevation[r * n + Math.max(0, c - 1)]) / (2 * resolutionM), dzy = (elevation[Math.min(n - 1, r + 1) * n + c] - elevation[Math.max(0, r - 1) * n + c]) / (2 * resolutionM);
    const slope = Math.hypot(dzx, dzy); shade[i] = clamp(0.75 + (-dzx * 0.7 + dzy * 0.7) * 2.2, 0.35, 1.25);
    const temp = annualMeanTemperatureC(lat, e), wet = Math.log10(1 + area[i] / streamAreaKm2);
    let settled = Infinity, farming = 0;
    for (const s of near) { const d = Math.hypot(x - s.x, y - s.y); settled = Math.min(settled, d / s.radiusKm); farming = Math.max(farming, 1 - d / s.farmKm); }
    farming = Math.max(farming, roadSide[i]); // fields along the roads, too
    const n1 = globeNoise(p, 2.5, 0.15, 3), n2 = globeNoise(p, 0.8, 0.06, 5);
    // Rugged ground has deep hollows that drain through rock; only the deepest hold water there.
    const rugged = Math.max(f.relief, f.reliefClass);
    if (pondDepth[i] > 3 + 6 * rugged) { cover[i] = COVER.lake; continue; }
    if (pondDepth[i] > 1 + 2 * rugged && f.precipMm > 900) { cover[i] = COVER.marsh; continue; }
    if (temp < -3 || (f.relief > 2.4 && temp < 1)) cover[i] = COVER.snow;
    else if (slope > 0.75 || (Math.max(f.relief, f.reliefClass) > 1.8 && n1 > 0.25)) cover[i] = COVER.rock;
    else if (settled < 1 + 0.35 * n1) cover[i] = COVER.built;
    else if (seaKm[i] < 0.12 + 0.08 * n2 && e < 8) cover[i] = COVER.beach;
    else if (slope < 0.02 && wet > 0.8 && f.precipMm > 900 && n1 > -0.1) cover[i] = COVER.marsh;
    else {
      const woods = clamp((BIOME_WOODS[f.biome] ?? 0.4) * 0.6 + (0.6 * f.forestShare + 0.4 * (f.forestMask ? 1 : 0)) * 0.55 + 0.25 * wet - (temp < 2 ? 0.4 : 0), 0, 1);
      // Towns clear the land around them, forest or not; fields thin out with distance and on slopes.
      if (slope < 0.14 && farming > 0 && n1 * 0.6 + n2 * 0.25 + farming > 0.45 + 0.3 * f.forestShare) cover[i] = COVER.farmland;
      else if (n1 * 0.5 + n2 * 0.35 + (woods - 0.5) > 0.12) cover[i] = COVER.woods;
      else if (n1 * 0.5 + n2 * 0.35 + (woods - 0.5) > -0.1) cover[i] = COVER.scrub;
      else cover[i] = COVER.meadow;
    }
  }
  // Streams as polylines (from their heads down to where they join water), drawn over the cover.
  const isStream = new Uint8Array(n * n); for (let i = 0; i < n * n; i += 1) if (streamCell(i)) isStream[i] = 1;
  const upstream = new Uint8Array(n * n); for (let i = 0; i < n * n; i += 1) if (isStream[i] && receiver[i] >= 0 && isStream[receiver[i]]) upstream[receiver[i]] = 1;
  const streams = [], seen = new Uint8Array(n * n), localXY = (i) => [-half + (i % n + 0.5) * res, half - (Math.floor(i / n) + 0.5) * res];
  for (let i = 0; i < n * n; i += 1) {
    if (!isStream[i] || upstream[i]) continue;
    const path = []; let k = i;
    while (k >= 0 && path.length < n * 4) { path.push(k); if (!isStream[k] || seen[k]) break; seen[k] = 1; k = receiver[k]; }
    if (path.length < 4) continue;
    // Cell steps run in eight directions; round them off and let the stream meander (pinned to the world).
    let line = path.map(localXY);
    for (let pass = 0; pass < 2; pass += 1) line = [line[0], ...line.slice(0, -1).flatMap((p, k) => { const q = line[k + 1]; return [[p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]]; }), line.at(-1)];
    line = line.map(([x, y], k) => { if (k === 0 || k === line.length - 1) return [x, y]; const [lat, lon] = fromLocal(center, x, y), v = toKmVector(lat, lon), a = line[k - 1], b = line[k + 1], dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1, wiggle = 1.6 * res * globeNoise(v, 0.6, Math.max(0.02, res), 71); return [x - dy / len * wiggle, y + dx / len * wiggle]; });
    streams.push({ widthM: clamp(1.5 + 3 * Math.log10(area[path.at(-2)] / streamAreaKm2 + 1) * 4, 1.5, 20), local: line, areaKm2: area[path.at(-2)] });
  }
  for (let i = 0; i < n * n; i += 1) if (isStream[i] && cover[i] !== COVER.built) cover[i] = COVER.stream;
  // Structures: farmsteads among the fields, mills on streams near towns, fords and bridges where roads meet water.
  const structures = [];
  // Farmsteads: one chance per world-pinned 0.003° cell (~330 m), at a hashed spot inside it.
  const step = 0.003, [cLat, cLon] = center, spanLat = half / 111.2 + step, spanLon = half / (111.2 * Math.max(0.2, Math.cos(cLat * DEG))) + step;
  for (let a = Math.floor((cLat - spanLat) / step); a <= Math.ceil((cLat + spanLat) / step); a += 1) for (let b = Math.floor((cLon - spanLon) / step); b <= Math.ceil((cLon + spanLon) / step); b += 1) {
    const key = `${LOCAL_DETAIL_MODEL}|farm|${a}|${b}`; if (hashUnit(key) > 0.22) continue;
    const lat = (a + hashUnit(`${key}|y`)) * step, lon = (b + hashUnit(`${key}|x`)) * step, [x, y] = localOf([lat, lon]);
    const c = Math.floor((x + half) / res), r = Math.floor((half - y) / res);
    if (c >= 0 && r >= 0 && c < n && r < n && cover[r * n + c] === COVER.farmland) structures.push({ kind: "farmstead", local: [x, y] });
  }
  for (const s of streams) if (s.areaKm2 > streamAreaKm2 * 4) { const mid = s.local[Math.floor(s.local.length / 2)]; if (near.some((t) => Math.hypot(mid[0] - t.x, mid[1] - t.y) < 5)) structures.push({ kind: "mill", local: mid }); }
  for (const road of roads) for (let k = 0; k + 1 < road.local.length; k += 1) {
    const [x, y] = road.local[k], c = Math.floor((x + half) / res), r = Math.floor((half - y) / res); if (c < 0 || r < 0 || c >= n || r >= n) continue;
    const kindHere = cover[r * n + c]; if (kindHere === COVER.river || kindHere === COVER.lake) structures.push({ kind: "bridge", local: [x, y] }); else if (kindHere === COVER.stream) structures.push({ kind: "ford", local: [x, y] });
  }
  // Crop to the requested square (the margin only kept streams and roads continuous).
  const crop = (array, Type) => { const out = new Type(inner * inner); for (let r = 0; r < inner; r += 1) out.set(array.subarray((r + offset) * n + offset, (r + offset) * n + offset + inner), r * inner); return out; };
  const halfInner = sizeKm / 2, insideTile = ([x, y]) => Math.abs(x) <= halfInner && Math.abs(y) <= halfInner;
  return {
    model: LOCAL_DETAIL_MODEL, center, sizeKm, resolutionM, cols: inner, rows: inner,
    elevation: crop(elevation, Float32Array), cover: crop(cover, Uint8Array), shade: crop(shade, Float32Array),
    streams: streams.filter((s) => s.local.some(insideTile)), roads: roads.filter((road) => road.local.some(insideTile)),
    structures: structures.filter((s) => insideTile(s.local)), settlements: near.filter((s) => insideTile([s.x, s.y])),
    toPixel: ([x, y]) => [(x + halfInner) / res, (halfInner - y) / res],
  };
}

// ---------------------------------------------------------------- pictures

export const COVER_COLORS = Object.freeze({
  [COVER.sea]: [38, 82, 109], [COVER.lake]: [91, 155, 196], [COVER.river]: [91, 155, 196], [COVER.stream]: [104, 166, 205], [COVER.beach]: [222, 205, 160], [COVER.marsh]: [104, 128, 92],
  [COVER.meadow]: [148, 168, 98], [COVER.farmland]: [189, 177, 112], [COVER.scrub]: [118, 140, 82], [COVER.woods]: [62, 104, 58], [COVER.rock]: [140, 128, 112], [COVER.snow]: [238, 241, 243], [COVER.built]: [150, 120, 96],
});

/** RGBA pixels for a tile, with hill shading (for a canvas, or a PNG). */
export function tileRgba(tile) {
  const out = new Uint8ClampedArray(tile.cols * tile.rows * 4);
  for (let i = 0; i < tile.cols * tile.rows; i += 1) {
    const base = COVER_COLORS[tile.cover[i]] ?? [255, 0, 255], k = tile.cover[i] <= COVER.stream ? 1 : tile.shade[i];
    out[i * 4] = base[0] * k; out[i * 4 + 1] = base[1] * k; out[i * 4 + 2] = base[2] * k; out[i * 4 + 3] = 255;
  }
  return out;
}

/** Vector overlay for a tile (streams, roads, structures, settlement marks) as SVG markup at `scale` px per cell. */
export function tileOverlaySvg(tile, scale = 1) {
  const px = ([x, y]) => tile.toPixel([x, y]).map((v) => (v * scale).toFixed(1)).join(" "), parts = [];
  const pxPerM = scale / tile.resolutionM;
  for (const s of tile.streams) parts.push(`<path d="M${s.local.map(px).join(" L")}" fill="none" stroke="#5f9fcc" stroke-width="${Math.max(1, s.widthM * pxPerM).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  for (const road of tile.roads) parts.push(`<path d="M${road.local.map(px).join(" L")}" fill="none" stroke="#8a6a44" stroke-width="${Math.max(1.4, (road.kind === "highway" ? 9 : 6) * pxPerM).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  const mark = { farmstead: ["#6b4b32", 2.2], mill: ["#3b5a75", 3], bridge: ["#5b4630", 3], ford: ["#7aa6c8", 2.6] };
  for (const s of tile.structures) { const [x, y] = px(s.local).split(" "); const [fill, r] = mark[s.kind] ?? ["#333", 2]; parts.push(`<rect x="${(x - r).toFixed(1)}" y="${(y - r).toFixed(1)}" width="${2 * r}" height="${2 * r}" fill="${fill}"/>`); }
  return parts.join("");
}

// ---------------------------------------------------------------- battle tier (5-ft squares)

const FEET = 0.3048, BATTLE_ANCHOR_DEG = 0.02, BATTLE_CONTEXT_KM = 4, BATTLE_CONTEXT_M = 10;
const OBJECT_DENSITY = { [COVER.woods]: { tree: 0.55, bush: 0.15, boulder: 0.02 }, [COVER.scrub]: { tree: 0.12, bush: 0.35, boulder: 0.04 }, [COVER.meadow]: { tree: 0.015, bush: 0.05, boulder: 0.02 }, [COVER.farmland]: { tree: 0.004, bush: 0.01 }, [COVER.marsh]: { bush: 0.25, tree: 0.04 }, [COVER.rock]: { boulder: 0.3, bush: 0.04 }, [COVER.beach]: { boulder: 0.02 }, [COVER.snow]: { boulder: 0.05 } };

/**
 * The ground of a battle map: cover and height for every 5-ft square, trees, bushes, boulders and
 * buildings, and the streams and roads crossing it — all read from the local detail around the place.
 * @param spec battleMapSpec(...) (columns, rows, feetPerSquare)
 */
/** The world-pinned anchor (0.02° lattice) whose canonical tile a battle site reads. */
export const battleAnchor = (center) => [Math.round(center[0] / BATTLE_ANCHOR_DEG) * BATTLE_ANCHOR_DEG, Math.round(center[1] / BATTLE_ANCHOR_DEG) * BATTLE_ANCHOR_DEG];

export function buildBattleSite(asset, { center, spec }) {
  const ctx = localContext(asset), squareM = (spec.feetPerSquare ?? 5) * FEET, widthM = spec.columns * squareM, heightM = spec.rows * squareM;
  // The context is a canonical local tile around a world-pinned anchor (0.02° lattice), so a stream or a
  // field edge is in the same place whichever battle map it falls on.
  const anchor = battleAnchor(center);
  const context = buildLocalTile(asset, { center: anchor, sizeKm: BATTLE_CONTEXT_KM, resolutionM: BATTLE_CONTEXT_M, marginFraction: 0.4 });
  const res = context.resolutionM / 1000, halfCtx = context.sizeKm / 2, n = context.cols;
  const rasterAt = (lat, lon) => { const [x, y] = toLocal(anchor, lat, lon), c = clamp(Math.floor((x + halfCtx) / res), 0, n - 1), r = clamp(Math.floor((halfCtx - y) / res), 0, n - 1); return [r, c]; };
  // Raster water cells give way to the land around them: water comes back below as exact vector lines.
  const WATER_LINE = new Set([COVER.stream, COVER.river]);
  const landCoverAt = (r, c) => {
    const here = context.cover[r * n + c]; if (!WATER_LINE.has(here)) return here;
    const votes = new Map();
    for (let dr = -2; dr <= 2; dr += 1) for (let dc = -2; dc <= 2; dc += 1) { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue; const v = context.cover[rr * n + cc]; if (!WATER_LINE.has(v)) votes.set(v, (votes.get(v) ?? 0) + 1); }
    return votes.size ? [...votes].sort((p, q) => q[1] - p[1] || p[0] - q[0])[0][0] : COVER.meadow;
  };
  const toKm = (col, row) => [(-widthM / 2 + (col + 0.5) * squareM) / 1000, (heightM / 2 - (row + 0.5) * squareM) / 1000];
  const toSquares = (line) => line.map(([x, y]) => [(x * 1000 + widthM / 2) / squareM, (heightM / 2 - y * 1000) / squareM]);
  const fromTile = (line) => toSquares(line.map(([x, y]) => { const [lat, lon] = fromLocal(anchor, x, y); return toLocal(center, lat, lon); }));
  const inside = (line) => line.some(([c, r]) => c >= -4 && r >= -4 && c <= spec.columns + 4 && r <= spec.rows + 4);
  // Water and roads as lines in squares: streams of the context tile, known rivers and the roads.
  const streams = context.streams.map((s) => ({ kind: "stream", widthSquares: s.widthM / squareM, line: fromTile(s.local) }))
    .concat(ctx.rivers.filter((rv) => rv.points.some((p) => greatCircleKm(p, center) < 30)).map((rv) => ({ kind: "river", widthSquares: rv.widthM / squareM, line: toSquares(rv.points.map((p) => toLocal(center, p[0], p[1]))) })))
    .filter((s) => inside(s.line));
  const roads = context.roads.map((road) => ({ kind: road.kind, widthSquares: (road.kind === "highway" ? 6 : 4) / squareM, line: fromTile(road.local) })).filter((road) => inside(road.line));
  const nearLine = (col, row, lines, minHalf) => lines.find((l) => { const half = Math.max(minHalf, l.widthSquares / 2); for (let k = 0; k + 1 < l.line.length; k += 1) if (segmentDistanceM(col, row, l.line[k], l.line[k + 1]) <= half) return true; return false; });
  const squares = new Uint8Array(spec.columns * spec.rows), heights = new Float32Array(spec.columns * spec.rows);
  for (let row = 0; row < spec.rows; row += 1) for (let col = 0; col < spec.columns; col += 1) {
    const [x, y] = toKm(col, row), [lat, lon] = fromLocal(center, x, y), v = toKmVector(lat, lon), i = row * spec.columns + col;
    // Sample the context at a warped point, so boundaries between covers wander rather than step.
    const warp = 1.2 * res, [wl, wo] = fromLocal(center, x + warp * globeNoise(v, 0.06, 0.006, 81), y + warp * globeNoise(v, 0.06, 0.006, 83));
    squares[i] = landCoverAt(...rasterAt(wl, wo));
    heights[i] = elevationAt(ctx, lat, lon, 0.002);
    const cx = col + 0.5, cy = row + 0.5, water = nearLine(cx, cy, streams, 0.35), road = !water && nearLine(cx, cy, roads, 0.5);
    if (water) squares[i] = water.kind === "river" ? COVER.river : COVER.stream; else if (road) squares[i] = COVER.road;
  }
  // Objects on a world-pinned grid of ~2-m cells: the same tree stands in the same place on every map.
  const stepDeg = 2 / 111200, objects = [];
  const corners = [toKm(-1, -1), toKm(spec.columns, spec.rows)].map(([x, y]) => fromLocal(center, x, y));
  const latLo = Math.min(corners[0][0], corners[1][0]), latHi = Math.max(corners[0][0], corners[1][0]), lonLo = Math.min(corners[0][1], corners[1][1]), lonHi = Math.max(corners[0][1], corners[1][1]);
  const lonStep = stepDeg / Math.max(0.2, Math.cos(center[0] * DEG));
  const squareOf = (lat, lon) => { const [x, y] = toLocal(center, lat, lon), col = (x * 1000 + widthM / 2) / squareM, row = (heightM / 2 - y * 1000) / squareM; return col < 0 || row < 0 || col >= spec.columns || row >= spec.rows ? null : [col, row, squares[Math.floor(row) * spec.columns + Math.floor(col)]]; };
  for (let a = Math.floor(latLo / stepDeg); a <= Math.ceil(latHi / stepDeg); a += 1) for (let b = Math.floor(lonLo / lonStep); b <= Math.ceil(lonHi / lonStep); b += 1) {
    const key = `${LOCAL_DETAIL_MODEL}|obj|${a}|${b}`, u = hashUnit(key), at = squareOf((a + hashUnit(`${key}|y`)) * stepDeg, (b + hashUnit(`${key}|x`)) * lonStep);
    const density = at && OBJECT_DENSITY[at[2]]; if (!density) continue;
    // Densities are per 5-ft square; each 2-m cell is about 0.43 of a square.
    let acc = 0; for (const [kind, perSquare] of Object.entries(density)) { acc += perSquare * 0.43; if (u < acc) { const sz = hashUnit(`${key}|s`); objects.push({ kind, x: at[0], y: at[1], size: kind === "tree" ? 0.6 + 0.9 * sz : kind === "bush" ? 0.25 + 0.25 * sz : 0.2 + 0.3 * sz }); break; } }
  }
  // Buildings in built-up squares: one chance per world-pinned 4-square block, never on water or road.
  const blockDeg = 4 * squareM / 111200, blockLon = blockDeg / Math.max(0.2, Math.cos(center[0] * DEG));
  for (let a = Math.floor(latLo / blockDeg); a <= Math.ceil(latHi / blockDeg); a += 1) for (let b = Math.floor(lonLo / blockLon); b <= Math.ceil(lonHi / blockLon); b += 1) {
    const key = `${LOCAL_DETAIL_MODEL}|bld|${a}|${b}`; if (hashUnit(key) > 0.7) continue;
    const at = squareOf((a + 0.3 + 0.4 * hashUnit(`${key}|y`)) * blockDeg, (b + 0.3 + 0.4 * hashUnit(`${key}|x`)) * blockLon); if (!at || at[2] !== COVER.built) continue;
    const w = 1.6 + 1.6 * hashUnit(`${key}|w`), h = 1.2 + 1.2 * hashUnit(`${key}|h`), clear = [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]].every(([dx, dy]) => { const c = Math.floor(at[0] + dx), r = Math.floor(at[1] + dy); return c < 0 || r < 0 || c >= spec.columns || r >= spec.rows || squares[r * spec.columns + c] === COVER.built; });
    if (clear) objects.push({ kind: "building", x: at[0], y: at[1], w, h, rotation: Math.round(hashUnit(`${key}|r`) * 4) * 90 + (hashUnit(`${key}|t`) - 0.5) * 12 });
  }
  return { model: LOCAL_DETAIL_MODEL, center, anchor, spec, squareM, squares, heights, objects, streams, roads, summary: summarizeSquares(squares) };
}

function summarizeSquares(squares) {
  const counts = {}; for (const v of squares) counts[COVER_NAMES[v]] = (counts[COVER_NAMES[v]] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, Math.round(100 * v / squares.length)]));
}

/** A top-down reference drawing of a battle site, `gridPx` pixels per square (SVG markup). */
export function battleSiteSvg(site, gridPx = 70) {
  const { columns, rows } = site.spec, parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${columns * gridPx}" height="${rows * gridPx}" viewBox="0 0 ${columns} ${rows}">`];
  for (let row = 0; row < rows; row += 1) for (let col = 0; col < columns; col += 1) { const [r, g, b] = COVER_COLORS[site.squares[row * columns + col]] ?? [255, 0, 255]; parts.push(`<rect x="${col}" y="${row}" width="1.02" height="1.02" fill="rgb(${r},${g},${b})"/>`); }
  const path = (line) => `M${line.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(" L")}`;
  for (const s of site.streams) parts.push(`<path d="${path(s.line)}" fill="none" stroke="#5f9fcc" stroke-width="${Math.max(0.3, s.widthSquares).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  for (const r of site.roads) parts.push(`<path d="${path(r.line)}" fill="none" stroke="#9a7a52" stroke-width="${r.widthSquares.toFixed(2)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  const colors = { tree: "#2a5229", bush: "#5d7d3e", boulder: "#7d7468" };
  for (const o of site.objects) {
    if (o.kind === "building") parts.push(`<rect x="${(o.x - o.w / 2).toFixed(2)}" y="${(o.y - o.h / 2).toFixed(2)}" width="${o.w.toFixed(2)}" height="${o.h.toFixed(2)}" fill="#8a5a3c" stroke="#3a2516" stroke-width="0.08" transform="rotate(${o.rotation.toFixed(1)} ${o.x.toFixed(2)} ${o.y.toFixed(2)})"/>`);
    else parts.push(`<circle cx="${o.x.toFixed(2)}" cy="${o.y.toFixed(2)}" r="${o.size.toFixed(2)}" fill="${colors[o.kind]}" fill-opacity="${o.kind === "tree" ? 0.85 : 1}"/>`);
  }
  parts.push("</svg>");
  return parts.join("");
}

// ---------------------------------------------------------------- the atlas's local level

/** How a local tile covers an atlas frame: its size and resolution (bounded cost), and where its pixels land. */
export function localDetailLayout(frame, maxCells = 1100) {
  const sizeKm = Math.max(frame.W, frame.H) * frame.kmPerPx, resolutionM = Math.max(20, Math.ceil((sizeKm * 1000) / maxCells));
  const scale = resolutionM / 1000 / frame.kmPerPx, half = sizeKm / 2;
  return { center: frame.center, sizeKm, resolutionM, scale, x0: frame.W / 2 - half / frame.kmPerPx, y0: frame.H / 2 - half / frame.kmPerPx };
}

/** Streams, roads and structures of a tile, placed on the atlas frame (an SVG of the frame's size). */
export function localDetailOverlaySvg(tile, layout, W, H) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g transform="translate(${layout.x0.toFixed(2)} ${layout.y0.toFixed(2)})">${tileOverlaySvg(tile, layout.scale)}</g></svg>`;
}
