import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv } from "../scripts/system-data.mjs";
import { environmentField } from "../scripts/eym-seasons.mjs";
import { battleTide, coastalResponse, createTideClock, equilibriumParts, springIndex, tideHeightM, tideReport } from "../scripts/eym-tides.mjs";
import { buildBattleMap, geometryHash } from "../scripts/eym-battle-rules.mjs";
import { battleMapSpec } from "../scripts/eym-map-presets.mjs";
import { CAMPAIGN_START_MS, DAY_MS } from "../scripts/universal-time.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rows = parseCsv(read("docs/system-orbital-distances.csv"));
const orientations = JSON.parse(read("data/astronomy/epoch-orientations.json")).orientations;
const sky = JSON.parse(read("data/stellar/constellations.json"));
const asset = JSON.parse(read("data/planet-cartography/mitkear/eym.json")), field = environmentField(asset);
const clock = createTideClock({ rows, orientations, sky });
const HOUR_MS = DAY_MS / 24, T0 = CAMPAIGN_START_MS;
const folo = asset.settlements.find((s) => s.properName === "Folo"), garykPort = asset.settlements.find((s) => s.id === "garyk-settlement-48");
const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;

test("the Sun and both moons pull: the White Moon most, the Red Moon and the Sun about half as hard", () => {
  const [sun, white, red] = clock.bodiesAt(T0);
  assert.deepEqual([sun.name, white.name, red.name], ["Mitkear", "White Moon", "Red Moon"]);
  // Earth's moon raises a 0.357 m equilibrium tide, 0.246 m after the planet's yielding.
  assert.ok(white.amplitudeM > 0.18 && white.amplitudeM < 0.25, `White Moon ${white.amplitudeM.toFixed(3)} m`);
  assert.ok(red.amplitudeM / white.amplitudeM > 0.4 && red.amplitudeM / white.amplitudeM < 0.7);
  assert.ok(sun.amplitudeM / white.amplitudeM > 0.4 && sun.amplitudeM / white.amplitudeM < 0.7);
  for (const b of [sun, white, red]) assert.ok(Math.abs(b.latDeg) < 35 && Math.abs(b.lonDeg) <= 180, `${b.name} overhead at ${b.latDeg.toFixed(1)}°, ${b.lonDeg.toFixed(1)}°`);
});

test("the equilibrium tide: highest under the body and opposite it, lowest a quarter of the way round", () => {
  const body = [{ latDeg: 0, lonDeg: 30, amplitudeM: 1 }];
  assert.ok(Math.abs(equilibriumParts(body, 0, 30).semidiurnal - 0.75) < 1e-9);
  assert.ok(Math.abs(equilibriumParts(body, 0, -150).semidiurnal - 0.75) < 1e-9);
  assert.ok(Math.abs(equilibriumParts(body, 0, 120).semidiurnal + 0.75) < 1e-9);
  assert.equal(equilibriumParts(body, 30, 30).diurnal, 0, "no daily part when the body is over the equator");
  assert.ok(equilibriumParts([{ latDeg: 20, lonDeg: 0, amplitudeM: 1 }], 40, 0).diurnal > 0, "a daily part when it is not");
  assert.ok(springIndex([{ lonDeg: 0, amplitudeM: 1 }, { lonDeg: 180, amplitudeM: 1 }]) > 0.99 && springIndex([{ lonDeg: 0, amplitudeM: 1 }, { lonDeg: 90, amplitudeM: 1 }]) < 0.01);
});

test("coasts behind a wide shelf have large tides; steep coasts and open ocean small ones; inland none", () => {
  const caren = coastalResponse(asset, field, folo.lat, folo.lon), garyk = coastalResponse(asset, field, garykPort.lat, garykPort.lon);
  assert.ok(caren.shelfKm > garyk.shelfKm && caren.gain > garyk.gain, `Folo shelf ${caren.shelfKm} km, Garyk's port ${garyk.shelfKm} km`);
  const ranges = (r) => Array.from({ length: 28 }, (_, d) => tideReport(clock, r, T0 + d * 2 * DAY_MS).rangeM);
  const atFolo = ranges(caren), atGaryk = ranges(garyk);
  assert.ok(mean(atFolo) > 1.4 && mean(atFolo) < 3.5, `Folo's mean range ${mean(atFolo).toFixed(2)} m`);
  assert.ok(mean(atGaryk) > 0.4 && mean(atGaryk) < 1.6, `Garyk's port ${mean(atGaryk).toFixed(2)} m`);
  assert.ok(Math.max(...atFolo) > 2.5 * Math.min(...atFolo), "springs and neaps");
  const inland = field.cells.filter((c) => !c.ocean && Math.abs(c.lat) < 40).reduce((a, b) => (b.continentality > a.continentality ? b : a));
  assert.equal(coastalResponse(asset, field, inland.lat, inland.lon), null);
});

test("about two tides a day, the bigger ones when the bodies pull in line", () => {
  const r = coastalResponse(asset, field, folo.lat, folo.lon);
  let highs = 0, prev = tideHeightM(clock, r, T0 - 600_000), cur = tideHeightM(clock, r, T0);
  for (let t = T0 + 600_000; t < T0 + 10 * DAY_MS; t += 600_000) { const next = tideHeightM(clock, r, t); if (cur > prev && cur >= next) highs += 1; prev = cur; cur = next; }
  assert.ok(highs >= 15 && highs <= 22, `${highs} high waters in 10 days`);
  const spring = [], neap = [];
  for (let d = 0; d < 56; d += 1) { const rep = tideReport(clock, r, T0 + d * DAY_MS); (rep.spring > 0.75 ? spring : rep.spring < 0.4 ? neap : []).push(rep.rangeM); }
  assert.ok(spring.length && neap.length && mean(spring) > 1.6 * mean(neap), `springs ${mean(spring).toFixed(2)} m, neaps ${mean(neap).toFixed(2)} m`);
});

test("a tide report: the height now, which way it is going, the next high and low water", () => {
  const r = coastalResponse(asset, field, folo.lat, folo.lon), rep = tideReport(clock, r, T0);
  assert.equal(rep.heightM, tideHeightM(clock, r, T0));
  for (const e of [rep.nextHigh, rep.nextLow]) assert.ok(e && e.timeMs > T0 && e.timeMs < T0 + 15 * HOUR_MS);
  assert.ok(rep.nextHigh.heightM > rep.nextLow.heightM);
  assert.match(rep.words, /^[+−]\d+\.\d m, (rising|falling); (high|low) water [+−]\d+\.\d m at \d\d:\d\d, (high|low) water [+−]\d+\.\d m at \d\d:\d\d; (spring tides|neap tides|between springs and neaps), range \d+\.\d m$/);
  assert.deepEqual(tideReport(clock, r, T0), rep, "the same moment, the same tide");
  assert.deepEqual(Object.keys(battleTide(rep)).sort(), ["heightM", "rangeM", "rising", "turn"]);
});

test("battle maps on the shore: flats at low water, surf over the beach at high water, unchanged at mean", () => {
  const spec = battleMapSpec(), tideNote = (m) => m.notes.find((n) => /^(Low tide|High tide|Half tide|The tide is)/.test(n));
  // A battle map is about 45 m across: find the waterline west of Folo by halving the gap between land and sea.
  const seaAt = (lon) => buildBattleMap(asset, { center: [folo.lat, lon], spec }).grid.cover[Math.floor(spec.rows / 2) * spec.columns + Math.floor(spec.columns / 2)] === 0;
  let land = folo.lon - 0.04, water = folo.lon - 0.08;
  assert.ok(!seaAt(land) && seaAt(water));
  for (let k = 0; k < 14; k += 1) { const mid = (land + water) / 2; if (seaAt(mid)) water = mid; else land = mid; }
  const center = [folo.lat, water];
  assert.ok(buildBattleMap(asset, { center, spec }).grid.cover.some((c) => c !== 0), "a battle map on Folo's shore");
  const plain = buildBattleMap(asset, { center, spec }), count = (m, ground) => m.grid.ground.filter((g) => g === ground).length;
  const low = buildBattleMap(asset, { center, spec, conditions: { tide: { heightM: -1.2, rangeM: 2.6, rising: false, turn: "low water at 19:40" } } });
  const high = buildBattleMap(asset, { center, spec, conditions: { tide: { heightM: 1.1, rangeM: 2.6, rising: true, turn: "high water at 13:35" } } });
  const still = buildBattleMap(asset, { center, spec, conditions: { tide: { heightM: 0, rangeM: 2.6, rising: true, turn: "" } } });
  const flats = Math.max(count(low, "wet sand (tidal flat)"), count(low, "tidal mud"), count(low, "wet rock and weed"));
  assert.ok(flats > 0 && low.grid.cover.filter((c) => c === 0).length < plain.grid.cover.filter((c) => c === 0).length, `${flats} squares of flats`);
  assert.match(tideNote(low), /^Low tide \(−1\.2 m, falling; low water at 19:40\): the sea has drawn back up to \d+ ft, uncovering \d+ squares of /);
  assert.ok(count(high, "shallow surf") > 0 || /waterline hardly moves/.test(tideNote(high)));
  assert.equal(geometryHash(still), geometryHash(plain), "at mean sea level the map is as it was");
  assert.match(tideNote(still), /^Half tide \(\+0\.0 m, rising\): the waterline is where the map shows it\.$/);
  assert.notEqual(geometryHash(low), geometryHash(plain), "the tide changes the field");
});
