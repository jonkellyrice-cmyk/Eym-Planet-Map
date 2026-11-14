import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { snapshotOperationalRich } from "../scripts/atlas-snapshot-v2.mjs";
import { buildArtificialBodyModel } from "../scripts/artificial-body-data.mjs";
import { buildNaturalBodyModel } from "../scripts/natural-body-data.mjs";
import { parseCsv } from "../scripts/system-data.mjs";
import { renderSuperstructureAtlas } from "../scripts/superstructure-atlas-visuals.mjs";

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

function superstructureSnapshot(system, body) {
  const row = rowFor(system, body);
  assert.ok(row, `missing registry row for ${system}/${body}`);
  const { item, sourceText, asset } = assetFor(system, body);
  return snapshotOperationalRich(asset, buildArtificialBodyModel(row, asset), item.path, sourceText);
}

// Abydos has two (frontier) superstructures. The other faction silhouette families are still supported by
// the renderer, so they are exercised with synthetic (non-canon) identities.
const FRAME = { x: -340, y: -260, width: 680, height: 520 };
const syntheticRender = (silhouetteFamily, factionFamily) => renderSuperstructureAtlas({ system: "Synthetic", body: silhouetteFamily, silhouetteFamily, factionFamily }, FRAME, { includeSectionalBand: false });

test("Vada Anchorage preserves its frontier anchorage identity and cross-section contract", () => {
  const snapshot = superstructureSnapshot("Abydos", "Vada Anchorage");
  assert.match(snapshot.referenceSvg, /data-superstructure-family="frontier-anchorage"/);
  assert.match(snapshot.referenceSvg, /data-section-logic="true"/);
  assert.match(snapshot.referenceSvg, /data-operational-overlay="true"/);
  assert.match(snapshot.informationPacket, /SCALE=city-scale or larger inhabited superstructure/);
  assert.match(snapshot.informationPacket, /major-city-scale orbital anchorage/i);
  assert.match(snapshot.informationPacket, /CROSS_SECTION=/);
  assert.match(snapshot.informationPacket, /frontier eco-punk\/space-punk construction/i);
});

test("faction silhouettes remain structurally distinct", () => {
  const watch = superstructureSnapshot("Abydos", "Thornwatch Array");
  const anchorage = superstructureSnapshot("Abydos", "Vada Anchorage");
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
  const watch = superstructureSnapshot("Abydos", "Thornwatch Array");
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
  const row = rowFor("Abydos", "Cataphract");
  assert.ok(row);
  const { item, sourceText, asset } = assetFor("Abydos", "Cataphract");
  const snapshot = snapshotOperationalRich(asset, buildNaturalBodyModel(row), item.path, sourceText);
  assert.doesNotMatch(snapshot.referenceSvg, /data-superstructure=/);
  assert.doesNotMatch(snapshot.informationPacket, /Superstructure generation contract/);
  assert.doesNotMatch(snapshot.informationPacket, /SCALE=city-scale or larger/);
});
