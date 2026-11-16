// Drawing a battle map, briefing the painter and preparing the Foundry scene. Pure functions over the
// map from eym-battle-rules.mjs:
//   battleReferenceSvg — the authoritative layout, text-free and gridless, for the image model;
//   battleTacticalSvg  — the GM's overlay: grid, movement, cover, elevation, deployment, routes, labels;
//   battleArtDirection — the prompt that anchors the painting to the layout;
//   battlePacket       — the whole brief as Markdown;
//   battleSceneData    — a Foundry scene: grid, background, walls and doors, terrain regions, light, weather.

import { FEATURES, MOVE, SETTINGS } from "./eym-battle-settings.mjs";

const GROUND_COLORS = Object.freeze({
  "deep water": "#2f6f96", river: "#4d8fbb", "shallow stream": "#6aa8cf", "frozen stream": "#cfe6f2", sand: "#e2cf98", marsh: "#6e8456", "wet meadow": "#869a5c",
  grass: "#93a862", field: "#c2b26c", scrub: "#7e9150", "forest floor": "#55703f", "bare rock": "#9a9184", snow: "#eef2f4", "deep snow": "#f7fafb", "glacier ice": "#cfe3ee",
  yard: "#a99a7a", road: "#a58a62", "cobbled street": "#9b9488", "dirt lane": "#a88c62", "paved square": "#b3ab9c", floor: "#8a6a4a", "black rock": "#3d3836", "ash and cinders": "#6f6a66",
});
const groundColor = (g) => GROUND_COLORS[g] ?? GROUND_COLORS[g.replace(/ \(mud\)$/, "")] ?? "#93a862";
const MUD = "#6b5a3e";
const f2 = (v) => Number(v).toFixed(2);
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** One feature drawn in square units (x, y top-left; w, h). */
function featureShape(f) {
  const { x, y, w, h } = f, cx = x + w / 2, cy = y + h / 2, def = FEATURES[f.kind], c = def.color;
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
    default: return `<rect x="${f2(x + 0.08)}" y="${f2(y + 0.08)}" width="${f2(w - 0.16)}" height="${f2(h - 0.16)}" rx="${f2(Math.min(w, h) * 0.35)}" fill="${c}"/>`;
  }
}

/** The authoritative layout for the painter: ground, water, buildings, trees, rocks and features; no grid, no text. */
export function battleReferenceSvg(map, gridPx = map.spec.gridPx) {
  const { columns, rows } = map.spec, { grid } = map, out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${columns * gridPx}" height="${rows * gridPx}" viewBox="0 0 ${columns} ${rows}" shape-rendering="geometricPrecision">`];
  for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) {
    const i = y * columns + x, g = grid.ground[i];
    out.push(`<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${groundColor(g)}"/>`);
    if (/\(mud\)$/.test(g)) out.push(`<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${MUD}" fill-opacity="0.35"/>`);
  }
  const line = (pts) => `M${pts.map(([a, b]) => `${f2(a)} ${f2(b)}`).join(" L")}`;
  for (const s of map.site.streams) out.push(`<path d="${line(s.line)}" fill="none" stroke="${s.kind === "river" ? "#4d8fbb" : "#6aa8cf"}" stroke-width="${f2(Math.max(0.6, s.widthSquares))}" stroke-linecap="round" stroke-linejoin="round"/>`);
  for (const o of map.objects) {
    if (o.kind === "tree") out.push(`<circle cx="${f2(o.x)}" cy="${f2(o.y)}" r="${f2(o.size)}" fill="#2f5a2c" fill-opacity="0.88"/>${o.size >= 1 ? `<circle cx="${f2(o.x)}" cy="${f2(o.y)}" r="0.22" fill="#5a3d24"/>` : ""}`);
    else if (o.kind === "bush") out.push(`<circle cx="${f2(o.x)}" cy="${f2(o.y)}" r="${f2(o.size)}" fill="#5d7d3e"/>`);
    else if (o.kind === "boulder") out.push(`<circle cx="${f2(o.x)}" cy="${f2(o.y)}" r="${f2(o.size)}" fill="#8a8378" stroke="#4a443c" stroke-width="0.05"/>`);
  }
  for (const f of map.features) out.push(featureShape(f));
  for (const b of map.buildings) {
    const x0 = Math.max(0, b.x0), y0 = Math.max(0, b.y0), x1 = Math.min(columns - 1, b.x1), y1 = Math.min(rows - 1, b.y1);
    out.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0 + 1}" height="${y1 - y0 + 1}" fill="${b.storeys > 1 ? "#7a4a36" : "#8e5a3e"}" stroke="#2b1d14" stroke-width="0.14"/>`);
  }
  for (const [key, w] of map.grid.walls) if (w.door) { const [x, y, dir] = key.split(","); out.push(dir === "e" ? `<rect x="${Number(x) + 1 - 0.1}" y="${Number(y) + 0.25}" width="0.2" height="0.5" fill="#d9b77a"/>` : `<rect x="${Number(x) + 0.25}" y="${Number(y) + 1 - 0.1}" width="0.5" height="0.2" fill="#d9b77a"/>`); }
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
    if (m === MOVE.difficult) out.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="url(#hatch-d)"/>`);
    else if (m === MOVE.greater) out.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="url(#hatch-g)"/>`);
    else if (m === MOVE.hazardous) out.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="url(#hatch-h)"/>`);
    else if (m === MOVE.impassable) out.push(`<path d="M${x + 0.2} ${y + 0.2} L${x + 0.8} ${y + 0.8} M${x + 0.8} ${y + 0.2} L${x + 0.2} ${y + 0.8}" stroke="#111" stroke-opacity="0.6" stroke-width="0.07"/>`);
    else if (m === MOVE.swim) out.push(`<path d="M${x + 0.15} ${y + 0.5} q0.175 -0.2 0.35 0 t0.35 0" fill="none" stroke="#e0f2ff" stroke-width="0.06"/>`);
    else if (m === MOVE.climb) out.push(`<path d="M${x + 0.3} ${y + 0.75} L${x + 0.5} ${y + 0.3} L${x + 0.7} ${y + 0.75}" fill="none" stroke="#fff" stroke-width="0.08"/>`);
    if (grid.coverGiven[i] > 0) out.push(`<circle cx="${x + 0.84}" cy="${y + 0.16}" r="0.11" fill="${["", "#b8e0ff", "#2f80ed", "#1b3f8a"][grid.coverGiven[i]]}" stroke="#fff" stroke-width="0.03"/>`);
    if (grid.concealed[i]) out.push(`<circle cx="${x + 0.16}" cy="${y + 0.16}" r="0.1" fill="none" stroke="#fff" stroke-width="0.04" stroke-dasharray="0.05 0.04"/>`);
    if (grid.elevationFt[i]) out.push(`<text x="${x + 0.5}" y="${y + 0.92}" font-size="0.26" text-anchor="middle" fill="#fff" stroke="#000" stroke-width="0.04" paint-order="stroke" font-family="sans-serif">${grid.elevationFt[i] > 0 ? "+" : ""}${grid.elevationFt[i]}</text>`);
  }
  for (const [key, w] of grid.walls) { const [x, y, dir] = key.split(",").map((v, k) => (k < 2 ? Number(v) : v)); const [a, b, c, d] = dir === "e" ? [x + 1, y, x + 1, y + 1] : [x, y + 1, x + 1, y + 1]; out.push(`<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="${w.door ? "#f2c94c" : "#111"}" stroke-width="${w.door ? 0.14 : 0.1}"/>`); }
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
  const grounds = [...new Set(map.grid.ground)].map((g) => `${groundColor(g)} = ${g}`);
  const things = [...new Set(map.features.map((f) => `${FEATURES[f.kind].color} = ${FEATURES[f.kind].words ?? FEATURES[f.kind].label}`))];
  if (map.objects.some((o) => o.kind === "tree")) things.push("dark green discs = tree canopies (a brown dot marks a big trunk)");
  if (map.objects.some((o) => o.kind === "bush")) things.push("small mid-green discs = bushes");
  if (map.objects.some((o) => o.kind === "boulder")) things.push("grey discs = boulders and stones");
  if (map.buildings.length) things.push("brown rectangles with dark outlines = buildings seen from above (roofs); gold marks on their edges = doors");
  if (map.site.streams.length) things.push("blue bands = water (streams and rivers)");
  return [...grounds, ...things];
}

/** The prompt: paint over the layout, keep everything where it is, a clean top-down battle map, no grid or text. */
export function battleArtDirection(map, { timeWords = "", weatherWords = "", architecture = "" } = {}) {
  const rules = SETTINGS[map.setting], { columns, rows, widthPx, heightPx } = map.spec;
  const chosen = (map.extras ?? []).map((e) => `${e.label.toLowerCase()} in ${e.at}`);
  return [
    `Paint a top-down (orthographic, straight down) fantasy tabletop battle map in a rich, detailed, painterly digital style like professional virtual-tabletop battle maps: natural textures, soft shadows cast toward the lower right, readable shapes.`,
    `The setting: ${rules.words}.${timeWords ? ` ${timeWords}` : ""}${weatherWords ? ` ${weatherWords}` : ""} Paint in even, clear daylight so the map reads well; lighting is added in play.`,
    `The attached reference image is the authoritative layout of the battlefield, ${columns} by ${rows} squares of 5 feet (${columns * 5} by ${rows * 5} feet). Keep every building footprint, wall, door, tree trunk, boulder, log, wall, ridge, hazard, water edge, road and street exactly where it is, at the same size and shape: the game rules depend on them. Do not add, remove, move or merge any obstacle, building, water or path. You may add small surface detail (grass tufts, pebbles, leaf litter, cracks, roof tiles) that does not change what blocks or slows movement.`,
    `Colours in the reference mean: ${legend(map).join("; ")}. Paint each as the real thing, not as flat colour.`,
    ...(chosen.length ? [`The map must clearly show these features, where the reference has them: ${chosen.join("; ")}.`] : []),
    ...(architecture ? [architecture] : []),
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
export function battleSceneData(map, { name, imagePath, gridPx = map.spec.gridPx, darkness = 0, weather = "", movementCost = false, notes = "" } = {}) {
  const { columns, rows } = map.spec, W = columns * gridPx, H = rows * gridPx, px = (v) => Math.round(v * gridPx);
  const walls = [...map.grid.walls].map(([key, w]) => {
    const [x, y, dir] = key.split(",").map((v, k) => (k < 2 ? Number(v) : v)), c = dir === "e" ? [x + 1, y, x + 1, y + 1] : [x, y + 1, x + 1, y + 1];
    return { c: c.map(px), move: 20, sight: 20, light: 20, sound: 20, door: w.door ? 1 : 0, ds: 0 };
  });
  for (const f of map.features) if (FEATURES[f.kind].wall) { const r = [f.x, f.y, f.x + f.w, f.y + f.h].map(px); walls.push({ c: [r[0], r[1], r[2], r[1]], move: 20, sight: 20, light: 20, sound: 20, door: 0, ds: 0 }, { c: [r[2], r[1], r[2], r[3]], move: 20, sight: 20, light: 20, sound: 20, door: 0, ds: 0 }, { c: [r[2], r[3], r[0], r[3]], move: 20, sight: 20, light: 20, sound: 20, door: 0, ds: 0 }, { c: [r[0], r[3], r[0], r[1]], move: 20, sight: 20, light: 20, sound: 20, door: 0, ds: 0 }); }
  const region = (label, color, test, multiplier) => {
    const shapes = rectangles(columns, rows, test).map((r) => ({ type: "rectangle", x: px(r.x), y: px(r.y), width: px(r.w), height: px(r.h), rotation: 0, hole: false }));
    if (!shapes.length) return null;
    return { name: label, color, shapes, behaviors: movementCost && multiplier ? [{ type: "modifyMovementCost", name: label, system: { difficulties: { walk: multiplier } } }] : [], visibility: 0 };
  };
  const regions = [
    region("Difficult terrain", "#f2c94c", (i) => map.grid.move[i] === MOVE.difficult, 2),
    region("Greater difficult terrain", "#f2994a", (i) => map.grid.move[i] === MOVE.greater, 3),
    region("Hazardous terrain", "#eb5757", (i) => map.grid.move[i] === MOVE.hazardous, 2),
    region("Deep water (swim)", "#2f80ed", (i) => map.grid.move[i] === MOVE.swim, null),
    ...(map.traps ?? []).map((t) => ({ name: `Hidden trap: ${FEATURES[t.kind].label}`, color: "#d0342c", shapes: [{ type: "rectangle", x: px(t.x), y: px(t.y), width: px(t.w), height: px(t.h), rotation: 0, hole: false }], behaviors: [], visibility: 0, flags: { "eym-planet-map": { trap: t.hazard } } })),
  ].filter(Boolean);
  return {
    name, width: W, height: H, padding: 0, backgroundColor: "#000000",
    background: { src: imagePath }, grid: { type: 1, size: gridPx, distance: 5, units: "ft" },
    environment: { darknessLevel: darkness, globalLight: { enabled: darkness < 0.5 } }, darkness, weather,
    tokenVision: true, walls, regions,
    flags: { "eym-planet-map": { battle: { version: map.version, key: map.key, setting: map.setting, center: map.center, spec: { columns, rows, gridPx }, analysis: map.analysis, notes, extras: (map.extras ?? []).map((e) => e.id), traps: (map.traps ?? []).map((t) => ({ kind: t.kind, x: t.x, y: t.y, hazard: t.hazard })) } } },
  };
}
