// The light pass for pixel-art battle maps: shadows cast by the sun (from a height field of the ground,
// the buildings and everything standing, so cliffs, walls, towers and pillars all throw them), shadows of
// trees, contact shadows at the foot of things, the colour of the light (time of day, cloud, fog), and
// light sources (lanterns, windows, fires, hearths, lava, crystals) as stepped pools of light in the
// pixel-art manner. All from the map's geometry and the light model; deterministic.

import { bayer, rgb } from "./framebuffer.mjs";
import { FEATURES } from "../../scripts/eym-battle-settings.mjs";
import { standHeightFt } from "../../scripts/eym-battle-oblique.mjs";
import { inFootprint } from "./footprint.mjs";

const SHADOW = [32, 40, 60]; // shadows lean cool

/** Heights (ft) on a grid of `cell`-pixel cells: the ground's level plus whatever stands there. */
export function heightField(map, P, cell = 2) {
  const { columns, rows } = map.spec, CW = Math.ceil((columns * P) / cell), CH = Math.ceil((rows * P) / cell), top = new Float32Array(CW * CH), ground = new Float32Array(CW * CH), roof = new Uint8Array(CW * CH);
  const g = map.grid;
  for (let cy = 0; cy < CH; cy += 1) for (let cx = 0; cx < CW; cx += 1) { const sx = Math.min(columns - 1, Math.floor(((cx + 0.5) * cell) / P)), sy = Math.min(rows - 1, Math.floor(((cy + 0.5) * cell) / P)), i = sy * columns + sx, h = g.void[i] ? -200 : g.levelFt[i]; top[cy * CW + cx] = h; ground[cy * CW + cx] = h; }
  const raise = (cx, cy, ft) => { if (cx < 0 || cy < 0 || cx >= CW || cy >= CH) return; const k = cy * CW + cx; top[k] = Math.max(top[k], ground[k] + ft); };
  for (const b of map.buildings) {
    const ft = b.heightFt ?? 10 * (b.storeys ?? 1) + 8;
    for (let cy = Math.floor((b.y0 * P) / cell); cy <= Math.ceil(((b.y1 + 1) * P) / cell); cy += 1) for (let cx = Math.floor((b.x0 * P) / cell); cx <= Math.ceil(((b.x1 + 1) * P) / cell); cx += 1) if (inFootprint(b, ((cx + 0.5) * cell) / P, ((cy + 0.5) * cell) / P)) { raise(cx, cy, ft); if (cx >= 0 && cy >= 0 && cx < CW && cy < CH) roof[cy * CW + cx] = 1; }
  }
  for (const f of map.features) {
    const def = FEATURES[f.kind], ft = def.solidFt ? Math.min(def.solidFt, 60) : standHeightFt(f.kind, def); if (ft <= 0) continue;
    for (const i of f.squares) { const x0 = (i % columns) * P, y0 = Math.floor(i / columns) * P; for (let y = y0; y < y0 + P; y += cell) for (let x = x0; x < x0 + P; x += cell) raise(Math.floor(x / cell), Math.floor(y / cell), ft); }
  }
  return { cell, CW, CH, top, ground, roof };
}

/**
 * The shadows objects make of themselves, true at any hour (per pixel: 0 none, 1 contact, 2 canopy):
 * contact shadows at the foot of buildings, walls, rocks and everything standing, and at the base of
 * cliffs; and the shade directly beneath tree crowns. No sun direction: that is Foundry's, live.
 */
export function occlusionMask(map, P) {
  const W = map.spec.columns * P, H = map.spec.rows * P, mask = new Uint8Array(W * H), { cell, CW, CH, top, ground } = heightField(map, P);
  for (let cy = 0; cy < CH; cy += 1) for (let cx = 0; cx < CW; cx += 1) {
    const k = cy * CW + cx; if (top[k] > ground[k] + 0.5 || ground[k] < -100) continue;
    let near = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < CW && y < CH && top[y * CW + x] > ground[k] + 3) near = true; }
    if (near) for (let dy = 0; dy < cell; dy += 1) for (let dx = 0; dx < cell; dx += 1) { const px = cx * cell + dx, py = cy * cell + dy; if (px < W && py < H) mask[py * W + px] = 1; }
  }
  // Beneath each crown the ground is in its shade, whatever the hour; at the foot of rocks and bushes a contact shadow.
  for (const o of map.objects) {
    const r = Math.max(2, o.size * P * (o.kind === "tree" ? 0.85 : 0.6)), ry = r * (o.kind === "tree" ? 0.45 : 0.3), v = o.kind === "tree" ? 2 : 1;
    for (let y = Math.floor(o.y * P - ry); y <= o.y * P + ry; y += 1) for (let x = Math.floor(o.x * P - r); x <= o.x * P + r; x += 1) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue; const u = (x - o.x * P) / r, w = (y - o.y * P) / ry; if (u * u + w * w <= 1) mask[y * W + x] = Math.max(mask[y * W + x], v);
    }
  }
  return mask;
}

/** Darken the ground under the mask toward a cool shadow colour (the softest dithered). */
export function applyShadows(fb, mask) {
  for (let y = 0; y < fb.height; y += 1) for (let x = 0; x < fb.width; x += 1) {
    const m = mask[y * fb.width + x]; if (!m) continue; if (m === 1 && bayer(x, y) > 0.8) continue;
    const k = m === 2 ? 0.26 : 0.16, i = (y * fb.width + x) * 4, d = fb.data;
    for (let c = 0; c < 3; c += 1) d[i + c] = d[i + c] * (1 - k) + SHADOW[c] * k * 0.4;
  }
}
