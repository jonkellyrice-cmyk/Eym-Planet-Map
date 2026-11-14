import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const main = readFileSync(new URL("../scripts/main.mjs", import.meta.url), "utf8");
const app = readFileSync(new URL("../scripts/cluster-map-app.mjs", import.meta.url), "utf8");
const template = readFileSync(new URL("../templates/cluster-map.hbs", import.meta.url), "utf8");
const systemView = readFileSync(new URL("../scripts/system-view.mjs", import.meta.url), "utf8");

test("[dormant astral travel preserved] only the authoritative GM persists clock and voyage mutations", () => {
  assert.match(main, /if \(!game\.user\.isGM\) return false/);
  assert.match(main, /activeGM\.id === game\.user\.id/);
  assert.match(app, /!game\.user\.isGM \|\| !api\?\.isClockAuthority/);
  assert.match(template, /\{\{#if isGM\}\}<button type="button" data-action="engage-route"/);
  assert.match(template, /\{\{#if isGM\}\}<button type="button" data-action="abort-voyage"/);
});

test("[dormant astral travel preserved] the system route renderer consumes solver-derived markers and ship fraction", () => {
  for (const source of [systemView]) {
    assert.match(source, /routeVisualization\?\.markers/);
    assert.match(source, /routeVisualization\?\.shipFraction/);
    assert.match(source, /oscm-trajectory-marker/);
    assert.match(source, /oscm-active-ship-marker/);
    assert.match(source, /this\.shipLayer\.append\(ship\)/);
  }
  assert.match(systemView, /this\.svg\.append\(this\.orbitLayer, this\.routeLayer, this\.objectLayer, this\.factionLayer, this\.transitionLayer, this\.shipLayer\)/);
  for (const source of [systemView]) {
    assert.match(source, /this\.transitionLayer\.append\(dot\)/);
    assert.match(source, /r: 6\.5/);
  }
  assert.match(app, /markers: trajectoryMarkers\(transit\)/);
  assert.match(app, /shipFraction: evaluated\.routeFraction/);
  assert.match(app, /!game\.user\.isGM \|\| !api\?\.isClockAuthority/);
  assert.match(app, /advanceVoyageToRouteFraction/);
  assert.match(systemView, /Math\.max\(1e-9,dx\*dx\+dy\*dy\), 0, 1/);
});
