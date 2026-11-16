import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBattleMap } from "../scripts/eym-battle-rules.mjs";
import { FEATURES } from "../scripts/eym-battle-settings.mjs";
import { PERSPECTIVE_RULE, battleArtDirection, battleReferenceSvg } from "../scripts/eym-battle-render.mjs";
import { obliqueBuilding, obliqueFaces, obliqueTree, shade, standHeightFt } from "../scripts/eym-battle-oblique.mjs";
import { buildInteriors, floorPlanSvg, interiorArtDirection } from "../scripts/eym-battle-interiors.mjs";
import { artDirection } from "../scripts/eym-map-packet.mjs";
import { battleMapSpec } from "../scripts/eym-map-presets.mjs";
import { fromLocal } from "../scripts/eym-surface.mjs";

const asset = JSON.parse(readFileSync(new URL("../data/planet-cartography/abydos/eventide.json", import.meta.url), "utf8"));
const at = (n, dx, dy) => { const s = asset.settlements.find((x) => x.properName === n); return fromLocal([s.lat, s.lon], dx, dy); };

test("buildings stand inside their footprint: roof to the north, a front wall with windows and door to the south", () => {
  const svg = obliqueBuilding({ x0: 2, y0: 3, x1: 5, y1: 6, door: "s", storeys: 2, label: "house" }, 24, 30);
  const rects = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map((m) => m.slice(1).map(Number));
  for (const [x, y, w, h] of rects) { assert.ok(x >= 1.9 && x + w <= 6.11, "inside the footprint across"); assert.ok(y >= 3 - 1e-9 && y + h <= 7 + 1e-9, "inside the footprint down"); }
  assert.match(svg, /fill="#7fb6d6"/, "windows on the front");
  assert.match(svg, /fill="#d9b77a"/, "the door on the front");
});

test("tall things rise above their base; lighter tops, darker south sides; faces where the ground steps down", () => {
  const tree = obliqueTree({ x: 5, y: 10, size: 1 });
  const crown = Number(/<circle cx="5.00" cy="([\d.]+)" r="1.00"/.exec(tree)[1]);
  assert.ok(crown < 10 - 1, "the crown stands above the trunk's base");
  assert.equal(shade("#808080", -0.5), "#404040"); assert.equal(shade("#808080", 0.5), "#c0c0c0");
  assert.equal(standHeightFt("pool", FEATURES.pool), 0, "water lies flat");
  assert.ok(standHeightFt("watchtower", FEATURES.watchtower) >= 20);
  const g = { columns: 2, rows: 3, levelFt: Int16Array.from([20, 20, 0, 0, 0, 0]), void: new Uint8Array(6), ramp: new Uint8Array(6), move: new Array(6).fill("normal"), water: new Uint8Array(6) };
  assert.equal(obliqueFaces(g).length, 2, "a south-facing cliff shows its face");
});

test("the painter's reference and every prompt ask for three-quarter view, never flat symbols", () => {
  const map = buildBattleMap(asset, { center: at("Lyle", 0.2, 0.15), spec: battleMapSpec() });
  const ref = battleReferenceSvg(map, 10);
  assert.match(ref, /fill="#5a3d24"/, "tree trunks are drawn"); assert.match(ref, /fill="#7fb6d6"/, "building fronts with windows");
  const prompt = battleArtDirection(map);
  assert.match(prompt, /three-quarter top-down \(oblique\) perspective/); assert.match(prompt, /nothing is flat/); assert.ok(prompt.includes(PERSPECTIVE_RULE));
  const interiors = buildInteriors(map);
  assert.match(interiorArtDirection(map, interiors, 0), /back \(north\) wall shows its face/);
  assert.match(floorPlanSvg(interiors[0], 0), /height="0\.42"/, "rooms' back walls have height");
  assert.match(artDirection({ spec: { level: "region", widthPx: 1536, heightPx: 1024 }, frame: { center: [0, 0], kmPerPx: 0.3, W: 1536, level: "region" }, cover: [{ words: "forest" }] }), /three-quarter view/);
});

test("less blocky: corners cut at 45° where grounds meet, hipped roofs, curving cliff lines, round things in stepped circles", async () => {
  const { chamferCorners } = await import("../scripts/eym-battle-render.mjs");
  // A 3×3 of grass with water filling the top-left corner region: the centre square gets its corner cut.
  const col = ["w", "w", "g", "w", "g", "g", "g", "g", "g"];
  assert.deepEqual(chamferCorners(col, 3, 3).filter(([x, y]) => x === 1 && y === 1), [[1, 1, [1, 1, "w"]]]);
  assert.match(obliqueBuilding({ x0: 0, y0: 0, x1: 4, y1: 3, door: "s", storeys: 1, label: "house" }, 24, 30), /L2\.00 1\.12 L2\.00 1\.12|L(\d\.\d\d) (\d\.\d\d) L\1 \2|<path d="M0 0 L5 0 L/, "a hipped roof");
  const canyon = buildBattleMap(asset, { center: at("Bostain", -2.2, -1.8), spec: battleMapSpec(), setting: "canyon-city" });
  const g = canyon.grid, C = g.columns, edgeRow = (x, lvl) => { for (let y = 0; y < g.rows; y += 1) if (g.levelFt[y * C + x] === lvl && !g.ramp[y * C + x]) return y; return -1; };
  const rowsAt = new Set(Array.from({ length: C }, (_, x) => edgeRow(x, 40)).filter((v) => v >= 0));
  assert.ok(rowsAt.size >= 2, "a cliff line steps along its length, not one straight row");
  assert.ok(canyon.routes.length >= 2);
  const grove = buildBattleMap(asset, { center: at("Bostain", -2.2, -1.8), spec: battleMapSpec(), setting: "treetop-city" });
  for (const t of grove.features.filter((f) => f.kind === "giant-trunk")) assert.equal(t.squares.length, 5, "a 3×3 trunk without its corners");
});

test("atlas reference maps draw relief, forests and settlements in three-quarter view, text-free", async () => {
  const { buildReferenceMap } = await import("../scripts/eym-reference-map.mjs");
  const { atlasMapSpec } = await import("../scripts/eym-map-presets.mjs");
  const caren = buildReferenceMap(asset, atlasMapSpec({ level: "continent" }), { continentId: "caren" });
  assert.match(caren.baseSvg, /fill="#b8a283"/, "mountains with a lit face"); assert.match(caren.baseSvg, /fill="#6f5a45"/, "and a shaded face");
  assert.match(caren.baseSvg, /fill="#4a3220"/, "trees with trunks"); assert.match(caren.baseSvg, /fill="#e8dcc0"/, "houses with front walls");
  assert.ok(!/<text/.test(caren.baseSvg));
  assert.equal(buildReferenceMap(asset, atlasMapSpec({ level: "continent" }), { continentId: "caren" }).baseSvg, caren.baseSvg, "deterministic");
});
