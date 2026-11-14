import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv } from "../scripts/system-data.mjs";
import { DAY_MS, UNION_EPOCH_MS } from "../scripts/universal-time.mjs";
import { DOUBLE_EVENT_WINDOW_HOURS, createEphemeris, findMoonEvents, moonGeometry, phaseName, tidalStrength } from "../scripts/moon-events.mjs";

const rows = parseCsv(readFileSync(new URL("../docs/system-orbital-distances.csv", import.meta.url), "utf8"));
const eph = createEphemeris(rows);
const YEARS = 20;
const START = UNION_EPOCH_MS, END = START + YEARS * 350 * DAY_MS;
const events = findMoonEvents(eph, START, END);
const of = (type, moon) => events.filter((e) => e.type === type && (!moon || e.moon === moon));
const gapsDays = (times) => times.slice(1).map((t, i) => (t - times[i]) / DAY_MS);
const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;

test("the White Moon's phases repeat every 28 days on average, varying like Earth's Moon", () => {
  const gaps = gapsDays(of("new", "White Moon").map((e) => e.timeMs));
  assert.ok(Math.abs(mean(gaps) - 28) < 0.01, `mean ${mean(gaps)}`);
  assert.ok(Math.min(...gaps) > 27.4 && Math.max(...gaps) < 28.6, "variation within about ±0.5 day");
  const red = gapsDays(of("new", "Red Moon").map((e) => e.timeMs));
  assert.ok(Math.abs(mean(red) - 9.766) < 0.01, `red mean ${mean(red)}`);
});

test("each moon runs new → first quarter → full → last quarter in order", () => {
  const order = ["new", "first-quarter", "full", "last-quarter"];
  for (const moon of ["White Moon", "Red Moon"]) {
    const sequence = events.filter((e) => e.moon === moon && order.includes(e.type)).map((e) => order.indexOf(e.type));
    sequence.slice(1).forEach((value, i) => assert.equal(value, (sequence[i] + 1) % 4, `${moon} at ${i}`));
  }
});

test("phase names and illumination agree with the geometry", () => {
  assert.equal(phaseName(0), "New"); assert.equal(phaseName(180), "Full"); assert.equal(phaseName(95), "First quarter"); assert.equal(phaseName(300), "Waning crescent");
  for (const e of of("full", "White Moon").slice(0, 10)) assert.ok(moonGeometry(eph, e.timeMs)[0].illuminated > 0.99);
  for (const e of of("new", "White Moon").slice(0, 10)) assert.ok(moonGeometry(eph, e.timeMs)[0].illuminated < 0.01);
});

test("the White Moon eclipses at Earth's rate, with total, annular and partial solar eclipses", () => {
  const solar = of("solar-eclipse", "White Moon"), lunar = of("lunar-eclipse", "White Moon");
  assert.ok(solar.length / YEARS > 1.8 && solar.length / YEARS < 3.2, `${solar.length / YEARS} solar per year`);
  assert.ok(lunar.length / YEARS > 1.8 && lunar.length / YEARS < 3.2, `${lunar.length / YEARS} lunar per year`);
  for (const kind of ["total", "annular", "partial"]) assert.ok(solar.some((e) => e.kind === kind), `no ${kind} solar eclipse`);
  for (const kind of ["total", "partial", "penumbral"]) assert.ok(lunar.some((e) => e.kind === kind), `no ${kind} lunar eclipse`);
});

test("the Red Moon eclipses a few times a year and is too small to blot out the Sun", () => {
  const solar = of("solar-eclipse", "Red Moon"), lunar = of("lunar-eclipse", "Red Moon");
  assert.ok(solar.length / YEARS > 3 && solar.length / YEARS < 8, `${solar.length / YEARS} solar per year`);
  assert.ok(lunar.length / YEARS > 3 && lunar.length / YEARS < 8, `${lunar.length / YEARS} lunar per year`);
  assert.ok(!solar.some((e) => e.kind === "total"));
});

test("eclipses happen only at new (solar) and full (lunar) moon", () => {
  for (const [type, phase] of [["solar-eclipse", "new"], ["lunar-eclipse", "full"]]) {
    for (const e of of(type)) {
      const nearest = Math.min(...of(phase, e.moon).map((p) => Math.abs(p.timeMs - e.timeMs))) / DAY_MS;
      assert.ok(nearest < 1.5, `${type} ${nearest} days from ${phase}`);
    }
  }
});

test("eclipse seasons drift through the calendar as the White Moon's nodes regress", () => {
  const solar = of("solar-eclipse", "White Moon").map((e) => e.timeMs);
  // Group into seasons, then measure the spacing of season midpoints: the eclipse half-year.
  const seasons = [];
  for (const t of solar) { const last = seasons.at(-1); if (last && t - last.at(-1) < 60 * DAY_MS) last.push(t); else seasons.push([t]); }
  const mids = seasons.map((s) => mean(s));
  const halfYear = mean(gapsDays(mids));
  // Earth: 173.3 days (eclipse year 346.6). Eym: 350 / (1 + 1/18.8) / 2 ≈ 166 days, so seasons come ~17 days earlier each year.
  assert.ok(halfYear > 155 && halfYear < 175, `eclipse half-year ${halfYear}`);
  assert.ok(halfYear < 175, "seasons arrive earlier each calendar year");
});

test("double full moons and double dark nights are occasional events", () => {
  for (const type of ["double-full", "double-dark"]) {
    const list = of(type);
    assert.ok(list.length / YEARS > 0.8 && list.length / YEARS < 1.8, `${type}: ${list.length / YEARS} per year`);
    assert.ok(list.every((e) => e.offsetHours <= DOUBLE_EVENT_WINDOW_HOURS));
    assert.ok(Math.min(...gapsDays(list.map((e) => e.timeMs))) > 60, `${type} too close together`);
  }
});

test("the Red Moon sometimes passes in front of the White Moon", () => {
  const list = of("occultation");
  assert.ok(list.length / YEARS > 2 && list.length / YEARS < 12, `${list.length / YEARS} per year`);
});

test("tides match Earth's on average, with great and slack tides from the two moons", () => {
  const samples = [];
  for (let t = START; t < START + 5 * 350 * DAY_MS; t += 6 * 3_600_000) samples.push(tidalStrength(eph, t));
  const earth = [];
  for (let i = 0; i < 3600; i += 1) earth.push(Math.hypot(1 + 0.46 * Math.cos(i * Math.PI / 1800), 0.46 * Math.sin(i * Math.PI / 1800)));
  const rms = (values) => Math.sqrt(mean(values.map((v) => v * v)));
  assert.ok(Math.abs(mean(samples) / mean(earth) - 1) < 0.05, `mean ${mean(samples)} vs Earth ${mean(earth)}`);
  assert.ok(Math.abs(rms(samples) / rms(earth) - 1) < 0.05, `rms ${rms(samples)} vs Earth ${rms(earth)}`);
  assert.ok(Math.max(...samples) > 1.6 && Math.min(...samples) < 0.3, "great and slack tides");
});
