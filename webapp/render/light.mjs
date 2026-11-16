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
 * Shadow mask (per pixel: 0 none, 1 contact, 2 sun shadow) for the outdoor ground. Sun shadows by
 * marching from each cell toward the sun through the height field; trees as stretched ellipses.
 */
export function shadowMask(map, P, model) {
  const W = map.spec.columns * P, H = map.spec.rows * P, mask = new Uint8Array(W * H), hf = heightField(map, P), { cell, CW, CH, top, ground, roof } = hf;
  const sun = model.lighting.sunAltitudeDeg, sunny = model.direct > 0.08 && sun > 2;
  if (sunny) {
    const tanAlt = Math.tan(Math.max(4, sun) * Math.PI / 180), ftPerCell = (5 * cell) / P, step = [model.toSun[0], model.toSun[1]], maxSteps = Math.ceil(60 / (tanAlt * ftPerCell));
    for (let cy = 0; cy < CH; cy += 1) for (let cx = 0; cx < CW; cx += 1) {
      const k = cy * CW + cx; if (roof[k] || ground[k] < -100) continue;
      const g0 = ground[k]; let shaded = false;
      for (let s = 1; s <= Math.min(maxSteps, 400) && !shaded; s += 1) {
        const x = Math.round(cx + step[0] * s), y = Math.round(cy + step[1] * s); if (x < 0 || y < 0 || x >= CW || y >= CH) break;
        if (top[y * CW + x] > g0 + s * ftPerCell * tanAlt + 0.5) shaded = true;
      }
      if (shaded) for (let dy = 0; dy < cell; dy += 1) for (let dx = 0; dx < cell; dx += 1) { const px = cx * cell + dx, py = cy * cell + dy; if (px < W && py < H) mask[py * W + px] = 2; }
    }
    // Trees: the crown's shadow, an ellipse thrown along the shadow direction.
    for (const o of map.objects) {
      if (o.kind === "boulder") continue;
      const tall = o.kind === "tree" ? 15 + 15 * Math.min(1.5, o.size) : 3, r = Math.max(2, o.size * P * (o.kind === "tree" ? 0.95 : 0.8));
      const sx = o.x * P + model.shadowPerFt[0] * tall * P * 0.85, sy = o.y * P + model.shadowPerFt[1] * tall * P * 0.85, along = Math.hypot(model.shadowPerFt[0], model.shadowPerFt[1]) * tall * P * 0.25;
      for (let y = Math.floor(sy - r - along); y <= sy + r + along; y += 1) for (let x = Math.floor(sx - r - along); x <= sx + r + along; x += 1) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue; const dx = x - sx, dy = y - sy, n = Math.hypot(model.shadowPerFt[0], model.shadowPerFt[1]) || 1, ax = model.shadowPerFt[0] / n, ay = model.shadowPerFt[1] / n;
        const a = dx * ax + dy * ay, b = -dx * ay + dy * ax; if ((a * a) / ((r + along) ** 2) + (b * b) / (r * r * 0.55) <= 1) mask[y * W + x] = 2;
      }
      // The trunk's own thin shadow from the base out to the crown's.
      for (let t = 0; t <= 1; t += 0.05) { const x = Math.round(o.x * P + (sx - o.x * P) * t), y = Math.round(o.y * P + (sy - o.y * P) * t); if (x >= 0 && y >= 0 && x < W && y < H) mask[y * W + x] = 2; }
    }
  }
  // Contact shadows at the foot of buildings and things, always (they are what an overcast sky leaves).
  for (let cy = 0; cy < CH; cy += 1) for (let cx = 0; cx < CW; cx += 1) {
    const k = cy * CW + cx; if (top[k] > ground[k] + 0.5 || ground[k] < -100) continue;
    let near = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < CW && y < CH && top[y * CW + x] > ground[k] + 3) near = true; }
    if (near) for (let dy = 0; dy < cell; dy += 1) for (let dx = 0; dx < cell; dx += 1) { const px = cx * cell + dx, py = cy * cell + dy; if (px < W && py < H && !mask[py * W + px]) mask[py * W + px] = 1; }
  }
  for (const o of map.objects) { const r = o.size * P * 0.6; for (let y = Math.floor(o.y * P - r * 0.3); y <= o.y * P + r * 0.3; y += 1) for (let x = Math.floor(o.x * P - r); x <= o.x * P + r; x += 1) if (x >= 0 && y >= 0 && x < W && y < H && !mask[y * W + x]) mask[y * W + x] = 1; }
  return mask;
}

/** Darken the ground under the mask, toward a cool shadow colour (dithered at the softest). */
export function applyShadows(fb, mask, model) {
  const sunK = 0.1 + 0.27 * model.direct, contactK = 0.12 + 0.06 * (1 - model.direct);
  for (let y = 0; y < fb.height; y += 1) for (let x = 0; x < fb.width; x += 1) {
    const m = mask[y * fb.width + x]; if (!m) continue;
    const k = m === 2 ? sunK : contactK; if (m === 1 && bayer(x, y) > 0.75) continue;
    const i = (y * fb.width + x) * 4, d = fb.data;
    for (let c = 0; c < 3; c += 1) d[i + c] = d[i + c] * (1 - k) + SHADOW[c] * k * 0.35;
  }
}

// ---------------------------------------------------------------- the colour of the light, and lamps

/** Light sources for a layer: { x, y (pixels), r (pixels), color, power }. */
export function lightSources(map, P, model, { interiors = [], floor = null } = {}) {
  const out = [], add = (x, y, r, color, power = 1) => out.push({ x, y, r: r * P, color: rgb(color).slice(0, 3).map((c) => c / 255), power });
  if (floor === null) {
    for (const f of map.features) {
      const cx = (f.x + f.w / 2) * P, cy = (f.y + f.h / 2) * P;
      if (["campfire", "beacon"].includes(f.kind)) add(cx, cy, 4, "#ffb060", 1.2);
      else if (["lava-channel", "fumarole", "elemental-vent"].includes(f.kind)) add(cx, cy, 3, "#ff7a30", 1);
      else if (["crystal-cluster"].includes(f.kind)) add(cx, cy, 3, "#8fd8ff", 0.9);
      else if (["glowing-pool", "glowing-mushrooms", "sacred-spring"].includes(f.kind)) add(cx, cy, 2, "#7fe8d0", 0.7);
      else if (["ley-nexus", "magic-circle", "teleport-circle", "planar-rift", "ward-stone", "rune-door", "levitation-disc"].includes(f.kind)) add(cx, cy, 2.5, "#b08aff", 0.7);
      else if (model.lightsOn && ["pillar"].includes(f.kind) && map.underground) add(cx, cy + P * 0.6, 3, "#ffb060", 0.9);
    }
    if (model.lightsOn && !map.underground) for (const b of map.buildings) {
      if (!b.doorEdge || b.label === "mausoleum") continue;
      const e = b.doorEdge, [x, y] = e.dir === "e" ? [e.x + 1, e.y + 0.5] : [e.x + 0.5, e.y + 1];
      const out = e.dir === "e" ? [0.6, 0] : e.y + 1 > (b.y0 + b.y1 + 1) / 2 ? [0, 0.6] : [0, -0.6];
      add((x + out[0]) * P, (y + out[1]) * P, 1.7, "#ffc870", 0.9);
    }
    // Lava and molten metal glow from the ground itself.
    const g = map.grid; for (let i = 0; i < g.ground.length; i += 1) if (["molten-metal channel", "planar rift"].includes(g.ground[i]) && (i % 2 === 0)) add(((i % map.spec.columns) + 0.5) * P, (Math.floor(i / map.spec.columns) + 0.5) * P, 1.6, g.ground[i] === "planar rift" ? "#b06aff" : "#ff8a3a", 0.6);
  } else {
    for (const b of interiors) {
      const f = b.floors.find((x) => x.floor === floor); if (!f) continue;
      for (const it of f.furniture) if (it.kind === "hearth") add((it.x + it.w / 2) * P, (it.y + it.h) * P, 3.5, "#ffa050", 1.2);
      if (model.lightsOn) for (const room of f.rooms) add(((room.x0 + room.x1 + 1) / 2) * P, ((room.y0 + room.y1 + 1) / 2) * P, 2.4, floor < 0 ? "#ffb870" : "#ffd590", floor < 0 ? 0.8 : 0.9);
      // Daylight through the windows, falling into the rooms.
      if (!model.lightsOn || model.lighting.sunAltitudeDeg > 0) for (const wl of f.walls) if (wl.window && !wl.diag) {
        const [x, y] = wl.dir === "e" ? [wl.x + 1, wl.y + 0.5] : [wl.x + 0.5, wl.y + 1];
        add(x * P, y * P, 1.8, "#fff2d8", 0.45 * Math.max(0.3, model.lighting.cloud < 0.8 ? 1 : 0.5));
      }
    }
  }
  return out;
}

/**
 * The colour of the light over a layer: saturation, ambient light, fog, and the light sources as stepped
 * pools (three bands, dithered at their edges), so lamps read as pixel art, not airbrush.
 */
export function gradeLayer(fb, model, sources = [], { keepAlpha = true, unlit = null } = {}) {
  const W = fb.width, H = fb.height, add = new Float32Array(W * H * 3);
  for (const s of sources) {
    for (let y = Math.max(0, Math.floor(s.y - s.r)); y <= Math.min(H - 1, Math.ceil(s.y + s.r)); y += 1) for (let x = Math.max(0, Math.floor(s.x - s.r)); x <= Math.min(W - 1, Math.ceil(s.x + s.r)); x += 1) {
      if (unlit && unlit[y * W + x]) continue; // roofs are above the lamps
      const d = Math.hypot(x + 0.5 - s.x, y + 0.5 - s.y) / s.r; if (d >= 1) continue;
      const f = Math.ceil(Math.max(0, 1 - d + (bayer(x, y) - 0.5) * 0.14) * 3) / 3; if (f <= 0) continue;
      const k = (y * W + x) * 3; for (let c = 0; c < 3; c += 1) add[k + c] += s.color[c] * f * s.power * 0.75;
    }
  }
  const [ar, ag, ab] = model.ambient, sat = model.saturation, fog = model.fog, fc = model.fogColor, d = fb.data;
  for (let p = 0; p < W * H; p += 1) {
    const i = p * 4; if (keepAlpha && d[i + 3] === 0) continue;
    let r = d[i], g = d[i + 1], b = d[i + 2]; const l = 0.3 * r + 0.59 * g + 0.11 * b;
    r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
    const k = p * 3; r *= ar + add[k]; g *= ag + add[k + 1]; b *= ab + add[k + 2];
    if (fog) { r += (fc[0] - r) * fog; g += (fc[1] - g) * fog; b += (fc[2] - b) * fog; }
    d[i] = Math.min(255, r); d[i + 1] = Math.min(255, g); d[i + 2] = Math.min(255, b);
  }
}
