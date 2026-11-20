import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROCKS, SOILS, geologyAt, localStonePrompt, rockShares, soilFromRock } from "../scripts/eym-geology.mjs";
import { FAULTS, boundaryPoints, describeTremors, faultQuakes, feltIntensity, tremorsAt } from "../scripts/eym-quakes.mjs";
import { buildBattleMap } from "../scripts/eym-battle-rules.mjs";
import { battleArtDirection, battlePacket } from "../scripts/eym-battle-render.mjs";
import { battleMapSpec, atlasMapSpec } from "../scripts/eym-map-presets.mjs";
import { buildReferenceMap } from "../scripts/eym-reference-map.mjs";
import { mapPacket } from "../scripts/eym-map-packet.mjs";
import { DAY_MS, DAYS_PER_YEAR, NORTHWARD_EQUINOX_MS } from "../scripts/universal-time.mjs";
import { attachGeology } from "../scripts/cartography-asset.mjs";

const root = new URL("../", import.meta.url), read = (path) => readFileSync(new URL(path, root), "utf8");
const asset = JSON.parse(read("data/planet-cartography/mitkear/eym.json"));
// Eym's geology is its own file beside the asset (scripts/cartography-asset.mjs).
attachGeology(asset, JSON.parse(read(`data/planet-cartography/mitkear/${asset.geologyFile}`)));
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

test("active margins shake and erupt", () => {
  const active = asset.geology.volcanoes.filter((v) => v.activity === "active");
  let felt = 0, strong = 0, eruptions = 0;
  for (const v of active.slice(0, 12)) {
    const t = tremorsAt(asset.geology, { lat: v.at[0], lon: v.at[1], fromMs: T0, toMs: T0 + 5 * YEAR_MS });
    felt += t.quakes.length; strong += t.quakes.filter((x) => x.intensity >= 4.5).length; eruptions += t.eruptions.filter((e) => e.distanceKm === 0).length;
  }
  assert.ok(felt > 12 * 5 * 5, `about a felt quake a month or more near arc volcanoes (${felt})`);
  assert.ok(strong > 0 && eruptions > 3, `${strong} strong quakes, ${eruptions} eruptions`);
  assert.equal(describeTremors({ quakes: [], eruptions: [] }, T0), "none felt in the last 30 days");
});

test("Caren's earthquakes are an old continent's: small, seldom and spread out, none of magnitude 6", () => {
  // (Canon of 20 November 2026. This replaces the rule that a place on the Godstone never felt more than III: Caren
  // now has small earthquakes of its own, and its rock damps shaking only as any hard rock does.)
  const faults = boundaryPoints(asset.geology).intraplate, years = 400;
  assert.ok(faults.length >= 50, `${faults.length} small faults`);
  const all = faults.flatMap((at, index) => Array.from({ length: years }, (_, year) => faultQuakes("intraplate", index, at, year)).flat().map((q) => ({ ...q, fault: index })));
  const count = (lo, hi) => all.filter((q) => q.magnitude >= lo && q.magnitude < hi).length, perYear = all.length / years;
  assert.ok(Math.max(...all.map((q) => q.magnitude)) < 6 && FAULTS.intraplate.maxMagnitude < 6, "none of magnitude 6 or more");
  assert.ok(perYear > 0.5 && perYear < 3, `${perYear.toFixed(2)} quakes of 3.5 or more a year over all Caren`);
  assert.ok(count(3.5, 4) > all.length * 0.55, "mostly under 4");
  assert.ok(count(4, 5) > 0 && count(4, 5) < count(3.5, 4) * 0.6, "now and then 4 to 5");
  assert.ok(count(5, 6) > 0 && count(5, 6) / years < 0.1, `rarely 5 to 6 (${count(5, 6)} in ${years} years)`);
  // Spread out: every fault has some, and none has more than a few times its share.
  const byFault = faults.map((_, index) => all.filter((q) => q.fault === index).length), share = all.length / faults.length;
  assert.ok(Math.min(...byFault) > 0 && Math.max(...byFault) < 2.5 * share, `between ${Math.min(...byFault)} and ${Math.max(...byFault)} a fault; the even share is ${share.toFixed(1)}`);
  // Every epicentre lies on or beside Caren, and all are shallow.
  assert.ok(all.every((q) => Math.abs(q.at[0]) < 12 && Math.abs(q.at[1]) < 8 && q.depthKm <= 15));
  // The far sea floor's great quakes reach Caren only faintly: its nearest plate edge is over a thousand kilometres off.
  const caren = town("Caren"), places = [[caren.lat, caren.lon], ...asset.settlements.filter((s) => s.continent === "Caren").slice(0, 20).map((s) => [s.lat, s.lon])];
  for (const [lat, lon] of places) {
    const t = tremorsAt(asset.geology, { lat, lon, fromMs: T0, toMs: T0 + 10 * YEAR_MS });
    assert.ok(t.quakes.every((x) => x.magnitude < 6 || x.source !== "intraplate"));
    assert.ok(t.quakes.filter((x) => x.source !== "intraplate").every((x) => x.intensity <= 5), "a plate edge's quake is no more than moderate on Caren");
    assert.ok(t.quakes.every((x) => x.intensity <= 7.5), "nothing ruinous");
    // Hard rock shakes one step less than soft ground.
    const hard = tremorsAt(asset.geology, { lat, lon, fromMs: T0, toMs: T0 + 10 * YEAR_MS, hardRock: true });
    assert.ok(hard.quakes.length <= t.quakes.length && hard.quakes.every((h) => t.quakes.some((q) => q.timeMs === h.timeMs && Math.abs(q.intensity - 1 - h.intensity) < 0.11)));
  }
});

test("Caren's rocks: the Godstone is quartzite and leucogranite; the granites carry the veins, quartzite little; no volcanic rock", () => {
  const god = ROCKS["godstone-granite"];
  assert.match(god.name, /leucogranite and quartzite/);
  assert.ok(god.ores.some((o) => /tin and tungsten/.test(o)) && god.ores.some((o) => /veins/.test(o)) && god.ores.some((o) => /little in the quartzite/.test(o)));
  assert.doesNotMatch(JSON.stringify([god, ROCKS.marble, ROCKS["caren-limestone"]]), /holds no veins|seamless|volcan|lava|basalt/i);
  assert.ok(ROCKS.marble.ores.some((o) => /coal/.test(o)) && ROCKS["caren-limestone"].ores.some((o) => /salt/.test(o)) && ROCKS["caren-limestone"].ores.some((o) => /ironstone/.test(o)));
  // No cell of Caren carries volcanic rock.
  const carenCells = bedrock.filter((_, i) => { const [lat, lon] = cellLatLon(i); return Math.abs(lat) < 11 && Math.abs(lon) < 7; });
  assert.ok(!carenCells.includes("volcanic") && carenCells.includes("godstone-granite"));
  const c = town("Caren"), geo = geologyAt(asset, c.lat, c.lon);
  assert.equal(typeof geo.hardRock, "boolean");
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
