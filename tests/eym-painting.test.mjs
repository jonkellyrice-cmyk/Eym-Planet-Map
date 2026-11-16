import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULT_IMAGE_BASE_URL, checkBaseUrl, editRequest, explainFailure, nearestModelSize, paintMap } from "../scripts/eym-image-provider.mjs";
import { activeCanon, canonAbove, canonEntry, canonFolder, canonFor, frameRecord, mergeCanon, parentCrop, textHash } from "../scripts/eym-canon.mjs";
import { PAINT_SETTING_KEYS, paintingSettings, registerPaintingSettings } from "../scripts/eym-paint-settings.mjs";
import { atlasMapSpec } from "../scripts/eym-map-presets.mjs";
import { buildReferenceMap } from "../scripts/eym-reference-map.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const asset = JSON.parse(read("data/planet-cartography/abydos/eventide.json"));
const bostain = asset.settlements.find((s) => s.properName === "Bostain"), at = [bostain.lat, bostain.lon];
const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });

test("requests go to the image-edit endpoint at a native size, with high input fidelity where supported", () => {
  assert.equal(nearestModelSize("gpt-image-1.5", 1536, 1024), "1536x1024");
  assert.equal(nearestModelSize("gpt-image-1.5", 3360, 4200), "1024x1536");
  assert.equal(nearestModelSize("gpt-image-1.5", 1100, 1000), "1024x1024");
  const request = editRequest({ prompt: "p", images: [{ blob: png, name: "r.png" }], width: 2048, height: 1024 });
  assert.equal(request.url, `${DEFAULT_IMAGE_BASE_URL}/images/edits`);
  assert.deepEqual(Object.fromEntries(request.fields), { model: "gpt-image-1.5", prompt: "p", size: "1536x1024", quality: "high", n: "1", output_format: "png", input_fidelity: "high" });
  assert.ok(!editRequest({ model: "gpt-image-2", prompt: "p", images: [{ blob: png }], width: 1, height: 1 }).fields.some(([k]) => k === "input_fidelity"));
  assert.throws(() => editRequest({ prompt: "p", images: [], width: 1, height: 1 }), /No reference image/);
});

test("the key goes only to https or a private address", () => {
  assert.equal(checkBaseUrl("").url, DEFAULT_IMAGE_BASE_URL);
  assert.ok(checkBaseUrl("http://192.168.1.20:8000/v1").ok);
  assert.ok(checkBaseUrl("http://localhost:7860/v1/").ok);
  assert.equal(checkBaseUrl("http://example.com/v1").ok, false);
  assert.equal(checkBaseUrl("not a url").ok, false);
});

test("painting: sends the key as a bearer token, decodes the image, explains failures without the key", async () => {
  const seen = [];
  const ok = async (url, init) => { seen.push({ url, init }); return { ok: true, json: async () => ({ data: [{ b64_json: Buffer.from("PNGDATA").toString("base64") }] }) }; };
  const result = await paintMap({ apiKey: "sk-secret", prompt: "paint", images: [{ blob: png, name: "reference.png" }, { blob: png, name: "parent.png" }], width: 1536, height: 1024 }, ok);
  assert.equal(seen[0].init.headers.Authorization, "Bearer sk-secret");
  assert.equal(seen[0].init.body.getAll("image[]").length, 2);
  assert.equal(await result.blob.text(), "PNGDATA");
  await assert.rejects(paintMap({ apiKey: "", prompt: "p", images: [{ blob: png }], width: 1, height: 1 }, ok), /No image API key/);
  const denied = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "Incorrect API key provided: sk-secret" } }) });
  await assert.rejects(paintMap({ apiKey: "sk-secret", prompt: "p", images: [{ blob: png }], width: 1, height: 1 }, denied), (error) => /rejected the API key/.test(error.message) && !error.message.includes("sk-secret"));
  assert.match(explainFailure(429, { error: { message: "quota" } }), /credit: quota/);
});

test("the canon keeps every painting; a new one of the same map supersedes the old", () => {
  const continent = buildReferenceMap(asset, atlasMapSpec({ level: "continent" }), { continentId: "caren" });
  const region = buildReferenceMap(asset, atlasMapSpec({ level: "region" }), { center: at });
  const local = buildReferenceMap(asset, atlasMapSpec({ level: "local" }), { center: at });
  const entry = (id, map, spec, extra = {}) => canonEntry({ id, title: id, spec, frame: map.frame, continentId: "caren", files: { painted: `${id}.png` }, model: "m", quality: "high", prompt: "p", referenceHash: textHash(map.baseSvg), createdAt: `2026-11-16T00:00:0${id.length % 10}Z`, ...extra });
  let list = mergeCanon([], entry("c1", continent, atlasMapSpec({ level: "continent" })));
  list = mergeCanon(list, entry("c2", continent, atlasMapSpec({ level: "continent" })));
  assert.equal(list.length, 2); assert.equal(list[0].supersededBy, "c2"); assert.deepEqual(activeCanon(list).map((e) => e.id), ["c2"]);
  list = mergeCanon(list, entry("reg", region, atlasMapSpec({ level: "region" })));
  assert.equal(canonFor(list, { level: "region", frame: frameRecord(region.frame) }).id, "reg");
  assert.equal(canonFor(list, { level: "region", frame: frameRecord(buildReferenceMap(asset, atlasMapSpec({ level: "region" }), { center: [at[0] + 2, at[1]] }).frame) }), null, "another place is another map");
  // The style reference for a local map is the nearest painted level above that covers it.
  const above = canonAbove(list, local.frame);
  assert.equal(above.entry.id, "reg");
  assert.ok(above.crop.x > 0 && above.crop.x + above.crop.w < region.frame.W && Math.abs(above.crop.w - 1536 * 25 / 300) < 15, JSON.stringify(above.crop));
  assert.equal(canonAbove(list, region.frame).entry.id, "c2");
  const planet = buildReferenceMap(asset, atlasMapSpec({ level: "planet", image: "planet-2to1" }), {});
  assert.ok(parentCrop(frameRecord(planet.frame), frameRecord(continent.frame)).w > 20);
  assert.equal(canonFolder("my-world"), "worlds/my-world/eym-maps");
});

test("the API key is client-scope and hidden; the canon is a world setting; players get no paint controls", () => {
  const registered = new Map(), values = new Map();
  globalThis.game = { settings: { register: (m, key, data) => registered.set(key, data), get: (m, key) => (values.has(key) ? values.get(key) : registered.get(key).default) } };
  try {
    registerPaintingSettings("eym-planet-map");
    assert.deepEqual([...registered.keys()], PAINT_SETTING_KEYS);
    assert.equal(registered.get("imageApiKey").scope, "client"); assert.equal(registered.get("imageApiKey").config, false);
    assert.equal(registered.get("imageBaseUrl").scope, "client");
    assert.equal(registered.get("canonMaps").scope, "world");
    for (const key of ["imageModel", "imageQuality"]) assert.equal(registered.get(key).restricted, true);
    values.set("imageApiKey", " sk-x "); values.set("imageModel", "custom"); values.set("imageModelCustom", "flux-local");
    assert.deepEqual(paintingSettings("eym-planet-map"), { apiKey: "sk-x", baseUrl: DEFAULT_IMAGE_BASE_URL, model: "flux-local", quality: "high" });
  } finally { delete globalThis.game; }
  const app = read("scripts/cluster-map-app.mjs"), template = read("templates/cluster-map.hbs");
  assert.match(app, /classList\.toggle\("is-player", !game\.user\?\.isGM\)/);
  assert.match(template, /oscm-atlas-paint oscm-gm-only/);
  assert.ok(!/console\.(log|info|debug)\([^)]*apiKey/.test(app), "the key is never logged");
  assert.match(read("scripts/main.mjs"), /registerPaintingSettings\(MODULE_ID\)/);
});
