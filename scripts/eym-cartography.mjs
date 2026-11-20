// Eym's geography and cartography, built from its surface (scripts/eym-surface.mjs):
// a 1° climate/biome raster, vector coastlines, the authored lakes, rivers,
// names and settlements of Caren and Garyk, and generated rivers and lakes on
// the seeded continents. Produces the same coarse (schema 1) and refined
// (schema 2) asset shapes as the generic pipeline, so the renderer, atlas and
// validators keep working.

import { createHash } from "node:crypto";
import { createRng, generatePlateModel } from "./planet-geography.mjs";
import { buildElevationMesh, circlePolygon, smoothOpen } from "./planet-cartography.mjs";
import { polygonize } from "./cartography-regions.mjs";
import { EYM_LAYOUT, EYM_SURFACE_MODEL, frameEastScale, frameToLatLon, fromLocal, greatCircleKm } from "./eym-surface.mjs";
import { normLon, unwrapRing } from "./geo-wrap.mjs";
import { WORLD_INPUTS } from "./eym-world-inputs.mjs";
import { seaLevelTemperatureC, zonalPrecipitationMm } from "./eym-seasons.mjs";
import { soilFromRock } from "./eym-geology.mjs";
import { prepareOverrides } from "./eym-overrides.mjs";
import { marginOf, seaFloorHeightM, seamountsOf, shoalOverSeamounts, tectonicDistances } from "./eym-seafloor.mjs";

const DEG = Math.PI / 180;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round3 = (value) => Math.round(value * 1000) / 1000;
const KM_PER_DEG = 111.195;
export const EYM_CARTOGRAPHY_RESOLUTION_DEG = 1;
export const EYM_COARSE_RESOLUTION_DEG = 6;

/** Fingerprint of everything Eym's surface is built from. */
export function eymInputFingerprint(tracedText, layout = EYM_LAYOUT) {
  return createHash("sha256").update(EYM_SURFACE_MODEL).update(tracedText).update(JSON.stringify(layout)).digest("hex").slice(0, 20);
}

// ---------------------------------------------------------------- climate

export { seaLevelTemperatureC, zonalPrecipitationMm };

/** Prevailing wind comes from the east in the tropics and polar belts, from the west in the mid-latitudes. */
const upwindStep = (lat) => (Math.abs(lat) < 30 || Math.abs(lat) > 60 ? 1 : -1);

function landBiome({ lat, temperatureC: t, precipitationMm: p, forestShare, relief, origin }) {
  if (t < -7) return "ice-cap";
  if (t < 2) return p > 450 ? "tundra" : "cold-desert";
  if (origin === "authored" && relief !== null) {
    // Caren's map shows its forests, grasslands and dry tablelands; follow it.
    if (forestShare >= 0.35) return t > 20 && p > 1400 ? "tropical-rainforest" : t > 14 ? "seasonal-forest" : "temperate-forest";
    if (relief >= 0.6 && relief < 1.6) return t > 18 ? "savanna" : "steppe";
  }
  // Tropical and subtropical mountains are cool by height, not latitude: montane forest, not taiga.
  if (Math.abs(lat) < 35 && t < 14) return p < 400 ? "steppe" : "temperate-forest";
  if (p < 250) return t > 18 ? "hot-desert" : "cold-desert";
  if (p < 600) return t > 18 ? "savanna" : "steppe";
  if (p > 1600 && t > 20) return "tropical-rainforest";
  if (p > 1000) return t > 14 ? (t > 20 ? "seasonal-forest" : "temperate-rainforest") : "taiga";
  return t > 17 ? "seasonal-forest" : t > 4 ? "temperate-forest" : "taiga";
}

function soilFor(cell) {
  if (cell.ocean && !cell.landCovered) return "marine-sediment";
  if (cell.biome === "ice-cap") return "glacial-mineral";
  if (cell.elevationMaxM > 2500) return "volcanic-fertile";
  if (cell.riverAccumulation > 6) return "alluvial-fertile";
  if (cell.biome.includes("desert")) return "arid-mineral";
  if (cell.precipitationMm > 1500) return "leached-humid";
  return "temperate-loam";
}

function resourceFor(cell) {
  if (cell.ocean && !cell.landCovered) return cell.boundary > 0.7 ? "hydrothermal-seafloor" : "marine-biological";
  if (cell.elevationMaxM > 2600) return "orogenic-metallic";
  if (cell.elevationM > 1200) return "upland-mineral";
  if (cell.riverAccumulation > 8) return "alluvial-agricultural";
  return "sedimentary-basin";
}

// ---------------------------------------------------------------- heap

class MinHeap {
  constructor(keys) { this.keys = keys; this.items = []; }
  push(index) { const a = this.items; a.push(index); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (this.keys[a[p]] <= this.keys[a[i]]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() {
    const a = this.items, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && this.keys[a[l]] < this.keys[a[m]]) m = l; if (r < a.length && this.keys[a[r]] < this.keys[a[m]]) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } }
    return top;
  }
  get size() { return this.items.length; }
}

// ---------------------------------------------------------------- seeded hydrology

/**
 * Rivers and lakes for a seeded continent, routed over its relief with priority flood: on its flat frame of 10 km
 * squares, or on its grid of the sphere when it is too large for one (scripts/eym-surface.mjs).
 *
 * The flood only asks which neighbour is lower, so it is the same on either kind of grid. What differs is measure:
 * on a sphere grid a square is narrower east to west by the cosine of its turned latitude, so its area (which the
 * catchments and lakes are summed from) is taken row by row, and places are read back through the frame.
 * Nothing is allocated while the flood runs: the queue, the order and the neighbour steps are arrays made once. The
 * queue sifts step for step as the array heap it replaces did, so squares of equal height leave it in the same
 * order and today's rivers are, point for point, what they were.
 */
function seededHydrology(frame, { riverAreaKm2 = 18_000, lakeDepthM = 25, lakeMinCells = 5, thinKm = 0 } = {}, stats = null) {
  const { grid, outline, elevation } = frame, { cols, rows, cellKm } = grid, n = cols * rows;
  const filled = new Float32Array(n), receiver = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  let land = 0; for (let i = 0; i < n; i += 1) land += outline[i];
  const order = new Int32Array(land), heap = new Int32Array(n); let ordered = 0, size = 0;
  const push = (index) => { let i = size; heap[size++] = index; while (i > 0) { const p = (i - 1) >> 1; if (filled[heap[p]] <= filled[heap[i]]) break; const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } };
  const pop = () => {
    const top = heap[0], last = heap[--size];
    if (size) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < size && filled[heap[l]] < filled[heap[m]]) m = l; if (r < size && filled[heap[r]] < filled[heap[m]]) m = r; if (m === i) break; const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } }
    return top;
  };
  // The eight neighbours, in the order they have always been taken: row above, own row, row below, west to east.
  const DR = [-1, -1, -1, 0, 0, 1, 1, 1], DC = [-1, 0, 1, -1, 1, -1, 0, 1];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    const i = r * cols + c; if (outline[i]) continue; let shore = false;
    for (let k = 0; k < 8 && !shore; k += 1) { const rr = r + DR[k], cc = c + DC[k]; if (rr >= 0 && rr < rows && cc >= 0 && cc < cols && outline[rr * cols + cc]) shore = true; }
    if (shore) { filled[i] = 0; done[i] = 1; push(i); }
  }
  while (size) {
    const i = pop(), r = Math.floor(i / cols), c = i % cols; if (outline[i]) order[ordered++] = i;
    for (let k = 0; k < 8; k += 1) {
      const rr = r + DR[k], cc = c + DC[k]; if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
      const j = rr * cols + cc; if (done[j] || !outline[j]) continue;
      done[j] = 1; filled[j] = Math.max(elevation[j], filled[i] + 0.01); receiver[j] = i; push(j);
    }
  }
  // Each square's own area: the same everywhere on a flat frame, less by its row's narrowing on a sphere grid.
  const squareKm2 = frame.sphere ? Float64Array.from({ length: rows }, (_, r) => cellKm * cellKm * frameEastScale(frame, grid.y0 - (r + 0.5) * cellKm)) : null;
  const areaOf = (i) => (squareKm2 ? squareKm2[Math.floor(i / cols)] : cellKm * cellKm);
  const acc = new Float32Array(n);
  for (let k = ordered - 1; k >= 0; k -= 1) { const i = order[k]; acc[i] += areaOf(i); if (receiver[i] >= 0 && outline[receiver[i]]) acc[receiver[i]] += acc[i]; }
  const isRiver = (i) => outline[i] && acc[i] >= riverAreaKm2;
  const upstreamRivers = new Int32Array(n);
  for (let i = 0; i < n; i += 1) if (isRiver(i) && receiver[i] >= 0 && isRiver(receiver[i])) upstreamRivers[receiver[i]] += 1;
  const heads = []; for (let i = 0; i < n; i += 1) if (isRiver(i) && !upstreamRivers[i]) heads.push(i);
  heads.sort((a, b) => acc[b] - acc[a] || a - b);
  const traced = new Uint8Array(n), local = (i) => [grid.x0 + (i % cols + 0.5) * cellKm, grid.y0 - (Math.floor(i / cols) + 0.5) * cellKm];
  const place = (x, y) => (frame.sphere ? frameToLatLon(frame, x, y) : fromLocal(frame.center, x, y));
  const rivers = [];
  for (const head of heads) {
    const path = []; let i = head, mouth = "ocean";
    while (i >= 0) {
      path.push(i);
      if (!outline[i]) break;
      if (traced[i] && path.length > 1) { mouth = "river"; break; }
      traced[i] = 1; i = receiver[i];
    }
    if (path.length < 4) continue;
    const points = path.filter((_, k) => k % 2 === 0 || k === path.length - 1).map((index) => place(...local(index)).map(round3));
    const heights = path.filter((_, k) => k % 2 === 0 || k === path.length - 1).map((index) => Math.round(outline[index] ? elevation[index] : 0));
    // A coarse continent's course is thinned, and its heights with it (one for each point kept, the two ends always).
    const course = thinKm > 0 ? thinLine(smoothCourse(points), thinKm) : smoothCourse(points);
    rivers.push({ points: course, dischargeKm2: Math.round(acc[path.at(-2) ?? path[0]]), mouth, elevationsM: thinKm > 0 ? course.map((_, k) => heights[Math.round(k * (heights.length - 1) / Math.max(1, course.length - 1))]) : heights });
  }
  // Lakes fill the deeper closed basins.
  const lakeCell = (i) => outline[i] && filled[i] - elevation[i] > lakeDepthM, seen = new Uint8Array(n), lakes = [];
  for (let i = 0; i < n; i += 1) {
    if (seen[i] || !lakeCell(i)) continue;
    const stack = [i], members = []; seen[i] = 1;
    while (stack.length) {
      const j = stack.pop(), r = Math.floor(j / cols), c = j % cols; members.push(j);
      for (let k = 0; k < 8; k += 1) { const rr = r + DR[k], cc = c + DC[k]; if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue; const m = rr * cols + cc; if (!seen[m] && lakeCell(m)) { seen[m] = 1; stack.push(m); } }
    }
    if (members.length < lakeMinCells) continue;
    const [sx, sy] = members.reduce(([ax, ay], j) => { const [x, y] = local(j); return [ax + x, ay + y]; }, [0, 0]);
    const center = place(sx / members.length, sy / members.length);
    let catchment = -Infinity; for (const j of members) if (acc[j] > catchment) catchment = acc[j];
    lakes.push({ center, areaKm2: Math.round(squareKm2 ? members.reduce((sum, j) => sum + areaOf(j), 0) : members.length * cellKm * cellKm), catchmentKm2: Math.round(catchment) });
  }
  if (stats) Object.assign(stats, { squares: n, land, rivers: rivers.length, lakes: lakes.length });
  return { rivers, lakes };
}

/**
 * A river's course rounded off. The rounding averages neighbouring points, which for a course that crosses ±180°
 * would average 179° with −179° and put a point on the far side of the world: such a course is run on past the
 * seam first (scripts/geo-wrap.mjs) and brought back after. A course that does not cross is rounded as it always was.
 */
function smoothCourse(points) {
  let crosses = false; for (let k = 1; k < points.length && !crosses; k += 1) if (Math.abs(points[k][1] - points[k - 1][1]) > 180) crosses = true;
  if (!crosses) return smoothOpen(points, 1).map((p) => p.map(round3));
  return smoothOpen(unwrapRing(points), 1).map(([lat, lon]) => [lat, normLon(lon)].map(round3));
}

// ---------------------------------------------------------------- coarse writing of land too large for a flat frame

const unitOf = ([lat, lon]) => { const p = lat * Math.PI / 180, l = lon * Math.PI / 180; return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)]; };
/** Distance (km) from a place to the great-circle arc between two others, all as unit vectors. */
function arcDistanceKm(v, a, b) {
  const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], length = Math.hypot(n[0], n[1], n[2]), dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2], angle = (p, q) => Math.acos(Math.max(-1, Math.min(1, dot(p, q))));
  const av = [a[1] * v[2] - a[2] * v[1], a[2] * v[0] - a[0] * v[2], a[0] * v[1] - a[1] * v[0]], vb = [v[1] * b[2] - v[2] * b[1], v[2] * b[0] - v[0] * b[2], v[0] * b[1] - v[1] * b[0]];
  if (length > 1e-12 && dot(av, n) >= 0 && dot(vb, n) >= 0) return 6371 * Math.abs(Math.asin(Math.max(-1, Math.min(1, dot(v, n) / length))));
  return 6371 * Math.min(angle(v, a), angle(v, b));
}
/**
 * A line of [lat, lon] points thinned (Douglas–Peucker) so that no point dropped lies more than `tolKm` from the
 * line kept, measured on the sphere, so it is the same across ±180° and near a pole as anywhere. The two ends are
 * always kept. For a closed ring (its last point its first again) the ring is cut at the point farthest from its
 * start, so that it cannot collapse to nothing, and at least a triangle is kept.
 */
function thinLine(points, tolKm) {
  const n = points.length; if (n < 3 || !(tolKm > 0)) return points;
  const v = points.map(unitOf), keep = new Uint8Array(n), stack = [];
  const closed = points[0][0] === points[n - 1][0] && points[0][1] === points[n - 1][1];
  keep[0] = keep[n - 1] = 1;
  if (closed) { let far = 0, best = -1; for (let i = 1; i < n - 1; i += 1) { const d = v[0][0] * v[i][0] + v[0][1] * v[i][1] + v[0][2] * v[i][2]; if (best < 0 || d < best) { best = d; far = i; } } keep[far] = 1; stack.push([0, far], [far, n - 1]); } else stack.push([0, n - 1]);
  while (stack.length) {
    const [a, b] = stack.pop(); let worst = -1, at = -1;
    for (let i = a + 1; i < b; i += 1) { const d = arcDistanceKm(v[i], v[a], v[b]); if (d > worst) { worst = d; at = i; } }
    if (worst > tolKm) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  let kept = points.filter((_, i) => keep[i]);
  if (closed && kept.length < 4) { const third = Math.floor(n / 3); kept = [points[0], points[third], points[2 * third], points[n - 1]]; }
  return kept;
}
/** How a continent on a sphere grid is routed and written, from the `farLand` dials; undefined for one on a flat frame. */
function coarseWater(frame, dials = WORLD_INPUTS.layout.farLand) {
  if (!frame.sphere) return undefined;
  const { grid } = frame; let landKm2 = 0;
  for (let r = 0; r < grid.rows; r += 1) { let n = 0; for (let c = 0; c < grid.cols; c += 1) n += frame.land[r * grid.cols + c]; landKm2 += n * grid.cellKm * grid.cellKm * frameEastScale(frame, grid.y0 - (r + 0.5) * grid.cellKm); }
  return { riverAreaKm2: Math.max(18_000, landKm2 / dials.riverLandShare), lakeMinCells: dials.lakeMinSquares, thinKm: dials.courseThinKm };
}
export { thinLine, coarseWater as frameCoarseWater };

/** The routing itself, for tests and measurements: `seededHydrology(frame, options, stats)`. */
export { seededHydrology as frameHydrology };

// ---------------------------------------------------------------- labels

/** Convert a pixel position on a traced source map to [lat, lon] on Eym. */
export function sourcePixelToLatLon(continent, center, x, y) {
  const km = [(x - continent.originPx[0]) * continent.kmPerPixel, (continent.originPx[1] - y) * continent.kmPerPixel];
  return fromLocal(center, ...km).map(round3);
}

const FEATURE_CLASS = { region: "region", nation: "region", forest: "forest", lake: "lake", river: "river", mountain: "mountain", range: "range", hills: "hills", valley: "valley", islands: "islands", grove: "grove", other: "landmark" };
const SETTLEMENT_RANK = { capital: 10, city: 1, port: 0.6, town: 0.45, fort: 0.4, village: 0.2 };
const GARYK_ICON_KIND = { "capital-star": "capital", "city-ring": "city", "town-dot": "town", castle: "fort", anchor: "port" };

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ya, xa] = ring[i], [yb, xb] = ring[j];
    if ((ya > point[0]) !== (yb > point[0]) && point[1] < (xb - xa) * (point[0] - ya) / (yb - ya) + xa) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------- terrain detail

/** Douglas–Peucker simplification of a closed ring (local km). */
function simplifyClosed(points, tolerance) {
  if (points.length < 8) return points;
  const far = points.reduce((best, p, i) => (Math.hypot(p[0] - points[0][0], p[1] - points[0][1]) > best.d ? { i, d: Math.hypot(p[0] - points[0][0], p[1] - points[0][1]) } : best), { i: 0, d: -1 }).i;
  const keep = new Uint8Array(points.length); keep[0] = keep[far] = 1;
  const stack = [[0, far], [far, points.length]];
  while (stack.length) {
    const [a, b] = stack.pop(); if (b - a < 2) continue;
    const p = points[a], q = points[b % points.length], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
    let worst = -1, at = -1;
    for (let i = a + 1; i < b; i += 1) { const d = Math.abs((points[i][0] - p[0]) * dy - (points[i][1] - p[1]) * dx) / len; if (d > worst) { worst = d; at = i; } }
    if (worst > tolerance) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

/** Boundary loops of a 0/1 mask on a local grid, as smoothed [lat, lon] rings. */
function maskRings(frame, mask, minCells = 4) {
  const { cols, rows, cellKm, x0, y0 } = frame.grid, inside = (r, c) => r >= 0 && c >= 0 && r < rows && c < cols && mask[r * cols + c];
  const edges = new Map(), key = (r, c) => r * (cols + 1) + c;
  const add = (a, b) => { if (!edges.has(a)) edges.set(a, []); edges.get(a).push(b); };
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    if (!mask[r * cols + c]) continue;
    if (!inside(r - 1, c)) add(key(r, c), key(r, c + 1));
    if (!inside(r, c + 1)) add(key(r, c + 1), key(r + 1, c + 1));
    if (!inside(r + 1, c)) add(key(r + 1, c + 1), key(r + 1, c));
    if (!inside(r, c - 1)) add(key(r + 1, c), key(r, c));
  }
  const rings = [];
  for (const start of [...edges.keys()].sort((a, b) => a - b)) {
    while (edges.get(start)?.length) {
      const loop = [start]; let at = start;
      for (let guard = 0; guard < 1e6; guard += 1) { const next = edges.get(at).pop(); if (next === start) break; loop.push(next); at = next; if (!edges.get(at)?.length) break; }
      if (loop.length < minCells) continue;
      // drop collinear vertices, then round the cell corners off
      let points = loop.map((v) => [x0 + (v % (cols + 1)) * cellKm, y0 - Math.floor(v / (cols + 1)) * cellKm]);
      points = points.filter((p, i) => { const a = points[(i - 1 + points.length) % points.length], b = points[(i + 1) % points.length]; return (a[0] - p[0]) * (b[1] - p[1]) !== (a[1] - p[1]) * (b[0] - p[0]); });
      points = simplifyClosed(points, cellKm * 0.75);
      if (points.length < 4) continue;
      for (let pass = 0; pass < 1; pass += 1) points = points.flatMap((p, i) => { const q = points[(i + 1) % points.length]; return [[p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]]; });
      const ring = points.map(([x, y]) => (frame.sphere ? frameToLatLon(frame, x, y) : fromLocal(frame.center, x, y)).map(round3));
      rings.push([...ring, ring[0]]);
    }
  }
  return rings;
}

/** The outlines of a mask on a frame's grid, for tests and for tools with masks of their own. */
export const frameMaskRings = (frame, mask, minCells = 4) => maskRings(frame, mask, minCells);

/** Forests, uplands, mountains and peaks for each continent at its local (6–10 km) resolution. */
function terrainDetail(frames) {
  const detail = [];
  for (const frame of frames.filter((f) => f.continent)) {
    const authored = frame.origin === "authored", n = frame.land.length;
    const level = (min, max) => Uint8Array.from({ length: n }, (_, i) => (frame.land[i] && (authored ? frame.reliefValue[i] >= min : frame.elevation[i] >= max) ? 1 : 0));
    const classes = [["upland", level(0.6, 800)], ["mountains", level(1.6, 1800)], ["peaks", level(2.5, 3300)]];
    if (authored) classes.unshift(["forest", Uint8Array.from({ length: n }, (_, i) => (frame.land[i] && frame.forest[i] && frame.reliefValue[i] < 1.6 ? 1 : 0))]);
    for (const [kind, mask] of classes) {
      const rings = maskRings(frame, mask, authored ? 6 : 4);
      if (rings.length) detail.push({ id: `${frame.id}-${kind}`, continent: frame.continent, kind, rings });
    }
  }
  return detail;
}

// ---------------------------------------------------------------- composition

/**
 * Build Eym's coarse and refined geography from its surface.
 * @param {object} input { surface, sampler, frames, traced, labels: { caren, garyk }, row, fingerprint }
 */
export function buildEymGeography({ surface, sampler, frames, traced, labels, row, fingerprint, tectonics = null, climate = null, overrides = null }) {
  // Hand-authored exceptions (data/eym/overrides.json), applied after the rules: see scripts/eym-overrides.mjs.
  const exceptions = prepareOverrides(overrides, EYM_CARTOGRAPHY_RESOLUTION_DEG);
  const res = EYM_CARTOGRAPHY_RESOLUTION_DEG, latCount = 180 / res, lonCount = 360 / res, sub = 4;
  const rng = createRng(`${row.geography_seed}|eym-ocean`);
  const ridgeNoise = Array.from({ length: 6 }, () => ({ a: rng() * 2 - 1, b: rng() * 2 - 1, c: rng() * Math.PI * 2, k: 2 + rng() * 3 }));
  const cells = [];
  for (let latIndex = 0; latIndex < latCount; latIndex += 1) for (let lonIndex = 0; lonIndex < lonCount; lonIndex += 1) {
    const lat = -90 + res * (latIndex + 0.5), lon = -180 + res * (lonIndex + 0.5);
    let land = 0, water = 0, elevSum = 0, elevMax = -Infinity, forest = 0, relief = 0, reliefCount = 0, coastKm = Infinity; const origins = new Map();
    for (let a = 0; a < sub; a += 1) for (let b = 0; b < sub; b += 1) {
      const s = sampler(lat - res / 2 + res * (a + 0.5) / sub, lon - res / 2 + res * (b + 0.5) / sub);
      if (!s) continue;
      if (s.inlandWater) { water += 1; continue; }
      land += 1; elevSum += s.elevationM; elevMax = Math.max(elevMax, s.elevationM); forest += s.forest ? 1 : 0; coastKm = Math.min(coastKm, s.coastKm);
      if (s.origin === "authored") { relief += s.relief; reliefCount += 1; }
      const key = `${s.origin}|${s.continent ?? ""}`; origins.set(key, (origins.get(key) ?? 0) + 1);
    }
    const total = sub * sub, outline = (land + water) / total;
    const [origin, continent] = ([...origins].sort((p, q) => q[1] - p[1])[0]?.[0] ?? "|").split("|");
    cells.push({
      id: cells.length, latIndex, lonIndex, lat, lon,
      landFraction: land / total, outlineFraction: outline, ocean: outline < 0.5, landCovered: land / total >= 0.06,
      landElevationM: land ? elevSum / land : 0, elevationMaxM: land ? elevMax : 0, forestShare: land ? forest / land : 0,
      relief: reliefCount ? relief / reliefCount : null, coastKm, origin: origin || null, continent: continent || null,
    });
  }
  const at = (i, j) => (i < 0 || i >= latCount ? null : cells[i * lonCount + ((j % lonCount) + lonCount) % lonCount]);

  // Ocean floor: shelf, slope and abyssal plain by distance from the nearest coast, with mid-ocean ridges.
  const dist = new Float64Array(cells.length).fill(Infinity), settled = new Uint8Array(cells.length), heap = new MinHeap(dist);
  for (const cell of cells) if (!cell.ocean) { dist[cell.id] = 0; heap.push(cell.id); }
  while (heap.size) {
    const id = heap.pop(), cell = cells[id];
    if (settled[id]) continue; settled[id] = 1;
    for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const next = at(cell.latIndex + di, cell.lonIndex + dj); if (!next) continue;
      const step = KM_PER_DEG * res * Math.hypot(di, dj * Math.cos(((cell.lat + next.lat) / 2) * DEG));
      if (dist[id] + step < dist[next.id]) { dist[next.id] = dist[id] + step; heap.push(next.id); }
    }
  }
  // With the tectonic history (data/eym/tectonics.json) the sea floor follows the plates: ridges where they part,
  // trenches where sea floor goes down, narrow shelves on active margins and wide ones on rifted margins.
  const tect = tectonics ? tectonicDistances(tectonics, latCount, lonCount) : null;
  // The ranges each continent's bedrock follows: active coastal ranges (volcanic) and old sutures (metamorphic).
  const rangeLines = tectonics ? Object.values(tectonics.continents).flatMap((c) => c.ridges.map((r) => ({ origin: r.origin, points: densify(r.points.map(([x, y]) => fromLocal(c.center, x, y)), 20) }))) : [];
  // Hotspot chains (the mantle's plumes, tools/generate-eym-tectonics.mjs): the sea floor rises over their seamounts
  // (scripts/eym-seafloor.mjs, which states the sea floor's shape for the ocean climate too).
  const seamounts = seamountsOf(tectonics);
  const rangeKm = (cell, origin) => { let best = Infinity; for (const r of rangeLines) if (r.origin === origin) for (const p of r.points) { if (Math.abs(p[0] - cell.lat) > 6) continue; best = Math.min(best, greatCircleKm(p, [cell.lat, cell.lon])); } return best; };
  for (const cell of cells) {
    const d = dist[cell.id], v = [Math.cos(cell.lat * DEG) * Math.cos(cell.lon * DEG), Math.cos(cell.lat * DEG) * Math.sin(cell.lon * DEG), Math.sin(cell.lat * DEG)];
    if (tect) {
      const k = tect.index(cell.latIndex, cell.lonIndex), ridgeKm = tect.ridgeKm[k], trenchKm = tect.trenchKm[k], collideKm = tect.collideKm[k];
      cell.ridgeKm = ridgeKm; cell.trenchKm = trenchKm; cell.collisionKm = collideKm;
      cell.boundary = Number(Math.max(Math.exp(-((ridgeKm / 250) ** 2)), Math.exp(-((trenchKm / 250) ** 2)), Math.exp(-((collideKm / 250) ** 2))).toFixed(3));
      cell.margin = marginOf(trenchKm, collideKm);
      if (cell.ocean) {
        cell.elevationM = Math.round(clamp(shoalOverSeamounts(seamounts, cell.lat, cell.lon, seaFloorHeightM(d, ridgeKm, trenchKm, cell.margin)), -9500, -20));
      } else cell.elevationM = Math.round(Math.max(1, cell.landElevationM));
      continue;
    }
    const ridgeField = ridgeNoise.reduce((sum, w) => sum + Math.sin(w.k * (w.a * v[0] + w.b * v[1] + v[2] * (1 - Math.abs(w.a))) + w.c), 0) / ridgeNoise.length;
    cell.boundary = Number(Math.exp(-((ridgeField / 0.08) ** 2)).toFixed(3));
    if (cell.ocean) {
      const shelf = -40 - Math.min(d, 150) * 1.1, slope = d > 150 ? -Math.min(1, (d - 150) / 350) * 3100 : 0;
      const abyss = d > 500 ? -(d - 500) / 1500 * 900 : 0;
      cell.elevationM = Math.round(Math.max(-5800, shelf + slope + abyss + cell.boundary * (d > 600 ? 2000 : 0)));
    } else cell.elevationM = Math.round(Math.max(1, cell.landElevationM));
  }

  // Climate: temperature by latitude and height; rain by zone, with rain shadows and orographic lift. With the ocean
  // climate (data/eym/climate.json), the sea's yearly anomaly warms or cools the coasts and wets or dries them:
  // warm water offshore, wetter; cold water offshore, drier and foggier. Its reach inland fades over ~600 km.
  const annualAnomaly = climate ? climateAnnualAnomaly(climate) : null;
  for (const cell of cells) {
    const surfaceM = cell.landCovered ? Math.max(0, cell.landElevationM) : 0;
    const reach = annualAnomaly ? (cell.ocean ? 1 : Math.exp(-(cell.coastKm ?? 0) / 600)) : 0, anomalyC = annualAnomaly ? annualAnomaly(cell.lat, cell.lon) * reach : 0;
    cell.temperatureC = Number((seaLevelTemperatureC(cell.lat) - surfaceM * 0.0065 + anomalyC).toFixed(1));
    let p = zonalPrecipitationMm(cell.lat) * clamp(1 + 0.09 * anomalyC, 0.55, 1.45);
    if (cell.landCovered) {
      const step = upwindStep(cell.lat); let barrier = 0;
      for (let k = 1; k <= 6; k += 1) { const up = at(cell.latIndex, cell.lonIndex + step * k); if (up?.landCovered) barrier = Math.max(barrier, up.elevationMaxM - surfaceM); }
      if (barrier > 900) p *= Math.max(0.35, 1 - barrier / 5500);
      if (cell.elevationMaxM > 1200) p *= 1.15;
      if (cell.coastKm > 500) p *= 0.8;
    }
    cell.precipitationMm = Math.round(clamp(p, 60, 4200));
  }

  // Seeded continents get routed rivers and basin lakes; Caren and Garyk keep their authored water.
  const generatedRivers = [], generatedLakes = [];
  for (const frame of frames.filter((f) => f.origin === "seeded" && f.continent)) {
    const { rivers, lakes } = seededHydrology(frame, coarseWater(frame));
    for (const river of rivers) generatedRivers.push({ ...river, continent: frame.continent });
    for (const lake of lakes) generatedLakes.push({ ...lake, continent: frame.continent });
  }
  const riverCells = new Map();
  for (const river of generatedRivers) for (const [lat, lon] of river.points) {
    const cell = at(Math.floor((lat + 90) / res), Math.floor((lon + 180) / res)); if (!cell) continue;
    riverCells.set(cell.id, Math.max(riverCells.get(cell.id) ?? 0, river.dischargeKm2 / 20_000));
  }
  for (const water of surface.inlandWater) for (const ring of water.rings.slice(0, 1)) for (const [lat, lon] of ring.filter((_, k) => k % 3 === 0)) {
    const cell = at(Math.floor((lat + 90) / res), Math.floor((lon + 180) / res)); if (!cell) continue;
    riverCells.set(cell.id, Math.max(riverCells.get(cell.id) ?? 0, water.kind === "river" ? 9 : 4));
  }

  for (const cell of cells) {
    cell.riverAccumulation = Number((riverCells.get(cell.id) ?? 0).toFixed(2));
    cell.river = riverCells.has(cell.id) && !cell.ocean;
    cell.lake = false;
    exceptions.climate(cell);
    cell.biome = cell.landCovered
      ? landBiome({ lat: cell.lat, temperatureC: cell.temperatureC, precipitationMm: cell.precipitationMm, forestShare: cell.forestShare, relief: cell.relief, origin: cell.origin })
      : cell.temperatureC < -1 ? "sea-ice" : cell.temperatureC > 23 ? "tropical-ocean" : "open-ocean";
    if (tect && cell.landCovered) { cell.arcKm = rangeKm(cell, "subduction"); cell.sutureKm = rangeKm(cell, "suture"); }
    cell.bedrock = tect ? bedrockFor(cell) : null;
    // With the plates, soil grows from the bedrock and the climate (scripts/eym-geology.mjs).
    cell.soil = tect ? soilFromRock(cell) : soilFor(cell);
    cell.resource = resourceFor(cell);
    exceptions.outcome(cell);
    const comfort = clamp(1 - Math.abs(cell.temperatureC - 18) / 32, 0, 1), moisture = clamp(cell.precipitationMm / 1000, 0.1, 1.15), terrain = clamp(1 - Math.max(0, cell.elevationM - 1200) / 5000, 0.1, 1);
    cell.suitability = cell.landCovered ? Number((comfort * moisture * terrain * (["volcanic-fertile", "alluvial-fertile", "temperate-loam"].includes(cell.soil) ? 1 : 0.55)).toFixed(3)) : 0;
  }

  // ---------------------------------------------------------------- vector layers
  const centers = Object.fromEntries(surface.continents.map((c) => [c.id, c.center]));
  // Continents on a sphere grid are written coarsely (the `farLand` dials): their coasts thinned, and below their soil
  // and resource regions drawn by their corners only. No continent of today's world is one.
  const coarseLand = new Set(frames.filter((f) => f.sphere && f.continent).map((f) => f.continent));
  const coarseRegion = coarseLand.size ? (component) => component.every((cell) => coarseLand.has(cell.continent)) : null;
  const coastlines = surface.coasts.map((coast) => ({ id: coast.id, continent: coast.continent, origin: coast.origin, kind: coast.kind, closed: true, areaKm2: coast.areaKm2, areaDeg2: Number((coast.areaKm2 / KM_PER_DEG ** 2).toFixed(2)), points: coarseLand.has(coast.continent) ? thinLine([...coast.points, coast.points[0]], WORLD_INPUTS.layout.farLand.coastThinKm) : [...coast.points, coast.points[0]] }))
    .sort((a, b) => b.areaKm2 - a.areaKm2 || a.id.localeCompare(b.id));
  const cellIdAt = ([lat, lon]) => at(clamp(Math.floor((lat + 90) / res), 0, latCount - 1), Math.floor((lon + 180) / res)).id;
  const lakes = [
    ...surface.inlandWater.slice().sort((a, b) => b.areaKm2 - a.areaKm2).map((water) => ({ id: water.id, cellId: cellIdAt(water.center), waterKind: water.kind === "river" ? "river-channel" : "lake", continent: water.continent, areaKm2: water.areaKm2, catchmentIndex: Number((water.areaKm2 / 1000).toFixed(2)), polygon: [...water.rings[0], water.rings[0][0]], islands: water.rings.slice(1).map((ring) => [...ring, ring[0]]) })),
    ...generatedLakes.sort((a, b) => b.areaKm2 - a.areaKm2).map((lake, index) => ({ id: `lake-${index + 1}`, cellId: cellIdAt(lake.center), waterKind: "lake", continent: lake.continent, areaKm2: lake.areaKm2, catchmentIndex: Number((lake.catchmentKm2 / 1000).toFixed(2)), polygon: circlePolygon(lake.center[0], lake.center[1], clamp(Math.sqrt(lake.areaKm2 / Math.PI) / KM_PER_DEG, 0.12, 1.2)) })),
  ];
  const rivers = generatedRivers.sort((a, b) => b.dischargeKm2 - a.dischargeKm2).map((river, index) => ({ id: `river-${index + 1}`, sourceCell: cellIdAt(river.points[0]), mouth: river.mouth, continent: river.continent, dischargeIndex: Number((river.dischargeKm2 / 1000).toFixed(2)), points: river.points, elevationsM: river.elevationsM }));
  const spaced = (list, minDeg) => list.filter((cell, index, all) => all.slice(0, index).every((other) => Math.abs(other.lat - cell.lat) + Math.abs(other.lon - cell.lon) >= minDeg));
  const wetlands = spaced(cells.filter((cell) => !cell.ocean && cell.landElevationM < 150 && cell.precipitationMm >= 1300 && (cell.river || cell.coastKm < 40)), 3).slice(0, 40)
    .map((cell, index) => ({ id: `wetland-${index + 1}`, cellId: cell.id, polygon: circlePolygon(cell.lat, cell.lon, res * 0.45) }));
  const glaciers = spaced(cells.filter((cell) => cell.landCovered && seaLevelTemperatureC(cell.lat) - cell.elevationMaxM * 0.0065 <= -3), 2).slice(0, 60)
    .map((cell, index) => ({ id: `glacier-${index + 1}`, cellId: cell.id, meanTemperatureC: Number((seaLevelTemperatureC(cell.lat) - cell.elevationMaxM * 0.0065).toFixed(1)), polygon: circlePolygon(cell.lat, cell.lon, res * 0.2) }));

  // ---------------------------------------------------------------- regions
  const grid = { latCount, lonCount };
  // Land biome patches are 1° cells; round their staircase outlines into natural shapes.
  const smoothRing = (ring, passes = 2) => {
    let points = ring.slice(0, -1).filter((p, i, all) => { const a = all[(i - 1 + all.length) % all.length], b = all[(i + 1) % all.length]; return (a[0] - p[0]) * (b[1] - p[1]) !== (a[1] - p[1]) * (b[0] - p[0]); });
    for (let pass = 0; pass < passes; pass += 1) points = points.flatMap((p, i) => { const q = points[(i + 1) % points.length]; return [[p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]]; });
    points = points.map((p) => p.map(round3));
    return [...points, points[0]];
  };
  // (A coarse continent's biome regions have their corners rounded once, not twice: half the points.)
  const ecoregions = polygonize(cells, "biome", res, grid, coarseRegion).map((region) => (/ocean|sea-ice/.test(region.category) ? region : { ...region, polygons: region.polygons.map((ring) => smoothRing(ring, region.compact ? 1 : 2)) }));
  const soilRegions = polygonize(cells.filter((cell) => cell.landCovered), "soil", res, grid, coarseRegion);
  const resourceProvinces = polygonize(cells, "resource", res, grid, coarseRegion);

  // ---------------------------------------------------------------- names and settlements
  const tracedCaren = traced.continents.caren, tracedGaryk = traced.continents.garyk;
  const gazetteer = [];
  for (const continent of surface.continents) {
    const coast = coastlines.find((line) => line.id.startsWith(`${continent.id}-mainland`));
    gazetteer.push({ id: `continent-${continent.id}`, featureClass: "continent", geometryType: "polygon", geometryRef: coast.id, at: continent.center, scale: continent.mainlandAreaKm2, areaKm2: continent.mainlandAreaKm2, properName: continent.origin === "authored" ? continent.name : `${continent.name[0].toUpperCase()}${continent.name.slice(1)}`, placeholderName: Boolean(continent.placeholderName), origin: continent.origin, scientificClassification: continent.origin === "authored" ? "continent (authored map)" : "continent (seeded; name to be decided)" });
  }
  const carenWater = surface.inlandWater.filter((water) => water.continent === "Caren");
  const seenNames = new Set(gazetteer.map((feature) => feature.properName));
  for (const [index, label] of (labels.caren?.features ?? []).entries()) {
    if (!label.name || seenNames.has(label.name)) continue;
    seenNames.add(label.name);
    const point = sourcePixelToLatLon(tracedCaren, centers.caren, label.x, label.y), featureClass = FEATURE_CLASS[label.class] ?? "landmark";
    let geometryRef = null;
    if (featureClass === "lake" || featureClass === "river") {
      const wanted = featureClass === "river" ? "river" : null;
      const candidates = carenWater.filter((water) => !wanted || water.kind === wanted);
      const containing = candidates.find((water) => pointInRing(point, water.rings[0]));
      const nearest = containing ?? candidates.slice().sort((a, b) => greatCircleKm(a.center, point) - greatCircleKm(b.center, point))[0];
      if (nearest && greatCircleKm(nearest.center, point) < 250) geometryRef = nearest.id;
    }
    gazetteer.push({ id: `caren-feature-${index + 1}`, featureClass, geometryType: geometryRef ? "polygon" : "point", geometryRef, at: point, scale: featureClass === "region" ? 5000 : 100, properName: label.name, origin: "authored", sourceMap: "Caren", confidence: label.confidence ?? "high", scientificClassification: label.class });
  }

  const settlements = [];
  for (const [index, site] of (labels.caren?.settlements ?? []).entries()) {
    const [lat, lon] = sourcePixelToLatLon(tracedCaren, centers.caren, site.x, site.y), kind = site.kind in SETTLEMENT_RANK ? site.kind : "town";
    settlements.push({ id: `caren-settlement-${index + 1}`, featureClass: kind, kind, role: kind, continent: "Caren", lat, lon, at: [lat, lon], properName: site.name ?? null, confidence: site.confidence ?? "high", suitability: SETTLEMENT_RANK[kind], origin: "authored" });
  }
  for (const [index, marker] of (labels.garyk?.markers ?? []).filter((m) => m.onLand !== false).entries()) {
    const [lat, lon] = sourcePixelToLatLon(tracedGaryk, centers.garyk, marker.x, marker.y), kind = GARYK_ICON_KIND[marker.icon] ?? "town";
    settlements.push({ id: `garyk-settlement-${index + 1}`, featureClass: kind, kind, role: kind, continent: "Garyk", polity: `${marker.color} realm`, polityColor: marker.color, lat, lon, at: [lat, lon], properName: null, suitability: SETTLEMENT_RANK[kind], origin: "authored" });
  }

  // ---------------------------------------------------------------- assets
  const encodeByteField = (field) => { const categories = [...new Set(cells.map((cell) => cell[field]))].sort(), index = new Map(categories.map((c, i) => [c, i])); return { categories, valuesBase64: Buffer.from(cells.map((cell) => index.get(cell[field]))).toString("base64") }; };
  const waterFraction = Number((1 - surface.landFraction).toFixed(5));
  const refinedCells = cells.map((cell) => ({ ...cell }));
  const terrain = {
    targetWaterFraction: Number((Number(row.water_pct) / 100).toFixed(5)), realizedWaterFraction: waterFraction, coastlineSource: "vector",
    coastlines, landPolygons: [], detail: terrainDetail(frames),
    elevationMesh: buildElevationMesh(refinedCells, latCount, lonCount, res, 6), contours: [],
  };
  const asset = {
    terrain,
    hydrology: { rivers, lakes, wetlands, glaciers },
    regions: { ecoregions, soilRegions, resourceProvinces },
    gazetteer, settlements, transportRoutes: [],
    raster: {
      elevationM: cells.map((cell) => cell.elevationM),
      oceanMaskBase64: Buffer.from(cells.map((cell) => (cell.ocean ? 1 : 0))).toString("base64"),
      biome: encodeByteField("biome"), soil: encodeByteField("soil"), resource: encodeByteField("resource"),
      ...(tect ? { bedrock: encodeByteField("bedrock") } : {}),
    },
    ...(climate ? climateSections(climate) : {}),
    ...(tectonics ? { geology: {
      model: tectonics.model, seed: tectonics.seed,
      plates: tectonics.plates.map(({ id, name, kind, micro, pole, rateDegPerMyr }) => ({ id, name, kind, micro, pole, rateDegPerMyr })),
      // (Volcanoes without their plate id and at 0.01°, to keep the asset within its mobile budget.)
      volcanoes: tectonics.volcanoes.map(({ plate, at, ...v }) => ({ at: at.map((x) => Math.round(x * 100) / 100), ...v })), history: tectonics.history, caren: tectonics.caren, garyk: tectonics.garyk,
      // The plate boundaries, for earthquakes (scripts/eym-quakes.mjs).
      boundaries: packBoundaries(tectonics.boundaries),
      // The mantle (owner's addenda, 18 November 2026, item 3): its two upwellings and the plumes' seamount chains.
      ...(tectonics.mantle ? { mantle: { upwellings: tectonics.mantle.upwellings, radiusDeg: tectonics.mantle.radiusDeg, chains: tectonics.mantle.chains.map(({ hotspot, seamounts }) => ({ hotspot, seamounts: seamounts.map(({ at, ageMyr, summitDepthM }) => ({ at: at.map((x) => Math.round(x * 100) / 100), ageMyr, summitDepthM })) })) } } : {}),
    } } : {}),
    resolutionDeg: res, grid,
  };

  // Coarse (6°) summary in the generic schema, aggregated from the 1° cells.
  const cr = EYM_COARSE_RESOLUTION_DEG, k = cr / res, cLat = 180 / cr, cLon = 360 / cr, coarseCells = [];
  for (let i = 0; i < cLat; i += 1) for (let j = 0; j < cLon; j += 1) {
    const members = []; for (let a = 0; a < k; a += 1) for (let b = 0; b < k; b += 1) members.push(cells[(i * k + a) * lonCount + j * k + b]);
    const land = members.filter((m) => !m.ocean), mean = (list, f) => list.reduce((s, m) => s + m[f], 0) / Math.max(1, list.length);
    const mode = (list, f) => { const counts = new Map(); for (const m of list) counts.set(m[f], (counts.get(m[f]) ?? 0) + 1); return [...counts].sort((p, q) => q[1] - p[1] || String(p[0]).localeCompare(String(q[0])))[0][0]; };
    const ocean = land.length * 2 < members.length, pool = ocean ? members : land;
    coarseCells.push({ id: coarseCells.length, latIndex: i, lonIndex: j, lat: -90 + cr * (i + 0.5), lon: -180 + cr * (j + 0.5), plateId: 0, boundary: Number(mean(members, "boundary").toFixed(3)), ocean,
      elevationM: Math.round(mean(pool, "elevationM")), temperatureC: Number(mean(pool, "temperatureC").toFixed(1)), precipitationMm: Math.round(mean(pool, "precipitationMm")),
      riverAccumulation: Number(Math.max(...pool.map((m) => m.riverAccumulation)).toFixed(2)), downstream: null, river: !ocean && pool.some((m) => m.river), lake: false,
      biome: mode(pool, "biome"), soil: mode(pool, "soil"), resource: mode(pool, "resource"), suitability: Number(Math.max(...pool.map((m) => m.suitability)).toFixed(3)) });
  }
  const coarseSites = settlements.filter((site) => site.properName && site.kind === "capital").map((site, index) => ({ id: `site-${index + 1}`, lat: site.lat, lon: site.lon, suitability: site.suitability, kind: index ? "city" : "capital" }));
  const coarse = {
    schemaVersion: 1, modelVersion: row.geography_model_version, inputFingerprint: fingerprint, seed: row.geography_seed, system: row.system, body: row.object,
    resolutionDeg: cr, grid: { latCount: cLat, lonCount: cLon }, plateModel: generatePlateModel(row), seaLevelRaw: 0, realizedWaterFraction: waterFraction,
    surface: { model: EYM_SURFACE_MODEL, landAreaKm2: surface.landAreaKm2, continents: surface.continents.map(({ id, name, origin, center, mainlandAreaKm2 }) => ({ id, name, origin, center, mainlandAreaKm2 })) },
    cells: coarseCells,
    coastlines: coastlines.filter((line) => line.kind === "mainland").map((line) => ({ id: line.id, points: line.points.filter((_, index) => index % 12 === 0) })),
    rivers: rivers.slice(0, 40).map((river) => ({ from: river.points[0], to: river.points.at(-1), flow: river.dischargeIndex })),
    lakes: lakes.slice(0, 40).map((lake) => ({ at: lake.polygon[0], catchment: lake.catchmentIndex })),
    settlements: coarseSites,
    transportRoutes: coarseSites.slice(1).map((site) => ({ from: site.id, to: coarseSites[0].id, mode: "sea-or-air" })),
  };
  return { coarse, asset, cells };
}

// ---------------------------------------------------------------- geology from the tectonic history

// ---------------------------------------------------------------- the ocean climate

/** The yearly mean sea-surface anomaly (°C) at a place, from the climate document's four seasons (4° cells, nearest). */
function climateAnnualAnomaly(climate) {
  const res = climate.resolutionDeg, cols = Math.round(360 / res), rows = Math.round(180 / res), n = climate.seasons.length;
  const mean = climate.seasons[0].sstAnomaly.map((_, i) => climate.seasons.reduce((s, season) => s + season.sstAnomaly[i], 0) / n);
  return (lat, lon) => mean[clamp(Math.floor((lat + 90) / res), 0, rows - 1) * cols + ((Math.floor((lon + 180) / res) % cols) + cols) % cols];
}

/**
 * The asset's compact climate (read by scripts/eym-climate.mjs): the sea-surface anomaly for four seasons and
 * the oscillation's pattern, as int8 tenths of a degree; and the currents, as int8 steps of 2 cm/s, in an ocean
 * section that is written to its own file beside the asset (scripts/cartography-asset.mjs).
 */
function climateSections(climate) {
  const int8 = (values, k) => Buffer.from(Int8Array.from(values, (v) => clamp(Math.round(v * k), -127, 127)).buffer).toString("base64");
  return {
    climate: { model: climate.model, resolutionDeg: climate.resolutionDeg, beltShift: climate.beltShift,
      seasons: climate.seasons.map((s) => ({ yearFraction: s.yearFraction, declinationDeg: s.declinationDeg, sstAnomalyInt8Tenths: int8(s.sstAnomaly, 10) })),
      enso: { basin: climate.enso.basin, periodsYears: climate.enso.periodsYears, weights: climate.enso.weights, phases: climate.enso.phases, patternInt8Tenths: int8(climate.enso.pattern, 10) } },
    ocean: { resolutionDeg: climate.resolutionDeg, seasons: climate.seasons.map((s) => ({ yearFraction: s.yearFraction, uInt8Cm2: int8(s.u, 50), vInt8Cm2: int8(s.v, 50), upwellingInt8Hundredths: int8(s.upwelling, 100) })) },
  };
}

/** The kinds of bedrock, by origin. */
export const BEDROCK_KINDS = Object.freeze({
  "granite-gneiss": "old core: granite and gneiss",
  "sandstone-shale": "basin: sandstone and shale",
  limestone: "basin: limestone (warm shallow seas)",
  volcanic: "active margin: basalt, andesite and tuff",
  metamorphic: "collision belt: schist, slate and marble",
  "godstone-granite": "Caren: white granite (the Godstone)",
  marble: "Caren: banded marble",
  "caren-limestone": "Caren: limestone over the Godstone",
});

/** Bedrock by origin. Caren's is stated (the Godstone); elsewhere it follows the plates and the ranges they raised. */
function bedrockFor(cell) {
  if (!cell.landCovered) return "sea-floor";
  const high = cell.elevationMaxM;
  if (cell.continent === "Caren") return high > 1200 ? "godstone-granite" : high > 400 ? "marble" : "caren-limestone";
  if (cell.arcKm <= 110) return "volcanic";
  if (cell.sutureKm <= 130 || cell.collisionKm <= 140) return "metamorphic";
  if (cell.trenchKm <= 250 && high > 300) return "volcanic";
  // The old cores: under the interiors (Garyk's is narrow, so its core lies nearer its coasts).
  if (cell.coastKm > (cell.continent === "Garyk" ? 100 : 280)) return "granite-gneiss";
  if (cell.temperatureC > 18 && cell.landElevationM < 300 && cell.coastKm < 250) return "limestone";
  return "sandstone-shale";
}

/** The plate boundaries packed small (the asset has a mobile budget): each kind's points as int16 tenths of a degree, lat then lon, base64. */
function packBoundaries(boundaries) {
  const pack = (points) => { const v = new Int16Array(points.length * 2); points.forEach(([lat, lon], i) => { v[2 * i] = Math.round(lat * 10); v[2 * i + 1] = Math.round(lon * 10); }); return Buffer.from(v.buffer).toString("base64"); };
  return { encoding: "int16-le-tenth-degree", trenches: pack(boundaries.trenches), collisions: pack(boundaries.collisions), ridges: pack(boundaries.ridges) };
}

/** Points every `stepKm` along a [lat, lon] line. */
function densify(line, stepKm) {
  const out = [];
  for (let i = 0; i + 1 < line.length; i += 1) { const n = Math.max(1, Math.ceil(greatCircleKm(line[i], line[i + 1]) / stepKm)); for (let k = 0; k < n; k += 1) out.push([line[i][0] + (line[i + 1][0] - line[i][0]) * k / n, line[i][1] + (line[i + 1][1] - line[i][1]) * k / n]); }
  if (line.length) out.push(line.at(-1));
  return out;
}
