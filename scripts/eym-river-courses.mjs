// Eym's rivers as courses. On Caren and Garyk the traced source maps drew every river as a channel of open
// water 5 to 40 km wide (a "river-channel" in the hydrology). Seen from the Region layer down, that is a
// strait, not a river. Here each channel becomes the river that ran down it: a course along the middle of
// the channel, from source to mouth and through every fork, with
//   - a width from 60 m to 3 km: the main stem (the channel's broadest run) grows with the square of the
//     old channel's half-width (a 3 km half-width gives 225 m, 7 km gives 1.2 km, 11 km or more the full 3 km:
//     the great rivers are a few kilometres wide, canon of 20 November 2026), and every other run narrows with
//     the square of its half-width's share of the stem's,
//   - a tidal estuary on a great river: its lowest reach to the sea is a course of its own, several times as wide,
//   - meanders at two scales (bends of 10 to 60 km, loops of about fourteen widths), each with its own
//     irregular rhythm, kept inside the old channel,
//   - every town that stood on the old channel's bank kept on the river, the course drawn to pass half a
//     kilometre beside it.
// The old channel becomes land again. Everything is keyed to the channel and the world, so the same data
// always gives the same rivers. Pure: no canvas, no storage, nothing read but the arguments.

import { fromLocal, toLocal } from "./eym-surface.mjs";
import { WORLD_INPUTS } from "./eym-world-inputs.mjs";

export const RIVER_COURSES_MODEL = "eym-river-courses-v1";
const GRID_KM = 0.5, STEP_KM = 0.25, RIVERS = WORLD_INPUTS.caren.rivers;
/** The widest a channel's river may be (km): Caren's great rivers are a few kilometres wide (its canon); elsewhere 1.2 km, as before. */
const maxKm = (water) => (water.continent === "Caren" ? RIVERS.channelMaxKm : 1.2);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------------------------------------------------------------- primitives

// FNV-1a with a final avalanche, as in eym-local-detail.mjs (kept here so the two modules do not import each other).
const hashUnit = (text) => {
  let h = 2166136261; for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

/** Smooth keyed noise along a line, in −0.5…0.5, one new value per unit of `t`. */
const lineNoise = (key, t) => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return (1 - u) * hashUnit(`${key}|${i}`) + u * hashUnit(`${key}|${i + 1}`) - 0.5; };

/** Distance from (x, y) to the segment a–b. */
const segmentDistance = ([ax, ay], [bx, by], x, y) => {
  const dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
};

// ---------------------------------------------------------------- the channel on a grid

/** The channel's rings filled onto a grid of GRID_KM squares (1 = water). */
function rasterize(rings, x0, y0, w, h) {
  const mask = new Uint8Array(w * h), cuts = [];
  for (let r = 0; r < h; r += 1) {
    const y = y0 + (r + 0.5) * GRID_KM; cuts.length = 0;
    for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xa, ya] = ring[i], [xb, yb] = ring[j]; if ((ya > y) !== (yb > y)) cuts.push(xa + (y - ya) / (yb - ya) * (xb - xa)); }
    cuts.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cuts.length; k += 2) { const c0 = Math.max(0, Math.ceil((cuts[k] - x0) / GRID_KM - 0.5)), c1 = Math.min(w - 1, Math.floor((cuts[k + 1] - x0) / GRID_KM - 0.5)); for (let c = c0; c <= c1; c += 1) mask[r * w + c] = 1; }
  }
  return mask;
}

/** Distance (in squares) from each water square to the nearest bank: a two-pass chamfer. */
function bankDistance(mask, w, h) {
  const d = new Float32Array(w * h); for (let i = 0; i < w * h; i += 1) d[i] = mask[i] ? 1e9 : 0;
  const at = (c, r) => (c < 0 || r < 0 || c >= w || r >= h) ? 0 : d[r * w + c];
  for (let r = 0; r < h; r += 1) for (let c = 0; c < w; c += 1) { const i = r * w + c; if (mask[i]) d[i] = Math.min(d[i], at(c - 1, r) + 1, at(c, r - 1) + 1, at(c - 1, r - 1) + Math.SQRT2, at(c + 1, r - 1) + Math.SQRT2); }
  for (let r = h - 1; r >= 0; r -= 1) for (let c = w - 1; c >= 0; c -= 1) { const i = r * w + c; if (mask[i]) d[i] = Math.min(d[i], at(c + 1, r) + 1, at(c, r + 1) + 1, at(c + 1, r + 1) + Math.SQRT2, at(c - 1, r + 1) + Math.SQRT2); }
  return d;
}

/** The channel's middle line, one square wide (Zhang–Suen thinning). */
function middleLine(mask, w, h) {
  const s = Uint8Array.from(mask), gone = [], P = (c, r) => (c < 0 || r < 0 || c >= w || r >= h) ? 0 : s[r * w + c];
  for (let changed = true; changed;) {
    changed = false;
    for (const step of [0, 1]) {
      gone.length = 0;
      for (let r = 0; r < h; r += 1) for (let c = 0; c < w; c += 1) {
        if (!s[r * w + c]) continue;
        const p = [P(c, r - 1), P(c + 1, r - 1), P(c + 1, r), P(c + 1, r + 1), P(c, r + 1), P(c - 1, r + 1), P(c - 1, r), P(c - 1, r - 1)], B = p[0] + p[1] + p[2] + p[3] + p[4] + p[5] + p[6] + p[7];
        if (B < 2 || B > 6) continue;
        let A = 0; for (let k = 0; k < 8; k += 1) if (!p[k] && p[(k + 1) % 8]) A += 1;
        if (A !== 1 || (step === 0 ? (p[0] * p[2] * p[4] || p[2] * p[4] * p[6]) : (p[0] * p[2] * p[6] || p[0] * p[4] * p[6]))) continue;
        gone.push(r * w + c);
      }
      for (const i of gone) s[i] = 0; if (gone.length) changed = true;
    }
  }
  return s;
}

/** The middle line as runs of squares between its ends and forks (a diagonal step is no fork where an orthogonal square already joins the two). */
function runs(s, w, h) {
  const STEPS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]], on = (c, r) => c >= 0 && r >= 0 && c < w && r < h && s[r * w + c] === 1;
  const next = (i) => { const c = i % w, r = (i / w) | 0, out = []; for (const [dc, dr] of STEPS) { const cc = c + dc, rr = r + dr; if (!on(cc, rr) || (dc && dr && (on(c + dc, r) || on(c, r + dr)))) continue; out.push(rr * w + cc); } return out; };
  const degree = new Map(); for (let i = 0; i < w * h; i += 1) if (s[i]) degree.set(i, next(i).length);
  const isNode = (i) => degree.get(i) !== 2, walked = new Set(), key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`), lines = [];
  const walk = (start, first) => {
    const line = [start]; let prev = start, cur = first; walked.add(key(prev, cur));
    for (;;) { line.push(cur); if (isNode(cur)) break; const on2 = next(cur).filter((k) => k !== prev && !walked.has(key(cur, k))); if (!on2.length) break; prev = cur; cur = on2[0]; walked.add(key(prev, cur)); }
    return line;
  };
  for (const [i] of degree) if (isNode(i)) for (const k of next(i)) if (!walked.has(key(i, k))) lines.push(walk(i, k));
  for (const [i] of degree) for (const k of next(i)) if (!walked.has(key(i, k))) lines.push(walk(i, k)); // closed loops
  return { lines, degree };
}

// ---------------------------------------------------------------- one run to a river

/** Smooth a run's grid steps away and resample it every STEP_KM: points [x, y, half-width of the old channel in km]. */
function resample(points) {
  let pts = points;
  for (let t = 0; t < 6; t += 1) pts = pts.map((p, k) => k === 0 || k === pts.length - 1 ? p : [(pts[k - 1][0] + 2 * p[0] + pts[k + 1][0]) / 4, (pts[k - 1][1] + 2 * p[1] + pts[k + 1][1]) / 4, (pts[k - 1][2] + 2 * p[2] + pts[k + 1][2]) / 4]);
  const out = [pts[0]]; let carry = 0;
  for (let k = 1; k < pts.length; k += 1) {
    const a = pts[k - 1], b = pts[k], L = Math.hypot(b[0] - a[0], b[1] - a[1]); let t = STEP_KM - carry;
    for (; t <= L; t += STEP_KM) { const f = t / L; out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]); }
    carry = L - (t - STEP_KM);
  }
  return out;
}

/** Towns that keep the river: within 10 km of the old channel's bank and within 12 km of the old half-width from this run. */
function bankTowns(rs, rings, towns) {
  const pulls = [];
  for (const [sx, sy] of towns) {
    let best = Infinity, bk = -1;
    for (let k = 0; k < rs.length; k += 4) { const d = Math.hypot(rs[k][0] - sx, rs[k][1] - sy); if (d < best) { best = d; bk = k; } }
    for (let k = Math.max(0, bk - 4); k <= Math.min(rs.length - 1, bk + 4); k += 1) { const d = Math.hypot(rs[k][0] - sx, rs[k][1] - sy); if (d < best) { best = d; bk = k; } }
    if (bk < 0 || best > rs[bk][2] + 12) continue;
    let edge = Infinity; for (const ring of rings) for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) edge = Math.min(edge, segmentDistance(ring[j], ring[i], sx, sy));
    if (edge <= 10 || best <= rs[bk][2]) pulls.push({ k: bk, sx, sy, sigma: Math.max(3, best * 0.9) });
  }
  return pulls;
}

/** The river down one run: meanders at two scales, drawn beside its bank towns. */
function meander(rs, key, widthKm, meanHalf, pulls) {
  const loop = clamp(widthKm * 14, 2.5, 20), bend = clamp(meanHalf * 5, 10, 60), lengthKm = (rs.length - 1) * STEP_KM, out = [];
  let along = 0, phaseBend = hashUnit(`${key}|bend`) * 2 * Math.PI, phaseLoop = hashUnit(`${key}|loop`) * 2 * Math.PI;
  for (let k = 0; k < rs.length; k += 1) {
    const a = rs[Math.max(0, k - 2)], b = rs[Math.min(rs.length - 1, k + 2)], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, nx = -(b[1] - a[1]) / tl, ny = (b[0] - a[0]) / tl;
    if (k) {
      along += STEP_KM;
      phaseBend += (2 * Math.PI / bend) * STEP_KM * (1 + 1.2 * lineNoise(`${key}|bend-rhythm`, along / bend));
      phaseLoop += (2 * Math.PI / loop) * STEP_KM * (1 + 1.6 * lineNoise(`${key}|loop-rhythm`, along / loop));
    }
    const ends = clamp(Math.min(along, lengthKm - along) / loop, 0, 1), room = Math.max(0, rs[k][2] - widthKm);
    const swingBend = Math.min(room * 0.6, bend * 0.25) * Math.sin(phaseBend), swingLoop = Math.min(loop * 0.32, room + 1) * (0.55 + 0.9 * lineNoise(`${key}|loop-size`, along / (2 * loop))) * Math.sin(phaseLoop);
    let off = (swingBend + swingLoop) * ends;
    for (const pull of pulls) {
      const g = Math.exp(-(((k - pull.k) * STEP_KM) ** 2) / (2 * pull.sigma * pull.sigma)); if (g < 0.01) continue;
      const side = (pull.sx - rs[pull.k][0]) * nx + (pull.sy - rs[pull.k][1]) * ny, want = side - Math.sign(side || 1) * (0.5 + widthKm / 2);
      off = off * (1 - g) + want * g;
    }
    off *= clamp(Math.min(along, lengthKm - along) / 2, 0, 1); // the ends stay put, so runs meet at their forks
    out.push([rs[k][0] + nx * off, rs[k][1] + ny * off]);
  }
  return unfold(out, rs);
}

/**
 * Where a course is drawn far aside on a tight curve of the old channel, the shifted line can fold back on
 * itself. Keep only points that move on down the channel, then smooth what is left.
 */
function unfold(course, rs) {
  let kept = [course[0]];
  for (let k = 1; k < course.length; k += 1) {
    const a = rs[Math.max(0, k - 2)], b = rs[Math.min(rs.length - 1, k + 2)], last = kept[kept.length - 1];
    const ahead = (course[k][0] - last[0]) * (b[0] - a[0]) + (course[k][1] - last[1]) * (b[1] - a[1]);
    if (ahead > 0 || k === course.length - 1) kept.push(course[k]);
  }
  for (let t = 0; t < 4; t += 1) kept = kept.map((p, k) => k === 0 || k === kept.length - 1 ? p : [(kept[k - 1][0] + 2 * p[0] + kept[k + 1][0]) / 4, (kept[k - 1][1] + 2 * p[1] + kept[k + 1][1]) / 4]);
  return kept;
}

// ---------------------------------------------------------------- composition

/**
 * The rivers that ran down one channel: [{ id, channel, widthM, points: [[lat, lon], …] }], one to each
 * run of the channel's middle line between its ends and forks. `towns` are [lat, lon] pairs.
 */
export function channelCourses(water, towns = []) {
  const ring = water.polygon; let la = 0, lo = 0; for (const [a, b] of ring) { la += a; lo += b; }
  const center = [la / ring.length, lo / ring.length], rings = [ring, ...(water.islands ?? [])].map((r) => r.map(([a, b]) => toLocal(center, a, b)));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity; for (const [x, y] of rings[0]) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  const x0 = minX - 2 * GRID_KM, y0 = minY - 2 * GRID_KM, w = Math.ceil((maxX - minX) / GRID_KM) + 4, h = Math.ceil((maxY - minY) / GRID_KM) + 4;
  const mask = rasterize(rings, x0, y0, w, h), half = bankDistance(mask, w, h), { lines, degree } = runs(middleLine(mask, w, h), w, h);
  const localTowns = towns.map(([a, b]) => toLocal(center, a, b)).filter(([x, y]) => x > minX - 30 && x < maxX + 30 && y > minY - 30 && y < maxY + 30), out = [];
  const kept = [];
  for (const line of lines) {
    const halfKm = line.map((i) => half[i] * GRID_KM), meanHalf = halfKm.reduce((a, b) => a + b, 0) / halfKm.length, lengthKm = line.length * GRID_KM * 1.1;
    // a short run with a free end is the thinning's answer to a bulge in the bank, not a river
    if (lines.length > 1 && (degree.get(line[0]) === 1 || degree.get(line[line.length - 1]) === 1) && lengthKm < Math.max(8, 5 * meanHalf)) continue;
    kept.push({ line, halfKm, meanHalf });
  }
  // The broadest run is the main stem, as wide as its channel allows; the others narrow with the square of their share of it.
  const stemHalf = Math.max(...kept.map((r) => r.meanHalf)), MAX_KM = maxKm(water), stemKm = clamp(0.025 * stemHalf * stemHalf, 0.06, MAX_KM);
  for (const { line, halfKm, meanHalf } of kept) {
    const rs = resample(line.map((i, k) => [x0 + ((i % w) + 0.5) * GRID_KM, y0 + (((i / w) | 0) + 0.5) * GRID_KM, halfKm[k]]));
    if (rs.length < 2) continue;
    const widthKm = clamp(stemKm * (meanHalf / stemHalf) ** 2, 0.06, MAX_KM), key = `${water.id}|${line[0]}`;
    const course = meander(rs, key, widthKm, meanHalf, bankTowns(rs, rings, localTowns));
    out.push({ id: `${water.id}-${out.length + 1}`, channel: water.id, widthM: Math.round(widthKm * 1000), points: course.filter((_, k) => k % 2 === 0 || k === course.length - 1).map(([x, y]) => fromLocal(center, x, y).map((v) => Math.round(v * 1e5) / 1e5)) });
  }
  return out;
}

const cache = new WeakMap();

/**
 * A great river's tidal estuary (canon of 20 November 2026). A channel whose main stem is at least `estuaryFromM`
 * wide is a great river: of its courses, the one that ends nearest the sea (within 40 km of it: a course runs down
 * the middle of its old channel and stops short of the coast by about the channel's half-width) has its lowest
 * `estuaryKm` made a course of their own (`tidal: true`, its id ending "-estuary"), `estuaryWidens` times as wide
 * as the main stem (no wider than `estuaryMaxKm`), the two meeting end to end. Other channels are returned as they are.
 */
function withEstuary(courses, asset) {
  const stemM = Math.max(...courses.map((c) => c.widthM)); if (stemM < RIVERS.estuaryFromM) return courses;
  const km = ([a, b], [c, d]) => Math.hypot((a - c) * 111.2, (b - d) * 111.2 * Math.cos(a * Math.PI / 180));
  const seaKm = (p) => { let best = Infinity; for (const line of asset.terrain.coastlines) for (let i = 0; i < line.points.length; i += 2) { const q = line.points[i]; if (Math.abs(q[0] - p[0]) > 0.45 || Math.abs(q[1] - p[1]) > 0.45) continue; const d = km(p, q); if (d < best) best = d; } return best; };
  let lowest = null; for (const course of courses) { if (course.points.length < 4) continue; const first = seaKm(course.points[0]), last = seaKm(course.points.at(-1)), near = Math.min(first, last); if (near <= 40 && (!lowest || near < lowest.near)) lowest = { course, near, mouthLast: last <= first }; }
  if (!lowest) return courses;
  const { course, mouthLast } = lowest, widthM = Math.min(RIVERS.estuaryMaxKm * 1000, Math.round(stemM * RIVERS.estuaryWidens));
  // Counted from the mouth: the points within the tidal reach.
  const fromMouth = mouthLast ? course.points.slice().reverse() : course.points; let run = 0, cut = fromMouth.length - 1;
  for (let i = 1; i < fromMouth.length; i += 1) { run += km(fromMouth[i - 1], fromMouth[i]); if (run >= RIVERS.estuaryKm) { cut = i; break; } }
  const order = (points) => (mouthLast ? points.slice().reverse() : points), estuary = { ...course, id: `${course.id}-estuary`, widthM, points: order(fromMouth.slice(0, cut + 1)), tidal: true };
  // (A course wholly within the tidal reach is all estuary.)
  return courses.flatMap((c) => (c !== course ? [c] : cut >= fromMouth.length - 2 ? [{ ...estuary, points: course.points }] : [{ ...course, points: order(fromMouth.slice(cut)) }, estuary]));
}

/** Every river channel of an asset turned into courses (cached per asset). */
export function riverCourses(asset) {
  if (cache.has(asset)) return cache.get(asset);
  const towns = (asset.settlements ?? []).filter((s) => s.lat != null).map((s) => [s.lat, s.lon]);
  const courses = (asset.hydrology?.lakes ?? []).filter((l) => l.waterKind === "river-channel").flatMap((l) => withEstuary(channelCourses(l, towns), asset));
  cache.set(asset, courses); return courses;
}
