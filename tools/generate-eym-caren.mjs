// Surveys Caren's land against its natural history (canon of 20 November 2026, docs/eym-canon.md) and writes
// data/eym/caren.json: the northern plateau and what holds it up (the crust's thickness and the mantle swell's
// push), the ramps from every northern coast, the great rivers' valleys, the heights the massifs of the ancient
// belt reach and whether any stands above the snow line, the hills, the lakes' levels, the Arluna impact
// structure and its skymetal district, and which mountains hold Caren's highest summits. The heights themselves
// come from scripts/eym-caren-relief.mjs through the surface; this measures them, and the world's standing checks
// (tools/world-checks.mjs) read the measures. Drawn by rule from the traced map and the dials; nothing is random.
//
//   node tools/generate-eym-caren.mjs           write the data file
//   node tools/generate-eym-caren.mjs --check   rebuild and compare with the data file

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { buildEymSurface, EYM_LAYOUT, fromLocal, toLocal } from "../scripts/eym-surface.mjs";
import { CAREN_RELIEF_MODEL, carenRelief } from "../scripts/eym-caren-relief.mjs";
import { inputsFingerprint, WORLD_INPUTS } from "../scripts/eym-world-inputs.mjs";

const root = new URL("../", import.meta.url), OUT = new URL("data/eym/caren.json", root);
/** What the survey is made from: this tool, the relief rule, the surface, the traced map and its labels (and the dials, below). */
export const CAREN_SOURCES = ["tools/generate-eym-caren.mjs", "scripts/eym-caren-relief.mjs", "scripts/eym-surface.mjs", "data/eym/traced-continents.json", "data/eym/caren-labels.json"];
/** The groups of dials (scripts/eym-world-inputs.mjs) the survey follows. */
export const CAREN_INPUTS = ["layout", "caren"];
export const carenSourcesSha256 = () => { const h = createHash("sha256"); for (const p of CAREN_SOURCES) h.update(readFileSync(new URL(p, root))); h.update(inputsFingerprint(...CAREN_INPUTS)); return h.digest("hex"); };
/** Above this a summit keeps snow all year at Caren's latitudes (m: the dial), and the air cools this much with each kilometre (°C). */
export const SNOW_LINE_M = WORLD_INPUTS.caren.snowLineM, LAPSE_C_PER_KM = 6.5;
/** North of this latitude a coast is one of the northern coasts the plateau's ramps rise from. */
export const NORTHERN_COAST_LAT = 4.5;

const r0 = (v) => Math.round(v), r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

/** Survey Caren; returns the whole document. */
export function buildCaren(dials = WORLD_INPUTS.caren) {
  const traced = JSON.parse(readFileSync(new URL("data/eym/traced-continents.json", root), "utf8")), labels = JSON.parse(readFileSync(new URL("data/eym/caren-labels.json", root), "utf8"));
  const source = traced.continents.caren, { frames } = buildEymSurface(traced, { ...EYM_LAYOUT, seeded: [], archipelagos: { ...EYM_LAYOUT.archipelagos, centers: [], count: 0 } });
  const frame = frames.find((f) => f.id === "caren"), g = frame.grid, center = frame.center;
  const coastAt = (lat, lon) => { const [x, y] = toLocal(center, lat, lon), c = Math.floor((x - g.x0) / g.cellKm), r = Math.floor((g.y0 - y) / g.cellKm); return c < 0 || r < 0 || c >= g.cols || r >= g.rows ? 0 : frame.seaKm[r * g.cols + c]; };
  const waters = source.inlandWater.map((w) => ({ id: w.id, lake: w.kind === "lake" && !dials.rivers.drawnAsRivers.includes(w.id), ring: w.rings[0].map(([x, y]) => fromLocal(center, x, y).map((v) => Math.round(v * 1000) / 1000)) }));
  const rule = carenRelief(dials, waters, coastAt);
  const placeOf = (label) => fromLocal(center, (label.x - source.originPx[0]) * source.kmPerPixel, (source.originPx[1] - label.y) * source.kmPerPixel);
  const km = (a, b) => Math.hypot((a[0] - b[0]) * 111.195, (a[1] - b[1]) * 111.195 * Math.cos(a[0] * Math.PI / 180));

  // Every square of Caren's land: where, how high, how far from the sea, its relief on the map and what it belongs to.
  const cells = [];
  for (let r = 0; r < g.rows; r += 1) for (let c = 0; c < g.cols; c += 1) {
    const i = r * g.cols + c; if (!frame.outline[i]) continue;
    const [lat, lon] = fromLocal(center, g.x0 + (c + 0.5) * g.cellKm, g.y0 - (r + 0.5) * g.cellKm), relief = frame.reliefValue[i];
    cells.push({ lat, lon, m: frame.elevation[i], coastKm: frame.seaKm[i], relief, water: Boolean(frame.water[i]), feature: rule.featureAt(lat, lon), lift: rule.swellM(lat, lon, frame.seaKm[i]), open: Math.abs(rule.groundM(lat, lon, frame.seaKm[i]) - rule.surfaceM(lat, lon, frame.seaKm[i])) < 1 });
  }
  const land = cells.filter((c) => !c.water), lats = cells.map((c) => c.lat);

  // The plateau: the interior of the dome, clear of the coast's ramp, the great valleys and the mountains.
  const plateau = land.filter((c) => c.lat >= NORTHERN_COAST_LAT && c.coastKm >= dials.swell.coastRampKm && c.open && c.relief < 0.5).map((c) => c.m).sort((a, b) => a - b);
  // What holds it: the crust's thickness and the swell's push, over every square the swell lifts.
  const lifted = cells.filter((c) => c.lift > 50).map((c) => ({ ...c, ...rule.supportAt(c.lat, c.lon, c.coastKm) }));
  const support = {
    crustKm: [r1(Math.min(...lifted.map((c) => c.crustKm))), r1(Math.max(...lifted.map((c) => c.crustKm)))], lowlandCrustKm: dials.crust.lowlandKm,
    swellPushM: r0(Math.max(...lifted.map((c) => c.dynamicM))), swellLiftM: r0(Math.max(...lifted.map((c) => c.lift))),
    // The broad surface is what the crust and the swell support, square for square (the largest difference, m).
    unsupportedM: r1(Math.max(...lifted.map((c) => Math.abs(rule.surfaceM(c.lat, c.lon, c.coastKm) - c.supportedM)))),
    // A massif stands on the strength of its rock: the pressure at its foot against what quartzite and massive granite bear.
    massifReliefM: rule.massifReliefM, massifLoadMpa: r0(rule.massifLoadMpa), rockStrengthMpa: 150,
    massifReliefFrom: { hardRockOnAnOldContinentM: dials.massif.inselbergM, smallFaultsM: dials.massif.blockThrowM, reboundM: rule.massifReliefM - dials.massif.inselbergM - dials.massif.blockThrowM },
  };
  // The ramps: from the northern coasts inward, clear of the great valleys and the mountains, in steps of 10 km.
  // (Each side is the land nearer that coast than the others: west of 1.5° W, east of 1.5° E, and between them.)
  const sides = { west: (c) => c.lon < -1.5, north: (c) => c.lon >= -1.5 && c.lon <= 1.5, east: (c) => c.lon > 1.5 };
  const ramps = Object.fromEntries(Object.entries(sides).map(([side, on]) => {
    const steps = [];
    for (let d = 0; d < dials.swell.coastRampKm + 60; d += 10) { const band = land.filter((c) => c.lat >= NORTHERN_COAST_LAT && on(c) && c.open && c.relief < 0.5 && c.coastKm >= d && c.coastKm < d + 10); if (band.length >= 4) steps.push({ km: d + 5, m: r0(band.reduce((s, c) => s + c.m, 0) / band.length) }); }
    // The ramp ends where the land first comes within a tenth of its full height; it must rise all the way to there.
    const top = Math.max(...steps.map((s) => s.m)), end = steps.findIndex((s) => s.m >= 0.9 * top), ramp = steps.slice(0, end + 1);
    const slopes = ramp.slice(1).map((s, k) => (s.m - ramp[k].m) / (s.km - ramp[k].km) / 10);
    return [side, { steps, risesAllTheWay: slopes.every((s) => s > 0), steepestPercent: r2(Math.max(...slopes)), meanPercent: r2((ramp.at(-1).m - ramp[0].m) / (ramp.at(-1).km - ramp[0].km) / 10), rampKm: ramp.at(-1).km, topM: top }];
  }));
  // No cliff coast: the land within 12 km of a northern coast stays low.
  const shore = land.filter((c) => c.lat >= NORTHERN_COAST_LAT && c.coastKm <= 12).map((c) => c.m);

  // The summits, by what they belong to.
  const top = (list) => list.reduce((best, c) => (!best || c.m > best.m ? c : best), null), at = (c) => ({ heightM: r0(c.m), at: [r2(c.lat), r2(c.lon)] });
  const named = (name) => land.filter((c) => c.feature.name === name);
  const peakLabels = labels.features.filter((f) => f.class === "mountain").map((f) => ({ name: f.name, at: placeOf(f) }));
  const peaks = peakLabels.map((p) => { const near = land.filter((c) => km([c.lat, c.lon], p.at) <= 60 && c.feature.kind === "massif"), best = top(near); return { name: p.name, ...at(best), snowAllYear: best.m >= SNOW_LINE_M, plateauRoundM: r0(rule.surfaceM(best.lat, best.lon, best.coastKm)) }; });
  const summits = [...peaks.map((p) => ({ name: p.name, kind: "massif of the ancient belt", heightM: p.heightM, at: p.at })), ...dials.hills.map((h) => ({ name: h.name, kind: "hills", ...at(top(named(h.name))) })), { name: dials.sondel.name, kind: "the Sondel Range's remnant (artificial)", ...at(top(named(dials.sondel.name))) }].sort((a, b) => b.heightM - a.heightM);
  const hills = dials.hills.map((h) => { const own = named(h.name).filter((c) => c.relief >= 1.5).map((c) => c.m).sort((a, b) => a - b); return { name: h.name, heightM: [r0(own[0]), r0(quantile(own, 0.5)), r0(own.at(-1))] }; });
  const sondel = named(dials.sondel.name).filter((c) => c.relief >= 1.5).map((c) => c.m).sort((a, b) => a - b);

  // The lakes' levels and the great rivers.
  const lakeLabels = labels.features.filter((f) => f.class === "lake").map((f) => ({ name: f.name, at: placeOf(f) }));
  const middle = (ring) => { let a = 0, b = 0; for (const p of ring) { a += p[0]; b += p[1]; } return [a / ring.length, b / ring.length]; };
  const lakes = rule.lakes.map((l) => { const w = waters.find((x) => x.id === l.id), mid = middle(w.ring), label = lakeLabels.map((x) => ({ ...x, km: km(x.at, mid) })).sort((a, b) => a.km - b.km)[0]; return { id: l.id, name: label && label.km <= 70 ? label.name : null, levelM: l.levelM, at: mid.map(r2) }; }).filter((l) => l.name).sort((a, b) => b.levelM - a.levelM);
  const rivers = rule.greatRivers.map((river) => { const w = waters.find((x) => x.id === river.id), seaKm = w.ring.map((p) => coastAt(p[0], p[1])), mouth = w.ring[seaKm.indexOf(Math.min(...seaKm))], lengthKm = Math.max(...w.ring.map((p) => km(p, mouth))); return { id: river.id, lengthKm: r0(lengthKm), tidalKm: Math.min(dials.rivers.estuaryKm, r0(lengthKm)), headM: r0(rule.bedM(lengthKm)), gradientMPerKm: dials.rivers.gradientMPerKm }; });
  // The dry country round the Sondel's remnant (the Molkath desert's floor): how high it stands.
  const dry = land.filter((c) => c.feature.kind === "sondel" && c.relief >= 0.6 && c.relief < 1.4).map((c) => c.m).sort((a, b) => a - b);

  return {
    schemaVersion: 1, model: CAREN_RELIEF_MODEL, sourcesSha256: carenSourcesSha256(),
    latitudes: [r2(Math.min(...lats)), r2(Math.max(...lats))],
    plateau: { squares: plateau.length, heightM: [r0(plateau[0]), r0(quantile(plateau, 0.1)), r0(quantile(plateau, 0.5)), r0(quantile(plateau, 0.9)), r0(plateau.at(-1))], coolerThanTheCoastC: r1(quantile(plateau, 0.5) * LAPSE_C_PER_KM / 1000) },
    support, ramps, northernShoreM: { highest: r0(Math.max(...shore)), squares: shore.length },
    peaks, snowLineM: SNOW_LINE_M, highestNaturalM: Math.max(...peaks.map((p) => p.heightM)), summits, hills,
    sondel: { heightM: [r0(sondel[0]), r0(quantile(sondel, 0.5)), r0(sondel.at(-1))], natural: false },
    dryCountryM: dry.length ? [r0(dry[0]), r0(quantile(dry, 0.5)), r0(dry.at(-1))] : null,
    lakes, rivers,
    arluna: rule.arluna && { ...rule.arluna, upliftM: dials.arluna.upliftM, troughM: dials.arluna.troughM, rimM: dials.arluna.rimM, ageMyr: dials.arluna.ageMyr, lakes: dials.arluna.lakes,
      skymetal: { kind: "great-impact skymetal district", oreBody: "the melt sheet under the central uplift and the ring", withinKm: Math.round(rule.arluna.troughKm * dials.arluna.rimAt) } },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const began = Date.now(), data = buildCaren(), text = `${JSON.stringify(data, null, 1)}\n`;
  if (process.argv.includes("--check")) { const same = readFileSync(OUT, "utf8") === text; console.log(same ? "caren.json is up to date" : "caren.json differs"); process.exit(same ? 0 : 1); }
  writeFileSync(OUT, text);
  console.log(`caren.json: plateau ${data.plateau.heightM[1]} to ${data.plateau.heightM[3]} m (middle ${data.plateau.heightM[2]}); crust ${data.support.crustKm.join(" to ")} km, swell's push ${data.support.swellPushM} m; highest natural summit ${data.highestNaturalM} m (${data.peaks.map((p) => `${p.name} ${p.heightM}`).join(", ")}); Sondel remnant ${data.sondel.heightM[2]} m; ${((Date.now() - began) / 1000).toFixed(1)} s`);
}
