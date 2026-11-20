// The sky as seen by someone standing on Eym. Pure functions: given a system model snapshot (positions
// and Eym's spin at one moment), the sky document (constellations.json) and the star catalogue, they
// return altitude/azimuth, apparent brightness and visibility for the Sun, the moons, the wandering
// stars and the fixed stars, plus twilight, moonlight and eclipse state.
//
// Frames: Eym's spin axis is the sky document's celestialPole (system frame). Longitude 0 is the prime
// meridian, which turns with Eym's sidereal spin (rotationState.primeMeridianAngleDeg, measured from the
// northward equinox). Longitude increases eastward, the direction of rotation.
import { cross, dot, normalize } from "./sky-frame.mjs";
import { AU_KM } from "./system-data.mjs";

const DEG = Math.PI / 180;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const vec = (p) => [p.x, p.y, p.z];
const angleDeg = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(normalize(a), normalize(b))))) / DEG;

export const SUN_MAGNITUDE = -26.74;
export const SUN_RADIUS_KM = 696_000;
export const EARTH_RADIUS_KM = 6371;
/** Naked-eye limit in full darkness: the catalogue's own limit. */
export const DARK_SKY_LIMIT = 5.6;
/** Limiting magnitude by the Sun's altitude: full daylight lets only very bright objects (Venus-like) through. */
const TWILIGHT_LIMITS = [[6, -4.2], [0, -3.5], [-6, 1.0], [-12, 3.5], [-18, DARK_SKY_LIMIT]];
/** Brightness classes of stars, by apparent magnitude (matches the system-view backdrop). */
const EXTINCTION_PER_AIRMASS = 0.2;

/** Eym's body-fixed axes in the system frame: z through the north pole, x through the prime meridian. */
export function bodyFrame(pole, sunPathPole, primeMeridianAngleDeg) {
  const z = normalize(pole);
  const equinox = normalize(cross(sunPathPole, z));
  const y0 = cross(z, equinox);
  const t = primeMeridianAngleDeg * DEG;
  const x = normalize(add(scale(equinox, Math.cos(t)), scale(y0, Math.sin(t))));
  return { x, y: cross(z, x), z };
}

/** Zenith, north and east unit vectors for an observer at latitude/longitude (degrees, east positive). */
export function observerFrame(body, latDeg, lonDeg) {
  const la = latDeg * DEG, lo = lonDeg * DEG;
  const zenith = normalize(add(add(scale(body.x, Math.cos(la) * Math.cos(lo)), scale(body.y, Math.cos(la) * Math.sin(lo))), scale(body.z, Math.sin(la))));
  const eastRaw = cross(body.z, zenith);
  const east = len(eastRaw) > 1e-9 ? normalize(eastRaw) : normalize(add(scale(body.x, -Math.sin(lo)), scale(body.y, Math.cos(lo))));
  return { zenith, east, north: cross(zenith, east) };
}

/** Altitude above the horizon and azimuth (0 = north, 90 = east) of a direction. */
export function altAz(direction, observer) {
  const d = normalize(direction);
  return {
    altDeg: Math.asin(Math.max(-1, Math.min(1, dot(d, observer.zenith)))) / DEG,
    azDeg: ((Math.atan2(dot(d, observer.east), dot(d, observer.north)) / DEG) + 360) % 360,
  };
}

/** Relative air mass (Kasten–Young), used for extinction near the horizon. */
export function airmass(altDeg) {
  if (altDeg <= 0) return 40;
  return 1 / (Math.sin(altDeg * DEG) + 0.50572 * (altDeg + 6.07995) ** -1.6364);
}

/** Limiting naked-eye magnitude from the Sun's altitude alone. */
export function twilightLimit(sunAltDeg) {
  if (sunAltDeg >= TWILIGHT_LIMITS[0][0]) return TWILIGHT_LIMITS[0][1];
  for (let i = 1; i < TWILIGHT_LIMITS.length; i += 1) {
    const [a1, m1] = TWILIGHT_LIMITS[i - 1], [a2, m2] = TWILIGHT_LIMITS[i];
    if (sunAltDeg >= a2) return m1 + (m2 - m1) * (a1 - sunAltDeg) / (a1 - a2);
  }
  return DARK_SKY_LIMIT;
}

export function twilightPhase(sunAltDeg) {
  if (sunAltDeg >= 0) return "day";
  if (sunAltDeg >= -6) return "civil twilight";
  if (sunAltDeg >= -12) return "nautical twilight";
  if (sunAltDeg >= -18) return "astronomical twilight";
  return "night";
}

/** Fraction of a disc of radius r1 covered by a disc of radius r2 whose centres are d apart. */
export function discCoverage(r1, r2, d) {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r2 - r1)) return r2 >= r1 ? 1 : (r2 * r2) / (r1 * r1);
  const a = r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1));
  const b = r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2));
  const c = 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
  return (a + b - c) / (Math.PI * r1 * r1);
}

/** Apparent magnitude of a sunlit sphere (Lambert phase law). Distances in AU, radius in km. */
export function reflectedMagnitude({ radiusKm, albedo, sunDistanceAu, observerDistanceAu, phaseAngleDeg }) {
  const h = 5 * Math.log10(1329 / (2 * radiusKm * Math.sqrt(albedo)));
  const p = phaseAngleDeg * DEG;
  const lambert = Math.max(1e-6, (Math.sin(p) + (Math.PI - p) * Math.cos(p)) / Math.PI);
  return h + 5 * Math.log10(sunDistanceAu * observerDistanceAu) - 2.5 * Math.log10(lambert);
}

/**
 * Everything in the sky for one observer at the model's moment.
 * @param model   buildSystemModel snapshot (with orientations) at the time of interest
 * @param sky     data/stellar/constellations.json
 * @param starfield data/stellar/starfield.json
 */
export function groundSky({ model, sky, starfield, latDeg, lonDeg, planet = "Eym", moons = ["White Moon", "Red Moon"] }) {
  const home = model.byName.get(planet);
  const body = bodyFrame(sky.celestialPole, sky.sunPathPole, home.rotationState?.primeMeridianAngleDeg ?? 0);
  const observer = observerFrame(body, latDeg, lonDeg);
  const homeRadiusKm = EARTH_RADIUS_KM * (Number(home.radiusRe) || 1);
  const here = add(vec(home.physical), scale(observer.zenith, homeRadiusKm / AU_KM));
  const sunVector = sub([0, 0, 0], here), sunDistanceAu = len(sunVector);
  const sunDir = normalize(sunVector);
  const sunPos = altAz(sunDir, observer);
  const sunRadiusDeg = Math.asin(SUN_RADIUS_KM / (sunDistanceAu * AU_KM)) / DEG;

  // Moons (topocentric), with phase, bright-limb direction, solar-eclipse coverage and lunar-eclipse shading.
  const homeToSun = normalize(sub([0, 0, 0], vec(home.physical)));
  const moonList = moons.map((name) => {
    const m = model.byName.get(name);
    const position = vec(m.physical);
    const toMoon = sub(position, here), distanceAu = len(toMoon), dir = normalize(toMoon);
    const radiusKm = EARTH_RADIUS_KM * (Number(m.radiusRe) || 0);
    const phaseAngleDeg = angleDeg(sub([0, 0, 0], position), sub(here, position));
    const radiusDeg = Math.asin(radiusKm / (distanceAu * AU_KM)) / DEG;
    // Lunar eclipse: the moon's place relative to the planet's umbra and penumbra (geocentric geometry).
    const geoDistKm = len(sub(position, vec(home.physical))) * AU_KM;
    const parallax = Math.asin(homeRadiusKm / geoDistKm) / DEG, sunParallax = Math.asin(homeRadiusKm / (sunDistanceAu * AU_KM)) / DEG;
    const umbra = 1.02 * (parallax + sunParallax - sunRadiusDeg), penumbra = 1.02 * (parallax + sunParallax + sunRadiusDeg);
    const geoRadius = Math.asin(radiusKm / geoDistKm) / DEG;
    const fromAntisun = angleDeg(sub(position, vec(home.physical)), scale(homeToSun, -1));
    const umbralFraction = discCoverage(geoRadius, umbra, fromAntisun);
    const penumbralFraction = discCoverage(geoRadius, penumbra, fromAntisun);
    const illuminated = (1 + Math.cos(phaseAngleDeg * DEG)) / 2;
    let magnitude = reflectedMagnitude({ radiusKm, albedo: Number(m.geometric_albedo) || 0.12, sunDistanceAu: len(position), observerDistanceAu: distanceAu, phaseAngleDeg });
    magnitude += 10 * umbralFraction + 1.2 * Math.max(0, penumbralFraction - umbralFraction); // eclipsed moons dim sharply
    return {
      name, kind: "moon", dir, ...altAz(dir, observer), distanceKm: distanceAu * AU_KM, radiusDeg, phaseAngleDeg, illuminated,
      elongationDeg: angleDeg(dir, sunDir), brightLimb: normalize(sub(sunDir, scale(dir, dot(sunDir, dir)))),
      magnitude, umbralFraction, penumbralFraction,
      sunCoverage: discCoverage(sunRadiusDeg, radiusDeg, angleDeg(dir, sunDir)),
    };
  });
  const sunCoverage = Math.min(1, moonList.reduce((sum, m) => sum + m.sunCoverage, 0));

  // How dark the sky is: twilight, a solar eclipse's shadow, then moonlight.
  let limit = twilightLimit(sunPos.altDeg);
  if (sunPos.altDeg > -6 && sunCoverage > 0.9) limit = Math.max(limit, -3.5 + (sunCoverage - 0.9) / 0.1 * 5.5); // totality: bright stars appear
  const moonlight = moonList.reduce((sum, m) => sum + (m.altDeg > 0 ? (m.name === "White Moon" ? 1.6 : 0.8) * m.illuminated * (1 - m.umbralFraction) : 0), 0);
  const darkLimit = limit;
  if (limit > 1.5) limit = Math.max(1.5, limit - moonlight);
  const glareRadiusDeg = sunPos.altDeg > -6 && sunCoverage < 0.98 ? 12 : 0;

  const visible = (alt, magnitude, dir) => {
    if (alt <= 0) return false;
    if (glareRadiusDeg && angleDeg(dir, sunDir) < glareRadiusDeg) return false;
    return magnitude + EXTINCTION_PER_AIRMASS * (airmass(alt) - 1) <= limit;
  };
  for (const m of moonList) {
    m.apparentMagnitude = m.magnitude + EXTINCTION_PER_AIRMASS * (airmass(m.altDeg) - 1);
    // A moon shows by day like Earth's Moon when it is lit enough and clear of the Sun's glare.
    m.visible = m.altDeg > 0 && m.illuminated > 0.03 && (m.elongationDeg > 8 || sunCoverage > 0.5) && m.apparentMagnitude <= Math.max(limit, -3.5);
  }

  // The wandering stars.
  const planets = model.objects.filter((o) => o.parent === home.parent && o !== home && o.objectClass !== "star" && o.objectClass !== "barycenter").map((p) => {
    const position = vec(p.physical), toPlanet = sub(position, here), distanceAu = len(toPlanet), dir = normalize(toPlanet);
    const magnitude = reflectedMagnitude({ radiusKm: EARTH_RADIUS_KM * (Number(p.radiusRe) || 1), albedo: Number(p.geometric_albedo) || 0.3, sunDistanceAu: len(position), observerDistanceAu: distanceAu, phaseAngleDeg: angleDeg(sub([0, 0, 0], position), sub(here, position)) });
    const pos = altAz(dir, observer);
    return { name: p.name, kind: "planet", dir, ...pos, magnitude, elongationDeg: angleDeg(dir, sunDir), visible: visible(pos.altDeg, magnitude, dir) };
  });

  // The fixed stars (stars are effectively infinitely far; parallax is negligible).
  const stars = starfield.stars.map((row, index) => {
    const dir = row.slice(0, 3), pos = altAz(dir, observer);
    return { index, dir, ...pos, magnitude: row[3], visible: visible(pos.altDeg, row[3], dir) };
  });

  return {
    body, observer, latDeg, lonDeg,
    sun: { name: "Sun", kind: "sun", dir: sunDir, ...sunPos, radiusDeg: sunRadiusDeg, magnitude: SUN_MAGNITUDE, coverage: sunCoverage, visible: sunPos.altDeg > -sunRadiusDeg },
    twilight: twilightPhase(sunPos.altDeg), limitingMagnitude: limit, darkLimitingMagnitude: darkLimit, moonlight,
    galacticBandVisible: limit >= 4,
    moons: moonList, planets, stars,
    project: (direction) => altAz(direction, observer),
  };
}

/**
 * Local apparent solar time (hours, 0–24): 12 + the Sun's hour angle, measured westward around the
 * celestial equator from the observer's meridian. Noon is when the Sun crosses the meridian.
 */
export function localSolarHours(snapshot) {
  const p = snapshot.body.z, projectToEquator = (v) => normalize(sub(v, scale(p, dot(v, p))));
  const meridian = projectToEquator(snapshot.observer.zenith), east = cross(p, meridian);
  const sun = projectToEquator(snapshot.sun.dir);
  const hourAngleDeg = Math.atan2(-dot(sun, east), dot(sun, meridian)) / DEG;
  return (12 + hourAngleDeg / 15 + 24) % 24;
}
