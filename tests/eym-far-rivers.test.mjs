// Rivers of the continents that are routed, not traced (land-growth scaling, Fix 5): the routing gives the rivers
// the cartography holds, and on a grid of the sphere they are measured truly and run unbroken across ±180°.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildEymSurface, buildSphereFrame, destination, EYM_LAYOUT, frameEastScale, greatCircleKm } from "../scripts/eym-surface.mjs";
import { frameCoarseWater, frameHydrology } from "../scripts/eym-cartography.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const asset = read("data/planet-cartography/abydos/eventide.json");

test("the routed rivers are the ones in the accepted cartography, point for point", () => {
  // (The grown continents, data/eym/growth.json, are on grids of the sphere and routed coarsely by the farLand dials.)
  const { frames } = buildEymSurface(read("data/eym/traced-continents.json"), EYM_LAYOUT, read("data/eym/tectonics.json"), read("data/eym/growth.json"));
  let rivers = 0;
  for (const frame of frames.filter((f) => f.origin === "seeded" && f.continent)) {
    const stats = {}, routed = frameHydrology(frame, frameCoarseWater(frame), stats), shipped = asset.hydrology.rivers.filter((river) => river.continent === frame.continent);
    assert.equal(routed.rivers.length, shipped.length, frame.continent); assert.equal(stats.rivers, shipped.length); assert.ok(stats.land > 5000 && stats.land < stats.squares);
    const courses = new Set(shipped.map((river) => JSON.stringify(river.points)));
    for (const river of routed.rivers) { assert.ok(courses.has(JSON.stringify(river.points)), `${frame.continent}: a course that is not in the cartography`); rivers += 1; }
  }
  assert.ok(rivers >= 40, `${rivers} rivers`);
});

test("on a grid of the sphere rivers run unbroken across ±180°, and catchments and lakes are measured on the ground", () => {
  // A round land 3,000 km in radius across ±180°, with a range along its middle: rivers run off it both ways.
  const center = [-35, 179], ring = Array.from({ length: 720 }, (_, i) => destination(center, i / 2, 3000)), ridge = { heightM: 3500, widthKm: 120, points: [destination(center, 0, 2200), center, destination(center, 180, 2200)] };
  const frame = buildSphereFrame({ id: "round", continent: "Round", origin: "seeded", center, rings: [ring], ridges: [ridge], seed: "test" }), { grid } = frame;
  const stats = {}, { rivers, lakes } = frameHydrology(frame, {}, stats);
  let landKm2 = 0; for (let r = 0; r < grid.rows; r += 1) { const e = frameEastScale(frame, grid.y0 - (r + 0.5) * grid.cellKm); for (let c = 0; c < grid.cols; c += 1) if (frame.land[r * grid.cols + c]) landKm2 += grid.cellKm ** 2 * e; }
  assert.ok(Math.abs(landKm2 / 27_760_000 - 1) < 0.01, `the land is ${Math.round(landKm2)} km² (a cap of 3,000 km)`);
  assert.ok(rivers.length > 30 && stats.rivers === rivers.length);
  let east = 0, west = 0, crossing = 0, toSea = 0;
  for (const river of rivers) {
    for (let k = 1; k < river.points.length; k += 1) assert.ok(greatCircleKm(river.points[k - 1], river.points[k]) < 3 * grid.cellKm, "no stride longer than a few squares");
    for (const [lat, lon] of river.points) { assert.ok(lon >= -180 && lon <= 180 && greatCircleKm(center, [lat, lon]) < 3000 + 2 * grid.cellKm); if (lon > 0) east += 1; else west += 1; }
    if (river.points.some(([, lon]) => lon > 170) && river.points.some(([, lon]) => lon < -170)) crossing += 1;
    assert.ok(river.dischargeKm2 >= 18_000 * 0.5 && river.dischargeKm2 < landKm2);
    if (river.mouth === "ocean") toSea += river.dischargeKm2;
  }
  assert.ok(east > 100 && west > 100 && crossing > 0, `${east} points east of ±180°, ${west} west, ${crossing} courses across it`);
  // What reaches the sea by the rivers is a good part of the land and never more than all of it; the lakes lie within it.
  assert.ok(toSea > 0.3 * landKm2 && toSea <= landKm2 * 1.001, `${Math.round(toSea)} of ${Math.round(landKm2)} km² drains by the rivers`);
  assert.ok(lakes.reduce((sum, lake) => sum + lake.areaKm2, 0) < landKm2 && lakes.every((lake) => greatCircleKm(center, lake.center) < 3000));
  // Made twice, the same.
  assert.deepEqual(frameHydrology(frame), { rivers, lakes });
});
