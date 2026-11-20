import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NEUTRAL_LIGHT, foliageSeason, normalizeSeason } from "../scripts/eym-battle-season.mjs";
import { buildBattleMap } from "../scripts/eym-battle-rules.mjs";
import { buildInteriors } from "../scripts/eym-battle-interiors.mjs";
import { LIGHT_KINDS, battleLights, battleScenePlan } from "../scripts/eym-battle-scene.mjs";
import { battleArtDirection, battleSceneData } from "../scripts/eym-battle-render.mjs";
import { battleMapSpec } from "../scripts/eym-map-presets.mjs";
import { fromLocal } from "../scripts/eym-surface.mjs";
import { renderBattleLayers } from "../webapp/render/render-battle.mjs";
import { occlusionMask } from "../webapp/render/light.mjs";
import { parseRequest } from "../webapp/server.mjs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const asset = JSON.parse(read("data/planet-cartography/mitkear/eym.json"));
const at = (n, dx, dy) => { const s = asset.settlements.find((x) => x.properName === n); return fromLocal([s.lat, s.lon], dx, dy); };
const spec = battleMapSpec({ size: "custom", columns: 14, rows: 12, density: "custom", gridPx: 70 });
const city = buildBattleMap(asset, { center: at("Lyla", 0.2, 0.15), spec }), interiors = buildInteriors(city);

test("seasons by hemisphere; the tropics stay evergreen", () => {
  assert.equal(foliageSeason(50, 0.6), "autumn"); assert.equal(foliageSeason(-50, 0.6), "spring"); assert.equal(foliageSeason(5, 0.6), "tropical");
  assert.equal(normalizeSeason("bogus", 50), "summer"); assert.equal(normalizeSeason(undefined, 3), "tropical");
});

test("the art carries no time of day: the same map renders the same whatever the hour; only the season changes it", () => {
  const sha = (fb) => createHash("sha256").update(fb.data).digest("hex");
  const a = renderBattleLayers(city, interiors, { season: "summer" }), b = renderBattleLayers(city, interiors, { season: "summer" }), c = renderBattleLayers(city, interiors, { season: "winter" });
  assert.equal(sha(a.exterior), sha(b.exterior)); assert.notEqual(sha(a.exterior), sha(c.exterior));
  assert.ok(!/lighting|sunAltitude|gradeLayer/.test(read("webapp/render/render-battle.mjs")), "no sun or time-of-day grading in the renderer");
  assert.ok(!("lighting" in parseRequest({ center: city.center, columns: 14, rows: 12, gridPx: 70 })));
});

test("objects keep the shadows they make of themselves: at the foot of buildings and under tree crowns", () => {
  const P = 35, mask = occlusionMask(city, P), W = 14 * P;
  const b = city.buildings.find((x) => x.x0 >= 1 && x.x1 <= 12 && x.y1 <= 10);
  let edge = 0; for (let x = b.x0 * P; x < (b.x1 + 1) * P; x += 1) if (mask[((b.y1 + 1) * P + 1) * W + x]) edge += 1;
  assert.ok(edge > 0, "a contact shadow along the foot of a wall");
  const forest = buildBattleMap(asset, { center: at("Bostain", -2.2, -1.8), spec }), fm = occlusionMask(forest, P), tree = forest.objects.find((o) => o.kind === "tree" && o.x > 2 && o.x < 12 && o.y > 2 && o.y < 10);
  assert.equal(fm[Math.round(tree.y * P) * W + Math.round(tree.x * P)], 2, "shade beneath the crown");
});

test("lamps are Foundry lights on their floors: lanterns, candles and windows come on as it darkens; fires and hearths always burn", () => {
  const lights = battleLights(city, interiors);
  const kinds = new Set(lights.map((l) => l.flags["eym-planet-map"].light));
  for (const k of ["lantern", "candle", "window"]) assert.ok(kinds.has(k), k);
  for (const l of lights.filter((x) => ["lantern", "candle", "window"].includes(x.flags["eym-planet-map"].light))) assert.ok(l.config.darkness.min >= 0.4, "switch on only in the dark");
  assert.equal(LIGHT_KINDS.hearth.darkness.min, 0); assert.equal(LIGHT_KINDS.fire.darkness.min, 0);
  assert.ok(lights.some((l) => l.levelKeys[0] === "floor1") && lights.some((l) => l.levelKeys[0] === "floor-1"), "candles upstairs, lamps in the cellars");
  const plan = battleScenePlan(city, interiors, { name: "x", images: { ground: "g", roofs: {}, floors: {} } });
  assert.ok(plan.lights.length > 20 && plan.lights.every((l) => ["floor-1", "floor0", "floor1"].includes(l.levelKeys[0])));
  assert.ok(battleSceneData(city, { name: "x", imagePath: "x" }).lights.length > 0, "the single-image scene gets its outdoor lights too");
  assert.match(read("scripts/cluster-map-app.mjs"), /createEmbeddedDocuments\?\.\("AmbientLight"/);
});

test("the painter is told to paint neutral light and only object shadows", () => {
  const prompt = battleArtDirection(city, { season: "autumn" });
  assert.ok(prompt.includes(NEUTRAL_LIGHT)); assert.match(prompt, /no cast sun shadows/); assert.match(prompt, /autumn colours/);
  assert.ok(!/Soft shadows fall toward the lower right/.test(prompt));
});
