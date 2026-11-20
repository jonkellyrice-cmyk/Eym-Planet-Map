import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildEymSurface, buildSphereFrame, destination, EYM_LAYOUT, EYM_RADIUS_KM, FRAME_STRETCH_LIMIT, frameEastScale, frameFromLatLon, frameStretch, frameToLatLon, greatCircleKm, makeSampler, sphericalRingAreaKm2, toLocal } from "../scripts/eym-surface.mjs";
import { frameMaskRings } from "../scripts/eym-cartography.mjs";
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

// ---------------------------------------------------------------- land too large for a flat frame (land-growth scaling, Fix 4)

/** A land given about a centre: as far as `reach(bearing)` km every way. Its ring, and the truth of what lies inside it. */
const roundLand = (center, reach, vertices = 720) => ({
  center, ring: Array.from({ length: vertices }, (_, i) => destination(center, i * 360 / vertices, reach(i * 360 / vertices))),
  inside: (lat, lon) => { const [x, y] = toLocal(center, lat, lon), km = Math.hypot(x, y); return km - reach((Math.atan2(x, y) * 180 / Math.PI + 360) % 360); },
  areaKm2: (() => { let a = 0; for (let i = 0; i < 3600; i += 1) a += (1 - Math.cos(reach(i / 10) / EYM_RADIUS_KM)) * (Math.PI / 1800); return a * EYM_RADIUS_KM ** 2; })(),
});
const squares = (frame, each) => { const { grid } = frame; for (let r = 0; r < grid.rows; r += 1) for (let c = 0; c < grid.cols; c += 1) each(r * grid.cols + c, grid.x0 + (c + 0.5) * grid.cellKm, grid.y0 - (r + 0.5) * grid.cellKm); };

test("today's continents all sit on flat frames that stretch less than the limit", () => {
  const { frames } = buildEymSurface(traced, EYM_LAYOUT, tectonics);
  assert.equal(frames.filter((frame) => frame.continent).length, 5);
  for (const frame of frames) { assert.equal(frame.sphere, undefined, frame.id); assert.ok(frameStretch(frame.radiusKm) < FRAME_STRETCH_LIMIT, `${frame.id} stretches ${frameStretch(frame.radiusKm)}`); assert.equal(frameEastScale(frame, 500), 1); }
  assert.ok(Math.abs(frameStretch(2194) - 0.02) < 0.0002 && frameStretch(9429) > 0.48, "the stretch of a flat frame at its edge");
});

test("a grid on the sphere holds a land that lies across ±180° and over the north pole, square for square", () => {
  // About 55° north by the date line, reaching 3,400 to 5,000 km: over the pole (3,900 km off) and a little down the far side.
  const land = roundLand([55, 178], (bearing) => 4200 + 800 * Math.sin(3 * bearing * Math.PI / 180));
  const frame = buildSphereFrame({ id: "test", continent: "Test", origin: "seeded", center: land.center, rings: [land.ring], seed: "test" }), { grid } = frame;
  assert.ok(frame.sphere && grid.cols * grid.rows < 300000, `${grid.cols} x ${grid.rows}`);
  let wrong = 0, near = 0, area = 0, count = 0;
  squares(frame, (i, x, y) => {
    const [lat, lon] = frameToLatLon(frame, x, y), off = land.inside(lat, lon);
    if (Math.abs(off) < 1.5 * grid.cellKm) near += 1; else if ((off < 0) !== Boolean(frame.land[i])) wrong += 1;
    if (frame.land[i]) { area += grid.cellKm ** 2 * frameEastScale(frame, y); count += 1; assert.ok(frame.elevation[i] >= 1 && Number.isFinite(frame.elevation[i])); }
    // There and back again.
    if (i % 997 === 0) { const [bx, by] = frameFromLatLon(frame, lat, lon); assert.ok(Math.abs(bx - x) < 1e-6 && Math.abs(by - y) < 1e-6); }
  });
  assert.equal(wrong, 0, "every square away from the coast is land or sea as the land itself is");
  assert.ok(near > 1000 && count > 50000);
  assert.ok(Math.abs(area / land.areaKm2 - 1) < 0.005, `area on the grid ${Math.round(area)} against ${Math.round(land.areaKm2)}`);
  assert.ok(Math.abs(sphericalRingAreaKm2(land.ring) / land.areaKm2 - 1) < 0.005, "the ring's own area on the sphere");
  const south = roundLand([-80, 20], () => 2500); assert.ok(Math.abs(sphericalRingAreaKm2(south.ring) / south.areaKm2 - 1) < 0.005, "and of a land over the south pole");
  // The sampler finds it on both sides of ±180°, at the pole and beyond it, and not in the sea.
  const sample = makeSampler([frame]);
  for (const [lat, lon, want] of [[55, 178, true], [60, -170, true], [60, 150, true], [89.9, 0, true], [88, -2, true], [80, -2, false], [10, 178, false], [55, 90, false], [-55, -2, false]]) assert.equal(Boolean(sample(lat, lon)?.land), want, `${lat}, ${lon}`);
  assert.equal(sample(60, -170).continent, "Test");
  assert.throws(() => buildSphereFrame({ id: "huge", continent: "Huge", origin: "seeded", center: [0, 0], rings: [roundLand([0, 0], () => 9500).ring], seed: "test" }), /too large for one grid/);
});

test("on a grid of the sphere the distance to the coast is true, ranges stand along their ridges, and outlines come out in place", () => {
  // A round land 3,000 km in radius, far south, across ±180°: the coast is 3,000 km less the distance from the centre.
  const land = roundLand([-40, -176], () => 3000), ridge = { heightM: 4000, widthKm: 90, points: [destination(land.center, 90, 1500), land.center, destination(land.center, 270, 1500)] };
  const frame = buildSphereFrame({ id: "round", continent: "Round", origin: "seeded", center: land.center, rings: [land.ring], ridges: [ridge], seed: "test" }), { grid } = frame;
  let worst = 0, onRidge = 0, offRidge = 0;
  squares(frame, (i, x, y) => {
    if (!frame.land[i]) return; const at = frameToLatLon(frame, x, y), truth = 3000 - greatCircleKm(land.center, at);
    // (Beyond a few squares from the coast, where a square's own size no longer counts for much.)
    if (truth > 300) worst = Math.max(worst, Math.abs(frame.coastKm[i] - truth) / truth);
    const [dx, dy] = toLocal(land.center, ...at); if (Math.abs(dx) < 1000 && Math.abs(dy) < 25) onRidge = Math.max(onRidge, frame.elevation[i]); if (Math.abs(dx) < 1000 && dy > 600 && dy < 700) offRidge = Math.max(offRidge, frame.elevation[i]);
  });
  assert.ok(worst < 0.12, `the distance to the coast is out by at most ${worst}`);
  assert.ok(onRidge > 3000 && offRidge < 1500, `the range ${onRidge} m, the plain beside it ${offRidge} m`);
  // The outline of its land, as the cartography draws masks: one ring, on the coast, in ordinary latitude and longitude.
  const rings = frameMaskRings(frame, frame.land); assert.equal(rings.length, 1);
  for (const [lat, lon] of rings[0]) { assert.ok(lon >= -180 && lon <= 180 && lat > -75 && lat < -5); assert.ok(Math.abs(greatCircleKm(land.center, [lat, lon]) - 3000) < 2 * grid.cellKm); }
  assert.ok(rings[0].some(([, lon]) => lon > 150) && rings[0].some(([, lon]) => lon < -150), "it lies on both sides of ±180°");
});

test("a continent grown past the limit is put on the sphere, its area taken there, and Caren and Garyk are untouched", () => {
  // The same world with Gaffa's fitted outline four times as far across.
  const grown = { ...tectonics, continents: { ...tectonics.continents, eastern: { ...tectonics.continents.eastern, rings: tectonics.continents.eastern.rings.map((ring) => ring.map(([x, y]) => [x * 4, y * 4])), ridges: tectonics.continents.eastern.ridges.map((ridge) => ({ ...ridge, points: ridge.points.map(([x, y]) => [x * 4, y * 4]) })) } } };
  const before = buildEymSurface(traced, EYM_LAYOUT, tectonics), after = buildEymSurface(traced, EYM_LAYOUT, grown);
  const frame = (built, id) => built.frames.find((f) => f.id === id);
  assert.ok(frame(after, "eastern").sphere && !frame(before, "eastern").sphere);
  for (const id of ["caren", "garyk", "northern", "southern"]) for (const key of ["outline", "land", "water", "coastKm", "elevation", "forest", "reliefValue"]) assert.deepEqual(frame(after, id)[key], frame(before, id)[key], `${id} ${key}`);
  assert.deepEqual(after.surface.coasts.filter((c) => c.continent !== "Gaffa"), before.surface.coasts.filter((c) => c.continent !== "Gaffa"));
  const coast = after.surface.coasts.find((c) => c.id === "eastern-mainland-1");
  assert.ok(Math.abs(coast.areaKm2 / sphericalRingAreaKm2(coast.points) - 1) < 0.001, "its area is its area on the sphere");
  const mid = after.sampler(...EYM_LAYOUT.seeded.find((spec) => spec.id === "eastern").center); assert.ok(mid?.land && mid.continent === "Gaffa");
});
