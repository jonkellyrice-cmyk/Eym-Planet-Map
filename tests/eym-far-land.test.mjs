// How land too large for a flat frame is written into the shipped data, and the budget the shipped data is held to
// (land-growth scaling, Fix 7).
import test from "node:test";
import assert from "node:assert/strict";
import { buildEymSurface, buildSphereFrame, destination, EYM_LAYOUT, greatCircleKm, sphericalRingAreaKm2, toLocal } from "../scripts/eym-surface.mjs";
import { frameCoarseWater, frameHydrology, thinLine } from "../scripts/eym-cartography.mjs";
import { polygonize } from "../scripts/cartography-regions.mjs";
import { WORLD_INPUTS } from "../scripts/eym-world-inputs.mjs";
import { dataBudget, readPins } from "../tools/world-checks.mjs";
import { loadWorld, treeReader } from "../tools/world-snapshot.mjs";
import { readFileSync } from "node:fs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
/** How far (km) a place lies from a line of points, on flat ground about the place. */
const offLine = (at, line) => { let near = Infinity; for (let k = 0; k + 1 < line.length; k += 1) { const a = toLocal(at, ...line[k]), b = toLocal(at, ...line[k + 1]), dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / L)) : 0; near = Math.min(near, Math.hypot(a[0] + t * dx, a[1] + t * dy)); } return near; };

test("a line is thinned to a stated distance, measured on the sphere: across ±180° and round a coast alike", () => {
  // A wandering course from 176° east across the seam to 176° west.
  const course = Array.from({ length: 200 }, (_, i) => [20 + 3 * Math.sin(i / 9) + 0.02 * Math.sin(i * 1.7), ((176 + i * 0.04 + 180) % 360) - 180]);
  const thin = thinLine(course, 6);
  assert.ok(thin.length < course.length / 3 && thin.length >= 8, `${course.length} points to ${thin.length}`);
  assert.deepEqual(thin[0], course[0]); assert.deepEqual(thin.at(-1), course.at(-1));
  for (const point of course) assert.ok(offLine(point, thin) <= 6.05, "no point dropped lies farther off than the distance stated");
  for (const point of thin) assert.ok(course.includes(point), "only points of the line itself are kept");
  assert.equal(thinLine(course, 0), course);
  // A coast: a ragged round land across ±180°, closed. It stays closed, keeps its area, and strays no farther.
  const center = [-30, 179.5], ring = Array.from({ length: 900 }, (_, i) => destination(center, i * 0.4, 1500 + 60 * Math.sin(i / 7) + 3 * Math.sin(i * 1.3))), closed = [...ring, ring[0]];
  const coast = thinLine(closed, 5);
  assert.ok(coast.length < closed.length / 3 && coast.length > 30); assert.deepEqual(coast[0], coast.at(-1));
  for (let i = 0; i < closed.length; i += 5) assert.ok(offLine(closed[i], coast) <= 5.05);
  assert.ok(Math.abs(sphericalRingAreaKm2(coast.slice(0, -1)) / sphericalRingAreaKm2(ring) - 1) < 0.002, "its area is kept");
  // A ring so smooth that everything could go still keeps a shape.
  const smooth = Array.from({ length: 60 }, (_, i) => destination([0, 0], i * 6, 3)); assert.ok(thinLine([...smooth, smooth[0]], 50).length >= 4);
});

test("a region's outline can be kept by its corners only: the same outline in fewer points, and only where asked", () => {
  // A grid of 1° cells, 6 by 8, with an L of "clay" in a field of "loam".
  const grid = { latCount: 6, lonCount: 8 }, cells = [];
  for (let i = 0; i < 6; i += 1) for (let j = 0; j < 8; j += 1) cells.push({ id: i * 8 + j, latIndex: i, lonIndex: j, soil: (i >= 1 && i <= 4 && j === 2) || (i === 1 && j >= 2 && j <= 6) ? "clay" : "loam", far: j >= 2 });
  const area = (ring) => Math.abs(ring.slice(0, -1).reduce((sum, p, k, all) => { const q = all[(k + 1) % all.length]; return sum + p[1] * q[0] - q[1] * p[0]; }, 0)) / 2;
  const full = polygonize(cells, "soil", 1, grid).find((r) => r.category === "clay"), slim = polygonize(cells, "soil", 1, grid, () => true).find((r) => r.category === "clay");
  assert.equal(full.cellCount, 8); assert.equal(slim.cellCount, 8);
  assert.equal(full.polygons[0].length, 19, "every cell corner along the L"); assert.equal(slim.polygons[0].length, 7, "its six corners, closed");
  assert.equal(area(full.polygons[0]), 8); assert.equal(area(slim.polygons[0]), 8);
  // The compact region says so to its caller, without the mark being written out with it.
  assert.equal(slim.compact, true); assert.equal(full.compact, undefined); assert.ok(!JSON.stringify(slim).includes("compact") && !("compact" in { ...slim }));
  for (const corner of slim.polygons[0]) assert.ok(full.polygons[0].some((p) => p[0] === corner[0] && p[1] === corner[1]));
  // Asked region by region: here only regions wholly in the "far" columns.
  const some = polygonize(cells, "soil", 1, grid, (component) => component.every((cell) => cell.far));
  assert.equal(some.find((r) => r.category === "clay").polygons[0].length, 7); assert.deepEqual(some.find((r) => r.category === "loam"), polygonize(cells, "soil", 1, grid).find((r) => r.category === "loam"));
});

test("a continent on a sphere grid is routed coarsely by the dials; one on a flat frame is not touched", () => {
  const { frames } = buildEymSurface(read("data/eym/traced-continents.json"), EYM_LAYOUT, read("data/eym/tectonics.json"));
  for (const frame of frames) assert.equal(frameCoarseWater(frame), undefined, `${frame.id} is on a flat frame`);
  const center = [-35, 179], ring = Array.from({ length: 720 }, (_, i) => destination(center, i / 2, 3000)), ridge = { heightM: 3500, widthKm: 120, points: [destination(center, 0, 2200), center, destination(center, 180, 2200)] };
  const frame = buildSphereFrame({ id: "round", continent: "Round", origin: "seeded", center, rings: [ring], ridges: [ridge], seed: "test" }), dials = WORLD_INPUTS.layout.farLand, coarse = frameCoarseWater(frame);
  assert.ok(Math.abs(coarse.riverAreaKm2 / (27_760_000 / dials.riverLandShare) - 1) < 0.01 && coarse.lakeMinCells === dials.lakeMinSquares && coarse.thinKm === dials.courseThinKm);
  const fine = frameHydrology(frame), few = frameHydrology(frame, coarse), bytes = (v) => JSON.stringify(v).length;
  assert.ok(few.rivers.length > 20 && few.rivers.length < fine.rivers.length && few.lakes.length <= fine.lakes.length);
  assert.ok(bytes(few.rivers) < bytes(fine.rivers) / 2, `${bytes(fine.rivers)} bytes of rivers to ${bytes(few.rivers)}`);
  for (const river of few.rivers) {
    assert.equal(river.elevationsM.length, river.points.length, "a height for each point kept");
    assert.ok(river.dischargeKm2 >= coarse.riverAreaKm2 * 0.5);
    // The same river as the fine routing draws from that head: its ends are where they were.
    const twin = fine.rivers.find((r) => greatCircleKm(r.points[0], river.points[0]) < 1 && greatCircleKm(r.points.at(-1), river.points.at(-1)) < 1);
    if (twin) for (const point of twin.points) assert.ok(offLine(point, river.points) <= dials.courseThinKm + 0.1);
  }
});

test("the shipped data is held to a budget against its size before the land grew, file by file and together", () => {
  const pins = readPins(), world = loadWorld(treeReader()), lines = dataBudget(world, pins);
  assert.equal(pins.fixed.dataBudget.factor, 1.5);
  assert.deepEqual(lines.map((line) => line.id), ["size-tectonics", "size-climate", "size-asset", "size-geology", "size-ocean", "size-drainage", "size-wind", "size-flow", "size-coasts", "size-total"]);
  for (const line of lines) assert.ok(line.ok, `${line.id}: ${line.detail}`);
  assert.equal(lines.at(-1).limit, Math.round(2_824_693 * 1.5));
  // The cartography as the stopped rebuild left it (2,690,260 bytes) would have been refused; so would everything doubled.
  const grown = dataBudget({ text: { ...world.text, asset: "x".repeat(2_690_260) } }, pins);
  assert.equal(grown.find((line) => line.id === "size-asset").ok, false); assert.equal(grown.find((line) => line.id === "size-total").ok, true);
  const doubled = dataBudget({ text: Object.fromEntries(Object.entries(world.text).map(([key, text]) => [key, text == null ? text : text + text])) }, pins);
  assert.equal(doubled.at(-1).ok, false);
});
