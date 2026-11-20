// Eym's magnetic field and its auroras (Stage 6; canon: docs/eym-canon.md, "Eym's magnetic field").
//
// The field is a dipole whose axis leans about 10° from the spin axis. Its north pole (where a compass's north end
// points) wanders slowly round a long, narrow loop inside a box of open sea north of 79° N; the south pole is its
// antipode. From the pole follow, for any place and date: the magnetic latitude, the compass's declination (how
// far east of true north it points), the needle's dip and the field's strength.
//
// Auroras come only around the two magnetic poles: an oval that widens toward the equator as the sun's storms
// grow. How active the night is comes by rule from the date (no randomness: the same date gives the same sky).
// A great storm, a few times a century, is seen far from the poles, but never within 20° of the magnetic equator,
// and no coast of Caren or Garyk lies beyond 12° in the campaign's era: neither sees an aurora then.
//
// The loop and its box are the campaign era's (`campaignEraYears` either side of the calendar's start). Over longer
// spans the pole wanders naturally, as Earth's does, and nothing holds it to the box: `poleBoxAt` says which holds,
// and the history engine is to draw its own slow wander outside the era.
//
// Everything here is pure: no clock, no data files. The dials are in scripts/eym-world-inputs.mjs (`magnetic`).

import { DAY_MS, DAYS_PER_YEAR, NORTHWARD_EQUINOX_MS } from "./universal-time.mjs";
import { WORLD_INPUTS } from "./eym-world-inputs.mjs";

export const EYM_MAGNETIC_MODEL = "eym-magnetic-v1";
export const MAGNETIC = WORLD_INPUTS.magnetic;

const DEG = Math.PI / 180, R_KM = 6371, YEAR_MS = DAYS_PER_YEAR * DAY_MS;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const unit = (latDeg, lonDeg) => [Math.cos(latDeg * DEG) * Math.cos(lonDeg * DEG), Math.cos(latDeg * DEG) * Math.sin(lonDeg * DEG), Math.sin(latDeg * DEG)];
const hashUnit = (n) => { let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

// ---------------------------------------------------------------- the pole

/** The north magnetic pole a given way round its loop (degrees): { lat, lon }. */
export function poleOnLoop(angleDeg, dials = MAGNETIC) {
  const { latDeg, lonDeg } = dials.poleBox, a = angleDeg * DEG, half = dials.loop.fill / 2;
  return { lat: (latDeg[0] + latDeg[1]) / 2 + (latDeg[1] - latDeg[0]) * half * Math.sin(a), lon: (lonDeg[0] + lonDeg[1]) / 2 + (lonDeg[1] - lonDeg[0]) * half * Math.cos(a) };
}
/** How far round its loop the pole is at a date (degrees, 0 to 360). */
export function loopAngleDeg(timeMs, dials = MAGNETIC) {
  const turns = (timeMs - NORTHWARD_EQUINOX_MS) / (dials.loop.years * YEAR_MS) + dials.loop.phaseDeg / 360;
  return ((turns % 1) + 1) % 1 * 360;
}
/** The box the pole keeps to at a date, or null outside the campaign's era, when it wanders freely (canon of 20 November 2026). */
export const poleBoxAt = (timeMs, dials = MAGNETIC) => (Math.abs(timeMs - NORTHWARD_EQUINOX_MS) <= dials.campaignEraYears * YEAR_MS ? dials.poleBox : null);
/** The north magnetic pole at a date in the campaign's era: { lat, lon }. The south magnetic pole is its antipode. */
export const magneticPole = (timeMs, dials = MAGNETIC) => poleOnLoop(loopAngleDeg(timeMs, dials), dials);
/** The antipode of a place. */
export const antipode = ({ lat, lon }) => ({ lat: -lat, lon: lon > 0 ? lon - 180 : lon + 180 });
/** Great-circle distance, km. */
export function greatCircleKm(lat1, lon1, lat2, lon2) {
  const a = unit(lat1, lon1), b = unit(lat2, lon2);
  return R_KM * Math.acos(clamp(a[0] * b[0] + a[1] * b[1] + a[2] * b[2], -1, 1));
}
/** How fast the pole moves at a point of its loop, km a year. */
export function driftKmPerYear(angleDeg, dials = MAGNETIC) {
  const step = 0.05, a = poleOnLoop(angleDeg - step, dials), b = poleOnLoop(angleDeg + step, dials);
  return greatCircleKm(a.lat, a.lon, b.lat, b.lon) / (2 * step / 360 * dials.loop.years);
}

// ---------------------------------------------------------------- the field at a place

/**
 * The field at a place for a given north magnetic pole:
 *   magneticLatDeg   north of the magnetic equator (negative south of it);
 *   declinationDeg   how far east (+) or west (−) of true north a compass points, −180 to 180;
 *   dipDeg           how far the needle's north end dips below level (negative: it rises), tan dip = 2 tan latitude;
 *   microtesla       the field's strength.
 */
export function fieldAt(lat, lon, pole, dials = MAGNETIC) {
  const p = unit(lat, lon), m = unit(pole.lat, pole.lon), s = clamp(p[0] * m[0] + p[1] * m[1] + p[2] * m[2], -1, 1);
  const magneticLatDeg = Math.asin(s) / DEG, dLon = (pole.lon - lon) * DEG;
  const y = Math.sin(dLon) * Math.cos(pole.lat * DEG), x = Math.cos(lat * DEG) * Math.sin(pole.lat * DEG) - Math.sin(lat * DEG) * Math.cos(pole.lat * DEG) * Math.cos(dLon);
  return { magneticLatDeg, declinationDeg: Math.atan2(y, x) / DEG, dipDeg: Math.atan(2 * Math.tan(magneticLatDeg * DEG)) / DEG, microtesla: dials.equatorMicrotesla * Math.sqrt(1 + 3 * s * s) };
}
/** The field at a place and date (see fieldAt), with the pole it was worked from. */
export function magneticAt(lat, lon, timeMs, dials = MAGNETIC) { const pole = magneticPole(timeMs, dials); return { ...fieldAt(lat, lon, pole, dials), pole }; }

// ---------------------------------------------------------------- auroras

export const ACTIVITY_NAMES = Object.freeze(["quiet", "quiet", "quiet", "unsettled", "active", "a minor storm", "a moderate storm", "a strong storm", "a severe storm", "a severe storm", "a great storm"]);

/**
 * How disturbed the field is at a date: { level 0..10, name, great, reachDeg }. One level holds for a night (a
 * day of the calendar) with a small change every three hours. Most nights are quiet; storms come oftener near
 * the top of the sun's cycle; a great storm (level 10) comes a few times a century and lasts one to three days.
 * `reachDeg` is the lowest magnetic latitude a great storm is seen from (null otherwise).
 */
export function auroraActivity(timeMs, dials = MAGNETIC) {
  const a = dials.aurora, day = Math.floor((timeMs - NORTHWARD_EQUINOX_MS) / DAY_MS), block = Math.floor(((timeMs - NORTHWARD_EQUINOX_MS) / DAY_MS - day) * 8);
  const cycle = 0.5 - 0.5 * Math.cos(2 * Math.PI * (timeMs - NORTHWARD_EQUINOX_MS) / (a.cycleYears * YEAR_MS));
  // A great storm begins on a few days a century and holds for one to three days.
  const chance = a.greatStormsPerCentury / (100 * DAYS_PER_YEAR);
  for (let back = 0; back < 3; back += 1) {
    const d = day - back, u = hashUnit(d * 7919 + 13);
    if (u < chance * (0.4 + 1.2 * cycle) && back < 1 + Math.floor(hashUnit(d * 31 + 5) * 3)) {
      const reachDeg = a.greatStormDeg[0] + (a.greatStormDeg[1] - a.greatStormDeg[0]) * hashUnit(d * 131 + 71);
      return { level: 10, name: ACTIVITY_NAMES[10], great: true, reachDeg };
    }
  }
  // Otherwise the night's level: most nights quiet, each level about half as common as the one below it (as on
  // Earth; about one night in twenty is a storm), the storm tail fatter near the cycle's top.
  const u = hashUnit(day * 2654435761 + 97), nightly = -Math.log(1 - u * 0.9999) * (1.2 + 0.6 * cycle), jitter = (hashUnit(day * 8 + block + 1000003) - 0.5) * 1.2;
  const level = clamp(Math.round(nightly + jitter), 0, 9);
  return { level, name: ACTIVITY_NAMES[level], great: false, reachDeg: null };
}

/** Where the aurora stands for an activity: the magnetic latitudes of the oval's two edges and the lowest latitude it is seen from. */
export function auroraOval(activity, dials = MAGNETIC) {
  const a = dials.aurora;
  if (activity.great) { const seenFromDeg = Math.max(a.greatStormDeg[0], activity.reachDeg ?? a.greatStormDeg[1]); return { equatorwardDeg: seenFromDeg + a.greatHorizonDeg, polewardDeg: a.ovalDeg[1] - 10, seenFromDeg }; }
  const equatorwardDeg = a.ovalDeg[0] - a.edgePerLevelDeg * activity.level;
  return { equatorwardDeg, polewardDeg: a.ovalDeg[1] - 0.5 * a.edgePerLevelDeg * activity.level, seenFromDeg: equatorwardDeg - a.horizonDeg };
}
/** The lowest magnetic latitude any aurora is ever seen from. */
export const auroraNeverBelowDeg = (dials = MAGNETIC) => dials.aurora.greatStormDeg[0];
/** Whether a place at this magnetic latitude can ever see an aurora, however great the storm. */
export const auroraEverSeen = (magneticLatDeg, dials = MAGNETIC) => Math.abs(magneticLatDeg) >= auroraNeverBelowDeg(dials);

/**
 * The aurora at a place and date, if the sky were dark and clear (the caller knows the Sun and the cloud):
 *   seen            "none", "glow" (low toward the pole), "arc" (well up the sky) or "overhead";
 *   strength        0..1, how bright;
 *   towardDeg       the compass bearing (true) of the nearer magnetic pole, where the aurora stands;
 *   offsetDeg       how many degrees of magnetic latitude the oval's middle lies poleward of the place (negative:
 *                   the place is poleward of it, and the aurora stands toward the equator);
 *   widthDeg        the oval's width; plus the activity, the oval and the place's magnetic latitude.
 */
export function auroraAt(lat, lon, timeMs, dials = MAGNETIC) {
  const field = magneticAt(lat, lon, timeMs, dials), activity = auroraActivity(timeMs, dials), oval = auroraOval(activity, dials);
  const north = field.magneticLatDeg >= 0, mag = Math.abs(field.magneticLatDeg), towardDeg = north ? field.declinationDeg : ((field.declinationDeg + 360) % 360) - 180;
  const middle = (oval.equatorwardDeg + oval.polewardDeg) / 2, widthDeg = oval.polewardDeg - oval.equatorwardDeg, offsetDeg = middle - mag;
  const polar = mag > oval.polewardDeg + dials.aurora.horizonDeg; // inside the oval's ring, too far in to see it
  const seen = mag < oval.seenFromDeg || polar ? "none" : mag < oval.equatorwardDeg - 2 ? "glow" : mag < oval.equatorwardDeg || mag > oval.polewardDeg ? "arc" : "overhead";
  const strength = seen === "none" ? 0 : clamp(0.3 + 0.07 * activity.level, 0, 1);
  // (`phase` moves the curtains: it steps every ten minutes.)
  return { seen, strength, towardDeg, offsetDeg, widthDeg, phase: Math.floor((timeMs - NORTHWARD_EQUINOX_MS) / 600e3) % 100000, hemisphere: north ? "north" : "south", magneticLatDeg: field.magneticLatDeg, activity, oval, great: activity.great };
}

/** A line for the sky's panel: what the aurora is doing, in words (given how dark and how cloudy it is). */
export function describeAurora(aurora, { sunAltDeg = -90, cloud = 0 } = {}) {
  if (!auroraEverSeen(aurora.magneticLatDeg)) return "never seen here";
  if (aurora.seen === "none") return Math.abs(aurora.magneticLatDeg) > aurora.oval.polewardDeg ? `none tonight (${aurora.activity.name}: it has moved away toward the equator)` : `none tonight (${aurora.activity.name === "quiet" ? "a quiet night" : aurora.activity.name})`;
  const where = aurora.seen === "overhead" ? "overhead" : aurora.seen === "arc" ? `an arc to the ${compassWord(aurora.offsetDeg >= 0 ? aurora.towardDeg : aurora.towardDeg + 180)}` : `a glow low in the ${compassWord(aurora.offsetDeg >= 0 ? aurora.towardDeg : aurora.towardDeg + 180)}`;
  const hidden = sunAltDeg > -9 ? " (lost in daylight)" : cloud > 0.8 ? " (behind cloud)" : "";
  return `${where}, ${aurora.activity.name}${hidden}`;
}
const compassWord = (bearing) => ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round((((bearing % 360) + 360) % 360) / 45) % 8];
