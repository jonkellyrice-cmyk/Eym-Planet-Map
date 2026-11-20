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
  // The sea is colder than its latitude's from the ridge to the coast, all year, and colder still over the ridge.
  for (const s of climate.seasons) for (const lon of [-14, -10, -6]) assert.ok(at(s.sstAnomaly, 2, lon) < -0.3, `${lon}°, season ${s.yearFraction}: ${at(s.sstAnomaly, 2, lon)} °C`);
  assert.ok(C.sea.coldTongueC <= -0.5 && C.sea.overTheRidgeC <= C.sea.coldTongueC, JSON.stringify(C.sea));
  // East of Caren the sea is warm (the western shore of the widest equatorial sea).
  assert.ok(at(climate.seasons[0].sstAnomaly, 2, 10) > 0.3);
});

test("the climate rule follows the air: the belt, the trades, the mountains, the sea and the wind's channels", () => {
  const flat = { heightAt: (lat, lon) => (lon < -3 || lon > 3 ? null : 100), seaAnomalyAt: () => 0, beltLatAt: (lon, declination) => 4 + 0.4 * declination };
  const rule = carenClimate(D, flat), year = (lat, lon, m = 100) => rule.yearAt(lat, lon, m, 150, 27);
  // The belt follows the Sun; rain falls under it: at 6° N the wettest months have the belt near, the driest have it far.
  assert.ok(rule.beltLat(0, 2) > 12 && rule.beltLat(0, 8) < -3 && Math.abs(monthDeclinationDeg(2) - 22.6) < 0.5);
  const north = year(6, 0), south = year(-7, 0);
  assert.ok(north.months[0].rainMm > north.months[8].rainMm * 2 && south.months[8].rainMm > south.months[2].rainMm * 3);
  assert.ok(south.dryMonths >= 4 && south.annualMm < north.annualMm, "the south has a long dry season");
  // The trades blow toward the belt: from the north-east north of it, from the south-east south of it.
  assert.ok(rule.windAt(8, 0, 8).north < 0 && rule.windAt(-8, 0, 2).north > 0 && rule.windAt(0, 0, 0).east < 0);
  // A mountain upwind casts a rain shadow; a slope the air climbs gets more; neither changes the belt.
  const wallEast = carenClimate(D, { ...flat, heightAt: (lat, lon) => (lon < -3 || lon > 3 ? null : lon > 1 && lon < 1.5 ? 3000 : 100) });
  const lee = wallEast.yearAt(0, 0, 100, 150, 27), open = rule.yearAt(0, 0, 100, 150, 27), slope = wallEast.yearAt(0, 1.2, 3000, 150, 27);
  assert.ok(lee.annualMm < open.annualMm * 0.6 && lee.months.every((m) => m.barrierM >= 2800), `${lee.annualMm} mm behind the mountain, ${open.annualMm} mm without it`);
  assert.ok(slope.months[0].lift > 1.3, "the windward slope is wetter");
  // Cold water upwind: less rain; warm: more.
  const coldSea = carenClimate(D, { ...flat, seaAnomalyAt: () => -2 }).yearAt(0, 2.5, 100, 50, 27), warmSea = carenClimate(D, { ...flat, seaAnomalyAt: () => 2 }).yearAt(0, 2.5, 100, 50, 27);
  assert.ok(coldSea.annualMm < warmSea.annualMm * 0.8);
  // A channel between two high grounds across the wind is drier than open country.
  const channel = carenClimate(D, { ...flat, heightAt: (lat, lon) => (lon < -3 || lon > 3 ? null : Math.abs(lat) > 1 ? 2500 : 100) }).monthAt(0, 0, 100, 0);
  assert.ok(channel.squeeze > 0.3 && channel.channel < 0.85);
  // Cooler with height by 6.5 °C a kilometre; the day's range wider in a dry month inland.
  const high = rule.yearAt(6, 0, 2100, 150, 27);
  assert.ok(Math.abs((north.meanC - high.meanC) - 13) < 1.5 && high.coldestNightC < north.coldestNightC - 10);
});

test("the survey measures the climate against the canon's expectations and says which are found: verified, not assumed", () => {
  assert.ok(CAREN_INPUTS.includes("carenClimate") && CAREN_SOURCES.includes("scripts/eym-caren-climate.mjs") && CAREN_SOURCES.includes("data/eym/climate.json"));
  const found = Object.fromEntries(C.expectations.map((e) => [e.expected, e.found]));
  for (const e of C.expectations) assert.ok(typeof e.found === "boolean" && e.measure.length > 5, e.expected);
  // What the physics gives (20 November 2026). A change here is a change of Caren's climate: look before accepting it.
  assert.deepEqual(found, {
    "a tongue of cold water toward Caren's west coast": true,
    "the western coasts' sea swings 5 to 8 °C through the year": false,
    "the rain belt south of the equator over Caren for more of the year": false,
    "northern Caren cooler than the south": true,
    "northern Caren drier than the south": false,
    "a cool plateau with a mild rhythm of seasons": true,
    "a dry season on the plateau, with frost at night": false,
    "a rain shadow to the south-west of Mt. Weth": true,
    "a rain shadow to the south-west of Mt. Oplin and Mt. Danrich, round Menera": false,
    "south Caren tropical wet and dry": true,
    "snow all year only above about 4,800 m; none in the lowlands": true,
    "frost on clear dry-season nights at 1,500 to 2,000 m": false,
    "the Molkath desert arid (100 to 250 mm a year), today and before the Sondel fell": false,
  });
  // South Caren: a long dry season; Dree among it. The north: cooler by height.
  assert.ok(C.parts.south.dryMonths >= 4 && C.parts.south.annualMm > 900 && C.towns.find((t) => t.name === "Dree").dryMonths >= 4);
  assert.ok(C.plateau.meanC < 18 && C.plateau.meanC > 12 && C.parts.north.meanC < C.parts.south.meanC);
  // Snow and frost by height: none in the lowlands, now and then from about 3,000 m, all year from the snow line.
  const at = (m) => C.byHeight.find((h) => h.heightM === m);
  assert.equal(at(0).snow, "none"); assert.equal(at(1750).snow, "none"); assert.match(at(4000).snow, /now and then/); assert.equal(at(4800).snow, "all year");
  for (let k = 1; k < C.byHeight.length; k += 1) assert.ok(C.byHeight[k].meanC < C.byHeight[k - 1].meanC);
  // The Molkath desert: the shortfall is reported with its numbers, for both eras, and nothing is tuned to hide it.
  const m = C.molkath;
  assert.equal(m.reached, false); assert.deepEqual(m.targetMm, [100, 250]);
  assert.ok(m.today.places >= 8 && m.today.annualMm[1] > 1000 && m.beforeTheFall.annualMm[1] > 1000, `${m.today.annualMm[1]} mm today, ${m.beforeTheFall.annualMm[1]} mm before the fall`);
  assert.match(m.why, /windward/);
  // The map's tan country is still shown as the map draws it: dry grassland, whatever the rain.
  const biomes = asset.raster.biome.categories, values = [...Buffer.from(asset.raster.biome.valuesBase64, "base64")], biomeAt = (lat, lon) => biomes[values[Math.floor(lat + 90) * 360 + Math.floor(lon + 180)]];
  assert.ok(["savanna", "steppe"].includes(biomeAt(1.5, 1.5)), biomeAt(1.5, 1.5));
});

test("Caren's country by the map and the dry season: forest where the map draws it, open country elsewhere, savanna in the long-dry south; Dubos is tropical", () => {
  const biomes = asset.raster.biome.categories, values = [...Buffer.from(asset.raster.biome.valuesBase64, "base64")], biomeAt = (lat, lon) => biomes[values[Math.floor(lat + 90) * 360 + Math.floor(lon + 180)]];
  const dubos = asset.settlements.find((s) => s.properName === "Dubos"), dree = asset.settlements.find((s) => s.properName === "Dree");
  assert.equal(biomeAt(dubos.lat, dubos.lon), "tropical-rainforest");
  // Dree's open country has a long dry season: savanna (tropical wet and dry), as the map's open south is.
  assert.equal(biomeAt(dree.lat, dree.lon), "savanna");
  let forest = 0, land = 0, south = { seasonal: 0, rain: 0 };
  for (let lat = -9.5; lat <= 8.5; lat += 1) for (let lon = -5.5; lon <= 5.5; lon += 1) { const b = biomeAt(lat, lon); if (/ocean/.test(b)) continue; land += 1; if (/forest/.test(b)) forest += 1; if (lat <= -5.5) { if (b === "seasonal-forest" || b === "savanna") south.seasonal += 1; if (b === "tropical-rainforest") south.rain += 1; } }
  assert.ok(forest > land * 0.5, `most of Caren is forest or woodland (${forest} of ${land} cells)`);
  assert.ok(south.seasonal > south.rain * 3, `the far south is seasonal forest and savanna (${south.seasonal} cells against ${south.rain} of rainforest)`);
});
