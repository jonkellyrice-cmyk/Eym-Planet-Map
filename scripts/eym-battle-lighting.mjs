// Light and shadow for battle maps, worked out from where and when the map is: the sun's real height and
// bearing for the place and moment, the cloud, rain and fog, the season (and whether the place has
// seasons), and whether a layer is outdoors, indoors or underground. Shared by the Foundry module (for the
// painter's prompt and the request) and the map server (which draws it into the pixel art). Pure.

const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** The sun's altitude and azimuth (degrees; azimuth from north, clockwise) for a latitude, declination and hour angle. */
export function sunPosition(latDeg, declDeg, hourAngleDeg) {
  const p = latDeg * DEG, d = declDeg * DEG, H = hourAngleDeg * DEG;
  const altitude = Math.asin(clamp(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(H), -1, 1)) / DEG;
  const azimuth = (Math.atan2(-Math.cos(d) * Math.sin(H), Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.cos(H) * Math.sin(p)) / DEG + 360) % 360;
  return { altitude, azimuth };
}

/** Which season the trees show: spring, summer, autumn, winter, or tropical (no leaf fall within the tropics). */
export function foliageSeason(latDeg, yearFraction) {
  if (Math.abs(latDeg) < 23.5) return "tropical";
  const f = (((latDeg >= 0 ? yearFraction : yearFraction + 0.5) % 1) + 1) % 1; // 0 = spring equinox of this hemisphere
  return f < 0.25 ? "spring" : f < 0.5 ? "summer" : f < 0.75 ? "autumn" : "winter";
}

/** A tidy lighting description (defaults: a clear summer midday). */
export function normalizeLighting(l = {}) {
  const num = (v, d, lo, hi) => (Number.isFinite(v) ? clamp(v, lo, hi) : d);
  const latDeg = num(l.latDeg, 30, -90, 90), out = {
    latDeg, sunAltitudeDeg: num(l.sunAltitudeDeg, 55, -90, 90), sunAzimuthDeg: num(l.sunAzimuthDeg, latDeg >= 0 ? 180 : 0, 0, 360) % 360,
    cloud: num(l.cloud, 0.1, 0, 1), precipKind: ["rain", "sleet", "snow"].includes(l.precipKind) ? l.precipKind : null, precipMmH: num(l.precipMmH, 0, 0, 100),
    fog: Boolean(l.fog), thunder: Boolean(l.thunder), moonlight: num(l.moonlight, 0.5, 0, 1),
    season: ["spring", "summer", "autumn", "winter", "tropical"].includes(l.season) ? l.season : Number.isFinite(l.yearFraction) ? foliageSeason(latDeg, l.yearFraction) : Math.abs(latDeg) < 23.5 ? "tropical" : "summer",
  };
  return out;
}

/** Lighting from simple choices (the map server's page): time of day, season, weather, at a latitude. */
export function lightingFromInputs({ latDeg = 30, hour = 12, season = "summer", weather = "clear" } = {}) {
  const sign = latDeg >= 0 ? 1 : -1, decl = { spring: 0, summer: 23.44 * sign, autumn: 0, winter: -23.44 * sign, tropical: 0 }[season] ?? 0;
  const sun = sunPosition(latDeg, decl, (hour - 12) * 15);
  const w = { clear: { cloud: 0.05 }, "partly cloudy": { cloud: 0.45 }, overcast: { cloud: 0.95 }, rain: { cloud: 0.95, precipKind: "rain", precipMmH: 3 }, storm: { cloud: 1, precipKind: "rain", precipMmH: 12, thunder: true }, snow: { cloud: 0.9, precipKind: "snow", precipMmH: 2 }, fog: { cloud: 0.7, fog: true } }[weather] ?? { cloud: 0.1 };
  return normalizeLighting({ latDeg, sunAltitudeDeg: sun.altitude, sunAzimuthDeg: sun.azimuth, season, ...w });
}

const COMPASS = ["north", "north-north-east", "north-east", "east-north-east", "east", "east-south-east", "south-east", "south-south-east", "south", "south-south-west", "south-west", "west-south-west", "west", "west-north-west", "north-west", "north-north-west"];
export const compass = (az) => COMPASS[Math.round((((az % 360) + 360) % 360) / 22.5) % 16];

/**
 * What the light does, for drawing. Screen axes: x east, y south. Returns
 *   toSun [x, y]       unit vector on the map toward the sun (for lit sides of things);
 *   shadowPerFt [x, y] squares of shadow per foot of height, away from the sun;
 *   direct 0..1        strength of sunlight (sun height, cloud);
 *   ambient [r, g, b]  multiplier for everything (time of day, cloud, rain);
 *   saturation, fog 0..1, fogColor, wet, night, lightsOn, faceTone (south-facing walls, -1..1).
 */
export function lightModel(lighting, { underground = false, indoors = false } = {}) {
  const l = normalizeLighting(lighting), alt = l.sunAltitudeDeg, az = l.sunAzimuthDeg * DEG;
  const toSun = [Math.sin(az), -Math.cos(az)], up = clamp(alt / 12, 0, 1), cloudy = l.cloud;
  const tanAlt = Math.tan(Math.max(4, alt) * DEG), shadowLen = 1 / (5 * tanAlt), cap = 7 / 20; // at most 7 squares for a 20-ft object
  const shadowPerFt = [-toSun[0] * Math.min(shadowLen, cap), -toSun[1] * Math.min(shadowLen, cap)];
  let direct = up * (1 - 0.88 * cloudy) * (l.fog ? 0.5 : 1);
  // Colour of the light: golden when low, blue at twilight, dark blue at night; greyer under cloud.
  let ambient;
  if (alt >= 15) ambient = [1, 1, 0.98];
  else if (alt >= 3) { const t = (alt - 3) / 12; ambient = [1, 0.86 + 0.14 * t, 0.7 + 0.28 * t]; }
  else if (alt >= -6) { const t = (alt + 6) / 9; ambient = [0.55 + 0.4 * t, 0.55 + 0.28 * t, 0.75 - 0.05 * t]; }
  else if (alt >= -12) { const t = (alt + 12) / 6; ambient = [0.32 + 0.23 * t, 0.36 + 0.19 * t, 0.55 + 0.2 * t]; }
  else { const m = 0.22 + 0.16 * l.moonlight; ambient = [m * 0.8, m * 0.9, m * 1.35]; }
  const grey = cloudy * (alt > 0 ? 0.18 : 0.08) + (l.precipKind ? 0.08 : 0) + (l.thunder ? 0.12 : 0);
  ambient = ambient.map((c, k) => c * (1 - grey) * (k === 2 ? 1 : 0.985));
  if (underground) { ambient = [0.3, 0.29, 0.32]; direct = 0; }
  if (indoors) { ambient = alt > 0 ? ambient.map((c) => c * 0.82) : [0.42, 0.38, 0.4]; direct = 0; }
  const night = alt < -6 || underground, lightsOn = alt < 4 || underground || indoors;
  return {
    lighting: l, toSun, shadowPerFt, direct: clamp(direct, 0, 1), ambient, saturation: 1 - cloudy * 0.18 - (night ? 0.3 : 0) - (l.fog ? 0.2 : 0),
    fog: l.fog ? (alt > 0 ? 0.32 : 0.25) : 0, fogColor: alt > 0 ? [206, 210, 214] : [58, 64, 74], wet: l.precipKind === "rain" || l.precipKind === "sleet" || l.precipMmH > 0.5 && l.precipKind !== "snow",
    night, lightsOn, faceTone: clamp(toSun[1], -1, 1) * Math.max(0.25, direct), season: l.season, underground, indoors,
  };
}

/** The light in words, for the painter's prompt. */
export function lightingWords(lighting, { underground = false } = {}) {
  if (underground) return "Underground: no daylight; light comes only from glowing crystals, braziers, lava or lamps, warm pools of light in deep darkness.";
  const l = normalizeLighting(lighting), alt = l.sunAltitudeDeg, from = compass(l.sunAzimuthDeg), to = compass(l.sunAzimuthDeg + 180);
  const sky = l.fog ? "in fog" : l.cloud > 0.8 ? "under a heavy overcast" : l.cloud > 0.4 ? "under broken cloud" : "under a clear sky";
  if (alt < -12) return `Night ${sky}: dim blue moonlight, deep shadows, warm light spilling from windows, lanterns and fires.`;
  if (alt < -3) return `Twilight ${sky}: cool blue-violet light, no sun shadows, the first lamps lit.`;
  const len = alt < 12 ? "long" : alt < 35 ? "medium" : "short", tone = alt < 12 ? "low golden sunlight" : "sunlight";
  const shadows = l.cloud > 0.8 || l.fog ? "soft, faint shadows close under things" : `${len} shadows falling to the ${to}`;
  return `Light: ${tone} from the ${from} (the sun ${Math.round(alt)}° up) ${sky}, ${shadows}${l.precipKind === "rain" ? "; the ground wet and shining, with puddles" : ""}. Season: ${l.season === "tropical" ? "evergreen tropical foliage" : l.season === "autumn" ? "autumn colours in the leaves" : l.season === "winter" ? "bare winter branches on broadleaf trees" : l.season === "spring" ? "fresh spring green with blossom" : "full summer leaf"}.`;
}
