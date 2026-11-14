import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { snapshotOperationalRich } from "../scripts/atlas-snapshot-v2.mjs";
import { buildArtificialBodyModel } from "../scripts/artificial-body-data.mjs";
import { FACTION_GRAMMARS, SUPERSTRUCTURE_MODEL_VERSION } from "../scripts/superstructure-identities.mjs";
import { generateBodyOperationAsset, serializeAsset } from "../tools/generate-body-operations.mjs";

const bundle = JSON.parse(fs.readFileSync(new URL("../exports/generated-maps.bundle.json", import.meta.url), "utf8"));
const superstructures = bundle.entries.filter((entry) => entry.informationPacket.includes("## Superstructure generation contract"));
const naturalOrLegacy = bundle.entries.filter((entry) => !entry.informationPacket.includes("## Superstructure generation contract"));

const required = [
  "STRUCTURE=",
  "SCALE=",
  "EXTERIOR=",
  "CROSS_SECTION=",
  "FACTION=",
  "RENDER=high-fidelity Orphaned Sun superstructure atlas artwork",
  "SOURCE=attached structural plate + packet metadata",
  "STYLE=painterly sci-fi technical atlas; hand-painted mechanical/architectural illustration; same visual family as Orphaned Sun planetary atlases",
  "DETAIL=high information / low noise; macroform first; functional secondary systems second",
  "SCALE_CUES=communicate immense inhabited scale",
  "INTERIOR=hierarchical city-like zoning",
  "LIGHT=restrained functional navigation, habitation, docking, and service illumination",
  "AVOID=AI greebling; recursive panel subdivision",
  "TEXT=no invented labels, names, lore, slogans, heraldry, or annotations beyond supplied canon",
  "DO_NOT=",
];

test("the committed bundle has no superstructures and none of its 8 entries leaks the superstructure style contract", () => {
  assert.equal(superstructures.length, 0);
  assert.equal(naturalOrLegacy.length, 8);
  assert.deepEqual(superstructures.map((entry) => entry.name).sort(), []);
  for (const entry of naturalOrLegacy) {
    assert.equal(entry.informationPacket.includes("RENDER=high-fidelity Orphaned Sun superstructure atlas artwork"), false, `${entry.name} leaked superstructure style contract`);
  }
});

// Synthetic (non-canon) superstructure, shaped like the entries data/superstructure-identities.json carries, keeps the
// normalized technical-atlas style contract under test now that the setting has no artificial bodies.
test("a superstructure identity carries the normalized technical-atlas style contract and a plain station does not", () => {
  const row = { system: "Synthetic", object: "Synthetic Anchorage", type: "major station", parent: "Synthetic", owner_faction: "Eventide" };
  const asset = generateBodyOperationAsset(row);
  const sourceText = serializeAsset(asset);
  const grammar = FACTION_GRAMMARS.frontier;
  const profile = { topology: "single-anchorage", scaleClass: "major-city-scale orbital anchorage", effectiveDimensions: "roughly 40–70 km principal inhabited/docking span", populationBand: "~0.5–2 million permanent and transient population", primaryAxis: "horizontal docking spine", symmetry: "functional bilateral tendency with asymmetric service growth", silhouetteFamily: "frontier-anchorage", massing: "compact inhabited core with elongated docking and logistics arms", signatureStructures: ["horizontal anchorage spine", "multiple heavy docking collars", "compact civic/logistics core"], interiorZones: ["port administration", "habitation districts", "cargo and customs", "repair yards", "traffic control", "Axiolith/power infrastructure"], circulationLogic: "central port concourses feeding radial/axial dock transit", visualCanonNotes: "Synthetic fixture: a compact practical anchorage." };
  const identity = {
    schemaVersion: 1, modelVersion: SUPERSTRUCTURE_MODEL_VERSION, status: "accepted-working-canon", system: row.system, body: row.object,
    factionFamily: "frontier", factionLabel: grammar.label, canonicalType: row.type, operationalKind: asset.operationalKind, ...profile,
    factionDesignGrammar: grammar.designGrammar, materialLanguage: grammar.materialLanguage, factionInteriorLogic: grammar.interiorLogic, militaryLogic: grammar.militaryLogic,
    axiolithRole: "distributed mass/inertia and structural-stress management integrated with primary power/drive architecture",
    mustPreserve: [profile.primaryAxis, profile.symmetry, profile.massing, ...profile.signatureStructures],
    prohibitedMisreadings: ["conventional small spacecraft/station scale", ...grammar.prohibited],
  };
  const model = buildArtificialBodyModel(row, asset);
  const contracted = snapshotOperationalRich(asset, { ...model, superstructure: identity }, "synthetic/anchorage.json", sourceText);
  assert.ok(contracted.informationPacket.includes("## Superstructure generation contract"));
  for (const directive of required) assert.ok(contracted.informationPacket.includes(directive), `${contracted.name} missing ${directive}`);
  const plain = snapshotOperationalRich(asset, model, "synthetic/anchorage.json", sourceText);
  assert.equal(plain.informationPacket.includes("## Superstructure generation contract"), false);
  assert.equal(plain.informationPacket.includes("RENDER=high-fidelity Orphaned Sun superstructure atlas artwork"), false, "plain station leaked superstructure style contract");
});
