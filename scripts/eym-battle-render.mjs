// Drawing a battle map, briefing the painter and preparing the Foundry scene. Pure functions over the
// map from eym-battle-rules.mjs:
//   battleReferenceSvg — the authoritative layout, text-free and gridless, for the image model;
//   battleTacticalSvg  — the GM's overlay: grid, movement, cover, elevation, deployment, routes, labels;
//   battleArtDirection — the prompt that anchors the painting to the layout;
//   battlePacket       — the whole brief as Markdown;
//   battleSceneData    — a Foundry scene: grid, background, walls and doors, terrain regions, light, weather.

import { FEATURES, MOVE, SETTINGS } from "./eym-battle-settings.mjs";
import { footprintPolygon } from "./eym-battle-buildings.mjs";
import { NEUTRAL_LIGHT, seasonWords } from "./eym-battle-season.mjs";
import { battleLights } from "./eym-battle-scene.mjs";
import { battleOccluders, occluderRecord, occluderWalls } from "./eym-battle-occluders.mjs";
import { obliqueBoulder, obliqueShapedBuilding, obliqueBush, obliqueFaces, obliqueFeature, obliqueTree, standHeightFt } from "./eym-battle-oblique.mjs";

const GROUND_COLORS = Object.freeze({
  "deep water": "#2f6f96", river: "#4d8fbb", "shallow stream": "#6aa8cf", "frozen stream": "#cfe6f2", sand: "#e2cf98", marsh: "#6e8456", "wet meadow": "#869a5c",
  grass: "#93a862", field: "#c2b26c", scrub: "#7e9150", "forest floor": "#55703f", "bare rock": "#9a9184", snow: "#eef2f4", "deep snow": "#f7fafb", "glacier ice": "#cfe3ee",
  yard: "#a99a7a",
  "canyon floor": "#c29a6a", "carved stone terrace": "#c8ab84", "monastery terrace": "#b9ad96", "lower terrace": "#a99d86", "stone stairs": "#d6c7a8", "marble quay": "#e2ddd2", canal: "#3f7f9a", "stone bridge": "#cfc6b4",
  "floating rock": "#8fa36a", "open sky (a fall)": "#bcd8f0", "open air (a fall)": "#1c1f26", "rope bridge": "#a07a4a", "stone arch": "#b0a690", "planar rift": "#5a2a8a", "cave floor": "#5e5a55", "cave wall": "#2b2826",
  "flagstone floor": "#8f877a", "carved wall": "#3a3632", "molten-metal channel": "#f0702a", "raised dais": "#a89c86", "tree platform": "#9a7448", ladder: "#7a5a36", "grave earth": "#6f6a52",
  "deep channel": "#2f7fa8", shallows: "#6fc8c8", sandbar: "#efe2b8", road: "#a58a62", "cobbled street": "#9b9488", "dirt lane": "#a88c62", "paved square": "#b3ab9c", floor: "#8a6a4a", "black rock": "#3d3836", "ash and cinders": "#6f6a66",
});
const groundColor = (g) => GROUND_COLORS[g] ?? GROUND_COLORS[g.replace(/ \(mud\)$/, "")] ?? "#93a862";
/** A square's colour on this map: bare rock takes the colour of the local bedrock (scripts/eym-geology.mjs). */
const groundColorOn = (map, g) => (g === "bare rock" && map.geology?.rock ? mix(GROUND_COLORS["bare rock"], map.geology.rock.colour, 0.7) : groundColor(g));
/** The natural rock features, which take the local rock's colour too. */
const NATURAL_ROCK = new Set(["boulder", "boulder-pile", "rock-outcrop", "rock-shelf", "scree", "ledge", "sea-stack"]);
/** A feature's definition on this map (natural rock tinted to the local bedrock). */
const featureDefOn = (map, kind) => { const def = FEATURES[kind]; return NATURAL_ROCK.has(kind) && map.geology?.rock ? { ...def, color: mix(def.color, map.geology.rock.colour, 0.6) } : def; };
const MUD = "#6b5a3e";
/** Blend two #rrggbb colours (t = share of the second). */
function mix(a, b, t) { const p = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)), [x, y] = [p(a), p(b)]; return `#${x.map((v, k) => Math.round(v + (y[k] - v) * t).toString(16).padStart(2, "0")).join("")}`; }

/**
 * Corners to cut at 45°: for each square corner whose two neighbours along the edges share a colour that is
 * not this square's (and the diagonal neighbour agrees), a half-square triangle of that colour.
 * Returns [cornerX, cornerY, [dirX, dirY, colour]].
 */
export function chamferCorners(col, columns, rows) {
  const out = [];
  for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) {
    const i = y * columns + x;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const hx = x + dx, vy = y + dy; if (hx < 0 || vy < 0 || hx >= columns || vy >= rows) continue;
      const h = col[y * columns + hx], v = col[vy * columns + x], d = col[vy * columns + hx];
      if (h === v && h !== col[i] && d === h) out.push([x + (dx > 0 ? 1 : 0), y + (dy > 0 ? 1 : 0), [dx > 0 ? -1 : 1, dy > 0 ? -1 : 1, h]]);
    }
  }
  return out;
}
const f2 = (v) => Number(v).toFixed(2);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** One feature drawn in square units (x, y top-left; w, h). */
function featureShape(f, def = FEATURES[f.kind]) {
  const { x, y, w, h } = f, cx = x + w / 2, cy = y + h / 2, c = def.color;
  switch (def.shape) {
    case "round": return `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(Math.min(w, h) * 0.42)}" fill="${c}" stroke="#2a2622" stroke-width="0.06"/>`;
    case "tree": return `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(0.75 * Math.min(w, h))}" fill="${c}" fill-opacity="0.92"/><circle cx="${f2(cx)}" cy="${f2(cy)}" r="0.18" fill="#5a3d24"/>`;
    case "log": return `<rect x="${f2(x + 0.2)}" y="${f2(y + 0.2)}" width="${f2(w - 0.4)}" height="${f2(h - 0.4)}" rx="0.3" fill="${c}" stroke="#3a2818" stroke-width="0.06"/>`;
    case "wall": return `<rect x="${f2(x + (w < h ? 0.25 : 0.05))}" y="${f2(y + (w < h ? 0.05 : 0.25))}" width="${f2(w < h ? w - 0.5 : w - 0.1)}" height="${f2(w < h ? h - 0.1 : h - 0.5)}" fill="${c}" stroke="#4a4238" stroke-width="0.06"/>`;
    case "fence": return `<rect x="${f2(x + (w < h ? 0.42 : 0))}" y="${f2(y + (w < h ? 0 : 0.42))}" width="${f2(w < h ? 0.16 : w)}" height="${f2(w < h ? h : 0.16)}" fill="${c}"/>`;
    case "hedge": return `<rect x="${f2(x + 0.1)}" y="${f2(y + 0.1)}" width="${f2(w - 0.2)}" height="${f2(h - 0.2)}" rx="0.45" fill="${c}"/>`;
    case "ditch": return `<rect x="${f2(x + 0.2)}" y="${f2(y + 0.2)}" width="${f2(w - 0.4)}" height="${f2(h - 0.4)}" rx="0.2" fill="${c}" fill-opacity="0.9"/>`;
    case "lava": return `<rect x="${f2(x + 0.12)}" y="${f2(y)}" width="${f2(w - 0.24)}" height="${f2(h)}" rx="0.35" fill="${c}"/><rect x="${f2(x + 0.35)}" y="${f2(y + 0.1)}" width="${f2(Math.max(0.1, w - 0.7))}" height="${f2(h - 0.2)}" rx="0.2" fill="#ffb347"/>`;
    case "planks": return `<rect x="${f2(x + 0.15)}" y="${f2(y)}" width="${f2(w - 0.3)}" height="${f2(h)}" fill="${c}" stroke="#4a3520" stroke-width="0.05"/>`;
    case "cart": return `<rect x="${f2(x + 0.12)}" y="${f2(y + 0.12)}" width="${f2(w - 0.24)}" height="${f2(h - 0.24)}" fill="${c}" stroke="#2e1f12" stroke-width="0.08"/>`;
    case "crate": return `<rect x="${f2(x + 0.1)}" y="${f2(y + 0.1)}" width="${f2(w - 0.2)}" height="${f2(h - 0.2)}" fill="${c}" stroke="#4a3520" stroke-width="0.06"/>`;
    case "stall": return `<rect x="${f2(x + 0.05)}" y="${f2(y + 0.05)}" width="${f2(w - 0.1)}" height="${f2(h - 0.1)}" fill="${c}" stroke="#5a2a14" stroke-width="0.06"/>`;
    case "dots": return Array.from({ length: Math.max(2, Math.round(w * h * 2)) }, (_, k) => `<circle cx="${f2(x + 0.25 + ((k * 0.618) % 1) * (w - 0.5))}" cy="${f2(y + 0.25 + ((k * 0.382 + 0.2) % 1) * (h - 0.5))}" r="0.2" fill="${c}"/>`).join("");
    case "rise": return `<rect x="${f2(x + 0.1)}" y="${f2(y + 0.1)}" width="${f2(w - 0.2)}" height="${f2(h - 0.2)}" rx="${f2(Math.min(w, h) / 2.2)}" fill="${c}" fill-opacity="0.9"/>`;
    case "shrine": return `<rect x="${f2(x + 0.1)}" y="${f2(y + 0.1)}" width="${f2(w - 0.2)}" height="${f2(h - 0.2)}" fill="${c}" stroke="#5a4a2a" stroke-width="0.08"/><path d="M${f2(x + 0.1)} ${f2(y + 0.1)} L${f2(x + w - 0.1)} ${f2(y + h - 0.1)} M${f2(x + w - 0.1)} ${f2(y + 0.1)} L${f2(x + 0.1)} ${f2(y + h - 0.1)}" stroke="#8a7240" stroke-width="0.06"/>`;
    case "floor": return `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(w)}" height="${f2(h)}" fill="${c}"/>`;
    case "stairs": return `<rect x="${f2(x + 0.1)}" y="${f2(y + 0.1)}" width="${f2(w - 0.2)}" height="${f2(h - 0.2)}" fill="#8f8577"/>${Array.from({ length: 5 }, (_, k) => `<rect x="${f2(x + 0.25)}" y="${f2(y + 0.25 + k * (h - 0.5) / 5)}" width="${f2(w - 0.5)}" height="${f2((h - 0.5) / 5 - 0.04)}" fill="${c}" fill-opacity="${f2(0.35 + k * 0.13)}"/>`).join("")}`;
    case "cave": return `<ellipse cx="${f2(cx)}" cy="${f2(cy)}" rx="${f2(w / 2)}" ry="${f2(h / 2)}" fill="#6d665c"/><ellipse cx="${f2(cx)}" cy="${f2(cy + 0.1)}" rx="${f2(w / 2 - 0.4)}" ry="${f2(h / 2 - 0.35)}" fill="${c}"/>`;
    case "palisade": return `<rect x="${f2(x + 0.05)}" y="${f2(y + 0.05)}" width="${f2(w - 0.1)}" height="${f2(h - 0.1)}" fill="${c}" stroke="#3e2a16" stroke-width="0.08"/>`;
    case "tower": return `<rect x="${f2(x + 0.05)}" y="${f2(y + 0.05)}" width="${f2(w - 0.1)}" height="${f2(h - 0.1)}" fill="${c}" stroke="#2e2418" stroke-width="0.12"/><rect x="${f2(x + 0.35)}" y="${f2(y + 0.35)}" width="${f2(w - 0.7)}" height="${f2(h - 0.7)}" fill="none" stroke="#2e2418" stroke-width="0.06"/>`;
    case "stakes": return Array.from({ length: Math.max(w, h) * 2 }, (_, k) => { const t = (k + 0.5) / (Math.max(w, h) * 2); const px = w > h ? x + t * w : cx, py = w > h ? cy : y + t * h; return `<path d="M${f2(px - 0.2)} ${f2(py + 0.2)} L${f2(px + 0.2)} ${f2(py - 0.2)}" stroke="${c}" stroke-width="0.12" stroke-linecap="round"/>`; }).join("");
    case "tent": return `<path d="M${f2(x + 0.15)} ${f2(y + h - 0.15)} L${f2(cx)} ${f2(y + 0.15)} L${f2(x + w - 0.15)} ${f2(y + h - 0.15)} Z" fill="${c}" stroke="#6b5a3a" stroke-width="0.06"/>`;
    case "fire": return `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="0.38" fill="#6d665c"/><circle cx="${f2(cx)}" cy="${f2(cy)}" r="0.24" fill="${c}"/>`;
    case "graves": return `<rect x="${f2(x + 0.05)}" y="${f2(y + 0.05)}" width="${f2(w - 0.1)}" height="${f2(h - 0.1)}" fill="${c}"/>${Array.from({ length: w * h }, (_, k) => `<rect x="${f2(x + 0.3 + (k % w))}" y="${f2(y + 0.3 + Math.floor(k / w))}" width="0.4" height="0.22" fill="#b8b3a8"/>`).join("")}`;
    case "circle": return `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(Math.min(w, h) / 2 - 0.1)}" fill="none" stroke="${c}" stroke-width="0.12"/><circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(Math.min(w, h) / 2 - 0.45)}" fill="none" stroke="${c}" stroke-width="0.06"/>`;
    case "trunk": return `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(Math.min(w, h) / 2)}" fill="${c}" stroke="#2e1f12" stroke-width="0.1"/><circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(Math.min(w, h) / 2 - 0.4)}" fill="none" stroke="#7a5a36" stroke-width="0.06"/>`;
    case "crystal": return [0, 1, 2, 3].map((k) => `<path d="M${f2(x + 0.3 + (k % 2) * (w - 0.9))} ${f2(y + 0.3 + Math.floor(k / 2) * (h - 0.9))} l0.3 -0.25 l0.3 0.25 l-0.3 0.6 z" fill="${c}" stroke="#4a8ab0" stroke-width="0.04"/>`).join("") + `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(Math.min(w, h) * 0.3)}" fill="${c}" fill-opacity="0.7"/>`;
    case "mushroom": return `<circle cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(Math.min(w, h) * 0.55)}" fill="${c}"/><circle cx="${f2(cx - 0.3)}" cy="${f2(cy - 0.2)}" r="0.15" fill="#f0e6d0"/><circle cx="${f2(cx + 0.35)}" cy="${f2(cy + 0.2)}" r="0.12" fill="#f0e6d0"/>`;
    default: return `<rect x="${f2(x + 0.08)}" y="${f2(y + 0.08)}" width="${f2(w - 0.16)}" height="${f2(h - 0.16)}" rx="${f2(Math.min(w, h) * 0.35)}" fill="${c}"/>`;
  }
}

/** The authoritative layout for the painter: ground, water, buildings, trees, rocks and features; no grid, no text. */
export function battleReferenceSvg(map, gridPx = map.spec.gridPx) {
  const { columns, rows } = map.spec, { grid } = map, n = columns * rows, out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${columns * gridPx}" height="${rows * gridPx}" viewBox="0 0 ${columns} ${rows}" shape-rendering="geometricPrecision">`];
  // Each square's colour: its ground, mud, and its height (higher a little lighter, lower a little darker).
  const levels = [...grid.elevationFt].filter((e, i) => !grid.void[i]), lo = Math.min(...levels), hi = Math.max(...levels), col = new Array(n);
  for (let i = 0; i < n; i += 1) {
    let c = groundColorOn(map, grid.ground[i]); if (/\(mud\)$/.test(grid.ground[i])) c = mix(c, MUD, 0.35);
    if (hi - lo >= 10 && !grid.void[i]) { const t = (grid.elevationFt[i] - lo) / (hi - lo); c = mix(c, t < 0.5 ? "#000000" : "#ffffff", Math.abs(t - 0.5) * 0.36); }
    col[i] = c;
  }
  for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) out.push(`<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${col[y * columns + x]}"/>`);
  // Soften the grid: where a square's corner is surrounded on both sides by another ground, cut that corner
  // at 45°, so shores, field edges, cliff lines and island rims read as stepped diagonals, not blocks.
  for (const [x, y, d] of chamferCorners(col, columns, rows)) out.push(`<path d="M${x} ${y} L${f2(x + d[0] * 0.5)} ${y} L${x} ${f2(y + d[1] * 0.5)} Z" fill="${d[2]}"/>`);
  // Side edges of levels as dark lines; south-facing steps get faces below (drawn with the standing things).
  for (const c of map.cliffs ?? []) if (c.dir === "e") out.push(`<line x1="${c.x + 1}" y1="${c.y}" x2="${c.x + 1}" y2="${c.y + 1}" stroke="#1e1a16" stroke-width="${f2(Math.min(0.3, 0.08 + (c.high - c.low) / 100))}" stroke-linecap="round"/>`);
  const line = (pts) => `M${pts.map(([a, b]) => `${f2(a)} ${f2(b)}`).join(" L")}`;
  if (!map.flattened) for (const s of map.site.streams) out.push(`<path d="${line(s.line)}" fill="none" stroke="${s.kind === "river" ? "#4d8fbb" : "#6aa8cf"}" stroke-width="${f2(Math.max(0.6, s.widthSquares))}" stroke-linecap="round" stroke-linejoin="round"/>`);
  // Flat things lie on the ground; everything that stands is drawn in three-quarter view, north to south.
  const standing = [];
  for (const f of map.features) { const def = featureDefOn(map, f.kind); if (def.shape === "tree") { standing.push({ y: f.y + f.h, x: f.x, svg: (f.kind === "planter-tree" ? `<rect x="${f2(f.x + 0.2)}" y="${f2(f.y + 0.55)}" width="0.6" height="0.35" fill="#8f877a"/>` : "") + obliqueTree({ x: f.x + f.w / 2, y: f.y + f.h - 0.2, size: f.kind === "planter-tree" ? 0.62 : 0.95 }) }); continue; } if (standHeightFt(f.kind, def) > 0) standing.push({ y: f.y + f.h, x: f.x, svg: obliqueFeature(f, def, featureShape(f, def)) }); else out.push(featureShape(f, def)); }
  for (const o of map.objects) standing.push({ y: o.y, x: o.x, svg: o.kind === "tree" ? obliqueTree(o) : o.kind === "bush" ? obliqueBush(o) : obliqueBoulder(o, map.geology?.rock?.colour) });
  // An overhanging building shows its widest (top) outline: the painter is told its upper floors step out.
  for (const b of map.buildings) { const top = b.floorRects ? b.floorRects[(b.storeys ?? 2) - 1] : null, shown = top ? { ...b, ...top, rects: [top], chamfers: [] } : b; standing.push({ y: shown.y1 + 1, x: shown.x0, svg: obliqueShapedBuilding(shown, columns, rows, shown.chamfers?.length ? footprintPolygon(shown) : null) }); }
  for (const k of map.skybridges ?? []) { const r = { x0: k.x0, y0: k.y0, x1: k.x1, y1: k.y1 }; standing.push({ y: k.y1 + 1, x: k.x0, svg: obliqueShapedBuilding({ ...r, rects: [r], chamfers: [], storeys: 2, label: "house", door: null }, columns, rows, null) }); }
  for (const face of obliqueFaces(grid)) standing.push({ y: face.y - 0.01, x: 0, svg: face.svg });
  standing.sort((a, b) => a.y - b.y || a.x - b.x);
  for (const item of standing) out.push(item.svg);
  for (const [key, w] of map.grid.walls) if (w.door) { const [x, y, dir] = key.split(","); if (dir === "e") out.push(`<rect x="${Number(x) + 1 - 0.1}" y="${Number(y) + 0.25}" width="0.2" height="0.5" fill="#d9b77a"/>`); }
  out.push("</svg>");
  return out.join("");
}

/** The GM's overlay (transparent): grid, movement classes, cover, elevation, deployment zones, routes and labels. */
export function battleTacticalSvg(map, gridPx = map.spec.gridPx) {
  const { columns, rows } = map.spec, { grid } = map, out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${columns * gridPx}" height="${rows * gridPx}" viewBox="0 0 ${columns} ${rows}">`,
    `<defs><pattern id="hatch-d" width="0.5" height="0.5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="0.12" height="0.5" fill="#f2c94c" fill-opacity="0.75"/></pattern><pattern id="hatch-g" width="0.3" height="0.3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="0.12" height="0.3" fill="#f2994a" fill-opacity="0.85"/></pattern><pattern id="hatch-h" width="0.4" height="0.4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="0.16" height="0.4" fill="#eb5757" fill-opacity="0.9"/></pattern></defs>`];
  map.zones.forEach((zone, k) => { for (const i of zone) out.push(`<rect x="${i % columns}" y="${Math.floor(i / columns)}" width="1" height="1" fill="${k ? "#eb5757" : "#2f80ed"}" fill-opacity="0.18"/>`); });
  for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) {
    const i = y * columns + x, m = grid.move[i];
    if (grid.rock[i]) { out.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="#000" fill-opacity="0.45"/>`); continue; }
    if (grid.void[i]) continue;
    if (m === MOVE.difficult) out.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="url(#hatch-d)"/>`);
    else if (m === MOVE.greater) out.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="url(#hatch-g)"/>`);
    else if (m === MOVE.hazardous) out.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="url(#hatch-h)"/>`);
    else if (m === MOVE.impassable) out.push(`<path d="M${x + 0.2} ${y + 0.2} L${x + 0.8} ${y + 0.8} M${x + 0.8} ${y + 0.2} L${x + 0.2} ${y + 0.8}" stroke="#111" stroke-opacity="0.6" stroke-width="0.07"/>`);
    else if (m === MOVE.swim) out.push(`<path d="M${x + 0.15} ${y + 0.5} q0.175 -0.2 0.35 0 t0.35 0" fill="none" stroke="#e0f2ff" stroke-width="0.06"/>`);
    else if (m === MOVE.climb) out.push(`<path d="M${x + 0.3} ${y + 0.75} L${x + 0.5} ${y + 0.3} L${x + 0.7} ${y + 0.75}" fill="none" stroke="#fff" stroke-width="0.08"/>`);
    if (grid.coverGiven[i] > 0) out.push(`<circle cx="${x + 0.84}" cy="${y + 0.16}" r="0.11" fill="${["", "#b8e0ff", "#2f80ed", "#1b3f8a"][grid.coverGiven[i]]}" stroke="#fff" stroke-width="0.03"/>`);
    if (grid.concealed[i]) out.push(`<circle cx="${x + 0.16}" cy="${y + 0.16}" r="0.1" fill="none" stroke="#fff" stroke-width="0.04" stroke-dasharray="0.05 0.04"/>`);
    // Heights: on every third square, and wherever the height changes from a neighbour.
    const changes = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < columns && ny < rows && grid.elevationFt[ny * columns + nx] !== grid.elevationFt[i]; });
    if (grid.elevationFt[i] && !grid.void[i] && (changes || (x % 3 === 1 && y % 3 === 1))) out.push(`<text x="${x + 0.5}" y="${y + 0.92}" font-size="0.26" text-anchor="middle" fill="#fff" stroke="#000" stroke-width="0.04" paint-order="stroke" font-family="sans-serif">${grid.elevationFt[i] > 0 ? "+" : ""}${grid.elevationFt[i]}</text>`);
  }
  for (const b of map.buildings) for (const c of b.chamfers ?? []) { const [a, bb, cc, d] = { nw: [c.x, c.y + 1, c.x + 1, c.y], ne: [c.x, c.y, c.x + 1, c.y + 1], sw: [c.x, c.y, c.x + 1, c.y + 1], se: [c.x + 1, c.y, c.x, c.y + 1] }[c.corner]; out.push(`<line x1="${a}" y1="${bb}" x2="${cc}" y2="${d}" stroke="#111" stroke-width="0.1"/>`); }
  for (const [key, w] of grid.walls) { if (w.chamfer) continue; const [x, y, dir] = key.split(",").map((v, k) => (k < 2 ? Number(v) : v)); const [a, b, c, d] = dir === "e" ? [x + 1, y, x + 1, y + 1] : [x, y + 1, x + 1, y + 1]; out.push(`<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="${w.door ? "#f2c94c" : "#111"}" stroke-width="${w.door ? 0.14 : 0.1}"/>`); }
  for (const c of map.cliffs ?? []) { const [a, b, cc, d] = c.dir === "e" ? [c.x + 1, c.y, c.x + 1, c.y + 1] : [c.x, c.y + 1, c.x + 1, c.y + 1]; out.push(`<line x1="${a}" y1="${b}" x2="${cc}" y2="${d}" stroke="#ff7a00" stroke-width="0.12"/>`); }
  for (let i = 0; i < columns * rows; i += 1) if (grid.void[i]) out.push(`<rect x="${i % columns}" y="${Math.floor(i / columns)}" width="1" height="1" fill="#000" fill-opacity="0.35"/>`);
  for (let x = 0; x <= columns; x += 1) out.push(`<line x1="${x}" y1="0" x2="${x}" y2="${rows}" stroke="#000" stroke-opacity="0.25" stroke-width="0.025"/>`);
  for (let y = 0; y <= rows; y += 1) out.push(`<line x1="0" y1="${y}" x2="${columns}" y2="${y}" stroke="#000" stroke-opacity="0.25" stroke-width="0.025"/>`);
  map.routes.forEach((route, k) => out.push(`<path d="M${route.map((i) => `${(i % columns) + 0.5} ${Math.floor(i / columns) + 0.5}`).join(" L")}" fill="none" stroke="${["#ffffff", "#c3f0ca", "#ffe08a"][k]}" stroke-opacity="0.85" stroke-width="0.12" stroke-dasharray="0.35 0.25"/>`));
  for (const i of map.chokepoints) out.push(`<circle cx="${(i % columns) + 0.5}" cy="${Math.floor(i / columns) + 0.5}" r="0.4" fill="none" stroke="#f2994a" stroke-width="0.08"/>`);
  for (const t of map.traps ?? []) out.push(`<rect x="${t.x + 0.08}" y="${t.y + 0.08}" width="${t.w - 0.16}" height="${t.h - 0.16}" fill="#d0342c" fill-opacity="0.3" stroke="#d0342c" stroke-width="0.08" stroke-dasharray="0.2 0.12"/><text x="${f2(t.x + t.w / 2)}" y="${f2(t.y + t.h / 2 + 0.12)}" font-size="0.36" text-anchor="middle" fill="#fff" stroke="#000" stroke-width="0.05" paint-order="stroke" font-family="sans-serif">TRAP</text>`);
  for (const f of map.features.filter((g) => !g.group || g.labelled)) out.push(`<text x="${f2(f.x + f.w / 2)}" y="${f2(f.y + f.h / 2 + 0.1)}" font-size="0.32" text-anchor="middle" fill="#fff" stroke="#000" stroke-width="0.05" paint-order="stroke" font-family="sans-serif">${esc(FEATURES[f.kind].label)}</text>`);
  out.push("</svg>");
  return out.join("");
}

/** Just the 5-ft grid, to lay over a painting for checking. */
export function battleGridSvg(spec, gridPx = spec.gridPx) {
  const { columns, rows } = spec, parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${columns * gridPx}" height="${rows * gridPx}" viewBox="0 0 ${columns} ${rows}">`];
  for (let x = 0; x <= columns; x += 1) parts.push(`<line x1="${x}" y1="0" x2="${x}" y2="${rows}" stroke="#000" stroke-opacity="0.3" stroke-width="0.02"/>`);
  for (let y = 0; y <= rows; y += 1) parts.push(`<line x1="0" y1="${y}" x2="${columns}" y2="${y}" stroke="#000" stroke-opacity="0.3" stroke-width="0.02"/>`);
  parts.push("</svg>");
  return parts.join("");
}

/** What the colours and shapes in the reference mean, for the painter. */
function legend(map) {
  const grounds = [...new Set(map.grid.ground)].map((g) => `${groundColorOn(map, g)} = ${g}`);
  const things = [...new Set(map.features.map((f) => `${featureDefOn(map, f.kind).color} = ${FEATURES[f.kind].words ?? FEATURES[f.kind].label}`))];
  if (map.objects.some((o) => o.kind === "tree")) things.push("dark green discs = tree canopies (a brown dot marks a big trunk)");
  if (map.objects.some((o) => o.kind === "bush")) things.push("small mid-green discs = bushes");
  if (map.objects.some((o) => o.kind === "boulder")) things.push(map.geology?.rock ? `${map.geology.rock.colourWords} discs = boulders and stones of the local ${map.geology.rock.name.split(" (")[0]}` : "grey discs = boulders and stones");
  if (map.buildings.length) things.push("brown rectangles with dark outlines = buildings seen from above (roofs); gold marks on their edges = doors");
  if (map.site.streams.length && !map.flattened) things.push("blue bands = water (streams and rivers)");
  if ((map.cliffs ?? []).length) things.push("thick dark lines = cliff edges and ledges (sheer drops of 10 ft or more; paint them as rock faces with strong shadows)");
  if (map.grid.void.some(Boolean)) things.push(`${groundColor(map.grid.ground[map.grid.void.indexOf(1)])} areas = ${map.grid.ground[map.grid.void.indexOf(1)]}: empty air, nothing to stand on`);
  things.push("lighter = higher ground, darker = lower ground");
  things.push("everything that stands up is already drawn in three-quarter view: its top, and its darker south-facing side rising toward the top of the image");
  return [...grounds, ...things];
}

/** The rule that keeps the perspective honest to the grid. */
export const PERSPECTIVE_RULE = "Perspective rule: never draw anything as a flat top-down symbol, and never tilt the ground itself; only the things standing on it show their sides. Taller things show taller sides and overlap what stands behind (north of) them, as the reference already does.";

/** Heights for the painter: levels, cliffs, platforms, a ceiling. */
function heightWords(map) {
  const e = [...map.grid.elevationFt].filter((v, i) => !map.grid.void[i]), lo = Math.min(...e), hi = Math.max(...e), parts = [];
  if (hi - lo >= 10) parts.push(`The ground is not flat: it ranges over ${hi - lo} ft${(map.cliffs ?? []).length ? ", in levels with sheer faces between them" : ""}; show the heights with shading, cast shadows and visible rock faces so a viewer can read what is high and what is low.`);
  if (map.grid.platform.some(Boolean)) parts.push("The brown platform areas are raised wooden platforms and bridges 20 ft above the forest floor; show the ground far below between them.");
  if (map.underground) parts.push(`This is underground: no sky; a rock ceiling about ${map.ceilingFt} ft up is out of view; light comes from glowing crystals, braziers or lava.`);
  return parts.join(" ");
}

/** The prompt: paint over the layout, keep everything where it is, a clean top-down battle map, no grid or text. */
export function battleArtDirection(map, { timeWords = "", weatherWords = "", architecture = "", season = null } = {}) {
  const rules = SETTINGS[map.setting], { columns, rows, widthPx, heightPx } = map.spec;
  const chosen = (map.extras ?? []).map((e) => `${e.label.toLowerCase()} in ${e.at}`);
  return [
    `Paint a fantasy tabletop battle map in a rich, detailed, painterly digital style, in three-quarter top-down (oblique) perspective, as classic 2D role-playing games draw their towns and wilds: the ground is seen from above, but nothing is flat. Every object that stands up shows its top and its south-facing side, so its height reads at a glance: buildings show their roofs and their front walls with doors and windows; trees show full crowns over visible trunks; cliffs, ledges, quays and island edges show their rock or stone faces; boulders, walls, fences, carts, crates, stalls, pillars and statues show their sides. Vertical sides rise toward the top of the image (about one square of picture for every 10 feet of height); the ground contact of each object stays on its squares. Shadows are only those objects make of themselves (see below).`,
    `${PERSPECTIVE_RULE}`,
    `The setting: ${rules.words}.${timeWords ? ` ${timeWords}` : ""}${weatherWords ? ` ${weatherWords}` : ""} ${NEUTRAL_LIGHT}${season ? ` Season: ${seasonWords(season)}.` : ""}`,
    `The attached reference image is the authoritative layout of the battlefield, ${columns} by ${rows} squares of 5 feet (${columns * 5} by ${rows * 5} feet). Keep every building footprint, wall, door, tree trunk, boulder, log, wall, ridge, hazard, water edge, road and street exactly where it is, at the same size and shape: the game rules depend on them. Do not add, remove, move or merge any obstacle, building, water or path. You may add small surface detail (grass tufts, pebbles, leaf litter, cracks, roof tiles) that does not change what blocks or slows movement.`,
    `Colours in the reference mean: ${legend(map).join("; ")}. Paint each as the real thing, not as flat colour.`,
    ...(map.geology?.rock ? [`The local rock is ${map.geology.rock.battle}. Paint exposed rock, cliff faces, ledges and boulders as this rock.`] : []),
    ...(heightWords(map) ? [heightWords(map)] : []),
    ...(chosen.length ? [`The map must clearly show these features, where the reference has them: ${chosen.join("; ")}.`] : []),
    ...(architecture ? [architecture] : []),
    ...(map.buildings.some((b) => b.floorRects) ? ["Where a roof in the reference is wider than the walls beneath it, the building's upper floors overhang the street (jettied): each storey steps out over the one below on heavy beams, braces and brass brackets, top-heavy, with the street in deep shade beneath."] : []),
    ...((map.skybridges ?? []).length ? ["The narrow roofed spans between upper floors are enclosed skybridges at first-floor height, on brass trusses, with the street visible and shaded beneath them."] : []),
    `Draw no grid lines, text, labels, numbers, tokens, people, creatures, compass or border. Fill the whole image to the edges, at ${widthPx}×${heightPx} pixels.`,
  ].join("\n\n");
}

const colName = (x) => (x < 26 ? String.fromCharCode(65 + x) : `${String.fromCharCode(64 + Math.floor(x / 26))}${String.fromCharCode(65 + (x % 26))}`);

/** The brief as Markdown: place, setting, conditions, analysis, features with squares, hazards and the prompt. */
export function battlePacket(map, { title = "Battle map", place = "", timeWords = "", weatherWords = "", lightWords = "", architecture = "", dossierName = "" } = {}) {
  const rules = SETTINGS[map.setting], a = map.analysis;
  const hazards = map.features.filter((f) => FEATURES[f.kind].hazard);
  return [
    `# ${title}`, "",
    `- Setting: ${rules.label}${map.setting !== a.setting ? "" : ""} (biome: ${map.biome})`,
    `- Place: ${place || `${map.center[0].toFixed(5)}°, ${map.center[1].toFixed(5)}°`}; north at the top`,
    `- Size: ${map.spec.summary}`,
    ...(map.geology?.rock ? [`- Rock: ${map.geology.rock.name}; soil: ${map.geology.soilWords}`, `- Stone and ores: ${map.geology.rock.stone}; ${map.geology.rock.ores.join(", ")}`] : []),
    ...(timeWords ? [`- When: ${timeWords}`] : []), ...(weatherWords ? [`- Weather: ${weatherWords}`] : []), ...(lightWords ? [`- Light: ${lightWords}`] : []), "",
    "## The field", "", ...map.notes.map((n) => `- ${n}`), "",
    "## Features", "",
    ...map.features.map((f) => `- **${FEATURES[f.kind].label}** at ${colName(f.x)}${f.y + 1}${f.w * f.h > 1 ? `–${colName(f.x + f.w - 1)}${f.y + f.h}` : ""}: ${FEATURES[f.kind].move}${FEATURES[f.kind].cover ? `, ${["", "lesser", "standard", "greater"][FEATURES[f.kind].cover]} cover` : ""}${FEATURES[f.kind].concealed ? ", concealment" : ""}${FEATURES[f.kind].heightFt ? `, ${FEATURES[f.kind].heightFt > 0 ? "+" : ""}${FEATURES[f.kind].heightFt} ft` : ""}`),
    ...(map.buildings.length ? [`- **${map.buildings.length} buildings**, each with a door on a street side.`] : []), "",
    ...(hazards.length ? ["## Hazards", "", ...[...new Set(hazards.map((f) => FEATURES[f.kind].hazard))].map((h) => `- ${h}`), ""] : []),
    ...((map.traps ?? []).length ? ["## Hidden traps (GM only; not painted)", "", ...map.traps.map((t) => `- **${FEATURES[t.kind].label}** at ${colName(t.x)}${t.y + 1}: ${t.hazard}`), ""] : []),
    ...(dossierName ? [`## Architecture: ${dossierName}`, "", architecture, ""] : []),
    "## Art direction", "", battleArtDirection(map, { timeWords, weatherWords, architecture }), "",
  ].join("\n");
}

/** Darkness for Foundry from the sun's altitude (0 day, 1 night; twilight in between). */
export function darknessFor(sunAltitudeDeg) {
  if (sunAltitudeDeg == null) return 0;
  if (sunAltitudeDeg >= 6) return 0;
  if (sunAltitudeDeg <= -12) return 0.9;
  return Math.round((0.9 * (6 - sunAltitudeDeg)) / 18 * 100) / 100;
}

/** Foundry's weather effect for the conditions (core effect ids). */
export function weatherEffectFor(conditions = {}) {
  const { precipKind, precipMmH = 0, windMs = 0, thunder = false, fog = false } = conditions;
  if (precipKind === "snow") return windMs > 10 ? "blizzard" : "snow";
  if (precipKind === "rain" || precipKind === "sleet") return thunder || precipMmH > 4 ? "rainStorm" : "rain";
  if (fog) return "fog";
  return "";
}

/** Rectangles covering squares of one class (row runs merged downward). */
function rectangles(columns, rows, test) {
  const runs = [], open = new Map();
  for (let y = 0; y < rows; y += 1) {
    const rowRuns = []; for (let x = 0; x < columns; x += 1) { if (!test(y * columns + x)) continue; const start = x; while (x + 1 < columns && test(y * columns + x + 1)) x += 1; rowRuns.push([start, x]); }
    const next = new Map();
    for (const [a, b] of rowRuns) { const key = `${a},${b}`, prev = open.get(key); if (prev) { prev.h += 1; next.set(key, prev); open.delete(key); } else { const r = { x: a, y, w: b - a + 1, h: 1 }; runs.push(r); next.set(key, r); } }
    open.clear(); for (const [k, v] of next) open.set(k, v);
  }
  return runs;
}

/**
 * The Foundry scene for a battle map: background, 5-ft square grid, walls and doors, terrain regions
 * (difficult, greater difficult, hazardous) and light and weather. `movementCost` adds Foundry's
 * movement-cost behaviour to the regions where the running Foundry has it.
 */
export function battleSceneData(map, { name, imagePath, gridPx = map.spec.gridPx, darkness = 0, weather = "", movementCost = false, notes = "", style = "default" } = {}) {
  const { columns, rows } = map.spec, W = columns * gridPx, H = rows * gridPx, px = (v) => Math.round(v * gridPx);
  const walls = [...map.grid.walls].filter(([, w]) => !w.chamfer).map(([key, w]) => {
    const [x, y, dir] = key.split(",").map((v, k) => (k < 2 ? Number(v) : v)), c = dir === "e" ? [x + 1, y, x + 1, y + 1] : [x, y + 1, x + 1, y + 1];
    return { c: c.map(px), move: 20, sight: 20, light: 20, sound: 20, door: w.door ? 1 : 0, ds: 0 };
  });
  for (const b of map.buildings) for (const c of b.chamfers ?? []) if (c.x >= 0 && c.y >= 0 && c.x < columns && c.y < rows) walls.push({ c: ({ nw: [c.x, c.y + 1, c.x + 1, c.y], ne: [c.x, c.y, c.x + 1, c.y + 1], sw: [c.x, c.y, c.x + 1, c.y + 1], se: [c.x + 1, c.y, c.x, c.y + 1] })[c.corner].map(px), move: 20, sight: 20, light: 20, sound: 20, door: 0, ds: 0 });
  for (const f of map.features) if (FEATURES[f.kind].wall) { const r = [f.x, f.y, f.x + f.w, f.y + f.h].map(px); walls.push({ c: [r[0], r[1], r[2], r[1]], move: 20, sight: 20, light: 20, sound: 20, door: 0, ds: 0 }, { c: [r[2], r[1], r[2], r[3]], move: 20, sight: 20, light: 20, sound: 20, door: 0, ds: 0 }, { c: [r[2], r[3], r[0], r[3]], move: 20, sight: 20, light: 20, sound: 20, door: 0, ds: 0 }, { c: [r[0], r[3], r[0], r[1]], move: 20, sight: 20, light: 20, sound: 20, door: 0, ds: 0 }); }
  // Cliffs: block movement (not sight); Wall Height-style flags give their bottom and top if that module is used.
  for (const c of map.cliffs ?? []) { const e = c.dir === "e" ? [c.x + 1, c.y, c.x + 1, c.y + 1] : [c.x, c.y + 1, c.x + 1, c.y + 1]; walls.push({ c: e.map(px), move: 20, sight: 0, light: 0, sound: 0, door: 0, ds: 0, flags: { "wall-height": { bottom: c.low, top: c.high }, "eym-planet-map": { cliff: true } } }); }
  for (const w of walls) if (!w.flags) { const b = map.buildings.find((x) => w.c[0] / gridPx >= x.x0 && w.c[0] / gridPx <= x.x1 + 1 && w.c[1] / gridPx >= x.y0 && w.c[1] / gridPx <= x.y1 + 1); if (b) { const i = Math.min(map.grid.columns * map.grid.rows - 1, Math.max(0, b.y0) * map.grid.columns + Math.max(0, b.x0)); w.flags = { "wall-height": { bottom: map.grid.levelFt[i], top: map.grid.levelFt[i] + (b.heightFt ?? 10 * (b.storeys ?? 1) + 8) } }; } }
  const region = (label, color, test, multiplier) => {
    const shapes = rectangles(columns, rows, test).map((r) => ({ type: "rectangle", x: px(r.x), y: px(r.y), width: px(r.w), height: px(r.h), rotation: 0, hole: false }));
    if (!shapes.length) return null;
    return { name: label, color, shapes, behaviors: movementCost && multiplier ? [{ type: "modifyMovementCost", name: label, system: { difficulties: { walk: multiplier } } }] : [], visibility: 0 };
  };
  const regions = [
    region("Difficult terrain", "#f2c94c", (i) => map.grid.move[i] === MOVE.difficult, 2),
    region("Greater difficult terrain", "#f2994a", (i) => map.grid.move[i] === MOVE.greater, 3),
    region("Hazardous terrain", "#eb5757", (i) => map.grid.move[i] === MOVE.hazardous, 2),
    region("Deep water (swim)", "#2f80ed", (i) => map.grid.move[i] === MOVE.swim && !map.grid.void[i], null),
    region("Open air: a fall", "#000000", (i) => map.grid.void[i] === 1, null),
    ...[...new Set(map.grid.levelFt)].filter((v) => v !== 0 && v > -60).sort((a, b) => a - b).map((v) => region(`Ground at ${v > 0 ? "+" : ""}${v} ft`, v > 0 ? "#9b51e0" : "#56ccf2", (i) => map.grid.levelFt[i] === v && !map.grid.void[i] && map.grid.move[i] !== MOVE.swim, null)),
    ...(map.traps ?? []).map((t) => ({ name: `Hidden trap: ${FEATURES[t.kind].label}`, color: "#d0342c", shapes: [{ type: "rectangle", x: px(t.x), y: px(t.y), width: px(t.w), height: px(t.h), rotation: 0, hole: false }], behaviors: [], visibility: 0, flags: { "eym-planet-map": { trap: t.hazard } } })),
  ].filter(Boolean);
  // Lights, and the objects standing taller than a light near them (light-blocking walls with their heights).
  const lights = battleLights(map, [], { gridPx, style }), occluders = battleOccluders(map, []);
  return {
    name, width: W, height: H, padding: 0, backgroundColor: "#000000",
    background: { src: imagePath }, grid: { type: 1, size: gridPx, distance: 5, units: "ft" },
    environment: { darknessLevel: map.underground ? (map.dimLight ? 0.6 : 1) : darkness, globalLight: { enabled: !map.underground && darkness < 0.5 } }, darkness: map.underground ? (map.dimLight ? 0.6 : 1) : darkness, weather: map.underground ? "" : weather,
    tokenVision: true, walls: [...walls, ...occluderWalls(occluders, lights, { gridPx }).map(({ levelKeys, ...w }) => w)], regions, lights: lights.map(({ levelKeys, ...l }) => l),
    flags: { "eym-planet-map": { battle: { version: map.version, key: map.key, setting: map.setting, center: map.center, spec: { columns, rows, gridPx }, analysis: map.analysis, notes, extras: (map.extras ?? []).map((e) => e.id), traps: (map.traps ?? []).map((t) => ({ kind: t.kind, x: t.x, y: t.y, hazard: t.hazard })) }, occluders: occluderRecord(occluders) } },
  };
}
