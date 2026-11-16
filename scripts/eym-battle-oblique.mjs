// Three-quarter (oblique) drawing for battle maps: the ground is seen from above, but everything that
// stands up shows its top and its south-facing side, so heights can be read at a glance — the way
// classic 2D role-playing games draw towns. The ground contact of every object stays on its squares;
// its side rises toward the top of the image, one square of picture for every 10 ft of height (capped).
//
//   - Buildings fit inside their footprint: a front wall with windows and door along the south, the roof
//     above it (so the roof layer in Foundry covers exactly the building's squares).
//   - Trees, pillars, standing stones, towers and other tall narrow things rise above their base square.
//   - Cliffs and ledges facing south show a rock face; island edges hang rock into the void; quays show
//     their stone face above the water.
// Everything that stands is drawn from north to south, so nearer things overlap farther ones.

const f2 = (v) => Number(v).toFixed(2);
export const FT_PER_SQUARE_RISE = 10;
const MAX_RISE = 3;

/** Darken (k < 0) or lighten (k > 0) a #rrggbb colour. */
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16), ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k));
  return `#${ch.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0")).join("")}`;
}

/** How tall a feature stands, for drawing (ft); 0 means it lies flat. */
const SHAPE_HEIGHT = Object.freeze({ hedge: 6, wall: 4, fence: 4, palisade: 10, crate: 5, cart: 5, stall: 8, tent: 7, round: 4, dots: 3, blob: 4, log: 2, shrine: 8, tower: 20, trunk: 60, crystal: 8, mushroom: 15, rect: 4, stakes: 4, graves: 2 });
const FLAT_KINDS = new Set(["pool", "bog", "tide-pools", "ash-field", "quicksand", "tall-grass", "glowing-pool", "sacred-spring", "fey-ring", "ley-nexus", "magic-circle", "teleport-circle", "levitation-disc", "planar-rift", "temple-ruin", "glowing-mushrooms", "garden", "graveyard", "stairs", "dock", "boardwalk", "trapdoor", "dungeon-entrance", "mine-entrance", "cave-mouth", "campfire", "lava-channel", "ditch", "trench", "hollow", "scree", "cooled-flow", "snowdrift", "thin-ice"]);
export function standHeightFt(kind, def) {
  if (FLAT_KINDS.has(kind)) return 0;
  if (def.heightFt > 0) return def.heightFt;
  if (def.solidFt) return Math.min(def.solidFt, 40);
  if (def.canopyFt) return def.canopyFt;
  return SHAPE_HEIGHT[def.shape] ?? 0;
}
const rise = (ft) => Math.min(MAX_RISE, ft / FT_PER_SQUARE_RISE);

/** A standing feature: its side (darker) from its footprint's south edge up, its top drawn raised. */
export function obliqueFeature(f, def, topSvg) {
  const r = rise(standHeightFt(f.kind, def)), { x, y, w, h } = f, side = shade(def.color, -0.38);
  const round = ["round", "tree", "mushroom", "trunk", "crystal"].includes(def.shape);
  const face = round
    ? `<rect x="${f2(x + w * 0.1)}" y="${f2(y + h / 2 - r)}" width="${f2(w * 0.8)}" height="${f2(r)}" fill="${side}"/><ellipse cx="${f2(x + w / 2)}" cy="${f2(y + h / 2)}" rx="${f2(w * 0.4)}" ry="${f2(h * 0.22)}" fill="${side}"/>`
    : `<rect x="${f2(x + 0.06)}" y="${f2(y + h - r - 0.06)}" width="${f2(w - 0.12)}" height="${f2(r)}" fill="${side}"/><line x1="${f2(x + 0.06)}" y1="${f2(y + h - 0.06)}" x2="${f2(x + w - 0.06)}" y2="${f2(y + h - 0.06)}" stroke="${shade(def.color, -0.6)}" stroke-width="0.05"/>`;
  return `<g>${face}<g transform="translate(0 ${f2(-r)})">${topSvg}</g></g>`;
}

/** A tree from its base point: a trunk rising, a two-tone crown above it. */
export function obliqueTree(o) {
  const s = o.size, trunkW = 0.14 + 0.1 * s, trunkH = 0.35 + 0.45 * s, cy = o.y - trunkH - s * 0.55;
  return `<g><ellipse cx="${f2(o.x)}" cy="${f2(o.y)}" rx="${f2(s * 0.55)}" ry="${f2(s * 0.18)}" fill="#000" fill-opacity="0.22"/>`
    + `<rect x="${f2(o.x - trunkW / 2)}" y="${f2(o.y - trunkH)}" width="${f2(trunkW)}" height="${f2(trunkH)}" fill="#5a3d24"/>`
    + `<circle cx="${f2(o.x)}" cy="${f2(cy)}" r="${f2(s)}" fill="#2a5227"/><circle cx="${f2(o.x - s * 0.22)}" cy="${f2(cy - s * 0.22)}" r="${f2(s * 0.62)}" fill="#3b6e33"/></g>`;
}
export function obliqueBush(o) {
  const s = o.size;
  return `<g><ellipse cx="${f2(o.x)}" cy="${f2(o.y)}" rx="${f2(s)}" ry="${f2(s * 0.45)}" fill="#3f5e2a"/><ellipse cx="${f2(o.x)}" cy="${f2(o.y - s * 0.35)}" rx="${f2(s * 0.85)}" ry="${f2(s * 0.6)}" fill="#5d7d3e"/></g>`;
}
export function obliqueBoulder(o) {
  const s = o.size;
  return `<g><ellipse cx="${f2(o.x)}" cy="${f2(o.y)}" rx="${f2(s)}" ry="${f2(s * 0.5)}" fill="#5f5850"/><ellipse cx="${f2(o.x)}" cy="${f2(o.y - s * 0.45)}" rx="${f2(s * 0.9)}" ry="${f2(s * 0.65)}" fill="#8f877c"/></g>`;
}

const BUILDING_LOOK = Object.freeze({
  temple: { wall: "#e6e0d2", roof: "#5f7f9a", trim: "#b8b0a0" },
  mausoleum: { wall: "#a8a49a", roof: "#77736a", trim: "#5e5a52" },
  "rock-cut dwelling": { wall: "#c9a678", roof: "#a8875e", trim: "#7a5a3a" },
  house: { wall: "#d8cbb0", roof: "#b8583c", trim: "#6e4a2a" },
  building: { wall: "#d8cbb0", roof: "#b8583c", trim: "#6e4a2a" },
});

/** A building inside its footprint: roof to the north, front wall (windows, door) along the south. */
export function obliqueBuilding(b, columns, rows) {
  const x0 = Math.max(0, b.x0), y0 = Math.max(0, b.y0), x1 = Math.min(columns - 1, b.x1), y1 = Math.min(rows - 1, b.y1), w = x1 - x0 + 1, d = y1 - y0 + 1;
  const look = BUILDING_LOOK[b.label] ?? BUILDING_LOOK.building, storeys = b.storeys ?? 1;
  const fh = Math.min(0.85 * storeys, Math.max(0.6, d * 0.45)), top = y1 + 1 - fh, parts = [];
  // Roof: hipped, so its edges run on diagonals — far slope lit, near slope mid, the hips at the ends darker.
  const rd = top - y0, mid = y0 + rd / 2, hip = Math.min(rd / 2, w / 2), r = look.roof;
  if (b.label === "rock-cut dwelling") parts.push(`<rect x="${x0}" y="${y0}" width="${w}" height="${f2(rd)}" fill="${shade(r, 0.05)}"/>`);
  else parts.push(
    `<path d="M${x0} ${y0} L${x0 + w} ${y0} L${f2(x0 + w - hip)} ${f2(mid)} L${f2(x0 + hip)} ${f2(mid)} Z" fill="${shade(r, 0.16)}"/>`,
    `<path d="M${f2(x0 + hip)} ${f2(mid)} L${f2(x0 + w - hip)} ${f2(mid)} L${x0 + w} ${f2(top)} L${x0} ${f2(top)} Z" fill="${r}"/>`,
    `<path d="M${x0} ${y0} L${f2(x0 + hip)} ${f2(mid)} L${x0} ${f2(top)} Z" fill="${shade(r, -0.12)}"/><path d="M${x0 + w} ${y0} L${f2(x0 + w - hip)} ${f2(mid)} L${x0 + w} ${f2(top)} Z" fill="${shade(r, -0.22)}"/>`,
    `<path d="M${x0} ${y0} L${f2(x0 + hip)} ${f2(mid)} L${f2(x0 + w - hip)} ${f2(mid)} L${x0 + w} ${y0} M${x0} ${f2(top)} L${f2(x0 + hip)} ${f2(mid)} M${x0 + w} ${f2(top)} L${f2(x0 + w - hip)} ${f2(mid)}" fill="none" stroke="${shade(r, -0.4)}" stroke-width="0.06"/>`,
  );
  parts.push(`<rect x="${x0 - 0.05}" y="${f2(top - 0.12)}" width="${w + 0.1}" height="0.14" fill="${shade(r, -0.45)}"/>`);
  // Front wall, one band per storey, with windows; the door if the door is on the front.
  parts.push(`<rect x="${x0}" y="${f2(top)}" width="${w}" height="${f2(fh)}" fill="${look.wall}"/>`);
  const band = fh / storeys;
  for (let s = 0; s < storeys; s += 1) for (let k = 0; k < w; k += 1) {
    const wx = x0 + k + 0.32, wy = top + s * band + band * 0.22, doorHere = b.door === "s" && s === storeys - 1 && k === Math.floor(((b.x0 + b.x1) / 2) - x0);
    if (doorHere) parts.push(`<rect x="${f2(x0 + k + 0.3)}" y="${f2(top + fh - band * 0.78)}" width="0.4" height="${f2(band * 0.78)}" fill="${look.trim}"/><rect x="${f2(x0 + k + 0.3)}" y="${f2(top + fh - band * 0.78)}" width="0.4" height="0.06" fill="#d9b77a"/>`);
    else if (b.label === "temple") parts.push(`<rect x="${f2(x0 + k + 0.4)}" y="${f2(top + s * band)}" width="0.2" height="${f2(band)}" fill="${shade(look.wall, -0.12)}"/>`);
    else if (b.label !== "mausoleum") parts.push(`<rect x="${f2(wx)}" y="${f2(wy)}" width="0.36" height="${f2(band * 0.4)}" fill="#7fb6d6" stroke="${look.trim}" stroke-width="0.04"/>`);
  }
  parts.push(`<rect x="${x0}" y="${f2(top)}" width="${w}" height="${f2(fh)}" fill="none" stroke="#2b1d14" stroke-width="0.07"/><rect x="${x0}" y="${y0}" width="${w}" height="${d}" fill="none" stroke="#2b1d14" stroke-width="0.1"/>`);
  return `<g>${parts.join("")}</g>`;
}

/**
 * Faces where the ground steps down to the south: a rock face on the upper square's south edge, stone
 * quays over water, and rock hanging below island edges into the void. Uses the sculpted levels only
 * (natural slopes are shaded, not cut into steps).
 */
export function obliqueFaces(grid) {
  const { columns, rows } = grid, out = [];
  for (let y = 0; y < rows - 1; y += 1) for (let x = 0; x < columns; x += 1) {
    const i = y * columns + x, j = i + columns;
    if (grid.void[j] && !grid.void[i]) {
      // Rock hanging below an island's edge, its depth varying along the rim so the underside looks natural.
      const v = (k) => ((Math.imul(x * 73 + k * 19, 2654435761) ^ (y * 40503)) >>> 0) / 4294967296, d1 = 0.5 + 0.6 * v(1), d2 = 0.7 + 0.9 * v(2), tip = 0.3 + 0.4 * v(3);
      out.push({ y: y + 1, svg: `<path d="M${x} ${y + 1} L${x + 1} ${y + 1} L${f2(x + 0.9)} ${f2(y + 1 + d1)} L${f2(x + tip)} ${f2(y + 1 + d2)} L${f2(x + 0.1)} ${f2(y + 1 + d1 * 0.8)} Z" fill="#6e6458"/><path d="M${f2(x + tip)} ${f2(y + 1 + d2)} L${f2(x + 0.9)} ${f2(y + 1 + d1)} L${x + 1} ${y + 1} L${f2(x + 0.6)} ${y + 1} Z" fill="#544b41"/><line x1="${x}" y1="${y + 1}" x2="${x + 1}" y2="${y + 1}" stroke="#3e362e" stroke-width="0.06"/>` });
      continue;
    }
    if (grid.void[i] || grid.void[j]) continue;
    const drop = grid.levelFt[i] - grid.levelFt[j]; if (drop < 5 || grid.ramp[i] || grid.ramp[j]) continue;
    const water = grid.move[j] === "swim" || grid.water?.[j];
    const fh = water ? 0.3 : Math.min(0.95, 0.25 + drop / 30), fy = water ? y + 1 : y + 1 - fh;
    const color = water ? "#b9b2a4" : "#8a7a66", stripes = Array.from({ length: 3 }, (_, k) => `<line x1="${f2(x + 0.2 + k * 0.3)}" y1="${f2(fy + 0.05)}" x2="${f2(x + 0.15 + k * 0.3)}" y2="${f2(fy + fh - 0.05)}" stroke="${shade(color, -0.3)}" stroke-width="0.04"/>`).join("");
    out.push({ y: y + 1, svg: `<rect x="${x}" y="${f2(fy)}" width="1.02" height="${f2(fh)}" fill="${color}"/>${stripes}<line x1="${x}" y1="${f2(fy)}" x2="${x + 1}" y2="${f2(fy)}" stroke="${shade(color, 0.35)}" stroke-width="0.05"/>` });
  }
  return out;
}
