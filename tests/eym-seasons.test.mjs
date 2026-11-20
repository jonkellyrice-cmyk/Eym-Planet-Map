import test from "node:test";
import { coverMask } from "../scripts/eym-globe-pixels.mjs";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSystemModel, parseCsv } from "../scripts/system-data.mjs";
import { CAMPAIGN_START_MS, DAY_MS, NORTHWARD_EQUINOX_MS } from "../scripts/universal-time.mjs";
import { environmentField, localSolarHour, nightOutlinePath, placeReport, seasonAt, seasonalCover, seasonalTemperature, subsolarPoint, sunAltitudeDeg, sunTimes, yearFraction } from "../scripts/eym-seasons.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rows = parseCsv(read("docs/system-orbital-distances.csv"));
const orientations = JSON.parse(read("data/astronomy/epoch-orientations.json")).orientations;
const sky = JSON.parse(read("data/stellar/constellations.json"));
const asset = JSON.parse(read("data/planet-cartography/abydos/eventide.json"));
const field = environmentField(asset);
const sunAt = (t) => subsolarPoint(buildSystemModel(rows, "Abydos", { referenceTimestampMs: t, orientations }), sky);
const QUARTER = 87.5 * DAY_MS;

test("Mitkear stands over the equator at the equinoxes and over the tropics at the solstices", () => {
  assert.ok(Math.abs(sunAt(NORTHWARD_EQUINOX_MS).latDeg) < 0.05);
  assert.ok(Math.abs(sunAt(NORTHWARD_EQUINOX_MS + QUARTER).latDeg - 23.44) < 0.1);
  assert.ok(Math.abs(sunAt(NORTHWARD_EQUINOX_MS + 3 * QUARTER).latDeg + 23.44) < 0.1);
});

test("the subsolar point moves west 15° an hour, and it is noon there", () => {
  const a = sunAt(CAMPAIGN_START_MS), b = sunAt(CAMPAIGN_START_MS + DAY_MS / 24);
  assert.ok(Math.abs(((a.lonDeg - b.lonDeg + 540) % 360) - 180 - 15) < 0.2);
  assert.ok(Math.abs(localSolarHour(a.lonDeg, a.lonDeg) - 12) < 1e-9);
  assert.ok(Math.abs(sunAltitudeDeg(a.latDeg, a.lonDeg, a) - 90) < 0.01);
});

test("day length: 12 hours at the equinox, long northern days in June, polar day and night", () => {
  for (const lat of [0, 30, 60]) assert.ok(Math.abs(sunTimes(lat, 0).dayLengthH - 12) < 0.25, `lat ${lat}`);
  assert.ok(sunTimes(50, 23.44).dayLengthH > 16 && sunTimes(50, -23.44).dayLengthH < 8.2);
  assert.equal(sunTimes(80, 23.44).polar, "midnight sun");
  assert.equal(sunTimes(80, -23.44).polar, "polar night");
  const t = sunTimes(40, 10); assert.ok(Math.abs(t.sunrise + t.sunset - 24) < 1e-9);
});

test("seasons: northern spring opens at the March equinox; the south is half a year apart; the tropics have wet and dry seasons", () => {
  assert.ok(yearFraction(NORTHWARD_EQUINOX_MS) < 1e-9);
  assert.equal(seasonAt(45, NORTHWARD_EQUINOX_MS + DAY_MS, 0.4).name, "early spring");
  assert.equal(seasonAt(-45, NORTHWARD_EQUINOX_MS + DAY_MS, 0.4).name, "early autumn");
  assert.equal(seasonAt(45, NORTHWARD_EQUINOX_MS + 3 * QUARTER + 40 * DAY_MS, -20).name, "mid winter");
  assert.equal(seasonAt(15, NORTHWARD_EQUINOX_MS + QUARTER, 23).name, "the wet season");
  assert.equal(seasonAt(15, NORTHWARD_EQUINOX_MS + 3 * QUARTER, -23).name, "the dry season");
  assert.equal(seasonAt(-15, NORTHWARD_EQUINOX_MS + 3 * QUARTER, -23).name, "the wet season");
});

test("temperature swings more inland and far from the equator, peaks after midsummer, and is warmest mid-afternoon", () => {
  const at = (latDeg, continentality, days, solarHour = 15, ocean = false) => seasonalTemperature({ annualMeanC: 10, latDeg, continentality, ocean, timeMs: NORTHWARD_EQUINOX_MS + days * DAY_MS, solarHour });
  assert.ok(at(55, 1, 0).swingC > at(55, 0, 0).swingC && at(55, 0, 0).swingC > at(10, 0, 0).swingC);
  assert.ok(at(55, 0.5, 87.5 + 30).dayMeanC > at(55, 0.5, 87.5).dayMeanC, "the warmest days come after the solstice");
  assert.ok(at(-55, 0.5, 87.5).dayMeanC < at(-55, 0.5, 262.5).dayMeanC, "southern summer is in December");
  assert.ok(at(40, 0.3, 100, 15).nowC > at(40, 0.3, 100, 4).nowC);
});

test("snow and sea ice come and go with the seasons", () => {
  const north = seasonalCover(field, NORTHWARD_EQUINOX_MS + 3 * QUARTER + 30 * DAY_MS), south = seasonalCover(field, NORTHWARD_EQUINOX_MS + QUARTER + 30 * DAY_MS);
  // How much of the north (beyond 40°) lies under snow: the snow's rings filled on a half-degree map and summed by
  // area. (The count of the rings' points, used before, measured how ragged the snow line was, not how much snow.)
  const northernSnow = (cover) => { const mask = coverMask(cover.snow); let area = 0; for (let y = 0; y < 100; y += 1) for (let x = 0; x < mask.W; x += 1) area += mask.data[y * mask.W + x] * Math.cos((90 - (y + 0.5) / 2) * Math.PI / 180); return area; };
  assert.ok(northernSnow(north) > northernSnow(south), "more snow in the north (Khohalis) in its winter");
  assert.ok(north.snowShare > 0 && north.ice.length > 0);
  for (const ring of [...north.snow, ...north.ice]) assert.deepEqual(ring[0], ring.at(-1));
  const lowestIce = (cover) => Math.min(...cover.ice.flat().filter(([lat]) => lat > 0).map(([lat]) => lat));
  assert.ok(lowestIce(north) < lowestIce(south), "northern sea ice reaches further south in its winter");
});

test("Caren never sees snow at sea level, and the report reads like a GM would say it", () => {
  const caren = field.cellAt(1, 1);
  for (const days of [0, 87.5, 175, 262.5]) assert.ok(seasonalTemperature({ annualMeanC: caren.annualMeanC, latDeg: 1, continentality: caren.continentality, timeMs: NORTHWARD_EQUINOX_MS + days * DAY_MS }).dayMeanC > 15);
  const report = placeReport({ field, subsolar: sunAt(CAMPAIGN_START_MS), latDeg: 6.9, lonDeg: 0.1, timeMs: CAMPAIGN_START_MS });
  assert.match(report.sunriseSunset, /^\d\d:\d\d – \d\d:\d\d$/);
  assert.match(report.dayLength, /^1[12] h \d\d m$/);
  assert.match(report.temperature, /^-?\d+ °C \(high -?\d+, low -?\d+\)$/);
  assert.ok(report.season);
});

test("night covers half the globe's face when the terminator runs through its middle, none when the Sun is behind the viewer", () => {
  const area = (d) => {
    const pts = d.replace(/^M /, "").replace(/ Z$/, "").split(" L ").map((p) => p.split(" ").map(Number));
    let a = 0; for (let i = 0; i < pts.length; i += 1) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; a += x1 * y2 - x2 * y1; }
    return Math.abs(a) / 2;
  };
  const r = 100, disc = Math.PI * r * r;
  assert.ok(Math.abs(area(nightOutlinePath({ x: 1, y: 0, z: 0 }, r, [0, 0], 0)) / disc - 0.5) < 0.02);
  assert.ok(area(nightOutlinePath({ x: 0.6, y: 0, z: 0.8 }, r, [0, 0], 0)) / disc < 0.3, "mostly day when the Sun is behind the viewer's shoulder");
  assert.ok(area(nightOutlinePath({ x: 0.6, y: 0, z: -0.8 }, r, [0, 0], 0)) / disc > 0.7, "mostly night when the Sun is beyond the globe");
  assert.equal(nightOutlinePath({ x: 0, y: 0, z: 1 }, r, [0, 0], 0), "");
  assert.ok(area(nightOutlinePath({ x: 1, y: 0, z: 0 }, r, [0, 0], 12)) < area(nightOutlinePath({ x: 1, y: 0, z: 0 }, r, [0, 0], 0)), "deeper twilight is a smaller region");
});
