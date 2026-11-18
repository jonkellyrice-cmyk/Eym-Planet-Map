import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { attachDrainage, attachGeology, drainageFileName } from "../scripts/cartography-asset.mjs";
import { coarseAt, buildLocalTile, landformsOf, localContext, terrainAt, COVER } from "../scripts/eym-local-detail.mjs";
import { channelWidthM, cliffLiftM, coastCharacter, drainageChannels, shoreAt, valleyAt } from "../scripts/eym-landforms.mjs";
import { REGION_MODEL, buildRegionTile, regionFrames, regionTileAt } from "../scripts/eym-region-layer.mjs";
import { drainageSourcesSha256 } from "../tools/generate-eym-drainage.mjs";

const root = new URL("../", import.meta.url), read = (path) => readFileSync(new URL(path, root), "utf8");
const asset = JSON.parse(read("data/planet-cartography/abydos/eventide.json"));
attachGeology(asset, JSON.parse(read(`data/planet-cartography/abydos/${asset.geologyFile}`)));
const drainagePath = `data/planet-cartography/abydos/${drainageFileName("eventide.json")}`;
attachDrainage(asset, JSON.parse(read(drainagePath)));
const ctx = localContext(asset), lf = landformsOf(ctx);

test("the drainage is up to date with what it is made from, and small enough to fetch", () => {
  assert.equal(asset.drainage.sourcesSha256, drainageSourcesSha256(), "npm run build would make it again");
  assert.ok(statSync(new URL(drainagePath, root)).size <= 350_000);
  const channels = drainageChannels(asset);
  assert.ok(channels.length > 1000 && channels.every((c) => c.points.length === c.areasKm2.length && c.points.length >= 2));
  // Water gathers downhill: a channel drains more land the further it runs.
  const growing = channels.filter((c) => c.areasKm2.at(-1) >= c.areasKm2[0]).length;
  assert.ok(growing / channels.length > 0.98, `${growing} of ${channels.length} channels grow downstream`);
  assert.ok(Math.abs(channelWidthM(900) - 90) < 1e-9);
});

test("valleys: a lowland river lies in a broad, flat floodplain; a mountain channel in a deep, narrow gorge", () => {
  const lowland = valleyAt({ distKm: 0.5, widthM: 600 }, { elevationM: 80, relief: 0 }), bluff = valleyAt({ distKm: 6, widthM: 600 }, { elevationM: 80, relief: 0 });
  assert.ok(lowland.floodplain && lowland.carveM > 10 && lowland.carveM < 30, `floodplain cut ${lowland.carveM} m`);
  assert.ok(bluff && bluff.carveM < lowland.carveM, "the valley side rises from the floor");
  const gorge = valleyAt({ distKm: 0.4, widthM: 300 }, { elevationM: 3000, relief: 3 }), mountainFloor = valleyAt({ distKm: 0.05, widthM: 300 }, { elevationM: 3000, relief: 3 });
  assert.ok(mountainFloor.carveM > 300, `a mountain valley is cut ${Math.round(mountainFloor.carveM)} m deep`);
  assert.ok(gorge.gorge && !gorge.floodplain, "its sides are gorge walls, its floor narrow");
  assert.equal(valleyAt({ distKm: 40, widthM: 300 }, { elevationM: 3000, relief: 3 }), null, "beyond the valley, nothing");
  assert.equal(valleyAt(null, { elevationM: 100, relief: 0 }), null);
});

test("on the map: the ground is lowest along a river and rises away from it; Garyk's mountains have gorges", () => {
  const river = ctx.rivers.find((r) => r.widthM > 500), [lat, lon] = river.points[Math.floor(river.points.length / 2)];
  const at = (dLat) => terrainAt(ctx, lat + dLat, lon).elevationM;
  assert.ok(at(0) < at(0.15) || at(0) < at(-0.15), "the river is below the land beside it");
  let deepest = 0;
  for (let la = 10.5; la < 19; la += 0.1) for (let lo = -88; lo < -70; lo += 0.1) { const t = terrainAt(ctx, la, lo); if (t.valley?.gorge) deepest = Math.max(deepest, t.valley.depthM); }
  assert.ok(deepest > 250, `Garyk's deepest gorge ${Math.round(deepest)} m`);
});

test("coasts by exposure, rock and tide: mostly beaches, with cliffs, salt marsh and river mouths where they belong", () => {
  const kinds = {};
  for (const c of asset.terrain.coastlines.filter((x) => x.kind === "mainland" && ["Caren", "Garyk"].includes(x.continent))) for (let k = 0; k < c.points.length; k += 6) {
    const [la, lo] = c.points[k], ch = coastCharacter(lf, la, lo, coarseAt(ctx, la, lo).relief); kinds[ch.kind] = (kinds[ch.kind] ?? 0) + 1;
    if (ch.kind === "cliffs") assert.ok(ch.cliffM >= 12 && ch.cliffM <= 150);
  }
  const total = Object.values(kinds).reduce((a, b) => a + b, 0);
  assert.ok(kinds.beach / total > 0.5, JSON.stringify(kinds));
  for (const k of ["cliffs", "saltmarsh"]) assert.ok(kinds[k] > 0, `${k}: ${JSON.stringify(kinds)}`);
  assert.ok((kinds.delta ?? 0) + (kinds.estuary ?? 0) > 0, "some river mouths");
});

test("the shore: a beach is sand to the water, a cliff stands on raised land, a salt marsh is low and wide", () => {
  const beach = shoreAt({ kind: "beach", exposure: 0.6, tideGain: 3 }, 0.05, 0, 5), dunes = shoreAt({ kind: "beach", exposure: 0.8, tideGain: 3 }, 0.45, 0, 5);
  assert.equal(beach.ground, "beach"); assert.equal(dunes.ground, "dunes");
  assert.equal(shoreAt({ kind: "cliffs", exposure: 0.6, tideGain: 3, cliffM: 60 }, 0.02, 0, 10).ground, "cliff");
  assert.equal(shoreAt({ kind: "cliffs", exposure: 0.6, tideGain: 3, cliffM: 60 }, 0.3, 0, 10), null, "behind the face, the land is left to the lift");
  // Behind Caren's marble cliffs the land stands higher, the lift fading inland and along the shore without a step.
  const [la, lo] = [-6.93, -3.73], relief = coarseAt(ctx, la, lo).relief;
  assert.equal(coastCharacter(lf, la, lo, relief).kind, "cliffs");
  assert.ok(cliffLiftM(lf, la, lo, relief, 0.3) > 12 && cliffLiftM(lf, la, lo, relief, 0) === 0, "it drops to the water");
  assert.ok(cliffLiftM(lf, la, lo, relief, 10) < cliffLiftM(lf, la, lo, relief, 0.3) && cliffLiftM(lf, la, lo, relief, 26) === 0, "and fades inland");
  let steepest = 0;
  for (let k = 0; k < 400; k += 1) { const a = cliffLiftM(lf, la, lo - 0.1 + k * 0.0005, relief, 2), b = cliffLiftM(lf, la, lo - 0.1 + (k + 1) * 0.0005, relief, 2); steepest = Math.max(steepest, Math.abs(b - a)); }
  assert.ok(steepest < 3, `no step along the shore (largest change over 55 m: ${steepest.toFixed(1)} m)`);
  const marsh = shoreAt({ kind: "saltmarsh", exposure: 0.2, tideGain: 8 }, 1, 0, 12);
  assert.ok(["marsh", "mudflat", "delta-meadow"].includes(marsh.ground) && marsh.elevationM < 5);
  assert.equal(shoreAt({ kind: "beach", exposure: 0.6, tideGain: 3 }, 0.2, 0, 5, 0.3).ground, "beach", "at least a square wide on a coarse map");
});

test("a local map on Caren's marble coast has its cliff, and the Region layer's tiles carry the new landforms", () => {
  const tile = buildLocalTile(asset, { center: [-6.93, -3.73], sizeKm: 4, resolutionM: 25 });
  assert.ok(tile.cover.includes(COVER.rock) && !tile.cover.includes(COVER.beach), "rock at the water, no beach");
  assert.ok(Math.max(...tile.elevation) > 30);
  assert.equal(REGION_MODEL, "eym-region-layer-v4");
  const frame = regionFrames(asset).find((f) => f.id === "garyk"), { tx, ty } = regionTileAt(frame, 14.25, -86.16), region = buildRegionTile(asset, frame, tx, ty);
  assert.ok(region.cover.filter((c) => c === COVER.marsh).length > 300, "the delta's marshes");
  assert.deepEqual(buildRegionTile(asset, frame, tx, ty).cover, region.cover, "the same tile every time");
});
