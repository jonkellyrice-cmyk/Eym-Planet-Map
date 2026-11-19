// Fits Eym's drainage (Stage 3 of the physical history and climate programme) and writes
// data/planet-cartography/abydos/eventide-drainage.json: the valleys the land's own water has cut, beyond the
// known rivers. Over each continent, water is routed downhill across the pinned 0.02° lattice of the local
// detail (its coarse surface, broken by world-keyed noise so that flats drain in branching patterns rather
// than in straight lines), hollows are filled from the sea, and every channel that drains at least 800 km² is
// kept as a line of points with the area it drains (packed as 16-bit numbers). A channel ends where it reaches the sea, a lake or one of
// the known rivers (which have valleys of their own). The local detail, the Region layer and battle maps cut
// a valley along each (scripts/eym-landforms.mjs). Nothing is random.
//
//   node tools/generate-eym-drainage.mjs           write the data file
//   node tools/generate-eym-drainage.mjs --check   rebuild and compare with the data file

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { LATTICE_DEG, globeNoise, latticeNode, localContext } from "../scripts/eym-local-detail.mjs";

const root = new URL("../", import.meta.url), OUT = new URL("data/planet-cartography/abydos/eventide-drainage.json", root);
export const DRAINAGE_MODEL = "eym-drainage-v1";
/** What the drainage is made from: this tool, the local detail's surface, and the cartography it reads. */
export const DRAINAGE_SOURCES = ["tools/generate-eym-drainage.mjs", "scripts/eym-local-detail.mjs", "data/planet-cartography/abydos/eventide.json"];
/** The continents drawn in detail: the only ones drained on the fine lattice. */
export const DETAILED = ["Caren", "Garyk"];
export const drainageSourcesSha256 = () => { const h = createHash("sha256"); for (const p of DRAINAGE_SOURCES) h.update(readFileSync(new URL(p, root))); return h.digest("hex"); };
/** The smallest catchment kept (km²): a stream big enough to have cut a valley worth drawing at 300 m. */
export const MIN_AREA_KM2 = 800;

const DEG = Math.PI / 180, R_KM = 6371, CELL_KM = LATTICE_DEG * 111.2;
const toKmVector = (lat, lon) => { const a = lat * DEG, b = lon * DEG; return [R_KM * Math.cos(a) * Math.cos(b), R_KM * Math.cos(a) * Math.sin(b), R_KM * Math.sin(a)]; };

class MinHeap {
  constructor(keys) { this.keys = keys; this.a = []; }
  push(i) { const a = this.a; a.push(i); let n = a.length - 1; while (n) { const p = (n - 1) >> 1; if (this.keys[a[p]] <= this.keys[a[n]]) break; [a[p], a[n]] = [a[n], a[p]]; n = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let n = 0; for (;;) { const l = 2 * n + 1, r = l + 1; let m = n; if (l < a.length && this.keys[a[l]] < this.keys[a[m]]) m = l; if (r < a.length && this.keys[a[r]] < this.keys[a[m]]) m = r; if (m === n) break; [a[m], a[n]] = [a[n], a[m]]; n = m; } } return top; }
  get size() { return this.a.length; }
}

/** The channels of one land mass (its outline's bounding box, with a margin of sea). */
function drainLand(ctx, outline, nearRiver) {
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const [lat, lon] of outline) { minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat); minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon); }
  const i0 = Math.floor((minLat - 0.1) / LATTICE_DEG), i1 = Math.ceil((maxLat + 0.1) / LATTICE_DEG), j0 = Math.floor((minLon - 0.1) / LATTICE_DEG), j1 = Math.ceil((maxLon + 0.1) / LATTICE_DEG);
  const rows = i1 - i0 + 1, cols = j1 - j0 + 1, n = rows * cols;
  const z = new Float64Array(n), land = new Uint8Array(n), river = new Uint8Array(n);
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    const i = r * cols + c, nd = latticeNode(ctx, i0 + r, j0 + c), lat = (i0 + r) * LATTICE_DEG, lon = (j0 + c) * LATTICE_DEG, v = toKmVector(lat, lon);
    land[i] = nd.land && !nd.water ? 1 : 0;
    // The coarse surface steps between relief classes; noise keyed to the world breaks its flats so they drain in branches.
    z[i] = nd.elevationM + 25 * globeNoise(v, 30, 4, 91) + 12 * globeNoise(v, 7, 2, 95) + 60 * Math.min(nd.relief, 3) * globeNoise(v, 12, 3, 93);
    river[i] = land[i] && nearRiver(lat, lon) ? 1 : 0;
  }
  // Fill hollows from the sea (and the lakes and the box's edge), recording where each node drains.
  // A filled hollow is flat; an even step across it sends the water in ruler-straight lines from where it spills, so each node's
  // step gets a small fixed jitter (up to 2 m, keyed to the node) and a flat drains in irregular branches instead.
  const jitter = (a, b) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
  const filled = new Float64Array(n), done = new Uint8Array(n), receiver = new Int32Array(n).fill(-1), order = [], heap = new MinHeap(filled);
  for (let i = 0; i < n; i += 1) { const r = Math.floor(i / cols), c = i % cols; if (!land[i] || r === 0 || c === 0 || r === rows - 1 || c === cols - 1) { filled[i] = land[i] ? z[i] : Math.min(z[i], 0); done[i] = 1; heap.push(i); } }
  while (heap.size) {
    const i = heap.pop(); order.push(i); const r = Math.floor(i / cols), c = i % cols;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) { const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue; const j = rr * cols + cc; if (done[j]) continue; done[j] = 1; filled[j] = Math.max(z[j], filled[i] + 0.001 + 2 * jitter(i0 + rr, j0 + cc)); receiver[j] = i; heap.push(j); }
  }
  const area = new Float64Array(n);
  for (let k = order.length - 1; k >= 0; k -= 1) { const i = order[k]; if (!land[i]) continue; area[i] += CELL_KM * CELL_KM * Math.cos(((i0 + Math.floor(i / cols)) * LATTICE_DEG) * DEG); if (receiver[i] >= 0 && land[receiver[i]]) area[receiver[i]] += area[i]; }
  // Channels: from each head down to the sea, a lake, a known river or a channel already traced.
  const channel = (i) => land[i] && area[i] >= MIN_AREA_KM2 && !river[i], upstream = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) if (channel(i) && receiver[i] >= 0 && channel(receiver[i])) upstream[receiver[i]] = 1;
  // A point: its lattice row and column, and the area it drains in tens of km².
  const seen = new Uint8Array(n), out = [], point = (i) => [i0 + Math.floor(i / cols), j0 + (i % cols), Math.min(65535, Math.round(area[i] / 10))];
  for (let i = 0; i < n; i += 1) {
    if (!channel(i) || upstream[i]) continue;
    const line = []; let k = i;
    while (k >= 0) { line.push(point(k)); if (!channel(k) || seen[k]) break; seen[k] = 1; k = receiver[k]; }
    // The end is the sea, a lake or a known river: it carries at least the water that reaches it, not the sea cell's own nothing.
    if (line.length >= 2) line.at(-1)[2] = Math.max(line.at(-1)[2], line.at(-2)[2]);
    // Every other point (the channel steps across 2.2 km nodes; its ends and junction are kept).
    if (line.length >= 3) out.push(line.filter((p, k) => k % 2 === 0 || k === line.length - 1));
  }
  return out;
}

/** Build the whole drainage document. */
export function buildDrainage(asset) {
  const ctx = localContext(asset);
  // Lattice nodes within about 2 km of a known river belong to its valley, not to a drainage channel.
  const riverNodes = new Set();
  for (const r of ctx.rivers) for (let k = 0; k + 1 < r.points.length; k += 1) {
    const [a, b] = [r.points[k], r.points[k + 1]], steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (LATTICE_DEG / 2)));
    for (let s = 0; s <= steps; s += 1) { const lat = a[0] + (b[0] - a[0]) * s / steps, lon = a[1] + (b[1] - a[1]) * s / steps; for (let di = -1; di <= 1; di += 1) for (let dj = -1; dj <= 1; dj += 1) riverNodes.add(`${Math.round(lat / LATTICE_DEG) + di},${Math.round(lon / LATTICE_DEG) + dj}`); }
  }
  const nearRiver = (lat, lon) => riverNodes.has(`${Math.round(lat / LATTICE_DEG)},${Math.round(lon / LATTICE_DEG)}`);
  const channels = [];
  // (Caren and Garyk only: the three far continents are outside the detailed scope, canon of 19 November 2026.)
  for (const coast of asset.terrain.coastlines.filter((c) => c.kind === "mainland" && DETAILED.includes(c.continent))) channels.push(...drainLand(ctx, coast.points, nearRiver));
  // Packed: every point as three little-endian 16-bit numbers (row, column, area ÷ 10), and each channel's length.
  const points = channels.flat(), view = new DataView(new ArrayBuffer(points.length * 6));
  points.forEach(([i, j, a], k) => { view.setInt16(k * 6, i, true); view.setInt16(k * 6 + 2, j, true); view.setUint16(k * 6 + 4, a, true); });
  return { schemaVersion: 1, model: DRAINAGE_MODEL, sourcesSha256: drainageSourcesSha256(), latticeDeg: LATTICE_DEG, minAreaKm2: MIN_AREA_KM2, channelLengths: channels.map((c) => c.length), pointsInt16Base64: Buffer.from(view.buffer).toString("base64") };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const asset = JSON.parse(readFileSync(new URL("data/planet-cartography/abydos/eventide.json", root), "utf8"));
  const t0 = Date.now(), data = buildDrainage(asset), text = `${JSON.stringify(data)}\n`;
  if (process.argv.includes("--check")) { const same = readFileSync(OUT, "utf8") === text; console.log(same ? "eventide-drainage.json is up to date" : "eventide-drainage.json differs"); process.exit(same ? 0 : 1); }
  writeFileSync(OUT, text);
  console.log(`eventide-drainage.json: ${data.channelLengths.length} channels, ${data.channelLengths.reduce((s, c) => s + c, 0)} points, ${text.length} bytes, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
