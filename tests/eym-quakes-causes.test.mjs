// Earthquakes by plate rate and fault length, and great eruptions that cool the weather (owner's direction of
// 20 November 2026, the causal-chain audit, checks 7 and 8). Causal tests.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attachGeology } from "../scripts/cartography-asset.mjs";
import { COOLING_C, FAULTS, REFERENCE_MM_YR, boundaryPoints, faultMeasure, faultQuakes, faultScale, greatEruptions, tremorsAt, volcanicCoolingC } from "../scripts/eym-quakes.mjs";
import { environmentField } from "../scripts/eym-seasons.mjs";
import { weatherAt } from "../scripts/eym-weather.mjs";
import { DAY_MS, DAYS_PER_YEAR } from "../scripts/universal-time.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8")), DIR = "data/planet-cartography/mitkear/";
const asset = read(`${DIR}eym.json`); attachGeology(asset, read(`${DIR}${asset.geologyFile}`));
const YEAR_MS = DAYS_PER_YEAR * DAY_MS, sum = (list) => list.reduce((a, b) => a + b, 0);

test("a faster plate boundary has more earthquakes, and a longer unbroken stretch can make a greater one", () => {
  const slow = faultMeasure("trenches", 10, 2000), set = faultMeasure("trenches", REFERENCE_MM_YR.trenches, 2000), fast = faultMeasure("trenches", 150, 2000);
  assert.ok(slow.rate === 0.2 && set.rate === 1 && fast.rate === 3);
  // The same fault point over two hundred years at each speed: quakes in proportion to the speed.
  const count = (scale) => sum(Array.from({ length: 200 }, (_, year) => faultQuakes("trenches", 7, [10, 20], year, scale).length));
  const [few, some, many] = [slow, set, fast].map(count);
  assert.ok(many > some * 2.4 && some > few * 3.5, `${few} / ${some} / ${many} quakes in 200 years at 10, 50 and 150 mm a year`);
  // The length that can break at once sets the greatest quake: a short stretch cannot make a great one.
  const short = faultMeasure("collisions", 30, 60), long = faultMeasure("collisions", 30, 3000);
  assert.ok(short.maxMagnitude < 7.9 && long.maxMagnitude === FAULTS.collisions.maxMagnitude && faultMeasure("trenches", 50, 150).maxMagnitude < faultMeasure("trenches", 50, 1500).maxMagnitude);
  const greatest = (scale) => Math.max(0, ...Array.from({ length: 3000 }, (_, year) => faultQuakes("collisions", 3, [0, 0], year, scale)).flat().map((q) => q.magnitude));
  assert.ok(greatest(short) <= short.maxMagnitude && greatest(short) < greatest(long), `${greatest(short)} on the short stretch, ${greatest(long)} on the long`);
  // Without a measure a fault is as its kind (the small faults inside Caren are not on a plate boundary).
  assert.deepEqual(faultScale(asset.geology, "intraplate", 0), { rate: 1, maxMagnitude: FAULTS.intraplate.maxMagnitude });
});

test("Eym's own boundaries carry their plates' speeds: the fast ones shake more than the slow ones", () => {
  const b = boundaryPoints(asset.geology);
  for (const kind of ["trenches", "collisions", "ridges"]) {
    const scales = b.scales[kind]; assert.equal(scales.length, b[kind].length);
    const speeds = scales.map((s) => s.speedMmYr); assert.ok(Math.max(...speeds) > 2 * (speeds.slice().sort((x, y) => x - y)[speeds.length >> 1] || 1) * 0.8 && speeds.every((v) => v >= 0 && v <= 255), `${kind}: speeds up to ${Math.max(...speeds)} mm a year`);
    for (const s of scales) assert.ok(s.rate >= 0.2 && s.rate <= 3 && s.maxMagnitude <= FAULTS[kind].maxMagnitude && s.maxMagnitude >= 4.5);
  }
  // Fifty years of the catalogue at the twenty fastest and the twenty slowest trench points.
  const order = b.scales.trenches.map((s, i) => [s.speedMmYr, i]).sort((x, y) => x[0] - y[0]), quakes = (list) => sum(list.map(([, i]) => sum(Array.from({ length: 50 }, (_, year) => faultQuakes("trenches", i, b.trenches[i], year, b.scales.trenches[i]).length))));
  const slow = quakes(order.slice(0, 20)), fast = quakes(order.slice(-20));
  assert.ok(fast > slow * 3, `${slow} quakes at the slowest twenty points, ${fast} at the fastest`);
  // And what is felt at a place uses the same measures: the same again when asked again.
  const at = b.trenches[order.at(-1)[1]], felt = tremorsAt(asset.geology, { lat: at[0], lon: at[1], fromMs: 60 * YEAR_MS, toMs: 62 * YEAR_MS });
  assert.ok(felt.quakes.length > 0); assert.deepEqual(tremorsAt(asset.geology, { lat: at[0], lon: at[1], fromMs: 60 * YEAR_MS, toMs: 62 * YEAR_MS }), felt);
});

test("a great eruption cools the following years, most in its first, and the weather shows it", () => {
  const great = greatEruptions(asset.geology, 0, 300 * YEAR_MS);
  // As rare as on Earth: a cataclysmic eruption about once in ten years, a colossal one about once in a century.
  const v5 = great.filter((e) => e.vei === 5).length, v6 = great.filter((e) => e.vei >= 6).length;
  assert.ok(v5 >= 12 && v5 <= 60 && v6 >= 0 && v6 <= 8, `${v5} of VEI 5 and ${v6} of VEI 6 in 300 years`);
  // A lone great eruption (none other within four years before it): no cooling before, the most within a year, fading over three.
  const lone = great.find((e, k) => (k === 0 || e.timeMs - great[k - 1].timeMs > 4.2 * YEAR_MS) && (k === great.length - 1 || great[k + 1].timeMs - e.timeMs > 3.2 * YEAR_MS)); assert.ok(lone, "a great eruption standing alone");
  const lat = lone.at[0], at = (years) => volcanicCoolingC(asset.geology, lone.timeMs + years * YEAR_MS, lat);
  assert.equal(at(-0.1), 0);
  assert.ok(at(0.3) <= -0.6 * COOLING_C[lone.vei] && at(0.3) < at(1.5) && at(1.5) < at(3) && at(3) < 0 && at(3) > -0.2 * COOLING_C[lone.vei], `${at(0.3)}, ${at(1.5)}, ${at(3)} °C after 0.3, 1.5 and 3 years`);
  // A greater eruption cools more; an eruption far from the equator cools mostly its own half of the world.
  assert.ok(COOLING_C[6] > 3 * COOLING_C[5]);
  const far = great.find((e) => Math.abs(e.at[0]) > 30); if (far) { const t = far.timeMs + 0.4 * YEAR_MS, own = volcanicCoolingC(asset.geology, t, far.at[0]), other = volcanicCoolingC(asset.geology, t, -far.at[0]); assert.ok(own <= other, `${own} °C in its own hemisphere, ${other} °C in the other`); }
  // The weather at a place is cooler by just that, the same weather otherwise.
  const field = environmentField(asset), cell = field.cellAt(lat, lone.at[1]), timeMs = lone.timeMs + 0.3 * YEAR_MS, ctx = { cell, declinationDeg: 0, solarHour: 12, timeMs, anomalyC: 0 };
  const plain = weatherAt([], lat, lone.at[1], ctx), veiled = weatherAt([], lat, lone.at[1], { ...ctx, geology: asset.geology });
  assert.ok(Math.abs((veiled.tempC - plain.tempC) - at(0.3)) < 0.06 && veiled.tempC < plain.tempC, `${plain.tempC} °C without the veil, ${veiled.tempC} °C with it`);
  assert.equal(field.geology, asset.geology);
});
