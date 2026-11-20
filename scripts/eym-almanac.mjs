// The almanac of Eym's sky: what the four wandering stars do, year by year (canon: docs/eym-canon.md, "The
// wanderers' resonant orbits and the Great Alignment").
//
// Two kinds of event, both worked out from the same Keplerian orbits the sky is drawn from (inclinations and
// eccentricities included; nothing is scripted):
//   - sky meetings: wanderers close together as seen from Eym (two within 1°, three within 3°, all four within
//     10°), each at least 20° from Mitkear so that they can be seen in a dark sky;
//   - true lines: worlds in one line with Mitkear in space. Bruthi, Eym and Esonth line up every four years (the
//     Esonth opposition line); every 68 years all five do (the Great Alignment), and halfway between, four do
//     with Esonth on the far side of Mitkear (the Lesser Alignment). The names are working names.
//
// Pure: the registry's rows in, events out.

import { orbitalStateAt } from "./astronomy.mjs";
import { buildSystemModel, vectorFromOrbit } from "./system-data.mjs";
import { DAY_MS, DAYS_PER_YEAR, makeUniversalTimeMs, universalTimeParts } from "./universal-time.mjs";

/** The registry's names: the system, the home world and its four wanderers (inmost first). */
export const ALMANAC_SYSTEM = "Abydos", ALMANAC_HOME = "Eventide", WANDERERS = Object.freeze(["Ramses", "Thraximundus", "Kandahar", "Tribune"]);
/** How close a meeting must be (degrees, by how many wanderers meet), and how far from Mitkear each must stand. */
export const MEETING_LIMIT_DEG = Object.freeze({ 2: 1, 3: 3, 4: 10 }), MEETING_MIN_ELONGATION_DEG = 20;
/** How nearly in line (degrees of longitude round Mitkear) worlds must be to count as a true line; and the far-side world of a Lesser Alignment. */
export const LINE_LIMIT_DEG = 0.5, LINE_FAR_SIDE_LIMIT_DEG = 1;
/** The years between Great Alignments, and the calendar day they fall on. */
export const GREAT_ALIGNMENT_YEARS = 68, ALIGNMENT_DAY = Object.freeze({ month: 3, day: 14 });
export const LINE_NAMES = Object.freeze({ great: "the Great Alignment", lesser: "the Lesser Alignment", opposition: "the Esonth opposition line" });

const DEG = Math.PI / 180;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const angle = (a, b) => Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) / DEG;
/** The arc (degrees) that holds a set of longitudes: 360 less the widest gap between neighbours. */
export function spreadDeg(longitudes) {
  const s = longitudes.map((v) => ((v % 360) + 360) % 360).sort((a, b) => a - b); let gap = 0;
  for (let i = 0; i < s.length; i += 1) gap = Math.max(gap, (i + 1 < s.length ? s[i + 1] : s[0] + 360) - s[i]);
  return 360 - gap;
}

/**
 * The worlds' places round Mitkear at any time: `at(timeMs)` gives { name: [x, y, z] } in AU for the home world
 * and the wanderers, exactly as the system model places them (scripts/system-data.mjs), without building the
 * whole model each time.
 */
export function wandererEphemeris(rows, { system = ALMANAC_SYSTEM, home = ALMANAC_HOME, wanderers = WANDERERS } = {}) {
  const model = buildSystemModel(rows, system), bodies = [home, ...wanderers].map((name) => { const o = model.byName.get(name); if (!o) throw new RangeError(`no such world: ${name}`); return o; });
  const at = (timeMs) => Object.fromEntries(bodies.map((o) => { const s = orbitalStateAt(o, timeMs), v = vectorFromOrbit(s.radiusAu, s.trueAnomalyDeg, o.inclinationDeg); return [o.name, [v.x, v.y, v.z]]; }));
  return { at, home, wanderers: [...wanderers], periodDays: Object.fromEntries(bodies.map((o) => [o.name, Number(o.orbital_period_days)])) };
}

/** The sky from the home world at a time: each wanderer's direction, and how far it stands from Mitkear (degrees; `east` when it follows Mitkear, an evening star). */
export function wandererSky(ephemeris, timeMs) {
  const p = ephemeris.at(timeMs), here = p[ephemeris.home], sun = norm(sub([0, 0, 0], here)), out = {};
  for (const name of ephemeris.wanderers) {
    const dir = norm(sub(p[name], here)), cross = sun[0] * dir[1] - sun[1] * dir[0];
    out[name] = { dir, elongationDeg: angle(dir, sun), east: cross > 0 };
  }
  return out;
}
/** The longitude of each world round Mitkear at a time (degrees, in the plane of the registry's x and y). */
export function heliocentricLongitudes(ephemeris, timeMs) { const p = ephemeris.at(timeMs); return Object.fromEntries(Object.entries(p).map(([name, v]) => [name, Math.atan2(v[1], v[0]) / DEG])); }

// The least value of f near t (it is smooth and has one low point within a step either side).
function lowPoint(f, t, step) { let a = t - step, b = t + step; for (let k = 0; k < 40; k += 1) { const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3; if (f(m1) < f(m2)) b = m2; else a = m1; } return (a + b) / 2; }
const subsets = (items) => { const out = []; for (let mask = 1; mask < 1 << items.length; mask += 1) { const s = items.filter((_, i) => mask & (1 << i)); if (s.length >= 2) out.push(s); } return out.sort((x, y) => y.length - x.length); };

/**
 * The sky meetings between two times: [{ timeMs, bodies, separationDeg, elongationDeg, evening }], in order.
 * A meeting is the moment a group of wanderers is closest together (its widest pair at its least), if that is
 * within the limit for the group's size and every one of them stands far enough from Mitkear. A smaller group's
 * meeting within five days of a larger one that holds it is part of that one and is not listed again.
 */
export function skyMeetings(ephemeris, fromMs, toMs, { stepMs = DAY_MS / 2 } = {}) {
  const found = [];
  for (const group of subsets(ephemeris.wanderers)) {
    const width = (t) => { const sky = wandererSky(ephemeris, t); let w = 0; for (let i = 0; i < group.length; i += 1) for (let j = i + 1; j < group.length; j += 1) w = Math.max(w, angle(sky[group[i]].dir, sky[group[j]].dir)); return w; };
    let before = width(fromMs - stepMs), here = width(fromMs);
    for (let t = fromMs; t < toMs; t += stepMs) {
      const after = width(t + stepMs);
      if (here <= before && here < after && here < MEETING_LIMIT_DEG[group.length] * 1.5) {
        const best = lowPoint(width, t, stepMs), separationDeg = width(best), sky = wandererSky(ephemeris, best), elongationDeg = Math.min(...group.map((n) => sky[n].elongationDeg));
        if (best >= fromMs && best < toMs && separationDeg <= MEETING_LIMIT_DEG[group.length] && elongationDeg >= MEETING_MIN_ELONGATION_DEG && !found.some((e) => Math.abs(e.timeMs - best) <= 5 * DAY_MS && group.every((n) => e.bodies.includes(n))))
          found.push({ timeMs: best, bodies: [...group], separationDeg, elongationDeg, evening: sky[group[0]].east });
      }
      before = here; here = after;
    }
  }
  return found.sort((a, b) => a.timeMs - b.timeMs);
}

/**
 * The true lines between two times: [{ timeMs, kind, name, bodies, spreadDeg }], in order. Found from the
 * orbits: each time Bruthi and Eym pass through one line with Mitkear on the same side of it, the others are
 * looked for on that line.
 */
export function trueLines(ephemeris, fromMs, toMs, { stepMs = DAY_MS } = {}) {
  const [inner, second, third, outer] = ephemeris.wanderers, home = ephemeris.home, out = [];
  const pair = (t) => { const l = heliocentricLongitudes(ephemeris, t); return spreadDeg([l[inner], l[home]]); };
  let before = pair(fromMs - stepMs), here = pair(fromMs);
  for (let t = fromMs; t < toMs; t += stepMs) {
    const after = pair(t + stepMs);
    if (here <= before && here < after && here < 3) {
      // The moment the line is truest for the worlds on it.
      const kindAt = (time) => {
        const l = heliocentricLongitudes(ephemeris, time), all = spreadDeg([l[home], l[inner], l[second], l[third], l[outer]]), four = spreadDeg([l[home], l[inner], l[third], l[outer]]), three = spreadDeg([l[home], l[inner], l[second]]);
        const far = Math.abs(spreadDeg([l[home], l[second] + 180]));
        if (all <= LINE_LIMIT_DEG) return { kind: "great", bodies: [inner, home, second, third, outer], spreadDeg: all };
        if (four <= LINE_LIMIT_DEG && far <= LINE_FAR_SIDE_LIMIT_DEG) return { kind: "lesser", bodies: [inner, home, third, outer], farSide: second, spreadDeg: four };
        if (three <= LINE_LIMIT_DEG) return { kind: "opposition", bodies: [inner, home, second], spreadDeg: three };
        return null;
      };
      const all = (time) => { const l = heliocentricLongitudes(ephemeris, time); return spreadDeg([l[home], l[inner], l[second], l[third], l[outer]]); }, four = (time) => { const l = heliocentricLongitudes(ephemeris, time); return spreadDeg([l[home], l[inner], l[third], l[outer]]); }, three = (time) => { const l = heliocentricLongitudes(ephemeris, time); return spreadDeg([l[home], l[inner], l[second]]); };
      const tries = [lowPoint(all, t, 2 * stepMs), lowPoint(four, t, 2 * stepMs), lowPoint(three, t, 2 * stepMs)];
      const order = { great: 0, lesser: 1, opposition: 2 }, hits = tries.map((time) => ({ time, hit: kindAt(time) })).filter((x) => x.hit).sort((a, b) => order[a.hit.kind] - order[b.hit.kind]);
      if (hits.length && hits[0].time >= fromMs && hits[0].time < toMs) out.push({ timeMs: hits[0].time, name: LINE_NAMES[hits[0].hit.kind], ...hits[0].hit });
    }
    before = here; here = after;
  }
  return out;
}

/** The first instant of a calendar year and of the next. */
export const yearSpan = (year) => { const fromMs = calendarMs(year, 1, 1); return { fromMs, toMs: fromMs + DAYS_PER_YEAR * DAY_MS }; };
/** An instant of the calendar in any year, year 0 and earlier included (the calendar's own maker starts at year 1). */
export function calendarMs(year, month, day, hour = 0) { return makeUniversalTimeMs({ year: 1, month, day, hour }) + (year - 1) * DAYS_PER_YEAR * DAY_MS; }

/**
 * A year's almanac: its true lines and sky meetings in order, each with its calendar date:
 * [{ timeMs, date: { year, month, day }, type: "line" | "meeting", ... }].
 */
export function almanacForYear(rows, year, options = {}) {
  const ephemeris = options.ephemeris ?? wandererEphemeris(rows, options), { fromMs, toMs } = yearSpan(year);
  const dated = (type) => (e) => { const p = universalTimeParts(e.timeMs); return { ...e, type, date: { year: p.year, month: p.month, day: p.day } }; };
  return [...trueLines(ephemeris, fromMs, toMs).map(dated("line")), ...skyMeetings(ephemeris, fromMs, toMs).map(dated("meeting"))].sort((a, b) => a.timeMs - b.timeMs);
}

/** A year's almanac as lines of text ("14 March: …"), for a panel; `monthName` names a month. */
export function almanacLines(events, displayName, monthName) { return events.map((e) => `${e.date.day} ${monthName(e.date.month)}: ${describeAlmanacEvent(e, displayName)}`); }

/** An event in words, with the names people use (`displayName` maps a registry name to one). */
export function describeAlmanacEvent(event, displayName = (name) => name) {
  const list = (names) => names.length === 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  if (event.type === "line") return event.kind === "lesser" ? `${event.name}: ${list(event.bodies.map(displayName))} in one line with Mitkear, ${displayName(event.farSide)} beyond it` : `${event.name}: ${list(event.bodies.map(displayName))} in one line with Mitkear`;
  return `${list(event.bodies.map(displayName))} within ${event.separationDeg < 0.1 ? "0.1" : event.separationDeg.toFixed(1)}° ${event.elongationDeg >= 150 ? "opposite Mitkear, up all night" : `in the ${event.evening ? "evening" : "morning"} sky`}`;
}
