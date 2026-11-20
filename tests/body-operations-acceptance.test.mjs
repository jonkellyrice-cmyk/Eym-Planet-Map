import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv } from "../scripts/system-data.mjs";
import { bodyOperationAssetPath, deriveBodyOperationTargets } from "../scripts/body-operations.mjs";
import { generateBodyOperationAsset, serializeAsset } from "../tools/generate-body-operations.mjs";
const root = new URL("../", import.meta.url), rows = parseCsv(readFileSync(new URL("docs/system-orbital-distances.csv", root), "utf8")), cartography = JSON.parse(readFileSync(new URL("data/planet-cartography/manifest.json", root), "utf8"));
const targets = deriveBodyOperationTargets(rows, cartography);
const assetFor = (body) => { const row = targets.find(({ row }) => row.object === body)?.row; assert.ok(row, body); return JSON.parse(readFileSync(new URL(bodyOperationAssetPath(row.system, row.object), root), "utf8")); };

test("all accepted assets regenerate byte-for-byte from the current canonical registry", () => {
  for (const { row } of targets) assert.equal(readFileSync(new URL(bodyOperationAssetPath(row.system, row.object), root), "utf8"), serializeAsset(generateBodyOperationAsset(row)), `${row.system}/${row.object}`);
});

// Synthetic (non-canon) rows keep the generic structure families that Mitkear does not contain under test.
const synthetic = (object, type) => generateBodyOperationAsset({ system: "Mitkear", object, type, parent: "Mitkear" });

test("gas giants keep an atmospheric survey with no solid-surface routes", () => {
  // Iarn is the canonical gas giant; Mitkear has no ice/gas giant, so a synthetic row keeps that type under test.
  const giants = { Iarn: assetFor("Iarn"), "Synthetic Ice Giant": synthetic("Synthetic Ice Giant", "ice/gas giant") };
  for (const [body, giant] of Object.entries(giants)) {
    assert.equal(giant.operationalKind, "giant", body);
    assert.ok(giant.features.some((feature) => feature.layer === "storms"), body);
    assert.ok(!giant.features.some((feature) => feature.layer === "routes" || /surface route/i.test(feature.operationalRole)), body);
  }
});

test("an anomaly region stays an uncertain, non-dockable observation volume and generic gates, tethers and yards keep their structure", () => {
  const anomaly = synthetic("Synthetic Rift", "spatial anomaly region");
  assert.equal(anomaly.operationalKind, "anomaly");
  assert.equal(anomaly.coordinateFrame.geometryKind, "uncertain observation volume"); assert.ok(!anomaly.features.some((feature) => feature.type === "dock"));
  const gate = synthetic("Synthetic Gate", "blinkgate");
  assert.equal(gate.operationalKind, "blinkgate");
  assert.ok(gate.features.some((feature) => feature.type === "aperture")); assert.ok(gate.features.filter((feature) => feature.lodPriority === 1).length >= 8);
  const tether = synthetic("Synthetic Tether", "tether megastructure");
  assert.equal(tether.operationalKind, "megastructure"); assert.ok(tether.features.filter((feature) => feature.type === "segment").length >= 3);
  const yard = synthetic("Synthetic Yard", "shipyard");
  assert.equal(yard.operationalKind, "shipyard"); assert.ok(yard.features.some((feature) => feature.type === "gantry")); assert.ok(yard.features.some((feature) => feature.type === "berth"));
});

test("Mitkear uses its own naming culture without apostrophe-heavy fantasy names", () => {
  assert.deepEqual(new Set(targets.map(({ row }) => row.system)), new Set(["Mitkear"]));
  for (const { row } of targets) { const asset = assetFor(row.object); assert.ok(asset.namingProfile); assert.ok(asset.features.every((feature) => (feature.name.match(/[’']/g) ?? []).length <= 1)); }
});
