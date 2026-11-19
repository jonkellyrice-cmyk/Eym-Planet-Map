// The change report's standard pictures (tools/world.mjs): the same views of two worlds side by side, so a person
// can see at a glance what a rebuild did. Plain pixel maps, no lettering (the report's text names each picture):
//   - one picture a continent: its biomes before (left) and after (right);
//   - the sea: yearly sea-temperature anomaly with the currents drawn over it, before (top) and after (bottom);
//   - heights: where land or sea floor rose (red) or fell (blue).
// Pure functions of two summaries (tools/world-snapshot.mjs summarizeWorld); each returns { name, title, png }.

import { encodePng } from "../webapp/render/png.mjs";

/** Biome colours (the report's legend lists them). */
export const BIOME_COLOURS = Object.freeze({
  "ice-cap": [240, 246, 250], tundra: [170, 180, 160], taiga: [60, 100, 80], "temperate-forest": [70, 140, 70], "temperate-rainforest": [30, 110, 90], steppe: [190, 180, 110],
  "cold-desert": [205, 195, 165], "hot-desert": [228, 204, 132], savanna: [170, 170, 70], "seasonal-forest": [110, 160, 60], "tropical-rainforest": [20, 110, 40],
  "open-ocean": [40, 80, 130], "tropical-ocean": [50, 100, 150], "sea-ice": [205, 225, 240],
});
const UNKNOWN = [255, 0, 255], GAP = [18, 20, 24];

function canvas(width, height, fill = GAP) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) { data[i * 4] = fill[0]; data[i * 4 + 1] = fill[1]; data[i * 4 + 2] = fill[2]; data[i * 4 + 3] = 255; }
  const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= width || y >= height) return; const o = (y * width + x) * 4; data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; };
  const block = (x, y, w, h, c) => { for (let dy = 0; dy < h; dy += 1) for (let dx = 0; dx < w; dx += 1) set(x + dx, y + dy, c); };
  const line = (x0, y0, x1, y1, c) => { const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) + 1; for (let k = 0; k <= n; k += 1) set(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, c); };
  return { width, height, data, set, block, line };
}
const png = (c) => encodePng({ width: c.width, height: c.height, data: c.data });

/**
 * The 1° box (rows from the south, columns from 180° W) round a continent's mainland in either world, with a
 * margin: the box of its largest coastline (its far islands would stretch the picture across the ocean).
 */
function boxOf(name, summaries, margin = 5) {
  let s0 = 90, n0 = -90, w0 = null, span = 0;
  for (const sum of summaries) {
    const main = sum.mainlands?.[name]; if (!main) continue;
    s0 = Math.min(s0, main.south); n0 = Math.max(n0, main.north);
    if (w0 == null) { w0 = main.west; span = main.spanDeg; } else { const shift = (((main.west - w0) % 360) + 540) % 360 - 180; if (shift < 0) { w0 += shift; span -= shift; } span = Math.max(span, shift + main.spanDeg); }
  }
  if (w0 == null) return null;
  const { latCount, lonCount } = summaries[0].fields, perDeg = lonCount / 360;
  return { r0: Math.max(0, Math.floor((s0 + 90) * perDeg) - margin), r1: Math.min(latCount - 1, Math.floor((n0 + 90) * perDeg) + margin), c0: Math.floor((w0 + 180) * perDeg) - margin, cols: Math.min(lonCount, Math.ceil(span * perDeg) + 2 * margin) };
}

/** A continent's biomes, before | after. */
export function biomePicture(name, before, after, scale = 10) {
  const box = boxOf(name, [before, after]); if (!box) return null;
  const rows = box.r1 - box.r0 + 1, w = box.cols * scale, c = canvas(2 * w + scale, rows * scale);
  [before, after].forEach((s, side) => {
    const { biome, lonCount } = s.fields;
    for (let y = 0; y < rows; y += 1) for (let x = 0; x < box.cols; x += 1) {
      const i = (box.r1 - y) * lonCount + ((box.c0 + x) % lonCount + lonCount) % lonCount;
      c.block(side * (w + scale) + x * scale, y * scale, scale, scale, BIOME_COLOURS[biome.at(i)] ?? UNKNOWN);
    }
  });
  // A frame round every cell whose biome changed, on the later side.
  const fb = before.fields, fa = after.fields;
  for (let y = 0; y < rows; y += 1) for (let x = 0; x < box.cols; x += 1) {
    const i = (box.r1 - y) * fa.lonCount + ((box.c0 + x) % fa.lonCount + fa.lonCount) % fa.lonCount; if (fb.biome.at(i) === fa.biome.at(i) || (!fb.owner[i] && !fa.owner[i])) continue;
    const X = w + scale + x * scale, Y = y * scale, e = scale - 1, mark = [255, 255, 255];
    c.line(X, Y, X + e, Y, mark); c.line(X, Y + e, X + e, Y + e, mark); c.line(X, Y, X, Y + e, mark); c.line(X + e, Y, X + e, Y + e, mark);
  }
  return { name: `biomes-${name.toLowerCase()}.png`, title: `${name}: biomes before (left) and after (right); land cells that changed are framed in white`, png: png(c) };
}

const seaColour = (anomaly) => { const f = Math.max(-1, Math.min(1, anomaly / 2.5)), k = Math.abs(f), m = (a, b) => Math.round(a * (1 - k) + b * k); return f >= 0 ? [m(232, 235), m(236, 70), m(240, 60)] : [m(232, 50), m(236, 110), m(240, 240)]; };

/** The sea: yearly temperature anomaly and currents, before (top) and after (bottom). Null when either world has no climate. */
export function seaPicture(before, after, scale = 14) {
  if (!before.fields.sst.length || !after.fields.sst.length) return null;
  const res = after.fields.climateRes, rows = Math.round(180 / res), cols = Math.round(360 / res), h = rows * scale, c = canvas(cols * scale, 2 * h + scale);
  [before, after].forEach((s, half) => {
    const f = s.fields; if (f.sst.length !== rows * cols) return;
    const landAt = (r, col) => { const per = res / (180 / f.latCount); for (let a = 0; a < per; a += 1) for (let b = 0; b < per; b += 1) if (!f.owner[(r * per + a) * f.lonCount + col * per + b]) return false; return true; };
    for (let r = 0; r < rows; r += 1) for (let col = 0; col < cols; col += 1) {
      const i = r * cols + col, x = col * scale, y = half * (h + scale) + (rows - 1 - r) * scale;
      c.block(x, y, scale, scale, landAt(r, col) ? [96, 84, 60] : seaColour(f.sst[i]));
    }
    for (let r = 0; r < rows; r += 1) for (let col = 0; col < cols; col += 1) {
      const i = r * cols + col, speed = Math.hypot(f.u[i], f.v[i]); if (speed < 0.05 || landAt(r, col)) continue;
      const x = col * scale + scale / 2, y = half * (h + scale) + (rows - 1 - r) * scale + scale / 2, len = Math.min(scale - 1, 4 + speed * 12), ink = speed > 0.5 ? [20, 20, 20] : [90, 90, 90];
      c.line(x, y, x + f.u[i] / speed * len, y - f.v[i] / speed * len, ink); c.block(x - 1, y - 1, 2, 2, ink);
    }
  });
  return { name: "sea.png", title: "The sea: yearly temperature anomaly (red warmer, blue colder, full colour at 2.5 °C) with the currents drawn from their dots, before (top) and after (bottom); land is brown", png: png(c) };
}

/** Where heights changed (land or sea floor): red rose, blue fell, full colour at 1,500 m. Null when nothing changed. */
export function heightChangePicture(before, after, scale = 4) {
  const fb = before.fields, fa = after.fields; if (fb.height.length !== fa.height.length) return null;
  let any = false; for (let i = 0; i < fa.height.length; i += 1) if (fa.height[i] !== fb.height[i]) { any = true; break; }
  if (!any) return null;
  const c = canvas(fa.lonCount * scale, fa.latCount * scale);
  for (let r = 0; r < fa.latCount; r += 1) for (let col = 0; col < fa.lonCount; col += 1) {
    const i = r * fa.lonCount + col, f = Math.max(-1, Math.min(1, (fa.height[i] - fb.height[i]) / 1500)), base = fa.owner[i] ? 200 : 120, k = Math.abs(f);
    c.block(col * scale, (fa.latCount - 1 - r) * scale, scale, scale, f >= 0 ? [Math.round(base + (255 - base) * k), Math.round(base * (1 - k)), Math.round(base * (1 - k))] : [Math.round(base * (1 - k)), Math.round(base * (1 - k)), Math.round(base + (255 - base) * k)]);
  }
  return { name: "heights.png", title: "Heights: where the land or the sea floor rose (red) or fell (blue), full colour at 1,500 m; land is light grey, sea dark", png: png(c) };
}

/**
 * A continent's surveyed coast in the later world: each survey point as a dot, grey on an open coast and yellow to
 * red by how much its bay's funnel raises the tide (red at 2.5 times), with a blue tick out to sea whose length is
 * the shelf's width. Null where the continent is not surveyed.
 */
export function coastPicture(name, after, scale = 40) {
  const points = (after.coasts?.points ?? []).filter((p) => p.continent === name), box = boxOf(name, [after], 3); if (!points.length || !box) return null;
  const { biome, lonCount, latCount } = after.fields, rows = box.r1 - box.r0 + 1, c = canvas(box.cols * scale, rows * scale), perDeg = lonCount / 360;
  for (let y = 0; y < rows; y += 1) for (let x = 0; x < box.cols; x += 1) { const i = (box.r1 - y) * lonCount + ((box.c0 + x) % lonCount + lonCount) % lonCount; c.block(x * scale, y * scale, scale, scale, /ocean|sea-ice/.test(biome.at(i)) ? [28, 52, 86] : [70, 78, 66]); }
  const X = (lon) => ((((lon + 180) * perDeg - box.c0) % lonCount) + lonCount) % lonCount * scale, Y = (lat) => (box.r1 + 1 - (lat + 90) * (latCount / 180)) * scale;
  // Shelf widths first (so the dots sit on top): a faint blue disc whose radius is the shelf's width.
  for (const p of points) { const r = Math.round(Math.min(400, p.shelfKm) / 111.2 * scale / 8); for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) if (dx * dx + dy * dy <= r * r) c.set(X(p.lon) + dx, Y(p.lat) + dy, [60, 110, 170]); }
  for (const p of points) { const f = Math.max(0, Math.min(1, (p.gain - 1) / 1.5)), col = p.gain <= 1.02 ? [205, 205, 205] : [255, Math.round(230 - 190 * f), Math.round(60 - 40 * f)], r = p.gain > 1.02 ? 4 : 2; for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) if (dx * dx + dy * dy <= r * r) c.set(X(p.lon) + dx, Y(p.lat) + dy, col); }
  return { name: `coasts-${name.toLowerCase()}.png`, title: `${name}'s surveyed coast: grey dots are open coast; yellow to red dots lie in funnel bays (red raises the tide 2.5 times); the blue haze is wider where the shelf is wider`, png: png(c) };
}

/** Every standard picture for two worlds (those with nothing to show are left out). */
export function worldPictures(before, after) {
  const names = [...new Set([...Object.keys(before.continents), ...Object.keys(after.continents)])].filter((n) => n !== "islands");
  const changed = (name) => { const fb = before.fields, fa = after.fields; for (let i = 0; i < fa.owner.length; i += 1) if ((fa.owner[i] === name || fb.owner[i] === name) && fb.biome.at(i) !== fa.biome.at(i)) return true; return before.continents[name]?.coastSha256 !== after.continents[name]?.coastSha256; };
  const seaChanged = before.fields.sst.length !== after.fields.sst.length || before.fields.sst.some((x, i) => x !== after.fields.sst[i] || before.fields.u[i] !== after.fields.u[i] || before.fields.v[i] !== after.fields.v[i]);
  // The coasts' survey is drawn where it is new or its tides changed.
  const coastChanged = (name) => { const a = before.coasts, b = after.coasts; if (!b) return false; if (!a) return true; return JSON.stringify(a.byContinent[name]) !== JSON.stringify(b.byContinent[name]) || b.points.some((p) => p.continent === name && a.gains.get(`${p.lat},${p.lon}`) !== p.gain); };
  return [...names.filter(changed).map((n) => biomePicture(n, before, after)), seaChanged ? seaPicture(before, after) : null, heightChangePicture(before, after), ...names.filter(coastChanged).map((n) => coastPicture(n, after))].filter(Boolean);
}
