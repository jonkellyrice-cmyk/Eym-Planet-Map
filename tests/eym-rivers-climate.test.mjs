// Rivers carry the climate (owner's direction of 20 November 2026): a river's water is the runoff of the land it
// truly drains (rain less what soil and plant take), not its catchment's area alone. Causal tests: changing the
// cause changes the effect, in the right direction and by a meaningful amount.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WORLD_INPUTS } from "../scripts/eym-world-inputs.mjs";
import { attachDrainage, attachFlow, attachGeology, attachWind } from "../scripts/cartography-asset.mjs";
import { flowClimate, riverYear, waterBalance, yearRunoffMm } from "../scripts/eym-river-flow.mjs";
import { channelWidthM, drainageChannels, riverCatchments } from "../scripts/eym-landforms.mjs";
import { localContext, riverHere } from "../scripts/eym-local-detail.mjs";
import { rainReader } from "../scripts/eym-rain.mjs";
import { environmentField } from "../scripts/eym-seasons.mjs";
import { makeUniversalTimeMs } from "../scripts/universal-time.mjs";
import { DRAINAGE_SOURCES, waterKept } from "../tools/generate-eym-drainage.mjs";
import { FLOW_SOURCES } from "../tools/generate-eym-flow.mjs";

const root = new URL("../", import.meta.url), read = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8")), DIR = "data/planet-cartography/mitkear/";
const asset = read(`${DIR}eym.json`); attachGeology(asset, read(`${DIR}${asset.geologyFile}`)); attachDrainage(asset, read(`${DIR}eym-drainage.json`)); attachWind(asset, read(`${DIR}eym-wind.json`)); attachFlow(asset, read(`${DIR}eym-flow.json`));
const sum = (list) => list.reduce((a, b) => a + b, 0), warm = new Array(12).fill(25);

test("more rain in a catchment, more water in its river: runoff is what the rain leaves, and grows faster than the rain", () => {
  const months = [20, 20, 30, 60, 120, 200, 240, 220, 150, 80, 40, 20], runoff = (scale) => sum(waterBalance(months.map((m) => m * scale), warm).runoffMm);
  const [half, same, more] = [0.5, 1, 1.5].map(runoff);
  assert.ok(half < same && same < more, `${Math.round(half)} < ${Math.round(same)} < ${Math.round(more)} mm of runoff`);
  // Soil and plant take their share first: half the rain leaves far less than half the runoff, and half as much again gives more than half as much again.
  assert.ok(half < same * 0.35 && more > same * 1.6, `${Math.round(half)} / ${Math.round(same)} / ${Math.round(more)} mm`);
  // A dry land sheds nothing: all its rain goes back to the air.
  assert.equal(Math.round(runoff(0.1)), 0);
  // And the river's flow follows the runoff of the land it drains: twice the runoff upstream, twice the flow.
  const ctx = localContext(asset), river = ctx.rivers.find((r) => r.id && r.points.length > 20), height = () => 100;
  const one = riverYear(asset, ctx.field, river, river.points.length - 1, 20000, height, 600), two = riverYear(asset, ctx.field, river, river.points.length - 1, 20000, height, 1200);
  assert.ok(Math.abs(two.meanM3s / one.meanM3s - 2) < 1e-6 && Math.abs(one.meanM3s - 20000 * 1e6 * 0.6 / 31_557_600) / one.meanM3s < 0.06, `${Math.round(one.meanM3s)} and ${Math.round(two.meanM3s)} m³/s`);
  // The same land, half as large: half the flow.
  assert.ok(Math.abs(riverYear(asset, ctx.field, river, river.points.length - 1, 10000, height, 600).meanM3s / one.meanM3s - 0.5) < 1e-6);
});

test("a river crossing arid ground loses water and can die; over land that sheds water it loses none", () => {
  const W = WORLD_INPUTS.rivers;
  assert.equal(waterKept(W.aridMm, 100), 1); assert.equal(waterKept(400, 100), 1);
  assert.ok(Math.abs(waterKept(0, 100) - (1 - W.aridLossPer100Km)) < 1e-12 && waterKept(W.aridMm / 2, 100) > waterKept(0, 100));
  // A stream that leaves wet hills with 1,000 units of water and crosses desert in 2.2 km steps: less with every
  // step, a third gone in 200 km, nine tenths gone in 1,100 km.
  const after = (km) => { let water = 1000; for (let d = 0; d < km; d += 2.2) water *= waterKept(0, 2.2); return water; };
  assert.ok(after(200) < 700 && after(200) > 600 && after(1100) < 120 && after(100) > after(200));
  // Its bed follows its water: a thread where hardly any runs off.
  assert.ok(Math.abs(channelWidthM(900) - 90) < 1e-9 && Math.abs(channelWidthM(900, WORLD_INPUTS.weather.riverReferenceRunoffMm) - 90) < 1e-9);
  assert.ok(Math.abs(channelWidthM(900, 250) - 45) < 1e-9 && channelWidthM(900, 2000) > 120 && channelWidthM(900, 0) < 15);
});

test("the rivers' monthly climate is the rain budget's, and the drainage measures the runoff of every channel and drawn river", () => {
  for (const path of ["data/eym/rain.json", "scripts/eym-rain.mjs"]) assert.ok(FLOW_SOURCES.includes(path), path);
  for (const path of ["data/planet-cartography/mitkear/eym-flow.json", "scripts/eym-river-flow.mjs"]) assert.ok(DRAINAGE_SOURCES.includes(path), path);
  // A square of Caren: the months the rivers run on are the rain file's.
  const rain = rainReader(read("data/eym/rain.json")), field = environmentField(asset), cell = field.cellAt(-5.5, 0.5), climate = flowClimate(asset);
  assert.deepEqual(climate.cells.get(cell.id).rainMm, rain.landYear(cell.latIndex, cell.lonIndex).monthsMm);
  assert.ok(yearRunoffMm(asset, cell.id, 100) > 100 && yearRunoffMm(asset, cell.id, 100) < sum(climate.cells.get(cell.id).rainMm));
  // Every channel point has the runoff of the land it drains; wetter catchments carry more for the same land.
  const channels = drainageChannels(asset); assert.ok(channels.length > 900 && channels.every((c) => c.runoffMm && c.runoffMm.length === c.points.length));
  const all = channels.flatMap((c) => c.runoffMm).sort((a, b) => a - b); assert.ok(all[Math.floor(all.length / 2)] > 200 && all.at(-1) > 2 * all[Math.floor(all.length / 2)], `middle ${all[Math.floor(all.length / 2)]} mm, most ${all.at(-1)} mm`);
  // The drawn rivers: most are measured, and the greatest carries a great river's water.
  const catchments = riverCatchments(asset), flows = [...catchments.values()].map((at) => Math.max(...at.map((p) => p.areaKm2 * 1e6 * p.runoffMm / 1000 / 31_557_600)));
  assert.ok(catchments.size >= 35 && Math.max(...flows) > 1000, `${catchments.size} drawn rivers measured; the greatest ${Math.round(Math.max(...flows))} m³/s`);
  // By a drawn river, the report uses the land it truly drains.
  const ctx = localContext(asset), great = ctx.rivers.find((r) => r.id && catchments.get(r.id) && Math.max(...catchments.get(r.id).map((p) => p.areaKm2)) > 30000), mid = great.points[Math.floor(great.points.length * 0.8)];
  const here = riverHere(asset, mid[0], mid[1], makeUniversalTimeMs({ year: 54, month: 1, day: 1 }), 25);
  assert.ok(here && here.areaKm2 > 5000 && here.year.meanM3s > 100, `${here?.areaKm2} km², ${Math.round(here?.year.meanM3s ?? 0)} m³/s`);
});
