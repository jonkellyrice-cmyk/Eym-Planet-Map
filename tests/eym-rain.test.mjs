// Eym's rain as a budget of the water the air carries (scripts/eym-rain.mjs; owner's direction of 20 November
// 2026: "fix the causal chain"). These are causal tests: for each cause the canon relies on, changing the cause
// changes the effect in the right direction and by a meaningful amount, on small invented worlds where nothing
// else differs. (The tests of each layer's own output stay where they were.)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WORLD_INPUTS } from "../scripts/eym-world-inputs.mjs";
import { RAIN_CAUSES, RAIN_MODEL, rainModel, rainReader, seaAnomalyReader } from "../scripts/eym-rain.mjs";
import { rainBeltLat, seaLevelTemperatureC, zonalPrecipitationMm } from "../scripts/eym-seasons.mjs";
import { RAIN_INPUTS, RAIN_SOURCES, rainSourcesSha256 } from "../tools/generate-eym-rain.mjs";

const root = new URL("../", import.meta.url), json = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const D = WORLD_INPUTS.rain, inBox = (lat, lon, [la0, la1, lo0, lo1]) => lat >= la0 && lat <= la1 && lon >= lo0 && lon <= lo1;
/** A world for the rule: `heightAt` (null at sea), the sea's anomaly, and the open ocean's seasons. */
const world = (heightAt = () => null, seaAnomalyAt = () => 0) => ({ heightAt, seaAnomalyAt, seaLevelC: seaLevelTemperatureC, beltLatAt: (lon, declination) => rainBeltLat(declination) });
const rule = (heightAt, seaAnomalyAt, causes) => rainModel(D, world(heightAt, seaAnomalyAt), causes);
const year = (model, lat, lon) => model.yearAt(lat, lon).annualMm;
// An invented continent: flat and low, 30° S to 30° N, 0° to 40° E. The trades blow onto its east coast.
const LAND = [-30, 30, 0, 40], flat = (lat, lon) => (inBox(lat, lon, LAND) ? 200 : null);
/** The same continent with a range `m` high along 30° to 33° E (across the trades, near the windward coast). */
const ranged = (m) => (lat, lon) => (!inBox(lat, lon, LAND) ? null : lon >= 30 && lon <= 33 ? Math.max(200, m) : 200);

test("on an all-ocean Eym the budget gives back the rain by latitude it was fitted to, and nothing else was fitted", () => {
  const open = rule(); let sum = 0, n = 0;
  for (let lat = -70; lat <= 70; lat += 10) { const got = year(open, lat, 0), want = zonalPrecipitationMm(lat); sum += Math.log(got / want) ** 2; n += 1; assert.ok(got > want * 0.7 && got < want * 1.4, `${lat}°: ${Math.round(got)} mm against ${Math.round(want)} mm`); }
  assert.ok(Math.sqrt(sum / n) < 0.15, `within ${Math.sqrt(sum / n).toFixed(3)} (root mean square of the logarithms)`);
  // The wet belt, the dry belts and the storm tracks are all there.
  assert.ok(year(open, 4, 0) > 1700 && year(open, 26, 0) < 700 && year(open, -26, 0) < 700 && year(open, 50, 0) > 1000 && year(open, 80, 0) < 500);
  assert.equal(open.model, RAIN_MODEL);
});

test("colder sea offshore, drier coast at the same latitude (and warmer, wetter): by how full the column is, with no floor", () => {
  // The sea east of the continent (upwind in the trades) made colder or warmer than its latitude's.
  const coast = (c) => year(rule(flat, (lat, lon) => (inBox(lat, lon, [-22, -3, 40, 60]) ? c : 0)), -12, 39);
  const [cold6, cold4, cold2, same, warm2] = [-6, -4, -2, 0, 2].map(coast);
  assert.ok(cold6 < cold4 && cold4 < cold2 && cold2 < same && same < warm2, [cold6, cold4, cold2, same, warm2].map(Math.round).join(" < "));
  assert.ok(cold2 < same * 0.7 && cold4 < same * 0.45 && cold6 < same * 0.3, `${Math.round(same)} mm; ${Math.round(cold2)} at −2 °C; ${Math.round(cold4)} at −4 °C; ${Math.round(cold6)} at −6 °C`);
  assert.ok(cold6 < 300, "a coast under air from a sea 6 °C colder is as dry as Peru's or Namibia's");
  // It is the sea that does it: with the sea's coupling switched off the cold water changes nothing.
  const off = (c) => year(rule(flat, (lat, lon) => (inBox(lat, lon, [-22, -3, 40, 60]) ? c : 0), { sea: false, beltPull: false }), -12, 39);
  assert.equal(off(-6), off(0));
  // The cold reaches inland, fading: 300 km and 1,000 km from the coast it is still drier than without it.
  const inland = (c, lon) => year(rule(flat, (lat, lo) => (inBox(lat, lo, [-22, -3, 40, 60]) ? c : 0)), -12, lon);
  assert.ok(inland(-4, 36) < inland(0, 36) * 0.6 && inland(-4, 30) < inland(0, 30) * 0.8);
  // Over the cold sea itself there is less rain too.
  const sea = (c) => year(rule(() => null, (lat, lon) => (inBox(lat, lon, [-10, 10, -20, 20]) ? c : 0)), 2, 0);
  assert.ok(sea(-3) < sea(0) * 0.6 && sea(2) > sea(0) * 1.2, `${Math.round(sea(-3))} / ${Math.round(sea(0))} / ${Math.round(sea(2))} mm`);
});

test("the rain belt stands over the warmest water: pushed off a cold tongue, drawn to a warm pool, differently at each longitude", () => {
  const tongue = rule(() => null, (lat, lon) => (Math.abs(lat) < 9 && Math.abs(lon) < 25 ? -2 : 0)), open = rule();
  // At the March equinox (month 0) the open ocean's belt stands near 6° N; over a tongue of cold water on the equator it stands farther off.
  assert.ok(tongue.beltLat(0, 0) > open.beltLat(0, 0) + 0.4, `${tongue.beltLat(0, 0)}° over the tongue, ${open.beltLat(0, 0)}° without`);
  assert.equal(tongue.beltLat(90, 0), open.beltLat(90, 0), "far from the tongue the belt is where it was");
  const pool = rule(() => null, (lat, lon) => (lat < -2 && lat > -14 && Math.abs(lon) < 25 ? 2 : 0));
  assert.ok(pool.beltLat(0, 0) < open.beltLat(0, 0) - 2, `${pool.beltLat(0, 0)}° with warm water to the south`);
  // And the rain follows it: the place the belt has left is drier, the place it has gone to is wetter.
  assert.ok(year(pool, -6, 0) > year(open, -6, 0) * 1.3);
  // With the pull switched off the belt is the season's alone.
  assert.equal(rule(() => null, () => -2, { beltPull: false }).beltLat(0, 0), open.beltLat(0, 0));
});

test("the season's wind: trades toward the belt from the east, turned westerly where they have crossed the equator to it", () => {
  const air = rule(flat);
  // Northern midsummer (month 2): the belt is far north; south of the equator the south-east trades blow, and between the equator and the belt the wind has a westerly part.
  const south = air.windAt(-10, 20, 2), between = air.windAt(8, 20, 2), winter = air.windAt(8, 20, 8);
  assert.ok(south.east < -3 && south.north > 0, "south-east trades south of the equator");
  assert.ok(between.east > south.east + 3 && between.north > 0, `between the equator and the belt the wind is turned (${between.east.toFixed(1)} m/s to the east)`);
  assert.ok(winter.east < -3 && winter.north < 0, "the same place in the other season has north-east trades");
  // So a range's dry side changes with the season where the wind does: at 8° N the west side of the range is the
  // lee under the winter trades, and gets more of the year's rain share under the summer's turned wind.
  const range = rule(ranged(2500)), lee = range.yearAt(8, 28), open = air.yearAt(8, 28);
  assert.ok(lee.monthsMm[8] < open.monthsMm[8] * 0.5, `in the trades' season the lee has ${Math.round(lee.monthsMm[8])} mm against ${Math.round(open.monthsMm[8])}`);
  assert.ok(lee.monthsMm[2] / open.monthsMm[2] > 2 * lee.monthsMm[8] / open.monthsMm[8], "in the season of the turned wind it is far less cut off");
  // Beyond the dry belts the wind is from the west.
  assert.ok(air.windAt(45, 0, 0).east > 5 && air.windAt(-45, 0, 6).east > 5);
});

test("a range's lee is drier than its windward side in every month the trades blow across it, and the higher the range the drier", () => {
  const at = (m, lon) => rule(ranged(m)).yearAt(-12, lon);
  const foot = at(2000, 34), lee = at(2000, 28), none = rule(flat).yearAt(-12, 28);
  for (let month = 0; month < 12; month += 1) assert.ok(lee.monthsMm[month] < foot.monthsMm[month] * 0.5, `month ${month}: ${Math.round(lee.monthsMm[month])} mm in the lee, ${Math.round(foot.monthsMm[month])} mm at the windward foot`);
  const lees = [0, 1000, 1500, 2000, 3000, 4500].map((m) => at(m, 28).annualMm);
  for (let k = 1; k < lees.length; k += 1) assert.ok(lees[k] < lees[k - 1], lees.map(Math.round).join(" > "));
  // A 1,500 m range leaves its lee a fifth or less of the windward rain (as Madagascar's does); a 3,000 m one a twentieth.
  assert.ok(at(1500, 28).annualMm < foot.annualMm * 0.25 && at(3000, 28).annualMm < foot.annualMm * 0.06);
  assert.ok(lee.annualMm < none.annualMm * 0.2, `${Math.round(lee.annualMm)} mm behind the range, ${Math.round(none.annualMm)} mm with no range`);
  // The windward slope is wetter than the same place with no range.
  assert.ok(at(1000, 31.5).annualMm > rule(flat).yearAt(-12, 31.5).annualMm * 1.5);
  // With the mountains switched off there is no shadow.
  assert.ok(Math.abs(year(rule(ranged(3000), undefined, { orography: false }), -12, 28) - year(rule(flat, undefined, { orography: false }), -12, 28)) < 1);
  // Farther on the air mixes with the air round it and recovers some of its water; under the rain belt it recovers most.
  assert.ok(at(2000, 20).annualMm > lee.annualMm * 1.4);
  const equator = (lon) => rule(ranged(2000)).yearAt(1, lon).annualMm;
  assert.ok(equator(20) > equator(28) * 2.5 && equator(28) < rule(flat).yearAt(1, 28).annualMm * 0.3);
});

test("broad high ground: the windward edge takes the rain, and the interior, under a shorter column of air, gets little", () => {
  // A plateau 2,000 m high over the whole interior west of 33° E, at 12° S in the trades.
  const plateau = rule((lat, lon) => (!inBox(lat, lon, LAND) ? null : lon <= 33 ? 2000 : 200));
  const edge = plateau.yearAt(-12, 32.5).annualMm, interior = plateau.yearAt(-12, 10).annualMm, low = rule(flat).yearAt(-12, 32.5).annualMm;
  assert.ok(edge > interior * 3 && edge > low, `the plateau's windward edge has ${Math.round(edge)} mm (${Math.round(low)} mm were it low), its interior ${Math.round(interior)} mm`);
});

test("an equatorial basin can be a desert: in the lee of high ground across the wind, or in a wind gap between highlands", () => {
  // On the equator, under the rain belt, open low country is wet.
  const openMm = year(rule(flat), 1, 26);
  assert.ok(openMm > 1300, `${Math.round(openMm)} mm on the open equator`);
  // Behind a 3,000 m range across the trades the low ground gets under 250 mm.
  const basin = year(rule(ranged(3000)), 1, 28);
  assert.ok(basin < 250, `${Math.round(basin)} mm in the basin behind the range`);
  // A corridor between two highlands along the wind: drier than open country by blocking alone, and drier again
  // when the squeezed wind's spreading is counted (the jet).
  const gap = (lat, lon) => (!inBox(lat, lon, LAND) ? null : (lat > 4 && lat < 12) || (lat > -8 && lat < 0) ? 2500 : 200);
  const still = year(rule(gap, undefined, { jets: false }), 2, 10), jet = year(rule(gap), 2, 10), openAt = year(rule(flat), 2, 10);
  assert.ok(still < openAt * 0.7 && jet < still * 0.75, `${Math.round(openAt)} mm open, ${Math.round(still)} mm between the highlands, ${Math.round(jet)} mm with the jet`);
  const squeezed = (model) => Math.max(...Array.from({ length: 12 }, (_, month) => model.monthAt(2, 20, month).squeeze));
  assert.ok(squeezed(rule(gap)) > 0.1 && squeezed(rule(flat)) === 0);
});

test("the land gives its rain back to the air, so the interior is not a desert under the belt; far from the belt the air dries as it goes inland", () => {
  const air = rule(flat), dry = rule(flat, undefined, { recycling: false });
  assert.ok(year(air, 0, 20) > 1200 && year(dry, 0, 20) < year(air, 0, 20) * 0.75, `${Math.round(year(air, 0, 20))} mm in the middle on the equator; ${Math.round(year(dry, 0, 20))} mm if the land gave nothing back`);
  // Continentality: at 20° the coast the wind comes from is far wetter than the middle and the far coast.
  assert.ok(year(air, 20, 39) > year(air, 20, 20) * 2 && year(air, 20, 1) < year(air, 20, 39) * 0.6, [39, 20, 1].map((lon) => Math.round(year(air, 20, lon))).join(" / "));
  assert.ok(year(air, 20, 20) < 500, "a subtropical interior is dry country");
});

test("the rule is the same every time, and each cause can be switched off", () => {
  const a = rule(ranged(1500), () => -1).yearAt(-8, 25), b = rule(ranged(1500), () => -1).yearAt(-8, 25);
  assert.deepEqual(a.monthsMm, b.monthsMm);
  assert.deepEqual(Object.keys(RAIN_CAUSES).sort(), ["beltPull", "jets", "mixing", "orography", "recycling", "sea", "seasonalWinds"]);
  for (const month of a.months) assert.ok(month.rainMm >= 0 && Number.isFinite(month.rainMm) && month.windMs >= D.wind.leastMs);
});

test("the rain file is the planet's: in the chain, read by the cartography, with deserts, wet coasts and nothing absurd", () => {
  const doc = json("data/eym/rain.json"), reader = rainReader(doc), asset = json("data/planet-cartography/mitkear/eym.json");
  assert.equal(doc.model, RAIN_MODEL); assert.equal(doc.sourcesSha256, rainSourcesSha256());
  assert.deepEqual(RAIN_INPUTS, ["layout", "caren", "rain", "weather"]);
  for (const path of ["scripts/eym-rain.mjs", "data/eym/climate.json", "data/eym/tectonics.json", "data/eym/growth.json", "scripts/eym-land-atmosphere.mjs"]) assert.ok(RAIN_SOURCES.includes(path), path);
  const years = []; for (let r = 0; r < 180; r += 1) for (let c = 0; c < 360; c += 1) { const y = reader.landYear(r, c); if (y && Math.abs(-89.5 + r) < 60) years.push(y.annualMm); }
  years.sort((x, y) => x - y); const at = (q) => years[Math.floor(q * (years.length - 1))];
  assert.ok(reader.landCount > 10000 && at(0.5) > 600 && at(0.5) < 1500, `the middle land square has ${at(0.5)} mm`);
  assert.ok(at(0.03) < 250 && at(0.97) > 2500 && years.at(-1) < 9000, `deserts (${at(0.03)} mm) and wet coasts (${at(0.97)} mm), none over 9,000 (${years.at(-1)})`);
  // The cartography's squares carry it: a land square of Caren has the file's rain.
  const res = asset.resolutionDeg ?? 1; assert.equal(res, 1);
  const own = reader.landYear(90 + 2, 180 + 4); assert.ok(own && own.monthsMm.length === 12 && own.annualMm === own.monthsMm.reduce((x, y) => x + y, 0));
  // The sea's rain: wet under the belt, dry in the dry belts.
  const ring = (lat) => { let s = 0, n = 0; for (let lon = -178; lon < 180; lon += 4) { s += reader.seaAnnualMm(lat, lon); n += 1; } return s / n; };
  assert.ok(ring(6) > 1300 && ring(-26) < 900 && ring(26) < 900 && ring(6) > ring(26) * 1.8, `${Math.round(ring(6))} mm round the world at 6° N, ${Math.round(ring(26))} at 26° N, ${Math.round(ring(-26))} at 26° S`);
  // And it differs with the sea's temperature from one longitude to another under the same Sun.
  const along = []; for (let lon = -178; lon < 180; lon += 4) along.push(reader.seaAnnualMm(2, lon)); assert.ok(Math.max(...along) > Math.min(...along) * 2.5);
});

test("the islands' ridge west of Caren is in the sea's temperatures, and colder water there means less rain there", () => {
  const climate = json("data/eym/climate.json"), seaAt = seaAnomalyReader(climate), hc = WORLD_INPUTS.layout.hotspotCluster;
  // Over the ridge the sea is colder than the sea two squares north and south of it at the same longitude.
  const over = [0, 3, 6, 9].map((m) => seaAt(hc.center[0] + 2, hc.center[1], m)), beside = [0, 3, 6, 9].map((m) => seaAt(hc.center[0] + 10, hc.center[1], m));
  // (In the year's mean by 0.8 °C or more against its latitude's; in every season colder than beside it by more than 0.3 °C.)
  assert.ok(over.reduce((x, y) => x + y, 0) / 4 <= -0.8, `over the ridge ${over.map((c) => c.toFixed(1)).join(", ")} °C`);
  for (let k = 0; k < 4; k += 1) assert.ok(over[k] < beside[k] - 0.3, `season ${k}: ${over[k].toFixed(1)} °C over the ridge, ${beside[k].toFixed(1)} °C beside it`);
  // The same sea with and without that cooling: measurably less rain over the ridge with it.
  const withRidge = rule(() => null, (lat, lon) => (Math.abs(lat - 2) < 3 && Math.abs(lon + 14) < 3 ? -1.0 : -0.5)), without = rule(() => null, () => -0.5);
  assert.ok(year(withRidge, 3, -14) < year(without, 3, -14) * 0.93, `${Math.round(year(withRidge, 3, -14))} mm against ${Math.round(year(without, 3, -14))} mm`);
});

test("the daily weather rains the budget's rain: a place's yearly total in the weather is its square's in the rain file", async () => {
  const { wetnessOf } = await import("../scripts/eym-weather.mjs"), { environmentField } = await import("../scripts/eym-seasons.mjs");
  const asset = json("data/planet-cartography/mitkear/eym.json"), field = environmentField(asset), reader = rainReader(json("data/eym/rain.json")), yieldOver = WORLD_INPUTS.weather.landAfternoonYield;
  // Every land square of the asset carries its yearly rain (to the byte's rounding), and the sea none.
  const cell = field.cellAt(-5.5, 0.5), own = reader.landYear(cell.latIndex, cell.lonIndex).annualMm;
  assert.ok(cell.rainMm != null && Math.abs(cell.rainMm - own) < 0.03 * own + 5 && field.cellAt(0, -40).rainMm == null, `${cell.rainMm} mm in the asset, ${own} mm in the rain file`);
  // Wetter square, wetter weather, in proportion; the sea and a land without the figure are as before.
  const at = (rainMm) => wetnessOf({ ocean: false, rainMm, biome: "savanna" }, 5);
  assert.ok(Math.abs(at(2000) / at(1000) - 2) < 1e-9 && Math.abs(at(zonalPrecipitationMm(5)) - 1 / yieldOver) < 1e-9 && at(50) < 0.05);
  assert.equal(wetnessOf({ ocean: true }, 5), 1); assert.equal(wetnessOf({ ocean: false, biome: "hot-desert" }, 5), 0.25);
  // Four years of the weather over Caren and Garyk (the wind file's yearly rain) against the budget, square by square.
  const wind = json("data/planet-cartography/mitkear/eym-wind.json"), mm = Buffer.from(wind.land.annualMmU16Base64, "base64"), ratios = [];
  wind.land.cells.forEach((id, k) => { const y = reader.landYear(Math.floor(id / 360), id % 360); if (y && y.annualMm > 100) ratios.push(mm.readUInt16LE(k * 2) / y.annualMm); });
  ratios.sort((a, b) => a - b); const q = (p) => ratios[Math.floor(p * (ratios.length - 1))];
  assert.ok(ratios.length > 200 && q(0.5) > 0.93 && q(0.5) < 1.07 && q(0.1) > 0.85 && q(0.9) < 1.2, `the weather's rain is ${q(0.1).toFixed(2)} to ${q(0.9).toFixed(2)} of the budget's (middle ${q(0.5).toFixed(2)})`);
});
