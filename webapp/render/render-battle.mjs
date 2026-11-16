// Tier 2 (traditional RPG pixel art) rendering of a battle map, from the same deterministic map the Foundry
// module builds: same squares, same objects, same buildings — only the drawing changes. Produces the layers
// a multi-floor Foundry scene needs, at a native pixel size per square, to be scaled up by a whole number:
//   exterior  — the outside with roofs (also the preview);
//   ground    — the outside with every building opened up (its ground-floor rooms);
//   roofs[f]  — the roofs over floor f, alone (transparent elsewhere);
//   floors[f] — each other floor: upper floors over transparency, the basement over solid dark.
// Every texture is pinned to world pixel coordinates, so neighbouring maps join seamlessly.

import { Framebuffer, rgb } from "./framebuffer.mjs";
import { groundPixel, h2, mixc, noise, ramp } from "./materials.mjs";
import { drawBlock, drawBuilding, drawBush, drawFeature, drawFurniture, drawRock, drawTree, setSpriteLight } from "./sprites.mjs";
import { inFootprint } from "./footprint.mjs";
import { applyShadows, gradeLayer, lightSources, shadowMask } from "./light.mjs";
import { lightModel } from "../../scripts/eym-battle-lighting.mjs";
import { FEATURES } from "../../scripts/eym-battle-settings.mjs";
import { standHeightFt } from "../../scripts/eym-battle-oblique.mjs";
import { footprintPolygon } from "../../scripts/eym-battle-buildings.mjs";

export const RENDERER = Object.freeze({ tier: 2, name: "Traditional RPG pixel art", version: "eym-pixel-t2-v2" });

/** Native pixels per square and a whole-number scale that gives the scene's grid size. */
export function pixelPlan(gridPx) {
  let best = null;
  for (let k = 1; k <= 8; k += 1) { if (gridPx % k) continue; const native = gridPx / k; if (native < 16 || native > 48) continue; const score = Math.abs(native - 34); if (!best || score < best.score) best = { native, scale: k, score }; }
  return best ? { native: best.native, scale: best.scale } : { native: gridPx, scale: 1 };
}

const HARD = new Set(["cobbled street", "paved square", "marble quay", "stone bridge", "stone arch", "floor", "flagstone floor", "raised dais", "tree platform", "rope bridge", "ladder", "stone stairs", "carved wall", "canal", "open sky (a fall)", "open air (a fall)", "cave wall"]);
const WATERS = new Set(["deep water", "river", "canal", "shallow stream", "deep channel", "shallows", "glowing pool"]);
const SEASONAL = new Set(["grass", "meadow", "wet meadow", "scrub", "field", "yard", "floating rock", "forest floor"]);
const SEASON_TINT = { spring: [[150, 210, 100, 255], 0.08], autumn: [[190, 150, 80, 255], 0.18], winter: [[140, 138, 116, 255], 0.24] };
const WETTABLE = new Set(["grass", "meadow", "scrub", "field", "yard", "dirt lane", "road", "cobbled street", "paved square", "marble quay", "stone bridge", "forest floor", "sand", "canyon floor", "carved stone terrace", "monastery terrace", "lower terrace", "grave earth", "floating rock"]);
const TREE_STYLE = { taiga: "conifer", alpine: "conifer", glacier: "conifer", tundra: "conifer", jungle: "jungle", "blighted-wood": "dead", "mushroom-forest": "broadleaf" };

export { inFootprint } from "./footprint.mjs";

// ---------------------------------------------------------------- the ground

function drawGround(fb, map, P, model) {
  const { grid } = map, { columns, rows } = map.spec, [ox, oy] = map.origin, W = columns * P, H = rows * P;
  const water = new Uint8Array(W * H), levels = [...grid.levelFt].filter((v, i) => !grid.void[i]), lo = Math.min(...levels), hi = Math.max(...levels);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) {
    const c = Math.floor(x / P), r = Math.floor(y / P), i = r * columns + c, wx = ox * P + x, wy = oy * P + y;
    let g = grid.ground[i];
    // Natural edges wander: a pixel near a border may take its neighbour's ground (same level, both natural).
    if (!HARD.has(g)) {
      const sc = Math.max(0, Math.min(columns - 1, Math.floor((x + (noise(wx, wy, 9, 3) - 0.5) * P * 0.5) / P))), sr = Math.max(0, Math.min(rows - 1, Math.floor((y + (noise(wx, wy, 9, 4) - 0.5) * P * 0.5) / P))), j = sr * columns + sc;
      if (j !== i && !HARD.has(grid.ground[j]) && grid.levelFt[j] === grid.levelFt[i] && grid.building[j] < 0) g = grid.ground[j];
    }
    let px = groundPixel(g, wx, wy); const name = g.replace(/ \(mud\)$/, "");
    // The season in the grass; rain on the ground: darker, with puddles that hold the sky.
    if (SEASONAL.has(name) && SEASON_TINT[model.season]) px = mixc(px, SEASON_TINT[model.season][0], SEASON_TINT[model.season][1]);
    if (model.wet && WETTABLE.has(name)) { px = mixc(px, [40, 44, 52, 255], 0.14); const pud = noise(wx, wy, 22, 61) * 0.75 + noise(wx, wy, 7, 63) * 0.25; if (pud > 0.74 && grid.move[i] !== "swim") px = pud > 0.775 ? mixc([126, 148, 178, 255], [190, 206, 226, 255], noise(wx, wy, 5, 64) > 0.7 ? 0.6 : 0) : mixc(px, [70, 78, 92, 255], 0.35); }
    fb.set(x, y, px);
    if (WATERS.has(g.replace(/ \(mud\)$/, ""))) water[y * W + x] = 1;
    if (hi - lo >= 10 && !grid.void[i]) { const t = (grid.levelFt[i] - lo) / (hi - lo) - 0.5; if (Math.abs(t) > 0.05) fb.tone(x, y, t * 0.3); }
  }
  // Shores: foam on the water's edge, a darker wet rim on the land.
  for (let y = 1; y < H - 1; y += 1) for (let x = 1; x < W - 1; x += 1) {
    const k = y * W + x, edge = water[k - 1] !== water[k] || water[k + 1] !== water[k] || water[k - W] !== water[k] || water[k + W] !== water[k];
    if (!edge) continue;
    if (water[k]) fb.set(x, y, (h2(ox * P + x, oy * P + y, 5) < 0.7) ? rgb("#e6f2f6") : rgb("#b8dcec")); else fb.tone(x, y, -0.25);
  }
  // Streams and rivers from the world, as smooth water lines over the ground (natural maps).
  if (!map.flattened) for (const s of map.site.streams) {
    const r = Math.max(1.5, (s.widthSquares * P) / 2);
    for (let k = 0; k + 1 < s.line.length; k += 1) {
      const [ax, ay] = s.line[k], [bx, by] = s.line[k + 1], n = Math.ceil(Math.hypot(bx - ax, by - ay) * P / 2) + 1;
      for (let t = 0; t <= n; t += 1) { const cx = (ax + (bx - ax) * (t / n)) * P, cy = (ay + (by - ay) * (t / n)) * P; fb.ellipse(cx, cy, r + 1, r + 1, null, (x, y, u, v) => (u * u + v * v > 0.7 ? rgb("#3f6f90") : groundPixel("shallow stream", ox * P + x, oy * P + y))); }
    }
  }
}

/** Faces where the ground steps down to the south (rock, or quay stone over water) and rock below island rims. */
function drawFaces(fb, map, P) {
  const { grid } = map, { columns, rows } = map.spec, rock = ramp("#8a7a66", 5, 0.5), stone = ramp("#b9b2a4", 5, 0.4);
  for (let r = 0; r < rows - 1; r += 1) for (let c = 0; c < columns; c += 1) {
    const i = r * columns + c, j = i + columns, x0 = c * P;
    if (grid.void[j] && !grid.void[i]) {
      const d1 = P * (0.5 + 0.6 * h2(c, r, 11)), d2 = P * (0.8 + 0.9 * h2(c, r, 12)), tip = x0 + P * (0.3 + 0.4 * h2(c, r, 13)), yb = (r + 1) * P;
      fb.polygon([[x0, yb], [x0 + P, yb], [x0 + P * 0.9, yb + d1], [tip, yb + d2], [x0 + P * 0.1, yb + d1 * 0.8]], null, (x, y) => (x > tip ? rock[1] : (h2(x >> 1, y >> 1, 14) < 0.2 ? rock[1] : rock[2])));
      continue;
    }
    if (grid.void[i] || grid.void[j]) continue;
    const drop = grid.levelFt[i] - grid.levelFt[j]; if (drop < 5 || grid.ramp[i] || grid.ramp[j]) continue;
    const waterBelow = grid.move[j] === "swim" || grid.water?.[j], fh = Math.round(P * (waterBelow ? 0.3 : Math.min(0.95, 0.25 + drop / 30)));
    const fy = waterBelow ? (r + 1) * P : (r + 1) * P - fh, g = waterBelow ? stone : rock;
    for (let y = fy; y < fy + fh; y += 1) for (let x = x0; x < x0 + P; x += 1) {
      const ly = y - fy, crack = h2(x >> 2, 0, c * 31 + r) < 0.25 && ((x & 3) === 0);
      fb.set(x, y, ly === 0 ? g[4] : ly === fh - 1 ? g[0] : crack ? g[1] : g[2 + (h2(x >> 1, (ly / 3) | 0, 15) < 0.35 ? 1 : 0)]);
    }
  }
  // Side edges of levels (east-facing steps): a dark line and a lit one.
  for (const cl of map.cliffs ?? []) if (cl.dir === "e") for (let y = cl.y * P; y < (cl.y + 1) * P; y += 1) { fb.set((cl.x + 1) * P - 1, y, rock[0]); fb.set((cl.x + 1) * P, y, rock[3]); }
}

// ---------------------------------------------------------------- shadows and things that stand

/** Flat features drawn on the ground (pools, circles, stairs, docks, graves…). */
function drawFlat(fb, f, def, P, map) {
  const x = f.x * P, y = f.y * P, w = f.w * P, h = f.h * P, [ox, oy] = map.origin, g = ramp(def.color, 5, 0.5);
  switch (def.shape) {
    case "blob": fb.ellipse(x + w / 2, y + h / 2, w / 2 - 1, h / 2 - 1, null, (px, py, u, v) => (u * u + v * v > 0.8 ? g[1] : ["pool", "glowing-pool", "sacred-spring", "tide-pools", "thin-ice"].includes(f.kind) ? groundPixel("deep water", ox * P + px, oy * P + py) : g[2 + (h2(px >> 1, py >> 1, 21) < 0.3 ? 1 : 0)])); return;
    case "circle": fb.ellipse(x + w / 2, y + h / 2, w / 2 - 2, h / 2 - 2, null, (px, py, u, v) => { const d = Math.hypot(u, v); return d > 0.86 || (d > 0.62 && d < 0.7) ? g[4] : fb.get(px, py); }); return;
    case "stairs": for (let py = y; py < y + h; py += 1) for (let px = x; px < x + w; px += 1) fb.set(px, py, (Math.floor(py - y) % 4) === 0 ? g[0] : g[3 - Math.floor(((py - y) / h) * 2)]); return;
    case "planks": for (let py = y; py < y + h; py += 1) for (let px = x; px < x + w; px += 1) fb.set(px, py, (w > h ? (px - x) % 4 === 3 : (py - y) % 4 === 3) ? g[0] : g[2]); return;
    case "graves": fb.rect(x, y, w, h, g[1]); for (let k = 0; k < f.w * f.h; k += 1) drawBlock(fb, x + (k % f.w) * P + P * 0.3, y + Math.floor(k / f.w) * P + P * 0.35, P * 0.4, P * 0.2, P * 0.3, "#b8b3a8", k); return;
    case "lava": for (let py = y; py < y + h; py += 1) for (let px = x; px < x + w; px += 1) fb.set(px, py, groundPixel("molten-metal channel", ox * P + px, oy * P + py)); return;
    case "ditch": fb.rect(x + 2, y + 2, w - 4, h - 4, g[0]); return;
    default: for (let py = y; py < y + h; py += 1) for (let px = x; px < x + w; px += 1) fb.set(px, py, mixc(fb.get(px, py), g[2 + (h2(px >> 1, py >> 1, 22) < 0.3 ? 1 : 0)], 0.7));
  }
}

function drawStanding(fb, map, P) {
  const items = [], style = TREE_STYLE[map.setting] ?? "broadleaf";
  for (const o of map.objects) items.push({ y: o.y, x: o.x, draw: () => (o.kind === "tree" ? drawTree(fb, o.x * P, o.y * P, o.size, P, style, Math.round(o.x * 97 + o.y * 13)) : o.kind === "bush" ? drawBush(fb, o.x * P, o.y * P, o.size, P, Math.round(o.x * 31 + o.y)) : drawRock(fb, o.x * P, o.y * P, o.size, P, Math.round(o.x * 7 + o.y * 3))) });
  for (const f of map.features) {
    const def = FEATURES[f.kind], ft = standHeightFt(f.kind, def);
    if (def.shape === "tree" || def.shape === "trunk") { items.push({ y: f.y + f.h, x: f.x, draw: () => drawTree(fb, (f.x + f.w / 2) * P, (f.y + f.h - 0.15) * P, def.shape === "trunk" ? 1.9 : f.kind === "planter-tree" ? 0.6 : 0.95, P, style, f.x * 13 + f.y) }); continue; }
    if (ft <= 0) { drawFlat(fb, f, def, P, map); continue; }
    items.push({ y: f.y + f.h, x: f.x, draw: () => { if (!drawFeature(fb, f, def, P, f.x * 17 + f.y, ft)) drawBlock(fb, f.x * P + 1, f.y * P + 1, f.w * P - 2, f.h * P - 2, Math.min(3, ft / 10) * P * 0.85, def.color, f.x * 17 + f.y, def.shape === "round" || def.shape === "mushroom" || def.shape === "crystal"); } });
  }
  for (const b of map.buildings) items.push({ y: b.y1 + 1, x: b.x0, draw: () => drawBuilding(fb, b, P, b.chamfers?.length ? footprintPolygon(b) : null, b.id * 101 + 7) });
  items.sort((a, b) => a.y - b.y || a.x - b.x);
  for (const it of items) it.draw();
}

// ---------------------------------------------------------------- inside the buildings

const ROOM_FLOOR = { "common room": "floor", shop: "floor", bedroom: "floor", study: "floor", kitchen: "flagstone floor", storeroom: "flagstone floor", cellar: "cave floor", crypt: "cave floor", nave: "marble quay", vestry: "flagstone floor", hall: "flagstone floor" };

function drawInterior(fb, map, building, floor, P) {
  const f = building.floors.find((x) => x.floor === floor); if (!f) return;
  const [ox, oy] = map.origin, inside = (x, y) => inFootprint({ ...building.rect, rects: building.rects, chamfers: building.chamfers }, (x + 0.5) / P, (y + 0.5) / P);
  const wallTone = ramp(floor < 0 ? "#6a6058" : "#d8c8a4", 4, 0.45);
  for (const room of f.rooms) {
    const mat = ROOM_FLOOR[room.use] ?? "floor";
    for (let y = room.y0 * P; y < (room.y1 + 1) * P; y += 1) for (let x = room.x0 * P; x < (room.x1 + 1) * P; x += 1) if (inside(x, y)) {
      const back = y - room.y0 * P < P * 0.42; fb.set(x, y, back ? (y - room.y0 * P > P * 0.36 ? wallTone[0] : wallTone[2 + ((x >> 2) & 1)]) : groundPixel(mat, ox * P + x, oy * P + y));
    }
  }
  if (building.stairs) { const s = building.stairs; for (let y = s.y * P; y < (s.y + s.h) * P; y += 1) for (let x = s.x * P; x < (s.x + s.w) * P; x += 1) fb.set(x, y, ((s.w > s.h ? x - s.x * P : y - s.y * P) % 4) === 0 ? rgb("#6e604a") : rgb("#d6c7a8")); }
  for (const it of [...f.furniture].sort((a, b) => a.y + a.h - (b.y + b.h))) drawFurniture(fb, it, P, it.x * 7 + it.y);
  const dark = rgb("#241a12"), door = rgb("#d9b77a"), glass = rgb("#9fd0f0");
  for (const wl of f.walls) {
    const [a, b, c, d] = (wl.diag ?? (wl.dir === "e" ? [wl.x + 1, wl.y, wl.x + 1, wl.y + 1] : [wl.x, wl.y + 1, wl.x + 1, wl.y + 1])).map((v) => v * P), thick = wl.outer ? 2 : 1;
    for (let t = -thick; t <= thick - 1; t += 1) { const nx = a === c ? t : 0, ny = b === d ? t : 0; fb.line(a + nx + (wl.diag ? t : 0), b + ny, c + nx + (wl.diag ? t : 0), d + ny, wl.door ? door : dark); }
    if (wl.window && !wl.door) fb.line(a + (c - a) * 0.3, b + (d - b) * 0.3, a + (c - a) * 0.7, b + (d - b) * 0.7, glass);
  }
}

// ---------------------------------------------------------------- the layers

/** All the layers of a battle map at native size. interiors: from buildInteriors(map). */
export function renderBattleLayers(map, interiors, { gridPx = map.spec.gridPx, lighting = null } = {}) {
  const { native: P, scale } = pixelPlan(gridPx), W = map.spec.columns * P, H = map.spec.rows * P;
  // The light: the sun's height and bearing, cloud, fog, rain, season; underground maps have none.
  const light = lighting ?? { latDeg: map.center[0] }, model = lightModel(light, { underground: map.underground }), indoor = lightModel(light, { indoors: true }), below = lightModel(light, { underground: true });
  const alt = model.lighting.sunAltitudeDeg;
  setSpriteLight({ toSun: alt > 0 && !map.underground ? model.toSun : [-0.6, -0.8], altitudeDeg: alt > 0 ? alt : 40, season: model.season, faceTone: map.underground ? -0.3 : model.faceTone, direct: model.direct, lightsOn: model.lightsOn });
  const exterior = new Framebuffer(W, H);
  drawGround(exterior, map, P, model); drawFaces(exterior, map, P); applyShadows(exterior, shadowMask(map, P, model), model); drawStanding(exterior, map, P);
  const roofsAbove = new Uint8Array(W * H); for (const b of map.buildings) for (let y = Math.max(0, b.y0 * P); y < Math.min(H, (b.y1 + 1) * P); y += 1) for (let x = Math.max(0, b.x0 * P); x < Math.min(W, (b.x1 + 1) * P); x += 1) if (inFootprint(b, (x + 0.5) / P, (y + 0.5) / P)) roofsAbove[y * W + x] = 1;
  gradeLayer(exterior, model, lightSources(map, P, model), { unlit: roofsAbove });
  const floors = [...new Set(interiors.flatMap((b) => b.floors.map((f) => f.floor)))].sort((a, b) => a - b);
  const footprintMask = (list) => { const m = new Uint8Array(W * H); for (const b of list) { const fb = { ...b.rect, rects: b.rects, chamfers: b.chamfers }; for (let y = b.rect.y0 * P; y < (b.rect.y1 + 1) * P; y += 1) for (let x = b.rect.x0 * P; x < (b.rect.x1 + 1) * P; x += 1) if (x >= 0 && y >= 0 && x < W && y < H && inFootprint(fb, (x + 0.5) / P, (y + 0.5) / P)) m[y * W + x] = 1; } return m; };
  const copyMasked = (src, mask) => { const out = new Framebuffer(W, H); for (let k = 0; k < W * H; k += 1) if (mask[k]) { out.data.set(src.data.subarray(k * 4, k * 4 + 4), k * 4); } return out; };
  // Ground: the outside with each building's ground floor in place of its roof.
  const ground = new Framebuffer(W, H); ground.data.set(exterior.data);
  if (interiors.length) {
    const inner = new Framebuffer(W, H); for (const b of interiors) drawInterior(inner, map, b, 0, P);
    gradeLayer(inner, indoor, lightSources(map, P, indoor, { interiors, floor: 0 }));
    const all = footprintMask(interiors); for (let k = 0; k < W * H; k += 1) if (all[k] && inner.data[k * 4 + 3]) ground.data.set(inner.data.subarray(k * 4, k * 4 + 4), k * 4);
  }
  const roofs = {}, floorLayers = {};
  if (interiors.length) roofs[0] = copyMasked(exterior, footprintMask(interiors));
  for (const floor of floors.filter((f) => f !== 0)) {
    const having = interiors.filter((b) => b.floors.some((f) => f.floor === floor)), layer = new Framebuffer(W, H, floor < 0 ? "#141210" : null);
    if (floor < 0) for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) if (h2(x, y, 99) < 0.04) layer.set(x, y, rgb("#22201c"));
    const inner = new Framebuffer(W, H); for (const b of having) drawInterior(inner, map, b, floor, P);
    const m0 = floor < 0 ? below : indoor; gradeLayer(inner, m0, lightSources(map, P, m0, { interiors: having, floor })); if (floor < 0) gradeLayer(layer, below, []);
    const m = footprintMask(having); for (let k = 0; k < W * H; k += 1) if (m[k] && inner.data[k * 4 + 3]) layer.data.set(inner.data.subarray(k * 4, k * 4 + 4), k * 4);
    floorLayers[floor] = layer;
    if (floor > 0) roofs[floor] = copyMasked(exterior, footprintMask(interiors.filter((b) => Math.max(...b.floors.map((f) => f.floor)) === floor)));
  }
  return { native: P, scale, width: W * scale, height: H * scale, exterior, ground, roofs, floors: floorLayers, floorList: floors, light: { sunAltitudeDeg: alt, sunAzimuthDeg: model.lighting.sunAzimuthDeg, season: model.season, direct: Math.round(model.direct * 100) / 100, night: model.night } };
}
