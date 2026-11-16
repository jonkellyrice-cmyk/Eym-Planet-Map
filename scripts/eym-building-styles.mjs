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
    palette: { wall: "#8c4a34", mortar: "#b9a88e", timber: "#3c2a20", trim: "#ece4d2", roof: "#4c535c", door: "#2f4a3c", metal: "#b87333", verdigris: "#5f9e8c", brass: "#c9a24a", stone: "#c9c0ae", templeRoof: "#5f9e8c", lamp: "#cfeaff" },
    street: { "cobbled street": "granite setts", "paved square": "dressed granite" },
    places: [{ name: "Dree", lat: -6.79, lon: 0.412, radiusKm: 8 }],
    words: "Dree: magic-punk Victorian city in the manner of steampunk London — terraced red-brown brick houses two and three storeys high, grey slate roofs, tall white-framed sash windows under pale stone lintels, painted doors with fanlights, chimney stacks with copper pots and copper pipework, brass and copper fittings with verdigris, dark granite setts, iron lamp posts with cold blue-white arcane crystal lamps; top-heavy houses whose upper storeys overhang the street on heavy beams and brass brackets, an engineered instability that should not stand but does; enclosed skybridges between upper floors on brass trusses; homes also built into the faces of rock; carts on the street, nothing flying",
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
