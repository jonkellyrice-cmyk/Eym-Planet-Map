import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { foliageSeason, lightModel, lightingFromInputs, lightingWords, normalizeLighting, sunPosition } from "../scripts/eym-battle-lighting.mjs";
import { buildBattleMap, geometryHash } from "../scripts/eym-battle-rules.mjs";
import { buildInteriors } from "../scripts/eym-battle-interiors.mjs";
import { battleArtDirection } from "../scripts/eym-battle-render.mjs";
import { battleMapSpec } from "../scripts/eym-map-presets.mjs";
import { fromLocal } from "../scripts/eym-surface.mjs";
import { renderBattleLayers } from "../webapp/render/render-battle.mjs";
import { shadowMask } from "../webapp/render/light.mjs";
import { parseRequest } from "../webapp/server.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const asset = JSON.parse(read("data/planet-cartography/abydos/eventide.json"));
const lyle = asset.settlements.find((s) => s.properName === "Lyle"), center = fromLocal([lyle.lat, lyle.lon], 0.2, 0.15);
const spec = battleMapSpec({ size: "custom", columns: 14, rows: 12, density: "custom", gridPx: 70 });
const map = buildBattleMap(asset, { center, spec }), interiors = buildInteriors(map);

test("the sun: altitude and bearing from latitude, declination and hour; seasons by hemisphere", () => {
  const noon = sunPosition(45, 0, 0); assert.ok(Math.abs(noon.altitude - 45) < 1e-9); assert.ok(Math.abs(noon.azimuth - 180) < 1e-9, "due south at noon, north of the tropics");
  assert.ok(Math.abs(sunPosition(-45, 0, 0).azimuth) < 1e-9 || Math.abs(sunPosition(-45, 0, 0).azimuth - 360) < 1e-9, "due north in the south");
  const morning = sunPosition(45, 0, -45); assert.ok(morning.azimuth > 90 && morning.azimuth < 180, "south-east in the morning");
  assert.ok(sunPosition(45, 23.44, 180).altitude < 0, "below the horizon at midnight");
  assert.equal(foliageSeason(50, 0.6), "autumn"); assert.equal(foliageSeason(-50, 0.6), "spring"); assert.equal(foliageSeason(5, 0.6), "tropical");
  assert.equal(normalizeLighting({ latDeg: 50, yearFraction: 0.85 }).season, "winter");
});

test("the light model: shadows away from the sun, longer when low; cloud softens; night lights the lamps", () => {
  const morning = lightModel(lightingFromInputs({ latDeg: 45, hour: 9, season: "summer", weather: "clear" }));
  assert.ok(morning.toSun[0] > 0, "the morning sun is in the east"); assert.ok(morning.shadowPerFt[0] < 0, "so shadows fall west");
  const low = lightModel(lightingFromInputs({ latDeg: 45, hour: 17.5, season: "autumn" })), high = lightModel(lightingFromInputs({ latDeg: 45, hour: 12, season: "summer" }));
  assert.ok(Math.hypot(...low.shadowPerFt) > Math.hypot(...high.shadowPerFt) * 2, "evening shadows are long");
  assert.ok(low.ambient[2] < low.ambient[0], "low sun light is warm");
  const overcast = lightModel(lightingFromInputs({ latDeg: 45, hour: 12, weather: "overcast" })); assert.ok(overcast.direct < high.direct * 0.3);
  const night = lightModel(lightingFromInputs({ latDeg: 45, hour: 23 })); assert.ok(night.night && night.lightsOn && night.direct === 0 && night.ambient[2] > night.ambient[0], "night: blue, lamps lit");
  assert.ok(lightModel({}, { underground: true }).lightsOn);
  assert.ok(lightModel(lightingFromInputs({ latDeg: 45, hour: 12, weather: "rain" })).wet);
  assert.match(lightingWords(lightingFromInputs({ latDeg: 45, hour: 17.5, season: "autumn" })), /low golden sunlight from the (west|west-south-west|west-north-west).*long shadows falling to the (east|east-north-east|east-south-east).*autumn colours/);
});

test("drawn into the pixel art: shadows on the side away from the sun, a different picture for a different light, the same geometry", () => {
  const P = 35, east = lightingFromInputs({ latDeg: 45, hour: 8.5, season: "summer" }), west = lightingFromInputs({ latDeg: 45, hour: 15.5, season: "summer" });
  const count = (mask, test) => { let n = 0; for (let y = 0; y < 12 * P; y += 1) for (let x = 0; x < 14 * P; x += 1) if (mask[y * 14 * P + x] === 2 && test(x, y)) n += 1; return n; };
  for (const b of map.buildings.filter((b) => b.x0 > 1 && b.x1 < 12)) {
    const mE = shadowMask(map, P, lightModel(east)), mW = shadowMask(map, P, lightModel(west)), rowY = (b.y0 + b.y1 + 1) / 2 * P;
    const leftOf = (x, y) => Math.abs(y - rowY) < P && x < b.x0 * P && x > (b.x0 - 2) * P, rightOf = (x, y) => Math.abs(y - rowY) < P && x > (b.x1 + 1) * P && x < (b.x1 + 3) * P;
    assert.ok(count(mE, leftOf) > count(mE, rightOf), "morning sun in the east: shadow to the west of the building");
    assert.ok(count(mW, rightOf) > count(mW, leftOf), "afternoon sun in the west: shadow to the east");
    break;
  }
  const day = renderBattleLayers(map, interiors, { lighting: lightingFromInputs({ latDeg: 45, hour: 12 }) }), night = renderBattleLayers(map, interiors, { lighting: lightingFromInputs({ latDeg: 45, hour: 23 }) });
  const mean = (fb) => { let s = 0; for (let i = 0; i < fb.data.length; i += 4) s += fb.data[i] + fb.data[i + 1] + fb.data[i + 2]; return s / (fb.data.length / 4); };
  assert.ok(mean(night.exterior) < mean(day.exterior) * 0.6, "night is dark");
  assert.ok(night.light.night && !day.light.night);
  assert.equal(geometryHash(map), geometryHash(buildBattleMap(asset, { center, spec })), "light never changes the map");
});

test("the module sends its light; the server caches each light apart; the painter is told the light", () => {
  const a = parseRequest({ center, columns: 14, rows: 12, gridPx: 70, light: { hour: 9, season: "autumn", weather: "clear" } }), b = parseRequest({ center, columns: 14, rows: 12, gridPx: 70, light: { hour: 18, season: "autumn", weather: "clear" } });
  assert.notDeepEqual(a.lighting, b.lighting);
  assert.match(read("webapp/server.mjs"), /\$\{lightKey\}-\$\{renderer\.info\.version\}/);
  const app = read("scripts/cluster-map-app.mjs");
  assert.match(app, /sunPosition\(lat, this\._sun\.subsolar\.latDeg, hourAngle\)/); assert.match(app, /lighting: env\.lighting \}/);
  assert.match(battleArtDirection(map, { lighting: lightingFromInputs({ latDeg: 45, hour: 23 }) }), /Night .*moonlight.*Paint that light into the picture/);
});
