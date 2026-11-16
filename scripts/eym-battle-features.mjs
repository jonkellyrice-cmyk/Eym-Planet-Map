// The GM's checklist of things a battle map has besides its ground: shrines, dungeon entrances, traps,
// fortifications, camps, ruins… Each entry says what it is made of (features from the catalogue in
// eym-battle-settings.mjs, sometimes several, as with a palisade or a camp) and where it belongs by
// rule: in the middle (an objective), on a flank, on the side that holds the ground, by a road, at the
// water's edge, in the woods, against rock, across the field as a line, or — for traps — on the routes
// the sides will actually take. Placement keeps every rule of the design pass (two routes, nothing cut
// off); what cannot be placed is reported, never forced.

import { FEATURES, MOVE } from "./eym-battle-settings.mjs";

export const MAP_FEATURE_CATEGORIES = Object.freeze([
  { id: "sacred", label: "Sacred places" }, { id: "underground", label: "Dungeons and caves" }, { id: "fortifications", label: "Fortifications" },
  { id: "camp", label: "Camps and travellers" }, { id: "settlement", label: "Town and farm" }, { id: "ruins", label: "Ruins and remains" },
  { id: "water", label: "Water" }, { id: "wild", label: "Wilderness" }, { id: "magic", label: "Magic" }, { id: "traps", label: "Traps (hidden from players)" },
]);

const E = (id, label, category, place, extra = {}) => Object.freeze({ id, label, category, place, kind: extra.kind ?? id, ...extra });
/** place: middle | flank | held | road | water | woods | rock | line | anywhere | route (traps). compound: how several pieces go together. */
export const MAP_FEATURES = Object.freeze([
  E("shrine", "Shrine", "sacred", "middle"),
  E("wayside-shrine", "Wayside shrine", "sacred", "road"),
  E("altar", "Altar", "sacred", "middle"),
  E("stone-circle", "Standing-stone circle", "sacred", "middle", { compound: "ring", kind: "standing-stone", radius: 3, pieces: 7 }),
  E("graveyard", "Graveyard", "sacred", "flank"),
  E("obelisk", "Obelisk or monument", "sacred", "middle"),
  E("statue", "Statue", "sacred", "middle"),
  E("dungeon-entrance", "Dungeon entrance (stairs down)", "underground", "middle"),
  E("cave-mouth", "Cave entrance", "underground", "rock"),
  E("mine-entrance", "Mine entrance", "underground", "rock"),
  E("trapdoor", "Trapdoor to a cellar or tunnel", "underground", "anywhere"),
  E("palisade", "Wooden palisade (enclosure with a gate)", "fortifications", "held", { compound: "enclosure", kind: "palisade-wall", size: [10, 8], gate: 2 }),
  E("watchtower", "Wooden watchtower", "fortifications", "held"),
  E("stone-tower", "Stone tower", "fortifications", "held"),
  E("earthwork", "Earthwork bank", "fortifications", "line"),
  E("trench", "Trench", "fortifications", "line"),
  E("abatis", "Sharpened stakes", "fortifications", "line"),
  E("barricade", "Barricade", "fortifications", "line"),
  E("camp", "Camp (tents and a fire)", "camp", "flank", { compound: "camp", kind: "campfire" }),
  E("wagon-circle", "Wagon circle", "camp", "middle", { compound: "ring", kind: "cart", radius: 4, pieces: 6 }),
  E("wreckage", "Wrecked wagon", "camp", "road"),
  E("signpost", "Signpost", "camp", "road"),
  E("beacon", "Signal beacon", "camp", "flank"),
  E("well", "Well", "settlement", "road"),
  E("market", "Market stalls", "settlement", "road", { compound: "row", kind: "market-stall", pieces: 3 }),
  E("pen", "Livestock pen", "settlement", "flank", { compound: "enclosure", kind: "pen", size: [6, 5], gate: 1 }),
  E("beehives", "Beehives", "settlement", "flank"),
  E("haystack", "Haystacks", "settlement", "anywhere", { compound: "scatter", pieces: 3 }),
  E("gallows", "Gallows", "settlement", "road"),
  E("temple-ruin", "Ruined temple", "ruins", "middle", { compound: "temple" }),
  E("ruined-wall", "Ruined walls", "ruins", "anywhere", { compound: "scatter", pieces: 2 }),
  E("broken-column", "Broken columns", "ruins", "anywhere", { compound: "scatter", pieces: 3 }),
  E("giant-bones", "Giant bones", "ruins", "anywhere"),
  E("cairn", "Cairn", "ruins", "flank"),
  E("dock", "Jetty", "water", "water"),
  E("rowboat", "Rowboat", "water", "water"),
  E("pool", "Pond", "water", "anywhere"),
  E("hunting-blind", "Hunting blind", "wild", "woods"),
  E("treehouse", "Tree platform", "wild", "woods"),
  E("fallen-log", "Fallen trees", "wild", "anywhere", { compound: "scatter", pieces: 2 }),
  E("boulder-pile", "Boulder field", "wild", "anywhere", { compound: "scatter", pieces: 3 }),
  E("magic-circle", "Magic circle", "magic", "middle"),
  E("portal", "Portal arch", "magic", "middle"),
  ...["pit-trap", "spiked-pit", "snare", "bear-trap", "tripwire", "net-trap", "rockfall-trap", "collapsing-floor"].map((id) => E(id, FEATURES[id].label[0].toUpperCase() + FEATURES[id].label.slice(1), "traps", "route", { hidden: true })),
]);
export const MAP_FEATURE_IDS = Object.freeze(MAP_FEATURES.map((f) => f.id));
const byId = new Map(MAP_FEATURES.map((f) => [f.id, f]));

/** Where a square is, in words (for notes and the prompt). */
export function placeWords(along, perp, axis) {
  const [a, b] = axis[0] === "n" ? ["north", "south"] : ["west", "east"], [c, d] = axis[0] === "n" ? ["west", "east"] : ["north", "south"];
  const x = along < 0.38 ? a : along > 0.62 ? b : "", y = perp < 0.38 ? c : perp > 0.62 ? d : "";
  return x || y ? `the ${axis[0] === "n" ? `${x}${x && y ? "-" : ""}${y}` : `${y}${x && y ? "-" : ""}${x}`}` : "the centre";
}

/**
 * Place the GM's chosen features. ctx: { extras, grid, columns, rows, along, perp, place, routes, order,
 * protectedSquare, WATER } from the rules engine. Returns { placed, traps, notes }.
 */
export function placeExtras(ctx) {
  const { grid, columns, rows, along, perp, place, order } = ctx, axis = ctx.axis ?? ["n", "s"], acrossX = axis[0] === "n", placed = [], traps = [], notes = [], missed = [];
  const xy = (i) => [i % columns, Math.floor(i / columns)];
  const walkable = (i) => grid.move[i] !== MOVE.impassable && grid.move[i] !== MOVE.swim && !ctx.WATER.has(grid.cover[i]);
  const near = (i, test, r = 1) => { const [x, y] = xy(i); for (let dy = -r; dy <= r; dy += 1) for (let dx = -r; dx <= r; dx += 1) { const nx = x + dx, ny = y + dy; if ((dx || dy) && nx >= 0 && ny >= 0 && nx < columns && ny < rows && test(ny * columns + nx)) return true; } return false; };
  const route = new Set(ctx.routes()[0]?.squares ?? []);
  const rules = {
    middle: (i) => Math.abs(along(i) - 0.5) < 0.12 && Math.abs(perp(i) - 0.5) < 0.3 && !route.has(i),
    flank: (i) => along(i) > 0.3 && along(i) < 0.7 && (perp(i) < 0.25 || perp(i) > 0.75),
    held: (i) => along(i) > 0.58 && along(i) < 0.85 && perp(i) > 0.2 && perp(i) < 0.8,
    road: (i) => !grid.street[i] && near(i, (j) => grid.street[j] || grid.ground[j] === "road"),
    water: (i) => walkable(i) && near(i, (j) => ctx.WATER.has(grid.cover[j]) || grid.move[j] === MOVE.swim),
    woods: (i) => grid.ground[i] === "forest floor" && along(i) > 0.25 && along(i) < 0.75,
    rock: (i) => near(i, (j) => grid.ground[j] === "bare rock" || grid.ground[j] === "black rock" || (grid.move[j] === MOVE.impassable && grid.feature[j] < 0 && grid.building[j] < 0), 2) && along(i) > 0.25 && along(i) < 0.75,
    line: (i) => along(i) > 0.6 && along(i) < 0.7,
    anywhere: (i) => along(i) > 0.25 && along(i) < 0.75,
  };
  const fallback = { road: "middle", water: null, woods: "flank", rock: "flank", held: "middle", line: "held" };
  const mark = (entry, def) => { if (entry) { entry.extra = def.id; if (def.place === "middle") entry.central = true; } return entry; };
  // Spread the GM's features out: each keeps 3 squares from the others where it can (not on the second try).
  const taken = new Uint8Array(columns * rows), spaced = (i) => !near(i, (j) => taken[j], 3) && !taken[i];
  const tryAt = (def, rule, step) => {
    const candidates = order((i) => rules[rule](i) && (step > 0 || spaced(i)), `extra|${def.id}|${step}`).slice(0, 120);
    for (const i of candidates) { const [x, y] = xy(i), pieces = compound(def, x, y); if (pieces) return { pieces, at: i }; }
    return null;
  };
  // A compound: all of its pieces or none.
  const compound = (def, x, y) => {
    const done = [], all = () => { for (const e of done.reverse()) e.remove(); return null; };
    const one = (kind, px, py, options = {}) => { const e = mark(place(kind, px, py, options), def); if (e) { e.group = `${def.id}@${x},${y}`; e.labelled = !done.length; done.push(e); } return e; };
    switch (def.compound) {
      case "enclosure": {
        // Long side across the field; the gate faces the attackers (the first zone's edge), the rest is closed.
        const [w, h] = acrossX ? def.size : [def.size[1], def.size[0]], x0 = x - Math.floor(w / 2), y0 = y - Math.floor(h / 2);
        if (x0 < 1 || y0 < 1 || x0 + w > columns - 1 || y0 + h > rows - 1) return null;
        const sides = [["n", [x0, y0], [w, 1]], ["s", [x0, y0 + h - 1], [w, 1]], ["w", [x0, y0 + 1], [1, h - 2]], ["e", [x0 + w - 1, y0 + 1], [1, h - 2]]];
        for (const [side, [sx, sy], [sw, sh]] of sides) {
          if (side === axis[0]) {
            const len = sw > 1 ? sw : sh, gap = def.gate, a = Math.floor((len - gap) / 2);
            const parts = sw > 1 ? [[sx, sy, a, 1], [sx + a + gap, sy, len - a - gap, 1]] : [[sx, sy, 1, a], [sx, sy + a + gap, 1, len - a - gap]];
            for (const [px, py, pw, ph] of parts) if (pw > 0 && ph > 0 && !one(def.kind, px, py, { size: [pw, ph] })) return all();
          } else if (!one(def.kind, sx, sy, { size: [sw, sh] })) return all();
        }
        return done;
      }
      case "ring": {
        const shape = FEATURES[def.kind].footprint; let ok = 0;
        for (let k = 0; k < def.pieces; k += 1) { const t = (2 * Math.PI * k) / def.pieces, px = Math.round(x + def.radius * Math.cos(t)), py = Math.round(y + def.radius * Math.sin(t)); if (one(def.kind, px, py, { size: shape })) ok += 1; }
        return ok >= Math.ceil(def.pieces * 0.7) ? done : all();
      }
      case "camp": {
        if (!one("campfire", x, y)) return all();
        let tents = 0; for (const [dx, dy] of [[-3, -1], [2, -1], [-1, 2], [-1, -3]]) if (one("tent", x + dx, y + dy)) tents += 1;
        return tents >= 2 ? done : all();
      }
      case "row": {
        let ok = 0; for (let k = 0; k < def.pieces; k += 1) if (one(def.kind, x + (acrossX ? 3 * k : 0), y + (acrossX ? 0 : 3 * k))) ok += 1;
        return ok >= 2 ? done : all();
      }
      case "scatter": {
        let ok = 0; for (let k = 0; k < def.pieces; k += 1) { const t = k * 2.4, px = Math.round(x + 2.5 * k * Math.cos(t)), py = Math.round(y + 2.5 * k * Math.sin(t)); if (one(def.kind, px, py)) ok += 1; }
        return ok >= Math.min(2, def.pieces) ? done : all();
      }
      case "temple": {
        // Broken columns at the corners of a 25-ft floor, an altar in the middle, flagstones between.
        let ok = 0; for (const [dx, dy] of [[0, 0], [4, 0], [0, 4], [4, 4]]) if (one("broken-column", x + dx, y + dy)) ok += 1;
        if (ok < 2 || !one("altar", x + 2, y + 2)) return all();
        for (let dy = 0; dy < 5; dy += 1) for (let dx = 0; dx < 5; dx += 1) { const i = (y + dy) * columns + x + dx; if (x + dx < columns && y + dy < rows && grid.feature[i] < 0 && walkable(i)) one("temple-ruin", x + dx, y + dy, { size: [1, 1] }); }
        return done;
      }
      case undefined: {
        if (def.place === "line") {
          // Two lengths across the field with a gap between them (a defended line, not a wall).
          const len = FEATURES[def.kind].footprint[1]; if (!one(def.kind, x, y, { orient: "across" })) return all();
          one(def.kind, x + (acrossX ? len + 3 : 0), y + (acrossX ? 0 : len + 3), { orient: "across" }); return done;
        }
        if (def.place === "water") {
          const water = (i) => ctx.WATER.has(grid.cover[i]) || grid.move[i] === MOVE.swim;
          const e = one(def.kind, x, y, { allowWater: true, accept: (sq) => (def.kind === "dock" ? sq.some(water) && sq.some((i) => !water(i)) : sq.every(water)) });
          return e ? done : all();
        }
        return one(def.kind, x, y) ? done : all();
      }
      default: return all();
    }
  };
  // Traps go where the sides will walk: on the routes, in the middle of the field, never next to each other.
  const placeTrap = (def, step) => {
    const onRoutes = new Set(ctx.routes().flatMap((r) => r.squares));
    const candidates = order((i) => onRoutes.has(i) && along(i) > 0.3 && along(i) < 0.75 && walkable(i) && !grid.trap[i] && grid.feature[i] < 0 && !near(i, (j) => grid.trap[j], 2), `trap|${def.id}|${step}`);
    const [w, h] = FEATURES[def.kind].footprint;
    for (const i of candidates) {
      const [x, y] = xy(i), squares = [];
      for (let dy = 0; dy < h; dy += 1) for (let dx = 0; dx < w; dx += 1) { const nx = x + dx, ny = y + dy; if (nx < columns && ny < rows) { const j = ny * columns + nx; if (walkable(j) && grid.feature[j] < 0 && !ctx.protectedSquare(j)) squares.push(j); } }
      if (squares.length < w * h) continue;
      for (const j of squares) grid.trap[j] = 1;
      return { id: def.id, kind: def.kind, x, y, w, h, squares, hazard: FEATURES[def.kind].hazard };
    }
    return null;
  };
  for (const id of ctx.extras ?? []) {
    const def = byId.get(id); if (!def) continue;
    if (def.hidden) { const trap = placeTrap(def, 0); if (trap) traps.push(trap); else missed.push(`${def.label}: no square on a route to hide it`); continue; }
    let rule = def.place, result = null;
    for (let k = 0; k < 3 && rule && !result; k += 1) { result = tryAt(def, rule, 0) ?? tryAt(def, rule, 1); if (!result) rule = fallback[rule] ?? (rule === "anywhere" ? null : "anywhere"); }
    if (!result) { missed.push(def.place === "water" ? `${def.label}: no water on this map` : `${def.label}: no room that keeps two routes open`); continue; }
    for (const e of result.pieces) for (const i of e.squares) taken[i] = 1;
    placed.push({ id: def.id, label: def.label, at: placeWords(along(result.at), perp(result.at), axis), pieces: result.pieces.length });
  }
  if (placed.length) notes.push(`The GM's features: ${placed.map((p) => `${p.label.toLowerCase()} (${p.at})`).join("; ")}.`);
  if (traps.length) notes.push(`Hidden traps (GM only): ${traps.map((t) => `${FEATURES[t.kind].label} at ${String.fromCharCode(65 + (t.x % 26))}${t.y + 1}`).join("; ")}.`);
  if (missed.length) notes.push(`Not placed: ${missed.join("; ")}.`);
  return { placed, traps, notes };
}
