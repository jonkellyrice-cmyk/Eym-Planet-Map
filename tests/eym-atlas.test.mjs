import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ATLAS_IMAGE_PRESETS, BATTLE_SIZE_PRESETS, GRID_DENSITY_PRESETS, atlasMapSpec, battleMapSpec } from "../scripts/eym-map-presets.mjs";
import { buildReferenceMap, referenceFrame, referenceRingPaths } from "../scripts/eym-reference-map.mjs";
import { mapPacket } from "../scripts/eym-map-packet.mjs";
import { MAP_SETTING_KEYS, registerMapPresetSettings, savedMapDefaults } from "../scripts/eym-map-settings.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const asset = JSON.parse(read("data/planet-cartography/abydos/eventide.json"));
const bostain = asset.settlements.find((s) => s.properName === "Bostain");

test("battle-map presets follow published standards and resolve to exact sizes", () => {
  assert.deepEqual(GRID_DENSITY_PRESETS.map((p) => p.px), [100, 140, 200, 70]);
  assert.deepEqual(BATTLE_SIZE_PRESETS.find((p) => p.id === "flip-mat"), { id: "flip-mat", label: "Flip-Mat (24×30)", columns: 24, rows: 30, source: BATTLE_SIZE_PRESETS[0].source });
  const spec = battleMapSpec();
  assert.equal(spec.summary, "24×30 squares · 3360×4200 px · 120×150 ft");
  assert.equal(battleMapSpec({ orientation: "landscape" }).columns, 30);
  assert.equal(battleMapSpec({ density: "custom", gridPx: 20 }).gridPx, 50, "Foundry's 50 px minimum");
  assert.equal(battleMapSpec({ size: "custom", columns: 33, rows: 21 }).summary, "33×21 squares · 4620×2940 px · 165×105 ft");
});

test("atlas presets: model-native sizes, levels by ground covered", () => {
  assert.ok(ATLAS_IMAGE_PRESETS.some((p) => p.width === 1536 && p.height === 1024));
  assert.equal(atlasMapSpec({ level: "region" }).acrossMiles, 300);
  assert.match(atlasMapSpec({ level: "local" }).summary, /^25 mi across · 1536×1024 px · 86 ft per px$/);
  assert.equal(atlasMapSpec({ level: "region", acrossMiles: 120, image: "custom", width: 2000, height: 1000 }).summary, "120 mi across · 2000×1000 px · 317 ft per px");
});

test("reference maps at every level: deterministic, text-free base, names on their own layer", () => {
  const jobs = [[atlasMapSpec({ level: "planet", image: "planet-2to1" }), {}], [atlasMapSpec({ level: "continent" }), { continentId: "caren" }], [atlasMapSpec({ level: "region" }), { center: [bostain.lat, bostain.lon] }], [atlasMapSpec({ level: "local" }), { center: [bostain.lat, bostain.lon] }]];
  for (const [spec, options] of jobs) {
    const a = buildReferenceMap(asset, spec, { ...options, title: "T" }), b = buildReferenceMap(asset, spec, { ...options, title: "T" });
    assert.equal(a.baseSvg, b.baseSvg, spec.level);
    assert.ok(!/<text/.test(a.baseSvg), `${spec.level}: the base map carries no text`);
    assert.match(a.baseSvg, new RegExp(`width="${spec.widthPx}" height="${spec.heightPx}"`));
    assert.ok(/fill="#8ea66a"/.test(a.baseSvg), `${spec.level}: land is drawn`);
  }
  const caren = buildReferenceMap(asset, atlasMapSpec({ level: "continent" }), { continentId: "caren" });
  for (const name of ["Bostain", "Molkath Confederation", "Lake Sile"]) assert.ok(caren.features.some((f) => f.name === name), name);
  const region = buildReferenceMap(asset, atlasMapSpec({ level: "region" }), { center: [bostain.lat, bostain.lon] });
  assert.ok(region.features.some((f) => f.name === "Bostain") && /Bostain/.test(region.labelSvg));
});

test("a small map inside a continent still shows the land around it", () => {
  const local = buildReferenceMap(asset, atlasMapSpec({ level: "local" }), { center: [bostain.lat, bostain.lon] });
  assert.match(local.baseSvg, /<path d="M[^"]+" fill="#8ea66a"/);
});

test("the packet says what the map shows and tells the image model to keep everything in place, with no text", () => {
  const spec = atlasMapSpec({ level: "continent" }), map = buildReferenceMap(asset, spec, { continentId: "caren" });
  const packet = mapPacket({ asset, spec, frame: map.frame, features: map.features, title: "Caren" });
  assert.match(packet.prompt, /structurally authoritative/);
  assert.match(packet.prompt, /Draw no text/);
  assert.match(packet.prompt, /1536×1024 pixels/);
  assert.match(packet.markdown, /\*\*Bostain\*\* \(capital\)/);
  assert.ok(packet.cover.length > 0 && Math.abs(packet.cover.reduce((s, c) => s + c.share, 0) - 1) < 1e-9);
});

test("the defaults are Foundry settings, each a preset or custom, and the app offers the atlas", () => {
  const registered = new Map();
  globalThis.game = { settings: { register: (module, key, data) => registered.set(key, data), get: (module, key) => registered.get(key).default } };
  try {
    registerMapPresetSettings("eym-planet-map");
    assert.deepEqual([...registered.keys()], MAP_SETTING_KEYS);
    assert.equal(registered.get("battleGridDensity").default, "fa-140");
    assert.ok("custom" in registered.get("battleSize").choices);
    assert.deepEqual(savedMapDefaults("eym-planet-map").battle, { density: "fa-140", size: "flip-mat", orientation: "auto" });
  } finally { delete globalThis.game; }
  const template = read("templates/cluster-map.hbs"), app = read("scripts/cluster-map-app.mjs");
  for (const token of ['name="atlasLevel"', 'name="atlasImage"', 'data-action="atlas-build"', 'data-action="atlas-copy-prompt"', 'data-action="atlas-download-base"']) assert.ok(template.includes(token), token);
  assert.match(app, /buildReferenceMap\(this\._eymGeography, spec/);
  assert.match(read("scripts/main.mjs"), /registerMapPresetSettings\(MODULE_ID\)/);
});

// ---------------------------------------------------------------- the whole-world map and ±180° (land-growth scaling, Fix 3)

test("on the whole-world map, land across ±180° is filled as two closed pieces and outlined without a line across", () => {
  const spec = atlasMapSpec({ level: "planet", image: "planet-2to1" }), frame = referenceFrame({}, spec), W = frame.W;
  const numbers = (d) => d.split(/(?=[MLZ])/).map((c) => c.trim()).filter((c) => c && c !== "Z").map((c) => c.slice(1).trim().split(/[ ,]+/).map(Number));
  const subpaths = (d) => d.split("M").filter(Boolean).map((part) => ({ closed: part.trim().endsWith("Z"), points: numbers(`M${part}`) }));
  const astride = [[-30, 150], [-34, -160], [0, -140], [35, -155], [40, 160]], { outline, area } = referenceRingPaths(frame, astride);
  // The area: two closed pieces, one at each edge of the map, neither reaching across it.
  const pieces = subpaths(area); assert.equal(pieces.length, 2); assert.ok(pieces.every((piece) => piece.closed));
  const spans = pieces.map((piece) => { const xs = piece.points.map((q) => q[0]); return [Math.min(...xs), Math.max(...xs)]; }).sort((a, b) => a[0] - b[0]);
  assert.ok(spans[0][0] === 0 && spans[0][1] < W * 0.15, "a piece at the western edge"); assert.ok(spans[1][1] === W && spans[1][0] > W * 0.85, "a piece at the eastern edge");
  // The outline: the same coast, broken at the seam, with no closing line and no step across the map.
  const lines = subpaths(outline); assert.ok(lines.length >= 2 && lines.every((line) => !line.closed));
  for (const line of lines) for (let i = 1; i < line.points.length; i += 1) assert.ok(Math.abs(line.points[i][0] - line.points[i - 1][0]) < W / 2);
  // A ring away from the seam is one closed path, the same for both.
  const plain = referenceRingPaths(frame, [[10, 10], [10, 30], [25, 20]]); assert.equal(plain.area, plain.outline); assert.ok(plain.area.endsWith("Z"));
});
