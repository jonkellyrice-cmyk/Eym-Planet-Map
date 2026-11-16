import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CLOUD_AT, GLOBE_PALETTE, PIXEL_GLOBE_MAX_ZOOM, THICK_AT, buildSurfaceRaster, cloudDensity, coverMask, fillRings, renderGlobe, weatherGrid } from "../scripts/eym-globe-pixels.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const asset = JSON.parse(read("data/planet-cartography/abydos/eventide.json")), raster = buildSurfaceRaster(asset);
const DEG = Math.PI / 180, unit = (lat, lon) => [Math.cos(lat * DEG) * Math.sin(lon * DEG), Math.sin(lat * DEG), Math.cos(lat * DEG) * Math.cos(lon * DEG)];
const DREE = [-6.79, 0.412];
const frame = (extra = {}) => renderGlobe({ raster, width: 120, height: 90, cx: 60, cy: 45, radius: 40, yaw: -DREE[1] * DEG, pitch: DREE[0] * DEG, ...extra });
const pixel = (data, x, y) => [...data.slice((y * 120 + x) * 4, (y * 120 + x) * 4 + 4)];
const cellAt = (mask, W, H, lat, lon) => mask[Math.floor((90 - lat) / 180 * H) * W + Math.floor((lon + 180) / 360 * W)];

test("rings fill an equirectangular mask, across the date line and over a pole", () => {
  const W = 360, H = 180, square = fillRings(new Uint8Array(W * H), W, H, [[[10, 10], [10, 20], [20, 20], [20, 10], [10, 10]]], 1);
  assert.equal(cellAt(square, W, H, 15, 15), 1); assert.equal(cellAt(square, W, H, 15, 25), 0); assert.equal(cellAt(square, W, H, 25, 15), 0);
  const dateline = fillRings(new Uint8Array(W * H), W, H, [[[0, 170], [0, -170], [10, -170], [10, 170], [0, 170]]], 1);
  assert.equal(cellAt(dateline, W, H, 5, 175), 1); assert.equal(cellAt(dateline, W, H, 5, -175), 1); assert.equal(cellAt(dateline, W, H, 5, 0), 0);
  const cap = [...Array.from({ length: 73 }, (_, k) => [70, -180 + k * 5])]; // a ring right round the pole at 70°N
  const polar = fillRings(new Uint8Array(W * H), W, H, [cap], 1);
  assert.equal(cellAt(polar, W, H, 85, 40), 1); assert.equal(cellAt(polar, W, H, 85, -120), 1); assert.equal(cellAt(polar, W, H, 60, 40), 0);
  assert.equal(coverMask([cap]).data.some(Boolean), true); assert.equal(coverMask(null).data.some(Boolean), false);
});

test("the surface raster: land from the coastlines, biomes on it, the sea banded by its distance from land", () => {
  const { W, H, perDegree, cls, shore, relief } = raster, at = (lat, lon) => Math.floor((90 - lat) * perDegree) * W + Math.floor((lon + 180) * perDegree);
  assert.equal(W, 1440); assert.equal(H, 720);
  assert.equal(shore[at(...DREE)], 0, "Dree stands on land"); assert.ok(cls[at(...DREE)] > 0);
  let land = 0, far = 0, high = 0; for (let i = 0; i < W * H; i += 1) { if (shore[i] === 0) land += 1; if (shore[i] === 255) far += 1; if ((relief[i] & 3) >= 2) high += 1; }
  assert.ok(land / (W * H) > 0.005 && land / (W * H) < 0.2, "small continents in a wide sea");
  assert.ok(far > land, "most of the sea is far from land"); assert.ok(high > 0, "the mountains are on it");
  for (let i = 0; i < W * H; i += 1) if (shore[i] > 0) { assert.equal(relief[i], 0); if (cls[i] > 200) continue; assert.equal(cls[i], 0); }
});

test("a frame of the globe: a disc of opaque pixels from the palette, the same every time", () => {
  const a = frame(), b = frame(); assert.deepEqual(a, b);
  assert.deepEqual(pixel(a, 0, 0), [0, 0, 0, 0], "transparent off the globe"); assert.equal(pixel(a, 60, 45)[3], 255);
  const sea = new Set([...GLOBE_PALETTE.sea, ...GLOBE_PALETTE.warmSea].map((c) => c.join()));
  assert.ok(!sea.has(pixel(a, 60, 45).slice(0, 3).join()), "the centre of the view is Dree: land, not sea");
  let seaPixels = 0, drawn = 0; for (let i = 0; i < 120 * 90; i += 1) if (a[i * 4 + 3]) { drawn += 1; if (sea.has([a[i * 4], a[i * 4 + 1], a[i * 4 + 2]].join())) seaPixels += 1; }
  assert.ok(Math.abs(drawn - Math.PI * 40 * 40) < 200, "a disc of the globe's radius"); assert.ok(seaPixels / drawn > 0.6, "mostly sea, in the sea's own colours");
});

test("day and night: the side turned from the Sun is dark", () => {
  const day = frame({ sun: { x: 0, y: 0, z: 1 } }), night = frame({ sun: { x: 0, y: 0, z: -1 } }), sum = (d) => d.reduce((s, v) => s + v, 0);
  assert.ok(sum(night) < sum(day) * 0.75); assert.ok(sum(day) <= sum(frame()), "only the limb, in twilight, is darker than the unlit drawing");
  const half = frame({ sun: { x: 1, y: 0, z: 0 } }), lum = (x) => pixel(half, x, 45).slice(0, 3).reduce((s, v) => s + v, 0);
  assert.ok(lum(95) > lum(25), "lit on the Sun's side");
});

test("weather by rule: a hurricane is a spiral about a clear eye, a high is clear, and cloud covers the frame", () => {
  const cells = []; for (let lat = -87; lat < 90; lat += 6) for (let lon = -177; lon < 180; lon += 6) cells.push({ lat, lon, cloud: 0.2, precipMmH: 0, precipKind: null, thunder: false });
  const calm = weatherGrid({ cells, centres: [], cyclones: [] }), stormy = weatherGrid({ cells, centres: [{ lat: 40, lon: 60, kind: "high" }], cyclones: [{ lat: 15, lon: 30, kind: "hurricane", maxWindMs: 50 }] });
  assert.equal(weatherGrid(null), null); assert.equal(stormy.storms.length, 2);
  const d = (w, lat, lon) => cloudDensity(w, lat, lon, unit(lat, lon));
  assert.equal(d(stormy, 15, 30), 0, "the eye is clear"); assert.ok(d(stormy, 15, 31.2) >= THICK_AT, "the eyewall is heavy cloud");
  assert.equal(d(stormy, 15, 60), d(calm, 15, 60), "untouched beyond the storm's reach");
  // Round the storm at a third of its reach the cloud comes and goes: spiral bands, not a disc.
  const ring = Array.from({ length: 72 }, (_, k) => { const a = k * 5 * DEG; return d(stormy, 15 + 3 * Math.cos(a), 30 + 3 * Math.sin(a) / Math.cos(15 * DEG)) >= CLOUD_AT; });
  let changes = 0; for (let k = 0; k < 72; k += 1) if (ring[k] !== ring[(k + 1) % 72]) changes += 1;
  assert.ok(changes >= 4, "two bands cross the ring");
  assert.ok(d(stormy, 40, 60) < d(calm, 40, 60), "a high clears the sky");
  const overcast = weatherGrid({ cells: cells.map((c) => ({ ...c, cloud: 1.4 })), centres: [], cyclones: [] }), cloud = new Set(Object.values(GLOBE_PALETTE.cloud).map((c) => c.join()));
  const covered = frame({ weather: overcast }); let white = 0, drawn = 0; for (let i = 0; i < 120 * 90; i += 1) if (covered[i * 4 + 3]) { drawn += 1; if (cloud.has([covered[i * 4], covered[i * 4 + 1], covered[i * 4 + 2]].join())) white += 1; }
  assert.ok(white / drawn > 0.9); assert.notDeepEqual(frame({ weather: stormy }), frame());
});

test("the globe view paints the pixel globe until the view is close, then hands over to the surveyed map", () => {
  const view = read("scripts/body-view-core.mjs"), css = read("styles/body-map.css");
  assert.equal(PIXEL_GLOBE_MAX_ZOOM, 6);
  for (const token of ["renderGlobe(", "buildSurfaceRaster(this.geography)", "weatherGrid(globe)", "coverMask(environment.snow)", "this.state.zoom <= PIXEL_GLOBE_MAX_ZOOM", "oscm-globe-pixels"]) assert.ok(view.includes(token), token);
  assert.match(css, /\.oscm-globe-pixels \{[^}]*image-rendering: pixelated/);
  assert.match(css, /\.is-pixel-globe \.oscm-body-layer\.is-terrain/); assert.match(css, /\.is-pixel-globe \.oscm-weather-field/);
});
