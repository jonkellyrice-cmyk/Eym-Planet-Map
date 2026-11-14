import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import { buildArtificialBodyModel } from "../scripts/artificial-body-data.mjs";
import { snapshotOperationalRich } from "../scripts/atlas-snapshot-v2.mjs";
import { buildNaturalBodyModel } from "../scripts/natural-body-data.mjs";
import { parseCsv } from "../scripts/system-data.mjs";
import { FACTION_GRAMMARS, SUPERSTRUCTURE_MODEL_VERSION } from "../scripts/superstructure-identities.mjs";
import { generateBodyOperationAsset, serializeAsset } from "../tools/generate-body-operations.mjs";

const rows = parseCsv(fs.readFileSync("docs/system-orbital-distances.csv", "utf8"));
const row = (system, object) => rows.find((item) => item.system === system && item.object === object);
const asset = (path) => JSON.parse(fs.readFileSync(path, "utf8"));

test("natural-solid reference renders a complete deterministic surface survey", () => {
  const path = "data/body-operations/abydos/red-moon.json";
  const source = fs.readFileSync(path, "utf8"), operations = JSON.parse(source);
  const snapshot = snapshotOperationalRich(operations, buildNaturalBodyModel(row("Abydos", "Red Moon")), path, source);
  assert.match(snapshot.referenceSvg, /surface survey chart/);
  assert.match(snapshot.referenceSvg, /surface-bg/);
  assert.match(snapshot.referenceSvg, /Crater Mariner Rise/);
  assert.match(snapshot.informationPacket, /Visual \/ physical profile/);
  assert.match(snapshot.informationPacket, /iron-oxide-rich basalt/);
});

test("giant reference renders atmospheric bands and canonical visual profile", () => {
  const path = "data/body-operations/abydos/tribune.json";
  const source = fs.readFileSync(path, "utf8"), operations = JSON.parse(source);
  const snapshot = snapshotOperationalRich(operations, buildNaturalBodyModel(row("Abydos", "Tribune")), path, source);
  assert.match(snapshot.referenceSvg, /atmospheric survey chart/);
  assert.match(snapshot.referenceSvg, /stroke-width=/);
  assert.match(snapshot.informationPacket, /cream \/ tan \/ rust bands/);
});

// The setting has no stations; a synthetic (non-canon) distributed watch array, with an identity shaped like the entries
// data/superstructure-identities.json carries, keeps the station/superstructure reference path under test.
test("station reference combines canonical structure model with operational geometry", () => {
  const stationRow = { system: "Synthetic", object: "Synthetic Watch Array", type: "installation array", parent: "Synthetic", owner_faction: "Eventide", structure_class: "distributed watch/sensor-defense array", dimensions_estimate: "individual nodes ~1-3 km; network spans millions of km", population_crew_scale: "~1,000-10,000 distributed", primary_function: "sensor coverage, navigation warning, border watch, likely defensive support", strategic_role: "monitors approaches to a synthetic anomaly", visual_archetype: "sparse chain of watch stations", visual_palette: "weathered metal / pale neutral / blue-green accents" };
  const operations = generateBodyOperationAsset(stationRow);
  const path = "synthetic/synthetic-watch-array.json", source = serializeAsset(operations);
  const grammar = FACTION_GRAMMARS.frontier;
  const profile = { topology: "distributed-watch-array", scaleClass: "distributed megacity-scale defense network", effectiveDimensions: "individual watch citadels roughly 20–50 km; network extends across a system-scale surveillance corridor", populationBand: "~1–5 million distributed residents, crews and support population", primaryAxis: "distributed chain along a synthetic anomaly boundary", symmetry: "network repetition rather than one-body symmetry", silhouetteFamily: "watch-citadel chain", massing: "multiple inhabited sensor-defense citadels with broad array planes and compact armored hubs", signatureStructures: ["repeating city-scale watch citadels", "sensor-array planes", "defense and docking hubs", "long distributed surveillance chain"], interiorZones: ["sensor and command precincts", "habitation districts", "defense batteries", "maintenance and docking districts", "Axiolith/power infrastructure"], circulationLogic: "local hub circulation within each citadel plus long-range shuttle/traffic links between nodes", visualCanonNotes: "Synthetic fixture: a chain of separate watch installations tracking the synthetic anomaly rather than one station." };
  const identity = {
    schemaVersion: 1, modelVersion: SUPERSTRUCTURE_MODEL_VERSION, status: "accepted-working-canon", system: stationRow.system, body: stationRow.object,
    factionFamily: "frontier", factionLabel: grammar.label, canonicalType: stationRow.type, operationalKind: operations.operationalKind, ...profile,
    factionDesignGrammar: grammar.designGrammar, materialLanguage: grammar.materialLanguage, factionInteriorLogic: grammar.interiorLogic, militaryLogic: grammar.militaryLogic,
    axiolithRole: "distributed mass/inertia and structural-stress management integrated with primary power/drive architecture",
    mustPreserve: [profile.primaryAxis, profile.symmetry, profile.massing, ...profile.signatureStructures],
    prohibitedMisreadings: ["conventional small spacecraft/station scale", ...grammar.prohibited],
  };
  const model = buildArtificialBodyModel(stationRow, operations);
  // Mirrors buildArtificialBodyModel's superstructure branch, which only engages for profiled (canonical) bodies.
  const superstructureModel = { ...model, kind: operations.operationalKind, dimensions: identity.effectiveDimensions, visualArchetype: identity.silhouetteFamily, population: identity.populationBand, superstructure: identity };
  const snapshot = snapshotOperationalRich(operations, superstructureModel, path, source);
  assert.match(snapshot.referenceSvg, /structural \/ operational plate/);
  assert.match(snapshot.referenceSvg, /Primary Hub/);
  assert.match(snapshot.referenceSvg, /data-superstructure="Synthetic\/Synthetic Watch Array"/);
  assert.match(snapshot.referenceSvg, /data-superstructure-family="watch-citadel-chain"/);
  assert.match(snapshot.referenceSvg, /data-operational-overlay="true"/);
  assert.match(snapshot.informationPacket, /chain of separate watch installations tracking the synthetic anomaly/i);
  assert.match(snapshot.informationPacket, /distributed watch\/sensor-defense array/);
});
