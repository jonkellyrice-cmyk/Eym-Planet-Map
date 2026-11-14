import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../scripts/cluster-map-app.mjs", import.meta.url), "utf8");
const template = readFileSync(new URL("../templates/cluster-map.hbs", import.meta.url), "utf8");

// Live source = source with comments removed, so dormant (commented-out) code cannot satisfy these checks.
const liveJs = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const liveHbs = (source) => source.replace(/\{\{!--[\s\S]*?--\}\}/g, "");

test("application opens on the single home system and never builds the cluster view", () => {
  const live = liveJs(app);
  assert.match(live, /export const HOME_SYSTEM = Object\.freeze\(\{ id: "abydos", name: "Abydos" \}\)/);
  assert.match(live, /mode = "system"/);
  assert.match(live, /activeSystem = HOME_SYSTEM/);
  assert.match(live, /new SystemView/);
  assert.match(live, /#enterSystem/);
  for (const forbidden of [/new ClusterView/, /#showCluster/, /attachFactionTerritories/, /cluster-data\.mjs/, /cluster-view\.mjs/, /mode = "cluster"/]) {
    assert.doesNotMatch(live, forbidden);
  }
});

test("zooming out of the system stops at the system instead of leaving it", () => {
  assert.match(liveJs(app), /onExitRequested: \(\) => \{\}/);
});

test("template has no cluster return and keeps the dynamic identity fields", () => {
  const live = liveHbs(template);
  assert.doesNotMatch(live, /data-action="back-to-cluster"/);
  assert.match(live, /data-map-title/);
  assert.match(live, /data-map-count/);
  assert.match(live, /data-map-help/);
});

test("astral travel is dormant: no live route, voyage, ship or second clock", () => {
  const liveApp = liveJs(app), liveTemplate = liveHbs(template);
  const liveSystem = liveJs(readFileSync(new URL("../scripts/system-view.mjs", import.meta.url), "utf8"));
  for (const forbidden of [/#engageSelectedRoute\(\)/, /#abortActiveVoyage\(\)/, /#scrubVoyageToFraction/, /#refreshActiveVoyage\(\)/, /onShipDrag:/, /calculateTransit/, /_voyageTicker = /]) {
    assert.doesNotMatch(liveApp, forbidden);
  }
  assert.doesNotMatch(liveSystem, /#bindShipRailDrag\(ship/);
  assert.doesNotMatch(liveSystem, /oscm-active-ship-marker/);
  for (const forbidden of [/data-action="engage-route"/, /data-action="abort-voyage"/, /data-action="apply-profile"/, /data-proper-date/, /class="oscm-route-hud/]) {
    assert.doesNotMatch(liveTemplate, forbidden);
  }
  assert.match(liveTemplate, /data-reference-date/);
});
