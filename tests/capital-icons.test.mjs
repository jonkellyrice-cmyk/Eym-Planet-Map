import test from "node:test";
import assert from "node:assert/strict";
import { FACTION_PRESENTATIONS, factionPresentationForOwner } from "../scripts/capital-icons.mjs";

// Cluster capital markers were removed with the cluster view; the faction emblems remain because the
// system and body views use them for the owning faction.
test("canonical ownership names resolve to reusable faction emblems", () => {
  assert.equal(factionPresentationForOwner("Eym").factionId, "eym");
  assert.equal(factionPresentationForOwner("Signatories of the Accords").factionId, "accords");
  assert.equal(factionPresentationForOwner("Adanian Conclave").factionId, "conclave");
  assert.equal(factionPresentationForOwner("Xuanjia Mandate").factionId, "mandate");
  assert.equal(factionPresentationForOwner("Union").factionId, "union");
  assert.equal(factionPresentationForOwner(""), null);
});

test("every faction presentation has a distinct emblem", () => {
  const presentations = Object.values(FACTION_PRESENTATIONS);
  assert.equal(presentations.length, 5);
  assert.equal(new Set(presentations.map((presentation) => presentation.emblem)).size, presentations.length);
});
