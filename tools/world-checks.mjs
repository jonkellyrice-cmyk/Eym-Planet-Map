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
import { tectonicContentSha256 } from "./generate-eym-growth.mjs";
import { riverCourses } from "../scripts/eym-river-courses.mjs";
import { riverCatchments } from "../scripts/eym-landforms.mjs";

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
  if (!asset) { rule("asset", "Eym has a cartography asset", false, "missing"); return out; }
  const summary = summarizeWorld(world), { latCount, lonCount } = asset.grid, n = latCount * lonCount, height = heights(asset), owner = cellContinents(asset), biome = summary.fields.biome;

  // The hand-authored exceptions are sound (each says what, where and why).
  if (world.overrides) { const problems = overrideProblems(world.overrides); rule("overrides", "every hand-authored override says what it sets, where and why", problems.length === 0, problems.join("; ")); }

  // The owner's maps.
  for (const [name, pin] of Object.entries(pins.fixed.coastSha256)) rule(`coast-${name.toLowerCase()}`, `${name}'s coastline is the owner's map, unchanged`, summary.continents[name]?.coastSha256 === pin, summary.continents[name] ? "" : "no such continent");

  // What is shipped stays small enough to load: each data file, and all together, within the budget set against
  // their sizes before the land grew (tools/world-pins.json; land-growth scaling, Fix 7).
  for (const line of dataBudget(world, pins)) rule(line.id, line.rule, line.ok, line.detail);

  // An ocean world with its continents.
  // (Canon of 19 November 2026: about 80%. A world from before the continents were grown is held to what it was.)
  const { WORLD_INPUTS } = await import("../scripts/eym-world-inputs.mjs"), [seaLo, seaHi] = world.growth ? WORLD_INPUTS.growth.oceanFraction : [0.98, 0.99];
  rule("ocean-share", `the ocean covers ${(seaLo * 100).toFixed(1)}% to ${(seaHi * 100).toFixed(1)}% of the world`, summary.waterFraction >= seaLo - 0.004 && summary.waterFraction <= seaHi + 0.004, `${(summary.waterFraction * 100).toFixed(2)}% (counted on the 1° map)`);
  if (world.growth) {
    const g = world.growth, d = WORLD_INPUTS.growth, grown = Object.values(g.continents);
    rule("growth-areas", "each grown continent is within the canon's tolerance of its area, and the ocean's share is the canon's", grown.every((c) => Math.abs(c.areaKm2 / d.areaKm2[c.id] - 1) <= d.tolerance) && g.oceanFraction >= d.oceanFraction[0] && g.oceanFraction <= d.oceanFraction[1], grown.map((c) => `${c.name} ${(c.areaKm2 / 1e6).toFixed(1)} Mkm²`).join(", ") + `; ocean ${(g.oceanFraction * 100).toFixed(2)}%`);
    rule("growth-clearance", "the grown continents keep clear of Caren, Garyk, the crossing and each other", grown.every((c) => c.clearanceKm.caren >= d.clearanceKm.caren - 60 && c.clearanceKm.garyk >= d.clearanceKm.garyk - 60 && (c.clearanceKm.between ?? Infinity) >= d.clearanceKm.between - 60), grown.map((c) => `${c.name}: Caren ${c.clearanceKm.caren} km, Garyk ${c.clearanceKm.garyk} km${c.clearanceKm.between ? `, the others ${c.clearanceKm.between} km` : ""}`).join("; "));
    rule("growth-tectonics", "the growth changed nothing in the tectonic history it was made from", tectonics && g.tectonics.contentSha256 === tectonicContentSha256(tectonics) && g.tectonics.plateBoundariesMoved === 0, "");
    rule("tectonics-fixed", "the tectonic history is the one the continents were grown on (canon: the least change)", !pins.fixed.tectonicsContentSha256 || tectonicContentSha256(tectonics ?? {}) === pins.fixed.tectonicsContentSha256, "");
  }
  const continents = asset.gazetteer.filter((f) => f.featureClass === "continent").map((f) => f.properName);
  rule("continents", "every named continent has land and a coastline", continents.length >= 2 && continents.every((c) => summary.continents[c]?.cells > 0 && asset.terrain.coastlines.some((x) => x.continent === c)), continents.map((c) => `${c} ${summary.continents[c]?.cells ?? 0}`).join(", "));

  // The open sea is below sea level. (A cell with some land in it keeps its land biome but may hold the sea
  // floor's height, so the rule is about cells with no land at all.)
  let wrongSea = 0; for (let i = 0; i < n; i += 1) if (!owner[i] && height[i] >= 0) wrongSea += 1;
  rule("heights", "every open-sea cell is below sea level", wrongSea === 0, `${wrongSea} sea cells at or above 0 m`);
  const top = Math.max(...height), deep = Math.min(...height);
  rule("height-range", "no mountain above 9,000 m and no trench below 11,000 m", top <= 9000 && deep >= -11000, `${deep} m to ${top} m`);

  // Water runs somewhere.
  const ends = new Set(["ocean", "river", "lake", "dry"]), strays = asset.hydrology.rivers.filter((r) => !ends.has(String(r.mouth).replace(/[-:].*$/, "")) || (r.points?.length ?? 0) < 2);
  rule("rivers-end", "every river has a course and ends in the sea, a lake, another river or a dry basin", strays.length === 0, strays.slice(0, 5).map((r) => `${r.id} → ${r.mouth}`).join(", "));
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

  // The magnetic field keeps its canon (docs/eym-canon.md): the pole in its box of open sea, moving slowly; the
  // protected continents near the magnetic equator, where no aurora is ever seen.
  if (world.magnetic) {
    const m = world.magnetic, d = WORLD_INPUTS.magnetic, lands = Object.entries(m.continents);
    rule("magnetic-pole", "the north magnetic pole stays inside its box and moves at the canon's pace", m.poleLatDeg[0] >= d.poleBox.latDeg[0] && m.poleLatDeg[1] <= d.poleBox.latDeg[1] && m.poleLonDeg[0] >= d.poleBox.lonDeg[0] && m.poleLonDeg[1] <= d.poleBox.lonDeg[1] && m.driftKmYr[0] >= d.driftKmYr[0] && m.driftKmYr[1] <= d.driftKmYr[1], `${m.poleLatDeg.join("–")}° N, ${m.poleLonDeg.join("–")}° E; ${m.driftKmYr.join(" to ")} km a year`);
    rule("magnetic-open-sea", `the north magnetic pole lies over open sea, at least ${d.openSeaKm} km from any land`, m.nearestLand.north.km >= d.openSeaKm, `${m.nearestLand.north.km} km to ${m.nearestLand.north.continent}`);
    rule("magnetic-coasts", `every coast of ${d.continents.join(" and ")} lies within ${d.coastLatDeg}° of the magnetic equator`, d.continents.every((c) => m.continents[c]) && lands.every(([, c]) => Math.max(Math.abs(c.coastMagneticLatDeg[0]), Math.abs(c.coastMagneticLatDeg[1])) <= d.coastLatDeg), lands.map(([name, c]) => `${name} ${c.coastMagneticLatDeg.join(" to ")}°`).join("; "));
    rule("magnetic-no-aurora", `no aurora is ever seen from ${d.continents.join(" or ")}, however great the storm`, m.auroraNeverBelowDeg === d.aurora.greatStormDeg[0] && lands.every(([, c]) => c.auroraMarginDeg > 0), lands.map(([name, c]) => `${name} ${c.auroraMarginDeg}° clear`).join("; "));
  }

  // Caren's land follows from its natural history (canon of 20 November 2026, docs/eym-canon.md): the survey of it
  // (tools/generate-eym-caren.mjs) stays within what the canon and the physics allow.
  if (world.caren) {
    const c = world.caren, d = WORLD_INPUTS.caren, s = c.support, sides = Object.entries(c.ramps), within = (v, lo, hi) => v >= lo && v <= hi;
    rule("caren-latitudes", "Caren spans about 9.9° S to 8.7° N (with its islands, a little more)", within(c.latitudes[0], -10.5, -9.5) && within(c.latitudes[1], 8.4, 9.1), `${c.latitudes[0]}° to ${c.latitudes[1]}°`);
    rule("caren-plateau", "the plateau north of the Sondel stands at 1,200 to 2,000 m", c.plateau.squares > 100 && c.plateau.heightM[1] >= 1200 && c.plateau.heightM[3] <= 2000, `${c.plateau.heightM[1]} to ${c.plateau.heightM[3]} m (the middle four fifths; the middle ${c.plateau.heightM[2]} m)`);
    rule("caren-support", "the plateau is held up: crust of 34 to 45 km, a mantle swell pushing no more than 1,100 m, nothing left unsupported; the massifs' rock bears their weight", within(s.crustKm[0], 34, 45) && within(s.crustKm[1], 34, 45) && s.swellPushM <= 1100 && s.unsupportedM <= 1 && s.massifLoadMpa < s.rockStrengthMpa, `crust ${s.crustKm.join(" to ")} km; swell's push ${s.swellPushM} m; unsupported ${s.unsupportedM} m; massifs ${s.massifLoadMpa} of ${s.rockStrengthMpa} MPa`);
    rule("caren-ramps", "every northern coast rises to the plateau by a long, gentle ramp (100 to 300 km, 0.4 to 2%, rising all the way), with no cliff coast", sides.every(([, r]) => r.risesAllTheWay && within(r.rampKm, 100, 300) && within(r.meanPercent, 0.4, 2) && r.steepestPercent <= 2) && c.northernShoreM.highest <= 250, `${sides.map(([side, r]) => `${side}: ${r.rampKm} km at ${r.meanPercent}% (steepest ${r.steepestPercent}%)`).join("; ")}; the land within 12 km of the sea no higher than ${c.northernShoreM.highest} m`);
    rule("caren-peaks", "no natural summit stands higher than hard rock, small faults and the crust's rebound can hold it above the plateau, and none below the snow line is counted as snowy", c.peaks.every((p) => p.heightM <= p.plateauRoundM + s.massifReliefM * 1.15 && p.snowAllYear === (p.heightM >= c.snowLineM)), `${c.peaks.map((p) => `${p.name} ${p.heightM} m`).join(", ")}; snow all year above ${c.snowLineM} m`);
    rule("caren-hills", "the Trate Hills and the Sarven Hills are hills (their tops between 500 and 1,500 m)", c.hills.length === d.hills.length && c.hills.every((h) => within(h.heightM[2], 500, 1500)), c.hills.map((h) => `${h.name} ${h.heightM[2]} m`).join(", "));
    rule("caren-arluna", "the Arluna lakes lie in the ring trough of one impact structure 150 to 200 km across, a skymetal district", c.arluna && within(c.arluna.diameterKm, 150, 200) && c.arluna.skymetal && c.arluna.lakes.length >= 4, c.arluna ? `${c.arluna.diameterKm} km across, centred ${c.arluna.centre.join("°, ")}°` : "none");
    rule("caren-rivers", "the great rivers of the north are tidal in their lowest reach and climb gently above it (no falls)", c.rivers.length >= 3 && c.rivers.every((r) => r.tidalKm >= 50 && r.tidalKm <= 100 && r.gradientMPerKm <= 0.5), c.rivers.map((r) => `${r.id.replace("caren-water-", "water ")}: ${r.lengthKm} km, ${r.headM} m at its head`).join("; "));
  }

  // The rain is the planet's water budget of the air (scripts/eym-rain.mjs): the file holds every land square, with
  // dry country and wet, and nothing absurd.
  if (world.rain) {
    const s = world.rain.summary, tropics = s.landMeanMmByLatBand.filter((b) => b.fromLat >= -20 && b.fromLat < 20 && b.squares), dry = s.landMeanMmByLatBand.filter((b) => (b.fromLat === 20 || b.fromLat === 30 || b.fromLat === -30 || b.fromLat === -40) && b.squares);
    rule("rain-budget", "the rain file holds every land square, with deserts and wet coasts and no square over 9,000 mm; the tropics' land is wetter than the dry belts'", s.landSquares > 10000 && s.wettest.mm < 9000 && s.driest.mm < 100 && Math.min(...tropics.map((b) => b.meanMm)) > Math.min(...dry.map((b) => b.meanMm)), `${s.landSquares} land squares; wettest ${s.wettest.mm} mm, driest ${s.driest.mm} mm; land between 20° S and 20° N ${tropics.map((b) => b.meanMm).join(", ")} mm by ten degrees`);
  }

  // The crust floats the land, and what the land sheds comes to rest somewhere (scripts/eym-sediment.mjs).
  if (world.crust) {
    const s = world.crust.summary, O = WORLD_INPUTS.orogeny;
    rule("crust-floats", "every land square's crust is between the normal thickness and the crust's limit", s.crustKm[0] >= O.crustKm - 0.01 && s.crustKm[2] <= O.maxCrustKm + 0.01 && s.crustKm[1] > O.crustKm, `${s.crustKm.join(" / ")} km (least, mean, most)`);
    rule("sediment-balance", "all the rock the land sheds comes to rest: in deltas, on shelves, on plains or in closed basins", Math.abs(s.shedKm3PerMyr - s.restedKm3PerMyr) <= 0.005 * s.shedKm3PerMyr && s.restsBy.delta > 0 && s.restsBy.plain > 0, `${s.shedKm3PerMyr} km³ a million years shed, ${s.restedKm3PerMyr} at rest (${Object.entries(s.restsBy).map(([k, v]) => `${k} ${v}`).join(", ")})`);
    rule("wear-plausible", "the land's mean wear is between 20 and 120 m a million years (Earth's is about 50)", s.wearMPerMyr.mean >= 20 && s.wearMPerMyr.mean <= 120, `mean ${s.wearMPerMyr.mean}, middle ${s.wearMPerMyr.middle}, most ${s.wearMPerMyr.most} m a million years`);
  }

  // Rivers carry the climate (owner, 20 November 2026): the drainage measures the land each drawn river truly drains
  // and its runoff. The drawn rivers stay as drawn; one whose modelled flow is far below what its drawn bed would
  // carry is reported, for the owner to weigh.
  if (world.drainage?.rivers && world.asset) {
    const asset = { ...world.asset, drainage: world.drainage }, catchments = riverCatchments(asset), ref = WORLD_INPUTS.weather.riverReferenceRunoffMm, flowM3s = (areaKm2, mm) => areaKm2 * 1e6 * mm / 1000 / 31_557_600;
    const rows = riverCourses(world.asset).filter((r) => !/estuary$/.test(r.id)).map((r) => { const at = catchments.get(r.id), most = at?.reduce((a, b) => (b.areaKm2 * b.runoffMm > a.areaKm2 * a.runoffMm ? b : a)); return { id: r.id, widthM: Math.round(r.widthM), flow: most ? flowM3s(most.areaKm2, most.runoffMm) : null, bedFlow: flowM3s((r.widthM / 3) ** 2, ref) }; });
    // (The maps draw the great rivers kilometres wide, wider than their water needs, so a bed's width is no measure
    // of its flow; what is asked is that a drawn river carries a river's water at all.)
    const measured = rows.filter((r) => r.flow != null), low = measured.filter((r) => r.flow < (r.widthM >= 2000 ? 100 : 10)).sort((a, b) => a.flow - b.flow);
    rule("rivers-measured", "the drainage measures the land most drawn rivers truly drain", measured.length >= 0.8 * rows.length, `${measured.length} of ${rows.length} drawn river courses`);
    rule("rivers-flow", "every drawn river carries a river's water: at least 10 m³/s in the mean, and 100 m³/s where it is drawn two kilometres wide or more", low.length === 0, `${low.length} of ${measured.length} do not (the land's modelled heights send their water elsewhere, or their country is too dry): ` + low.slice(0, 14).map((r) => `${r.id} (drawn ${r.widthM} m wide) ${r.flow < 10 ? r.flow.toFixed(1) : Math.round(r.flow)} m³/s`).join("; ") + (low.length > 14 ? `; and ${low.length - 14} more` : ""), "should");
  }

  // Caren's climate is measured, not assumed (canon of 20 November 2026): the survey says of each thing the canon
  // expects whether the physics gives it. What is not found is for the owner and the world's author to weigh; it is
  // a warning here, never hidden and never forced.
  if (world.caren?.climate) {
    const k = world.caren.climate, missing = k.expectations.filter((e) => !e.found);
    rule("caren-sea", "a tongue of cold water reaches Caren's west coast, colder still over the islands' ridge", k.sea.coldTongueC <= -0.3 && k.sea.overTheRidgeC <= k.sea.coldTongueC, `${k.sea.coldTongueC} °C west of Caren, ${k.sea.overTheRidgeC} °C over the ridge`);
    rule("caren-seasons", "south Caren has wet and dry seasons, and snow lies all year only above the snow line", k.parts.south.dryMonths >= 3 && k.byHeight.find((h) => h.heightM === 0).snow === "none" && k.byHeight.find((h) => h.heightM === 4800).snow === "all year", `the south ${k.parts.south.annualMm} mm with ${k.parts.south.dryMonths} dry months`);
    rule("caren-climate-measured", "the survey says of each of the canon's expectations whether the physics gives it", k.expectations.length >= 10 && k.expectations.every((e) => typeof e.found === "boolean" && e.measure), `${k.expectations.length - missing.length} of ${k.expectations.length} found`);
    const m = k.mapAgainstRain;
    if (m) rule("caren-map-against-rain", "Caren's map and its rain agree: no forest drawn in dry country, no open land in very wet country, no tan dry ground in wet country", m.forestInDryCountry.disagree.length + m.openInVeryWetCountry.disagree.length + m.tanInWetCountry.disagree.length === 0, `of ${m.squares} squares: ${m.forestInDryCountry.disagree.length} of ${m.forestInDryCountry.squares} mostly forest have under ${m.forestInDryCountry.underMm} mm; ${m.openInVeryWetCountry.disagree.length} of ${m.openInVeryWetCountry.squares} mostly open have over ${m.openInVeryWetCountry.overMm} mm; ${m.tanInWetCountry.disagree.length} of ${m.tanInWetCountry.squares} mostly tan have over ${m.tanInWetCountry.overMm} mm`, "should");
    rule("caren-climate-found", "the physics gives everything the canon expects of Caren's climate", missing.length === 0, missing.map((e) => `${e.expected}: ${e.measure}`).join(" | "), "should");
  }

  // Everything derived is up to date with what it is made from (the working tree only).
  if (current) {
    const [{ tectonicSourcesSha256 }, { climateSourcesSha256 }, { drainageSourcesSha256 }, { windSourcesSha256 }, { flowSourcesSha256 }, { eymFingerprintFromRepo }, { regionFingerprint }, { coastSourcesSha256 }] = await Promise.all([
      import("./generate-eym-tectonics.mjs"), import("./generate-eym-climate.mjs"), import("./generate-eym-drainage.mjs"), import("./generate-eym-wind.mjs"), import("./generate-eym-flow.mjs"), import("./eym-world.mjs"), import("./generate-region-fingerprint.mjs"), import("./generate-eym-coasts.mjs")]), { growthSourcesSha256 } = await import("./generate-eym-growth.mjs");
    const stale = [];
    if (tectonics?.sourcesSha256 !== tectonicSourcesSha256()) stale.push("tectonic history");
    if (world.growth?.sourcesSha256 !== growthSourcesSha256()) stale.push("the continents' growth");
    if (climate?.sourcesSha256 !== climateSourcesSha256()) stale.push("ocean climate");
    if (asset.sourceFingerprint !== eymFingerprintFromRepo()) stale.push("cartography");
    if (world.drainage?.sourcesSha256 !== drainageSourcesSha256()) stale.push("drainage");
    if (world.wind?.sourcesSha256 !== windSourcesSha256()) stale.push("wind");
    if (world.flow?.sourcesSha256 !== flowSourcesSha256()) stale.push("river flow");
    if (world.coasts?.sourcesSha256 !== coastSourcesSha256()) stale.push("coast survey");
    const { magneticSourcesSha256 } = await import("./generate-eym-magnetic.mjs"); if (world.magnetic?.sourcesSha256 !== magneticSourcesSha256()) stale.push("magnetic survey");
    const { carenSourcesSha256 } = await import("./generate-eym-caren.mjs"); if (world.caren?.sourcesSha256 !== carenSourcesSha256()) stale.push("Caren's survey");
    const { rainSourcesSha256 } = await import("./generate-eym-rain.mjs"); if (world.rain?.sourcesSha256 !== rainSourcesSha256()) stale.push("the rain");
    const { energySourcesSha256 } = await import("./generate-eym-energy.mjs"); if (world.energy?.sourcesSha256 !== energySourcesSha256()) stale.push("the hemispheres' energy balance");
    const { crustSourcesSha256 } = await import("./generate-eym-crust.mjs"); if (world.crust?.sourcesSha256 !== crustSourcesSha256()) stale.push("the crust and sediment");
    const fp = regionFingerprint(); if (world.regionFingerprint?.shapes !== fp.shapes || world.regionFingerprint?.paint !== fp.paint) stale.push("Region fingerprint");
    rule("up-to-date", "every derived file is up to date with what it is made from", stale.length === 0, stale.length ? `stale: ${stale.join(", ")} (run npm run world)` : "");
    const managed = managedPinsOf(world), moved = Object.keys(managed).filter((k) => pins.managed[k]?.value !== managed[k]);
    // (A moved pin is a change waiting to be accepted, not a broken world: a warning here. The test that reads the
    // pin, tests/cartography-acceptance.test.mjs, fails until it is accepted, so it cannot be released unnoticed.)
    rule("managed-pins", "the managed pins record the world as it is", moved.length === 0, moved.length ? `moved: ${moved.join(", ")} (accept with node tools/world.mjs --accept-pins --note "…")` : "", "should");
  }
  return out;
}
