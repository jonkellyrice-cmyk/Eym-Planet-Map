// The lunar calendar of Eym: what its two moons do, night by night, month by month and year by year.
//
// Nothing here is new astronomy. The phases, eclipses, crossings and tides come from scripts/moon-events.mjs, the
// lunar mansions from scripts/lunar-mansions.mjs, what can be seen from a place from the ground view's own
// snapshot (scripts/ground-sky.mjs), and the wanderers' alignments from scripts/eym-almanac.mjs. This module lays
// them out on the calendar, says which events can be seen from a place, and marks the rare ones.
//
// Pure: the registry's rows, the sky document and the epoch orientations in; plain data out. No Foundry APIs.
// The event names are working names.

import { buildSystemModel } from "./system-data.mjs";
import { groundSky } from "./ground-sky.mjs";
import { createEphemeris, findMoonEvents, moonGeometry, phaseName, tidalStrength } from "./moon-events.mjs";
import { mansionForDirection } from "./lunar-mansions.mjs";
import { calendarMs, trueLines, wandererEphemeris, yearSpan } from "./eym-almanac.mjs";
import { DAY_MS, DAYS_PER_MONTH, DAYS_PER_YEAR, HOLIDAY_DAYS, HOLIDAY_MONTH, HOLIDAY_NAME, MONTH_NAMES, MONTH_START_WEEKDAY_INDEX, WEEKDAY_NAMES, universalTimeParts } from "./universal-time.mjs";

export const MOON_CALENDAR_SYSTEM = "Abydos", MOON_CALENDAR_HOME = "Eventide", MOON_KEYS = Object.freeze(["White Moon", "Red Moon"]);
/** The names people use for the moons, and their colours on the calendar. */
export const MOON_DISPLAY = Object.freeze({ "White Moon": { name: "Austarm", color: "#f4f1e8", dark: "#3a3f4a" }, "Red Moon": { name: "Chatarm", color: "#d9673f", dark: "#3d2420" } });
/** The hour (of the calendar's clock) at which a night's moons are drawn. */
export const NIGHT_HOUR = 24;
/**
 * A day is a great-tide day when the pull of Mitkear and both moons comes to this share of the most the three can
 * give together (all in line) at some hour of it; a slack-tide day when it never reaches the lesser share.
 */
export const GREAT_TIDE_SHARE = 0.95, SLACK_TIDE_SHARE = 0.25, SUN_TIDE = 0.441;
/** Two events belong to one night when they fall within this many hours. */
export const SAME_NIGHT_HOURS = 12;
/** Mitkear counts as down, and a moon as up, by these altitudes (degrees): the horizon with refraction. */
export const SUN_DOWN_DEG = -0.83, MOON_UP_DEG = 0;
/** The event types, in the order the list shows them, with their working names. */
export const EVENT_TYPES = Object.freeze({
  "double-full": "Double full", "double-dark": "Double dark", occultation: "Chatarm crosses Austarm", "solar-eclipse": "Solar eclipse", "lunar-eclipse": "Lunar eclipse",
  "great-tide": "Great tide", "slack-tide": "Slack tide", alignment: "Alignment", full: "Full moon", new: "New moon", "first-quarter": "First quarter", "last-quarter": "Last quarter",
});
const PHASE_TYPES = new Set(["full", "new", "first-quarter", "last-quarter"]), HOUR_MS = DAY_MS / 24;
const moonName = (key) => MOON_DISPLAY[key]?.name ?? key;

/** What the calendar is worked from: the moons' ephemeris, the wanderers', the sky document and the orientations. */
export function createMoonCalendar({ rows, sky, orientations = {} }) {
  return { rows, sky, orientations, eph: createEphemeris(rows, { system: MOON_CALENDAR_SYSTEM, planet: MOON_CALENDAR_HOME, moons: [...MOON_KEYS] }), wanderers: wandererEphemeris(rows), years: new Map(), nights: new Map() };
}

/** The days of a month (1 to 12), or of Year's End (month 13). */
export const daysIn = (month) => (month === HOLIDAY_MONTH ? HOLIDAY_DAYS : DAYS_PER_MONTH);
export const monthTitle = (month) => (month === HOLIDAY_MONTH ? HOLIDAY_NAME : MONTH_NAMES[month - 1]);
const dateOf = (timeMs) => { const p = universalTimeParts(timeMs); return { year: p.year, month: p.month, day: p.day, hour: p.hour, minute: p.minute }; };
const dayKey = (d) => `${d.year}-${d.month}-${d.day}`;

/**
 * The two moons on the night of a date: [{ key, name, illuminated 0..1, phaseLongitudeDeg, phase, waxing }], and
 * the day's tide: { high, low (shares of the greatest pull), kind: "great" | "slack" | null }.
 */
export function nightOf(calendar, year, month, day) {
  const key = `${year}-${month}-${day}`; if (calendar.nights.has(key)) return calendar.nights.get(key);
  const start = calendarMs(year, month, day), geometry = moonGeometry(calendar.eph, start + NIGHT_HOUR * HOUR_MS);
  const moons = geometry.map((g) => ({ key: g.name, name: moonName(g.name), illuminated: g.illuminated, phaseLongitudeDeg: g.phaseLongitudeDeg, phase: phaseName(g.phaseLongitudeDeg), waxing: g.phaseLongitudeDeg < 180 }));
  let high = 0, low = Infinity;
  for (let h = 0; h < 24; h += 2) { const t = start + h * HOUR_MS, g = moonGeometry(calendar.eph, t), share = tidalStrength(calendar.eph, t, SUN_TIDE) / (SUN_TIDE + g.reduce((s, m) => s + m.tidePull, 0)); high = Math.max(high, share); low = Math.min(low, share); }
  const night = { moons, tide: { high, low, kind: high >= GREAT_TIDE_SHARE ? "great" : high <= SLACK_TIDE_SHARE ? "slack" : null } };
  calendar.nights.set(key, night); return night;
}

/** An event's name in words (the working names), with the moons' display names. */
export function eventLabel(event) {
  switch (event.type) {
    case "double-full": return "Double full";
    case "double-dark": return "Double dark";
    case "occultation": return `${moonName(event.moon)} crosses ${moonName(event.occulted)}`;
    case "solar-eclipse": return `${event.kind[0].toUpperCase()}${event.kind.slice(1)} solar eclipse by ${moonName(event.moon)}`;
    case "lunar-eclipse": return `${event.kind[0].toUpperCase()}${event.kind.slice(1)} lunar eclipse of ${moonName(event.moon)}`;
    case "great-tide": return "Great tide";
    case "slack-tide": return "Slack tide";
    case "alignment": return event.name[0].toUpperCase() + event.name.slice(1);
    case "full": return `${moonName(event.moon)} full`;
    case "new": return `${moonName(event.moon)} new`;
    case "first-quarter": return `${moonName(event.moon)} first quarter`;
    case "last-quarter": return `${moonName(event.moon)} last quarter`;
    default: return event.type;
  }
}

/**
 * Every event of a year, in order: the moons' own (scripts/moon-events.mjs findMoonEvents, unchanged), the
 * great-tide and slack-tide days, and the wanderers' true lines; each with its calendar date, its label, the
 * lunar mansion of its moon (Austarm's for an event of both), and `rare` (a list of reasons, empty when it is not).
 */
export function yearEvents(calendar, year) {
  if (calendar.years.has(year)) return calendar.years.get(year);
  const { fromMs, toMs } = yearSpan(year), out = [];
  for (const e of findMoonEvents(calendar.eph, fromMs, toMs)) { if (e.timeMs >= fromMs && e.timeMs < toMs) out.push({ ...e }); }
  // Tide days: a run of great (or slack) days is one event on each of its days, timed at the day's noon.
  for (let d = 0; d < DAYS_PER_YEAR; d += 1) { const p = universalTimeParts(fromMs + d * DAY_MS), night = nightOf(calendar, year, p.month, p.day); if (night.tide.kind) out.push({ type: `${night.tide.kind}-tide`, timeMs: fromMs + d * DAY_MS + 12 * HOUR_MS, share: night.tide.kind === "great" ? night.tide.high : night.tide.high }); }
  for (const line of trueLines(calendar.wanderers, fromMs, toMs)) out.push({ type: "alignment", kind: line.kind, name: line.name, timeMs: line.timeMs });
  out.sort((a, b) => a.timeMs - b.timeMs);
  const near = (a, b) => Math.abs(a.timeMs - b.timeMs) <= SAME_NIGHT_HOURS * HOUR_MS, lines = out.filter((e) => e.type === "alignment" && e.kind !== "opposition");
  out.forEach((e, index) => {
    e.id = `${year}-${index}`; e.date = dateOf(e.timeMs); e.label = eventLabel(e);
    const k = Math.max(0, MOON_KEYS.indexOf(e.moon ?? MOON_KEYS[0])), mansion = mansionForDirection(moonGeometry(calendar.eph, e.timeMs)[k].direction, calendar.sky); e.mansion = { name: mansion.name, number: mansion.number };
    // Compound events are rare: two uncommon things on one night.
    const rare = [], with_ = (type) => out.filter((o) => o !== e && o.type === type && near(o, e));
    if (e.type === "double-full") { for (const o of with_("lunar-eclipse")) rare.push(`with a ${o.kind} lunar eclipse of ${moonName(o.moon)}`); if (with_("occultation").length) rare.push("with Chatarm crossing Austarm"); }
    if (e.type === "double-dark") { for (const o of with_("solar-eclipse")) rare.push(`with a ${o.kind} solar eclipse by ${moonName(o.moon)}`); if (with_("occultation").length) rare.push("with Chatarm crossing Austarm"); }
    if (e.type === "lunar-eclipse" && with_("double-full").length) rare.push("on a double full");
    if (e.type === "solar-eclipse" && with_("double-dark").length) rare.push("on a double dark");
    if (e.type === "occultation") { if (with_("double-full").length) rare.push("during a double full"); if (with_("double-dark").length) rare.push("during a double dark"); }
    if (e.type === "alignment" && e.kind !== "opposition") rare.push("once in 68 years");
    else for (const line of lines) if (!PHASE_TYPES.has(e.type) && !/tide/.test(e.type) && dayKey(dateOf(line.timeMs)) === dayKey(e.date)) rare.push(`on the night of ${line.name}`);
    e.rare = rare;
  });
  calendar.years.set(year, out); return out;
}

/**
 * A month laid out (or Year's End, month 13): { year, month, title, weekdays, weeks: [[day | null × 7]] } where a
 * day is { day, weekday, date, moons, tide, events (all but the plain phases, which the glyphs show), phases (the
 * exact full, new and quarter moments that fall on it), rare }.
 */
export function monthGrid(calendar, year, month) {
  const events = yearEvents(calendar, year).filter((e) => e.date.month === month), days = [];
  for (let day = 1; day <= daysIn(month); day += 1) {
    const night = nightOf(calendar, year, month, day), mine = events.filter((e) => e.date.day === day);
    days.push({ day, weekday: (MONTH_START_WEEKDAY_INDEX + day - 1) % 7, date: { year, month, day }, moons: night.moons, tide: night.tide, events: mine.filter((e) => !PHASE_TYPES.has(e.type)), phases: mine.filter((e) => PHASE_TYPES.has(e.type)), rare: mine.some((e) => e.rare.length) });
  }
  // Every month and the holiday start on the same weekday, so the grid is whole weeks.
  const weeks = []; for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
  return { year, month, title: monthTitle(month), weekdays: Array.from({ length: 7 }, (_, i) => WEEKDAY_NAMES[(MONTH_START_WEEKDAY_INDEX + i) % 7]), weeks, days };
}

/** A year at a glance: its thirteen blocks (each day's badges and whether it is rare) and the counts of its events. */
export function yearSummary(calendar, year) {
  const events = yearEvents(calendar, year), count = (type, test = () => true) => events.filter((e) => e.type === type && test(e)).length;
  const months = []; for (let month = 1; month <= HOLIDAY_MONTH; month += 1) { const grid = monthGrid(calendar, year, month); months.push({ month, title: grid.title, days: grid.days.map((d) => ({ day: d.day, types: [...new Set(d.events.map((e) => e.type))], rare: d.rare, moons: d.moons })) }); }
  return {
    year, months,
    counts: { doubleFulls: count("double-full"), doubleDarks: count("double-dark"), crossings: count("occultation"), solarEclipses: count("solar-eclipse"), lunarEclipses: count("lunar-eclipse"), totalSolarEclipses: count("solar-eclipse", (e) => e.kind === "total"), totalLunarEclipses: count("lunar-eclipse", (e) => e.kind === "total"), greatTideDays: count("great-tide"), slackTideDays: count("slack-tide"), alignments: count("alignment"), rare: events.filter((e) => e.rare.length).length },
    // Austarm's place in its cycle on the first night of the year: a full-moon year or a dark-moon year.
    austarmYear: austarmYearKind(calendar, year),
  };
}

/**
 * Austarm keeps the calendar: its month of phases is the calendar's 28 days, so it shows the same phase on the same
 * date every month, and since a year is twelve and a half of its months, the phase flips by half a cycle each year.
 * Returns which kind of year this is by Austarm's phase on the 15th ("full-moon" or "dark-moon"), the dates of the
 * month it is full and dark on, its mean lit share on the 15th, and how far the phase wanders through the year
 * (degrees).
 */
export function austarmYearKind(calendar, year) {
  const phases = []; for (let month = 1; month <= 12; month += 1) phases.push(nightOf(calendar, year, month, 15).moons[0].phaseLongitudeDeg);
  const off = (a, b) => Math.abs(((a - b + 540) % 360) - 180), mean = Math.atan2(phases.reduce((s, p) => s + Math.sin(p * Math.PI / 180), 0), phases.reduce((s, p) => s + Math.cos(p * Math.PI / 180), 0)) * 180 / Math.PI;
  // The dates of the month it is full and dark on, from where its phase stands on the night of the 15th.
  const dayOf = (target) => { const d = Math.round(15 + (((target - mean) % 360 + 360) % 360) / 360 * DAYS_PER_MONTH); return ((d - 1) % DAYS_PER_MONTH) + 1; };
  return { kind: off(mean, 180) < 90 ? "full-moon" : "dark-moon", fullDay: dayOf(180), darkDay: dayOf(0), midMonthPhaseDeg: (mean + 360) % 360, wanderDeg: Math.max(...phases.map((p) => off(p, mean))), midMonthIlluminated: phases.reduce((s, _, i) => s + nightOf(calendar, year, i + 1, 15).moons[0].illuminated, 0) / 12 };
}

// ---------------------------------------------------------------- what can be seen from a place

/** The ground view's own snapshot of the sky at a time and place (no stars: only Mitkear and the moons are asked for). */
export function skyAt(calendar, timeMs, place) {
  const model = buildSystemModel(calendar.rows, MOON_CALENDAR_SYSTEM, { referenceTimestampMs: timeMs, orientations: calendar.orientations });
  return groundSky({ model, sky: calendar.sky, starfield: { stars: [] }, latDeg: place.latDeg, lonDeg: place.lonDeg, planet: MOON_CALENDAR_HOME, moons: [...MOON_KEYS] });
}
const angleBetween = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))) * 180 / Math.PI;

/**
 * Whether an event can be seen from a place: { visible, how, note, timeMs (when to look), sunAltDeg, moonAltDeg }.
 *   - a full or quarter moon, a double full: its moon (both moons) above the horizon with Mitkear down, at the dark
 *     moment nearest to it within half a day (the night it falls in); a new moon is never seen;
 *   - a double dark: Mitkear down on that night (a night with no moon);
 *   - a lunar eclipse: the moon above the horizon within an hour and a half of mid-eclipse (it looks the same from
 *     everywhere it is up);
 *   - a solar eclipse: Mitkear above the horizon and at least partly covered at some time within three hours
 *     (the track is narrow: `how` is "total", "annular" or "partial" as seen from here, at the best moment);
 *   - Chatarm crossing Austarm: the two discs overlapping as seen from here, above the horizon, within two hours;
 *   - tide days and the wanderers' lines are not sights of one place: always "visible" (how: "everywhere").
 */
export function localVisibility(calendar, event, place) {
  const at = (t) => { const s = skyAt(calendar, t, place), moons = Object.fromEntries(s.moons.map((m) => [m.name, m])); return { s, moons, sunDown: s.sun.altDeg < SUN_DOWN_DEG }; };
  const here = at(event.timeMs), base = { timeMs: event.timeMs, sunAltDeg: here.s.sun.altDeg };
  const up = (m) => m.altDeg > MOON_UP_DEG;
  // A night event is seen on the night it falls in: the dark moment nearest to it, within half a day, that passes `test`.
  const nearestNight = (test) => { let best = null; for (let half = 0; half <= 2 * SAME_NIGHT_HOURS; half += 1) for (const sign of half ? [1, -1] : [1]) { const t = event.timeMs + sign * half * HOUR_MS / 2, x = at(t); if (x.sunDown && test(x)) return { t, x }; } return best; };
  switch (event.type) {
    case "great-tide": case "slack-tide": case "alignment": return { ...base, visible: true, how: "everywhere", note: event.type === "alignment" ? "a matter of the whole sky" : "on every coast" };
    case "double-dark": { const night = nearestNight(() => true); return night ? { ...base, timeMs: night.t, sunAltDeg: night.x.s.sun.altDeg, visible: true, how: "a moonless night", note: "a night with no moon" } : { ...base, visible: false, how: null, note: "Mitkear does not set here that day" }; }
    case "double-full": { const night = nearestNight((x) => MOON_KEYS.every((k) => up(x.moons[k]))); return night ? { ...base, timeMs: night.t, sunAltDeg: night.x.s.sun.altDeg, moonAltDeg: Math.min(...MOON_KEYS.map((k) => night.x.moons[k].altDeg)), visible: true, how: "both moons up", note: "both moons up together that night" } : { ...base, visible: false, how: null, note: "the two moons are not up together in the dark here" }; }
    case "full": case "first-quarter": case "last-quarter": { const night = nearestNight((x) => up(x.moons[event.moon])); return night ? { ...base, timeMs: night.t, sunAltDeg: night.x.s.sun.altDeg, moonAltDeg: night.x.moons[event.moon].altDeg, visible: true, how: "up", note: `${moonName(event.moon)} up that night` } : { ...base, visible: false, how: null, note: `${moonName(event.moon)} is not up in the dark here` }; }
    case "new": return { ...base, visible: false, how: null, note: "a new moon is not seen" };
    case "lunar-eclipse": {
      // An eclipse of a moon lasts a few hours and looks the same from wherever the moon is up: the moment nearest its
      // middle, within an hour and a half, when the moon is up here and in the shadow.
      let best = null; for (let minutes = -90; minutes <= 90; minutes += 10) { const x = at(event.timeMs + minutes * 60_000), m = x.moons[event.moon]; const shadowed = event.kind === "penumbral" ? m.penumbralFraction > 0 : m.umbralFraction > 0; if (up(m) && shadowed && (!best || Math.abs(minutes) < Math.abs(best.minutes))) best = { minutes, x, m }; }
      return best ? { ...base, timeMs: event.timeMs + best.minutes * 60_000, sunAltDeg: best.x.s.sun.altDeg, moonAltDeg: best.m.altDeg, visible: true, how: event.kind, note: `${moonName(event.moon)} ${Math.round(best.m.altDeg)}° up${best.x.sunDown ? "" : ", in twilight or daylight"}` } : { ...base, visible: false, how: null, note: `${moonName(event.moon)} is below the horizon while it is in the shadow` };
    }
    case "solar-eclipse": {
      let best = { coverage: 0 };
      for (let minutes = -180; minutes <= 180; minutes += 5) { const t = event.timeMs + minutes * 60_000, x = at(t), m = x.moons[event.moon]; if (x.s.sun.altDeg <= 0 || !(m.sunCoverage > best.coverage)) continue; best = { coverage: m.sunCoverage, t, sunAltDeg: x.s.sun.altDeg, central: angleBetween(m.dir, x.s.sun.dir) < Math.abs(m.radiusDeg - x.s.sun.radiusDeg), bigger: m.radiusDeg >= x.s.sun.radiusDeg }; }
      if (!(best.coverage > 0.001)) return { ...base, visible: false, how: null, note: here.s.sun.altDeg <= 0 ? "Mitkear is down here" : "outside the shadow's path" };
      const how = best.central ? (best.bigger ? "total" : "annular") : "partial";
      return { ...base, timeMs: best.t, sunAltDeg: best.sunAltDeg, visible: true, how, coverage: best.coverage, note: `${how} here: ${Math.round(best.coverage * 100)}% of Mitkear covered` };
    }
    case "occultation": {
      let best = { gap: Infinity };
      for (let minutes = -120; minutes <= 120; minutes += 4) { const t = event.timeMs + minutes * 60_000, x = at(t), a = x.moons[event.moon], b = x.moons[event.occulted]; if (!up(a) || !up(b)) continue; const gap = angleBetween(a.dir, b.dir) - (a.radiusDeg + b.radiusDeg); if (gap < best.gap) best = { gap, t, sunDown: x.sunDown, altDeg: Math.min(a.altDeg, b.altDeg), sunAltDeg: x.s.sun.altDeg }; }
      if (!(best.gap < 0)) return { ...base, visible: false, how: null, note: best.gap === Infinity ? "the moons are below the horizon" : "outside the strip: the moons pass close but do not touch" };
      return { ...base, timeMs: best.t, sunAltDeg: best.sunAltDeg, moonAltDeg: best.altDeg, visible: true, how: best.sunDown ? "by night" : "by day", note: `seen from here ${best.sunDown ? "by night" : "by day"}, ${Math.round(best.altDeg)}° up` };
    }
    default: return { ...base, visible: false, how: null, note: "" };
  }
}

/**
 * The year's event list: every event with (when a place is given) what is seen of it from there, and a crossing
 * seen from here during a double full or dark marked rare. `types` (a set or list of event types) filters it.
 */
export function eventList(calendar, year, { place = null, types = null } = {}) {
  const wanted = types ? new Set(types) : null;
  return yearEvents(calendar, year).filter((e) => !wanted || wanted.has(e.type)).map((e) => {
    const local = place ? localVisibility(calendar, e, place) : null, rare = [...e.rare];
    if (local?.visible && e.type === "occultation" && e.rare.length) rare.push("seen from here");
    return { ...e, rare, local };
  });
}

/** The first day of the month after (or before) a month: { year, month }, Year's End counting as the thirteenth. */
export function stepMonth(year, month, by) { let m = month + by, y = year; while (m > HOLIDAY_MONTH) { m -= HOLIDAY_MONTH; y += 1; } while (m < 1) { m += HOLIDAY_MONTH; y -= 1; } return { year: y, month: m }; }
