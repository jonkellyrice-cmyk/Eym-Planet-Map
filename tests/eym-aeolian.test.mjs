import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { attachDrainage, attachGeology, attachWind, windFileName } from "../scripts/cartography-asset.mjs";
import { coarseAt, landformsOf, localContext } from "../scripts/eym-local-detail.mjs";
import { coastCharacter, shoreAt, windWorkAt } from "../scripts/eym-landforms.mjs";
import { aeolianAt, landWindAt, loessAt, loessFertility, windClimate } from "../scripts/eym-aeolian.mjs";
import { geologyAt } from "../scripts/eym-geology.mjs";
import { windSourcesSha256 } from "../tools/generate-eym-wind.mjs";

const root = new URL("../", import.meta.url), read = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const asset = read("data/planet-cartography/mitkear/eym.json");
attachGeology(asset, read(`data/planet-cartography/mitkear/${asset.geologyFile}`));
attachDrainage(asset, read("data/planet-cartography/mitkear/eym-drainage.json"));
const windPath = `data/planet-cartography/mitkear/${windFileName("eym.json")}`;
attachWind(asset, read(windPath));
const ctx = localContext(asset), lf = landformsOf(ctx), climate = windClimate(asset);
const coastAt = (lat, lon) => coastCharacter(lf, lat, lon, coarseAt(ctx, lat, lon).relief);

test("the wind and wave climate is up to date with what it is made from, small, and whole", () => {
  assert.equal(asset.wind.sourcesSha256, windSourcesSha256(), "npm run build would make it again");
  assert.ok(statSync(new URL(windPath, root)).size <= 60_000);
  assert.ok(climate.sea.size > 150 && climate.land.size > 150);
  for (const e of [...climate.sea.values(), ...climate.land.values()]) assert.equal(e.drift.length, 16);
  // Every land cell has some sand-moving wind (the roses were once written empty).
  assert.ok([...climate.land.values()].filter((e) => e.drift.some((v) => v > 0)).length > climate.land.size * 0.9);
});

test("coasts take their waves from the swell and wind-sea climate: big seas on Garyk's trade-wind shores, calm in Caren's bay", () => {
  const windward = coastAt(18.32, -77.02), lee = coastAt(14.08, -88.6), bay = coastAt(-4.55, -3.55);
  assert.ok(windward.waveEnergy > 0.8 && windward.onshoreDrift > 0.8, JSON.stringify(windward));
  assert.ok(lee.waveEnergy < windward.waveEnergy - 0.3, `the lee coast ${lee.waveEnergy.toFixed(2)}`);
  assert.ok(bay.waveEnergy < 0.3 && bay.kind === "saltmarsh", JSON.stringify(bay));
  // On the trade-wind coasts most wave energy comes from the north-east quarter.
  assert.ok(windward.wavesFromDeg >= 0 && windward.wavesFromDeg <= 112.5, `from ${windward.wavesFromDeg}°`);
});

test("coastal dunes: a well-fed beach under strong onshore winds is backed by a belt of dunes; a calm one is not", () => {
  const stormy = { kind: "beach", waveEnergy: 1, onshoreDrift: 1, exposure: 1, tideGain: 2 }, calm = { kind: "beach", waveEnergy: 0.2, onshoreDrift: 0.05, exposure: 0.2, tideGain: 2 };
  assert.equal(shoreAt(stormy, 0.6, 0, 3).ground, "dune-sand", "bare sand behind the beach");
  const back = shoreAt(stormy, 1.6, 0, 3, 0, 0.5);
  assert.equal(back.ground, "dunes"); assert.ok(back.elevationM > 8, "with crests standing above the land");
  assert.equal(shoreAt(calm, 0.6, 0, 3), null);
});

test("inland the wind does little on humid Eym: nothing on Caren, grassed dunes and some loess in Garyk's dry-season north", () => {
  const count = (la0, la1, lo0, lo1) => {
    const out = { dunes: 0, pavement: 0, yardangs: 0, loess: 0, land: 0 };
    for (let lat = la0; lat < la1; lat += 0.2) for (let lon = lo0; lon < lo1; lon += 0.2) {
      if (!coarseAt(ctx, lat, lon).land) continue; out.land += 1;
      const w = windWorkAt(lf, lat, lon); if (w.aeolian?.ground) out[w.aeolian.ground] += 1; if (w.loessM >= 2) out.loess += 1;
    }
    return out;
  };
  const caren = count(-12, 4, -8, 6), garyk = count(8, 22, -92, -64);
  assert.deepEqual([caren.dunes, caren.pavement, caren.yardangs, caren.loess], [0, 0, 0, 0], JSON.stringify(caren));
  assert.ok(garyk.dunes > 0 && garyk.dunes < garyk.land * 0.05, JSON.stringify(garyk));
  assert.ok(garyk.loess > 0 && garyk.loess < garyk.land * 0.15, JSON.stringify(garyk));
  assert.equal(garyk.pavement + garyk.yardangs, 0, "no country on Caren or Garyk is arid enough to scour");
});

test("in an arid, windy, bare country the wind scours pavement from hard ground and yardangs from soft rock", () => {
  const desert = { dp: 450, towardDeg: 240, steadiness: 0.8, annualMm: 150, driestShare: 0.2, dryness: 1 };
  assert.equal(aeolianAt(desert, 1, 0, 0, 20, 10).ground, "pavement");
  let ridges = 0, lift = 0;
  for (let k = 0; k < 200; k += 1) { const a = aeolianAt(desert, 1, 0, 1, 20 + k * 0.0004, 10); if (a.ground === "yardangs") ridges += 1; lift = Math.max(lift, a.liftM); }
  assert.ok(ridges > 10 && lift > 5, `${ridges} yardang squares, ${lift.toFixed(1)} m`);
  let dunes = 0; for (let k = 0; k < 200; k += 1) if (aeolianAt(desert, 1, 1, 0, 20 + k * 0.0004, 10 + k * 0.0004).ground === "dunes") dunes += 1;
  assert.ok(dunes > 20, "sand heaps into dunes");
  assert.equal(aeolianAt({ ...desert, annualMm: 1800, dryness: 0 }, 0.05, 1, 0, 20, 10), null, "a wet, wooded country keeps its ground");
});

test("loess: laid downwind on lowland, fertile, named in the soil; and the wind's forms change smoothly", () => {
  let best = { m: 0 };
  for (let lat = 8; lat < 22; lat += 0.25) for (let lon = -92; lon < -64; lon += 0.25) { const m = loessAt(climate, lat, lon); if (m > best.m) best = { m, lat, lon }; }
  assert.ok(best.m >= 2 && best.m <= 20, `deepest loess ${best.m.toFixed(1)} m`);
  assert.ok(coarseAt(ctx, best.lat, best.lon).elevationM < 2500, "on lowland or gentle upland");
  const geo = geologyAt(asset, best.lat, best.lon);
  assert.equal(geo.soil, "loess"); assert.match(geo.soilWords, /loess/);
  assert.ok(loessFertility(best.m) > 0.5 && loessFertility(0) === 0);
  // Along a line across the dune country (and across 1° cell edges) the wind's lift never jumps.
  let jump = 0, prev = null;
  for (let k = 0; k <= 400; k += 1) { const w = windWorkAt(lf, 14.5, -78.6 + k * 0.003), v = w.aeolian?.liftM ?? 0; if (prev !== null) jump = Math.max(jump, Math.abs(v - prev)); prev = v; }
  assert.ok(jump < 4, `largest change over 330 m: ${jump.toFixed(1)} m`);
  assert.ok(landWindAt(climate, ctx.field, 14.5, -78) && landWindAt(climate, ctx.field, -40, 100) === null);
});
