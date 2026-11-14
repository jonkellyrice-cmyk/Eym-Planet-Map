import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildConstellations } from "../tools/generate-constellations.mjs";
import { FIGURE_MAGNITUDE_LIMIT } from "../tools/find-constellation-candidates.mjs";
import { angularDistanceDeg, celestialPole, orbitNormal } from "../scripts/sky-frame.mjs";

const committed = readFileSync(new URL("../data/stellar/constellations.json", import.meta.url), "utf8");
const data = JSON.parse(committed);
const starfieldText = readFileSync(new URL("../data/stellar/starfield.json", import.meta.url), "utf8");
const starfield = JSON.parse(starfieldText);
const star = (id) => starfield.stars[Number(id.slice(5)) - 1];

test("committed constellations are exactly what the deterministic generator produces", () => {
  assert.equal(committed, `${JSON.stringify(buildConstellations(), null, 2)}\n`);
  assert.equal(data.sourceStarfield.sha256, createHash("sha256").update(starfieldText).digest("hex"));
});

test("a pre-modern sky: about 20 constellations per hemisphere, 7 chief in each", () => {
  assert.deepEqual(data.counts, { constellations: 35, north: 16, south: 19, chief: 14, sunPath: 8, asterisms: 4 });
  for (const hemisphere of ["north", "south"]) {
    assert.equal(data.constellations.filter((c) => c.hemisphere === hemisphere && c.tier === "chief").length, 7);
  }
});

test("names are unique: plain English, or a canon deity's possessive", () => {
  const names = [...data.constellations, ...data.asterisms].map((c) => c.name);
  assert.equal(new Set(names).size, names.length);
  for (const name of names) assert.match(name, /^(The [A-Z][A-Za-z' ]+|[A-Z][a-z]+'s [A-Z][a-z]+)$/);
  assert.equal(new Set(data.constellations.map((c) => c.id)).size, data.constellations.length);
});

test("every figure is a connected stick figure of bright, real stars", () => {
  for (const c of data.constellations) {
    assert.ok(c.stars.length >= 3 && c.stars.length <= 8, c.name);
    for (const id of c.stars) assert.ok(star(id) && star(id)[3] < FIGURE_MAGNITUDE_LIMIT, `${c.name}: ${id}`);
    const members = new Set(c.stars);
    for (const [a, b] of c.lines) assert.ok(members.has(a) && members.has(b), `${c.name}: line ${a}-${b}`);
    const reached = new Set([c.stars[0]]);
    for (let grew = true; grew;) {
      grew = false;
      for (const [a, b] of c.lines) if (reached.has(a) !== reached.has(b)) { reached.add(a); reached.add(b); grew = true; }
    }
    assert.equal(reached.size, c.stars.length, `${c.name} is not one connected figure`);
    for (const [a, b] of c.lines) assert.ok(angularDistanceDeg(star(a).slice(0, 3), star(b).slice(0, 3)) <= 9, `${c.name}: overlong line`);
  }
});

test("no star belongs to two constellations; asterisms may overlap them", () => {
  const seen = new Map();
  for (const c of data.constellations) for (const id of c.stars) {
    assert.ok(!seen.has(id), `${id} is in both ${seen.get(id)} and ${c.name}`);
    seen.set(id, c.name);
  }
  for (const a of data.asterisms) {
    for (const id of a.stars) assert.ok(star(id), `${a.name}: ${id}`);
    for (const [x, y] of a.lines) assert.ok(a.stars.includes(x) && a.stars.includes(y), a.name);
  }
});

test("the path of the sun is crossed by eight constellations in a fixed order", () => {
  const signs = data.constellations.filter((c) => c.sunPath).sort((a, b) => a.sunPath.order - b.sunPath.order);
  assert.deepEqual(signs.map((c) => c.sunPath.order), [1, 2, 3, 4, 5, 6, 7, 8]);
  const longitudes = signs.map((c) => c.sunPath.longitudeDeg);
  assert.deepEqual(longitudes, [...longitudes].sort((a, b) => a - b));
});

test("Eym's celestial pole leans exactly its axial tilt from the path of the sun's pole", () => {
  assert.ok(Math.abs(angularDistanceDeg(data.celestialPole, data.sunPathPole) - 23.44) < 1e-3);
  assert.ok(Math.abs(angularDistanceDeg(orbitNormal(0), [0, 0, 1])) < 1e-9);
  assert.ok(Math.abs(angularDistanceDeg(celestialPole({ inclinationDeg: 0, axialTiltDeg: 30, axialSeasonPhaseDeg: 90 }), [0, 0, 1]) - 30) < 1e-9);
});
