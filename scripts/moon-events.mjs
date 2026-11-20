// Moon phases, eclipses, occultations and tides as seen from Eym, computed from the same orbital model
// the map uses (Kepler orbits with precessing moon nodes and apsides). Pure functions; no Foundry APIs.
//
// Geometry is geocentric (from Eym's center) with Eym's radius allowed for through parallax, the
// standard way eclipse visibility is first decided. Events are found by stepping through time and
// refining crossings by bisection, so they are deterministic for a given registry.
import { orbitalStateAt } from "./astronomy.mjs";
import { AU_KM, buildSystemModel, orbitVector } from "./system-data.mjs";
import { DAY_MS } from "./universal-time.mjs";
import { cross, dot, normalize, orbitNormal } from "./sky-frame.mjs";

export const SUN_RADIUS_KM = 696_000;
export const EARTH_RADIUS_KM = 6371;
/** Earth's atmosphere enlarges its shadow by about 2%; Eym's atmosphere is Earth-like. */
export const SHADOW_ENLARGEMENT = 1.02;
/** Two moons count as full (or new) together when their exact phases fall within this many hours: the same night. */
export const DOUBLE_EVENT_WINDOW_HOURS = 12;
const HOUR_MS = DAY_MS / 24;
const DEG = 180 / Math.PI;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const angle = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (len(a) * len(b))))) * DEG;
const vec = (p) => [p.x, p.y, p.z];
const wrap180 = (deg) => ((deg + 540) % 360) - 180;

/** Positions (AU, system frame) of the star, the planet and its moons at any time. */
export function createEphemeris(rows, { system = "Mitkear", planet = "Eym", moons = ["White Moon", "Red Moon"] } = {}) {
  const model = buildSystemModel(rows, system);
  const planetObject = model.byName.get(planet);
  const moonObjects = moons.map((name) => model.byName.get(name));
  if (!planetObject || moonObjects.some((m) => !m)) throw new RangeError("Planet or moon missing from the registry");
  const place = (object, t) => {
    const state = orbitalStateAt(object, t);
    return vec(orbitVector(object, state.radiusAu, state.trueAnomalyDeg, t));
  };
  const normal = orbitNormal(planetObject.inclinationDeg);
  const e1 = normalize(cross(normal, [0, 0, 1]).some((v) => Math.abs(v) > 1e-9) ? cross(normal, [0, 0, 1]) : [1, 0, 0]);
  const e2 = cross(normal, e1);
  return {
    planet: planetObject,
    moons: moonObjects,
    planetRadiusKm: EARTH_RADIUS_KM * (planetObject.radiusRe || 1),
    /** Ecliptic longitude (degrees) of a direction, in the planet's orbital plane. */
    longitude: (d) => (Math.atan2(dot(d, e2), dot(d, e1)) * DEG + 360) % 360,
    at(t) {
      const planetPos = place(planetObject, t);
      return { planet: planetPos, moons: moonObjects.map((m) => { const local = place(m, t); return [planetPos[0] + local[0], planetPos[1] + local[1], planetPos[2] + local[2]]; }) };
    },
  };
}

/** Phase and eclipse geometry of each moon at time t, as seen from the planet's center. */
export function moonGeometry(eph, t) {
  const { planet, moons } = eph.at(t);
  const toSun = sub([0, 0, 0], planet), dSunKm = len(toSun) * AU_KM;
  const sunRadius = Math.asin(SUN_RADIUS_KM / dSunKm) * DEG;
  const sunParallax = Math.asin(eph.planetRadiusKm / dSunKm) * DEG;
  const sunLongitude = eph.longitude(toSun);
  return eph.moons.map((object, k) => {
    const toMoon = sub(moons[k], planet), dMoonKm = len(toMoon) * AU_KM;
    const phaseAngle = angle(sub([0, 0, 0], moons[k]), sub(planet, moons[k]));
    const moonRadiusKm = EARTH_RADIUS_KM * (object.radiusRe || 0);
    return {
      name: object.name,
      distanceKm: dMoonKm,
      elongationDeg: angle(toSun, toMoon),
      /** Longitude east of the Sun: 0 new, 90 first quarter, 180 full, 270 last quarter. */
      phaseLongitudeDeg: (eph.longitude(toMoon) - sunLongitude + 360) % 360,
      illuminated: (1 + Math.cos(phaseAngle / DEG)) / 2,
      apparentRadiusDeg: Math.asin(moonRadiusKm / dMoonKm) * DEG,
      topocentricRadiusDeg: Math.asin(moonRadiusKm / (dMoonKm - eph.planetRadiusKm)) * DEG,
      parallaxDeg: Math.asin(eph.planetRadiusKm / dMoonKm) * DEG,
      sunRadiusDeg: sunRadius,
      sunParallaxDeg: sunParallax,
      fromSunDeg: angle(toSun, toMoon),
      fromAntisunDeg: angle(sub(planet, [0, 0, 0]), toMoon),
      direction: normalize(toMoon),
      tidePull: (object.mass_me ? Number(object.mass_me) : 0) / 0.0123 * (384_400 / dMoonKm) ** 3,
      longitudeDeg: eph.longitude(toMoon),
    };
  });
}

/** Names a phase from the Sun–moon longitude difference. */
export function phaseName(phaseLongitudeDeg) {
  const p = ((phaseLongitudeDeg % 360) + 360) % 360;
  const names = ["New", "Waxing crescent", "First quarter", "Waxing gibbous", "Full", "Waning gibbous", "Last quarter", "Waning crescent"];
  return names[Math.round(p / 45) % 8];
}

function crossings(f, start, end, step, target) {
  const out = [];
  let t0 = start, v0 = wrap180(f(t0) - target);
  for (let t1 = start + step; t1 <= end; t1 += step) {
    const v1 = wrap180(f(t1) - target);
    if (v0 < 0 && v1 >= 0 && v1 - v0 < 180) {
      let a = t0, b = t1, va = v0;
      while (b - a > 30_000) { const m = (a + b) / 2, vm = wrap180(f(m) - target); if ((vm < 0) === (va < 0)) { a = m; va = vm; } else b = m; }
      out.push((a + b) / 2);
    }
    t0 = t1; v0 = v1;
  }
  return out;
}

function minimize(f, a, b, steps = 72) {
  let best = { t: a, v: f(a) };
  const step = (b - a) / steps;
  for (let t = a; t <= b; t += step) { const v = f(t); if (v < best.v) best = { t, v }; }
  let lo = Math.max(a, best.t - step), hi = Math.min(b, best.t + step);
  for (let i = 0; i < 40; i += 1) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (f(m1) < f(m2)) hi = m2; else lo = m1;
  }
  const t = (lo + hi) / 2;
  return { t, v: f(t) };
}

/** Classifies a solar eclipse by moon `k` at the moment of closest approach, or null if none. */
export function solarEclipseAt(eph, k, t) {
  const g = moonGeometry(eph, t)[k];
  const sep = g.fromSunDeg, limit = g.sunRadiusDeg + g.apparentRadiusDeg + g.parallaxDeg;
  if (sep >= limit) return null;
  const central = sep < g.parallaxDeg;
  const kind = !central ? "partial" : g.topocentricRadiusDeg > g.sunRadiusDeg ? "total" : "annular";
  return { kind, separationDeg: sep, moonToSunSize: g.topocentricRadiusDeg / g.sunRadiusDeg };
}

/** Classifies a lunar eclipse of moon `k` (the moon entering the planet's shadow), or null if none. */
export function lunarEclipseAt(eph, k, t) {
  const g = moonGeometry(eph, t)[k];
  const umbra = SHADOW_ENLARGEMENT * (g.parallaxDeg + g.sunParallaxDeg - g.sunRadiusDeg);
  const penumbra = SHADOW_ENLARGEMENT * (g.parallaxDeg + g.sunParallaxDeg + g.sunRadiusDeg);
  const sep = g.fromAntisunDeg, r = g.apparentRadiusDeg;
  const kind = sep <= umbra - r ? "total" : sep < umbra + r ? "partial" : sep < penumbra + r ? "penumbral" : null;
  return kind ? { kind, separationDeg: sep, umbraRadiusDeg: umbra } : null;
}

/** Combined tidal strength in units of Earth's lunar tide: |Σ T e^{2iλ}| over the Sun and both moons. */
export function tidalStrength(eph, t, sunTide = 0.441) {
  const geometry = moonGeometry(eph, t);
  const { planet } = eph.at(t);
  const sunLongitude = eph.longitude(sub([0, 0, 0], planet));
  const dSun = len(planet);
  let re = sunTide / dSun ** 3 * Math.cos(2 * sunLongitude / DEG), im = sunTide / dSun ** 3 * Math.sin(2 * sunLongitude / DEG);
  for (const g of geometry) { re += g.tidePull * Math.cos(2 * g.longitudeDeg / DEG); im += g.tidePull * Math.sin(2 * g.longitudeDeg / DEG); }
  return Math.hypot(re, im);
}

/** Every moon event between start and end (Eym ms), sorted by time. */
export function findMoonEvents(eph, startMs, endMs) {
  const events = [];
  const fullAndNew = eph.moons.map(() => ({ full: [], new: [] }));
  eph.moons.forEach((moon, k) => {
    const step = Math.max(HOUR_MS, Number(moon.orbital_period_days) * DAY_MS / 120);
    const phase = (t) => moonGeometry(eph, t)[k].phaseLongitudeDeg;
    for (const [target, type] of [[0, "new"], [90, "first-quarter"], [180, "full"], [270, "last-quarter"]]) {
      for (const t of crossings(phase, startMs, endMs, step, target)) {
        events.push({ type, moon: moon.name, timeMs: t });
        if (type === "full") fullAndNew[k].full.push(t);
        if (type === "new") fullAndNew[k].new.push(t);
        const window = 1.5 * DAY_MS;
        if (type === "new") {
          const closest = minimize((s) => moonGeometry(eph, s)[k].fromSunDeg, t - window, t + window);
          const eclipse = solarEclipseAt(eph, k, closest.t);
          if (eclipse) events.push({ type: "solar-eclipse", moon: moon.name, timeMs: closest.t, ...eclipse });
        }
        if (type === "full") {
          const closest = minimize((s) => moonGeometry(eph, s)[k].fromAntisunDeg, t - window, t + window);
          const eclipse = lunarEclipseAt(eph, k, closest.t);
          if (eclipse) events.push({ type: "lunar-eclipse", moon: moon.name, timeMs: closest.t, ...eclipse });
        }
      }
    }
  });
  if (eph.moons.length === 2) {
    const window = DOUBLE_EVENT_WINDOW_HOURS * HOUR_MS;
    for (const [kind, type] of [["full", "double-full"], ["new", "double-dark"]]) {
      for (const a of fullAndNew[0][kind]) for (const b of fullAndNew[1][kind]) {
        if (Math.abs(a - b) <= window) events.push({ type, timeMs: (a + b) / 2, offsetHours: Math.abs(a - b) / HOUR_MS });
      }
    }
    // The inner moon passing in front of the outer one, as seen from the planet.
    const relative = (t) => { const g = moonGeometry(eph, t); return (g[1].longitudeDeg - g[0].longitudeDeg + 360) % 360; };
    for (const t of crossings(relative, startMs, endMs, 6 * HOUR_MS, 0)) {
      const closest = minimize((s) => { const g = moonGeometry(eph, s); return Math.acos(Math.max(-1, Math.min(1, dot(g[0].direction, g[1].direction)))) * DEG; }, t - DAY_MS / 2, t + DAY_MS / 2);
      const g = moonGeometry(eph, closest.t);
      const reach = g[0].apparentRadiusDeg + g[1].apparentRadiusDeg + g[1].parallaxDeg;
      if (closest.v < reach) events.push({ type: "occultation", moon: eph.moons[1].name, occulted: eph.moons[0].name, timeMs: closest.t, separationDeg: closest.v });
    }
  }
  return events.sort((a, b) => a.timeMs - b.timeMs);
}
