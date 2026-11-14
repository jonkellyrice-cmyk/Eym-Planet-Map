import test from "node:test";
import assert from "node:assert/strict";
import { CARTOGRAPHIC_NAMING_PROFILES, assignFeatureNames, generateToponym, namingProfileForSystem } from "../scripts/cartography-toponymy.mjs";

test("Abydos resolves to its canonical controlling naming culture and unknown systems are refused", () => {
  assert.equal(namingProfileForSystem("Abydos").id, "vadan");
  assert.throws(() => namingProfileForSystem("Tanis"), /No cartographic naming profile/);
});

test("proper names are stable for an accepted seed and feature identity", () => {
  const input = { system: "Abydos", world: "Eventide", seed: "canon-seed", featureClass: "river", ordinal: 4 };
  assert.deepEqual(generateToponym(input), generateToponym(input));
  assert.equal(generateToponym(input).language, "Vadan");
});

test("profiles preserve the established linguistic character", () => {
  assert.match(CARTOGRAPHIC_NAMING_PROFILES.aurethic.basis, /Hebrew.*Greek.*Latin/);
  assert.match(CARTOGRAPHIC_NAMING_PROFILES.vostrann.basis, /Gaelic.*Russian/);
  assert.match(CARTOGRAPHIC_NAMING_PROFILES.xuanhari.basis, /Sinitic.*Sanskrit/);
  assert.match(namingProfileForSystem("Abydos").basis, /Earth-derived/);
  assert.match(CARTOGRAPHIC_NAMING_PROFILES.union.basis, /Cosmopolitan Earth/);
});

test("feature assignment is collision-free across a dense planetary gazetteer", () => {
  const classes = ["capital", "city", "port", "ocean", "sea", "river", "lake", "mountain", "range", "continent", "island", "desert", "forest", "wetland", "glacier", "strait", "road", "landmark"];
  const named = assignFeatureNames({ system: "Abydos", world: "Test", seed: "permanent", features: Array.from({ length: 180 }, (_, index) => ({ id: index, featureClass: classes[index % classes.length] })) });
  assert.equal(new Set(named.map((feature) => feature.properName)).size, named.length);
  assert.ok(named.every((feature) => feature.language && feature.namingBasis));
});

test("scientific feature classes are not silently given invented proper-name rules", () => {
  assert.throws(() => generateToponym({ system: "Abydos", world: "Eventide", seed: "x", featureClass: "tectonic-plate" }), /Unsupported/);
});
