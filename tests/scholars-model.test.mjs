import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JURISDICTION_BADGES, ORRERY, knownCount, ringRadius, scholarEntry } from "../scripts/scholars-model.mjs";
import { buildSystemModel, displayPosition, parseCsv, physicalDistanceAu } from "../scripts/system-data.mjs";
import { systemSprite } from "../scripts/system-sprites.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const model = buildSystemModel(parseCsv(read("docs/system-orbital-distances.csv")), "Mitkear"), by = (name) => model.byName.get(name);
const span = (a, b) => { const p = displayPosition(a, model), q = displayPosition(b, model); return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z); };

test("no badge of ownership floats above any body, in the system view or over a globe", () => {
  assert.equal(JURISDICTION_BADGES, false);
  assert.match(read("scripts/body-view.mjs"), /if \(!faction \|\| !JURISDICTION_BADGES\) return;/);
  assert.match(read("scripts/system-view.mjs"), /if \(JURISDICTION_BADGES && faction && /);
});

test("what the scholars know: the Sun, the world, two moons and four wandering stars; only the world opens", () => {
  assert.equal(scholarEntry(by("Eym")).openable, true);
  for (const name of ["Mitkear", "White Moon", "Red Moon", "Iarn", "Esonth", "Bruthi", "Lilta"]) assert.equal(scholarEntry(by(name)).openable, false, name);
  for (const name of ["Iarn", "Esonth", "Bruthi", "Lilta"]) assert.equal(scholarEntry(by(name)).label, "wandering star");
  assert.equal(scholarEntry(by("Enoch")).hidden, true, "a wandering star's moon cannot be seen without a glass");
  assert.equal(knownCount(model.objects), 8);
  // The truth stays in the registry for the calendar, sky and tides.
  assert.ok(by("Iarn").radiusRe > 5); assert.ok(by("Bruthi").geography_seed);
});

test("the model's rings are evenly spaced in the true order, whatever the true distances", () => {
  const order = ["Bruthi", "Eym", "Esonth", "Lilta", "Iarn"].map(by), radii = order.map((o) => span(o, by("Mitkear")));
  for (const [k, r] of radii.entries()) assert.ok(Math.abs(r - (ORRERY.firstRing + ORRERY.ringStep * k)) < 1e-9, order[k].name);
  assert.ok(order.every((o, k) => !k || o.distanceAu > order[k - 1].distanceAu), "nearest the Sun first");
  assert.ok(Math.abs(span(by("Red Moon"), by("Eym")) - ORRERY.firstMoonRing) < 1e-9);
  assert.ok(Math.abs(span(by("White Moon"), by("Eym")) - (ORRERY.firstMoonRing + ORRERY.moonRingStep)) < 1e-9);
  assert.ok(ORRERY.firstMoonRing + ORRERY.moonRingStep < ORRERY.ringStep, "a world's moons stay inside its own ring's spacing");
  assert.equal(ringRadius(by("Bruthi"), model.objects), ORRERY.firstRing);
  // Each body keeps its true direction from what it circles, and the physical model is untouched.
  const eym = by("Eym"), shown = displayPosition(eym, model), k = ORRERY.firstRing + ORRERY.ringStep;
  assert.ok(Math.abs(shown.x / k - eym.physical.x / Math.hypot(eym.physical.x, eym.physical.y, eym.physical.z)) < 1e-6);
  assert.ok(Math.abs(physicalDistanceAu(by("Mitkear"), by("Iarn")) - by("Iarn").orbitalState.radiusAu) < 1e-9);
});

test("the sprites are pixel art drawn by rule: the same every time, small, with few colours", () => {
  for (const [kind, options, size] of [["sun", {}, 64], ["world", {}, 40], ["moon", { name: "White Moon" }, 24], ["moon", { name: "Red Moon" }, 20], ["wanderer", { rank: 0 }, 34], ["wanderer", { rank: 3 }, 26]]) {
    const a = systemSprite(kind, options), b = systemSprite(kind, options);
    assert.equal(a.size, size); assert.deepEqual(a.data, b.data, `${kind} is deterministic`);
    const colours = new Set(); let opaque = 0;
    for (let i = 0; i < a.data.length; i += 4) { if (a.data[i + 3]) { opaque += 1; colours.add((a.data[i] << 16) | (a.data[i + 1] << 8) | a.data[i + 2]); } else assert.equal(a.data[i + 3], 0); }
    assert.ok(opaque > size * size * 0.12, `${kind} is drawn`); assert.ok(colours.size <= 24, `${kind} uses ${colours.size} colours`);
    assert.equal(a.data[3], 0, "transparent corners");
  }
  assert.notDeepEqual(systemSprite("wanderer", { rank: 0 }).data.slice(0, 4000), systemSprite("wanderer", { rank: 1 }).data.slice(0, 4000));
  assert.equal(systemSprite("vessel"), null);
});

test("the system view paints the model and opens only the world", () => {
  const view = read("scripts/system-view.mjs"), app = read("scripts/cluster-map-app.mjs");
  assert.match(view, /if \(scholarEntry\(object\)\.openable\) activate\(object\)/);
  assert.match(view, /scholarEntry\(object\)\.hidden\) continue/);
  assert.match(view, /oscm-system-sprite/); assert.match(view, /imageRendering = "pixelated"/);
  assert.match(app, /!scholarEntry\(object\)\.openable\) return/);
  assert.match(app, /objectType: known\?\.label/);
  // Names stay off the model until a body is chosen.
  const css = read("styles/system-map.css");
  assert.match(css, /\.oscm-system-object \.oscm-system-object-label, \.oscm-system-object \.oscm-system-object-type \{ display: none; \}/);
  assert.match(css, /\.oscm-system-object\.is-origin \.oscm-system-object-label/);
  assert.ok(!/node\.label\.style\.display/.test(view), "selection alone decides which name shows");
});
