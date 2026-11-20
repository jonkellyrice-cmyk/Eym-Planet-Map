// The standing checks on Eym's world: rules that must hold however the world's inputs are changed (they are not
// records of what the world happened to be). Run by tools/world.mjs after every rebuild and by
// tests/world-tooling.test.mjs. Each rule returns { id, level, rule, ok, detail }: a "must" rule that fails is an
// error (the world is broken); a "should" rule that fails is a warning for a person to weigh.
//
// Two kinds of pinned value live in tools/world-pins.json:
//   - "fixed": invariants. The owner's maps of Caren and Garyk; no tool ever changes these.
//   - "managed": values that follow the world (the registry file's hash). A rebuild that moves one says so in its
//     report, and `node tools/world.mjs --accept-pins` records the new value; nothing updates them silently.

import { readFileSync } from "node:fs";
import { WORLD_FILES, cellContinents, heights, sha256, summarizeWorld } from "./world-snapshot.mjs";
import { overrideProblems } from "../scripts/eym-overrides.mjs";

const PINS = new URL("world-pins.json", import.meta.url);
export const readPins = () => JSON.parse(readFileSync(PINS, "utf8"));
/** The managed pins as they stand for a world: what the pins file should hold if the world is accepted. */
export const managedPinsOf = (world) => ({ registryCsvSha256: world.registry == null ? null : sha256(world.registry) });

const isSea = (biome) => /ocean|sea-ice/.test(biome);

/**
 * The size of each shipped data file against the budget: [{ id, rule, ok, detail, bytes, limit }], the total last.
 * A file the world does not have is left out; a world read without its texts gives no lines.
 */
export function dataBudget(world, pins = readPins()) {
  const budget = pins.fixed.dataBudget, out = []; if (!budget || !world.text) return out;
  const kb = (n) => `${(n / 1000).toFixed(0)} kB`; let total = 0, before = 0;
  for (const [key, was] of Object.entries(budget.preGrowthBytes)) {
    if (world.text[key] == null) continue; const bytes = Buffer.byteLength(world.text[key]), limit = Math.round(was * budget.factor); total += bytes; before += was;
    out.push({ id: `size-${key}`, rule: `${WORLD_FILES[key]} is no more than ${budget.factor} times its size before the land grew`, ok: bytes <= limit, detail: `${kb(bytes)} of ${kb(limit)} allowed (${kb(was)} before)`, bytes, limit });
  }
  if (out.length) out.push({ id: "size-total", rule: `the shipped data files together are no more than ${budget.factor} times their size before the land grew`, ok: total <= Math.round(before * budget.factor), detail: `${kb(total)} of ${kb(before * budget.factor)} allowed (${kb(before)} before)`, bytes: total, limit: Math.round(before * budget.factor) });
  return out;
}

/**
 * Check a world (tools/world-snapshot.mjs loadWorld) against the rules. `current` adds the rules that only make
 * sense for the working tree: that every derived file is up to date with what it is made from.
 */
export async function worldChecks(world, { current = false, pins = readPins() } = {}) {
  const out = [], rule = (id, text, ok, detail = "", level = "must") => out.push({ id, level, rule: text, ok: Boolean(ok), detail });
  const { asset, tectonics, climate } = world;
  if (!asset) { rule("asset", "Eventide has a cartography asset", false, "missing"); return out; }
  const summary = summarizeWorld(world), { latCount, lonCount } = asset.grid, n = latCount * lonCount, height = heights(asset), owner = cellContinents(asset), biome = summary.fields.biome;

  // The hand-authored exceptions are sound (each says what, where and why).
  if (world.overrides) { const problems = overrideProblems(world.overrides); rule("overrides", "every hand-authored override says what it sets, where and why", problems.length === 0, problems.join("; ")); }

  // The owner's maps.
  for (const [name, pin] of Object.entries(pins.fixed.coastSha256)) rule(`coast-${name.toLowerCase()}`, `${name}'s coastline is the owner's map, unchanged`, summary.continents[name]?.coastSha256 === pin, summary.continents[name] ? "" : "no such continent");

  // What is shipped stays small enough to load: each data file, and all together, within the budget set against
  // their sizes before the land grew (tools/world-pins.json; land-growth scaling, Fix 7).
  for (const line of dataBudget(world, pins)) rule(line.id, line.rule, line.ok, line.detail);

  // An ocean world with its continents.
  rule("ocean-share", "the ocean covers 98% to 99% of the world", summary.waterFraction >= 0.98 && summary.waterFraction <= 0.99, `${(summary.waterFraction * 100).toFixed(2)}%`);
  const continents = asset.gazetteer.filter((f) => f.featureClass === "continent").map((f) => f.properName);
  rule("continents", "every named continent has land and a coastline", continents.length >= 2 && continents.every((c) => summary.continents[c]?.cells > 0 && asset.terrain.coastlines.some((x) => x.continent === c)), continents.map((c) => `${c} ${summary.continents[c]?.cells ?? 0}`).join(", "));

  // The open sea is below sea level. (A cell with some land in it keeps its land biome but may hold the sea
  // floor's height, so the rule is about cells with no land at all.)
  let wrongSea = 0; for (let i = 0; i < n; i += 1) if (!owner[i] && height[i] >= 0) wrongSea += 1;
  rule("heights", "every open-sea cell is below sea level", wrongSea === 0, `${wrongSea} sea cells at or above 0 m`);
  const top = Math.max(...height), deep = Math.min(...height);
  rule("height-range", "no mountain above 9,000 m and no trench below 11,000 m", top <= 9000 && deep >= -11000, `${deep} m to ${top} m`);

  // Water runs somewhere.
  const ends = new Set(["ocean", "river", "lake"]), strays = asset.hydrology.rivers.filter((r) => !ends.has(String(r.mouth).replace(/[-:].*$/, "")) || (r.points?.length ?? 0) < 2);
  rule("rivers-end", "every river has a course and ends in the sea, a lake or another river", strays.length === 0, strays.slice(0, 5).map((r) => `${r.id} → ${r.mouth}`).join(", "));
  const uphill = asset.hydrology.rivers.filter((r) => r.elevationsM?.length > 1 && r.elevationsM.at(-1) > r.elevationsM[0]);
  rule("rivers-downhill", "every river ends lower than it starts", uphill.length === 0, uphill.map((r) => `${r.id} (${r.continent}, +${r.elevationsM.at(-1) - r.elevationsM[0]} m)`).join(", "), "should");

  // People live on land (or at its edge).
  const cellOf = (lat, lon) => Math.min(latCount - 1, Math.max(0, Math.floor((lat + 90) / (180 / latCount)))) * lonCount + ((Math.floor((lon + 180) / (360 / lonCount)) % lonCount) + lonCount) % lonCount;
  const nearLand = (lat, lon) => { for (const dy of [0, -1, 1]) for (const dx of [0, -1, 1]) if (owner[cellOf(Math.max(-89.5, Math.min(89.5, lat + dy)), lon + dx)]) return true; return false; };
  const adrift = asset.settlements.filter((s) => !nearLand(s.lat, s.lon));
  rule("settlements-on-land", "every settlement stands on land or at its edge", adrift.length === 0, adrift.slice(0, 5).map((s) => s.properName ?? s.id).join(", "));
  const unnamed = asset.gazetteer.filter((f) => !(f.properName ?? f.placeholderName));
  rule("names", "every feature on the map has a name", unnamed.length === 0, `${unnamed.length} without`);

  // Biomes fit their cells.
  let seaOnLand = 0; for (let i = 0; i < n; i += 1) if (owner[i] && isSea(biome.at(i))) seaOnLand += 1;
  rule("biomes", "no land cell carries a sea biome", seaOnLand === 0, `${seaOnLand}`);

  // The plates and the mantle (when the world has a tectonic history).
  if (tectonics) {
    const speeds = tectonics.report?.plateSpeeds ?? [], off = speeds.filter((p) => !p.withinTarget);
    if (speeds.length) rule("plate-speeds", "every plate moves at a speed its driver allows", off.length === 0, off.map((p) => `${p.id} ${p.speedMmYr} mm/yr (${p.driver})`).join(", "));
    const hot = tectonics.volcanoes.filter((v) => v.setting === "hotspot").length;
    if (tectonics.mantle) rule("hotspots", "plumes rise in at least three places, each with a seamount chain", hot >= 3 && tectonics.mantle.chains.length === hot, `${hot} hotspots, ${tectonics.mantle.chains.length} chains`);
  }

  // The ocean climate stays physical.
  if (climate) {
    const all = climate.seasons.flatMap((s) => s.sstAnomaly), lo = Math.min(...all), hi = Math.max(...all), fast = Math.max(...climate.seasons.flatMap((s) => s.u.map((u, i) => Math.hypot(u, s.v[i]))));
    rule("sea-temperature", "the currents change the sea's temperature by no more than 5 °C", lo >= -5 && hi <= 5, `${lo} to ${hi} °C`);
    rule("current-speed", "no current runs faster than 3 m/s", fast <= 3, `${fast.toFixed(2)} m/s`);
  }

  // The survey of the coasts stays within its dials.
  if (world.coasts) {
    const { SHELF_SEAS } = await import("../scripts/eym-shelf-seas.mjs"), d = world.coasts, col = (name) => d.fields.indexOf(name), bad = d.samples.filter((s) => !(s[col("funnelGain")] >= 1 && s[col("funnelGain")] <= SHELF_SEAS.funnelMaxGain) || !(s[col("shelfKm")] >= 0 && s[col("shelfKm")] <= 400) || !(s[col("shelfDepthM")] > 0) || (s[col("funnelGain")] > 1 && !s[col("bay")]));
    rule("coasts", "every surveyed coast point has a shelf of 0 to 400 km, water over it, and a tide gain within the dial, raised only in a bay", bad.length === 0 && d.samples.length > 0, `${bad.length} of ${d.samples.length} points out of bounds`);
    rule("coasts-covered", "every continent the dials name is surveyed", SHELF_SEAS.continents.every((c) => d.samples.some((s) => s[col("continent")] === c)), d.continents.join(", "));
  }

  // Everything derived is up to date with what it is made from (the working tree only).
  if (current) {
    const [{ tectonicSourcesSha256 }, { climateSourcesSha256 }, { drainageSourcesSha256 }, { windSourcesSha256 }, { flowSourcesSha256 }, { eymFingerprintFromRepo }, { regionFingerprint }, { coastSourcesSha256 }] = await Promise.all([
      import("./generate-eym-tectonics.mjs"), import("./generate-eym-climate.mjs"), import("./generate-eym-drainage.mjs"), import("./generate-eym-wind.mjs"), import("./generate-eym-flow.mjs"), import("./eym-world.mjs"), import("./generate-region-fingerprint.mjs"), import("./generate-eym-coasts.mjs")]);
    const stale = [];
    if (tectonics?.sourcesSha256 !== tectonicSourcesSha256()) stale.push("tectonic history");
    if (climate?.sourcesSha256 !== climateSourcesSha256()) stale.push("ocean climate");
    if (asset.sourceFingerprint !== eymFingerprintFromRepo()) stale.push("cartography");
    if (world.drainage?.sourcesSha256 !== drainageSourcesSha256()) stale.push("drainage");
    if (world.wind?.sourcesSha256 !== windSourcesSha256()) stale.push("wind");
    if (world.flow?.sourcesSha256 !== flowSourcesSha256()) stale.push("river flow");
    if (world.coasts?.sourcesSha256 !== coastSourcesSha256()) stale.push("coast survey");
    const fp = regionFingerprint(); if (world.regionFingerprint?.shapes !== fp.shapes || world.regionFingerprint?.paint !== fp.paint) stale.push("Region fingerprint");
    rule("up-to-date", "every derived file is up to date with what it is made from", stale.length === 0, stale.length ? `stale: ${stale.join(", ")} (run npm run world)` : "");
    const managed = managedPinsOf(world), moved = Object.keys(managed).filter((k) => pins.managed[k]?.value !== managed[k]);
    // (A moved pin is a change waiting to be accepted, not a broken world: a warning here. The test that reads the
    // pin, tests/cartography-acceptance.test.mjs, fails until it is accepted, so it cannot be released unnoticed.)
    rule("managed-pins", "the managed pins record the world as it is", moved.length === 0, moved.length ? `moved: ${moved.join(", ")} (accept with node tools/world.mjs --accept-pins --note "…")` : "", "should");
  }
  return out;
}
