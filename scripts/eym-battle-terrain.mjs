// Height on a battle map: inclines, levels, cliffs and line of sight; and the shaped settings of high
// fantasy (a city cut into a canyon wall, a temple city on canals, islands in the sky, a chasm, a cavern,
// a dwarven hall, a city in giant trees, a necropolis, coral shallows).
//
// Two kinds of height, kept apart on purpose:
//   - natural ground: continuous, from the world (site heights). Its steepness is an incline: 20° or more
//     is difficult terrain, 32° greater difficult, 45° a climb. It never makes a ledge by itself.
//   - levels: flat steps made by a shaped setting or a feature (a terrace, a platform, a quay). Crossing
//     between levels: 5 ft is like difficult terrain, 10–15 ft is a climb, more is a cliff that only
//     stairs, ramps or ladders cross (or a flyer).
// Every square also gets the height of what stands on it (its top), which line of sight uses.

export const INCLINE = Object.freeze({ difficultDeg: 20, greaterDeg: 32, climbDeg: 45 });
const SQUARE_M = 1.524;
const hash = (text) => { let h = 2166136261; for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619); h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const mod = (a, n) => ((a % n) + n) % n;
const edgeKey = (x, y, dir) => `${x},${y},${dir}`;

// ---------------------------------------------------------------- inclines

/** Steepest incline (degrees) from each square to its four neighbours, from heights in metres. */
export function inclineDegrees(heightsM, columns, rows) {
  const out = new Float32Array(columns * rows);
  for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) {
    const i = y * columns + x; let rise = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < columns && ny < rows) rise = Math.max(rise, Math.abs(heightsM[ny * columns + nx] - heightsM[i])); }
    out[i] = (Math.atan(rise / SQUARE_M) * 180) / Math.PI;
  }
  return out;
}

/** Make steep natural ground harder to cross (never easier); streets, buildings and water are exempt. */
export function applyInclines(grid, degrees, exempt) {
  const order = ["normal", "difficult", "greater", "climb"], rank = (m) => order.indexOf(m);
  let changed = 0;
  for (let i = 0; i < degrees.length; i += 1) {
    grid.inclineDeg[i] = degrees[i];
    if (exempt(i)) continue;
    const need = degrees[i] >= INCLINE.climbDeg ? "climb" : degrees[i] >= INCLINE.greaterDeg ? "greater" : degrees[i] >= INCLINE.difficultDeg ? "difficult" : "normal";
    if (rank(grid.move[i]) >= 0 && rank(need) > rank(grid.move[i])) { grid.move[i] = need; changed += 1; }
  }
  return changed;
}

// ---------------------------------------------------------------- levels and steps

/** Extra cost of stepping between two squares at different levels (Infinity: a cliff). */
export function levelStep(grid, i, j) {
  const d = Math.abs(grid.levelFt[j] - grid.levelFt[i]);
  if (!d) return 0;
  if (grid.ramp[i] || grid.ramp[j]) return d <= 25 ? 1 : Infinity;
  if (d <= 5) return 1;
  if (d <= 15) return grid.move[j] === "climb" ? 0 : 3;
  return Infinity;
}

/** Edges between squares whose levels differ by 10 ft or more and that no stair joins: cliffs and ledges. */
export function cliffEdges(grid) {
  const { columns, rows } = grid, out = [];
  for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) {
    const i = y * columns + x;
    for (const [dx, dy, dir] of [[1, 0, "e"], [0, 1, "s"]]) {
      const nx = x + dx, ny = y + dy; if (nx >= columns || ny >= rows) continue; const j = ny * columns + nx;
      if (grid.void[i] || grid.void[j]) continue;
      const d = Math.abs(grid.levelFt[i] - grid.levelFt[j]); if (d < 10 || grid.ramp[i] || grid.ramp[j]) continue;
      out.push({ x, y, dir, low: Math.min(grid.levelFt[i], grid.levelFt[j]), high: Math.max(grid.levelFt[i], grid.levelFt[j]) });
    }
  }
  return out;
}

// ---------------------------------------------------------------- tops and line of sight

/**
 * The height of what stands on each square, for line of sight: solid tops (buildings, walls, rock,
 * pillars, giant trunks) block; canopy (trees, mushroom caps) conceals. Heights are absolute feet.
 */
export function computeTops(grid, { buildings = [], objects = [], features = [] } = {}) {
  const { columns, rows } = grid, n = columns * rows;
  for (let i = 0; i < n; i += 1) { grid.solidFt[i] = -999; grid.canopyFt[i] = -999; }
  const ground = (i) => grid.elevationFt[i];
  for (const b of buildings) for (let y = Math.max(0, b.y0); y <= Math.min(rows - 1, b.y1); y += 1) for (let x = Math.max(0, b.x0); x <= Math.min(columns - 1, b.x1); x += 1) { const i = y * columns + x; grid.solidFt[i] = Math.max(grid.solidFt[i], ground(i) + (b.heightFt ?? 10 * (b.storeys ?? 1) + 8)); }
  for (const o of objects) {
    if (o.kind !== "tree") continue; const r = Math.ceil(o.size), cx = Math.floor(o.x), cy = Math.floor(o.y), top = 15 + 15 * Math.min(1.5, o.size);
    for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) { const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= columns || y >= rows || Math.hypot(dx, dy) > o.size + 0.3) continue; const i = y * columns + x; grid.canopyFt[i] = Math.max(grid.canopyFt[i], ground(i) + top); }
  }
  // Features: their height is already in the square's elevation (a boulder +5, a tower +20); canopies conceal.
  for (const f of features) for (const i of f.squares) {
    if (f.solidFt) grid.solidFt[i] = Math.max(grid.solidFt[i], grid.elevationFt[i] + f.solidFt);
    if (f.canopyFt) grid.canopyFt[i] = Math.max(grid.canopyFt[i], grid.elevationFt[i] + f.canopyFt);
  }
  for (let i = 0; i < n; i += 1) if (grid.rock[i]) grid.solidFt[i] = 999;
}

/**
 * Line of sight between square centres with eyes at given heights above the ground (5 ft standing).
 * Returns { visible, concealed }: blocked by ground higher than the line or by a solid top; concealed
 * when the line passes through canopy or a concealing square below its top.
 */
export function lineOfSight(grid, a, b, { eyeA = 5, eyeB = 5 } = {}) {
  const { columns } = grid, ax = (a % columns) + 0.5, ay = Math.floor(a / columns) + 0.5, bx = (b % columns) + 0.5, by = Math.floor(b / columns) + 0.5;
  const ha = grid.elevationFt[a] + eyeA, hb = grid.elevationFt[b] + eyeB, steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) * 3));
  let concealed = false;
  for (let k = 1; k < steps; k += 1) {
    const t = k / steps, x = Math.floor(ax + (bx - ax) * t), y = Math.floor(ay + (by - ay) * t), i = y * columns + x; if (i === a || i === b) continue;
    const h = ha + (hb - ha) * t;
    if (!grid.void[i] && h < grid.elevationFt[i]) return { visible: false, concealed };
    if (h < grid.solidFt[i]) return { visible: false, concealed };
    // Canopy hides what is in or above the crowns (from 10 ft up); undergrowth hides what is low in it.
    if ((h < grid.canopyFt[i] && h > grid.elevationFt[i] + 10) || (grid.concealed[i] && h < grid.elevationFt[i] + 6)) concealed = true;
  }
  return { visible: true, concealed };
}

/** Share of walkable squares seen (clearly, not through concealment) from a square at an eye height. */
export function viewShare(grid, from, eye, walkable) {
  let seen = 0, total = 0;
  for (let i = 0; i < grid.columns * grid.rows; i += 1) { if (i === from || !walkable(i)) continue; total += 1; const s = lineOfSight(grid, from, i, { eyeA: eye }); if (s.visible && !s.concealed) seen += 1; }
  return total ? seen / total : 0;
}

// ---------------------------------------------------------------- shaped settings

/** Add a walled building (squares, walls, one door) to the grid; door side n/s/e/w. */
export function addBuilding(grid, buildings, { x0, y0, x1, y1, door, storeys = 1, label = "building", heightFt = null }) {
  const { columns, rows } = grid, id = buildings.length;
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) { if (x < 0 || y < 0 || x >= columns || y >= rows) continue; const i = y * columns + x; grid.building[i] = id; grid.ground[i] = "floor"; grid.move[i] = "normal"; }
  const dx = Math.floor((x0 + x1) / 2), dy = Math.floor((y0 + y1) / 2), doorAt = { n: [dx, y0], s: [dx, y1], w: [x0, dy], e: [x1, dy] }[door];
  const wall = (x, y, side) => { if (x < 0 || y < 0 || x >= columns || y >= rows) return; const [ex, ey, dir] = side === "n" ? [x, y - 1, "s"] : side === "s" ? [x, y, "s"] : side === "w" ? [x - 1, y, "e"] : [x, y, "e"]; grid.walls.set(edgeKey(ex, ey, dir), { door: side === door && x === doorAt?.[0] && y === doorAt?.[1], building: id }); };
  for (let x = x0; x <= x1; x += 1) { wall(x, y0, "n"); wall(x, y1, "s"); }
  for (let y = y0; y <= y1; y += 1) { wall(x0, y, "w"); wall(x1, y, "e"); }
  buildings.push({ id, x0, y0, x1, y1, door, storeys, label, heightFt });
  return id;
}

/** Context helpers shared by the sculpts. */
function helpers(ctx) {
  const { grid } = ctx, { columns, rows } = grid, n = columns * rows;
  const at = (x, y) => (x >= 0 && y >= 0 && x < columns && y < rows ? y * columns + x : -1);
  const setGround = (i, ground, move, cover = null) => { if (i < 0) return; grid.ground[i] = ground; grid.move[i] = move; if (cover != null) grid.cover[i] = cover; };
  const water = (i, ground = "deep water") => { if (i < 0) return; setGround(i, ground, "swim", 1); grid.levelFt[i] = Math.min(grid.levelFt[i], -5); grid.water[i] = 1; };
  const voidSq = (i, ground = "open air (a fall)") => { if (i < 0) return; setGround(i, ground, "impassable"); grid.void[i] = 1; grid.levelFt[i] = -60; };
  // Along/across in square units: "along" runs between the deployment edges.
  const alongAxis = ctx.riseAxis ?? "n";
  const A = alongAxis === "n" ? rows : columns, C = alongAxis === "n" ? columns : rows;
  const idxAC = (a, c) => (alongAxis === "n" ? at(c, a) : at(a, c));
  return { columns, rows, n, at, setGround, water, voidSq, A, C, idxAC, alongAxis };
}

/** The shapes. Each takes ctx { grid, key, worldOrigin, buildings, features, objects } and returns { axis, notes, underground, flatten }. */
export const SCULPTS = Object.freeze({
  /** Terraces stepping up a cliff: a canyon city, a cliffside monastery. Stairs join each level twice. */
  terraces(ctx, { levels = 4, riseFt = 20, floor = "canyon floor", terrace = "carved stone terrace", river = false, voidBelow = false, dwellings = true }) {
    const { grid } = ctx, h = helpers({ ...ctx, riseAxis: ctx.grid.rows >= ctx.grid.columns ? "n" : "w" }), notes = [];
    // Each cliff line curves: its row shifts by up to a square or two along its length, so the faces step
    // on the diagonal like a real canyon wall instead of running dead straight.
    const band = Math.max(4, Math.floor(h.A / levels)), amp = Math.min(2, Math.floor(band / 3));
    const edgeOf = (k, c) => h.A - k * band + Math.round(amp * Math.sin((2 * Math.PI * c) / (10 + 6 * hash(`${ctx.key}|cp|${k}`)) + 6.28 * hash(`${ctx.key}|ph|${k}`)));
    const levelAt = (a, c) => { let k = 0; for (let j = 1; j < levels; j += 1) if (a < edgeOf(j, c)) k = j; return k; };
    for (let a = 0; a < h.A; a += 1) for (let c = 0; c < h.C; c += 1) {
      const i = h.idxAC(a, c), k = levelAt(a, c); grid.levelFt[i] = k * riseFt;
      h.setGround(i, k === 0 ? floor : terrace, "normal", 6);
    }
    if (voidBelow) for (let a = h.A - Math.min(3, band - 1); a < h.A; a += 1) for (let c = 0; c < h.C; c += 1) h.voidSq(h.idxAC(a, c));
    else if (river) for (let a = h.A - 2; a < h.A; a += 1) for (let c = 0; c < h.C; c += 1) h.water(h.idxAC(a, c), "river");
    // Stairs: two flights on every cliff, at world-pinned spots in the left and right halves.
    for (let k = 1; k < levels; k += 1) {
      if (h.A - k * band <= 0) continue;
      for (const half of [0, 1]) {
        // A flight where the cliff line runs straight for two columns, near the chosen spot.
        let c0 = Math.floor(h.C * (0.1 + 0.4 * half + 0.25 * hash(`${ctx.key}|stair|${k}|${half}`))), w = 2;
        for (let t = 0; t < 6 && edgeOf(k, c0) !== edgeOf(k, c0 + 1); t += 1) c0 = Math.min(h.C - 2, c0 + 1);
        const edgeA = edgeOf(k, c0); if (edgeA <= 0) continue;
        for (let c = c0; c < Math.min(h.C, c0 + w); c += 1) for (const a of [edgeOf(k, c) - 1, edgeOf(k, c)]) { const i = h.idxAC(a, c); if (i < 0 || grid.void[i]) continue; grid.ramp[i] = 1; grid.ground[i] = "stone stairs"; grid.move[i] = "difficult"; }
        ctx.features.push({ kind: "stairs", x: h.alongAxis === "n" ? c0 : edgeA - 1, y: h.alongAxis === "n" ? edgeA - 1 : c0, size: h.alongAxis === "n" ? [w, 2] : [2, w], fixed: true });
      }
    }
    // Dwellings cut into the back of each terrace (against the cliff above it), doors facing downhill.
    if (dwellings) for (let k = 1; k < levels; k += 1) {
      let c = 1 + Math.floor(3 * hash(`${ctx.key}|dw|${k}`));
      while (c + 3 < h.C) {
        const w = 3 + Math.floor(2 * hash(`${ctx.key}|dw|${k}|${c}`)), cells = [];
        // Against the cliff above: the back row follows the curving cliff line (a dwelling needs it level).
        const backs = Array.from({ length: w }, (_, t) => (k === levels - 1 ? 0 : edgeOf(k + 1, c + t))), aBack = Math.max(...backs);
        for (let a = aBack; a < aBack + 2; a += 1) for (let cc = c; cc < c + w; cc += 1) cells.push(h.idxAC(a, cc));
        if (cells.every((i) => i >= 0 && !grid.ramp[i] && !grid.void[i] && grid.levelFt[i] === k * riseFt) && hash(`${ctx.key}|dwb|${k}|${c}`) < 0.9) {
          const xs = cells.map((i) => i % h.columns), ys = cells.map((i) => Math.floor(i / h.columns));
          addBuilding(grid, ctx.buildings, { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), door: h.alongAxis === "n" ? "s" : "e", label: "rock-cut dwelling", heightFt: riseFt });
        }
        c += w + 1;
      }
    }
    notes.push(`${levels} levels ${riseFt} ft apart (${(levels - 1) * riseFt} ft from the ${voidBelow ? "edge" : floor} to the top), joined by stairs; elsewhere the faces are sheer.`);
    if (voidBelow) notes.push("The low edge drops away into the abyss: a fall from there is lethal unless a creature flies.");
    return { axis: h.alongAxis === "n" ? ["w", "e"] : ["n", "s"], notes, flatten: true };
  },

  /** Canals between islands, every island a building, a temple or a piazza, every canal bridged: a temple city on a lake. */
  canals(ctx, { period = [9, 8], width = 2, temples = 0.35 }) {
    const { grid } = ctx, h = helpers(ctx), [ox, oy] = ctx.worldOrigin, notes = [];
    const canalX = (gx) => mod(gx, period[0]) < width, canalY = (gy) => mod(gy, period[1]) < width;
    for (let y = 0; y < h.rows; y += 1) for (let x = 0; x < h.columns; x += 1) {
      const i = h.at(x, y), gx = ox + x, gy = oy + y;
      if (canalX(gx) || canalY(gy)) h.water(i, "canal"); else { h.setGround(i, "marble quay", "normal", 12); grid.levelFt[i] = 0; }
    }
    // Islands (world-pinned) and their contents.
    const islands = new Map();
    for (let y = 0; y < h.rows; y += 1) for (let x = 0; x < h.columns; x += 1) { const gx = ox + x, gy = oy + y; if (canalX(gx) || canalY(gy)) continue; const k = `${Math.floor(gx / period[0])},${Math.floor(gy / period[1])}`; const b = islands.get(k) ?? { x0: x, y0: y, x1: x, y1: y, k }; b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y); b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y); islands.set(k, b); }
    let temple = 0;
    for (const isl of islands.values()) {
      const u = hash(`${ctx.key}|isle|${isl.k}`), inner = { x0: isl.x0 + 1, y0: isl.y0 + 1, x1: isl.x1 - 1, y1: isl.y1 - 1 };
      if (inner.x1 - inner.x0 < 1 || inner.y1 - inner.y0 < 1) continue;
      if (u < temples) { addBuilding(grid, ctx.buildings, { ...inner, door: "s", storeys: 2, label: "temple", heightFt: 35 }); temple += 1; }
      else if (u < temples + 0.2) ctx.features.push({ kind: hash(`${ctx.key}|piazza|${isl.k}`) < 0.5 ? "fountain" : "statue", x: Math.floor((isl.x0 + isl.x1) / 2), y: Math.floor((isl.y0 + isl.y1) / 2), fixed: true });
      else addBuilding(grid, ctx.buildings, { ...inner, door: ["n", "s", "e", "w"][Math.floor(4 * hash(`${ctx.key}|door|${isl.k}`))], storeys: 2, label: "house" });
    }
    // A bridge over every canal between two islands, in the middle of the island's side.
    for (const isl of islands.values()) {
      const midY = Math.floor((isl.y0 + isl.y1) / 2), midX = Math.floor((isl.x0 + isl.x1) / 2);
      const bridge = (cells) => { if (cells.every((i) => i >= 0)) for (const i of cells) { grid.ground[i] = "stone bridge"; grid.move[i] = "normal"; grid.levelFt[i] = 0; grid.water[i] = 0; grid.cover[i] = 12; grid.bridge[i] = 1; } };
      const east = []; for (let x = isl.x1 + 1; x <= isl.x1 + width; x += 1) east.push(h.at(x, midY), h.at(x, midY + 1));
      if (isl.x1 + width + 1 < h.columns) bridge(east);
      const south = []; for (let y = isl.y1 + 1; y <= isl.y1 + width; y += 1) south.push(h.at(midX, y), h.at(midX + 1, y));
      if (isl.y1 + width + 1 < h.rows) bridge(south);
    }
    notes.push(`Canals ${width * 5} ft wide and about 10 ft deep between ${islands.size} islands (${temple} temples); stone bridges join every island; the quays stand 5 ft above the water.`);
    return { notes, flatten: true, gondolas: true };
  },

  /** Islands in the sky over a void, tied together by rope bridges. */
  islands(ctx, { threshold = 0.52 }) {
    const { grid } = ctx, h = helpers(ctx), [ox, oy] = ctx.worldOrigin, notes = [], cell = 6;
    const corner = (gx, gy) => hash(`${ctx.key}|sky|${gx}|${gy}`);
    const field = (gx, gy) => { const fx = gx / cell, fy = gy / cell, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, s = (t) => t * t * (3 - 2 * t); const a = corner(x0, y0), b = corner(x0 + 1, y0), c = corner(x0, y0 + 1), d = corner(x0 + 1, y0 + 1); return (a + (b - a) * s(tx)) + ((c + (d - c) * s(tx)) - (a + (b - a) * s(tx))) * s(ty); };
    const axis = h.rows >= h.columns ? "n" : "w";
    for (let y = 0; y < h.rows; y += 1) for (let x = 0; x < h.columns; x += 1) {
      const i = h.at(x, y), edge = axis === "n" ? (y < 3 || y >= h.rows - 3) : (x < 3 || x >= h.columns - 3);
      // The same islands mirrored across the middle, so neither side starts with less to stand on.
      const [mx, my] = axis === "n" ? [x, h.rows - 1 - y] : [h.columns - 1 - x, y], v = Math.max(field(ox + x, oy + y), field(ox + mx, oy + my));
      if (edge || v > threshold) { h.setGround(i, "floating rock", "normal", 10); grid.levelFt[i] = 0; } else h.voidSq(i, "open sky (a fall)");
    }
    const bridges = connect(grid, h, ctx, "rope bridge", "difficult");
    notes.push(`Islands of floating rock over open sky, joined by ${bridges} rope bridges (difficult terrain: they sway). Anything that falls off is gone unless it flies.`);
    return { axis: axis === "n" ? ["n", "s"] : ["w", "e"], notes, flatten: true };
  },

  /** A chasm across the field with a stone arch and a rope bridge. */
  chasm(ctx, { widthSq = 4, hazard = null, ground = "open air (a fall)" }) {
    const { grid } = ctx, h = helpers(ctx), notes = [], axis = h.rows >= h.columns ? "n" : "w", A = axis === "n" ? h.rows : h.columns, C = axis === "n" ? h.columns : h.rows;
    const at = (a, c) => (axis === "n" ? h.at(c, a) : h.at(a, c)), a0 = Math.floor(A / 2 - widthSq / 2) + Math.round(2 * (hash(`${ctx.key}|chasm`) - 0.5));
    for (let c = 0; c < C; c += 1) { const wobble = Math.round(1.2 * (hash(`${ctx.key}|cw|${Math.floor(c / 3)}`) - 0.5)); for (let a = a0 + wobble; a < a0 + wobble + widthSq; a += 1) { const i = at(a, c); if (hazard) { grid.ground[i] = ground; grid.move[i] = "hazardous"; grid.levelFt[i] = -5; } else h.voidSq(i, ground); } }
    if (!hazard) for (const [k, kind] of [[0.25, "stone arch"], [0.72, "rope bridge"]].entries()) {
      const [frac, label] = kind, c0 = Math.floor(C * frac + 2 * (hash(`${ctx.key}|br|${k}`) - 0.5)), w = label === "stone arch" ? 2 : 1;
      for (let a = a0 - 2; a < a0 + widthSq + 2; a += 1) for (let c = c0; c < c0 + w; c += 1) { const i = at(a, c); if (i >= 0 && grid.void[i]) { grid.void[i] = 0; grid.ground[i] = label; grid.move[i] = label === "rope bridge" ? "difficult" : "normal"; grid.levelFt[i] = 0; grid.bridge[i] = 1; } }
    }
    notes.push(hazard ? `A rift ${widthSq * 5} ft wide splits the field: ${hazard}.` : `A chasm ${widthSq * 5} ft wide splits the field; a stone arch and a rope bridge cross it. The drop is lethal to anything that cannot fly.`);
    return { axis: axis === "n" ? ["n", "s"] : ["w", "e"], notes };
  },

  /** A cavern: rock walls, open chambers, two winding passages kept open from side to side. */
  cavern(ctx, { floor = "cave floor", wall = "cave wall", open = 0.48, ceilingFt = 30 }) {
    const { grid } = ctx, h = helpers(ctx), [ox, oy] = ctx.worldOrigin, notes = [], cell = 5, axis = h.rows >= h.columns ? "n" : "w";
    const corner = (gx, gy) => hash(`${ctx.key}|cave|${gx}|${gy}`);
    const field = (gx, gy) => { const fx = gx / cell, fy = gy / cell, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0; const a = corner(x0, y0), b = corner(x0 + 1, y0), c = corner(x0, y0 + 1), d = corner(x0 + 1, y0 + 1); return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty; };
    for (let y = 0; y < h.rows; y += 1) for (let x = 0; x < h.columns; x += 1) { const i = h.at(x, y); if (field(ox + x, oy + y) < open) h.setGround(i, floor, "normal", 10); else { h.setGround(i, wall, "impassable", 10); grid.rock[i] = 1; } }
    // Two passages from edge to edge, wandering but never closing.
    const A = axis === "n" ? h.rows : h.columns, C = axis === "n" ? h.columns : h.rows, at = (a, c) => (axis === "n" ? h.at(c, a) : h.at(a, c));
    for (const k of [0, 1]) { let c = Math.floor(C * (0.25 + 0.5 * k)); for (let a = 0; a < A; a += 1) { c = Math.max(1, Math.min(C - 2, c + Math.round(2 * (hash(`${ctx.key}|pass|${k}|${a}`) - 0.5)))); for (const cc of [c - 1, c, c + 1]) { const i = at(a, cc); if (i >= 0 && grid.rock[i]) { grid.rock[i] = 0; h.setGround(i, floor, "normal", 10); } } } }
    for (let a = 0; a < 3; a += 1) for (let c = 1; c < C - 1; c += 1) for (const aa of [a, A - 1 - a]) { const i = at(aa, c); if (grid.rock[i]) { grid.rock[i] = 0; h.setGround(i, floor, "normal", 10); } }
    notes.push(`Underground: rock walls, open chambers and two winding passages; the ceiling is about ${ceilingFt} ft up, so flyers have little room. No daylight.`);
    return { axis: axis === "n" ? ["n", "s"] : ["w", "e"], notes, underground: true, ceilingFt, flatten: true };
  },

  /** A pillared hall: walls around, rows of pillars, a raised dais at one end, a channel across the middle with two bridges. */
  hall(ctx, { channel = "lava channel", channelMove = "hazardous", floor = "flagstone floor", ceilingFt = 40 }) {
    const { grid } = ctx, h = helpers(ctx), notes = [], axis = h.rows >= h.columns ? "n" : "w", A = axis === "n" ? h.rows : h.columns, C = axis === "n" ? h.columns : h.rows, at = (a, c) => (axis === "n" ? h.at(c, a) : h.at(a, c));
    for (let a = 0; a < A; a += 1) for (let c = 0; c < C; c += 1) { const i = at(a, c); if (c === 0 || c === C - 1) { h.setGround(i, "carved wall", "impassable", 10); grid.rock[i] = 1; } else h.setGround(i, floor, "normal", 12); }
    for (let a = 3; a < A - 3; a += 4) for (let c = 3; c < C - 3; c += 4) { if (Math.abs(a - A / 2) < 2) continue; ctx.features.push({ kind: "pillar", x: axis === "n" ? c : a, y: axis === "n" ? a : c, fixed: true }); }
    const mid = Math.floor(A / 2); for (let c = 1; c < C - 1; c += 1) { const i = at(mid, c); grid.ground[i] = channel; grid.move[i] = channelMove; grid.levelFt[i] = -5; }
    for (const frac of [0.3, 0.7]) { const c0 = Math.floor(C * frac); for (const c of [c0, c0 + 1]) { const i = at(mid, c); grid.ground[i] = "stone bridge"; grid.move[i] = "normal"; grid.levelFt[i] = 0; grid.bridge[i] = 1; } }
    // A dais at the far end, 5 ft up, with steps in the middle.
    for (let a = A - 4; a < A - 1; a += 1) for (let c = Math.floor(C * 0.3); c < Math.ceil(C * 0.7); c += 1) { const i = at(a, c); grid.levelFt[i] = 5; grid.ground[i] = "raised dais"; if (a === A - 4 && Math.abs(c - C / 2) < 1.5) grid.ramp[i] = 1; }
    notes.push(`A pillared hall ${ceilingFt} ft high; a ${channel} runs across the middle with two bridges; a dais 5 ft up at the far end. No daylight: braziers light it dimly.`);
    return { axis: axis === "n" ? ["n", "s"] : ["w", "e"], notes, underground: true, ceilingFt, dim: true, flatten: true };
  },

  /** A city in giant trees: trunks, platforms 20 ft up around them with ladders, rope bridges between. */
  treetops(ctx, { platformFt = 20 }) {
    const { grid } = ctx, h = helpers(ctx), [ox, oy] = ctx.worldOrigin, notes = [], period = 9, trunks = [];
    for (let y = 1; y < h.rows - 3; y += 1) for (let x = 1; x < h.columns - 3; x += 1) {
      const gx = ox + x, gy = oy + y; if (mod(gx, period) !== 3 || mod(gy, period) !== 3) continue;
      const jx = Math.round(2 * (hash(`${ctx.key}|tx|${gx}|${gy}`) - 0.5)), jy = Math.round(2 * (hash(`${ctx.key}|ty|${gx}|${gy}`) - 0.5)); trunks.push([x + jx, y + jy]);
    }
    for (const [tx, ty] of trunks) {
      for (let y = ty - 2; y <= ty + 4; y += 1) for (let x = tx - 2; x <= tx + 4; x += 1) { const i = h.at(x, y); if (i < 0) continue; const inTrunk = x >= tx && x <= tx + 2 && y >= ty && y <= ty + 2; if (inTrunk) continue; grid.levelFt[i] = platformFt; grid.ground[i] = "tree platform"; grid.move[i] = "normal"; grid.platform[i] = 1; }
      ctx.features.push({ kind: "giant-trunk", x: tx, y: ty, fixed: true });
      const lad = h.at(tx + 1, ty + 4); if (lad >= 0) { grid.ramp[lad] = 1; grid.ground[lad] = "ladder"; grid.move[lad] = "climb"; }
    }
    // Rope bridges between neighbouring platforms, at platform height.
    let bridges = 0;
    for (const [ax, ay] of trunks) for (const [bx, by] of trunks) {
      if (bx <= ax && by <= ay) continue; if (!((bx > ax && Math.abs(by - ay) <= 2) || (by > ay && Math.abs(bx - ax) <= 2))) continue; if (Math.hypot(bx - ax, by - ay) > period + 3) continue;
      const horizontal = bx > ax && Math.abs(by - ay) <= 2, cells = [];
      if (horizontal) for (let x = ax + 5; x < bx - 2; x += 1) cells.push(h.at(x, ay + 1)); else for (let y = ay + 5; y < by - 2; y += 1) cells.push(h.at(ax + 1, y));
      if (!cells.length || cells.some((i) => i < 0)) continue;
      for (const i of cells) { grid.levelFt[i] = platformFt; grid.ground[i] = "rope bridge"; grid.move[i] = "difficult"; grid.platform[i] = 1; grid.bridge[i] = 1; }
      bridges += 1;
    }
    notes.push(`Giant trees with platforms ${platformFt} ft up (ladders on their south sides) and ${bridges} rope bridges between them. A creature on a platform has cover from below; a fall is ${platformFt} ft.`);
    return { notes };
  },

  /** Rows of mausoleums with paths between: a necropolis. */
  mausoleums(ctx) {
    const { grid } = ctx, h = helpers(ctx), [ox, oy] = ctx.worldOrigin, notes = [];
    for (let y = 0; y < h.rows; y += 1) for (let x = 0; x < h.columns; x += 1) { const i = h.at(x, y); if (grid.move[i] !== "swim") h.setGround(i, "grave earth", "normal", 6); }
    let count = 0;
    for (let y = 0; y < h.rows - 3; y += 1) for (let x = 0; x < h.columns - 2; x += 1) {
      const gx = ox + x, gy = oy + y; if (mod(gx, 6) !== 2 || mod(gy, 7) !== 2) continue;
      const u = hash(`${ctx.key}|maus|${gx}|${gy}`); if (u > 0.7) continue;
      if (u < 0.45) { addBuilding(grid, ctx.buildings, { x0: x, y0: y, x1: x + 2, y1: y + 3, door: u < 0.22 ? "s" : "n", label: "mausoleum", heightFt: 15 }); count += 1; }
      else ctx.features.push({ kind: "graveyard", x, y, fixed: true });
    }
    notes.push(`A necropolis: ${count} stone mausoleums in rows, with graves and paths between.`);
    return { notes };
  },

  /** Shallow water over sand and coral, with deeper channels and dry sandbars. */
  shallows(ctx) {
    const { grid } = ctx, h = helpers(ctx), [ox, oy] = ctx.worldOrigin, notes = [];
    for (let y = 0; y < h.rows; y += 1) for (let x = 0; x < h.columns; x += 1) {
      const i = h.at(x, y), u = (hash(`${ctx.key}|sh|${Math.floor((ox + x) / 3)}|${Math.floor((oy + y) / 3)}`) + hash(`${ctx.key}|sh2|${Math.floor((ox + x) / 5)}|${Math.floor((oy + y) / 5)}`)) / 2;
      if (u < 0.3) h.water(i, "deep channel"); else if (u < 0.72) { h.setGround(i, "shallows", "difficult", 3); grid.levelFt[i] = -5; } else { h.setGround(i, "sandbar", "normal", 4); grid.levelFt[i] = 0; }
    }
    notes.push("Waist-deep shallows (difficult terrain) over sand and coral, cut by deeper channels (swim), with dry sandbars.");
    return { notes, flatten: true };
  },
});

/** Join every island of walkable ground to its neighbours with bridges over the void (or water). */
function connect(grid, h, ctx, label, move) {
  const n = h.n, comp = new Int32Array(n).fill(-1), walk = (i) => !grid.void[i] && grid.move[i] !== "impassable";
  let count = 0;
  const label_ = () => { comp.fill(-1); count = 0; for (let s = 0; s < n; s += 1) { if (comp[s] >= 0 || !walk(s)) continue; const stack = [s]; comp[s] = count; while (stack.length) { const i = stack.pop(), x = i % h.columns, y = Math.floor(i / h.columns); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = h.at(x + dx, y + dy); if (j >= 0 && comp[j] < 0 && walk(j)) { comp[j] = count; stack.push(j); } } } count += 1; } };
  let bridges = 0;
  for (let guard = 0; guard < 40; guard += 1) {
    label_(); if (count <= 1) break;
    // Shortest straight run of void between component 0 and any other.
    let best = null;
    for (let i = 0; i < n; i += 1) if (comp[i] === 0) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = i % h.columns, y = Math.floor(i / h.columns), cells = [];
      for (let k = 1; k < 14; k += 1) { const j = h.at(x + dx * k, y + dy * k); if (j < 0) break; if (walk(j)) { if (comp[j] !== 0 && cells.length && (!best || cells.length < best.cells.length || (cells.length === best.cells.length && hash(`${ctx.key}|b|${i}|${dx}|${dy}`) < best.u))) best = { cells: [...cells], u: hash(`${ctx.key}|b|${i}|${dx}|${dy}`) }; break; } cells.push(j); }
    }
    if (!best) break;
    for (const j of best.cells) { grid.void[j] = 0; grid.water[j] = 0; grid.ground[j] = label; grid.move[j] = move; grid.levelFt[j] = 0; grid.bridge[j] = 1; }
    bridges += 1;
  }
  return bridges;
}
