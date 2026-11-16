// Pixel-art sprites drawn procedurally into a framebuffer, in three-quarter view: trees, bushes, rocks,
// buildings (tiled hipped roofs, timbered or stone walls, framed windows, plank doors), the common map
// features and furniture. Every sprite is placed from the map's geometry (square units × P pixels) and
// shaded with hue-shifted ramps; light comes from the upper left. Deterministic.

import { rgb } from "./framebuffer.mjs";
import { h2, mixc, noise, ramp } from "./materials.mjs";

// The light the sprites are shaded by: a screen-space direction toward the light (x east, y south; a
// high sun lights tops, so y leans up), the season's foliage, and how lit south-facing walls are.
const LIGHT = { x: -0.6, y: -0.8, foliage: "summer", faceTone: 0.2, direct: 0.8 };
export function setSpriteLight({ toSun = [-0.6, -0.8], altitudeDeg = 45, season = "summer", faceTone = 0.2, direct = 0.8, lightsOn = false } = {}) {
  const k = Math.cos(Math.max(0, Math.min(90, altitudeDeg)) * Math.PI / 180), x = toSun[0] * k, y = toSun[1] * k - (1 - k) * 0.85, n = Math.hypot(x, y) || 1;
  Object.assign(LIGHT, { x: x / n, y: y / n, foliage: season, faceTone, direct, lightsOn });
}
const lit = (u, v) => u * LIGHT.x + v * LIGHT.y;
const SEASON_LEAF = { spring: "#6aae4c", summer: "#3f7a38", autumn: null, winter: null, tropical: "#2f7a3a" };

const RAMP = new Map(), R = (base, n = 5, spread = 0.55) => { const k = `${base}|${n}|${spread}`; if (!RAMP.has(k)) RAMP.set(k, ramp(base, n, spread)); return RAMP.get(k); };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------- vegetation and rocks

/** A tree from its base (pixels). Style by setting: broadleaf, conifer, jungle, dead. */
export function drawTree(fb, bx, by, size, P, style = "broadleaf", seed = 0) {
  const rp = Math.max(4, size * P * 0.9), trunkW = Math.max(2, Math.round(rp * 0.28)), trunkH = Math.round(rp * 0.75), bark = R("#6a4a2c", 4);
  // Trunk: bark with a lit left edge.
  for (let y = by - trunkH; y < by; y += 1) for (let x = Math.round(bx - trunkW / 2); x < Math.round(bx + trunkW / 2); x += 1) fb.set(x, y, x === Math.round(bx - trunkW / 2) ? bark[3] : h2(x, y >> 1, seed) < 0.3 ? bark[0] : bark[1]);
  // Winter strips broadleaf trees (conifers and the tropics keep theirs); autumn turns them.
  if (style === "broadleaf" && LIGHT.foliage === "winter") style = "bare";
  if (style === "dead" || style === "bare") {
    const dark = rgb(style === "bare" ? "#6a5440" : "#4a3a2c");
    for (const [ang, len] of [[-2.3, 0.9], [-0.8, 1], [-1.6, 1.15], [-2.7, 0.6], [-0.4, 0.7]]) fb.line(bx, by - trunkH, bx + Math.cos(ang) * rp * len, by - trunkH + Math.sin(ang) * rp * len, dark);
    return;
  }
  if (style === "conifer") {
    const g = R("#2f5a3a", 5, 0.5);
    for (let tier = 0; tier < 3; tier += 1) {
      const w = rp * (1.05 - tier * 0.25), top = by - trunkH * 0.6 - rp * (0.55 + tier * 0.55), h = rp * 0.9;
      fb.polygon([[bx, top - h * 0.2], [bx + w, top + h], [bx - w, top + h]], null, (x, y) => { const t = ((x - bx) / w) * LIGHT.x; return (t > 0.15 ? g[3] : t < -0.35 ? g[1] : g[2]); });
      fb.line(bx - w, top + h, bx + w, top + h, g[0]);
    }
    return;
  }
  const autumn = ["#c8782a", "#d9a238", "#b8502a", "#9a8a2a"][Math.floor(h2(seed, 1, 21) * 4)];
  const base = style === "jungle" ? "#2f6a32" : LIGHT.foliage === "autumn" ? autumn : SEASON_LEAF[LIGHT.foliage] ?? "#3f7a38", g = R(base, 6, 0.55), cy = by - trunkH - rp * 0.55;
  // The crown: a main mass and lobes, each shaded by the light from the upper left, with leaf clusters.
  const lobes = [[0, 0, 1], ...[0, 1, 2, 3, 4].map((k) => { const a = (k / 5) * Math.PI * 2 + h2(k, seed, 3) * 0.8; return [Math.cos(a) * rp * 0.55, Math.sin(a) * rp * 0.38, 0.55 + 0.15 * h2(k, seed, 4)]; })];
  lobes.sort((a, b) => a[1] - b[1]);
  for (const [dx, dy, s] of lobes) {
    const r = rp * s;
    fb.ellipse(bx + dx, cy + dy, r, r * 0.92, null, (x, y, u, v) => {
      const light = lit(u, v) * (0.4 + 0.6 * LIGHT.direct) + (noise(x, y, 3, seed + 7) - 0.5) * 0.9, edge = u * u + v * v > 0.82;
      if (edge && light < 0.1) return g[0];
      return g[clamp(Math.round(2.4 + light * 1.8), 1, 5)];
    });
  }
  // A few bright leaf highlights on the lit side.
  if (LIGHT.foliage === "spring" && h2(seed, 2, 22) < 0.3) for (let k = 0; k < Math.round(rp); k += 1) { const a = h2(k, seed, 23) * 6.28, d = rp * h2(k, seed, 24); fb.set(bx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.9, h2(k, seed, 25) < 0.5 ? rgb("#f6d0dc") : rgb("#fbf4f4")); }
  const toward = Math.atan2(LIGHT.y, LIGHT.x);
  for (let k = 0; k < Math.round(rp / 2); k += 1) { const a = toward - 0.6 + h2(k, seed, 9) * 1.2, d = rp * (0.35 + 0.5 * h2(k, seed, 10)); fb.set(bx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.9, g[5]); }
}

export function drawBush(fb, bx, by, size, P, seed = 0) {
  const r = Math.max(3, size * P * 0.9), g = R("#5d7d3e", 5, 0.5);
  fb.ellipse(bx, by - r * 0.45, r, r * 0.7, null, (x, y, u, v) => { const l = lit(u, v) + (noise(x, y, 2, seed) - 0.5) * 0.8; return u * u + v * v > 0.85 && l < 0.1 ? g[0] : g[clamp(Math.round(2 + l * 1.6), 1, 4)]; });
}

export function drawRock(fb, bx, by, size, P, seed = 0, base = "#8f877c") {
  const rx = Math.max(3, size * P), ry = rx * 0.7, g = R(base, 5, 0.5);
  fb.ellipse(bx, by - ry * 0.55, rx, ry, null, (x, y, u, v) => { const l = lit(u, v) + (h2(x >> 1, y >> 1, seed) - 0.5) * 0.4; return u * u + v * v > 0.8 ? g[0] : g[clamp(Math.round(2 + l * 1.7), 1, 4)]; });
  fb.set(bx + rx * 0.35 * LIGHT.x, by - ry * 0.55 + ry * 0.5 * LIGHT.y, g[4]);
}

// ---------------------------------------------------------------- buildings

const LOOK = Object.freeze({
  house: { wall: "#e2d4b6", timber: "#5e3e26", roof: "#b8583c", trim: "#6e4a2a", timbered: true },
  building: { wall: "#e2d4b6", timber: "#5e3e26", roof: "#b8583c", trim: "#6e4a2a", timbered: true },
  temple: { wall: "#ece6d8", timber: "#b8b0a0", roof: "#5f7f9a", trim: "#8a8478", columns: true },
  mausoleum: { wall: "#aaa69c", timber: "#6e6a62", roof: "#77736a", trim: "#5e5a52", blocks: true },
  "rock-cut dwelling": { wall: "#c9a678", timber: "#8a6a44", roof: "#a8875e", trim: "#7a5a3a", blocks: true, flat: true },
});

import { inPoly } from "./footprint.mjs";
export { inPoly };

/** Roof pixels for a polygon (pixels): hipped facets by nearest eave, tile rows along each eave, ridges and hips darker. */
function drawRoof(fb, poly, base, seed, flat = false) {
  const r = R(base, 6, 0.5), edges = poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
  fb.polygon(poly, null, (x, y) => {
    const px = x + 0.5, py = y + 0.5;
    if (flat) return h2(x >> 1, y >> 1, seed) < 0.2 ? r[2] : r[3];
    let best = Infinity, second = Infinity, bn = [0, 0];
    for (const [a, b] of edges) {
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, d = Math.abs((px - a[0]) * dy - (py - a[1]) * dx) / L;
      if (d < best) { second = best; best = d; bn = [dy / L, -dx / L]; } else if (d < second) second = d;
    }
    if (second - best < 0.9) return r[0];
    // Facet tone by which way it faces: north (far, lit) lightest, east darkest; tiles in rows along the eave.
    const facing = -(bn[0] * LIGHT.x + bn[1] * LIGHT.y) * 0.8 - 0.15, row = Math.floor(best / 3), tileEdge = Math.floor(best) % 3 === 2;
    const along = Math.abs(bn[1]) > Math.abs(bn[0]) ? px : py, stagger = (Math.floor(along + (row & 1) * 2) % 4) === 0;
    let k = clamp(Math.round(2.6 - facing * 1.6), 1, 4);
    if (tileEdge) k = Math.max(1, k - 1); else if (stagger) k = Math.max(1, k - 1);
    if (h2(Math.floor(along / 4), row, seed) < 0.06 && !tileEdge) k = Math.min(5, k + 1);
    return r[k];
  });
  for (const [a, b] of edges) fb.line(a[0], a[1], b[0], b[1], r[0]);
}

/** A wall face (pixels): plaster with timbering, stone blocks or temple columns; windows and a door on the front. */
function drawWall(fb, quad, look, { storeys, front, doorPx = null, P, seed, x0, x1, yBase, fh }) {
  const wall = R(look.wall, 5, 0.45), timber = R(look.timber, 4, 0.4);
  fb.polygon(quad, null, (x, y) => {
    const ly = yBase - (y + 0.5), lx = x - x0;
    if (look.blocks) { const row = Math.floor(ly / 4), col = Math.floor((lx + (row & 1) * 3) / 6); return ((Math.floor(ly) % 4) === 0 || ((lx + (row & 1) * 3) % 6) === 0) ? wall[1] : wall[2 + (h2(col, row, seed) < 0.4 ? 1 : 0)]; }
    if (look.columns) return (Math.floor(lx) % P) < P * 0.22 || (Math.floor(lx) % P) > P * 0.78 ? wall[4] : wall[1];
    if (look.timbered && (Math.floor(lx) % P === 0 || Math.abs((ly % (fh / storeys))) < 1)) return timber[1];
    return h2(x, y, seed) < 0.05 ? wall[1] : wall[2 + (noise(x, y, 6, seed) > 0.6 ? 1 : 0)];
  });
  if (!front) { fb.polygon(quad, null, (x, y) => mixc(fb.get(x, y), rgb("#2a2420"), 0.18)); return; }
  // Sunlit or shaded front, by where the sun stands.
  fb.polygon(quad, null, (x, y) => { const c = fb.get(x, y), t = LIGHT.faceTone; return t >= 0 ? mixc(c, rgb("#fff4dc"), t * 0.22) : mixc(c, rgb("#2a2c3c"), -t * 0.32); });
  // Eave shadow along the top.
  for (let x = Math.round(x0); x < Math.round(x1); x += 1) for (let k = 0; k < 2; k += 1) fb.tone(x, Math.round(yBase - fh) + k, -0.35);
  // Glass reflects the sky by day and glows with lamplight once the lamps are lit.
  const band = fh / storeys, glass = LIGHT.lightsOn ? R("#e8a040", 4, 0.45) : R("#4f86a8", 4, 0.5), frame = R(look.trim, 4, 0.4);
  for (let s = 0; s < storeys; s += 1) for (let sx = Math.floor(x0 / P) * P; sx < x1; sx += P) {
    const cx = sx + P / 2; if (cx < x0 || cx > x1) continue;
    const isDoor = doorPx != null && s === storeys - 1 && Math.abs(cx - doorPx) < P / 2;
    if (isDoor) {
      const dw = Math.max(4, Math.round(P * 0.42)), dh = Math.max(6, Math.round(band * 0.8)), dx0 = Math.round(cx - dw / 2), dy0 = Math.round(yBase - dh);
      fb.rect(dx0 - 1, dy0 - 1, dw + 2, dh + 1, frame[0]);
      for (let y = dy0; y < yBase; y += 1) for (let x = dx0; x < dx0 + dw; x += 1) fb.set(x, y, (x - dx0) % 3 === 2 ? frame[1] : frame[2]);
      fb.set(dx0 + dw - 2, dy0 + Math.round(dh / 2), rgb("#e8c860"));
      continue;
    }
    if (look.columns) continue;
    const ww = Math.max(3, Math.round(P * 0.34)), wh = Math.max(3, Math.round(band * 0.38)), wx0 = Math.round(cx - ww / 2), wy0 = Math.round(yBase - fh + s * band + band * 0.25);
    fb.rect(wx0 - 1, wy0 - 1, ww + 2, wh + 2, frame[1]);
    for (let y = wy0; y < wy0 + wh; y += 1) for (let x = wx0; x < wx0 + ww; x += 1) fb.set(x, y, x - wx0 === Math.floor(ww / 2) || y - wy0 === Math.floor(wh / 2) ? frame[2] : (x - wx0 + y - wy0) < 2 ? glass[3] : glass[1]);
    fb.rect(wx0 - 1, wy0 + wh + 1, ww + 2, 1, frame[3]);
  }
}

/**
 * A building in three-quarter view inside its footprint (pixels: square units × P): an L as two blocks,
 * cut corners as the true outline; roofs tiled and hipped, the south-facing walls shown.
 */
export function drawBuilding(fb, b, P, polygon, seed) {
  const look = LOOK[b.label] ?? LOOK.building, storeys = b.storeys ?? 1;
  const blocks = b.chamfers?.length ? [{ poly: polygon.map(([x, y]) => [x * P, y * P]), y1: b.y1, x0: b.x0, x1: b.x1 }] : [...(b.rects ?? [b])].sort((p, q) => p.y1 - q.y1).map((r) => ({ poly: [[r.x0 * P, r.y0 * P], [(r.x1 + 1) * P, r.y0 * P], [(r.x1 + 1) * P, (r.y1 + 1) * P], [r.x0 * P, (r.y1 + 1) * P]], y1: r.y1, x0: r.x0, x1: r.x1, rect: r }));
  for (const blk of blocks) {
    const ys = blk.poly.map((p) => p[1]), top = Math.min(...ys), bottom = Math.max(...ys), d = (bottom - top) / P;
    const fh = Math.round(Math.min(0.85 * storeys, Math.max(0.6, d * 0.45)) * P);
    // Roof: the outline raised by the wall height, cut at the building's north edge.
    const roof = clipBelow(blk.poly.map(([x, y]) => [x, y - fh]), top);
    drawRoof(fb, roof, look.roof, seed + blk.x0 * 7 + blk.y1, look.flat);
    // South-facing walls: straight fronts and angled corners.
    for (let i = 0; i < blk.poly.length; i += 1) {
      const p = blk.poly[i], q = blk.poly[(i + 1) % blk.poly.length]; if (q[0] - p[0] >= 0) continue;
      const straight = Math.abs(q[1] - p[1]) < 0.5, door = b.doorEdge && b.door === "s" && straight && b.doorEdge.sq[1] === blk.y1 && b.doorEdge.sq[0] >= blk.x0 && b.doorEdge.sq[0] <= blk.x1 ? (b.doorEdge.sq[0] + 0.5) * P : null;
      drawWall(fb, [p, q, [q[0], q[1] - fh], [p[0], p[1] - fh]], look, { storeys, front: straight, doorPx: door, P, seed, x0: Math.min(p[0], q[0]), x1: Math.max(p[0], q[0]), yBase: Math.max(p[1], q[1]), fh });
    }
  }
}

function clipBelow(poly, y0) {
  const out = [];
  for (let i = 0; i < poly.length; i += 1) { const a = poly[i], b = poly[(i + 1) % poly.length], ia = a[1] >= y0, ib = b[1] >= y0; if (ia) out.push(a); if (ia !== ib) { const t = (y0 - a[1]) / (b[1] - a[1]); out.push([a[0] + t * (b[0] - a[0]), y0]); } }
  return out;
}

// ---------------------------------------------------------------- features

/** A solid in three-quarter view (pixels): a lit top and a shaded south face, textured from its colour. */
export function drawBlock(fb, x, y, w, h, riseP, base, seed, round = false) {
  const g = R(base, 5, 0.5);
  if (round) {
    const cx = x + w / 2, rx = w / 2 * 0.9, ry = h / 2 * 0.55;
    for (let yy = Math.round(y + h / 2 - riseP); yy <= Math.round(y + h / 2); yy += 1) for (let xx = Math.round(cx - rx); xx <= Math.round(cx + rx); xx += 1) fb.set(xx, yy, xx < cx - rx * 0.4 ? g[2] : g[1]);
    fb.ellipse(cx, y + h / 2, rx, ry, null, (px, py, u) => (u < -0.4 ? g[2] : g[1]));
    fb.ellipse(cx, y + h / 2 - riseP, rx, ry, null, (px, py, u, v) => g[clamp(Math.round(3 + lit(u, v) * 0.9 + (h2(px, py, seed) - 0.5) * 0.6), 2, 4)]);
    return;
  }
  fb.rect(x, y + h - riseP, w, riseP, g[1]);
  for (let xx = Math.round(x); xx < Math.round(x + w); xx += 1) fb.set(xx, Math.round(y + h) - 1, g[0]);
  fb.polygon([[x, y - riseP], [x + w, y - riseP], [x + w, y + h - riseP], [x, y + h - riseP]], null, (px, py) => g[clamp(Math.round(3 + (h2(px >> 1, py >> 1, seed) - 0.5) * 1.2 + ((px - x) / w - 0.5) * LIGHT.x * 0.8), 2, 4)]);
  // The south face: lit when the sun is in the south, in shade when it is in the north.
  for (let yy = Math.round(y + h - riseP); yy < Math.round(y + h); yy += 1) for (let xx = Math.round(x); xx < Math.round(x + w); xx += 1) fb.tone(xx, yy, LIGHT.faceTone * 0.3);
  for (let xx = Math.round(x); xx < Math.round(x + w); xx += 1) fb.set(xx, Math.round(y - riseP), g[4]);
}

/** Specific features; anything else is a block in its colour. Returns true if drawn. */
export function drawFeature(fb, f, def, P, seed, standFt) {
  const x = f.x * P, y = f.y * P, w = f.w * P, h = f.h * P, riseP = Math.min(3, standFt / 10) * P * 0.85;
  switch (f.kind) {
    case "crates": { const g = R("#9a7448", 5); drawBlock(fb, x + 2, y + 2, w - 4, h - 4, riseP, "#9a7448", seed); fb.line(x + 2, y + 2 - riseP, x + w - 3, y + h - 3 - riseP, g[1]); fb.line(x + w - 3, y + 2 - riseP, x + 2, y + h - 3 - riseP, g[1]); return true; }
    case "barrels": for (const [dx, dy] of [[0.3, 0.35], [0.68, 0.4], [0.48, 0.72]]) drawBlock(fb, x + w * dx - P * 0.17, y + h * dy - P * 0.17, P * 0.34, P * 0.34, P * 0.32, "#7a5532", seed, true); return true;
    case "haystack": drawBlock(fb, x + 2, y + 2, w - 4, h - 4, P * 0.45, "#d2b45a", seed, true); return true;
    case "fountain": case "well": { drawBlock(fb, x + 2, y + 2, w - 4, h - 4, P * 0.25, "#a8a094", seed, true); fb.ellipse(x + w / 2, y + h / 2 - P * 0.25, (w - 4) / 2 * 0.65, (h - 4) / 2 * 0.35, null, (px, py) => (h2(px, py >> 1, seed) < 0.15 ? rgb("#cfe8f4") : rgb("#5f9cc4"))); return true; }
    case "statue": case "standing-stone": case "obelisk": case "pillar": case "ward-stone": case "petrified-warrior": {
      drawBlock(fb, x + w * 0.15, y + h * 0.45, w * 0.7, h * 0.4, P * 0.2, "#9c968a", seed);
      drawBlock(fb, x + w * 0.32, y + h * 0.3, w * 0.36, h * 0.3, riseP, def.color, seed, f.kind !== "obelisk"); return true;
    }
    case "fence": case "pen": case "low-wall": case "palisade-wall": case "ruined-wall": case "barricade": case "hedgerow": {
      const horizontal = w >= h, posts = f.kind === "fence" || f.kind === "pen", base = f.kind === "hedgerow" ? "#3f6a33" : def.color;
      if (posts) { const g = R(base, 4); const n = Math.round((horizontal ? w : h) / (P * 0.5)); for (let k = 0; k <= n; k += 1) { const px = horizontal ? x + (k / n) * (w - 2) : x + w / 2, py = horizontal ? y + h / 2 : y + (k / n) * (h - 2); fb.rect(px - 1, py - P * 0.45, 2, P * 0.45, g[1]); } if (horizontal) { fb.rect(x, y + h / 2 - P * 0.35, w, 1, g[2]); fb.rect(x, y + h / 2 - P * 0.18, w, 1, g[2]); } else { fb.rect(x + w / 2 - 1, y, 2, h, g[2]); } return true; }
      drawBlock(fb, horizontal ? x : x + w * 0.2, horizontal ? y + h * 0.2 : y, horizontal ? w : w * 0.6, horizontal ? h * 0.6 : h, riseP, base, seed); return true;
    }
    case "market-stall": { const g = R("#7a5532", 4); drawBlock(fb, x + 2, y + h * 0.3, w - 4, h * 0.6, P * 0.3, "#8a6a44", seed); for (let yy = Math.round(y - P * 0.3); yy < Math.round(y + h * 0.35); yy += 1) for (let xx = Math.round(x); xx < Math.round(x + w); xx += 1) fb.set(xx, yy, Math.floor((xx - x) / 3) % 2 ? rgb("#e8e0d0") : rgb(def.color)); fb.rect(x, y + h * 0.35, w, 1, g[0]); return true; }
    case "tent": { const g = R(def.color, 5); fb.polygon([[x + 2, y + h - 2], [x + w / 2, y - P * 0.4], [x + w - 2, y + h - 2]], null, (px) => (px < x + w / 2 ? g[3] : g[1])); fb.polygon([[x + w / 2 - 3, y + h - 2], [x + w / 2, y + h * 0.35], [x + w / 2 + 3, y + h - 2]], rgb("#3a2a1a")); return true; }
    case "campfire": case "beacon": case "elemental-vent": { fb.ellipse(x + w / 2, y + h / 2, w * 0.36, h * 0.26, rgb("#6d665c")); for (let k = 0; k < 14; k += 1) fb.set(x + w / 2 + (h2(k, seed, 1) - 0.5) * w * 0.4, y + h / 2 - h2(k, seed, 2) * P * 0.45, k % 3 ? rgb("#ffb347") : rgb("#ff6a2a")); return true; }
    case "fallen-log": case "driftwood": case "deadfall": case "wreckage": { const g = R(def.color, 5), horizontal = w >= h; drawBlock(fb, horizontal ? x + 2 : x + w * 0.25, horizontal ? y + h * 0.25 : y + 2, horizontal ? w - 4 : w * 0.5, horizontal ? h * 0.5 : h - 4, P * 0.25, def.color, seed, false); fb.ellipse(horizontal ? x + w - 4 : x + w / 2, horizontal ? y + h / 2 - P * 0.12 : y + h - 4, P * 0.18, P * 0.14, g[3]); return true; }
    case "cart": case "rowboat": case "gondola": drawBlock(fb, x + 2, y + 3, w - 4, h - 6, P * 0.35, def.color, seed); if (f.kind === "cart") for (const [dx, dy] of [[0.1, 0.25], [0.1, 0.75]]) fb.ellipse(x + w * dx, y + h * dy, P * 0.12, P * 0.2, rgb("#3a2a1a")); return true;
    default: return false;
  }
}

// ---------------------------------------------------------------- furniture

/** Furniture in three-quarter view (pixels). */
export function drawFurniture(fb, it, P, seed) {
  const x = it.x * P, y = it.y * P, w = it.w * P, h = it.h * P;
  switch (it.kind) {
    case "rug": { const g = R(it.color, 4); fb.rect(x + 2, y + 2, w - 4, h - 4, g[1]); fb.rect(x + 4, y + 4, w - 8, h - 8, g[2]); return; }
    case "bed": drawBlock(fb, x + 2, y + 2, w - 4, h - 4, P * 0.2, "#7a5a3a", seed); fb.rect(x + 3, y + 3 - P * 0.2, w - 6, (h - 6) * 0.25, rgb("#efe8dc")); fb.rect(x + 3, y + 3 - P * 0.2 + (h - 6) * 0.3, w - 6, (h - 6) * 0.7, rgb(it.color)); return;
    case "hearth": drawBlock(fb, x + 1, y + 1, w - 2, h - 2, P * 0.5, "#8a8074", seed); fb.rect(x + w * 0.3, y + h - 2 - P * 0.35, w * 0.4, P * 0.3, rgb("#ff8a3a")); return;
    case "pillar": drawBlock(fb, x + w * 0.2, y + h * 0.2, w * 0.6, h * 0.6, P * 0.9, it.color, seed, true); return;
    default: {
      const tall = ["wardrobe", "shelves", "crates", "counter", "wine-rack"].includes(it.kind), riseP = tall ? P * 0.55 : P * 0.2;
      drawBlock(fb, x + 2, y + 2, w - 4, h - 4, riseP, it.color, seed);
      furnitureShade(fb, x + 2, y + 2, w - 4, h - 4, riseP, it.kind);
    }
  }
}

/**
 * A piece's shading of itself, at any hour: its front darkening toward the floor (the floor and the piece
 * shade each other there), a dark seam under the lip of its top, and the recesses of open furniture
 * (shelves, racks: the shelf openings; a wardrobe: the gap between its doors).
 */
function furnitureShade(fb, x, y, w, h, riseP, kind) {
  const top = Math.round(y + h - riseP), bottom = Math.round(y + h), left = Math.round(x), right = Math.round(x + w);
  for (let yy = top; yy < bottom; yy += 1) { const t = (yy - top) / Math.max(1, bottom - top); if (t > 0.45) for (let xx = left; xx < right; xx += 1) fb.tone(xx, yy, -0.22 * (t - 0.45)); }
  for (let xx = left; xx < right; xx += 1) fb.tone(xx, top, -0.18);
  if (kind === "shelves" || kind === "wine-rack") for (let yy = top + 3; yy < bottom - 2; yy += 4) for (let xx = left + 2; xx < right - 2; xx += 1) fb.tone(xx, yy, -0.26);
  if (kind === "wardrobe") for (let yy = top + 2; yy < bottom - 1; yy += 1) fb.tone(Math.round(x + w / 2), yy, -0.3);
}
