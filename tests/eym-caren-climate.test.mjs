// The sea west of Caren and Caren's climate (canon of 20 November 2026, docs/eym-canon.md): the island cluster on
// its ridge, the upwelling, and the climate the physics gives, measured against what the canon expects.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { WORLD_INPUTS } from "../scripts/eym-world-inputs.mjs";
import { EYM_LAYOUT, greatCircleKm } from "../scripts/eym-surface.mjs";
import { carenClimate, monthDeclinationDeg } from "../scripts/eym-caren-climate.mjs";
import { OFFSHORE_LAT, OFFSHORE_UPWELLING, UNDERCURRENT_LAT, UNDERCURRENT_UPWELLING, CLIMATE_INPUTS } from "../tools/generate-eym-climate.mjs";
import { CAREN_INPUTS, CAREN_SOURCES } from "../tools/generate-eym-caren.mjs";
import { tectonicInputs } from "../tools/generate-eym-tectonics.mjs";

const root = new URL("../", import.meta.url), json = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const tect = json("data/eym/tectonics.json"), asset = json("data/planet-cartography/mitkear/eym.json"), kept = json("data/eym/caren.json"), climate = json("data/eym/climate.json");
const HC = EYM_LAYOUT.hotspotCluster, D = WORLD_INPUTS.carenClimate, C = kept.climate;
const isles = asset.terrain.coastlines.filter((c) => c.id.startsWith(`${HC.id}-`)), carenCoast = asset.terrain.coastlines.filter((c) => c.continent === "Caren" && c.kind === "mainland").flatMap((c) => c.points.filter((_, i) => i % 6 === 0));

test("the islands west of Caren: a cluster on a ridge over a plume, inside the Caren Plate, with nothing of the plates changed", () => {
  // A cluster of volcanic islands 1° S to 4° N, 12° to 16° W, 800 to 1,200 km off Caren's west coast.
  assert.equal(isles.length, HC.islands);
  const points = isles.flatMap((c) => c.points), lats = points.map((p) => p[0]), lons = points.map((p) => p[1]);
  assert.ok(Math.min(...lats) >= -1.2 && Math.max(...lats) <= 4.2 && Math.min(...lons) >= -16.2 && Math.max(...lons) <= -11.8, `${Math.min(...lats)} to ${Math.max(...lats)}°, ${Math.min(...lons)} to ${Math.max(...lons)}°`);
  const offshore = isles.map((c) => Math.min(...carenCoast.map((p) => greatCircleKm(p, c.points[0]))));
  assert.ok(Math.min(...offshore) >= 800 && Math.max(...offshore) <= 1250, `${Math.round(Math.min(...offshore))} to ${Math.round(Math.max(...offshore))} km off Caren`);
  assert.ok(isles.every((c) => c.areaKm2 >= 30 && c.areaKm2 <= 2000));
  // Its plume: a hotspot on the Caren Plate, far from any plate edge (1,300 km or more), and a documented outlier.
  const spot = tect.volcanoes.find((v) => v.outlier === HC.id), plates = Buffer.from(tect.rasters.plate, "base64"), carenIndex = tect.plates.findIndex((p) => p.id === "caren");
  assert.ok(spot && spot.setting === "hotspot" && spot.plate === "caren" && spot.activity === "active" && spot.heightM >= 2500);
  let edgeKm = Infinity; for (let r = 60; r < 120; r += 1) for (let c = 120; c < 240; c += 1) if (plates[r * 360 + c] !== carenIndex) edgeKm = Math.min(edgeKm, greatCircleKm(spot.at, [89.5 - r, -179.5 + c]));
  assert.ok(edgeKm >= 1300 && edgeKm <= 2500, `${Math.round(edgeKm)} km from the nearest plate edge`);
  const [a, b] = tect.mantle.upwellings, fromAxis = Math.min(greatCircleKm(spot.at, a), greatCircleKm(spot.at, b)) / 111.195;
  assert.ok(Math.abs(fromAxis - tect.mantle.radiusDeg) > 15, `it stands ${Math.round(fromAxis)}° from the nearest upwelling's middle, far from its margin at ${tect.mantle.radiusDeg}°`);
  // The slow plate makes a ridge, not a long chain: its older volcanoes lie within 800 km and have sunk.
  const chain = tect.mantle.chains.find((ch) => ch.outlier === HC.id);
  assert.ok(chain.seamounts.length >= 10 && chain.seamounts.every((s) => greatCircleKm(s.at, spot.at) < 800 && s.summitDepthM <= -200), "a ridge of sunken volcanoes");
  assert.ok(chain.seamounts.slice(0, 5).every((s) => s.summitDepthM >= -700), "its crest a few hundred metres down");
  assert.match(tect.history.find((h) => h.stage === "the western isles").text, /cluster of islands/);
  // No part of the plate fit: the fit's own count of land leaves the islands out, and it chose the same seed.
  assert.equal(tect.seed, "eym-tectonics|24");
  const withIsles = asset.terrain.coastlines.filter((c) => c.id.startsWith(`${HC.id}-`)).reduce((s, c) => s + c.areaKm2, 0);
  const allLand = asset.terrain.coastlines.filter((c) => !["Gaffa", "Khohalis", "Demani"].includes(c.continent)).reduce((s, c) => s + c.areaKm2, 0);
  assert.ok(withIsles > 1000 && tectonicInputs().otherLandKm2 < allLand - withIsles + 1000, "the fit counts Caren, Garyk and the old archipelagos, not the new islands");
  // No volcano on Caren: the plume's is far out at sea.
  assert.ok(tect.volcanoes.every((v) => Math.min(...carenCoast.map((p) => greatCircleKm(p, v.at))) > 300));
});

test("the sea west of Caren: the undercurrent wells up at the ridge, the trades' drag at the coast, and a cold tongue reaches Caren", () => {
  assert.deepEqual([UNDERCURRENT_LAT, UNDERCURRENT_UPWELLING, OFFSHORE_LAT, OFFSHORE_UPWELLING], [WORLD_INPUTS.ocean.undercurrentLat, WORLD_INPUTS.ocean.undercurrentUpwelling, WORLD_INPUTS.ocean.offshoreLat, WORLD_INPUTS.ocean.offshoreUpwelling]);
  assert.ok(CLIMATE_INPUTS.includes("ocean"));
  const cols = 360 / climate.resolutionDeg, at = (field, lat, lon) => field[Math.floor((lat + 90) / climate.resolutionDeg) * cols + Math.floor((lon + 180) / climate.resolutionDeg)];
  // Upwelling over the ridge and at Caren's west coast in every season; stronger at the coast north of the equator in the northern winter.
  for (const s of climate.seasons) assert.ok(at(s.upwelling, 2, -14) > 0.3 && at(s.upwelling, 2, -6) > 0.2, `season ${s.yearFraction}`);
  assert.ok(at(climate.seasons[3].upwelling, 6, -6) > at(climate.seasons[1].upwelling, 6, -6), "the north-east trades of the northern winter");
  // The sea is colder than its latitude's from the ridge to the coast, all year (by more than 0.3 °C in the year's
  // mean, and in every season by at least 0.2 °C: since the sea is driven by the season's winds, 0.43.0, it swings
  // more through the year, coldest in the northern winter), and colder still over the ridge.
  for (const lon of [-14, -10, -6]) { const year = climate.seasons.map((s) => at(s.sstAnomaly, 2, lon)); assert.ok(year.every((c) => c <= -0.2) && year.reduce((x, y) => x + y, 0) / 4 < -0.3, `${lon}°: ${year.join(", ")} °C`); }
  assert.ok(C.sea.coldTongueC <= -0.5 && C.sea.overTheRidgeC <= C.sea.coldTongueC, JSON.stringify(C.sea));
  // East of Caren the sea is warm (the western shore of the widest equatorial sea).
  assert.ok(at(climate.seasons[0].sstAnomaly, 2, 10) > 0.3);
});

test("Caren's temperatures: cooler by height, the months swinging with the Sun, the nights colder in a dry month inland", () => {
  const rule = carenClimate(D, { seaAnomalyAt: () => 0, rainMmAt: (lat, lon, month) => (month < 6 ? 200 : 20) });
  const low = rule.yearAt(6, 0, 100, 150, 27), high = rule.yearAt(6, 0, 2100, 150, 27);
  assert.ok(Math.abs((low.meanC - high.meanC) - 13) < 0.2 && high.coldestNightC < low.coldestNightC - 10, "6.5 °C a kilometre");
  assert.equal(low.annualMm, 6 * 200 + 6 * 20); assert.equal(low.dryMonths, 6); assert.equal(low.wetMonths, 6);
  // A dry month's nights are colder than a wet month's with the Sun as high (months 0 and 5 against 6 and 11).
  assert.ok(low.months[6].nightC < low.months[5].nightC && low.months[6].dayC > low.months[5].dayC - 0.5);
  // Cold water offshore cools the coast, and hardly the interior.
  const cold = carenClimate(D, { seaAnomalyAt: () => -3, rainMmAt: () => 100 });
  assert.ok(cold.yearAt(0, 0, 0, 10, 27).meanC < cold.yearAt(0, 0, 0, 900, 27).meanC - 2);
  assert.ok(Math.abs(monthDeclinationDeg(2) - 22.6) < 0.5);
});

test("the survey measures the climate against the canon's expectations and says which are found: verified, not assumed", () => {
  for (const group of ["carenClimate", "rain"]) assert.ok(CAREN_INPUTS.includes(group), group);
  for (const path of ["scripts/eym-caren-climate.mjs", "scripts/eym-rain.mjs", "data/eym/climate.json"]) assert.ok(CAREN_SOURCES.includes(path), path);
  assert.equal(C.rainModel, "eym-rain-v1");
  const found = Object.fromEntries(C.expectations.map((e) => [e.expected, e.found]));
  for (const e of C.expectations) assert.ok(typeof e.found === "boolean" && e.measure.length > 5, e.expected);
  // What the physics gives (20 November 2026, with the rain as a budget of the air's water). A change here is a
  // change of Caren's climate: look before accepting it.
  assert.deepEqual(found, {
    "a tongue of cold water toward Caren's west coast": true,
    "the western coasts' sea swings 5 to 8 °C through the year": false,
    "the rain belt south of the equator over Caren for more of the year": false,
    "northern Caren cooler than the south": true,
    "northern Caren drier than the south": false,
    "a cool plateau with a mild rhythm of seasons": true,
    "a dry season on the plateau, with frost at night": false,
    "a rain shadow to the south-west of Mt. Weth": false,
    "a rain shadow to the south-west of Mt. Oplin and Mt. Danrich, round Menera": false,
    "south Caren tropical wet and dry": true,
    "snow all year only above about 4,800 m; none in the lowlands": true,
    "frost on clear dry-season nights at 1,500 to 2,000 m": false,
    "the Molkath desert arid (100 to 250 mm a year), today and before the Sondel fell": false,
  });
  // South Caren: a dry season; the north: cooler by height, and wetter.
  assert.ok(C.parts.south.dryMonths >= 3 && C.parts.south.annualMm > 900 && C.parts.south.dryMonths > C.parts.north.dryMonths + 1.5);
  assert.ok(C.plateau.meanC < 18 && C.plateau.meanC > 12 && C.parts.north.meanC < C.parts.south.meanC);
  // Snow and frost by height: none in the lowlands, now and then from about 3,000 m, all year from the snow line.
  const at = (m) => C.byHeight.find((h) => h.heightM === m);
  assert.equal(at(0).snow, "none"); assert.equal(at(1750).snow, "none"); assert.match(at(4000).snow, /now and then/); assert.equal(at(4800).snow, "all year");
  for (let k = 1; k < C.byHeight.length; k += 1) assert.ok(C.byHeight[k].meanC < C.byHeight[k - 1].meanC);
  // The Molkath country is the map's tan ground round the Sondel's remnant, measured side by side in both eras.
  // The trades blow from the east: its west side, the remnant's lee, is its driest and has the longest dry season,
  // its east side the wettest; the wall dries the west further. It is not a desert on any side, and that is
  // reported with its numbers: nothing is tuned to hide it.
  const m = C.molkath, now = m.today.sides, then = m.beforeTheFall.sides;
  assert.equal(m.reached, false); assert.deepEqual(m.targetMm, [100, 250]);
  for (const side of ["west", "east", "north", "south"]) assert.ok(now[side].places >= 4, side);
  assert.ok(now.west.annualMm[1] < now.east.annualMm[1] * 0.5 && now.west.dryMonths > now.east.dryMonths + 2, `west ${now.west.annualMm[1]} mm, east ${now.east.annualMm[1]} mm`);
  assert.ok(then.west.annualMm[1] < now.west.annualMm[1] * 0.8 && then.west.dryMonths > now.west.dryMonths, `the west with the wall standing: ${then.west.annualMm[1]} mm`);
  assert.ok(now.west.annualMm[1] > 1000 && m.today.aridShare < 0.1 && m.beforeTheFall.aridShare < 0.1, "not a desert, and said so");
  assert.match(m.why, /lee/);
  // The map's tan country is still shown as the map draws it: dry grassland, whatever the rain.
  const biomes = asset.raster.biome.categories, values = [...Buffer.from(asset.raster.biome.valuesBase64, "base64")], biomeAt = (lat, lon) => biomes[values[Math.floor(lat + 90) * 360 + Math.floor(lon + 180)]];
  assert.ok(["savanna", "steppe"].includes(biomeAt(1.5, 1.5)), biomeAt(1.5, 1.5));
});

test("Caren's country by the map and the dry season: forest where the map draws it, open country elsewhere, savanna and woodland in the south; Dubos is tropical", () => {
  const biomes = asset.raster.biome.categories, values = [...Buffer.from(asset.raster.biome.valuesBase64, "base64")], biomeAt = (lat, lon) => biomes[values[Math.floor(lat + 90) * 360 + Math.floor(lon + 180)]];
  const dubos = asset.settlements.find((s) => s.properName === "Dubos"), dree = asset.settlements.find((s) => s.properName === "Dree");
  assert.equal(biomeAt(dubos.lat, dubos.lon), "tropical-rainforest");
  // Dree's open country has a dry season: savanna or open woodland (tropical wet and dry), as the map's open south is.
  assert.ok(["savanna", "seasonal-forest"].includes(biomeAt(dree.lat, dree.lon)), biomeAt(dree.lat, dree.lon));
  let forest = 0, land = 0, south = { seasonal: 0, rain: 0 };
  for (let lat = -9.5; lat <= 8.5; lat += 1) for (let lon = -5.5; lon <= 5.5; lon += 1) { const b = biomeAt(lat, lon); if (/ocean/.test(b)) continue; land += 1; if (/forest/.test(b)) forest += 1; if (lat <= -5.5) { if (b === "seasonal-forest" || b === "savanna") south.seasonal += 1; if (b === "tropical-rainforest") south.rain += 1; } }
  assert.ok(forest > land * 0.5, `most of Caren is forest or woodland (${forest} of ${land} cells)`);
  assert.ok(south.seasonal > south.rain * 3, `the far south is seasonal forest and savanna (${south.seasonal} cells against ${south.rain} of rainforest)`);
});

