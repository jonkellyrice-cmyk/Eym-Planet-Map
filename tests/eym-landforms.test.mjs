import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { attachDrainage, attachGeology, drainageFileName } from "../scripts/cartography-asset.mjs";
import { coarseAt, buildLocalTile, landformsOf, localContext, terrainAt, COVER } from "../scripts/eym-local-detail.mjs";
import { channelWidthM, cliffLiftM, coastCharacter, drainageChannels, shoreAt, valleyAt } from "../scripts/eym-landforms.mjs";
import { REGION_MODEL, buildRegionTile, regionFrames, regionTileAt } from "../scripts/eym-region-layer.mjs";
import { DETAILED, MinHeap, buildDrainageParallel, drainageSourcesSha256, landMassFingerprint, landMassesOf } from "../tools/generate-eym-drainage.mjs";

const root = new URL("../", import.meta.url), read = (path) => readFileSync(new URL(path, root), "utf8");
const asset = JSON.parse(read("data/planet-cartography/mitkear/eym.json"));
attachGeology(asset, JSON.parse(read(`data/planet-cartography/mitkear/${asset.geologyFile}`)));
const drainagePath = `data/planet-cartography/mitkear/${drainageFileName("eym.json")}`;
attachDrainage(asset, JSON.parse(read(drainagePath)));
const ctx = localContext(asset), lf = landformsOf(ctx);

test("the drainage is up to date with what it is made from, and small enough to fetch", () => {
  assert.equal(asset.drainage.sourcesSha256, drainageSourcesSha256(), "npm run build would make it again");
  assert.ok(statSync(new URL(drainagePath, root)).size <= 350_000);
  const channels = drainageChannels(asset);
  // (Caren's and Garyk's only, 980 of them: the far continents are outside the detailed scope and are not drained. It was "> 1000" while theirs were shipped too.)
  assert.ok(channels.length > 900 && channels.every((c) => c.points.length === c.areasKm2.length && c.points.length >= 2));
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
  // Behind a cliff coast the land stands higher, the lift fading inland and along the shore without a step. (A cliff
  // coast of Garyk's: since Caren's heights follow from its natural history, canon of 20 November 2026, Caren's tan
  // country is low and its coasts have no cliffs but where the map shall show them. The place was on Caren's
  // south-west coast before.)
  const [la, lo] = [15.157, -89.536], relief = coarseAt(ctx, la, lo).relief;
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

test("a local map on a cliff coast has its cliff, and the Region layer's tiles carry the new landforms", () => {
  const tile = buildLocalTile(asset, { center: [15.157, -89.536], sizeKm: 4, resolutionM: 25 });
  assert.ok(tile.cover.includes(COVER.rock) && !tile.cover.includes(COVER.beach), "rock at the water, no beach");
  assert.ok(Math.max(...tile.elevation) > 30);
  assert.equal(REGION_MODEL, "eym-region-layer-v5");
  const frame = regionFrames(asset).find((f) => f.id === "garyk"), { tx, ty } = regionTileAt(frame, 14.25, -86.16), region = buildRegionTile(asset, frame, tx, ty);
  assert.ok(region.cover.filter((c) => c === COVER.marsh).length > 300, "the delta's marshes");
  assert.deepEqual(buildRegionTile(asset, frame, tx, ty).cover, region.cover, "the same tile every time");
});

test("only the detailed continents are drained, each on its own recorded lattice, and the reader follows the record", () => {
  const doc = asset.drainage;
  assert.deepEqual(doc.landMasses.map((m) => m.continent), DETAILED); assert.deepEqual(landMassesOf(asset).map((c) => c.continent), DETAILED);
  assert.ok(doc.landMasses.every((m) => m.latticeDeg === 0.02 && m.channels > 100)); assert.equal(doc.landMasses.reduce((s, m) => s + m.channels, 0), doc.channelLengths.length);
  assert.equal(doc.latticeDeg, undefined, "one step for all is no longer recorded");
  // No channel lies off Caren's and Garyk's side of the world.
  for (const c of drainageChannels(asset)) for (const [lat, lon] of c.points) assert.ok(lat > -30 && lat < 40 && lon > -110 && lon < 20, `${lat}, ${lon}`);
  // The reader: a land mass on a coarser lattice is read on its own step; a file from before the record still reads.
  const point = (i, j, a) => { const b = Buffer.alloc(6); b.writeInt16LE(i, 0); b.writeInt16LE(j, 2); b.writeUInt16LE(a, 4); return b; };
  const packed = Buffer.concat([point(10, 20, 90), point(12, 22, 95), point(14, 24, 99), point(100, -50, 80), point(101, -51, 85), point(102, -52, 88)]).toString("base64");
  const mixed = drainageChannels({ drainage: { landMasses: [{ continent: "a", latticeDeg: 0.02, channels: 1 }, { continent: "b", latticeDeg: 0.1, channels: 1 }], channelLengths: [3, 3], pointsInt16Base64: packed } });
  const near = (p, q) => Math.abs(p[0] - q[0]) < 0.05 && Math.abs(p[1] - q[1]) < 0.05;
  assert.ok(near(mixed[0].points[0], [0.2, 0.4]) && near(mixed[0].points.at(-1), [0.28, 0.48]) && near(mixed[1].points[0], [10, -5]) && near(mixed[1].points.at(-1), [10.2, -5.2]));
  const legacy = drainageChannels({ drainage: { latticeDeg: 0.02, channelLengths: [3, 3], pointsInt16Base64: packed } });
  assert.ok(near(legacy[1].points[0], [2, -1]));
});

test("the flood's heap on fixed arrays lets nodes go in exactly the order the array heap did, ties included", () => {
  // The earlier heap, kept here as the reference.
  class ArrayHeap {
    constructor(keys) { this.keys = keys; this.a = []; }
    push(i) { const a = this.a; a.push(i); let n = a.length - 1; while (n) { const p = (n - 1) >> 1; if (this.keys[a[p]] <= this.keys[a[n]]) break; [a[p], a[n]] = [a[n], a[p]]; n = p; } }
    pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let n = 0; for (;;) { const l = 2 * n + 1, r = l + 1; let m = n; if (l < a.length && this.keys[a[l]] < this.keys[a[m]]) m = l; if (r < a.length && this.keys[a[r]] < this.keys[a[m]]) m = r; if (m === n) break; [a[m], a[n]] = [a[n], a[m]]; n = m; } } return top; }
    get size() { return this.a.length; }
  }
  let seed = 12345; const rand = () => { seed = (Math.imul(seed, 1103515245) + 12345) >>> 0; return seed / 4294967296; };
  const n = 20000, keys = Float64Array.from({ length: n }, () => Math.floor(rand() * 400) / 4 * (rand() < 0.3 ? 0 : 1)); // many exact ties, many zeros
  const a = new ArrayHeap(keys), b = new MinHeap(keys, n), outA = [], outB = [];
  // Pushes and pops interleaved, as in the flood.
  for (let i = 0; i < n; i += 1) { a.push(i); b.push(i); if (i % 3 === 2) { outA.push(a.pop()); outB.push(b.pop()); } }
  while (a.size) { outA.push(a.pop()); outB.push(b.pop()); }
  assert.equal(b.size, 0); assert.deepEqual(outB, outA);
});

test("each land mass has a fingerprint of what it reads, and the threaded build writes the file as it stands", async () => {
  const [caren, garyk] = landMassesOf(asset), print = landMassFingerprint(asset, caren);
  assert.match(print, /^[0-9a-f]{64}$/); assert.equal(landMassFingerprint(asset, caren), print); assert.notEqual(landMassFingerprint(asset, garyk), print);
  // Moving a point of Garyk's coast leaves Caren's fingerprint alone and changes Garyk's.
  const moved = structuredClone(asset), coast = moved.terrain.coastlines.find((c) => c.kind === "mainland" && c.continent === "Garyk"); coast.points[5] = [coast.points[5][0] + 0.01, coast.points[5][1]];
  assert.equal(landMassFingerprint(moved, landMassesOf(moved)[0]), print); assert.notEqual(landMassFingerprint(moved, landMassesOf(moved)[1]), landMassFingerprint(asset, garyk));
  // Drained afresh in two threads, nothing reused: the very file that is shipped.
  const report = [], doc = await buildDrainageParallel({ cache: false, report });
  assert.equal(`${JSON.stringify(doc)}\n`, read(drainagePath)); assert.deepEqual(report.map((r) => r.continent).sort(), [...DETAILED].sort()); assert.ok(report.every((r) => !r.cached && r.landNodes > 100000));
});

test("Caren's and Garyk's channels are the ones recorded, bit for bit", () => {
  // The channels' points, bit for bit (572 of Caren's and 412 of Garyk's; Caren's were 568 until its heights were
  // made to follow from its natural history, canon of 20 November 2026, which changed where its water runs). When Gaffa, Khohalis and Demani were grown
  // (canon of 19 November 2026) a river of theirs that crosses ±180° was at first walked right round the world at
  // its latitude, through Caren and Garyk, and 47 false channels appeared: this is the guard against its like.
  const doc = JSON.parse(read(drainagePath));
  assert.deepEqual(doc.landMasses, [{ continent: "Caren", latticeDeg: 0.02, channels: 572 }, { continent: "Garyk", latticeDeg: 0.02, channels: 412 }]);
  assert.equal(createHash("sha256").update(doc.pointsInt16Base64).digest("hex"), "dbf4fca5ae88dc43e54aae799461ad9ec8fff94b124c1e8584bceda1f69fe2c7");
});
