// Deterministic reference maps of Eym at any level — the whole planet, a continent, a region or the
// country around a town — drawn from the accepted cartography (vector coastlines, terrain overlays,
// lakes, rivers, biomes, settlements and names). Two layers: a base map with no text, which is what an
// image model paints over (it treats the base as structurally authoritative), and a label layer with
// names, scale bar and compass, laid over the result afterwards so the names stay exact.

import { greatCircleKm, toLocal } from "./eym-surface.mjs";

const DEG = Math.PI / 180;
const BIOME_COLORS = Object.freeze({
  "tropical-rainforest": "#3d6b38", "seasonal-forest": "#6c8c48", savanna: "#b3a05c", steppe: "#a59d68", "temperate-forest": "#4c7743",
  "temperate-rainforest": "#3c684d", taiga: "#4b634f", tundra: "#98a089", "ice-cap": "#e9eef0", "cold-desert": "#b5a888", "hot-desert": "#d0b575",
});
const DETAIL_STYLE = Object.freeze({ forest: ["#2d5a2e", 0.55], upland: ["#b39a69", 0.5], mountains: ["#876b52", 0.78], peaks: ["#f3f3f0", 0.92] });
const OCEAN = "#26526d", SHALLOWS = "#3f7d98", LAND = "#8ea66a", WATER = "#5b9bc4", WATER_EDGE = "#2f5f80", COAST = "#1b3242";
const LABEL_STYLE = Object.freeze({
  continent: { size: 34, weight: 700, spacing: 6, fill: "#f6ecd2", italic: false },
  region: { size: 20, weight: 600, spacing: 3, fill: "#f3dfae", italic: true },
  range: { size: 15, weight: 600, spacing: 2, fill: "#5a3d22", italic: false },
  mountain: { size: 13, weight: 600, spacing: 0, fill: "#5a3d22", italic: false },
  hills: { size: 13, weight: 600, spacing: 1, fill: "#5a3d22", italic: false },
  lake: { size: 13, weight: 500, spacing: 0, fill: "#173f63", italic: true },
  river: { size: 12, weight: 500, spacing: 0, fill: "#173f63", italic: true },
  forest: { size: 13, weight: 500, spacing: 1, fill: "#1d3d1f", italic: true },
  valley: { size: 13, weight: 500, spacing: 1, fill: "#3b3a1e", italic: true },
  grove: { size: 12, weight: 500, spacing: 0, fill: "#1d3d1f", italic: true },
  islands: { size: 13, weight: 500, spacing: 1, fill: "#173f63", italic: true },
  capital: { size: 16, weight: 700, spacing: 0, fill: "#2a1708", italic: false },
  city: { size: 13, weight: 600, spacing: 0, fill: "#2a1708", italic: false },
  town: { size: 11, weight: 500, spacing: 0, fill: "#2a1708", italic: false },
  fort: { size: 11, weight: 500, spacing: 0, fill: "#4a1a10", italic: false },
  port: { size: 11, weight: 500, spacing: 0, fill: "#173f63", italic: false },
  village: { size: 10, weight: 500, spacing: 0, fill: "#2a1708", italic: false },
});
const LABEL_PRIORITY = ["continent", "capital", "region", "range", "city", "lake", "river", "mountain", "hills", "forest", "valley", "islands", "port", "fort", "town", "grove", "village"];
const xml = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const f1 = (n) => (Math.round(n * 10) / 10).toString();

// ---------------------------------------------------------------- framing

/** The map frame: a projection from [lat, lon] to image pixels, and what it covers. */
export function referenceFrame(asset, spec, { center = [0, 0], continentId = null } = {}) {
  const { widthPx: W, heightPx: H } = spec;
  if (spec.level === "planet") {
    return { level: "planet", W, H, center: [0, 0], kmPerPx: 40030 / W, project: ([lat, lon]) => [(lon + 180) / 360 * W, (90 - lat) / 180 * H], visible: () => true, wraps: true };
  }
  let c = center, kmPerPx = spec.acrossKm ? spec.acrossKm / W : null;
  if (spec.level === "continent" || !kmPerPx) {
    // Fit the continent (mainland and its islands) with a margin.
    const name = asset.gazetteer.find((g) => g.featureClass === "continent" && (g.id === `continent-${continentId}` || g.properName === continentId))?.properName;
    const coasts = asset.terrain.coastlines.filter((line) => line.continent === name);
    const mainland = coasts.find((line) => line.kind === "mainland");
    if (!mainland) throw new Error(`No continent ${continentId}`);
    const lat = mainland.points.reduce((s, p) => s + p[0], 0) / mainland.points.length, lonRef = mainland.points[0][1];
    const lon = lonRef + mainland.points.reduce((s, p) => s + (((p[1] - lonRef + 540) % 360) - 180), 0) / mainland.points.length;
    c = [lat, ((lon + 540) % 360) - 180];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const line of coasts) for (const p of line.points) { if (greatCircleKm(p, c) > 4000) continue; const [x, y] = toLocal(c, p[0], p[1]); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    kmPerPx = Math.max((maxX - minX) / W, (maxY - minY) / H) * 1.12;
    c = [c[0] + cy / 111.2, c[1] + cx / (111.2 * Math.max(0.2, Math.cos(c[0] * DEG)))];
  }
  const reachKm = Math.hypot(W, H) * kmPerPx * 0.75;
  return {
    level: spec.level, W, H, center: c, kmPerPx,
    project: ([lat, lon]) => { const [x, y] = toLocal(c, lat, lon); return [W / 2 + x / kmPerPx, H / 2 - y / kmPerPx]; },
    visible: ([lat, lon]) => greatCircleKm([lat, lon], c) < reachKm,
    wraps: false,
  };
}

// ---------------------------------------------------------------- geometry

function ringPath(frame, ring, closed = true) {
  if (!ring?.length) return "";
  const W = frame.W, H = frame.H, pad = Math.max(W, H) * 0.25;
  // Skip rings on the far side of the world; nearer ones are culled by their projected extent below,
  // which keeps a coastline that lies wholly outside the view but encloses it.
  if (!frame.wraps && !ring.some((p) => greatCircleKm(p, frame.center) < 6000)) return "";
  const pts = [];
  let last = null, lonPrev = null;
  // Keep every point (far ones simply land off the image); dropping them would cut chords across the map.
  for (const p of ring) {
    let [x, y] = frame.project(p);
    if (frame.wraps && lonPrev != null && Math.abs(p[1] - lonPrev) > 180) { pts.push(null); }
    lonPrev = p[1];
    if (last && Math.abs(x - last[0]) < 0.6 && Math.abs(y - last[1]) < 0.6) continue;
    pts.push([x, y]); last = [x, y];
  }
  const real = pts.filter(Boolean);
  if (real.length < 2) return "";
  const xs = real.map((p) => p[0]), ys = real.map((p) => p[1]);
  if (Math.max(...xs) < -pad || Math.min(...xs) > W + pad || Math.max(...ys) < -pad || Math.min(...ys) > H + pad) return "";
  let d = "", pen = false;
  for (const p of pts) { if (!p) { pen = false; continue; } d += `${pen ? "L" : "M"}${f1(p[0])} ${f1(p[1])}`; pen = true; }
  return closed && !pts.includes(null) ? `${d}Z` : d;
}

const multiPath = (frame, rings, closed = true) => rings.map((ring) => ringPath(frame, ring, closed)).filter(Boolean).join(" ");

// ---------------------------------------------------------------- the two layers

/** The base map: land, biomes, relief, forests, water and settlement marks — no text. */
export function referenceBaseSvg(asset, frame) {
  const { W, H } = frame, coasts = asset.terrain.coastlines;
  const land = multiPath(frame, coasts.map((c) => c.points));
  const parts = [
    `<rect width="${W}" height="${H}" fill="${OCEAN}"/>`,
    `<path d="${land}" fill="none" stroke="${SHALLOWS}" stroke-width="${f1(Math.max(4, 60 / frame.kmPerPx))}" stroke-linejoin="round" opacity=".55"/>`,
    `<defs><clipPath id="eym-land"><path d="${land}" clip-rule="evenodd"/></clipPath></defs>`,
    `<path d="${land}" fill="${LAND}" fill-rule="evenodd"/>`,
  ];
  const biome = asset.regions.ecoregions.filter((r) => BIOME_COLORS[r.category]);
  parts.push(`<g clip-path="url(#eym-land)">`);
  for (const region of biome) { const d = multiPath(frame, region.polygons); if (d) parts.push(`<path d="${d}" fill="${BIOME_COLORS[region.category]}" fill-rule="evenodd"/>`); }
  for (const kind of ["forest", "upland", "mountains", "peaks"]) for (const detail of (asset.terrain.detail ?? []).filter((d) => d.kind === kind)) {
    const d = multiPath(frame, detail.rings); if (d) parts.push(`<path d="${d}" fill="${DETAIL_STYLE[kind][0]}" fill-opacity="${DETAIL_STYLE[kind][1]}" fill-rule="evenodd"/>`);
  }
  parts.push(`</g>`);
  for (const lake of asset.hydrology.lakes) { const d = multiPath(frame, [lake.polygon, ...(lake.islands ?? [])]); if (d) parts.push(`<path d="${d}" fill="${WATER}" fill-rule="evenodd" stroke="${WATER_EDGE}" stroke-width="1"/>`); }
  for (const river of asset.hydrology.rivers) { const d = ringPath(frame, river.points, false); if (d) parts.push(`<path d="${d}" fill="none" stroke="${WATER}" stroke-width="${f1(Math.min(4, 0.8 + Math.log10(1 + river.dischargeIndex)))}" stroke-linecap="round" stroke-linejoin="round"/>`); }
  parts.push(`<path d="${land}" fill="none" stroke="${COAST}" stroke-width="1.3" stroke-linejoin="round"/>`);
  // Relief, forests and settlements as small three-quarter-view drawings (never flat symbols), north to south.
  const glyphs = terrainGlyphs(asset, frame);
  const markSize = { capital: 6, city: 4.5, port: 3.5, fort: 3.5, town: 3, village: 2.2 };
  for (const site of asset.settlements) {
    if (frame.level === "planet" && site.kind !== "capital") continue;
    if (frame.level === "continent" && !["capital", "city"].includes(site.kind)) continue;
    if (!frame.wraps && !frame.visible([site.lat, site.lon])) continue;
    const [x, y] = frame.project([site.lat, site.lon]); if (x < 0 || y < 0 || x > W || y > H) continue;
    glyphs.push({ y, svg: settlementGlyph(site.kind, x, y, (markSize[site.kind] ?? 3) * 1.6) });
  }
  glyphs.sort((a, b) => a.y - b.y);
  for (const g of glyphs) parts.push(g.svg);
  return parts.join("");
}

/** Named features inside the frame, in label priority order. */
export function visibleFeatures(asset, frame, classes) {
  const { W, H } = frame, wanted = new Set(classes), out = [];
  const consider = (item, featureClass, at) => {
    if (!wanted.has(featureClass) || !item.properName) return;
    if (!frame.wraps && !frame.visible(at)) return;
    const [x, y] = frame.project(at);
    if (x < 8 || y < 8 || x > W - 8 || y > H - 8) return;
    out.push({ name: item.properName, featureClass, x, y, at, confidence: item.confidence ?? "high", kind: item.kind ?? featureClass });
  };
  for (const g of asset.gazetteer) consider(g, g.featureClass, g.at);
  for (const s of asset.settlements) consider(s, s.kind, [s.lat, s.lon]);
  return out.sort((a, b) => LABEL_PRIORITY.indexOf(a.featureClass) - LABEL_PRIORITY.indexOf(b.featureClass));
}

/** The label layer: names (placed without overlaps), a scale bar and a north arrow. */
export function referenceLabelSvg(asset, frame, spec, { title = "" } = {}) {
  const { W, H } = frame, placed = [], parts = [];
  const features = visibleFeatures(asset, frame, spec.labels);
  const scaleText = Math.max(0.8, Math.min(1.6, W / 1536));
  for (const f of features) {
    const style = LABEL_STYLE[f.featureClass] ?? LABEL_STYLE.town, size = style.size * scaleText;
    const settlement = ["capital", "city", "town", "fort", "port", "village"].includes(f.featureClass);
    const text = style.spacing > 2 ? f.name.toUpperCase() : f.name;
    const width = text.length * size * 0.56 + text.length * style.spacing, x = settlement ? f.x + 7 : f.x - width / 2, y = settlement ? f.y + size * 0.35 : f.y + size * 0.35;
    const box = [x - 2, y - size, x + width + 2, y + 4];
    if (box[0] < 2 || box[2] > W - 2 || box[1] < 2 || box[3] > H - 2) continue;
    if (placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
    placed.push(box);
    parts.push(`<text x="${f1(x)}" y="${f1(y)}" font-size="${f1(size)}" font-weight="${style.weight}" letter-spacing="${style.spacing}"${style.italic ? ` font-style="italic"` : ""} fill="${style.fill}" stroke="rgba(246,238,216,.85)" stroke-width="${f1(size / 5)}" paint-order="stroke">${xml(text)}</text>`);
  }
  // Scale bar (not on the planet view, whose scale varies with latitude) and north arrow.
  if (frame.level !== "planet") {
    const miles = frame.kmPerPx * W / 1.609344 / 5, nice = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].reduce((best, n) => (Math.abs(n - miles) < Math.abs(best - miles) ? n : best), 1);
    const len = nice * 1.609344 / frame.kmPerPx, x0 = 28, y0 = H - 30;
    parts.push(`<g font-size="13" fill="#2a1708" stroke="rgba(246,238,216,.9)" stroke-width="3" paint-order="stroke"><rect x="${x0}" y="${y0}" width="${f1(len)}" height="6" fill="#2a1708" stroke="#f6eed8" stroke-width="1.5"/><rect x="${x0}" y="${y0}" width="${f1(len / 2)}" height="6" fill="#f6eed8" stroke="none"/><text x="${x0}" y="${y0 - 6}">0</text><text x="${f1(x0 + len)}" y="${y0 - 6}" text-anchor="middle">${nice} mi</text></g>`);
    parts.push(`<g transform="translate(${W - 46} 54)"><path d="M0 -26 L9 6 L0 0 L-9 6 Z" fill="#2a1708" stroke="#f6eed8" stroke-width="1.5"/><text y="24" text-anchor="middle" font-size="16" font-weight="700" fill="#2a1708" stroke="rgba(246,238,216,.9)" stroke-width="3" paint-order="stroke">N</text></g>`);
  }
  if (title) parts.push(`<text x="${W / 2}" y="34" text-anchor="middle" font-size="${f1(26 * scaleText)}" font-weight="700" letter-spacing="3" fill="#2a1708" stroke="rgba(246,238,216,.92)" stroke-width="5" paint-order="stroke">${xml(title.toUpperCase())}</text>`);
  return { svg: parts.join(""), features, placed: placed.length };
}

/** Both layers as complete SVG documents, ready to rasterize. */
export function buildReferenceMap(asset, spec, options = {}) {
  const frame = referenceFrame(asset, spec, options);
  const base = referenceBaseSvg(asset, frame);
  const labels = referenceLabelSvg(asset, frame, spec, { title: options.title ?? "" });
  const wrap = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.W}" height="${frame.H}" viewBox="0 0 ${frame.W} ${frame.H}" font-family="Georgia, 'Palatino Linotype', serif">${body}</svg>`;
  return { frame, baseSvg: wrap(base), labelSvg: wrap(labels.svg), labelledSvg: wrap(base + labels.svg), features: labels.features };
}

// ---------------------------------------------------------------- three-quarter-view glyphs

const ghash = (a, b, k) => { let h = Math.imul(Math.round(a * 7.13) ^ Math.imul(Math.round(b * 3.71), 73856093), 19349663) ^ k; h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
const GLYPH = Object.freeze({ peaks: { spacing: 0.024, size: 0.02 }, mountains: { spacing: 0.024, size: 0.018 }, upland: { spacing: 0.03, size: 0.016 }, forest: { spacing: 0.014, size: 0.009 } });

/** A peak or mountain: a lit west face, a shaded east face, snow on the high ones; its foot on the ground. */
function mountainGlyph(x, y, s, snow) {
  const top = y - s * 0.9, left = x - s * 0.65, right = x + s * 0.65, tipx = x + s * 0.05;
  return `<path d="M${f1(left)} ${f1(y)} L${f1(tipx)} ${f1(top)} L${f1(x)} ${f1(y)} Z" fill="#b8a283"/><path d="M${f1(x)} ${f1(y)} L${f1(tipx)} ${f1(top)} L${f1(right)} ${f1(y)} Z" fill="#6f5a45"/>`
    + (snow ? `<path d="M${f1(tipx - s * 0.2)} ${f1(top + s * 0.3)} L${f1(tipx)} ${f1(top)} L${f1(tipx + s * 0.22)} ${f1(top + s * 0.3)} L${f1(tipx + s * 0.05)} ${f1(top + s * 0.22)} Z" fill="#f4f4f0"/>` : "")
    + `<path d="M${f1(left)} ${f1(y)} L${f1(tipx)} ${f1(top)} L${f1(right)} ${f1(y)}" fill="none" stroke="#3e3226" stroke-width="0.8"/>`;
}
/** A hill: a low two-tone mound. */
function hillGlyph(x, y, s) { return `<path d="M${f1(x - s * 0.7)} ${f1(y)} Q${f1(x)} ${f1(y - s * 0.75)} ${f1(x + s * 0.7)} ${f1(y)} Z" fill="#a8946a"/><path d="M${f1(x)} ${f1(y - s * 0.37)} Q${f1(x + s * 0.4)} ${f1(y - s * 0.3)} ${f1(x + s * 0.7)} ${f1(y)} L${f1(x)} ${f1(y)} Z" fill="#7d6a4a"/>`; }
/** A tree: a trunk and a two-tone crown above its foot. */
function treeGlyph(x, y, s) { return `<rect x="${f1(x - s * 0.1)}" y="${f1(y - s * 0.5)}" width="${f1(s * 0.2)}" height="${f1(s * 0.5)}" fill="#4a3220"/><circle cx="${f1(x)}" cy="${f1(y - s * 0.9)}" r="${f1(s * 0.55)}" fill="#24492a"/><circle cx="${f1(x - s * 0.15)}" cy="${f1(y - s * 1.02)}" r="${f1(s * 0.33)}" fill="#3a6a3a"/>`; }
/** A settlement: little houses with roofs and front walls (a tower for a fort, more houses and a keep for a capital). */
export function settlementGlyph(kind, x, y, s) {
  const house = (hx, hy, w) => `<path d="M${f1(hx - w / 2)} ${f1(hy - w * 0.45)} L${f1(hx)} ${f1(hy - w * 0.95)} L${f1(hx + w / 2)} ${f1(hy - w * 0.45)} Z" fill="#a8482e"/><rect x="${f1(hx - w / 2)}" y="${f1(hy - w * 0.45)}" width="${f1(w)}" height="${f1(w * 0.45)}" fill="#e8dcc0" stroke="#3a2516" stroke-width="0.6"/>`;
  const tower = (tx, ty, w) => `<rect x="${f1(tx - w * 0.3)}" y="${f1(ty - w * 1.3)}" width="${f1(w * 0.6)}" height="${f1(w * 1.3)}" fill="#b8b0a0" stroke="#3a2516" stroke-width="0.6"/><path d="M${f1(tx - w * 0.38)} ${f1(ty - w * 1.3)} L${f1(tx)} ${f1(ty - w * 1.75)} L${f1(tx + w * 0.38)} ${f1(ty - w * 1.3)} Z" fill="#5f6f8a"/>`;
  if (kind === "fort") return tower(x, y, s);
  if (kind === "capital") return house(x - s * 0.7, y, s * 0.8) + house(x + s * 0.7, y, s * 0.8) + tower(x, y - s * 0.2, s * 0.9) + house(x, y + s * 0.35, s * 0.9);
  if (kind === "city") return house(x - s * 0.45, y, s * 0.75) + house(x + s * 0.45, y, s * 0.75) + house(x, y + s * 0.3, s * 0.8);
  if (kind === "town" || kind === "port") return house(x - s * 0.3, y, s * 0.7) + house(x + s * 0.35, y + s * 0.15, s * 0.7);
  return house(x, y, s * 0.8);
}

/** Glyphs scattered over the relief and forest areas in view (deterministic), each with its foot's y for ordering. */
function terrainGlyphs(asset, frame) {
  const { W, H } = frame, out = [], diag = Math.hypot(W, H);
  for (const kind of ["forest", "upland", "mountains", "peaks"]) {
    const rings = [];
    for (const detail of (asset.terrain.detail ?? []).filter((d) => d.kind === kind)) for (const ring of detail.rings) {
      if (!frame.wraps && !ring.some((p) => frame.visible(p))) continue;
      const pts = ring.map((p) => frame.project(p)); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      if (x1 < 0 || y1 < 0 || x0 > W || y0 > H || (frame.wraps && x1 - x0 > W / 2)) continue;
      rings.push({ pts, x0, y0, x1, y1 });
    }
    if (!rings.length) continue;
    const g = GLYPH[kind], step = Math.max(6, g.spacing * diag), size = Math.max(5, g.size * diag);
    const inside = (x, y) => { let c = false; for (const r of rings) { if (x < r.x0 || x > r.x1 || y < r.y0 || y > r.y1) continue; const p = r.pts; for (let i = 0, j = p.length - 1; i < p.length; j = i, i += 1) if ((p[i][1] > y) !== (p[j][1] > y) && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) c = !c; } return c; };
    for (let gy = step / 2; gy < H + size; gy += step) for (let gx = (Math.floor(gy / step) % 2) * step / 2; gx < W; gx += step) {
      const x = gx + (ghash(gx, gy, 1) - 0.5) * step * 0.7, y = gy + (ghash(gx, gy, 2) - 0.5) * step * 0.7;
      if (!inside(x, y)) continue;
      const s = size * (0.8 + 0.4 * ghash(gx, gy, 3));
      out.push({ y, svg: kind === "forest" ? treeGlyph(x, y, s) : kind === "upland" ? hillGlyph(x, y, s) : mountainGlyph(x, y, s, kind === "peaks") });
      if (out.length > 6000) return out;
    }
  }
  return out;
}
