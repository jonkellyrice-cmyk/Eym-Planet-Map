import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildStarfield, serializeStarfield, STAR_COUNT } from "../tools/generate-starfield.mjs";
import { STAR_CLASSES, TWINKLE_GROUPS, buildSkyFrame, projectSkyDirection, rotateDirection, starClassIndex } from "../scripts/starfield.mjs";

const committed = readFileSync(new URL("../data/stellar/starfield.json", import.meta.url), "utf8");
const starfield = JSON.parse(committed);
const camera = { yaw: -0.62, pitch: 0.82, zoom: 1 };

test("committed starfield is exactly what the deterministic generator produces", () => {
  assert.equal(committed, serializeStarfield(buildStarfield()));
});

test("starfield is a modest naked-eye sky with unit directions, brightest first", () => {
  assert.equal(starfield.count, STAR_COUNT);
  assert.equal(starfield.stars.length, STAR_COUNT);
  assert.ok(STAR_COUNT <= 2500, "a pre-industrial naked-eye sky does not need thousands more stars");
  for (const [x, y, z, magnitude, depth] of starfield.stars) {
    assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-4);
    assert.ok(magnitude <= starfield.limitingMagnitude);
    assert.ok(depth >= 0 && depth <= 1);
  }
  const magnitudes = starfield.stars.map((star) => star[3]);
  assert.deepEqual(magnitudes, [...magnitudes].sort((a, b) => a - b));
});

test("brightness follows a real sky: a handful of brilliant stars, a faint majority", () => {
  const brighterThan = (m) => starfield.stars.filter((star) => star[3] < m).length;
  assert.ok(brighterThan(1) >= 5 && brighterThan(1) <= 30);
  assert.ok(brighterThan(3) >= 60 && brighterThan(3) <= 250);
  assert.ok(brighterThan(5) > STAR_COUNT * 0.35);
});

test("fainter stars crowd toward the galactic band", () => {
  const pole = starfield.galaxy.northPole;
  const latitude = ([x, y, z]) => Math.abs(Math.asin(x * pole[0] + y * pole[1] + z * pole[2]));
  const nearBand = (stars) => stars.filter((star) => latitude(star) < 15 * Math.PI / 180).length / stars.length;
  const bright = starfield.stars.filter((star) => star[3] < 3.5), faint = starfield.stars.filter((star) => star[3] >= 4.5);
  assert.ok(nearBand(faint) > nearBand(bright));
  assert.ok(nearBand(faint) > Math.sin(15 * Math.PI / 180));
});

test("sky rotation matches the system view camera and only the far hemisphere is drawn", () => {
  const rotated = rotateDirection([1, 0, 0], 0.4, 0.3);
  assert.ok(Math.abs(Math.hypot(...rotated) - 1) < 1e-12);
  assert.equal(projectSkyDirection([0, 0, 1], { yaw: 0, pitch: 0 }), null, "behind the camera");
  const ahead = projectSkyDirection([0, 0, -1], { yaw: 0, pitch: 0 });
  assert.deepEqual([ahead.x, ahead.y], [450, 340]);
});

test("turning the camera reveals different stars, so the whole sphere can be panned over", () => {
  const seenFrom = (yaw, pitch) => {
    const ids = new Set();
    starfield.stars.forEach((star, index) => { if (projectSkyDirection(star.slice(0, 3), { yaw, pitch, zoom: 1 }, star[4])) ids.add(index); });
    return ids;
  };
  const union = new Set();
  for (let yaw = 0; yaw < Math.PI * 2; yaw += Math.PI / 4) for (const pitch of [-1.4, -0.7, 0, 0.7, 1.4]) for (const id of seenFrom(yaw, pitch)) union.add(id);
  assert.ok(union.size > STAR_COUNT * 0.97, `only ${union.size} stars reachable by panning`);
  const a = seenFrom(0, 0), b = seenFrom(Math.PI, 0);
  assert.ok([...a].filter((id) => b.has(id)).length < a.size * 0.1);
});

test("a frame stays within a fixed, small SVG budget", () => {
  const frame = buildSkyFrame(starfield, camera);
  assert.equal(frame.stars.length, STAR_CLASSES.length * TWINKLE_GROUPS);
  assert.ok(frame.visible > 100 && frame.visible < STAR_COUNT);
  assert.ok(frame.band.length <= 120);
  const dots = frame.stars.reduce((sum, group) => sum + (group.d.match(/M/g)?.length ?? 0), 0);
  assert.equal(dots, frame.visible);
  assert.equal(starClassIndex(-1), 0);
  assert.equal(starClassIndex(5.5), STAR_CLASSES.length - 1);
});

test("system view draws the sky behind the orbits and the app loads it as optional decoration", () => {
  const view = readFileSync(new URL("../scripts/system-view.mjs", import.meta.url), "utf8");
  const app = readFileSync(new URL("../scripts/cluster-map-app.mjs", import.meta.url), "utf8");
  const manifest = JSON.parse(readFileSync(new URL("../module.json", import.meta.url), "utf8"));
  assert.match(view, /this\.svg\.insertBefore\(this\.skyLayer, this\.orbitLayer\)/);
  assert.match(view, /render\(\) \{\n    this\.#renderSky\(\);/);
  assert.match(app, /loadStarfield\(MODULE_ID\)\.catch/);
  assert.ok(manifest.styles.includes("styles/starfield.css"));
});
