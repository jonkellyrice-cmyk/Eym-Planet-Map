// Eym's world as data, read whole from one place (the working tree or a git commit), and what changed between two
// such readings, layer by layer. The change report (tools/world.mjs) and the standing checks
// (tools/world-checks.mjs) are built on this; nothing here writes anything.
//
// A "world" is the parsed derived data: the tectonic history, the ocean climate and Eym's cartography asset
// with its companion files. A "summary" is the numbers worth comparing; "compareWorlds" sets two side by side and
// flags what a person should look at.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { splitRingAtAntimeridian } from "../scripts/geo-wrap.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const ASSET = "data/planet-cartography/mitkear/eym";
/** The files a world is read from (the registry CSV carries Eym's input fingerprint). */
export const WORLD_FILES = Object.freeze({
  tectonics: "data/eym/tectonics.json", growth: "data/eym/growth.json", climate: "data/eym/climate.json", asset: `${ASSET}.json`, geology: `${ASSET}-geology.json`, ocean: `${ASSET}-ocean.json`,
  drainage: `${ASSET}-drainage.json`, wind: `${ASSET}-wind.json`, flow: `${ASSET}-flow.json`, coasts: `${ASSET}-coasts.json`, magnetic: "data/eym/magnetic.json", caren: "data/eym/caren.json", regionFingerprint: "data/eym/region-fingerprint.json", registry: "docs/system-orbital-distances.csv", overrides: "data/eym/overrides.json",
});

/** A reader of the working tree: path → text, or null where there is no such file. */
export const treeReader = (dir = repoRoot) => (path) => { const full = `${dir.replace(/\/$/, "")}/${path}`; return existsSync(full) ? readFileSync(full, "utf8") : null; };
/** A reader of a commit (any git revision): path → text, or null where the commit has no such file. */
export const refReader = (ref, dir = repoRoot) => (path) => { try { return execFileSync("git", ["show", `${ref}:${path}`], { cwd: dir, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] }); } catch { return null; } };

/** Read a world through a reader. Missing files are null (an older commit may not have them all). */
export function loadWorld(read) {
  const text = Object.fromEntries(Object.entries(WORLD_FILES).map(([key, path]) => [key, read(path)]));
  const json = (key) => (text[key] ? JSON.parse(text[key]) : null);
  return { text, tectonics: json("tectonics"), growth: json("growth"), climate: json("climate"), asset: json("asset"), geology: json("geology"), ocean: json("ocean"), drainage: json("drainage"), wind: json("wind"), flow: json("flow"), coasts: json("coasts"), magnetic: json("magnetic"), caren: json("caren"), regionFingerprint: json("regionFingerprint"), registry: text.registry, overrides: json("overrides") };
}

// ---------------------------------------------------------------- decoding

const bytes = (b64) => Uint8Array.from(Buffer.from(b64, "base64"));
const int8 = (b64) => { const b = bytes(b64); return new Int8Array(b.buffer, b.byteOffset, b.byteLength); };
export const sha256 = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const category = (raster) => { const values = bytes(raster.valuesBase64); return { names: raster.categories, at: (i) => raster.categories[values[i]], length: values.length }; };
/** The asset's height grid (m), 1° cells, rows from the south. */
export function heights(asset) {
  if (asset.raster.elevationM) return Int16Array.from(asset.raster.elevationM);
  const b = bytes(asset.raster.elevationInt16Base64), view = new DataView(b.buffer, b.byteOffset, b.byteLength), out = new Int16Array(b.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = view.getInt16(i * 2, true);
  return out;
}
const isSea = (biome) => /ocean|sea-ice/.test(biome);

/**
 * Point in a closed ring of [lat, lon] that does not cross ±180°. (A ring that crosses is first cut there, below:
 * taking each corner's longitude "near the point" tears a wide ring on the far side of the world from the point,
 * and gave a continent that reaches across ±180° the cells of lands half a world away.)
 */
function inRing(ring, lat, lon) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [yi, xi] = ring[i], [yj, xj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Which landmass each 1° land cell belongs to: the continent whose coastline holds its centre, else the nearest
 * continent's coast within 4°, else "islands". Returns an array of names (null over the sea).
 */
export function cellContinents(asset) {
  const { latCount, lonCount } = asset.grid, biome = category(asset.raster.biome), out = new Array(latCount * lonCount).fill(null);
  // Each coast as rings that lie on one side of ±180° (scripts/geo-wrap.mjs): one ring for a coast that does not cross.
  const rings = asset.terrain.coastlines.filter((c) => c.continent && c.closed !== false).flatMap((c) => splitRingAtAntimeridian(c.points).map((points) => {
    let s = 90, n = -90; for (const [la] of points) { if (la < s) s = la; if (la > n) n = la; }
    return { name: c.continent, points, s, n };
  }));
  for (let r = 0; r < latCount; r += 1) for (let c = 0; c < lonCount; c += 1) {
    const i = r * lonCount + c; if (isSea(biome.at(i))) continue;
    const lat = -90 + (r + 0.5) * (180 / latCount), lon = -180 + (c + 0.5) * (360 / lonCount);
    let name = rings.find((g) => lat >= g.s && lat <= g.n && inRing(g.points, lat, lon))?.name ?? null;
    if (!name) {
      let best = 4; for (const g of rings) { if (lat < g.s - 4 || lat > g.n + 4) continue; for (const [la, lo] of g.points) { const d = Math.hypot(la - lat, ((((lo - lon) % 360) + 540) % 360 - 180) * Math.cos(lat * Math.PI / 180)); if (d < best) { best = d; name = g.name; } } }
    }
    out[i] = name ?? "islands";
  }
  return out;
}

// ---------------------------------------------------------------- the summary

/** Each continent's mainland (its largest coastline) as a box: { south, north, west, spanDeg } (west may be past 180° W of the span's end; the span runs east from it). */
function mainlandBoxes(asset) {
  const out = {};
  for (const c of asset.terrain.coastlines) {
    if (!c.continent || (out[c.continent]?.areaKm2 ?? -1) >= (c.areaKm2 ?? 0)) continue;
    const lats = c.points.map((p) => p[0]), lon0 = c.points[0][1], rel = c.points.map((p) => (((p[1] - lon0) % 360) + 540) % 360 - 180), west = Math.min(...rel), east = Math.max(...rel);
    out[c.continent] = { areaKm2: c.areaKm2 ?? 0, south: Math.min(...lats), north: Math.max(...lats), west: lon0 + west, spanDeg: east - west };
  }
  return out;
}

const histogram = (items) => { const out = {}; for (const x of items) out[x] = (out[x] ?? 0) + 1; return out; };
const round = (x, k = 100) => Math.round(x * k) / k;

/** The survey of the coasts in numbers, by continent: points, how many lie in bays and in funnels, the largest funnel gain, the median shelf width. Null without a survey. */
function coastSummary(doc) {
  if (!doc) return null;
  const col = (name) => doc.fields.indexOf(name), [iC, iBay, iGain, iShelf, iLat, iLon] = ["continent", "bay", "funnelGain", "shelfKm", "lat", "lon"].map(col), out = {};
  for (const name of doc.continents) {
    const rows = doc.samples.filter((s) => s[iC] === name), shelves = rows.map((s) => s[iShelf]).sort((a, b) => a - b);
    out[name] = { points: rows.length, bays: rows.filter((s) => s[iBay]).length, funnels: rows.filter((s) => s[iGain] > 1.2).length, maxGain: Math.max(1, ...rows.map((s) => s[iGain])), medianShelfKm: shelves.length ? shelves[shelves.length >> 1] : 0 };
  }
  // Each point's funnel gain by place, to find where the tide changed.
  return { byContinent: out, gains: new Map(doc.samples.map((s) => [`${s[iLat]},${s[iLon]}`, s[iGain]])), points: doc.samples.map((s) => ({ continent: s[iC], lat: s[iLat], lon: s[iLon], gain: s[iGain], shelfKm: s[iShelf] })) };
}

/** The numbers of a world worth comparing (null where a world has no asset). */
export function summarizeWorld(world) {
  const { asset, tectonics, climate, ocean, geology, drainage } = world; if (!asset) return null;
  const { latCount, lonCount } = asset.grid, n = latCount * lonCount, biome = category(asset.raster.biome), soil = category(asset.raster.soil), resource = category(asset.raster.resource), height = heights(asset), owner = cellContinents(asset);
  const names = [...new Set([...asset.gazetteer.filter((f) => f.featureClass === "continent").map((f) => f.properName), "islands"])];
  const continents = Object.fromEntries(names.map((name) => {
    const cells = []; for (let i = 0; i < n; i += 1) if (owner[i] === name) cells.push(i);
    const coast = asset.terrain.coastlines.filter((c) => c.continent === name), hs = cells.map((i) => height[i]);
    return [name, {
      cells: cells.length, coastSha256: name === "islands" ? null : sha256(coast), coastAreaKm2: Math.round(coast.reduce((s, c) => s + (c.areaKm2 ?? 0), 0)),
      highestM: hs.length ? Math.max(...hs) : null, meanHeightM: hs.length ? Math.round(hs.reduce((a, b) => a + b, 0) / hs.length) : null,
      biomes: histogram(cells.map((i) => biome.at(i))), rivers: asset.hydrology.rivers.filter((r) => r.continent === name).length, lakes: asset.hydrology.lakes.filter((l) => l.continent === name).length,
      settlements: asset.settlements.filter((s) => s.continent === name).length,
    }];
  }));
  let land = 0; for (let i = 0; i < n; i += 1) if (!isSea(biome.at(i))) land += 1;
  const seasons = climate?.seasons ?? [], yearly = (key) => (seasons.length ? seasons[0][key].map((_, i) => seasons.reduce((s, x) => s + x[key][i], 0) / seasons.length) : []);
  const u = yearly("u"), v = yearly("v"), sst = yearly("sstAnomaly"), up = yearly("upwelling"), speed = u.map((x, i) => Math.hypot(x, v[i])), moving = speed.filter((s) => s > 0);
  return {
    fingerprint: asset.sourceFingerprint, waterFraction: asset.terrain.realizedWaterFraction, landCells: land, continents, mainlands: mainlandBoxes(asset),
    labels: { gazetteer: asset.gazetteer.map((f) => `${f.featureClass}: ${f.properName}`).sort(), settlements: asset.settlements.filter((s) => s.properName).map((s) => `${s.kind}: ${s.properName}`).sort() },
    hydrology: { rivers: asset.hydrology.rivers.length, lakes: asset.hydrology.lakes.length, wetlands: asset.hydrology.wetlands.length, glaciers: asset.hydrology.glaciers.length, drainageChannels: drainage?.channelLengths?.length ?? null },
    plates: tectonics ? {
      seed: tectonics.seed, count: tectonics.plates.length, speeds: Object.fromEntries((tectonics.report?.plateSpeeds ?? []).map((p) => [p.id, { mmYr: p.speedMmYr, driver: p.driver }])),
      volcanoes: tectonics.volcanoes.length, hotspots: tectonics.volcanoes.filter((x) => x.setting === "hotspot").length, upwellings: tectonics.mantle?.upwellings ?? null,
      continents: Object.fromEntries(Object.entries(tectonics.continents ?? {}).map(([id, c]) => [c.name ?? id, { areaKm2: Math.round(c.mainlandAreaKm2), targetKm2: Math.round(c.targetAreaKm2), driftMmYr: c.driftMmYr }])),
    } : null,
    ocean: climate ? {
      model: climate.model, meanSpeed: round(moving.reduce((a, b) => a + b, 0) / (moving.length || 1), 1000), maxSpeed: round(Math.max(0, ...speed)),
      sstMin: round(Math.min(0, ...seasons.flatMap((s) => s.sstAnomaly)), 10), sstMax: round(Math.max(0, ...seasons.flatMap((s) => s.sstAnomaly)), 10), strongUpwellingCells: up.filter((x) => x > 0.3).length, enso: climate.enso?.basin ?? null,
    } : null,
    fields: { biome, soil, resource, height, owner, sst, u, v, up, climateRes: climate?.resolutionDeg ?? null, latCount, lonCount },
    volcanoesOnMap: geology?.geology?.volcanoes?.length ?? null, hasOceanFile: Boolean(ocean),
    regionFingerprint: world.regionFingerprint ? { shapes: world.regionFingerprint.shapes, paint: world.regionFingerprint.paint } : null,
    overrides: (world.overrides?.overrides ?? []).map((o) => JSON.stringify(o)),
    coasts: coastSummary(world.coasts),
  };
}

// ---------------------------------------------------------------- the comparison

/** What a change must exceed before it is flagged for a person to look at. */
export const LOOK_AT = Object.freeze({ biomeShare: 0.1, highestM: 200, landCells: 0, sstC: 1.5, meanSpeedShare: 0.15, plateSpeedMm: 5, funnelGain: 0.3, shelfKm: 30 });
/** The continents whose coastlines are invariants (the owner's maps): any change to them is an error, never a judgement call. */
export const FIXED_COASTS = Object.freeze(["Caren", "Garyk"]);

const listDiff = (a, b) => { const A = new Set(a), B = new Set(b); return { added: b.filter((x) => !A.has(x)), removed: a.filter((x) => !B.has(x)) }; };
const pairs = (hist) => Object.entries(hist).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ×${v}`).join(", ");

/**
 * Two summaries side by side: { same, sections: [{ title, lines, flags }], flags, errors }. A flag asks for a
 * person's look (a change past LOOK_AT); an error is a broken invariant (a fixed coast moved).
 */
export function compareWorlds(before, after) {
  const sections = [], flags = [], errors = [], section = (title) => { const s = { title, lines: [], flags: [] }; sections.push(s); return s; };
  const flag = (s, text) => { s.flags.push(text); flags.push(`${s.title}: ${text}`); };
  if (!before || !after) return { same: false, sections: [{ title: "World", lines: [before ? "the later world has no asset" : "the earlier world has no asset: nothing to compare"], flags: [] }], flags, errors };
  const fb = before.fields, fa = after.fields, n = Math.min(fb.biome.length, fa.biome.length);

  const world = section("The world as a whole");
  if (before.fingerprint !== after.fingerprint) world.lines.push(`Input fingerprint ${before.fingerprint} → ${after.fingerprint}.`);
  if (before.waterFraction !== after.waterFraction) world.lines.push(`Ocean share ${(before.waterFraction * 100).toFixed(2)}% → ${(after.waterFraction * 100).toFixed(2)}%.`);
  let gained = 0, lost = 0; for (let i = 0; i < n; i += 1) { const a = isSea(fb.biome.at(i)), b = isSea(fa.biome.at(i)); if (a && !b) gained += 1; if (!a && b) lost += 1; }
  if (gained || lost) { world.lines.push(`Land cells ${before.landCells} → ${after.landCells} (${gained} gained, ${lost} lost).`); if (gained + lost > LOOK_AT.landCells) flag(world, `land changed: ${gained} cells gained, ${lost} lost`); }
  let heightChanged = 0, heightMax = 0; for (let i = 0; i < n; i += 1) { const d = Math.abs(fa.height[i] - fb.height[i]); if (d) { heightChanged += 1; if (d > heightMax) heightMax = d; } }
  if (heightChanged) world.lines.push(`Heights changed in ${heightChanged} of ${n} cells (land and sea floor), by up to ${heightMax} m.`);

  const land = section("Continents");
  for (const name of [...new Set([...Object.keys(before.continents), ...Object.keys(after.continents)])]) {
    const a = before.continents[name], b = after.continents[name];
    if (!a || !b) { land.lines.push(`${name}: ${a ? "gone" : "new"}.`); flag(land, `${name} ${a ? "is gone" : "is new"}`); continue; }
    const parts = [];
    if (a.coastSha256 !== b.coastSha256) { parts.push(`coastline changed (area ${a.coastAreaKm2.toLocaleString("en")} → ${b.coastAreaKm2.toLocaleString("en")} km²)`); if (FIXED_COASTS.includes(name)) errors.push(`${name}'s coastline changed: it is an invariant (the owner's map)`); else flag(land, `${name}'s coastline changed`); }
    if (a.cells !== b.cells) parts.push(`land cells ${a.cells} → ${b.cells}`);
    if (a.highestM !== b.highestM) { parts.push(`highest point ${a.highestM} → ${b.highestM} m`); if (Math.abs(a.highestM - b.highestM) > LOOK_AT.highestM) flag(land, `${name}'s highest point moved by ${b.highestM - a.highestM} m`); }
    const moved = {}; let changed = 0;
    for (let i = 0; i < n; i += 1) if (fa.owner[i] === name || fb.owner[i] === name) { const x = fb.biome.at(i), y = fa.biome.at(i); if (x !== y) { changed += 1; moved[`${x} → ${y}`] = (moved[`${x} → ${y}`] ?? 0) + 1; } }
    if (changed) { parts.push(`biome changed in ${changed} of ${b.cells} cells (${pairs(moved)})`); if (changed / Math.max(1, b.cells) > LOOK_AT.biomeShare) flag(land, `${name}: ${changed} of ${b.cells} cells changed biome`); }
    let soils = 0, resources = 0; for (let i = 0; i < n; i += 1) if (fa.owner[i] === name) { if (fb.soil.at(i) !== fa.soil.at(i)) soils += 1; if (fb.resource.at(i) !== fa.resource.at(i)) resources += 1; }
    if (soils) parts.push(`soil changed in ${soils} cells`); if (resources) parts.push(`resources changed in ${resources} cells`);
    for (const key of ["rivers", "lakes", "settlements"]) if (a[key] !== b[key]) parts.push(`${key} ${a[key]} → ${b[key]}`);
    land.lines.push(parts.length ? `${name}: ${parts.join("; ")}.` : `${name}: unchanged.`);
  }

  const water = section("Rivers, lakes and drainage");
  for (const [key, label] of [["rivers", "rivers"], ["lakes", "lakes"], ["wetlands", "wetlands"], ["glaciers", "glaciers"], ["drainageChannels", "drainage channels"]]) if (before.hydrology[key] !== after.hydrology[key]) water.lines.push(`${label} ${before.hydrology[key]} → ${after.hydrology[key]}.`);

  const names = section("Names on the map");
  for (const [key, label] of [["gazetteer", "features"], ["settlements", "settlements"]]) { const d = listDiff(before.labels[key], after.labels[key]); if (d.added.length) names.lines.push(`New ${label}: ${d.added.join("; ")}.`); if (d.removed.length) names.lines.push(`Removed ${label}: ${d.removed.join("; ")}.`); }

  const plates = section("Plates and volcanoes");
  if (before.plates && after.plates) {
    if (before.plates.seed !== after.plates.seed) { plates.lines.push(`The plate fit kept a different seed: ${before.plates.seed} → ${after.plates.seed}.`); flag(plates, "the plate fit chose a different seed (new plates, boundaries and sea floor)"); }
    if (before.plates.count !== after.plates.count) plates.lines.push(`Plates ${before.plates.count} → ${after.plates.count}.`);
    for (const id of new Set([...Object.keys(before.plates.speeds), ...Object.keys(after.plates.speeds)])) { const a = before.plates.speeds[id], b = after.plates.speeds[id]; if (a?.mmYr !== b?.mmYr || a?.driver !== b?.driver) { plates.lines.push(`Plate ${id}: ${a ? `${a.mmYr} mm a year (${a.driver})` : "new"} → ${b ? `${b.mmYr} mm a year (${b.driver})` : "gone"}.`); if (a && b && Math.abs(a.mmYr - b.mmYr) > LOOK_AT.plateSpeedMm) flag(plates, `plate ${id} changed speed by ${round(b.mmYr - a.mmYr, 10)} mm a year`); } }
    for (const key of ["volcanoes", "hotspots"]) if (before.plates[key] !== after.plates[key]) plates.lines.push(`${key} ${before.plates[key]} → ${after.plates[key]}.`);
    for (const name of Object.keys(after.plates.continents)) { const a = before.plates.continents[name], b = after.plates.continents[name]; if (a && (a.areaKm2 !== b.areaKm2 || a.targetKm2 !== b.targetKm2)) plates.lines.push(`${name}: fitted area ${a.areaKm2.toLocaleString("en")} → ${b.areaKm2.toLocaleString("en")} km² (asked for ${b.targetKm2.toLocaleString("en")}).`); }
  } else if (before.plates || after.plates) plates.lines.push(before.plates ? "The tectonic history is gone." : "A tectonic history was added.");

  const sea = section("Ocean: currents, sea temperature, upwelling");
  if (before.ocean && after.ocean) {
    if (before.ocean.model !== after.ocean.model) sea.lines.push(`Ocean model ${before.ocean.model} → ${after.ocean.model}.`);
    if (before.ocean.meanSpeed !== after.ocean.meanSpeed) { sea.lines.push(`Mean current speed ${before.ocean.meanSpeed} → ${after.ocean.meanSpeed} m/s.`); if (Math.abs(after.ocean.meanSpeed - before.ocean.meanSpeed) / (before.ocean.meanSpeed || 1) > LOOK_AT.meanSpeedShare) flag(sea, "mean current speed changed by more than 15%"); }
    if (fb.sst.length && fb.sst.length === fa.sst.length) {
      let sum = 0, max = 0, over = 0, k = 0; for (let i = 0; i < fa.sst.length; i += 1) { const d = Math.abs(fa.sst[i] - fb.sst[i]); if (fa.u[i] || fa.v[i] || fb.u[i] || fb.v[i]) { k += 1; sum += d; if (d > max) max = d; if (d > 0.5) over += 1; } }
      if (max > 0) { sea.lines.push(`Yearly sea temperature anomaly changed by ${round(sum / (k || 1))} °C on average and ${round(max, 10)} °C at most; ${over} of ${k} sea cells by more than 0.5 °C.`); if (max > LOOK_AT.sstC) flag(sea, `sea temperature changed by up to ${round(max, 10)} °C`); }
    }
    if (before.ocean.strongUpwellingCells !== after.ocean.strongUpwellingCells) sea.lines.push(`Cells of strong upwelling ${before.ocean.strongUpwellingCells} → ${after.ocean.strongUpwellingCells}.`);
    if (JSON.stringify(before.ocean.enso) !== JSON.stringify(after.ocean.enso)) { sea.lines.push(`The El Niño basin moved: ${JSON.stringify(before.ocean.enso)} → ${JSON.stringify(after.ocean.enso)}.`); flag(sea, "the El Niño basin moved"); }
  }

  const shelves = section("Coasts: shelves, bays and the tide's funnelling");
  if (before.coasts && after.coasts) {
    for (const name of new Set([...Object.keys(before.coasts.byContinent), ...Object.keys(after.coasts.byContinent)])) {
      const a = before.coasts.byContinent[name], b = after.coasts.byContinent[name];
      if (!a || !b) { shelves.lines.push(`${name}: ${a ? "no longer surveyed" : "now surveyed"}.`); continue; }
      const parts = []; for (const [key, label] of [["points", "coast points"], ["bays", "points in bays"], ["funnels", "points in funnel bays"], ["maxGain", "largest funnel gain"], ["medianShelfKm", "median shelf width (km)"]]) if (a[key] !== b[key]) parts.push(`${label} ${a[key]} → ${b[key]}`);
      if (parts.length) shelves.lines.push(`${name}: ${parts.join("; ")}.`);
      if (Math.abs(a.medianShelfKm - b.medianShelfKm) > LOOK_AT.shelfKm) flag(shelves, `${name}'s shelves changed width (median ${a.medianShelfKm} → ${b.medianShelfKm} km)`);
    }
    let moved = 0, most = 0; for (const [place, gain] of after.coasts.gains) { const was = before.coasts.gains.get(place); if (was !== undefined && Math.abs(gain - was) > LOOK_AT.funnelGain) { moved += 1; most = Math.max(most, Math.abs(gain - was)); } }
    if (moved) { shelves.lines.push(`The tide's funnel gain changed by more than ${LOOK_AT.funnelGain} at ${moved} coast points (by up to ${round(most)}).`); flag(shelves, `tides changed at ${moved} coast points`); }
  } else if (before.coasts || after.coasts) shelves.lines.push(after.coasts ? `A survey of the coasts was added: ${Object.entries(after.coasts.byContinent).map(([n, c]) => `${n} ${c.points} points, ${c.bays} in bays, ${c.funnels} in funnel bays (largest gain ${c.maxGain}), median shelf ${c.medianShelfKm} km`).join("; ")}.` : "The survey of the coasts is gone.");

  const authored = section("Hand-authored overrides");
  { const d = listDiff(before.overrides ?? [], after.overrides ?? []), id = (text) => JSON.parse(text).id; if (d.added.length) authored.lines.push(`Added or changed: ${d.added.map(id).join(", ")}.`); if (d.removed.length) authored.lines.push(`Removed or changed: ${d.removed.map(id).join(", ")}.`); }

  const tiles = section("Stored map tiles");
  if (JSON.stringify(before.regionFingerprint) !== JSON.stringify(after.regionFingerprint)) tiles.lines.push(before.regionFingerprint?.shapes !== after.regionFingerprint?.shapes ? "The Region tiles' shapes fingerprint changed: every stored tile is made again after release." : "Only the Region tiles' painting changed: stored tiles are repainted after release.");

  for (const s of sections) if (!s.lines.length) s.lines.push("No change.");
  return { same: sections.every((s) => s.lines.every((line) => line === "No change." || / unchanged\.$/.test(line))), sections, flags, errors };
}
