import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv } from "../scripts/system-data.mjs";
import { artificialBodyKind, buildArtificialBodyModel, buildArtificialBodyModels } from "../scripts/artificial-body-data.mjs";

const rows = parseCsv(readFileSync(new URL("../docs/system-orbital-distances.csv", import.meta.url), "utf8"));
// Abydos only has stations and an anomaly. These synthetic rows keep the other generic structural
// families (still supported by the code) under test; they are not canon.
const syntheticRows = [
  ["Synthetic Yard", "shipyard"],
  ["Synthetic Fleet", "fleet"],
  ["Synthetic Vessel", "major vessel"],
  ["Synthetic Ring", "megastructure"],
  ["Synthetic Gate", "blinkgate"],
].map(([object, type]) => ({ system: "Synthetic", object, type, parent: "Synthetic" }));

test("artificial approach models cover the Abydos families and every generic structural family", () => {
  const models = buildArtificialBodyModels(rows);
  assert.deepEqual(new Set(models.map((model) => model.kind)), new Set(["station", "anomaly"]));
  assert.equal(models.length, rows.filter((row) => artificialBodyKind(row)).length);
  const all = buildArtificialBodyModels([...rows, ...syntheticRows]);
  assert.deepEqual(new Set(all.map((model) => model.kind)), new Set(["station", "shipyard", "fleet", "vessel", "megastructure", "blinkgate", "anomaly"]));
});

test("docking-capable structures expose safe schematic approach geometry", () => {
  for (const model of buildArtificialBodyModels([...rows, ...syntheticRows]).filter((candidate) => candidate.kind !== "anomaly")) {
    assert.ok(model.approach.mode && model.approach.exclusionRadius > 0, model.body);
    assert.ok(model.approach.dockingNodes.length, model.body);
    assert.ok(model.dimensions && model.visualArchetype && model.function, model.body);
  }
});

test("a blinkgate is a legible gate and Thornfield remains non-dockable", () => {
  const akhetan = buildArtificialBodyModel(syntheticRows.find((row) => row.object === "Synthetic Gate"));
  const thornfield = buildArtificialBodyModel(rows.find((row) => row.object === "Thornfield"));
  assert.equal(akhetan.kind, "blinkgate"); assert.equal(akhetan.approach.mode, "gate-traffic-vector");
  assert.equal(thornfield.kind, "anomaly"); assert.deepEqual(thornfield.approach.dockingNodes, []);
});
