// Battle maps by rule. The world gives the ground (the battle site: cover, height, trees, rocks, water,
// roads, built-up land); these rules turn it into a Pathfinder 2e battlefield and then design it:
//
//   1. Snap the map to the world's 5-ft grid, so maps of the same place share squares.
//   2. Classify the setting (city, forest, marsh, glacier, volcano…) from the ground, biome and weather.
//   3. Terrain per square: movement (normal, difficult, greater difficult, hazardous, swim, climb,
//      impassable), cover, concealment and elevation, from the ground, its objects and the conditions
//      (deep snow, mud, ice).
//   4. Towns: streets, blocks, buildings with walls and doors, yards, a square — pinned to the world grid.
//   5. Design pass: two deployment zones; a hazard and contested high ground in the middle; a
//      centrepiece; then cover added where a side would cross too much open ground, until the setting's
//      cover target is met and both sides have a similar share of cover near them — never closing off a
//      route: every placement keeps at least two distinct routes between the zones and isolates nothing.
//   6. An analysis the GM can read: routes, choke points, cover, hazards, high ground, balance.
//
// Everything is deterministic: world features are pinned to the world; the design pass is keyed by the
// place, map size and setting, so the same request always gives the same map.

import { COVER, COVER_NAMES, battleAnchor, buildBattleSite, hashUnit } from "./eym-local-detail.mjs";
import { environmentField } from "./eym-seasons.mjs";
import { fromLocal, toLocal } from "./eym-surface.mjs";
import { FEATURES, MOVE, MOVE_COST, SETTINGS } from "./eym-battle-settings.mjs";

export const BATTLE_RULES_VERSION = "eym-battle-v1";
const SQUARE_KM = (5 * 0.3048) / 1000;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mod = (a, n) => ((a % n) + n) % n;

// ---------------------------------------------------------------- 1. the world grid

/** Move a map's centre (≤ half a square) so its squares line up with the world's 5-ft grid. */
export function snapToWorldGrid(center, spec) {
  let anchor = battleAnchor(center), snapped = center, origin = [0, 0];
  for (let pass = 0; pass < 3; pass += 1) {
    const [x, y] = toLocal(anchor, ...snapped), left = Math.round((x - (spec.columns * SQUARE_KM) / 2) / SQUARE_KM), top = Math.round((y + (spec.rows * SQUARE_KM) / 2) / SQUARE_KM);
    snapped = fromLocal(anchor, (left + spec.columns / 2) * SQUARE_KM, (top - spec.rows / 2) * SQUARE_KM); origin = [left, -top];
    const next = battleAnchor(snapped); if (next[0] === anchor[0] && next[1] === anchor[1]) break; anchor = next;
  }
  return { center: snapped, anchor, origin };
}

// ---------------------------------------------------------------- 2. the setting

/** Which setting the ground is: the rules in order, first match wins. */
export function classifySetting({ shares, biome, elevationM, reliefFt, conditions = {} }) {
  const s = (k) => shares[k] ?? 0, cold = (conditions.snowDepthCm ?? 0) > 30;
  if (s("built") >= 40) return "urban";
  if (s("built") >= 8) return "village";
  if (biome === "ice-cap" || (s("snow") >= 50 && elevationM < 1500)) return "glacier";
  if (s("snow") >= 40 || (elevationM > 2600 && cold)) return "alpine";
  if (s("rock") >= 35 || elevationM > 2200 || reliefFt >= 40) return elevationM > 1500 || reliefFt >= 40 ? "mountain" : "hills";
  if (s("sea") + s("beach") >= 15) return "coast";
  if (s("marsh") >= 30) return "marsh";
  if (s("stream") + s("river") >= 8) return "riverside";
  if (biome === "hot-desert") return "hot-desert";
  if (biome === "cold-desert") return "cold-desert";
  if (s("woods") >= 40) return biome === "tropical-rainforest" ? "jungle" : biome === "taiga" ? "taiga" : "forest";
  if (s("farmland") >= 35) return "farmland";
  if (biome === "tundra") return "tundra";
  if (s("scrub") >= 30 || biome === "savanna" || biome === "steppe") return "savanna";
  if (s("rock") >= 15) return "hills";
  return "grassland";
}

// ---------------------------------------------------------------- 3. terrain per square

const BASE_GROUND = Object.freeze({
  [COVER.sea]: ["deep water", MOVE.swim], [COVER.lake]: ["deep water", MOVE.swim], [COVER.river]: ["river", MOVE.swim], [COVER.stream]: ["shallow stream", MOVE.difficult],
  [COVER.beach]: ["sand", MOVE.normal], [COVER.marsh]: ["marsh", MOVE.difficult], [COVER.meadow]: ["grass", MOVE.normal], [COVER.farmland]: ["field", MOVE.normal],
  [COVER.scrub]: ["scrub", MOVE.normal], [COVER.woods]: ["forest floor", MOVE.normal], [COVER.rock]: ["bare rock", MOVE.difficult], [COVER.snow]: ["snow", MOVE.normal],
  [COVER.built]: ["yard", MOVE.normal], [COVER.road]: ["road", MOVE.normal],
});
const WATER = new Set([COVER.sea, COVER.lake, COVER.river, COVER.stream]);
const MUDDY = new Set(["field", "yard", "marsh", "wet meadow"]);
const OUTDOOR_SOFT = new Set(["grass", "field", "scrub", "marsh", "forest floor", "sand", "yard", "wet meadow"]);

function groundFor(cover, setting, conditions) {
  let [ground, move] = BASE_GROUND[cover] ?? ["grass", MOVE.normal];
  if (setting === "glacier" && cover === COVER.snow) [ground, move] = ["glacier ice", MOVE.difficult];
  if (setting === "volcanic" && !WATER.has(cover) && cover !== COVER.road) [ground, move] = cover === COVER.rock ? ["black rock", MOVE.difficult] : ["ash and cinders", MOVE.normal];
  if (setting === "hot-desert" && [COVER.meadow, COVER.scrub, COVER.farmland, COVER.beach].includes(cover)) ground = "sand";
  if (setting === "marsh" && cover === COVER.meadow) ground = "wet meadow";
  // Mud: when waterlogged, bare soil (fields, yards, marsh, sand) turns to mud; when flooding, all soft ground does.
  const snow = conditions.snowDepthCm ?? 0, frozen = (conditions.tempC ?? 10) <= -3;
  const wet = conditions.ground === "flooding" ? OUTDOOR_SOFT.has(ground) : conditions.ground === "waterlogged" && MUDDY.has(ground);
  if (frozen && cover === COVER.stream) [ground, move] = ["frozen stream", MOVE.difficult];
  if (!WATER.has(cover) && cover !== COVER.road && snow >= 15) [ground, move] = [snow >= 60 ? "deep snow" : "snow", snow >= 60 ? MOVE.greater : MOVE.difficult];
  else if (wet && cover !== COVER.road) [ground, move] = [`${ground} (mud)`, move === MOVE.normal ? MOVE.difficult : MOVE.greater];
  return [ground, move];
}

/** A blank grid of squares. */
function makeGrid(columns, rows) {
  const n = columns * rows;
  return { columns, rows, ground: new Array(n).fill("grass"), cover: new Uint8Array(n), move: new Array(n).fill(MOVE.normal), coverGiven: new Uint8Array(n), concealed: new Uint8Array(n), elevationFt: new Int16Array(n), feature: new Int16Array(n).fill(-1), building: new Int16Array(n).fill(-1), street: new Uint8Array(n), walls: new Map() };
}
const edgeKey = (x, y, dir) => `${x},${y},${dir}`; // dir: "e" (east edge of square x,y) or "s" (south edge)

// ---------------------------------------------------------------- 4. towns

/** The street and block pattern along one world-grid axis: [isStreet, blockIndex, positionInBlock, blockStart, blockEnd]. */
function axisPattern(index, period, key, urban) {
  const k = Math.floor(index / period), at = mod(index, period), width = urban ? (hashUnit(`${key}|w|${k}`) < 0.3 ? 3 : 2) : hashUnit(`${key}|w|${k}`) < 0.55 ? 2 : 0;
  return at < width ? { street: true, k } : { street: false, k, start: k * period + width, end: (k + 1) * period - 1 };
}

/** Split a block into lots (world-grid rectangles), deterministically. */
function lots(rect, key, minSide = 3, maxSide = 6) {
  const w = rect.x1 - rect.x0 + 1, h = rect.y1 - rect.y0 + 1;
  if (w <= maxSide && h <= maxSide) return [rect];
  const alongX = w >= h, len = alongX ? w : h, cut = minSide + Math.floor(hashUnit(`${key}|cut`) * Math.max(1, len - 2 * minSide + 1));
  if (len < 2 * minSide) return [rect];
  const [a, b] = alongX ? [{ ...rect, x1: rect.x0 + cut - 1 }, { ...rect, x0: rect.x0 + cut }] : [{ ...rect, y1: rect.y0 + cut - 1 }, { ...rect, y0: rect.y0 + cut }];
  return [...lots(a, `${key}a`, minSide, maxSide), ...lots(b, `${key}b`, minSide, maxSide)];
}

/** Lay out streets, buildings, yards and a square on the built-up squares (world-pinned). */
function layOutTown(grid, built, origin, setting, townKey, features) {
  const urban = setting === "urban", { columns, rows } = grid, buildings = [];
  const px = urban ? 11 : 15, py = urban ? 10 : 14;
  const at = (col, row) => [origin[0] + col, origin[1] + row];
  const inside = (gx, gy) => { const col = gx - origin[0], row = gy - origin[1]; return col >= 0 && row >= 0 && col < columns && row < rows; };
  const idx = (gx, gy) => (gy - origin[1]) * columns + (gx - origin[0]);
  const blocks = new Map();
  for (let row = 0; row < rows; row += 1) for (let col = 0; col < columns; col += 1) {
    const i = row * columns + col; if (!built[i]) continue;
    const [gx, gy] = at(col, row), ax = axisPattern(gx, px, `${townKey}|x`, urban), ay = axisPattern(gy, py, `${townKey}|y`, urban);
    if (ax.street || ay.street) { grid.street[i] = 1; grid.ground[i] = urban ? "cobbled street" : "dirt lane"; grid.move[i] = MOVE.normal; continue; }
    const key = `${ax.k}|${ay.k}`; if (!blocks.has(key)) blocks.set(key, { x0: ax.start, x1: ax.end, y0: ay.start, y1: ay.end, k: key });
  }
  for (const block of blocks.values()) {
    const blockKey = `${townKey}|block|${block.k}`;
    // A town square now and then: the whole block paved, with a centrepiece.
    if (urban && hashUnit(`${blockKey}|square`) < 0.12) {
      for (let gy = block.y0; gy <= block.y1; gy += 1) for (let gx = block.x0; gx <= block.x1; gx += 1) if (inside(gx, gy) && built[idx(gx, gy)]) { const i = idx(gx, gy); grid.street[i] = 1; grid.ground[i] = "paved square"; grid.move[i] = MOVE.normal; }
      const cx = Math.floor((block.x0 + block.x1) / 2), cy = Math.floor((block.y0 + block.y1) / 2);
      if (inside(cx, cy) && inside(cx + 1, cy + 1)) features.push({ kind: hashUnit(`${blockKey}|poi`) < 0.5 ? "fountain" : "statue", gx: cx, gy: cy, fixed: true });
      continue;
    }
    for (const lot of lots({ x0: block.x0, x1: block.x1, y0: block.y0, y1: block.y1 }, blockKey)) {
      const lotKey = `${blockKey}|${lot.x0}|${lot.y0}`, build = hashUnit(`${lotKey}|b`) < (urban ? 0.82 : 0.5);
      // Which sides of the lot face a street: houses stand on the street, yards and gardens behind.
      const faces = { n: lot.y0 === block.y0, s: lot.y1 === block.y1, w: lot.x0 === block.x0, e: lot.x1 === block.x1 };
      if (!build) { if (hashUnit(`${lotKey}|g`) < (urban ? 0.45 : 0.7)) features.push({ kind: urban ? (hashUnit(`${lotKey}|t`) < 0.5 ? "garden" : "planter-tree") : (hashUnit(`${lotKey}|t`) < 0.5 ? "garden" : "lone-tree"), gx: lot.x0 + 1, gy: lot.y0 + 1, fixed: true, soft: true }); continue; }
      const rect = { x0: lot.x0 + (faces.w || urban ? 0 : 1), x1: lot.x1 - (faces.e || urban ? 0 : 1), y0: lot.y0 + (faces.n ? 0 : 1), y1: lot.y1 - (faces.s ? 0 : 1) };
      if (rect.x1 - rect.x0 < 1 || rect.y1 - rect.y0 < 1) continue;
      const squares = []; let ok = true;
      for (let gy = rect.y0; gy <= rect.y1 && ok; gy += 1) for (let gx = rect.x0; gx <= rect.x1; gx += 1) { if (!inside(gx, gy)) continue; const i = idx(gx, gy); if (!built[i] || grid.street[i]) { ok = false; break; } squares.push(i); }
      if (!ok || squares.length < 2) continue;
      const id = buildings.length, door = ["n", "s", "w", "e"].filter((d) => faces[d])[Math.floor(hashUnit(`${lotKey}|door`) * Math.max(1, ["n", "s", "w", "e"].filter((d) => faces[d]).length))] ?? "s";
      buildings.push({ id, gx0: rect.x0, gy0: rect.y0, gx1: rect.x1, gy1: rect.y1, door, storeys: urban && hashUnit(`${lotKey}|h`) < 0.4 ? 2 : 1 });
      for (const i of squares) { grid.building[i] = id; grid.ground[i] = "floor"; grid.move[i] = MOVE.normal; }
    }
  }
  // Greenery: trees in planters along streets, beside the houses (pinned to the world grid).
  for (let row = 0; row < rows; row += 1) for (let col = 0; col < columns; col += 1) {
    const i = row * columns + col; if (!grid.street[i] || grid.ground[i] === "paved square") continue;
    const [gx, gy] = at(col, row), besideHouse = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const c = col + dx, r = row + dy; return c >= 0 && r >= 0 && c < columns && r < rows && grid.building[r * columns + c] >= 0; });
    if (besideHouse && hashUnit(`${townKey}|street-tree|${gx}|${gy}`) < (urban ? 0.12 : 0.08)) features.push({ kind: urban ? "planter-tree" : "lone-tree", gx, gy, fixed: true });
  }
  // Walls around each building (clipped to the map), with one door on a street side.
  for (const b of buildings) {
    const doorAt = { n: [Math.floor((b.gx0 + b.gx1) / 2), b.gy0], s: [Math.floor((b.gx0 + b.gx1) / 2), b.gy1], w: [b.gx0, Math.floor((b.gy0 + b.gy1) / 2)], e: [b.gx1, Math.floor((b.gy0 + b.gy1) / 2)] }[b.door];
    const wall = (gx, gy, side) => {
      const col = gx - origin[0], row = gy - origin[1]; if (col < 0 || row < 0 || col >= columns || row >= rows) return;
      const [x, y, dir] = side === "n" ? [col, row - 1, "s"] : side === "s" ? [col, row, "s"] : side === "w" ? [col - 1, row, "e"] : [col, row, "e"];
      const isDoor = side === b.door && gx === doorAt[0] && gy === doorAt[1];
      grid.walls.set(edgeKey(x, y, dir), { door: isDoor, building: b.id });
    };
    for (let gx = b.gx0; gx <= b.gx1; gx += 1) { wall(gx, b.gy0, "n"); wall(gx, b.gy1, "s"); }
    for (let gy = b.gy0; gy <= b.gy1; gy += 1) { wall(b.gx0, gy, "w"); wall(b.gx1, gy, "e"); }
  }
  return buildings.map((b) => ({ ...b, x0: b.gx0 - origin[0], y0: b.gy0 - origin[1], x1: b.gx1 - origin[0], y1: b.gy1 - origin[1] }));
}

// ---------------------------------------------------------------- 5. design pass: paths, open ground, placement

/** Whether a step between neighbouring squares crosses a wall (doors are open; no cutting wall corners). */
function blockedStep(grid, x, y, nx, ny) {
  const wall = (ax, ay, dir) => { const w = grid.walls.get(edgeKey(ax, ay, dir)); return Boolean(w && !w.door); };
  const orth = (ax, ay, bx, by) => (ax !== bx ? wall(Math.min(ax, bx), ay, "e") : by !== ay ? wall(ax, Math.min(ay, by), "s") : false);
  if (nx === x || ny === y) return orth(x, y, nx, ny);
  return orth(x, y, nx, y) || orth(nx, y, nx, ny) || orth(x, y, x, ny) || orth(x, ny, nx, ny);
}

/** Movement cost to enter a square (swimming counts as slow, impassable as Infinity). */
const squareCost = (grid, i, extra) => MOVE_COST[grid.move[i]] + (extra ? extra[i] : 0);

/** Least-cost distances from a set of squares (8-way, PF2e-ish diagonals at 1.5). */
function distances(grid, sources, extra = null) {
  const { columns, rows } = grid, n = columns * rows, dist = new Float64Array(n).fill(Infinity), done = new Uint8Array(n), prev = new Int32Array(n).fill(-1);
  const heap = []; const push = (i, d) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  for (const i of sources) if (Number.isFinite(MOVE_COST[grid.move[i]])) { dist[i] = 0; push(i, 0); }
  while (heap.length) {
    const [d, i] = pop(); if (done[i]) continue; done[i] = 1; const x = i % columns, y = Math.floor(i / columns);
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= columns || ny >= rows) continue;
      const j = ny * columns + nx; if (done[j]) continue; const c = squareCost(grid, j, extra); if (!Number.isFinite(c) || blockedStep(grid, x, y, nx, ny)) continue;
      const nd = d + c * (dx && dy ? 1.5 : 1); if (nd < dist[j]) { dist[j] = nd; prev[j] = i; push(j, nd); }
    }
  }
  return { dist, prev };
}

/** Up to three distinct routes between the deployment zones (each avoids the earlier ones where it can). */
function routes(grid, zones) {
  const n = grid.columns * grid.rows, extra = new Float64Array(n), found = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { dist, prev } = distances(grid, zones[0], extra);
    let end = -1; for (const i of zones[1]) if (dist[i] < (end < 0 ? Infinity : dist[end])) end = i;
    if (end < 0 || !Number.isFinite(dist[end])) break;
    const path = []; for (let k = end; k >= 0; k = prev[k]) path.push(k);
    path.reverse();
    const shared = found.length ? Math.max(...found.map((f) => path.filter((i) => f.set.has(i)).length / path.length)) : 0;
    if (shared < 0.5) found.push({ squares: path, set: new Set(path), cost: dist[end] - path.reduce((s, i) => s + extra[i], 0) });
    for (const i of path) { const x = i % grid.columns, y = Math.floor(i / grid.columns); for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < grid.columns && ny < grid.rows) extra[ny * grid.columns + nx] += 4; } }
  }
  return found;
}

/** Squares from which an obstacle gives cover (the obstacle itself, or next to it, or next to a wall). */
function shelteredSquares(grid) {
  const { columns, rows } = grid, out = new Uint8Array(columns * rows);
  const gives = (i) => grid.coverGiven[i] > 0 || grid.concealed[i] > 0;
  for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) {
    const i = y * columns + x; if (!Number.isFinite(MOVE_COST[grid.move[i]]) && !gives(i)) continue;
    let near = gives(i) || grid.building[i] >= 0;
    for (let dy = -1; dy <= 1 && !near; dy += 1) for (let dx = -1; dx <= 1 && !near; dx += 1) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < columns && ny < rows) { const j = ny * columns + nx; if (gives(j) || grid.building[j] >= 0) near = true; } }
    for (const k of [edgeKey(x, y, "e"), edgeKey(x - 1, y, "e"), edgeKey(x, y, "s"), edgeKey(x, y - 1, "s")]) if (grid.walls.has(k)) near = true;
    out[i] = near ? 1 : 0;
  }
  return out;
}

/** For each walkable square, how far (in squares, Chebyshev) to the nearest sheltered square. */
function openDistance(grid, sheltered) {
  const { columns, rows } = grid, n = columns * rows, d = new Float32Array(n).fill(99);
  const walk = (i) => Number.isFinite(MOVE_COST[grid.move[i]]) && grid.move[i] !== MOVE.swim;
  for (let i = 0; i < n; i += 1) if (sheltered[i] || !walk(i)) d[i] = 0;
  for (const pass of [0, 1]) for (let k = 0; k < n; k += 1) {
    const i = pass ? n - 1 - k : k, x = i % columns, y = Math.floor(i / columns); if (!d[i]) continue;
    for (const [dx, dy] of pass ? [[1, 0], [0, 1], [1, 1], [-1, 1]] : [[-1, 0], [0, -1], [-1, -1], [1, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < columns && ny < rows) d[i] = Math.min(d[i], d[ny * columns + nx] + 1); }
  }
  return d;
}

/** Squares reachable on foot from a set (counts walls). */
function reachable(grid, sources) { const { dist } = distances(grid, sources); let n = 0; for (const v of dist) if (Number.isFinite(v)) n += 1; return n; }

/** Paint a feature's squares onto the grid (returns the squares, or null if it does not fit). */
function footprintSquares(grid, kind, x, y, rotate, allowed) {
  const def = FEATURES[kind], [w, h] = rotate ? [def.footprint[1], def.footprint[0]] : def.footprint, out = [];
  for (let dy = 0; dy < h; dy += 1) for (let dx = 0; dx < w; dx += 1) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= grid.columns || ny >= grid.rows) return null; const i = ny * grid.columns + nx; if (!allowed(i)) return null; out.push(i); }
  return { squares: out, w, h };
}
function applyFeature(grid, id, kind, squares) {
  const def = FEATURES[kind], before = squares.map((i) => [i, grid.move[i], grid.coverGiven[i], grid.concealed[i], grid.elevationFt[i], grid.feature[i]]);
  for (const i of squares) { grid.move[i] = def.move; grid.coverGiven[i] = def.cover; grid.concealed[i] = def.concealed ? 1 : 0; grid.elevationFt[i] += def.heightFt; grid.feature[i] = id; }
  return () => { for (const [i, m, c, k, e, f] of before) { grid.move[i] = m; grid.coverGiven[i] = c; grid.concealed[i] = k; grid.elevationFt[i] = e; grid.feature[i] = f; } };
}

/** Pick by weight with a hash (deterministic). */
function weighted(weights, u) {
  const entries = Object.entries(weights).filter(([k]) => FEATURES[k]); const total = entries.reduce((s, [, w]) => s + w, 0); let acc = 0;
  for (const [k, w] of entries) { acc += w / total; if (u < acc) return k; }
  return entries.at(-1)?.[0] ?? null;
}

// ---------------------------------------------------------------- composition

/**
 * Build a battle map: the world's ground made into a designed PF2e battlefield.
 * @param conditions optional { snowDepthCm, ground, tempC, precipKind, sunAltitudeDeg, cloud, windMs, season }
 * @param setting "auto" or a SETTINGS id (e.g. "volcanic" where the world has no volcano of its own)
 */
export function buildBattleMap(asset, { center, spec, conditions = {}, setting = "auto" }) {
  const snap = snapToWorldGrid(center, spec), site = buildBattleSite(asset, { center: snap.center, spec });
  const { columns, rows } = spec, n = columns * rows, cell = environmentField(asset).cellAt(...snap.center);
  const sorted = [...site.heights].sort((a, b) => a - b), median = sorted[Math.floor(n / 2)], reliefFt = (sorted[n - 1] - sorted[0]) / 0.3048;
  const chosen = setting !== "auto" && SETTINGS[setting] ? setting : classifySetting({ shares: site.summary, biome: cell.biome, elevationM: median, reliefFt, conditions });
  const rules = SETTINGS[chosen], key = `${BATTLE_RULES_VERSION}|${snap.anchor.join(",")}|${snap.origin.join(",")}|${columns}x${rows}|${chosen}`;
  const grid = makeGrid(columns, rows), notes = [];
  // Ground and its height (in 5-ft steps from the middle of the map's range).
  for (let i = 0; i < n; i += 1) {
    const [ground, move] = groundFor(site.squares[i], chosen, conditions); grid.cover[i] = site.squares[i]; grid.ground[i] = ground; grid.move[i] = move;
    grid.elevationFt[i] = clamp(Math.round((site.heights[i] - median) / 1.524) * 5, -30, 30);
  }
  // Towns: streets, buildings, walls and doors on the built-up squares.
  const placed = [], fixedFeatures = [];
  const built = Uint8Array.from(site.squares, (v) => (v === COVER.built ? 1 : 0));
  const buildings = built.some(Boolean) ? layOutTown(grid, built, snap.origin, chosen === "urban" ? "urban" : "village", `${BATTLE_RULES_VERSION}|town|${snap.anchor.join(",")}`, fixedFeatures) : [];
  for (let i = 0; i < n; i += 1) if (site.squares[i] === COVER.road) grid.street[i] = 1;
  // The world's objects: trunks of big trees and big boulders block; small trees, bushes and stones slow and shelter.
  const objects = [];
  for (const o of site.objects) {
    if (o.kind === "building") continue;
    // Settings that cannot grow them lose the world's trees and bushes (lava, ice); deserts keep a few.
    if ((o.kind === "tree" || o.kind === "bush") && hashUnit(`${o.x}|${o.y}|veg`) >= (rules.vegetation ?? 1)) continue;
    const i = Math.floor(o.y) * columns + Math.floor(o.x); if (WATER.has(grid.cover[i]) || grid.cover[i] === COVER.road || grid.street[i] || grid.building[i] >= 0) continue;
    objects.push(o);
    if (o.kind === "tree") { if (o.size >= 1) { grid.move[i] = MOVE.impassable; grid.coverGiven[i] = Math.max(grid.coverGiven[i], 2); } else { if (grid.move[i] === MOVE.normal) grid.move[i] = MOVE.difficult; grid.coverGiven[i] = Math.max(grid.coverGiven[i], 1); grid.concealed[i] = 1; } }
    else if (o.kind === "bush") { if (grid.move[i] === MOVE.normal) grid.move[i] = MOVE.difficult; grid.coverGiven[i] = Math.max(grid.coverGiven[i], 1); grid.concealed[i] = 1; }
    else if (o.kind === "boulder") { if (o.size >= 0.35) { grid.move[i] = MOVE.impassable; grid.coverGiven[i] = Math.max(grid.coverGiven[i], 2); } else if (grid.move[i] === MOVE.normal) grid.move[i] = MOVE.difficult; }
  }
  // Deployment: the pair of opposite edges with the most open ground (ties: the map's long axis).
  const strip = (edge, depth) => { const out = []; for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) { const inStrip = edge === "n" ? y < depth : edge === "s" ? y >= rows - depth : edge === "w" ? x < depth : x >= columns - depth; const i = y * columns + x; if (inStrip && Number.isFinite(MOVE_COST[grid.move[i]]) && grid.move[i] !== MOVE.swim && grid.building[i] < 0) out.push(i); } return out; };
  // Score each pair by the walkable share of its weaker edge; the long axis (more ground to cross) is preferred.
  const axes = [["n", "s"], ["w", "e"]].map((pair) => { const len = pair[0] === "n" ? columns : rows, long = pair[0] === "n" ? rows >= columns : columns > rows; return { pair, score: Math.min(strip(pair[0], 3).length, strip(pair[1], 3).length) / (3 * len) + (long ? 0.2 : 0) }; });
  const axis = axes.sort((a, b) => b.score - a.score)[0].pair;
  let depth = 3; while (depth < 6 && Math.min(strip(axis[0], depth).length, strip(axis[1], depth).length) < Math.max(6, (axis[0] === "n" ? columns : rows) * 1.5)) depth += 1;
  const zones = [strip(axis[0], depth), strip(axis[1], depth)], zoneOf = new Uint8Array(n);
  zones.forEach((z, k) => { for (const i of z) zoneOf[i] = k + 1; });
  const along = (i) => { const x = i % columns, y = Math.floor(i / columns); return axis[0] === "n" ? y / (rows - 1) : x / (columns - 1); };
  // Fixed town features (squares, gardens) first.
  const protectedSquare = (i) => zoneOf[i] > 0;
  const place = (kind, x, y, { force = false, allowWater = false, allowStreet = false } = {}) => {
    for (const rotate of [false, true]) {
      if (rotate && FEATURES[kind].footprint[0] === FEATURES[kind].footprint[1]) continue;
      const fit = footprintSquares(grid, kind, x, y, rotate, (i) => (force || !protectedSquare(i)) && grid.feature[i] < 0 && grid.building[i] < 0 && (allowStreet || !grid.street[i]) && (allowWater || !WATER.has(grid.cover[i])) && Number.isFinite(MOVE_COST[grid.move[i]]));
      if (!fit) continue;
      const lanesBefore = placed.lanes ?? 0, reachBefore = placed.reach ?? 0;
      const undo = applyFeature(grid, placed.length, kind, fit.squares);
      const lanes = routes(grid, zones).length, reach = reachable(grid, zones[0]), blocked = fit.squares.filter((i) => !Number.isFinite(MOVE_COST[grid.move[i]])).length;
      if (!force && (lanes < Math.min(2, lanesBefore) || (reachBefore && reach < reachBefore - blocked))) { undo(); continue; }
      placed.lanes = lanes; placed.reach = reach;
      placed.push({ id: placed.length, kind, x, y, w: fit.w, h: fit.h, squares: fit.squares });
      return true;
    }
    return false;
  };
  placed.lanes = routes(grid, zones).length; placed.reach = reachable(grid, zones[0]);
  for (const f of fixedFeatures) { const x = f.gx - snap.origin[0], y = f.gy - snap.origin[1]; place(f.kind, x, y, { allowStreet: !f.soft }); }
  const designKey = (step) => hashUnit(`${key}|${step}`);
  const middle = (i) => { const a = along(i); return a > 0.33 && a < 0.67; };
  const order = (filter, step) => [...Array(n).keys()].filter(filter).sort((a, b) => hashUnit(`${key}|${step}|${a}`) - hashUnit(`${key}|${step}|${b}`));
  // A hazard in the middle third, beside the main route (a risk to take, not a wall).
  const firstRoute = routes(grid, zones)[0]?.set ?? new Set();
  const nearRoute = (i) => { const x = i % columns, y = Math.floor(i / columns); for (const j of firstRoute) { const jx = j % columns, jy = Math.floor(j / columns); const d = Math.max(Math.abs(jx - x), Math.abs(jy - y)); if (d >= 1 && d <= 3) return true; } return false; };
  const hazards = chosen === "volcanic" ? ["lava-channel", "fumarole"] : rules.hazard.slice(0, 1);
  for (const [k, kind] of hazards.entries()) { for (const i of order((i) => middle(i) && !firstRoute.has(i) && nearRoute(i), `hazard${k}`).slice(0, 60)) if (place(kind, i % columns, Math.floor(i / columns))) break; }
  // Contested high ground: halfway between the zones, if the ground has none of its own.
  const hasHigh = [...grid.elevationFt].some((e, i) => e >= 5 && Number.isFinite(MOVE_COST[grid.move[i]]) && Math.abs(along(i) - 0.5) < 0.25);
  if (!hasHigh && rules.high.length) {
    const kind = rules.high[Math.floor(designKey("high") * rules.high.length)];
    for (const i of order((i) => Math.abs(along(i) - 0.5) < 0.12, "high").slice(0, 80)) if (place(kind, i % columns, Math.floor(i / columns))) break;
  }
  // A centrepiece where the middle is open.
  const hasCentrepiece = placed.some((p) => rules.poi.includes(p.kind));
  if (rules.poi.length && !hasCentrepiece) {
    const cx = Math.floor(columns / 2), cy = Math.floor(rows / 2), kind = rules.poi[Math.floor(designKey("poi") * rules.poi.length)];
    const spots = [[cx, cy], [cx - 1, cy], [cx, cy - 1], [cx - 1, cy - 1], [cx + 1, cy], [cx, cy + 1]];
    for (const [x, y] of spots) if (place(kind, x, y)) break;
  }
  // Cover where a side would cross too much open ground; then up to the setting's cover target.
  const dressing = (step) => weighted(rules.dressing, designKey(step));
  // Breaking up open ground needs something that shelters (cover or concealment), not a hollow or a rise.
  const shelters = Object.fromEntries(Object.entries(rules.dressing).filter(([k]) => (FEATURES[k].cover > 0 || FEATURES[k].concealed) && FEATURES[k].move !== MOVE.hazardous));
  const shelterDressing = (step) => weighted(Object.keys(shelters).length ? shelters : rules.dressing, designKey(step));
  for (let step = 0; step < 16; step += 1) {
    const open = openDistance(grid, shelteredSquares(grid)); let best = -1;
    for (let i = 0; i < n; i += 1) if (!protectedSquare(i) && open[i] > (best < 0 ? 0 : open[best])) best = i;
    if (best < 0 || 2 * open[best] - 1 <= rules.openMax) break;
    const kind = shelterDressing(`open${step}`), x = best % columns, y = Math.floor(best / columns);
    if (!place(kind, x, y) && !place(kind, x - 1, y - 1)) { const fallback = Object.keys(rules.dressing).find((k) => FEATURES[k].footprint[0] * FEATURES[k].footprint[1] <= 2); if (!fallback || !place(fallback, x, y)) zoneOf[best] = 3; }
  }
  const coverShare = () => { const s = shelteredSquares(grid); let a = 0, b = 0; for (let i = 0; i < n; i += 1) if (Number.isFinite(MOVE_COST[grid.move[i]]) && grid.move[i] !== MOVE.swim) { b += 1; if (s[i]) a += 1; } return b ? a / b : 0; };
  for (let step = 0, tries = order((i) => !protectedSquare(i) && !grid.street[i], "cover"); step < tries.length && coverShare() < rules.coverTarget && step < 120; step += 1) place(shelterDressing(`cover${step}`), tries[step] % columns, Math.floor(tries[step] / columns));
  // Balance: each side gets a similar amount of cover in its forward band (6 squares out from its zone).
  const band = (k) => [...Array(n).keys()].filter((i) => { const a = along(i), d = depth / (axis[0] === "n" ? rows : columns); return k === 0 ? a >= d && a < d + 6 / (axis[0] === "n" ? rows : columns) : a <= 1 - d && a > 1 - d - 6 / (axis[0] === "n" ? rows : columns); });
  const coverIn = (squares) => { const s = shelteredSquares(grid); return squares.filter((i) => s[i]).length; };
  for (let step = 0; step < 6; step += 1) {
    const a = coverIn(band(0)), b = coverIn(band(1)); if (Math.min(a, b) >= 0.75 * Math.max(a, b)) break;
    const weak = a < b ? 0 : 1, candidates = band(weak).filter((i) => !protectedSquare(i) && !grid.street[i]).sort((p, q) => hashUnit(`${key}|bal${step}|${p}`) - hashUnit(`${key}|bal${step}|${q}`));
    let ok = false; for (const i of candidates.slice(0, 40)) if (place(shelterDressing(`bal${step}`), i % columns, Math.floor(i / columns))) { ok = true; break; }
    if (!ok) break;
  }
  for (let i = 0; i < n; i += 1) if (zoneOf[i] === 3) zoneOf[i] = 0;
  // The finished map's analysis.
  const finalRoutes = routes(grid, zones), sheltered = shelteredSquares(grid), open = openDistance(grid, sheltered);
  let walk = 0, difficult = 0, hazardous = 0, impassable = 0, concealed = 0, high = 0;
  for (let i = 0; i < n; i += 1) { const m = grid.move[i]; if (m === MOVE.impassable) impassable += 1; else { walk += 1; if (m === MOVE.difficult || m === MOVE.greater) difficult += 1; if (m === MOVE.hazardous) hazardous += 1; } if (grid.concealed[i]) concealed += 1; if (grid.elevationFt[i] >= 5 && Number.isFinite(MOVE_COST[m])) high += 1; }
  const chokepoints = finalRoutes.length ? finalRoutes[0].squares.filter((i) => { const x = i % columns, y = Math.floor(i / columns); let width = 0; for (let d = -3; d <= 3; d += 1) { const [nx, ny] = axis[0] === "n" ? [x + d, y] : [x, y + d]; if (nx >= 0 && ny >= 0 && nx < columns && ny < rows && Number.isFinite(MOVE_COST[grid.move[ny * columns + nx]]) && !blockedStep(grid, x, y, nx, ny)) width += 1; } return width <= 2; }) : [];
  const toCenter = zones.map((z) => { const { dist } = distances(grid, z); const c = Math.floor(rows / 2) * columns + Math.floor(columns / 2); let best = Infinity; for (let i = 0; i < n; i += 1) if (Math.abs((i % columns) - columns / 2) <= 2 && Math.abs(Math.floor(i / columns) - rows / 2) <= 2) best = Math.min(best, dist[i]); return Number.isFinite(best) ? best : dist[c]; });
  const forward = [coverIn(band(0)), coverIn(band(1))];
  const analysis = {
    setting: chosen, settingLabel: rules.label, routes: finalRoutes.length, chokepoints: chokepoints.length,
    coverShare: Math.round(100 * coverShare()) / 100, coverTarget: rules.coverTarget, largestOpenSquares: Math.max(0, 2 * Math.max(0, ...[...open].filter((v, i) => !zoneOf[i])) - 1), openMax: rules.openMax,
    difficultShare: Math.round(100 * difficult / Math.max(1, walk)) / 100, hazardSquares: hazardous, impassableSquares: impassable, concealedSquares: concealed, highGroundSquares: high,
    balance: { forwardCover: forward, toCentre: toCenter.map((v) => Math.round(v * 5)) },
    buildings: buildings.length, features: placed.length,
  };
  notes.push(...battleNotes(analysis, axis, placed, conditions, grid.ground.filter((g) => g.endsWith("(mud)")).length));
  return {
    version: BATTLE_RULES_VERSION, key, center: snap.center, anchor: snap.anchor, origin: snap.origin, spec, setting: chosen, biome: cell.biome, conditions,
    site, grid, buildings, objects, features: placed.map((p) => ({ ...p, ...FEATURES[p.kind], kind: p.kind, squares: p.squares })), zones, axis,
    routes: finalRoutes.map((r) => r.squares), chokepoints, analysis, notes,
  };
}

/** Plain notes for the GM. */
function battleNotes(a, axis, placed, conditions, mudSquares = 0) {
  const sides = axis[0] === "n" ? "north and south edges" : "west and east edges", out = [];
  out.push(`${a.settingLabel}. The sides start along the ${sides}; ${a.routes >= 3 ? "three distinct routes" : a.routes === 2 ? "two distinct routes" : "one route"} join them${a.chokepoints ? `, with ${a.chokepoints} narrow squares on the main one` : ""}.`);
  out.push(`Cover within a square's reach of ${Math.round(a.coverShare * 100)}% of the ground (target ${Math.round(a.coverTarget * 100)}%); the widest open stretch is ${a.largestOpenSquares * 5} ft.`);
  if (a.difficultShare > 0.02) out.push(`${Math.round(a.difficultShare * 100)}% of the walkable squares are difficult terrain.`);
  const hazards = [...new Set(placed.filter((p) => FEATURES[p.kind].hazard).map((p) => FEATURES[p.kind].hazard))];
  if (hazards.length) out.push(`Hazards: ${hazards.join("; ")}.`);
  if (a.highGroundSquares) out.push(`High ground on ${a.highGroundSquares} squares.`);
  const [f0, f1] = a.balance.forwardCover; out.push(`Balance: ${f0} and ${f1} sheltered squares in each side's first 30 ft; ${a.balance.toCentre[0]} and ${a.balance.toCentre[1]} ft of movement to the centre.`);
  if ((conditions.snowDepthCm ?? 0) >= 15) out.push(`Snow ${Math.round(conditions.snowDepthCm)} cm deep: open ground is difficult terrain${conditions.snowDepthCm >= 60 ? " (greater)" : ""}.`);
  if (mudSquares) out.push(`The ground is ${conditions.ground}: ${mudSquares} squares of soft ground are mud (difficult terrain).`);
  return out;
}

export { COVER_NAMES };
