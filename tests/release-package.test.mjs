import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
// Twig's test workspace has no .github/workflows (Twig never handles workflow files), so the checks that
// read the release workflow run only where it is present (owner-approved, 2026-11-16). Everything else
// here (versions, URLs, every release file existing) runs everywhere.
const workflowUrl = new URL(".github/workflows/release.yml", root), workflow = existsSync(workflowUrl) ? readFileSync(workflowUrl, "utf8") : null;

test("release workflow packages the registry, cartography, operational, astronomy, night-sky and surface-art data", () => {
  if (workflow) assert.match(workflow, /module\.json scripts templates styles lang README\.md docs data \\/);
  const required = [
    "docs/system-orbital-distances.csv",
    "data/planet-geography/manifest.json",
    "data/planet-geography/mitkear/eym.json",
    "data/planet-cartography/manifest.json",
    "data/planet-cartography/mitkear/eym.json",
    "data/planet-cartography/mitkear/bruthi.json",
    "data/body-operations/manifest.json",
    "data/body-operations/mitkear/iarn.json",
    "data/body-operations/mitkear/white-moon.json",
    "data/astronomy/epoch-orientations.json",
    "data/stellar/starfield.json",
    "data/stellar/constellations.json",
    "data/surface-art/manifest.json",
  ];
  for (const path of required) {
    if (workflow) assert.match(workflow, new RegExp(path.replace(/[./-]/g, "\\$&")));
    // The workflow's required-file check fails the release if a listed file is missing, so each must exist.
    assert.ok(existsSync(new URL(path, root)), `${path} is listed for release but missing`);
  }
  if (workflow) {
    assert.match(workflow, /npm run astronomy:validate && npm run astronomy:check/);
    assert.match(workflow, /npm run starfield:check && npm run constellations:check/);
  }
});

test("Foundry and package versions agree on the v0.32.1 eym-planet-map release archive", () => {
  const manifest = JSON.parse(readFileSync(new URL("module.json", root), "utf8"));
  const packageJson = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  assert.equal(manifest.id, "eym-planet-map");
  assert.equal(packageJson.name, manifest.id);
  assert.equal(manifest.version, packageJson.version);
  assert.equal(manifest.version, "0.32.1");
  assert.equal(manifest.url, "https://github.com/jonkellyrice-cmyk/Eym-Planet-Map");
  assert.equal(manifest.manifest, "https://github.com/jonkellyrice-cmyk/Eym-Planet-Map/releases/latest/download/module.json");
  assert.equal(manifest.download, "https://github.com/jonkellyrice-cmyk/Eym-Planet-Map/releases/download/v0.32.1/eym-planet-map-v0.32.1.zip");
  if (workflow) assert.match(workflow, /ARCHIVE="eym-planet-map-v\$\{VERSION\}\.zip"/);
});
