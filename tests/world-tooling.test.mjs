import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareWorlds, FIXED_COASTS, loadWorld, LOOK_AT, summarizeWorld, treeReader, WORLD_FILES } from "../tools/world-snapshot.mjs";
import { managedPinsOf, readPins, worldChecks } from "../tools/world-checks.mjs";
import { worldPictures } from "../tools/world-maps.mjs";
import { reportMarkdown } from "../tools/world.mjs";
import { refreshRegionTiles } from "../tools/refresh-region-tiles.mjs";

const root = new URL("../", import.meta.url), read = (path) => readFileSync(new URL(path, root), "utf8");
const world = loadWorld(treeReader()), summary = summarizeWorld(world);
/** The world with its asset changed by `edit` (a deep copy; the files are not touched). */
const altered = (edit) => { const text = { ...world.text }, asset = JSON.parse(world.text.asset); edit(asset); return { ...world, text, asset }; };
const setBiome = (asset, cellIndex, name) => { const values = Buffer.from(asset.raster.biome.valuesBase64, "base64"); values[cellIndex] = asset.raster.biome.categories.indexOf(name); asset.raster.biome.valuesBase64 = values.toString("base64"); };

test("the world's standing rules hold, and every derived file is up to date (npm run world would change nothing)", async () => {
  const checks = await worldChecks(world, { current: true }), broken = checks.filter((c) => !c.ok && c.level === "must");
  assert.deepEqual(broken.map((c) => `${c.rule}: ${c.detail}`), []);
  assert.ok(checks.length >= 14);
  // The owner's maps are among the rules, pinned to the same outlines tests/eym-tectonics.test.mjs has always pinned.
  const pins = readPins(), tectonicsTest = read("tests/eym-tectonics.test.mjs");
  assert.deepEqual(Object.keys(pins.fixed.coastSha256).sort(), [...FIXED_COASTS].sort());
  for (const hash of Object.values(pins.fixed.coastSha256)) assert.ok(tectonicsTest.includes(hash), "the fixed pins are the tectonics test's own");
  for (const name of FIXED_COASTS) assert.ok(checks.find((c) => c.id === `coast-${name.toLowerCase()}`).ok);
  // The managed pins record the world as it is, each with the reason it holds its value.
  assert.deepEqual(Object.fromEntries(Object.entries(pins.managed).map(([k, v]) => [k, v.value])), managedPinsOf(world));
  for (const pin of Object.values(pins.managed)) assert.ok(pin.note.length >= 10);
});

test("a world read whole: every file, every continent, and a comparison with itself finds no change", () => {
  for (const key of Object.keys(WORLD_FILES)) assert.ok(world.text[key], `${key} is read`);
  assert.deepEqual(Object.keys(summary.continents).sort(), ["Caren", "Demani", "Gaffa", "Garyk", "Khohalis", "islands"]);
  for (const [name, c] of Object.entries(summary.continents)) assert.ok(c.cells > 20 && c.highestM > 0, name);
  assert.ok(summary.plates.count >= 8 && summary.ocean.meanSpeed > 0.05 && summary.hydrology.rivers > 10);
  const same = compareWorlds(summary, summary);
  assert.equal(same.same, true); assert.deepEqual(same.flags, []); assert.deepEqual(same.errors, []);
  assert.deepEqual(worldPictures(summary, summary), []);
});

test("the comparison says what changed, flags what is past the thresholds, and treats the owner's coasts as invariants", async () => {
  const { owner, lonCount } = summary.fields, cellsOf = (name) => [...owner.keys()].filter((i) => owner[i] === name);
  // A few of Gaffa's cells change biome: reported, not flagged; more than a tenth of them: flagged.
  const gaffa = cellsOf("Gaffa"), few = summarizeWorld(altered((a) => { for (const i of gaffa.slice(0, 3)) setBiome(a, i, "ice-cap"); })), many = summarizeWorld(altered((a) => { for (const i of gaffa.slice(0, Math.ceil(gaffa.length * (LOOK_AT.biomeShare + 0.05)))) setBiome(a, i, "ice-cap"); }));
  const small = compareWorlds(summary, few), large = compareWorlds(summary, many), line = (c) => c.sections.find((s) => s.title === "Continents").lines.find((l) => l.startsWith("Gaffa"));
  assert.match(line(small), /biome changed in 3 of \d+ cells/); assert.deepEqual(small.flags, []); assert.equal(small.same, false);
  assert.ok(large.flags.some((f) => /Gaffa: \d+ of \d+ cells changed biome/.test(f)));
  assert.match(small.sections.find((s) => s.title === "Continents").lines.find((l) => l.startsWith("Caren")), /unchanged/);
  // Its pictures: Gaffa's biomes side by side, nothing for the continents that did not change.
  const pictures = worldPictures(summary, few);
  assert.deepEqual(pictures.map((p) => p.name), ["biomes-gaffa.png"]); assert.equal(pictures[0].png[1], 0x50, "a PNG");
  // A seeded continent's coast may move (flagged for a look); Caren's may not (an error), and the rules say so too.
  const nudge = (name) => altered((a) => { const c = a.terrain.coastlines.find((x) => x.continent === name); c.points = c.points.map(([la, lo], k) => (k === 0 ? [la + 0.01, lo] : [la, lo])); });
  const seeded = compareWorlds(summary, summarizeWorld(nudge("Demani"))), fixed = compareWorlds(summary, summarizeWorld(nudge("Caren")));
  assert.ok(seeded.flags.some((f) => /Demani's coastline changed/.test(f))); assert.deepEqual(seeded.errors, []);
  assert.ok(fixed.errors.some((e) => /Caren's coastline changed: it is an invariant/.test(e)));
  const checks = await worldChecks(nudge("Caren"));
  assert.equal(checks.find((c) => c.id === "coast-caren").ok, false); assert.equal(checks.find((c) => c.id === "coast-garyk").ok, true);
  // The report puts errors and things to look at first, then every layer, then the rules.
  const report = reportMarkdown({ base: "HEAD", comparison: fixed, checks, pinsMoved: [{ key: "registryCsvSha256", from: "a", to: "b" }], pictures: [] });
  assert.match(report, /\*\*BROKEN: a rule that must hold does not\.\*\*/);
  for (const heading of ["## Errors", "## Managed pins that moved", "## Hand-authored overrides in force", "## What changed, layer by layer", "### Continents", "## Standing rules"]) assert.ok(report.includes(heading), heading);
  assert.ok(report.indexOf("## Errors") < report.indexOf("## What changed"));
  assert.equal(lonCount, 360);
});

test("the post-release step refills every frame, checks nothing is stale, and purges only what the server calls superseded", async () => {
  // A stand-in for the map server: two frames of stale tiles, one superseded set in the store.
  const server = (purgeOn) => {
    const state = { tiles: { caren: 5, sea: 2 }, done: { caren: 0, sea: 0 }, old: ["eym-region-layer-v5-saaaaaaaaaaaa"], calls: [] }, current = "eym-region-layer-v5-sbbbbbbbbbbbb";
    const stale = () => ({ status: 200, shapesVersion: current, picturesVersion: `${current}-pcccccccccccc`, frames: Object.keys(state.tiles).map((frame) => ({ frame, current: state.done[frame], repaint: 0, remake: state.tiles[frame] - state.done[frame] })), superseded: [...state.old], purgeOn });
    const get = async (path) => {
      state.calls.push(path); const url = new URL(path, "http://x"), q = url.searchParams;
      if (url.pathname === "/api/region/stale") return stale();
      if (url.pathname === "/api/region/fill") { const frame = q.get("frame"), start = Number(q.get("start")), n = Math.min(2, state.tiles[frame] - start); state.done[frame] = start + n; return { status: 200, frame, total: state.tiles[frame], start, next: start + n, kept: 0, repainted: 0, remade: n, sea: 0, errors: [], done: start + n >= state.tiles[frame] }; }
      if (url.pathname === "/api/region/purge") {
        if (!purgeOn) return { status: 403, error: "purging is off" };
        const model = q.get("model"), files = state.old.includes(model) ? 7 : 0, confirmed = q.get("confirm") === model; if (confirmed) state.old = state.old.filter((m) => m !== model);
        return { status: 200, model, current: { shapes: current, pictures: `${current}-pcccccccccccc` }, dryRun: !confirmed, files: { "eym-tiles": 0, "eym-shapes": files }, deleted: { "eym-tiles": 0, "eym-shapes": confirmed ? files : 0 } };
      }
      return { status: 404 };
    };
    return { state, get };
  };
  // Without --purge: every frame is filled in order, call after call, and the old set is only reported.
  const a = server(false), plain = await refreshRegionTiles({ get: a.get });
  assert.equal(plain.ok, true); assert.equal(plain.stale, 0);
  assert.deepEqual(plain.frames.map((f) => [f.frame, f.remade, f.calls]), [["caren", 5, 3], ["sea", 2, 1]]);
  assert.deepEqual(plain.superseded, ["eym-region-layer-v5-saaaaaaaaaaaa"]); assert.ok(!a.state.calls.some((c) => c.includes("purge")));
  // With --purge and the server's switch off: nothing is deleted, and the result says why it is not finished.
  const b = server(false), off = await refreshRegionTiles({ get: b.get, purge: true });
  assert.equal(off.ok, false); assert.equal(off.purgeOff, true); assert.deepEqual(b.state.old, ["eym-region-layer-v5-saaaaaaaaaaaa"]);
  // With the switch on: a dry run, then the delete, and nothing superseded remains.
  const c = server(true), on = await refreshRegionTiles({ get: c.get, purge: true });
  assert.equal(on.ok, true); assert.deepEqual(on.purged, [{ model: "eym-region-layer-v5-saaaaaaaaaaaa", files: 7 }]); assert.deepEqual(on.superseded, []);
  const purges = c.state.calls.filter((x) => x.includes("purge")); assert.ok(!purges[0].includes("confirm") && purges[1].includes("confirm="));
  // Tiles still stale after the fill: an error, and no purge is attempted.
  const d = server(true), stuck = async (path) => (path.startsWith("/api/region/fill") ? { status: 200, total: 5, next: 5, kept: 0, repainted: 0, remade: 0, sea: 0, errors: [], done: true } : d.get(path)), bad = await refreshRegionTiles({ get: stuck, purge: true });
  assert.equal(bad.ok, false); assert.ok(bad.errors.some((e) => /still stale/.test(e))); assert.ok(!d.state.calls.some((x) => x.includes("purge")));
});
