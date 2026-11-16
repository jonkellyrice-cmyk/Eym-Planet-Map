// What stands in the way of light: every object on a battle map with a footprint and a height (interior
// furniture per floor; standing features outside), so Foundry's own lighting can cast its shadows.
//
// Foundry v14's walls (and the edges its light polygons are traced against) have no height: a wall on a
// Level blocks a light on that Level whatever their elevations. So an object becomes a light-blocking
// wall only where it would really shadow a light near it: its top is above that light. A table (2.5 ft)
// never shadows a candle burning at 4 ft; a wardrobe (7 ft), shelves or a pillar do. Each such wall also
// carries the object's true base and top in `flags["wall-height"]` ({bottom, top}, feet), the convention
// the elevation-aware wall modules read, and the scene keeps the full list (`flags["eym-planet-map"]
// .occluders`) for anything that wants to do better. Objects taller than eye height (6 ft) block sight
// too; nothing here blocks movement (the grid's terrain and regions already say how squares move).
// Pure.

import { FEATURES, MOVE } from "./eym-battle-settings.mjs";
import { FURNITURE } from "./eym-battle-interiors.mjs";
import { standHeightFt } from "./eym-battle-oblique.mjs";

export const EYE_HEIGHT_FT = 6;
/** Things that are the light, not in its way. */
const LIGHT_BODIES = new Set(["hearth", "campfire", "beacon", "brazier", "lava-channel", "fumarole", "elemental-vent", "crystal-cluster", "glowing-pool", "glowing-mushrooms", "sacred-spring", "ley-nexus", "magic-circle", "teleport-circle", "planar-rift", "ward-stone", "rune-door", "levitation-disc"]);
/** Height of a floor's own level above the ground floor's (feet). */
export const floorBase = (floor) => (floor < 0 ? -10 * -floor : 10 * floor);

/** Every object with a height: { levelKey, floor, kind, label, x, y, w, h (squares), round, base, heightFt, top (feet) }. */
export function battleOccluders(map, interiors) {
  const out = [], { columns } = map.spec, g = map.grid;
  const levelAt = (x, y) => g.levelFt[Math.max(0, Math.min(g.levelFt.length - 1, Math.floor(y) * columns + Math.floor(x)))] ?? 0;
  for (const f of map.features) {
    const def = FEATURES[f.kind]; if (!def || def.wall || def.hidden || LIGHT_BODIES.has(f.kind)) continue; // walls are walls already
    if (def.high && def.move === MOVE.normal) continue; // ground to stand on (a rise), not a thing in the way
    const heightFt = standHeightFt(f.kind, def); if (!(heightFt > 0)) continue;
    const base = levelAt(f.x + f.w / 2, f.y + f.h / 2);
    out.push({ levelKey: "floor0", floor: 0, kind: f.kind, label: def.label, x: f.x, y: f.y, w: f.w, h: f.h, round: Boolean(def.round || ["round", "trunk", "crystal"].includes(def.shape)), base, heightFt, top: base + heightFt });
  }
  for (const b of interiors) {
    const ground = g.levelFt[Math.max(0, b.rect.y0) * columns + Math.max(0, b.rect.x0)] ?? 0;
    for (const fl of b.floors) for (const it of fl.furniture) {
      const def = FURNITURE[it.kind], heightFt = def?.heightFt ?? 0; if (!(heightFt > 0) || LIGHT_BODIES.has(it.kind)) continue;
      const base = ground + floorBase(fl.floor);
      out.push({ levelKey: `floor${fl.floor}`, floor: fl.floor, kind: it.kind, label: def.label, x: it.x, y: it.y, w: it.w, h: it.h, round: it.kind === "pillar", base, heightFt, top: base + heightFt, building: b.id });
    }
  }
  return out;
}

/** Does a light (pixels, elevation in feet) sit inside an object's footprint? */
const inside = (o, l, gridPx) => l.x >= o.x * gridPx && l.x <= (o.x + o.w) * gridPx && l.y >= o.y * gridPx && l.y <= (o.y + o.h) * gridPx;

/**
 * Whether each object shadows a light near it: a light on its Level, whose reach (dim radius, feet) gets
 * to the object, burning lower than the object's top. Returns the occluders with `shadows: n` (how many).
 */
export function shadowingOccluders(occluders, lights, { gridPx }) {
  return occluders.map((o) => {
    const cx = (o.x + o.w / 2) * gridPx, cy = (o.y + o.h / 2) * gridPx, extent = (Math.hypot(o.w, o.h) / 2) * gridPx;
    const shadows = lights.filter((l) => l.levelKeys.includes(o.levelKey) && !inside(o, l, gridPx) && l.elevation < o.top
      && Math.hypot(l.x - cx, l.y - cy) <= ((l.config.dim ?? 0) / 5) * gridPx + extent).length;
    return { ...o, shadows };
  });
}

/** An object's outline as wall segments (pixels): its rectangle drawn a little in, or an octagon if round. */
export function occluderOutline(o, gridPx) {
  const px = (v) => Math.round(v * gridPx), inset = 0.08;
  if (o.round) {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2, rx = o.w / 2 - inset, ry = o.h / 2 - inset;
    const pts = Array.from({ length: 8 }, (_, k) => [px(cx + rx * Math.cos((Math.PI / 4) * k + Math.PI / 8)), px(cy + ry * Math.sin((Math.PI / 4) * k + Math.PI / 8))]);
    return pts.map((p, k) => [...p, ...pts[(k + 1) % 8]]);
  }
  const [x0, y0, x1, y1] = [px(o.x + inset), px(o.y + inset), px(o.x + o.w - inset), px(o.y + o.h - inset)];
  return [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
}

/** Foundry Wall data for the objects that shadow a light: light (and, if tall, sight) only; never movement or sound. */
export function occluderWalls(occluders, lights, { gridPx }) {
  const walls = [];
  for (const o of shadowingOccluders(occluders, lights, { gridPx })) {
    if (!o.shadows) continue;
    const sight = o.heightFt >= EYE_HEIGHT_FT ? 20 : 0;
    for (const c of occluderOutline(o, gridPx)) walls.push({ levelKeys: [o.levelKey], c, move: 0, sight, light: 20, sound: 0, door: 0, ds: 0, flags: { "wall-height": { bottom: o.base, top: o.top }, "eym-planet-map": { occluder: o.kind, heightFt: o.heightFt } } });
  }
  return walls;
}

/** A compact record of every object's footprint and height, for the scene's flags. */
export const occluderRecord = (occluders) => occluders.map((o) => ({ level: o.levelKey, kind: o.kind, x: o.x, y: o.y, w: o.w, h: o.h, round: o.round, bottom: o.base, top: o.top }));
