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
// Pure: returns the documents to create; the app creates the Levels first, then everything else with
// the new Levels' ids. Field names follow Foundry v14's data schemas (Level, Wall, Tile, Region).

import { FEATURES, MOVE } from "./eym-battle-settings.mjs";
import { mapFloors } from "./eym-battle-interiors.mjs";

export const OCCLUSION_VISION = 8;
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
      const c = seg(wl.x, wl.y, wl.dir); if (c.some((v, k) => v < 0 || v > (k % 2 ? H : W))) continue;
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
  return { scene, levels, walls, tiles, regions, bands };
}
