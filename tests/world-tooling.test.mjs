import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareWorlds, FIXED_COASTS, loadWorld, LOOK_AT, summarizeWorld, treeReader, WORLD_FILES } from "../tools/world-snapshot.mjs";
import { managedPinsOf, readPins, worldChecks } from "../tools/world-checks.mjs";
import { worldPictures } from "../tools/world-maps.mjs";
import { reportMarkdown } from "../tools/world.mjs";
import { describeRefresh, refreshRegionTiles } from "../tools/refresh-region-tiles.mjs";

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

test("every generator of Eym's derived data is in the propagation chain (a new system cannot be left out)", async () => {
  const { readdirSync } = await import("node:fs");
  const generators = readdirSync(new URL("tools/", root)).filter((f) => /^generate-eym-.*\.mjs$/.test(f)), build = read("tools/build-generated.mjs"), checks = read("tools/world-checks.mjs"), inputs = read("scripts/eym-world-inputs.mjs");
  assert.ok(generators.length >= 6);
  const groups = new Set();
  for (const file of generators) {
    const source = read(`tools/${file}`), module = await import(`../tools/${file}`);
    // 1. The build runs it when what it is made from changes.
    assert.ok(build.includes(`tools/${file}`) || build.includes(`./${file}`), `${file}: npm run build (and so npm run world) runs it`);
    // 2. It says what it is made from, as a fingerprint the build and the checks compare.
    const sha = Object.keys(module).find((k) => /SourcesSha256$/.test(k)); assert.ok(sha, `${file}: exports a …SourcesSha256`);
    assert.match(module[sha](), /^[0-9a-f]{64}$/);
    // 3. The standing rules check it is up to date.
    assert.ok(checks.includes(`./${file}`) && checks.includes(sha), `${file}: tools/world-checks.mjs checks it is up to date`);
    // 4. The change report reads what it writes.
    const out = /new URL\((?:"([^"]+)"|`([^`]+)`), root\)/.exec(source.slice(source.indexOf("OUT =")));
    const path = (out[1] ?? out[2]).replace("${DIR}", "data/planet-cartography/mitkear");
    assert.ok(Object.values(WORLD_FILES).includes(path), `${file}: the change report reads ${path}`);
    // 5. Its dials, if it has any, are groups of the one inputs file, fingerprinted with its sources.
    const key = Object.keys(module).find((k) => /_INPUTS$/.test(k));
    if (key) { for (const g of module[key]) { groups.add(g); assert.ok(new RegExp(`\\n  ${g}: \\{`).test(inputs), `${file}: the group ${g} is in scripts/eym-world-inputs.mjs`); } assert.ok(source.includes(`inputsFingerprint(...${key})`), `${file}: its fingerprint covers its dials`); }
  }
  // Every group of dials is followed by some generator.
  const { WORLD_INPUTS } = await import("../scripts/eym-world-inputs.mjs");
  assert.deepEqual([...groups].sort(), Object.keys(WORLD_INPUTS).sort());
});

test("the change report covers the survey of the coasts: a tide that changes is flagged", () => {
  const changed = { ...world, coasts: { ...world.coasts, samples: world.coasts.samples.map((s, k) => (k < 5 ? s.map((v, i) => (world.coasts.fields[i] === "funnelGain" ? Math.min(2.5, v + 1) : world.coasts.fields[i] === "bay" ? 1 : v)) : s)) } };
  const result = compareWorlds(summary, summarizeWorld(changed)), section = result.sections.find((s) => /^Coasts/.test(s.title));
  assert.ok(section.lines.some((l) => /funnel gain changed by more than 0\.3 at 5 coast points/.test(l)), section.lines.join(" | "));
  assert.ok(result.flags.some((f) => /tides changed at 5 coast points/.test(f)));
  assert.equal(compareWorlds(summary, summary).sections.find((s) => /^Coasts/.test(s.title)).lines[0], "No change.");
});

test("the post-release step fills separate ranges of the frames at once, tries a refused request again, and accounts for the run", async () => {
  const tiles = { caren: 50, sea: 7 }, seen = { caren: new Set(), sea: new Set() }, ranges = []; let active = 0, most = 0, refused = false;
  const get = async (path) => {
    const url = new URL(path, "http://x"), q = url.searchParams;
    if (url.pathname === "/api/region/stale") return { status: 200, picturesVersion: "v", frames: Object.keys(tiles).map((frame) => ({ frame, current: seen[frame].size, repaint: 0, remake: tiles[frame] - seen[frame].size })), superseded: [] };
    if (url.pathname !== "/api/region/fill") return { status: 404 }; // a server without /api/region/plan: the tool cuts the ranges itself
    const frame = q.get("frame"), start = Number(q.get("start")), end = Math.min(tiles[frame], Number(q.get("end")));
    // One request is refused once (as a busy server would); it must be asked again.
    if (frame === "caren" && start === 20 && !refused) { refused = true; return { status: 503, error: "busy" }; }
    active += 1; most = Math.max(most, active); await new Promise((resolve) => setTimeout(resolve, 5)); active -= 1;
    // Each request does at most 7 tiles of its range (as one that ran out of time would), so some ranges take two.
    const next = Math.min(end, start + 7); for (let k = start; k < next; k += 1) { assert.ok(!seen[frame].has(k), `tile ${k} of ${frame} is looked at once`); seen[frame].add(k); } ranges.push([frame, start, next]);
    return { status: 200, frame, total: tiles[frame], start, end, next, kept: 0, repainted: 1, remade: next - start - 1, already: 0, sea: 0, outside: 0, errors: [], done: next >= end, ms: 100, timing: { listMs: 10, computeMs: 70, firstTileMs: 20, pictureUploadMs: 30, shapesUploadMs: 40, tableMs: 5, tiles: next - start - 1, uploads: 2 * (next - start - 1) } };
  };
  const result = await refreshRegionTiles({ get, concurrency: 4, chunk: 10, wait: async () => {} });
  assert.equal(result.ok, true); assert.deepEqual(result.errors, []); assert.equal(result.stale, 0);
  assert.equal(seen.caren.size, 50); assert.equal(seen.sea.size, 7); assert.ok(most > 1 && most <= 4, `several at once, never more than asked (${most})`);
  const r = result.report; assert.equal(r.examined, 57); assert.equal(r.refusals, 1); assert.equal(r.calls, ranges.length + 1); assert.equal(r.repainted, ranges.length); assert.equal(r.remade, 57 - ranges.length);
  assert.equal(r.uploads, 2 * r.remade); assert.equal(r.timing.computeMs, 70 * ranges.length); assert.equal(r.serverMs, 100 * ranges.length);
  const words = describeRefresh(r).join("\n"); assert.match(words, /Tiles examined: 57/); assert.match(words, /Made again: \d+/); assert.match(words, /1 refused and tried again/); assert.match(words, /table writes/);
  // A server that plans the ranges: the tool fills exactly those, and asks for no others.
  const asked = [], planned = await refreshRegionTiles({ concurrency: 3, chunk: 10, wait: async () => {}, get: async (path) => {
    const url = new URL(path, "http://x"), q = url.searchParams;
    if (url.pathname === "/api/region/stale") return { status: 200, picturesVersion: "v", frames: [{ frame: "caren", current: 50, repaint: 0, remake: 0 }], superseded: [] };
    if (url.pathname === "/api/region/plan") { assert.equal(q.get("per"), "10"); return { status: 200, frame: "caren", total: 900, per: 10, ranges: [[0, 400], [400, 430], [430, 900]] }; }
    asked.push([Number(q.get("start")), Number(q.get("end"))]); return { status: 200, total: 900, next: Number(q.get("end")), kept: 0, repainted: 0, remade: 0, already: 10, sea: 0, outside: 0, errors: [], done: true, ms: 1 };
  } });
  assert.equal(planned.ok, true); assert.deepEqual(asked.sort((a, b) => a[0] - b[0]), [[0, 400], [400, 430], [430, 900]]); assert.equal(planned.report.examined, 900); assert.equal(planned.report.already, 30);
  // A server that keeps refusing: the frame is given up with an error, the others still finish.
  const down = await refreshRegionTiles({ get: async (path) => (path.includes("frame=sea") ? { status: 500 } : get(path)), onlyFrame: "sea", concurrency: 4, chunk: 10, wait: async () => {} });
  assert.equal(down.ok, false); assert.ok(down.errors.some((e) => /sea at 0: the server answered 500 four times/.test(e)));
});
