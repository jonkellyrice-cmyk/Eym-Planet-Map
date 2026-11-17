import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildEymSurface, destination, EYM_LAYOUT, greatCircleKm, toLocal } from "../scripts/eym-surface.mjs";
import { parseCsv } from "../scripts/system-data.mjs";
import { eymFingerprintFromRepo } from "../tools/eym-world.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const traced = JSON.parse(read("data/eym/traced-continents.json"));
const tectonics = JSON.parse(read("data/eym/tectonics.json"));
const { surface, sampler } = buildEymSurface(traced, EYM_LAYOUT, tectonics);
const asset = JSON.parse(read("data/planet-cartography/abydos/eventide.json"));
const CAREN_KM2 = 590_000 * 2.589988110336;
const continent = (id) => surface.continents.find((item) => item.id === id);
const mainland = (id) => surface.coasts.find((coast) => coast.id.startsWith(`${id}-mainland`)).points;
const bearing = (from, to) => { const [x, y] = toLocal(from, ...to); return (Math.atan2(x, y) * 180 / Math.PI + 360) % 360; };

test("Caren and Garyk keep the sizes their cartographer gave", () => {
  assert.ok(Math.abs(traced.continents.caren.mainlandAreaKm2 - CAREN_KM2) / CAREN_KM2 < 0.001);
  assert.ok(Math.abs(traced.continents.garyk.mainlandAreaKm2 - 0.8 * CAREN_KM2) / CAREN_KM2 < 0.001);
  assert.ok(Math.abs(continent("caren").mainlandAreaKm2 - CAREN_KM2) / CAREN_KM2 < 0.002);
});

test("the surface is deterministic", () => {
  assert.deepEqual(buildEymSurface(traced, EYM_LAYOUT, tectonics).surface, surface);
});

test("Caren straddles the equator; Garyk lies slightly north of it, three weeks west-north-west by steamer", () => {
  const lats = mainland("caren").map(([lat]) => lat);
  assert.ok(Math.min(...lats) < -5 && Math.max(...lats) > 5);
  assert.deepEqual(continent("caren").center, EYM_LAYOUT.caren.center);
  const garyk = continent("garyk").center;
  assert.ok(garyk[0] > 10 && garyk[0] < 25);
  const { carenPort, garykPort, steamer } = surface.layout.garyk;
  const steamedKm = greatCircleKm(carenPort, garykPort) * steamer.routeFactor;
  assert.ok(Math.abs(steamedKm / (9 * 1.852 * 24) - 21) < 0.05, `${steamedKm} km`);
  const heading = bearing(continent("caren").center, garyk);
  assert.ok(heading > 270 && heading < 300, `bearing ${heading}`);
});

test("the seeded continents: the largest to the east, colder ones far north and south", () => {
  const [caren, eastern, northern, southern] = ["caren", "eastern", "northern", "southern"].map(continent);
  assert.ok(eastern.mainlandAreaKm2 > Math.max(...surface.continents.filter((c) => c.id !== "eastern").map((c) => c.mainlandAreaKm2)));
  assert.ok(Math.min(...mainland("eastern").map(([, lon]) => lon)) > Math.max(...mainland("caren").map(([, lon]) => lon)));
  assert.ok(northern.center[0] > 40 && southern.center[0] < -40);
  assert.ok(northern.mainlandAreaKm2 < caren.mainlandAreaKm2 && southern.mainlandAreaKm2 < caren.mainlandAreaKm2);
  // Named by the owner (17 November 2026): no longer placeholders.
  assert.deepEqual([eastern, northern, southern].map((c) => [c.name, Boolean(c.placeholderName)]), [["Gaffa", false], ["Khohalis", false], ["Demani", false]]);
  assert.ok(surface.landFraction > 0.01 && surface.landFraction < 0.02);
});

test("the sampler finds land on every continent and open sea between them", () => {
  for (const id of ["caren", "garyk", "eastern", "northern", "southern"]) assert.equal(sampler(...continent(id).center)?.land || sampler(...continent(id).center)?.inlandWater, true, id);
  assert.equal(sampler(...destination(continent("caren").center, 90, 2000)), null);
});

test("Caren's names and settlements come from its map; Garyk's settlements keep their realms", () => {
  const names = new Set(asset.gazetteer.map((feature) => feature.properName));
  for (const name of ["Caren", "Garyk", "Sondel Range", "Molkath Confederation", "Cius League", "Federation of Vinon", "New Fae'run"]) assert.ok(names.has(name), name);
  const caren = asset.settlements.filter((site) => site.continent === "Caren"), garyk = asset.settlements.filter((site) => site.continent === "Garyk");
  assert.ok(caren.length >= 80 && caren.every((site) => site.properName));
  assert.ok(garyk.length >= 50 && garyk.every((site) => site.polityColor && !site.properName));
  const onLand = asset.settlements.filter((site) => sampler(site.lat, site.lon)).length;
  assert.ok(onLand / asset.settlements.length > 0.9, `${onLand}/${asset.settlements.length}`);
});

test("the colder continents are colder: taiga, tundra or ice, not rainforest", () => {
  const biomes = [...Buffer.from(asset.raster.biome.valuesBase64, "base64")].map((index) => asset.raster.biome.categories[index]);
  const share = (name, kinds) => {
    let hit = 0, total = 0;
    biomes.forEach((biome, index) => { const lat = -89.5 + Math.floor(index / 360), lon = -179.5 + index % 360, s = sampler(lat, lon); if (s?.land && s.continent === name) { total += 1; hit += kinds.includes(biome) ? 1 : 0; } });
    return hit / total;
  };
  const cold = ["taiga", "tundra", "ice-cap", "temperate-forest", "steppe", "cold-desert"], tropical = ["tropical-rainforest", "seasonal-forest", "savanna"];
  assert.ok(share("Khohalis", cold) > 0.8 && share("Demani", cold) > 0.8);
  assert.ok(share("Caren", tropical) > 0.7 && share("Caren", ["taiga"]) === 0);
});

test("Eym's registry row records the surface inputs it was built from", () => {
  const row = parseCsv(read("docs/system-orbital-distances.csv")).find((item) => item.object === "Eventide");
  assert.equal(row.geography_model_version, "eym-surface-v1");
  assert.equal(row.geography_input_fingerprint, eymFingerprintFromRepo());
  assert.ok(Math.abs(Number(row.water_pct) / 100 - asset.terrain.realizedWaterFraction) < 0.001);
});

test("the globe draws vector land, clips biomes to it and zooms in close", () => {
  const view = read("scripts/body-view-core.mjs");
  for (const token of ["oscm-land-clip", "oscm-cartography-land", "oscm-cartography-detail", "this.maxZoom = 30"]) assert.ok(view.includes(token), token);
  assert.equal(new Set(asset.terrain.detail.map((d) => d.kind)).size, 4);
});
