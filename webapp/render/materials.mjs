// Ground materials for pixel-art battle maps: each is a function of world pixel coordinates, so a field,
// a street or a shore continues seamlessly from one map to the next. Colours come in short ramps with
// hue-shifted shading (shadows lean cool, highlights warm), as hand-made pixel art does. Deterministic.

import { rgb } from "./framebuffer.mjs";

// ---------------------------------------------------------------- noise and colour

/** A stable hash of integers to 0..1. */
export function h2(x, y, s = 0) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
/** Smooth value noise at a scale (pixels per cell). */
export function noise(x, y, scale, s = 0) {
  const fx = x / scale, fy = y / scale, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, sm = (t) => t * t * (3 - 2 * t);
  const a = h2(x0, y0, s), b = h2(x0 + 1, y0, s), c = h2(x0, y0 + 1, s), d = h2(x0 + 1, y0 + 1, s), u = sm(tx), v = sm(ty);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const mixc = (a, b, t) => [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t), 255];
const COOL = rgb("#1b2038"), WARM = rgb("#fff1c8");
/** A ramp of n shades around a base colour, darkest first, with hue-shifted shadows and highlights. */
export function ramp(base, n = 5, spread = 0.55) {
  const c = rgb(base), mid = (n - 1) / 2;
  return Array.from({ length: n }, (_, k) => (k < mid ? mixc(c, COOL, ((mid - k) / mid) * spread) : k > mid ? mixc(c, WARM, ((k - mid) / mid) * spread * 0.7) : [...c.slice(0, 3), 255]));
}
const RAMPS = new Map(), R = (base, n, spread) => { const key = `${base}|${n}|${spread}`; if (!RAMPS.has(key)) RAMPS.set(key, ramp(base, n, spread)); return RAMPS.get(key); };
const pick = (r, t) => r[Math.max(0, Math.min(r.length - 1, Math.floor(t * r.length)))];

// ---------------------------------------------------------------- materials

const grass = (base, s = 1, flowers = 0.004) => (x, y) => {
  const r = R(base, 5, 0.5), n = noise(x, y, 14, s) * 0.6 + noise(x, y, 5, s + 1) * 0.4;
  // Tufts: small upright blades, a light tip over a dark root.
  const tx = Math.floor(x / 6), ty = Math.floor(y / 5), ox = Math.floor(h2(tx, ty, s + 2) * 4), oy = Math.floor(h2(tx, ty, s + 3) * 3);
  const lx = x - tx * 6 - ox, ly = y - ty * 5 - oy;
  if (h2(tx, ty, s + 4) < 0.55 && ((lx === 0 && ly === 0) || (lx === 2 && ly === 0) || (lx === 1 && ly === -1))) return r[4];
  if (h2(tx, ty, s + 4) < 0.55 && lx >= 0 && lx <= 2 && ly === 1) return r[1];
  if (flowers && h2(x >> 1, y >> 1, s + 9) < flowers) return h2(x >> 1, y >> 1, s + 10) < 0.5 ? rgb("#f4e27a") : rgb("#f6f0f0");
  return pick(r.slice(1, 4), n);
};
const speckle = (base, s, density = 0.08, scale = 10) => (x, y) => {
  const r = R(base, 5, 0.45), n = noise(x, y, scale, s);
  const u = h2(x, y, s + 5); if (u < density * 0.5) return r[0]; if (u > 1 - density * 0.5) return r[4];
  return pick(r.slice(1, 4), n);
};
const rows = (base, period, s) => (x, y) => {
  // Furrows: rows of soil with crops along their crests.
  const r = R(base, 5, 0.5), k = ((y % period) + period) % period, n = noise(x, y, 12, s);
  if (k === 0) return r[1]; if (k === period - 1) return r[3];
  return h2(x >> 1, y, s + 3) < 0.18 ? r[4] : pick(r.slice(1, 4), n);
};
const planks = (base, s, board = 4, vertical = false) => (x, y) => {
  const r = R(base, 5, 0.5), [a, b] = vertical ? [y, x] : [x, y], row = Math.floor(b / board), off = Math.floor(h2(row, 0, s) * 16), seam = ((a + off) % 16 + 16) % 16;
  if (((b % board) + board) % board === board - 1) return r[0];
  if (seam === 0) return r[1];
  return h2(Math.floor((a + off) / 16), row, s + 1) < 0.5 ? r[2] : (h2(a, b, s + 2) < 0.1 ? r[3] : r[2 + (row & 1)]);
};
const stones = (base, mortar, s, sw = 5, sh = 4) => (x, y) => {
  // Cobbles: offset rows of rounded stones, each its own shade, with mortar between.
  const r = R(base, 5, 0.5), row = Math.floor(y / sh), off = row & 1 ? Math.floor(sw / 2) : 0, col = Math.floor((x + off) / sw);
  const lx = ((x + off) % sw + sw) % sw, ly = ((y % sh) + sh) % sh;
  if (lx === sw - 1 || ly === sh - 1 || ((lx === 0 || lx === sw - 2) && (ly === 0 || ly === sh - 2))) return rgb(mortar);
  const t = h2(col, row, s); return ly === 0 ? r[Math.min(4, 2 + (t > 0.5 ? 1 : 0) + 1)] : r[1 + Math.floor(t * 3)];
};
const flags = (base, s, size = 8) => (x, y) => {
  const r = R(base, 5, 0.35), cx = Math.floor(x / size), cy = Math.floor(y / size), lx = ((x % size) + size) % size, ly = ((y % size) + size) % size;
  if (lx === size - 1 || ly === size - 1) return r[1];
  if (lx === 0 || ly === 0) return r[4];
  if (h2(cx, cy, s + 7) < 0.15 && lx === ly) return r[1];
  return r[2 + (h2(cx, cy, s) < 0.5 ? 0 : 1)];
};
const water = (base, s, glint = 0.012) => (x, y) => {
  const r = R(base, 5, 0.45), n = noise(x, y, 18, s);
  // Wave glints: short horizontal dashes.
  const gx = Math.floor(x / 7), gy = Math.floor(y / 3);
  if (h2(gx, gy, s + 1) < glint * 7 && ((x % 7) + 7) % 7 < 3 && ((y % 3) + 3) % 3 === 0) return r[4];
  return pick(r.slice(0, 3), n);
};
const ripples = (base, s) => (x, y) => {
  const r = R(base, 5, 0.4), w = Math.sin((x * 0.35 + y * 0.9 + noise(x, y, 16, s) * 9)) ;
  return w > 0.85 ? r[1] : w < -0.9 ? r[3] : pick(r.slice(2, 4), h2(x, y, s) * 0.6 + noise(x, y, 9, s + 1) * 0.4);
};
const cracks = (base, s) => (x, y) => {
  const r = R(base, 5, 0.45), n = noise(x, y, 12, s), c = Math.abs(noise(x, y, 7, s + 3) - 0.5);
  if (c < 0.025) return r[0];
  return h2(x, y, s + 4) < 0.06 ? r[4] : pick(r.slice(1, 4), n);
};
const strata = (base, s) => (x, y) => {
  const r = R(base, 5, 0.45), band = Math.floor((y + noise(x, y, 20, s) * 6) / 4);
  return h2(band, 0, s) < 0.3 ? r[1] : h2(x, y, s + 2) < 0.07 ? r[4] : r[2 + (band & 1)];
};
const glow = (base, s) => (x, y) => { const r = R(base, 5, 0.6), n = noise(x, y, 6, s); return n > 0.7 ? rgb("#ffe08a") : pick(r.slice(1, 5), n); };
const sky = (s) => (x, y) => { const n = noise(x, y, 40, s) * 0.7 + noise(x, y, 11, s + 1) * 0.3; return n > 0.62 ? rgb("#f4f8fc") : n > 0.55 ? rgb("#d8e6f2") : rgb("#a9cbe8"); };
const abyss = () => (x, y) => (h2(x, y, 3) < 0.01 ? rgb("#2a2f3a") : rgb("#0f1116"));

/** The material for each ground name (fallback: a speckled version of its tier-1 colour). */
export const MATERIALS = Object.freeze({
  grass: grass("#7fa14e", 1), "wet meadow": grass("#6f9450", 2, 0.002), meadow: grass("#86a656", 3), scrub: speckle("#7a8a4c", 4, 0.12),
  field: rows("#b8a660", 5, 5), "forest floor": speckle("#4f6a38", 6, 0.14, 8), marsh: (x, y) => (noise(x, y, 9, 7) > 0.62 ? water("#4a6e66", 8)(x, y) : grass("#5f7e4a", 9, 0)(x, y)),
  sand: ripples("#e0cc92", 10), beach: ripples("#e6d3a0", 11), "dirt lane": speckle("#a88a5e", 12, 0.1), road: speckle("#a2865c", 13, 0.12), yard: (x, y) => (noise(x, y, 22, 14) > 0.52 ? grass("#8a9c58", 53, 0.002)(x, y) : speckle("#a8956c", 14, 0.06, 18)(x, y)),
  "cobbled street": stones("#9a948a", "#5e5a54", 15), "paved square": flags("#b8b1a3", 16, 8), "marble quay": flags("#e2ddd2", 17, 10), "stone bridge": flags("#c8bfac", 18, 6), "stone arch": flags("#b5ab96", 19, 6),
  floor: planks("#9a6e44", 20), "flagstone floor": flags("#8f877a", 21, 7), "raised dais": flags("#a89c86", 22, 7), "tree platform": planks("#9a7448", 23, 3), "rope bridge": planks("#a07a4a", 24, 2, true), ladder: planks("#7a5a36", 25, 2),
  "stone stairs": (x, y) => (((y % 3) + 3) % 3 === 0 ? rgb("#8a8070") : rgb("#d0c2a4")),
  "deep water": water("#2f6b92", 26), river: water("#4687b4", 27), canal: water("#3a7c98", 28), "shallow stream": water("#68a8d0", 29, 0.03), "deep channel": water("#2f7fa8", 30), shallows: water("#6fc8c8", 31, 0.03),
  "frozen stream": cracks("#cfe6f2", 32), "bare rock": cracks("#968d80", 33), "black rock": cracks("#3d3836", 34), "cave floor": cracks("#5e5a55", 35), "cave wall": cracks("#2b2826", 36), "carved wall": cracks("#3a3632", 37),
  snow: speckle("#eef2f4", 38, 0.05, 14), "deep snow": speckle("#f6f9fb", 39, 0.04, 16), "glacier ice": cracks("#cfe3ee", 40), "ash and cinders": (x, y) => (h2(x, y, 41) < 0.006 ? rgb("#ff8a3a") : speckle("#6f6a66", 42, 0.1)(x, y)),
  "canyon floor": strata("#c29a6a", 43), "carved stone terrace": strata("#c8ab84", 44), "monastery terrace": flags("#b9ad96", 45, 9), "lower terrace": flags("#a99d86", 46, 9),
  "floating rock": grass("#8fa36a", 47), "open sky (a fall)": sky(48), "open air (a fall)": abyss(), "planar rift": glow("#5a2a8a", 49), "molten-metal channel": glow("#e0602a", 50),
  "grave earth": speckle("#6f6a52", 51, 0.1), sandbar: ripples("#efe2b8", 52),
  // Style pavings (a building style maps the plain street grounds to these; see eym-building-styles.mjs).
  "granite setts": stones("#8a8680", "#4c4946", 54, 5, 4), "dressed granite": flags("#8e8a84", 55, 9),
});

/** The colour of a ground at a world pixel. `fallback` is a tier-1 hex colour. */
export function groundPixel(ground, x, y, fallback = "#93a862") {
  const name = ground.replace(/ \(mud\)$/, ""), m = MATERIALS[name], c = m ? m(x, y) : speckle(fallback, 99, 0.08)(x, y);
  if (ground.endsWith("(mud)")) { const mud = rgb("#5e4c34"); return noise(x, y, 6, 77) > 0.45 ? mixc(c, mud, 0.55) : mixc(c, mud, 0.3); }
  return c;
}
export { mixc };
