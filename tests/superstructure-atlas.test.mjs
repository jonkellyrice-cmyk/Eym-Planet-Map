import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { snapshotOperationalRich } from "../scripts/atlas-snapshot-v2.mjs";
import { buildArtificialBodyModel } from "../scripts/artificial-body-data.mjs";
import { buildNaturalBodyModel } from "../scripts/natural-body-data.mjs";
import { parseCsv } from "../scripts/system-data.mjs";
import { renderSuperstructureAtlas } from "../scripts/superstructure-atlas-visuals.mjs";
import { FACTION_GRAMMARS, SUPERSTRUCTURE_MODEL_VERSION } from "../scripts/superstructure-identities.mjs";
import { generateBodyOperationAsset, serializeAsset } from "../tools/generate-body-operations.mjs";

const ROOT = path.resolve(".");
const registry = parseCsv(fs.readFileSync(path.join(ROOT, "docs/system-orbital-distances.csv"), "utf8"));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "data/body-operations/manifest.json"), "utf8"));
const rowFor = (system, body) => registry.find((row) => row.system === system && row.object === body);
const assetFor = (system, body) => {
  const item = manifest.assets.find((candidate) => candidate.system === system && candidate.body === body);
  assert.ok(item, `missing body-operations manifest entry for ${system}/${body}`);
  const sourceText = fs.readFileSync(path.join(ROOT, item.path), "utf8");
  return { item, sourceText, asset: JSON.parse(sourceText) };
};

// The setting has no artificial superstructures, but the identity contract and renderer remain. These synthetic
// (non-canon) rows and identities have the same shape as the entries data/superstructure-identities.json carries.
const syntheticRow = (object, type, extra) => ({ system: "Synthetic", object, type, parent: "Synthetic", owner_faction: "Eym", ...extra });
const SYNTHETIC_ROWS = {
  anchorage: syntheticRow("Synthetic Anchorage", "major station", { structure_class: "orbital anchorage / port", dimensions_estimate: "~10-15 km principal span", population_crew_scale: "~10,000-30,000 permanent/transient", primary_function: "civilian docking, logistics, customs, local traffic control", strategic_role: "principal orbital interface", visual_archetype: "compact docking lattice / anchorage", visual_palette: "weathered metal / pale neutral / blue-green accents" }),
  watch: syntheticRow("Synthetic Watch Array", "installation array", { structure_class: "distributed watch/sensor-defense array", dimensions_estimate: "individual nodes ~1-3 km; network spans millions of km", population_crew_scale: "~1,000-10,000 distributed", primary_function: "sensor coverage, navigation warning, border watch, likely defensive support", strategic_role: "monitors approaches to a synthetic anomaly", visual_archetype: "sparse chain of watch stations", visual_palette: "weathered metal / pale neutral / blue-green accents" }),
};
const SYNTHETIC_PROFILES = {
  anchorage: { topology: "single-anchorage", scaleClass: "major-city-scale orbital anchorage", effectiveDimensions: "roughly 40–70 km principal inhabited/docking span", populationBand: "~0.5–2 million permanent and transient population", primaryAxis: "horizontal docking spine", symmetry: "functional bilateral tendency with asymmetric service growth", silhouetteFamily: "frontier-anchorage", massing: "compact inhabited core with elongated docking and logistics arms", signatureStructures: ["horizontal anchorage spine", "multiple heavy docking collars", "compact civic/logistics core"], interiorZones: ["port administration", "habitation districts", "cargo and customs", "repair yards", "traffic control", "Axiolith/power infrastructure"], circulationLogic: "central port concourses feeding radial/axial dock transit", visualCanonNotes: "Synthetic fixture: a compact practical anchorage." },
  watch: { topology: "distributed-watch-array", scaleClass: "distributed megacity-scale defense network", effectiveDimensions: "individual watch citadels roughly 20–50 km; network extends across a system-scale surveillance corridor", populationBand: "~1–5 million distributed residents, crews and support population", primaryAxis: "distributed chain along a synthetic anomaly boundary", symmetry: "network repetition rather than one-body symmetry", silhouetteFamily: "watch-citadel chain", massing: "multiple inhabited sensor-defense citadels with broad array planes and compact armored hubs", signatureStructures: ["repeating city-scale watch citadels", "sensor-array planes", "defense and docking hubs", "long distributed surveillance chain"], interiorZones: ["sensor and command precincts", "habitation districts", "defense batteries", "maintenance and docking districts", "Axiolith/power infrastructure"], circulationLogic: "local hub circulation within each citadel plus long-range shuttle/traffic links between nodes", visualCanonNotes: "Synthetic fixture: a chain of separate watch installations rather than one station." },
};
function syntheticIdentity(row, asset, profile) {
  const grammar = FACTION_GRAMMARS.frontier;
  return {
    schemaVersion: 1, modelVersion: SUPERSTRUCTURE_MODEL_VERSION, status: "accepted-working-canon", system: row.system, body: row.object,
    factionFamily: "frontier", factionLabel: grammar.label, canonicalType: row.type, operationalKind: asset.operationalKind,
    superstructureRule: "Every listed artificial body is a permanent-enough, strategically significant city-scale-or-larger superstructure with a large resident/working population; Axiolith reduces effective inertial/structural stress enough to make this scale practical.",
    ...profile, signatureStructures: [...profile.signatureStructures], interiorZones: [...profile.interiorZones],
    legacyRegistryDimensions: row.dimensions_estimate, legacyRegistryPopulation: row.population_crew_scale,
    factionDesignGrammar: grammar.designGrammar, materialLanguage: grammar.materialLanguage, factionInteriorLogic: grammar.interiorLogic, militaryLogic: grammar.militaryLogic,
    registryFunction: row.primary_function, registryStrategicRole: row.strategic_role, registryVisualArchetype: row.visual_archetype, registryPalette: row.visual_palette,
    axiolithRole: "distributed mass/inertia and structural-stress management integrated with primary power/drive architecture",
    mustPreserve: [profile.primaryAxis, profile.symmetry, profile.massing, ...profile.signatureStructures],
    prohibitedMisreadings: ["conventional small spacecraft/station scale", ...grammar.prohibited],
    provenance: "synthetic test fixture",
  };
}
// Mirrors buildArtificialBodyModel's superstructure branch, which only engages for profiled (canonical) bodies.
const withSuperstructure = (model, identity, asset) => ({ ...model, kind: asset.operationalKind, dimensions: identity.effectiveDimensions, visualArchetype: identity.silhouetteFamily, population: identity.populationBand, superstructure: identity });

function superstructureSnapshot(key) {
  const row = SYNTHETIC_ROWS[key];
  const asset = generateBodyOperationAsset(row);
  const sourceText = serializeAsset(asset);
  const identity = syntheticIdentity(row, asset, SYNTHETIC_PROFILES[key]);
  return snapshotOperationalRich(asset, withSuperstructure(buildArtificialBodyModel(row, asset), identity, asset), `synthetic/${key}.json`, sourceText);
}

// The renderer still supports every faction silhouette family; they are exercised with synthetic (non-canon) identities.
const FRAME = { x: -340, y: -260, width: 680, height: 520 };
const syntheticRender = (silhouetteFamily, factionFamily) => renderSuperstructureAtlas({ system: "Synthetic", body: silhouetteFamily, silhouetteFamily, factionFamily }, FRAME, { includeSectionalBand: false });

test("a synthetic frontier anchorage preserves its anchorage identity and cross-section contract", () => {
  const snapshot = superstructureSnapshot("anchorage");
  assert.match(snapshot.referenceSvg, /data-superstructure-family="frontier-anchorage"/);
  assert.match(snapshot.referenceSvg, /data-section-logic="true"/);
  assert.match(snapshot.referenceSvg, /data-operational-overlay="true"/);
  assert.match(snapshot.informationPacket, /SCALE=city-scale or larger inhabited superstructure/);
  assert.match(snapshot.informationPacket, /major-city-scale orbital anchorage/i);
  assert.match(snapshot.informationPacket, /CROSS_SECTION=/);
  assert.match(snapshot.informationPacket, /frontier eco-punk\/space-punk construction/i);
});

test("faction silhouettes remain structurally distinct", () => {
  const watch = superstructureSnapshot("watch");
  const anchorage = superstructureSnapshot("anchorage");
  assert.notEqual(watch.referenceSvg, anchorage.referenceSvg);
  const lantern = syntheticRender("conclave-lantern-spindle", "conclave");
  const crown = syntheticRender("accord-crown-spindle", "accords");
  const meridian = syntheticRender("mandate-concentric-meridian", "mandate");
  assert.match(lantern, /data-superstructure-family="conclave-lantern-spindle"/);
  assert.match(crown, /data-superstructure-family="accord-crown-spindle"/);
  assert.match(meridian, /data-superstructure-family="mandate-concentric-meridian"/);
  assert.notEqual(lantern, crown);
  assert.notEqual(crown, meridian);
});

test("distributed superstructures remain networks rather than generic single stations", () => {
  const watch = superstructureSnapshot("watch");
  assert.match(watch.informationPacket, /distributed megacity-scale defense network/i);
  assert.match(watch.informationPacket, /Topology: distributed-watch-array/);
  const single = syntheticRender("frontier-anchorage", "frontier");
  for (const [family, faction] of [["watch-citadel-chain", "frontier"], ["mandate-distributed-range", "mandate"], ["conclave-orbital-halo", "conclave"]]) {
    const rendered = syntheticRender(family, faction);
    assert.match(rendered, new RegExp(`data-superstructure-family="${family}"`));
    assert.notEqual(rendered.replace(/data-superstructure[^ >]*/g, ""), single.replace(/data-superstructure[^ >]*/g, ""), family);
  }
});

test("natural bodies remain outside the superstructure rendering and packet contract", () => {
  const row = rowFor("Mitkear", "Red Moon");
  assert.ok(row);
  const { item, sourceText, asset } = assetFor("Mitkear", "Red Moon");
  const snapshot = snapshotOperationalRich(asset, buildNaturalBodyModel(row), item.path, sourceText);
  assert.doesNotMatch(snapshot.referenceSvg, /data-superstructure=/);
  assert.doesNotMatch(snapshot.informationPacket, /Superstructure generation contract/);
  assert.doesNotMatch(snapshot.informationPacket, /SCALE=city-scale or larger/);
});
