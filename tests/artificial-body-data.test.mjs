import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv } from "../scripts/system-data.mjs";
import { artificialBodyKind, buildArtificialBodyModel, buildArtificialBodyModels } from "../scripts/artificial-body-data.mjs";

const rows = parseCsv(readFileSync(new URL("../docs/system-orbital-distances.csv", import.meta.url), "utf8"));
// Abydos has no artificial or anomalous bodies. These synthetic rows keep every generic structural
// family (still supported by the code) under test; they are not canon.
const syntheticRows = [
  ["Synthetic Station", "major station"],
  ["Synthetic Array", "installation array"],
  ["Synthetic Rift", "spatial anomaly region"],
  ["Synthetic Yard", "shipyard"],
  ["Synthetic Fleet", "fleet"],
  ["Synthetic Vessel", "major vessel"],
  ["Synthetic Ring", "megastructure"],
  ["Synthetic Gate", "blinkgate"],
].map(([object, type]) => ({ system: "Synthetic", object, type, parent: "Synthetic" }));

test("Abydos has no artificial bodies and approach models cover every generic structural family", () => {
  const models = buildArtificialBodyModels(rows);
  assert.deepEqual(models, []);
  assert.equal(rows.filter((row) => artificialBodyKind(row)).length, 0);
  const all = buildArtificialBodyModels([...rows, ...syntheticRows]);
  assert.equal(all.length, syntheticRows.length);
  assert.deepEqual(new Set(all.map((model) => model.kind)), new Set(["station", "shipyard", "fleet", "vessel", "megastructure", "blinkgate", "anomaly"]));
});

test("docking-capable structures expose safe schematic approach geometry", () => {
  for (const model of buildArtificialBodyModels([...rows, ...syntheticRows]).filter((candidate) => candidate.kind !== "anomaly")) {
    assert.ok(model.approach.mode && model.approach.exclusionRadius > 0, model.body);
    assert.ok(model.approach.dockingNodes.length, model.body);
    assert.ok(model.dimensions && model.visualArchetype && model.function, model.body);
  }
});

test("a blinkgate is a legible gate and a spatial anomaly region remains non-dockable", () => {
  const gate = buildArtificialBodyModel(syntheticRows.find((row) => row.object === "Synthetic Gate"));
  const anomaly = buildArtificialBodyModel(syntheticRows.find((row) => row.object === "Synthetic Rift"));
  assert.equal(gate.kind, "blinkgate"); assert.equal(gate.approach.mode, "gate-traffic-vector");
  assert.equal(anomaly.kind, "anomaly"); assert.deepEqual(anomaly.approach.dockingNodes, []);
});
