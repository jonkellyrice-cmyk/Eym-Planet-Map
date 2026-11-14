import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSystemModel, parseCsv } from "../scripts/system-data.mjs";
import { DAY_MS, UNION_EPOCH_MS } from "../scripts/universal-time.mjs";
import { dot } from "../scripts/sky-frame.mjs";
import { airmass, bodyFrame, discCoverage, groundSky, localSolarHours, observerFrame, twilightLimit } from "../scripts/ground-sky.mjs";
import { createEphemeris, findMoonEvents } from "../scripts/moon-events.mjs";

const rows = parseCsv(readFileSync(new URL("../docs/system-orbital-distances.csv", import.meta.url), "utf8"));
const orientations = JSON.parse(readFileSync(new URL("../data/astronomy/epoch-orientations.json", import.meta.url), "utf8")).orientations;
const sky = JSON.parse(readFileSync(new URL("../data/stellar/constellations.json", import.meta.url), "utf8"));
const starfield = JSON.parse(readFileSync(new URL("../data/stellar/starfield.json", import.meta.url), "utf8"));
const HOUR = DAY_MS / 24;
const snap = (t, latDeg, lonDeg) => groundSky({ model: buildSystemModel(rows, "Abydos", { referenceTimestampMs: t, orientations }), sky, starfield, latDeg, lonDeg });
const near = (a, b, tol) => Math.abs(a - b) <= tol;

test("observer frames are orthonormal and the pole is overhead at the north pole", () => {
  const body = bodyFrame(sky.celestialPole, sky.sunPathPole, 123);
  for (const [a, b] of [[body.x, body.y], [body.y, body.z], [body.x, body.z]]) assert.ok(Math.abs(dot(a, b)) < 1e-9);
  const o = observerFrame(body, 37, -60);
  for (const [a, b] of [[o.zenith, o.north], [o.north, o.east], [o.zenith, o.east]]) assert.ok(Math.abs(dot(a, b)) < 1e-9);
  assert.ok(dot(observerFrame(body, 90, 0).zenith, body.z) > 1 - 1e-12);
});

test("Cynosure stands at the observer's latitude, all night and all year", () => {
  const pole = Number(sky.poleStar.star.slice(5)) - 1;
  for (const lat of [10, 30, 45, 60, 80]) for (const days of [0, 87.3, 175.6, 263.1]) {
    const s = snap(UNION_EPOCH_MS + days * DAY_MS, lat, 20);
    assert.ok(near(s.stars[pole].altDeg, lat, 1), `lat ${lat}: Cynosure at ${s.stars[pole].altDeg}`);
  }
});

test("the Sun rises and sets once a 24-hour day and is highest at local noon", () => {
  const altitudes = [], times = [];
  for (let h = 0; h <= 48; h += 0.5) { const s = snap(UNION_EPOCH_MS + h * HOUR, 45, 10); altitudes.push(s.sun.altDeg); times.push(localSolarHours(s)); }
  const crossings = altitudes.slice(1).filter((a, i) => (a > 0) !== (altitudes[i] > 0)).length;
  assert.equal(crossings, 4, "two sunrises and two sunsets in 48 hours");
  const peak = altitudes.indexOf(Math.max(...altitudes.slice(0, 49)));
  assert.ok(near(times[peak], 12, 0.6), `highest at ${times[peak]} sun time`);
  assert.ok(near((times[2] - times[0] + 24) % 24, 1, 0.05), "an hour of clock is an hour of sun time");
});

test("noon sun height swings by the 23.44° tilt over the 350-day year", () => {
  let highest = -90, lowest = 90;
  for (let day = 0; day < 350; day += 7) {
    let best = -90;
    for (let h = 0; h < 24; h += 0.25) best = Math.max(best, snap(UNION_EPOCH_MS + (day * 24 + h) * HOUR, 45, 0).sun.altDeg);
    highest = Math.max(highest, best); lowest = Math.min(lowest, best);
  }
  assert.ok(near(highest, 90 - 45 + 23.44, 1.5), `summer noon ${highest}`);
  assert.ok(near(lowest, 90 - 45 - 23.44, 1.5), `winter noon ${lowest}`);
});

test("daylight hides the stars, twilight reveals them, a dark night shows hundreds", () => {
  assert.ok(twilightLimit(30) < -3 && twilightLimit(-3) > twilightLimit(0) && twilightLimit(-15) > twilightLimit(-9) && twilightLimit(-30) === 5.6);
  assert.ok(airmass(90) < 1.01 && airmass(5) > 9);
  let day = null, night = null;
  for (let h = 0; h < 72 && !(day && night); h += 1) {
    const s = snap(UNION_EPOCH_MS + h * HOUR, 45, 10);
    if (!day && s.sun.altDeg > 30) day = s;
    if (!night && s.sun.altDeg < -25 && s.moons.every((m) => m.altDeg < 0 || m.illuminated < 0.3)) night = s;
  }
  assert.equal(day.stars.filter((s) => s.visible).length, 0);
  assert.ok(night.stars.filter((s) => s.visible).length > 350, `${night.stars.filter((s) => s.visible).length} stars on a dark night`);
});

test("like Earth's Moon, the White Moon is sometimes visible in daylight", () => {
  let seen = false;
  for (let h = 0; h < 28 * 24 && !seen; h += 3) {
    const s = snap(UNION_EPOCH_MS + h * HOUR, 30, 0);
    seen = s.sun.altDeg > 20 && s.moons.some((m) => m.name === "White Moon" && m.visible);
  }
  assert.ok(seen);
});

test("all four wandering stars appear in the night sky within their slowest return", () => {
  // Thraximundus orbits just outside Eym (463-day year), so Eym laps it only every 1/(1/350 − 1/463) ≈ 1,430
  // days: it spends long stretches behind the Sun, like Mars does from Earth (every 2.1 years).
  const seen = new Set();
  for (let day = 0; day < 1450 && seen.size < 4; day += 5) for (const h of [0, 4, 20]) {
    const s = snap(UNION_EPOCH_MS + (day * 24 + h) * HOUR, 20, 0);
    if (s.sun.altDeg < -12) for (const p of s.planets) if (p.visible) seen.add(p.name);
  }
  assert.deepEqual([...seen].sort(), ["Kandahar", "Ramses", "Thraximundus", "Tribune"]);
});

test("eclipses: a totally eclipsed moon goes dark and totality reveals stars", () => {
  const eph = createEphemeris(rows);
  const start = UNION_EPOCH_MS, events = findMoonEvents(eph, start, start + 2 * 350 * DAY_MS);
  const lunar = events.find((e) => e.type === "lunar-eclipse" && e.kind === "total" && e.moon === "White Moon");
  const solar = events.find((e) => e.type === "solar-eclipse" && e.kind === "total" && e.moon === "White Moon");
  // Stand where the moon is overhead for the lunar eclipse.
  const model = buildSystemModel(rows, "Abydos", { referenceTimestampMs: lunar.timeMs, orientations });
  const probe = groundSky({ model, sky, starfield, latDeg: 0, lonDeg: 0 });
  const moonDir = probe.moons[0].dir, b = probe.body;
  const lat = Math.asin(dot(moonDir, b.z)) * 180 / Math.PI, lon = Math.atan2(dot(moonDir, b.y), dot(moonDir, b.x)) * 180 / Math.PI;
  const eclipsed = groundSky({ model, sky, starfield, latDeg: lat, lonDeg: lon }).moons[0];
  assert.ok(eclipsed.umbralFraction > 0.95 && eclipsed.magnitude > -8, `umbra ${eclipsed.umbralFraction}, magnitude ${eclipsed.magnitude}`);
  // Stand where the moon's shadow axis meets the surface for the solar eclipse.
  const m2 = buildSystemModel(rows, "Abydos", { referenceTimestampMs: solar.timeMs, orientations });
  const E = ["x", "y", "z"].map((k) => m2.byName.get("Eventide").physical[k]), M = ["x", "y", "z"].map((k) => m2.byName.get("White Moon").physical[k]);
  const u = M.map((v) => v / Math.hypot(...M)), R = 6371 / 149597870.7, tc = dot(E, u);
  const miss = Math.hypot(...u.map((v, i) => v * tc - E[i])), t = tc - Math.sqrt(Math.max(0, R * R - miss * miss));
  const n = u.map((v, i) => v * t - E[i]), nl = Math.hypot(...n), b2 = groundSky({ model: m2, sky, starfield, latDeg: 0, lonDeg: 0 }).body;
  const lat2 = Math.asin(dot(n, b2.z) / nl) * 180 / Math.PI, lon2 = Math.atan2(dot(n, b2.y), dot(n, b2.x)) * 180 / Math.PI;
  const total = groundSky({ model: m2, sky, starfield, latDeg: lat2, lonDeg: lon2 });
  assert.ok(total.sun.coverage > 0.99, `coverage ${total.sun.coverage}`);
  assert.ok(total.limitingMagnitude > 0 && total.stars.some((s) => s.visible), "bright stars come out at totality");
  assert.ok(discCoverage(1, 1, 0) === 1 && discCoverage(1, 0.5, 0) === 0.25 && discCoverage(1, 1, 3) === 0);
});
