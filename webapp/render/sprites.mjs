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

/** The building style being drawn (palette and kits from eym-building-styles.mjs). */
const STYLE = { ...BUILDING_STYLES.default };
export function setBuildingStyle(id) { Object.assign(STYLE, buildingStyle(id)); }
const lookFor = (label) => {
  const p = STYLE.palette, base = LOOK[label] ?? LOOK.building;
  if (label === "house" || label === "building" || !LOOK[label]) return { ...base, wall: p.wall, timber: p.timber, roof: p.roof, trim: p.trim, door: p.door, mortar: p.mortar, stone: p.stone, metal: p.metal, verdigris: p.verdigris, timbered: STYLE.wall === "timbered", brick: STYLE.wall === "brick", blocks: STYLE.wall === "stone", slate: STYLE.roof === "slate", flat: STYLE.roof === "flat", sash: STYLE.windows === "sash", chimneys: STYLE.chimneys !== "none" };
  if (label === "temple") return { ...base, roof: p.templeRoof ?? base.roof, slate: STYLE.roof === "slate" };
  return base;
};

const LOOK = Object.freeze({
  house: { wall: "#e2d4b6", timber: "#5e3e26", roof: "#b8583c", trim: "#6e4a2a", timbered: true },
  building: { wall: "#e2d4b6", timber: "#5e3e26", roof: "#b8583c", trim: "#6e4a2a", timbered: true },
  temple: { wall: "#ece6d8", timber: "#b8b0a0", roof: "#5f7f9a", trim: "#8a8478", columns: true },
  mausoleum: { wall: "#aaa69c", timber: "#6e6a62", roof: "#77736a", trim: "#5e5a52", blocks: true },
  "rock-cut dwelling": { wall: "#c9a678", timber: "#8a6a44", roof: "#a8875e", trim: "#7a5a3a", blocks: true, flat: true },
});

import { inPoly } from "./footprint.mjs";
import { BUILDING_STYLES, buildingStyle } from "../../scripts/eym-building-styles.mjs";
export { inPoly };

/** Roof pixels for a polygon (pixels): hipped facets by nearest eave, tile rows along each eave, ridges and hips darker. */
function drawRoof(fb, poly, base, seed, flat = false, slate = false) {
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
    // Slate: narrower courses of flat, blue-grey slates, each its own shade, joints staggered.
    const course = slate ? 2 : 3, facing = -(bn[0] * LIGHT.x + bn[1] * LIGHT.y) * 0.8 - 0.15, row = Math.floor(best / course), tileEdge = Math.floor(best) % course === course - 1;
    const along = Math.abs(bn[1]) > Math.abs(bn[0]) ? px : py, stagger = (Math.floor(along + (row & 1) * 2) % (slate ? 3 : 4)) === 0;
    let k = clamp(Math.round(2.6 - facing * 1.6), 1, 4);
    if (tileEdge) k = Math.max(1, k - 1); else if (stagger) k = Math.max(1, k - 1);
    if (h2(Math.floor(along / (slate ? 3 : 4)), row, seed) < (slate ? 0.12 : 0.06) && !tileEdge) k = Math.min(5, k + 1);
    return r[k];
  });
  for (const [a, b] of edges) fb.line(a[0], a[1], b[0], b[1], r[0]);
}

/** A wall face (pixels): plaster with timbering, stone blocks or temple columns; windows and a door on the front. */
function drawWall(fb, quad, look, { storeys, front, doorPx = null, P, seed, x0, x1, yBase, fh }) {
  const wall = R(look.wall, 5, 0.45), timber = R(look.timber, 4, 0.4);
  fb.polygon(quad, null, (x, y) => {
    const ly = yBase - (y + 0.5), lx = x - x0;
    if (look.brick) {
      // Brick in stretcher bond: 2-px courses, 5-px bricks, joints in mortar; a pale stone band at each floor.
      const row = Math.floor(ly / 2), off = (row & 1) * 3, col = Math.floor((lx + off) / 6), band = fh / storeys;
      if (storeys > 1 && Math.abs(ly % band) < 1.2 && ly > 2) return R(look.stone, 4, 0.35)[2];
      if (Math.floor(ly) % 2 === 1 || ((Math.floor(lx) + off) % 6) === 0) return R(look.mortar, 3, 0.3)[1];
      const t = h2(col, row, seed); return wall[t < 0.15 ? 1 : t > 0.88 ? 3 : 2];
    }
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
      const leaf = look.door ? R(look.door, 4, 0.45) : frame;
      for (let y = dy0; y < yBase; y += 1) for (let x = dx0; x < dx0 + dw; x += 1) fb.set(x, y, (x - dx0) % 3 === 2 ? leaf[1] : leaf[2]);
      if (look.sash) { const fan = Math.max(2, Math.round(dw / 2)); for (let y = dy0 - 3; y < dy0; y += 1) for (let x = dx0; x < dx0 + dw; x += 1) if (Math.hypot(x + 0.5 - (dx0 + dw / 2), (y - dy0) * 1.4) <= fan) fb.set(x, y, (x + y) % 2 ? glass[2] : glass[1]); fb.rect(dx0 - 2, yBase - 1, dw + 4, 1, R(look.stone, 4, 0.35)[1]); }
      fb.set(dx0 + dw - 2, dy0 + Math.round(dh / 2), rgb("#e8c860"));
      continue;
    }
    if (look.columns) continue;
    if (look.sash) {
      // A tall sash window: white frame, the meeting rail across the middle, small panes, a stone lintel and sill.
      const ww = Math.max(3, Math.round(P * 0.28)), wh = Math.max(5, Math.round(band * 0.56)), wx0 = Math.round(cx - ww / 2), wy0 = Math.round(yBase - fh + s * band + band * 0.2), stone = R(look.stone, 4, 0.35);
      fb.rect(wx0 - 1, wy0 - 1, ww + 2, wh + 2, frame[2]);
      for (let y = wy0; y < wy0 + wh; y += 1) for (let x = wx0; x < wx0 + ww; x += 1) fb.set(x, y, y - wy0 === Math.floor(wh / 2) || (x - wx0) === Math.floor(ww / 2) ? frame[3] : (x - wx0 + y - wy0) < 2 ? glass[3] : glass[1]);
      fb.rect(wx0 - 2, wy0 - 3, ww + 4, 2, stone[2]); fb.rect(wx0 - 2, wy0 - 3, ww + 4, 1, stone[3]);
      fb.rect(wx0 - 2, wy0 + wh + 1, ww + 4, 1, stone[2]); fb.rect(wx0 - 1, wy0 + wh + 2, ww + 2, 1, stone[0]);
      continue;
    }
    const ww = Math.max(3, Math.round(P * 0.34)), wh = Math.max(3, Math.round(band * 0.38)), wx0 = Math.round(cx - ww / 2), wy0 = Math.round(yBase - fh + s * band + band * 0.25);
    fb.rect(wx0 - 1, wy0 - 1, ww + 2, wh + 2, frame[1]);
    for (let y = wy0; y < wy0 + wh; y += 1) for (let x = wx0; x < wx0 + ww; x += 1) fb.set(x, y, x - wx0 === Math.floor(ww / 2) || y - wy0 === Math.floor(wh / 2) ? frame[2] : (x - wx0 + y - wy0) < 2 ? glass[3] : glass[1]);
    fb.rect(wx0 - 1, wy0 + wh + 1, ww + 2, 1, frame[3]);
  }
  // Copper downpipes at the ends of a long front, gone green in streaks.
  if (look.metal && look.verdigris && x1 - x0 > P * 1.5) {
    const cu = R(look.metal, 4, 0.5), vg = R(look.verdigris, 4, 0.4);
    for (const px of [Math.round(x0) + 1, Math.round(x1) - 2]) for (let y = Math.round(yBase - fh) + 1; y < yBase; y += 1) { const green = h2(px, y >> 2, seed) < 0.35; fb.set(px, y, green ? vg[2] : cu[2]); fb.set(px + 1, y, green ? vg[1] : cu[1]); }
  }
}

/**
 * A building in three-quarter view inside its footprint (pixels: square units × P): an L as two blocks,
 * cut corners as the true outline; roofs tiled and hipped, the south-facing walls shown.
 */
export function drawBuilding(fb, b, P, polygon, seed) {
  if (b.floorRects) return drawStoreys(fb, b, P, seed, lookFor(b.label));
  const look = lookFor(b.label), storeys = b.storeys ?? 1; let frame = null;
  const blocks = b.chamfers?.length ? [{ poly: polygon.map(([x, y]) => [x * P, y * P]), y1: b.y1, x0: b.x0, x1: b.x1 }] : [...(b.rects ?? [b])].sort((p, q) => p.y1 - q.y1).map((r) => ({ poly: [[r.x0 * P, r.y0 * P], [(r.x1 + 1) * P, r.y0 * P], [(r.x1 + 1) * P, (r.y1 + 1) * P], [r.x0 * P, (r.y1 + 1) * P]], y1: r.y1, x0: r.x0, x1: r.x1, rect: r }));
  for (const blk of blocks) {
    const ys = blk.poly.map((p) => p[1]), top = Math.min(...ys), bottom = Math.max(...ys), d = (bottom - top) / P;
    const fh = Math.round(Math.min(0.85 * storeys, Math.max(0.6, d * 0.45)) * P);
    // Roof: the outline raised by the wall height, cut at the building's north edge.
    const roof = clipBelow(blk.poly.map(([x, y]) => [x, y - fh]), top);
    drawRoof(fb, roof, look.roof, seed + blk.x0 * 7 + blk.y1, look.flat, look.slate);
    // South-facing walls: straight fronts and angled corners.
    for (let i = 0; i < blk.poly.length; i += 1) {
      const p = blk.poly[i], q = blk.poly[(i + 1) % blk.poly.length]; if (q[0] - p[0] >= 0) continue;
      const straight = Math.abs(q[1] - p[1]) < 0.5, door = b.doorEdge && b.door === "s" && straight && b.doorEdge.sq[1] === blk.y1 && b.doorEdge.sq[0] >= blk.x0 && b.doorEdge.sq[0] <= blk.x1 ? (b.doorEdge.sq[0] + 0.5) * P : null;
      drawWall(fb, [p, q, [q[0], q[1] - fh], [p[0], p[1] - fh]], look, { storeys, front: straight, doorPx: door, P, seed, x0: Math.min(p[0], q[0]), x1: Math.max(p[0], q[0]), yBase: Math.max(p[1], q[1]), fh });
    }
    if (look.chimneys && !look.flat) drawChimneys(fb, roof, look, P, seed + blk.x0 * 5 + blk.y1);
    frame = { fh, band: fh / storeys, south: bottom, roofTop: top };
  }
  return frame;
}

/** Chimney stacks on the roof (brick, a stone cap, copper pots), one at each end of the ridge of a long roof. */
function drawChimneys(fb, roof, look, P, seed) {
  if (roof.length < 3) return;
  const xs = roof.map((p) => p[0]), ys = roof.map((p) => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), w = x1 - x0, cy = (y0 + y1) / 2;
  const spots = w > P * 2.2 ? [x0 + w * 0.22, x1 - w * 0.22] : [x0 + w * (h2(seed, 1, 3) < 0.5 ? 0.3 : 0.7)];
  const brick = R(look.wall, 5, 0.45), cap = R(look.stone ?? "#c8bfac", 4, 0.4), pot = R(look.metal ?? "#b87333", 4, 0.5), sw = Math.max(5, Math.round(P * 0.22)), sh = Math.round(P * 0.42);
  for (const sx of spots) {
    const x = Math.round(sx - sw / 2), top = Math.round(cy - sh);
    for (let y = top; y < Math.round(cy); y += 1) for (let xx = x; xx < x + sw; xx += 1) { const ly = y - top, row = Math.floor(ly / 2); fb.set(xx, y, ly % 2 === 1 ? brick[1] : ((xx - x + (row & 1) * 2) % 4 === 0 ? brick[1] : xx - x < 1 ? brick[3] : brick[2])); }
    fb.rect(x - 1, top - 1, sw + 2, 2, cap[2]); fb.rect(x - 1, top, sw + 2, 1, cap[1]);
    for (let k = 0; k < 2; k += 1) { const px = x + 1 + k * Math.max(2, sw - 4); fb.rect(px, top - 3, 2, 2, pot[k === 0 ? 2 : 1]); fb.set(px, top - 3, pot[3]); }
    for (let xx = x; xx < x + sw; xx += 1) fb.tone(xx, Math.round(cy), -0.3);
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
    case "crystal-boiler": {
      // A copper boiler on iron legs over a glowing fire crystal, a pipe rising into the wall behind.
      const cu = R("#b87333", 5, 0.5), iron = R("#3a3836", 4, 0.4), cx = x + w / 2, rx = w * 0.3, top = y + h * 0.18, bot = y + h * 0.7;
      fb.rect(cx - 1, y + 1, 2, top - y, cu[2]); fb.rect(cx - 1, y + 1, 1, top - y, cu[3]);
      fb.rect(cx - rx, bot - 1, 1, h * 0.2, iron[1]); fb.rect(cx + rx - 1, bot - 1, 1, h * 0.2, iron[1]);
      glowCrystal(fb, cx, bot + h * 0.08, "#ff7a30", 2);
      fb.ellipse(cx, top, rx, rx * 0.45, null, () => cu[3]);
      for (let yy = Math.round(top); yy < bot; yy += 1) for (let xx = Math.round(cx - rx); xx <= cx + rx; xx += 1) { const u = (xx - cx) / rx; fb.set(xx, yy, (yy - Math.round(top)) % 5 === 4 ? cu[1] : u < -0.4 ? cu[3] : u > 0.5 ? cu[1] : cu[2]); }
      fb.set(Math.round(cx + rx * 0.3), Math.round((top + bot) / 2), rgb("#f2efe6")); fb.set(Math.round(cx + rx * 0.3) + 1, Math.round((top + bot) / 2), rgb("#2a2420"));
      return;
    }
    case "pipework": {
      // Two copper pipes along the wall with a red valve wheel and a gauge.
      const cu = R("#b87333", 5, 0.5), horizontal = w >= h;
      for (const k of [0.32, 0.55]) { if (horizontal) { fb.rect(x + 2, y + h * k, w - 4, 2, cu[2]); fb.rect(x + 2, y + h * k, w - 4, 1, cu[3]); } else { fb.rect(x + w * k, y + 2, 2, h - 4, cu[2]); fb.rect(x + w * k, y + 2, 1, h - 4, cu[3]); } }
      const vx = x + (horizontal ? w * 0.35 : w * 0.45), vy = y + (horizontal ? h * 0.42 : h * 0.35); fb.ellipse(vx, vy, 3, 2, null, (px, py, u, v) => (u * u + v * v > 0.45 ? rgb("#b83a2a") : rgb("#3a2420")));
      const gx = x + (horizontal ? w * 0.7 : w * 0.45), gy = y + (horizontal ? h * 0.36 : h * 0.68); fb.ellipse(gx, gy, 2, 2, null, () => rgb("#f2efe6")); fb.set(Math.round(gx), Math.round(gy), rgb("#2a2420"));
      return;
    }
    case "gear-press": {
      // An iron press: a riveted body, two meshing gears on top (brass and copper, toothed, spoked), a piston.
      const riseP = P * 0.42; drawBlock(fb, x + 2, y + 2, w - 4, h - 4, riseP, "#4a4e54", seed); furnitureShade(fb, x + 2, y + 2, w - 4, h - 4, riseP, "gear-press");
      const iron = R("#4a4e54", 5, 0.5); for (let xx = Math.round(x + 4); xx < x + w - 4; xx += 4) { fb.set(xx, Math.round(y + h - 2 - riseP + 2), iron[4]); }
      const gear = (gx, gy, r, base, teeth) => {
        const c = R(base, 5, 0.55);
        for (let t = 0; t < teeth; t += 1) { const a = (t / teeth) * Math.PI * 2; fb.rect(Math.round(gx + Math.cos(a) * (r + 1)) - 1, Math.round(gy + Math.sin(a) * (r + 1) * 0.8) - 1, 2, 2, c[1]); }
        fb.ellipse(gx, gy, r, r * 0.8, null, (px, py, u, v) => { const d = u * u + v * v; return d < 0.12 ? rgb("#1e1c1a") : d < 0.25 ? c[4] : (Math.abs(u) < 0.12 || Math.abs(v) < 0.12) ? c[3] : d > 0.8 ? c[1] : u + v < 0 ? c[3] : c[2]; });
      };
      const top = y + 2 - riseP, fh = h - 4, r1 = Math.max(4, Math.min(w, h) * 0.3);
      gear(x + w * 0.3, top + fh * 0.5, r1, "#c9a24a", 10); gear(x + w * 0.3 + r1 * 1.75, top + fh * 0.5 - r1 * 0.2, r1 * 0.6, "#b87333", 7);
      fb.rect(Math.round(x + w * 0.85), Math.round(top - P * 0.2), 2, Math.round(P * 0.2 + fh * 0.5), iron[3]); fb.rect(Math.round(x + w * 0.85) - 1, Math.round(top - P * 0.2), 4, 2, R("#c9a24a", 4, 0.5)[3]);
      return;
    }
    case "aether-coil": {
      // Stacked brass rings narrowing upward, a blue crystal crackling on top.
      const brass = R("#c9a24a", 5, 0.5), cx = x + w / 2, base = y + h * 0.78;
      for (let k = 0; k < 5; k += 1) fb.ellipse(cx, base - k * (h * 0.11), w * (0.32 - k * 0.035), h * 0.06, null, (px, py, u) => brass[u < -0.3 ? 3 : u > 0.5 ? 1 : 2]);
      glowCrystal(fb, cx, base - h * 0.62, "#8fd0ff", 3);
      for (const [dx, dy] of [[-4, -2], [3, -4], [5, 1]]) fb.set(Math.round(cx + dx), Math.round(base - h * 0.62 + dy), rgb("#e8f6ff"));
      return;
    }
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

/**
 * A street lamp from its foot (pixels): an iron post with a base and a bracket, and the lamp head — an
 * arc-lamp's copper cage around a pale crystal (Dree) or a plain lantern. Unlit-looking: its light is a
 * Foundry light that comes on as the scene darkens.
 */
export function drawStreetLamp(fb, x, y, P, kind = "lantern-post") {
  const iron = R("#2e3236", 4, 0.5), h = Math.round(P * 0.95), px = Math.round(x), py = Math.round(y);
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -3; dx <= 3; dx += 1) if (dx * dx / 9 + dy * dy <= 1) fb.tone(px + dx, py + dy, -0.22);
  fb.rect(px - 2, py - 2, 4, 2, iron[1]);
  for (let yy = py - h; yy < py - 2; yy += 1) { fb.set(px, yy, iron[2]); fb.set(px - 1, yy, iron[1]); }
  const top = py - h;
  if (kind === "arc-lamp") {
    const cu = R("#b87333", 4, 0.5), crystal = R("#cfeaff", 4, 0.35);
    fb.rect(px - 3, top - 1, 6, 1, cu[1]); fb.rect(px - 2, top - 6, 4, 5, crystal[2]); fb.set(px - 1, top - 5, crystal[3]); fb.set(px, top - 4, crystal[3]);
    fb.rect(px - 3, top - 6, 1, 5, cu[2]); fb.rect(px + 2, top - 6, 1, 5, cu[1]); fb.rect(px - 3, top - 7, 6, 1, cu[2]); fb.set(px - 1, top - 8, cu[3]); fb.set(px, top - 8, cu[2]);
  } else {
    const glass = R("#e8c890", 4, 0.4); fb.rect(px - 2, top - 5, 4, 4, glass[2]); fb.rect(px - 3, top - 6, 6, 1, iron[2]); fb.rect(px - 3, top - 1, 6, 1, iron[1]);
  }
}

// ---------------------------------------------------------------- overhangs, skybridges, lifts

const sqPoly = (r, P) => [[r.x0 * P, r.y0 * P], [(r.x1 + 1) * P, r.y0 * P], [(r.x1 + 1) * P, (r.y1 + 1) * P], [r.x0 * P, (r.y1 + 1) * P]];

/**
 * A building whose storeys differ (pixels): `rects[s]` is storey s's outline (null: none, as under a
 * skybridge). In the three-quarter view the top storey's outline carries the roof; each storey whose
 * front stands on the outline's south edge shows its wall, stepping out above the one below; under an
 * overhang the street shows in deep shade, with the joist ends and brackets that hold it up. Storeys set
 * back behind an overhang are hidden by it, as they would be.
 */
function drawStoreysOf(fb, rects, look, P, seed, { truss = false, storeyPx = null, clip = true } = {}) {
  const storeys = rects.length, T = rects[storeys - 1], d = T.y1 - T.y0 + 1;
  const frame = () => ({ fh, band, south, roofTop: T.y0 * P });
  const fh = storeyPx ? Math.round(storeyPx * storeys) : Math.round(Math.min(0.85 * storeys, Math.max(0.6 * storeys * 0.5, d * 0.45)) * P), band = fh / storeys, south = (T.y1 + 1) * P;
  // Straight beneath an overhang the ground is in its shade (most of it is then hidden by what is drawn above).
  const base = rects.find(Boolean) === rects[0] ? rects[0] : null;
  for (let y = T.y0 * P; y < south; y += 1) for (let x = T.x0 * P; x < (T.x1 + 1) * P; x += 1) { const sx = Math.floor(x / P), sy = Math.floor(y / P); if (!base || sx < base.x0 || sx > base.x1 || sy < base.y0 || sy > base.y1) fb.tone(x, y, -0.3); }
  const visible = rects.map((r) => r && r.y1 === T.y1);
  const lowest = visible.findIndex(Boolean);
  // The shade beneath: the street under the overhang, between the ground and the lowest storey over it.
  const shadeUnder = (x0, x1, yTop) => { for (let y = Math.round(yTop); y < south; y += 1) for (let x = Math.round(x0); x < Math.round(x1); x += 1) fb.tone(x, y, -0.34 - 0.12 * ((south - y) / Math.max(1, south - yTop))); };
  for (let s = 0; s < storeys; s += 1) {
    if (!visible[s] || s === 0) continue;
    const r = rects[s], below = s === lowest ? null : rects[s - 1], bottom = south - s * band;
    const spans = below && visible[s - 1] ? [[r.x0 * P, below.x0 * P], [(below.x1 + 1) * P, (r.x1 + 1) * P]] : [[r.x0 * P, (r.x1 + 1) * P]];
    for (const [a, b] of spans) if (b > a) shadeUnder(a, b, bottom);
  }
  // The roof over the top storey's outline.
  // A building's roof stays inside its squares (cut at its north edge); a bridge rises clear of its shadow.
  const roof = sqPoly(T, P).map(([x, y]) => [x, y - fh]), roofPoly = clip ? clipBelow(roof, T.y0 * P) : roof;
  drawRoof(fb, roofPoly, look.roof, seed + T.x0 * 7 + T.y1, look.flat, look.slate);
  if (look.chimneys && !look.flat) drawChimneys(fb, roofPoly, look, P, seed + T.x0 * 5);
  // The fronts, each storey on its own (a storey's band), bottom up.
  for (let s = 0; s < storeys; s += 1) {
    if (!visible[s]) continue;
    const r = rects[s], x0 = r.x0 * P, x1 = (r.x1 + 1) * P, yBase = south - s * band;
    drawWall(fb, [[x1, yBase], [x0, yBase], [x0, yBase - band], [x1, yBase - band]], look, { storeys: 1, front: true, doorPx: null, P, seed: seed + s, x0, x1, yBase, fh: band });
    // Where this storey overhangs the one below: joist ends along its foot and brackets beneath.
    const below = s > 0 ? rects[s - 1] : null, overhangs = s > 0 && (!below || !visible[s - 1] || below.x0 > r.x0 || below.x1 < r.x1);
    if (!overhangs) continue;
    const wood = R(look.timber ?? "#3c2a20", 4, 0.45), brass = R(look.metal ?? "#b87333", 4, 0.5), foot = Math.round(yBase);
    for (let x = Math.round(x0) + 1; x < x1 - 1; x += 5) { fb.set(x, foot, wood[1]); fb.set(x + 1, foot, wood[1]); fb.set(x, foot + 1, wood[0]); fb.set(x + 1, foot - 1, wood[2]); }
    for (let x = Math.round(x0) + 3; x < x1 - 3; x += P) for (let k = 0; k < Math.min(5, Math.round(band * 0.4)); k += 1) { fb.set(x + k, foot + 1 + k, (truss ? brass : wood)[k === 0 ? 3 : 1]); fb.set(x + k + 1, foot + 1 + k, (truss ? brass : wood)[0]); }
    if (truss) for (let x = Math.round(x0) + 3; x < x1 - 3; x += P) for (let k = 0; k < Math.min(5, Math.round(band * 0.4)); k += 1) fb.set(x + Math.round(P * 0.5) - 2 - k, foot + 1 + k, brass[1]);
  }
  return frame();
}

export function drawStoreys(fb, b, P, seed, look) {
  const rects = Array.from({ length: b.storeys ?? 1 }, (_, s) => (s === 0 ? { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 } : b.floorRects[s]));
  return drawStoreysOf(fb, rects, look, P, seed);
}

/** A skybridge: an enclosed span at the first floor, brass trusses beneath, the street in its shade. */
export function drawSkybridge(fb, k, P, seed) {
  drawStoreysOf(fb, [null, { x0: k.x0, y0: k.y0, x1: k.x1, y1: k.y1 }], { ...lookFor("house"), chimneys: false, sash: true }, P, seed, { truss: true, storeyPx: P * 0.42, clip: false });
}

/** A lift inside (pixels from squares): a brass cage with a crystal-lit floor plate, where the stairs would be. */
export function drawLift(fb, s, P) {
  const brass = R("#c9a24a", 4, 0.5), x0 = Math.round(s.x * P) + 2, y0 = Math.round(s.y * P) + 2, w = Math.round(s.w * P) - 4, h = Math.round(s.h * P) - 4;
  for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) fb.set(x, y, (x + y) % 4 === 0 ? rgb("#8fd0ff") : rgb("#2c2a26"));
  for (let x = x0; x < x0 + w; x += 1) { fb.set(x, y0, brass[3]); fb.set(x, y0 + h - 1, brass[1]); }
  for (let y = y0; y < y0 + h; y += 1) { fb.set(x0, y, brass[2]); fb.set(x0 + w - 1, y, brass[1]); }
  for (let x = x0 + 3; x < x0 + w - 2; x += 3) for (let y = y0 + 1; y < y0 + h - 1; y += 1) if (y % 2) fb.set(x, y, brass[2]);
}

// ---------------------------------------------------------------- machinery

/** A small crystal (pixels) with a halo: the glow is drawn, the light itself is Foundry's. */
function glowCrystal(fb, cx, cy, color, size = 2) {
  const c = R(color, 4, 0.4), x = Math.round(cx), y = Math.round(cy);
  for (let dy = -size - 2; dy <= size + 2; dy += 1) for (let dx = -size - 2; dx <= size + 2; dx += 1) { const d = Math.abs(dx) + Math.abs(dy); if (d > size && d <= size + 2) fb.set(x + dx, y + dy, mixc(fb.get(x + dx, y + dy), c[3], 0.35 - (d - size) * 0.1)); }
  for (let dy = -size; dy <= size; dy += 1) for (let dx = -size; dx <= size; dx += 1) { const d = Math.abs(dx) + Math.abs(dy); if (d <= size) fb.set(x + dx, y + dy, d === 0 ? rgb("#fff4e0") : dy < 0 ? c[3] : c[2]); }
}

/**
 * A boiler bolted to an upper storey's wall (pixels): a riveted copper drum on an iron cradle, sticking out
 * over the street like a unit in a window, piped into the wall, a fire crystal glowing beneath it, a wisp
 * of steam above. cx: its column's centre; storeyBottom: the foot of its storey's wall; band: storey height.
 */
export function drawWallBoiler(fb, cx, storeyBottom, band, P, seed) {
  const cu = R("#b87333", 6, 0.55), vg = R("#5f9e8c", 4, 0.4), iron = R("#2e3236", 4, 0.5), brass = R("#c9a24a", 4, 0.5);
  const w = Math.round(P * 0.66), h = Math.max(7, Math.round(band * 0.78)), x0 = Math.round(cx - w / 2), y1 = Math.round(storeyBottom + band * 0.3), y0 = y1 - h;
  // Its shadow on the wall, then the iron cradle and wall brackets.
  for (let y = y0 + 2; y < y1 + 3; y += 1) for (let x = x0 + 1; x < x0 + w + 3; x += 1) fb.tone(x, y, -0.28);
  fb.rect(x0 + 2, y1 - 1, w - 4, 2, iron[1]); fb.rect(x0 + 3, y1 + 1, 1, 3, iron[0]); fb.rect(x0 + w - 4, y1 + 1, 1, 3, iron[0]);
  // The drum: a horizontal cylinder (lit along its top, dark beneath), domed ends, riveted bands.
  const ry = (h - 1) / 2, cyy = y0 + ry;
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x0 + w; x += 1) {
    const v = (y - cyy) / ry, end = Math.min(x - x0, x0 + w - 1 - x), dome = end < 3 ? Math.sqrt(Math.max(0, 1 - ((3 - end) / 3.2) ** 2)) : 1;
    if (Math.abs(v) > dome) continue;
    const band2 = (x - x0) % 7 === 3 && end >= 3, k = v < -0.55 ? 5 : v < -0.15 ? 4 : v < 0.35 ? 3 : v < 0.7 ? 2 : 1;
    fb.set(x, y, band2 ? cu[Math.max(0, k - 2)] : end < 3 ? cu[Math.max(1, k - 1)] : cu[k]);
  }
  for (let x = x0 + 3; x < x0 + w - 3; x += 7) { fb.set(x, Math.round(cyy - ry * 0.55), brass[3]); fb.set(x, Math.round(cyy + ry * 0.55), brass[2]); }
  if (h2(seed, 3, 7) < 0.7) for (let x = x0 + 3; x < x0 + w - 3; x += 1) if (h2(seed, x, 9) < 0.3) fb.set(x, Math.round(cyy + ry * 0.75), vg[2]);
  // A funnel with steam, a gauge, a red valve wheel, the pipe elbowing into the wall.
  const fx = x0 + Math.round(w * 0.7); fb.rect(fx, y0 - 4, 3, 5, iron[2]); fb.rect(fx - 1, y0 - 5, 5, 1, iron[1]);
  for (const [dx, dy] of [[1, -7], [2, -9], [0, -10], [3, -12], [1, -13]]) if (h2(seed, dx, dy) < 0.85) fb.set(fx + dx, y0 + dy, mixc(fb.get(fx + dx, y0 + dy), rgb("#f4f4f2"), 0.75));
  fb.ellipse(x0 + w * 0.32, cyy, 2, 2, null, () => rgb("#f2efe6")); fb.set(Math.round(x0 + w * 0.32), Math.round(cyy), rgb("#2a2420"));
  fb.ellipse(x0 + w * 0.52, y0 + 1, 2.5, 1.2, null, () => rgb("#b83a2a"));
  fb.rect(x0 - 4, Math.round(cyy) - 1, 5, 2, cu[3]); fb.rect(x0 - 4, Math.round(cyy) - 1, 2, h * 0.4, cu[2]); fb.set(x0 - 4, Math.round(cyy) - 1, cu[5]);
  // The fire crystal in its cage under the drum.
  fb.rect(Math.round(cx) - 3, y1 + 1, 7, 1, iron[2]);
  glowCrystal(fb, cx, y1 + 4, "#ff7a30", 2);
}

/** A machine on a roof (pixels, centre): a riveted water tank, a crystal condenser or a stack of vents. */
export function drawRoofMachine(fb, kind, cx, cy, P, seed) {
  const cu = R("#b87333", 5, 0.5), iron = R("#3a3e44", 5, 0.5), brass = R("#c9a24a", 5, 0.5);
  for (let dy = -2; dy <= 3; dy += 1) for (let dx = -Math.round(P * 0.3); dx <= Math.round(P * 0.3); dx += 1) if (dx * dx / (P * P * 0.09) + dy * dy / 9 <= 1) fb.tone(Math.round(cx + dx + 2), Math.round(cy + dy + P * 0.12), -0.3);
  if (kind === "tank") {
    const rx = P * 0.24, top = cy - P * 0.36;
    for (let y = Math.round(top); y < cy; y += 1) for (let x = Math.round(cx - rx); x <= cx + rx; x += 1) { const u = (x - cx) / rx; fb.set(x, y, (y - Math.round(top)) % 4 === 3 ? iron[1] : u < -0.4 ? cu[3] : u > 0.5 ? cu[1] : cu[2]); }
    fb.ellipse(cx, cy, rx, rx * 0.4, null, (px, py, u) => (u < 0 ? cu[2] : cu[1]));
    fb.ellipse(cx, top, rx, rx * 0.4, null, (px, py, u, v) => (u * u + v * v < 0.3 ? iron[2] : cu[4]));
    for (const dx of [-rx * 0.8, rx * 0.8]) fb.rect(Math.round(cx + dx), Math.round(cy), 1, 3, iron[0]);
  } else if (kind === "condenser") {
    // Brass fins on a stand, a pale blue crystal in a cage on top.
    for (let k = 0; k < 4; k += 1) fb.rect(Math.round(cx - P * 0.2 + k * P * 0.13), Math.round(cy - P * 0.28), 2, Math.round(P * 0.28), brass[k % 2 ? 2 : 3]);
    fb.rect(Math.round(cx - P * 0.24), Math.round(cy - P * 0.3), Math.round(P * 0.5), 2, brass[1]);
    glowCrystal(fb, cx, cy - P * 0.42, "#8fd0ff", 3);
    fb.rect(Math.round(cx - 4), Math.round(cy - P * 0.42 - 4), 1, 8, brass[2]); fb.rect(Math.round(cx + 4), Math.round(cy - P * 0.42 - 4), 1, 8, brass[1]);
  } else {
    // Vent stacks: three iron pipes with conical caps, one with a brass vane, wisps of smoke.
    for (const [k, dx] of [-P * 0.18, 0, P * 0.18].entries()) {
      const hgt = Math.round(P * (0.3 + 0.1 * ((k + seed) % 2))), x = Math.round(cx + dx);
      fb.rect(x - 1, Math.round(cy - hgt), 3, hgt, iron[2]); fb.rect(x - 1, Math.round(cy - hgt), 1, hgt, iron[3]);
      fb.rect(x - 2, Math.round(cy - hgt) - 1, 5, 1, iron[1]); fb.set(x, Math.round(cy - hgt) - 2, iron[0]);
      if (k === 1) { fb.rect(x - 3, Math.round(cy - hgt) - 4, 7, 1, brass[3]); fb.set(x, Math.round(cy - hgt) - 3, brass[2]); }
      else for (const [sx, sy] of [[0, -4], [1, -6], [0, -8]]) fb.set(x + sx, Math.round(cy - hgt) + sy, mixc(fb.get(x + sx, Math.round(cy - hgt) + sy), rgb("#d8d8d4"), 0.6));
    }
  }
}

/** Pipes slung across a lane (pixels): two copper runs with brackets and a joint, high over the street. */
export function drawPipeSpan(fb, x0, x1, y, P, seed) {
  const cu = R("#b87333", 5, 0.5), vg = R("#5f9e8c", 4, 0.4), iron = R("#2e3236", 4, 0.5);
  for (let x = Math.round(x0); x < Math.round(x1); x += 1) {
    fb.tone(x, Math.round(y + P * 0.55), -0.2);
    for (const [k, dy] of [[0, 0], [1, 4]]) { const green = h2(Math.floor(x / 5), k, seed) < 0.25; fb.set(x, Math.round(y + dy), green ? vg[3] : cu[3]); fb.set(x, Math.round(y + dy + 1), green ? vg[1] : cu[1]); }
  }
  for (let x = Math.round(x0) + 3; x < x1 - 2; x += Math.max(6, Math.round(P * 0.5))) { fb.rect(x, Math.round(y) - 1, 2, 7, iron[1]); fb.set(x, Math.round(y) - 1, iron[2]); }
}
