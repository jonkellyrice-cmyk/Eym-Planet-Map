import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { REGION_MODEL, regionFrames, regionTileAt } from "../scripts/eym-region-layer.mjs";
import { decodePng } from "../webapp/render/png.mjs";
import { regionStore, sha256 } from "../webapp/region-store.mjs";
import { createMapServer, regionShapesFile, regionTilePath, regionTilePicture } from "../webapp/server.mjs";

const asset = JSON.parse(readFileSync(new URL("../data/planet-cartography/abydos/eventide.json", import.meta.url), "utf8"));
const frames = regionFrames(asset), caren = frames.find((f) => f.id === "caren"), home = regionTileAt(caren, -6.79, 0.412);
const ENV = { SUPABASE_URL: "https://example.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "service-key-for-tests" };

/** A stand-in for Supabase: remembers what is written, answers as the real service does. */
function fakeSupabase() {
  const files = new Map(), rows = new Map(), calls = [];
  const fetchImpl = async (address, init = {}) => {
    const url = new URL(address), method = init.method ?? "GET", headers = init.headers ?? {}; calls.push({ method, path: url.pathname, headers });
    const answer = (status, body = "") => ({ status, ok: status >= 200 && status < 300, text: async () => (typeof body === "string" ? body : JSON.stringify(body)), json: async () => body, arrayBuffer: async () => { const b = Buffer.from(body); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } });
    const pub = /^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/.exec(url.pathname);
    if (pub) return files.has(`${pub[1]}/${pub[2]}`) ? answer(200, files.get(`${pub[1]}/${pub[2]}`)) : answer(400, { error: "not_found" });
    if (headers.authorization !== "Bearer service-key-for-tests" || headers.apikey !== "service-key-for-tests") return answer(401, "no key");
    const listing = /^\/storage\/v1\/object\/list\/([^/]+)$/.exec(url.pathname);
    if (listing && method === "POST") {
      // One level under the prefix, as Supabase lists it: files with an id, folders without.
      const { prefix, limit, offset } = JSON.parse(init.body), under = `${listing[1]}/${prefix}/`, names = new Map();
      for (const key of files.keys()) if (key.startsWith(under)) { const rest = key.slice(under.length), cut = rest.indexOf("/"); names.set(cut < 0 ? rest : rest.slice(0, cut), cut < 0 ? `id-${rest}` : null); }
      return answer(200, [...names].sort(([a], [b]) => a.localeCompare(b)).slice(offset, offset + limit).map(([name, id]) => ({ name, id })));
    }
    if (method === "DELETE" && /^\/storage\/v1\/object\/[^/]+$/.test(url.pathname)) {
      const bucket = url.pathname.split("/").pop(), gone = JSON.parse(init.body).prefixes.filter((path) => files.delete(`${bucket}/${path}`));
      return answer(200, gone.map((name) => ({ name })));
    }
    const obj = /^\/storage\/v1\/object\/([^/]+)\/(.+)$/.exec(url.pathname);
    if (obj && method === "POST") { files.set(`${obj[1]}/${obj[2]}`, Buffer.from(init.body)); return answer(200, {}); }
    if (url.pathname === "/rest/v1/eym_tiles" && method === "POST") { const row = JSON.parse(init.body); rows.set([row.layer, row.kind, row.z, row.x, row.y].join("|"), row); return answer(201); }
    if (url.pathname === "/rest/v1/eym_tiles") { const want = (k) => url.searchParams.get(k).slice(3), all = [...rows.values()].filter((r) => r.layer === want("layer") && r.kind === want("kind") && String(r.z) === want("z") && (!url.searchParams.has("rules_version") || r.rules_version === want("rules_version"))), from = Number(url.searchParams.get("offset")); return answer(200, all.slice(from, from + 1000).map((r) => ({ x: r.x, y: r.y }))); }
    return answer(404, "?");
  };
  return { files, rows, calls, fetchImpl };
}

test("there is no store without the project's address and key", () => {
  assert.equal(regionStore({}, async () => null), null); assert.equal(regionStore({ SUPABASE_URL: "https://x.supabase.co" }, async () => null), null);
  const store = regionStore(ENV, async () => null); assert.deepEqual(store.buckets, { tiles: "eym-tiles", shapes: "eym-shapes" });
  assert.equal(store.publicUrl("a/b.png"), "https://example.supabase.co/storage/v1/object/public/eym-tiles/a/b.png");
});

test("a land tile is made once, kept with its shapes, and read back from the store after that", async () => {
  const fake = fakeSupabase(), store = regionStore(ENV, fake.fetchImpl), path = regionTilePath("caren", "pixels", home.tx, home.ty);
  assert.equal(path, `region/${REGION_MODEL}/caren/pixels/${home.tx}_${home.ty}.png`);
  const first = await regionTilePicture(asset, frames, store, "caren", home.tx, home.ty); assert.equal(first.source, "made and kept"); assert.equal(first.error, undefined);
  assert.deepEqual(fake.files.get(`eym-tiles/${path}`), first.png); assert.equal(decodePng(first.png).width, 256);
  const row = fake.rows.get(`region|pixels|${caren.store}|${home.tx}|${home.ty}`); assert.equal(row.sha256, sha256(first.png)); assert.equal(row.bytes, first.png.length); assert.equal(row.rules_version, REGION_MODEL);
  const shapes = JSON.parse(gunzipSync(fake.files.get(`eym-shapes/region/${REGION_MODEL}/caren/shapes/${home.tx}_${home.ty}.json.gz`)));
  assert.equal(shapes.cells, 256); assert.equal(Buffer.from(shapes.cover, "base64").length, 260 * 260); assert.ok(shapes.settlements.some((s) => s.name === "Dree"));
  assert.ok(fake.rows.has(`region|shapes|${caren.store}|${home.tx}|${home.ty}`));
  const again = await regionTilePicture(asset, frames, store, "caren", home.tx, home.ty); assert.equal(again.source, "store"); assert.deepEqual(again.png, first.png);
  assert.deepEqual([...(await store.listed("region", "pixels", caren.store))], [`${home.tx},${home.ty}`]);
  // A tile made under older rules does not count as made under these ones.
  assert.deepEqual([...(await store.listed("region", "pixels", caren.store, REGION_MODEL))], [`${home.tx},${home.ty}`]);
  assert.deepEqual([...(await store.listed("region", "pixels", caren.store, "eym-region-layer-v0"))], []);
  // Each row is dated when it was made (a tile made again gets a new date, not its first one).
  const dated = Date.parse(fake.rows.get(`region|pixels|${caren.store}|${home.tx}|${home.ty}`).made_at); assert.ok(Math.abs(Date.now() - dated) < 600_000);
  // Each row names its frame.
  assert.equal(fake.rows.get(`region|shapes|${caren.store}|${home.tx}|${home.ty}`).frame, "caren");
  assert.equal(fake.rows.get(`region|pixels|${caren.store}|${home.tx}|${home.ty}`).frame, "caren");
  // The key travels only in the request headers to the store, never in an address.
  assert.ok(fake.calls.every((c) => !c.path.includes("service-key")));
});

test("open sea is made but never kept; without a store every tile is simply made; a store that fails still gives the picture", async () => {
  const fake = fakeSupabase(), store = regionStore(ENV, fake.fetchImpl);
  const sea = await regionTilePicture(asset, frames, store, "caren", caren.tiles.tx1 + 6, caren.tiles.ty0 - 6); assert.equal(sea.source, "made"); assert.equal(sea.sea, true); assert.equal(fake.files.size, 0);
  // Land outside a frame (Garyk's, seen through the corridor's frame beyond the corridor) is drawn if asked for directly, but never kept.
  const corridor = frames.find((f) => f.id === "caren-garyk-sea"), off = regionTileAt(corridor, 15, -75), far = await regionTilePicture(asset, frames, store, "caren-garyk-sea", off.tx, off.ty); assert.equal(far.sea, false); assert.equal(far.source, "made"); assert.equal(fake.files.size, 0); assert.equal(fake.rows.size, 0);
  const bare = await regionTilePicture(asset, frames, null, "caren", home.tx, home.ty, "flat"); assert.equal(bare.source, "made"); assert.equal(decodePng(bare.png).height, 256);
  const broken = regionStore({ ...ENV, SUPABASE_SERVICE_ROLE_KEY: "wrong" }, fake.fetchImpl), failed = await regionTilePicture(asset, frames, broken, "caren", home.tx, home.ty);
  assert.equal(failed.source, "made"); assert.match(failed.error, /Writing to the store failed \(401\)/); assert.ok(!failed.error.includes("wrong"));
});

test("the map server serves region tiles and fills a frame a few tiles at a time", async () => {
  const fake = fakeSupabase(), cacheDir = mkdtempSync(join(tmpdir(), "eym-region-")), server = createMapServer({ asset, cacheDir, store: regionStore(ENV, fake.fetchImpl) });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve)); const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const info = await (await fetch(`${base}/api/region/frames`)).json(); assert.equal(info.stored, true); assert.deepEqual(info.frames.map((f) => f.id), ["caren", "garyk", "caren-garyk-sea"]); assert.equal(info.tileCells, 256);
    const tile = await fetch(`${base}/api/region/tile/caren/${home.tx}/${home.ty}.png`); assert.equal(tile.status, 200); assert.equal(tile.headers.get("content-type"), "image/png"); assert.equal(tile.headers.get("x-eym-source"), "made and kept");
    assert.equal((await fetch(`${base}/api/region/tile/caren/${home.tx}/${home.ty}.png`)).headers.get("x-eym-source"), "store");
    assert.equal((await fetch(`${base}/api/region/tile/nowhere/0/0.png`)).status, 404);
    // Nothing outside the frames is drawn or kept: a tile beyond Caren's range is refused, and a land tile there would not be stored.
    assert.equal((await fetch(`${base}/api/region/tile/caren/${caren.tiles.tx1 + 6}/0.png`)).status, 404); assert.equal((await fetch(`${base}/api/region/tile/caren-garyk-sea/0/30.png`)).status, 404);
    assert.equal((await fetch(`${base}/api/region/tile/caren-garyk-sea/0/0.png`)).headers.get("x-eym-source"), "made", "open sea in the corridor is made, not kept"); assert.equal((await fetch(`${base}/api/region/tile/caren/0/0.png?kind=oil`)).status, 400);
    // Fill from the tile before Dree's: the one already kept is passed over, the next is made.
    const width = caren.tiles.tx1 - caren.tiles.tx0 + 1, index = (home.ty - caren.tiles.ty0) * width + (home.tx - caren.tiles.tx0);
    const report = await (await fetch(`${base}/api/region/fill?frame=caren&start=${index}&count=1`)).json();
    assert.equal(report.already, 1); assert.equal(report.kept, 1); assert.deepEqual(report.errors, []); assert.equal(report.next, index + 2); assert.equal(report.done, false);
    assert.equal((await fetch(`${base}/api/region/fill?frame=nowhere`)).status, 404);
  } finally { await new Promise((resolve) => server.close(resolve)); rmSync(cacheDir, { recursive: true, force: true }); }
  const bare = createMapServer({ asset, cacheDir: mkdtempSync(join(tmpdir(), "eym-region-")), store: null }); await new Promise((resolve) => bare.listen(0, "127.0.0.1", resolve));
  try { const base = `http://127.0.0.1:${bare.address().port}`; assert.equal((await (await fetch(`${base}/api/region/frames`)).json()).stored, false); assert.equal((await fetch(`${base}/api/region/fill?frame=caren`)).status, 503); assert.equal((await fetch(`${base}/api/region/tile/caren/${home.tx}/${home.ty}.png?kind=flat`)).headers.get("x-eym-source"), "made"); }
  finally { await new Promise((resolve) => bare.close(resolve)); }
});

test("old Region models' files can be purged, only when switched on, only older models, and only when confirmed", async () => {
  const fake = fakeSupabase(), cacheDir = mkdtempSync(join(tmpdir(), "eym-region-")), store = regionStore(ENV, fake.fetchImpl);
  const old = ["caren/pixels/1_2.png", "caren/pixels/1_3.png", "garyk/pixels/-7_-7.png"];
  for (const p of old) { fake.files.set(`eym-tiles/region/eym-region-layer-v2/${p}`, Buffer.from("old")); fake.files.set(`eym-shapes/region/eym-region-layer-v2/${p.replace("pixels", "shapes").replace(".png", ".json.gz")}`, Buffer.from("old")); }
  fake.files.set(`eym-tiles/region/${REGION_MODEL}/caren/pixels/1_2.png`, Buffer.from("now")); fake.files.set("eym-tiles/region/eym-region-layer-v3/caren/pixels/1_2.png", Buffer.from("other"));
  const kept = fake.files.size, off = createMapServer({ asset, cacheDir, store }), on = createMapServer({ asset, cacheDir, store, purge: true });
  await Promise.all([off, on].map((s) => new Promise((resolve) => s.listen(0, "127.0.0.1", resolve))));
  const at = (s, query) => fetch(`http://127.0.0.1:${s.address().port}/api/region/purge?${query}`);
  try {
    // Off unless the deployment switches it on.
    assert.equal((await at(off, "model=eym-region-layer-v2&confirm=eym-region-layer-v2")).status, 403); assert.equal(fake.files.size, kept);
    // Never the current model, a newer one, or anything that is not a model's name.
    for (const model of [REGION_MODEL, "eym-region-layer-v99", "eym-region-layer-v2/..", "", "region"]) assert.equal((await at(on, `model=${encodeURIComponent(model)}&confirm=${encodeURIComponent(model)}`)).status, 400, model);
    // Without confirm it only counts; with the wrong confirm too.
    for (const query of ["model=eym-region-layer-v2", "model=eym-region-layer-v2&confirm=eym-region-layer-v3"]) {
      const dry = await (await at(on, query)).json(); assert.equal(dry.dryRun, true); assert.deepEqual(dry.files, { "eym-tiles": 3, "eym-shapes": 3 }); assert.deepEqual(dry.deleted, { "eym-tiles": 0, "eym-shapes": 0 });
    }
    assert.equal(fake.files.size, kept);
    // Confirmed: the old model's files go, from both buckets; the current model's and other old models' stay.
    const done = await (await at(on, "model=eym-region-layer-v2&confirm=eym-region-layer-v2")).json();
    assert.equal(done.dryRun, false); assert.deepEqual(done.deleted, { "eym-tiles": 3, "eym-shapes": 3 });
    assert.deepEqual([...fake.files.keys()].sort(), ["eym-tiles/region/eym-region-layer-v3/caren/pixels/1_2.png", `eym-tiles/region/${REGION_MODEL}/caren/pixels/1_2.png`].sort());
    assert.deepEqual((await (await at(on, "model=eym-region-layer-v2")).json()).files, { "eym-tiles": 0, "eym-shapes": 0 });
  } finally { await Promise.all([off, on].map((s) => new Promise((resolve) => s.close(resolve)))); rmSync(cacheDir, { recursive: true, force: true }); }
});

test("a tile's shapes file holds everything needed to draw it again", () => {
  const tile = { model: REGION_MODEL, frame: "caren", tx: 1, ty: 2, cells: 256, pad: 2, sea: false, cover: new Uint8Array([1, 2, 3]), elevation: new Int16Array([-5, 300]), shade: new Uint8Array([75]), coastKm: new Uint8Array([9]), rivers: [], roads: [], settlements: [] };
  const back = JSON.parse(gunzipSync(regionShapesFile(tile))); assert.deepEqual([...Buffer.from(back.cover, "base64")], [1, 2, 3]);
  const heights = Buffer.from(back.elevationInt16, "base64"); assert.deepEqual([heights.readInt16LE(0), heights.readInt16LE(2)], [-5, 300]);
});
