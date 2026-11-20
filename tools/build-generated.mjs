// npm run build: makes Eym's derived data again when what it is made from has changed, and does nothing (fast)
// when it has not. In order: the tectonic history (data/eym/tectonics.json, when its sources changed), then,
// if Eym's input fingerprint moved, the registry row's fingerprint, the geography and cartography assets and
// the frozen atlas snapshot. Everything it writes is drawn by rule, so running it twice changes nothing.
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../scripts/system-data.mjs";
import { tectonicSourcesSha256 } from "./generate-eym-tectonics.mjs";
import { climateSourcesSha256 } from "./generate-eym-climate.mjs";

const root = new URL("../", import.meta.url), cwd = fileURLToPath(root);
const run = (...args) => execFileSync(process.execPath, args, { cwd, stdio: "inherit" });
let changed = false;

const readTect = () => { try { return JSON.parse(readFileSync(new URL("data/eym/tectonics.json", root), "utf8")); } catch { return null; } };
let tect = readTect();
// The fit takes minutes, so it runs in steps of about half a minute, one seed a step
// (seeds already found to fail are kept in .cache/, which is not committed);
// until it is done, the build says so and stops: run it again.
if (tect?.sourcesSha256 !== tectonicSourcesSha256()) {
  run("tools/generate-eym-tectonics.mjs", "--budget-s", "20"); changed = true;
  tect = readTect();
  if (tect?.sourcesSha256 !== tectonicSourcesSha256()) { console.log("The tectonic history is not finished: run npm run build again."); process.exit(0); }
}

// The growth of the three far continents (data/eym/growth.json; canon: Eym about 80% water) follows the tectonic
// history, which it reads and never alters: made again (half a minute) when its sources changed.
const { growthSourcesSha256 } = await import("./generate-eym-growth.mjs");
const readGrowth = () => { try { return JSON.parse(readFileSync(new URL("data/eym/growth.json", root), "utf8")); } catch { return null; } };
if (readGrowth()?.sourcesSha256 !== growthSourcesSha256()) { run("tools/generate-eym-growth.mjs"); changed = true; }

// The ocean climate (data/eym/climate.json) follows the land: made again (about a quarter of a minute) when its
// sources changed, the tectonic history among them.
const readClimate = () => { try { return JSON.parse(readFileSync(new URL("data/eym/climate.json", root), "utf8")); } catch { return null; } };
if (readClimate()?.sourcesSha256 !== climateSourcesSha256()) { run("tools/generate-eym-climate.mjs"); changed = true; }

// (Imported only now: it reads the tectonic history and the climate written above.)
const { eymFingerprintFromRepo } = await import("./eym-world.mjs");
const csvUrl = new URL("docs/system-orbital-distances.csv", root), csv = readFileSync(csvUrl, "utf8");
const row = parseCsv(csv).find((r) => r.object === "Eventide"), fingerprint = eymFingerprintFromRepo();
if (row.geography_input_fingerprint !== fingerprint) {
  writeFileSync(csvUrl, csv.replace(row.geography_input_fingerprint, fingerprint));
  run("tools/generate-planet-geography.mjs", "--accept");
  run("tools/generate-planet-cartography.mjs", "--accept");
  run("tools/export-atlas-snapshots.mjs");
  changed = true;
}
// The survey of the mapped continents' coasts (tools/generate-eym-coasts.mjs: shelves, bays, the tide's funnelling)
// follows the cartography and the plates: made again (about a quarter of a minute) when either changed.
const { coastSourcesSha256 } = await import("./generate-eym-coasts.mjs");
const readCoasts = () => { try { return JSON.parse(readFileSync(new URL("data/planet-cartography/abydos/eventide-coasts.json", root), "utf8")); } catch { return null; } };
if (readCoasts()?.sourcesSha256 !== coastSourcesSha256()) { run("tools/generate-eym-coasts.mjs"); changed = true; }
// The survey of the magnetic field against its canon (tools/generate-eym-magnetic.mjs: the pole's loop, the coasts'
// magnetic latitudes, the open sea round the poles) follows the cartography and the field's dials: made again (under a
// second) when either changed.
const { magneticSourcesSha256 } = await import("./generate-eym-magnetic.mjs");
const readMagnetic = () => { try { return JSON.parse(readFileSync(new URL("data/eym/magnetic.json", root), "utf8")); } catch { return null; } };
if (readMagnetic()?.sourcesSha256 !== magneticSourcesSha256()) { run("tools/generate-eym-magnetic.mjs"); changed = true; }
// Eym's drainage (tools/generate-eym-drainage.mjs) follows the cartography: made again (a quarter of a minute) when the
// cartography or the local detail's surface changed.
const { drainageSourcesSha256 } = await import("./generate-eym-drainage.mjs");
const readDrainage = () => { try { return JSON.parse(readFileSync(new URL("data/planet-cartography/abydos/eventide-drainage.json", root), "utf8")); } catch { return null; } };
if (readDrainage()?.sourcesSha256 !== drainageSourcesSha256()) { run("tools/generate-eym-drainage.mjs"); changed = true; }
// Eym's wind and wave climate (tools/generate-eym-wind.mjs) follows the weather, the sea and the land: made again
// (about a minute and a half) when any of them changed.
const { windSourcesSha256 } = await import("./generate-eym-wind.mjs");
const readWind = () => { try { return JSON.parse(readFileSync(new URL("data/planet-cartography/abydos/eventide-wind.json", root), "utf8")); } catch { return null; } };
if (readWind()?.sourcesSha256 !== windSourcesSha256()) { run("tools/generate-eym-wind.mjs"); changed = true; }
// The rivers' monthly climate (tools/generate-eym-flow.mjs) follows the weather and the land: made again (a few
// seconds) when either changed.
const { flowSourcesSha256 } = await import("./generate-eym-flow.mjs");
const readFlow = () => { try { return JSON.parse(readFileSync(new URL("data/planet-cartography/abydos/eventide-flow.json", root), "utf8")); } catch { return null; } };
if (readFlow()?.sourcesSha256 !== flowSourcesSha256()) { run("tools/generate-eym-flow.mjs"); changed = true; }
// Last, the Region layer's fingerprint (tools/generate-region-fingerprint.mjs): the code and data its stored tiles
// are made from, all of the above included. Written again whenever either fingerprint moved.
const { REGION_FINGERPRINT_FILE, regionFingerprint } = await import("./generate-region-fingerprint.mjs");
const readFingerprint = () => { try { return JSON.parse(readFileSync(new URL(REGION_FINGERPRINT_FILE, root), "utf8")); } catch { return null; } };
const fingerprintNow = regionFingerprint(), fingerprintKept = readFingerprint();
if (fingerprintKept?.shapes !== fingerprintNow.shapes || fingerprintKept?.paint !== fingerprintNow.paint) { run("tools/generate-region-fingerprint.mjs"); changed = true; }
console.log(changed ? "Eym's derived data was made again." : "Eym's derived data is up to date.");
