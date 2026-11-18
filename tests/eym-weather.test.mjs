import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSystemModel, parseCsv } from "../scripts/system-data.mjs";
import { environmentField, subsolarPoint, zonalPrecipitationMm, yearFraction } from "../scripts/eym-seasons.mjs";
import { BIOME_RAIN, buildWeatherState, describeWeather, globeWeather, placeHistory, placeWeatherNow, systemAt, systemsBetween, tropicalMaxWindMs, weatherAt, weatherReport } from "../scripts/eym-weather.mjs";
import { CAMPAIGN_START_MS, DAY_MS, NORTHWARD_EQUINOX_MS } from "../scripts/universal-time.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rows = parseCsv(read("docs/system-orbital-distances.csv"));
const orientations = JSON.parse(read("data/astronomy/epoch-orientations.json")).orientations;
const sky = JSON.parse(read("data/stellar/constellations.json"));
const field = environmentField(JSON.parse(read("data/planet-cartography/abydos/eventide.json")));
const HOUR_MS = DAY_MS / 24;
const isOcean = (lat, lon) => field.cellAt(lat, lon).ocean;
const stateAt = (timeMs) => buildWeatherState({ timeMs, subsolar: subsolarPoint(buildSystemModel(rows, "Abydos", { referenceTimestampMs: timeMs, orientations }), sky), field });

test("identical inputs give identical weather", () => {
  const a = weatherReport(stateAt(CAMPAIGN_START_MS), 6.9, 0.1), b = weatherReport(stateAt(CAMPAIGN_START_MS), 6.9, 0.1);
  assert.deepEqual(a, b);
});

test("jumping a century ahead needs no simulation of the days between", () => {
  const started = Date.now(), later = CAMPAIGN_START_MS + 100 * 350 * DAY_MS;
  const report = weatherReport(stateAt(later), 45, 20);
  assert.ok(Date.now() - started < 2000);
  assert.ok(Number.isFinite(report.values.weather.tempC) && report.conditions);
});

test("weather systems move steadily: a low travels a few hundred km in three hours, no jumps", () => {
  const hour = Math.round(CAMPAIGN_START_MS / HOUR_MS);
  const lows = systemsBetween(hour, hour + 48, isOcean).filter((s) => s.kind === "low");
  assert.ok(lows.length > 4);
  for (const s of lows) for (let h = s.born; h + 3 <= s.born + s.life; h += 3) {
    const a = systemAt(s, h), b = systemAt(s, h + 3), km = Math.hypot((b.lat - a.lat) * 111, ((((b.lon - a.lon) + 540) % 360) - 180) * 111 * Math.cos(a.lat * Math.PI / 180));
    assert.ok(km < 260, `${s.id} moved ${km} km in 3 h`);
  }
});

test("the weather at a place changes smoothly from hour to hour", () => {
  const state = stateAt(CAMPAIGN_START_MS);
  let previous = null;
  for (let h = 0; h < 24; h += 1) {
    const w = placeWeatherNow(state, 45, 10, { timeMs: CAMPAIGN_START_MS + h * HOUR_MS, subsolar: { latDeg: -2.6, lonDeg: 53.9 - 15 * h } });
    if (previous) { assert.ok(Math.abs(w.pressureHpa - previous.pressureHpa) < 3); assert.ok(Math.abs(w.tempC - previous.tempC) < 4); }
    previous = w;
  }
});

test("lows turn anticlockwise in the north and clockwise in the south", () => {
  const low = (hemisphere) => ({ kind: "low", hemisphere, lat: 45 * hemisphere, lon: 0, amp: -25, radiusKm: 1000, unit: [Math.cos(45 * Math.PI / 180), 0, hemisphere * Math.sin(45 * Math.PI / 180)] });
  const eastOf = (hemisphere) => weatherAt([low(hemisphere)], 45 * hemisphere, 9, { cell: null, declinationDeg: 0, solarHour: 12, timeMs: CAMPAIGN_START_MS });
  assert.ok(eastOf(1).windN > 3, "east of a northern low the wind blows north");
  assert.ok(eastOf(-1).windN < -3, "east of a southern low the wind blows south");
  assert.ok(eastOf(1).pressureHpa < 1005);
});

test("over a year the rain matches the climate it is calibrated to", () => {
  for (const lat of [-45, -20, 0, 8, 30, 50]) {
    let total = 0, count = 0;
    const lonList = [-170, -130, -95, -60, -25, 20, 60, 95, 130, 160];
    for (let k = 0; k < 700; k += 1) {
      const hour = Math.round(NORTHWARD_EQUINOX_MS / HOUR_MS) + k * 12 + 3, timeMs = hour * HOUR_MS;
      const systems = systemsBetween(hour, hour, isOcean).map((s) => systemAt(s, hour)).filter(Boolean);
      const declinationDeg = 23.44 * Math.sin(2 * Math.PI * yearFraction(timeMs));
      for (const lon of lonList) { const cell = field.cellAt(lat, lon); total += weatherAt(systems, lat, lon, { cell, declinationDeg, solarHour: (k * 5) % 24, timeMs }).precipMmH / (zonalPrecipitationMm(lat) * (cell.ocean ? 1 : BIOME_RAIN[cell.biome] ?? 0.8) / 8400); count += 1; }
    }
    const ratio = total / count;
    assert.ok(ratio > 0.6 && ratio < 1.5, `lat ${lat}: ${ratio.toFixed(2)} of climate`);
  }
});

test("tropical cyclones keep to their seasons and hurricanes have hurricane winds", () => {
  const start = Math.round(NORTHWARD_EQUINOX_MS / HOUR_MS), years = 4;
  const cyclones = systemsBetween(start, start + years * 350 * 24, isOcean).filter((s) => s.kind === "tropical" && s.born >= start);
  const perYear = cyclones.length / years;
  assert.ok(perYear > 25 && perYear < 100, `${perYear} a year`);
  for (const s of cyclones) {
    const f = (yearFraction(s.born * HOUR_MS) + (s.hemisphere > 0 ? 0 : 0.5)) % 1;
    assert.ok(f > 0.22 && f < 0.7, `${s.id} out of season`);
  }
  assert.ok(tropicalMaxWindMs(50) > 33 && tropicalMaxWindMs(10) < 33);
});

test("snow builds on Khohalis in winter; Caren's lowlands never see it", () => {
  const winter = stateAt(NORTHWARD_EQUINOX_MS + 300 * DAY_MS);
  const northernLand = field.cells.filter((c) => !c.ocean && c.lat > 46 && c.lat < 60 && c.lon > 130 && c.lon < 148 && c.elevationM < 600);
  assert.ok(northernLand.length > 3);
  assert.ok(northernLand.some((c) => placeHistory(winter, c.lat, c.lon).snowDepthCm > 5));
  for (const days of [0, 100, 200, 300]) assert.equal(placeHistory(stateAt(NORTHWARD_EQUINOX_MS + days * DAY_MS), 6.5, -3.5).snowDepthCm, 0);
});

test("the report reads like a GM would say it, and the globe gets its overlays", () => {
  const state = stateAt(CAMPAIGN_START_MS), report = weatherReport(state, 6.9, 0.1);
  assert.match(report.weatherTemperature, /^-?\d+ °C$/);
  assert.match(report.wind, /km\/h from the [NESW]{1,3}$/);
  assert.match(report.pressure, /^\d{3,4} hPa, (rising|falling|steady)$/);
  assert.match(report.lastWeek, /mm rain/);
  assert.ok(["dry", "damp", "wet", "waterlogged", "flooding"].some((g) => report.groundNow.endsWith(g)));
  assert.equal(describeWeather({ cloud: 0.95, precipMmH: 6, precipKind: "rain", thunder: true, windMs: 25, windFromDeg: 225 }).precip, "heavy rain and thunderstorms");
  const globe = globeWeather(state);
  assert.equal(globe.cells.length, 1800);
  assert.ok(globe.centres.some((c) => c.kind === "low") && globe.centres.some((c) => c.kind === "high"));
});

test("the globe, the place card and the sky view all show the weather", () => {
  const view = read("scripts/body-view-core.mjs"), app = read("scripts/cluster-map-app.mjs"), template = read("templates/cluster-map.hbs");
  assert.match(view, /setWeather\(globe\)/);
  assert.match(app, /this\._clusterView\.setWeather\?\.\(this\._globeWeather\)/);
  assert.match(app, /cloud = weather\.values\.weather\.cloud;\s+this\._clusterView\?\.setCloud\?\.\(cloud\)/);
  for (const token of ['data-body-layer="weather-clouds"', 'data-body-layer="weather-storms"', 'data-body-layer="weather-wind"', 'data-place-field="conditions"', 'data-place-field="outlook"', 'data-sky-field="weather"']) assert.ok(template.includes(token), token);
});

test("the sea is cloudy, as on a world of oceans: a marine layer that drizzles, and sea fog over cold water", () => {
  let n = 0, cloud = 0, drizzle = 0, drizzleMax = 0, fogLow = 0, landFog = 0;
  for (let k = 0; k < 120; k += 1) {
    const hour = Math.round(NORTHWARD_EQUINOX_MS / HOUR_MS) + 2 * 8400 + k * 29, timeMs = hour * HOUR_MS;
    const systems = systemsBetween(hour, hour, isOcean).map((s) => systemAt(s, hour, (a, b) => (isOcean(a, b) ? 0 : 1))).filter(Boolean);
    const declinationDeg = 23.44 * Math.sin(2 * Math.PI * yearFraction(timeMs));
    for (let lat = -55; lat <= 55; lat += 10) for (let lon = -175; lon < 180; lon += 20) {
      const cell = field.cellAt(lat, lon), w = weatherAt(systems, lat, lon, { cell, declinationDeg, solarHour: (k * 7 + 12) % 24, timeMs, anomalyC: field.anomalyAt(lat, lon, timeMs) });
      if (!cell.ocean) { if (w.fog && cell.continentality > 0.3) landFog += 1; continue; }
      n += 1; cloud += w.cloud;
      if (w.drizzle) { drizzle += 1; drizzleMax = Math.max(drizzleMax, w.precipMmH); assert.equal(w.precipKind, "rain"); }
      if (w.fog && Math.abs(lat) <= 12) fogLow += 1;
    }
  }
  assert.ok(cloud / n > 0.5 && cloud / n < 0.8, `mean cloud over the sea ${(cloud / n).toFixed(2)}`);
  assert.ok(drizzle / n > 0.02 && drizzle / n < 0.15, `drizzle ${(100 * drizzle / n).toFixed(1)}% of the time`);
  assert.ok(drizzleMax <= 0.2, "drizzle stays light");
  assert.equal(fogLow, 0, "no sea fog in the doldrums"); assert.equal(landFog, 0, "no sea fog deep inland");
  const words = describeWeather({ cloud: 0.8, precipMmH: 0.08, precipKind: "rain", drizzle: true, fog: true, thunder: false, windMs: 4, windFromDeg: 200 });
  assert.equal(words.precip, "drizzle and sea fog");
});
