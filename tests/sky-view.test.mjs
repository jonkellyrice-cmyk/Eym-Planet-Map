import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { litPath, skyColors } from "../scripts/sky-view.mjs";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("moon phase shapes: full and new are circles, quarters are half discs, crescents and gibbous bulge the right way", () => {
  assert.match(litPath(10, 1), /A 10\.00 10 0 0 1 0 -10 Z$/);    // full: second arc bulges to the dark side
  assert.match(litPath(10, 0), /A 10\.00 10 0 0 0 0 -10 Z$/);    // new: lit half cancelled by the terminator
  assert.match(litPath(10, 0.5), /A 0\.00 10 /);                  // quarter: straight terminator
  assert.match(litPath(10, 0.2), / 0 0 0 0 -10 Z$/);              // crescent
  assert.match(litPath(10, 0.8), / 0 0 1 0 -10 Z$/);              // gibbous
});

test("sky colour runs from blue day through twilight to night, and darkens at totality", () => {
  const day = skyColors(40), dusk = skyColors(-8), night = skyColors(-30), eclipse = skyColors(40, 1);
  const lum = (hex) => [1, 3, 5].reduce((s, i) => s + parseInt(hex.slice(i, i + 2), 16), 0);
  assert.ok(lum(day.zenith) > lum(dusk.zenith) && lum(dusk.zenith) > lum(night.zenith));
  assert.ok(lum(eclipse.zenith) < lum(day.zenith) / 2);
  assert.equal(night.zenith, "#040811");
});

test("the app offers the ground view from Eym's surface and follows the campaign clock", () => {
  const app = source("scripts/cluster-map-app.mjs"), template = source("templates/cluster-map.hbs");
  assert.match(app, /root\.classList\.toggle\("can-look-up", object\.name === "Eym" && Boolean\(geography\)\)/);
  assert.match(app, /new SkyView\(svg, \{ snapshot, sky, starfield/);
  assert.match(app, /groundSky\(\{ model, sky, starfield, latDeg: this\.lookUp\.latDeg, lonDeg: this\.lookUp\.lonDeg \}\)/);
  assert.match(app, /void this\.#refreshSky\(\)/);
  assert.match(app, /window\.clearInterval\(this\._skyTicker\)/);
  for (const token of ['data-action="look-up"', 'data-action="back-to-body"', 'name="lookUpLat"', 'name="lookUpLon"', 'data-sky-layer="lines"', 'data-sky-layer="names"', 'data-sky-field="whiteMoon"', 'data-sky-field="planets"']) assert.ok(template.includes(token), token);
  assert.ok(JSON.parse(source("module.json")).styles.includes("styles/sky-view.css"));
});
