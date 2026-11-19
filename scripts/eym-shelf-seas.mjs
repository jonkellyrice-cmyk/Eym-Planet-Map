// The shelf seas of Eym's mapped continents (the second half of the sea floor in the ocean model): the sea floor at
// fine scale on their shelves, the tide in funnel-shaped bays, and the surge a storm drives ashore.
//   - Fine sea floor: within 160 km of a coast the depth follows the true distance to the coastline (not the 1° grid's
//     averaged cells): the same shelf, slope and trench rule as everywhere (scripts/eym-seafloor.mjs), blended into
//     the 1° grid further out.
//   - Bays: where the sea is shut in by land on most sides, the tide grows toward the head as the bay narrows and
//     shoals (Green's law: by the square root of the narrowing and the fourth root of the shoaling), the Bay of
//     Fundy's pattern. Only where the coast's shape and depth support it.
//   - Storm surge: an onshore gale piles water up across the shelf (the wind's drag over the shelf's width, divided
//     by its depth), more in a funnel bay, plus a centimetre for every hectopascal the pressure has fallen.
// The survey of the coasts (tools/generate-eym-coasts.mjs) works these out once and keeps them in the coasts file
// beside the asset; the readers below take the tide's funnelling and the surge from it at any place and moment.
// Pure functions; the dials are in scripts/eym-world-inputs.mjs.

import { elevationGrid } from "./cartography-asset.mjs";
import { marginOf, seaFloorHeightM } from "./eym-seafloor.mjs";
import { boundaryPoints } from "./eym-quakes.mjs";
import { destination, distanceKm } from "./eym-sea.mjs";
import { WORLD_INPUTS } from "./eym-world-inputs.mjs";

export const SHELF_SEAS = WORLD_INPUTS.shelfSeas;
export const EYM_COASTS_MODEL = "eym-coasts-v1";
const DEG = Math.PI / 180, RHO_AIR = 1.2, RHO_SEA = 1025, G = 9.81;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------- the fine sea floor

/**
 * The sea floor's height (m, negative) at any sea point, fine near the coasts: `coastKmAt(lat, lon)` is the true
 * distance to the nearest coastline (160 where there is none within 160 km). Needs the asset's geology (the
 * plates' edges decide which coasts have narrow shelves and trenches).
 */
export function fineSeaFloor(asset, coastKmAt) {
  const grid = elevationGrid(asset), res = asset.resolutionDeg ?? 1, rows = Math.round(180 / res), cols = Math.round(360 / res), edges = boundaryPoints(asset.geology) ?? { trenches: [], collisions: [] }, near = new Map();
  const at = (r, c) => Math.min(-20, grid[clamp(r, 0, rows - 1) * cols + ((c % cols) + cols) % cols]);
  const coarse = (lat, lon) => { const y = (lat + 90) / res - 0.5, x = (lon + 180) / res - 0.5, r = Math.floor(y), c = Math.floor(x), ty = y - r, tx = x - c; return (at(r, c) * (1 - tx) + at(r, c + 1) * tx) * (1 - ty) + (at(r + 1, c) * (1 - tx) + at(r + 1, c + 1) * tx) * ty; };
  // Distance to the nearest trench and collision, kept per half-degree (they change slowly).
  const edgeKm = (lat, lon) => {
    const key = `${Math.round(lat * 2)},${Math.round(lon * 2)}`; let hit = near.get(key);
    if (!hit) { const d = (list) => { let best = 5000; for (const p of list) { if (Math.abs(p[0] - lat) > 8) continue; const km = distanceKm(lat, lon, p[0], p[1]); if (km < best) best = km; } return best; }; hit = { trench: d(edges.trenches), collide: d(edges.collisions) }; near.set(key, hit); }
    return hit;
  };
  return (lat, lon) => {
    const d = coastKmAt(lat, lon), far = coarse(lat, lon); if (d >= 160) return far;
    const e = edgeKm(lat, lon), fine = clamp(seaFloorHeightM(d, 5000, e.trench, marginOf(e.trench, e.collide)), -9500, -5), w = clamp((160 - d) / 40, 0, 1);
    return fine * w + far * (1 - w);
  };
}

// ---------------------------------------------------------------- bays

/**
 * The bay a sea point lies in, if any: { bay, enclosed, mouthBearingDeg, lengthKm, widthKm, mouthWidthKm, gain }.
 * `landAt(lat, lon)` is the true land test; `floorAt(lat, lon)` the sea floor's height (m, negative). A point is
 * in a bay when land lies within `bayReachKm` in at least `bayEnclosedShare` of directions (an open coast has land
 * in about half). Its length runs out along the clear directions to where the sea opens; the funnel's gain is
 * Green's law between a station just inside the mouth and one a little way in from the head (so neither the open
 * sea nor the beach itself is measured).
 */
export function bayFunnel(landAt, floorAt, lat, lon, dials = SHELF_SEAS) {
  const reach = dials.bayReachKm, toLand = (a, b, bearing, max = reach, step = 5) => { for (let km = step; km <= max; km += step) { const [y, x] = destination(a, b, bearing, km); if (landAt(y, x)) return km; } return Infinity; };
  const clear = (a, b, n = 32) => { const out = []; for (let k = 0; k < n; k += 1) if (toLand(a, b, k * 360 / n) === Infinity) out.push(k * 360 / n); return out; };
  const open = clear(lat, lon), enclosed = 1 - open.length / 32, none = { bay: false, enclosed, mouthBearingDeg: null, lengthKm: 0, widthKm: null, mouthWidthKm: null, gain: 1 };
  if (!open.length || enclosed < dials.bayEnclosedShare) return none;
  // The mouth lies where the clear directions point (their circular mean).
  const sx = open.reduce((t, x) => t + Math.sin(x * DEG), 0), cx = open.reduce((t, x) => t + Math.cos(x * DEG), 0); if (Math.hypot(sx, cx) < 1e-6) return none;
  const mouth = ((Math.atan2(sx, cx) / DEG) + 360) % 360, width = (a, b) => Math.min(reach, toLand(a, b, mouth + 90)) + Math.min(reach, toLand(a, b, mouth - 90));
  // Out along that line to where the sea opens: land in no more than 55% of directions, as on an open coast.
  let lengthKm = 0, at = [lat, lon];
  for (let km = 10; km <= 4 * reach; km += 10) { const q = destination(lat, lon, mouth, km); if (landAt(q[0], q[1])) break; lengthKm = km; at = q; if (1 - clear(q[0], q[1], 16).length / 16 <= 0.55) break; }
  const bay = { bay: true, enclosed, mouthBearingDeg: mouth, lengthKm, widthKm: null, mouthWidthKm: null, gain: 1 };
  if (lengthKm < dials.bayMinLengthKm) return bay;
  // Two stations between the shores: a little way in from the head, and just inside the mouth (beyond it the sea
  // is open and has no width to speak of).
  const inner = destination(lat, lon, mouth, Math.max(10, 0.15 * lengthKm)), outer = destination(lat, lon, mouth, 0.85 * lengthKm), widthKm = width(inner[0], inner[1]), mouthWidthKm = width(outer[0], outer[1]);
  if (!(mouthWidthKm > widthKm)) return { ...bay, widthKm, mouthWidthKm };
  const here = Math.max(5, -floorAt(inner[0], inner[1])), out = Math.max(5, -floorAt(outer[0], outer[1]));
  const gain = clamp(Math.sqrt(mouthWidthKm / Math.max(5, widthKm)) * clamp(out / here, 1, 16) ** 0.25, 1, dials.funnelMaxGain);
  return { ...bay, widthKm, mouthWidthKm, gain };
}

/**
 * The shelf off a coast: out from a sea point along a bearing until the floor drops below 200 m (or land, or
 * 400 km): { shelfKm, depthM (the mean depth of the water crossed, m, positive) }.
 */
export function shelfOff(landAt, floorAt, lat, lon, bearingDeg) {
  let km = 0, sum = 0, n = 0;
  for (let step = 5; step <= 400; step += 5) { const [a, b] = destination(lat, lon, bearingDeg, step); if (landAt(a, b)) break; const h = floorAt(a, b); if (h < -200) break; km = step; sum += -h; n += 1; }
  return { shelfKm: km, depthM: n ? sum / n : Math.max(5, -floorAt(lat, lon)) };
}

// ---------------------------------------------------------------- reading the survey

const decoded = new WeakMap();
/** The coasts document's samples as objects (decoded once). */
export function coastSamples(doc) {
  if (!doc) return [];
  let hit = decoded.get(doc);
  if (!hit) { hit = doc.samples.map((row) => Object.fromEntries(doc.fields.map((f, i) => [f, row[i]]))); decoded.set(doc, hit); }
  return hit;
}

/** The surveyed coast nearest a place, within `maxKm` (null where there is none, or no survey is attached). */
export function nearestCoast(asset, lat, lon, maxKm = 60) {
  let best = null;
  for (const s of coastSamples(asset?.coasts)) { if (Math.abs(s.lat - lat) > 1.5) continue; const d = distanceKm(lat, lon, s.lat, s.lon); if (d <= maxKm && (!best || d < best.km)) best = { ...s, km: d }; }
  return best;
}

/** A coast's tide response (scripts/eym-tides.mjs coastalResponse) with its bay's funnelling: a larger, slightly later tide. */
export function funnelledResponse(response, coast) {
  if (!response || !coast || !(coast.funnelGain > 1)) return response;
  return { ...response, gain: response.gain * coast.funnelGain, lagHours: response.lagHours + coast.bayLengthKm / 60, funnelGain: coast.funnelGain };
}

/**
 * The storm surge on a surveyed coast (m above the tide) for the weather there ({ windMs, windFromDeg, pressureHpa }):
 * the onshore wind's setup across the shelf, raised by a funnel bay, plus the low pressure's lift. 0 with an
 * offshore wind and normal pressure.
 */
export function stormSurgeM(coast, weather, dials = SHELF_SEAS) {
  if (!coast || !weather) return 0;
  // The wind blows toward the land when it comes from the seaward side.
  const onshore = Math.max(0, Math.cos((weather.windFromDeg - coast.seawardDeg) * DEG)), u = weather.windMs ?? 0;
  const setup = dials.surgeDragCoefficient * RHO_AIR * (u * onshore) ** 2 / (RHO_SEA * G * Math.max(5, coast.shelfDepthM)) * coast.shelfKm * 1000;
  const lift = Math.max(0, 1013 - (weather.pressureHpa ?? 1013)) * 0.01;
  return clamp(setup * (coast.funnelGain ?? 1) + lift, 0, dials.surgeMaxM);
}

/** A surge in words (empty below the dial's threshold). */
export const describeSurge = (surgeM, dials = SHELF_SEAS) => (surgeM >= dials.surgeMinM ? `storm surge +${surgeM.toFixed(1)} m${surgeM >= 2 ? " (low ground by the shore floods)" : ""}` : "");

/** What a coast can suffer: the surge (m) a given onshore wind (m/s) and pressure fall (hPa) would raise there, for hazard tables. */
export const surgePotentialM = (coast, windMs = 45, deficitHpa = 50) => stormSurgeM(coast, { windMs, windFromDeg: coast.seawardDeg, pressureHpa: 1013 - deficitHpa });
