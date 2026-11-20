#!/usr/bin/env node
// Grows Gaffa, Khohalis and Demani to the sizes the canon gives them (Eym about 80% water; docs/eym-canon.md) and
// writes data/eym/growth.json. The governing rule is least change: the tectonic history (data/eym/tectonics.json)
// is read and never altered. Each continent's fitted outline is its core; land is added outward from it
//   (a, c) on its own plate first: its flooded margins raised, its land carried on along its own geology;
//   (b) then across the plate boundaries that already exist, as crust accreted to it (a composite continent, as
//       Asia is), which costs more reach: no boundary, pole, speed, hotspot or date is changed;
// leaning the way the dials say, keeping clear of Caren, Garyk, their crossing and each other. Khohalis and Demani
// keep their shapes (each grows by its own outline scaled about its core); Gaffa grows last, round them.
// Nothing is random: the coasts' unevenness is a fixed noise. The measures of the change are written with the result.
//
//   node tools/generate-eym-growth.mjs [--check]

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { inputsFingerprint, WORLD_INPUTS } from "../scripts/eym-world-inputs.mjs";
import { buildEymSurface, EYM_LAYOUT, EYM_RADIUS_KM, fromLocal, greatCircleKm, sphericalRingAreaKm2, toLocal } from "../scripts/eym-surface.mjs";
import { classifyBoundary, makeNoise, plateVelocity, vec } from "../scripts/eym-tectonics.mjs";
import { contour } from "./generate-eym-tectonics.mjs";

const root = new URL("../", import.meta.url), OUT = new URL("data/eym/growth.json", root);
export const GROWTH_MODEL = "eym-growth-v1";
/** What the growth is made from: this tool, the surface's geometry, the traced continents and the tectonic history. */
export const GROWTH_SOURCES = ["tools/generate-eym-growth.mjs", "scripts/eym-surface.mjs", "data/eym/traced-continents.json", "data/eym/tectonics.json"];
/** The dials it follows (scripts/eym-world-inputs.mjs). */
export const GROWTH_INPUTS = ["layout", "growth", "seaFloor"];
export const growthSourcesSha256 = () => { const h = createHash("sha256"); for (const p of GROWTH_SOURCES) h.update(readFileSync(new URL(p, root))); h.update(inputsFingerprint(...GROWTH_INPUTS)); return h.digest("hex"); };

/** A hash of the tectonic history itself: the file without its stamp of sources (which moves when a tool's text does). */
export const tectonicContentSha256 = ({ sourcesSha256, ...history }) => createHash("sha256").update(JSON.stringify(history)).digest("hex");

const G = WORLD_INPUTS.growth, DEG = Math.PI / 180, EYM_KM2 = 4 * Math.PI * EYM_RADIUS_KM ** 2;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t)), round1 = (v) => Math.round(v * 10) / 10;
const insideRing = (ring, x, y) => { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < xi + (y - yi) / (yj - yi) * (xj - xi)) inside = !inside; } return inside; };

/** How far from a continent's core its own flooded margin reaches: a passive margin's shelf and slope (km). */
const SHELF_REACH_KM = WORLD_INPUTS.seaFloor.shelfKm.passive + WORLD_INPUTS.seaFloor.slopeKm;
/** The tectonic origins grown land can have, in words (each grown square has exactly one). */
export const ORIGINS = Object.freeze({
  "raised-shelf": "the continent's own flooded shelf and slope, raised above the sea",
  "accretionary-belt": "terranes and island arcs swept up along the leading edge of its own plate",
  "raised-margin": "stretched continental crust of its rifted margin, raised",
  accreted: "crust of a neighbouring plate (terranes, microcontinents, island arcs) welded on where the plates meet, along a suture range",
  "rift-shoulder": "continental crust on the far side of a rift that is opening within the continent, its shoulders raised",
  "joined-alongside": "terranes and microcontinents of a neighbouring plate brought alongside and joined on, where the two plates now slide past each other",
});

/** The nearest of a set of [lat, lon] points to a place (km), searched by latitude bands. */
function nearestKm(points) {
  const bands = Array.from({ length: 180 }, () => []); for (const p of points) bands[Math.min(179, Math.max(0, Math.floor(p[0] + 90)))].push(p);
  return (lat, lon, limit = Infinity) => {
    let best = limit; const b0 = Math.floor(lat + 90);
    for (let d = 0; d < 180; d += 1) {
      if ((d - 1) * 111.2 > best) break;
      for (const b of d ? [b0 - d, b0 + d] : [b0]) { if (b < 0 || b > 179) continue; for (const p of bands[b]) { const km = greatCircleKm(p, [lat, lon]); if (km < best) best = km; } }
    }
    return best;
  };
}

/**
 * Grow the continents. `tectonics` is data/eym/tectonics.json, `traced` data/eym/traced-continents.json.
 * Returns the document written to data/eym/growth.json.
 */
export function buildGrowth({ tectonics, traced, layout = EYM_LAYOUT, dials = G } = {}) {
  const plates = Buffer.from(tectonics.rasters.plate, "base64"), plateAt = (lat, lon) => plates[Math.min(179, Math.max(0, Math.floor(90 - lat))) * 360 + ((Math.floor(lon + 180) % 360) + 360) % 360];
  // What is fixed: Caren, Garyk and the crossing between their ports.
  const { surface } = buildEymSurface(traced, { ...layout, seeded: [] }), thin = (ring) => ring.filter((_, i) => i % 5 === 0);
  const coastsOf = (name) => surface.coasts.filter((c) => c.continent === name).flatMap((c) => thin(c.points));
  const carenPts = coastsOf("Caren"), garykPts = coastsOf("Garyk"), { carenPort, garykPort } = surface.layout.garyk;
  for (let f = 0; f <= 1; f += 0.02) garykPts.push([carenPort[0] + f * (garykPort[0] - carenPort[0]), carenPort[1] + f * ((((garykPort[1] - carenPort[1]) + 540) % 360) - 180)]);
  const toCaren = nearestKm(carenPts), toGaryk = nearestKm(garykPts), noise = makeNoise(`${layout.seed}|growth`);
  const grownPts = []; // the coasts of the continents already grown
  const continents = {}, cell = dials.cellKm;
  for (const id of dials.order) {
    const spec = layout.seeded.find((s) => s.id === id), fitted = tectonics.continents[id], core = fitted.rings[0], plate = tectonics.plates.findIndex((p) => p.id === fitted.plate), target = dials.areaKm2[id];
    const [leanDeg, lean] = dials.lean[id], toOthers = grownPts.length ? nearestKm(grownPts) : null;
    // The core's reach in every direction from its centre (5° steps, smoothed): the shape that is scaled up.
    let cx = 0, cy = 0; for (const [x, y] of core) { cx += x; cy += y; } cx /= core.length; cy /= core.length;
    const reach = new Float64Array(72); for (const [x, y] of core) { const b = Math.floor(((Math.atan2(x - cx, y - cy) / DEG + 360) % 360) / 5) % 72; reach[b] = Math.max(reach[b], Math.hypot(x - cx, y - cy)); }
    for (let b = 0; b < 72; b += 1) if (!reach[b]) reach[b] = (reach[(b + 71) % 72] + reach[(b + 1) % 72]) / 2;
    // (A continent that may be reshaped keeps only part of its core's shape: its reach is drawn toward the mean.)
    const mean = Math.exp(reach.reduce((s, v) => s + Math.log(v), 0) / 72), keep = dials.shape[id]; for (let b = 0; b < 72; b += 1) reach[b] = mean ** (1 - keep) * reach[b] ** keep;
    const reachAt = (bearing) => { const u = bearing / 5, b0 = Math.floor(u) % 72, f = u - Math.floor(u), at = (b) => (reach[(b + 71) % 72] + 2 * reach[b % 72] + reach[(b + 1) % 72]) / 4; return at(b0) * (1 - f) + at((b0 + 1) % 72) * f; };
    // The field on a flat grid about the continent's centre: how far out (in multiples of the core's reach) a place
    // lies, made costlier off its plate, against its lean, and near what it must keep clear of.
    const extent = Math.min(0.47 * Math.PI * EYM_RADIUS_KM, 3.2 * Math.sqrt(target / Math.PI)), n = Math.ceil(2 * extent / cell), x0 = -extent, y0 = extent;
    const field = new Float32Array(n * n), areaKm2 = new Float32Array(n * n), own = new Uint8Array(n * n), BLOCK = 1e6;
    for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) {
      const x = x0 + (c + 0.5) * cell, y = y0 - (r + 0.5) * cell, i = r * n + c, arc = Math.hypot(x, y) / EYM_RADIUS_KM;
      areaKm2[i] = cell * cell * (arc < 1e-9 ? 1 : Math.sin(arc) / arc);
      if (arc > 0.47 * Math.PI) { field[i] = BLOCK; continue; }
      const [lat, lon] = fromLocal(spec.center, x, y), d = Math.hypot(x - cx, y - cy), bearing = (Math.atan2(x - cx, y - cy) / DEG + 360) % 360;
      own[i] = plateAt(lat, lon) === plate ? 1 : 0;
      let s = d / reachAt(bearing) * (1 - lean * Math.cos((bearing - leanDeg) * DEG));
      s *= 1 + dials.coastNoise * noise(vec([lat, lon]), EYM_RADIUS_KM / dials.noiseKm, 3);
      const limits = [[toCaren, dials.clearanceKm.caren], [toGaryk, dials.clearanceKm.garyk], ...(toOthers ? [[toOthers, dials.clearanceKm.between]] : [])];
      for (const [near, limit] of limits) { const km = near(lat, lon, limit + dials.easeKm); if (km < limit) { s = BLOCK; break; } s *= 1 + 2.5 * smooth(1 - (km - limit) / dials.easeKm); }
      field[i] = s;
    }
    // The plate's edge costs reach smoothly, not as a step: blur the on-plate share, then apply it.
    const share = blur(Float32Array.from(own), n, 4);
    for (let i = 0; i < n * n; i += 1) if (field[i] < BLOCK) field[i] *= dials.offPlate - (dials.offPlate - 1) * share[i];
    // The level that gives the target area, counting only land joined to the core.
    const coreCell = Math.floor((y0 - cy) / cell) * n + Math.floor((cx - x0) / cell);
    const joined = (level) => { const seen = new Uint8Array(n * n), stack = [coreCell]; let area = 0; seen[coreCell] = 1; while (stack.length) { const i = stack.pop(); area += areaKm2[i]; const r = Math.floor(i / n), c = i % n; for (const q of [c > 0 ? i - 1 : -1, c < n - 1 ? i + 1 : -1, r > 0 ? i - n : -1, r < n - 1 ? i + n : -1]) if (q >= 0 && !seen[q] && field[q] <= level) { seen[q] = 1; stack.push(q); } } return { area, seen }; };
    let lo = 1, hi = 40; for (let it = 0; it < 40; it += 1) { const mid = (lo + hi) / 2; if (joined(mid).area < target) lo = mid; else hi = mid; }
    const level = hi, { area, seen } = joined(level);
    // The outline: the joined land's edge, drawn smoothly through the field.
    const values = Float32Array.from(field, (v, i) => (seen[i] ? level - Math.min(v, level) + 1e-3 : -Math.min(1, v - level) - 1e-3));
    const rings = contour(values, n, n, x0, y0, cell, 0), main = rings[0].ring.map(([x, y]) => [round1(x), round1(y)]);
    let ownKm2 = 0; const off = {}, lats = [], clear = { caren: Infinity, garyk: Infinity, between: Infinity };
    // What made each piece of the grown land (canon of 20 November 2026: every area grown has a tectonic origin).
    const origins = {}, coreNear = core.filter((_, k) => k % 4 === 0), motion = (id) => { const q = tectonics.plates[id]; return { pole: q.pole, rate: q.rateDegPerMyr }; }, credit = (key, km2, other) => { const o = origins[key] ?? (origins[key] = { areaKm2: 0, plates: new Set() }); o.areaKm2 += km2; if (other) o.plates.add(other); };
    for (let i = 0; i < n * n; i += 1) {
      if (!seen[i]) continue; const r = Math.floor(i / n), c = i % n, x = x0 + (c + 0.5) * cell, y = y0 - (r + 0.5) * cell, [lat, lon] = fromLocal(spec.center, x, y), p = plateAt(lat, lon); if (p === plate) ownKm2 += areaKm2[i]; else off[tectonics.plates[p].id] = (off[tectonics.plates[p].id] ?? 0) + areaKm2[i]; lats.push(lat);
      if (insideRing(core, x, y)) continue;
      const here = vec([lat, lon]), from = vec(fromLocal(spec.center, cx, cy)), out = here.map((v, k) => v - from[k]), outLength = Math.hypot(...out) || 1, outward = out.map((v) => v / outLength);
      if (p !== plate) {
        // Across a plate boundary: what the two plates do there says how the land came to be joined on.
        const type = classifyBoundary(motion(plate), motion(p), here, outward).type;
        credit(type === "convergent" ? "accreted" : type === "divergent" ? "rift-shoulder" : "joined-alongside", areaKm2[i], tectonics.plates[p].id);
      } else {
        let km = Infinity; for (const [qx, qy] of coreNear) { const d = Math.hypot(qx - x, qy - y); if (d < km) km = d; }
        const v = plateVelocity(motion(plate), here), leading = (v[0] * outward[0] + v[1] * outward[1] + v[2] * outward[2]) / (Math.hypot(...v) || 1) > 0.2;
        credit(km <= SHELF_REACH_KM ? "raised-shelf" : leading ? "accretionary-belt" : "raised-margin", areaKm2[i]);
      }
    }
    const coast = main.filter((_, i) => i % 3 === 0).map(([x, y]) => fromLocal(spec.center, x, y));
    for (const [lat, lon] of coast) { clear.caren = Math.min(clear.caren, toCaren(lat, lon)); clear.garyk = Math.min(clear.garyk, toGaryk(lat, lon)); if (toOthers) clear.between = Math.min(clear.between, toOthers(lat, lon)); }
    grownPts.push(...coast);
    // The plate boundaries that now lie inside the land (none of them moved): where plates meet, a suture range
    // (higher where continents already collided, lower where an ocean floor went down under an arc now welded on);
    // where they part, a rift. Chains of the tectonic history's own boundary points, in the continent's flat frame.
    const within = ([lat, lon]) => { const [x, y] = toLocal(spec.center, lat, lon), c = Math.floor((x - x0) / cell), r = Math.floor((y0 - y) / cell); return c >= 0 && r >= 0 && c < n && r < n && seen[r * n + c] && !insideRing(core, x, y) ? [round1(x), round1(y)] : null; };
    const chains = (points) => {
      const left = points.map(within).filter(Boolean), out = [];
      while (left.length) {
        const line = [left.pop()];
        for (const end of [1, 0]) for (;;) { const tip = end ? line[line.length - 1] : line[0]; let best = -1, km = 320; left.forEach((p, k) => { const d = Math.hypot(p[0] - tip[0], p[1] - tip[1]); if (d < km) { km = d; best = k; } }); if (best < 0) break; const [p] = left.splice(best, 1); if (end) line.push(p); else line.unshift(p); }
        const spaced = line.filter((p, k) => k === 0 || k === line.length - 1 || k % 3 === 0);
        if (spaced.length >= 3 && Math.hypot(line[0][0] - line[line.length - 1][0], line[0][1] - line[line.length - 1][1]) > 500) out.push(spaced);
      }
      return out.sort((a, b) => b.length - a.length);
    };
    const height = (line, base, more) => Math.round(base + more * (0.5 + 0.5 * noise(vec(fromLocal(spec.center, ...line[Math.floor(line.length / 2)])), 3, 2, 5)));
    const sutures = [
      ...chains(tectonics.boundaries.collisions).map((points) => ({ kind: "suture range", origin: "collision", heightM: height(points, 4300, 1500), widthKm: 120, points })),
      ...chains(tectonics.boundaries.trenches).map((points) => ({ kind: "suture range", origin: "accretion", heightM: height(points, 2500, 1100), widthKm: 95, points })),
    ], rifts = chains(tectonics.boundaries.ridges).map((points) => ({ kind: "rift", widthKm: 70, points }));
    continents[id] = {
      id, name: spec.name, center: spec.center, plate: fitted.plate, rings: [main], kinds: ["mainland"], coreAreaKm2: fitted.mainlandAreaKm2, areaKm2: Math.round(sphericalRingAreaKm2(main.map(([x, y]) => fromLocal(spec.center, x, y)))), gridAreaKm2: Math.round(area), targetAreaKm2: target, level: Number(level.toFixed(3)),
      onOwnPlateKm2: Math.round(ownKm2), acrossBoundariesKm2: Object.fromEntries(Object.entries(off).map(([k, v]) => [k, Math.round(v)]).filter(([, v]) => v > 5000).sort((a, b) => b[1] - a[1])),
      latitudes: [Math.round(lats.reduce((a, b) => Math.min(a, b), 90)), Math.round(lats.reduce((a, b) => Math.max(a, b), -90))],
      clearanceKm: { caren: Math.round(clear.caren), garyk: Math.round(clear.garyk), ...(toOthers ? { between: Math.round(clear.between) } : {}) },
      ridges: [...fitted.ridges, ...sutures], rifts,
      origins: Object.entries(origins).map(([origin, o]) => ({ origin, areaKm2: Math.round(o.areaKm2), ...(o.plates.size ? { plates: [...o.plates].sort() } : {}), how: ORIGINS[origin] })).sort((a, b) => b.areaKm2 - a.areaKm2),
    };
  }
  // Islands of the open ocean that the new land has taken in (accreted, means b).
  const accreted = []; (layout.archipelagos.centers ?? []).forEach((at, k) => { for (const c of Object.values(continents)) { const [x, y] = toLocal(c.center, at[0], at[1]); if (insideRing(c.rings[0], x, y)) accreted.push({ archipelago: k + 1, at, into: c.name }); } });
  const grownKm2 = Object.values(continents).reduce((s, c) => s + c.areaKm2, 0), coresKm2 = Object.values(continents).reduce((s, c) => s + c.coreAreaKm2, 0);
  const landBefore = surface.landAreaKm2 + coresKm2, oceanFraction = 1 - (surface.landAreaKm2 + grownKm2) / EYM_KM2;
  return {
    schemaVersion: 1, model: GROWTH_MODEL, sourcesSha256: null, continents, accreted,
    oceanFraction: Number(oceanFraction.toFixed(4)), oceanFractionBefore: Number((1 - landBefore / EYM_KM2).toFixed(4)),
    // The measures of the change to the tectonic world (canon, item 6): it is read, never written.
    // `contentSha256` names the history itself (everything in the file but the stamp of what it was made from).
    tectonics: { contentSha256: tectonicContentSha256(tectonics), plateBoundariesMoved: 0, platePolesChanged: 0, plateSpeedsChanged: 0, hotspotsMoved: 0, historyStagesChanged: 0 },
  };
}

function blur(values, n, radius) {
  const pass = (src, horizontal) => { const out = new Float32Array(n * n); for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) { let s = 0, k = 0; for (let d = -radius; d <= radius; d += 1) { const rr = horizontal ? r : r + d, cc = horizontal ? c + d : c; if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue; s += src[rr * n + cc]; k += 1; } out[r * n + c] = s / k; } return out; };
  return pass(pass(values, true), false);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const json = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8")), sha = growthSourcesSha256();
  let have = null; try { have = json("data/eym/growth.json"); } catch { /* not made yet */ }
  if (have?.sourcesSha256 === sha) console.log("eym growth: up to date");
  else if (process.argv.includes("--check")) { console.error("data/eym/growth.json is out of date: run node tools/generate-eym-growth.mjs"); process.exit(1); }
  else {
    const started = Date.now(), doc = buildGrowth({ tectonics: json("data/eym/tectonics.json"), traced: json("data/eym/traced-continents.json") }); doc.sourcesSha256 = sha;
    writeFileSync(OUT, `${JSON.stringify(doc)}\n`);
    console.log(`growth.json: ocean ${(doc.oceanFraction * 100).toFixed(2)}% (was ${(doc.oceanFractionBefore * 100).toFixed(2)}%); ${Object.values(doc.continents).map((c) => `${c.name} ${(c.areaKm2 / 1e6).toFixed(1)} Mkm²`).join(", ")}; ${((Date.now() - started) / 1000).toFixed(1)} s`);
  }
}
