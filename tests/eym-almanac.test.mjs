// The wanderers' resonant orbits, the Great Alignment and the almanac (canon of 20 November 2026: docs/eym-canon.md).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSystemModel, parseCsv } from "../scripts/system-data.mjs";
import { DAY_MS, DAYS_PER_YEAR, monthName, universalTimeParts } from "../scripts/universal-time.mjs";
import { displayNameFor } from "../scripts/display-names.mjs";
import { ALIGNMENT_DAY, GREAT_ALIGNMENT_YEARS, MEETING_LIMIT_DEG, MEETING_MIN_ELONGATION_DEG, WANDERERS, almanacForYear, almanacLines, calendarMs, describeAlmanacEvent, heliocentricLongitudes, skyMeetings, spreadDeg, trueLines, wandererEphemeris, wandererSky, yearSpan } from "../scripts/eym-almanac.mjs";

const rows = parseCsv(readFileSync(new URL("../docs/system-orbital-distances.csv", import.meta.url), "utf8")), eph = wandererEphemeris(rows), HOUR = 3600e3;
const row = (name) => rows.find((r) => r.system === "Abydos" && r.object === name), [BRUTHI, ESONTH, LILTA, IARN] = WANDERERS, EYM = "Eventide";
const alignment = (year, hour = 8) => calendarMs(year, ALIGNMENT_DAY.month, ALIGNMENT_DAY.day, hour);
const allFive = (t) => spreadDeg(Object.values(heliocentricLongitudes(eph, t)));
const sunRadiusDeg = (t) => Math.asin(696_000 / (Math.hypot(...eph.at(t)[EYM]) * 149_597_870.7)) * 180 / Math.PI;

test("the registry holds the resonant orbits: periods in whole-number ratios, distances by Kepler's third law", () => {
  assert.deepEqual(WANDERERS.map((n) => displayNameFor("Abydos", n)), ["Bruthi", "Esonth", "Lilta", "Iarn"]);
  const period = (n) => Number(row(n).orbital_period_days);
  assert.equal(period(EYM), 350); assert.equal(period(BRUTHI), 700 / 3); assert.equal(period(ESONTH), 1400 / 3); assert.equal(period(LILTA), 350 * 17 / 9); assert.equal(period(IARN), 1700);
  // Bruthi : Eym : Esonth go round 2 : 3 : 4 years; Lilta takes 17/9 of a year and Iarn 34/7.
  assert.ok(Math.abs(period(BRUTHI) / 350 - 2 / 3) < 1e-12 && Math.abs(period(ESONTH) / 350 - 4 / 3) < 1e-12 && Math.abs(period(LILTA) / 350 - 17 / 9) < 1e-12 && Math.abs(period(IARN) / 350 - 34 / 7) < 1e-12);
  // 68 years is a whole number of orbits for all five.
  const orbits = Object.fromEntries([EYM, ...WANDERERS].map((n) => [n, GREAT_ALIGNMENT_YEARS * DAYS_PER_YEAR / period(n)]));
  for (const [name, count] of [[EYM, 68], [BRUTHI, 102], [ESONTH, 51], [LILTA, 36], [IARN, 14]]) assert.ok(Math.abs(orbits[name] - count) < 1e-9, `${name}: ${orbits[name]}`);
  // Distances from the old ones by a ∝ P^(2/3), the star's mass unchanged; where each started; eccentricity and tilt as they were.
  const was = { [BRUTHI]: [0.7647, 234.051, 0.763136, 112.6743, 0.0425, -2], [ESONTH]: [1.2059, 463.474, 1.211432, 52.5336, 0.0113, -1], [LILTA]: [1.5294, 661.995, 1.528038, 79.5207, 0.0191, 2.5], [IARN]: [2.8676, 1699.639, 2.868006, 70.0205, 0.0258, -1.5] };
  for (const [name, [a0, p0, a1, phase, e, tilt]] of Object.entries(was)) {
    const r = row(name), a = Number(r.distance_from_parent);
    assert.ok(Math.abs(a - a0 * (period(name) / p0) ** (2 / 3)) < 1e-12 && Math.abs(a - a1) < 5e-7, `${name}: ${a}`);
    assert.equal(Number(r.reference_phase_deg), phase); assert.equal(Number(r.orbital_eccentricity), e); assert.equal(Number(r.inclination_deg), tilt);
    assert.ok(!r.node_precession_period_years && !r.apsidal_precession_period_years, `${name}: its node and apsides are fixed`);
    // The fields worked out from these: nearest and farthest, mean speed (Eym's seconds), and the light's swing.
    assert.equal(r.periapsis_au, (a * (1 - e)).toFixed(4)); assert.equal(r.apoapsis_au, (a * (1 + e)).toFixed(4));
    assert.equal(r.mean_orbital_velocity_km_s, (2 * Math.PI * a * 149_597_870.7 / (period(name) * 86_400 * 365.2422 / 350)).toFixed(3));
    assert.ok(Math.abs(Number(r.peri_to_apo_flux_ratio) - ((1 + e) / (1 - e)) ** 2) < 6e-4);
  }
  // Eym, its moons and Iarn's moon are as they were.
  for (const [name, a, phase, p] of [[EYM, "1", "190", "350"], ["White Moon", "382029", "60", "25.9259"], ["Red Moon", "195000", "230", "9.5011"], ["Enoch", "620000", "345", "3.718"]]) { const r = row(name); assert.deepEqual([r.distance_from_parent, r.reference_phase_deg, r.orbital_period_days], [a, phase, p], name); }
});

test("the Great Alignment: all five in one line on 14 March of years 0, 68 and 136, and at no other time", () => {
  for (const year of [0, 68, 136]) {
    assert.ok(allFive(alignment(year)) < 0.5, `year ${year}: ${allFive(alignment(year))}°`);
    // Seen from Eym, Esonth, Lilta and Iarn stand opposite Mitkear, and Bruthi is beside it.
    const sky = wandererSky(eph, alignment(year));
    for (const name of [ESONTH, LILTA, IARN]) assert.ok(Math.abs(sky[name].elongationDeg - 180) <= 1.25, `${name}: ${sky[name].elongationDeg}°`);
    for (const name of [LILTA, IARN]) assert.ok(Math.abs(sky[name].elongationDeg - 180) <= 1, name);
    assert.ok(sky[BRUTHI].elongationDeg < 1);
  }
  // The model is Keplerian, so the repeat is exact.
  assert.ok(Math.abs(allFive(alignment(0)) - allFive(alignment(68))) < 1e-6 && Math.abs(allFive(alignment(68)) - allFive(alignment(136))) < 1e-6);
  // Every six hours from year 0 to year 136: within 10° only within a week of those three days.
  const period = GREAT_ALIGNMENT_YEARS * DAYS_PER_YEAR * DAY_MS, first = alignment(0); let near = 0;
  for (let t = calendarMs(0, 1, 1); t < calendarMs(137, 1, 1); t += 6 * HOUR) {
    if (allFive(t) >= 10) continue; near += 1;
    const off = (((t - first) % period) + period) % period; assert.ok(Math.min(off, period - off) <= 7 * DAY_MS, `within 10° at ${JSON.stringify(universalTimeParts(t))}`);
  }
  assert.ok(near > 0);
});

test("Bruthi passes Mitkear every 14 March, in front in even years and behind in odd ones, and never crosses its face", () => {
  for (let year = 0; year <= 136; year += 1) {
    // The nearest it comes to Mitkear's centre within four days of 14 March.
    let best = { deg: Infinity };
    for (let h = -96; h <= 96; h += 0.5) { const t = alignment(year, 0) + h * HOUR, deg = wandererSky(eph, t)[BRUTHI].elongationDeg; if (deg < best.deg) { const p = eph.at(t), toBruthi = Math.hypot(...p[BRUTHI].map((v, i) => v - p[EYM][i])); best = { deg, t, front: toBruthi < Math.hypot(...p[EYM]) }; } }
    assert.ok(best.deg < 1, `year ${year}: ${best.deg}°`); assert.equal(best.front, year % 2 === 0, `year ${year}`);
    assert.ok(wandererSky(eph, alignment(year))[BRUTHI].elongationDeg < 2);
    if (best.front) {
      // In front it passes about 0.86° from the centre, three discs clear: there is never a transit.
      assert.ok(Math.abs(best.deg - 0.86) < 0.01, `year ${year}: ${best.deg}°`); assert.ok(best.deg > 3 * sunRadiusDeg(best.t)); assert.ok(Math.abs(best.t - alignment(year)) < 3 * HOUR);
    } else {
      // Behind, on the far side of its orbit, it goes behind the disc itself (0.19° from the centre, two days
      // before): hidden, as anything that near Mitkear is, and no transit.
      assert.ok(Math.abs(best.deg - 0.19) < 0.01 && best.deg < sunRadiusDeg(best.t));
    }
  }
});

test("the Lesser Alignment: on 14 March of years 34, 102 and 170 four are in line and Esonth is beyond Mitkear", () => {
  for (const year of [34, 102, 170]) {
    const l = heliocentricLongitudes(eph, alignment(year));
    assert.ok(spreadDeg([l[EYM], l[BRUTHI], l[LILTA], l[IARN]]) < 0.5, `year ${year}`);
    // Esonth within 1° of superior conjunction: opposite Eym round Mitkear, and beside Mitkear in Eym's sky.
    assert.ok(spreadDeg([l[EYM], l[ESONTH] + 180]) < 1); assert.ok(wandererSky(eph, alignment(year))[ESONTH].elongationDeg < 1);
    assert.ok(allFive(alignment(year)) > 170);
  }
});

test("the almanac finds the true lines from the orbits: every four years, and the two alignments", () => {
  const kinds = {}; for (let year = 0; year <= 136; year += 1) { const { fromMs, toMs } = yearSpan(year); for (const line of trueLines(eph, fromMs, toMs)) { const p = universalTimeParts(line.timeMs); assert.deepEqual([p.month, p.day], [3, 14], `year ${year}`); assert.equal(p.year, year); kinds[year] = line.kind; } }
  for (let year = 0; year <= 136; year += 1) assert.equal(kinds[year], year % 68 === 0 ? "great" : year % 68 === 34 ? "lesser" : year % 4 === 0 ? "opposition" : undefined, `year ${year}`);
  const great = almanacForYear(rows, 68, { ephemeris: eph })[0]; assert.equal(great.type, "line"); assert.deepEqual(great.date, { year: 68, month: 3, day: 14 });
  assert.equal(describeAlmanacEvent(great, (n) => displayNameFor("Abydos", n)), "the Great Alignment: Bruthi, Eym, Esonth, Lilta and Iarn in one line with Mitkear");
  assert.match(describeAlmanacEvent(almanacForYear(rows, 34, { ephemeris: eph })[0], (n) => displayNameFor("Abydos", n)), /^the Lesser Alignment: Bruthi, Eym, Lilta and Iarn in one line with Mitkear, Esonth beyond it$/);
  assert.match(describeAlmanacEvent(almanacForYear(rows, 52, { ephemeris: eph })[0], (n) => displayNameFor("Abydos", n)), /^the Esonth opposition line: Bruthi, Eym and Esonth in one line with Mitkear$/);
});

test("the almanac lists the year's sky meetings: close together, clear of Mitkear, by rule", () => {
  let total = 0, triples = 0;
  for (let year = 40; year <= 72; year += 1) {
    const events = almanacForYear(rows, year, { ephemeris: eph }); assert.deepEqual(almanacForYear(rows, year, { ephemeris: eph }), events);
    for (const e of events.filter((x) => x.type === "meeting")) {
      total += 1; if (e.bodies.length >= 3) triples += 1;
      assert.equal(e.date.year, year); assert.ok(e.separationDeg <= MEETING_LIMIT_DEG[e.bodies.length] && e.elongationDeg >= MEETING_MIN_ELONGATION_DEG);
      // In three dimensions, from Eym: every pair of the group is within the limit then, and each is clear of Mitkear.
      const sky = wandererSky(eph, e.timeMs), dot = (a, b) => Math.acos(Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])) * 180 / Math.PI;
      for (const a of e.bodies) { assert.ok(sky[a].elongationDeg >= MEETING_MIN_ELONGATION_DEG); for (const b of e.bodies) assert.ok(dot(sky[a].dir, sky[b].dir) <= MEETING_LIMIT_DEG[e.bodies.length] + 1e-6); }
      // It is the closest moment: a day either side they are farther apart.
      const width = (t) => { const s = wandererSky(eph, t); let w = 0; for (const a of e.bodies) for (const b of e.bodies) w = Math.max(w, dot(s[a].dir, s[b].dir)); return w; };
      assert.ok(width(e.timeMs) <= width(e.timeMs - DAY_MS) && width(e.timeMs) <= width(e.timeMs + DAY_MS));
    }
  }
  assert.ok(total >= 20 && total <= 120, `${total} meetings in 33 years`); assert.ok(triples >= 1);
  // Three days after the Great Alignment the three outer wanderers stand together opposite Mitkear.
  const after = almanacForYear(rows, 68, { ephemeris: eph })[1]; assert.deepEqual(after.bodies, [ESONTH, LILTA, IARN]); assert.ok(after.elongationDeg > 170);
  const lines = almanacLines(almanacForYear(rows, 68, { ephemeris: eph }), (n) => displayNameFor("Abydos", n), monthName);
  assert.match(lines[0], /^14 March: the Great Alignment/); assert.match(lines[1], /^17 March: Esonth, Lilta and Iarn within 0\.8° opposite Mitkear, up all night$/);
  // The same as a search of the whole span at once; and the places are the system model's own.
  const { fromMs } = yearSpan(48), span = skyMeetings(eph, fromMs, fromMs + 2 * DAYS_PER_YEAR * DAY_MS).length; assert.equal(span, [48, 49].reduce((n, y) => n + almanacForYear(rows, y, { ephemeris: eph }).filter((e) => e.type === "meeting").length, 0));
  const t = alignment(50), model = buildSystemModel(rows, "Abydos", { referenceTimestampMs: t }), p = eph.at(t);
  for (const [name, v] of Object.entries(p)) { const q = model.byName.get(name).physical; assert.ok(Math.hypot(q.x - v[0], q.y - v[1], q.z - v[2]) < 1e-12, name); }
});
