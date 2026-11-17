// Eym's plate tectonics and deep history, drawn by rule (Stage 1 of the physical history and climate programme).
//
// Plates are a noise-warped Voronoi of seed points on the sphere, each turning about its own pole. The three
// seeded continents (Gaffa, Khohalis and Demani) are pieces of an old supercontinent, the First Land: it is
// laid out around Garyk (which was part of it), cut along noise-warped rifts, and each piece is turned to where
// its continent stands today, so the pieces' rifted edges still fit one another and Garyk's coast. Leading edges
// gather accreted terranes, coastal ranges and island arcs; old sutures inside each piece are the inland ranges.
// Caren is not part of any of this: the gods set it down whole, so it is masked out (its plate is all sea floor
// around it), and its geology is stated in CAREN_GEOLOGY.
//
// Pure and deterministic. Nothing here reads files; tools/generate-eym-tectonics.mjs runs the fit and writes
// data/eym/tectonics.json, which scripts/eym-surface.mjs and scripts/eym-cartography.mjs read.

import { createRng, seedToUint32 } from "./planet-geography.mjs";

export const EYM_TECTONICS_MODEL = "eym-tectonics-v1";
const R_KM = 6371, DEG = Math.PI / 180, MYR_BREAKUP = 210;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- vectors on the unit sphere

export const vec = ([lat, lon]) => { const p = lat * DEG, l = lon * DEG; return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)]; };
export const latLon = (v) => [Math.asin(clamp(v[2], -1, 1)) / DEG, Math.atan2(v[1], v[0]) / DEG];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
/** Great-circle distance in km between unit vectors. */
export const arcKm = (a, b) => Math.acos(clamp(dot(a, b), -1, 1)) * R_KM;
/** Turn v about the unit axis by angle (radians), Rodrigues. */
export function rotate(v, axis, angle) {
  const c = Math.cos(angle), s = Math.sin(angle), k = axis, d = dot(k, v), x = cross(k, v);
  return [v[0] * c + x[0] * s + k[0] * d * (1 - c), v[1] * c + x[1] * s + k[1] * d * (1 - c), v[2] * c + x[2] * s + k[2] * d * (1 - c)];
}
/** The rotation that takes a to b along the great circle between them. */
export function rotationBetween(a, b) {
  const axis = cross(a, b), l = Math.hypot(...axis);
  return l < 1e-12 ? { axis: [0, 0, 1], angle: 0 } : { axis: axis.map((x) => x / l), angle: Math.atan2(l, dot(a, b)) };
}
/** The point `km` from p towards bearing (degrees from north). */
function destination(p, bearingDeg, km) {
  const [lat, lon] = latLon(p), d = km / R_KM, b = bearingDeg * DEG, la = lat * DEG;
  const lat2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lon2 = lon * DEG + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(lat2));
  return vec([lat2 / DEG, lon2 / DEG]);
}

// ---------------------------------------------------------------- noise

/** Smooth three-dimensional value noise (-1..1) from a named seed. */
export function makeNoise(seed) {
  const s = seedToUint32(seed);
  const hash = (x, y, z) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177) ^ s; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296 * 2 - 1; };
  const n = (x, y, z) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z), fx = x - x0, fy = y - y0, fz = z - z0;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz), h = (a, b, c) => hash(x0 + a, y0 + b, z0 + c);
    const lo = (h(0, 0, 0) * (1 - u) + h(1, 0, 0) * u) * (1 - v) + (h(0, 1, 0) * (1 - u) + h(1, 1, 0) * u) * v;
    const hi = (h(0, 0, 1) * (1 - u) + h(1, 0, 1) * u) * (1 - v) + (h(0, 1, 1) * (1 - u) + h(1, 1, 1) * u) * v;
    return lo * (1 - w) + hi * w;
  };
  /** Fractal noise of a unit vector: `freq` cycles across the sphere's radius, `octaves` halvings. */
  return (p, freq, octaves = 4, offset = 0) => { let sum = 0, amp = 1, total = 0, f = freq; for (let o = 0; o < octaves; o += 1) { sum += amp * n(p[0] * f + offset + o * 17.3, p[1] * f - offset, p[2] * f + o * 5.1); total += amp; amp *= 0.5; f *= 2.03; } return sum / total; };
}

// ---------------------------------------------------------------- plates

/**
 * The plates: seed points (with a weight in km that makes a plate larger) and a warp so the boundaries wander.
 * Each plate turns about `pole` at `rate` degrees per million years.
 */
export function plateAt(plates, warp, p, except = -1) {
  const w = [warp(p, 1.7, 5, 1.3), warp(p, 1.7, 5, 7.9), warp(p, 1.7, 5, 13.1)], q = norm(add(p, w, 0.16));
  let best = -1, bestD = Infinity;
  for (let i = 0; i < plates.length; i += 1) { if (i === except) continue; const d = arcKm(q, plates[i].v) - plates[i].weightKm; if (d < bestD) { bestD = d; best = i; } }
  return best;
}
/** A plate's surface velocity at p, in mm a year (km per million years), as a tangent vector. */
export function plateVelocity(plate, p) { const w = vec(plate.pole).map((x) => x * plate.rate * DEG * R_KM); return cross(w, p); }

/** Classify the relative motion across a boundary between plates a and b at p (normal points from a to b). */
export function classifyBoundary(a, b, p, normal) {
  const rel = add(plateVelocity(a, p), plateVelocity(b, p), -1), speed = Math.hypot(...rel), closing = dot(rel, normal);
  const type = Math.abs(closing) < 0.5 * speed ? "transform" : closing > 0 ? "convergent" : "divergent";
  return { type, rateMmYr: Math.round(speed * 10) / 10, closingMmYr: Math.round(closing * 10) / 10 };
}

// ---------------------------------------------------------------- the First Land and its pieces

/** Distance (km, signed: + inside) from p to a closed ring of unit vectors, by the nearest of its points. */
function signedRingKm(ring, p, inside) {
  let best = Infinity; for (const q of ring) { const d = arcKm(p, q); if (d < best) best = d; }
  return inside(p) ? best : -best;
}
/** Point-in-ring test on the sphere for a ring around `center` (gnomonic projection about it). */
function ringContains(ringV, center) {
  const e = norm(cross([0, 0, 1], center).every((x) => Math.abs(x) < 1e-9) ? [1, 0, 0] : cross([0, 0, 1], center)), n = cross(center, e);
  const proj = (v) => { const d = dot(v, center); return [dot(v, e) / d, dot(v, n) / d]; };
  const pts = ringV.map(proj);
  return (p) => {
    if (dot(p, center) <= 0.05) return false; const [x, y] = proj(p); let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; }
    return inside;
  };
}

/**
 * Lay out the First Land for one seed: Garyk at its middle (turned back to where it stood), the pieces of Gaffa,
 * Khohalis and Demani around it, the rotations that carry each piece to today, and the plates.
 * `garyk` is { center, ring: [[lat, lon]], range: [[lat, lon]] (its high ground) }; `caren` is { center, ring };
 * `targets` are the seeded continents { id, center, areaKm2 }.
 */
export function layoutFirstLand({ seed, garyk, caren, targets }) {
  const rng = createRng(`${seed}|first-land`), noise = makeNoise(`${seed}|first-land-noise`);
  const S = norm(add(vec(garyk.center), [rng() - 0.5, rng() - 0.5, rng() - 0.5], 0.9));
  // Garyk sat at the First Land's heart; its rotation to today is the one carrying S to its centre, with a twist.
  const gNow = vec(garyk.center), gRot = rotationBetween(S, gNow), twist = (rng() - 0.5) * 60 * DEG;
  const toNowGaryk = (v) => rotate(rotate(v, S, twist), gRot.axis, gRot.angle), toThenGaryk = (v) => rotate(rotate(v, gRot.axis, -gRot.angle), S, -twist);
  const garykThen = garyk.ring.map((ll) => toThenGaryk(vec(ll)));
  const garykInside = ringContains(garykThen, S);
  // The pieces sit around Garyk, each its own radius plus Garyk's away, in seeded directions spread round.
  const start = rng() * 360, rG = Math.sqrt(1.22e6 / Math.PI);
  const pieces = targets.map((t, i) => {
    const r = Math.sqrt(t.areaKm2 / Math.PI), bearing = start + i * (360 / targets.length) + (rng() - 0.5) * 50;
    const then = destination(S, bearing, (rG + r) * (0.86 + rng() * 0.12));
    // Each piece is longer one way than the other, in a seeded direction.
    const elong = 1.6 + rng() * 1.2, axisDeg = rng() * 180;
    return { id: t.id, target: t, r, then, bearing, elong, axisDeg };
  });
  /** Distance from a piece's old centre, stretched along its long axis (km). */
  const stretched = (p, pc) => {
    const d = arcKm(p, pc.then); if (d < 1) return d;
    const north = norm(add([0, 0, 1], pc.then, -pc.then[2])), east = norm(cross(north, pc.then)), t = norm(add(p, pc.then, -dot(p, pc.then)));
    const ang = Math.atan2(dot(t, east), dot(t, north)) - pc.axisDeg * DEG, k = Math.sqrt(pc.elong);
    return d * Math.hypot(Math.cos(ang) / k, Math.sin(ang) * k);
  };
  const blobR = (p) => Math.max(rG * 1.05 - arcKm(p, S), ...pieces.map((pc) => pc.r * 1.2 - stretched(p, pc)));
  const rift = (p) => noise(p, 9, 5, 3.3) * 260;
  // The land's own grain: a domain-warped fractal at a few hundred kilometres, so coasts get peninsulas and bays.
  const shape = (p) => {
    const w = [noise(p, 6, 3, 51.2), noise(p, 6, 3, 57.9), noise(p, 6, 3, 63.4)], q = norm(add(p, w, 0.07));
    // Drowned basins: where the old crust sagged, the sea came in as gulfs and inland seas.
    const basin = noise(q, 11, 4, 91.3), drowned = basin > 0.22 ? (basin - 0.22) * 1600 : 0;
    return noise(q, 8, 5, 71.1) * 520 + noise(q, 20, 4, 77.7) * 170 + noise(q, 55, 3, 83.9) * 60 - drowned;
  };
  /** How deep inside piece k's share of the First Land p lies (km; + inside), before Garyk is cut away. */
  const pieceField = (k, p) => {
    const dk = arcKm(p, pieces[k].then) + rift(p);
    let cell = Infinity; for (let j = 0; j < pieces.length; j += 1) if (j !== k) cell = Math.min(cell, (arcKm(p, pieces[j].then) + rift(add(p, [0.01 * j, 0, 0])) - dk) / 2);
    return Math.min(blobR(p) + shape(p), cell - 40, garyNear(p) - 60);
  };
  // Distance from Garyk's old coast, for the rift between it and the pieces (a coarse sample of its ring).
  const garySample = garykThen.filter((_, i) => i % Math.max(1, Math.floor(garykThen.length / 400)) === 0);
  const garyNear = (p) => { if (garykInside(p)) return -1; let best = Infinity; for (const q of garySample) best = Math.min(best, arcKm(p, q)); return best; };
  return { S, twist, gRot, toNowGaryk, toThenGaryk, garykThen, pieces, pieceField, noise, rng };
}

/**
 * The present-day crust field of piece k (km; + is land), at p today: its share of the First Land turned to
 * today, then accretion and a coastal range on its leading edge, an island arc offshore, smoother rifted edges,
 * and fjords where it is cold.
 */
export function presentCrust(first, k, back, plate, p) {
  const pc = first.pieces[k], q = back(p), base = first.pieceField(k, q), noise = first.noise;
  const c = vec(pc.target.center), out = norm(add(p, c, -dot(p, c))), v = plateVelocity(plate, p), sp = Math.hypot(...v) || 1;
  const lead = Math.max(0, dot(out, v) / sp);
  let f = base + 70 * lead * Math.exp(-((base / 140) ** 2));
  // Island arc: a broken chain 180–320 km off the leading coast.
  const arcBand = Math.exp(-(((base + 250) / 55) ** 2)) * lead, bits = noise(p, 38, 3, 21.4);
  if (arcBand > 0.2 && bits > 0.28) f = Math.max(f, (bits - 0.28) * 600 * arcBand - 5);
  // Rough coasts where the plate leads and where it is cold; smooth where it rifted.
  const lat = Math.abs(latLon(p)[0]), cold = smooth(44, 58, lat), near = Math.exp(-((base / 80) ** 2));
  f += near * noise(p, 22, 3, 31.7) * 30 * (0.3 + lead);
  // Rifted coasts are smooth at the scale of the shelf, not of the map: bays, estuaries and headlands
  // 100-200 km across, so no long stretch of coast reads as one clean curve.
  f += near * noise(p, 12, 3, 61.9) * 85 * (1 - 0.5 * lead);
  // Fjords: where ice once reached the sea, narrow drowned valleys cut far into the coast.
  if (cold > 0) { const ridge = 1 - Math.abs(noise(p, 70, 3, 44.2)) * 2.2; f -= cold * Math.exp(-((Math.max(0, base) / 140) ** 2)) * Math.max(0, ridge) ** 3 * 220; }
  return f;
}

// ---------------------------------------------------------------- Caren's stated geology (lore)

/** Caren was set down whole by the gods: its rock is stated, not simulated. */
export const CAREN_GEOLOGY = Object.freeze({
  summary: "Caren is the Godstone: a single block laid down by the gods and their angels, not raised by the turning of the plates. It has no fault, no volcano and no rift, and it does not drift with the plate it rests on.",
  rocks: [
    { where: "highlands and spine", rock: "white granite (godstone)", note: "fine, even, almost without seams; it does not weather into tors" },
    { where: "foothills", rock: "marble", note: "banded white and grey; the classic building stone" },
    { where: "lowlands and plains", rock: "limestone over godstone", note: "thin, fertile, with springs where it meets the granite" },
    { where: "coasts", rock: "limestone and sand", note: "even coasts with few cliffs" },
  ],
  earthquakes: "none: the Godstone does not move; tremors from the sea floor around it are felt only faintly on its coasts",
});
