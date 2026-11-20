// Day, night and the seasons on Eym. Pure functions over the system model (where Mitkear is), the
// calendar (when the March equinox falls) and Eym's cartography raster (land, sea and height). They
// give the point where Mitkear stands overhead, sunrise and sunset anywhere, the season, a seasonal
// and daily temperature, the outline of night and twilight on the globe, and seasonal snow and sea ice.

import { bodyFrame, twilightPhase } from "./ground-sky.mjs";
import { normalize } from "./sky-frame.mjs";
import { polygonize } from "./cartography-regions.mjs";
import { DAY_MS, DAYS_PER_YEAR, NORTHWARD_EQUINOX_MS } from "./universal-time.mjs";
import { elevationGrid } from "./cartography-asset.mjs";
import { hasClimate, sstAnomalyAt } from "./eym-climate.mjs";
import { WORLD_INPUTS } from "./eym-world-inputs.mjs";

const SWING = WORLD_INPUTS.weather.continentality;

const DEG = Math.PI / 180;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const YEAR_MS = DAYS_PER_YEAR * DAY_MS;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** Sun altitudes that bound day, civil, nautical and astronomical twilight (degrees). */
export const TWILIGHT_STEPS = Object.freeze([0, -6, -12, -18]);
/** The Sun's centre is this far below the horizon at sunrise and sunset (refraction and half the disc). */
const SUNRISE_ALTITUDE_DEG = -0.833;

// ---------------------------------------------------------------- climate

/** Annual mean sea-level temperature (°C) on an Earth-like, mostly ocean world. */
export function seaLevelTemperatureC(lat) { const s2 = Math.sin(lat * DEG) ** 2; return 27.5 - 30 * s2 - 10 * s2 * s2; }

/** Zonal annual precipitation (mm): wet equatorial belt, dry subtropics, wet mid-latitudes, dry poles. */
export function zonalPrecipitationMm(lat) {
  const a = Math.abs(lat);
  const p = 700 + 1500 * Math.exp(-(((lat - 4) / 11) ** 2)) + 550 * Math.exp(-(((a - 48) / 13) ** 2)) - 300 * Math.exp(-(((a - 27) / 7) ** 2));
  const polar = a > 60 ? 1 - 0.6 * Math.min(1, (a - 60) / 25) : 1;
  return Math.max(150, p * polar);
}

/** Annual mean temperature at a height (lapse rate 6.5 °C per km). */
export function annualMeanTemperatureC(latDeg, elevationM = 0) { return seaLevelTemperatureC(latDeg) - Math.max(0, elevationM) * 0.0065; }

/** Fraction of the year since the March equinox (0 = March equinox, 0.25 = June solstice). */
export function yearFraction(timeMs) { return ((((timeMs - NORTHWARD_EQUINOX_MS) / YEAR_MS) % 1) + 1) % 1; }

/**
 * Temperature over the year and the day. The seasonal swing grows with latitude and with distance
 * from the sea; the warmest days lag the solstice by about a month (more at sea). The day is warmest
 * at 15:00 sun time.
 * The land's yearly swing is Earth-like (the `weather.continentality` dials: small on a coast, large deep inside
 * a continent); the daily range on land is narrow. `anomalyC` is what the ocean currents add (scripts/eym-climate.mjs).
 * @param continentality 0 on the coast or at sea, 1 deep inland
 */
export function seasonalTemperature({ annualMeanC, latDeg, continentality = 0, ocean = false, timeMs, solarHour = 15, anomalyC = 0 }) {
  const lagYears = (ocean ? 45 : 40 - 15 * continentality) / DAYS_PER_YEAR;
  const peak = (latDeg >= 0 ? 0.25 : 0.75) + lagYears;
  // At sea the swing stays small except near the poles, where the ice comes and goes.
  const sinLat = Math.abs(Math.sin(latDeg * DEG));
  const swing = sinLat * (ocean ? 2 + 7 * sinLat * sinLat : SWING.coastC + SWING.inlandC * continentality);
  const dayMeanC = annualMeanC + anomalyC + swing * Math.cos(2 * Math.PI * (yearFraction(timeMs) - peak));
  const daily = ocean ? 0.5 : 2 + 2 * continentality;
  return { dayMeanC, highC: dayMeanC + daily, lowC: dayMeanC - daily, nowC: dayMeanC + daily * Math.cos(2 * Math.PI * (solarHour - 15) / 24), swingC: swing };
}

// ---------------------------------------------------------------- the Sun

/** Where Mitkear stands overhead on Eym, and its declination, at the model's moment. */
export function subsolarPoint(model, sky, planet = "Eventide") {
  const home = model.byName.get(planet);
  const body = bodyFrame(sky.celestialPole, sky.sunPathPole, home.rotationState?.primeMeridianAngleDeg ?? 0);
  const sun = normalize([-home.physical.x, -home.physical.y, -home.physical.z]);
  const latDeg = Math.asin(clamp(dot(sun, body.z), -1, 1)) / DEG;
  const lonDeg = Math.atan2(dot(sun, body.y), dot(sun, body.x)) / DEG;
  return { latDeg, lonDeg, declinationDeg: latDeg };
}

/** Local sun time (hours, 0–24) at a longitude, given where the Sun is overhead. */
export function localSolarHour(lonDeg, subsolarLonDeg) { return ((12 + (lonDeg - subsolarLonDeg) / 15) % 24 + 24) % 24; }

/** Sun altitude (degrees) at a place, given where the Sun is overhead. */
export function sunAltitudeDeg(latDeg, lonDeg, subsolar) {
  const a = [Math.cos(latDeg * DEG) * Math.cos(lonDeg * DEG), Math.cos(latDeg * DEG) * Math.sin(lonDeg * DEG), Math.sin(latDeg * DEG)];
  const s = [Math.cos(subsolar.latDeg * DEG) * Math.cos(subsolar.lonDeg * DEG), Math.cos(subsolar.latDeg * DEG) * Math.sin(subsolar.lonDeg * DEG), Math.sin(subsolar.latDeg * DEG)];
  return Math.asin(clamp(dot(a, s), -1, 1)) / DEG;
}

/**
 * Hours (local sun time) when the Sun reaches an altitude, rising and setting, at a latitude for a
 * declination. Returns { rise, set } or { always: "up" | "down" }.
 */
export function sunCrossing(latDeg, declinationDeg, altitudeDeg = SUNRISE_ALTITUDE_DEG) {
  const phi = latDeg * DEG, dec = declinationDeg * DEG;
  const cosH = (Math.sin(altitudeDeg * DEG) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec));
  if (cosH <= -1) return { always: "up" };
  if (cosH >= 1) return { always: "down" };
  const h = Math.acos(cosH) / DEG / 15;
  return { rise: 12 - h, set: 12 + h };
}

/** Sunrise, sunset, day length and civil twilight at a latitude for a declination (local sun time). */
export function sunTimes(latDeg, declinationDeg) {
  const sun = sunCrossing(latDeg, declinationDeg), civil = sunCrossing(latDeg, declinationDeg, -6);
  const dayLengthH = sun.always ? (sun.always === "up" ? 24 : 0) : sun.set - sun.rise;
  return { sunrise: sun.rise ?? null, sunset: sun.set ?? null, polar: sun.always ? (sun.always === "up" ? "midnight sun" : "polar night") : null, dayLengthH, civilDawn: civil.rise ?? null, civilDusk: civil.set ?? null };
}

// ---------------------------------------------------------------- seasons

/** Where the tropical rain belt lies: it follows the Sun, a few degrees north of the equator, but on a world of
 * so much sea it moves less than Earth's (0.4 of the Sun's declination, as the wind belts in the climate model). */
export const rainBeltLat = (declinationDeg) => 4 + 0.4 * declinationDeg;
/** The Sun's approximate declination from the date alone (for when no model snapshot is at hand). */
export const approximateDeclinationDeg = (timeMs) => 23.44 * Math.sin(2 * Math.PI * yearFraction(timeMs));

const THIRDS = ["early", "mid", "late"];

/**
 * The season at a latitude. Temperate and polar latitudes have four astronomical seasons (March
 * equinox to June solstice is northern spring, southern autumn). The tropics have wet and dry
 * seasons that follow the Sun: wet while it stands over that side of the equator.
 */
export function seasonAt(latDeg, timeMs, declinationDeg) {
  const f = yearFraction(timeMs), quarter = Math.floor(f * 4) % 4, part = THIRDS[Math.min(2, Math.floor((f * 4 - Math.floor(f * 4)) * 3))];
  const northern = ["spring", "summer", "autumn", "winter"][quarter], southern = ["autumn", "winter", "spring", "summer"][quarter];
  const temperate = `${part} ${latDeg >= 0 ? northern : southern}`;
  if (Math.abs(latDeg) >= 23.5) return { name: temperate, kind: "temperate", quarter };
  // In the tropics the rainy season is when the rain belt stands overhead.
  return { name: Math.abs(latDeg - rainBeltLat(declinationDeg)) < 10 ? "the wet season" : "the dry season", kind: "tropical", quarter };
}

// ---------------------------------------------------------------- the surface over the year

const fieldCache = new WeakMap();

function decodeBytes(base64) {
  if (typeof Buffer !== "undefined") return Uint8Array.from(Buffer.from(base64, "base64"));
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

/** Per-cell annual temperature and distance-from-sea for a schema-2 cartography asset (cached). */
export function environmentField(asset) {
  if (fieldCache.has(asset)) return fieldCache.get(asset);
  const { latCount, lonCount } = asset.grid, res = asset.resolutionDeg, n = latCount * lonCount;
  const ocean = decodeBytes(asset.raster.oceanMaskBase64), elevation = elevationGrid(asset);
  const biomes = { categories: asset.raster.biome.categories, values: decodeBytes(asset.raster.biome.valuesBase64) };
  const distKm = new Float32Array(n).fill(Infinity), queue = [];
  for (let i = 0; i < n; i += 1) if (ocean[i]) { distKm[i] = 0; queue.push(i); }
  for (let head = 0; head < queue.length; head += 1) {
    const i = queue[head], r = Math.floor(i / lonCount), c = i % lonCount, lat = -90 + res * (r + 0.5);
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const rr = r + dr; if (rr < 0 || rr >= latCount) continue;
      const j = rr * lonCount + ((c + dc + lonCount) % lonCount), step = 111.2 * res * (dc ? Math.cos(lat * DEG) : 1);
      if (distKm[i] + step < distKm[j]) { distKm[j] = distKm[i] + step; queue.push(j); }
    }
  }
  const cells = Array.from({ length: n }, (_, i) => {
    const latIndex = Math.floor(i / lonCount), lonIndex = i % lonCount, lat = -90 + res * (latIndex + 0.5);
    return { id: i, latIndex, lonIndex, lat, lon: -180 + res * (lonIndex + 0.5), ocean: Boolean(ocean[i]), elevationM: ocean[i] ? 0 : elevation[i], biome: biomes.categories[biomes.values[i]], annualMeanC: annualMeanTemperatureC(lat, ocean[i] ? 0 : elevation[i]), continentality: ocean[i] ? 0 : clamp(distKm[i] / 1200, 0, 1) };
  });
  const cellAt = (lat, lon) => cells[clamp(Math.floor((lat + 90) / res), 0, latCount - 1) * lonCount + ((Math.floor((lon + 180) / res) % lonCount) + lonCount) % lonCount];
  // The ocean currents' share (scripts/eym-climate.mjs): full at sea, fading inland (about 400 km).
  const climate = hasClimate(asset);
  const anomalyAt = (lat, lon, timeMs) => { if (!climate) return 0; const cell = cellAt(lat, lon); return sstAnomalyAt(asset, lat, lon, timeMs) * (cell.ocean ? 1 : Math.exp(-3 * cell.continentality)); };
  const sstC = (lat, lon, timeMs) => seasonalTemperature({ annualMeanC: annualMeanTemperatureC(lat), latDeg: lat, ocean: true, timeMs, anomalyC: climate ? sstAnomalyAt(asset, lat, lon, timeMs) : 0 }).dayMeanC;
  const field = { grid: { latCount, lonCount }, resolutionDeg: res, cells, cellAt, anomalyAt, sstC };
  fieldCache.set(asset, field);
  return field;
}

/** A longitude difference brought into −180…180 (rings may run across the date line). */
const wrap = (dl) => ((dl + 540) % 360) - 180;

/** Add points so no edge spans more than 2°: on the globe, long edges must follow the curve. */
function densify(ring, maxDeg = 2) {
  const out = [];
  for (let i = 0; i + 1 < ring.length; i += 1) {
    const [a, b] = [ring[i], ring[i + 1]], dl = wrap(b[1] - a[1]), steps = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(dl)) / maxDeg));
    for (let k = 0; k < steps; k += 1) out.push([a[0] + (b[0] - a[0]) * k / steps, a[1] + dl * k / steps]);
  }
  out.push(ring.at(-1));
  return out;
}

function smoothRing(ring) {
  // Rings that reach a pole run along it; smoothing would pull them across the date line.
  if (ring.some(([lat]) => Math.abs(lat) >= 89.5)) return ring;
  let points = ring.slice(0, -1);
  for (let pass = 0; pass < 2; pass += 1) points = points.flatMap((p, i) => { const q = points[(i + 1) % points.length], ql = p[1] + wrap(q[1] - p[1]); return [[p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + ql * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + ql * 0.75]]; });
  points = points.map(([a, b]) => [Math.round(a * 1000) / 1000, Math.round(b * 1000) / 1000]);
  return [...points, points[0]];
}

/** Smoothed outline rings ([lat, lon]) around a set of the field's cells. */
export function coverRings(field, cells) {
  return polygonize(cells.map((cell) => ({ ...cell, cover: "cover" })), "cover", field.resolutionDeg, field.grid).flatMap((region) => region.polygons.map((ring) => densify(smoothRing(ring))));
}

/**
 * Seasonal snow on land (day-mean temperature below −1 °C) and sea ice (sea surface below −1.8 °C),
 * as smoothed [lat, lon] rings, plus the share of land under snow.
 */
export function seasonalCover(field, timeMs) {
  const snowCells = [], iceCells = [];
  for (const cell of field.cells) {
    const t = seasonalTemperature({ annualMeanC: cell.annualMeanC, latDeg: cell.lat, continentality: cell.continentality, ocean: cell.ocean, timeMs, anomalyC: field.anomalyAt?.(cell.lat, cell.lon, timeMs) ?? 0 }).dayMeanC;
    if (cell.ocean ? t < -1.8 : t < -1) (cell.ocean ? iceCells : snowCells).push({ ...cell, cover: "cover" });
  }
  const rings = (cells) => coverRings(field, cells);
  const land = field.cells.filter((cell) => !cell.ocean).length;
  return { snow: rings(snowCells), ice: rings(iceCells), snowShare: land ? snowCells.length / land : 0, iceCells: iceCells.length };
}

// ---------------------------------------------------------------- a place, now

const clock = (hours) => { const m = Math.round(((hours % 24) + 24) % 24 * 60) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
const duration = (hours) => { const m = Math.round(hours * 60); return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} m`; };

/** Everything a GM wants to say about a place right now: sun, season, daylight and temperature. */
export function placeReport({ field, subsolar, latDeg, lonDeg, timeMs }) {
  const cell = field.cellAt(latDeg, lonDeg), hour = localSolarHour(lonDeg, subsolar.lonDeg), altitude = sunAltitudeDeg(latDeg, lonDeg, subsolar);
  const times = sunTimes(latDeg, subsolar.declinationDeg), season = seasonAt(latDeg, timeMs, subsolar.declinationDeg);
  const temperature = seasonalTemperature({ annualMeanC: cell.annualMeanC, latDeg, continentality: cell.continentality, ocean: cell.ocean, timeMs, solarHour: hour, anomalyC: field.anomalyAt?.(latDeg, lonDeg, timeMs) ?? 0 });
  const frozen = cell.ocean ? temperature.dayMeanC < -1.8 : temperature.dayMeanC < -1;
  return {
    localTime: `${clock(hour)} (sun time)`,
    sun: `${twilightPhase(altitude)}, ${Math.round(altitude)}°`,
    season: season.name,
    sunriseSunset: times.polar ?? `${clock(times.sunrise)} – ${clock(times.sunset)}`,
    dayLength: duration(times.dayLengthH),
    temperature: `${Math.round(temperature.nowC)} °C (high ${Math.round(temperature.highC)}, low ${Math.round(temperature.lowC)})`,
    ground: frozen ? (cell.ocean ? "sea ice" : "snow on the ground") : cell.ocean ? "open water" : "no snow",
    values: { hour, altitude, times, season, temperature, frozen },
  };
}

// ---------------------------------------------------------------- night on the globe

/**
 * Screen outline (SVG path) of the part of the visible globe where the Sun is more than `belowDeg`
 * below the horizon, for an orthographic view. `sun` is the subsolar direction already rotated into
 * screen space: { x, y } on screen (y down) and z toward the viewer, unit length.
 */
export function nightOutlinePath(sun, radius, center, belowDeg = 0, samples = 96) {
  const sx = Math.hypot(sun.x, sun.y), sz = sun.z, theta = Math.atan2(sun.y, sun.x), k = Math.sin(belowDeg * DEG), c = Math.cos(belowDeg * DEG);
  // Work in a frame where the Sun lies along +x on screen, then rotate back.
  const place = ([x, y]) => { const px = x * Math.cos(theta) - y * Math.sin(theta), py = x * Math.sin(theta) + y * Math.cos(theta); return `${(center[0] + px * radius).toFixed(1)} ${(center[1] + py * radius).toFixed(1)}`; };
  const inside = (x, y, z) => x * sx + z * sz < -k - 1e-9;
  // The small circle where the Sun is `belowDeg` down: centre −k·s, radius c, in the plane ⟂ s.
  const ring = Array.from({ length: samples }, (_, i) => {
    const t = i / samples * Math.PI * 2;
    return [-k * sx - c * sz * Math.sin(t), c * Math.cos(t), -k * sz + c * sx * Math.sin(t)];
  });
  const visible = ring.map((p) => p[2] > 1e-9);
  if (visible.every(Boolean)) return `M ${ring.map(place).join(" L ")} Z`;
  if (!visible.some(Boolean)) return inside(0, 0, 1) ? `M ${place([1, 0])} A ${radius} ${radius} 0 1 1 ${place([-1, 0])} A ${radius} ${radius} 0 1 1 ${place([1, 0])} Z` : "";
  // The visible arc of the small circle, in order, then back round the limb through the dark side.
  const start = visible.findIndex((v, i) => v && !visible[(i - 1 + samples) % samples]);
  const arc = []; for (let i = 0; i < samples && visible[(start + i) % samples]; i += 1) arc.push(ring[(start + i) % samples]);
  const limbAngle = (p) => Math.atan2(p[1], p[0]);
  const a0 = limbAngle(arc.at(-1)), a1 = limbAngle(arc[0]);
  let sweep = ((a1 - a0) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const mid = a0 + sweep / 2;
  if (!inside(Math.cos(mid), Math.sin(mid), 0)) sweep -= 2 * Math.PI; // go the other way round
  const limb = Array.from({ length: 24 }, (_, i) => { const a = a0 + sweep * (i + 1) / 25; return [Math.cos(a), Math.sin(a)]; });
  return `M ${[...arc, ...limb].map(place).join(" L ")} Z`;
}
