import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { createHash } from "node:crypto";
import { buildBattleMap, geometryHash } from "../scripts/eym-battle-rules.mjs";
import { buildInteriors } from "../scripts/eym-battle-interiors.mjs";
import { battleMapSpec } from "../scripts/eym-map-presets.mjs";
import { fromLocal } from "../scripts/eym-surface.mjs";
import { Framebuffer } from "../webapp/render/framebuffer.mjs";
import { crc32, encodePng } from "../webapp/render/png.mjs";
import { inFootprint, pixelPlan, renderBattleLayers } from "../webapp/render/render-battle.mjs";
import { createMapServer, parseRequest } from "../webapp/server.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const asset = JSON.parse(read("data/planet-cartography/abydos/eventide.json"));
const lyle = asset.settlements.find((s) => s.properName === "Lyle"), center = fromLocal([lyle.lat, lyle.lon], 0.2, 0.15);
const spec = battleMapSpec({ size: "custom", columns: 15, rows: 24, density: "custom", gridPx: 70 });
const map = buildBattleMap(asset, { center, spec }), interiors = buildInteriors(map);
const layers = renderBattleLayers(map, interiors, { gridPx: 70 });

/** Decode our PNG (RGBA, filter 0) back to pixels. */
function decode(png) {
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  let o = 8, width = 0, height = 0; const idat = [];
  while (o < png.length) { const len = png.readUInt32BE(o), type = png.toString("ascii", o + 4, o + 8), body = png.subarray(o + 8, o + 8 + len); assert.equal(png.readUInt32BE(o + 8 + len), crc32(png.subarray(o + 4, o + 8 + len)), `${type} CRC`); if (type === "IHDR") { width = body.readUInt32BE(0); height = body.readUInt32BE(4); } if (type === "IDAT") idat.push(body); o += 12 + len; }
  const raw = inflateSync(Buffer.concat(idat)), px = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) { assert.equal(raw[y * (width * 4 + 1)], 0); px.set(raw.subarray(y * (width * 4 + 1) + 1, (y + 1) * (width * 4 + 1)), y * width * 4); }
  return { width, height, px };
}

test("the PNG encoder writes valid PNGs that decode to the same pixels; upscaling keeps pixels crisp", () => {
  const fb = new Framebuffer(3, 2, "#102030"); fb.set(1, 1, [200, 100, 50, 255]);
  const { width, height, px } = decode(encodePng(fb.upscale(2)));
  assert.equal(width, 6); assert.equal(height, 4);
  assert.deepEqual([...px.subarray(((2 * 6) + 2) * 4, ((2 * 6) + 2) * 4 + 4)], [200, 100, 50, 255]);
  assert.deepEqual([...px.subarray(((3 * 6) + 3) * 4, ((3 * 6) + 3) * 4 + 4)], [200, 100, 50, 255], "a 2×2 block, no blending");
  assert.deepEqual([...px.subarray(((3 * 6) + 4) * 4, ((3 * 6) + 4) * 4 + 4)], [16, 32, 48, 255]);
});

test("native pixels per square and a whole-number scale for every grid preset", () => {
  assert.deepEqual(pixelPlan(140), { native: 35, scale: 4 });
  assert.deepEqual(pixelPlan(100), { native: 25, scale: 4 });
  assert.deepEqual(pixelPlan(200), { native: 40, scale: 5 });
  assert.deepEqual(pixelPlan(70), { native: 35, scale: 2 });
  for (const g of [50, 60, 75, 128, 150, 256]) { const p = pixelPlan(g); assert.equal(p.native * p.scale, g); }
});

test("Tier 2 is deterministic and keeps the map's geometry: roofs exactly over the buildings, floors where they are", () => {
  const again = renderBattleLayers(map, buildInteriors(map), { gridPx: 70 }), sha = (fb) => createHash("sha256").update(fb.data).digest("hex");
  assert.equal(sha(again.exterior), sha(layers.exterior)); assert.equal(sha(again.ground), sha(layers.ground));
  const P = layers.native, roofs = layers.roofs[0], W = roofs.width;
  for (const b of map.buildings) {
    const sq = [...(b.rects ?? [b])][0], cx = Math.floor((sq.x0 + sq.x1 + 1) / 2 * P), cy = Math.floor((sq.y0 + sq.y1 + 1) / 2 * P);
    if (cx >= 0 && cy >= 0 && cx < W && cy < roofs.height && inFootprint(b, (cx + 0.5) / P, (cy + 0.5) / P)) assert.equal(roofs.data[(cy * W + cx) * 4 + 3], 255, `roof over building ${b.id}`);
  }
  for (let i = 0; i < map.grid.building.length; i += 1) if (map.grid.street[i]) { const x = (i % 15) * P + Math.floor(P / 2), y = Math.floor(i / 15) * P + Math.floor(P / 2); assert.equal(roofs.data[(y * W + x) * 4 + 3], 0, "no roof over the street"); break; }
  if (layers.floors[-1]) assert.equal(layers.floors[-1].data[3], 255, "the basement layer is solid outside the cellars");
  assert.equal(layers.exterior.width, 15 * P);
});

test("the server: validates requests, renders, caches, serves the layers and the page", async () => {
  assert.throws(() => parseRequest({ center: [0, 0], columns: 3, rows: 30, gridPx: 140 }), /columns/);
  assert.throws(() => parseRequest({ center: [0, 0], columns: 24, rows: 30, gridPx: 140, tier: 4 }), /tier 4/);
  assert.throws(() => parseRequest({ center: [0, 0], columns: 24, rows: 30, gridPx: 140, extras: ["laser"] }), /feature/);
  const cacheDir = mkdtempSync(join(tmpdir(), "eym-cache-")), server = createMapServer({ asset, cacheDir });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await (await fetch(`${base}/api/health`)).json()).renderer.tier, 2);
    assert.match(await (await fetch(`${base}/`)).text(), /Eym Map Server/);
    const body = JSON.stringify({ center, columns: 15, rows: 24, gridPx: 70, tier: 2 });
    const first = await (await fetch(`${base}/api/battle-maps`, { method: "POST", headers: { "content-type": "application/json", origin: "https://forge.example" }, body })).json();
    assert.equal(first.geometryHash, geometryHash(map), "the server built the module's map");
    assert.equal(first.width, 15 * 70); assert.ok(first.files.ground && first.files.exterior);
    const png = Buffer.from(await (await fetch(`${base}/api/battle-maps/${first.id}/files/${first.files.ground}`)).arrayBuffer());
    assert.equal(decode(png).width, 15 * 70);
    const t = Date.now(), second = await (await fetch(`${base}/api/battle-maps`, { method: "POST", headers: { "content-type": "application/json" }, body })).json();
    assert.equal(second.id, first.id); assert.ok(Date.now() - t < 1500, "a repeat comes from the cache");
    assert.equal((await fetch(`${base}/api/battle-maps/../../etc/files/x.png`)).status, 404);
    // Native size on request (the module enlarges it itself); full size is the native enlarged.
    const native = decode(Buffer.from(await (await fetch(`${base}/api/battle-maps/${first.id}/files/${first.files.ground}?size=native`)).arrayBuffer()));
    assert.equal(native.width * first.scale, 15 * 70);
    const pre = await fetch(`${base}/api/battle-maps`, { method: "OPTIONS", headers: { origin: "https://forge.example", "access-control-request-private-network": "true" } });
    assert.equal(pre.headers.get("access-control-allow-private-network"), "true");
  } finally { server.close(); rmSync(cacheDir, { recursive: true, force: true }); }
});

test("the module renders on the server only if the server built the same map", () => {
  const app = read("scripts/cluster-map-app.mjs");
  assert.match(app, /manifest\.geometryHash !== ours/);
  assert.match(app, /if \(current\.pixel\) return \{ ground: current\.pixel\.ground/);
  assert.match(read("templates/cluster-map.hbs"), /data-action="battle-render-server"/);
  assert.match(read("scripts/main.mjs"), /registerMapServerSettings\(MODULE_ID\)/);
  assert.equal(geometryHash(buildBattleMap(asset, { center, spec })), geometryHash(map));
});

test("a server that never saw a map rebuilds it from its id alone (as a cold Vercel instance must)", async () => {
  const a = mkdtempSync(join(tmpdir(), "eym-a-")), b = mkdtempSync(join(tmpdir(), "eym-b-"));
  const one = createMapServer({ asset, cacheDir: a }), two = createMapServer({ asset, cacheDir: b });
  await new Promise((r) => one.listen(0, "127.0.0.1", r)); await new Promise((r) => two.listen(0, "127.0.0.1", r));
  try {
    const m = await (await fetch(`http://127.0.0.1:${one.address().port}/api/battle-maps`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ center, columns: 12, rows: 10, gridPx: 70, setting: "urban", style: "dree" }) })).json();
    const other = `http://127.0.0.1:${two.address().port}/api/battle-maps/${m.id}`;
    const again = await (await fetch(other)).json();
    assert.equal(again.geometryHash, m.geometryHash); assert.equal(again.id, m.id);
    const f1 = Buffer.from(await (await fetch(`http://127.0.0.1:${one.address().port}/api/battle-maps/${m.id}/files/${m.files.exterior}?size=native`)).arrayBuffer());
    const f2 = Buffer.from(await (await fetch(`${other}/files/${m.files.exterior}?size=native`)).arrayBuffer());
    assert.ok(f1.equals(f2), "the same pixels from either server");
    assert.equal((await fetch(`${other.replace(/\.r[A-Za-z0-9_-]+$/, ".rnotarequest")}`)).status, 404);
  } finally { one.close(); two.close(); rmSync(a, { recursive: true, force: true }); rmSync(b, { recursive: true, force: true }); }
});

test("deployable on Vercel: one function for /api, the page as static files, the world data bundled", () => {
  const config = JSON.parse(read("vercel.json"));
  assert.equal(config.outputDirectory, "webapp/public");
  assert.deepEqual(config.rewrites[0], { source: "/api/:path*", destination: "/api/map-server" });
  assert.match(config.functions["api/map-server.mjs"].includeFiles, /data\/\*\*/);
  assert.match(read("api/map-server.mjs"), /createMapHandler/);
  assert.match(read("scripts/cluster-map-app.mjs"), /size=native/);
});

test("module preview: the server serves the module's own files at Foundry's paths, and only those", async () => {
  const cacheDir = mkdtempSync(join(tmpdir(), "eym-preview-")), server = createMapServer({ asset, cacheDir });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`, get = (p) => fetch(base + p, { redirect: "manual" });
  try {
    const manifest = await (await get("/modules/eym-planet-map/module.json")).json();
    assert.equal(manifest.id, "eym-planet-map");
    // Everything the manifest loads, the template and the data the module fetches are there, byte for byte.
    for (const path of [...manifest.esmodules, ...manifest.styles, "templates/cluster-map.hbs", "docs/system-orbital-distances.csv", "data/planet-cartography/abydos/eventide.json"]) {
      const res = await get(`/modules/eym-planet-map/${path}`); assert.equal(res.status, 200, path);
      assert.equal(await res.text(), read(path), `${path} is the module's own file`);
    }
    for (const path of ["/modules/eym-planet-map/package.json", "/modules/eym-planet-map/tests/eym-webapp.test.mjs", "/modules/eym-planet-map/webapp/server.mjs", "/modules/eym-planet-map/scripts/../package.json", "/modules/other/module.json"]) assert.equal((await get(path)).status, 404, path);
    assert.equal((await get("/module/")).status, 302);
    const page = await (await get("/module/index.html")).text();
    assert.match(page, /<base href="\/">/, "the module fetches its data relative to the site root, as in Foundry");
    assert.equal((await get("/module/foundry-shim.js")).status, 200); assert.equal((await get("/module/preview.css")).status, 200);
  } finally { server.close(); rmSync(cacheDir, { recursive: true, force: true }); }
});

test("module preview: the Foundry stand-in covers what the module uses, and Vercel routes the module's files", () => {
  const shim = read("webapp/public/module/foundry-shim.js"), config = JSON.parse(read("vercel.json"));
  for (const name of ["globalThis.Hooks", "globalThis.game", "globalThis.ui", "globalThis.foundry", "HandlebarsApplicationMixin", "DialogV2", "randomID", "localStorage"]) assert.ok(shim.includes(name), name);
  assert.ok(config.rewrites.some((r) => r.source === "/modules/:path*" && r.destination === "/api/map-server"));
  for (const dir of ["data", "docs", "scripts", "templates", "styles", "lang"]) assert.match(config.functions["api/map-server.mjs"].includeFiles, new RegExp(`${dir}/\\*\\*`));
});
