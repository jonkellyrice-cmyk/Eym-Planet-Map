import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attachOcean } from "../scripts/cartography-asset.mjs";
import { approximateDeclinationDeg, environmentField } from "../scripts/eym-seasons.mjs";
import { buildWeatherState, placeWeatherNow } from "../scripts/eym-weather.mjs";
import { CROSSING_PORTS, bestVoyage, nearestSea, crossingPassage, describeSea, distanceKm, placeSea, routeKm, seaRoute, swellAt, swimConditions, upwindFetchKm, voyage, windSea } from "../scripts/eym-sea.mjs";
import { buildBattleMap } from "../scripts/eym-battle-rules.mjs";
import { battleMapSpec } from "../scripts/eym-map-presets.mjs";
import { DAY_MS, DAYS_PER_YEAR, NORTHWARD_EQUINOX_MS } from "../scripts/universal-time.mjs";

const root = new URL("../", import.meta.url), read = (path) => readFileSync(new URL(path, root), "utf8");
const asset = JSON.parse(read("data/planet-cartography/mitkear/eym.json"));
attachOcean(asset, JSON.parse(read(`data/planet-cartography/mitkear/${asset.oceanFile}`)));
const field = environmentField(asset), YEAR_MS = DAYS_PER_YEAR * DAY_MS, T0 = NORTHWARD_EQUINOX_MS + 2 * YEAR_MS;
const port = (p) => asset.settlements.find((s) => s.id === p.id), pouk = port(CROSSING_PORTS.caren), garyk = port(CROSSING_PORTS.garyk);
/** The most inland place (in the tropics and mid-latitudes). */
const inlandCell = () => field.cells.filter((c) => !c.ocean && Math.abs(c.lat) < 40).reduce((a, b) => (b.continentality > a.continentality ? b : a));
const weatherAtMoment = (t) => { const subsolar = { latDeg: approximateDeclinationDeg(t), lonDeg: 0 }; return { state: buildWeatherState({ timeMs: t, subsolar, field }), subsolar }; };

test("waves grow with wind, fetch and time, up to the fully developed sea, and storm seas saturate", () => {
  const developed = windSea(10, 3000, 72), short = windSea(10, 20, 72), brief = windSea(10, 3000, 2);
  assert.ok(Math.abs(developed.hsM - 0.0246 * 100) < 0.1, `a 10 m/s wind over a wide sea makes ${developed.hsM.toFixed(2)} m`);
  assert.ok(short.hsM < developed.hsM / 2 && brief.hsM < developed.hsM / 2, "a short fetch or a short blow makes less");
  assert.ok(windSea(20, 3000, 72).hsM > developed.hsM && windSea(60, 3000, 72).hsM < 16, "a hurricane's sea stays under 16 m");
  assert.ok(developed.periodS > 6 && developed.periodS < 9, `period ${developed.periodS.toFixed(1)} s`);
});

test("the fetch is the open water upwind: short with a wind off the land, long with one off the sea", () => {
  const coast = nearestSea(field, pouk.lat, pouk.lon);
  const fetches = [0, 90, 180, 270].map((from) => upwindFetchKm(field, ...coast, from));
  assert.ok(Math.min(...fetches) < 200 && Math.max(...fetches) > 1500, `fetches ${fetches.join(", ")} km`);
});

test("swell runs out from a storm at its group speed and is stopped by land in between", () => {
  const sea = { cellAt: () => ({ ocean: true }) }, walled = { cellAt: (lat, lon) => ({ ocean: !(lon > 9 && lon < 11) }) };
  const storm = { id: "s", hour: 0, lat: 0, lon: 0, unit: [1, 0, 0], radiusKm: 600, hsM: 8, periodS: 13, heading: null };
  const arrival = (f, lon) => { let best = { hsM: 0, hour: null }; for (let h = 0; h <= 120; h += 2) { const s = swellAt(f, [storm], 0, lon, h)[0]; if (s && s.hsM > best.hsM) best = { hsM: s.hsM, hour: h }; } return best; };
  const near = arrival(sea, 15), far = arrival(sea, 30);
  assert.ok(near.hour < far.hour && far.hsM < near.hsM, `peaks at ${near.hour} h (${near.hsM.toFixed(1)} m) and ${far.hour} h (${far.hsM.toFixed(1)} m)`);
  const cg = 9.81 * 13 / (4 * Math.PI) * 3.6, km = distanceKm(0, 0, 0, 30);
  assert.ok(Math.abs(far.hour - km / (cg * 1.1)) < 16, "arrives about when the group speed says");
  assert.equal(arrival(walled, 15).hsM, 0, "land between stops it");
});

test("the sea over a year: roughest in the westerlies, gentlest near the equator, in Earth's range", () => {
  const bands = { westerlies: [], tropics: [] };
  for (let k = 0; k < 12; k += 1) {
    const t = T0 + k * 30.4 * DAY_MS, { state, subsolar } = weatherAtMoment(t);
    for (let lon = -170; lon < 180; lon += 40) for (const [band, lat] of [["westerlies", -48], ["westerlies", 48], ["tropics", -4], ["tropics", 4]]) {
      if (!field.cellAt(lat, lon).ocean) continue;
      const w = placeWeatherNow(state, lat, lon, { subsolar, timeMs: t });
      bands[band].push(placeSea(state, lat, lon, { ...w, timeMs: t }).hsM);
    }
  }
  const median = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  const w = median(bands.westerlies), e = median(bands.tropics);
  assert.ok(w > e + 0.8, `westerlies ${w.toFixed(1)} m, tropics ${e.toFixed(1)} m`);
  assert.ok(w > 2.5 && w < 5 && e > 1 && e < 2.6);
  assert.ok([...bands.westerlies, ...bands.tropics].every((h) => h < 16));
});

test("the sea at a place: words, swimming, and nothing inland", () => {
  const t = T0, { state, subsolar } = weatherAtMoment(t);
  const w = placeWeatherNow(state, pouk.lat, pouk.lon, { subsolar, timeMs: t }), here = placeSea(state, pouk.lat, pouk.lon, { ...w, timeMs: t });
  assert.match(here.words, /^(calm|smooth|slight|moderate|rough|very rough|high|very high|phenomenal) \(\d+\.\d m\)/);
  assert.match(describeSea({ hsM: 3, swell: [{ hsM: 2.5, periodS: 14, fromDeg: 225 }] }), /^rough \(3\.0 m\); moderate swell 2\.5 m from the SW every 14 s$/);
  assert.deepEqual(swimConditions(0.5), { kind: "calm", dc: 10, surfM: 0.5 });
  assert.equal(swimConditions(2).dc, 15); assert.equal(swimConditions(5).dc, 20);
  const inland = inlandCell();
  assert.equal(placeSea(state, inland.lat, inland.lon, { ...w, timeMs: t }), null);
});

test("the Caren–Garyk crossing by steamer: about three weeks, quicker westward with the trades and the current", () => {
  const route = seaRoute(field, [pouk.lat, pouk.lon], [garyk.lat, garyk.lon]);
  assert.ok(route.every(([lat, lon], i) => i === 0 || i === route.length - 1 || field.cellAt(lat, lon).ocean), "the route keeps to the sea");
  assert.ok(routeKm(route) > distanceKm(pouk.lat, pouk.lon, garyk.lat, garyk.lon) && routeKm(route) < 8400);
  const west = [], east = [];
  for (let k = 0; k < 6; k += 1) {
    const departMs = T0 + k * 61 * DAY_MS;
    west.push(voyage({ asset, field, from: [pouk.lat, pouk.lon], to: [garyk.lat, garyk.lon], departMs, route }).days);
    east.push(voyage({ asset, field, from: [garyk.lat, garyk.lon], to: [pouk.lat, pouk.lon], departMs, route: [...route].reverse() }).days);
  }
  const mean = (v) => v.reduce((a, b) => a + b) / v.length, both = (mean(west) + mean(east)) / 2;
  assert.ok(mean(west) + 1 < mean(east), `westward ${mean(west).toFixed(1)} days, eastward ${mean(east).toFixed(1)}`);
  assert.ok(both > 19 && both < 23.5, `on average ${both.toFixed(1)} days (the layout's three weeks)`);
  const again = voyage({ asset, field, from: [pouk.lat, pouk.lon], to: [garyk.lat, garyk.lon], departMs: T0, route });
  assert.equal(again.days, west[0], "the same departure, the same voyage");
});

test("a sailing ship goes with the wind: slower than a steamer, far slower beating back against the trades", () => {
  const departMs = T0 + 40 * DAY_MS;
  const west = bestVoyage({ asset, field, from: [pouk.lat, pouk.lon], to: [garyk.lat, garyk.lon], departMs, ship: "sail" });
  const east = bestVoyage({ asset, field, from: [garyk.lat, garyk.lon], to: [pouk.lat, pouk.lon], departMs, ship: "sail" });
  const steam = bestVoyage({ asset, field, from: [pouk.lat, pouk.lon], to: [garyk.lat, garyk.lon], departMs, ship: "steamer" });
  assert.ok(west.arrived && east.arrived && steam.via === null);
  assert.ok(west.days > steam.days && east.days > west.days * 1.2, `sail west ${west.days.toFixed(1)}, east ${east.days.toFixed(1)}, steamer ${steam.days.toFixed(1)} days`);
  const passage = crossingPassage({ asset, field, lat: pouk.lat, lon: pouk.lon, departMs });
  assert.match(passage.words, /^to Garyk's south-east port: \d+\.\d days by steamer, \d+\.\d by sailing ship/);
});

test("a coastal battle map says how rough the sea is and how hard it is to swim; an inland one does not", () => {
  const sea = { words: "rough (3.1 m); moderate swell 2.4 m from the SW every 14 s", hsM: 3.1, swim: swimConditions(3.1) };
  const seaNote = (m) => m.notes.find((n) => n.startsWith("The sea is"));
  // Walk west from Pouk until the map holds some sea.
  let shore = null;
  for (let k = 0; k <= 40 && !shore; k += 1) { const m = buildBattleMap(asset, { center: [pouk.lat, pouk.lon - k * 0.01], spec: battleMapSpec(), conditions: { sea } }); if (seaNote(m)) shore = m; }
  assert.ok(shore, "a battle map on Pouk's shore");
  assert.match(seaNote(shore), /^The sea is rough \(3\.1 m\); moderate swell 2\.4 m from the SW every 14 s: surf about 2\.8 m on the shore; the water is stormy \(Athletics to Swim, DC 20\)\.$/);
  const inland = inlandCell();
  assert.equal(seaNote(buildBattleMap(asset, { center: [inland.lat, inland.lon], spec: battleMapSpec(), conditions: { sea } })), undefined);
});
