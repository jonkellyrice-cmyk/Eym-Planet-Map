import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROCKS, SOILS, geologyAt, localStonePrompt, rockShares, soilFromRock } from "../scripts/eym-geology.mjs";
import { FAULTS, boundaryPoints, describeTremors, feltIntensity, tremorsAt } from "../scripts/eym-quakes.mjs";
import { buildBattleMap } from "../scripts/eym-battle-rules.mjs";
import { battleArtDirection, battlePacket } from "../scripts/eym-battle-render.mjs";
import { battleMapSpec, atlasMapSpec } from "../scripts/eym-map-presets.mjs";
import { buildReferenceMap } from "../scripts/eym-reference-map.mjs";
import { mapPacket } from "../scripts/eym-map-packet.mjs";
import { DAY_MS, DAYS_PER_YEAR, NORTHWARD_EQUINOX_MS } from "../scripts/universal-time.mjs";

const root = new URL("../", import.meta.url), read = (path) => readFileSync(new URL(path, root), "utf8");
const asset = JSON.parse(read("data/planet-cartography/abydos/eventide.json"));
const YEAR_MS = DAYS_PER_YEAR * DAY_MS, T0 = NORTHWARD_EQUINOX_MS;
const decode = (field) => [...Buffer.from(asset.raster[field].valuesBase64, "base64")].map((i) => asset.raster[field].categories[i]);
const bedrock = decode("bedrock"), soil = decode("soil"), ocean = [...Buffer.from(asset.raster.oceanMaskBase64, "base64")];
const cellLatLon = (i) => [-89.5 + Math.floor(i / 360), -179.5 + (i % 360)];
const town = (continent) => asset.settlements.find((s) => s.continent === continent && s.properName) ?? asset.settlements.find((s) => s.continent === continent);

test("every rock says how it looks as land, what it gives a builder and a miner, and its colour", () => {
  for (const [kind, rock] of Object.entries(ROCKS)) {
    for (const key of ["name", "landform", "battle", "stone", "colourWords"]) assert.ok(rock[key]?.length >= 5, `${kind} ${key}`);
    assert.match(rock.colour, /^#[0-9a-f]{6}$/); assert.ok(rock.ores.length >= 1, kind);
  }
  assert.ok(Object.keys(SOILS).length >= 12);
});

test("soils grow from the bedrock and the climate, not from height alone", () => {
  const land = bedrock.map((b, i) => ({ b, s: soil[i], i })).filter((x) => !ocean[x.i] && ROCKS[x.b]);
  assert.ok(land.length > 500);
  for (const x of land) assert.ok(SOILS[x.s], `${x.s} is a known soil`);
  const counts = (pred) => land.filter(pred).length;
  // Soil on limestone and marble is terra rossa or rendzina unless rivers, ice, mountains, desert or cold say otherwise.
  const lime = land.filter((x) => ["limestone", "caren-limestone", "marble"].includes(x.b));
  assert.ok(lime.filter((x) => ["terra-rossa", "rendzina"].includes(x.s)).length > lime.length * 0.4);
  // Volcanic ground is fertile where it rains.
  assert.ok(counts((x) => x.b === "volcanic" && x.s === "volcanic-fertile") > 20);
  assert.ok(counts((x) => x.s === "podzol") > 10 && counts((x) => x.s === "tundra-peat") > 10, "cold soils on the northern and southern continents");
  assert.equal(soilFromRock({ bedrock: "volcanic", biome: "temperate-forest", precipitationMm: 900, temperatureC: 12, riverAccumulation: 0, elevationMaxM: 900 }), "volcanic-fertile");
  assert.equal(soilFromRock({ bedrock: "granite-gneiss", biome: "temperate-forest", precipitationMm: 900, temperatureC: 12, riverAccumulation: 9, elevationMaxM: 900 }), "alluvial-fertile");
  assert.equal(soilFromRock({ bedrock: "sandstone-shale", biome: "steppe", precipitationMm: 450, temperatureC: 10, riverAccumulation: 0, elevationMaxM: 600 }), "black-earth");
});

test("the rock at a place: Caren stands on the Godstone, Garyk on its own rock; a coastal place takes the nearest land", () => {
  const caren = town("Caren"), garyk = town("Garyk");
  const c = geologyAt(asset, caren.lat, caren.lon), g = geologyAt(asset, garyk.lat, garyk.lon);
  assert.ok(c.onGodstone && ["godstone-granite", "marble", "caren-limestone"].includes(c.bedrock));
  assert.ok(!g.onGodstone && ROCKS[g.bedrock]);
  assert.match(localStonePrompt(c), /^Local stone: /);
  const coastal = bedrock.findIndex((b, i) => !ROCKS[b] && bedrock[i + 1] && ROCKS[bedrock[i + 1]]);
  assert.ok(ROCKS[geologyAt(asset, ...cellLatLon(coastal)).bedrock], "a place in a sea cell next to land gets that land's rock");
  assert.equal(geologyAt({ raster: {} }, 0, 0), null, "a world without geology has none");
  const shares = rockShares(asset, [[caren.lat, caren.lon], [garyk.lat, garyk.lon]]);
  assert.equal(Math.round(shares.reduce((a, s) => a + s.share, 0) * 1000), 1000);
});

test("earthquakes are drawn by rule: the same catalogue for any window, felt by distance and magnitude", () => {
  const volcano = asset.geology.volcanoes.find((v) => v.activity === "active"), q = { lat: volcano.at[0], lon: volcano.at[1] };
  const year = tremorsAt(asset.geology, { ...q, fromMs: T0, toMs: T0 + YEAR_MS });
  const firstHalf = tremorsAt(asset.geology, { ...q, fromMs: T0, toMs: T0 + YEAR_MS / 2 });
  assert.deepEqual(firstHalf.quakes, year.quakes.filter((x) => x.timeMs <= T0 + YEAR_MS / 2), "a shorter window is part of the longer one");
  assert.deepEqual(tremorsAt(asset.geology, { ...q, fromMs: T0, toMs: T0 + YEAR_MS }), year, "the same again");
  assert.ok(year.quakes.length > 0 && year.quakes.every((x) => x.intensity >= 2 && x.magnitude >= 3.5 && x.magnitude <= FAULTS[x.source].maxMagnitude));
  assert.ok(feltIntensity(7, 20, 15) > feltIntensity(7, 200, 15) && feltIntensity(7, 50, 15) > feltIntensity(5, 50, 15));
  assert.equal(boundaryPoints(asset.geology).trenches.length > 100, true);
});

test("active margins shake and erupt; the Godstone feels only faint tremors", () => {
  const active = asset.geology.volcanoes.filter((v) => v.activity === "active");
  let felt = 0, strong = 0, eruptions = 0;
  for (const v of active.slice(0, 12)) {
    const t = tremorsAt(asset.geology, { lat: v.at[0], lon: v.at[1], fromMs: T0, toMs: T0 + 5 * YEAR_MS });
    felt += t.quakes.length; strong += t.quakes.filter((x) => x.intensity >= 4.5).length; eruptions += t.eruptions.filter((e) => e.distanceKm === 0).length;
  }
  assert.ok(felt > 12 * 5 * 5, `about a felt quake a month or more near arc volcanoes (${felt})`);
  assert.ok(strong > 0 && eruptions > 3, `${strong} strong quakes, ${eruptions} eruptions`);
  const caren = town("Caren");
  for (const [lat, lon] of [[caren.lat, caren.lon], ...asset.settlements.filter((s) => s.continent === "Caren").slice(0, 20).map((s) => [s.lat, s.lon])]) {
    const t = tremorsAt(asset.geology, { lat, lon, fromMs: T0, toMs: T0 + 3 * YEAR_MS, onGodstone: true });
    assert.ok(t.quakes.every((x) => x.intensity <= 3), "never more than III on the Godstone");
  }
  assert.equal(describeTremors({ quakes: [], eruptions: [] }, T0), "none felt in the last 30 days");
});

test("battle maps, map packets and the Here-and-now card carry the local rock", () => {
  const garyk = town("Garyk");
  const map = buildBattleMap(asset, { center: [garyk.lat + 0.05, garyk.lon + 0.05], spec: battleMapSpec() });
  assert.ok(map.geology?.rock, "the battle map knows its rock");
  assert.match(battleArtDirection(map), /The local rock is /);
  assert.match(battlePacket(map), /- Rock: .*; soil: /);
  const spec = atlasMapSpec({ level: "region" }), ref = buildReferenceMap(asset, spec, { center: [garyk.lat, garyk.lon], title: "Test" });
  const packet = mapPacket({ asset, spec, frame: ref.frame, features: ref.features, title: "Test" });
  assert.match(packet.markdown, /## Rock, stone and ores/); assert.match(packet.prompt, /The rock shapes the land: /);
  const template = read("templates/cluster-map.hbs");
  for (const field of ["rock", "stone", "tremors"]) assert.ok(template.includes(`data-place-field="${field}"`), field);
});
