import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attachCoasts, attachGeology, coastsFileName } from "../scripts/cartography-asset.mjs";
import { coarseAt, coastDistanceKm, localContext } from "../scripts/eym-local-detail.mjs";
import { bayFunnel, coastSamples, describeSurge, fineSeaFloor, funnelledResponse, nearestCoast, SHELF_SEAS, shelfOff, stormSurgeM, surgePotentialM } from "../scripts/eym-shelf-seas.mjs";
import { battleTide } from "../scripts/eym-tides.mjs";
import { WORLD_INPUTS } from "../scripts/eym-world-inputs.mjs";
import { COAST_FIELDS, COAST_INPUTS, coastSourcesSha256 } from "../tools/generate-eym-coasts.mjs";

const root = new URL("../", import.meta.url), json = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8")), DIR = "data/planet-cartography/mitkear";
const asset = attachGeology(json(`${DIR}/eym.json`), json(`${DIR}/eym-geology.json`)), doc = json(`${DIR}/${coastsFileName("eym.json")}`);
attachCoasts(asset, doc);
const samples = coastSamples(doc);

test("the survey of the coasts is up to date, covers the continents the dials name, and stays within its dials", () => {
  assert.equal(doc.sourcesSha256, coastSourcesSha256(), "npm run build would not change it");
  assert.deepEqual(doc.fields, [...COAST_FIELDS]); assert.deepEqual(doc.continents, WORLD_INPUTS.shelfSeas.continents); assert.deepEqual(COAST_INPUTS, ["seaFloor", "shelfSeas"]);
  for (const name of SHELF_SEAS.continents) assert.ok(samples.filter((s) => s.continent === name).length > 200, name);
  // A minority of the coast lies in bays, fewer in funnels; a funnel is always in a bay, and none passes the dial.
  const bays = samples.filter((s) => s.bay), funnels = samples.filter((s) => s.funnelGain > 1.2);
  assert.ok(bays.length > 0.05 * samples.length && bays.length < 0.4 * samples.length, `${bays.length} of ${samples.length} in bays`);
  assert.ok(funnels.length > 10 && funnels.length < bays.length && funnels.every((s) => s.bay));
  for (const s of samples) { assert.ok(s.funnelGain >= 1 && s.funnelGain <= SHELF_SEAS.funnelMaxGain); assert.ok(s.shelfKm >= 0 && s.shelfKm <= 400 && s.shelfDepthM > 0 && s.seawardDeg >= 0 && s.seawardDeg < 360); if (!s.bay) assert.equal(s.funnelGain, 1); }
  // Shelves differ: some coasts have deep water close in, others a wide shelf.
  const shelves = samples.map((s) => s.shelfKm).sort((a, b) => a - b);
  assert.ok(shelves[Math.floor(shelves.length * 0.1)] <= 40 && shelves[Math.floor(shelves.length * 0.9)] >= 150);
  assert.ok(readFileSync(new URL(`${DIR}/${coastsFileName("eym.json")}`, root)).length < 120_000, "the survey stays small");
  // Read by place: the nearest surveyed point by a Caren shore; nothing off an unsurveyed continent or far inland.
  const one = samples.find((s) => s.continent === "Caren");
  assert.equal(nearestCoast(asset, one.lat, one.lon).km, 0); assert.equal(nearestCoast(asset, 5, 161), null); assert.equal(nearestCoast({}, one.lat, one.lon), null);
});

test("a bay is sea shut in by land, and only a narrowing one funnels the tide", () => {
  const flat = () => -50;
  // An open, straight coast (land south of the equator): not a bay.
  const open = bayFunnel((lat) => lat < 0, flat, 0.06, 0);
  assert.equal(open.bay, false); assert.equal(open.gain, 1); assert.ok(open.enclosed > 0.4 && open.enclosed < 0.6, `${open.enclosed}`);
  // A funnel open to the north: 11 km across at its head, 144 km at its mouth 167 km away.
  const funnel = bayFunnel((lat, lon) => lat < 0 || (lat < 1.5 && Math.abs(lon) > 0.05 + 0.4 * lat), flat, 0.1, 0);
  assert.equal(funnel.bay, true); assert.ok(funnel.enclosed >= SHELF_SEAS.bayEnclosedShare);
  assert.ok(Math.abs(((funnel.mouthBearingDeg + 180) % 360) - 180) < 15, `the mouth lies north (${funnel.mouthBearingDeg})`);
  assert.ok(funnel.lengthKm >= 100 && funnel.mouthWidthKm > 2 * funnel.widthKm && funnel.gain > 1.4, JSON.stringify(funnel));
  // The same length of channel with parallel sides: a bay, but no funnel.
  const channel = bayFunnel((lat, lon) => lat < 0 || (lat < 1.5 && Math.abs(lon) > 0.3), flat, 0.1, 0);
  assert.equal(channel.bay, true); assert.ok(channel.gain <= 1.1, `${channel.gain}`);
  // A funnel that also shoals toward its head gains more (the fourth root of the shoaling), up to the dial's limit.
  const shoaling = bayFunnel((lat, lon) => lat < 0 || (lat < 1.5 && Math.abs(lon) > 0.05 + 0.4 * lat), (lat) => -10 - 100 * lat, 0.1, 0);
  assert.ok(shoaling.gain > funnel.gain && shoaling.gain <= SHELF_SEAS.funnelMaxGain);
  // A coast's tide response takes its bay's gain; an open coast's is left as it is.
  const response = { at: [0, 0], shelfKm: 100, gain: 4, lagHours: 2 };
  assert.deepEqual(funnelledResponse(response, { funnelGain: 1, bayLengthKm: 0 }), response);
  const raised = funnelledResponse(response, { funnelGain: 1.8, bayLengthKm: 120 }); assert.equal(raised.gain, 7.2); assert.equal(raised.lagHours, 4); assert.equal(raised.funnelGain, 1.8);
});

test("the sea floor is fine near the coasts: it deepens with the true distance from the shore and joins the 1° grid offshore", () => {
  const ctx = localContext(asset), landAt = (lat, lon) => coarseAt(ctx, lat, lon).land, floor = fineSeaFloor(asset, (lat, lon) => coastDistanceKm(ctx, lat, lon));
  // Out from a wide-shelved Caren shore: shallow by the beach, deeper each step, never above the sea.
  const wide = samples.filter((s) => s.continent === "Caren" && !s.bay && s.shelfKm >= 150)[0], dest = (km) => { const d = km / 111.2, b = wide.seawardDeg * Math.PI / 180; return [wide.lat + d * Math.cos(b), wide.lon + d * Math.sin(b) / Math.cos(wide.lat * Math.PI / 180)]; };
  const depths = [0, 20, 60].map((km) => -floor(...dest(km)));
  assert.ok(depths[0] < 60 && depths.every((d) => d > 0), `${depths}`);
  for (let i = 1; i < depths.length; i += 1) assert.ok(depths[i] >= depths[i - 1] - 1, `deepens offshore: ${depths}`);
  // The shelf found there is the survey's own.
  const shelf = shelfOff(landAt, floor, wide.lat, wide.lon, wide.seawardDeg);
  assert.equal(shelf.shelfKm, wide.shelfKm); assert.equal(Math.round(shelf.depthM), wide.shelfDepthM);
  // Far from any coast it is the 1° grid's sea floor.
  assert.ok(floor(-40, -140) < -3000);
});

test("storm surge: an onshore gale piles water up across a wide, shallow shelf; a funnel bay raises it; pressure adds a little", () => {
  const coast = { seawardDeg: 90, shelfKm: 150, shelfDepthM: 40, funnelGain: 1 }, gale = { windMs: 40, windFromDeg: 90, pressureHpa: 960 };
  const surge = stormSurgeM(coast, gale);
  assert.ok(surge > 1 && surge < 6, `${surge}`);
  // Offshore wind: only the low pressure's lift (a centimetre a hectopascal).
  assert.ok(Math.abs(stormSurgeM(coast, { ...gale, windFromDeg: 270 }) - 0.53) < 0.01);
  assert.equal(stormSurgeM(coast, { windMs: 5, windFromDeg: 270, pressureHpa: 1015 }), 0);
  // A narrow, deep shelf takes far less (little more than the pressure's lift); a funnel bay more; nothing passes the dial's limit.
  assert.ok(stormSurgeM({ ...coast, shelfKm: 20, shelfDepthM: 120 }, gale) < surge / 3);
  assert.ok(stormSurgeM({ ...coast, funnelGain: 2 }, gale) > 1.5 * surge);
  assert.equal(stormSurgeM({ ...coast, shelfKm: 400, shelfDepthM: 10, funnelGain: 2.5 }, { ...gale, windMs: 70 }), SHELF_SEAS.surgeMaxM);
  assert.equal(stormSurgeM(null, gale), 0);
  // In words only when it matters; on a battle map it raises the water.
  assert.equal(describeSurge(0.1), ""); assert.match(describeSurge(0.8), /storm surge \+0\.8 m$/); assert.match(describeSurge(2.4), /floods/);
  const tide = { heightM: 0.5, rangeM: 2, rising: true, nextHigh: null, nextLow: null };
  assert.equal(battleTide(tide).heightM, 0.5); assert.equal(battleTide(tide, 1.25).heightM, 1.75); assert.equal(battleTide(tide, 1.25).surgeM, 1.25);
  // What each surveyed coast could suffer in a great storm: more behind wide shelves and in funnels.
  const risk = samples.map((s) => surgePotentialM(s)).sort((a, b) => a - b);
  assert.ok(risk[0] >= 0.5 && risk.at(-1) <= SHELF_SEAS.surgeMaxM && risk.at(-1) > 3 * risk[0], `${risk[0]}..${risk.at(-1)}`);
});
