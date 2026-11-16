// Inside the buildings of a battle map: floors, rooms, interior walls and doors, windows, stairs and
// furniture, laid out by rule and pinned to each building (the same building always has the same rooms).
//
// Every building gets a ground floor; taller ones get upper floors; some get a basement (houses now and
// then, temples a crypt, mausoleums always). Rooms come from splitting the footprint (each split gets a
// door, so every room can be reached); stairs take the same squares on every floor of a building, so the
// Foundry scene can join the floors there. Furniture is chosen by the room's use and stands against the
// walls, never in a doorway or on the stairs.

const hash = (text) => { let h = 2166136261; for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619); h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const edgeKey = (x, y, dir) => `${x},${y},${dir}`;
import { shade } from "./eym-battle-oblique.mjs";
import { chamferSegment, doorEdge, footprintShapes, shapeEdges } from "./eym-battle-buildings.mjs";

/** Furniture: footprint in squares, PF2e movement and cover, how it looks. */
export const FURNITURE = Object.freeze({
  table: { label: "table", size: [2, 1], heightFt: 2.5, move: "difficult", cover: 1, color: "#8a5e34", words: "a wooden table with stools" },
  counter: { label: "counter", size: [3, 1], heightFt: 3.5, move: "impassable", cover: 2, color: "#6e4a2a", words: "a long counter" },
  hearth: { label: "hearth", size: [2, 1], heightFt: 4, move: "hazardous", cover: 1, color: "#a8462a", hazard: "fire: 1d6 fire on entering", words: "a stone hearth with a fire" },
  bed: { label: "bed", size: [1, 2], heightFt: 2, move: "difficult", cover: 1, color: "#9a6a8a", words: "a bed" },
  chest: { label: "chest", size: [1, 1], heightFt: 2, move: "difficult", cover: 1, color: "#7a5532", words: "a chest" },
  wardrobe: { label: "wardrobe", size: [1, 1], heightFt: 7, move: "impassable", cover: 2, color: "#5e4028", words: "a tall wardrobe" },
  shelves: { label: "shelves", size: [3, 1], heightFt: 7, move: "impassable", cover: 2, color: "#6b4e30", words: "shelves of goods" },
  barrels: { label: "barrels", size: [1, 1], heightFt: 3.5, move: "difficult", cover: 1, color: "#7a5532", words: "barrels" },
  crates: { label: "crates", size: [1, 1], heightFt: 5, move: "climb", cover: 2, color: "#9a7448", words: "stacked crates" },
  "wine-rack": { label: "wine rack", size: [2, 1], heightFt: 6, move: "impassable", cover: 2, color: "#5a2a2a", words: "racks of wine" },
  desk: { label: "desk", size: [2, 1], heightFt: 2.5, move: "difficult", cover: 1, color: "#7a5a3a", words: "a writing desk" },
  pew: { label: "pew", size: [3, 1], heightFt: 3, move: "difficult", cover: 1, color: "#6e4a2a", words: "a row of pews" },
  altar: { label: "altar", size: [2, 1], heightFt: 3.5, move: "impassable", cover: 2, color: "#d8d0c0", words: "an altar" },
  sarcophagus: { label: "sarcophagus", size: [1, 2], heightFt: 3, move: "impassable", cover: 2, color: "#a8a49a", words: "a stone sarcophagus" },
  pillar: { label: "pillar", size: [1, 1], heightFt: 10, move: "impassable", cover: 2, color: "#9c968a", words: "a pillar" },
  rug: { label: "rug", size: [2, 2], heightFt: 0, move: "normal", cover: 0, color: "#8a3a3a", words: "a woven rug" },
});

/** What each kind of room holds (picked in order, as many as fit). */
const ROOM_KIT = Object.freeze({
  "common room": ["table", "table", "hearth", "barrels"],
  shop: ["counter", "shelves", "crates"],
  kitchen: ["hearth", "table", "barrels"],
  storeroom: ["crates", "barrels", "shelves", "crates"],
  bedroom: ["bed", "chest", "wardrobe", "rug"],
  study: ["desk", "shelves", "rug"],
  cellar: ["barrels", "wine-rack", "crates", "barrels"],
  nave: ["altar", "pew", "pew", "pew", "pillar", "pillar"],
  vestry: ["chest", "desk", "shelves"],
  crypt: ["sarcophagus", "sarcophagus", "sarcophagus", "pillar"],
  hall: ["table", "rug", "chest"],
});

/** Floors a building has: [-1] basement if any, 0 ground, 1.. upper. */
export function buildingFloors(b, key) {
  const u = hash(`${key}|basement`), label = b.label ?? "building";
  const upper = label === "temple" || label === "mausoleum" || label === "rock-cut dwelling" ? 0 : Math.max(0, (b.storeys ?? 1) - 1);
  const basement = label === "mausoleum" ? true : label === "temple" ? u < 0.6 : label === "rock-cut dwelling" ? false : u < 0.35;
  return [...(basement ? [-1] : []), 0, ...Array.from({ length: upper }, (_, k) => k + 1)];
}

/** Split a rectangle into rooms (inclusive square coords), each split with a door in it. */
function splitRooms(rect, key, minSide = 2, maxSide = 4, depth = 0) {
  const w = rect.x1 - rect.x0 + 1, h = rect.y1 - rect.y0 + 1;
  if ((w <= maxSide && h <= maxSide) || depth > 5 || (w < 2 * minSide && h < 2 * minSide)) return { rooms: [rect], walls: [] };
  const vertical = w >= h ? w >= 2 * minSide : !(h >= 2 * minSide);
  const len = vertical ? w : h, cut = minSide + Math.floor(hash(`${key}|cut`) * (len - 2 * minSide + 1));
  // The wall runs along the cut; one square of it is a door.
  const walls = [], span = vertical ? [rect.y0, rect.y1] : [rect.x0, rect.x1], door = span[0] + Math.floor(hash(`${key}|door`) * (span[1] - span[0] + 1));
  for (let t = span[0]; t <= span[1]; t += 1) walls.push(vertical ? { x: rect.x0 + cut - 1, y: t, dir: "e", door: t === door } : { x: t, y: rect.y0 + cut - 1, dir: "s", door: t === door });
  const [a, b] = vertical ? [{ ...rect, x1: rect.x0 + cut - 1 }, { ...rect, x0: rect.x0 + cut }] : [{ ...rect, y1: rect.y0 + cut - 1 }, { ...rect, y0: rect.y0 + cut }];
  const ra = splitRooms(a, `${key}a`, minSide, maxSide, depth + 1), rb = splitRooms(b, `${key}b`, minSide, maxSide, depth + 1);
  return { rooms: [...ra.rooms, ...rb.rooms], walls: [...walls, ...ra.walls, ...rb.walls] };
}

/** The use of a room on a floor of a building. */
function roomUse(b, floor, index, count, key) {
  const label = b.label ?? "building";
  if (label === "temple") return floor < 0 ? "crypt" : index === 0 ? "nave" : "vestry";
  if (label === "mausoleum") return floor < 0 ? "crypt" : "hall";
  if (floor < 0) return "cellar";
  if (floor > 0) return hash(`${key}|use`) < 0.7 ? "bedroom" : "study";
  if (index === 0) return hash(`${key}|shop`) < 0.4 ? "shop" : "common room";
  return ["kitchen", "storeroom", "bedroom"][Math.floor(hash(`${key}|use`) * 3)];
}

/**
 * Interiors for every building on the map. Returns, per building, its floors with rooms, walls (the
 * outer walls with doors and windows, and the inner ones), stairs and furniture, in map squares.
 */
export function buildInteriors(map) {
  const out = [];
  for (const b of map.buildings) {
    const bKey = `${map.version}|interior|${map.anchor.join(",")}|${b.gx0 ?? b.x0 + map.origin[0]},${b.gy0 ?? b.y0 + map.origin[1]}`;
    const rect = { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, shape = { rects: b.rects ?? [rect], chamfers: b.chamfers ?? [] }, main = shape.rects[0];
    const cut = new Set(shape.chamfers.map((c) => `${c.x},${c.y}`)), w = main.x1 - main.x0 + 1, h = main.y1 - main.y0 + 1;
    const floors = buildingFloors(b, bKey), multi = floors.length > 1;
    // Stairs: a 1×2 flight in a corner of the main block (not a cut corner), the same on every floor.
    const vertical = h >= w, sw = vertical ? 1 : 2, sh = vertical ? 2 : 1;
    const corners = [0, 1, 2, 3].map((k) => (Math.floor(hash(`${bKey}|stair`) * 4) + k) % 4).map((corner) => ({ x: corner % 2 ? main.x1 - sw + 1 : main.x0, y: corner >= 2 ? main.y1 - sh + 1 : main.y0, w: sw, h: sh }));
    const clearOfCuts = (st) => { for (let y = st.y; y < st.y + st.h; y += 1) for (let x = st.x; x < st.x + st.w; x += 1) if (cut.has(`${x},${y}`)) return false; return true; };
    const stairs = multi && w >= 2 && h >= 2 ? corners.find(clearOfCuts) ?? null : null;
    const onStairs = (x, y) => stairs && x >= stairs.x && x < stairs.x + stairs.w && y >= stairs.y && y < stairs.y + stairs.h;
    const building = { id: b.id, label: b.label ?? "building", rect, rects: shape.rects, chamfers: shape.chamfers, floors: [], stairs };
    const edges = shapeEdges(shape), door0 = b.doorEdge ?? doorEdge(shape, b.door ?? "s");
    for (const floor of floors) {
      const fKey = `${bKey}|floor|${floor}`;
      // Rooms: each block of the shape split on its own; a wall with a door where an L's two wings meet.
      const rooms = [], inner = [];
      for (const [k, r] of shape.rects.entries()) { const split = b.label === "temple" && floor === 0 ? { rooms: [r], walls: [] } : splitRooms(r, `${fKey}|block|${k}`, 2, floor < 0 ? 5 : 4); rooms.push(...split.rooms); inner.push(...split.walls); }
      for (let k = 1; k < shape.rects.length; k += 1) {
        const A = shape.rects[0], B = shape.rects[k], joins = [];
        for (let y = B.y0; y <= B.y1; y += 1) for (let x = B.x0; x <= B.x1; x += 1) for (const [dx, dy, dir] of [[1, 0, "e"], [-1, 0, "e"], [0, 1, "s"], [0, -1, "s"]]) {
          const nx = x + dx, ny = y + dy; if (nx < A.x0 || nx > A.x1 || ny < A.y0 || ny > A.y1) continue;
          joins.push(dir === "e" ? { x: Math.min(x, nx), y, dir } : { x, y: Math.min(y, ny), dir });
        }
        const doorAt = Math.floor(hash(`${fKey}|join|${k}`) * joins.length);
        joins.forEach((j, t) => inner.push({ ...j, door: t === doorAt }));
      }
      // Outer walls follow the outline: the street door on the ground floor, windows along the walls above
      // ground, and a diagonal wall across each cut corner.
      const walls = [];
      edges.filter((e) => !e.chamfer).forEach((e, k) => {
        const door = floor === 0 && door0 && e.x === door0.x && e.y === door0.y && e.dir === door0.dir;
        walls.push({ x: e.x, y: e.y, dir: e.dir, door, window: !door && floor >= 0 && b.label !== "mausoleum" && k % 3 === 1, outer: true });
      });
      for (const c of shape.chamfers) walls.push({ diag: chamferSegment(c), door: false, window: floor >= 0 && b.label !== "mausoleum", outer: true });
      for (const wl of inner) walls.push({ ...wl, window: false, outer: false });
      // Squares next to a door (either side) stay clear.
      const nearDoor = new Set();
      for (const wl of walls) if (wl.door && !wl.diag) for (const [x, y] of wl.dir === "e" ? [[wl.x, wl.y], [wl.x + 1, wl.y]] : [[wl.x, wl.y], [wl.x, wl.y + 1]]) nearDoor.add(`${x},${y}`);
      const taken = new Set(cut), furniture = [];
      const roomList = rooms.map((r, index) => ({ ...r, use: roomUse(b, floor, index, rooms.length, `${fKey}|room|${index}`) }));
      for (const [index, room] of roomList.entries()) {
        for (const [k, kind] of (ROOM_KIT[room.use] ?? []).entries()) {
          const def = FURNITURE[kind], spots = [];
          for (const rot of [false, true]) {
            const [fw, fh] = rot ? [def.size[1], def.size[0]] : def.size;
            for (let y = room.y0; y <= room.y1 - fh + 1; y += 1) for (let x = room.x0; x <= room.x1 - fw + 1; x += 1) {
              const touchesWall = x === room.x0 || y === room.y0 || x + fw - 1 === room.x1 || y + fh - 1 === room.y1;
              if (!touchesWall && kind !== "rug" && kind !== "pew" && kind !== "pillar" && kind !== "table") continue;
              let ok = true; for (let dy = 0; dy < fh && ok; dy += 1) for (let dx = 0; dx < fw && ok; dx += 1) { const p = `${x + dx},${y + dy}`; if (taken.has(p) || nearDoor.has(p) || onStairs(x + dx, y + dy) || x + dx < 0 || y + dy < 0 || x + dx >= map.spec.columns || y + dy >= map.spec.rows) ok = false; }
              if (ok) spots.push({ x, y, w: fw, h: fh });
            }
          }
          if (!spots.length) continue;
          // Leave room to move: at most half of a room is furniture.
          const area = (room.x1 - room.x0 + 1) * (room.y1 - room.y0 + 1), used = furniture.filter((f) => f.room === index).reduce((s, f) => s + f.w * f.h, 0);
          const spot = spots[Math.floor(hash(`${fKey}|${index}|${k}|${kind}`) * spots.length)]; if (used + spot.w * spot.h > area / 2 && kind !== "rug") continue;
          for (let dy = 0; dy < spot.h; dy += 1) for (let dx = 0; dx < spot.w; dx += 1) taken.add(`${spot.x + dx},${spot.y + dy}`);
          furniture.push({ kind, ...spot, room: index, ...def });
        }
      }
      building.floors.push({ floor, name: floor < 0 ? "basement" : floor === 0 ? "ground floor" : floor === 1 ? "upper floor" : `floor ${floor + 1}`, rooms: roomList, walls, furniture });
    }
    out.push(building);
  }
  return out;
}

/** The floors present anywhere on the map, lowest first. */
export const mapFloors = (interiors) => [...new Set(interiors.flatMap((b) => b.floors.map((f) => f.floor)))].sort((a, b) => a - b);

// ---------------------------------------------------------------- drawing floors

const FLOOR_FILL = Object.freeze({ "common room": "#9a7448", shop: "#9a7448", kitchen: "#8a7a66", storeroom: "#8a7a66", bedroom: "#a07a52", study: "#a07a52", cellar: "#6e665c", nave: "#c8c0b0", vestry: "#b8ae9a", crypt: "#5e5a55", hall: "#b8ae9a" });

/** One building floor's drawing (rooms, walls, doors, windows, stairs, furniture), in square units. */
export function floorPlanSvg(building, floor) {
  const f = building.floors.find((x) => x.floor === floor); if (!f) return "";
  // Everything inside is cut to the building's true outline (an L, cut corners).
  const clipId = `eym-bld-${building.id}-${floor < 0 ? "b" : floor}`, parts = [`<clipPath id="${clipId}">${footprintShapes({ ...building.rect, rects: building.rects, chamfers: building.chamfers })}</clipPath><g clip-path="url(#${clipId})">`];
  for (const r of f.rooms) {
    // Three-quarter view inside too: each room's north wall shows its face, a band along the top of the room.
    const fill = FLOOR_FILL[r.use] ?? "#9a7448", wallFace = f.floor < 0 ? "#6a6058" : "#cdbb98";
    parts.push(`<rect x="${r.x0}" y="${r.y0}" width="${r.x1 - r.x0 + 1}" height="${r.y1 - r.y0 + 1}" fill="${fill}"/>`);
    parts.push(`<rect x="${r.x0}" y="${r.y0}" width="${r.x1 - r.x0 + 1}" height="0.42" fill="${wallFace}"/><line x1="${r.x0}" y1="${r.y0 + 0.42}" x2="${r.x1 + 1}" y2="${r.y0 + 0.42}" stroke="${shade(wallFace, -0.4)}" stroke-width="0.04"/>`);
  }
  const s = building.stairs;
  if (s) { parts.push(`<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" fill="#d6c7a8"/>`); const n = 5; for (let k = 1; k < n; k += 1) parts.push(s.w > s.h ? `<line x1="${s.x + (k * s.w) / n}" y1="${s.y}" x2="${s.x + (k * s.w) / n}" y2="${s.y + s.h}" stroke="#6e604a" stroke-width="0.05"/>` : `<line x1="${s.x}" y1="${s.y + (k * s.h) / n}" x2="${s.x + s.w}" y2="${s.y + (k * s.h) / n}" stroke="#6e604a" stroke-width="0.05"/>`); }
  for (const it of [...f.furniture].sort((a, b) => a.y + a.h - (b.y + b.h))) {
    if (it.kind === "rug") { parts.push(`<rect x="${it.x + 0.15}" y="${it.y + 0.15}" width="${it.w - 0.3}" height="${it.h - 0.3}" fill="${it.color}" fill-opacity="0.8"/>`); continue; }
    // Furniture shows its front: tall pieces a tall side, low pieces a low one.
    const tall = ["wardrobe", "shelves", "pillar", "crates", "counter", "wine-rack"].includes(it.kind), r = tall ? 0.55 : 0.2, side = shade(it.color, -0.4);
    if (it.kind === "pillar") { parts.push(`<rect x="${it.x + 0.2}" y="${it.y + 0.5 - r}" width="0.6" height="${r}" fill="${side}"/><ellipse cx="${it.x + 0.5}" cy="${it.y + 0.5}" rx="0.3" ry="0.15" fill="${side}"/><ellipse cx="${it.x + 0.5}" cy="${it.y + 0.5 - r}" rx="0.3" ry="0.18" fill="${it.color}"/>`); continue; }
    parts.push(`<rect x="${it.x + 0.1}" y="${it.y + it.h - 0.1 - r}" width="${it.w - 0.2}" height="${r}" fill="${side}"/><rect x="${it.x + 0.1}" y="${it.y + 0.1 - r}" width="${it.w - 0.2}" height="${it.h - 0.2}" fill="${it.color}" stroke="#2a1d12" stroke-width="0.04"/>`);
  }
  parts.push("</g>");
  for (const wl of f.walls) {
    const [a, b, c, d] = wl.diag ?? (wl.dir === "e" ? [wl.x + 1, wl.y, wl.x + 1, wl.y + 1] : [wl.x, wl.y + 1, wl.x + 1, wl.y + 1]);
    if (wl.door) parts.push(`<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="#d9b77a" stroke-width="0.14"/>`);
    else parts.push(`<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="#241a12" stroke-width="${wl.outer ? 0.2 : 0.12}" stroke-linecap="square"/>${wl.window ? `<line x1="${a + (c - a) * 0.25}" y1="${b + (d - b) * 0.25}" x2="${a + (c - a) * 0.75}" y2="${b + (d - b) * 0.75}" stroke="#9fd0f0" stroke-width="0.1"/>` : ""}`);
  }
  return parts.join("");
}

/**
 * A whole floor of the map: for the ground floor, the outdoor layout with every building opened up (no
 * roofs); above it, only the buildings that reach that floor (everything else transparent, or "fill" for
 * the painter); below ground, only the basements, everything else solid dark.
 */
export function floorSvg(map, interiors, floor, { outdoorSvg = "", fill = null, gridPx = map.spec.gridPx } = {}) {
  const { columns, rows } = map.spec, W = columns * gridPx, H = rows * gridPx;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${columns} ${rows}">`];
  if (floor < 0) parts.push(`<rect width="${columns}" height="${rows}" fill="#141210"/>`);
  else if (floor === 0 && outdoorSvg) parts.push(outdoorSvg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, ""));
  else if (fill) parts.push(`<rect width="${columns}" height="${rows}" fill="${fill}"/>`);
  for (const b of interiors) parts.push(floorPlanSvg(b, floor));
  parts.push("</svg>");
  return parts.join("");
}

/** The roofs alone (transparent elsewhere), cut from an outdoor drawing: one overhead layer for a floor. */
export function roofMaskSvg(map, interiors, floor, gridPx = map.spec.gridPx) {
  const { columns, rows } = map.spec, parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${columns * gridPx}" height="${rows * gridPx}" viewBox="0 0 ${columns} ${rows}">`];
  for (const b of interiors) { const top = Math.max(...b.floors.map((f) => f.floor)); if (floor === 0 || top === floor) parts.push(footprintShapes({ ...b.rect, rects: b.rects, chamfers: b.chamfers })); }
  parts.push("</svg>");
  return parts.join("");
}

/** The painter's brief for one floor's interiors. */
export function interiorArtDirection(map, interiors, floor, { architecture = "" } = {}) {
  const rooms = interiors.flatMap((b) => (b.floors.find((f) => f.floor === floor)?.rooms ?? []).map((r) => r.use)), kinds = [...new Set(rooms)];
  const where = floor < 0 ? "the basements and crypts below the buildings (everything outside them is solid earth and rock, painted black)" : floor === 0 ? "the ground floors of the buildings, seen from above with the roofs taken off; the outdoor ground around them is already painted and must stay exactly as it is" : "the upper floors of the buildings, seen from above with the roofs taken off (only the building footprints matter; the grey outside them will be cut away)";
  return [
    `Paint a fantasy battle map interior in three-quarter top-down (oblique) perspective, as classic 2D role-playing games draw their houses: ${where}. Floors are seen from above; each room's back (north) wall shows its face with its height, and furniture shows its top and front side (tall wardrobes and shelves tall, tables and beds low), so everything reads as solid. Never draw furniture as flat symbols.`,
    `The attached reference is the authoritative layout: keep every wall, door (gold), window (pale blue), stair and piece of furniture exactly where it is and the same size. Rooms here: ${kinds.join(", ")}. Furniture colours in the reference show what each piece is (tables, beds, hearths, shelves, barrels, crates, chests, pews, altars, sarcophagi, pillars, rugs).`,
    `Floors of wood planks or flagstones as fits each room, thick walls drawn clearly so the rooms read at a glance, soft interior lighting, no roofs.`,
    ...(architecture ? [architecture] : []),
    `Draw no grid, text, labels, tokens or people. Fill the image to the edges at ${map.spec.widthPx}×${map.spec.heightPx} pixels.`,
  ].join("\n\n");
}

/** White where buildings have the given floor (for cutting a painting to their footprints). */
export function footprintMaskSvg(map, interiors, floor, gridPx = map.spec.gridPx) {
  const { columns, rows } = map.spec, parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${columns * gridPx}" height="${rows * gridPx}" viewBox="0 0 ${columns} ${rows}">`];
  for (const b of interiors) if (b.floors.some((f) => f.floor === floor)) parts.push(footprintShapes({ ...b.rect, rects: b.rects, chamfers: b.chamfers }));
  parts.push("</svg>");
  return parts.join("");
}
