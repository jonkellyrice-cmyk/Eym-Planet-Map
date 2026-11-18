// Eym's landforms (Stage 3 of the physical history and climate programme): what running water and the sea have
// made of the land. Shared by the Region layer, the local detail and battle maps, so a valley or a cliff is the
// same at every scale. The outlines of the land are not moved: everything here happens inside them.
//   - River valleys: every river has cut a valley sized to its flow and the country it crosses. In the lowlands
//     a broad, flat floodplain between low bluffs; in uplands and mountains a deep, narrowing V that becomes a gorge.
//   - Coasts by exposure, rock and tide: cliffs where hard rock or high ground meets the sea (higher where the
//     waves come from far away); beaches of sediment, wider and backed by dunes where exposed; salt marsh and
//     mudflats on sheltered, low coasts with big tides; marshy estuaries where a river meets a big-tide coast,
//     and deltas where a big river meets quieter water.
// Nothing here is random: noise is the world-keyed noise of the local detail, and every input comes from the
// accepted cartography, the geology (scripts/eym-geology.mjs) and the tides (scripts/eym-tides.mjs).

import { geologyAt } from "./eym-geology.mjs";
import { coastalResponse } from "./eym-tides.mjs";
import { destination, nearestSea } from "./eym-sea.mjs";

export const LANDFORMS_MODEL = "eym-landforms-v1";
const DEG = Math.PI / 180, KM_PER_DEG = 111.2, BUCKET_DEG = 0.05;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
/** How far a valley can reach from its river (km): the widest floodplain and its slopes. */
const VALLEY_REACH_KM = 24;
const HARD_ROCK = new Set(["granite-gneiss", "godstone-granite", "volcanic", "metamorphic", "marble"]);

// ---------------------------------------------------------------- the rivers, indexed

const cache = new WeakMap();
/**
 * The drainage channels of an asset (tools/generate-eym-drainage.mjs, attached as `asset.drainage`), unpacked:
 * [{ points: [[lat, lon], …], areasKm2: […] }]. Empty when the drainage is not attached.
 */
export function drainageChannels(asset) {
  const doc = asset?.drainage; if (!doc?.pointsInt16Base64) return [];
  const bytes = typeof Buffer !== "undefined" ? Uint8Array.from(Buffer.from(doc.pointsInt16Base64, "base64")) : Uint8Array.from(atob(doc.pointsInt16Base64), (c) => c.charCodeAt(0));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), out = []; let k = 0;
  for (const length of doc.channelLengths) {
    const points = [], areasKm2 = [];
    for (let m = 0; m < length; m += 1, k += 1) { points.push([view.getInt16(k * 6, true) * doc.latticeDeg, view.getInt16(k * 6 + 2, true) * doc.latticeDeg]); areasKm2.push(view.getUint16(k * 6 + 4, true) * 10); }
    out.push(meander(points, areasKm2));
  }
  return out;
}

/**
 * A channel's course as water takes it: the lattice's straight eight-way steps rounded off (three passes of corner
 * cutting) and set swinging from side to side, wider for a bigger channel, by a pattern keyed to the channel's
 * own source (so it is the same on every map that reads it).
 */
function meander(points, areasKm2) {
  let line = points.map((p, k) => [p[0], p[1], areasKm2[k]]);
  for (let pass = 0; pass < 3; pass += 1) line = [line[0], ...line.slice(0, -1).flatMap((p, k) => { const q = line[k + 1]; return [[0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1], p[2]], [0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1], q[2]]]; }), line.at(-1)];
  const seed = Math.abs(Math.sin(points[0][0] * 12.9898 + points[0][1] * 78.233) * 43758.5453) % 1, phase = 2 * Math.PI * seed;
  let s = 0; const out = [line[0]];
  for (let k = 1; k < line.length - 1; k += 1) {
    const [a, b] = [line[k - 1], line[k + 1]], cosLat = Math.cos(line[k][0] * DEG);
    s += Math.hypot((line[k][0] - line[k - 1][0]) * KM_PER_DEG, (line[k][1] - line[k - 1][1]) * KM_PER_DEG * cosLat);
    const dx = (b[1] - a[1]) * cosLat, dy = b[0] - a[0], len = Math.hypot(dx, dy) || 1, amplitudeKm = 0.7 + 0.35 * Math.log10(1 + line[k][2] / 100);
    const swing = amplitudeKm * (Math.sin(2 * Math.PI * s / 9 + phase) + 0.45 * Math.sin(2 * Math.PI * s / 3.7 + 2.3 * phase));
    out.push([line[k][0] + (dx / len) * swing / KM_PER_DEG, line[k][1] - (dy / len) * swing / (KM_PER_DEG * cosLat), line[k][2]]);
  }
  out.push(line.at(-1));
  return { points: out.map(([lat, lon]) => [lat, lon]), areasKm2: out.map((p) => p[2]) };
}

/** The width (m) a drainage channel's valley is cut as: that of a river draining as much land (about 3 m × √km²). */
export const channelWidthM = (areaKm2) => 3 * Math.sqrt(areaKm2);

/**
 * The landforms context for a local-detail context (`ctx` from localContext: its asset, field and rivers),
 * built once (again if the drainage is attached later): the known rivers' and the drainage channels' segments
 * bucketed by 0.05° cells, and the river mouths. `coastKmAt(lat, lon)` gives the distance to the coast (km).
 */
export function landformContext(ctx, coastKmAt) {
  const hit = cache.get(ctx); if (hit && hit.drainage === (ctx.asset.drainage ?? null)) return hit;
  const segments = [], buckets = new Map(), mouths = [];
  for (const channel of drainageChannels(ctx.asset)) for (let k = 0; k + 1 < channel.points.length; k += 1) segments.push({ a: channel.points[k], b: channel.points[k + 1], widthM: channelWidthM(channel.areasKm2[k]), channel: true });
  for (const river of ctx.rivers) {
    for (let k = 0; k + 1 < river.points.length; k += 1) segments.push({ a: river.points[k], b: river.points[k + 1], widthM: river.widthM });
    // The mouth: whichever end lies at the coast.
    const ends = [river.points[0], river.points.at(-1)].map((p) => ({ p, d: coastKmAt(p[0], p[1]) })).sort((x, y) => x.d - y.d);
    if (ends[0].d < 4) mouths.push({ at: ends[0].p, widthM: river.widthM });
  }
  // Each segment goes in every bucket within its valley's reach, so a point's candidates are one bucket's list.
  segments.forEach((s, index) => {
    const reachLat = Math.min(VALLEY_REACH_KM, Math.max(valleyHalfWidthKm(s.widthM, 0), valleyHalfWidthKm(s.widthM, 3)) + 0.5) / KM_PER_DEG;
    const lat0 = Math.min(s.a[0], s.b[0]) - reachLat, lat1 = Math.max(s.a[0], s.b[0]) + reachLat, reachLon = reachLat / Math.max(0.2, Math.cos(s.a[0] * DEG));
    const lon0 = Math.min(s.a[1], s.b[1]) - reachLon, lon1 = Math.max(s.a[1], s.b[1]) + reachLon;
    for (let i = Math.floor(lat0 / BUCKET_DEG); i <= Math.floor(lat1 / BUCKET_DEG); i += 1) for (let j = Math.floor(lon0 / BUCKET_DEG); j <= Math.floor(lon1 / BUCKET_DEG); j += 1) {
      const key = i * 100000 + j; let list = buckets.get(key); if (!list) buckets.set(key, (list = [])); list.push(index);
    }
  });
  const lf = { ctx, segments, buckets, mouths, coastCache: new Map(), coastKmAt, drainage: ctx.asset.drainage ?? null };
  cache.set(ctx, lf);
  return lf;
}

/** The nearest river within valley reach of a place: { distKm, widthM }, or null. */
export function nearestRiver(lf, lat, lon) {
  const list = lf.buckets.get(Math.floor(lat / BUCKET_DEG) * 100000 + Math.floor(lon / BUCKET_DEG)); if (!list) return null;
  const k = Math.cos(lat * DEG); let best = null;
  for (const index of list) {
    const s = lf.segments[index], ax = (s.a[1] - lon) * KM_PER_DEG * k, ay = (s.a[0] - lat) * KM_PER_DEG, bx = (s.b[1] - lon) * KM_PER_DEG * k, by = (s.b[0] - lat) * KM_PER_DEG;
    const dx = bx - ax, dy = by - ay, t = clamp(-(ax * dx + ay * dy) / (dx * dx + dy * dy || 1), 0, 1), d = Math.hypot(ax + t * dx, ay + t * dy);
    // A wider river reaches further: compare by distance over the river's own reach.
    if (d < VALLEY_REACH_KM && (!best || d / valleyHalfWidthKm(s.widthM, 0) < best.distKm / valleyHalfWidthKm(best.widthM, 0))) best = { distKm: d, widthM: s.widthM };
  }
  return best;
}

// ---------------------------------------------------------------- valleys

/** The floodplain's half-width (km): wider for a bigger river and in lower, gentler country; a narrow floor in the mountains. */
const floodplainHalfKm = (widthM, relief) => { const lowland = clamp(1 - relief / 1.5, 0, 1); return Math.min(8, (widthM / 1000) * (0.5 + 8.5 * lowland) + 0.1); };
/** The whole valley's half-width (km): the floodplain and the slopes up to the surrounding land (a small stream's slopes are shorter). */
const valleyHalfWidthKm = (widthM, relief) => { const lowland = clamp(1 - relief / 1.5, 0, 1); return floodplainHalfKm(widthM, relief) + (0.6 + 3 * Math.min(relief, 2)) * clamp(Math.sqrt(widthM / 300), 0.5, 1.2) + 2 * lowland; };

/**
 * The valley at a place, given its nearest river and the coarse land there ({ elevationM, relief }): how far
 * the ground is cut down (m), how much of the local roughness is left (0–1: a floodplain is smoother), and
 * whether the place is on the floodplain or a gorge wall (`terrace` is always false: terraces are not made yet).
 * `wobble` (−1…1, world-keyed noise) moves
 * the valley's edges in and out, so they wander as real ones do. Null outside any valley.
 */
export function valleyAt(river, coarse, wobble = 0) {
  if (!river) return null;
  const relief = Math.max(0, coarse.relief), lowland = clamp(1 - relief / 1.5, 0, 1), r = Math.min(relief, 3), w = river.widthM;
  const F = floodplainHalfKm(w, relief), V = valleyHalfWidthKm(w, relief), d = river.distKm * (1 + 0.45 * wobble);
  if (d >= V) return null;
  // Lowland bluffs of some 6–24 m; in mountains the valley is cut hundreds of metres deep (less for small rivers).
  // (A small stream in flat country cuts only a few metres; a great river its full 24.)
  const depthM = Math.min(Math.max(0, coarse.elevationM - 3) * 0.85, (6 + 18 * lowland) * clamp(w / 300, 0.3, 1) + 420 * (r / 3) * (w >= 100 ? 1 : 0.7));
  if (d < F) {
    // The floodplain: the valley floor, cut to the river's level, with some unevenness left.
    return { carveM: depthM, roughness: 0.35, floodplain: true, terrace: false, gorge: false, depthM, widthM: w, inner: d < 0.5 * F };
  }
  // The valley sides: a gentle bluff in the lowlands, a steep V (a gorge) in the mountains.
  const t = (d - F) / (V - F), steep = 1 + 1.5 * clamp((relief - 0.8) / 1.5, 0, 1);
  const rise = lowland > 0.5 ? smoothstep(t) : 1 - (1 - t) ** steep;
  return { carveM: depthM * (1 - rise), roughness: 0.6 + 0.4 * t, floodplain: false, terrace: false, gorge: relief > 1.5 && t < 0.6, depthM, widthM: w };
}

// ---------------------------------------------------------------- coasts

/**
 * The character of the coast near a place (cached per 0.05° cell): { kind: "cliffs" | "beach" | "saltmarsh" |
 * "estuary" | "delta", exposure (0–1: the share of directions open to at least 400 km of sea), tideGain (the
 * coast's tide amplification), rock (the bedrock or null), mouth ({ at, widthM, distKm } or null), cliffM }.
 * `relief` is the coarse relief there.
 */
export function coastCharacter(lf, lat, lon, relief = 0) {
  const key = Math.floor(lat / BUCKET_DEG) * 100000 + Math.floor(lon / BUCKET_DEG);
  const hit = lf.coastCache.get(key); if (hit) return hit;
  const { asset, field } = lf.ctx, clat = (Math.floor(lat / BUCKET_DEG) + 0.5) * BUCKET_DEG, clon = (Math.floor(lon / BUCKET_DEG) + 0.5) * BUCKET_DEG;
  const sea = nearestSea(field, clat, clon) ?? [clat, clon];
  let open = 0;
  for (let k = 0; k < 16; k += 1) { let clear = true; for (let km = 50; km <= 400; km += 50) { const [a, b] = destination(sea[0], sea[1], k * 22.5, km); if (!field.cellAt(a, b).ocean) { clear = false; break; } } if (clear) open += 1; }
  const exposure = open / 16, tideGain = coastalResponse(asset, field, clat, clon)?.gain ?? 2.2;
  const rock = geologyAt(asset, clat, clon)?.bedrock ?? null, hard = HARD_ROCK.has(rock);
  let mouth = null;
  for (const m of lf.mouths) { const d = Math.hypot((m.at[0] - clat) * KM_PER_DEG, (m.at[1] - clon) * KM_PER_DEG * Math.cos(clat * DEG)); if (d < 12 && (!mouth || m.widthM > mouth.widthM)) mouth = { ...m, distKm: d }; }
  let kind;
  if (mouth && mouth.widthM >= 300 && relief < 0.6) kind = tideGain >= 4.5 ? "estuary" : "delta";
  else if (mouth && mouth.widthM >= 100 && relief < 0.6 && tideGain >= 4.5) kind = "estuary";
  else if ((hard && (relief >= 0.4 || exposure >= 0.5)) || relief >= 1.2) kind = "cliffs";
  else if (exposure < 0.3 && tideGain >= 4 && relief < 0.4) kind = "saltmarsh";
  else kind = "beach";
  const out = { kind, exposure, tideGain, rock, mouth, cliffM: Math.round(12 + 60 * exposure + 40 * Math.min(relief, 2)) };
  lf.coastCache.set(key, out);
  return out;
}

/**
 * How much higher the land stands behind a cliff coast, `seaKm` from the sea: the cliff's height, dropping to the water
 * within a square (or 50 m) and tapering away over some 25 km inland, so the land still rises inland and drains to the
 * sea. The height is blended between the four nearest coast cells (a cell that is not a cliff coast counts as 0), so the
 * lift fades along the shore where a cliff coast gives way to a beach rather than stepping at a cell's edge.
 */
export function cliffLiftM(lf, lat, lon, relief, seaKm, cellKm = 0) {
  if (seaKm > 25) return 0;
  const fy = lat / BUCKET_DEG - 0.5, fx = lon / BUCKET_DEG - 0.5, y0 = Math.floor(fy), x0 = Math.floor(fx), ty = fy - y0, tx = fx - x0;
  let height = 0;
  for (const [dy, dx, w] of [[0, 0, (1 - ty) * (1 - tx)], [0, 1, (1 - ty) * tx], [1, 0, ty * (1 - tx)], [1, 1, ty * tx]]) {
    if (w <= 0) continue;
    const coast = coastCharacter(lf, (y0 + dy + 0.5) * BUCKET_DEG, (x0 + dx + 0.5) * BUCKET_DEG, relief);
    if (coast.kind === "cliffs") height += w * coast.cliffM;
  }
  const edge = Math.max(0.05, 0.75 * cellKm);
  return height * smoothstep(seaKm / Math.max(0.06, edge)) * (1 - seaKm / 25);
}

/**
 * The shore at a place, blended between the four nearest coast cells so that no edge of a cell shows: each cell's
 * shore (shoreAt) is read with its own character, the heights are mixed by nearness (a cell with no say leaves the
 * land as it is), and the ground is the cell picked by nearness nudged by the noises `n` and `fine`, so the line
 * between, say, a salt marsh and a beach wanders rather than following the cells. Returns null where no cell has a say.
 */
export function blendedShoreAt(lf, lat, lon, relief, seaKm, n, elevationM, cellKm = 0, fine = 0) {
  const fy = lat / BUCKET_DEG - 0.5, fx = lon / BUCKET_DEG - 0.5, y0 = Math.floor(fy), x0 = Math.floor(fx), ty = fy - y0, tx = fx - x0;
  const pick = clamp(0.5 + 0.35 * n + 0.15 * fine, 0.001, 0.999);
  let height = 0, said = false, ground = null, seen = 0;
  for (const [dy, dx, w] of [[0, 0, (1 - ty) * (1 - tx)], [0, 1, (1 - ty) * tx], [1, 0, ty * (1 - tx)], [1, 1, ty * tx]]) {
    const coast = coastCharacter(lf, (y0 + dy + 0.5) * BUCKET_DEG, (x0 + dx + 0.5) * BUCKET_DEG, relief), s = shoreAt(coast, seaKm, n, elevationM, cellKm, fine);
    if (s) said = true;
    height += w * (s?.elevationM ?? elevationM);
    if (seen < pick && seen + w >= pick) ground = s?.ground ?? null;
    seen += w;
  }
  return said ? { ground, elevationM: height } : null;
}

/**
 * The shore at a land place `seaKm` from the sea, given its coast's character and a world-keyed noise value
 * `n` (−1…1): the ground it should be ("beach", "dunes", "cliff", "marsh", "mudflat", "delta-meadow" or null
 * where the shore has no say) and the height it should have (or null to leave it). `cellKm` is the map's square:
 * a beach or a cliff is at least one square wide there, so it shows on a coarse map (the Region layer's 300 m).
 * `fine` (−1…1) is finer noise, for the patchwork and the creeks of a salt marsh.
 */
export function shoreAt(coast, seaKm, n, elevationM, cellKm = 0, fine = 0) {
  const least = 0.75 * cellKm;
  const tide = clamp((coast.tideGain - 2.2) / 6, 0, 1);
  switch (coast.kind) {
    case "cliffs": {
      // The sea has cut into higher land: the cliff face itself, within a square (or a few tens of metres) of the water.
      // The lift itself is cliffLiftM's, applied to the land before the shore is read.
      const edge = Math.max(0.05, least);
      return seaKm < edge ? { ground: "cliff", elevationM: null } : null;
    }
    case "beach": {
      const band = Math.max(least, (0.08 + 0.35 * coast.exposure) * (1 + 0.35 * n));
      if (seaKm < band) return { ground: "beach", elevationM: Math.min(elevationM, 1 + 6 * seaKm / Math.max(band, 0.05)) };
      if (coast.exposure > 0.6 && seaKm < band + 0.3 + 0.1 * n) return { ground: "dunes", elevationM: null };
      return null;
    }
    case "saltmarsh": {
      // The marsh's inland edge wanders (a third of its width either way), and higher patches of meadow stand in it.
      const band = Math.max(least, (0.3 + 1.6 * tide) * (1 + 0.35 * n));
      if (seaKm < band) {
        const rel = seaKm / band + 0.25 * fine;
        return { ground: rel < 0.25 ? "mudflat" : rel > 0.7 && fine > 0.3 ? "delta-meadow" : "marsh", elevationM: Math.min(elevationM, 1 + 2 * seaKm / band + 0.6 * fine) };
      }
      return null;
    }
    case "estuary": case "delta": {
      // A low plain built of the river's silt, its hummocks and old levees (the fine noise) steering the creeks across it.
      const reach = coast.kind === "delta" ? 8 : 4, near = coast.mouth ? clamp(1 - coast.mouth.distKm / 12, 0, 1) : 0, band = (0.5 + reach * near) * (1 + 0.35 * n);
      if (seaKm < band) return { ground: coast.kind === "estuary" && seaKm < 0.3 * band ? "mudflat" : n > 0.05 ? "marsh" : "delta-meadow", elevationM: Math.min(elevationM, 1 + 3 * seaKm / band + 0.8 * fine) };
      return null;
    }
    default: return null;
  }
}
