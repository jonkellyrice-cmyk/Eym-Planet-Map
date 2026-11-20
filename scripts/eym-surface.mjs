// Eym's surface: two authored continents traced from their maps (Caren and
// Garyk), three seeded continents and seeded archipelagos, placed on the
// sphere. Pure and deterministic: the same traced input and layout always give
// the same rings, relief and land mask.

import { createRng } from "./planet-geography.mjs";
import { WORLD_INPUTS } from "./eym-world-inputs.mjs";

export const EYM_SURFACE_MODEL = "eym-surface-v1";
export const EYM_RADIUS_KM = 6371;
const DEG = Math.PI / 180;
const CAREN_AREA_KM2 = 590_000 * 2.589988110336;

/**
 * Where everything goes: the layout of scripts/eym-world-inputs.mjs (the dials), with each seeded continent's
 * area worked out from its multiple of Caren's. Caren straddles the equator (its centroid sits on it). Garyk lies
 * slightly north of the equator, three weeks by steamer from Caren: its south-east port is that far from Caren's
 * north-west port (Pouk), which puts it west-north-west of Caren; the largest continent lies east of Caren; two
 * smaller, colder ones lie far to the north and south. The seeded shapes come from `seed`.
 */
export const EYM_LAYOUT = Object.freeze({
  ...WORLD_INPUTS.layout,
  seeded: WORLD_INPUTS.layout.seeded.map(({ id, name, areaCarens, ...rest }) => ({ id, name, areaKm2: areaCarens * CAREN_AREA_KM2, ...rest })),
});

// ---------------------------------------------------------------- geometry

/** Azimuthal-equidistant offset (x east, y north, km) of a point from a center. */
export function toLocal([lat0, lon0], lat, lon) {
  const p0 = lat0 * DEG, p = lat * DEG, dl = (lon - lon0) * DEG;
  const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(dl);
  const c = Math.acos(Math.max(-1, Math.min(1, cosc)));
  if (c < 1e-12) return [0, 0];
  const az = Math.atan2(Math.sin(dl) * Math.cos(p), Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(dl));
  return [EYM_RADIUS_KM * c * Math.sin(az), EYM_RADIUS_KM * c * Math.cos(az)];
}

/** Inverse of toLocal. */
export function fromLocal([lat0, lon0], x, y) {
  const c = Math.hypot(x, y) / EYM_RADIUS_KM;
  if (c < 1e-12) return [lat0, lon0];
  const az = Math.atan2(x, y), p0 = lat0 * DEG;
  const p = Math.asin(Math.sin(p0) * Math.cos(c) + Math.cos(p0) * Math.sin(c) * Math.cos(az));
  const l = lon0 * DEG + Math.atan2(Math.sin(az) * Math.sin(c) * Math.cos(p0), Math.cos(c) - Math.sin(p0) * Math.sin(p));
  let lon = l / DEG; while (lon > 180) lon -= 360; while (lon < -180) lon += 360;
  return [p / DEG, lon];
}

export function greatCircleKm(a, b) {
  const p1 = a[0] * DEG, p2 = b[0] * DEG, dl = (b[1] - a[1]) * DEG;
  return EYM_RADIUS_KM * Math.acos(Math.max(-1, Math.min(1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl))));
}

export function destination(from, bearingDeg, km) {
  const [x, y] = [Math.sin(bearingDeg * DEG) * km, Math.cos(bearingDeg * DEG) * km];
  return fromLocal(from, x, y);
}

export function ringAreaKm2(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(area) / 2;
}

/** Spherical area (km²) of a closed [lat, lon] ring. */
export function sphericalRingAreaKm2(ring) {
  let total = 0, turn = 0, latSum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [lat1, lon1] = ring[i], [lat2, lon2] = ring[(i + 1) % ring.length];
    let dl = lon2 - lon1; while (dl > 180) dl -= 360; while (dl < -180) dl += 360;
    total += dl * DEG * (2 + Math.sin(lat1 * DEG) + Math.sin(lat2 * DEG)); turn += dl; latSum += lat1;
  }
  // The sum measures from the south pole up to the ring. For a ring right round a pole (its longitudes make a whole
  // turn) that is the land itself when it lies over the south pole, and everything but the land when it lies over
  // the north pole.
  if (Math.abs(turn) > 180 && latSum > 0) return (4 * Math.PI - Math.abs(total) / 2) * EYM_RADIUS_KM ** 2;
  return Math.abs(total) * EYM_RADIUS_KM ** 2 / 2;
}

const round3 = (value) => Math.round(value * 1000) / 1000;
const toLatLonRing = (center, ring) => ring.map(([x, y]) => fromLocal(center, x, y).map(round3));

// ---------------------------------------------------------------- noise

function valueNoise2(seed) {
  const rng = createRng(seed), table = Float32Array.from({ length: 4096 }, () => rng() * 2 - 1);
  const at = (i, j) => table[((i * 73856093) ^ (j * 19349663)) & 4095];
  const smooth = (t) => t * t * (3 - 2 * t);
  const octave = (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), fx = smooth(x - i), fy = smooth(y - j);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * fx, b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * fx;
    return a + (b - a) * fy;
  };
  return (x, y) => octave(x, y) * 0.6 + octave(x * 2.03 + 17.1, y * 2.03 - 9.4) * 0.28 + octave(x * 4.11 - 3.3, y * 4.11 + 5.9) * 0.12;
}

// ---------------------------------------------------------------- seeded shapes

/** A closed, star-shaped coastline of the requested area with fractal detail (local km). */
export function seededRing(rng, { areaKm2, elongation = 1.4, orientationDeg = 0, vertices = 180, subdivisions = 3, lobes = 3 }) {
  const harmonics = Array.from({ length: 9 }, (_, index) => ({ k: index + 2, amp: (0.3 / (index + 2) ** 1.05) * (0.45 + rng() * 0.9), phase: rng() * Math.PI * 2 }));
  const bumps = Array.from({ length: lobes }, (_, index) => ({ at: rng() * Math.PI * 2, width: 0.07 + rng() * 0.12, height: index % 3 === 2 ? -(0.12 + rng() * 0.16) : 0.22 + rng() * 0.4 }));
  const sx = Math.sqrt(elongation), sy = 1 / sx, rot = orientationDeg * DEG;
  let ring = [];
  for (let index = 0; index < vertices; index += 1) {
    const theta = index / vertices * Math.PI * 2;
    let r = 1;
    for (const h of harmonics) r += h.amp * Math.cos(h.k * theta + h.phase);
    for (const b of bumps) { let d = Math.abs(theta - b.at); d = Math.min(d, Math.PI * 2 - d); r += b.height * Math.exp(-((d / b.width) ** 2)); }
    r = Math.max(0.3, r);
    const x = Math.cos(theta) * r * sx, y = Math.sin(theta) * r * sy;
    ring.push([x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  for (let level = 0; level < subdivisions; level += 1) {
    const next = [];
    for (let index = 0; index < ring.length; index += 1) {
      const a = ring[index], b = ring[(index + 1) % ring.length], dx = b[0] - a[0], dy = b[1] - a[1];
      const offset = (rng() - 0.5) * 0.36;
      next.push(a, [(a[0] + b[0]) / 2 - dy * offset, (a[1] + b[1]) / 2 + dx * offset]);
    }
    ring = next;
  }
  const scale = Math.sqrt(areaKm2 / ringAreaKm2(ring));
  return ring.map(([x, y]) => [x * scale, y * scale]);
}

// ---------------------------------------------------------------- rasters

/** Scanline even-odd fill of rings onto a local grid; returns Uint8Array (1 inside). */
function fillRings(grid, rings) {
  const out = new Uint8Array(grid.cols * grid.rows), edges = [];
  for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) edges.push([ring[j], ring[i]]);
  for (let row = 0; row < grid.rows; row += 1) {
    const y = grid.y0 - (row + 0.5) * grid.cellKm, xs = [];
    for (const [a, b] of edges) if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - grid.x0) / grid.cellKm - 0.5)), c1 = Math.min(grid.cols - 1, Math.floor((xs[k + 1] - grid.x0) / grid.cellKm - 0.5));
      for (let col = c0; col <= c1; col += 1) out[row * grid.cols + col] = 1;
    }
  }
  return out;
}

/** Chamfer distance (km) from each land cell to the nearest non-land cell. */
function coastDistance(grid, land) {
  const { cols, rows, cellKm } = grid, d = new Float32Array(cols * rows), big = 1e9, diag = Math.SQRT2;
  for (let i = 0; i < d.length; i += 1) d[i] = land[i] ? big : 0;
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    const i = r * cols + c; if (!d[i]) continue;
    let v = d[i];
    if (c > 0) v = Math.min(v, d[i - 1] + 1); else v = Math.min(v, 1);
    if (r > 0) { v = Math.min(v, d[i - cols] + 1); if (c > 0) v = Math.min(v, d[i - cols - 1] + diag); if (c < cols - 1) v = Math.min(v, d[i - cols + 1] + diag); } else v = Math.min(v, 1);
    d[i] = v;
  }
  for (let r = rows - 1; r >= 0; r -= 1) for (let c = cols - 1; c >= 0; c -= 1) {
    const i = r * cols + c; if (!d[i]) continue;
    let v = d[i];
    if (c < cols - 1) v = Math.min(v, d[i + 1] + 1); else v = Math.min(v, 1);
    if (r < rows - 1) { v = Math.min(v, d[i + cols] + 1); if (c < cols - 1) v = Math.min(v, d[i + cols + 1] + diag); if (c > 0) v = Math.min(v, d[i + cols - 1] + diag); } else v = Math.min(v, 1);
    d[i] = v;
  }
  for (let i = 0; i < d.length; i += 1) d[i] *= cellKm;
  return d;
}

function boxBlur(values, cols, rows, radius) {
  let current = Float32Array.from(values);
  for (const horizontal of [true, false]) {
    const next = new Float32Array(current.length);
    for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
      let sum = 0, count = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const rr = horizontal ? r : r + k, cc = horizontal ? c + k : c;
        if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
        sum += current[rr * cols + cc]; count += 1;
      }
      next[r * cols + c] = sum / count;
    }
    current = next;
  }
  return current;
}

function decodeGrid(base64, length) {
  const bytes = typeof Buffer !== "undefined" ? Buffer.from(base64, "base64") : Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  if (bytes.length !== length) throw new Error("Traced grid has the wrong size");
  return Uint8Array.from(bytes);
}

const piecewise = (points, value) => {
  if (value <= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index += 1) if (value <= points[index][0]) {
    const [x0, y0] = points[index - 1], [x1, y1] = points[index];
    return y0 + (y1 - y0) * (value - x0) / (x1 - x0);
  }
  return points.at(-1)[1];
};

/**
 * One placed region of the surface (a continent with its islands, or an
 * archipelago) with a local land/water/elevation raster.
 */
function buildFrame({ id, continent, origin, center, rings, waterRings = [], relief = null, ridges = [], peakM, cellKm, noise }) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const ring of rings) for (const [x, y] of ring) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const margin = cellKm * 3, grid = { x0: minX - margin, y0: maxY + margin, cellKm };
  grid.cols = Math.ceil((maxX - minX + 2 * margin) / cellKm); grid.rows = Math.ceil((maxY - minY + 2 * margin) / cellKm);
  const outline = fillRings(grid, rings), water = fillRings(grid, waterRings), land = outline.map((v, i) => v && !water[i] ? 1 : 0);
  const coastKm = coastDistance(grid, outline);
  let reliefValue = new Float32Array(land.length), forest = new Uint8Array(land.length);
  if (relief) {
    const codes = decodeGrid(relief.reliefBase64, relief.rows * relief.cols), trees = decodeGrid(relief.forestBase64, relief.rows * relief.cols);
    for (let r = 0; r < grid.rows; r += 1) for (let c = 0; c < grid.cols; c += 1) {
      const x = grid.x0 + (c + 0.5) * cellKm, y = grid.y0 - (r + 0.5) * cellKm;
      const tc = Math.floor((x - relief.northWestKm[0]) / relief.cellKm), tr = Math.floor((relief.northWestKm[1] - y) / relief.cellKm);
      if (tc < 0 || tr < 0 || tc >= relief.cols || tr >= relief.rows) continue;
      reliefValue[r * grid.cols + c] = codes[tr * relief.cols + tc]; forest[r * grid.cols + c] = trees[tr * relief.cols + tc];
    }
    reliefValue = boxBlur(reliefValue, grid.cols, grid.rows, 2);
  }
  const elevation = new Float32Array(land.length);
  for (let r = 0; r < grid.rows; r += 1) for (let c = 0; c < grid.cols; c += 1) {
    const i = r * grid.cols + c; if (!outline[i]) continue;
    const x = grid.x0 + (c + 0.5) * cellKm, y = grid.y0 - (r + 0.5) * cellKm, n = noise(x / 160, y / 160), coast = coastKm[i];
    let e = 12 + 300 * (1 - Math.exp(-coast / 140)) * (1 + 0.5 * n);
    if (relief) e += piecewise([[0, 0], [0.35, 120], [1, 750], [2, 2300], [3, peakM]], reliefValue[i]) * (1 + 0.14 * n);
    let ridgeM = 0;
    for (const ridge of ridges) {
      let best = Infinity;
      for (let k = 0; k + 1 < ridge.points.length; k += 1) {
        const [ax, ay] = ridge.points[k], [bx, by] = ridge.points[k + 1], dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
        best = Math.min(best, Math.hypot(x - ax - t * dx, y - ay - t * dy));
      }
      ridgeM = Math.max(ridgeM, ridge.heightM * Math.exp(-((best / ridge.widthKm) ** 2)) * Math.min(1, coast / 90) * (0.8 + 0.3 * (noise(x / 60 + 40, y / 60) + 1) / 2));
    }
    e += ridgeM;
    if (!relief) e += 380 * Math.max(0, noise(x / 300 - 20, y / 300 + 7)) * Math.min(1, coast / 200);
    elevation[i] = water[i] ? Math.max(5, e - 25) : Math.max(1, e);
  }
  const radiusKm = Math.max(...rings.flat().map(([x, y]) => Math.hypot(x, y))) + margin;
  return { id, continent, origin, center, grid, outline, land, water, coastKm, elevation, forest, reliefValue, radiusKm };
}

function sampleFrame(frame, lat, lon) {
  const [x, y] = frame.sphere ? sphereLocal(frame.sphere, lat, lon) : toLocal(frame.center, lat, lon), { grid } = frame;
  const c = Math.floor((x - grid.x0) / grid.cellKm), r = Math.floor((grid.y0 - y) / grid.cellKm);
  if (c < 0 || r < 0 || c >= grid.cols || r >= grid.rows) return null;
  const i = r * grid.cols + c;
  if (!frame.outline[i]) return null;
  return { land: Boolean(frame.land[i]), inlandWater: Boolean(frame.water[i]), elevationM: frame.elevation[i], coastKm: frame.coastKm[i], forest: Boolean(frame.forest[i]), relief: frame.reliefValue[i], continent: frame.continent, origin: frame.origin };
}

// ---------------------------------------------------------------- land too large for a flat frame

// A flat frame is an azimuthal-equidistant map about its centre: true along every line through the centre, stretched
// across those lines by c / sin c at an angle c from it. That is under a hundredth for Caren and Garyk (their frames
// reach 11° and 14°) and for any land of their size, but a continent that reaches 38° is stretched 8% at its edge,
// and one that reaches 85°, 49%: distances to the coast, slopes and areas worked out on such a frame would be wrong
// by as much. A continent whose flat frame would stretch more than FRAME_STRETCH_LIMIT is therefore given a grid on
// the sphere itself:
//   - latitude and longitude turned so that the continent's centre is at 0°, 0° and its length lies along the turned
//     equator (the turn that keeps it nearest that equator is found by trial), so it never meets a pole or ±180° of
//     its own grid, wherever on Eym it lies: across the real ±180°, or over a real pole;
//   - squares of SPHERE_CELL_DEG of turned latitude and longitude: 22 km north to south everywhere, and 22 km east
//     to west at the turned equator, less by the cosine of the turned latitude away from it. That narrowing is
//     known for every row and is used wherever a distance is worked out, so nothing is measured as if it were flat;
//   - the frame's own coordinates are those turned degrees in kilometres at the equator's scale (x east, y north),
//     so its grid reads like a flat frame's: only `frameToLatLon`, `frameFromLatLon` and `frameEastScale` differ.
// The same land, the same heights and the same sampler come out of it; no flat frame is changed by its existence.

/** The most a flat frame may stretch (east–west at its edge, as a fraction) before the land is put on a sphere grid. */
export const FRAME_STRETCH_LIMIT = 0.02;
/** The size of a sphere grid's squares, in degrees of its turned latitude and longitude (22.2 km). */
export const SPHERE_CELL_DEG = 0.2;
const KM_PER_DEG = EYM_RADIUS_KM * DEG;

/** How much a flat frame stretches at `radiusKm` from its centre: c / sin c − 1. */
export function frameStretch(radiusKm) { const c = radiusKm / EYM_RADIUS_KM; return c < 1e-9 ? 0 : c >= Math.PI ? Infinity : c / Math.sin(c) - 1; }

function valueNoise3(seed) {
  const rng = createRng(seed), table = Float32Array.from({ length: 4096 }, () => rng() * 2 - 1);
  const at = (i, j, k) => table[((i * 73856093) ^ (j * 19349663) ^ (k * 83492791)) & 4095];
  const smooth = (t) => t * t * (3 - 2 * t), mix = (a, b, t) => a + (b - a) * t;
  const octave = (x, y, z) => {
    const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), fx = smooth(x - i), fy = smooth(y - j), fz = smooth(z - k);
    const low = mix(mix(at(i, j, k), at(i + 1, j, k), fx), mix(at(i, j + 1, k), at(i + 1, j + 1, k), fx), fy);
    const high = mix(mix(at(i, j, k + 1), at(i + 1, j, k + 1), fx), mix(at(i, j + 1, k + 1), at(i + 1, j + 1, k + 1), fx), fy);
    return mix(low, high, fz);
  };
  return (x, y, z) => octave(x, y, z) * 0.6 + octave(x * 2.03 + 17.1, y * 2.03 - 9.4, z * 2.03 + 4.7) * 0.28 + octave(x * 4.11 - 3.3, y * 4.11 + 5.9, z * 4.11 - 11.2) * 0.12;
}

/** The three directions of a turned grid: to its centre, along its equator eastward, and to its north. */
function sphereAxes(center, turnDeg) {
  const [lat, lon] = center, p = lat * DEG, l = lon * DEG, t = turnDeg * DEG;
  const c = [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)], east = [-Math.sin(l), Math.cos(l), 0], north = [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)];
  const u = east.map((e, i) => e * Math.cos(t) + north[i] * Math.sin(t)), w = east.map((e, i) => -e * Math.sin(t) + north[i] * Math.cos(t));
  return { c, u, w };
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** A place in a turned grid's own coordinates (km at its equator's scale: x east, y north). */
function sphereLocal({ c, u, w }, lat, lon) { const v = unit([lat, lon]); return [Math.atan2(dot(v, u), dot(v, c)) / DEG * KM_PER_DEG, Math.asin(Math.max(-1, Math.min(1, dot(v, w)))) / DEG * KM_PER_DEG]; }
/** The unit vector of a place given in a turned grid's coordinates. */
function sphereVector({ c, u, w }, x, y) { const l = x / EYM_RADIUS_KM, p = y / EYM_RADIUS_KM, a = Math.cos(p) * Math.cos(l), b = Math.cos(p) * Math.sin(l), d = Math.sin(p); return [a * c[0] + b * u[0] + d * w[0], a * c[1] + b * u[1] + d * w[1], a * c[2] + b * u[2] + d * w[2]]; }
const vectorLatLon = (v) => [Math.asin(Math.max(-1, Math.min(1, v[2]))) / DEG, Math.atan2(v[1], v[0]) / DEG];

/** A frame's own coordinates (km: x east, y north) for a place, whichever kind of frame it is. */
export const frameFromLatLon = (frame, lat, lon) => (frame.sphere ? sphereLocal(frame.sphere, lat, lon) : toLocal(frame.center, lat, lon));
/** The place at a frame's own coordinates. */
export const frameToLatLon = (frame, x, y) => (frame.sphere ? vectorLatLon(sphereVector(frame.sphere, x, y)) : fromLocal(frame.center, x, y));
/** How long a kilometre of a frame's x is on the ground at height y in the frame (1 on a flat frame; on a sphere grid, the cosine of its turned latitude). */
export const frameEastScale = (frame, y) => (frame.sphere ? Math.cos(y / EYM_RADIUS_KM) : 1);

/** Distance (km) from each land square to the nearest square that is not land, on a grid whose squares narrow by `east[row]`. */
function coastDistanceOnSphere(grid, land, east) {
  const { cols, rows, cellKm } = grid, d = new Float32Array(cols * rows), big = 1e9;
  const h = Float64Array.from(east, (e) => cellKm * e), up = Float64Array.from({ length: rows }, (_, r) => (r > 0 ? Math.hypot(cellKm, (h[r] + h[r - 1]) / 2) : cellKm)), down = Float64Array.from({ length: rows }, (_, r) => (r < rows - 1 ? Math.hypot(cellKm, (h[r] + h[r + 1]) / 2) : cellKm));
  for (let i = 0; i < d.length; i += 1) d[i] = land[i] ? big : 0;
  // Twice over: with squares of unequal sides one pass each way leaves a little unsettled.
  for (let pass = 0; pass < 2; pass += 1) {
    for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c; if (!d[i]) continue;
      let v = d[i];
      v = Math.min(v, c > 0 ? d[i - 1] + h[r] : h[r]);
      if (r > 0) { v = Math.min(v, d[i - cols] + cellKm); if (c > 0) v = Math.min(v, d[i - cols - 1] + up[r]); if (c < cols - 1) v = Math.min(v, d[i - cols + 1] + up[r]); } else v = Math.min(v, cellKm);
      d[i] = v;
    }
    for (let r = rows - 1; r >= 0; r -= 1) for (let c = cols - 1; c >= 0; c -= 1) {
      const i = r * cols + c; if (!d[i]) continue;
      let v = d[i];
      v = Math.min(v, c < cols - 1 ? d[i + 1] + h[r] : h[r]);
      if (r < rows - 1) { v = Math.min(v, d[i + cols] + cellKm); if (c < cols - 1) v = Math.min(v, d[i + cols + 1] + down[r]); if (c > 0) v = Math.min(v, d[i + cols - 1] + down[r]); } else v = Math.min(v, cellKm);
      d[i] = v;
    }
  }
  return d;
}

/** The angle (radians) from a unit vector to the nearest point of the great-circle arc from a to b. */
function arcAngle(v, a, b) {
  const n = cross(a, b), length = Math.hypot(n[0], n[1], n[2]);
  if (length > 1e-12 && dot(cross(a, v), n) >= 0 && dot(cross(v, b), n) >= 0) return Math.abs(Math.asin(Math.max(-1, Math.min(1, dot(v, n) / length))));
  return Math.min(Math.acos(Math.max(-1, Math.min(1, dot(v, a)))), Math.acos(Math.max(-1, Math.min(1, dot(v, b)))));
}

/**
 * A continent on a grid of the sphere itself (see the head of this section). `rings` are its coasts in [lat, lon]
 * (they may cross ±180° or lie over a pole); `ridges` are { heightM, widthKm, points: [[lat, lon], …] }. The heights
 * follow the flat frame's rule for seeded land (a rise from the coast, ranges along the ridges, rolling upland),
 * with the noise taken in three dimensions on the sphere so that it has no direction or seam of its own.
 */
export function buildSphereFrame({ id, continent, origin, center, rings, ridges = [], cellDeg = SPHERE_CELL_DEG, seed }) {
  // The turn that keeps the land nearest the grid's equator (then the narrowest east to west).
  let best = null;
  for (let turnDeg = 0; turnDeg < 180; turnDeg += 15) {
    const axes = sphereAxes(center, turnDeg); let reachY = 0, reachX = 0;
    for (const ring of rings) for (const [lat, lon] of ring) { const [x, y] = sphereLocal(axes, lat, lon); if (Math.abs(y) > reachY) reachY = Math.abs(y); if (Math.abs(x) > reachX) reachX = Math.abs(x); }
    if (!best || reachY < best.reachY - 1e-6 || (Math.abs(reachY - best.reachY) <= 1e-6 && reachX < best.reachX)) best = { turnDeg, axes, reachY, reachX };
  }
  const { axes, turnDeg } = best;
  if (best.reachY / KM_PER_DEG > 72 || best.reachX / KM_PER_DEG > 168) throw new Error(`${id}: this land is too large for one grid on the sphere (it reaches ${Math.round(best.reachY / KM_PER_DEG)}° from its own equator and ${Math.round(best.reachX / KM_PER_DEG)}° along it)`);
  const local = rings.map((ring) => ring.map(([lat, lon]) => sphereLocal(axes, lat, lon)));
  const cellKm = cellDeg * KM_PER_DEG, margin = cellKm * 3; let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, radiusKm = 0;
  for (const ring of local) for (const [x, y] of ring) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  for (const ring of rings) for (const point of ring) { const km = greatCircleKm(center, point); if (km > radiusKm) radiusKm = km; }
  const grid = { x0: minX - margin, y0: maxY + margin, cellKm, cellDeg };
  grid.cols = Math.ceil((maxX - minX + 2 * margin) / cellKm); grid.rows = Math.ceil((maxY - minY + 2 * margin) / cellKm);
  const count = grid.cols * grid.rows, outline = fillRings(grid, local), water = new Uint8Array(count), land = Uint8Array.from(outline);
  const east = Float64Array.from({ length: grid.rows }, (_, r) => Math.cos((grid.y0 - (r + 0.5) * cellKm) / EYM_RADIUS_KM));
  const coastKm = coastDistanceOnSphere(grid, outline, east), elevation = new Float32Array(count);
  const noise = valueNoise3(`${seed}|relief|sphere`), arcs = ridges.map((ridge) => ({ ...ridge, vectors: ridge.points.map((point) => unit(point)) }));
  for (let r = 0; r < grid.rows; r += 1) for (let c = 0; c < grid.cols; c += 1) {
    const i = r * grid.cols + c; if (!outline[i]) continue;
    const v = sphereVector(axes, grid.x0 + (c + 0.5) * cellKm, grid.y0 - (r + 0.5) * cellKm), X = v[0] * EYM_RADIUS_KM, Y = v[1] * EYM_RADIUS_KM, Z = v[2] * EYM_RADIUS_KM, coast = coastKm[i];
    let e = 12 + 300 * (1 - Math.exp(-coast / 140)) * (1 + 0.5 * noise(X / 160, Y / 160, Z / 160)), ridgeM = 0;
    for (const ridge of arcs) {
      let nearest = Infinity;
      for (let k = 0; k + 1 < ridge.vectors.length; k += 1) { const angle = arcAngle(v, ridge.vectors[k], ridge.vectors[k + 1]); if (angle < nearest) nearest = angle; }
      ridgeM = Math.max(ridgeM, ridge.heightM * Math.exp(-((nearest * EYM_RADIUS_KM / ridge.widthKm) ** 2)) * Math.min(1, coast / 90) * (0.8 + 0.3 * (noise(X / 60 + 40, Y / 60, Z / 60) + 1) / 2));
    }
    e += ridgeM + 380 * Math.max(0, noise(X / 300 - 20, Y / 300 + 7, Z / 300)) * Math.min(1, coast / 200);
    elevation[i] = Math.max(1, e);
  }
  return { id, continent, origin, center, grid, outline, land, water, coastKm, elevation, forest: new Uint8Array(count), reliefValue: new Float32Array(count), radiusKm: radiusKm + margin, sphere: { ...axes, turnDeg } };
}

// ---------------------------------------------------------------- composition

function minGapKm(ringsA, ringsB, step = 4) {
  let best = Infinity;
  const a = ringsA.flatMap((ring) => ring.filter((_, i) => i % step === 0)), b = ringsB.flatMap((ring) => ring.filter((_, i) => i % step === 0));
  for (const p of a) for (const q of b) best = Math.min(best, greatCircleKm(p, q));
  return best;
}

/**
 * Build Eym's surface from the traced continents and the layout. Returns the
 * serializable surface (rings in [lat, lon]) and a sampler over it.
 */
export function buildEymSurface(traced, layout = EYM_LAYOUT, tectonics = null) {
  const rng = createRng(`${layout.seed}|shapes`), noise = valueNoise2(`${layout.seed}|relief`);
  const frames = [], continents = [], coasts = [], inlandWater = [];
  const addCoasts = (frame, ringsKm, kinds, areas) => ringsKm.forEach((ring, index) => {
    const points = toLatLonRing(frame.center, ring);
    coasts.push({ id: `${frame.id}-${kinds[index]}-${index + 1}`, continent: frame.continent, origin: frame.origin, kind: kinds[index], areaKm2: Math.round(areas[index]), points });
  });

  // Authored continents: Caren on the equator, Garyk north-north-west of it.
  const authored = {};
  for (const key of ["caren", "garyk"]) authored[key] = traced.continents[key];
  const mainland = (c) => c.coasts.find((coast) => coast.kind === "mainland").ring;
  const carenCenter = layout.caren.center;
  const carenMainLatLon = [toLatLonRing(carenCenter, mainland(authored.caren))];
  // Slide Garyk west along its latitude until the two ports are the steamer's run apart.
  const portLatLon = (continent, center, [px, py]) => fromLocal(center, (px - continent.originPx[0]) * continent.kmPerPixel, (continent.originPx[1] - py) * continent.kmPerPixel);
  const { days, knots, routeFactor } = layout.garyk.steamer;
  const portToPortKm = days * 24 * knots * 1.852 / routeFactor;
  const carenPort = portLatLon(authored.caren, carenCenter, layout.garyk.carenPortPx);
  let lo = 0, hi = 179;
  for (let iteration = 0; iteration < 50; iteration += 1) {
    const mid = (lo + hi) / 2, garykPort = portLatLon(authored.garyk, [layout.garyk.centerLat, carenCenter[1] - mid], layout.garyk.garykPortPx);
    if (greatCircleKm(carenPort, garykPort) < portToPortKm) lo = mid; else hi = mid;
  }
  const garykCenter = [layout.garyk.centerLat, round3(carenCenter[1] - hi)];
  const garykPort = portLatLon(authored.garyk, garykCenter, layout.garyk.garykPortPx);
  if (minGapKm(carenMainLatLon, [toLatLonRing(garykCenter, mainland(authored.garyk))]) < 500) throw new Error("Garyk overlaps Caren");
  for (const [key, center, peakM] of [["caren", carenCenter, 5400], ["garyk", garykCenter, 3900]]) {
    const source = authored[key];
    const frame = buildFrame({ id: key, continent: source.name, origin: "authored", center, rings: source.coasts.map((coast) => coast.ring), waterRings: source.inlandWater.flatMap((water) => water.rings), relief: source.relief, peakM, cellKm: 6, noise });
    frames.push(frame);
    addCoasts(frame, source.coasts.map((coast) => coast.ring), source.coasts.map((coast) => coast.kind), source.coasts.map((coast) => coast.areaKm2));
    for (const water of source.inlandWater) inlandWater.push({ id: water.id, continent: source.name, kind: water.kind, areaKm2: water.areaKm2, center: fromLocal(center, ...water.centerKm).map(round3), rings: water.rings.map((ring) => toLatLonRing(center, ring)) });
    continents.push({ id: key, name: source.name, origin: "authored", center: center.map(round3), mainlandAreaKm2: Math.round(ringAreaKm2(mainland(source))), islands: source.coasts.length - 1, sourceSha256: source.sourceImage.sha256 });
  }

  // Gaffa, Khohalis and Demani: from the tectonic history (data/eym/tectonics.json) when it is given, else
  // the old seeded shapes.
  for (const spec of layout.seeded) {
    const fitted = tectonics?.continents?.[spec.id];
    let rings, kinds, areas, ridges;
    if (fitted) {
      rings = fitted.rings; kinds = fitted.kinds; areas = rings.map((ring) => ringAreaKm2(ring)); ridges = fitted.ridges.map(({ heightM, widthKm, points }) => ({ heightM, widthKm, points }));
    } else {
      const shapeRng = createRng(`${layout.seed}|continent|${spec.id}`);
      const main = seededRing(shapeRng, { areaKm2: spec.areaKm2, elongation: spec.elongation, orientationDeg: spec.orientationDeg, vertices: 180, subdivisions: 3, lobes: 4 });
      rings = [main]; kinds = ["mainland"]; areas = [ringAreaKm2(main)];
      const reach = Math.max(...main.map(([x, y]) => Math.hypot(x, y)));
      for (let index = 0; index < spec.offshoreIslands; index += 1) {
        const angle = shapeRng() * Math.PI * 2, along = main[Math.floor(shapeRng() * main.length)];
        const outward = 60 + shapeRng() * 260, length = Math.hypot(...along) || 1;
        const cx = along[0] + along[0] / length * outward + Math.cos(angle) * 40, cy = along[1] + along[1] / length * outward + Math.sin(angle) * 40;
        const area = Math.exp(Math.log(150) + shapeRng() * (Math.log(22_000) - Math.log(150)));
        const island = seededRing(shapeRng, { areaKm2: area, elongation: 1 + shapeRng() * 1.6, orientationDeg: shapeRng() * 180, vertices: 20, subdivisions: 2, lobes: 1 }).map(([x, y]) => [x + cx, y + cy]);
        rings.push(island); kinds.push("island"); areas.push(ringAreaKm2(island));
      }
      ridges = spec.ridges.map((heightM, index) => {
        // Ranges run roughly along the continent; a second range lies parallel to one side.
        const axis = (spec.orientationDeg + shapeRng() * 24 - 12) * DEG, span = reach * (index ? 0.4 : 0.62);
        const offset = index ? (shapeRng() < 0.5 ? -1 : 1) * reach * (0.28 + shapeRng() * 0.12) : (shapeRng() - 0.5) * reach * 0.2;
        const points = Array.from({ length: 6 }, (_, k) => { const t = -1 + 2 * k / 5, wobble = (shapeRng() - 0.5) * reach * 0.12; return [Math.cos(axis) * span * t - Math.sin(axis) * (offset + wobble), Math.sin(axis) * span * t + Math.cos(axis) * (offset + wobble)]; });
        return { heightM, widthKm: 70 + shapeRng() * 50, points };
      });
    }
    // A continent a flat frame would stretch too far goes on a grid of the sphere, its areas taken on the sphere too.
    let reachKm = 0; for (const ring of rings) for (const [x, y] of ring) reachKm = Math.max(reachKm, Math.hypot(x, y));
    const large = frameStretch(reachKm) > FRAME_STRETCH_LIMIT;
    if (large) areas = rings.map((ring) => sphericalRingAreaKm2(toLatLonRing(spec.center, ring)));
    const frame = large
      ? buildSphereFrame({ id: spec.id, continent: spec.name, origin: "seeded", center: spec.center, rings: rings.map((ring) => toLatLonRing(spec.center, ring)), ridges: ridges.map((ridge) => ({ ...ridge, points: ridge.points.map(([x, y]) => fromLocal(spec.center, x, y)) })), seed: layout.seed })
      : buildFrame({ id: spec.id, continent: spec.name, origin: "seeded", center: spec.center, rings, ridges, cellKm: 10, noise });
    frames.push(frame); addCoasts(frame, rings, kinds, areas);
    continents.push({ id: spec.id, name: spec.name, origin: "seeded", center: spec.center, mainlandAreaKm2: Math.round(areas[0]), islands: rings.length - 1 });
  }

  // Seeded archipelagos in the open ocean.
  const archRng = createRng(`${layout.seed}|archipelagos`), clusterCenters = [];
  if (layout.archipelagos.centers) {
    for (let k = 0; k < layout.archipelagos.placementDraws; k += 1) archRng();
    clusterCenters.push(...layout.archipelagos.centers.map((c) => c.slice()));
  } else {
    const allCoastPoints = () => coasts.flatMap((coast) => coast.points.filter((_, i) => i % 6 === 0));
    let attempts = 0;
    while (clusterCenters.length < layout.archipelagos.count && attempts++ < 4000) {
      const lat = Math.asin(archRng() * 2 - 1) / DEG, lon = archRng() * 360 - 180;
      if (Math.abs(lat) > 66) continue;
      const candidate = [lat, lon];
      if (clusterCenters.some((other) => greatCircleKm(other, candidate) < 2400)) continue;
      if (allCoastPoints().some((point) => greatCircleKm(point, candidate) < layout.archipelagos.minCoastClearanceKm + layout.archipelagos.spreadKm)) continue;
      clusterCenters.push(candidate.map(round3));
    }
  }
  clusterCenters.forEach((center, clusterIndex) => {
    const [minCount, maxCount] = layout.archipelagos.islands, count = minCount + Math.floor(archRng() * (maxCount - minCount + 1));
    const rings = [], kinds = [], areas = [], placed = [];
    for (let index = 0; index < count * 4 && rings.length < count; index += 1) {
      const area = Math.exp(Math.log(layout.archipelagos.areaKm2[0]) + archRng() ** 1.8 * (Math.log(layout.archipelagos.areaKm2[1]) - Math.log(layout.archipelagos.areaKm2[0])));
      const radius = Math.sqrt(area / Math.PI) * 1.5, angle = archRng() * Math.PI * 2, distance = Math.sqrt(archRng()) * layout.archipelagos.spreadKm;
      const cx = Math.cos(angle) * distance, cy = Math.sin(angle) * distance;
      if (placed.some((p) => Math.hypot(p.x - cx, p.y - cy) < p.r + radius + 15)) continue;
      placed.push({ x: cx, y: cy, r: radius });
      const ring = seededRing(archRng, { areaKm2: area, elongation: 1 + archRng() * 2, orientationDeg: archRng() * 180, vertices: 18, subdivisions: 2, lobes: 1 }).map(([x, y]) => [x + cx, y + cy]);
      rings.push(ring); kinds.push("island"); areas.push(ringAreaKm2(ring));
    }
    const frame = buildFrame({ id: `archipelago-${clusterIndex + 1}`, continent: null, origin: "seeded", center, rings, cellKm: 4, noise });
    frames.push(frame); addCoasts(frame, rings, kinds, areas);
  });

  const landAreaKm2 = coasts.reduce((sum, coast) => sum + coast.areaKm2, 0) - inlandWater.reduce((sum, water) => sum + water.areaKm2, 0);
  const surfaceKm2 = 4 * Math.PI * EYM_RADIUS_KM ** 2;
  const surface = {
    schemaVersion: 1, modelVersion: EYM_SURFACE_MODEL, seed: layout.seed, radiusKm: EYM_RADIUS_KM,
    layout: { caren: layout.caren, garyk: { ...layout.garyk, center: garykCenter, carenPort: carenPort.map(round3), garykPort: garykPort.map(round3), portToPortKm: Math.round(portToPortKm), bearingFromCarenDeg: Number(((Math.atan2(...toLocal(carenCenter, ...garykCenter)) * 180 / Math.PI + 360) % 360).toFixed(1)) }, seeded: layout.seeded.map(({ id, name, areaKm2, center }) => ({ id, name, areaKm2: Math.round(areaKm2), center })), archipelagoCenters: clusterCenters },
    landAreaKm2: Math.round(landAreaKm2), landFraction: Number((landAreaKm2 / surfaceKm2).toFixed(5)),
    continents, coasts, inlandWater,
  };
  return { surface, sampler: makeSampler(frames), frames };
}

export function makeSampler(frames) {
  const units = frames.map((frame) => ({ frame, cosLimit: Math.cos(frame.radiusKm / EYM_RADIUS_KM), v: unit(frame.center) }));
  return function sample(lat, lon) {
    const v = unit([lat, lon]);
    for (const { frame, cosLimit, v: c } of units) {
      if (v[0] * c[0] + v[1] * c[1] + v[2] * c[2] < cosLimit) continue;
      const hit = sampleFrame(frame, lat, lon);
      if (hit) return hit;
    }
    return null;
  };
}

function unit([lat, lon]) { const p = lat * DEG, l = lon * DEG; return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)]; }
