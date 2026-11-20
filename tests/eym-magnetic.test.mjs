// Stage 6: the magnetic field and the auroras (canon: docs/eym-canon.md).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MAGNETIC, antipode, auroraActivity, auroraAt, auroraEverSeen, auroraNeverBelowDeg, auroraOval, describeAurora, driftKmPerYear, fieldAt, greatCircleKm, loopAngleDeg, magneticAt, magneticPole, poleOnLoop } from "../scripts/eym-magnetic.mjs";
import { DAY_MS, DAYS_PER_YEAR, NORTHWARD_EQUINOX_MS } from "../scripts/universal-time.mjs";
import { WORLD_INPUTS } from "../scripts/eym-world-inputs.mjs";
import { LOOP_STEPS, MAGNETIC_INPUTS, buildMagnetic, magneticSourcesSha256 } from "../tools/generate-eym-magnetic.mjs";
import { renderAurora } from "../scripts/eym-sky-pixels.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"));
const asset = read("data/planet-cartography/mitkear/eym.json"), YEAR_MS = DAYS_PER_YEAR * DAY_MS, E = NORTHWARD_EQUINOX_MS;
const coastsOf = (name) => asset.terrain.coastlines.filter((c) => c.continent === name).flatMap((c) => c.points);

test("the north magnetic pole stays in its box of open sea in every century, moving 10 to 50 km a year", () => {
  const { latDeg, lonDeg } = MAGNETIC.poleBox;
  assert.deepEqual([latDeg, lonDeg], [[79, 80], [80, 100]]);
  // Every tenth of a year for six centuries.
  for (let k = 0; k < 6000; k += 1) { const p = magneticPole(E + (k / 10 - 300) * YEAR_MS); assert.ok(p.lat >= latDeg[0] && p.lat <= latDeg[1] && p.lon >= lonDeg[0] && p.lon <= lonDeg[1], `the pole at ${p.lat}, ${p.lon}`); }
  for (let a = 0; a < 360; a += 1) { const v = driftKmPerYear(a); assert.ok(v >= MAGNETIC.driftKmYr[0] && v <= MAGNETIC.driftKmYr[1], `${v} km a year at ${a}°`); }
  // The same date gives the same pole; it comes round again after one loop; a year moves it by the drift.
  assert.deepEqual(magneticPole(E + 12345 * DAY_MS), magneticPole(E + 12345 * DAY_MS));
  const a = magneticPole(E), b = magneticPole(E + MAGNETIC.loop.years * YEAR_MS), c = magneticPole(E + YEAR_MS);
  assert.ok(greatCircleKm(a.lat, a.lon, b.lat, b.lon) < 0.01); assert.ok(greatCircleKm(a.lat, a.lon, c.lat, c.lon) >= 10 && greatCircleKm(a.lat, a.lon, c.lat, c.lon) <= 50);
  assert.ok(Math.abs(loopAngleDeg(E + MAGNETIC.loop.years * YEAR_MS / 4) - 90) < 1e-6);
  // No land in the box, nor near it: the nearest coast of any land is beyond the dial's margin from every pole on the loop.
  for (let k = 0; k < LOOP_STEPS; k += 1) { const p = poleOnLoop(k * 360 / LOOP_STEPS); for (const c of asset.terrain.coastlines) for (const [lat, lon] of c.points) assert.ok(greatCircleKm(p.lat, p.lon, lat, lon) >= MAGNETIC.openSeaKm, `${c.continent} within ${MAGNETIC.openSeaKm} km of the pole`); }
});

test("a dipole: magnetic latitude, the compass, the needle's dip and the field's strength", () => {
  const pole = { lat: 80, lon: 100 };
  // At the pole the needle stands on end and the field is twice the equator's; at the antipode it points up.
  const top = fieldAt(80, 100, pole), under = fieldAt(-80, -80, pole);
  assert.ok(Math.abs(top.magneticLatDeg - 90) < 1e-4 && Math.abs(top.dipDeg - 90) < 1e-3 && Math.abs(top.microtesla - 62) < 1e-6);
  assert.ok(Math.abs(under.magneticLatDeg + 90) < 1e-4 && Math.abs(under.dipDeg + 90) < 1e-3);
  assert.deepEqual(antipode(pole), { lat: -80, lon: -80 });
  // On the pole's own meridian the compass points true north; east of it, it points west of north, and the other way.
  assert.ok(Math.abs(fieldAt(10, 100, pole).declinationDeg) < 1e-9);
  assert.ok(fieldAt(10, 130, pole).declinationDeg < -1 && fieldAt(10, 70, pole).declinationDeg > 1);
  // Ninety degrees from the pole is the magnetic equator: the needle lies level and the field is at its weakest.
  const level = fieldAt(-10, 100, pole); assert.ok(Math.abs(level.magneticLatDeg) < 1e-9 && Math.abs(level.dipDeg) < 1e-9 && Math.abs(level.microtesla - MAGNETIC.equatorMicrotesla) < 1e-9);
  // The canon's table, with the pole at 80° N, 100° E: Caren's centre −2.0°, Garyk's +4.6°.
  assert.ok(Math.abs(fieldAt(0, 0, pole).magneticLatDeg + 1.7) < 0.5 && Math.abs(fieldAt(15, -79.8, pole).magneticLatDeg - 4.6) < 0.5);
  assert.deepEqual(magneticAt(3, 4, E + 99 * DAY_MS).pole, magneticPole(E + 99 * DAY_MS));
});

test("Caren's and Garyk's coasts stay within 12° of the magnetic equator wherever the pole is, and never see an aurora", () => {
  assert.equal(MAGNETIC.coastLatDeg, 12); assert.deepEqual(MAGNETIC.continents, ["Caren", "Garyk"]); assert.equal(auroraNeverBelowDeg(), 20);
  for (const name of MAGNETIC.continents) {
    const points = coastsOf(name); assert.ok(points.length > 500, name);
    let worst = 0, turn = 0;
    for (let k = 0; k < LOOP_STEPS; k += 1) { const pole = poleOnLoop(k * 360 / LOOP_STEPS); for (const [lat, lon] of points) { const f = fieldAt(lat, lon, pole); worst = Math.max(worst, Math.abs(f.magneticLatDeg)); turn = Math.max(turn, Math.abs(f.declinationDeg)); } }
    assert.ok(worst <= MAGNETIC.coastLatDeg, `${name}: ${worst}°`);
    // The compass is off by no more than Earth's ordinary 12° or so.
    assert.ok(turn <= 12, `${name}: declination ${turn}°`);
    // Eight degrees and more short of where the greatest storm is ever seen.
    assert.ok(auroraNeverBelowDeg() - worst >= 8); assert.equal(auroraEverSeen(worst), false);
  }
  // Night after night for three centuries, at the corners of both continents: none, great storms included.
  const places = [[13.4, 0], [-9, 0], [0, 7], [0, -7], [21.4, -79], [8, -78], [15, -66], [15, -90]]; let great = 0;
  for (let d = 0; d < 300 * DAYS_PER_YEAR; d += 1) { const t = E + d * DAY_MS + DAY_MS / 2, activity = auroraActivity(t); if (!activity.great) continue; great += 1; for (const [lat, lon] of places) { const a = auroraAt(lat, lon, t); assert.equal(a.seen, "none"); assert.equal(describeAurora(a), "never seen here"); } }
  assert.ok(great >= 5 && great <= 60, `${great} great-storm days in three centuries`);
});

test("auroras ring the magnetic poles: an oval at 65° to 75° when quiet, wider in storms, never seen below 20°", () => {
  assert.deepEqual(auroraOval({ level: 0 }), { equatorwardDeg: 65, polewardDeg: 75, seenFromDeg: 58 });
  let last = 99; for (let level = 0; level <= 9; level += 1) { const o = auroraOval({ level }); assert.ok(o.equatorwardDeg < last && o.seenFromDeg > 35 && o.polewardDeg > o.equatorwardDeg + 5); last = o.equatorwardDeg; }
  for (const reachDeg of [20, 22.5, 25, 5]) { const o = auroraOval({ level: 10, great: true, reachDeg }); assert.ok(o.seenFromDeg >= 20 && o.seenFromDeg <= 25 && o.equatorwardDeg > o.seenFromDeg); }
  // The same date gives the same night; most nights are quiet and a storm is uncommon.
  assert.deepEqual(auroraActivity(E + 777 * DAY_MS), auroraActivity(E + 777 * DAY_MS));
  const count = new Array(11).fill(0), nights = 100 * DAYS_PER_YEAR; for (let d = 0; d < nights; d += 1) count[auroraActivity(E + d * DAY_MS + DAY_MS / 2).level] += 1;
  assert.ok((count[0] + count[1] + count[2]) / nights > 0.6); const storms = count.slice(5, 10).reduce((a, v) => a + v, 0) / nights; assert.ok(storms > 0.01 && storms < 0.12, `${storms}`);
  // Under the oval it is overhead; a little toward the equator it is an arc or a glow toward the pole; far toward the equator there is none.
  const t = (() => { for (let d = 0; ; d += 1) { const at = E + d * DAY_MS; if (auroraActivity(at).level === 3) return at; } })(), pole = magneticPole(t);
  const along = (magLat) => { const lat = pole.lat - (90 - magLat), a = auroraAt(lat, pole.lon, t); assert.ok(Math.abs(a.magneticLatDeg - magLat) < 1e-6); return a; };
  assert.equal(along(65).seen, "overhead"); assert.equal(along(58).seen, "arc"); assert.equal(along(54).seen, "glow"); assert.equal(along(40).seen, "none"); assert.equal(along(15).seen, "none");
  // It stands toward the nearer magnetic pole: due north on the pole's meridian in the north, due south under the south pole's.
  assert.ok(Math.abs(along(58).towardDeg) < 1e-6 && along(58).offsetDeg > 0 && along(58).hemisphere === "north");
  const south = auroraAt(-58, pole.lon - 180, t); assert.equal(south.hemisphere, "south"); assert.ok(Math.abs(Math.abs(south.towardDeg) - 180) < 1e-6 && south.seen !== "none");
  assert.match(describeAurora(along(54)), /a glow low in the north/); assert.match(describeAurora(along(65), { sunAltDeg: 10 }), /lost in daylight/); assert.match(describeAurora(along(65), { cloud: 1 }), /behind cloud/);
  assert.match(describeAurora(along(40)), /^none tonight/);
});

test("the aurora is drawn where it is seen, on the side the pole lies, and not by day or where there is none", () => {
  const frame = { width: 120, height: 120, cx: 60, cy: 60, radius: 58 }, night = { sun: { altDeg: -40 } };
  const aurora = { seen: "arc", strength: 0.6, towardDeg: 0, offsetDeg: 9, widthDeg: 6, phase: 5, great: false };
  const px = renderAurora({ ...frame, snapshot: night, aurora }); assert.ok(px);
  // North is up on the chart: the light lies in the upper half.
  let up = 0, down = 0; for (let y = 0; y < 120; y += 1) for (let x = 0; x < 120; x += 1) { const a = px[(y * 120 + x) * 4 + 3]; if (y < 60) up += a; else down += a; } assert.ok(up > 3 * down && up > 10000, `${up} above, ${down} below`);
  assert.deepEqual(renderAurora({ ...frame, snapshot: night, aurora }), px);
  assert.equal(renderAurora({ ...frame, snapshot: { sun: { altDeg: 5 } }, aurora }), null);
  assert.equal(renderAurora({ ...frame, snapshot: night, aurora: { ...aurora, seen: "none", strength: 0 } }), null);
  assert.equal(renderAurora({ ...frame, snapshot: night, aurora: null }), null);
  // A great storm is red.
  const red = renderAurora({ ...frame, snapshot: night, aurora: { ...aurora, great: true, seen: "overhead", offsetDeg: 0, strength: 1 } }); let r = 0, g = 0; for (let o = 0; o < red.length; o += 4) { r += red[o] * red[o + 3]; g += red[o + 1] * red[o + 3]; } assert.ok(r > g);
});

test("the survey of the field is in the chain: its file is the one the tool makes, from the magnetic dials", () => {
  assert.deepEqual(MAGNETIC_INPUTS, ["magnetic"]); assert.equal(MAGNETIC, WORLD_INPUTS.magnetic);
  const kept = read("data/eym/magnetic.json"); assert.deepEqual(kept, JSON.parse(JSON.stringify(buildMagnetic(asset)))); assert.equal(kept.sourcesSha256, magneticSourcesSha256());
  assert.ok(kept.nearestLand.north.km >= MAGNETIC.openSeaKm && kept.nearestLand.south.km >= MAGNETIC.openSeaKm);
  for (const name of MAGNETIC.continents) assert.ok(kept.continents[name].auroraMarginDeg >= 8 && kept.continents[name].coastPoints > 500);
});
