import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { channelCourses, riverCourses } from "../scripts/eym-river-courses.mjs";
import { coarseAt, localContext } from "../scripts/eym-local-detail.mjs";
import { toLocal } from "../scripts/eym-surface.mjs";

const read = () => JSON.parse(readFileSync(new URL("../data/planet-cartography/mitkear/eym.json", import.meta.url), "utf8"));
const asset = read(), channels = asset.hydrology.lakes.filter((l) => l.waterKind === "river-channel"), courses = riverCourses(asset);
const town = (name) => { const s = asset.settlements.find((x) => x.properName === name); return [s.lat, s.lon]; };
const distanceKm = (place, course) => {
  let best = Infinity; const pts = course.points.map((p) => toLocal(place, p[0], p[1]));
  for (let k = 0; k + 1 < pts.length; k += 1) { const [[ax, ay], [bx, by]] = [pts[k], pts[k + 1]], dx = bx - ax, dy = by - ay, t = Math.min(1, Math.max(0, (-ax * dx - ay * dy) / (dx * dx + dy * dy || 1))); best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy)); }
  return best;
};

test("every river channel of Caren and Garyk becomes rivers of believable width", () => {
  // (17 since the Palma, which the tracing took for a lake, is a river: canon of 20 November 2026.)
  assert.equal(channels.length, 17); assert.ok(channels.every((c) => c.continent === "Caren" || c.continent === "Garyk"));
  for (const ch of channels) assert.ok(courses.some((c) => c.channel === ch.id), `${ch.id} has a river`);
  for (const c of courses) {
    // Garyk's are at most 1.2 km wide, as before; Caren's great rivers a few kilometres, and wider in their tidal estuaries.
    const most = c.channel.startsWith("garyk") ? 1200 : c.tidal ? 7000 : 3000;
    assert.ok(c.widthM >= 60 && c.widthM <= most, `${c.id}: ${c.widthM} m`); assert.ok(c.points.length >= 2);
    for (const [lat, lon] of c.points) assert.ok(Number.isFinite(lat) && Number.isFinite(lon));
  }
  // The broadest channels carry the broadest rivers; none is the kilometres-wide strait it was.
  assert.ok(courses.some((c) => c.widthM === 1200) && courses.some((c) => c.widthM === 3000) && courses.some((c) => c.widthM < 400));
  // The Myra, the Thran and the Palma each end in a tidal estuary of 50 to 100 km, wider than the river above it.
  for (const id of ["caren-water-1", "caren-water-2", "caren-water-3"]) {
    const estuary = courses.find((c) => c.channel === id && c.tidal), above = courses.filter((c) => c.channel === id && !c.tidal);
    assert.ok(estuary && above.length && estuary.widthM > Math.max(...above.map((c) => c.widthM)), `${id} has an estuary`);
    let km = 0; for (let k = 1; k < estuary.points.length; k += 1) km += Math.hypot((estuary.points[k][0] - estuary.points[k - 1][0]) * 111.2, (estuary.points[k][1] - estuary.points[k - 1][1]) * 111.2);
    assert.ok(km >= 50 && km <= 100, `${id}: an estuary of ${km.toFixed(0)} km`);
  }
});

test("a river stays in its old channel's country and keeps the towns on its banks", () => {
  for (const c of courses) {
    const ch = channels.find((x) => x.id === c.channel), lats = ch.polygon.map((p) => p[0]), lons = ch.polygon.map((p) => p[1]);
    for (const [lat, lon] of c.points) assert.ok(lat > Math.min(...lats) - 0.3 && lat < Math.max(...lats) + 0.3 && lon > Math.min(...lons) - 0.3 && lon < Math.max(...lons) + 0.3, `${c.id} wanders out of its valley`);
  }
  // Brandol and Augusta stood a few kilometres off the old channel's east bank: the river now passes beside them.
  for (const name of ["Bhunhed", "Augaknoll"]) assert.ok(Math.min(...courses.map((c) => distanceKm(town(name), c))) < 2, `${name} is on its river`);
});

test("rivers are the same every time, and the old channel is land again", () => {
  assert.equal(riverCourses(asset), courses, "kept per asset");
  assert.deepEqual(riverCourses(read()), courses, "the same data gives the same rivers");
  assert.deepEqual(channelCourses(channels[0], [town("Augaknoll")]), channelCourses(channels[0], [town("Augaknoll")]));
  const ctx = localContext(asset);
  assert.ok(courses.every((c) => ctx.rivers.some((r) => r.points === c.points)), "the ground detail draws them");
  const middle = channels.find((c) => c.id === "caren-water-34").polygon, [lat, lon] = middle[Math.floor(middle.length / 4)];
  const f = coarseAt(ctx, lat, lon); assert.ok(f.land, "inside the old channel is land");
});
