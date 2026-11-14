import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCartographyRenderPlan, cartographyFeatureBudget, cartographyLod, decodeCartographyRaster, projectGeoPath, selectCartographyLabels } from "../scripts/body-cartography.mjs";

const root = new URL("../", import.meta.url), manifest = JSON.parse(readFileSync(new URL("data/planet-cartography/manifest.json", root), "utf8"));
const load = (body) => JSON.parse(readFileSync(new URL(manifest.worlds.find((world) => world.body === body).path, root), "utf8"));

test("compact canonical raster decodes every two-degree surface cell", () => {
  const eventide = load("Eventide"), raster = decodeCartographyRaster(eventide), count = eventide.grid.latCount * eventide.grid.lonCount;
  assert.equal(raster.count, count);
  assert.equal(raster.elevationM.length, count);
  assert.equal(raster.ocean.length, count);
  assert.ok(raster.biome.categories.includes("open-ocean"));
  assert.ok(raster.soil.categories.includes("marine-sediment"));
});

test("zoom LOD reveals progressively finer cartography", () => {
  const orbital = cartographyLod(.8, true), regional = cartographyLod(1.5, true), surface = cartographyLod(3, true);
  assert.equal(orbital.id, "orbital"); assert.equal(regional.id, "regional"); assert.equal(surface.id, "surface");
  assert.ok(orbital.minRegionCells > regional.minRegionCells && regional.minRegionCells > surface.minRegionCells);
  assert.ok(orbital.labels < regional.labels && regional.labels < surface.labels);
});

test("geographic vectors project to smooth limb-clipped SVG paths", () => {
  const visible = projectGeoPath([[0, -20], [2, 0], [0, 20]], 0, 0, 250);
  const far = projectGeoPath([[0, 150], [0, 180], [0, 210]], 0, 0, 250);
  assert.match(visible, /^M/); assert.match(visible, /L/); assert.equal(far, "");
  assert.match(projectGeoPath([[0, -10], [10, 0], [0, 10], [0, -10]], 0, 0, 250, [450, 340], true), /Z$/);
});

test("mobile render plans retain essential layers within a bounded DOM budget", () => {
  for (const body of ["Ramses", "Eventide", "Thraximundus", "Kandahar"]) {
    const world = load(body), orbital = buildCartographyRenderPlan(world, .8, true), surface = buildCartographyRenderPlan(world, 3, true);
    assert.ok(orbital.coastlines.length && orbital.rivers.length && orbital.settlements.length, body);
    assert.ok(surface.ecoregions.length >= orbital.ecoregions.length, body);
    assert.ok(surface.resources.length > 0, body);
    assert.ok(cartographyFeatureBudget(orbital) < cartographyFeatureBudget(surface), body);
    assert.ok(cartographyFeatureBudget(surface) < 1_600, body);
  }
});

test("orbital labels prioritize permanent capital, ocean and continental names", () => {
  for (const body of ["Ramses", "Eventide", "Thraximundus", "Kandahar"]) {
    const labels = selectCartographyLabels(load(body), .8, true);
    assert.ok(labels.some((feature) => feature.featureClass === "capital"), body);
    assert.ok(labels.some((feature) => feature.featureClass === "ocean"), body);
    assert.ok(labels.every((feature) => feature.properName), body);
    assert.equal(new Set(labels.map((feature) => feature.properName)).size, labels.length, body);
  }
});

test("body viewer and controller consume refined vectors with cultural labels", () => {
  const view = readFileSync(new URL("scripts/body-view.mjs", root), "utf8"), app = readFileSync(new URL("scripts/cluster-map-app.mjs", root), "utf8");
  for (const token of ["#buildRefinedGeography", "projectGeoPath", "oscm-cartography-label", "transportRoutes", "resourceProvinces"]) assert.match(view, new RegExp(token));
  assert.match(app, /planet-cartography/);
  assert.match(app, /normalize\("NFKD"\)/);
});
