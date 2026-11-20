// The lunar calendar: the month grid, the year, the event list, what is seen from a place, and the rare nights.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSystemModel, parseCsv } from "../scripts/system-data.mjs";
import { groundSky } from "../scripts/ground-sky.mjs";
import { createEphemeris, findMoonEvents, moonGeometry } from "../scripts/moon-events.mjs";
import { calendarMs, yearSpan } from "../scripts/eym-almanac.mjs";
import { DAY_MS, HOLIDAY_MONTH, universalTimeParts } from "../scripts/universal-time.mjs";
import { EVENT_TYPES, GREAT_TIDE_SHARE, MOON_UP_DEG, SLACK_TIDE_SHARE, SUN_DOWN_DEG, austarmYearKind, createMoonCalendar, daysIn, eventLabel, eventList, localVisibility, monthGrid, nightOf, skyAt, stepMonth, yearEvents, yearSummary } from "../scripts/moon-calendar.mjs";
import { austarmNote, badgeText, calendarNight, moonGlyph, renderMoonCalendar } from "../scripts/moon-calendar-view.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rows = parseCsv(read("docs/system-orbital-distances.csv")), sky = JSON.parse(read("data/stellar/constellations.json")), orientations = JSON.parse(read("data/astronomy/epoch-orientations.json")).orientations;
const calendar = createMoonCalendar({ rows, sky, orientations }), eph = createEphemeris(rows), PHASES = new Set(["full", "new", "first-quarter", "last-quarter"]);
const DREE = { latDeg: -6.79, lonDeg: 0.41, name: "Dree" }, HOUR = DAY_MS / 24;

test("the month grid is the moons' events laid on the calendar: every event of the year on its own day, nothing added or lost", () => {
  const { fromMs, toMs } = yearSpan(50), events = findMoonEvents(eph, fromMs, toMs).filter((e) => e.timeMs >= fromMs && e.timeMs < toMs);
  const laid = []; let days = 0;
  for (let month = 1; month <= HOLIDAY_MONTH; month += 1) {
    const grid = monthGrid(calendar, 50, month);
    assert.equal(grid.days.length, month === HOLIDAY_MONTH ? 14 : 28); assert.equal(grid.days.length, daysIn(month)); assert.equal(grid.weeks.length, grid.days.length / 7); assert.ok(grid.weeks.every((w) => w.length === 7));
    // Every month and the holiday start on a Monday.
    assert.equal(grid.weekdays[0], "Monday"); assert.equal(grid.days[0].weekday, 1);
    assert.equal(grid.title, month === HOLIDAY_MONTH ? "Year's End" : ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][month - 1]);
    for (const d of grid.days) {
      days += 1;
      for (const e of [...d.events, ...d.phases]) { assert.deepEqual([e.date.year, e.date.month, e.date.day], [50, month, d.day]); const p = universalTimeParts(e.timeMs); assert.deepEqual([p.month, p.day], [month, d.day]); if (!/tide|alignment/.test(e.type)) laid.push(e); }
      assert.ok(d.phases.every((e) => PHASES.has(e.type)) && d.events.every((e) => !PHASES.has(e.type)));
      // The night's faces are the model's own, at the end of that date.
      const g = moonGeometry(eph, calendarMs(50, month, d.day) + 24 * HOUR);
      assert.deepEqual(d.moons.map((m) => m.name), ["Austarm", "Chatarm"]);
      d.moons.forEach((m, k) => { assert.equal(m.illuminated, g[k].illuminated); assert.equal(m.waxing, g[k].phaseLongitudeDeg < 180); assert.ok(m.illuminated >= 0 && m.illuminated <= 1); });
    }
  }
  assert.equal(days, 350); assert.equal(laid.length, events.length);
  laid.sort((a, b) => a.timeMs - b.timeMs);
  events.forEach((e, i) => { assert.equal(laid[i].type, e.type); assert.equal(laid[i].timeMs, e.timeMs); assert.equal(laid[i].moon, e.moon); assert.equal(laid[i].kind, e.kind); });
  assert.deepEqual(yearEvents(calendar, 50), yearEvents(calendar, 50));
});

test("the double full of 4 July and the double dark of 19 July, year 50, are on their days, with their names", () => {
  const july = monthGrid(calendar, 50, 7), on = (day) => july.days[day - 1];
  assert.ok(on(4).events.some((e) => e.type === "double-full" && e.label === "Double full")); assert.ok(on(19).events.some((e) => e.type === "double-dark" && e.label === "Double dark"));
  // Both moons nearly full on the 4th, nearly dark on the 19th.
  assert.ok(on(4).moons.every((m) => m.illuminated > 0.95)); assert.ok(on(19).moons.every((m) => m.illuminated < 0.08));
  assert.equal(july.days.filter((d) => d.events.some((e) => /double/.test(e.type))).length, 2);
  const summary = yearSummary(calendar, 50); assert.equal(summary.counts.doubleFulls, 1); assert.equal(summary.counts.doubleDarks, 1);
  assert.deepEqual(summary.months.map((m) => m.days.length), [...new Array(12).fill(28), 14]);
  const all = yearEvents(calendar, 50), n = (type) => all.filter((e) => e.type === type).length;
  assert.deepEqual([summary.counts.crossings, summary.counts.solarEclipses, summary.counts.lunarEclipses], [n("occultation"), n("solar-eclipse"), n("lunar-eclipse")]);
  assert.ok(summary.counts.crossings > 0 && summary.counts.solarEclipses > 0 && summary.counts.lunarEclipses > 0);
  // The names are the display names everywhere; the registry's keys never show.
  for (const e of all) { assert.ok(e.label && !/White Moon|Red Moon|Eventide/.test(e.label), e.label); assert.ok(e.mansion.name && e.mansion.number >= 1); assert.ok(e.type in EVENT_TYPES); assert.equal(e.label, eventLabel(e)); }
  assert.ok(all.some((e) => e.label === "Chatarm crosses Austarm") && all.some((e) => /solar eclipse by (Austarm|Chatarm)$/.test(e.label)) && all.some((e) => /lunar eclipse of (Austarm|Chatarm)$/.test(e.label)));
});

test("Austarm keeps the calendar: the same phase on the same date each month, flipping by half a cycle each year", () => {
  const off = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  for (const year of [50, 51, 52, 120]) {
    const phases = []; for (let month = 1; month <= 12; month += 1) phases.push(nightOf(calendar, year, month, 15).moons[0].phaseLongitudeDeg);
    // 28 days on, the phase is the same to within a few degrees (a quarter of a day); through a whole year it stays within a day and a half.
    for (let m = 1; m < 12; m += 1) assert.ok(off(phases[m], phases[m - 1]) < 5, `year ${year}, month ${m + 1}: ${off(phases[m], phases[m - 1])}°`);
    for (const a of phases) for (const b of phases) assert.ok(off(a, b) < 20);
    const kind = austarmYearKind(calendar, year); assert.ok(kind.wanderDeg < 12);
    // The next year it stands half a cycle away.
    const next = austarmYearKind(calendar, year + 1); assert.ok(off(kind.midMonthPhaseDeg, next.midMonthPhaseDeg + 180) < 20, `${kind.midMonthPhaseDeg} then ${next.midMonthPhaseDeg}`); assert.notEqual(kind.kind, next.kind);
    assert.ok(Math.abs(((kind.fullDay - kind.darkDay + 28) % 28) - 14) <= 1);
  }
  // Year 50 is a dark-moon year (dark at mid-month, full as the month turns); year 51 a full-moon year.
  const y50 = austarmYearKind(calendar, 50), y51 = austarmYearKind(calendar, 51);
  assert.equal(y50.kind, "dark-moon"); assert.ok(y50.midMonthIlluminated < 0.2 && y50.fullDay <= 6 && y50.darkDay >= 16 && y50.darkDay <= 20); assert.equal(y51.kind, "full-moon"); assert.ok(y51.midMonthIlluminated > 0.8);
  assert.match(austarmNote(calendar, 50), /dark-moon year/); assert.match(austarmNote(calendar, 51), /full-moon year/);
  // Chatarm does not keep the calendar: its phase on the 15th runs all round the cycle through a year.
  const red = []; for (let month = 1; month <= 12; month += 1) red.push(nightOf(calendar, 50, month, 15).moons[1].illuminated); assert.ok(Math.max(...red) - Math.min(...red) > 0.6);
});

test("what is seen from a place agrees with the ground view of the sky there and then", () => {
  const places = [DREE, { latDeg: 45, lonDeg: -80 }, { latDeg: -30, lonDeg: 150 }, { latDeg: 70, lonDeg: -70 }, { latDeg: -60, lonDeg: 60 }];
  const ground = (t, place) => groundSky({ model: buildSystemModel(rows, "Abydos", { referenceTimestampMs: t, orientations }), sky, starfield: { stars: [] }, latDeg: place.latDeg, lonDeg: place.lonDeg });
  const seenKinds = new Set(); let seen = 0, unseen = 0;
  for (const place of places) for (const e of eventList(calendar, 50, { place })) {
    const v = e.local; assert.equal(typeof v.visible, "boolean"); assert.ok(v.note.length > 0 || PHASES.has(e.type)); assert.deepEqual(localVisibility(calendar, e, place), v);
    if (/tide|alignment/.test(e.type)) { assert.ok(v.visible && v.how === "everywhere"); continue; }
    if (!v.visible) { unseen += 1; continue; }
    seen += 1; seenKinds.add(e.type);
    // The moment the calendar says to look, in the ground view's own snapshot.
    const s = ground(v.timeMs, place), moon = (name) => s.moons.find((m) => m.name === name);
    assert.equal(s.sun.altDeg, v.sunAltDeg); assert.deepEqual(skyAt(calendar, v.timeMs, place).sun.altDeg, s.sun.altDeg);
    if (e.type === "double-full") { assert.ok(s.sun.altDeg < SUN_DOWN_DEG); assert.ok(s.moons.every((m) => m.altDeg > MOON_UP_DEG && m.illuminated > 0.9)); }
    if (e.type === "double-dark") { assert.ok(s.sun.altDeg < SUN_DOWN_DEG); assert.ok(s.moons.every((m) => m.illuminated < 0.1)); }
    if (e.type === "full" || e.type === "first-quarter" || e.type === "last-quarter") { assert.ok(s.sun.altDeg < SUN_DOWN_DEG && moon(e.moon).altDeg > MOON_UP_DEG); assert.ok(Math.abs(v.timeMs - e.timeMs) <= 12 * HOUR); }
    if (e.type === "lunar-eclipse") { assert.ok(moon(e.moon).altDeg > MOON_UP_DEG); assert.ok(e.kind === "penumbral" ? moon(e.moon).penumbralFraction > 0 : moon(e.moon).umbralFraction > 0, `${e.label}`); assert.equal(v.how, e.kind); }
    if (e.type === "solar-eclipse") { assert.ok(s.sun.altDeg > 0); assert.ok(moon(e.moon).sunCoverage > 0.001); assert.ok(Math.abs(moon(e.moon).sunCoverage - v.coverage) < 1e-12); assert.ok(["total", "annular", "partial"].includes(v.how)); if (v.how === "total") assert.ok(s.sun.coverage > 0.99); }
    if (e.type === "occultation") { const a = moon(e.moon), b = moon(e.occulted), gap = Math.acos(a.dir[0] * b.dir[0] + a.dir[1] * b.dir[1] + a.dir[2] * b.dir[2]) * 180 / Math.PI; assert.ok(gap < a.radiusDeg + b.radiusDeg && a.altDeg > 0 && b.altDeg > 0); assert.equal(v.how, s.sun.altDeg < SUN_DOWN_DEG ? "by night" : "by day"); }
  }
  assert.ok(seen > 100 && unseen > 100, `${seen} seen, ${unseen} not`);
  for (const type of ["double-full", "double-dark", "lunar-eclipse", "solar-eclipse", "occultation", "full"]) assert.ok(seenKinds.has(type), type);
  // A new moon is never seen; and where a solar eclipse is not seen, the ground view shows no bite out of Mitkear at its moment.
  for (const e of eventList(calendar, 50, { place: DREE })) {
    if (e.type === "new") assert.equal(e.local.visible, false);
    if (e.type === "solar-eclipse" && !e.local.visible) { const s = ground(e.timeMs, DREE); assert.ok(s.sun.altDeg <= 0 || !(s.sun.coverage > 0.001)); }
  }
  // The solar eclipses' tracks are narrow: from five places, most are not seen, and a total one is partial or unseen from most of the world.
  const solar = places.flatMap((place) => eventList(calendar, 50, { place, types: ["solar-eclipse"] })); assert.ok(solar.filter((e) => !e.local.visible).length > solar.filter((e) => e.local.visible).length);
  // Without a place nothing is judged.
  assert.ok(eventList(calendar, 50).every((e) => e.local === null));
});

test("compound nights are rare: a double full with eclipses and a crossing, and the alignment nights", () => {
  assert.equal(yearEvents(calendar, 50).filter((e) => e.rare.length).length, 0);
  // 18–19 February, year 51: both moons full, both totally eclipsed, and Chatarm crossing Austarm.
  const rare = yearEvents(calendar, 51).filter((e) => e.rare.length); assert.ok(rare.length >= 4);
  const double = rare.find((e) => e.type === "double-full"); assert.deepEqual([double.date.month, double.date.day], [2, 19]);
  assert.ok(double.rare.some((r) => /total lunar eclipse of Austarm/.test(r)) && double.rare.some((r) => /total lunar eclipse of Chatarm/.test(r)) && double.rare.some((r) => /Chatarm crossing Austarm/.test(r)));
  assert.ok(rare.some((e) => e.type === "lunar-eclipse" && e.rare.includes("on a double full")) && rare.some((e) => e.type === "occultation" && e.rare.includes("during a double full")));
  assert.ok(monthGrid(calendar, 51, 2).days[18].rare); assert.ok(!monthGrid(calendar, 51, 3).days.some((d) => d.rare)); assert.equal(yearSummary(calendar, 51).counts.rare, rare.length);
  // A crossing during a double full that is seen from the place is marked so in that place's list.
  const crossing = rare.find((e) => e.type === "occultation"); let marked = 0;
  for (let lat = -60; lat <= 60; lat += 30) for (let lon = -180; lon < 180; lon += 30) { const here = eventList(calendar, 51, { place: { latDeg: lat, lonDeg: lon }, types: ["occultation"] }).find((e) => e.id === crossing.id); assert.equal(here.rare.includes("seen from here"), here.local.visible); if (here.local.visible) marked += 1; }
  assert.ok(marked > 0);
  // The Great Alignment (year 68) and the Lesser (year 34) fall on 14 March and are rare; the four-yearly line is listed but not rare.
  for (const [year, name] of [[68, "The Great Alignment"], [34, "The Lesser Alignment"]]) { const line = yearEvents(calendar, year).find((e) => e.type === "alignment"); assert.equal(line.label, name); assert.deepEqual([line.date.month, line.date.day], [3, 14]); assert.ok(line.rare.length > 0); assert.ok(monthGrid(calendar, year, 3).days[13].rare); }
  const ordinary = yearEvents(calendar, 52).find((e) => e.type === "alignment"); assert.equal(ordinary.label, "The Esonth opposition line"); assert.equal(ordinary.rare.length, 0);
});

test("great-tide and slack-tide days follow the three pulls; the list filters by type; the months step round the year", () => {
  let great = 0, slack = 0;
  for (let month = 1; month <= HOLIDAY_MONTH; month += 1) for (const d of monthGrid(calendar, 50, month).days) {
    assert.ok(d.tide.high >= d.tide.low && d.tide.high <= 1.02 && d.tide.low >= 0);
    assert.equal(d.tide.kind, d.tide.high >= GREAT_TIDE_SHARE ? "great" : d.tide.high <= SLACK_TIDE_SHARE ? "slack" : null);
    assert.equal(d.events.some((e) => e.type === "great-tide"), d.tide.kind === "great"); assert.equal(d.events.some((e) => e.type === "slack-tide"), d.tide.kind === "slack");
    if (d.tide.kind === "great") great += 1; if (d.tide.kind === "slack") slack += 1;
  }
  assert.ok(great >= 10 && great <= 45 && slack >= 8 && slack <= 45, `${great} great, ${slack} slack`);
  // The double full and the double dark pull together: great tides on those days.
  assert.equal(monthGrid(calendar, 50, 7).days[3].tide.kind, "great"); assert.equal(monthGrid(calendar, 50, 7).days[18].tide.kind, "great");
  const eclipses = eventList(calendar, 50, { types: ["solar-eclipse", "lunar-eclipse"] }); assert.ok(eclipses.length > 5 && eclipses.every((e) => /eclipse/.test(e.type)));
  assert.equal(eventList(calendar, 50, { types: [] }).length, 0); assert.equal(eventList(calendar, 50).length, yearEvents(calendar, 50).length);
  assert.deepEqual(stepMonth(50, 12, 1), { year: 50, month: 13 }); assert.deepEqual(stepMonth(50, 13, 1), { year: 51, month: 1 }); assert.deepEqual(stepMonth(50, 1, -1), { year: 49, month: 13 }); assert.deepEqual(stepMonth(50, 7, -1), { year: 50, month: 6 });
});

test("the pages: the month's grid, the year's blocks and the list, with the display names, open to every player", () => {
  const month = renderMoonCalendar(calendar, { year: 50, month: 7, tab: "month", place: DREE, today: { year: 50, month: 7, day: 12 } });
  assert.match(month, /July, year 50/); assert.match(month, /DOUBLE FULL/); assert.match(month, /DOUBLE DARK/); assert.match(month, /GREAT TIDE/); assert.match(month, /dark-moon year/); assert.match(month, /is-today/);
  assert.equal((month.match(/class="oscm-moon-day[ "]/g) ?? []).length, 28); assert.equal((month.match(/class="oscm-moon-glyph"/g) ?? []).length, 28 * 2 + 2);
  // A night and an event both lead to the sky at their moment.
  assert.ok(month.includes(`data-action="open-sky" data-time="${calendarNight(50, 7, 4)}"`)); assert.equal(calendarNight(50, 7, 4), calendarMs(50, 7, 4, 22));
  for (const action of ["step-month", "step-year", "now", "tab", "set-place", "clear-place", "open-sky"]) assert.ok(month.includes(`data-action="${action}"`), action);
  const holiday = renderMoonCalendar(calendar, { year: 50, month: 13, tab: "month" }); assert.match(holiday, /Year's End, year 50/); assert.equal((holiday.match(/class="oscm-moon-day[ "]/g) ?? []).length, 14); assert.ok(!holiday.includes("clear-place"));
  const september = renderMoonCalendar(calendar, { year: 50, month: 9, tab: "month", place: DREE }); assert.match(september, /TOTAL LUNAR ECLIPSE · AUSTARM/); assert.match(september, /TOTAL SOLAR ECLIPSE · AUSTARM/); assert.match(september, /is-unseen/); assert.match(september, /is-seen/);
  const year = renderMoonCalendar(calendar, { year: 51, month: 1, tab: "year" }); assert.equal((year.match(/class="oscm-moon-block[ "]/g) ?? []).length, 13); assert.match(year, /<b>2<\/b> double fulls/); assert.match(year, /★ \d+<\/b> rare/); assert.match(year, /is-rare/); assert.match(year, /data-action="show-month" data-month="13"/);
  const list = renderMoonCalendar(calendar, { year: 50, month: 1, tab: "events", place: DREE }); assert.match(list, /Chatarm crosses Austarm/); assert.match(list, /The Shallows/); assert.match(list, /From here/); assert.match(list, /not seen: /); assert.ok(!/<td>[^<]*Austarm full/.test(list));
  const phases = renderMoonCalendar(calendar, { year: 50, month: 1, tab: "events", types: ["full"] }); assert.match(phases, /Austarm full/); assert.ok(!/Double full<\/td>/.test(phases)); assert.equal((phases.match(/data-action="filter"/g) ?? []).length, Object.keys(EVENT_TYPES).length);
  for (const page of [month, holiday, september, year, list, phases]) assert.ok(!/White Moon|Red Moon|Eventide|Abydos/.test(page));
  assert.match(moonGlyph({ key: "White Moon", illuminated: 1, waxing: true }), /aria-label="Austarm 100%"/); assert.equal(badgeText({ type: "occultation" }), "CHATARM CROSSES AUSTARM");
  // Nothing of the GM's is on it: the window and its pages never ask who is looking.
  for (const file of ["scripts/moon-calendar-app.mjs", "scripts/moon-calendar-view.mjs", "scripts/moon-calendar.mjs", "templates/moon-calendar.hbs"]) assert.ok(!/isGM|oscm-gm-only/.test(read(file)), file);
  assert.match(read("scripts/main.mjs"), /openMoonCalendar/); assert.ok(JSON.parse(read("module.json")).styles.includes("styles/moon-calendar.css"));
});
