// Weather on Eym: deterministic, physically plausible and coherent in time, with no background
// simulation (ROADMAP.md, "Weather design"). Weather systems (mid-latitude lows and highs, tropical
// waves, tropical cyclones) are born from a fixed seed in fixed six-hour slots and move along analytic
// tracks, so their state at any moment — tomorrow or a century on — is computed directly. Pressure,
// wind, cloud, rain or snow and temperature at any place and time follow from them and from the
// seasonal climate (scripts/eym-seasons.mjs). What builds up — snow cover, ground wetness and flooding
// — is reconstructed over the preceding 168 hours in 3-hour steps. Identical inputs give identical
// weather.
//
// The large-scale circulation (the weather addendum, 19 November 2026): the wind and pressure belts follow the Sun
// through the year as the rain belt does; a jet stream in each hemisphere meanders in a few slow waves, and the
// mid-latitude storms travel along it; now and then a meander stalls for one to three weeks (a block), holding a
// high in place with persistent weather under and beside it. All of it is a direct function of the clock.

import { annualMeanTemperatureC, approximateDeclinationDeg, rainBeltLat, seasonalTemperature, yearFraction, RAIN_BAND_MEAN, zonalPrecipitationMm } from "./eym-seasons.mjs";
import { BELT_SWING_MEAN } from "./eym-rain-band.generated.mjs";
import { WORLD_INPUTS } from "./eym-world-inputs.mjs";
import { landAtmosphere } from "./eym-land-atmosphere.mjs";
import { DAY_MS, DAYS_PER_YEAR } from "./universal-time.mjs";
import { volcanicCoolingC } from "./eym-quakes.mjs";

export const WEATHER_SEED = "eym-weather|v1";
export const STEP_HOURS = 3;
export const WINDOW_HOURS = 168;
export const FORECAST_HOURS = 24;
const SLOT_HOURS = 6;
const HOUR_MS = DAY_MS / 24;
const YEAR_HOURS = DAYS_PER_YEAR * 24;
const R_KM = 6371;
const DEG = Math.PI / 180;
const OMEGA = 7.292e-5;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// ---------------------------------------------------------------- deterministic randomness

function hash32(text) { let h = 2166136261; for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0; }
function rng(seedText) {
  let state = hash32(seedText) || 0x9e3779b9;
  return () => { state += 0x6d2b79f5; let v = state; v = Math.imul(v ^ (v >>> 15), v | 1); v ^= v + Math.imul(v ^ (v >>> 7), v | 61); return ((v ^ (v >>> 14)) >>> 0) / 4294967296; };
}
const lattice = (i, j, k) => { let h = Math.imul(i, 374761393) ^ Math.imul(j, 668265263) ^ Math.imul(k, 2147483647) ^ 0x5bd1e995; h = Math.imul(h ^ (h >>> 13), 1274126177); return (((h ^ (h >>> 16)) >>> 0) / 4294967296) * 2 - 1; };
const smooth = (t) => t * t * (3 - 2 * t);
/** Value noise in (x, y, t), smooth in all three: small showers that drift and change. */
function noise3(x, y, t) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(t), fx = smooth(x - i), fy = smooth(y - j), ft = smooth(t - k);
  let total = 0;
  for (let a = 0; a < 2; a += 1) for (let b = 0; b < 2; b += 1) for (let c = 0; c < 2; c += 1) total += lattice(i + a, j + b, k + c) * (a ? fx : 1 - fx) * (b ? fy : 1 - fy) * (c ? ft : 1 - ft);
  return total;
}

// ---------------------------------------------------------------- the circulation

const W = WORLD_INPUTS.weather;

/**
 * How far (degrees of latitude, northward positive) the wind and pressure belts stand from their mean places at a
 * latitude, for the Sun's declination: they follow the Sun as the rain belt does, less and less toward the poles.
 */
export const beltShiftDeg = (lat, declinationDeg) => BELT_SWING_MEAN * declinationDeg * (1 - Math.abs(lat) / 90);

/** Mean surface wind by latitude (m/s east, m/s north): trades, westerlies, polar easterlies, shifted with the season. */
export function backgroundWind(lat, declinationDeg = 0) {
  const at = clamp(lat - beltShiftDeg(lat, declinationDeg), -90, 90), a = Math.abs(at), h = at >= 0 ? 1 : -1;
  const east = a < 30 ? -6 * Math.sin(Math.PI * a / 30) - 1 : a < 60 ? 8 * Math.sin(Math.PI * (a - 30) / 30) : -3 * Math.sin(Math.PI * (a - 60) / 30);
  const north = a < 30 ? -h * 2.5 * Math.sin(Math.PI * a / 30) : a < 60 ? h * 1 * Math.sin(Math.PI * (a - 30) / 30) : -h * 0.8 * Math.sin(Math.PI * (a - 60) / 30);
  return { east, north };
}

/** Mean sea-level pressure by latitude (hPa): equatorial trough, subtropical highs, subpolar lows, shifted with the season. */
export function backgroundPressure(lat, declinationDeg = 0) {
  const a = Math.abs(clamp(lat - beltShiftDeg(lat, declinationDeg), -90, 90));
  return 1013 - 3 * Math.exp(-((a / 10) ** 2)) + 8 * Math.exp(-(((a - 32) / 9) ** 2)) - 7 * Math.exp(-(((a - 62) / 9) ** 2)) + 4 * Math.exp(-(((a - 90) / 10) ** 2));
}

// ---------------------------------------------------------------- the jet streams and blocking

const BLOCK_SLOT_HOURS = W.blockSlotDays * 24, BLOCK_MAX_HOURS = W.blockDays[1] * 24;
const lonGap = (a, b) => ((a - b + 540) % 360) - 180;
/** A block's strength (0–1) at an hour: it builds over two days, holds, and fades over two. */
const blockEnvelope = (block, hour) => { const tau = hour - block.born; return tau <= 0 || tau >= block.life ? 0 : smooth(clamp(Math.min(tau, block.life - tau) / 48, 0, 1)); };

/** The block that may begin in one slot of one hemisphere, or null. */
function slotBlock(hemisphere, slot, land = null) {
  const r = rng(`${WEATHER_SEED}|block|${hemisphere}|${slot}`);
  // (With the land's atmosphere: more blocks in a hemisphere whose jet the land bends, and more of them at its
  // fixed ridges. The same numbers are drawn either way, so a block keeps its time, life and strength.)
  const season = land ? approximateDeclinationDeg((slot + 0.5) * BLOCK_SLOT_HOURS * HOUR_MS) : 0;
  if (r() >= W.blocksPerYear * W.blockSlotDays / DAYS_PER_YEAR * (land ? land.blockRate(hemisphere, season) : 1)) return null;
  const pick = ([a, b]) => a + (b - a) * r(), born = (slot + r()) * BLOCK_SLOT_HOURS, life = pick(W.blockDays) * 24, u = r(), lon = land ? land.blockLon(hemisphere, u, season) : u * 360 - 180;
  // The high sits a little poleward of the jet's place for the season, where the stalled ridge reaches.
  const mid = (born + life / 2) * HOUR_MS, lat = hemisphere * (W.jetLat + 6) + beltShiftDeg(hemisphere * W.jetLat, approximateDeclinationDeg(mid));
  return { id: `block-${hemisphere > 0 ? "n" : "s"}-${slot}`, kind: "high", block: true, hemisphere, born, life, lat0: lat, lon0: lon, amp: pick(W.blockHpa), radiusKm: pick(W.blockRadiusKm), eastMs: 0, polewardMs: 0, turn: 0 };
}

/**
 * The blocking episodes alive at some point in [fromHour, toHour] (hours since the timeline's zero), each
 * { id, hemisphere, born, life (hours), lat0, lon0, amp (hPa), radiusKm }: for the weather, and for the history
 * engine's timeline of shocks (a spell of persistent dry, hot or cold weather under it, and wet beside it).
 */
export function blocksBetween(fromHour, toHour, land = null) {
  const out = [];
  for (let slot = Math.floor((fromHour - BLOCK_MAX_HOURS) / BLOCK_SLOT_HOURS); slot <= Math.floor(toHour / BLOCK_SLOT_HOURS); slot += 1) for (const hemisphere of [1, -1]) { const b = slotBlock(hemisphere, slot, land); if (b && b.born + b.life >= fromHour && b.born <= toHour) out.push(b); }
  return out;
}

/**
 * The latitude (signed) of a hemisphere's polar-front jet at a longitude and hour: its place for the season, a few
 * slow waves drifting east whose strength comes and goes over weeks, and, where a block stands, a stalled ridge
 * bending it poleward with a trough on either side.
 */
export function jetLatAt(hemisphere, lon, hour, land = null) {
  const days = hour / 24, declination = approximateDeclinationDeg(hour * HOUR_MS), season = beltShiftDeg(hemisphere * W.jetLat, declination);
  let swing = 0;
  W.jetWaves.forEach((w, k) => {
    const strength = 0.65 + 0.35 * noise3(17.3 * (k + 1), 5.1 * hemisphere, days / 25), phase = 2 * Math.PI * lattice(k + 1, hemisphere, 7);
    swing += w.swingDeg * strength * Math.sin(w.count * (lon - w.eastDegPerDay * days) * DEG + phase);
  });
  let ridge = 0;
  for (const b of blocksBetween(hour, hour, land)) {
    if (b.hemisphere !== hemisphere) continue; const e = blockEnvelope(b, hour), d = lonGap(lon, b.lon0);
    ridge += e * W.blockSwingDeg * (Math.exp(-((d / 24) ** 2)) - 0.45 * Math.exp(-(((Math.abs(d) - 50) / 20) ** 2)));
  }
  // The fixed bends the land puts in it (scripts/eym-land-atmosphere.mjs): none without a land's atmosphere.
  const fixed = land ? land.stationaryJetDeg(hemisphere, lon, declination) : 0;
  return hemisphere * (W.jetLat + swing + ridge + fixed) + season;
}

/** The latitude (signed) of a hemisphere's subtropical jet at an hour: it follows the season and hardly meanders. */
export const subtropicalJetLatAt = (hemisphere, hour) => hemisphere * W.subtropicalLat + beltShiftDeg(hemisphere * W.subtropicalLat, approximateDeclinationDeg(hour * HOUR_MS));

// ---------------------------------------------------------------- weather systems

const POPULATIONS = Object.freeze([
  { kind: "low", band: [27, 70], perDay: 1.9, life: [72, 150], amp: [-10, -30], radiusKm: [650, 1200], eastMs: [8, 15], polewardMs: [0.4, 1.6] },
  { kind: "high", band: [24, 52], perDay: 1.2, life: [96, 200], amp: [5, 14], radiusKm: [1100, 1800], eastMs: [2, 7], polewardMs: [-0.6, 0.2] },
  { kind: "wave", band: [3, 30], perDay: 1.3, life: [72, 150], amp: [-2, -5], radiusKm: [450, 850], eastMs: [-8, -4.5], polewardMs: [-0.1, 0.4] },
  { kind: "tropical", band: [6, 18], perDay: 0.23, life: [130, 280], amp: [-14, -80], radiusKm: [280, 520], eastMs: [-6, -3.5], polewardMs: [1.0, 2.2] },
]);
const MAX_LIFE_HOURS = Math.max(...POPULATIONS.map((p) => p.life[1]));
const TROPICAL_GENESIS_SST_C = 25.5;

/** Every system born in a six-hour slot, for one population and hemisphere. */
function slotSystems(population, hemisphere, slot, isOcean, sstAt) {
  const r = rng(`${WEATHER_SEED}|${population.kind}|${hemisphere}|${slot}`);
  const expected = population.perDay * SLOT_HOURS / 24;
  let count = 0, p = Math.exp(-expected), cumulative = p; const u = r(); // Poisson draw
  while (u > cumulative && count < 6) { count += 1; p *= expected / count; cumulative += p; }
  const out = [];
  for (let n = 0; n < count; n += 1) {
    const pick = ([a, b]) => a + (b - a) * r();
    const born = (slot + r()) * SLOT_HOURS, lat0 = hemisphere * pick(population.band), lon0 = r() * 360 - 180;
    const system = { id: `${population.kind}-${hemisphere > 0 ? "n" : "s"}-${slot}-${n}`, kind: population.kind, hemisphere, born, life: pick(population.life), lat0, lon0, amp: pick(population.amp), radiusKm: pick(population.radiusKm), eastMs: pick(population.eastMs), polewardMs: pick(population.polewardMs), turn: 0.45 + 0.25 * r() };
    if (system.kind === "tropical") {
      // Tropical cyclones form only over warm sea, in their hemisphere's cyclone season: early summer
      // to late autumn (northern: about June to November; southern: December to May), peaking late.
      // The sea's real warmth there and then (the currents and the oscillation, scripts/eym-climate.mjs), when known.
      const sst = sstAt ? sstAt(lat0, lon0, born * HOUR_MS) : seasonalTemperature({ annualMeanC: annualMeanTemperatureC(lat0), latDeg: lat0, ocean: true, timeMs: born * HOUR_MS }).dayMeanC;
      const f = (yearFraction(born * HOUR_MS) + (hemisphere > 0 ? 0 : 0.5)) % 1, inSeason = f > 0.22 && f < 0.7 && r() < Math.sin(Math.PI * (f - 0.22) / 0.48) ** 0.5 * 1.15;
      if (sst < TROPICAL_GENESIS_SST_C || !isOcean(lat0, lon0) || !inSeason) continue;
    }
    out.push(system);
  }
  return out;
}

/** All systems alive at some point in [fromHour, toHour] (hours since the timeline's zero). */
/** The land's atmosphere each system was made under (for its path along the jet), kept beside the system. */
const systemLand = new WeakMap();

export function systemsBetween(fromHour, toHour, isOcean = () => true, sstAt = null, land = null) {
  const systems = [];
  for (let slot = Math.floor((fromHour - MAX_LIFE_HOURS) / SLOT_HOURS); slot <= Math.floor(toHour / SLOT_HOURS); slot += 1) {
    for (const population of POPULATIONS) for (const hemisphere of [1, -1]) for (const s of slotSystems(population, hemisphere, slot, isOcean, sstAt)) if (s.born + s.life >= fromHour && s.born <= toHour) systems.push(s);
  }
  systems.push(...blocksBetween(fromHour, toHour, land));
  if (land) for (const s of systems) systemLand.set(s, land);
  return systems;
}

/** A system's centre and strength at an hour, or null if it is not alive. */
export function systemAt(system, hour, landFractionAt = () => 0) {
  const tau = hour - system.born;
  if (tau < 0 || tau > system.life) return null;
  let eastKm, northKm, envelope;
  if (system.kind === "tropical") {
    // West and poleward, then recurving east into the westerlies.
    const turnAt = system.life * system.turn, after = Math.max(0, tau - turnAt);
    // After recurving it gains 0.08 m/s eastward and 0.03 m/s poleward every hour.
    eastKm = 3.6 * (system.eastMs * tau + 0.5 * 0.08 * after * after);
    northKm = 3.6 * system.hemisphere * (system.polewardMs * tau + 0.5 * 0.03 * after * after);
    envelope = tau < 0.35 * system.life ? tau / (0.35 * system.life) : 1 - 0.75 * (tau - 0.35 * system.life) / (0.65 * system.life);
  } else {
    eastKm = 3.6 * system.eastMs * tau;
    northKm = 3.6 * system.hemisphere * system.polewardMs * tau;
    envelope = Math.sin(Math.PI * tau / system.life) ** 0.7;
  }
  const straight = clamp(system.lat0 + northKm / 111.2, -88, 88);
  const lon = ((system.lon0 + eastKm / (111.2 * Math.max(0.15, Math.cos(((system.lat0 + straight) / 2) * DEG))) + 540) % 360) - 180;
  // Mid-latitude lows and highs ride the jet: wherever it swings from its mean place, they swing with it.
  const follow = system.block ? 0 : W.follow[system.kind] ?? 0;
  const lat = follow ? clamp(straight + follow * (jetLatAt(system.hemisphere, lon, hour, systemLand.get(system) ?? null) - system.hemisphere * W.jetLat), -88, 88) : straight;
  if (system.block) envelope = blockEnvelope(system, hour);
  if (system.kind === "tropical" && Math.abs(lat) > 40) envelope *= 0.4; // transitions to an ordinary low
  let amp = system.amp * envelope;
  if (system.kind === "tropical") amp *= 1 - 0.7 * landFractionAt(lat, lon); // land starves it
  const p = lat * DEG, l = lon * DEG;
  return { id: system.id, kind: system.kind, ...(system.block ? { block: true } : {}), hemisphere: system.hemisphere, lat, lon, amp, radiusKm: system.radiusKm, unit: [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)] };
}

/** Maximum sustained wind of a tropical cyclone from its central pressure deficit (m/s). */
export const tropicalMaxWindMs = (deficitHpa) => 3.45 * Math.abs(deficitHpa) ** 0.644;

// ---------------------------------------------------------------- the weather at one place and moment

/** Rainfall relative to the zonal climate, by biome (dry country gets less). */
export const BIOME_RAIN = Object.freeze({ "hot-desert": 0.25, "cold-desert": 0.3, steppe: 0.65, savanna: 0.75, tundra: 0.6, "ice-cap": 0.35, taiga: 0.9, "temperate-forest": 1, "seasonal-forest": 1, "temperate-rainforest": 1.4, "tropical-rainforest": 1.35 });
/**
 * How wet a place is against its latitude's rain: over land, the rain budget's yearly rain for its square
 * (scripts/eym-rain.mjs, carried by the asset) over the latitude's; without it, a figure for its kind of country.
 * (Within 35° of the equator the land's afternoon storms add to the lift's yield, which was measured over the sea:
 * the budget's figure already counts all the rain, so it is divided by that excess, the dial `landAfternoonYield`.)
 */
export const wetnessOf = (cell, lat) => (!cell || cell.ocean ? 1 : cell.rainMm != null ? clamp(cell.rainMm / zonalPrecipitationMm(lat, RAIN_BAND_MEAN) / (Math.abs(lat) < 35 ? W.landAfternoonYield : 1), 0.02, 5) : BIOME_RAIN[cell.biome] ?? 0.8);
/** Normalization of the rain-producing lift by latitude (2.5° bands from 90°S), from calibrate-eym-weather. */
export const RAIN_NORMALIZATION = Object.freeze([
  45.67, 51.06, 23.05, 20.15, 11.7, 7.86, 6.37, 4.88, 4.45, 4.28, 4, 4.24, 4.4, 4.58, 5.25, 5.51, 6.13, 6.96,
  7.32, 8.72, 9.71, 10.33, 12.54, 13.5, 15.45, 22.1, 25.21, 32.56, 31.2, 23.35, 20.92, 10.29, 6.82, 4.67, 3.54, 3.33,
  3.35, 3.27, 3.4, 3.26, 3.41, 4.26, 5.61, 9.89, 17.61, 19.74, 19.29, 13.45, 12.51, 11.54, 9.51, 9.09, 8.21, 7.2,
  7.02, 6.07, 5.55, 5.17, 4.57, 4.56, 4.4, 4.18, 4.36, 4.39, 4.83, 6.14, 7.45, 10.98, 17.06, 20.34, 40.17, 36.26,
]);
/** The normalization at a latitude, interpolated between band centres (it changes steeply in the subtropics). */
export function rainNormalization(lat) {
  const n = RAIN_NORMALIZATION.length, x = clamp((lat + 90 - 90 / n) / (180 / n), 0, n - 1), i = Math.min(n - 2, Math.floor(x)), f = x - i;
  return RAIN_NORMALIZATION[i] * (1 - f) + RAIN_NORMALIZATION[i + 1] * f;
}
const BEAUFORT = [[0.5, "calm"], [1.6, "light air"], [3.4, "light breeze"], [5.5, "gentle breeze"], [8, "moderate breeze"], [10.8, "fresh breeze"], [13.9, "strong breeze"], [17.2, "near gale"], [20.8, "gale"], [24.5, "strong gale"], [28.5, "storm"], [32.7, "violent storm"], [Infinity, "hurricane force"]];
const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

/**
 * The weather at one place and moment, given the systems alive then (from systemAt).
 * @param ctx { cell (environmentField cell or null), declinationDeg, solarHour, timeMs }
 */
export function weatherAt(systems, lat, lon, ctx) {
  const p = lat * DEG, l = lon * DEG, here = [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
  const east = [-Math.sin(l), Math.cos(l), 0], north = [-Math.sin(p) * Math.cos(l), -Math.sin(p) * Math.sin(l), Math.cos(p)];
  const cell = ctx.cell, land = cell ? !cell.ocean : false, hour = ctx.timeMs / HOUR_MS;
  let anomaly = 0, gx = 0, gy = 0, tcEast = 0, tcNorth = 0, tcRain = 0, nearestStorm = null, blocked = 0;
  for (const s of systems) {
    const cosd = clamp(here[0] * s.unit[0] + here[1] * s.unit[1] + here[2] * s.unit[2], -1, 1), dKm = Math.acos(cosd) * R_KM;
    if (dKm > s.radiusKm * 3.2) continue;
    const e = Math.exp(-((dKm / s.radiusKm) ** 2));
    // Direction from here toward the centre, in local east/north.
    const tx = s.unit[0] - cosd * here[0], ty = s.unit[1] - cosd * here[1], tz = s.unit[2] - cosd * here[2], tn = Math.hypot(tx, ty, tz) || 1;
    const towardE = (tx * east[0] + ty * east[1] + tz * east[2]) / tn, towardN = (tx * north[0] + ty * north[1] + tz * north[2]) / tn;
    if (s.kind === "tropical") {
      const deficit = -Math.min(0, s.amp), vmax = tropicalMaxWindMs(deficit), rm = 25 + s.radiusKm * 0.12;
      anomaly += s.amp * Math.exp(-((dKm / (s.radiusKm * 0.6)) ** 2));
      const speed = vmax * (dKm < rm ? dKm / rm : (rm / Math.max(dKm, 1)) ** 0.55) * (dKm < s.radiusKm * 2.5 ? 1 : 0.3);
      // Cyclonic: anticlockwise in the north, clockwise in the south, spiralling 20° inward.
      const h = s.hemisphere, tangentE = -h * towardN, tangentN = h * towardE;
      tcEast += speed * (0.94 * tangentE + 0.34 * towardE); tcNorth += speed * (0.94 * tangentN + 0.34 * towardN);
      tcRain += (deficit / 40) * Math.exp(-((dKm / 380) ** 2)) * 2.2;
      if (deficit > 8 && (!nearestStorm || dKm < nearestStorm.distanceKm)) nearestStorm = { kind: vmax >= 33 ? "hurricane" : vmax >= 17.5 ? "tropical storm" : "tropical depression", distanceKm: dKm, maxWindMs: vmax, lat: s.lat, lon: s.lon, id: s.id };
      continue;
    }
    anomaly += s.amp * e;
    if (s.block) blocked = Math.max(blocked, e * s.amp / W.blockHpa[1]);
    const g = s.amp * e * 2 * dKm / (s.radiusKm * s.radiusKm); // hPa per km, pointing toward the centre for highs
    gx += g * towardE; gy += g * towardN;
  }
  const pressureHpa = backgroundPressure(lat, ctx.declinationDeg) + anomaly;
  // Geostrophic wind from the systems' pressure gradient, slowed and turned toward low pressure by friction.
  const sinLat = Math.sin(p), f = 2 * OMEGA * (Math.abs(sinLat) < 0.22 ? (sinLat >= 0 ? 0.22 : -0.22) : sinLat);
  let ge = -0.1 * gy / (1.2 * f), gn = 0.1 * gx / (1.2 * f);
  const gs = Math.hypot(ge, gn), cap = 38;
  if (gs > cap) { ge *= cap / gs; gn *= cap / gs; }
  const friction = land ? 0.6 : 0.8, turn = 20 * DEG * (sinLat >= 0 ? 1 : -1);
  const back = backgroundWind(lat, ctx.declinationDeg), monsoon = ctx.land?.monsoonWind(lat, lon, ctx.declinationDeg);
  // (Where the land has drawn the rain belt on, the trades between the equator and the belt turn about.)
  if (monsoon?.strength) { back.east += monsoon.east; back.north += monsoon.north; }
  let windE = back.east + friction * (ge * Math.cos(turn) - gn * Math.sin(turn)) + tcEast * (land ? 0.75 : 1);
  let windN = back.north + friction * (ge * Math.sin(turn) + gn * Math.cos(turn)) + tcNorth * (land ? 0.75 : 1);
  const windMs = Math.hypot(windE, windN), windFromDeg = (Math.atan2(-windE, -windN) / DEG + 360) % 360;

  // Rising air makes cloud and rain: lows, the tropical rain belt, afternoon storms over land, and drifting showers.
  const drift = back.east * 3.6 * hour / (111.2 * Math.max(0.2, Math.cos(p)));
  const showers = noise3((lon - drift) / 4, lat / 4, hour / 9);
  const itcz = Math.exp(-(((lat - (ctx.land ? ctx.land.rainBeltLatAt(lon, ctx.declinationDeg) : rainBeltLat(ctx.declinationDeg))) / 9) ** 2));
  const afternoon = land && Math.abs(lat) < 35 ? Math.max(0, Math.cos(2 * Math.PI * (ctx.solarHour - 15.5) / 24)) : 0;
  const lift = 0.12 - Math.min(anomaly, 30) / 11 + 0.85 * itcz + 0.4 * afternoon * (0.4 + itcz) + 0.6 * showers + tcRain;
  const wetness = wetnessOf(cell, lat);
  const baseCloud = cell?.ocean === false ? 0.15 + 0.3 * Math.min(1.2, wetness) : 0.42;
  // Low cloud over the sea (the aquaplanet addendum): a marine layer under sinking air (high pressure, the
  // subtropical belts) and over cool water (upwelling, cold currents: the ocean climate's anomaly), thickest at
  // night, reaching a little way inland, and broken up where the air is rising into storms.
  const marine = cell ? (cell.ocean ? 1 : Math.max(0, 1 - 6 * cell.continentality)) : 1;
  const sinking = 0.5 * clamp(anomaly / 12, 0, 1) + 0.5 * Math.exp(-(((Math.abs(lat) - 27) / 10) ** 2));
  const coolSea = clamp(-(ctx.anomalyC ?? 0) / 2, 0, 1), night = Math.max(0, Math.cos(2 * Math.PI * (ctx.solarHour - 3) / 24));
  const stratus = 0.2 * Math.exp(-(((Math.abs(lat) - 55) / 15) ** 2)); // the grey skies of the stormy mid-latitude seas
  const lowCloud = marine * clamp(0.3 + 0.3 * sinking + 0.45 * coolSea + stratus + 0.12 * night - 0.5 * Math.max(0, lift - 0.7), 0, 0.95);
  const cloud = Math.max(clamp(baseCloud + 0.55 * (lift - 0.1), 0, 1), lowCloud);
  const climateMmH = zonalPrecipitationMm(lat, RAIN_BAND_MEAN) * wetness / YEAR_HOURS;
  let precipMmH = Math.min(60, Math.max(0, lift - 0.3) ** 1.4 * rainNormalization(lat) * climateMmH);
  // A thick marine layer drizzles when nothing heavier is falling; on cool water with light winds it lies as fog.
  const drizzle = precipMmH < 0.05 && lowCloud > 0.62;
  if (drizzle) precipMmH = 0.05 + 0.3 * (lowCloud - 0.62);

  // Temperature: the season and the hour, warm or cold air carried in by the wind, damped by cloud and rain.
  const seasonal = seasonalTemperature({ annualMeanC: cell?.annualMeanC ?? annualMeanTemperatureC(lat), latDeg: lat, continentality: cell?.continentality ?? 0, ocean: !land, timeMs: ctx.timeMs, solarHour: ctx.solarHour, anomalyC: ctx.anomalyC ?? 0 });
  const poleward = windN * (lat >= 0 ? 1 : -1) - back.north * (lat >= 0 ? 1 : -1);
  const advection = clamp(0.32 * poleward, -9, 9) * Math.min(1, Math.abs(sinLat) * 1.6);
  const diurnal = (seasonal.nowC - seasonal.dayMeanC) * (1 - 0.6 * cloud);
  // Under a block the weather holds: clear skies day after day warm a summer and chill a winter.
  const spell = blocked * W.blockTempC * clamp((ctx.declinationDeg ?? 0) * (lat >= 0 ? 1 : -1) / 12, -1, 1);
  // A great eruption's veil cools the whole air for a year or three (scripts/eym-quakes.mjs).
  const volcanicC = ctx.geology ? volcanicCoolingC(ctx.geology, ctx.timeMs, lat) : 0;
  const tempC = seasonal.dayMeanC + diurnal + advection + spell - (precipMmH > 0.3 ? 1.5 : 0) + volcanicC;
  const kind = precipMmH < 0.05 ? null : tempC < 0.5 ? "snow" : tempC < 2 ? "sleet" : "rain";
  const thunder = kind === "rain" && precipMmH > 3 && tempC > 16 && cloud > 0.8;
  const fog = lowCloud > 0.62 && coolSea > 0.25 && windMs < 7 && Math.abs(lat) > 12; // warm air over cold water, away from the doldrums
  const humidity = fog ? 100 : Math.round(clamp((cell?.ocean === false ? 35 + 35 * Math.min(1.2, wetness) : 78) + 22 * (cloud - 0.45) + (precipMmH > 0.1 ? 12 : 0), 12, 100));
  return { pressureHpa, windMs, windFromDeg, windE, windN, gustMs: windMs * (land ? 1.5 : 1.3), cloud, lowCloud, precipMmH, precipKind: kind, drizzle: drizzle && kind === "rain", fog, thunder, tempC, humidity, nearestStorm, blocked };
}

/** Words for one moment's weather. */
export function describeWeather(w) {
  const sky = w.cloud < 0.15 ? "clear" : w.cloud < 0.4 ? "a few clouds" : w.cloud < 0.7 ? "partly cloudy" : w.cloud < 0.9 ? "mostly cloudy" : "overcast";
  const amount = w.precipMmH < 0.5 ? "light" : w.precipMmH < 4 ? "moderate" : "heavy";
  const precip = w.drizzle ? `drizzle${w.fog ? " and sea fog" : ""}` : w.precipKind ? `${amount} ${w.precipKind}${w.thunder ? " and thunderstorms" : ""}` : w.fog ? "sea fog" : null;
  const force = BEAUFORT.find(([limit]) => w.windMs < limit)[1];
  const from = COMPASS[Math.round(w.windFromDeg / 22.5) % 16];
  return { sky, precip, wind: `${force}, ${Math.round(w.windMs * 3.6)} km/h from the ${from}`, force, from };
}

// ---------------------------------------------------------------- reconstruction over the last week

/**
 * The weather state at a moment: systems alive over the last 168 hours and the next 24, positioned
 * every 3 hours. Everything else is evaluated from it on demand.
 * @param ctx { timeMs, subsolar: { latDeg, lonDeg }, field (environmentField) }
 */
export function buildWeatherState({ timeMs, subsolar, field }) {
  const nowHour = Math.round(timeMs / HOUR_MS / STEP_HOURS) * STEP_HOURS; // 3-hour steps
  const landFraction = (lat, lon) => (field ? (field.cellAt(lat, lon).ocean ? 0 : 1) : 0), isOcean = (lat, lon) => (field ? field.cellAt(lat, lon).ocean : true);
  const land = landAtmosphere(field ?? null), systems = systemsBetween(nowHour - WINDOW_HOURS, nowHour + FORECAST_HOURS, isOcean, field?.sstC ?? null, land);
  const steps = [];
  for (let hour = nowHour - WINDOW_HOURS; hour <= nowHour + FORECAST_HOURS; hour += STEP_HOURS) {
    const alive = []; for (const s of systems) { const at = systemAt(s, hour, landFraction); if (at) alive.push(at); }
    steps.push({ hour, timeMs: hour * HOUR_MS, systems: alive, declinationDeg: subsolar.latDeg, subsolarLonDeg: subsolar.lonDeg - 15 * (hour * HOUR_MS - timeMs) / HOUR_MS });
  }
  return { timeMs, nowHour, steps, nowIndex: WINDOW_HOURS / STEP_HOURS, field, land };
}

const solarHourAt = (lon, subsolarLonDeg) => ((12 + (lon - subsolarLonDeg) / 15) % 24 + 24) % 24;

/** The weather at a place at the state's moment (systems placed at the exact time). */
export function placeWeatherNow(state, lat, lon, { subsolar, timeMs } = {}) {
  const cell = state.field?.cellAt(lat, lon) ?? null, t = timeMs ?? state.timeMs;
  const landFraction = (a, b) => (state.field ? (state.field.cellAt(a, b).ocean ? 0 : 1) : 0);
  // Place the systems alive now at the exact hour, between the 3-hour steps.
  const exactHour = t / HOUR_MS, systems = [];
  for (const s of systemsBetween(exactHour, exactHour, (a, b) => (state.field ? state.field.cellAt(a, b).ocean : true), state.field?.sstC ?? null, state.land ?? null)) { const at = systemAt(s, exactHour, landFraction); if (at) systems.push(at); }
  const sub = subsolar ?? { latDeg: state.steps[state.nowIndex].declinationDeg, lonDeg: state.steps[state.nowIndex].subsolarLonDeg };
  return weatherAt(systems, lat, lon, { cell, declinationDeg: sub.latDeg, solarHour: solarHourAt(lon, sub.lonDeg), timeMs: t, anomalyC: state.field?.anomalyAt?.(lat, lon, t) ?? 0, land: state.land ?? null, geology: state.field?.geology ?? null });
}

/**
 * What has built up at a place over the last week, and the outlook for the next day: rain and snow
 * totals, snow depth, ground wetness and flooding, pressure tendency.
 */
export function placeHistory(state, lat, lon) {
  const cell = state.field?.cellAt(lat, lon) ?? null, land = cell ? !cell.ocean : false;
  const climateWet = cell ? clamp(zonalPrecipitationMm(lat, RAIN_BAND_MEAN) * wetnessOf(cell, lat) / 2000, 0.15, 0.9) : 0.5;
  const firstSeason = seasonalTemperature({ annualMeanC: cell?.annualMeanC ?? annualMeanTemperatureC(lat), latDeg: lat, continentality: cell?.continentality ?? 0, ocean: !land, timeMs: state.steps[0].timeMs, anomalyC: state.field?.anomalyAt?.(lat, lon, state.steps[0].timeMs) ?? 0 });
  let snowCm = land && firstSeason.dayMeanC < -1 ? clamp(-firstSeason.dayMeanC * 7, 4, 150) : 0;
  const capacity = 100; let water = capacity * climateWet;
  let rain7 = 0, snow7 = 0, rain24 = 0, maxWind7 = 0, flooding = false;
  const hours = [];
  for (let i = 0; i < state.steps.length; i += 1) {
    const step = state.steps[i];
    const w = weatherAt(step.systems, lat, lon, { cell, declinationDeg: step.declinationDeg, solarHour: solarHourAt(lon, step.subsolarLonDeg), timeMs: step.timeMs, anomalyC: state.field?.anomalyAt?.(lat, lon, step.timeMs) ?? 0, land: state.land ?? null, geology: state.field?.geology ?? null });
    hours.push({ hour: step.hour, w });
    if (i > state.nowIndex) continue; // the forecast does not build up yet
    const mm = w.precipMmH * STEP_HOURS;
    if (i > 0) {
      if (w.precipKind === "snow") { snowCm += mm; snow7 += mm; } else { rain7 += mm; if (w.precipKind === "sleet") snowCm += mm * 0.3; }
      const melt = w.tempC > 0 ? Math.min(snowCm, 0.5 * w.tempC * (STEP_HOURS / 3)) : 0;
      snowCm -= melt;
      const evaporation = Math.max(0, w.tempC) / 20 * 0.1 * STEP_HOURS * (1 - 0.6 * w.cloud);
      water = clamp(water + (w.precipKind === "snow" ? 0 : mm) + melt * 0.1 - evaporation - water * 0.012, 0, capacity * 1.4);
      if (state.nowIndex - i < 24 / STEP_HOURS) rain24 += w.precipKind === "snow" ? 0 : mm;
      maxWind7 = Math.max(maxWind7, w.windMs);
    }
  }
  flooding = land && water > capacity * 1.05 && rain24 > 50;
  const now = hours[state.nowIndex].w, threeAgo = hours[state.nowIndex - 1].w;
  const next = hours.slice(state.nowIndex + 1);
  const outlook = next.length ? {
    precipMm: next.reduce((sum, h) => sum + h.w.precipMmH * STEP_HOURS, 0),
    snow: next.some((h) => h.w.precipKind === "snow"),
    maxWindMs: Math.max(...next.map((h) => h.w.windMs)), minC: Math.min(...next.map((h) => h.w.tempC)), maxC: Math.max(...next.map((h) => h.w.tempC)),
    thunder: next.some((h) => h.w.thunder), storm: next.map((h) => h.w.nearestStorm).find((s) => s && s.distanceKm < 600) ?? null,
  } : null;
  const ground = !land ? "open water" : flooding ? "flooding" : water > capacity ? "waterlogged" : water > capacity * 0.7 ? "wet" : water > capacity * 0.35 ? "damp" : "dry";
  return { snowDepthCm: land ? Math.max(0, snowCm) : 0, rain7Mm: rain7, snow7Mm: snow7, rain24Mm: rain24, maxWind7Ms: maxWind7, ground, flooding, pressureTendencyHpa: now.pressureHpa - threeAgo.pressureHpa, outlook, now };
}

/** The weather in words for a place: what the GM reads out. */
export function weatherReport(state, lat, lon, now = null) {
  const history = placeHistory(state, lat, lon), w = now ?? history.now, words = describeWeather(w);
  const tendency = history.pressureTendencyHpa > 1 ? "rising" : history.pressureTendencyHpa < -1 ? "falling" : "steady";
  const o = history.outlook;
  const outlook = o ? `${Math.round(o.minC)}–${Math.round(o.maxC)} °C; ${o.precipMm < 1 ? "dry" : `${Math.round(o.precipMm)} mm of ${o.snow ? "snow and rain" : "rain"}`}${o.thunder ? ", thunderstorms" : ""}; wind up to ${Math.round(o.maxWindMs * 3.6)} km/h${o.storm ? `; ${o.storm.kind} within ${Math.round(o.storm.distanceKm)} km` : ""}` : "—";
  return {
    conditions: `${words.sky[0].toUpperCase()}${words.sky.slice(1)}${words.precip ? `, ${words.precip}` : ""}`,
    weatherTemperature: `${Math.round(w.tempC)} °C`,
    wind: words.wind,
    pressure: `${Math.round(w.pressureHpa)} hPa, ${tendency}`,
    humidity: `${w.humidity}%`,
    lastWeek: `${Math.round(history.rain7Mm)} mm rain${history.snow7Mm >= 1 ? `, ${Math.round(history.snow7Mm)} cm snow` : ""}`,
    groundNow: history.snowDepthCm >= 1 ? `${Math.round(history.snowDepthCm)} cm of snow; ${history.ground}` : history.ground,
    outlook,
    storm: w.nearestStorm && w.nearestStorm.distanceKm < 1500 ? `${w.nearestStorm.kind} ${Math.round(w.nearestStorm.distanceKm)} km away, winds ${Math.round(w.nearestStorm.maxWindMs * 3.6)} km/h` : "none near",
    values: { weather: w, history },
  };
}

// ---------------------------------------------------------------- the globe

/**
 * Weather over the whole globe at the state's moment, for map overlays: cloud and rain on a 6° grid
 * (about 1,800 cells), wind arrows, the centres of highs and lows, tropical cyclones, and the land
 * cells under snow or flooding.
 */
export function globeWeather(state, { landCells = 5000 } = {}) {
  const step = state.steps[state.nowIndex], cells = [];
  for (let lat = -87; lat < 90; lat += 6) for (let lon = -177; lon < 180; lon += 6) {
    const cell = state.field?.cellAt(lat, lon) ?? null;
    const w = weatherAt(step.systems, lat, lon, { cell, declinationDeg: step.declinationDeg, solarHour: solarHourAt(lon, step.subsolarLonDeg), timeMs: step.timeMs, anomalyC: state.field?.anomalyAt?.(lat, lon, step.timeMs) ?? 0, land: state.land ?? null, geology: state.field?.geology ?? null });
    cells.push({ lat, lon, cloud: w.cloud, precipMmH: w.precipMmH, precipKind: w.precipKind, thunder: w.thunder, windMs: w.windMs, windE: w.windE, windN: w.windN });
  }
  const centres = step.systems.filter((s) => s.kind !== "tropical" && Math.abs(s.amp) >= 6).map((s) => ({ lat: s.lat, lon: s.lon, kind: s.amp < 0 ? "low" : "high", ...(s.block ? { block: true } : {}), pressureHpa: Math.round(backgroundPressure(s.lat, step.declinationDeg) + s.amp) }));
  const cyclones = step.systems.filter((s) => s.kind === "tropical" && -s.amp >= 8).map((s) => { const vmax = tropicalMaxWindMs(-s.amp); return { lat: s.lat, lon: s.lon, maxWindMs: vmax, kind: vmax >= 33 ? "hurricane" : vmax >= 17.5 ? "tropical storm" : "tropical depression", id: s.id }; });
  // Snow and floods on land: reconstruct the last week at land cells (sampled evenly, capped for speed).
  const land = state.field ? state.field.cells.filter((c) => !c.ocean) : [];
  const stride = Math.max(1, Math.ceil(land.length / landCells)), snow = [], floods = [];
  for (let i = 0; i < land.length; i += stride) {
    const c = land[i], h = placeHistory(state, c.lat, c.lon);
    if (h.snowDepthCm >= 2) snow.push(c);
    if (h.flooding) floods.push({ lat: c.lat, lon: c.lon });
  }
  return { cells, centres, cyclones, snow, floods, stride };
}
