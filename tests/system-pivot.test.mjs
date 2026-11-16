import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recenterPoint } from "../scripts/system-view.mjs";

const source = readFileSync(new URL("../scripts/system-view.mjs", import.meta.url), "utf8");

test("the pivot sits at the centre: a body seen from itself is at the origin", () => {
  const eym = { x: 1.2, y: -0.1, z: 0.7 };
  assert.deepEqual(recenterPoint(eym, eym), { x: 0, y: 0, z: 0 });
  assert.deepEqual(recenterPoint({ x: 0, y: 0, z: 0 }, eym), { x: -1.2, y: 0.1, z: -0.7 }, "Mictir moves off-centre");
  assert.deepEqual(recenterPoint(eym, { x: 0, y: 0, z: 0 }), eym, "the default pivot is Mictir");
});

test("selecting a body moves the pivot to it; clearing or resetting returns to Mictir", () => {
  assert.match(source, /this\.#pivotTo\(this\.destination \?\? this\.origin\)/);
  assert.equal((source.match(/this\.#pivotTo\(null\)/g) ?? []).length, 2, "reset view and clear selection");
  assert.match(source, /point = recenterPoint\(worldPoint, this\.pivot\)/, "every projected point is seen from the pivot");
});
