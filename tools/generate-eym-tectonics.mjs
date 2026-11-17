// Fits Eym's plates and deep history (scripts/eym-tectonics.mjs) to the fixed end state and writes
// data/eym/tectonics.json: the plates and boundaries, the three unnamed continents' outlines, ranges and
// islands (in the shape scripts/eym-surface.mjs took from seededRing), volcanoes, the history stages, coarse
// rasters for the sea floor and bedrock, and a report. Seeds are tried in a fixed order; the first that meets
// every target is kept. No hand-tuning.
//
//   node tools/generate-eym-tectonics.mjs           write the data file and print the report
//   node tools/generate-eym-tectonics.mjs --check   rebuild and compare with the data file
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { buildEymSurface, EYM_LAYOUT, fromLocal, toLocal, ringAreaKm2, greatCircleKm } from "../scripts/eym-surface.mjs";
import { createRng } from "../scripts/planet-geography.mjs";
import { CAREN_GEOLOGY, EYM_TECTONICS_MODEL, arcKm, classifyBoundary, latLon, layoutFirstLand, makeNoise, plateAt, plateVelocity, presentCrust, rotate, rotationBetween, vec } from "../scripts/eym-tectonics.mjs";

const root = new URL("../", import.meta.url), OUT = new URL("data/eym/tectonics.json", root);
/** What the tectonic history is made from: this tool, the model, the surface and the traced continents. */
export const TECTONIC_SOURCES = ["tools/generate-eym-tectonics.mjs", "scripts/eym-tectonics.mjs", "scripts/eym-surface.mjs", "scripts/planet-geography.mjs", "data/eym/traced-continents.json"];
export const tectonicSourcesSha256 = () => { const h = createHash("sha256"); for (const path of TECTONIC_SOURCES) h.update(readFileSync(new URL(path, root))); return h.digest("hex"); };
export const TECTONIC_SEEDS = Array.from({ length: 40 }, (_, i) => `eym-tectonics|${String(i + 1).padStart(2, "0")}`);
export const TARGET_TOLERANCE = { areaFraction: 0.1, centerDeg: 3 };
/** Eym stays 98.6% ocean: the fit keeps it between these. */
export const OCEAN_FRACTION = [0.9855, 0.9865];
const DEG = Math.PI / 180, MYR = 210, CELL_KM = 8;
const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;

/** The fixed inputs: Caren and Garyk as placed by the surface, Garyk's high ground, the three targets. */
export function tectonicInputs() {
  const traced = JSON.parse(readFileSync(new URL("data/eym/traced-continents.json", root), "utf8"));
  const { surface } = buildEymSurface(traced, { ...EYM_LAYOUT, seeded: [] });
  const main = (id) => surface.coasts.find((c) => c.id.startsWith(`${id}-mainland`)).points;
  const garykCenter = surface.layout.garyk.center, g = traced.continents.garyk, relief = Buffer.from(g.relief.reliefBase64, "base64"), range = [];
  for (let r = 0; r < g.relief.rows; r += 1) for (let c = 0; c < g.relief.cols; c += 1) if (relief[r * g.relief.cols + c] >= 2) range.push(fromLocal(garykCenter, g.relief.northWestKm[0] + (c + 0.5) * g.relief.cellKm, g.relief.northWestKm[1] - (r + 0.5) * g.relief.cellKm));
  return {
    caren: { center: surface.layout.caren.center, ring: main("caren") },
    garyk: { center: garykCenter, ring: main("garyk"), range },
    targets: EYM_LAYOUT.seeded.map(({ id, name, center, areaKm2 }) => ({ id, name, center, areaKm2 })),
    // All the other land (Caren, Garyk and the archipelagos, less inland water), for the ocean fraction.
    otherLandKm2: surface.landAreaKm2,
  };
}

// ---------------------------------------------------------------- contours

/** Closed rings (local km) where field > level on a grid, by marching squares, largest first. */
export function contour(values, cols, rows, x0, y0, cell, level) {
  const at = (c, r) => values[r * cols + c] - level, key = (a) => `${a[0].toFixed(3)},${a[1].toFixed(3)}`;
  const lerpPt = (c0, r0, c1, r1, v0, v1) => { const t = v0 / (v0 - v1); return [x0 + (c0 + (c1 - c0) * t + 0.5) * cell, y0 - (r0 + (r1 - r0) * t + 0.5) * cell]; };
  const edges = [];
  for (let r = 0; r + 1 < rows; r += 1) for (let c = 0; c + 1 < cols; c += 1) {
    const a = at(c, r), b = at(c + 1, r), d = at(c + 1, r + 1), e = at(c, r + 1), idx = (a > 0) | ((b > 0) << 1) | ((d > 0) << 2) | ((e > 0) << 3);
    if (!idx || idx === 15) continue;
    const top = () => lerpPt(c, r, c + 1, r, a, b), right = () => lerpPt(c + 1, r, c + 1, r + 1, b, d), bottom = () => lerpPt(c, r + 1, c + 1, r + 1, e, d), left = () => lerpPt(c, r, c, r + 1, a, e);
    const table = { 1: [[left, top]], 2: [[top, right]], 3: [[left, right]], 4: [[right, bottom]], 5: [[left, top], [right, bottom]], 6: [[top, bottom]], 7: [[left, bottom]], 8: [[bottom, left]], 9: [[bottom, top]], 10: [[top, right], [bottom, left]], 11: [[bottom, right]], 12: [[right, left]], 13: [[right, top]], 14: [[top, left]] };
    for (const [p, q] of table[idx]) edges.push([p(), q()]);
  }
  // Join the segments by their shared ends (each end is shared by exactly two segments).
  const ends = new Map(), link = (k, i) => { const l = ends.get(k); if (l) l.push(i); else ends.set(k, [i]); };
  edges.forEach(([p, q], i) => { link(key(p), i); link(key(q), i); });
  const rings = [], used = new Uint8Array(edges.length);
  for (let s0 = 0; s0 < edges.length; s0 += 1) {
    if (used[s0]) continue;
    const ring = [edges[s0][0]]; let cur = s0, at = edges[s0][1]; used[s0] = 1;
    for (let guard = 0; guard < edges.length; guard += 1) {
      ring.push(at);
      const next = (ends.get(key(at)) ?? []).find((i) => !used[i]); if (next === undefined) break;
      used[next] = 1; const [p, q] = edges[next]; at = key(p) === key(at) ? q : p; cur = next;
    }
    if (ring.length > 8) rings.push(ring);
  }
  return rings.map((ring) => ({ ring, area: ringAreaKm2(ring) })).filter((x) => x.area > 0).sort((a, b) => b.area - a.area);
}

/** Douglas–Peucker on a closed ring (local km). */
function simplify(closed, tol) {
  // Split the closed ring at the point farthest from its start, simplify each half, and join them.
  const ring = closed.length > 2 && closed[0][0] === closed.at(-1)[0] && closed[0][1] === closed.at(-1)[1] ? closed.slice(0, -1) : closed;
  let far = 0, farD = -1; for (let k = 1; k < ring.length; k += 1) { const d = Math.hypot(ring[k][0] - ring[0][0], ring[k][1] - ring[0][1]); if (d > farD) { farD = d; far = k; } }
  const a = simplifyOpen(ring.slice(0, far + 1), tol), b = simplifyOpen([...ring.slice(far), ring[0]], tol);
  return [...a, ...b.slice(1, -1)];
}
function simplifyOpen(ring, tol) {
  if (ring.length < 3) return ring;
  const keep = new Uint8Array(ring.length); keep[0] = 1; keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop(); let best = -1, bestD = tol;
    const [ax, ay] = ring[i], [bx, by] = ring[j], dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
    for (let k = i + 1; k < j; k += 1) { const d = Math.abs((ring[k][0] - ax) * dy - (ring[k][1] - ay) * dx) / l; if (d > bestD) { bestD = d; best = k; } }
    if (best >= 0) { keep[best] = 1; stack.push([i, best], [best, j]); }
  }
  return ring.filter((_, k) => keep[k]);
}

// ---------------------------------------------------------------- one seed

/** Build everything for one seed; returns { ok, failures, result }. */
export function buildForSeed(seed, inputs = tectonicInputs()) {
  const { caren, garyk, targets } = inputs, failures = [];
  const first = layoutFirstLand({ seed, garyk, caren, targets }), rng = createRng(`${seed}|plates`);

  // Each piece: its share of the First Land, where its centre was, and the turn that brings it to today.
  const pieces = first.pieces.map((pc, k) => {
    let sum = [0, 0, 0], n = 0;
    for (let x = -2.4 * pc.r; x <= 2.4 * pc.r; x += 25) for (let y = -2.4 * pc.r; y <= 2.4 * pc.r; y += 25) {
      const [lat, lon] = fromLocal(latLon(pc.then), x, y), p = vec([lat, lon]);
      if (first.pieceField(k, p) > 0) { sum = [sum[0] + p[0], sum[1] + p[1], sum[2] + p[2]]; n += 1; }
    }
    const centroidThen = n ? latLon(norm3(sum)) : latLon(pc.then), now = vec(pc.target.center), a = rotationBetween(vec(centroidThen), now), spin = (rng() - 0.5) * 70 * DEG;
    const forward = (p) => rotate(rotate(p, a.axis, a.angle), now, spin), back = (p) => rotate(rotate(p, now, -spin), a.axis, -a.angle);
    // The equivalent single Euler pole over the drift: compose by turning two test points.
    const e1 = forward([1, 0, 0]), e2 = forward([0, 1, 0]);
    const pole = eulerPole([1, 0, 0], e1, [0, 1, 0], e2);
    return { ...pc, centroidThen, forward, back, pole, angleDeg: pole.angle / DEG, emptyThen: n === 0 };
  });

  // Plates: Caren's, Garyk's and the one pressing on Garyk's ranges from the north, the three continents', then sea floor.
  const [mLat, mLon] = meanLatLon(garyk.range), m = vec([mLat, mLon]), axis = principalAxis(garyk.range, [mLat, mLon]);
  const gUp = vec(garyk.center), toward = Math.sign(-(arcKm(gUp, destination(m, axis + 90, 10)) - arcKm(gUp, m))) || 1;
  const garykSeed = destination(m, axis + 90 * toward, 950), northSeed = destination(m, axis - 90 * toward, 950);
  const gRotAngle = first.gRot.angle / MYR / DEG;
  const plates = [
    { id: "caren", name: "Caren Plate", v: vec(caren.center), weightKm: 650, pole: randomPole(rng), rate: 0.12, kind: "oceanic" },
    { id: "garyk", name: "Garyk Plate", v: garykSeed, weightKm: 250, pole: latLon(first.gRot.axis), rate: gRotAngle, kind: "continental" },
    { id: "garyk-north", name: "Northern Garyk Sea Plate", v: northSeed, weightKm: 150, pole: null, rate: 0, kind: "oceanic" },
    ...pieces.map((pc) => ({ id: pc.id, name: `${pc.target.name.replace(/^the /, "").replace(/^./, (c) => c.toUpperCase())} Plate`, v: vec(pc.target.center), weightKm: 450, pole: latLon(pc.pole.axis), rate: pc.angleDeg / MYR, kind: "continental" })),
  ];
  // The north plate closes on Garyk's ranges at 40–60 mm a year.
  {
    const g = plates[1], w = vec(g.pole).map((x) => x * g.rate), n = norm3(sub(destination(m, axis - 90 * toward, 10), m)), closing = 40 + rng() * 20;
    const rel = cross3(m, n.map((x) => -x)).map((x) => x * closing / (6371 * DEG)), wN = [w[0] + rel[0], w[1] + rel[1], w[2] + rel[2]], rate = Math.hypot(...wN);
    plates[2].pole = latLon(norm3(wN)); plates[2].rate = rate;
  }
  const oceanic = 10 - plates.length;
  for (let i = 0; plates.filter((p) => p.kind === "oceanic").length < 2 + oceanic && i < 400; i += 1) {
    const v = vec([Math.asin(rng() * 2 - 1) / DEG, rng() * 360 - 180]);
    if (plates.some((p) => arcKm(p.v, v) < 3200)) continue;
    plates.push({ id: `ocean-${plates.length - 5}`, name: null, v, weightKm: 0, pole: randomPole(rng), rate: 0.25 + rng() * 0.55, kind: "oceanic" });
  }
  for (let i = 0, made = 0; made < 6 && i < 400; i += 1) {
    const v = vec([Math.asin(rng() * 2 - 1) / DEG, rng() * 360 - 180]);
    if (plates.some((p) => arcKm(p.v, v) < 1400) || arcKm(v, vec(caren.center)) < 2600) continue;
    plates.push({ id: `micro-${made + 1}`, name: null, v, weightKm: -900, pole: randomPole(rng), rate: 0.3 + rng() * 0.5, kind: "oceanic", micro: true }); made += 1;
  }
  const warp = makeNoise(`${seed}|plate-warp`);
  const plateOf = (p) => plateAt(plates, warp, p);

  // The three continents today: crust fields on local grids, cut at the level that gives each its target area.
  const continents = [];
  for (const [k, pc] of pieces.entries()) {
    const t = pc.target, plateIndex = plates.findIndex((p) => p.id === t.id), extent = 2.3 * pc.r + 500, cols = Math.ceil(2 * extent / CELL_KM), rows = cols;
    const x0 = -extent, y0 = extent, values = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
      const [lat, lon] = fromLocal(t.center, x0 + (c + 0.5) * CELL_KM, y0 - (r + 0.5) * CELL_KM);
      values[r * cols + c] = presentCrust(first, k, pc.back, plates[plateIndex], vec([lat, lon]));
    }
    let lo = -300, hi = 300, rings = [];
    for (let it = 0; it < 26; it += 1) { const mid = (lo + hi) / 2, rs = contour(values, cols, rows, x0, y0, CELL_KM, mid); if (!rs.length || rs[0].area < t.areaKm2) hi = mid; else lo = mid; }
    rings = contour(values, cols, rows, x0, y0, CELL_KM, lo);
    if (!rings.length) { failures.push(`${t.id}: no land`); continue; }
    const main = rings[0], centroid = ringCentroidLatLon(t.center, main.ring), islands = rings.slice(1).filter((x) => x.area >= 150 && !insideRing(main.ring, x.ring[0])).slice(0, 18);
    continents.push({ id: t.id, plate: t.id, level: lo, main, islands, centroid, grid: { values, cols, rows, x0, y0 }, piece: pc });
    const areaErr = main.area / t.areaKm2 - 1, centerErr = greatCircleKm(centroid, t.center) / 111.2;
    if (Math.abs(areaErr) > TARGET_TOLERANCE.areaFraction) failures.push(`${t.id}: area ${Math.round(main.area)} vs ${Math.round(t.areaKm2)}`);
    if (centerErr > TARGET_TOLERANCE.centerDeg) failures.push(`${t.id}: centre ${centerErr.toFixed(1)}° off`);
    if (!insideRing(main.ring, [0, 0])) failures.push(`${t.id}: its centre is not on its mainland`);
    const onPlate = main.ring.filter((_, i) => i % 6 === 0).map(([x, y]) => plateOf(vec(fromLocal(t.center, x, y))) === plateIndex);
    if (onPlate.filter(Boolean).length < onPlate.length * 0.97) failures.push(`${t.id}: crosses a plate boundary`);
    if (pc.angleDeg / MYR * 111.2 > 100) failures.push(`${t.id}: drifts too fast`);
    for (const other of [caren, garyk]) if (minGap(main.ring.map(([x, y]) => fromLocal(t.center, x, y)), other.ring) < 450) failures.push(`${t.id}: too near ${other === caren ? "Caren" : "Garyk"}`);
  }
  // Eym stays 98.6% ocean.
  const landKm2 = inputs.otherLandKm2 + continents.reduce((sum, c) => sum + c.main.area + c.islands.reduce((t, x) => t + x.area, 0), 0), oceanFraction = 1 - landKm2 / (4 * Math.PI * 6371 ** 2);
  if (oceanFraction < OCEAN_FRACTION[0] || oceanFraction > OCEAN_FRACTION[1]) failures.push(`ocean ${(oceanFraction * 100).toFixed(3)}%`);
  for (let i = 0; i < continents.length; i += 1) for (let j = i + 1; j < continents.length; j += 1) {
    const a = continents[i].main.ring.map(([x, y]) => fromLocal(continents[i].piece.target.center, x, y)), b = continents[j].main.ring.map(([x, y]) => fromLocal(continents[j].piece.target.center, x, y));
    if (minGap(a, b) < 600) failures.push(`${continents[i].id} and ${continents[j].id} touch`);
  }
  // Caren rests wholly on its plate, far from any edge; Garyk's high ground lies on the edge with the north plate.
  const carenOk = caren.ring.filter((_, i) => i % 10 === 0).every((ll) => { const p = vec(ll); return plateOf(p) === 0 && [0, 90, 180, 270].every((b) => plateOf(destination(p, b, 250)) === 0); });
  if (!carenOk) failures.push("Caren is not wholly inside its own plate");
  const rangeSample = garyk.range.filter((_, i) => i % 4 === 0), nearEdge = rangeSample.filter((ll) => { const p = vec(ll); return [0, 45, 90, 135, 180, 225, 270, 315].some((b) => plateOf(destination(p, b, 260)) === 2); }).length;
  if (nearEdge < rangeSample.length * 0.55) failures.push(`Garyk's ranges are not on its convergent edge (${nearEdge}/${rangeSample.length})`);
  const garykOn = garyk.ring.filter((_, i) => i % 10 === 0), garykOnPlate = garykOn.filter((ll) => [1, 2].includes(plateOf(vec(ll)))).length;
  if (garykOnPlate < garykOn.length * 0.95) failures.push("Garyk lies across a third plate");
  // Active margins: beyond each continent's leading coast the sea floor belongs to the next plate, so its
  // coastal ranges stand on a convergent edge (the sea floor ahead goes down under the continent).
  const margins = continents.map((cont) => ({ cont, index: plates.findIndex((p) => p.id === cont.id), c: vec(cont.piece.target.center) }));
  const plateWithMargins = (p) => {
    const base = plateOf(p);
    for (const m of margins) {
      if (base !== m.index) continue;
      const t = m.cont.piece.target, [lat, lon] = latLon(p), [x, y] = toLocal(t.center, lat, lon), g = m.cont.grid;
      const col = Math.floor((x - g.x0) / CELL_KM), row = Math.floor((g.y0 - y) / CELL_KM); if (col < 0 || row < 0 || col >= g.cols || row >= g.rows) return base;
      const v = g.values[row * g.cols + col]; if (v > m.cont.level - 140) return base;
      const out = norm3(sub(p, m.c)), vel = plateVelocity(plates[m.index], p), sp = Math.hypot(...vel) || 1;
      if (dotv(out, vel) / sp > 0.35) return plateAt(plates, warp, p, m.index);
    }
    return base;
  };
  return { ok: failures.length === 0, failures, state: { seed, first, pieces, plates, plateOf: plateWithMargins, continents, inputs, rangeAxis: { center: [mLat, mLon], bearing: axis, toward } } };
}

// ---------------------------------------------------------------- the global picture: boundaries, volcanoes, rasters

function globalPicture(state) {
  const { plates, plateOf, seed } = state, res = 0.5, cols = 360 / res, rows = 180 / res, ids = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) ids[r * cols + c] = plateOf(vec([90 - (r + 0.5) * res, -180 + (c + 0.5) * res]));
  const boundary = [];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) {
    const a = ids[r * cols + c];
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const rr = r + dr, cc = (c + dc) % cols; if (rr >= rows) continue; const b = ids[rr * cols + cc]; if (a === b) continue;
      const pa = vec([90 - (r + 0.5) * res, -180 + (c + 0.5) * res]), pb = vec([90 - (rr + 0.5) * res, -180 + (cc + 0.5) * res]), p = norm3([(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2]);
      const n = norm3(sub(pb, pa)), cls = classifyBoundary(plates[a], plates[b], p, n);
      boundary.push({ p, a, b, ...cls });
    }
  }
  // Volcanoes: on the overriding side of convergent edges where a sea plate goes down, every ~300 km; and hotspots.
  const vrng = createRng(`${seed}|volcanoes`), volcanoes = [], chosen = [];
  const continental = (i) => plates[i].kind === "continental";
  const garykI = plates.findIndex((p) => p.id === "garyk");
  for (const e of boundary) {
    // Arc volcanoes stand where sea floor goes down, not on a collision seam.
    if (e.type !== "convergent" || e.closingMmYr < 25 || e.a === garykI || e.b === garykI || (continental(e.a) && continental(e.b))) continue;
    if (chosen.some((q) => arcKm(q, e.p) < 420)) continue;
    const over = continental(e.a) && !continental(e.b) ? e.a : continental(e.b) && !continental(e.a) ? e.b : (e.a < e.b ? e.a : e.b), down = over === e.a ? e.b : e.a;
    if (plates[over].id === "caren" || plates[down].id === "caren") continue;
    const awayTo = norm3(sub(plates[over].v, e.p)), spot = norm3([e.p[0] + awayTo[0] * 0.025, e.p[1] + awayTo[1] * 0.025, e.p[2] + awayTo[2] * 0.025]);
    if (plateOf(spot) !== over) continue;
    chosen.push(e.p);
    const activity = e.closingMmYr > 45 ? "active" : vrng() < 0.4 ? "dormant" : "extinct";
    volcanoes.push({ at: latLon(spot).map(r3), kind: continental(over) ? "arc (continental margin)" : "arc (island)", setting: "subduction", plate: plates[over].id, ageMyr: r1(0.1 + vrng() ** 2 * 30), activity, heightM: Math.round(1800 + vrng() * 2600) });
  }
  const archipelagoHotspots = state.archipelagoCenters ?? [];
  const hotspots = archipelagoHotspots.filter((_, i) => i % 3 === 0).map((ll, i) => ({ at: ll, kind: "hotspot", setting: "hotspot", plate: plates[plateOf(vec(ll))].id, ageMyr: r1(0.01 + vrng() * 2), activity: i === 0 ? "active" : vrng() < 0.6 ? "active" : "dormant", heightM: Math.round(2500 + vrng() * 1800) }));

  // Coarse rasters at 1°: plate, distance to the nearest ridge and trench (in 10 km steps), and margin side.
  const R = 1, C = 360, Rw = 180, plateRaster = new Uint8Array(C * Rw), ridgeKm = new Uint8Array(C * Rw).fill(255), trenchKm = new Uint8Array(C * Rw).fill(255), collideKm = new Uint8Array(C * Rw).fill(255);
  for (let r = 0; r < Rw; r += 1) for (let c = 0; c < C; c += 1) plateRaster[r * C + c] = ids[(r * 2 + 1) * cols + c * 2 + 1];
  const thin = (type, f = () => true) => { const out = []; for (const e of boundary) if (e.type === type && f(e) && !out.some((q) => arcKm(q, e.p) < 60)) out.push(e.p); return out; };
  // Garyk's northern edge is a collision: its ranges rose where the Northern Garyk Sea Plate's terranes were pressed onto it.
  const garykIndex = plates.findIndex((p) => p.id === "garyk"), collides = (e) => (continental(e.a) && continental(e.b)) || e.a === garykIndex || e.b === garykIndex;
  const ridges = thin("divergent"), trenches = thin("convergent", (e) => !collides(e)), collisions = thin("convergent", collides);
  for (let r = 0; r < Rw; r += 1) for (let c = 0; c < C; c += 1) {
    const p = vec([90 - (r + 0.5) * R, -180 + (c + 0.5) * R]), near = (list) => { let best = Infinity; for (const q of list) { const d = arcKm(p, q); if (d < best) best = d; } return Math.min(255, Math.round(best / 10)); };
    ridgeKm[r * C + c] = near(ridges); trenchKm[r * C + c] = near(trenches); collideKm[r * C + c] = near(collisions);
  }
  const typed = (type) => boundary.filter((e) => e.type === type).length;
  return { boundary, volcanoes: [...volcanoes, ...hotspots], rasters: { resolutionDeg: 1, plate: b64(plateRaster), ridgeDistance10Km: b64(ridgeKm), trenchDistance10Km: b64(trenchKm), collisionDistance10Km: b64(collideKm) }, counts: { convergent: typed("convergent"), divergent: typed("divergent"), transform: typed("transform") }, lines: { ridges, trenches, collisions } };
}

// ---------------------------------------------------------------- ranges

/** Coastal ranges along each continent's leading edge, and the old suture through it. */
function rangesFor(state, cont) {
  const { pieces, plates } = state, pc = cont.piece, t = pc.target, plate = plates.find((p) => p.id === t.id), c = vec(t.center), ridges = [];
  const ring = cont.main.ring, lead = ring.map(([x, y]) => { const p = vec(fromLocal(t.center, x, y)), out = norm3(sub(p, c)), v = plateVelocity(plate, p), s = Math.hypot(...v) || 1; return (out[0] * v[0] + out[1] * v[1] + out[2] * v[2]) / s; });
  let run = [];
  const flush = () => { if (run.length > ring.length * 0.08) { const step = Math.max(1, Math.floor(run.length / 9)), pts = run.filter((_, i) => i % step === 0).map(([x, y]) => { const l = Math.hypot(x, y) || 1; return [r1(x - x / l * 105), r1(y - y / l * 105)]; }); ridges.push({ kind: "coastal range", origin: "subduction", heightM: Math.round(3000 + 1500 * Math.min(1, Math.hypot(...plateVelocity(plate, c)) / 60)), widthKm: 75, points: pts }); } run = []; };
  for (let i = 0; i < ring.length * 2; i += 1) { const k = i % ring.length; if (lead[k] > 0.5) run.push(ring[k]); else if (run.length) { flush(); if (i >= ring.length) break; } }
  flush();
  // The suture: where the piece's two old cores were joined when the First Land was assembled (~320 Myr ago).
  const srng = createRng(`${state.seed}|suture|${t.id}`), bearing = srng() * 180, pts = [];
  for (let s = -0.85; s <= 0.851; s += 0.17) {
    const then = destinationKm(vec(pc.centroidThen), bearing, s * pc.r * 1.1), now = pc.forward(then), [lat, lon] = latLon(now), [x, y] = toLocal(t.center, lat, lon);
    if (insideRing(ring, [x, y])) pts.push([r1(x), r1(y)]);
  }
  if (pts.length >= 3) ridges.push({ kind: "old collision belt", origin: "suture", heightM: Math.round(1700 + srng() * 900), widthKm: 110, points: pts });
  const seen = new Set(), unique = ridges.filter((r) => { const k = JSON.stringify(r.points[0]); if (seen.has(k)) return false; seen.add(k); return true; });
  return unique.sort((a, b) => b.heightM - a.heightM).slice(0, 3);
}

// ---------------------------------------------------------------- writing

/**
 * Try the seeds in order and return the first that meets every target. `known` holds seeds already found to fail
 * (seed -> failures) so a run can pick up where an earlier one stopped; `budget()` is asked before each new seed
 * and, when it says no, the run stops and returns { incomplete: true, tried } instead.
 */
export function buildTectonics({ seeds = TECTONIC_SEEDS, inputs = tectonicInputs(), archipelagoCenters = [], log = () => {}, known = {}, budget = () => true } = {}) {
  const tried = [];
  for (const seed of seeds) {
    if (known[seed]) { tried.push({ seed, ok: false, failures: known[seed] }); log(`${seed}: ${known[seed].join("; ")} (from an earlier run)`); continue; }
    if (!budget()) return { incomplete: true, tried };
    const result = buildForSeed(seed, inputs);
    tried.push({ seed, ok: result.ok, failures: result.failures });
    log(`${seed}: ${result.ok ? "meets every target" : result.failures.join("; ")}`);
    if (!result.ok) continue;
    const state = { ...result.state, archipelagoCenters };
    const world = globalPicture(state);
    const continents = Object.fromEntries(state.continents.map((cont) => {
      const t = cont.piece.target, main = simplify(cont.main.ring, 1.5).map(([x, y]) => [r1(x), r1(y)]);
      const islands = cont.islands.map((x) => simplify(x.ring, 1).map(([a, b]) => [r1(a), r1(b)])).filter((r) => r.length >= 4);
      return [t.id, {
        id: t.id, name: t.name, center: t.center, plate: t.id,
        rings: [main, ...islands], kinds: ["mainland", ...islands.map(() => "island")],
        mainlandAreaKm2: Math.round(ringAreaKm2(main)), targetAreaKm2: Math.round(t.areaKm2),
        centroid: cont.centroid.map(r3), centroidOffsetDeg: r3(greatCircleKm(cont.centroid, t.center) / 111.2),
        ridges: rangesFor(state, cont),
        driftDeg: r1(cont.piece.angleDeg), driftMmYr: r1(cont.piece.angleDeg * 111.2 / MYR), firstLandCentre: cont.piece.centroidThen.map(r3),
      }];
    }));
    const plates = state.plates.map((p) => ({ id: p.id, name: p.name, kind: p.kind, micro: Boolean(p.micro), seed: latLon(p.v).map(r3), weightKm: p.weightKm, pole: p.pole.map(r3), rateDegPerMyr: r3(p.rate), speedMmYrAtSeed: r1(Math.hypot(...plateVelocity(p, p.v))) }));
    const history = [
      { stage: "assembly", myrAgo: [420, 320], text: "Old cores collide and weld into the First Land; their seams become the inland belts of the Eastern, Northern and Southern continents and the old core under Garyk." },
      { stage: "break-up", myrAgo: [MYR, MYR - 20], text: "The First Land rifts apart around Garyk; the rifts become passive, smooth coasts with wide shelves." },
      { stage: "drift", myrAgo: [MYR - 20, 0], text: "The pieces drift to where they stand today, each turning about its own pole." },
      { stage: "accretion", myrAgo: [120, 0], text: "Leading edges override sinking sea floor: coastal ranges, volcanoes and island arcs grow along them." },
      { stage: "collision", myrAgo: [60, 0], text: "The Northern Garyk Sea Plate closes on Garyk; its northern ranges rise along the seam." },
      { stage: "erosion", myrAgo: [320, 0], text: "Wear and the slow rebound of the crust soften the old belts to rounded hills and lower the young ranges." },
      { stage: "Caren", myrAgo: null, text: "Caren is set down whole by the gods into the sea where the First Land had broken apart. It takes no part in the turning of the plates." },
    ];
    const data = {
      schemaVersion: 1, model: EYM_TECTONICS_MODEL, sourcesSha256: tectonicSourcesSha256(), seed, seedsTried: tried.map((x) => x.seed), breakupMyrAgo: MYR,
      tolerance: TARGET_TOLERANCE, plates, warpSeed: `${seed}|plate-warp`,
      firstLand: { centre: latLon(state.first.S).map(r3), pieces: state.pieces.map((pc) => ({ id: pc.id, centre: pc.centroidThen.map(r3) })) },
      garyk: { rangeAxis: { centre: state.rangeAxis.center.map(r3), bearingDeg: r1(state.rangeAxis.bearing) }, convergentWith: "garyk-north", core: "old core of granite and gneiss under the interior (part of the First Land)" },
      caren: CAREN_GEOLOGY, continents,
      boundaries: { counts: world.counts, ridges: world.lines.ridges.map((p) => latLon(p).map((v) => r1(v))), trenches: world.lines.trenches.map((p) => latLon(p).map((v) => r1(v))), collisions: world.lines.collisions.map((p) => latLon(p).map((v) => r1(v))) },
      volcanoes: world.volcanoes, rasters: world.rasters, history,
      report: { tried, chosen: seed },
    };
    return data;
  }
  throw new Error(`No seed met the targets:\n${tried.map((x) => `${x.seed}: ${x.failures.join("; ")}`).join("\n")}`);
}

// ---------------------------------------------------------------- small helpers

function eulerPole(a, a2, b, b2) {
  // The rotation taking a→a2 and b→b2: its axis is perpendicular to both displacements.
  const da = sub(a2, a), db = sub(b2, b); let axis = cross3(da, db);
  if (Math.hypot(...axis) < 1e-9) axis = cross3(a, a2);
  axis = norm3(axis); const pa = norm3(sub(a, axis.map((x) => x * dotv(a, axis)))), qa = norm3(sub(a2, axis.map((x) => x * dotv(a2, axis))));
  let angle = Math.atan2(dotv(cross3(pa, qa), axis), dotv(pa, qa)); if (angle < 0) { axis = axis.map((x) => -x); angle = -angle; }
  return { axis, angle };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dotv = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const randomPole = (rng) => [Math.asin(rng() * 2 - 1) / DEG, rng() * 360 - 180];
const b64 = (bytes) => Buffer.from(bytes).toString("base64");
function destination(p, bearingDeg, km) { return destinationKm(p, bearingDeg, km); }
function destinationKm(p, bearingDeg, km) {
  const [lat, lon] = latLon(p), d = km / 6371, b = bearingDeg * DEG, la = lat * DEG;
  const lat2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lon2 = lon * DEG + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(lat2));
  return vec([lat2 / DEG, lon2 / DEG]);
}
function meanLatLon(points) { let s = [0, 0, 0]; for (const ll of points) { const v = vec(ll); s = [s[0] + v[0], s[1] + v[1], s[2] + v[2]]; } return latLon(norm3(s)); }
/** The bearing (degrees from north) along which a set of points is longest, about a centre. */
function principalAxis(points, center) {
  let sxx = 0, syy = 0, sxy = 0;
  for (const [lat, lon] of points) { const [x, y] = toLocal(center, lat, lon); sxx += x * x; syy += y * y; sxy += x * y; }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy); // from east, anticlockwise
  return (90 - theta / DEG + 360) % 180;
}
function ringCentroidLatLon(center, ring) { let ax = 0, ay = 0, a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const cr = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1]; a += cr; ax += (ring[j][0] + ring[i][0]) * cr; ay += (ring[j][1] + ring[i][1]) * cr; } return fromLocal(center, ax / (3 * a), ay / (3 * a)); }
function insideRing(ring, [x, y]) { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; } return inside; }
function minGap(a, b) { let best = Infinity; const A = a.filter((_, i) => i % 8 === 0), B = b.filter((_, i) => i % 8 === 0); for (const p of A) for (const q of B) best = Math.min(best, greatCircleKm(p, q)); return best; }

// ---------------------------------------------------------------- command line

//   --budget-s N   start no new seed after N seconds: seeds found to fail are kept in .cache/ (not committed)
//                  and the next run carries on from them, so the fit can be made in short steps.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const archipelagoCenters = EYM_LAYOUT.archipelagos.centers ?? [];
  const at = process.argv.indexOf("--budget-s"), budgetS = at > 0 ? Number(process.argv[at + 1]) : Infinity, started = Date.now();
  const cacheDir = new URL(".cache/eym-tectonics/", root), cacheUrl = new URL(`${tectonicSourcesSha256()}.json`, cacheDir);
  const known = existsSync(cacheUrl) ? JSON.parse(readFileSync(cacheUrl, "utf8")) : {};
  const data = buildTectonics({ archipelagoCenters, log: (line) => console.log(line), known, budget: () => (Date.now() - started) / 1000 < budgetS });
  if (data.incomplete) {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cacheUrl, JSON.stringify(Object.fromEntries(data.tried.map((t) => [t.seed, t.failures]))));
    console.log(`Stopped after ${data.tried.length} seeds (time budget); run again to carry on.`);
    process.exit(0);
  }
  const text = `${JSON.stringify(data)}\n`;
  if (process.argv.includes("--check")) {
    const same = readFileSync(OUT, "utf8") === text; console.log(same ? "tectonics.json is up to date" : "tectonics.json differs"); process.exit(same ? 0 : 1);
  }
  writeFileSync(OUT, text);
  console.log(`seed ${data.seed}; ${data.plates.length} plates (${data.plates.filter((p) => p.micro).length} micro); boundary cells ${JSON.stringify(data.boundaries.counts)}; ${data.volcanoes.length} volcanoes`);
  for (const c of Object.values(data.continents)) console.log(`${c.id}: ${c.mainlandAreaKm2} km² (target ${c.targetAreaKm2}), centre ${c.centroidOffsetDeg}° off, ${c.rings.length - 1} islands, ${c.ridges.length} ranges, drift ${c.driftDeg}° (${c.driftMmYr} mm/yr)`);
}
