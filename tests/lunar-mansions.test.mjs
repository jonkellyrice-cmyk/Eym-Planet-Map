import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv } from "../scripts/system-data.mjs";
import { DAY_MS, UNION_EPOCH_MS } from "../scripts/universal-time.mjs";
import { latitudeDeg } from "../scripts/sky-frame.mjs";
import { createEphemeris, moonGeometry } from "../scripts/moon-events.mjs";
import { mansionForDirection, sunPathLongitudeDeg } from "../scripts/lunar-mansions.mjs";

const sky = JSON.parse(readFileSync(new URL("../data/stellar/constellations.json", import.meta.url), "utf8"));
const starfield = JSON.parse(readFileSync(new URL("../data/stellar/starfield.json", import.meta.url), "utf8"));
const rows = parseCsv(readFileSync(new URL("../docs/system-orbital-distances.csv", import.meta.url), "utf8"));
const mansions = sky.lunarMansions;

test("28 contiguous, equal mansions span the path of the sun", () => {
  assert.equal(mansions.length, 28);
  assert.equal(sky.counts.lunarMansions, 28);
  mansions.forEach((m, i) => {
    assert.equal(m.number, i + 1);
    assert.ok(Math.abs(m.endLongitudeDeg - m.startLongitudeDeg - 360 / 28) < 1e-3);
    if (i) assert.equal(m.startLongitudeDeg, mansions[i - 1].endLongitudeDeg);
  });
  assert.equal(mansions[0].startLongitudeDeg, 0);
  assert.ok(Math.abs(mansions.at(-1).endLongitudeDeg - 360) < 1e-3);
});

test("mansion names are unique plain English and distinct from constellation names", () => {
  const names = mansions.map((m) => m.name);
  assert.equal(new Set(names).size, 28);
  for (const name of names) assert.match(name, /^The [A-Z][A-Za-z'\- ]+$/);
  const figureNames = new Set([...sky.constellations, ...sky.asterisms].map((c) => c.name));
  for (const name of names) assert.ok(!figureNames.has(name), name);
});

test("each mansion's determinative is the brightest star within 10° of the path in its span", () => {
  for (const m of mansions) {
    const brightest = starfield.stars
      .map((row, i) => ({ id: `star-${String(i + 1).padStart(4, "0")}`, d: row.slice(0, 3), mag: row[3] }))
      .filter((s) => { const l = sunPathLongitudeDeg(s.d, sky); return l >= m.startLongitudeDeg && l < m.endLongitudeDeg && Math.abs(latitudeDeg(s.d, sky.sunPathPole)) <= 10; })
      .sort((a, b) => a.mag - b.mag)[0];
    assert.equal(m.determinativeStar, brightest.id, m.name);
  }
});

test("every constellation on the path of the sun lies within some mansion", () => {
  const listed = new Set(mansions.flatMap((m) => m.constellations));
  for (const c of sky.constellations.filter((c) => c.sunPath)) assert.ok(listed.has(c.id), c.name);
});

test("the White Moon walks through all 28 mansions in order, about one a night", () => {
  const eph = createEphemeris(rows);
  const sidereal = Number(rows.find((r) => r.object === "White Moon").orbital_period_days);
  const visited = [];
  for (let t = UNION_EPOCH_MS; t < UNION_EPOCH_MS + sidereal * DAY_MS; t += DAY_MS / 8) {
    const number = mansionForDirection(moonGeometry(eph, t)[0].direction, sky).number;
    if (visited.at(-1) !== number) visited.push(number);
  }
  assert.equal(new Set(visited).size, 28);
  visited.slice(1).forEach((n, i) => assert.equal(n, (visited[i] % 28) + 1, `step ${i}`));
  assert.ok(sidereal / 28 > 0.85 && sidereal / 28 < 1.05, "about one mansion per night");
});
