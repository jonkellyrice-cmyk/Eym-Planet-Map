import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COVER, buildBattleSite, buildLocalTile, localDetailLayout, localDetailOverlaySvg, battleSiteSvg } from "../scripts/eym-local-detail.mjs";
import { battleMapSpec, atlasMapSpec } from "../scripts/eym-map-presets.mjs";
import { buildReferenceMap } from "../scripts/eym-reference-map.mjs";
import { fromLocal, toLocal } from "../scripts/eym-surface.mjs";

const asset = JSON.parse(readFileSync(new URL("../data/planet-cartography/abydos/eventide.json", import.meta.url), "utf8"));
const town = (name) => { const s = asset.settlements.find((x) => x.properName === name); return [s.lat, s.lon]; };
const share = (cover, kinds) => cover.reduce((n, v) => n + (kinds.includes(v) ? 1 : 0), 0) / cover.length;

test("a local tile is deterministic and shows a town with its fields, woods and streams", () => {
  const options = { center: town("Bostain"), sizeKm: 6, resolutionM: 40 };
  const a = buildLocalTile(asset, options), b = buildLocalTile(asset, options);
  assert.deepEqual(a.cover, b.cover);
  assert.deepEqual(a.streams.map((s) => s.local), b.streams.map((s) => s.local));
  assert.equal(a.cols, 150);
  assert.ok(share(a.cover, [COVER.built]) > 0.01, "the town is built up");
  assert.ok(share(a.cover, [COVER.farmland]) > 0.03, "fields around it");
  assert.ok(share(a.cover, [COVER.woods, COVER.scrub, COVER.meadow]) > 0.2, "country beyond");
  for (const s of a.streams) { assert.ok(s.local.length >= 4); assert.ok(s.widthM >= 1.5 && s.widthM <= 20); }
});

test("detail is pinned to the world: overlapping tiles agree where they overlap", () => {
  const center = town("Lyle"), shifted = fromLocal(center, 1.2, -0.8), res = 0.04;
  const a = buildLocalTile(asset, { center, sizeKm: 5, resolutionM: 40 }), b = buildLocalTile(asset, { center: shifted, sizeKm: 5, resolutionM: 40 });
  let same = 0, land = 0, total = 0;
  for (let r = 0; r < a.rows; r += 1) for (let c = 0; c < a.cols; c += 1) {
    const x = -2.5 + (c + 0.5) * res, y = 2.5 - (r + 0.5) * res, [bx, by] = toLocal(shifted, ...fromLocal(center, x, y));
    const cb = Math.floor((bx + 2.5) / res), rb = Math.floor((2.5 - by) / res); if (cb < 0 || rb < 0 || cb >= b.cols || rb >= b.rows) continue;
    const va = a.cover[r * a.cols + c], vb = b.cover[rb * b.cols + cb]; total += 1;
    if (va === vb) same += 1; if ((va === COVER.sea) === (vb === COVER.sea)) land += 1;
  }
  assert.ok(total > 5000);
  assert.ok(land / total > 0.99, `coast agrees (${land / total})`);
  assert.ok(same / total > 0.8, `cover agrees (${same / total})`);
});

test("a battle site: 5-ft squares, world-pinned objects, buildings only in built-up squares", () => {
  const spec = battleMapSpec(), center = fromLocal(town("Lyle"), 0.2, 0.15);
  const site = buildBattleSite(asset, { center, spec });
  assert.equal(site.squares.length, spec.columns * spec.rows);
  assert.deepEqual(site.squares, buildBattleSite(asset, { center, spec }).squares, "deterministic");
  for (const o of site.objects) { assert.ok(o.x >= 0 && o.y >= 0 && o.x < spec.columns && o.y < spec.rows, o.kind); if (o.kind === "building") assert.equal(site.squares[Math.floor(o.y) * spec.columns + Math.floor(o.x)], COVER.built); }
  assert.ok(site.objects.some((o) => o.kind === "building"), "a town has buildings");
  // Moved three squares east (same anchor): the same buildings, three squares further west.
  const moved = buildBattleSite(asset, { center: fromLocal(center, 3 * site.squareM / 1000, 0), spec });
  assert.deepEqual(moved.anchor, site.anchor);
  const key = (o, dx) => `${o.kind}|${(o.x + dx).toFixed(1)}|${o.y.toFixed(1)}`, before = new Set(site.objects.filter((o) => o.x > 4).map((o) => key(o, -3)));
  const kept = moved.objects.filter((o) => o.x < spec.columns - 4 && before.has(key(o, 0))).length;
  assert.ok(kept >= 0.8 * moved.objects.filter((o) => o.x < spec.columns - 4 && o.x > 1).length, `objects stay put (${kept})`);
  assert.match(battleSiteSvg(site, 10), new RegExp(`width="${spec.columns * 10}" height="${spec.rows * 10}"`));
});

test("the atlas's local level gets a bounded tile laid over its frame", () => {
  const spec = atlasMapSpec({ level: "local" }), map = buildReferenceMap(asset, spec, { center: town("Bostain") }), layout = localDetailLayout(map.frame);
  assert.ok(Math.abs(layout.sizeKm - spec.widthPx * map.frame.kmPerPx) < 1e-9);
  assert.ok(layout.sizeKm * 1000 / layout.resolutionM <= 1100);
  assert.ok(Math.abs(layout.x0 + layout.sizeKm / layout.resolutionM * 1000 * layout.scale / 2 - spec.widthPx / 2) < 1e-6, "centred");
  const tile = buildLocalTile(asset, { center: layout.center, sizeKm: 4, resolutionM: 50 });
  assert.match(localDetailOverlaySvg(tile, { ...layout, scale: 1 }, spec.widthPx, spec.heightPx), /^<svg[^>]+width="1536" height="1024"/);
  assert.match(read("scripts/cluster-map-app.mjs"), /buildLocalTile\(this\._eymGeography/);
});

function read(path) { return readFileSync(new URL(`../${path}`, import.meta.url), "utf8"); }
