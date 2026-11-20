// The sea on Eym (Stage 2b of the physical history and climate programme): waves and swell at any place and
// moment, and how long a ship takes between two ports. Everything follows from the deterministic weather
// (scripts/eym-weather.mjs), the currents (scripts/eym-climate.mjs) and the coastlines; nothing is random.
//   - Wind sea: the waves the local wind raises, limited by how far it has blown over open water (the fetch,
//     to the nearest coast upwind) and for how long (standard wave-growth curves: fully developed
//     Pierson–Moskowitz, fetch- and duration-limited JONSWAP).
//   - Swell: waves that outrun the storms that made them. Every low and tropical cyclone of the last days is a
//     source; its waves travel at their group speed, spread and weaken with distance, and are stopped by land
//     between. On a world 98.6% ocean the fetch is enormous, so the westerly belts send long swell far.
//   - Voyages: an all-water route between two places (shortest path over the 1° sea cells, then straightened),
//     sailed in 3-hour steps through the weather the ship meets: currents help or hinder, head seas slow a
//     steamer, and a sailing ship goes with the wind (tacking when it must).

import { systemAt, systemsBetween, tropicalMaxWindMs, weatherAt } from "./eym-weather.mjs";
import { landAtmosphere } from "./eym-land-atmosphere.mjs";
import { currentAt } from "./eym-climate.mjs";
import { approximateDeclinationDeg } from "./eym-seasons.mjs";
import { DAY_MS } from "./universal-time.mjs";

const G = 9.81, DEG = Math.PI / 180, R_KM = 6371, HOUR_MS = DAY_MS / 24, KNOT = 0.514444;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** How far back the swell looks (hours): a long swell crosses some 3,000 km in four days. */
export const SWELL_WINDOW_HOURS = 120;
const SOURCE_STEP_HOURS = 6;

// ---------------------------------------------------------------- geometry

const unit = (lat, lon) => { const p = lat * DEG, l = lon * DEG; return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)]; };
const angularKm = (a, b) => Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1)) * R_KM;
/** Great-circle distance (km). */
export const distanceKm = (lat1, lon1, lat2, lon2) => angularKm(unit(lat1, lon1), unit(lat2, lon2));
/** Initial bearing from one place to another (degrees from north, clockwise). */
export function bearingDeg(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * DEG, p2 = lat2 * DEG, dl = (lon2 - lon1) * DEG;
  return (Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / DEG + 360) % 360;
}
/** The place reached from a start along a bearing for a distance. */
export function destination(lat, lon, bearing, km) {
  const d = km / R_KM, p1 = lat * DEG, t = bearing * DEG;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
  const l2 = lon * DEG + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
  return [p2 / DEG, ((l2 / DEG + 540) % 360) - 180];
}

// ---------------------------------------------------------------- waves from wind

/**
 * The waves a steady wind raises (significant height in metres, peak period in seconds): the least of the fully
 * developed sea, the fetch-limited sea and the duration-limited sea.
 */
export function windSea(windMs, fetchKm, durationH = 12) {
  const u = Math.max(0.5, windMs), F = Math.max(1, fetchKm) * 1000;
  // A wind blowing for a time raises the sea of an equivalent fetch (gt/U = 68.8 (gF/U²)^(2/3)).
  const fromDuration = (G * durationH * 3600 / u / 68.8) ** 1.5 * u * u / G;
  const fetch = Math.min(F, fromDuration), x = G * fetch / (u * u);
  // Storm seas saturate (breaking, a storm's turning winds): a soft ceiling near 16 m keeps the worst hurricane
  // seas at the 12–14 m that are measured, and leaves ordinary seas as the curves give them.
  const hs = 16 * Math.tanh(Math.min(0.0246 * u * u, 0.0016 * u * u / G * Math.sqrt(x)) / 16);
  const periodS = Math.min(0.73 * u, 0.286 * u / G * Math.cbrt(x));
  return { hsM: hs, periodS: Math.max(1, periodS) };
}

/** Open water upwind of a place (km, up to maxKm): the fetch of a wind blowing from `fromDeg`. */
export function upwindFetchKm(field, lat, lon, fromDeg, maxKm = 2500, stepKm = 50) {
  for (let km = stepKm; km <= maxKm; km += stepKm) {
    const [a, b] = destination(lat, lon, fromDeg, km);
    if (!field.cellAt(a, b).ocean) return km - stepKm / 2;
  }
  return maxKm;
}

/** Whether open sea joins two places along the great circle (land in between, away from the ends, blocks it). */
function seaPathOpen(field, from, to, totalKm, guardStartKm, guardEndKm) {
  const steps = Math.floor(totalKm / 100), bearing = bearingDeg(from[0], from[1], to[0], to[1]);
  for (let k = 1; k < steps; k += 1) {
    const km = k * 100; if (km < guardStartKm || km > totalKm - guardEndKm) continue;
    const [a, b] = destination(from[0], from[1], bearing, km);
    if (!field.cellAt(a, b).ocean) return false;
  }
  return true;
}

// ---------------------------------------------------------------- swell from storms

/** The storm's wind over its wave-making area (m/s), from its pressure anomaly. */
function stormWindMs(system) {
  if (system.kind === "tropical") return 0.55 * tropicalMaxWindMs(-Math.min(0, system.amp));
  return system.kind === "low" ? 6 + 0.55 * -Math.min(0, system.amp) : 0;
}

/**
 * One wave source. A mid-latitude low sends most of its swell east and toward the equator (the side where its
 * winds and the westerlies blow together, and the way it moves, so its waves stay longest under the wind); a
 * tropical cyclone sends it every way. `heading` is that main direction (degrees), or null.
 */
function sourceFor(id, hour, at, sea) {
  const low = at.kind === "low";
  return { id, hour, lat: at.lat, lon: at.lon, unit: at.unit, radiusKm: low ? at.radiusKm : 300, hsM: sea.hsM, periodS: Math.max(9, sea.periodS), heading: low ? (at.hemisphere > 0 ? 115 : 65) : null };
}

/**
 * Wave sources: every low and tropical cyclone alive over a span of hours, every six hours, with the sea it
 * raises. `systems` are raw systems (scripts/eym-weather.mjs systemsBetween).
 */
export function swellSources(systems, fromHour, toHour, landFractionAt = () => 0) {
  const out = [];
  for (const s of systems) {
    if (s.kind !== "low" && s.kind !== "tropical") continue;
    const start = Math.max(fromHour, Math.ceil(s.born / SOURCE_STEP_HOURS) * SOURCE_STEP_HOURS), end = Math.min(toHour, s.born + s.life);
    for (let hour = start; hour <= end; hour += SOURCE_STEP_HOURS) {
      const at = systemAt(s, hour, landFractionAt); if (!at) continue;
      const u = stormWindMs(at); if (u < 12) continue;
      const sea = windSea(u, s.kind === "tropical" ? 350 : at.radiusKm * 1.3, s.kind === "tropical" ? 18 : 24);
      if (sea.hsM < 2.5) continue;
      out.push(sourceFor(s.id, hour, at, sea));
    }
  }
  return out.sort((a, b) => a.hour - b.hour);
}

/**
 * Swell at a place and hour from wave sources (see swellSources): each storm's strongest arrival, combined.
 * Returns the swell trains [{ hsM, periodS, fromDeg, sourceKm, id }] largest first.
 */
export function swellAt(field, sources, lat, lon, hour) {
  const here = unit(lat, lon), best = new Map();
  for (const s of sources) {
    if (s.hour > hour || s.hour < hour - SWELL_WINDOW_HOURS) continue;
    const d = angularKm(here, s.unit); if (d < s.radiusKm * 0.8) continue; // inside the storm: that is wind sea
    const period = s.periodS * (1 + 0.1 * Math.min(1, d / 4000)), cgKmh = G * period / (4 * Math.PI) * 3.6;
    const travel = d / cgKmh, late = hour - s.hour - travel, spread = 4 + 0.15 * travel;
    const timing = Math.exp(-((late / spread) ** 2)); if (timing < 0.05) continue;
    const aim = s.heading === null ? 1 : 0.4 + 0.3 * (1 + Math.cos((bearingDeg(s.lat, s.lon, lat, lon) - s.heading) * DEG));
    const hs = s.hsM * (s.radiusKm / (s.radiusKm + d)) ** 0.35 * Math.exp(-d / 9000) * Math.sqrt(timing) * aim;
    if (hs < 0.3 || (best.get(s.id)?.hsM ?? 0) >= hs) continue;
    if (!seaPathOpen(field, [s.lat, s.lon], [lat, lon], d, s.radiusKm * 0.6, 60)) continue;
    best.set(s.id, { id: s.id, hsM: hs, periodS: period, fromDeg: bearingDeg(lat, lon, s.lat, s.lon), sourceKm: d });
  }
  return [...best.values()].sort((a, b) => b.hsM - a.hsM);
}

// ---------------------------------------------------------------- the sea at a place

/** The nearest open-sea point to a place (itself at sea; else the nearest sea cell within ~150 km), or null. */
export function nearestSea(field, lat, lon) {
  if (field.cellAt(lat, lon).ocean) return [lat, lon];
  let best = null;
  for (let dr = -1.5; dr <= 1.5; dr += 0.5) for (let dc = -1.5; dc <= 1.5; dc += 0.5) {
    const a = lat + dr, b = lon + dc / Math.max(0.3, Math.cos(lat * DEG));
    if (!field.cellAt(a, b).ocean) continue;
    const d = distanceKm(lat, lon, a, b); if (d <= 160 && (!best || d < best.d)) best = { d, at: [a, b] };
  }
  return best?.at ?? null;
}

/**
 * The sea state at a sea point and hour: wind sea from the wind there (`weather` from weatherAt) and the swell.
 * Heights combine as energy (the square root of the sum of squares).
 */
export function seaState(field, sources, lat, lon, hour, weather) {
  const fetchKm = upwindFetchKm(field, lat, lon, weather.windFromDeg);
  const wind = windSea(weather.windMs, fetchKm, 24), swell = swellAt(field, sources, lat, lon, hour);
  const hsM = Math.sqrt(wind.hsM ** 2 + swell.reduce((sum, s) => sum + s.hsM ** 2, 0));
  return { hsM, wind: { ...wind, fromDeg: weather.windFromDeg, fetchKm }, swell };
}

const DOUGLAS = [[0.1, "calm"], [0.5, "smooth"], [1.25, "slight"], [2.5, "moderate"], [4, "rough"], [6, "very rough"], [9, "high"], [14, "very high"], [Infinity, "phenomenal"]];
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const compass = (deg) => COMPASS[Math.round(deg / 22.5) % 16];
/** The sea in words (Douglas sea scale): "moderate (1.8 m); swell 2.4 m from the SW every 13 s". */
export function describeSea(state) {
  const word = DOUGLAS.find(([limit]) => state.hsM < limit)[1], s = state.swell[0];
  const swell = s && s.hsM >= 0.5 ? `; ${s.hsM >= 4 ? "heavy" : s.hsM >= 2 ? "moderate" : "low"} swell ${s.hsM.toFixed(1)} m from the ${compass(s.fromDeg)} every ${Math.round(s.periodS)} s` : "; no swell to speak of";
  return `${word} (${state.hsM.toFixed(1)} m)${swell}`;
}

/** Swimming in it (Pathfinder 2e Athletics to Swim): calm, rough or stormy water, and the surf on a shore. */
export function swimConditions(hsM) {
  const kind = hsM < 1 ? "calm" : hsM < 3 ? "rough" : "stormy";
  return { kind, dc: kind === "calm" ? 10 : kind === "rough" ? 15 : 20, surfM: Math.round(Math.min(hsM, 9) * 0.9 * 10) / 10 };
}

/**
 * The sea at a place now, from a weather state (scripts/eym-weather.mjs buildWeatherState): null inland. Uses
 * the systems the state already placed every 3 hours over the last week.
 */
export function placeSea(state, lat, lon, weatherNow) {
  const field = state.field; if (!field) return null;
  const at = nearestSea(field, lat, lon); if (!at) return null;
  if (!state.swellSources) {
    // Sources from the systems the state has placed (each step's systems, every other step: six hours).
    const sources = [];
    for (let i = 0; i < state.steps.length; i += 2) {
      const step = state.steps[i]; if (step.hour > state.nowHour) break;
      for (const s of step.systems) {
        if (s.kind !== "low" && s.kind !== "tropical") continue;
        const u = stormWindMs(s); if (u < 12) continue;
        const sea = windSea(u, s.kind === "tropical" ? 350 : s.radiusKm * 1.3, s.kind === "tropical" ? 18 : 24);
        if (sea.hsM >= 2.5) sources.push(sourceFor(s.id, step.hour, s, sea));
      }
    }
    state.swellSources = sources;
  }
  const hour = (weatherNow?.timeMs ?? state.timeMs) / HOUR_MS;
  const sea = seaState(field, state.swellSources, at[0], at[1], Math.min(hour, state.nowHour), weatherNow);
  return { ...sea, at, words: describeSea(sea), swim: swimConditions(sea.hsM) };
}

// ---------------------------------------------------------------- routes over water

/** The sea cell nearest a place (as [row, col] on the field's grid), searching outward. */
function seaCell(field, lat, lon) {
  const { latCount, lonCount } = field.grid, res = field.resolutionDeg;
  const r0 = clamp(Math.floor((lat + 90) / res), 0, latCount - 1), c0 = ((Math.floor((lon + 180) / res) % lonCount) + lonCount) % lonCount;
  for (let ring = 0; ring < 12; ring += 1) {
    let best = null;
    for (let dr = -ring; dr <= ring; dr += 1) for (let dc = -ring; dc <= ring; dc += 1) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
      const r = r0 + dr; if (r < 0 || r >= latCount) continue;
      const c = ((c0 + dc) % lonCount + lonCount) % lonCount, cell = field.cells[r * lonCount + c];
      if (!cell.ocean) continue;
      const d = distanceKm(lat, lon, cell.lat, cell.lon); if (!best || d < best.d) best = { d, r, c };
    }
    if (best) return [best.r, best.c];
  }
  return null;
}

/** Whether a straight (great-circle) leg stays over sea, sampled every 25 km. */
function legAtSea(field, a, b) {
  const d = distanceKm(a[0], a[1], b[0], b[1]), bearing = bearingDeg(a[0], a[1], b[0], b[1]);
  for (let km = 25; km < d; km += 25) { const [x, y] = destination(a[0], a[1], bearing, km); if (!field.cellAt(x, y).ocean) return false; }
  return true;
}

/**
 * An all-water route between two places: the shortest path over the sea cells (8 neighbours), then pulled
 * straight wherever a great-circle leg stays at sea. Returns the waypoints [[lat, lon], …] from start to end,
 * or null if no sea joins them.
 */
export function seaRoute(field, from, to) {
  const { latCount, lonCount } = field.grid, n = latCount * lonCount;
  const a = seaCell(field, ...from), b = seaCell(field, ...to); if (!a || !b) return null;
  const start = a[0] * lonCount + a[1], goal = b[0] * lonCount + b[1], cell = (i) => field.cells[i];
  const cost = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  const heap = [], push = (i, f) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  const h = (i) => distanceKm(cell(i).lat, cell(i).lon, cell(goal).lat, cell(goal).lon);
  cost[start] = 0; push(start, h(start));
  while (heap.length) {
    const [, i] = pop(); if (done[i]) continue; done[i] = 1; if (i === goal) break;
    const r = Math.floor(i / lonCount), c = i % lonCount;
    for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) {
      if (!dr && !dc) continue; const rr = r + dr; if (rr < 0 || rr >= latCount) continue;
      const j = rr * lonCount + ((c + dc + lonCount) % lonCount); if (done[j] || !cell(j).ocean) continue;
      const step = distanceKm(cell(i).lat, cell(i).lon, cell(j).lat, cell(j).lon), next = cost[i] + step;
      if (next < cost[j]) { cost[j] = next; prev[j] = i; push(j, next + h(j)); }
    }
  }
  if (!done[goal]) return null;
  const cells = []; for (let i = goal; i !== -1; i = prev[i]) cells.push([cell(i).lat, cell(i).lon]); cells.reverse();
  // From the place to its sea cell, along the cells, to the end; then straighten.
  const path = [from, ...cells, to], out = [path[0]];
  for (let i = 0; i < path.length - 1;) {
    let j = path.length - 1; while (j > i + 1 && !legAtSea(field, path[i], path[j])) j -= 1;
    out.push(path[j]); i = j;
  }
  return out;
}

/** The length of a route (km). */
export const routeKm = (route) => route.slice(1).reduce((sum, p, i) => sum + distanceKm(route[i][0], route[i][1], p[0], p[1]), 0);

// ---------------------------------------------------------------- ships and voyages

/**
 * The ships: a coal steamer (9 knots in still water, slowed by head seas and heavy weather) and a sailing ship
 * (a full-rigged merchantman: its speed comes from the wind's strength and angle; it tacks to windward).
 */
export const SHIPS = Object.freeze({
  steamer: { name: "steamer", knots: 9 },
  sail: { name: "sailing ship", maxKnots: 13 },
});

/** A sailing ship's speed for the angle between its heading and where the wind comes from (0 = head to wind). */
function sailPolar(angleDeg) {
  const a = Math.abs(angleDeg);
  if (a < 40) return 0;
  const table = [[40, 0.45], [60, 0.8], [90, 1], [120, 1], [150, 0.85], [180, 0.7]];
  for (let k = 1; k < table.length; k += 1) if (a <= table[k][0]) { const [a0, v0] = table[k - 1], [a1, v1] = table[k]; return v0 + (v1 - v0) * (a - a0) / (a1 - a0); }
  return 0.7;
}

/** Speed through the water along a heading (knots), for a ship, wind and sea. */
export function shipSpeedKnots(ship, headingDeg, weather, sea) {
  // How squarely the waves meet the bow (1 = head seas, 0 = following).
  const waveFrom = sea.swell[0] && sea.swell[0].hsM > sea.wind.hsM ? sea.swell[0].fromDeg : sea.wind.fromDeg;
  const head = (1 + Math.cos((waveFrom - headingDeg) * DEG)) / 2;
  if (ship === "steamer") {
    const loss = Math.min(0.7, 0.025 * sea.hsM ** 2 * (0.15 + 0.85 * head));
    return SHIPS.steamer.knots * (1 - loss);
  }
  // Sail: the best course within 80° of the track (tacking: equal boards either side), made good along it.
  const windKnots = weather.windMs / KNOT;
  if (weather.windMs < 2) return 0.5;
  let best = 0;
  for (let off = -80; off <= 80; off += 5) {
    const boat = headingDeg + off, angle = ((weather.windFromDeg - boat + 540) % 360) - 180;
    const speed = Math.min(SHIPS.sail.maxKnots, 0.55 * windKnots * sailPolar(angle)) * (1 - Math.min(0.5, 0.012 * sea.hsM ** 2 * (0.15 + 0.85 * head)));
    best = Math.max(best, speed * Math.cos(off * DEG));
  }
  return Math.max(0.5, best);
}

/**
 * A voyage between two places leaving at a moment: the route, and the ship stepped along it every 3 hours
 * through the weather, waves and currents it meets. `asset` gives the currents (when its ocean file is attached).
 * Returns { days, km, ship, route, meanKnots, worstSea: { hsM, day }, currentKnots (mean help along the track), log }.
 */
export function voyage({ asset, field, from, to, departMs, ship = "steamer", route = null }) {
  const path = route ?? seaRoute(field, from, to); if (!path) return null;
  const legs = path.slice(1).map((p, i) => ({ a: path[i], b: p, km: distanceKm(path[i][0], path[i][1], p[0], p[1]) }));
  const totalKm = legs.reduce((s, l) => s + l.km, 0), startHour = departMs / HOUR_MS, maxHours = 24 * 120;
  const isOcean = (a, b) => field.cellAt(a, b).ocean, landFraction = (a, b) => (field.cellAt(a, b).ocean ? 0 : 1);
  const land = landAtmosphere(field), systems = systemsBetween(startHour - SWELL_WINDOW_HOURS, startHour + maxHours, isOcean, field.sstC, land);
  const sources = swellSources(systems, startHour - SWELL_WINDOW_HOURS, startHour + maxHours, landFraction);
  let leg = 0, along = 0, hour = startHour, sailed = 0, help = 0, steps = 0, worst = { hsM: 0, day: 0 };
  const log = [], stepH = 3;
  while (sailed < totalKm && hour - startHour < maxHours) {
    const L = legs[leg], heading = bearingDeg(L.a[0], L.a[1], L.b[0], L.b[1]);
    const [lat, lon] = destination(L.a[0], L.a[1], heading, along), localHeading = bearingDeg(lat, lon, L.b[0], L.b[1]);
    const alive = []; for (const s of systems) { if (s.born > hour || s.born + s.life < hour) continue; const at = systemAt(s, hour, landFraction); if (at) alive.push(at); }
    const w = weatherAt(alive, lat, lon, { cell: field.cellAt(lat, lon), declinationDeg: approximateDeclinationDeg(hour * HOUR_MS), solarHour: 12, timeMs: hour * HOUR_MS, land });
    const sea = seaState(field, sources, lat, lon, hour, w);
    const c = currentAt(asset, lat, lon, hour * HOUR_MS), currentAlong = c ? (c.east * Math.sin(localHeading * DEG) + c.north * Math.cos(localHeading * DEG)) / KNOT : 0;
    const knots = Math.max(0.3, shipSpeedKnots(ship, localHeading, w, sea) + currentAlong);
    if (sea.hsM > worst.hsM) worst = { hsM: sea.hsM, day: (hour - startHour) / 24 };
    if (steps % 8 === 0) log.push({ day: Math.round((hour - startHour) / 24 * 10) / 10, lat: Math.round(lat * 10) / 10, lon: Math.round(lon * 10) / 10, knots: Math.round(knots * 10) / 10, seaM: Math.round(sea.hsM * 10) / 10, windMs: Math.round(w.windMs) });
    let km = knots * KNOT * 3.6 * stepH, used = stepH;
    if (sailed + km > totalKm) { used = stepH * (totalKm - sailed) / km; km = totalKm - sailed; }
    sailed += km; along += km; hour += used; help += currentAlong; steps += 1;
    while (leg < legs.length - 1 && along >= legs[leg].km) { along -= legs[leg].km; leg += 1; }
  }
  const days = (hour - startHour) / 24;
  return { ship, days, km: totalKm, route: path, meanKnots: totalKm / 1.852 / (days * 24), currentKnots: help / Math.max(1, steps), worstSea: worst, log, arrived: sailed >= totalKm - 1 };
}

/** A voyage in words: "19.6 days (8,412 km at 9.6 knots); currents +0.5 kn; worst sea 4.1 m on day 6". */
export function describeVoyage(v) {
  if (!v) return "no sea route";
  const fmt = (x) => Math.round(x).toLocaleString("en-GB");
  return `${v.days.toFixed(1)} days by ${SHIPS[v.ship].name} (${fmt(v.km)} km at ${v.meanKnots.toFixed(1)} knots); currents ${v.currentKnots >= 0 ? "+" : "−"}${Math.abs(v.currentKnots).toFixed(1)} kn; roughest sea ${v.worstSea.hsM.toFixed(1)} m on day ${Math.max(1, Math.ceil(v.worstSea.day))}`;
}

/**
 * The quickest voyage for a ship. A steamer goes the short way. A sailing ship also tries the long ways round,
 * through two waypoints 30° or 38° from the equator on either side, a fifth and four fifths of the way along (as
 * sailing ships ran east in the westerlies rather than beat into the trades), and takes the fastest. The result
 * has `via` (null, or the waypoints).
 */
export function bestVoyage({ asset, field, from, to, departMs, ship = "steamer" }) {
  const direct = voyage({ asset, field, from, to, departMs, ship }); if (!direct) return null;
  let best = { ...direct, via: null };
  if (ship !== "sail") return best;
  // The long ways round: up into the westerlies (or the trades) early, along them, and down near the end.
  const span = ((to[1] - from[1] + 540) % 360) - 180;
  for (const lat of [-38, -30, 30, 38]) {
    const via = [[lat, from[1] + 0.2 * span], [lat, from[1] + 0.8 * span]].map(([a, b]) => [a, ((b + 540) % 360) - 180]);
    if (!via.every((p) => field.cellAt(...p).ocean)) continue;
    const parts = [from, ...via, to].slice(1).map((p, i, arr) => seaRoute(field, i ? arr[i - 1] : from, p));
    if (parts.some((p) => !p)) continue;
    const v = voyage({ asset, field, from, to, departMs, ship, route: parts.reduce((all, p) => [...all, ...p.slice(1)], [from]) });
    if (v?.arrived && v.days < best.days) best = { ...v, via };
  }
  return best;
}

/** The two ports the Caren–Garyk steamer runs between (the layout's crossing: Folo, and Garyk's south-east port). */
export const CROSSING_PORTS = Object.freeze({ caren: { id: "caren-settlement-8", name: "Folo (Caren)" }, garyk: { id: "garyk-settlement-48", name: "Garyk's south-east port" } });

/**
 * The passage from a coastal place or a place at sea to the far side of the Caren–Garyk crossing (to Garyk's
 * south-east port from anywhere nearer Folo, else to Folo), leaving at a moment: a steamer and a sailing ship,
 * each the short way. Null inland or when the ports are unknown.
 */
export function crossingPassage({ asset, field, lat, lon, departMs }) {
  if (!nearestSea(field, lat, lon)) return null;
  const port = (p) => asset.settlements?.find((s) => s.id === p.id);
  const folo = port(CROSSING_PORTS.caren), garyk = port(CROSSING_PORTS.garyk); if (!folo || !garyk) return null;
  const toGaryk = distanceKm(lat, lon, folo.lat, folo.lon) <= distanceKm(lat, lon, garyk.lat, garyk.lon);
  const dest = toGaryk ? garyk : folo, route = seaRoute(field, [lat, lon], [dest.lat, dest.lon]); if (!route) return null;
  const steamer = voyage({ asset, field, from: [lat, lon], to: [dest.lat, dest.lon], departMs, ship: "steamer", route });
  const sail = voyage({ asset, field, from: [lat, lon], to: [dest.lat, dest.lon], departMs, ship: "sail", route });
  return { to: toGaryk ? CROSSING_PORTS.garyk.name : CROSSING_PORTS.caren.name, steamer, sail, words: `to ${toGaryk ? CROSSING_PORTS.garyk.name : CROSSING_PORTS.caren.name}: ${steamer.days.toFixed(1)} days by steamer, ${sail.days.toFixed(1)} by sailing ship (${Math.round(steamer.km).toLocaleString("en-GB")} km)` };
}
