// A battle map as a Foundry v14 scene with native Scene Levels (one per floor).
//
//   - Ground level: the outdoor map with every building opened up (its ground-floor rooms showing), and
//     one overhead roof layer (a tile in VISION occlusion mode): a roof stays drawn until a token can see
//     beneath it, so stepping through a door reveals that building's rooms and keeps the rest of the
//     map — and the other roofs — as they were.
//   - Upper floors: a level each, drawn only where buildings reach that floor (transparent elsewhere) and
//     showing the ground level beneath, so the outside stays in view and the floor below is hidden under
//     the building. Their own roofs sit over them the same way.
//   - Basement: a level drawn only where there are basements, solid dark elsewhere, showing no other
//     level: underground, nothing outside can be seen.
//   - Stairs: a region on every floor a stair joins, with Foundry's changeLevel behaviour.
//   - Walls per level: outer walls with doors and windows (windows let sight and light through but not
//     movement), inner walls with doors, palisades and ruins, and cliffs (movement only).
//   - Objects (furniture, pillars, statues, boulders…): light-blocking walls where one stands taller than a
//     light near it, with its true base and top in `wall-height` flags (eym-battle-occluders.mjs).
//   - Lights: Foundry AmbientLights at sensible heights (candles 4 ft above the floor, lanterns 7 ft).
// Pure: returns the documents to create; the app creates the Levels first, then everything else with
// the new Levels' ids. Field names follow Foundry v14's data schemas (Level, Wall, Tile, Region).

import { FEATURES, MOVE } from "./eym-battle-settings.mjs";
import { FURNITURE, mapFloors } from "./eym-battle-interiors.mjs";
import { floorBase, occluderRecord, occluderWalls, battleOccluders } from "./eym-battle-occluders.mjs";

export const OCCLUSION_VISION = 8;

/**
 * Light sources as Foundry lights, so the scene's own lighting handles them live: those that need dark
 * (door lanterns, candles, windows) switch on by themselves as the scene darkens; fires, hearths, lava,
 * crystals and magic are always lit. Distances in feet (grid units). Each on its floor's Level.
 */
export const LIGHT_KINDS = Object.freeze({
  lantern: { bright: 10, dim: 20, color: "#ffb85c", alpha: 0.4, darkness: { min: 0.45, max: 1 }, animation: { type: "torch", speed: 2, intensity: 2 } },
  window: { bright: 0, dim: 10, color: "#ffc070", alpha: 0.3, darkness: { min: 0.55, max: 1 } },
  candle: { bright: 5, dim: 10, color: "#ffd28a", alpha: 0.35, darkness: { min: 0.4, max: 1 }, animation: { type: "torch", speed: 3, intensity: 1 } },
  cellarLamp: { bright: 5, dim: 15, color: "#ffc070", alpha: 0.4, darkness: { min: 0, max: 1 }, animation: { type: "torch", speed: 2, intensity: 1 } },
  hearth: { bright: 10, dim: 20, color: "#ff9a50", alpha: 0.45, darkness: { min: 0, max: 1 }, animation: { type: "torch", speed: 3, intensity: 3 } },
  fire: { bright: 20, dim: 40, color: "#ffa040", alpha: 0.45, darkness: { min: 0, max: 1 }, animation: { type: "torch", speed: 3, intensity: 3 } },
  brazier: { bright: 15, dim: 30, color: "#ffa850", alpha: 0.45, darkness: { min: 0, max: 1 }, animation: { type: "torch", speed: 2, intensity: 2 } },
  lava: { bright: 10, dim: 20, color: "#ff6a20", alpha: 0.5, darkness: { min: 0, max: 1 }, animation: { type: "pulse", speed: 1, intensity: 2 } },
  crystal: { bright: 5, dim: 15, color: "#7fd8ff", alpha: 0.4, darkness: { min: 0, max: 1 } },
  glow: { bright: 0, dim: 10, color: "#6fe8d0", alpha: 0.35, darkness: { min: 0, max: 1 } },
  magic: { bright: 5, dim: 10, color: "#b08aff", alpha: 0.4, darkness: { min: 0, max: 1 }, animation: { type: "pulse", speed: 2, intensity: 2 } },
});
const FEATURE_LIGHT = { campfire: "fire", beacon: "fire", "lava-channel": "lava", fumarole: "lava", "elemental-vent": "lava", "crystal-cluster": "crystal", "glowing-pool": "glow", "glowing-mushrooms": "glow", "sacred-spring": "glow", "ley-nexus": "magic", "magic-circle": "magic", "teleport-circle": "magic", "planar-rift": "magic", "ward-stone": "magic", "rune-door": "magic", "levitation-disc": "magic" };

/** The lights of a battle map, by floor. Positions in pixels; `levelKeys` name the floor's Level. */
export function battleLights(map, interiors, { gridPx = map.spec.gridPx } = {}) {
  const out = [], { columns } = map.spec, g = map.grid;
  const add = (kind, x, y, levelKey = "floor0", elevation = 0, name = kind) => { const k = LIGHT_KINDS[kind]; out.push({ levelKeys: [levelKey], name, x: Math.round(x * gridPx), y: Math.round(y * gridPx), elevation, walls: true, vision: false, config: { bright: k.bright, dim: k.dim, color: k.color, alpha: k.alpha, darkness: k.darkness, coloration: 1, luminosity: 0.5, attenuation: 0.5, ...(k.animation ? { animation: k.animation } : {}) }, flags: { "eym-planet-map": { light: kind } } }); };
  const levelAt = (x, y) => g.levelFt[Math.max(0, Math.min(g.levelFt.length - 1, Math.floor(y) * columns + Math.floor(x)))] ?? 0;
  for (const f of map.features) {
    const kind = FEATURE_LIGHT[f.kind] ?? (map.underground && f.kind === "pillar" ? "brazier" : null); if (!kind) continue;
    const x = f.x + f.w / 2, y = f.y + f.h / 2; add(kind, x, y, "floor0", levelAt(x, y) + 2, f.kind);
  }
  // Lava and molten metal in the ground itself: one light every few squares along it.
  for (let i = 0; i < g.ground.length; i += 1) { const x = i % columns, y = Math.floor(i / columns); if (["molten-metal channel", "planar rift"].includes(g.ground[i]) && (x + y) % 3 === 0) add(g.ground[i] === "planar rift" ? "magic" : "lava", x + 0.5, y + 0.5, "floor0", g.levelFt[i]); }
  for (const b of map.buildings) {
    const e = b.doorEdge; if (!e || b.label === "mausoleum") continue;
    // A lantern just outside the door, and the glow of the street-front windows.
    const [dx, dy] = e.dir === "e" ? [e.x + 1, e.y + 0.5] : [e.x + 0.5, e.y + 1], out_ = e.dir === "e" ? [b.x1 >= e.x + 1 ? -0.4 : 0.4, 0] : [0, b.y1 >= e.y + 1 ? -0.4 : 0.4];
    add("lantern", dx + out_[0], dy + out_[1], "floor0", levelAt(dx, dy) + 7, "door lantern");
    if (e.dir !== "e") add("window", (b.x0 + b.x1 + 1) / 2, dy + out_[1] * 2, "floor0", levelAt(dx, dy) + 5, "window glow");
  }
  // Inside: heights above each floor (feet): a hearth's fire 2, a candle on a stand or table 4, a cellar
  // lamp hung at 6. A candle stands on the free square nearest its room's middle, never in a tall piece.
  for (const b of interiors) for (const f of b.floors) {
    const key = `floor${f.floor}`, base = (g.levelFt[Math.max(0, b.rect.y0) * columns + Math.max(0, b.rect.x0)] ?? 0) + floorBase(f.floor);
    for (const it of f.furniture) if (it.kind === "hearth") add("hearth", it.x + it.w / 2, it.y + it.h, key, base + 2, "hearth");
    const tall = (x, y) => f.furniture.some((it) => (FURNITURE[it.kind]?.heightFt ?? 0) > 3 && x >= it.x && x < it.x + it.w && y >= it.y && y < it.y + it.h);
    for (const r of f.rooms) {
      const mx = (r.x0 + r.x1 + 1) / 2, my = (r.y0 + r.y1 + 1) / 2; let best = null;
      for (let y = r.y0; y <= r.y1; y += 1) for (let x = r.x0; x <= r.x1; x += 1) { if (tall(x, y)) continue; const d = Math.hypot(x + 0.5 - mx, y + 0.5 - my); if (!best || d < best.d) best = { x: x + 0.5, y: y + 0.5, d }; }
      const at = !tall(Math.floor(mx), Math.floor(my)) ? { x: mx, y: my } : best ?? { x: mx, y: my };
      add(f.floor < 0 ? "cellarLamp" : "candle", at.x, at.y, key, base + (f.floor < 0 ? 6 : 4), f.floor < 0 ? "lamp" : "candle");
    }
  }
  return out;
}
const SENSE = { none: 0, limited: 10, normal: 20 };
const MOVEMENT_ACTIONS = ["walk", "crawl", "climb", "fly", "jump", "burrow", "swim", "blink", "displace"];

/** Rectangles covering the squares that pass a test (row runs merged downward). */
export function rectangles(columns, rows, test) {
  const runs = []; let open = new Map();
  for (let y = 0; y < rows; y += 1) {
    const next = new Map();
    for (let x = 0; x < columns; x += 1) {
      if (!test(y * columns + x)) continue; const start = x; while (x + 1 < columns && test(y * columns + x + 1)) x += 1;
      const k = `${start},${x}`, prev = open.get(k); if (prev) { prev.h += 1; next.set(k, prev); } else { const r = { x: start, y, w: x - start + 1, h: 1 }; runs.push(r); next.set(k, r); }
    }
    open = next;
  }
  return runs;
}

/** The floor levels' names and elevation bands (feet). Ground covers the terrain's range. */
export function levelBands(map, interiors) {
  const floors = mapFloors(interiors), e = [...map.grid.elevationFt].filter((v, i) => !map.grid.void[i]);
  const groundBottom = Math.min(0, ...e), groundTop = Math.max(10, Math.max(...e) + 10);
  const name = (f) => (f < 0 ? "Basement" : f === 0 ? "Ground" : f === 1 ? "Upper floor" : `Floor ${f + 1}`);
  const bands = floors.length ? floors : [0];
  return bands.map((f) => ({ key: `floor${f}`, floor: f, name: name(f), elevation: f < 0 ? { bottom: groundBottom - 10 * -f, top: groundBottom - 10 * (-f - 1) } : f === 0 ? { bottom: groundBottom, top: groundTop } : { bottom: groundTop + 10 * (f - 1), top: groundTop + 10 * f } }));
}

/**
 * The scene and its documents. images: { ground, roofs: {floor: src}, floors: {floor: src} } (paths of
 * uploaded images). Returns { scene, levels, walls, tiles, regions }; level references are by key
 * ("floor0", "floor1", "floor-1") in `levelKeys` / `levelKey`, for the app to swap for ids.
 */
export function battleScenePlan(map, interiors, { name, images, gridPx = map.spec.gridPx, darkness = 0, weather = "", movementCost = false, notes = "" }) {
  const { columns, rows } = map.spec, W = columns * gridPx, H = rows * gridPx, px = (v) => Math.round(v * gridPx);
  const bands = levelBands(map, interiors), byFloor = new Map(bands.map((b) => [b.floor, b]));
  const levels = bands.map((b, sort) => ({
    key: b.key, name: b.name, sort, elevation: b.elevation,
    background: { src: b.floor === 0 ? images.ground : images.floors?.[b.floor] ?? null, color: b.floor < 0 ? "#141210" : "#000000" },
    visibility: { levelKeys: b.floor > 0 ? ["floor0"] : [] },
  }));
  const underground = map.underground, dark = underground ? (map.dimLight ? 0.6 : 1) : darkness;
  const scene = {
    name, width: W, height: H, padding: 0, grid: { type: 1, size: gridPx, distance: 5, units: "ft" }, tokenVision: true,
    environment: { darknessLevel: dark, globalLight: { enabled: !underground && dark < 0.5 } }, weather: underground ? "" : weather,
    flags: { "eym-planet-map": { battle: { version: map.version, key: map.key, setting: map.setting, center: map.center, spec: { columns, rows, gridPx }, analysis: map.analysis, notes, floors: bands.map((b) => b.name), extras: (map.extras ?? []).map((e) => e.id) } } },
  };
  // Walls.
  const walls = [], seg = (x, y, dir) => (dir === "e" ? [x + 1, y, x + 1, y + 1] : [x, y + 1, x + 1, y + 1]).map(px);
  for (const b of interiors) for (const f of b.floors) {
    const key = byFloor.get(f.floor)?.key; if (!key) continue;
    const base = map.grid.levelFt[Math.max(0, b.rect.y0) * columns + Math.max(0, b.rect.x0)] ?? 0;
    for (const wl of f.walls) {
      const c = wl.diag ? wl.diag.map(px) : seg(wl.x, wl.y, wl.dir); if (c.some((v, k) => v < 0 || v > (k % 2 ? H : W))) continue;
      walls.push({ levelKeys: [key], c, move: SENSE.normal, sight: wl.window ? SENSE.none : SENSE.normal, light: wl.window ? SENSE.none : SENSE.normal, sound: wl.window ? SENSE.limited : SENSE.normal, door: wl.door ? 1 : 0, ds: 0, flags: { "wall-height": { bottom: base + 10 * Math.max(0, f.floor), top: base + 10 * (Math.max(0, f.floor) + 1) }, "eym-planet-map": { building: b.id, floor: f.floor, window: Boolean(wl.window) } } });
    }
  }
  for (const ft of map.features) if (FEATURES[ft.kind]?.wall && FEATURES[ft.kind].round) {
    // A round tower: an eight-sided wall around it.
    const cx = ft.x + ft.w / 2, cy = ft.y + ft.h / 2, r = ft.w / 2 - 0.05, pts = Array.from({ length: 8 }, (_, k) => [cx + r * Math.cos((Math.PI / 4) * k + Math.PI / 8), cy + r * Math.sin((Math.PI / 4) * k + Math.PI / 8)].map(px));
    for (let k = 0; k < 8; k += 1) walls.push({ levelKeys: ["floor0"], c: [...pts[k], ...pts[(k + 1) % 8]], move: SENSE.normal, sight: SENSE.normal, light: SENSE.normal, sound: SENSE.normal, door: 0, ds: 0 });
  }
  for (const ft of map.features) if (FEATURES[ft.kind]?.wall && !FEATURES[ft.kind].round) {
    const r = [ft.x, ft.y, ft.x + ft.w, ft.y + ft.h].map(px);
    for (const c of [[r[0], r[1], r[2], r[1]], [r[2], r[1], r[2], r[3]], [r[2], r[3], r[0], r[3]], [r[0], r[3], r[0], r[1]]]) walls.push({ levelKeys: ["floor0"], c, move: SENSE.normal, sight: SENSE.normal, light: SENSE.normal, sound: SENSE.normal, door: 0, ds: 0 });
  }
  for (const cl of map.cliffs ?? []) walls.push({ levelKeys: ["floor0"], c: seg(cl.x, cl.y, cl.dir), move: SENSE.normal, sight: SENSE.none, light: SENSE.none, sound: SENSE.none, door: 0, ds: 0, flags: { "wall-height": { bottom: cl.low, top: cl.high }, "eym-planet-map": { cliff: true } } });
  // Roofs: one overhead layer per floor that has roofs, revealed where a token can see beneath.
  const tiles = [];
  for (const [floor, src] of Object.entries(images.roofs ?? {})) {
    const band = byFloor.get(Number(floor)); if (!band || !src) continue;
    tiles.push({ levelKey: band.key, texture: { src }, x: 0, y: 0, width: W, height: H, elevation: band.elevation.top, occlusion: { modes: [OCCLUSION_VISION], alpha: 0 }, restrictions: { light: false, weather: true }, flags: { "eym-planet-map": { roofs: Number(floor) } } });
  }
  // Regions: terrain on the ground; open air; heights; hidden traps; stairs between floors.
  const regions = [], rect = (r) => ({ type: "rectangle", x: px(r.x), y: px(r.y), width: px(r.w), height: px(r.h), rotation: 0, hole: false });
  const region = (label, color, test, multiplier, extra = {}) => { const shapes = rectangles(columns, rows, test).map(rect); if (shapes.length) regions.push({ levelKeys: ["floor0"], name: label, color, shapes, behaviors: movementCost && multiplier ? [{ type: "modifyMovementCost", name: label, system: { difficulties: { walk: multiplier } } }] : [], visibility: 0, ...extra }); };
  const g = map.grid, outdoors = (i) => g.building[i] < 0;
  region("Difficult terrain", "#f2c94c", (i) => outdoors(i) && g.move[i] === MOVE.difficult, 2);
  region("Greater difficult terrain", "#f2994a", (i) => outdoors(i) && g.move[i] === MOVE.greater, 3);
  region("Hazardous terrain", "#eb5757", (i) => g.move[i] === MOVE.hazardous, 2);
  region("Deep water (swim)", "#2f80ed", (i) => g.move[i] === MOVE.swim && !g.void[i], null);
  region("Open air: a fall", "#000000", (i) => g.void[i] === 1, null);
  for (const v of [...new Set(g.levelFt)].filter((v) => v !== 0 && v > -60).sort((a, b) => a - b)) region(`Ground at ${v > 0 ? "+" : ""}${v} ft`, v > 0 ? "#9b51e0" : "#56ccf2", (i) => g.levelFt[i] === v && !g.void[i] && g.move[i] !== MOVE.swim, null);
  for (const t of map.traps ?? []) regions.push({ levelKeys: ["floor0"], name: `Hidden trap: ${FEATURES[t.kind].label}`, color: "#d0342c", shapes: [rect(t)], behaviors: [], visibility: 0, flags: { "eym-planet-map": { trap: t.hazard } } });
  for (const b of interiors) if (b.stairs) {
    const keys = b.floors.map((f) => byFloor.get(f.floor)?.key).filter(Boolean); if (keys.length < 2) continue;
    regions.push({ levelKeys: keys, name: `Stairs (${b.floors.map((f) => f.name).join(" – ")})`, color: "#27ae60", shapes: [rect(b.stairs)], elevation: { bottom: null, top: null }, behaviors: [{ type: "changeLevel", name: "Stairs", system: { movementActions: MOVEMENT_ACTIONS } }], visibility: 0 });
  }
  const lights = battleLights(map, interiors, { gridPx }).filter((l) => l.levelKeys.every((k) => byFloor.has(Number(k.slice(5)))));
  // Objects in the way of those lights: light-blocking walls where an object stands taller than a light near it.
  const occluders = battleOccluders(map, interiors).filter((o) => byFloor.has(o.floor));
  walls.push(...occluderWalls(occluders, lights, { gridPx }));
  scene.flags["eym-planet-map"].occluders = occluderRecord(occluders);
  return { scene, levels, walls, tiles, regions, lights, bands, occluders };
}
