// Caren's land follows from its natural history (canon of 20 November 2026, docs/eym-canon.md): the northern
// plateau and what holds it up, the ramps, the great rivers' valleys, the massifs' heights, the hills, the lakes,
// the Arluna structure, the snow line and the bedrock.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { WORLD_INPUTS } from "../scripts/eym-world-inputs.mjs";
import { buildEymSurface, EYM_LAYOUT, fromLocal, toLocal } from "../scripts/eym-surface.mjs";
import { carenRelief, inCarenBox } from "../scripts/eym-caren-relief.mjs";
import { attachCoasts, attachDrainage, attachFlow, attachGeology, attachWind } from "../scripts/cartography-asset.mjs";
import { COVER, coarseAt, localContext } from "../scripts/eym-local-detail.mjs";
import { buildRegionTile, regionFrames, regionTileAt } from "../scripts/eym-region-layer.mjs";
import { CAREN_INPUTS, CAREN_SOURCES, NORTHERN_COAST_LAT, SNOW_LINE_M, buildCaren, carenSourcesSha256 } from "../tools/generate-eym-caren.mjs";

const root = new URL("../", import.meta.url), read = (path) => readFileSync(new URL(path, root), "utf8"), json = (path) => JSON.parse(read(path));
const D = WORLD_INPUTS.caren, kept = json("data/eym/caren.json"), traced = json("data/eym/traced-continents.json");
const asset = json("data/planet-cartography/mitkear/eym.json"), dir = "data/planet-cartography/mitkear/";
attachGeology(asset, json(dir + asset.geologyFile)); attachDrainage(asset, json(dir + "eym-drainage.json")); attachWind(asset, json(dir + "eym-wind.json")); attachFlow(asset, json(dir + "eym-flow.json")); attachCoasts(asset, json(dir + "eym-coasts.json"));
const { frames } = buildEymSurface(traced, { ...EYM_LAYOUT, seeded: [], archipelagos: { ...EYM_LAYOUT.archipelagos, centers: [] } });
const caren = frames.find((f) => f.id === "caren"), garyk = frames.find((f) => f.id === "garyk"), g = caren.grid;
const cellAt = (lat, lon) => { const [x, y] = toLocal(caren.center, lat, lon); return Math.floor((g.y0 - y) / g.cellKm) * g.cols + Math.floor((x - g.x0) / g.cellKm); };
const within = (v, lo, hi) => v >= lo && v <= hi;

test("the survey of Caren is in the chain: its file is the one the tool makes, from Caren's dials, and is the same every time", () => {
  assert.deepEqual(CAREN_INPUTS, ["layout", "caren", "carenClimate", "rain", "weather"]); assert.ok(CAREN_SOURCES.includes("scripts/eym-caren-relief.mjs") && CAREN_SOURCES.includes("data/eym/traced-continents.json"));
  const made = JSON.parse(JSON.stringify(buildCaren()));
  assert.deepEqual(made, kept); assert.equal(kept.sourcesSha256, carenSourcesSha256()); assert.deepEqual(JSON.parse(JSON.stringify(buildCaren())), made);
  assert.ok(within(kept.latitudes[0], -10.5, -9.5) && within(kept.latitudes[1], 8.4, 9.1), "Caren spans about 9.9° S to 8.7° N");
});

test("Caren's outline is the owner's map, and Garyk's heights are untouched", () => {
  // Garyk's surface is what it was before Caren's heights were made to follow from its history (pinned from main).
  assert.equal(createHash("sha256").update(Buffer.from(Float32Array.from(garyk.elevation).buffer)).digest("hex"), "ae9c0875dcf539dd9ac4564fb4077bcf0828483666c07739dbfc2c6f9d0f2fc9");
  const sha = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
  assert.equal(sha(asset.terrain.coastlines.filter((c) => c.continent === "Caren")), "6200884021edf3166e8c7cb6b209431b188bd6dd9a5706412f2504815c43bb5f");
});

test("the plateau north of the Sondel stands at 1,200 to 2,000 m and is held up by the crust and a swell of the mantle", () => {
  const p = kept.plateau, s = kept.support;
  assert.ok(p.squares > 500 && p.heightM[1] >= 1200 && p.heightM[3] <= 2000, `${p.heightM[1]} to ${p.heightM[3]} m`);
  assert.ok(within(p.coolerThanTheCoastC, 8, 13), `${p.coolerThanTheCoastC} °C cooler than the coast`);
  // Nothing unsupported: the broad surface is what the crust's thickness and the swell's push hold up, square for square.
  assert.ok(s.unsupportedM <= 1 && within(s.crustKm[0], 34, 45) && within(s.crustKm[1], 34, 45) && s.swellPushM <= 1100, JSON.stringify(s));
  assert.ok(s.crustKm[1] - s.lowlandCrustKm >= 3, "thicker crust under the plateau");
  // The swell is a share of the lift, the rest thicker crust; the two add up at any place.
  const rule = carenRelief(D, [], () => 400), at = rule.supportAt(6, 0, 400);
  assert.ok(Math.abs(at.supportedM - rule.surfaceM(6, 0, 400)) < 1 && Math.abs(at.dynamicM - D.swell.dynamicShare * rule.swellM(6, 0, 400)) < 1);
  // No swell south of the Sondel: the south keeps the old core's gentle rise.
  assert.ok(rule.swellM(-3, 0, 400) < 5 && rule.swellM(1, 0, 400) < 40);
});

test("every northern coast rises to the plateau by a long, gentle ramp, with no cliff coast", () => {
  for (const [side, r] of Object.entries(kept.ramps)) {
    assert.ok(r.risesAllTheWay, `${side} rises all the way`);
    assert.ok(within(r.rampKm, 100, 300) && within(r.meanPercent, 0.4, 2) && r.steepestPercent <= 2, `${side}: ${r.rampKm} km at ${r.meanPercent}%, steepest ${r.steepestPercent}%`);
    assert.ok(r.topM >= 1200, `${side} reaches the plateau (${r.topM} m)`);
  }
  assert.ok(kept.northernShoreM.highest <= 250 && kept.northernShoreM.squares > 300, `the land within 12 km of a northern coast is no higher than ${kept.northernShoreM.highest} m`);
  // On the surface itself: no square within 12 km of the sea north of the ramp's latitude stands above 250 m.
  for (let i = 0; i < caren.elevation.length; i += 1) { if (!caren.land[i] || caren.coastKm[i] > 12) continue; const [lat] = fromLocal(caren.center, 0, g.y0 - (Math.floor(i / g.cols) + 0.5) * g.cellKm); if (lat >= NORTHERN_COAST_LAT) assert.ok(caren.elevation[i] <= 250); }
});

test("the great rivers cut valleys through the dome: tidal in their lowest reach, a gentle climb above, the mountains left standing", () => {
  assert.deepEqual(kept.rivers.map((r) => r.id), D.rivers.ids);
  for (const r of kept.rivers) assert.ok(r.tidalKm >= 50 && r.tidalKm <= 100 && r.gradientMPerKm <= 0.5 && r.headM < 150, JSON.stringify(r));
  // In the Myra's band the land is its valley floor, far below the plateau beside it; the valley's side rises to it.
  const myra = traced.continents.caren.inlandWater.find((w) => w.id === "caren-water-1"), mid = fromLocal(caren.center, ...myra.centerKm);
  const floor = caren.elevation[cellAt(mid[0], mid[1])], beside = caren.elevation[cellAt(mid[0], mid[1] - 1.2)];
  assert.ok(floor < 120 && beside > 1000, `the Myra's floor ${Math.round(floor)} m, the plateau beside it ${Math.round(beside)} m`);
  // The Palma, which the tracing took for a lake, is a river.
  assert.ok(D.rivers.drawnAsRivers.includes("caren-water-2"));
  assert.equal(asset.hydrology.lakes.find((l) => l.id === "caren-water-2").waterKind, "river-channel");
});

test("the massifs stand as high as hard rock, small faults and the crust's rebound can hold them, and the report says how high", () => {
  const s = kept.support;
  assert.equal(s.massifReliefM, s.massifReliefFrom.hardRockOnAnOldContinentM + s.massifReliefFrom.smallFaultsM + s.massifReliefFrom.reboundM);
  assert.ok(s.massifLoadMpa < s.rockStrengthMpa, "the rock bears its own weight");
  assert.deepEqual(kept.peaks.map((p) => p.name).sort(), ["Mt. Danrich", "Mt. Oplin", "Mt. Shila", "Mt. Weth"]);
  for (const p of kept.peaks) {
    assert.ok(p.heightM > p.plateauRoundM + 1500 && p.heightM <= p.plateauRoundM + s.massifReliefM * 1.15, `${p.name}: ${p.heightM} m on land at ${p.plateauRoundM} m`);
    assert.equal(p.snowAllYear, p.heightM >= SNOW_LINE_M);
  }
  // The reported maximum (it was about 5,300 m before the heights followed from the history).
  assert.equal(kept.highestNaturalM, Math.max(...kept.peaks.map((p) => p.heightM)));
  assert.ok(within(kept.highestNaturalM, 4000, 5000), `the highest natural summit is ${kept.highestNaturalM} m`);
  // Caren's highest summits are the Sondel's remnant (not natural) and the northern massifs; the hills are hills.
  assert.equal(kept.summits[0].name, "Sondel Range"); assert.equal(kept.sondel.natural, false);
  assert.deepEqual(kept.summits.slice(1, 5).map((x) => x.kind), Array(4).fill("massif of the ancient belt"));
  for (const h of kept.hills) assert.ok(within(h.heightM[2], 500, 1500), `${h.name}: ${h.heightM[2]} m`);
  assert.deepEqual(kept.hills.map((h) => h.name), ["Trate Hills", "Sarven Hills"]);
});

test("the map's tan country is low, dry ground; lakes are level; the Arluna lakes ring one impact structure", () => {
  assert.ok(kept.dryCountryM[1] < 700, `the dry country round the Sondel's remnant stands at about ${kept.dryCountryM[1]} m`);
  // A lake has one level over all its squares, and Lake Luin lies on the plateau.
  const luin = kept.lakes.find((l) => l.name === "Lake Luin"), levels = new Set();
  for (let i = 0; i < caren.elevation.length; i += 1) { if (!caren.water[i]) continue; const [lat, lon] = fromLocal(caren.center, g.x0 + (i % g.cols + 0.5) * g.cellKm, g.y0 - (Math.floor(i / g.cols) + 0.5) * g.cellKm); if (Math.hypot(lat - luin.at[0], lon - luin.at[1]) < 0.2) levels.add(caren.elevation[i]); }
  assert.ok(luin.levelM > 1200 && levels.size === 1 && Math.abs([...levels][0] - luin.levelM) <= 2, `Lake Luin at ${luin.levelM} m; its squares at ${[...levels].join(", ")}`);
  for (const name of ["Lake Luin", "Lake Surnet", "Lake Whitswell", "Lake Havamere", "Nal Lakes", "Arluna Lakes", "Xel Lakes"]) assert.ok(kept.lakes.some((l) => l.name === name), name);
  // The Arluna structure: 150 to 200 km across, its lakes in the ring trough, a skymetal district; Dubos within it.
  const a = kept.arluna, dubos = asset.settlements.find((s) => s.properName === "Dubos");
  assert.ok(within(a.diameterKm, 150, 200) && a.lakes.length === 5 && a.ageMyr[0] >= 20 && a.ageMyr[1] <= 200, JSON.stringify(a));
  assert.equal(a.skymetal.kind, "great-impact skymetal district"); assert.match(a.skymetal.oreBody, /melt sheet/);
  assert.ok(Math.hypot((dubos.lat - a.centre[0]) * 111.2, (dubos.lon - a.centre[1]) * 111.2) < a.troughKm, "Dubos stands inside the ring");
  const rule = carenRelief(D, traced.continents.caren.inlandWater.map((w) => ({ id: w.id, lake: w.kind === "lake", ring: w.rings[0].map(([x, y]) => fromLocal(caren.center, x, y)) })), () => 300);
  assert.ok(rule.arlunaM(a.centre[0], a.centre[1]) > 200 && rule.arlunaM(a.centre[0] + a.troughKm / 111.2, a.centre[1]) < 0 && rule.arlunaM(a.centre[0] + 2.5, a.centre[1]) === 0, "an uplift, a trough, nothing far away");
});

test("the surface and the local detail read one rule: the same land at every scale", () => {
  const ctx = localContext(asset); let sum = 0, n = 0, worst = 0;
  for (let r = 6; r < g.rows; r += 9) for (let c = 6; c < g.cols; c += 9) {
    const i = r * g.cols + c; if (!caren.land[i] || caren.coastKm[i] < 20) continue;
    const [lat, lon] = fromLocal(caren.center, g.x0 + (c + 0.5) * g.cellKm, g.y0 - (r + 0.5) * g.cellKm); if (!inCarenBox(lat, lon, D)) continue;
    const local = coarseAt(ctx, lat, lon); if (!local.land || local.water || caren.reliefValue[i] > 0.3) continue;
    const d = Math.abs(local.elevationM - caren.elevation[i]); sum += d; n += 1; worst = Math.max(worst, d);
  }
  assert.ok(n > 150 && sum / n < 60, `${n} places, ${Math.round(sum / n)} m apart on average (the surface carries the old core's unevenness)`);
  assert.ok(worst < 450, `never more than ${Math.round(worst)} m apart`);
  // The plateau is there in the local detail too.
  assert.ok(coarseAt(ctx, 5.5, -0.5).elevationM > 1300 && coarseAt(ctx, -4, -3).elevationM < 400);
  // A lake has the same level in both.
  const luin = kept.lakes.find((l) => l.name === "Lake Luin");
  assert.ok(Math.abs(coarseAt(ctx, luin.at[0], luin.at[1]).elevationM - luin.levelM) < 25, `Lake Luin: ${Math.round(coarseAt(ctx, luin.at[0], luin.at[1]).elevationM)} m in the local detail, ${luin.levelM} m on the surface`);
});

test("snow lies all year on Caren only above its snow line; the bedrock follows the ancient belt", () => {
  assert.equal(SNOW_LINE_M, D.snowLineM);
  const frame = regionFrames(asset).find((f) => f.id === "caren"), snowAt = (lat, lon) => { const { tx, ty } = regionTileAt(frame, lat, lon), tile = buildRegionTile(asset, frame, tx, ty); return tile.cover.filter((c) => c === COVER.snow).length; };
  const oplin = kept.peaks.find((p) => p.name === "Mt. Oplin"), sondel = kept.summits[0];
  assert.equal(snowAt(...oplin.at), 0, `no snow all year on Mt. Oplin (${oplin.heightM} m)`);
  assert.ok(sondel.heightM > SNOW_LINE_M && snowAt(...sondel.at) > 0, "snow on the Sondel's highest remnant");
  // Bedrock: quartzite in the Sondel's remnant and the massifs' peaks, leucogranite in their shoulders and the hills,
  // the old core laid bare on the plateau, limestone in the lowlands; no volcanic rock anywhere on Caren.
  const kinds = asset.raster.bedrock.categories, values = [...Buffer.from(asset.raster.bedrock.valuesBase64, "base64")], rock = (lat, lon) => kinds[values[Math.floor(lat + 90) * 360 + Math.floor(lon + 180)]];
  const onCaren = []; for (let lat = -10; lat <= 8; lat += 1) for (let lon = -5; lon <= 5; lon += 1) onCaren.push(rock(lat + 0.5, lon + 0.5));
  for (const kind of ["godstone-quartzite", "granite-gneiss", "marble", "caren-limestone"]) assert.ok(onCaren.includes(kind), kind);
  assert.ok(!onCaren.includes("volcanic"));
  assert.equal(rock(1.5, 0.5), "godstone-quartzite"); assert.equal(rock(5.5, -0.5), "granite-gneiss"); assert.equal(rock(-7.5, 0.5), "caren-limestone");
  assert.ok(onCaren.includes("godstone-granite"), "leucogranite in the massifs and the hills");
});
