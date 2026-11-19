import test from "node:test";
import assert from "node:assert/strict";
import { bboxWrap, lonExtent, lonInExtent, lonOffset, normLon, plainRingAreaDeg2, pointInPlainRing, ringWinding, splitRingAtAntimeridian, unwrapRing } from "../scripts/geo-wrap.mjs";

// A ring of `n` points round a centre, `rx` degrees of longitude by `ry` of latitude, with a little unevenness.
const blob = (lat0, lon0, ry, rx, n = 90) => Array.from({ length: n }, (_, k) => { const a = 2 * Math.PI * k / n, w = 1 + 0.15 * Math.sin(3 * a) + 0.08 * Math.cos(7 * a); return [lat0 + ry * w * Math.sin(a), normLon(lon0 + rx * w * Math.cos(a))]; });
// A ring round a pole: every longitude once, at about `lat`.
const cap = (lat, n = 120, eastward = true) => Array.from({ length: n }, (_, k) => [lat + 4 * Math.sin(5 * 2 * Math.PI * k / n), normLon((eastward ? 1 : -1) * 360 * k / n + 37)]);
const oldBox = (ring) => { let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity; for (const [lat, lon] of ring) { minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat); minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon); } return { minLat, maxLat, minLon, maxLon }; };
// Inside a ring that may cross the seam, worked out the long way: unwrap it, and try the point at its three turns.
const insideSlow = (ring, lat, lon) => { const run = unwrapRing(ring); return [-360, 0, 360].some((turn) => pointInPlainRing(run, lat, lon + turn)); };

test("longitudes wrap: normalising, and the short way from one to another", () => {
  assert.equal(normLon(190), -170); assert.equal(normLon(-180), -180); assert.equal(normLon(180), -180); assert.equal(normLon(540.5), -179.5); assert.equal(normLon(-190), 170); assert.equal(normLon(12.25), 12.25);
  assert.equal(lonOffset(-170, 170), 20); assert.equal(lonOffset(170, -170), -20); assert.equal(lonOffset(180, 0), 180); assert.equal(lonOffset(-180, 0), 180); assert.equal(lonOffset(10, 350), 20); assert.equal(lonOffset(5, 5), 0);
  const run = unwrapRing([[0, 170], [0, 179], [0, -175], [0, -160], [0, 175]]); assert.deepEqual(run.map((p) => p[1]), [170, 179, 185, 200, 175]);
  assert.deepEqual(unwrapRing([[0, -175], [0, 170]], 190).map((p) => p[1]), [185, 170]);
});

test("a small ring far from the seam: exactly what the least and greatest longitudes gave", () => {
  for (const ring of [blob(-6.8, 0.4, 8, 5), blob(15, -79, 9, 12), blob(52, 138, 6, 9), blob(-50, 166, 5, 8)]) {
    const old = oldBox(ring), box = bboxWrap(ring), e = box.lonExtent;
    assert.equal(box.minLat, old.minLat); assert.equal(box.maxLat, old.maxLat); assert.equal(e.westLon, old.minLon); assert.equal(e.eastLon, old.maxLon); assert.equal(e.spanDeg, old.maxLon - old.minLon); assert.ok(!e.full);
    assert.ok(Math.abs(e.centerLon - (old.minLon + old.maxLon) / 2) < 1e-9);
    assert.deepEqual(ringWinding(ring).pole, null); assert.ok(Math.abs(ringWinding(ring).turnDeg) < 1e-6);
    // Membership is the plain comparison there, margins included.
    for (let lon = -180; lon < 180; lon += 0.37) for (const margin of [0, 0.1, 2]) assert.equal(lonInExtent(lon, e, margin), lon >= old.minLon - margin && lon <= old.maxLon + margin, `${lon} ±${margin}`);
    assert.equal(splitRingAtAntimeridian(ring)[0], ring, "a ring that does not cross is returned as it is");
  }
});

test("a ring astride ±180°: its true width, not the whole planet", () => {
  const ring = blob(5, 175, 20, 30), e = lonExtent(ring), old = oldBox(ring);
  assert.ok(old.maxLon - old.minLon > 350, "the old way gave a box round the planet");
  assert.ok(e.spanDeg > 55 && e.spanDeg < 75, `span ${e.spanDeg}`); assert.ok(e.westLon > 0 && e.eastLon < 0, "west of the seam to east of it");
  assert.ok(Math.abs(lonOffset(e.centerLon, 175)) < 6);
  assert.ok(lonInExtent(179, e) && lonInExtent(-179, e) && lonInExtent(-180, e) && lonInExtent(150, e) && !lonInExtent(0, e) && !lonInExtent(100, e) && !lonInExtent(-100, e));
  assert.ok(!lonInExtent(e.westLon - 1, e) && lonInExtent(e.westLon - 1, e, 2) && lonInExtent(normLon(e.eastLon + 1.5), e, 2) && !lonInExtent(normLon(e.eastLon + 3), e, 2));
  assert.equal(ringWinding(ring).pole, null);
  // A ring wider than half the world is still measured rightly.
  const wide = blob(0, 170, 30, 100, 240); assert.ok(lonExtent(wide).spanDeg > 200 && lonExtent(wide).spanDeg < 260 && !lonExtent(wide).full);
});

test("a ring round a pole is known for one, and its box reaches the pole", () => {
  for (const [ring, pole] of [[cap(72), "north"], [cap(72, 120, false), "north"], [cap(-68), "south"], [cap(-68, 90, false), "south"]]) {
    const w = ringWinding(ring), box = bboxWrap(ring);
    assert.equal(w.pole, pole); assert.ok(Math.abs(Math.abs(w.turnDeg) - 360) < 1e-6);
    assert.ok(box.lonExtent.full && box.lonExtent.spanDeg === 360 && box.lonExtent.pole === pole);
    assert.equal(pole === "north" ? box.maxLat : box.minLat, pole === "north" ? 90 : -90);
    for (const lon of [-180, -90, 0, 90, 179.9]) assert.ok(lonInExtent(lon, box.lonExtent));
    // Cut for a flat map: one piece, closed along the pole's edge, holding the pole's side and nothing else.
    const pieces = splitRingAtAntimeridian(ring); assert.equal(pieces.length, 1);
    for (const [lat, lon] of pieces[0]) assert.ok(lon >= -180 - 1e-9 && lon <= 180 + 1e-9 && Math.abs(lat) <= 90);
    const sign = pole === "north" ? 1 : -1;
    for (let lon = -179.5; lon < 180; lon += 7.3) { assert.ok(pointInPlainRing(pieces[0], sign * 85, lon), `the pole's side at ${lon}`); assert.ok(!pointInPlainRing(pieces[0], sign * 50, lon), `the other side at ${lon}`); }
  }
});

test("cutting a ring at ±180°: the pieces hold the same area and the same places", () => {
  for (const ring of [blob(5, 175, 20, 30), blob(40, -178, 15, 25, 200), blob(-30, 180, 25, 60, 300), blob(0, 170, 30, 100, 240)]) {
    const pieces = splitRingAtAntimeridian(ring), whole = plainRingAreaDeg2(unwrapRing(ring));
    assert.ok(pieces.length >= 2);
    for (const piece of pieces) for (let i = 0; i < piece.length; i += 1) { assert.ok(Math.abs(piece[i][1]) <= 180); assert.ok(Math.abs(piece[(i + 1) % piece.length][1] - piece[i][1]) <= 180, "no edge runs across the map"); }
    // Tolerance: one part in ten thousand (the crossing points are worked out along straight edges).
    const parts = pieces.reduce((sum, piece) => sum + plainRingAreaDeg2(piece), 0);
    assert.ok(Math.abs(parts / whole - 1) < 1e-4, `area ${parts} against ${whole}`);
    // Every sampled place inside the ring is inside exactly one piece; every place outside is in none.
    let inside = 0;
    for (let lat = -70; lat <= 70; lat += 1.7) for (let lon = -179.9; lon < 180; lon += 1.9) {
      const want = insideSlow(ring, lat, lon), got = pieces.filter((piece) => pointInPlainRing(piece, lat, lon)).length;
      assert.equal(got, want ? 1 : 0, `${lat}, ${lon}`); if (want) inside += 1;
    }
    assert.ok(inside > 50);
  }
  // A coast with a bay on the seam crosses it four times: more than two pieces, still the same area and places.
  const bay = [[20, 170], [20, -170], [10, -170], [10, 175], [0, 175], [0, -170], [-10, -170], [-10, 170]], pieces = splitRingAtAntimeridian(bay);
  assert.equal(pieces.length, 3); assert.ok(Math.abs(pieces.reduce((s, p) => s + plainRingAreaDeg2(p), 0) / plainRingAreaDeg2(unwrapRing(bay)) - 1) < 1e-9);
  for (const [lat, lon, want] of [[15, 178, 1], [15, -178, 1], [5, 178, 0], [5, 172, 1], [-5, -175, 1], [5, -175, 0], [25, 180, 0]]) assert.equal(pieces.filter((p) => pointInPlainRing(p, lat, lon)).length, want, `${lat}, ${lon}`);
});
