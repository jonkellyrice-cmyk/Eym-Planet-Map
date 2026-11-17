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
import { COVER, COVER_COLORS, coarseAt, globeNoise, hashUnit, localContext, roadsNear } from "./eym-local-detail.mjs";

export const REGION_MODEL = "eym-region-layer-v1";
export const REGION_CELL_KM = 0.3, REGION_TILE_CELLS = 256, REGION_TILE_KM = REGION_CELL_KM * REGION_TILE_CELLS;
const PAD = 2, DEG = Math.PI / 180, R_KM = 6371;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const toKmVector = (lat, lon) => { const a = lat * DEG, b = lon * DEG; return [R_KM * Math.cos(a) * Math.cos(b), R_KM * Math.cos(a) * Math.sin(b), R_KM * Math.sin(a)]; };
const slug = (name) => name.toLowerCase().replace(/^the /, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const BIOME_WOODS = { "tropical-rainforest": 0.85, "temperate-rainforest": 0.85, "temperate-forest": 0.7, taiga: 0.7, "seasonal-forest": 0.45, savanna: 0.15, steppe: 0.06, tundra: 0.03, "cold-desert": 0.02, "hot-desert": 0.01, "ice-cap": 0 };
const SETTLEMENT_RADIUS_KM = { capital: 1.2, city: 0.75, port: 0.42, town: 0.38, fort: 0.16, village: 0.18 };
const FARMLAND_KM = { capital: 9, city: 6, port: 3, town: 3.5, fort: 1.2, village: 2 };

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
    // Open sea: only how far off the land it lies (read on the coarse lattice, a few squares apart).
    for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) { const cr = Math.min(n - 1, (r >> 3 << 3) + 4), cc = Math.min(n - 1, (c >> 3 << 3) + 4); if (r === cr && c === cc) { const [x, y] = cellXY(c, r), [lat, lon] = fromLocal(frame.center, x, y); coastKm[r * n + c] = Math.min(255, coarseAt(ctx, lat, lon).coastKm); } }
    for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) coastKm[r * n + c] = coastKm[Math.min(n - 1, (r >> 3 << 3) + 4) * n + Math.min(n - 1, (c >> 3 << 3) + 4)];
    return { model: REGION_MODEL, frame: frame.id, tx, ty, cells: REGION_TILE_CELLS, pad: PAD, cover, elevation, shade, coastKm, rivers: [], roads: [], settlements: [], sea: true };
  }
  const waterMask = fill(p.waters, x0, yTop, n, res), forestMask = fill(p.forest, x0, yTop, n, res), relief = [fill(p.upland, x0, yTop, n, res), fill(p.mountains, x0, yTop, n, res), fill(p.peaks, x0, yTop, n, res)];
  // Rivers, burned in a square wide (two for the great ones), and kept as lines for the picture.
  const toCell = (x, y) => [(x - x0) / res, (yTop - y) / res], riverMask = new Uint8Array(n * n), rivers = [];
  for (const river of p.rivers) {
    if (!inTile(river)) continue; const line = []; let touched = false;
    for (let k = 0; k < river.xs.length; k += 1) {
      const [c, r] = toCell(river.xs[k], river.ys[k]); line.push([c - PAD, r - PAD]);
      if (k) { const [pc, pr] = toCell(river.xs[k - 1], river.ys[k - 1]), steps = Math.max(1, Math.ceil(Math.max(Math.abs(c - pc), Math.abs(r - pr)) * 2)); for (let s = 0; s <= steps; s += 1) { const qc = Math.floor(pc + (c - pc) * s / steps), qr = Math.floor(pr + (r - pr) * s / steps); for (let w = 0; w < (river.widthM >= 250 ? 2 : 1); w += 1) if (qc + w >= 0 && qr >= 0 && qc + w < n && qr < n) { riverMask[qr * n + qc + w] = 1; touched = true; } } }
    }
    if (touched) rivers.push({ widthM: river.widthM, line });
  }
  // Roads near the tile (fields line them a little way out), and the towns whose ground reaches it.
  const roads = p.roads.filter((road) => inTile(road, 2)), near = p.settlements.filter((s) => s.x > x0 - 10 && s.x < x0 + n * res + 10 && s.y < yTop + 10 && s.y > yTop - n * res - 10).map((s) => ({ ...s, radiusKm: SETTLEMENT_RADIUS_KM[s.kind] ?? 0.3, farmKm: FARMLAND_KM[s.kind] ?? 2 }));
  const roadSide = new Float32Array(n * n), band = 0.6;
  for (const road of roads) for (let k = 0; k + 1 < road.xs.length; k += 1) {
    const ax = road.xs[k], ay = road.ys[k], bx = road.xs[k + 1], by = road.ys[k + 1], c0 = Math.floor((Math.min(ax, bx) - band - x0) / res), c1 = Math.ceil((Math.max(ax, bx) + band - x0) / res), r0 = Math.floor((yTop - Math.max(ay, by) - band) / res), r1 = Math.ceil((yTop - Math.min(ay, by) + band) / res);
    for (let r = Math.max(0, r0); r <= Math.min(n - 1, r1); r += 1) for (let c = Math.max(0, c0); c <= Math.min(n - 1, c1); c += 1) { const [x, y] = cellXY(c, r), dx = bx - ax, dy = by - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1), d = Math.hypot(x - ax - t * dx, y - ay - t * dy); if (d < band) roadSide[r * n + c] = Math.max(roadSide[r * n + c], 0.35 * (1 - d / band)); }
  }
  // Height and the coarse facts, square by square.
  const facts = new Array(n * n), height = new Float32Array(n * n);
  for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) {
    const i = r * n + c, [x, y] = cellXY(c, r), [lat, lon] = fromLocal(frame.center, x, y), f = coarseAt(ctx, lat, lon), v = toKmVector(lat, lon);
    f.lat = lat; f.v = v; f.land = Boolean(landMask[i]); f.water = f.land && Boolean(waterMask[i]); f.reliefClass = relief[2][i] ? 3 : relief[1][i] ? 2 : relief[0][i] ? 1 : 0; f.forestMask = Boolean(forestMask[i]);
    const rough = 15 + 70 * f.relief + 120 * Math.max(0, f.relief - 1.5) ** 2;
    height[i] = f.land ? Math.max(f.water ? 2 : 1, f.elevationM + rough * globeNoise(v, 6, 0.6, 11)) : Math.min(-2, f.elevationM);
    facts[i] = f; elevation[i] = clamp(Math.round(height[i]), -32000, 32000); coastKm[i] = Math.min(255, f.coastKm);
  }
  const seaAt = (r, c) => r >= 0 && c >= 0 && r < n && c < n && !facts[r * n + c].land;
  for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) {
    const i = r * n + c, f = facts[i];
    if (!f.land) { cover[i] = COVER.sea; continue; }
    if (f.water) { cover[i] = COVER.lake; continue; }
    if (riverMask[i]) { cover[i] = COVER.river; continue; }
    const [x, y] = cellXY(c, r), e = height[i], dzx = (height[r * n + Math.min(n - 1, c + 1)] - height[r * n + Math.max(0, c - 1)]) / (2 * res * 1000), dzy = (height[Math.min(n - 1, r + 1) * n + c] - height[Math.max(0, r - 1) * n + c]) / (2 * res * 1000);
    const slope = Math.hypot(dzx, dzy); shade[i] = Math.round(100 * clamp(0.75 + (-dzx * 0.7 + dzy * 0.7) * 5, 0.35, 1.25));
    // (The local layer's finest variation, under a kilometre, averages away over a 300 m square and its neighbours:
    // here the ground changes in clumps of a kilometre or more, which is also what reads at this scale.)
    const temp = annualMeanTemperatureC(f.lat, e), n1 = globeNoise(f.v, 5, 1.2, 3), n2 = globeNoise(f.v, 2.4, 1.2, 5);
    let settled = Infinity, farming = 0;
    for (const s of near) { const d = Math.hypot(x - s.x, y - s.y); settled = Math.min(settled, d / Math.max(s.radiusKm, res * 0.75)); farming = Math.max(farming, 1 - d / s.farmKm); }
    farming = Math.max(farming, roadSide[i]);
    const rugged = Math.max(f.relief, f.reliefClass), shoreline = seaAt(r - 1, c) || seaAt(r + 1, c) || seaAt(r, c - 1) || seaAt(r, c + 1);
    if (temp < -3 || (f.relief > 2.4 && temp < 1)) cover[i] = COVER.snow;
    else if (slope > 0.45 || (rugged > 1.8 && n1 > 0.25)) cover[i] = COVER.rock;
    else if (settled < 1 + 0.35 * n1) cover[i] = COVER.built;
    else if (shoreline && e < 8 && n2 > -0.15) cover[i] = COVER.beach;
    else if (slope < 0.01 && e < 14 && f.precipMm > 900 && n1 > 0.28) cover[i] = COVER.marsh;
    else {
      const woods = clamp((BIOME_WOODS[f.biome] ?? 0.4) * 0.6 + (0.6 * f.forestShare + 0.4 * (f.forestMask ? 1 : 0)) * 0.55 - (temp < 2 ? 0.4 : 0), 0, 1);
      if (slope < 0.14 && farming > 0 && n1 * 0.6 + n2 * 0.25 + farming > 0.45 + 0.3 * f.forestShare) cover[i] = COVER.farmland;
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
