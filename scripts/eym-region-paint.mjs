// The Region layer's painting: a tile's shapes (scripts/eym-region-layer.mjs buildRegionTile, or the same read
// back from the store's shapes file) into its pictures. Kept apart from the shapes so that the stored tiles can be
// told apart by what changed (data/eym/region-fingerprint.json): a change here alone repaints the stored shapes; a
// change to the shapes' code or data makes the tiles again. It depends on scripts/eym-cover.mjs and nothing else.

import { COVER, COVER_COLORS, hashUnit } from "./eym-cover.mjs";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

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
