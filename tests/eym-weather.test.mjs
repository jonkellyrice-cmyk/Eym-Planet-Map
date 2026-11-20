import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSystemModel, parseCsv } from "../scripts/system-data.mjs";
import { environmentField, subsolarPoint, zonalPrecipitationMm, yearFraction } from "../scripts/eym-seasons.mjs";
import { WORLD_INPUTS } from "../scripts/eym-world-inputs.mjs";
import { backgroundPressure, backgroundWind, beltShiftDeg, blocksBetween, jetLatAt, subtropicalJetLatAt, BIOME_RAIN, buildWeatherState, describeWeather, globeWeather, placeHistory, placeWeatherNow, systemAt, systemsBetween, tropicalMaxWindMs, weatherAt, weatherReport } from "../scripts/eym-weather.mjs";
import { CAMPAIGN_START_MS, DAY_MS, NORTHWARD_EQUINOX_MS } from "../scripts/universal-time.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const rows = parseCsv(read("docs/system-orbital-distances.csv"));
const orientations = JSON.parse(read("data/astronomy/epoch-orientations.json")).orientations;
const sky = JSON.parse(read("data/stellar/constellations.json"));
const field = environmentField(JSON.parse(read("data/planet-cartography/mitkear/eym.json")));
const HOUR_MS = DAY_MS / 24;
const isOcean = (lat, lon) => field.cellAt(lat, lon).ocean;
const stateAt = (timeMs) => buildWeatherState({ timeMs, subsolar: subsolarPoint(buildSystemModel(rows, "Mitkear", { referenceTimestampMs: timeMs, orientations }), sky), field });

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

// ---------------------------------------------------------------- the circulation (weather addendum, 19 November 2026)

const YEAR_H = 350 * 24, EQUINOX_H = NORTHWARD_EQUINOX_MS / HOUR_MS, W = WORLD_INPUTS.weather;
const northSummerH = EQUINOX_H + 0.25 * YEAR_H, southSummerH = EQUINOX_H + 0.75 * YEAR_H;
const peakLat = (fn, from, to) => { let best = from; for (let lat = from; lat <= to; lat += 0.25) if (fn(lat) > fn(best)) best = lat; return best; };

test("the wind and pressure belts follow the Sun through the year, as the rain belt does", () => {
  // The northern subtropical high stands further north in the northern summer than in the southern, by the dial's share.
  const high = (decl) => peakLat((lat) => backgroundPressure(lat, decl), 15, 50), june = high(23.44), december = high(-23.44);
  assert.ok(june - december > 8 && june - december < 16, `the subtropical high moves ${june - december}° between the solstices`);
  assert.ok(Math.abs((june + december) / 2 - high(0)) < 1.5, `about its mean place (${(june + december) / 2} against ${high(0)})`);
  // The same shift as the rain belt at the equator, fading to nothing at the poles; none at the equinoxes.
  assert.equal(beltShiftDeg(0, 23.44), W.beltShift * 23.44); assert.equal(beltShiftDeg(90, 23.44), 0); assert.equal(beltShiftDeg(30, 0), 0);
  assert.deepEqual(backgroundWind(40), backgroundWind(40, 0)); assert.equal(backgroundPressure(-70), backgroundPressure(-70, 0));
  // The trades reach further north in the northern summer: at 28° N the wind is easterly then, westerly-turning in winter.
  assert.ok(backgroundWind(31, 23.44).east < -1 && backgroundWind(31, -23.44).east > 0);
  // The weather at a place uses the shifted belts.
  const at = (decl) => weatherAt([], 31, -150, { cell: null, declinationDeg: decl, solarHour: 12, timeMs: 0 });
  assert.ok(at(23.44).windE < at(-23.44).windE); assert.notEqual(at(23.44).pressureHpa, at(-23.44).pressureHpa);
});

test("a jet stream in each hemisphere meanders in a few slow waves, a direct function of the clock", () => {
  const reach = W.jetWaves.reduce((s, w) => s + w.swingDeg, 0);
  for (const h of [1, -1]) for (const hour of [0, 123456.5, southSummerH, northSummerH + 99 * YEAR_H]) {
    let lo = Infinity, hi = -Infinity;
    for (let lon = -180; lon < 180; lon += 3) { const lat = h * jetLatAt(h, lon, hour); lo = Math.min(lo, lat); hi = Math.max(hi, lat); assert.equal(jetLatAt(h, lon, hour), jetLatAt(h, lon, hour)); }
    assert.ok(hi - lo > 2, "it meanders"); assert.ok(lo > W.jetLat - reach - W.blockSwingDeg - 6 && hi < W.jetLat + reach + W.blockSwingDeg + 6, `it keeps to the mid-latitudes (${lo} to ${hi})`);
  }
  // Modest and slow: a few degrees either way, and nearly the same an hour later.
  let moved = 0; for (let lon = -180; lon < 180; lon += 10) moved = Math.max(moved, Math.abs(jetLatAt(1, lon, 5000) - jetLatAt(1, lon, 5001)));
  assert.ok(moved < 0.2, `the jet moves ${moved}° in an hour`);
  // Poleward in its own summer, in both hemispheres; the subtropical branch follows the season too and does not meander.
  const mean = (h, hour) => { let s = 0; for (let lon = -180; lon < 180; lon += 5) s += h * jetLatAt(h, lon, hour); return s / 72; };
  assert.ok(mean(1, northSummerH) - mean(1, southSummerH) > 4); assert.ok(mean(-1, southSummerH) - mean(-1, northSummerH) > 4);
  assert.ok(subtropicalJetLatAt(1, northSummerH) > subtropicalJetLatAt(1, southSummerH)); assert.ok(Math.abs(subtropicalJetLatAt(-1, EQUINOX_H) + W.subtropicalLat) < 0.01);
});

test("mid-latitude storms travel along the jet, not on straight lines; tropical systems do not", () => {
  const systems = systemsBetween(northSummerH, northSummerH + 240, isOcean).filter((s) => !s.block);
  let lows = 0, bent = 0;
  for (const s of systems) {
    const hour = s.born + s.life / 2, at = systemAt(s, hour), straight = s.lat0 + s.hemisphere * 3.6 * s.polewardMs * (hour - s.born) / 111.2, swing = jetLatAt(s.hemisphere, at.lon, hour) - s.hemisphere * W.jetLat;
    if (s.kind === "low") { lows += 1; assert.ok(Math.abs(at.lat - (straight + swing)) < 1e-9, `${s.id} rides the jet`); if (Math.abs(swing) > 1) bent += 1; }
    if (s.kind === "high") assert.ok(Math.abs(at.lat - (straight + W.follow.high * swing)) < 1e-9, `${s.id} half follows it`);
    if (s.kind === "wave") assert.ok(Math.abs(at.lat - straight) < 1e-9, `${s.id} keeps its own track`);
  }
  assert.ok(lows > 20 && bent > lows / 2, `${bent} of ${lows} lows are carried more than a degree off a straight track`);
  // Still no jumps: a low moves a few hundred km in three hours.
  const low = systems.find((s) => s.kind === "low" && s.life > 100), a = systemAt(low, low.born + 40), b = systemAt(low, low.born + 43);
  assert.ok(Math.hypot((a.lat - b.lat) * 111.2, (a.lon - b.lon) * 111.2 * Math.cos(a.lat * Math.PI / 180)) < 400);
});

test("now and then a meander stalls: a block holds a high in place for one to three weeks, a few times a year in each hemisphere", () => {
  const years = 40, blocks = blocksBetween(EQUINOX_H, EQUINOX_H + years * YEAR_H);
  for (const h of [1, -1]) { const n = blocks.filter((b) => b.hemisphere === h).length / years; assert.ok(n > 2 && n < 7, `${n} a year in hemisphere ${h}`); }
  assert.deepEqual(blocksBetween(EQUINOX_H, EQUINOX_H + years * YEAR_H).map((b) => b.id), blocks.map((b) => b.id));
  let ridge = 0, warm = 0, cold = 0, drier = 0, n = 0;
  for (const b of blocks) {
    assert.ok(b.life >= 7 * 24 && b.life <= 21 * 24); assert.ok(Math.abs(b.lat0) > 40 && Math.abs(b.lat0) < 66);
    const mid = b.born + b.life / 2, here = systemAt(b, mid), later = systemAt(b, mid + 48);
    // It stands still, and the weather's systems include it.
    assert.equal(here.lat, later.lat); assert.equal(here.lon, later.lon); assert.ok(here.block && here.amp >= W.blockHpa[0] - 1e-9);
    assert.ok(systemsBetween(mid, mid, isOcean).some((s) => s.id === b.id));
    // The jet bends poleward round it.
    ridge += b.hemisphere * (jetLatAt(b.hemisphere, b.lon0, mid) - jetLatAt(b.hemisphere, b.lon0 + 180, mid));
    // Under it: higher pressure, no rain but a marine layer's drizzle, and a warm spell in summer or a cold one in winter.
    const decl = 23.44 * Math.sin(2 * Math.PI * yearFraction(mid * HOUR_MS)), ctx = { cell: null, declinationDeg: decl, solarHour: 12, timeMs: mid * HOUR_MS };
    const all = systemsBetween(mid, mid, isOcean).map((s) => systemAt(s, mid)).filter(Boolean), without = all.filter((s) => !s.block);
    const under = weatherAt(all, here.lat, here.lon, ctx), free = weatherAt(without, here.lat, here.lon, ctx);
    assert.ok(under.blocked > 0.6 && free.blocked === 0); assert.ok(under.pressureHpa > free.pressureHpa + 8);
    // (Over the sea the sinking air thickens the marine layer, which may drizzle: that is all that falls.)
    if (under.precipMmH <= Math.max(free.precipMmH, 0.15)) drier += 1; // 0.15 mm an hour: the most a marine layer drizzles (as snow grains when cold)
    const summer = decl * b.hemisphere; if (summer > 12) { warm += 1; assert.ok(under.tempC > free.tempC); } else if (summer < -12) { cold += 1; assert.ok(under.tempC < free.tempC); }
    n += 1;
  }
  assert.ok(ridge / n > 5, `the jet stands ${ridge / n}° further poleward at a block than on the far side of the world`);
  assert.ok(drier === n && warm > 10 && cold > 10, `${drier} of ${n} drier, ${warm} warm, ${cold} cold`);
});

test("Caren's tropical weather is left alone by the jet and the blocks", () => {
  // Two years, every twelve hours, at places from Caren's south to 10° N: no block is felt, and no mid-latitude low or high reaches there.
  let felt = 0, most = 0;
  for (let k = 0; k < 1400; k += 1) {
    const hour = EQUINOX_H + k * 12, systems = systemsBetween(hour, hour, isOcean).map((s) => systemAt(s, hour)).filter(Boolean);
    for (const [lat, lon] of [[-6.79, 0.41], [0, -3], [5, 4], [10, 0]]) { const w = weatherAt(systems, lat, lon, { cell: null, declinationDeg: 0, solarHour: 12, timeMs: hour * HOUR_MS }); most = Math.max(most, w.blocked); if (w.blocked > 0.02) felt += 1; }
    for (const s of systems) if (s.kind === "low" || s.kind === "high") assert.ok(Math.abs(s.lat) > 8, `${s.id} at ${s.lat}`);
  }
  assert.equal(felt, 0, `the strongest trace of a block there is ${most}`);
});
