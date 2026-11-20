import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { EYM_LAYOUT, fromLocal, greatCircleKm } from "../scripts/eym-surface.mjs";
import { CAREN_GEOLOGY } from "../scripts/eym-tectonics.mjs";
import { attachGeology, elevationGrid } from "../scripts/cartography-asset.mjs";
import { OCEAN_FRACTION, TARGET_TOLERANCE, TECTONIC_SEEDS, buildTectonics, tectonicSourcesSha256 } from "../tools/generate-eym-tectonics.mjs";
import { WORLD_INPUTS } from "../scripts/eym-world-inputs.mjs";

const root = new URL("../", import.meta.url), read = (path) => readFileSync(new URL(path, root), "utf8");
const tect = JSON.parse(read("data/eym/tectonics.json")), asset = JSON.parse(read("data/planet-cartography/abydos/eventide.json"));
// Eym's geology is its own file beside the asset (scripts/cartography-asset.mjs).
attachGeology(asset, JSON.parse(read(`data/planet-cartography/abydos/${asset.geologyFile}`)));
const sha = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const convergent = [...tect.boundaries.trenches, ...tect.boundaries.collisions];
const nearestKm = (ll, list) => Math.min(...list.map((q) => greatCircleKm(ll, q)));

test("Caren, Garyk and the open-ocean archipelagos keep their coasts byte for byte (one archipelago moved whole, one taken into Khohalis)", () => {
  // The coasts as they were before the tectonic history (eym-surface-v1): authored, traced and seeded once.
  assert.equal(sha(asset.terrain.coastlines.filter((c) => c.continent === "Caren")), "6200884021edf3166e8c7cb6b209431b188bd6dd9a5706412f2504815c43bb5f");
  assert.equal(sha(asset.terrain.coastlines.filter((c) => c.continent === "Garyk")), "953d7b92cd342baab154888dcddb499306d0d2e91380f1da52b43f0dc1d837e0");
  // Eight of the ten ocean archipelagos are unchanged since eym-surface-v1. The sixth moved on 17 November 2026
  // (the owner's decision), from 8.8°N 152.4°E, where Gaffa now stands, to 8.8°N 39°E: same islands, new place.
  // The fourth (36.4°N 115.2°E) lies where Khohalis grew to (canon of 19 November 2026: Eym about 80% water) and is
  // part of that continent now: its five islands are no longer coasts of their own. The hash below is of the other
  // eight, and is the same in the world before the growth (where, with the fourth, they hashed to f527012d…).
  const archipelagos = asset.terrain.coastlines.filter((c) => !c.continent), sixth = (c) => c.id.startsWith("archipelago-6-");
  assert.equal(archipelagos.filter((c) => c.id.startsWith("archipelago-4-")).length, 0);
  assert.deepEqual(JSON.parse(read("data/eym/growth.json")).accreted.map((a) => [a.archipelago, a.into]), [[4, "Khohalis"]]);
  assert.equal(sha(archipelagos.filter((c) => !sixth(c))), "14f9038579aa196822c036396695d85f126dcd21ec552fd23bb909c71532189c");
  assert.equal(sha(archipelagos.filter(sixth)), "935b202ae9719d528c713d8b2a931f410e1b6bdfc48de65ecba8d4209d1dcc50");
});

test("Gaffa, Khohalis and Demani meet their targets, each centred on its own land", () => {
  for (const spec of EYM_LAYOUT.seeded) {
    const c = tect.continents[spec.id];
    assert.ok(Math.abs(c.mainlandAreaKm2 / spec.areaKm2 - 1) <= TARGET_TOLERANCE.areaFraction, `${spec.id} area`);
    assert.ok(greatCircleKm(c.centroid, spec.center) / 111.2 <= TARGET_TOLERANCE.centerDeg, `${spec.id} centre`);
    assert.deepEqual(c.center, spec.center);
    assert.ok(c.driftMmYr > 5 && c.driftMmYr < 100, `${spec.id} drifts at a believable speed`);
  }
});

test("Eym is about 80% ocean, as its canon says, and was 98.6% before its far continents were grown", () => {
  // The plate fit still aims at the 98.6% world (its continents are the cores the land was grown from)...
  const growth = JSON.parse(read("data/eym/growth.json")), [low, high] = WORLD_INPUTS.growth.oceanFraction;
  assert.ok(growth.oceanFractionBefore >= OCEAN_FRACTION[0] && growth.oceanFractionBefore <= OCEAN_FRACTION[1], String(growth.oceanFractionBefore));
  // ...and the grown world is the canon's (counted on the 1° map, which is a little coarser than the outlines).
  assert.ok(growth.oceanFraction >= low && growth.oceanFraction <= high, String(growth.oceanFraction));
  assert.ok(asset.terrain.realizedWaterFraction >= low - 0.004 && asset.terrain.realizedWaterFraction <= high + 0.004, String(asset.terrain.realizedWaterFraction));
});

test("the tectonic history is up to date with what it is made from (npm run build would not change it)", () => {
  assert.equal(tect.sourcesSha256, tectonicSourcesSha256());
});

test("the seed kept is the first in the fixed list that meets every target", () => {
  const index = TECTONIC_SEEDS.indexOf(tect.seed);
  assert.ok(index >= 0);
  assert.deepEqual(tect.seedsTried, TECTONIC_SEEDS.slice(0, index + 1));
  assert.ok(tect.report.tried.slice(0, -1).every((t) => !t.ok && t.failures.length) && tect.report.tried.at(-1).ok);
});

test("drawn by rule: the kept seed gives the same plates, continents and volcanoes again", () => {
  const again = buildTectonics({ seeds: [tect.seed], archipelagoCenters: EYM_LAYOUT.archipelagos.centers });
  for (const key of ["plates", "continents", "volcanoes", "rasters", "boundaries", "firstLand", "garyk"]) assert.deepEqual(again[key], tect[key], key);
});

test("plates: eight to twelve major plates and some microplates, each boundary convergent, divergent or transform", () => {
  const major = tect.plates.filter((p) => !p.micro), micro = tect.plates.filter((p) => p.micro);
  assert.ok(major.length >= 8 && major.length <= 12 && micro.length > 0);
  assert.ok(tect.plates.every((p) => p.speedMmYrAtSeed < 120), "no plate moves faster than about 12 cm a year");
  assert.deepEqual(Object.keys(tect.boundaries.counts).sort(), ["convergent", "divergent", "transform"]);
  assert.ok(Object.values(tect.boundaries.counts).every((n) => n > 100));
});

test("mountains lie on convergent edges: each continent's coastal ranges, and Garyk's high ranges", () => {
  for (const c of Object.values(tect.continents)) for (const r of c.ridges.filter((x) => x.origin === "subduction")) {
    const far = Math.max(...r.points.map(([x, y]) => nearestKm(fromLocal(c.center, x, y), convergent)));
    assert.ok(far < 350, `${c.id} ${r.kind}: ${Math.round(far)} km from a convergent edge`);
  }
  assert.ok(Object.values(tect.continents).every((c) => c.ridges.some((r) => r.origin === "subduction")), "every continent has an active margin");
  assert.ok(nearestKm(tect.garyk.rangeAxis.centre, convergent) < 350, "Garyk's ranges stand on its convergent edge");
  assert.equal(tect.garyk.convergentWith, "garyk-north");
});

test("volcanoes stand at subduction margins and hotspots, each with an age and activity; none on Caren", () => {
  assert.ok(tect.volcanoes.length > 20);
  for (const v of tect.volcanoes) {
    assert.ok(["subduction", "hotspot"].includes(v.setting) && ["active", "dormant", "extinct"].includes(v.activity) && v.ageMyr >= 0);
    if (v.setting === "subduction") assert.ok(nearestKm(v.at, convergent) < 250, `volcano at ${v.at} is ${Math.round(nearestKm(v.at, convergent))} km from a convergent edge`);
    if (v.setting === "subduction") assert.notEqual(v.plate, "caren", "no subduction on Caren's plate");
  }
  // None on Caren itself (a hotspot may stand on the sea floor of its plate, far from its coast).
  const carenCoast = asset.terrain.coastlines.filter((c) => c.continent === "Caren").flatMap((c) => c.points.filter((_, i) => i % 10 === 0));
  assert.ok(tect.volcanoes.every((v) => nearestKm(v.at, carenCoast) > 300));
  assert.ok(tect.volcanoes.some((v) => v.setting === "hotspot"));
});

test("Caren is masked out: its geology is stated, not simulated; elsewhere bedrock follows the plates", () => {
  assert.equal(tect.caren.summary, CAREN_GEOLOGY.summary);
  assert.equal(asset.geology.caren.summary, CAREN_GEOLOGY.summary);
  const kinds = asset.raster.bedrock.categories, values = [...Buffer.from(asset.raster.bedrock.valuesBase64, "base64")].map((i) => kinds[i]);
  for (const kind of ["godstone-granite", "granite-gneiss", "volcanic", "metamorphic", "sandstone-shale"]) assert.ok(values.includes(kind), kind);
  assert.ok(asset.geology.history.some((h) => h.stage === "break-up") && asset.geology.history.some((h) => h.stage === "Caren"));
  // Garyk formed naturally: an old core under its interior and a collision belt along its convergent edge.
  const garyk = values.filter((_, i) => { const lat = -89.5 + Math.floor(i / 360), lon = -179.5 + (i % 360); return lon > -105 && lon < -55 && lat > 0 && lat < 30; });
  assert.ok(garyk.filter((k) => k === "granite-gneiss").length >= 10 && garyk.filter((k) => k === "metamorphic").length >= 20);
  assert.ok(!values.some((k, i) => ["godstone-granite", "marble", "caren-limestone"].includes(k) && Math.abs(-179.5 + (i % 360)) > 20), "Caren's stated rock is Caren's alone");
});

test("the mantle: plate speeds follow their drivers; plumes rise on the upwellings' margins and leave age-ordered seamount chains", () => {
  // Plates pulled by a sinking slab (a tenth of their edge or more) move at 5-10 cm a year; plates without, at 1-3.
  // Caren's plate (the gods') and Garyk's are exempt; Gaffa, Khohalis and Demani have no slab and ride slowly.
  for (const s of tect.report.plateSpeeds) {
    assert.ok(s.withinTarget, `${s.id}: ${s.speedMmYr} mm/yr, ${s.driver}`);
    if (s.driver === "slab") assert.ok(s.slabShare >= 0.1 && s.speedMmYr >= 49.5 && s.speedMmYr <= 100.5, JSON.stringify(s));
    if (s.driver === "no slab") assert.ok(s.slabShare < 0.1 && s.speedMmYr >= 9.5 && s.speedMmYr <= 30.5, JSON.stringify(s));
  }
  for (const id of ["eastern", "northern", "southern"]) assert.equal(tect.report.plateSpeeds.find((s) => s.id === id).driver, "no slab");
  assert.equal(tect.report.plateSpeeds.find((s) => s.id === "caren").driver, "exempt");
  // Two broad upwellings on opposite sides of the world; the First Land rifted inside one of them.
  const [a, b] = tect.mantle.upwellings, R = tect.mantle.radiusDeg;
  assert.ok(Math.abs(greatCircleKm(a, b) / 111.195 - 180) < 0.5 && R >= 25 && R <= 45);
  const fromAxis = (ll) => { const d = greatCircleKm(ll, a) / 111.195; return Math.min(d, 180 - d); };
  assert.ok(fromAxis(tect.firstLand.centre) <= R - 8, "the First Land rifted above an upwelling");
  // Every hotspot stands on an upwelling's margin, at an open-sea archipelago, both upwellings having some.
  const hotspots = tect.volcanoes.filter((v) => v.setting === "hotspot"), archipelagos = EYM_LAYOUT.archipelagos.centers;
  assert.ok(hotspots.length >= 3);
  for (const h of hotspots) { assert.ok(Math.abs(fromAxis(h.at) - R) <= 7, `hotspot ${h.at} is ${fromAxis(h.at).toFixed(1)}° from the axis`); assert.ok(archipelagos.some((c) => c[0] === h.at[0] && c[1] === h.at[1])); }
  assert.equal(new Set(hotspots.map((h) => greatCircleKm(h.at, a) < greatCircleKm(h.at, b))).size, 2);
  // Each chain runs away from its plume, older and deeper the farther it goes.
  assert.equal(tect.mantle.chains.length, hotspots.length);
  for (const c of tect.mantle.chains) {
    assert.ok(c.seamounts.length >= 3, `chain at ${c.hotspot}`);
    for (let i = 1; i < c.seamounts.length; i += 1) {
      const [p, q] = [c.seamounts[i - 1], c.seamounts[i]];
      assert.ok(q.ageMyr > p.ageMyr && q.summitDepthM < p.summitDepthM && greatCircleKm(q.at, c.hotspot) > greatCircleKm(p.at, c.hotspot));
    }
  }
  // The history says why; the asset carries the chains, and the sea floor rises over them.
  for (const stage of ["mantle", "hotspots"]) assert.ok(asset.geology.history.some((h) => h.stage === stage), stage);
  assert.equal(asset.geology.mantle.chains.length, hotspots.length);
});

test("the sea floor: trenches deeper than the abyss, ridges shallower, shelves wider on rifted coasts", () => {
  const mesh = [...elevationGrid(asset)], ocean = [...Buffer.from(asset.raster.oceanMaskBase64, "base64")];
  const deep = mesh.filter((e, i) => ocean[i]);
  assert.ok(Math.min(...deep) < -7000, "trenches");
  assert.ok(deep.filter((e) => e > -3000 && e < -1500).length > 200, "ridges and slopes");
});

test("globe fixes: sea ice is not cloud white; highs and lows have their own layer, off by default; serif names that give way", () => {
  const globe = read("scripts/eym-globe-pixels.mjs"), core = read("scripts/body-view-core.mjs"), css = read("styles/body-map.css"), template = read("templates/cluster-map.hbs");
  assert.match(globe, /ice: ramp\("#5f8e9c"/);
  assert.match(core, /\["clouds", "storms", "centres", "wind"\]/); assert.match(core, /this\.weatherGroups\.centres\.classList\.add\("is-hidden"\)/);
  assert.ok(template.includes('<input type="checkbox" data-body-layer="weather-centres"> Highs &amp; lows'));
  assert.match(css, /\.oscm-cartography-label \{[^}]*font-family: var\(--oscm-serif/);
  assert.match(core, /#hideOverlappingLabels\(\)/);
});
