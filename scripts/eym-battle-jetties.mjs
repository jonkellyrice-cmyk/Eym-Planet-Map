// Overhangs and skybridges: upper floors that are bigger than the floor below.
//
// Jetties: in a style that builds them (Dree), a house's upper floor steps out over the street, a square
// on each street side, and a third storey steps out again. The ground floor keeps its footprint; the
// squares beneath an overhang stay street, walkable, with a ceiling 10 ft up (20 ft under a second
// jetty): cover from above, no flying up through it. Only plain rectangular houses jetty; an overhang
// never reaches the map's edge, a building, a feature, a tree, water or other ground level, and always
// leaves open sky between it and any other overhang across the way (a lane under facing jetties narrows
// to a slot of sky).
//
// Skybridges: enclosed bridges between the upper floors of two buildings across a street, at the first
// floor (10 ft up), one square wide, one to five squares long, over open ground (street or yard).
//
// All deterministic from the map's key; recorded on the buildings (`floorRects`) and the map
// (`skybridges`), and in the grid (`overUnder`, `overTop`: a slab's underside and top, feet). Pure.

import { FEATURES, MOVE } from "./eym-battle-settings.mjs";

const hashUnit = (text) => { let h = 2166136261; for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
export const STOREY_FT = 10;

/** Squares a rectangle adds over another (both inclusive square rects). */
const added = (big, small) => { const out = []; for (let y = big.y0; y <= big.y1; y += 1) for (let x = big.x0; x <= big.x1; x += 1) if (x < small.x0 || x > small.x1 || y < small.y0 || y > small.y1) out.push([x, y]); return out; };

/**
 * Add jetties and skybridges to a laid-out map. style: { jetty: true, skybridges: n } (from the building
 * style). objects/features: what already stands on the ground. Mutates grid and buildings; returns skybridges.
 */
export function addJettiesAndBridges(grid, buildings, { style, key, objects = [], features = [] }) {
  const { columns, rows } = grid, n = columns * rows;
  grid.overUnder = new Int16Array(n); grid.overTop = new Int16Array(n);
  if (!style?.jetty) return [];
  const trees = new Set(objects.filter((o) => o.kind === "tree" || o.kind === "boulder").map((o) => Math.floor(o.y) * columns + Math.floor(o.x)));
  const tall = new Set(features.filter((f) => (FEATURES[f.kind]?.heightFt ?? 0) > 6 || FEATURES[f.kind]?.wall || FEATURES[f.kind]?.canopyFt).flatMap((f) => f.squares));
  // Off the map's edge an overhang simply continues, as the houses themselves do.
  const claimed = new Int16Array(n).fill(-1), inMap = (x, y) => x >= 0 && y >= 0 && x < columns && y < rows;
  const open = (x, y, level, owner) => {
    if (!inMap(x, y)) return true; const i = y * columns + x;
    return grid.building[i] < 0 && (claimed[i] < 0 || claimed[i] === owner) && !trees.has(i) && !tall.has(i) && !grid.void[i] && !grid.water[i] && grid.levelFt[i] === level && grid.move[i] !== MOVE.impassable && grid.move[i] !== MOVE.swim;
  };
  // Open sky stays between facing overhangs: the square beyond an overhang is not someone else's overhang or building.
  const skyBeyond = (x, y, dx, dy, owner) => { const bx = x + dx, by = y + dy; if (bx < 0 || by < 0 || bx >= columns || by >= rows) return true; const i = by * columns + bx; return grid.building[i] === owner || (claimed[i] < 0 && grid.building[i] < 0); };
  const DIRS = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
  for (const b of buildings) {
    if (b.label !== "house" || (b.rects?.length ?? 1) > 1 || (b.chamfers?.length ?? 0) > 0 || (b.storeys ?? 1) < 2) continue;
    const level = grid.levelFt[Math.max(0, b.y0) * columns + Math.max(0, b.x0)], owner = b.id;
    // Which sides step out: those whose strip is street (the house's street faces), in the style's measure.
    const faces = Object.keys(DIRS).filter((d) => {
      const strip = d === "n" || d === "s" ? Array.from({ length: b.x1 - b.x0 + 1 }, (_, k) => [b.x0 + k, d === "n" ? b.y0 - 1 : b.y1 + 1]) : Array.from({ length: b.y1 - b.y0 + 1 }, (_, k) => [d === "w" ? b.x0 - 1 : b.x1 + 1, b.y0 + k]);
      const seen = strip.filter(([x, y]) => inMap(x, y));
      return seen.length > 0 && seen.every(([x, y]) => grid.street[y * columns + x]) && hashUnit(`${key}|jetty|${b.id}|${d}`) < 0.8;
    });
    if (!faces.length) continue;
    let prev = { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }; const floorRects = {};
    for (let floor = 1; floor < b.storeys; floor += 1) {
      const next = { ...prev };
      for (const d of faces) { if (d === "n") next.y0 -= 1; if (d === "s") next.y1 += 1; if (d === "w") next.x0 -= 1; if (d === "e") next.x1 += 1; }
      const ok = added(next, prev).every(([x, y]) => open(x, y, level, owner) && faces.every((d) => { const [dx, dy] = DIRS[d]; const edge = (d === "n" && y === next.y0) || (d === "s" && y === next.y1) || (d === "w" && x === next.x0) || (d === "e" && x === next.x1); return !edge || skyBeyond(x, y, dx, dy, owner); }));
      if (!ok) break;
      const under = STOREY_FT * floor + level, top = level + (b.heightFt ?? STOREY_FT * b.storeys + 8);
      for (const [x, y] of added(next, prev).filter(([x, y]) => inMap(x, y))) { const i = y * columns + x; claimed[i] = owner; grid.overUnder[i] = under; grid.overTop[i] = top; }
      floorRects[floor] = next; prev = next;
    }
    // Floors above the last jetty keep its outline.
    if (Object.keys(floorRects).length) { for (let floor = 1; floor < b.storeys; floor += 1) floorRects[floor] ??= floorRects[floor - 1] ?? prev; b.floorRects = floorRects; }
  }
  // Skybridges: between the first floors of two buildings facing across open street.
  const outline1 = (b) => b.floorRects?.[1] ?? { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
  const tallEnough = buildings.filter((b) => (b.storeys ?? 1) >= 2 && b.label === "house" && (b.rects?.length ?? 1) === 1 && !(b.chamfers?.length));
  const candidates = [];
  for (const a of tallEnough) for (const c of tallEnough) {
    if (a.id >= c.id) continue; const A = outline1(a), C = outline1(c);
    for (const [lo, hi, horizontal] of [[A, C, true], [C, A, true], [A, C, false], [C, A, false]]) {
      const gap = horizontal ? hi.x0 - lo.x1 - 1 : hi.y0 - lo.y1 - 1; if (gap < 1 || gap > 5) continue;
      const from = horizontal ? Math.max(lo.y0, hi.y0) : Math.max(lo.x0, hi.x0), to = horizontal ? Math.min(lo.y1, hi.y1) : Math.min(lo.x1, hi.x1); if (to < from) continue;
      const t = from + Math.floor((to - from) / 2), rect = horizontal ? { x0: lo.x1 + 1, x1: hi.x0 - 1, y0: t, y1: t } : { x0: t, x1: t, y0: lo.y1 + 1, y1: hi.y0 - 1 };
      const level = grid.levelFt[Math.max(0, a.y0) * columns + Math.max(0, a.x0)];
      if (grid.levelFt[Math.max(0, c.y0) * columns + Math.max(0, c.x0)] !== level) continue;
      let ok = true; for (let y = rect.y0; y <= rect.y1 && ok; y += 1) for (let x = rect.x0; x <= rect.x1 && ok; x += 1) ok = inMap(x, y) && open(x, y, level, -2);
      if (ok) candidates.push({ a: lo === A ? a : c, b: lo === A ? c : a, rect, dir: horizontal ? "ew" : "ns", level });
    }
  }
  const skybridges = [], limit = style.skybridges ?? 2;
  for (const cand of candidates.sort((p, q) => hashUnit(`${key}|bridge|${p.a.id}|${p.b.id}|${p.dir}`) - hashUnit(`${key}|bridge|${q.a.id}|${q.b.id}|${q.dir}`))) {
    if (skybridges.length >= limit) break;
    const { rect } = cand; let free = true;
    for (let y = rect.y0 - 1; y <= rect.y1 + 1 && free; y += 1) for (let x = rect.x0 - 1; x <= rect.x1 + 1 && free; x += 1) if (x >= 0 && y >= 0 && x < columns && y < rows && claimed[y * columns + x] === -3) free = false;
    if (!free || skybridges.some((s) => s.a === cand.a.id || s.b === cand.a.id || s.a === cand.b.id || s.b === cand.b.id)) continue;
    const id = `bridge-${skybridges.length}`, under = cand.level + STOREY_FT, top = cand.level + 2 * STOREY_FT;
    for (let y = rect.y0; y <= rect.y1; y += 1) for (let x = rect.x0; x <= rect.x1; x += 1) { const i = y * columns + x; claimed[i] = -3; grid.overUnder[i] = under; grid.overTop[i] = top; }
    skybridges.push({ id, ...rect, dir: cand.dir, a: cand.a.id, b: cand.b.id, floor: 1, level: cand.level });
  }
  return skybridges;
}

/** A building's outline on a floor (squares): its upper-floor rect if it has one, else its footprint. */
export function floorRect(b, floor) { return (floor > 0 && b.floorRects?.[floor]) || { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }; }
