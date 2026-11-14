// Weather on Eym: deterministic, physically plausible and coherent in time, with no background
// simulation (ROADMAP.md, "Weather design"). Weather systems (mid-latitude lows and highs, tropical
// waves, tropical cyclones) are born from a fixed seed in fixed six-hour slots and move along analytic
// tracks, so their state at any moment — tomorrow or a century on — is computed directly. Pressure,
// wind, cloud, rain or snow and temperature at any place and time follow from them and from the
// seasonal climate (scripts/eym-seasons.mjs). What builds up — snow cover, ground wetness and flooding
// — is reconstructed over the preceding 168 hours in 3-hour steps. Identical inputs give identical
// weather.

import { annualMeanTemperatureC, rainBeltLat, seasonalTemperature, yearFraction, zonalPrecipitationMm } from "./eym-seasons.mjs";
import { DAY_MS, DAYS_PER_YEAR } from "./universal-time.mjs";

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

/** Mean surface wind by latitude (m/s east, m/s north): trades, westerlies, polar easterlies. */
export function backgroundWind(lat) {
  const a = Math.abs(lat), h = lat >= 0 ? 1 : -1;
  const east = a < 30 ? -6 * Math.sin(Math.PI * a / 30) - 1 : a < 60 ? 8 * Math.sin(Math.PI * (a - 30) / 30) : -3 * Math.sin(Math.PI * (a - 60) / 30);
  const north = a < 30 ? -h * 2.5 * Math.sin(Math.PI * a / 30) : a < 60 ? h * 1 * Math.sin(Math.PI * (a - 30) / 30) : -h * 0.8 * Math.sin(Math.PI * (a - 60) / 30);
  return { east, north };
}

/** Mean sea-level pressure by latitude (hPa): equatorial trough, subtropical highs, subpolar lows. */
export function backgroundPressure(lat) {
  const a = Math.abs(lat);
  return 1013 - 3 * Math.exp(-((a / 10) ** 2)) + 8 * Math.exp(-(((a - 32) / 9) ** 2)) - 7 * Math.exp(-(((a - 62) / 9) ** 2)) + 4 * Math.exp(-(((a - 90) / 10) ** 2));
}


// ---------------------------------------------------------------- weather systems

const POPULATIONS = Object.freeze([
  { kind: "low", band: [27, 70], perDay: 1.9, life: [72, 150], amp: [-10, -30], radiusKm: [650, 1200], eastMs: [8, 15], polewardMs: [0.4, 1.6] },
  { kind: "high", band: [24, 52], perDay: 1.2, life: [96, 200], amp: [5, 14], radiusKm: [1100, 1800], eastMs: [2, 7], polewardMs: [-0.6, 0.2] },
  { kind: "wave", band: [3, 30], perDay: 1.3, life: [72, 150], amp: [-2, -5], radiusKm: [450, 850], eastMs: [-8, -4.5], polewardMs: [-0.1, 0.4] },
  { kind: "tropical", band: [6, 18], perDay: 0.2, life: [130, 280], amp: [-14, -80], radiusKm: [280, 520], eastMs: [-6, -3.5], polewardMs: [1.0, 2.2] },
]);
const MAX_LIFE_HOURS = Math.max(...POPULATIONS.map((p) => p.life[1]));
const TROPICAL_GENESIS_SST_C = 24.5;

/** Every system born in a six-hour slot, for one population and hemisphere. */
function slotSystems(population, hemisphere, slot, isOcean) {
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
      const sst = seasonalTemperature({ annualMeanC: annualMeanTemperatureC(lat0), latDeg: lat0, ocean: true, timeMs: born * HOUR_MS }).dayMeanC;
      const f = (yearFraction(born * HOUR_MS) + (hemisphere > 0 ? 0 : 0.5)) % 1, inSeason = f > 0.22 && f < 0.7 && r() < Math.sin(Math.PI * (f - 0.22) / 0.48) ** 0.5 * 1.15;
      if (sst < TROPICAL_GENESIS_SST_C || !isOcean(lat0, lon0) || !inSeason) continue;
    }
    out.push(system);
  }
  return out;
}

/** All systems alive at some point in [fromHour, toHour] (hours since the timeline's zero). */
export function systemsBetween(fromHour, toHour, isOcean = () => true) {
  const systems = [];
  for (let slot = Math.floor((fromHour - MAX_LIFE_HOURS) / SLOT_HOURS); slot <= Math.floor(toHour / SLOT_HOURS); slot += 1) {
    for (const population of POPULATIONS) for (const hemisphere of [1, -1]) for (const s of slotSystems(population, hemisphere, slot, isOcean)) if (s.born + s.life >= fromHour && s.born <= toHour) systems.push(s);
  }
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
  const lat = clamp(system.lat0 + northKm / 111.2, -88, 88);
  const lon = ((system.lon0 + eastKm / (111.2 * Math.max(0.15, Math.cos(((system.lat0 + lat) / 2) * DEG))) + 540) % 360) - 180;
  if (system.kind === "tropical" && Math.abs(lat) > 40) envelope *= 0.4; // transitions to an ordinary low
  let amp = system.amp * envelope;
  if (system.kind === "tropical") amp *= 1 - 0.7 * landFractionAt(lat, lon); // land starves it
  const p = lat * DEG, l = lon * DEG;
  return { id: system.id, kind: system.kind, hemisphere: system.hemisphere, lat, lon, amp, radiusKm: system.radiusKm, unit: [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)] };
}

/** Maximum sustained wind of a tropical cyclone from its central pressure deficit (m/s). */
export const tropicalMaxWindMs = (deficitHpa) => 3.45 * Math.abs(deficitHpa) ** 0.644;

// ---------------------------------------------------------------- the weather at one place and moment

/** Rainfall relative to the zonal climate, by biome (dry country gets less). */
export const BIOME_RAIN = Object.freeze({ "hot-desert": 0.25, "cold-desert": 0.3, steppe: 0.65, savanna: 0.75, tundra: 0.6, "ice-cap": 0.35, taiga: 0.9, "temperate-forest": 1, "seasonal-forest": 1, "temperate-rainforest": 1.4, "tropical-rainforest": 1.35 });
/** Normalization of the rain-producing lift by latitude (2.5° bands from 90°S), from calibrate-eym-weather. */
export const RAIN_NORMALIZATION = Object.freeze([
  62.74, 94.14, 40.29, 43.53, 19.79, 10.96, 7.27, 4.78, 4.04, 3.87, 3.87, 4.35, 4.88, 5.3, 6.16, 6.48, 7.1, 8.04,
  8.16, 9.16, 9.84, 10.21, 12.27, 14, 17.78, 28.54, 30.31, 35.02, 23.31, 13.66, 9.09, 5.63, 4.71, 4.46, 4.34, 4.88,
  5.25, 5.02, 5.33, 4.74, 4.44, 4.34, 4.38, 5.63, 8.33, 12.1, 18.1, 14.95, 12.66, 11.33, 9.61, 9.41, 8.7, 7.88,
  7.63, 6.85, 6.32, 5.93, 5.09, 4.79, 4.25, 3.86, 3.95, 4.13, 4.92, 7.37, 10.55, 19.73, 37.69, 37.89, 91.4, 57.15,
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
  let anomaly = 0, gx = 0, gy = 0, tcEast = 0, tcNorth = 0, tcRain = 0, nearestStorm = null;
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
    const g = s.amp * e * 2 * dKm / (s.radiusKm * s.radiusKm); // hPa per km, pointing toward the centre for highs
    gx += g * towardE; gy += g * towardN;
  }
  const pressureHpa = backgroundPressure(lat) + anomaly;
  // Geostrophic wind from the systems' pressure gradient, slowed and turned toward low pressure by friction.
  const sinLat = Math.sin(p), f = 2 * OMEGA * (Math.abs(sinLat) < 0.22 ? (sinLat >= 0 ? 0.22 : -0.22) : sinLat);
  let ge = -0.1 * gy / (1.2 * f), gn = 0.1 * gx / (1.2 * f);
  const gs = Math.hypot(ge, gn), cap = 38;
  if (gs > cap) { ge *= cap / gs; gn *= cap / gs; }
  const friction = land ? 0.6 : 0.8, turn = 20 * DEG * (sinLat >= 0 ? 1 : -1);
  const back = backgroundWind(lat);
  let windE = back.east + friction * (ge * Math.cos(turn) - gn * Math.sin(turn)) + tcEast * (land ? 0.75 : 1);
  let windN = back.north + friction * (ge * Math.sin(turn) + gn * Math.cos(turn)) + tcNorth * (land ? 0.75 : 1);
  const windMs = Math.hypot(windE, windN), windFromDeg = (Math.atan2(-windE, -windN) / DEG + 360) % 360;

  // Rising air makes cloud and rain: lows, the tropical rain belt, afternoon storms over land, and drifting showers.
  const drift = back.east * 3.6 * hour / (111.2 * Math.max(0.2, Math.cos(p)));
  const showers = noise3((lon - drift) / 4, lat / 4, hour / 9);
  const itcz = Math.exp(-(((lat - rainBeltLat(ctx.declinationDeg)) / 9) ** 2));
  const afternoon = land && Math.abs(lat) < 35 ? Math.max(0, Math.cos(2 * Math.PI * (ctx.solarHour - 15.5) / 24)) : 0;
  const lift = 0.12 - Math.min(anomaly, 30) / 11 + 0.85 * itcz + 0.4 * afternoon * (0.4 + itcz) + 0.6 * showers + tcRain;
  const wetness = cell ? (cell.ocean ? 1 : BIOME_RAIN[cell.biome] ?? 0.8) : 1;
  const baseCloud = cell?.ocean === false ? 0.15 + 0.3 * Math.min(1.2, wetness) : 0.42;
  const cloud = clamp(baseCloud + 0.55 * (lift - 0.1), 0, 1);
  const climateMmH = zonalPrecipitationMm(lat) * wetness / YEAR_HOURS;
  const precipMmH = Math.min(60, Math.max(0, lift - 0.3) ** 1.4 * rainNormalization(lat) * climateMmH);

  // Temperature: the season and the hour, warm or cold air carried in by the wind, damped by cloud and rain.
  const seasonal = seasonalTemperature({ annualMeanC: cell?.annualMeanC ?? annualMeanTemperatureC(lat), latDeg: lat, continentality: cell?.continentality ?? 0, ocean: !land, timeMs: ctx.timeMs, solarHour: ctx.solarHour });
  const poleward = windN * (lat >= 0 ? 1 : -1) - back.north * (lat >= 0 ? 1 : -1);
  const advection = clamp(0.32 * poleward, -9, 9) * Math.min(1, Math.abs(sinLat) * 1.6);
  const diurnal = (seasonal.nowC - seasonal.dayMeanC) * (1 - 0.6 * cloud);
  const tempC = seasonal.dayMeanC + diurnal + advection - (precipMmH > 0.3 ? 1.5 : 0);
  const kind = precipMmH < 0.05 ? null : tempC < 0.5 ? "snow" : tempC < 2 ? "sleet" : "rain";
  const thunder = kind === "rain" && precipMmH > 3 && tempC > 16 && cloud > 0.8;
  const humidity = Math.round(clamp((cell?.ocean === false ? 35 + 35 * Math.min(1.2, wetness) : 78) + 22 * (cloud - 0.45) + (precipMmH > 0.1 ? 12 : 0), 12, 100));
  return { pressureHpa, windMs, windFromDeg, windE, windN, gustMs: windMs * (land ? 1.5 : 1.3), cloud, precipMmH, precipKind: kind, thunder, tempC, humidity, nearestStorm };
}

/** Words for one moment's weather. */
export function describeWeather(w) {
  const sky = w.cloud < 0.15 ? "clear" : w.cloud < 0.4 ? "a few clouds" : w.cloud < 0.7 ? "partly cloudy" : w.cloud < 0.9 ? "mostly cloudy" : "overcast";
  const amount = w.precipMmH < 0.5 ? "light" : w.precipMmH < 4 ? "moderate" : "heavy";
  const precip = w.precipKind ? `${amount} ${w.precipKind}${w.thunder ? " and thunderstorms" : ""}` : null;
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
  const systems = systemsBetween(nowHour - WINDOW_HOURS, nowHour + FORECAST_HOURS, isOcean);
  const steps = [];
  for (let hour = nowHour - WINDOW_HOURS; hour <= nowHour + FORECAST_HOURS; hour += STEP_HOURS) {
    const alive = []; for (const s of systems) { const at = systemAt(s, hour, landFraction); if (at) alive.push(at); }
    steps.push({ hour, timeMs: hour * HOUR_MS, systems: alive, declinationDeg: subsolar.latDeg, subsolarLonDeg: subsolar.lonDeg - 15 * (hour * HOUR_MS - timeMs) / HOUR_MS });
  }
  return { timeMs, nowHour, steps, nowIndex: WINDOW_HOURS / STEP_HOURS, field };
}

const solarHourAt = (lon, subsolarLonDeg) => ((12 + (lon - subsolarLonDeg) / 15) % 24 + 24) % 24;

/** The weather at a place at the state's moment (systems placed at the exact time). */
export function placeWeatherNow(state, lat, lon, { subsolar, timeMs } = {}) {
  const cell = state.field?.cellAt(lat, lon) ?? null, t = timeMs ?? state.timeMs;
  const landFraction = (a, b) => (state.field ? (state.field.cellAt(a, b).ocean ? 0 : 1) : 0);
  // Place the systems alive now at the exact hour, between the 3-hour steps.
  const exactHour = t / HOUR_MS, systems = [];
  for (const s of systemsBetween(exactHour, exactHour, (a, b) => (state.field ? state.field.cellAt(a, b).ocean : true))) { const at = systemAt(s, exactHour, landFraction); if (at) systems.push(at); }
  const sub = subsolar ?? { latDeg: state.steps[state.nowIndex].declinationDeg, lonDeg: state.steps[state.nowIndex].subsolarLonDeg };
  return weatherAt(systems, lat, lon, { cell, declinationDeg: sub.latDeg, solarHour: solarHourAt(lon, sub.lonDeg), timeMs: t });
}

/**
 * What has built up at a place over the last week, and the outlook for the next day: rain and snow
 * totals, snow depth, ground wetness and flooding, pressure tendency.
 */
export function placeHistory(state, lat, lon) {
  const cell = state.field?.cellAt(lat, lon) ?? null, land = cell ? !cell.ocean : false;
  const climateWet = cell ? clamp(zonalPrecipitationMm(lat) * (cell.ocean ? 1 : BIOME_RAIN[cell.biome] ?? 0.8) / 2000, 0.15, 0.9) : 0.5;
  const firstSeason = seasonalTemperature({ annualMeanC: cell?.annualMeanC ?? annualMeanTemperatureC(lat), latDeg: lat, continentality: cell?.continentality ?? 0, ocean: !land, timeMs: state.steps[0].timeMs });
  let snowCm = land && firstSeason.dayMeanC < -1 ? clamp(-firstSeason.dayMeanC * 7, 4, 150) : 0;
  const capacity = 100; let water = capacity * climateWet;
  let rain7 = 0, snow7 = 0, rain24 = 0, maxWind7 = 0, flooding = false;
  const hours = [];
  for (let i = 0; i < state.steps.length; i += 1) {
    const step = state.steps[i];
    const w = weatherAt(step.systems, lat, lon, { cell, declinationDeg: step.declinationDeg, solarHour: solarHourAt(lon, step.subsolarLonDeg), timeMs: step.timeMs });
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
    const w = weatherAt(step.systems, lat, lon, { cell, declinationDeg: step.declinationDeg, solarHour: solarHourAt(lon, step.subsolarLonDeg), timeMs: step.timeMs });
    cells.push({ lat, lon, cloud: w.cloud, precipMmH: w.precipMmH, precipKind: w.precipKind, thunder: w.thunder, windMs: w.windMs, windE: w.windE, windN: w.windN });
  }
  const centres = step.systems.filter((s) => s.kind !== "tropical" && Math.abs(s.amp) >= 6).map((s) => ({ lat: s.lat, lon: s.lon, kind: s.amp < 0 ? "low" : "high", pressureHpa: Math.round(backgroundPressure(s.lat) + s.amp) }));
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
