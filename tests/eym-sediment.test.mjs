// What the land sheds and where it rests, and the crust that floats it (scripts/eym-sediment.mjs,
// tools/generate-eym-crust.mjs; owner's direction of 20 November 2026). Causal tests on small invented lands, and
// checks of the planet's file.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WORLD_INPUTS } from "../scripts/eym-world-inputs.mjs";
import { SEDIMENT_MODEL, denudationMPerMyr, routeSediment } from "../scripts/eym-sediment.mjs";
import { CRUST_INPUTS, CRUST_SOURCES, buildCrust, crustSourcesSha256 } from "../tools/generate-eym-crust.mjs";

const S = WORLD_INPUTS.sediment, json = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8")), sum = (list) => list.reduce((a, b) => a + b, 0);
/** An invented land on a 12 × 24 grid of squares: `heightAt(row, col)` gives metres or null for sea; every land square sheds `shedAt(row, col)` km³. */
const land = (heightAt, shedAt = () => 1) => { const rows = 12, cols = 24, heightM = [], yieldKm3 = []; for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) { const h = heightAt(r, c); heightM.push(h); yieldKm3.push(h == null ? 0 : shedAt(r, c)); } return { rows, cols, heightM, yieldKm3, widthKmAt: () => 100 }; };
// A slope running down to the west coast: columns 4 to 15 are land, highest in the east.
const ramp = (r, c) => (r >= 2 && r <= 9 && c >= 4 && c <= 15 ? 30 + (c - 4) * 400 : null);

test("steeper ground, more runoff or softer rock wears faster; flat dry ground still wears a little", () => {
  const at = (more) => denudationMPerMyr(S, { reliefM: 500, runoffMm: 650, rock: 1, ...more });
  assert.ok(at({ reliefM: 1500 }) > at({}) * 2 && at({}) > at({ reliefM: 50 }) * 3);
  assert.ok(at({ runoffMm: 2600 }) > at({}) * 1.7 && at({ runoffMm: 60 }) < at({}) * 0.5);
  assert.ok(Math.abs(at({ rock: 2 }) - at({}) / 2) < 1e-9 && at({ rock: 0.6 }) > at({}) * 1.5);
  assert.equal(denudationMPerMyr(S, { reliefM: 0, runoffMm: 0 }), S.flatMPerMyr);
  assert.equal(SEDIMENT_MODEL, "eym-sediment-v1");
});

test("what the land sheds all comes to rest, and more shed upstream means a bigger delta", () => {
  const even = routeSediment(S, land(ramp)), shed = sum(land(ramp).yieldKm3);
  assert.ok(Math.abs(sum([...even.depositKm3]) - shed) < 1e-6, "nothing is lost on the way");
  const kinds = new Set(even.kind.filter(Boolean)); assert.ok(kinds.has("delta") && kinds.has("shelf"));
  // The deltas lie in the sea squares at the foot of the slope, on the west coast.
  const deltaOf = (routed) => sum([...routed.depositKm3].filter((_, i) => routed.kind[i] === "delta"));
  assert.ok(even.kind.some((k, i) => k === "delta" && i % 24 === 3), "deltas in the sea at the foot of the slope");
  // Twice the wear in the high east (more rain or softer rock there): more reaches the coast.
  const wetter = routeSediment(S, land(ramp, (r, c) => (c >= 10 ? 2 : 1)));
  assert.ok(deltaOf(wetter) > deltaOf(even) * 1.3, `${deltaOf(even).toFixed(1)} against ${deltaOf(wetter).toFixed(1)} km³ in the deltas`);
  // The load a square passes on grows downstream.
  const loads = [14, 10, 6].map((c) => sum(Array.from({ length: 12 }, (_, r) => even.passingKm3[r * 24 + c]))); for (let k = 1; k < loads.length; k += 1) assert.ok(loads[k] > loads[k - 1], loads.join(" < "));
});

test("gentle ground keeps a share as an alluvial plain, and a deep hollow with no way out keeps everything", () => {
  // The same slope with a wide flat plain along the coast (columns 4 to 8 at 20 to 24 m).
  const plain = routeSediment(S, land((r, c) => (ramp(r, c) == null ? null : c <= 8 ? 20 + (c - 4) : 30 + (c - 8) * 600)));
  const kept = sum([...plain.depositKm3].filter((_, i) => plain.kind[i] === "plain")), reached = sum([...plain.depositKm3].filter((_, i) => plain.kind[i] === "delta" || plain.kind[i] === "shelf"));
  assert.ok(kept > 0.3 * reached && plain.kind.some((k, i) => k === "plain" && i % 24 <= 8), `${kept.toFixed(1)} km³ on the plain, ${reached.toFixed(1)} to the sea`);
  const steep = routeSediment(S, land(ramp)); assert.ok(steep.kind.every((k, i) => k !== "plain" || i % 24 === 4), "a steep slope keeps nothing but on its last square by the sea");
  assert.ok(kept > 2 * sum([...steep.depositKm3].filter((_, i) => steep.kind[i] === "plain")));
  // A hollow 1,000 m deep in the middle of a plateau: what drains into it stays there.
  const bowl = routeSediment(S, land((r, c) => (r >= 2 && r <= 9 && c >= 4 && c <= 15 ? (Math.abs(r - 5.5) < 2 && Math.abs(c - 9.5) < 2 ? 1000 : 2000 + 10 * Math.abs(c - 9.5)) : null)));
  const basin = sum([...bowl.depositKm3].filter((_, i) => bowl.kind[i] === "basin"));
  assert.ok(basin >= 16 - 1e-9, `${basin.toFixed(1)} km³ in the closed basin`);
  // A shallow dip (under the basin depth) drains through to the sea.
  const dip = routeSediment(S, land((r, c) => (ramp(r, c) == null ? null : r === 5 && c === 9 ? ramp(r, c) - 200 : ramp(r, c))));
  assert.ok(!dip.kind.includes("basin"));
});

test("the planet's crust and sediment: in the chain, every square floated, deep rock unroofed, and the great deltas off the wet, high coasts", () => {
  const kept = json("data/eym/crust.json"), s = kept.summary, O = WORLD_INPUTS.orogeny;
  assert.equal(kept.sourcesSha256, crustSourcesSha256()); assert.deepEqual(JSON.parse(JSON.stringify(buildCrust())), kept);
  assert.deepEqual(CRUST_INPUTS, ["sediment", "orogeny", "caren", "rivers"]); for (const path of ["scripts/eym-sediment.mjs", "data/eym/growth.json"]) assert.ok(CRUST_SOURCES.includes(path));
  assert.ok(s.landSquares > 10000 && s.crustKm[0] >= O.crustKm && s.crustKm[2] <= O.maxCrustKm && s.crustKm[1] > 36 && s.crustKm[1] < 45);
  assert.ok(Math.abs(s.shedKm3PerMyr - s.restedKm3PerMyr) < 0.005 * s.shedKm3PerMyr && s.wearMPerMyr.mean > 20 && s.wearMPerMyr.mean < 120 && s.wearMPerMyr.most > 10 * s.wearMPerMyr.middle);
  assert.ok(s.restsBy.delta > s.restsBy.basin && s.restsBy.plain > 0 && s.restsBy.shelf > 0);
  assert.ok(s.unroofedSquares > 1000 && s.deepestUnroofedKm >= S.basementUnroofedKm && s.deepestUnroofedKm <= O.maxCrustKm - O.crustKm);
  assert.ok(s.greatestDeltas.length === 12 && s.greatestDeltas.every((d) => d.continent && d.thicknessKm > 0 && d.thicknessKm <= S.maxFillKm));
  const bytes = (b64) => Buffer.from(b64, "base64"); assert.equal(bytes(kept.land.crustThirdKmBase64).length, kept.land.count); assert.equal(bytes(kept.land.wearMPerMyrUint16Base64).length, 2 * kept.land.count);
  for (const [, deciKm, kind, km3] of kept.sediment.squares) assert.ok(deciKm >= 1 && deciKm <= 10 * S.maxFillKm && ["delta", "shelf", "plain", "basin"].includes(kind) && km3 >= 0);
});
