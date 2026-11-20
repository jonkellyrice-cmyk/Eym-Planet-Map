// Finds candidate constellations in the night-sky catalogue: compact groups of bright stars joined
// into stick figures, with a rough shape label, total brightness, the half of Eym's sky they sit in,
// and whether they lie along the path of the sun. Candidates are for human review; the accepted
// constellations (with names) live in data/stellar/constellations.json.
//
// Usage: node tools/find-constellation-candidates.mjs [out.json]
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../scripts/system-data.mjs";
import { angularDistanceDeg, celestialPole, latitudeDeg, normalize, orbitNormal, tangentProjector } from "../scripts/sky-frame.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const FIGURE_MAGNITUDE_LIMIT = 4.2; // constellation figures are drawn from the bright tier
const SEED_MAGNITUDE_LIMIT = 3.8;
const LINK_DEG = 8.5; // a star joins a figure only if it is this close to a member
const MAX_EXTENT_DEG = 26;
const MAX_SIZE = 7;
// Growth stops once the best addition is too faint for its distance: score = link° + 2.5 × (mag − 1.5).
const MAX_ADDITION_SCORE = 12.5;
const SUN_PATH_HALF_WIDTH_DEG = 12;

export const starId = (index) => `star-${String(index + 1).padStart(4, "0")}`;

/** Eym's sky frame from the registry and epoch orientations. */
export function eymSky(root = ROOT) {
  const rows = parseCsv(readFileSync(resolve(root, "docs/system-orbital-distances.csv"), "utf8"));
  const eym = rows.find((row) => row.system === "Mitkear" && row.object === "Eym");
  const orientation = JSON.parse(readFileSync(resolve(root, "data/astronomy/epoch-orientations.json"), "utf8")).orientations["mitkear-eym"];
  const inclinationDeg = Number(eym.inclination_deg || 0);
  return {
    sunPathPole: orbitNormal(inclinationDeg),
    celestialPole: celestialPole({ inclinationDeg, axialTiltDeg: Number(eym.axial_tilt_deg), axialSeasonPhaseDeg: orientation.axialSeasonPhaseAtEpochDeg }),
  };
}

function minimumSpanningEdges(points) {
  const inTree = new Set([0]), edges = [];
  while (inTree.size < points.length) {
    let best = null;
    for (const a of inTree) for (let b = 0; b < points.length; b += 1) {
      if (inTree.has(b)) continue;
      const d = angularDistanceDeg(points[a], points[b]);
      if (!best || d < best.d) best = { a, b, d };
    }
    edges.push([best.a, best.b]); inTree.add(best.b);
  }
  return edges;
}

function turn(p, q, r) { return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x); }
function planeDistance(p, q) { return Math.hypot(p.x - q.x, p.y - q.y); }

/** Closes boxes/triangles when the closing edge is no longer than the figure's own edges, then labels the shape. */
export function describeFigure(directions) {
  const n = directions.length;
  let edges = minimumSpanningEdges(directions);
  const degree = Array(n).fill(0); for (const [a, b] of edges) { degree[a] += 1; degree[b] += 1; }
  const longest = Math.max(...edges.map(([a, b]) => angularDistanceDeg(directions[a], directions[b])));
  const ends = degree.flatMap((d, i) => d === 1 ? [i] : []);
  const isPath = Math.max(...degree) <= 2;
  let closed = false;
  if (isPath && (n === 3 || n === 4) && angularDistanceDeg(directions[ends[0]], directions[ends[1]]) <= longest * (n === 3 ? 1.15 : 1.25)) {
    edges = [...edges, [ends[0], ends[1]]]; closed = true;
  }
  const center = normalize(directions.reduce((s, d) => [s[0] + d[0], s[1] + d[1], s[2] + d[2]], [0, 0, 0]));
  const project = tangentProjector(center), flat = directions.map(project);
  let shape;
  if (closed) shape = n === 3 ? "triangle" : "box";
  else if (isPath) {
    const order = [ends[0]]; const seen = new Set(order);
    while (order.length < n) { const last = order.at(-1); const next = edges.flatMap(([a, b]) => a === last ? [b] : b === last ? [a] : []).find((i) => !seen.has(i)); order.push(next); seen.add(next); }
    const pts = order.map((i) => flat[i]);
    const length = pts.slice(1).reduce((sum, p, i) => sum + planeDistance(pts[i], p), 0);
    const straightness = planeDistance(pts[0], pts.at(-1)) / length;
    const signs = pts.slice(2).map((p, i) => Math.sign(turn(pts[i], pts[i + 1], p)));
    const alternating = signs.length >= 2 && signs.every((s, i) => i === 0 || s !== signs[i - 1]);
    if (straightness > 0.93) shape = "line";
    else if (alternating && n >= 4) shape = "zigzag";
    else if (signs.every((s) => s === signs[0])) shape = straightness > 0.6 ? "arc" : "hook";
    else shape = "chain";
  } else {
    const hub = degree.indexOf(Math.max(...degree));
    shape = degree[hub] >= 4 ? "cross" : "branched";
  }
  return { edges, shape, closed, center };
}

export function findCandidates(starfield, sky, { maxCandidates = 80 } = {}) {
  const bright = starfield.stars.map((row, index) => ({ index, dir: row.slice(0, 3), mag: row[3] })).filter((s) => s.mag < FIGURE_MAGNITUDE_LIMIT);
  const used = new Set(), candidates = [];
  for (const seed of bright) {
    if (seed.mag >= SEED_MAGNITUDE_LIMIT || candidates.length >= maxCandidates) break;
    if (used.has(seed.index)) continue;
    const group = [seed];
    for (;;) {
      if (group.length >= MAX_SIZE) break;
      let best = null;
      for (const star of bright) {
        if (used.has(star.index) || group.includes(star)) continue;
        const link = Math.min(...group.map((m) => angularDistanceDeg(m.dir, star.dir)));
        if (link > LINK_DEG) continue;
        const extent = Math.max(...group.map((m) => angularDistanceDeg(m.dir, star.dir)));
        if (extent > MAX_EXTENT_DEG) continue;
        const score = link + 2.5 * (star.mag - 1.5);
        if (score > MAX_ADDITION_SCORE) continue;
        if (!best || score < best.score) best = { star, score };
      }
      if (!best) break;
      group.push(best.star);
    }
    used.add(seed.index);
    // Three-star figures only when all three are bright enough to read as a pattern on their own.
    if (group.length < 3 || (group.length === 3 && Math.max(...group.map((m) => m.mag)) > 3.3)) continue;
    for (const member of group) used.add(member.index);
    const figure = describeFigure(group.map((m) => m.dir));
    const flux = group.reduce((sum, m) => sum + 10 ** (-0.4 * m.mag), 0);
    candidates.push({
      candidate: candidates.length + 1,
      stars: group.map((m) => starId(m.index)),
      magnitudes: group.map((m) => Number(m.mag.toFixed(2))),
      lines: figure.edges.map(([a, b]) => [starId(group[a].index), starId(group[b].index)]),
      shape: figure.shape,
      brightness: Number(flux.toFixed(3)),
      brightestMagnitude: Number(Math.min(...group.map((m) => m.mag)).toFixed(2)),
      extentDeg: Number(Math.max(...group.flatMap((a) => group.map((b) => angularDistanceDeg(a.dir, b.dir)))).toFixed(1)),
      center: figure.center.map((v) => Number(v.toFixed(5))),
      declinationDeg: Number(latitudeDeg(figure.center, sky.celestialPole).toFixed(1)),
      sunPathLatitudeDeg: Number(latitudeDeg(figure.center, sky.sunPathPole).toFixed(1)),
      alongSunPath: Math.abs(latitudeDeg(figure.center, sky.sunPathPole)) <= SUN_PATH_HALF_WIDTH_DEG,
    });
  }
  return candidates;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const starfield = JSON.parse(readFileSync(resolve(ROOT, "data/stellar/starfield.json"), "utf8"));
  const candidates = findCandidates(starfield, eymSky());
  const out = process.argv[2];
  if (out) writeFileSync(out, `${JSON.stringify(candidates, null, 2)}\n`);
  const tally = (key) => candidates.reduce((m, c) => ({ ...m, [c[key]]: (m[c[key]] ?? 0) + 1 }), {});
  console.log(`${candidates.length} candidates; shapes ${JSON.stringify(tally("shape"))}; north ${candidates.filter((c) => c.declinationDeg >= 0).length} / south ${candidates.filter((c) => c.declinationDeg < 0).length}; along sun path ${candidates.filter((c) => c.alongSunPath).length}`);
}
