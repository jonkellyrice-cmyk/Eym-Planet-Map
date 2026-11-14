import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSystemModel, classifySystemObject, displayPosition, parseCsv, physicalDistanceAu } from "../scripts/system-data.mjs";

const rows = parseCsv(readFileSync(new URL("../docs/system-orbital-distances.csv", import.meta.url), "utf8"));
const systems = [...new Set(rows.map((row) => row.system))];

test("the Abydos system model resolves every parent hierarchy to finite coordinates", () => {
  assert.deepEqual(systems, ["Abydos"]);
  for (const system of systems) {
    const model = buildSystemModel(rows, system);
    for (const object of model.objects) {
      for (const value of Object.values(object.physical)) assert.ok(Number.isFinite(value), `${system}/${object.name}`);
      for (const value of Object.values(displayPosition(object, model))) assert.ok(Number.isFinite(value), `${system}/${object.name}`);
      if (object.parentObject) assert.ok(Math.abs(physicalDistanceAu(object, object.parentObject) - object.distanceAu) < 1e-10, `${system}/${object.name}`);
    }
  }
});

test("the Abydos registry exposes exactly its schematic object families", () => {
  const classes = new Set(systems.flatMap((system) => buildSystemModel(rows, system).objects.map((object) => object.objectClass)));
  assert.deepEqual(classes, new Set(["star", "planet", "moon", "giant"]));
});

test("the classifier still maps every schematic family, including ones Abydos lacks", () => {
  const cases = {
    "K2V star": "star", barycenter: "barycenter", "rocky planet": "planet", moon: "moon", "gas giant": "giant",
    "major station": "installation", shipyard: "installation", blinkgate: "installation", "carrier/fleet group": "vessel",
    "asteroid/debris belt": "belt", "spatial anomaly region": "anomaly", "anomaly field": "anomaly",
  };
  for (const [type, objectClass] of Object.entries(cases)) assert.equal(classifySystemObject(type), objectClass, type);
});

test("non-selectable regions remain visible but unavailable as route endpoints (synthetic; Abydos has none)", () => {
  const real = systems.flatMap((system) => buildSystemModel(rows, system).objects).filter((object) => ["belt", "anomaly"].includes(object.objectClass));
  assert.deepEqual(real, []);
  const synthetic = [
    { system: "Region Test", object: "Test Star", type: "G2V star", parent: "System barycenter", distance_from_parent: "0", distance_unit: "AU", selectable: "yes" },
    { system: "Region Test", object: "Test Field", type: "spatial anomaly region", parent: "Test Star", distance_from_parent: "5.4", distance_unit: "AU", selectable: "no" },
  ];
  const regions = buildSystemModel(synthetic, "Region Test").objects.filter((object) => ["belt", "anomaly"].includes(object.objectClass));
  assert.deepEqual(regions.map((object) => object.name), ["Test Field"]);
  assert.ok(regions.every((object) => !object.selectable));
});

test("all system objects retain canonical identity and reference measurements", () => {
  const objects = systems.flatMap((system) => buildSystemModel(rows, system).objects);
  assert.equal(objects.length, 9);
  assert.equal(new Set(objects.map((object) => object.id)).size, 9);
  for (const object of objects) {
    assert.ok(object.name && object.type && object.parent);
    assert.ok(object.distanceAu >= 0);
  }
});
