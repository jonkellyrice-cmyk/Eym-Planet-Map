import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSystemModel, parseCsv } from "../scripts/system-data.mjs";
import { displayNameFor, objectDisplayName, parentDisplayName, systemDisplayName } from "../scripts/display-names.mjs";

const rows = parseCsv(readFileSync(new URL("../docs/system-orbital-distances.csv", import.meta.url), "utf8"));
const model = buildSystemModel(rows, "Abydos");
const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("people on Eym call their world Eym and their star the Sun", () => {
  assert.equal(objectDisplayName(model.byName.get("Eventide")), "Eym");
  assert.equal(objectDisplayName(model.byName.get("Abydos")), "Sun");
  assert.equal(systemDisplayName("Abydos"), "The Sun");
  assert.equal(objectDisplayName(model.byName.get("Ramses")), "Ramses", "unrenamed bodies keep their names");
  assert.equal(parentDisplayName(model.byName.get("Ramses")), "Sun");
  assert.equal(parentDisplayName(model.byName.get("Vada Anchorage")), "Eym");
  assert.equal(displayNameFor("Abydos", "Eventide"), "Eym");
});

test("canonical names stay as data keys: the registry, model and asset paths are unchanged", () => {
  assert.ok(rows.some((row) => row.system === "Abydos" && row.object === "Eventide"));
  assert.equal(model.name, "Abydos");
  assert.equal(model.byName.get("Eventide").name, "Eventide");
  assert.ok(readFileSync(new URL("../data/planet-cartography/abydos/eventide.json", import.meta.url)).length > 0);
});

test("every on-screen name goes through the display layer", () => {
  const app = source("scripts/cluster-map-app.mjs"), view = source("scripts/system-view.mjs"), body = source("scripts/body-view.mjs");
  assert.match(view, /label\.textContent = objectDisplayName\(object\)/);
  assert.match(view, /"aria-label": `\$\{objectDisplayName\(object\)\}/);
  assert.match(view, /parent: \$\{parentDisplayName\(object\)\}/);
  assert.match(app, /title: systemDisplayName\(HOME_SYSTEM\.name\)/);
  assert.match(app, /title\.textContent = objectDisplayName\(object\)/);
  assert.match(app, /objectName: objectDisplayName\(object\)/);
  assert.match(body, /displayNameFor\(this\.model\.system, this\.model\.body\)/);
  assert.match(source("templates/cluster-map.hbs"), /<h2 data-map-title>\{\{systemTitle\}\}<\/h2>/);
  // Asset lookups must keep using canonical names.
  assert.match(app, /assetSlug\(object\.name\)/);
  assert.match(app, /loadBodyOperationAsset\(object\.system, object\.name, MODULE_ID\)/);
});
