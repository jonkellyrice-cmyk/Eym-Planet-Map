// Fits Eym's drainage (Stage 3 of the physical history and climate programme) and writes
// data/planet-cartography/mitkear/eym-drainage.json: the valleys the land's own water has cut, beyond the
// known rivers. Over each continent, water is routed downhill across the pinned 0.02° lattice of the local
// detail (its coarse surface, broken by world-keyed noise so that flats drain in branching patterns rather
// than in straight lines), hollows are filled from the sea, and every channel that drains at least 800 km² is
// kept as a line of points with the area it drains (packed as 16-bit numbers). A channel ends where it reaches the sea, a lake or one of
// the known rivers (which have valleys of their own). The local detail, the Region layer and battle maps cut
// a valley along each (scripts/eym-landforms.mjs). Nothing is random.
//
// Scope (owner, 19 November 2026): the channels are read only by the detailed layers, which cover Caren, Garyk and
// the strait between them. Only those continents are drained (`DETAILED`); nothing is worked out or shipped for
// Gaffa, Khohalis and Demani. Each land mass is worked on in its own thread, and its channels are kept in .cache/
// (not committed) under a fingerprint of what it reads, so a land mass whose inputs did not change is not drained again.
//
//   node tools/generate-eym-drainage.mjs             write the data file
//   node tools/generate-eym-drainage.mjs --check     rebuild and compare with the data file
//   node tools/generate-eym-drainage.mjs --no-cache  drain every land mass afresh
//   node tools/generate-eym-drainage.mjs --serial    one land mass after another, in this thread

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { LATTICE_DEG, globeNoise, latticeNode, localContext } from "../scripts/eym-local-detail.mjs";
import { bboxWrap, lonInExtent, lonOffset, normLon } from "../scripts/geo-wrap.mjs";
import { waterKept, yearRunoffMm } from "../scripts/eym-river-flow.mjs";
export { waterKept };
import { WORLD_INPUTS } from "../scripts/eym-world-inputs.mjs";

const root = new URL("../", import.meta.url), OUT = new URL("data/planet-cartography/mitkear/eym-drainage.json", root), ASSET = new URL("data/planet-cartography/mitkear/eym.json", root), FLOW = new URL("data/planet-cartography/mitkear/eym-flow.json", root);
export const DRAINAGE_MODEL = "eym-drainage-v2";
/** What the drainage is made from: this tool, the local detail's surface, and the cartography it reads. */
export const DRAINAGE_SOURCES = ["tools/generate-eym-drainage.mjs", "scripts/eym-river-flow.mjs", "data/planet-cartography/mitkear/eym-flow.json", "scripts/eym-local-detail.mjs", "scripts/eym-caren-relief.mjs", "scripts/eym-world-inputs.mjs", "scripts/geo-wrap.mjs", "data/planet-cartography/mitkear/eym.json"];
export const drainageSourcesSha256 = () => { const h = createHash("sha256"); for (const p of DRAINAGE_SOURCES) h.update(readFileSync(new URL(p, root))); return h.digest("hex"); };
/** The smallest catchment kept (km²): a stream big enough to have cut a valley worth drawing at 300 m. */
export const MIN_AREA_KM2 = 800;
/** The continents drawn in detail: the only ones whose drainage anything reads, and so the only ones drained. */
export const DETAILED = Object.freeze(["Caren", "Garyk"]);

const DEG = Math.PI / 180, R_KM = 6371, CELL_KM = LATTICE_DEG * 111.2;
const toKmVector = (lat, lon) => { const a = lat * DEG, b = lon * DEG; return [R_KM * Math.cos(a) * Math.cos(b), R_KM * Math.cos(a) * Math.sin(b), R_KM * Math.sin(a)]; };
// The eight neighbours, in the order the flood has always tried them (it decides which neighbour a node drains to).
const DR = Int32Array.of(1, -1, 0, 0, 1, 1, -1, -1), DC = Int32Array.of(0, 0, 1, -1, 1, -1, 1, -1);

/**
 * A binary min-heap of node numbers keyed by `keys`, on arrays made once (it never holds more than every node).
 * The sifting is the plain textbook one, step for step what the earlier array heap did, so nodes of equal key leave
 * in the same order as they always have.
 */
export class MinHeap {
  constructor(keys, capacity) { this.keys = keys; this.a = new Int32Array(capacity); this.size = 0; }
  push(i) { const a = this.a, keys = this.keys; let n = this.size; a[n] = i; this.size += 1; while (n) { const p = (n - 1) >> 1; if (keys[a[p]] <= keys[a[n]]) break; const t = a[p]; a[p] = a[n]; a[n] = t; n = p; } }
  pop() { const a = this.a, keys = this.keys, top = a[0]; this.size -= 1; const size = this.size; if (size) { a[0] = a[size]; let n = 0; for (;;) { const l = 2 * n + 1, r = l + 1; let m = n; if (l < size && keys[a[l]] < keys[a[m]]) m = l; if (r < size && keys[a[r]] < keys[a[m]]) m = r; if (m === n) break; const t = a[m]; a[m] = a[n]; a[n] = t; n = m; } } return top; }
}

/**
 * The channels of one land mass (its outline's box, with a margin of sea). `stats`, when given, is filled with what
 * was done: the box and how many of its nodes were land.
 */
export function drainLand(ctx, outline, nearRiver, stats = null, runoffAt = null, courses = []) {
  // Its box, the longitudes as the shortest arc that holds it (scripts/geo-wrap.mjs): west to east, the columns
  // running on past 180° for a land mass that crosses the map's seam.
  const { minLat, maxLat, lonExtent } = bboxWrap(outline), minLon = lonExtent.westLon, maxLon = lonExtent.westLon <= lonExtent.eastLon ? lonExtent.eastLon : lonExtent.eastLon + 360;
  const i0 = Math.floor((minLat - 0.1) / LATTICE_DEG), i1 = Math.ceil((maxLat + 0.1) / LATTICE_DEG), j0 = Math.floor((minLon - 0.1) / LATTICE_DEG), j1 = Math.ceil((maxLon + 0.1) / LATTICE_DEG);
  const rows = i1 - i0 + 1, cols = j1 - j0 + 1, n = rows * cols;
  // The surface at every node of the box. (Tried and not kept: working it out only on the land and the sea that
  // touches it. Every lake node and every sea node at or above 0 m starts the flood at exactly 0, and which of two
  // such neighbours a shore node drains to follows the order the whole box's nodes leave the heap in; with the open
  // sea left out, 26 of 980 channels ended one node away from where they always have. Caren's and Garyk's boxes are
  // mostly land, so the saving was a quarter to a half of the nodes; the same channels matter more.)
  const z = new Float64Array(n), land = new Uint8Array(n), river = new Uint8Array(n); let landNodes = 0;
  for (let r = 0, i = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1, i += 1) {
    const nd = latticeNode(ctx, i0 + r, j0 + c), lat = (i0 + r) * LATTICE_DEG, lon = (j0 + c) * LATTICE_DEG, v = toKmVector(lat, lon);
    land[i] = nd.land && !nd.water ? 1 : 0;
    // The coarse surface steps between relief classes; noise keyed to the world breaks its flats so they drain in branches.
    z[i] = nd.elevationM + 25 * globeNoise(v, 30, 4, 91) + 12 * globeNoise(v, 7, 2, 95) + 60 * Math.min(nd.relief, 3) * globeNoise(v, 12, 3, 93);
    if (land[i]) { landNodes += 1; river[i] = nearRiver(lat, lon) ? 1 : 0; if (river[i]) z[i] -= WORLD_INPUTS.rivers.valleyFloorM; }
  }
  // (The known rivers run in valleys they have cut: along each the surface the water is routed over is lowered by
  // `valleyFloorM`, so the land beside a drawn river drains into it, as it must to have made the river.)
  ctx.lattice.clear(); // the nodes' facts are not needed again: let them go before the next land mass
  // Fill hollows from the sea (and the lakes and the box's edge), recording where each node drains.
  // A filled hollow is flat; an even step across it sends the water in ruler-straight lines from where it spills, so each node's
  // step gets a small fixed jitter (up to 2 m, keyed to the node) and a flat drains in irregular branches instead.
  // (The jitter makes the order inside a hollow part of the result, so the flood keeps one heap throughout: the
  // quicker flood that handles hollows with a plain queue would route their water differently.)
  const jitter = (a, b) => { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b ^ 0xc2b2ae35, 0x27d4eb2f); h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
  const filled = new Float64Array(n), done = new Uint8Array(n), receiver = new Int32Array(n).fill(-1), order = new Int32Array(n), heap = new MinHeap(filled, n); let ordered = 0;
  // Where the flood starts: every sea and lake node, and land on the box's edge.
  for (let r = 0, i = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1, i += 1) {
    if (land[i] && r !== 0 && c !== 0 && r !== rows - 1 && c !== cols - 1) continue;
    done[i] = 1; filled[i] = land[i] ? z[i] : Math.min(z[i], 0); heap.push(i);
  }
  while (heap.size) {
    const i = heap.pop(); order[ordered] = i; ordered += 1; const r = (i / cols) | 0, c = i - r * cols, base = filled[i] + 0.001;
    for (let k = 0; k < 8; k += 1) {
      const rr = r + DR[k], cc = c + DC[k]; if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
      const j = rr * cols + cc; if (done[j]) continue;
      done[j] = 1; const step = base + 2 * jitter(i0 + rr, j0 + cc); filled[j] = z[j] > step ? z[j] : step; receiver[j] = i; heap.push(j);
    }
  }
  const area = new Float64Array(n);
  for (let k = ordered - 1; k >= 0; k -= 1) { const i = order[k]; if (!land[i]) continue; area[i] += CELL_KM * CELL_KM * Math.cos(((i0 + ((i / cols) | 0)) * LATTICE_DEG) * DEG); if (receiver[i] >= 0 && land[receiver[i]]) area[receiver[i]] += area[i]; }
  // The water each node passes on (km² × mm a year): its own runoff (what the rain leaves after soil and plant, by
  // its climate and height) and what comes down to it. Crossing arid ground (runoff under `aridMm`) a stream loses
  // water to the air and its bed: up to `aridLossPer100Km` of it for each 100 km, so a river can dwindle and die.
  const water = new Float64Array(n), W = WORLD_INPUTS.rivers;
  if (runoffAt) for (let k = ordered - 1; k >= 0; k -= 1) {
    const i = order[k]; if (!land[i]) continue; const r = (i / cols) | 0, own = runoffAt((i0 + r) * LATTICE_DEG, (j0 + (i - r * cols)) * LATTICE_DEG, z[i]) ?? 0;
    const kept = waterKept(own, CELL_KM, W);
    water[i] = water[i] * kept + CELL_KM * CELL_KM * Math.cos(((i0 + r) * LATTICE_DEG) * DEG) * own; if (receiver[i] >= 0 && land[receiver[i]]) water[receiver[i]] += water[i];
  }
  /** The mean yearly runoff (mm) of the land a node drains, as it reaches the node. */
  const runoffOf = (i) => (runoffAt && area[i] > 0 ? Math.min(65535, Math.round(water[i] / area[i])) : 0);
  // Channels: from each head down to the sea, a lake, a known river or a channel already traced.
  const channel = (i) => land[i] && area[i] >= MIN_AREA_KM2 && !river[i], upstream = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) if (channel(i) && receiver[i] >= 0 && channel(receiver[i])) upstream[receiver[i]] = 1;
  // A point: its lattice row and column, and the area it drains in tens of km².
  const seen = new Uint8Array(n), out = [], point = (i) => [i0 + Math.floor(i / cols), j0 + (i % cols), Math.min(65535, Math.round(area[i] / 10)), runoffOf(i)];
  for (let i = 0; i < n; i += 1) {
    if (!channel(i) || upstream[i]) continue;
    const line = []; let k = i;
    while (k >= 0) { line.push(point(k)); if (!channel(k) || seen[k]) break; seen[k] = 1; k = receiver[k]; }
    // The end is the sea, a lake or a known river: it carries at least the water that reaches it, not the sea cell's own nothing.
    if (line.length >= 2) { if (line.at(-1)[2] < line.at(-2)[2]) line.at(-1)[3] = line.at(-2)[3]; line.at(-1)[2] = Math.max(line.at(-1)[2], line.at(-2)[2]); }
    // Every other point (the channel steps across 2.2 km nodes; its ends and junction are kept).
    if (line.length >= 3) out.push(line.filter((p, k) => k % 2 === 0 || k === line.length - 1));
  }
  if (stats) Object.assign(stats, { rows, cols, nodes: n, landNodes });
  // The known rivers: the land each truly drains and its runoff, at up to forty places along its course (the node
  // of its valley that carries the most water, within a node of the course).
  const rivers = [];
  if (runoffAt) for (const course of courses) {
    const stepBy = Math.max(1, Math.ceil(course.points.length / 40)), at = [];
    for (let k = 0; k < course.points.length; k += stepBy) {
      const r0 = Math.round(course.points[k][0] / LATTICE_DEG) - i0, c0 = Math.round(course.points[k][1] / LATTICE_DEG) - j0; let best = -1;
      for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) { const rr = r0 + dr, cc = c0 + dc; if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue; const j = rr * cols + cc; if (land[j] && (best < 0 || water[j] > water[best])) best = j; }
      at.push(best < 0 ? [k, 0, 0] : [k, Math.min(65535, Math.round(area[best] / 10)), runoffOf(best)]);
    }
    // (A river does not carry less land's water farther down: where the course strays off the valley's node that
    // carries it, the measure upstream stands.)
    for (let m = 1; m < at.length; m += 1) if (at[m - 1][1] * at[m - 1][2] > at[m][1] * at[m][2]) { at[m][1] = at[m - 1][1]; at[m][2] = at[m - 1][2]; }
    if (at.some((p) => p[1] > 0)) rivers.push({ id: course.id, at });
  }
  out.rivers = rivers;
  return out;
}

/** Lattice nodes within about 2 km of a known river belong to its valley, not to a drainage channel. */
function riverTest(ctx) {
  const riverNodes = new Set();
  for (const r of ctx.rivers) for (let k = 0; k + 1 < r.points.length; k += 1) {
    // (A stretch that crosses ±180° is walked the short way across it, not right round the world: scripts/geo-wrap.mjs.
    // Away from the seam the offset is the plain difference, so nothing changes there.)
    const [a, b] = [r.points[k], r.points[k + 1]], seam = Math.abs(b[1] - a[1]) > 180, east = seam ? lonOffset(b[1], a[1]) : b[1] - a[1], steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], east) / (LATTICE_DEG / 2)));
    for (let s = 0; s <= steps; s += 1) { const lat = a[0] + (b[0] - a[0]) * s / steps, lon = seam ? normLon(a[1] + east * s / steps) : a[1] + (b[1] - a[1]) * s / steps; for (let di = -1; di <= 1; di += 1) for (let dj = -1; dj <= 1; dj += 1) riverNodes.add(`${Math.round(lat / LATTICE_DEG) + di},${Math.round(lon / LATTICE_DEG) + dj}`); }
  }
  return (lat, lon) => riverNodes.has(`${Math.round(lat / LATTICE_DEG)},${Math.round(lon / LATTICE_DEG)}`);
}

/** The land masses to drain, in the order their channels are written: the detailed continents' mainlands. */
export const landMassesOf = (asset) => asset.terrain.coastlines.filter((c) => c.kind === "mainland" && DETAILED.includes(c.continent));

/**
 * A fingerprint of what one land mass's drainage is made from: this tool and the local detail's code (with the
 * dials and Caren's relief rule, which set the heights the water runs over), and the
 * cartography within its reach (its outline; the coasts, lakes, relief and rivers within 3° of its box; the 1° rasters).
 */
export function landMassFingerprint(asset, coast) {
  const box = bboxWrap(coast.points), near = (points) => points.some(([lat, lon]) => lat >= box.minLat - 3 && lat <= box.maxLat + 3 && lonInExtent(lon, box.lonExtent, 3));
  const h = createHash("sha256");
  if (existsSync(FLOW)) h.update(readFileSync(FLOW));
  for (const p of ["tools/generate-eym-drainage.mjs", "scripts/eym-river-flow.mjs", "scripts/eym-local-detail.mjs", "scripts/geo-wrap.mjs", "scripts/eym-river-courses.mjs", "scripts/eym-surface.mjs", "scripts/eym-seasons.mjs", "scripts/eym-rain-band.generated.mjs", "scripts/eym-caren-relief.mjs", "scripts/eym-world-inputs.mjs"]) h.update(readFileSync(new URL(p, root)));
  h.update(JSON.stringify([
    coast.points, asset.terrain.coastlines.filter((c) => near(c.points)).map((c) => [c.kind, c.continent, c.points]),
    asset.hydrology.lakes.filter((l) => near(l.polygon)), (asset.terrain.detail ?? []).map((d) => [d.kind, d.rings.filter(near)]),
    asset.hydrology.rivers.filter((r) => near(r.points)), asset.grid, asset.raster,
  ]));
  return h.digest("hex");
}

/** One land mass drained: { continent, latticeDeg, channels, stats }. */
function drainOne(asset, ctx, coast) {
  // The runoff is read from the rivers' monthly climate (data/planet-cartography/mitkear/eym-flow.json) through a
  // copy of the asset: the local detail the water is routed over is built without it, as it always was.
  const wet = existsSync(FLOW) ? { ...asset, flow: JSON.parse(readFileSync(FLOW, "utf8")) } : null;
  // (A square the rivers' climate does not hold, a sliver of coast, takes the mean of the squares beside it that it does.)
  const beside = new Map(), runoffAt = wet ? (lat, lon, elevationM) => {
    const own = yearRunoffMm(wet, ctx.field.cellAt(lat, lon).id, Math.max(0, elevationM)); if (own != null) return own;
    const key = `${Math.floor(lat)}|${Math.floor(lon)}`; if (!beside.has(key)) { const near = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]].map(([a, b]) => yearRunoffMm(wet, ctx.field.cellAt(lat + a, lon + b).id, Math.max(0, elevationM))).filter((v) => v != null); beside.set(key, near.length ? near.reduce((s, v) => s + v, 0) / near.length : null); }
    return beside.get(key);
  } : null;
  const started = Date.now(), stats = {}, channels = drainLand(ctx, coast.points, riverTest(ctx), stats, runoffAt, ctx.rivers), rivers = channels.rivers ?? [];
  return { continent: coast.continent, latticeDeg: LATTICE_DEG, channels: [...channels], rivers, stats: { ...stats, seconds: (Date.now() - started) / 1000, rssMb: Math.round(process.memoryUsage().rss / 1e6) } };
}

/** The drainage document from the land masses' channels, in order. */
function pack(parts) {
  const channels = parts.flatMap((p) => p.channels), points = channels.flat(), view = new DataView(new ArrayBuffer(points.length * 6));
  // Packed: every point as three little-endian 16-bit numbers (row, column, area ÷ 10), and each channel's length.
  points.forEach(([i, j, a], k) => { view.setInt16(k * 6, i, true); view.setInt16(k * 6 + 2, j, true); view.setUint16(k * 6 + 4, a, true); });
  const u16 = (values) => { const b = Buffer.alloc(values.length * 2); values.forEach((v, k) => b.writeUInt16LE(v, k * 2)); return b.toString("base64"); };
  // The known rivers' own catchments: each river's id, how many places along it are measured, and for each place
  // its index along the course, the land it drains (÷ 10 km²) and that land's mean yearly runoff (mm).
  const rivers = parts.flatMap((p) => p.rivers ?? []).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    schemaVersion: 1, model: DRAINAGE_MODEL, sourcesSha256: drainageSourcesSha256(), minAreaKm2: MIN_AREA_KM2,
    // Each land mass's lattice step (degrees) and how many of the channels, in order, are its.
    landMasses: parts.map((p) => ({ continent: p.continent, latticeDeg: p.latticeDeg, channels: p.channels.length })),
    channelLengths: channels.map((c) => c.length), pointsInt16Base64: Buffer.from(view.buffer).toString("base64"),
    // Beside each channel point, in the same order: the mean yearly runoff (mm) of the land it drains.
    runoffMmUint16Base64: u16(points.map((p) => p[3] ?? 0)),
    rivers: { ids: rivers.map((r) => r.id), lengths: rivers.map((r) => r.at.length), atUint16Base64: u16(rivers.flatMap((r) => r.at.flat())) },
  };
}

/** Build the whole drainage document, one land mass after another in this thread. */
export function buildDrainage(asset, report = null) {
  const ctx = localContext(asset), parts = landMassesOf(asset).map((coast) => drainOne(asset, ctx, coast));
  if (report) report.push(...parts.map(({ continent, stats }) => ({ continent, ...stats, cached: false })));
  return pack(parts);
}

/** The same document with each land mass in its own thread, and kept channels reused where their inputs are unchanged. */
export async function buildDrainageParallel({ cache = true, report = null } = {}) {
  const asset = JSON.parse(readFileSync(ASSET, "utf8")), dir = new URL(".cache/eym-drainage/", root);
  const parts = await Promise.all(landMassesOf(asset).map(async (coast) => {
    const fingerprint = landMassFingerprint(asset, coast), kept = new URL(`${coast.continent.toLowerCase()}-${fingerprint.slice(0, 24)}.json`, dir);
    if (cache && existsSync(kept)) { const part = JSON.parse(readFileSync(kept, "utf8")); report?.push({ continent: part.continent, ...part.stats, cached: true }); return part; }
    const part = await new Promise((resolve, reject) => { const worker = new Worker(new URL(import.meta.url), { workerData: { continent: coast.continent } }); worker.once("message", resolve); worker.once("error", reject); });
    mkdirSync(dir, { recursive: true }); writeFileSync(kept, JSON.stringify(part)); report?.push({ continent: part.continent, ...part.stats, cached: false });
    return part;
  }));
  return pack(parts);
}

if (!isMainThread) {
  // A worker: drain the one land mass asked for and send its channels back.
  const asset = JSON.parse(readFileSync(ASSET, "utf8"));
  parentPort.postMessage(drainOne(asset, localContext(asset), landMassesOf(asset).find((c) => c.continent === workerData.continent)));
} else if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const t0 = Date.now(), report = [], args = process.argv.slice(2);
  const data = args.includes("--serial") ? buildDrainage(JSON.parse(readFileSync(ASSET, "utf8")), report) : await buildDrainageParallel({ cache: !args.includes("--no-cache"), report }), text = `${JSON.stringify(data)}\n`;
  for (const r of report) console.log(`  ${r.continent}: ${r.rows} x ${r.cols} = ${r.nodes} nodes, ${r.landNodes} land, ${r.seconds.toFixed(1)} s, ${r.rssMb} MB${r.cached ? " (kept from an earlier run)" : ""}`);
  if (args.includes("--check")) { const same = readFileSync(OUT, "utf8") === text; console.log(same ? "eym-drainage.json is up to date" : "eym-drainage.json differs"); process.exit(same ? 0 : 1); }
  writeFileSync(OUT, text);
  console.log(`eym-drainage.json: ${data.channelLengths.length} channels, ${data.channelLengths.reduce((s, c) => s + c, 0)} points, ${text.length} bytes, ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
