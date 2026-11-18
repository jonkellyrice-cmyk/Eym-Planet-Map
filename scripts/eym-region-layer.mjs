// The Region layer: the land at 300 m to a square, between the globe and the local detail. It is cut into
// tiles on a flat frame laid over each continent, so neighbouring tiles meet exactly and the whole layer
// can be made once and kept. It reads the same accepted cartography, the same pinned lattice of coarse
// facts and the same world-keyed noise as the local detail (eym-local-detail.mjs), and follows its rules
// for what covers the ground, so a wood or a town's fields on a region tile are the wood and the fields the
// local map shows. What is too fine for 300 m is left to the local layer: brooks, ponds, farmsteads.
// A tile is first its shapes (cover, height, shade, rivers, roads, settlements); pictures are made from
// those: a plain flat one for checking, and the pixel art. Pure: no canvas, no storage here.

import { fromLocal, greatCircleKm, toLocal } from "./eym-surface.mjs";
import { annualMeanTemperatureC } from "./eym-seasons.mjs";
import { COVER, COVER_COLORS, coarseAt, coastDistanceKm, globeNoise, hashUnit, landformsOf, localContext, roadsNear } from "./eym-local-detail.mjs";
import { blendedShoreAt, cliffLiftM, nearestRiver, valleyAt, windWorkAt } from "./eym-landforms.mjs";

// v2 (0.16.4): rivers from their channels, roads that follow the land, hills, hinterland farmland, smooth shore bands.
// v3 (Stage 3): river valleys (floodplains, gorges) and coasts by exposure, rock and tide (scripts/eym-landforms.mjs).
// v4 (Stage 3, wind): coasts by the swell and wind climate, coastal and inland dunes, loess (scripts/eym-aeolian.mjs).
// v5 (Stage 4): rivers as wide as the water they carry (scripts/eym-river-flow.mjs).
export const REGION_MODEL = "eym-region-layer-v5";
export const REGION_CELL_KM = 0.3, REGION_TILE_CELLS = 256, REGION_TILE_KM = REGION_CELL_KM * REGION_TILE_CELLS;
const PAD = 2, DEG = Math.PI / 180, R_KM = 6371;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const toKmVector = (lat, lon) => { const a = lat * DEG, b = lon * DEG; return [R_KM * Math.cos(a) * Math.cos(b), R_KM * Math.cos(a) * Math.sin(b), R_KM * Math.sin(a)]; };
const slug = (name) => name.toLowerCase().replace(/^the /, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const BIOME_FARMS = { "temperate-forest": 1, "seasonal-forest": 1, savanna: 0.85, steppe: 0.7, "temperate-rainforest": 0.6, "tropical-rainforest": 0.45, taiga: 0.25 };
const HINTERLAND_KM = 40; // how far from the nearest town fields still reach, thinning out
const BIOME_WOODS = { "tropical-rainforest": 0.85, "temperate-rainforest": 0.85, "temperate-forest": 0.7, taiga: 0.7, "seasonal-forest": 0.45, savanna: 0.15, steppe: 0.06, tundra: 0.03, "cold-desert": 0.02, "hot-desert": 0.01, "ice-cap": 0 };
const SETTLEMENT_RADIUS_KM = { capital: 1.2, city: 0.75, port: 0.42, town: 0.38, fort: 0.16, village: 0.18 };
const FARMLAND_KM = { capital: 14, city: 10, port: 6, town: 6, fort: 2, village: 4 };
/** The ground each kind of shore gives (scripts/eym-landforms.mjs). */
const SHORE_COVER = Object.freeze({ beach: COVER.beach, dunes: COVER.scrub, "dune-sand": COVER.beach, cliff: COVER.rock, marsh: COVER.marsh, mudflat: COVER.marsh, "delta-meadow": COVER.meadow });
/** The ground the wind leaves inland (scripts/eym-aeolian.mjs): grassed dunes, and bare rock where it scours. */
const AEOLIAN_COVER = Object.freeze({ dunes: COVER.scrub, pavement: COVER.rock, yardangs: COVER.rock });
const SEA_NEAR_CELLS = 40; // 12 km: sea bands nearer the shore than this are measured exactly, with this margin round the tile

// ---------------------------------------------------------------- frames and tiles

/**
 * Only Caren, Garyk and the sea directly between them get the Region layer (the owner's decision of 17
 * November 2026); the other continents and the rest of the ocean stay as the globe draws them. Each frame
 * keeps its number in the store (`z` of eym_tiles) for good: Caren and Garyk keep the numbers they had
 * when there were five frames, and the sea between them takes a new one.
 */
const DETAILED_CONTINENTS = [{ name: "Caren", store: 1 }, { name: "Garyk", store: 2 }];
const STRAIT = { id: "caren-garyk-sea", name: "The sea between Caren and Garyk", store: 5, halfWidthKm: 300 };

const tileRange = (cells) => {
  let tx0 = Infinity, tx1 = -Infinity, ty0 = Infinity, ty1 = -Infinity;
  for (const [tx, ty] of cells) { tx0 = Math.min(tx0, tx); tx1 = Math.max(tx1, tx); ty0 = Math.min(ty0, ty); ty1 = Math.max(ty1, ty); }
  return { tx0, tx1, ty0, ty1 };
};
const segmentDistance = ([ax, ay], [bx, by], x, y) => {
  const dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
  return Math.hypot(x - ax - t * dx, y - ay - t * dy);
};

/** A continent's frame: centred on its mainland, holding its mainland and its own islands, nothing else. */
function continentFrame(asset, { name, store }) {
  const own = asset.terrain.coastlines.filter((c) => c.continent === name), mainland = own.find((c) => c.kind === "mainland");
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const [lat, lon] of mainland.points) { minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat); minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon); }
  const center = [Math.round((minLat + maxLat) / 2 * 100) / 100, Math.round((minLon + maxLon) / 2 * 100) / 100];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of own) for (const [lat, lon] of c.points) { const [x, y] = toLocal(center, lat, lon); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  return { id: slug(name), name, store, center, tiles: { tx0: Math.floor(minX / REGION_TILE_KM), tx1: Math.floor(maxX / REGION_TILE_KM), ty0: Math.floor(-maxY / REGION_TILE_KM), ty1: Math.floor(-minY / REGION_TILE_KM) } };
}

/**
 * The sea between the two: a frame of its own, centred midway along the shortest line between their coasts
 * (islands included), so the flat frame stays true to within a few per cent along its whole length. It holds
 * the tiles within 300 km of that line, a corridor some 600 km wide, and no others.
 */
function straitFrame(asset) {
  const coast = (name) => asset.terrain.coastlines.filter((c) => c.continent === name).flatMap((c) => c.points);
  const a = coast(DETAILED_CONTINENTS[0].name), b = coast(DETAILED_CONTINENTS[1].name);
  let best = Infinity, ends = null;
  for (const p of a) for (const q of b) { const d = greatCircleKm(p, q); if (d < best) { best = d; ends = [p, q]; } }
  const [ax, ay] = toLocal(ends[0], ...ends[1]), mid = fromLocal(ends[0], ax / 2, ay / 2), center = [Math.round(mid[0] * 100) / 100, Math.round(mid[1] * 100) / 100];
  const from = toLocal(center, ...ends[0]).map((v) => Math.round(v * 10) / 10), to = toLocal(center, ...ends[1]).map((v) => Math.round(v * 10) / 10);
  const corridor = { from, to, halfWidthKm: STRAIT.halfWidthKm }, reach = Math.ceil((Math.max(Math.abs(from[0]), Math.abs(to[0]), Math.abs(from[1]), Math.abs(to[1])) + STRAIT.halfWidthKm) / REGION_TILE_KM) + 1, cells = [];
  for (let ty = -reach; ty <= reach; ty += 1) for (let tx = -reach; tx <= reach; tx += 1) if (inCorridor(corridor, tx, ty)) cells.push([tx, ty]);
  return { id: STRAIT.id, name: STRAIT.name, store: STRAIT.store, center, corridor, tiles: tileRange(cells) };
}

/** Whether a tile lies in a corridor: its centre within the half-width (and half a tile's diagonal) of the line. */
function inCorridor(corridor, tx, ty) {
  return segmentDistance(corridor.from, corridor.to, (tx + 0.5) * REGION_TILE_KM, -(ty + 0.5) * REGION_TILE_KM) <= corridor.halfWidthKm + REGION_TILE_KM * Math.SQRT1_2;
}

/**
 * The flat frames the layer is laid out on: Caren and Garyk, each with its own islands, and the sea between
 * them. Each has its centre, its number in the store, and the range of tiles that holds it: tile (tx, ty)
 * covers x from tx·76.8 km eastward and y from −ty·76.8 km southward of the centre.
 */
export function regionFrames(asset) {
  return [...DETAILED_CONTINENTS.map((c) => continentFrame(asset, c)), straitFrame(asset)];
}

/** Whether a tile belongs to a frame: inside its range and, for the sea between, inside the corridor. Nothing else is rendered or kept. */
export function regionFrameHasTile(frame, tx, ty) {
  const { tx0, tx1, ty0, ty1 } = frame.tiles;
  return tx >= tx0 && tx <= tx1 && ty >= ty0 && ty <= ty1 && (!frame.corridor || inCorridor(frame.corridor, tx, ty));
}

/** The tile of a frame that holds a place, and where in it (in squares from its north-west corner). */
export function regionTileAt(frame, lat, lon) {
  const [x, y] = toLocal(frame.center, lat, lon), tx = Math.floor(x / REGION_TILE_KM), ty = Math.floor(-y / REGION_TILE_KM);
  return { tx, ty, px: (x - tx * REGION_TILE_KM) / REGION_CELL_KM, py: (-y - ty * REGION_TILE_KM) / REGION_CELL_KM };
}

const projections = new WeakMap();
/** The cartography's outlines and lines laid on a frame (made once for each frame). */
function projected(ctx, frame) {
  let byFrame = projections.get(ctx); if (!byFrame) projections.set(ctx, (byFrame = new Map()));
  let p = byFrame.get(frame.id); if (p) return p;
  const lay = (ring) => { const xs = new Float64Array(ring.length), ys = new Float64Array(ring.length); let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity; for (let i = 0; i < ring.length; i += 1) { const [x, y] = toLocal(frame.center, ring[i][0], ring[i][1]); xs[i] = x; ys[i] = y; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; } return { xs, ys, minX, maxX, minY, maxY }; };
  const rings = (index) => index.map((r) => lay(r.ring));
  ctx.worldRoads ??= roadsNear(ctx, [0, 0], 1e9);
  p = { coasts: rings(ctx.coasts), waters: rings(ctx.waters), forest: rings(ctx.detail.forest), upland: rings(ctx.detail.upland), mountains: rings(ctx.detail.mountains), peaks: rings(ctx.detail.peaks),
    rivers: ctx.rivers.map((r) => ({ ...lay(r.points), widthM: r.widthM })), roads: ctx.worldRoads.map((r) => ({ ...lay(r.points), kind: r.kind, id: r.id })),
    settlements: ctx.settlements.map((s) => { const [x, y] = toLocal(frame.center, s.lat, s.lon); return { id: s.id, name: s.properName ?? "", kind: s.kind, x, y }; }) };
  byFrame.set(frame.id, p); return p;
}

/** Exact Euclidean distance (in squares) from every square to the nearest set square (Felzenszwalb's two passes). */
function distanceToSet(mask, n) {
  const INF = 1e12, f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1), g = new Float64Array(n * n);
  const pass = (get, put) => {
    for (let q = 0; q < n; q += 1) f[q] = get(q);
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < n; q += 1) { let s; for (;;) { s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); if (s <= z[k] && k > 0) k -= 1; else break; } if (s <= z[k]) { v[0] = q; z[0] = -INF; z[1] = INF; k = 0; continue; } k += 1; v[k] = q; z[k] = s; z[k + 1] = INF; }
    k = 0; for (let q = 0; q < n; q += 1) { while (z[k + 1] < q) k += 1; d[q] = (q - v[k]) ** 2 + f[v[k]]; put(q, d[q]); }
  };
  for (let c = 0; c < n; c += 1) pass((r) => (mask[r * n + c] ? 0 : INF), (r, val) => { g[r * n + c] = val; });
  for (let r = 0; r < n; r += 1) pass((c) => g[r * n + c], (c, val) => { g[r * n + c] = val; });
  for (let i = 0; i < n * n; i += 1) g[i] = Math.sqrt(g[i]);
  return g;
}

/**
 * How far each square of a tile lies off the land, in km (to 255). Within 12 km it is measured exactly
 * on the squares, from a window reaching 12 km past the tile, so neighbouring tiles agree; beyond that it is
 * the coarse distance, read on a grid of every eighth square of the frame (so tiles share their samples) and
 * blended smoothly between them.
 */
function seaDistance(ctx, p, frame, tx, ty, x0, yTop, n, res) {
  const M = SEA_NEAR_CELLS, wide = n + 2 * M, land = fill(p.coasts, x0 - M * res, yTop + M * res, wide, res);
  const near = land.some(Boolean) ? distanceToSet(land, wide) : null, out = new Float32Array(n * n), samples = new Map();
  const gx0 = tx * REGION_TILE_CELLS - PAD, gy0 = ty * REGION_TILE_CELLS - PAD;
  const coarse = (gx, gy) => { const key = `${gx},${gy}`; let v = samples.get(key); if (v === undefined) { const x = (gx + 0.5) * res, y = -(gy + 0.5) * res, [lat, lon] = fromLocal(frame.center, x, y); v = coarseAt(ctx, lat, lon).coastKm; samples.set(key, v); } return v; };
  for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) {
    const gx = gx0 + c, gy = gy0 + r, ax = Math.floor(gx / 8) * 8, ay = Math.floor(gy / 8) * 8, fx = (gx - ax) / 8, fy = (gy - ay) / 8;
    const far = (1 - fy) * ((1 - fx) * coarse(ax, ay) + fx * coarse(ax + 8, ay)) + fy * ((1 - fx) * coarse(ax, ay + 8) + fx * coarse(ax + 8, ay + 8));
    const exact = near ? near[(r + M) * wide + c + M] * res : Infinity;
    out[r * n + c] = Math.min(255, exact < M * res ? exact : Math.max(far, M * res));
  }
  return out;
}

/** Even-odd fill of outlines laid on a frame into an n×n window (north-west corner x0, yTop; squares of `res` km). */
function fill(outlines, x0, yTop, n, res) {
  const out = new Uint8Array(n * n), x1 = x0 + n * res, yBottom = yTop - n * res, live = outlines.filter((o) => o.maxX >= x0 && o.minX <= x1 && o.maxY >= yBottom && o.minY <= yTop);
  if (!live.length) return out;
  const cuts = [];
  for (let row = 0; row < n; row += 1) {
    const y = yTop - (row + 0.5) * res; cuts.length = 0;
    for (const o of live) { if (y < o.minY || y > o.maxY) continue; const { xs, ys } = o, m = xs.length; for (let i = 0, j = m - 1; i < m; j = i++) if ((ys[j] > y) !== (ys[i] > y)) cuts.push(xs[j] + (y - ys[j]) / (ys[i] - ys[j]) * (xs[i] - xs[j])); }
    cuts.sort((a, b) => a - b);
    for (let k = 0; k + 1 < cuts.length; k += 2) { const c0 = Math.max(0, Math.ceil((cuts[k] - x0) / res - 0.5)), c1 = Math.min(n - 1, Math.floor((cuts[k + 1] - x0) / res - 0.5)); for (let c = c0; c <= c1; c += 1) out[row * n + c] = 1; }
  }
  return out;
}

/**
 * The shapes of one region tile. Arrays are (256 + 4)² squares: the tile with a margin of two all round,
 * so pictures can be drawn right to the edge and still match the neighbour.
 * @returns { model, frame, tx, ty, cells, pad, cover, elevation, shade, coastKm, rivers, roads, settlements, sea }
 */
export function buildRegionTile(asset, frame, tx, ty) {
  const ctx = localContext(asset), p = projected(ctx, frame), res = REGION_CELL_KM, n = REGION_TILE_CELLS + 2 * PAD, x0 = tx * REGION_TILE_KM - PAD * res, yTop = -ty * REGION_TILE_KM + PAD * res;
  const landMask = fill(p.coasts, x0, yTop, n, res), cover = new Uint8Array(n * n), elevation = new Int16Array(n * n), shade = new Uint8Array(n * n).fill(75), coastKm = new Uint8Array(n * n);
  const cellXY = (c, r) => [x0 + (c + 0.5) * res, yTop - (r + 0.5) * res], inTile = (o, slack = 1) => o.maxX >= x0 - slack && o.minX <= x0 + n * res + slack && o.maxY >= yTop - n * res - slack && o.minY <= yTop + slack;
  if (!landMask.some(Boolean)) {
    // Open sea: only how far off the land it lies.
    const far = seaDistance(ctx, p, frame, tx, ty, x0, yTop, n, res); for (let i = 0; i < n * n; i += 1) coastKm[i] = Math.round(far[i]);
    return { model: REGION_MODEL, frame: frame.id, tx, ty, cells: REGION_TILE_CELLS, pad: PAD, cover, elevation, shade, coastKm, rivers: [], roads: [], settlements: [], sea: true };
  }
  const waterMask = fill(p.waters, x0, yTop, n, res), forestMask = fill(p.forest, x0, yTop, n, res), relief = [fill(p.upland, x0, yTop, n, res), fill(p.mountains, x0, yTop, n, res), fill(p.peaks, x0, yTop, n, res)];
  // Rivers, burned in a square wide (two for the great ones), and kept as lines for the picture.
  const toCell = (x, y) => [(x - x0) / res, (yTop - y) / res], riverMask = new Uint8Array(n * n), rivers = [];
  for (const river of p.rivers) {
    if (!inTile(river)) continue; const line = []; let touched = false;
    for (let k = 0; k < river.xs.length; k += 1) {
      const [c, r] = toCell(river.xs[k], river.ys[k]); line.push([c - PAD, r - PAD]);
      if (k) { const [pc, pr] = toCell(river.xs[k - 1], river.ys[k - 1]), steps = Math.max(1, Math.ceil(Math.max(Math.abs(c - pc), Math.abs(r - pr)) * 2)); for (let s = 0; s <= steps; s += 1) { const qc = Math.floor(pc + (c - pc) * s / steps), qr = Math.floor(pr + (r - pr) * s / steps); if (river.widthM < 450) { for (let w = 0; w < (river.widthM >= 250 ? 2 : 1); w += 1) if (qc + w >= 0 && qr >= 0 && qc + w < n && qr < n) { riverMask[qr * n + qc + w] = 1; touched = true; } continue; }
        // a broad river: a round brush along the course, its banks a little uneven, keyed to the world square so tiles meet
        const fc = pc + (c - pc) * s / steps, fr = pr + (r - pr) * s / steps, rad = river.widthM / (2000 * res);
        for (let rr = Math.floor(fr - rad - 1); rr <= Math.ceil(fr + rad + 1); rr += 1) for (let cc = Math.floor(fc - rad - 1); cc <= Math.ceil(fc + rad + 1); cc += 1) {
          if (cc < 0 || rr < 0 || cc >= n || rr >= n) continue;
          const wx = tx * REGION_TILE_CELLS + cc - PAD, wy = ty * REGION_TILE_CELLS + rr - PAD, bank = (hashUnit(`${frame.id}|${wx}|${wy}|bank`) - 0.5) * 0.7;
          if (Math.hypot(cc + 0.5 - fc, rr + 0.5 - fr) <= rad + bank) { riverMask[rr * n + cc] = 1; touched = true; }
        } } }
    }
    if (touched) rivers.push({ widthM: river.widthM, line });
  }
  // Roads near the tile (fields line them a little way out), and the towns whose ground reaches it.
  const towns = p.settlements.filter((s) => s.x > x0 - HINTERLAND_KM && s.x < x0 + n * res + HINTERLAND_KM && s.y < yTop + HINTERLAND_KM && s.y > yTop - n * res - HINTERLAND_KM);
  const roads = p.roads.filter((road) => inTile(road, 2)), near = p.settlements.filter((s) => s.x > x0 - 10 && s.x < x0 + n * res + 10 && s.y < yTop + 10 && s.y > yTop - n * res - 10).map((s) => ({ ...s, radiusKm: SETTLEMENT_RADIUS_KM[s.kind] ?? 0.3, farmKm: FARMLAND_KM[s.kind] ?? 2 }));
  const roadSide = new Float32Array(n * n), band = 1.4;
  for (const road of roads) for (let k = 0; k + 1 < road.xs.length; k += 1) {
    const ax = road.xs[k], ay = road.ys[k], bx = road.xs[k + 1], by = road.ys[k + 1], c0 = Math.floor((Math.min(ax, bx) - band - x0) / res), c1 = Math.ceil((Math.max(ax, bx) + band - x0) / res), r0 = Math.floor((yTop - Math.max(ay, by) - band) / res), r1 = Math.ceil((yTop - Math.min(ay, by) + band) / res);
    for (let r = Math.max(0, r0); r <= Math.min(n - 1, r1); r += 1) for (let c = Math.max(0, c0); c <= Math.min(n - 1, c1); c += 1) { const [x, y] = cellXY(c, r), dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1), d = Math.hypot(x - ax - t * dx, y - ay - t * dy); if (d < band) roadSide[r * n + c] = Math.max(roadSide[r * n + c], 0.55 * (1 - d / band)); }
  }
  // Height and the coarse facts, square by square.
  const facts = new Array(n * n), height = new Float32Array(n * n);
  for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) {
    const i = r * n + c, [x, y] = cellXY(c, r), [lat, lon] = fromLocal(frame.center, x, y), f = coarseAt(ctx, lat, lon), v = toKmVector(lat, lon);
    // The climate field changes kind along whole degrees of latitude and longitude: read the biome a noisy way off, so its edges wander.
    f.biome = coarseAt(ctx, lat + 0.3 * globeNoise(v, 40, 5, 61), lon + 0.3 * globeNoise(v, 40, 5, 67)).biome;
    f.lat = lat; f.v = v; f.land = Boolean(landMask[i]); f.water = f.land && Boolean(waterMask[i]); f.reliefClass = relief[2][i] ? 3 : relief[1][i] ? 2 : relief[0][i] ? 1 : 0; f.forestMask = Boolean(forestMask[i]);
    const rough = 15 + 70 * f.relief + 120 * Math.max(0, f.relief - 1.5) ** 2;
    // Hill country: ridges and dells a few kilometres across, so uplands read as hills and not as a raised plain.
    const hills = 140 * Math.min(1, f.relief) * (1 - 2 * Math.abs(globeNoise(v, 9, 1.2, 17)));
    // The river's valley (scripts/eym-landforms.mjs): cut down, and smoothed on the floodplain.
    f.valley = f.land ? valleyAt(nearestRiver(landformsOf(ctx), lat, lon), f, globeNoise(v, 2.5, 0.4, 29)) : null;
    // The wind's work (scripts/eym-aeolian.mjs): dunes and yardangs, and a loess blanket that smooths the hills.
    f.wind = f.land ? windWorkAt(landformsOf(ctx), lat, lon, globeNoise(v, 3, 0.5, 31), globeNoise(v, 1.5, 0.3, 37)) : null;
    const keep = (f.valley ? f.valley.roughness : 1) * (f.wind ? (f.wind.aeolian?.roughness ?? 1) * (1 - 0.5 * clamp(f.wind.loessM / 10, 0, 1)) : 1);
    height[i] = f.land ? Math.max(f.water ? 2 : 1, f.elevationM - (f.valley ? f.valley.carveM : 0) + (f.wind?.aeolian?.liftM ?? 0) + keep * (rough * globeNoise(v, 6, 0.6, 11) + hills)) : Math.min(-2, f.elevationM);
    facts[i] = f; elevation[i] = clamp(Math.round(height[i]), -32000, 32000);
  }
  const offshore = seaDistance(ctx, p, frame, tx, ty, x0, yTop, n, res); for (let i = 0; i < n * n; i += 1) coastKm[i] = facts[i].land ? Math.min(255, Math.round(facts[i].coastKm)) : Math.round(offshore[i]);
  // The shore (scripts/eym-landforms.mjs): within a few kilometres of the sea, measured exactly to the coastline
  // (so neighbouring tiles agree), the coast's character sets the ground and its height.
  const lf = landformsOf(ctx);
  for (let i = 0; i < n * n; i += 1) {
    const f = facts[i]; if (!f.land || f.water || f.coastKm > 27) continue;
    const [lat, lon] = fromLocal(frame.center, ...cellXY(i % n, Math.floor(i / n)));
    const seaKm = coastDistanceKm(ctx, lat, lon); if (seaKm > 25) continue;
    // Only a cliff coast's lift reaches far inland.
    const lift = cliffLiftM(lf, lat, lon, f.relief, seaKm, res); if (lift > 0) { height[i] += lift; elevation[i] = clamp(Math.round(height[i]), -32000, 32000); }
    if (seaKm > 12) continue;
    const s = blendedShoreAt(lf, lat, lon, f.relief, seaKm, globeNoise(f.v, 2.5, 0.15, 7), height[i], res, globeNoise(f.v, 0.4, 0.05, 9));
    if (!s) continue;
    f.shore = s.ground; if (s.elevationM != null) { height[i] = Math.max(1, s.elevationM); elevation[i] = clamp(Math.round(height[i]), -32000, 32000); }
  }
  for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) {
    const i = r * n + c, f = facts[i];
    if (!f.land) { cover[i] = COVER.sea; continue; }
    if (f.water) { cover[i] = COVER.lake; continue; }
    if (riverMask[i]) { cover[i] = COVER.river; continue; }
    const [x, y] = cellXY(c, r), e = height[i], dzx = (height[r * n + Math.min(n - 1, c + 1)] - height[r * n + Math.max(0, c - 1)]) / (2 * res * 1000), dzy = (height[Math.min(n - 1, r + 1) * n + c] - height[Math.max(0, r - 1) * n + c]) / (2 * res * 1000);
    const slope = Math.hypot(dzx, dzy); shade[i] = Math.round(100 * clamp(0.75 + (-dzx * 0.7 + dzy * 0.7) * 9, 0.3, 1.3));
    // (The local layer's finest variation, under a kilometre, averages away over a 300 m square and its neighbours:
    // here the ground changes in clumps of a kilometre or more, which is also what reads at this scale.)
    const temp = annualMeanTemperatureC(f.lat, e), n1 = globeNoise(f.v, 5, 1.2, 3), n2 = globeNoise(f.v, 2.4, 1.2, 5);
    let settled = Infinity, farming = 0;
    for (const s of near) { const d = Math.hypot(x - s.x, y - s.y); settled = Math.min(settled, d / Math.max(s.radiusKm, res * 0.75)); farming = Math.max(farming, 1 - d / s.farmKm); }
    farming = Math.max(farming, roadSide[i]);
    // The hinterland: good, level, low ground is farmed well beyond the named towns (the villages are not in the data), thinning out with distance from them.
    let townKm = Infinity; for (const s of towns) townKm = Math.min(townKm, Math.hypot(x - s.x, y - s.y));
    // Loess (scripts/eym-aeolian.mjs) makes deep, easily worked, very fertile ground.
    const arable = (BIOME_FARMS[f.biome] ?? 0) * (1 + 0.8 * (f.wind?.fertility ?? 0)) * clamp(1 - e / 1400, 0, 1) * clamp(1 - Math.max(0, f.relief - 0.4), 0, 1) * clamp((f.precipMm - 350) / 400, 0, 1);
    farming = Math.max(farming, 0.42 * arable * clamp(1 - townKm / HINTERLAND_KM, 0, 1));
    const rugged = Math.max(f.relief, f.reliefClass);
    if (temp < -3 || (f.relief > 2.4 && temp < 1)) cover[i] = COVER.snow;
    else if (slope > 0.45 || (rugged > 1.8 && n1 > 0.25)) cover[i] = COVER.rock;
    else if (settled < 1 + 0.35 * n1) cover[i] = COVER.built;
    else if (f.shore && SHORE_COVER[f.shore] !== undefined) cover[i] = SHORE_COVER[f.shore];
    else if (f.wind?.aeolian?.ground && farming < 0.3) cover[i] = AEOLIAN_COVER[f.wind.aeolian.ground];
    else if (slope < 0.01 && e < 14 && f.precipMm > 900 && n1 > 0.28) cover[i] = COVER.marsh;
    // Floodplains: backswamps beside the river in wet country.
    else if (f.valley?.inner && f.valley.widthM >= 200 && slope < 0.02 && f.precipMm > 900 && n1 > 0.25 && farming < 0.2) cover[i] = COVER.marsh;
    else {
      const woods = clamp((BIOME_WOODS[f.biome] ?? 0.4) * 0.6 + (0.6 * f.forestShare + 0.4 * (f.forestMask ? 1 : 0)) * 0.55 - (temp < 2 ? 0.4 : 0), 0, 1);
      if (slope < 0.14 && farming > 0 && n1 * 0.6 + n2 * 0.25 + farming > 0.3 + 0.3 * f.forestShare) cover[i] = COVER.farmland;
      else if (n1 * 0.5 + n2 * 0.35 + (woods - 0.5) > 0.12) cover[i] = COVER.woods;
      else if (n1 * 0.5 + n2 * 0.35 + (woods - 0.5) > -0.1) cover[i] = COVER.scrub;
      else cover[i] = COVER.meadow;
    }
  }
  const lineOf = (o) => Array.from(o.xs, (x, k) => { const [c, r] = toCell(x, o.ys[k]); return [c - PAD, r - PAD]; });
  return { model: REGION_MODEL, frame: frame.id, tx, ty, cells: REGION_TILE_CELLS, pad: PAD, cover, elevation, shade, coastKm, rivers,
    roads: roads.map((road) => ({ id: road.id, kind: road.kind, line: lineOf(road) })),
    settlements: near.filter((s) => s.x >= x0 + PAD * res && s.x < x0 + (n - PAD) * res && s.y <= yTop - PAD * res && s.y > yTop - (n - PAD) * res).map((s) => { const [c, r] = toCell(s.x, s.y); return { id: s.id, name: s.name, kind: s.kind, px: c - PAD, py: r - PAD }; }), sea: false };
}

// ---------------------------------------------------------------- pictures

const at = (tile, c, r) => (r + tile.pad) * (tile.cells + 2 * tile.pad) + c + tile.pad;
/** Draw a line of the tile's own coordinates onto its picture, one pixel at a time. */
function strokeLine(tile, line, plot) {
  for (let k = 0; k + 1 < line.length; k += 1) {
    const [ac, ar] = line[k], [bc, br] = line[k + 1]; if (Math.max(ac, bc) < -1 || Math.min(ac, bc) > tile.cells + 1 || Math.max(ar, br) < -1 || Math.min(ar, br) > tile.cells + 1) continue;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(bc - ac), Math.abs(br - ar)) * 2));
    for (let s = 0; s <= steps; s += 1) { const c = Math.floor(ac + (bc - ac) * s / steps), r = Math.floor(ar + (br - ar) * s / steps); if (c >= 0 && r >= 0 && c < tile.cells && r < tile.cells) plot(c, r); }
  }
}

/** The plain picture for checking the shapes: each square its cover's flat colour, shaded by the hills; roads and towns marked. RGBA, 256×256. */
export function flatRegionTile(tile) {
  const N = tile.cells, out = new Uint8ClampedArray(N * N * 4), set = (c, r, col) => { const o = (r * N + c) * 4; out[o] = col[0]; out[o + 1] = col[1]; out[o + 2] = col[2]; out[o + 3] = 255; };
  for (let r = 0; r < N; r += 1) for (let c = 0; c < N; c += 1) { const i = at(tile, c, r), k = tile.cover[i], base = COVER_COLORS[k] ?? [255, 0, 255], s = k <= COVER.stream ? 1 : tile.shade[i] / 100; set(c, r, [base[0] * s, base[1] * s, base[2] * s]); }
  for (const road of tile.roads) strokeLine(tile, road.line, (c, r) => { if (tile.cover[at(tile, c, r)] > COVER.stream) set(c, r, road.kind === "highway" ? [96, 66, 38] : [138, 106, 68]); });
  for (const s of tile.settlements) for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) { const c = Math.floor(s.px) + dc, r = Math.floor(s.py) + dr; if (c >= 0 && r >= 0 && c < N && r < N) set(c, r, [200, 40, 40]); }
  return out;
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const ramp = (...tones) => tones.map(hex);
/** The pixel-art palette of the region layer: a ramp of tones, dark to light, for each kind of ground. */
export const REGION_PALETTE = Object.freeze({
  sea: ramp("#17386a", "#1d4a80", "#24609a", "#3a86b8", "#62b0cc"),
  fresh: ramp("#3a7fb0", "#4a9ccc", "#6ab4dc"),
  [COVER.beach]: ramp("#c9b27a", "#dcc790", "#ecdcae"),
  [COVER.marsh]: ramp("#4c6a52", "#5f8060", "#76966c"),
  [COVER.meadow]: ramp("#5f8a3a", "#74a044", "#8ab452", "#a2c666"),
  [COVER.farmland]: ramp("#9c8a3c", "#b8a548", "#cdbd5c", "#86a548"),
  [COVER.scrub]: ramp("#55703a", "#688646", "#7c9a54"),
  [COVER.woods]: ramp("#1f4a2a", "#2c6234", "#3a7a3e", "#4e9048"),
  [COVER.rock]: ramp("#54483e", "#74665a", "#968676", "#b8aa98"),
  [COVER.snow]: ramp("#9fb2c8", "#c4d2e2", "#e6eef6", "#ffffff"),
  [COVER.built]: ramp("#6a4032", "#8c5440", "#b06c4c", "#d8c8a8"),
  coast: hex("#1c2a1e"), road: hex("#7a5a34"), highway: hex("#4a321c"),
});
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * The pixel art of a tile, a pixel to a square (RGBA, 256×256): the sea in bands by its distance from land,
 * a dark line along the coast, the ground in a few tones lit from the north-west, woods flecked with crowns,
 * fields in strips, towns as clusters of roofs, roads as thin lines. Everything is tied to the world, not
 * to the tile, so neighbouring tiles join without a seam.
 */
export function renderRegionTile(tile) {
  const N = tile.cells, P = REGION_PALETTE, out = new Uint8ClampedArray(N * N * 4), gx = tile.tx * N, gy = tile.ty * N;
  const set = (c, r, col) => { const o = (r * N + c) * 4; out[o] = col[0]; out[o + 1] = col[1]; out[o + 2] = col[2]; out[o + 3] = 255; };
  const isSea = (c, r) => tile.cover[at(tile, c, r)] === COVER.sea;
  for (let r = 0; r < N; r += 1) for (let c = 0; c < N; c += 1) {
    // World pixel coordinates within the frame: patterns keyed to them run on across tile edges.
    const i = at(tile, c, r), k = tile.cover[i], wx = gx + c, wy = gy + r, dither = (BAYER[(wy & 3) * 4 + (wx & 3)] + 0.5) / 16, grain = hashUnit(`${tile.frame}|${wx}|${wy}`);
    if (k === COVER.sea) { const d = tile.coastKm[i], band = d < 1.2 ? 1 : d < 4 ? 0.75 : d < 12 ? 0.5 : d < 40 ? 0.25 : 0.02; set(c, r, P.sea[clamp(Math.floor(band * 4 + (grain - 0.5) * 0.3 + dither * 0.4), 0, 4)]); continue; }
    if (k === COVER.lake || k === COVER.river || k === COVER.stream) { set(c, r, P.fresh[k === COVER.lake ? (grain > 0.9 ? 2 : 1) : 1]); continue; }
    if (isSea(c + 1, r) || isSea(c - 1, r) || isSea(c, r + 1) || isSea(c, r - 1)) { set(c, r, k === COVER.beach ? P[COVER.beach][1] : P.coast); continue; }
    const tones = P[k] ?? P[COVER.meadow], light = clamp((tile.shade[i] - 35) / 90, 0, 1);
    let t = clamp(Math.floor(light * (tones.length - 1) + dither), 0, tones.length - 1);
    if (k === COVER.woods) t = clamp(t + (grain > 0.82 ? 1 : grain < 0.2 ? -1 : 0), 0, tones.length - 1); // crowns and the gaps between
    else if (k === COVER.farmland) { const strip = hashUnit(`${tile.frame}|field|${wx >> 2}|${wy >> 2}`); t = strip < 0.3 ? 3 : strip < 0.55 ? 2 : strip < 0.8 ? 1 : 0; if (strip < 0.5 ? (wx & 1) === 0 : (wy & 1) === 0) t = Math.max(0, t === 3 ? 3 : t - 1); } // a patchwork of strips
    else if (k === COVER.built) t = grain > 0.7 ? 3 : grain > 0.35 ? 2 : grain > 0.12 ? 1 : 0; // roofs and the lanes between
    set(c, r, tones[t]);
  }
  for (const road of tile.roads) strokeLine(tile, road.line, (c, r) => { const k = tile.cover[at(tile, c, r)]; if (k > COVER.stream && k !== COVER.built) set(c, r, road.kind === "highway" ? P.highway : P.road); });
  return out;
}
