// The land's hand on the large-scale atmosphere (owner's addendum of 20 November 2026): a land-aware rain belt and
// monsoon winds, jet waves anchored by the continents with blocking where their ridges stand, and Earth-like
// seasons inland.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { landAtmosphere } from "../scripts/eym-land-atmosphere.mjs";
import { environmentField, rainBeltLat, seasonalTemperature } from "../scripts/eym-seasons.mjs";
import { backgroundWind, blocksBetween, jetLatAt, systemsBetween, weatherAt } from "../scripts/eym-weather.mjs";
import { WORLD_INPUTS } from "../scripts/eym-world-inputs.mjs";
import { DAY_MS, DAYS_PER_YEAR, NORTHWARD_EQUINOX_MS } from "../scripts/universal-time.mjs";

const asset = JSON.parse(readFileSync(new URL("../data/planet-cartography/mitkear/eym.json", import.meta.url), "utf8"));
const field = environmentField(asset), land = landAtmosphere(field), SUMMER = 23.44, YEAR_HOURS = DAYS_PER_YEAR * 24;
/** A world of 2° cells with land where `isLand(lat, lon)` says, `heightM` high. */
const world = (isLand, heightM = () => 300) => { const cells = []; for (let lat = -89; lat < 90; lat += 2) for (let lon = -179; lon < 180; lon += 2) { const dry = isLand(lat, lon); cells.push({ lat, lon, ocean: !dry, elevationM: dry ? heightM(lat, lon) : 0 }); } return { grid: { latCount: 90, lonCount: 180 }, resolutionDeg: 2, cells }; };
const GAFFA = 175, OPEN = 20; // a longitude through Gaffa's middle, and one over open ocean east of Caren

test("the rain belt reaches farther poleward over large summer-hemisphere land than over open ocean", () => {
  const overLand = land.rainBeltLatAt(GAFFA, SUMMER), overSea = land.rainBeltLatAt(OPEN, SUMMER);
  assert.ok(overLand > overSea + 10, `over Gaffa ${overLand.toFixed(1)}° N, over open ocean ${overSea.toFixed(1)}° N`);
  assert.ok(Math.abs(overSea - rainBeltLat(SUMMER)) < 0.5, "over open ocean it stands where it did");
  assert.ok(overLand > 24 && overLand < 34, "as Earth's does over southern Asia (25° to 30° N)");
  // In the southern summer it is drawn south where there is southern land, and not north.
  assert.ok(land.rainBeltLatAt(120, -SUMMER) < rainBeltLat(-SUMMER) - 5 && land.rainBeltLatAt(OPEN, -SUMMER) > rainBeltLat(-SUMMER) - 0.5);
  // A world of sea: exactly the ocean's belt at every longitude and season.
  const sea = landAtmosphere(world(() => false));
  for (const lon of [-170, -40, 0, 95]) for (const d of [-SUMMER, -5, 0, 12, SUMMER]) assert.equal(sea.rainBeltLatAt(lon, d), rainBeltLat(d));
  // A made world: a continent from 5° to 40° N across 60° of longitude draws the belt on over itself and a little beside itself, not on the far side.
  const made = landAtmosphere(world((lat, lon) => lat > 5 && lat < 40 && Math.abs(lon) < 30));
  assert.ok(made.rainBeltLatAt(0, SUMMER) > rainBeltLat(SUMMER) + 12 && made.rainBeltLatAt(40, SUMMER) > rainBeltLat(SUMMER) + 2 && made.rainBeltLatAt(150, SUMMER) === rainBeltLat(SUMMER));
});

test("the trade winds turn about between the equator and a belt the land has drawn on, and nowhere else", () => {
  const wind = (lat, lon, d) => { const b = backgroundWind(lat, d), m = land.monsoonWind(lat, lon, d); return { east: b.east + m.east, north: b.north + m.north, strength: m.strength }; };
  const summer = wind(14, GAFFA, SUMMER), winter = wind(14, GAFFA, -SUMMER), sea = wind(14, OPEN, SUMMER);
  assert.ok(summer.east > 1 && summer.north > 0, `a south-westerly over Gaffa in its summer (${summer.east.toFixed(1)} east, ${summer.north.toFixed(1)} north)`);
  assert.ok(winter.east < -3 && winter.strength === 0, "the north-east trade again in its winter");
  assert.ok(sea.east < -3 && sea.strength < 0.05, "the trade over open ocean in every season");
  assert.equal(land.monsoonWind(45, GAFFA, SUMMER).strength, 0, "nothing poleward of the belt");
  // The weather itself: rain over Gaffa at 25° N in its summer, where the ocean's belt would leave it dry.
  const ctx = (extra) => ({ cell: field.cellAt(25, GAFFA), declinationDeg: SUMMER, solarHour: 12, timeMs: NORTHWARD_EQUINOX_MS + 87 * DAY_MS, ...extra });
  let wet = 0, dry = 0; for (let k = 0; k < 40; k += 1) { const t = NORTHWARD_EQUINOX_MS + (80 + k * 0.5) * DAY_MS; wet += weatherAt([], 25, GAFFA, { ...ctx({ land }), timeMs: t }).precipMmH; dry += weatherAt([], 25, GAFFA, { ...ctx({}), timeMs: t }).precipMmH; }
  assert.ok(wet > 1.5 * dry, `rain at 25° N over Gaffa in summer: ${wet.toFixed(1)} with the monsoon, ${dry.toFixed(1)} without`);
});

test("the jets' troughs and ridges recur at the same longitudes year after year, and blocks gather at the ridges", () => {
  // The northern jet's mean place through midwinter, by longitude, in two different years.
  const profile = (year, atmosphere) => { const out = []; for (let lon = -175; lon < 180; lon += 10) { let sum = 0; for (let day = 0; day < 60; day += 2) sum += jetLatAt(1, lon, (year + 0.75) * YEAR_HOURS + (day - 30) * 24, atmosphere); out.push(sum / 30); } const mean = out.reduce((a, v) => a + v, 0) / out.length; return out.map((v) => v - mean); };
  const alike = (a, b) => { let ab = 0, aa = 0, bb = 0; a.forEach((v, k) => { ab += v * b[k]; aa += v * v; bb += b[k] * b[k]; }); return ab / Math.sqrt(aa * bb); };
  // Eight winters, every pair of them: with the land they are all alike; without it they are alike or opposite by
  // chance (the travelling waves' places), and on the whole not alike at all.
  const years = [1, 3, 5, 7, 9, 11, 13, 15], pairs = (atmosphere) => { const profiles = years.map((y) => profile(y, atmosphere)), out = []; for (let i = 0; i < profiles.length; i += 1) for (let j = i + 1; j < profiles.length; j += 1) out.push(alike(profiles[i], profiles[j])); return out; };
  const mean = (list) => list.reduce((a, v) => a + v, 0) / list.length, withLand8 = pairs(land), without8 = pairs(null), first = profile(3, land);
  assert.ok(Math.min(...withLand8) > 0.7 && mean(withLand8) > 0.85, `with the land every two winters' jets are alike (${Math.min(...withLand8).toFixed(2)} at least, ${mean(withLand8).toFixed(2)} on average)`);
  assert.ok(Math.abs(mean(without8)) < 0.3 && Math.min(...without8) < 0, `without it they are not (${mean(without8).toFixed(2)} on average, ${Math.min(...without8).toFixed(2)} at least)`);
  assert.ok(Math.max(...first) - Math.min(...first) > 6, "it is bent by several degrees");
  // The fixed bends: a trough downwind of Gaffa's high ground and winter cold, a ridge upwind of it; none over a world of sea.
  const bend = (lon) => land.stationaryJetDeg(1, lon, -SUMMER), bends = []; for (let lon = -177.5; lon < 180; lon += 5) bends.push([lon, bend(lon)]);
  const ridge = bends.reduce((a, b) => (b[1] > a[1] ? b : a)), trough = bends.reduce((a, b) => (b[1] < a[1] ? b : a));
  assert.ok(ridge[1] > 3 && trough[1] < -3, `a ridge of ${ridge[1].toFixed(1)}° at ${ridge[0]}°, a trough of ${trough[1].toFixed(1)}° at ${trough[0]}°`);
  assert.ok(Math.abs(bends.reduce((s, b) => s + b[1], 0) / bends.length) < 0.2, "the jet's mean latitude is not moved");
  assert.equal(landAtmosphere(world(() => false)).stationaryJetDeg(1, 40, -SUMMER), 0);
  assert.ok(Math.abs(land.stationaryJetDeg(1, ridge[0], SUMMER)) < Math.abs(ridge[1]), "weaker in summer");
  // Blocks over sixty years: more of them with the land, more in the north than the south, and more of the north's
  // near its ridge than chance would put there.
  const near = (b, lon) => Math.abs(((b.lon0 - lon + 540) % 360) - 180) < 30, sixty = 60 * YEAR_HOURS;
  const withLand = blocksBetween(0, sixty, land), without = blocksBetween(0, sixty), north = withLand.filter((b) => b.hemisphere > 0), south = withLand.filter((b) => b.hemisphere < 0);
  assert.ok(withLand.length > 1.2 * without.length && north.length > south.length, `${withLand.length} blocks with the land (${north.length} north, ${south.length} south), ${without.length} without`);
  const atRidge = north.filter((b) => near(b, ridge[0])).length / north.length, atTrough = north.filter((b) => near(b, trough[0])).length / north.length;
  assert.ok(atRidge > 1.5 / 6 && atRidge > 2 * atTrough, `${(100 * atRidge).toFixed(0)}% of the north's blocks within 30° of the ridge, ${(100 * atTrough).toFixed(0)}% within 30° of the trough (chance: 17%)`);
  // A block keeps its time, life and strength whether or not the land places it.
  const byId = new Map(without.map((b) => [b.id, b])); for (const b of withLand) { const twin = byId.get(b.id); if (twin) assert.deepEqual([b.born, b.life, b.amp, b.radiusKm], [twin.born, twin.life, twin.amp, twin.radiusKm]); }
});

test("it is the same every time, and Caren and Garyk feel it only as documented", () => {
  assert.equal(landAtmosphere(field), land); assert.equal(landAtmosphere(null), null);
  const again = landAtmosphere(environmentField(JSON.parse(JSON.stringify(asset))));
  for (const lon of [-170, -79, 0, 110, 175]) for (const d of [-SUMMER, 0, SUMMER]) { assert.equal(again.rainBeltLatAt(lon, d), land.rainBeltLatAt(lon, d)); assert.equal(again.stationaryJetDeg(1, lon, d), land.stationaryJetDeg(1, lon, d)); assert.equal(again.blockLon(-1, 0.37, d), land.blockLon(-1, 0.37, d)); }
  assert.deepEqual(systemsBetween(0, 2000, () => true, null, land).map((s) => [s.id, s.lon0]), systemsBetween(0, 2000, () => true, null, land).map((s) => [s.id, s.lon0]));
  // Caren (on the equator at 0°) and Garyk (15° N, 79° W) are small and far from the great lands: the rain belt at
  // their longitudes stands within a degree and a half of the ocean's, and no monsoon wind of a metre a second blows.
  for (const [name, lat, lon] of [["Caren", 0, 0], ["Garyk", 14.7, -79.3]]) for (const d of [-SUMMER, SUMMER]) {
    assert.ok(Math.abs(land.rainBeltLatAt(lon, d) - rainBeltLat(d)) < 1.5, `${name}: the belt at ${land.rainBeltLatAt(lon, d).toFixed(1)}°`);
    assert.ok(Math.hypot(land.monsoonWind(lat, lon, d).east, land.monsoonWind(lat, lon, d).north) < 1, `${name}: no monsoon wind`);
  }
  // Without a land's atmosphere the weather is what it was: the belt the ocean's, the jet unbent.
  const ctx = { cell: field.cellAt(25, GAFFA), declinationDeg: SUMMER, solarHour: 12, timeMs: NORTHWARD_EQUINOX_MS + 87 * DAY_MS };
  assert.deepEqual(weatherAt([], 25, GAFFA, ctx), weatherAt([], 25, GAFFA, { ...ctx, land: null }));
  assert.equal(jetLatAt(1, 30, 5000), jetLatAt(1, 30, 5000, null));
});

test("the land's seasons are Earth-like: small on a coast, large deep inside a continent", () => {
  const swing = (latDeg, continentality) => seasonalTemperature({ annualMeanC: 10, latDeg, continentality, timeMs: NORTHWARD_EQUINOX_MS }).swingC;
  // Half the difference between the warmest and coldest months' means, from Earth's climate normals, with how far
  // inland each place counts as (1 = 1,200 km or more from the sea).
  const earth = [["Winnipeg", 49.9, 1, 19], ["Irkutsk", 52.3, 1, 18.5], ["Kansas City", 39.1, 0.9, 13.5], ["Denver", 39.7, 1, 11.5], ["Alice Springs", -23.7, 0.8, 8], ["Timbuktu", 16.8, 0.8, 6], ["Paris", 48.9, 0.15, 7.5], ["San Francisco", 37.8, 0, 3.5], ["Manaus", -3.1, 0.9, 0.8]];
  for (const [place, lat, inland, observed] of earth) { const made = swing(lat, inland); assert.ok(Math.abs(made - observed) <= Math.max(1.5, 0.4 * observed), `${place}: ${made.toFixed(1)} °C against ${observed} °C on Earth`); }
  assert.deepEqual(WORLD_INPUTS.weather.continentality, { coastC: 5, inlandC: 20 });
  // Deep inside Gaffa at 45° N the year swings by some 35 °C from coldest month to warmest; on Caren, by a degree or two.
  assert.ok(2 * swing(45, 1) > 30 && 2 * swing(45, 1) < 40);
  const caren = field.cells.filter((c) => !c.ocean && Math.abs(c.lon) < 9 && Math.abs(c.lat) < 12), worst = Math.max(...caren.map((c) => 2 * swing(c.lat, c.continentality)));
  assert.ok(worst < 5, `the widest yearly range anywhere on Caren is ${worst.toFixed(1)} °C: mild seasons, as its canon says`);
});
