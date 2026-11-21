// How high a range stands, from its history (scripts/eym-orogeny.mjs; owner's direction of 20 November 2026:
// heights by their causes, not by a category and some noise). Causal tests: changing the cause changes the effect,
// in the right direction and by a meaningful amount.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WORLD_INPUTS } from "../scripts/eym-world-inputs.mjs";
import { OROGENY_MODEL, rangeHistory } from "../scripts/eym-orogeny.mjs";
import { TECTONIC_INPUTS, TECTONIC_SOURCES } from "../tools/generate-eym-tectonics.mjs";
import { GROWTH_INPUTS, GROWTH_SOURCES } from "../tools/generate-eym-growth.mjs";

const O = WORLD_INPUTS.orogeny, json = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const range = (history) => rangeHistory(O, { widthKm: 120, kind: "collision", convergenceMmYr: 30, activeMyr: 25, ...history });

test("faster or longer convergence raises a range higher; the same kind of range with a different history has a different height", () => {
  const slow = range({ convergenceMmYr: 8 }), mid = range({ convergenceMmYr: 30 }), fast = range({ convergenceMmYr: 60 });
  assert.ok(slow.peakM < mid.peakM && mid.peakM < fast.peakM && fast.peakM > slow.peakM * 2, `${slow.peakM} < ${mid.peakM} < ${fast.peakM} m`);
  const young = range({ activeMyr: 5 }), grown = range({ activeMyr: 25 }), old = range({ activeMyr: 60 });
  assert.ok(young.peakM < grown.peakM * 0.5 && grown.peakM < old.peakM, `${young.peakM} < ${grown.peakM} < ${old.peakM} m`);
  // A subducting plate mostly goes down: at the same speed a coastal range is lower than a collision.
  assert.ok(range({ kind: "subduction", activeMyr: 200, widthKm: 75 }).peakM < range({ activeMyr: 200, widthKm: 75 }).peakM * 0.7);
  // No convergence, no range.
  assert.equal(range({ convergenceMmYr: 0 }).peakM, 0);
  assert.equal(OROGENY_MODEL, "eym-orogeny-v1");
});

test("an old belt that has stopped rising is lower the longer ago it stopped, and keeps low mountains for hundreds of millions of years", () => {
  const A = O.assembly, at = (endedMyrAgo) => rangeHistory(O, { kind: "collision", ...A, endedMyrAgo, widthKm: 110 });
  const heights = [0, 50, 100, 200, 320, 600].map((t) => at(t).peakM);
  for (let k = 1; k < heights.length; k += 1) assert.ok(heights[k] < heights[k - 1], heights.join(" > "));
  assert.ok(heights[4] < heights[0] * 0.4 && heights[4] > 800 && heights[5] > 400, `${heights[0]} m when it stopped, ${heights[4]} m after 320 Myr, ${heights[5]} m after 600`);
  // The young, active collision of today stands higher than the First Land's old seams.
  assert.ok(range({ convergenceMmYr: 40 }).peakM > at(A.endedMyrAgo).peakM * 1.5);
});

test("wetter country or softer rock wears a range lower over the same time, and unroofs it deeper", () => {
  const A = O.assembly, old = (more) => rangeHistory(O, { kind: "collision", ...A, widthKm: 110, ...more });
  const dry = old({ rainMm: 300 }), plain = old({ rainMm: 1000 }), wet = old({ rainMm: 3000 });
  assert.ok(wet.peakM < plain.peakM * 0.8 && plain.peakM < dry.peakM * 0.8, `${wet.peakM} < ${plain.peakM} < ${dry.peakM} m`);
  // (An old belt is unroofed to its root whatever the rain; a young one deeper the wetter it is.)
  assert.ok(wet.exhumedKm >= plain.exhumedKm && plain.exhumedKm >= dry.exhumedKm && range({ rainMm: 3000 }).exhumedKm > range({ rainMm: 300 }).exhumedKm);
  const soft = old({ rock: 0.5 }), hard = old({ rock: 2 });
  assert.ok(soft.peakM < plain.peakM * 0.8 && hard.peakM > plain.peakM * 1.3 && soft.exhumedKm >= hard.exhumedKm && range({ rock: 0.5 }).exhumedKm > range({ rock: 2 }).exhumedKm, `${soft.peakM} / ${plain.peakM} / ${hard.peakM} m`);
  // An active range in wet country also stands lower than the same range in dry country.
  assert.ok(range({ rainMm: 3000 }).peakM < range({ rainMm: 300 }).peakM);
});

test("the crust floats: height is the crust's excess times the density contrast, the root rebounds as rock is taken off, and crust has a limit", () => {
  const float = 1 - O.crustDensity / O.mantleDensity, r = range({});
  assert.ok(Math.abs(r.meanM - (r.crustKm - O.crustKm) * float * 1000) < 20 && Math.abs(r.peakM - r.meanM * O.peakOverMean) <= 1);
  // Taking the load off: after it stops, the rock removed is 1 / (1 − ρc/ρm) = 6.6 times the fall of the surface.
  const brief = { kind: "collision", convergenceMmYr: 20, activeMyr: 10, widthKm: 110 }, stopped = rangeHistory(O, { ...brief, endedMyrAgo: 0 }), now = rangeHistory(O, { ...brief, endedMyrAgo: 40 });
  const fellKm = (stopped.meanM - now.meanM) / 1000, removedKm = now.exhumedKm - stopped.exhumedKm;
  assert.ok(fellKm > 0.3 && Math.abs(removedKm / fellKm - 1 / float) < 0.5, `${removedKm.toFixed(1)} km of rock for ${fellKm.toFixed(2)} km of height`);
  // However fast and long, crust does not thicken beyond its limit: no range higher than that allows.
  const most = range({ convergenceMmYr: 200, activeMyr: 300 });
  assert.ok(most.crustKm <= O.maxCrustKm && most.peakM <= (O.maxCrustKm - O.crustKm) * float * 1000 * O.peakOverMean + 1 && most.steady);
});

test("every range of the far continents carries its history, and its height is what that history gives", () => {
  for (const [inputs, sources] of [[TECTONIC_INPUTS, TECTONIC_SOURCES], [GROWTH_INPUTS, GROWTH_SOURCES]]) { assert.ok(inputs.includes("orogeny")); assert.ok(sources.includes("scripts/eym-orogeny.mjs")); }
  const growth = json("data/eym/growth.json"), tectonics = json("data/eym/tectonics.json"), all = [];
  for (const world of [tectonics.continents, growth.continents]) for (const c of Object.values(world)) for (const ridge of c.ridges) all.push({ continent: c.name, ...ridge });
  assert.ok(all.length >= 12);
  for (const ridge of all) {
    assert.ok(ridge.history && ridge.history.convergenceMmYr >= 0 && ridge.history.rainMm > 0, `${ridge.continent} ${ridge.origin}`);
    const h = rangeHistory(O, ridge.history);
    assert.equal(ridge.heightM, h.peakM, `${ridge.continent} ${ridge.origin}`); assert.equal(ridge.crustKm, h.crustKm); assert.equal(ridge.unroofedKm, h.exhumedKm);
    assert.ok(ridge.crustKm >= O.crustKm && ridge.crustKm <= O.maxCrustKm);
  }
  // The old seams are low and deeply unroofed; of the active ranges, the faster the plates close the higher.
  const sutures = all.filter((r) => r.origin === "suture"), active = all.filter((r) => r.history.endedMyrAgo === 0);
  assert.ok(sutures.length >= 3 && sutures.every((r) => r.heightM < 2600 && r.unroofedKm > 10), sutures.map((r) => `${r.heightM} m`).join(", "));
  for (const kind of ["collision", "accretion", "subduction"]) { const mine = active.filter((r) => r.history.kind === kind && r.history.activeMyr === active.find((x) => x.history.kind === kind).history.activeMyr).sort((a, b) => a.history.convergenceMmYr - b.history.convergenceMmYr); if (mine.length >= 2 && mine.at(-1).history.convergenceMmYr > mine[0].history.convergenceMmYr * 1.3 && Math.abs(mine.at(-1).history.rainMm - mine[0].history.rainMm) < 300) assert.ok(mine.at(-1).heightM >= mine[0].heightM, `${kind}: ${mine.map((r) => `${r.history.convergenceMmYr} mm/yr → ${r.heightM} m`).join("; ")}`); }
  assert.ok(new Set(all.map((r) => r.heightM)).size >= Math.min(8, all.length - 2), "ranges of one kind are not all one height");
});
