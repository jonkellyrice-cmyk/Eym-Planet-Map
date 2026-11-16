// Building styles: how a people builds, as numbers a renderer can use (the architecture dossiers carry the
// same thing as prose for the AI painter). A style is a palette and a few choices from shared kits —
// wall (plaster-and-timber, brick, coursed stone), roof (tile, slate, flat), windows, doors, chimneys,
// street paving, street lamps — so most peoples are a new combination, not new art. Each style may be
// linked to places; a dossier can name one. A style can also shape the buildings (storeys, overhanging
// upper floors, skybridges, lifts), so it is an input to the map: the module and the map server build the
// map with the same style and so get the same geometry. Pure.

import { greatCircleKm } from "./eym-surface.mjs";

export const STYLE_KITS = Object.freeze({
  wall: ["timbered", "brick", "stone"],
  roof: ["tile", "slate", "flat"],
  windows: ["casement", "sash"],
  chimneys: ["none", "brick"],
  lamps: ["none", "lantern-post", "arc-lamp"],
});

export const BUILDING_STYLES = Object.freeze({
  default: {
    id: "default", label: "Generic (timbered, tiled)",
    wall: "timbered", roof: "tile", windows: "casement", chimneys: "none", lamps: "none",
    palette: { wall: "#e2d4b6", mortar: "#cbbd9e", timber: "#5e3e26", trim: "#6e4a2a", roof: "#b8583c", door: "#7a5532", metal: "#7a6a58", stone: "#c8bfac", templeRoof: "#5f7f9a" },
    street: null,
    words: "",
  },
  dree: {
    id: "dree", label: "Dree (magic-punk Victorian)",
    // Terraced brick, slate, sash windows under stone lintels, painted doors with fanlights, chimney
    // stacks with copper pots and pipework, copper and brass fittings gone partly to verdigris, granite
    // setts, and arc-lamps on iron posts burning with bound crystal light.
    wall: "brick", roof: "slate", windows: "sash", chimneys: "brick", lamps: "arc-lamp",
    // Shape: top-heavy. Houses of two and three storeys whose upper floors step out over the street
    // (jetties), mostly plain rectangles so they can; skybridges between upper floors; lifts in the tallest.
    storeys: [0.1, 0.5, 0.4], rectangular: 0.8, jetty: true, skybridges: 3, lifts: true,
    // Packed tight: narrow terraced houses (3–4 squares a side) back to back in blocks of 5–7 squares;
    // streets mostly 2–3 abreast, now and then 4; the gaps between houses are back alleys; few squares,
    // gardens or street trees.
    // Visible machinery: boilers bolted to upper-floor walls over glowing fire crystals, rooftop tanks,
    // crystal condensers and vent stacks, pipes slung across the lanes; inside, boilers, pipework,
    // geared presses and aether coils in the rooms.
    machinery: { wall: 0.7, second: 0.3, roof: 0.6, pipes: 5 },
    gizmos: { kitchen: ["crystal-boiler"], "common room": ["pipework"], shop: ["gear-press", "pipework"], study: ["aether-coil"], cellar: ["crystal-boiler", "pipework"], storeroom: ["pipework"], bedroom: ["pipework"] },
    dense: { period: [9, 9], lots: [3, 4], streets: [[0.15, 4], [0.55, 3], [1, 2]], squares: 0.04, build: 1, trees: 0.01 },
    palette: { wall: "#8c4a34", mortar: "#b9a88e", timber: "#3c2a20", trim: "#ece4d2", roof: "#4c535c", door: "#2f4a3c", metal: "#b87333", verdigris: "#5f9e8c", brass: "#c9a24a", stone: "#c9c0ae", templeRoof: "#5f9e8c", lamp: "#cfeaff" },
    street: { "cobbled street": "granite setts", "paved square": "dressed granite" },
    places: [{ name: "Dree", lat: -6.79, lon: 0.412, radiusKm: 8 }],
    words: "Dree: magic-punk Victorian city in the manner of steampunk London — terraced red-brown brick houses two and three storeys high, grey slate roofs, tall white-framed sash windows under pale stone lintels, painted doors with fanlights, chimney stacks with copper pots and copper pipework, brass and copper fittings with verdigris, dark granite setts, iron lamp posts with cold blue-white arcane crystal lamps; top-heavy houses whose upper storeys overhang the street on heavy beams and brass brackets, an engineered instability that should not stand but does; enclosed skybridges between upper floors on brass trusses; narrow terraced houses packed tight along cobbled streets two or three people wide; machinery out in the open — copper boilers bolted to upper-floor walls like units in a window, piped into the building, with glowing fire crystals beneath, rooftop water tanks, crystal condensers and vent stacks, copper pipes slung across the lanes, and inside boilers, pipework, geared presses and crackling aether coils; homes also built into the faces of rock; carts on the street, nothing flying",
  },
});
export const STYLE_IDS = Object.freeze(Object.keys(BUILDING_STYLES));

/** A style by id (unknown → default). */
export const buildingStyle = (id) => BUILDING_STYLES[id] ?? BUILDING_STYLES.default;

/** The style linked to a place, the nearest link that covers it; or default. */
export function styleForPlace(lat, lon) {
  let best = null;
  for (const s of Object.values(BUILDING_STYLES)) for (const p of s.places ?? []) {
    const d = greatCircleKm([lat, lon], [p.lat, p.lon]); if (d <= p.radiusKm && (!best || d < best.d)) best = { id: s.id, d };
  }
  return best?.id ?? "default";
}

/**
 * The street furniture a style adds, from the map alone (deterministic, the same on both sides): lamp
 * posts on street squares beside a building front, every few squares. Squares; decorative (no movement
 * or cover change), each a Foundry light.
 */
export function styleStreetLamps(map, styleId) {
  const style = buildingStyle(styleId); if (style.lamps === "none") return [];
  const { columns, rows } = map.spec, g = map.grid, out = [], taken = new Set();
  const street = (x, y) => x >= 0 && y >= 0 && x < columns && y < rows && ["cobbled street", "paved square"].includes(String(g.ground[y * columns + x]).replace(/ \(mud\)$/, "")) && g.building[y * columns + x] < 0 && g.feature[y * columns + x] < 0 && !g.overUnder?.[y * columns + x];
  const built = (x, y) => x >= 0 && y >= 0 && x < columns && y < rows && g.building[y * columns + x] >= 0;
  for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) {
    if (!street(x, y) || (x * 3 + y * 5) % 4 !== 0) continue;
    const side = [[0, -1], [0, 1], [-1, 0], [1, 0]].find(([dx, dy]) => built(x + dx, y + dy)); if (!side) continue;
    if ([...taken].some((k) => { const [a, b] = k.split(",").map(Number); return Math.abs(a - x) + Math.abs(b - y) < 4; })) continue;
    taken.add(`${x},${y}`);
    out.push({ kind: style.lamps, x: x + 0.5 + side[0] * 0.32, y: y + 0.5 + side[1] * 0.32, heightFt: 9 });
  }
  return out;
}

const hashUnit = (text) => { let h = 2166136261; for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619); h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
export const ROOF_MACHINES = Object.freeze(["tank", "condenser", "vents"]);

/**
 * The machinery a style bolts onto its buildings, from the map alone (deterministic; the renderer draws
 * it and the scene lights it): `wall` boilers on the visible front of an upper storey (square column x,
 * the storey's floor), `roof` machines on the top storey's roof (square), and `pipes` slung across a lane
 * between two buildings (a row, from x0 to x1, 15 ft up). Decorative: none changes movement or cover.
 */
export function styleMachinery(map, styleId) {
  const style = buildingStyle(styleId), out = { wall: [], roof: [], pipes: [] }, m = style.machinery; if (!m) return out;
  const { columns, rows } = map.spec, g = map.grid, key = `${map.key}|machinery|${style.id}`;
  const plain = map.buildings.filter((b) => b.label === "house" && (b.rects?.length ?? 1) === 1 && !(b.chamfers?.length));
  const rectOf = (b, f) => (f > 0 && b.floorRects?.[f]) || { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 };
  for (const b of plain) {
    const storeys = b.storeys ?? 1, top = rectOf(b, storeys - 1), level = g.levelFt[Math.max(0, Math.min(rows - 1, b.y0)) * columns + Math.max(0, Math.min(columns - 1, b.x0))] ?? 0;
    // Wall boilers: on an upper storey whose front shows (it stands on the top outline's south edge).
    const slots = [];
    for (let f = 1; f < storeys; f += 1) { const r = rectOf(b, f); if (r.y1 !== top.y1) continue; for (let x = Math.max(0, r.x0); x <= Math.min(columns - 1, r.x1); x += 1) slots.push({ f, x }); }
    const pick = (salt) => slots[Math.floor(hashUnit(`${key}|${b.id}|${salt}`) * slots.length)];
    if (slots.length && hashUnit(`${key}|${b.id}|wall`) < m.wall) {
      const a = pick("a"); out.wall.push({ kind: "wall-boiler", building: b.id, floor: a.f, x: a.x, y: top.y1, elevationFt: level + 10 * a.f + 2 });
      const c = pick("c"); if (hashUnit(`${key}|${b.id}|second`) < m.second && (c.x !== a.x || c.f !== a.f) && Math.abs(c.x - a.x) > 0) out.wall.push({ kind: "wall-boiler", building: b.id, floor: c.f, x: c.x, y: top.y1, elevationFt: level + 10 * c.f + 2 });
    }
    // A roof machine on the middle of the ridge (the chimneys stand towards its ends).
    if (hashUnit(`${key}|${b.id}|roof`) < m.roof && top.x1 - top.x0 >= 1) {
      const kind = ROOF_MACHINES[Math.floor(hashUnit(`${key}|${b.id}|roofkind`) * ROOF_MACHINES.length)];
      out.roof.push({ kind, building: b.id, x: (top.x0 + top.x1 + 1) / 2, y: top.y0 + (top.y1 - top.y0 + 1) * 0.42, elevationFt: level + 10 * storeys + 6 });
    }
  }
  // Pipes across north–south lanes, between two buildings side by side (1–3 squares apart), at 15 ft.
  const bridged = new Set((map.skybridges ?? []).flatMap((k) => { const s = []; for (let y = k.y0; y <= k.y1; y += 1) for (let x = k.x0; x <= k.x1; x += 1) s.push(y * columns + x); return s; }));
  const tall = plain.filter((b) => (b.storeys ?? 1) >= 2), cands = [];
  for (const a of tall) for (const c of tall) {
    if (a === c) continue; const A = rectOf(a, 1), C = rectOf(c, 1), gap = C.x0 - A.x1 - 1; if (gap < 1 || gap > 3) continue;
    const from = Math.max(A.y0, C.y0), to = Math.min(A.y1, C.y1); if (to < from) continue;
    const y = from + Math.floor(hashUnit(`${key}|pipe|${a.id}|${c.id}`) * (to - from + 1)); let free = y >= 0 && y < rows;
    for (let x = A.x1 + 1; x < C.x0 && free; x += 1) free = x >= 0 && x < columns && g.building[y * columns + x] < 0 && !bridged.has(y * columns + x);
    if (free) cands.push({ a: a.id, b: c.id, y, x0: A.x1 + 1, x1: C.x0 - 1, heightFt: 15 });
  }
  out.pipes = cands.sort((p, q) => hashUnit(`${key}|pipes|${p.a}|${p.b}`) - hashUnit(`${key}|pipes|${q.a}|${q.b}`)).slice(0, m.pipes);
  return out;
}
