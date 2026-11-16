// Pixel-art sprites for the scholars' model of the heavens (Tier 2: traditional pixel art), drawn by rule,
// pixel by pixel, so they are the same everywhere: an ornate Sun in splendour with a face and sixteen rays
// (straight and wavy by turns), the four wandering stars as eight-pointed jewelled stars, the world as a
// small globe of sea, land and cloud, and the two moons. Small (64 px at most) and made once in the browser;
// the page draws them enlarged with crisp pixels. Pure up to `spriteDataUrl`, which needs a canvas.

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), 255];
const mix = (a, b, t) => [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * t)).concat(255);
/** Five tones from a base colour, dark to light, shadows leaning cool and highlights warm. */
function ramp(base) {
  const c = hex(base), dark = [28, 22, 44, 255], light = [255, 246, 214, 255];
  return [mix(c, dark, 0.62), mix(c, dark, 0.32), c, mix(c, light, 0.36), mix(c, light, 0.7)];
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** A tone index from a value 0..1 across n tones, dithered in a fixed 4×4 pattern. */
const tone = (v, n, x, y) => Math.max(0, Math.min(n - 1, Math.floor(v * (n - 1) + (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16)));
const hash = (x, y, s) => { let h = Math.imul(x * 374761393 + y * 668265263 + s * 2246822519, 3266489917); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
/** Smooth value noise (0..1). */
function noise(x, y, scale, seed) {
  const fx = x / scale, fy = y / scale, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash(x0, y0, seed), b = hash(x0 + 1, y0, seed), c = hash(x0, y0 + 1, seed), d = hash(x0 + 1, y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function blank(size) { return { size, data: new Uint8ClampedArray(size * size * 4) }; }
const put = (s, x, y, c) => { if (x >= 0 && y >= 0 && x < s.size && y < s.size) s.data.set(c, (y * s.size + x) * 4); };
const alpha = (s, x, y) => (x < 0 || y < 0 || x >= s.size || y >= s.size ? 0 : s.data[(y * s.size + x) * 4 + 3]);
/** A one-pixel dark outline around everything drawn so far. */
function outline(s, color) {
  const edge = [];
  for (let y = 0; y < s.size; y += 1) for (let x = 0; x < s.size; x += 1) if (!alpha(s, x, y) && (alpha(s, x + 1, y) || alpha(s, x - 1, y) || alpha(s, x, y + 1) || alpha(s, x, y - 1))) edge.push([x, y]);
  for (const [x, y] of edge) put(s, x, y, color);
}
/** A shaded ball: lit from the upper left, with a rim of reflected light low on the right. */
function ball(s, cx, cy, r, tones, texture = null) {
  for (let y = Math.floor(cy - r); y <= cy + r; y += 1) for (let x = Math.floor(cx - r); x <= cx + r; x += 1) {
    const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / r, d2 = dx * dx + dy * dy; if (d2 > 1) continue;
    const nz = Math.sqrt(1 - d2), light = Math.max(0, -0.55 * dx - 0.62 * dy + 0.56 * nz), base = texture ? texture(x, y, dx, dy) : tones;
    put(s, x, y, base[tone(Math.min(1, light * 1.15), base.length, x, y)]);
  }
}

// ---------------------------------------------------------------- the Sun in splendour
function sun() {
  const N = 64, s = blank(N), c = N / 2, gold = ramp("#e8a82c"), flame = ramp("#d9661e"), R = 13.5;
  for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, r = Math.hypot(dx, dy); if (r < R - 1 || r > 31.5) continue;
    const a = Math.atan2(dy, dx) + Math.PI / 16, k = Math.round(a / (Math.PI / 8)), off = (a - k * (Math.PI / 8)) * r, wavy = ((k % 2) + 2) % 2 === 1;
    const len = wavy ? 14 : 17.5, t = (r - R) / len; if (t > 1) continue;
    // Straight rays taper to a point; wavy rays (flames) snake as they taper.
    const centre = wavy ? Math.sin((r - R) * 0.62) * 1.7 * (1 - t * 0.3) : 0, half = wavy ? 2.3 * (1 - t) + 0.45 : 3.3 * (1 - t) + 0.2;
    if (Math.abs(off - centre) > half) continue;
    const tones = wavy ? flame : gold, lit = off - centre < 0 ? 0.72 : 0.42;
    put(s, x, y, tones[tone(Math.max(0, lit - t * 0.3), 5, x, y)]);
  }
  ball(s, c, c, R, gold);
  // A ring round the face, and the face: brows, eyes, nose, a calm mouth, warm cheeks.
  for (let a = 0; a < 360; a += 2) { const x = Math.round(c - 0.5 + Math.cos(a * Math.PI / 180) * (R - 0.6)), y = Math.round(c - 0.5 + Math.sin(a * Math.PI / 180) * (R - 0.6)); put(s, x, y, gold[1]); }
  const ink = gold[0], f = (x, y, col = ink) => put(s, c + x, c + y, col);
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k += 1) f(side * (2 + k) - (side < 0 ? 1 : 0), -5 - (k === 1 || k === 2 ? 1 : 0)); // brow
    f(side * 4 - (side < 0 ? 1 : 0), -3); f(side * 3 - (side < 0 ? 1 : 0), -3); f(side * 4 - (side < 0 ? 1 : 0), -2, gold[4]); // eye and its glint
    f(side * 6 - (side < 0 ? 1 : 0), 1, flame[3]); f(side * 7 - (side < 0 ? 1 : 0), 1, flame[3]); f(side * 6 - (side < 0 ? 1 : 0), 2, flame[3]); // cheek
  }
  for (let y = -3; y <= 1; y += 1) f(0, y, gold[1]); f(-1, 2); f(0, 2); // nose
  for (let x = -3; x <= 2; x += 1) f(x, 5 + (x === -3 || x === 2 ? -1 : 0)); // mouth
  outline(s, hex("#3a2208"));
  return s;
}

// ---------------------------------------------------------------- the wandering stars
function wanderer(color, size = 32) {
  const s = blank(size), c = size / 2, tones = ramp(color), long = size * 0.47, short = size * 0.33, core = size * 0.18;
  for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + Math.PI * 2;
    const k = Math.round(a / (Math.PI / 4)), off = (a - k * (Math.PI / 4)) * r, len = k % 2 === 0 ? long : short, t = r / len; if (t > 1) continue;
    const half = (k % 2 === 0 ? size * 0.13 : size * 0.11) * (1 - t) + 0.3; if (Math.abs(off) > half) continue;
    // Each point is faceted: one side lit, the other in shade.
    put(s, x, y, tones[off < 0 ? (t < 0.5 ? 4 : 3) : t < 0.5 ? 2 : 1]);
  }
  ball(s, c, c, core, tones.slice(1));
  put(s, Math.round(c - core * 0.45), Math.round(c - core * 0.5), [255, 255, 255, 255]);
  outline(s, mix(tones[0], [10, 8, 20, 255], 0.5));
  return s;
}

// ---------------------------------------------------------------- the world and its moons
function world() {
  const N = 40, s = blank(N), c = N / 2, R = 17, sea = ramp("#2f78b4"), land = ramp("#5f9a48"), dry = ramp("#b79a5c"), cloud = ramp("#eef2f6");
  ball(s, c, c, R, sea, (x, y, dx, dy) => {
    // Small continents in a wide sea, a pale cap at each pole, wisps of cloud.
    const n = noise(x + dx * 3, y + dy * 3, 7, 11) * 0.65 + noise(x, y, 3.2, 12) * 0.35, lat = Math.abs(dy);
    if (noise(x * 1.6, y * 0.8, 5.5, 13) > 0.7 && hash(x >> 1, y, 14) > 0.25) return cloud.slice(2);
    if (lat > 0.86) return cloud.slice(1);
    return n > 0.6 ? (lat < 0.3 && n > 0.7 ? dry : land) : sea;
  });
  outline(s, hex("#0e2238"));
  return s;
}
function moon(color, seed, size = 22) {
  const s = blank(size), c = size / 2, R = size / 2 - 2.5, tones = ramp(color);
  ball(s, c, c, R, tones, (x, y) => (noise(x, y, 3, seed) > 0.66 ? tones.slice(0, 4) : tones));
  outline(s, mix(tones[0], [10, 8, 20, 255], 0.55));
  return s;
}

const WANDERER_LOOK = [["#f1dfa6", 34], ["#8fb0d8", 30], ["#d9774a", 28], ["#c9a85c", 26]];

/** The sprite for a body of the scholars' model: { size, data (RGBA) }, or null for anything else. */
export function systemSprite(kind, { name = "", rank = 0 } = {}) {
  if (kind === "sun") return sun();
  if (kind === "world") return world();
  if (kind === "wanderer") { const [color, size] = WANDERER_LOOK[Math.max(0, Math.min(3, rank))]; return wanderer(color, size); }
  if (kind === "moon") return /red/i.test(name) ? moon("#b4533a", 31, 20) : moon("#dcdfe4", 21, 24);
  return null;
}

const cache = new Map();
/** A sprite as a PNG data URL (cached); null where there is no canvas. */
export function spriteDataUrl(kind, options = {}) {
  const key = `${kind}|${options.name ?? ""}|${options.rank ?? 0}`; if (cache.has(key)) return cache.get(key);
  const sprite = systemSprite(kind, options); let url = null;
  if (sprite && typeof document !== "undefined") {
    try { const canvas = document.createElement("canvas"); canvas.width = canvas.height = sprite.size; canvas.getContext("2d").putImageData(new ImageData(sprite.data, sprite.size, sprite.size), 0, 0); url = canvas.toDataURL("image/png"); } catch { url = null; }
  }
  cache.set(key, url ? { url, size: sprite.size } : null);
  return cache.get(key);
}
