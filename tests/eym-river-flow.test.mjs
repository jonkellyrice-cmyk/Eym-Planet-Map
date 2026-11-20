import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { attachDrainage, attachFlow, attachGeology, attachWind, flowFileName } from "../scripts/cartography-asset.mjs";
import { buildLocalTile, localContext, riverHere } from "../scripts/eym-local-detail.mjs";
import { ENSO_SHORE, battleRiver, describeRiver, flowClimate, riverStage, waterBalance, yearWetness } from "../scripts/eym-river-flow.mjs";
import { buildBattleMap, waterLineScale } from "../scripts/eym-battle-rules.mjs";
import { battleMapSpec } from "../scripts/eym-map-presets.mjs";
import { fromLocal } from "../scripts/eym-surface.mjs";
import { flowSourcesSha256 } from "../tools/generate-eym-flow.mjs";
import { DAY_MS, makeUniversalTimeMs } from "../scripts/universal-time.mjs";

const root = new URL("../", import.meta.url), read = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const asset = read("data/planet-cartography/abydos/eventide.json");
attachGeology(asset, read(`data/planet-cartography/abydos/${asset.geologyFile}`));
attachDrainage(asset, read("data/planet-cartography/abydos/eventide-drainage.json"));
attachWind(asset, read("data/planet-cartography/abydos/eventide-wind.json"));
const flowPath = `data/planet-cartography/abydos/${flowFileName("eventide.json")}`;
attachFlow(asset, read(flowPath));
const YEAR54 = makeUniversalTimeMs({ year: 54, month: 1, day: 1 }), DELTA = [14.25, -86.16];

test("the rivers' monthly climate is up to date with what it is made from, small, and covers Caren and Garyk", () => {
  assert.equal(asset.flow.sourcesSha256, flowSourcesSha256(), "npm run build would make it again");
  assert.ok(statSync(new URL(flowPath, root)).size <= 40_000);
  const climate = flowClimate(asset);
  assert.ok(climate.cells.size > 150);
  for (const c of climate.cells.values()) { assert.equal(c.rainMm.length, 12); assert.ok(c.rainMm.every((v) => v >= 0) && c.tempC.every((t) => t > -40 && t < 45)); }
});

test("the water balance: snow lies in the cold and melts in spring; groundwater keeps a river running through the dry months", () => {
  const cold = waterBalance([80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80, 80], [-10, -8, -4, 0, 5, 10, 14, 15, 10, 4, -3, -8]);
  assert.ok(cold.snowMm[1] > 100 && cold.snowMm[7] === 0, "snow builds up in winter and is gone by summer");
  const peak = cold.runoffMm.indexOf(Math.max(...cold.runoffMm)); assert.ok(peak >= 3 && peak <= 5, `the melt brings the high water in spring (month ${peak})`);
  const monsoon = waterBalance([10, 10, 10, 10, 10, 400, 450, 450, 400, 50, 10, 10], new Array(12).fill(25));
  assert.ok(monsoon.runoffMm[11] > 0 && monsoon.baseMm[11] > 0, "after the rains the groundwater still feeds the river");
  assert.ok(Math.max(...monsoon.runoffMm) > 10 * monsoon.runoffMm[4], "a flood season and a low season");
});

test("a Garyk river through the year: a flood season, months of low water, and wading only when it is low", () => {
  const stages = [], fords = [];
  for (let d = 0; d < 350; d += 7) { const h = riverHere(asset, ...DELTA, YEAR54 + d * DAY_MS, 25); stages.push(h.stage); fords.push(h.fordable); }
  for (const s of ["low", "high"]) assert.ok(stages.includes(s), `${s}: ${stages.join(",")}`);
  assert.ok(stages.filter((s) => s === "low").length > stages.length / 3, "half the year is low water");
  assert.ok(fords.some(Boolean) && !fords.every(Boolean), "fordable for part of the year");
  // The flood comes in the wettest years, not in the driest.
  const floodDays = (year) => { let n = 0; for (let d = 0; d < 350; d += 2) if (riverHere(asset, ...DELTA, makeUniversalTimeMs({ year, month: 1, day: 1 }) + d * DAY_MS, 25).stage === "flood") n += 1; return n; };
  assert.ok(floodDays(55) > 0 && floodDays(56) === 0, "a flood in year 55, none in the dry year 56");
  const here = riverHere(asset, ...DELTA, YEAR54, 25);
  assert.match(describeRiver(here), /bed \d+ m/); assert.equal(describeRiver(null), "No river within 3 km");
});

test("rivers' beds follow the water they carry; some years are wetter than others", () => {
  const courses = localContext(asset).rivers.filter((r) => r.baseWidthM);
  assert.ok(courses.length > 20);
  for (const r of courses) { const f = r.widthM / r.baseWidthM; assert.ok(f >= 0.69 && f <= 1.36, `width factor ${f}`); }
  assert.ok(courses.some((r) => r.widthM > r.baseWidthM * 1.1) && courses.some((r) => r.widthM < r.baseWidthM * 0.95), "wetter catchments widen their beds, drier ones narrow them");
  const wet = []; for (let k = 0; k < 12; k += 1) wet.push(yearWetness(asset, [-7, 0.6], YEAR54 + k * 350 * DAY_MS));
  assert.ok(Math.max(...wet) - Math.min(...wet) > 0.25 && wet.every((w) => w >= 0.6 && w <= 1.5), wet.join(" "));
  // A river's stage follows its flow against its mean and its bankfull flow.
  const year = { flowM3s: new Array(12).fill(100), meanM3s: 100, bankfullM3s: 200 };
  assert.equal(riverStage(year, 50, YEAR54, 1).stage, "normal"); assert.equal(riverStage(year, 50, YEAR54, 0.4).stage, "low"); assert.equal(riverStage(year, 50, YEAR54, 2.2).stage, "flood");
});

test("Caren is the western shore of the oscillation's basin: all of it has dry years when the basin warms, and Garyk has none of it", () => {
  const basin = asset.climate.enso.basin, years = 100, span = (lat, lon) => { const w = []; for (let k = 0; k < years; k += 1) w.push(yearWetness(asset, [lat, lon], YEAR54 + k * 350 * DAY_MS)); return { lo: Math.min(...w), hi: Math.max(...w), w }; };
  // The basin is the ocean east of Caren; Caren's coasts lie within the shore's reach of its western end.
  assert.ok(basin.westLon > 0 && basin.westLon < 10 && basin.widthDeg > 100); assert.equal(ENSO_SHORE, 0.15); assert.ok(7 + basin.westLon < ENSO_SHORE * basin.widthDeg);
  const places = [[0, -6.5], [-7, 0.6], [0, 6.5], [12, 0], [-9, 0]].map(([lat, lon]) => span(lat, lon));
  for (const p of places) { assert.ok(p.lo < 0.75 && p.hi > 1.3, `${p.lo} to ${p.hi}`); assert.ok(p.w.every((v) => v >= 0.6 && v <= 1.5)); }
  // West coast and east coast swing together (one shore), dry in the same years.
  const [west, , east] = places; let same = 0; for (let k = 0; k < years; k += 1) if ((west.w[k] < 1) === (east.w[k] < 1)) same += 1; assert.ok(same >= 0.7 * years, `${same}`);
  // Garyk, far to the west, keeps only the ordinary year-to-year swing; so does the far side of the world beyond the eastern shore.
  for (const [lat, lon] of [[9, -78], [15, -67], [15, -90], [0, basin.westLon + basin.widthDeg * (1 + ENSO_SHORE) + 10]]) { const p = span(lat, lon); assert.ok(p.lo >= 0.84 && p.hi <= 1.16, `${lat}, ${lon}: ${p.lo} to ${p.hi}`); }
  // The eastern shore is wet when the western is dry.
  const eastShore = span(0, basin.westLon + basin.widthDeg + 5); let opposite = 0; for (let k = 0; k < years; k += 1) if ((west.w[k] < 1) !== (eastShore.w[k] < 1)) opposite += 1; assert.ok(opposite >= 0.6 * years, `${opposite}`);
});

test("battle maps follow the stream's stage: a dry bed, a swollen stream, and floodwater over the low ground", () => {
  const c0 = [14.45, -78.3], tile = buildLocalTile(asset, { center: c0, sizeKm: 4, resolutionM: 25 }), stream = [...tile.streams].sort((a, b) => b.areaKm2 - a.areaKm2)[0];
  const at = stream.local[Math.floor(stream.local.length / 2)], center = fromLocal(c0, at[0], at[1]), spec = battleMapSpec({ size: "large" });
  const grounds = (river) => { const m = buildBattleMap(asset, { center, spec, conditions: river ? { river } : {} }), g = {}; m.grid.ground.forEach((x) => { g[x] = (g[x] ?? 0) + 1; }); return { g, notes: m.notes }; };
  const base = grounds(null); assert.ok(base.g["shallow stream"] > 0);
  const dry = grounds({ stage: "dry", depthM: 0, fillShare: 0.15, fordable: true, bedWidthM: 8, words: "dry" }); assert.equal(dry.g["dry stream bed"], base.g["shallow stream"]); assert.ok(dry.notes.some((n) => /bed lies dry/.test(n)));
  const high = grounds({ stage: "high", depthM: 1, fillShare: 1, fordable: false, bedWidthM: 8, words: "high" }); assert.equal(high.g["swollen stream"], base.g["shallow stream"]);
  const flood = grounds({ stage: "flood", depthM: 2, fillShare: 1, fordable: false, bedWidthM: 8, words: "in flood" });
  assert.ok(flood.g["floodwater (knee-deep)"] > 0 && flood.g["stream in spate (torrent)"] > 0); assert.ok(flood.notes.some((n) => /burst its banks/.test(n)));
  // The pictures draw the water lines at the stage: none over a dry bed, wider in flood, as usual without a stage.
  assert.equal(waterLineScale({ river: { stage: "dry" } }, "stream"), 0); assert.ok(waterLineScale({ river: { stage: "flood" } }, "stream") > 1); assert.equal(waterLineScale({}, "river"), 1);
  // On a river at low water the squares can be waded; a river report becomes battle conditions only near the water.
  assert.equal(battleRiver(null), null); assert.equal(battleRiver({ distKm: 2 }), null);
  const conditions = battleRiver({ stage: "low", depthM: 0.83, fillShare: 0.512, fordable: true, bedWidthM: 168.4, words: "low", distKm: 0.1 });
  assert.deepEqual(conditions, { stage: "low", depthM: 0.8, fillShare: 0.51, fordable: true, bedWidthM: 168, words: "low" });
});

test("springs rise where porous rock holds groundwater, and not on hard rock", () => {
  const count = (center) => buildLocalTile(asset, { center, sizeKm: 4, resolutionM: 25 }).structures.filter((s) => s.kind === "spring").length;
  assert.ok(count([-3.38, -0.77]) > 0, "Caren's limestone");
  assert.equal(count([14.6, -76.4]), 0, "Garyk's metamorphic mountains");
});
