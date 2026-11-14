import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { buildConstellations } from "../tools/generate-constellations.mjs";
import { FIGURE_MAGNITUDE_LIMIT } from "../tools/find-constellation-candidates.mjs";
import { SCULPT_MAGNITUDE_LIMIT } from "../tools/sculpt-constellations.mjs";
import { buildBaseStarfield } from "../tools/generate-starfield.mjs";
import { SCULPTED_FIGURES } from "../tools/constellation-canon.mjs";
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

test("a Ptolemy-sized sky: 48 constellations, 24 per hemisphere, 7 chief in each", () => {
  assert.deepEqual(data.counts, { constellations: 48, north: 24, south: 24, chief: 14, sunPath: 8, asterisms: 4, lunarMansions: 28 });
  assert.equal(data.constellations.filter((c) => c.origin === "discovered").length, 35);
  assert.equal(data.constellations.filter((c) => c.origin === "sculpted").length, 13);
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
    const limit = c.origin === "sculpted" ? SCULPT_MAGNITUDE_LIMIT : FIGURE_MAGNITUDE_LIMIT;
    for (const id of c.stars) assert.ok(star(id) && star(id)[3] < limit, `${c.name}: ${id}`);
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

test("the original 35 constellations and 4 asterisms are exactly as first named", () => {
  const keep = data.constellations.filter((c) => c.origin === "discovered")
    .map((c) => ({ id: c.id, name: c.name, description: c.description, tier: c.tier, hemisphere: c.hemisphere, declinationDeg: c.declinationDeg, sunPath: c.sunPath, shape: c.shape, center: c.center, stars: c.stars, lines: c.lines }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const asterisms = data.asterisms.map((a) => ({ id: a.id, name: a.name, stars: a.stars, lines: a.lines }));
  assert.equal(createHash("sha256").update(JSON.stringify(keep)).digest("hex"), "c5aae242822ad2b9f55877e170122c64ff57427a1484acae3acfcef0245f08ff");
  assert.equal(createHash("sha256").update(JSON.stringify(asterisms)).digest("hex"), "322e536bd7c51670a8f44fde7d5f7562cb28228d8f648dabff1f6e9a9ad7c449");
});

test("sculpting nudged only spare stars, by a few degrees, and never changed brightness", () => {
  const base = buildBaseStarfield();
  const sculptedStars = new Set(data.constellations.filter((c) => c.origin === "sculpted").flatMap((c) => c.stars));
  const otherFigureStars = new Set([...data.constellations.filter((c) => c.origin === "discovered").flatMap((c) => c.stars), ...data.asterisms.flatMap((a) => a.stars)]);
  const moved = [];
  starfield.stars.forEach((row, i) => {
    const id = `star-${String(i + 1).padStart(4, "0")}`;
    assert.equal(row[3], base.stars[i][3], `${id} brightness changed`);
    assert.equal(row[4], base.stars[i][4], `${id} depth changed`);
    if (row.slice(0, 3).every((value, k) => value === base.stars[i][k])) return;
    moved.push({ id, move: angularDistanceDeg(row.slice(0, 3), base.stars[i].slice(0, 3)) });
  });
  assert.ok(moved.length > 0 && moved.length <= 100, `${moved.length} stars moved`);
  for (const { id, move } of moved) {
    assert.ok(sculptedStars.has(id), `${id} moved but is not in a sculpted figure`);
    assert.ok(!otherFigureStars.has(id), `${id} belongs to an original figure`);
    assert.ok(move <= 8, `${id} moved ${move.toFixed(1)}°`);
  }
  assert.deepEqual(starfield.sculpted.moves.map((m) => m.star).sort(), moved.map((m) => m.id).sort());
});

test("the 13 sculpted figures keep their templates' names, place and the path of the sun clear", () => {
  for (const figure of SCULPTED_FIGURES) {
    const c = data.constellations.find((entry) => entry.id === figure.id);
    assert.ok(c, figure.id);
    assert.equal(c.name, figure.name);
    assert.equal(c.hemisphere, figure.hemisphere);
    assert.equal(c.stars.length, figure.points.length);
    assert.equal(c.lines.length, figure.lines.length);
    assert.equal(c.sunPath, null);
    assert.equal(c.tier, "lesser");
  }
});
