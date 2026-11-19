import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { climateSourcesSha256 } from "../tools/generate-eym-climate.mjs";
import { attachOcean } from "../scripts/cartography-asset.mjs";
import { currentAt, describeEnso, ensoIndex, sstAnomalyAt } from "../scripts/eym-climate.mjs";
import { environmentField, rainBeltLat, seasonalTemperature } from "../scripts/eym-seasons.mjs";
import { systemsBetween } from "../scripts/eym-weather.mjs";
import { DAY_MS, DAYS_PER_YEAR, NORTHWARD_EQUINOX_MS } from "../scripts/universal-time.mjs";

const root = new URL("../", import.meta.url), read = (path) => readFileSync(new URL(path, root), "utf8");
const climate = JSON.parse(read("data/eym/climate.json")), asset = JSON.parse(read("data/planet-cartography/abydos/eventide.json"));
const manifest = JSON.parse(read("data/planet-cartography/manifest.json")), entry = manifest.worlds.find((w) => w.body === "Eventide");
const YEAR_MS = DAYS_PER_YEAR * DAY_MS, T0 = NORTHWARD_EQUINOX_MS, field = environmentField(asset);
/** A moment when the oscillation is near neutral, in a given season. */
const neutralAt = (f) => { for (let y = 0; y < 40; y += 1) { const t = T0 + (y + f) * YEAR_MS; if (Math.abs(ensoIndex(t)) < 0.15) return t; } throw new Error("no neutral year"); };

test("the ocean climate is up to date with what it is made from (npm run build would not change it)", () => {
  assert.equal(climate.sourcesSha256, climateSourcesSha256());
  assert.equal(climate.seasons.length, 4);
  assert.ok(asset.climate && !asset.ocean, "the main asset carries the compact climate, not the currents");
  const text = read(entry.ocean.path);
  assert.equal(createHash("sha256").update(text).digest("hex"), entry.ocean.sha256);
  assert.ok(entry.ocean.bytes <= 100_000, `ocean file ${entry.ocean.bytes} bytes`);
});

test("a warm pool in the west of the great equatorial ocean and a cold tongue in its east, in a neutral year", () => {
  const { westLon, widthDeg } = climate.enso.basin, t = neutralAt(0.1), lon = (x) => ((westLon + x * widthDeg + 540) % 360) - 180;
  const west = sstAnomalyAt(asset, 2, lon(0.2), t), east = sstAnomalyAt(asset, 0, lon(0.82), t);
  assert.ok(west > 0.4 && east < -0.4, `west ${west.toFixed(2)} °C, east ${east.toFixed(2)} °C`);
});

test("the El Niño-like oscillation is drawn from the clock: the same every time, warm and cool years in turn", () => {
  const values = Array.from({ length: 20 * 50 }, (_, k) => ensoIndex(T0 + k * 7 * DAY_MS));
  assert.deepEqual(values.slice(0, 50), Array.from({ length: 50 }, (_, k) => ensoIndex(T0 + k * 7 * DAY_MS)));
  assert.ok(Math.max(...values) > 0.8 && Math.min(...values) < -0.8 && values.every((v) => Math.abs(v) < 1.7));
  const { westLon, widthDeg } = climate.enso.basin, lon = ((westLon + 0.72 * widthDeg + 540) % 360) - 180;
  const warm = values.indexOf(Math.max(...values)), cool = values.indexOf(Math.min(...values));
  assert.ok(sstAnomalyAt(asset, 0, lon, T0 + warm * 7 * DAY_MS) > sstAnomalyAt(asset, 0, lon, T0 + cool * 7 * DAY_MS) + 1.5, "a warm year warms the eastern basin");
  assert.match(describeEnso(1.2), /warm/); assert.match(describeEnso(-1.2), /cool/);
});

test("the rain belt follows the Sun, less than on Earth; seasons and days stay mild on an aquaplanet", () => {
  assert.ok(rainBeltLat(23.44) > rainBeltLat(-23.44) && rainBeltLat(23.44) - rainBeltLat(-23.44) < 0.5 * 2 * 23.44);
  const day = seasonalTemperature({ annualMeanC: 20, latDeg: 10, continentality: 1, timeMs: T0 });
  assert.ok(day.highC - day.lowC <= 8, "the daily range on land is at most 8 °C even deep inland");
  const inland = seasonalTemperature({ annualMeanC: 5, latDeg: 52, continentality: 1, timeMs: T0 });
  assert.ok(inland.swingC < 12, `a deep-inland swing at 52° of ${inland.swingC.toFixed(1)} °C`);
});

test("currents: the westerly drift runs east around the far south; no current is faster than about two metres a second", () => {
  attachOcean(asset, JSON.parse(read(entry.ocean.path)));
  let east = 0, k = 0, fastest = 0;
  for (let lon = -178; lon < 180; lon += 6) { const c = currentAt(asset, -50, lon, T0 + 0.25 * YEAR_MS); if (c) { east += c.east; k += 1; } }
  for (let lat = -70; lat <= 70; lat += 4) for (let lon = -178; lon < 180; lon += 4) { const c = currentAt(asset, lat, lon, T0); fastest = Math.max(fastest, Math.hypot(c.east, c.north)); }
  assert.ok(east / k > 0.05, `mean eastward current at 50°S ${(east / k).toFixed(2)} m/s`);
  assert.ok(fastest < 2.1, `fastest ${fastest.toFixed(2)} m/s`);
});

test("tropical cyclones still come about fifty a year, born over warm sea", () => {
  const start = Math.round(T0 / (DAY_MS / 24)), years = 4, isOcean = (a, b) => field.cellAt(a, b).ocean;
  const cyclones = systemsBetween(start, start + years * 350 * 24, isOcean, field.sstC).filter((s) => s.kind === "tropical" && s.born >= start);
  assert.ok(cyclones.length / years > 35 && cyclones.length / years < 80, `${cyclones.length / years} a year`);
  assert.ok(cyclones.every((s) => field.sstC(s.lat0, s.lon0, s.born * DAY_MS / 24) >= 25.5), "every one born over water of 25.5 °C or more");
});

test("the sea floor steers the currents and feeds upwelling at shelf breaks and over seamount chains", async () => {
  const { bathymetry, landMask, solveSeason, STEERING } = await import("../tools/generate-eym-climate.mjs");
  const { upwellingAt, fishingAt } = await import("../scripts/eym-climate.mjs");
  const land = landMask(), floor = bathymetry(), N = land.length, sea = [...land.keys()].filter((i) => !land[i]);
  // The floor is the one the cartography draws: an abyss some 4-5 km deep, shelves by the continents, seamount chains.
  const depths = sea.map((i) => floor.depthM[i]).sort((a, b) => a - b), median = depths[depths.length >> 1];
  assert.ok(median > 3800 && median < 4900 && depths[0] < 400 && depths.at(-1) > 5500, `depths ${depths[0]}..${median}..${depths.at(-1)}`);
  assert.ok(sea.some((i) => floor.shelfBreak[i] > 0) && sea.some((i) => floor.seamount[i] > 0));
  assert.ok(STEERING > 0 && STEERING < 1);
  // Over a flat floor the model is exactly the one before (the beta effect alone).
  const flat = { depthM: new Float64Array(N).fill(4000), shelfBreak: new Float64Array(N), seamount: new Float64Array(N) };
  const plain = solveSeason(land, 0), same = solveSeason(land, 0, flat), steered = solveSeason(land, 0, floor);
  assert.deepEqual(Array.from(same.u), Array.from(plain.u)); assert.deepEqual(Array.from(same.upwelling), Array.from(plain.upwelling));
  // Over the real floor the great west-wind drifts no longer run straight: they turn north and south across the
  // ridges (more than half as much again), and the floor's drag slows them.
  const band = (s, key, f) => { let sum = 0, k = 0; for (const i of sea) { const lat = -90 + 2 * (Math.floor(i / 180) + 0.5); if (Math.abs(lat) > 40 && Math.abs(lat) < 60) { sum += f(s[key][i]); k += 1; } } return sum / k; };
  assert.ok(band(steered, "v", Math.abs) > 1.5 * band(plain, "v", Math.abs), `${band(steered, "v", Math.abs)} against ${band(plain, "v", Math.abs)}`);
  assert.ok(band(steered, "u", (x) => x) < band(plain, "u", (x) => x));
  for (const i of sea) assert.ok(Number.isFinite(steered.u[i]) && Number.isFinite(steered.v[i]) && Math.hypot(steered.u[i], steered.v[i]) < 3);
  // Water wells up where a current meets a slope or a seamount chain: more there than the wind alone gives.
  const over = (s, mask) => { let sum = 0, k = 0; for (const i of sea) if (mask[i] > 0) { sum += s.upwelling[i]; k += 1; } return sum / k; };
  assert.ok(over(steered, floor.seamount) > over(plain, floor.seamount) + 0.1, `seamounts ${over(steered, floor.seamount)} against ${over(plain, floor.seamount)}`);
  assert.ok(over(steered, floor.shelfBreak) > over(plain, floor.shelfBreak) + 0.03);
  // Read from the ocean file: upwelling and the fishing it feeds; nothing without the file.
  const bare = { ...asset }; delete bare.ocean;
  assert.equal(upwellingAt(bare, 0, 0, T0), null); assert.equal(fishingAt(bare, 0, 0, T0), null);
  const withOcean = attachOcean({ ...bare }, JSON.parse(read(entry.ocean.path)));
  let best = null; for (const i of sea) if (floor.seamount[i] >= 0.5 && (!best || steered.upwelling[i] > steered.upwelling[best])) best = i;
  const at = [-90 + 2 * (Math.floor(best / 180) + 0.5), -180 + 2 * (best % 180 + 0.5)], rich = fishingAt(withOcean, at[0], at[1], T0), open = fishingAt(withOcean, 28, -150, T0);
  assert.ok(rich.richness > open.richness + 0.2 && /fishing/.test(rich.words), `${JSON.stringify(rich)} against ${JSON.stringify(open)} at ${at}`);
});
