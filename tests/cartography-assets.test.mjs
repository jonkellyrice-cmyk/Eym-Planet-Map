import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { elevationGrid } from "../scripts/cartography-asset.mjs";

const root = new URL("../", import.meta.url), manifest = JSON.parse(readFileSync(new URL("data/planet-cartography/manifest.json", root), "utf8"));
const coarse = JSON.parse(readFileSync(new URL(manifest.sourceManifest, root), "utf8"));
const coarseByKey = new Map(coarse.worlds.map((world) => [`${world.system}/${world.body}`, world]));
const load = (entry) => JSON.parse(readFileSync(new URL(entry.path, root), "utf8"));

test("refined manifest contains 4 unique fingerprinted worlds", () => {
  assert.equal(manifest.schemaVersion, 2);
  assert.equal(manifest.worlds.length, 4);
  assert.equal(new Set(manifest.worlds.map((world) => `${world.system}/${world.body}`)).size, 4);
  for (const entry of manifest.worlds) {
    const text = readFileSync(new URL(entry.path, root), "utf8");
    assert.equal(createHash("sha256").update(text).digest("hex"), entry.sha256);
    assert.equal(Buffer.byteLength(text), entry.bytes);
  }
});

test("every asset preserves its accepted seed and coarse fingerprint", () => {
  for (const entry of manifest.worlds) {
    const asset = load(entry), source = coarseByKey.get(`${entry.system}/${entry.body}`);
    assert.equal(asset.sourceSeed, source.seed, entry.body);
    assert.equal(asset.sourceFingerprint, source.inputFingerprint, entry.body);
    assert.equal(asset.modelVersion, entry.body === "Eventide" ? "eym-surface-v1" : manifest.modelVersion, entry.body);
  }
});

test("compact two-degree rasters and vector products fit the mobile loading budget", () => {
  for (const entry of manifest.worlds) {
    const asset = load(entry), count = asset.grid.latCount * asset.grid.lonCount;
    assert.ok(entry.bytes <= 1_750_000, `${entry.body}: ${entry.bytes}`);
    assert.equal(elevationGrid(asset).length, count);
    assert.equal(Buffer.from(asset.raster.oceanMaskBase64, "base64").length, count);
    for (const field of ["biome", "soil", "resource"]) assert.equal(Buffer.from(asset.raster[field].valuesBase64, "base64").length, count);
    assert.ok(asset.terrain.elevationMesh.triangles.length && asset.terrain.coastlines.length && asset.regions.ecoregions.length);
  }
});

test("Eym's geology is its own file, loaded on demand, within its own budget; the height grid is packed", () => {
  const withGeology = manifest.worlds.filter((entry) => entry.geology);
  assert.deepEqual(withGeology.map((entry) => entry.body), ["Eventide"]);
  for (const entry of withGeology) {
    const text = readFileSync(new URL(entry.geology.path, root), "utf8"), asset = load(entry), document = JSON.parse(text);
    assert.equal(createHash("sha256").update(text).digest("hex"), entry.geology.sha256);
    assert.ok(entry.geology.bytes <= 200_000, `${entry.body} geology: ${entry.geology.bytes}`);
    assert.equal(asset.geologyFile, entry.geology.path.split("/").at(-1));
    assert.ok(!asset.geology && !asset.raster.bedrock, "the main asset does not carry the geology");
    assert.ok(document.geology.volcanoes.length && document.bedrock.categories.length && document.sourceFingerprint === asset.sourceFingerprint);
  }
  for (const entry of manifest.worlds) assert.ok(!load(entry).raster.elevationM && load(entry).raster.elevationInt16Base64, `${entry.body}: packed height grid`);
});

test("materialized gazetteers and civilization networks have literal geometry", () => {
  for (const entry of manifest.worlds) {
    const asset = load(entry);
    assert.ok(asset.gazetteer.every((feature) => feature.properName && feature.at.every(Number.isFinite)), entry.body);
    if (entry.body === "Eventide") assert.ok(asset.settlements.some((site) => site.kind === "capital"), entry.body);
    else assert.equal(asset.settlements.filter((site) => site.kind === "capital").length, 1, entry.body);
    assert.ok(asset.transportRoutes.every((route) => route.properName && route.points.length >= 2), entry.body);
  }
});

test("Eym materializes with vector coastlines for its five continents and their islands", () => {
  const eym = load(manifest.worlds.find((world) => world.body === "Eventide"));
  assert.equal(eym.terrain.coastlineSource, "vector");
  assert.equal(eym.terrain.coastlines.filter((coast) => coast.kind === "mainland").length, 5);
  assert.ok(eym.terrain.coastlines.filter((coast) => coast.kind === "island").length >= 100);
  for (const coast of eym.terrain.coastlines) assert.deepEqual(coast.points[0], coast.points.at(-1));
});
