// Building shapes: plain rectangles, L-shapes (a back corner left as yard) and rectangles with 45° cut
// corners (temples get all four). A building always occupies whole 5-ft squares; a cut corner keeps its
// square inside the building (one can stand there) but its two outer sides are walls for movement, and in
// the drawing and in Foundry the wall runs across the square on the diagonal. Shapes are chosen by rule
// and pinned to the building's key, so the same building always has the same shape.

const hash = (text) => { let h = 2166136261; for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619); h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const edgeKey = (x, y, dir) => `${x},${y},${dir}`;
const f2 = (v) => Number(v).toFixed(2);
const OPPOSITE = { n: "s", s: "n", e: "w", w: "e" };

/** The shape of a building on a rectangle (inclusive square coords): { rects, chamfers: [{x, y, corner}] }. */
export function buildingShape(rect, { door = "s", label = "building", key = "", shapes = true } = {}) {
  const w = rect.x1 - rect.x0 + 1, h = rect.y1 - rect.y0 + 1, u = hash(`${key}|shape`);
  const corners = { nw: [rect.x0, rect.y0], ne: [rect.x1, rect.y0], sw: [rect.x0, rect.y1], se: [rect.x1, rect.y1] };
  const chamfer = (names) => ({ rects: [rect], chamfers: names.map((corner) => ({ x: corners[corner][0], y: corners[corner][1], corner })) });
  if (!shapes || w < 3 || h < 3) return { rects: [rect], chamfers: [] };
  if (label === "temple") return w >= 4 && h >= 4 ? chamfer(["nw", "ne", "sw", "se"]) : { rects: [rect], chamfers: [] };
  // An L: the back corner (away from the door) becomes yard, half the width by half the depth.
  // Deep lots take a full L; wide shallow ones an L with a shallower back wing (the main block stays 2+ deep).
  const back = OPPOSITE[door], across = back === "n" || back === "s" ? w : h, deep = back === "n" || back === "s" ? h : w;
  if (u < 0.45 && ((across >= 4 && deep >= 4) || (across >= 5 && deep >= 3))) {
    const side = hash(`${key}|side`) < 0.5, cutDeep = Math.max(1, Math.min(Math.floor(deep / 2), deep - 2));
    const cw = back === "n" || back === "s" ? Math.floor(w / 2) : cutDeep, ch = back === "n" || back === "s" ? cutDeep : Math.floor(h / 2);
    if (back === "n" || back === "s") {
      const cutRows = back === "n" ? [rect.y0, rect.y0 + ch - 1] : [rect.y1 - ch + 1, rect.y1], keepRows = back === "n" ? [rect.y0 + ch, rect.y1] : [rect.y0, rect.y1 - ch];
      const wing = side ? { x0: rect.x0, x1: rect.x1 - cw } : { x0: rect.x0 + cw, x1: rect.x1 };
      return { rects: [{ x0: rect.x0, x1: rect.x1, y0: keepRows[0], y1: keepRows[1] }, { ...wing, y0: cutRows[0], y1: cutRows[1] }], chamfers: [] };
    }
    const cutCols = back === "w" ? [rect.x0, rect.x0 + cw - 1] : [rect.x1 - cw + 1, rect.x1], keepCols = back === "w" ? [rect.x0 + cw, rect.x1] : [rect.x0, rect.x1 - cw];
    const wing = side ? { y0: rect.y0, y1: rect.y1 - ch } : { y0: rect.y0 + ch, y1: rect.y1 };
    return { rects: [{ y0: rect.y0, y1: rect.y1, x0: keepCols[0], x1: keepCols[1] }, { ...wing, x0: cutCols[0], x1: cutCols[1] }], chamfers: [] };
  }
  // Cut corners: the two at the front, or one of them.
  if (u < 0.72) {
    const front = { s: ["sw", "se"], n: ["nw", "ne"], e: ["ne", "se"], w: ["nw", "sw"] }[door];
    return chamfer(hash(`${key}|both`) < 0.5 ? front : [front[Math.floor(hash(`${key}|which`) * 2)]]);
  }
  return { rects: [rect], chamfers: [] };
}

/** Squares of a shape, as "x,y" keys. */
export function shapeSquares(shape) {
  const out = new Set();
  for (const r of shape.rects) for (let y = r.y0; y <= r.y1; y += 1) for (let x = r.x0; x <= r.x1; x += 1) out.add(`${x},${y}`);
  return out;
}

/** The diagonal wall across a cut corner square, [x0, y0, x1, y1] in square units. */
export function chamferSegment({ x, y, corner }) {
  return { nw: [x, y + 1, x + 1, y], ne: [x, y, x + 1, y + 1], sw: [x, y, x + 1, y + 1], se: [x + 1, y, x, y + 1] }[corner];
}
const chamferSides = (corner) => ({ nw: ["n", "w"], ne: ["n", "e"], sw: ["s", "w"], se: ["s", "e"] })[corner];

/**
 * Outer walls of a shape: every square side that faces outside, as { x, y, dir, side, chamfer } (dir "e"/"s"
 * edge keys as the grid uses), with the sides of cut corners marked.
 */
export function shapeEdges(shape) {
  const squares = shapeSquares(shape), cut = new Map(shape.chamfers.map((c) => [`${c.x},${c.y}`, chamferSides(c.corner)])), out = [];
  for (const key of squares) {
    const [x, y] = key.split(",").map(Number);
    for (const [side, dx, dy] of [["n", 0, -1], ["s", 0, 1], ["w", -1, 0], ["e", 1, 0]]) {
      if (squares.has(`${x + dx},${y + dy}`)) continue;
      const [ex, ey, dir] = side === "n" ? [x, y - 1, "s"] : side === "s" ? [x, y, "s"] : side === "w" ? [x - 1, y, "e"] : [x, y, "e"];
      out.push({ x: ex, y: ey, dir, side, sq: [x, y], chamfer: Boolean(cut.get(key)?.includes(side)) });
    }
  }
  return out;
}

/** The door: on the door side, on a straight wall of the main block, nearest the middle of that side. */
export function doorEdge(shape, door) {
  const main = shape.rects[0], mid = door === "n" || door === "s" ? (main.x0 + main.x1) / 2 : (main.y0 + main.y1) / 2;
  const options = shapeEdges(shape).filter((e) => e.side === door && !e.chamfer && e.sq[0] >= main.x0 && e.sq[0] <= main.x1 && e.sq[1] >= main.y0 && e.sq[1] <= main.y1);
  options.sort((a, b) => Math.abs((door === "n" || door === "s" ? a.sq[0] : a.sq[1]) - mid) - Math.abs((door === "n" || door === "s" ? b.sq[0] : b.sq[1]) - mid) || a.sq[0] - b.sq[0] || a.sq[1] - b.sq[1]);
  return options[0] ?? null;
}

/**
 * Put a shaped building on the grid: its squares become floor, its outer sides walls (the door open; the
 * sides of cut corners walls too, marked so the drawing and Foundry use the diagonal instead). Returns the
 * building record (map coords).
 */
export function placeShapedBuilding(grid, buildings, { rect, door = "s", storeys = 1, label = "building", heightFt = null, key = "", shapes = true, shape = null, extra = {} }) {
  const { columns, rows } = grid, id = buildings.length, s = shape ?? buildingShape(rect, { door, label, key, shapes });
  for (const k of shapeSquares(s)) { const [x, y] = k.split(",").map(Number); if (x < 0 || y < 0 || x >= columns || y >= rows) continue; const i = y * columns + x; grid.building[i] = id; grid.ground[i] = "floor"; grid.move[i] = "normal"; }
  const d = doorEdge(s, door);
  for (const e of shapeEdges(s)) {
    const [x, y] = e.sq; if (x < 0 || y < 0 || x >= columns || y >= rows) continue;
    grid.walls.set(edgeKey(e.x, e.y, e.dir), { door: Boolean(d && e.x === d.x && e.y === d.y && e.dir === d.dir), building: id, chamfer: e.chamfer });
  }
  const b = { id, x0: rect.x0, y0: rect.y0, x1: rect.x1, y1: rect.y1, rects: s.rects, chamfers: s.chamfers, door, doorEdge: d, storeys, label, heightFt, ...extra };
  buildings.push(b);
  return b;
}

/** SVG shapes (in square units) covering a building's footprint: rectangles, or a polygon with its cut corners. */
export function footprintShapes(b, fill = "#fff") {
  if (!b.chamfers?.length) return (b.rects ?? [b]).map((r) => `<rect x="${r.x0}" y="${r.y0}" width="${r.x1 - r.x0 + 1}" height="${r.y1 - r.y0 + 1}" fill="${fill}"/>`).join("");
  return `<path d="M${footprintPolygon(b).map(([x, y]) => `${f2(x)} ${f2(y)}`).join(" L")} Z" fill="${fill}"/>`;
}

/** The outline of a rectangular building with cut corners, clockwise from the north-west. */
export function footprintPolygon(b) {
  const r = b.rects?.[0] ?? b, has = (c) => b.chamfers?.some((x) => x.corner === c), X0 = r.x0, Y0 = r.y0, X1 = r.x1 + 1, Y1 = r.y1 + 1;
  return [...(has("nw") ? [[X0, Y0 + 1], [X0 + 1, Y0]] : [[X0, Y0]]), ...(has("ne") ? [[X1 - 1, Y0], [X1, Y0 + 1]] : [[X1, Y0]]), ...(has("se") ? [[X1, Y1 - 1], [X1 - 1, Y1]] : [[X1, Y1]]), ...(has("sw") ? [[X0 + 1, Y1], [X0, Y1 - 1]] : [[X0, Y1]])];
}
