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
import { carenClimate, monthDeclinationDeg } from "../scripts/eym-caren-climate.mjs";
import { eymRain } from "./generate-eym-rain.mjs";
import { rainReader } from "../scripts/eym-rain.mjs";
import { existsSync } from "node:fs";
import { rainBeltLat, seaLevelTemperatureC } from "../scripts/eym-seasons.mjs";

const root = new URL("../", import.meta.url), OUT = new URL("data/eym/caren.json", root);
/** What the survey is made from: this tool, the relief rule, the surface, the traced map and its labels (and the dials, below). */
export const CAREN_SOURCES = ["tools/generate-eym-caren.mjs", "scripts/eym-caren-relief.mjs", "scripts/eym-caren-climate.mjs", "scripts/eym-rain.mjs", "scripts/eym-land-atmosphere.mjs", "tools/generate-eym-rain.mjs", "data/eym/rain.json", "scripts/eym-surface.mjs", "scripts/eym-seasons.mjs", "data/eym/traced-continents.json", "data/eym/caren-labels.json", "data/eym/climate.json"];
/** The groups of dials (scripts/eym-world-inputs.mjs) the survey follows. */
export const CAREN_INPUTS = ["layout", "caren", "carenClimate", "rain", "weather"];
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
  const source = traced.continents.caren, { frames, sampler: fullSampler } = buildEymSurface(traced, { ...EYM_LAYOUT, seeded: [], archipelagos: { ...EYM_LAYOUT.archipelagos, centers: [], count: 0 } });
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
    cells.push({ lat, lon, m: frame.elevation[i], coastKm: frame.seaKm[i], relief, forest: Boolean(frame.forest[i]), water: Boolean(frame.water[i]), feature: rule.featureAt(lat, lon), lift: rule.swellM(lat, lon, frame.seaKm[i]), open: Math.abs(rule.groundM(lat, lon, frame.seaKm[i]) - rule.surfaceM(lat, lon, frame.seaKm[i])) < 1 });
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

  const climate = surveyClimate({ source, labels, placeOf, sampler: fullSampler, land, peaks, km });
  return {
    schemaVersion: 1, model: CAREN_RELIEF_MODEL, sourcesSha256: carenSourcesSha256(), climate,
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

/**
 * Caren's climate as the rules give it (the planet's rain, scripts/eym-rain.mjs, and Caren's temperatures,
 * scripts/eym-caren-climate.mjs), measured against what the canon expects:
 * found, or not found and by how much. Nothing here is set to an answer.
 */
function surveyClimate({ source, labels, placeOf, sampler, land, peaks, km }) {
  const D = WORLD_INPUTS.carenClimate, climateDoc = JSON.parse(readFileSync(new URL("data/eym/climate.json", root), "utf8"));
  // The planet's rain as it is and as it was with the Sondel's wall standing, and Caren's temperatures with each.
  const make = (wall) => { const air = eymRain({ wall, climate: climateDoc }); return { air, seaAnomalyAt: air.seaAnomalyAt, rule: carenClimate(D, { seaAnomalyAt: air.seaAnomalyAt, rainMmAt: (lat, lon, month) => air.monthAt(lat, lon, month).rainMm }) }; };
  const now = make(null), before = make(D.wallBeforeTheFall), r1 = (v) => Math.round(v * 10) / 10, mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
  const yearAt = (era, lat, lon) => { const s = sampler(lat, lon); return !s?.land ? null : { groundM: Math.round(s.elevationM), ...era.rule.yearAt(lat, lon, Math.max(0, s.elevationM), s.coastKm, seaLevelTemperatureC(lat)) }; };
  const brief = (y) => y && { groundM: y.groundM, annualMm: y.annualMm, monthsMm: y.months.map((m) => m.rainMm), wetMonths: y.wetMonths, dryMonths: y.dryMonths, meanC: y.meanC, swingC: y.swingC, coldestNightC: y.coldestNightC, groundFrostMonths: y.frostMonths };
  const town = (name) => { const s = labels.settlements.find((x) => x.name === name), [lat, lon] = placeOf(s); return { name, at: [Math.round(lat * 100) / 100, Math.round(lon * 100) / 100], ...brief(yearAt(now, lat, lon)) }; };
  // The rain belt over Caren, and the sea west of it.
  const beltByMonth = Array.from({ length: 12 }, (_, m) => r1(now.air.beltLat(0, m))), pullByMonth = Array.from({ length: 12 }, (_, m) => r1(now.air.beltLat(0, m) - rainBeltLat(monthDeclinationDeg(m))));
  const seaBox = (lat0, lat1, lon0, lon1, month) => { const v = []; for (let lat = lat0; lat <= lat1; lat += 2) for (let lon = lon0; lon <= lon1; lon += 2) if (!sampler(lat, lon)?.land) v.push(now.seaAnomalyAt(lat, lon, month)); return mean(v); };
  const tongueByMonth = Array.from({ length: 12 }, (_, m) => r1(seaBox(-4, 6, -12, -6, m))), coastByMonth = Array.from({ length: 12 }, (_, m) => r1(seaBox(1, 7, -7, -5, m)));
  const hc = EYM_LAYOUT.hotspotCluster;
  // North, centre and south (the land's squares, one in twenty-four): rain and warmth.
  const part = (test) => { const ys = land.filter((c, k) => k % 24 === 0 && test(c)).map((c) => yearAt(now, c.lat, c.lon)).filter(Boolean); return { places: ys.length, annualMm: Math.round(mean(ys.map((y) => y.annualMm))), meanC: r1(mean(ys.map((y) => y.meanC))), dryMonths: r1(mean(ys.map((y) => y.dryMonths))) }; };
  // A place's year with the land forced to a height (for snow and frost by height), on the plateau's middle.
  const atHeight = (m) => { const y = now.rule.yearAt(5.5, -0.5, m, 300, seaLevelTemperatureC(5.5)); return { heightM: m, meanC: y.meanC, coldestNightC: y.coldestNightC, groundFrostMonths: y.frostMonths, airFrostMonths: y.airFrostMonths, snow: y.meanC <= -3 ? "all year" : y.coldestNightC <= 1 ? "now and then, in cold, wet spells" : "none" }; };
  // Rain shadows: 70 km to the south-west of a peak (the lee of the north-east trades) against 70 km to its north-east.
  const shadowOf = (p) => { const d = 70 / 111.2 * Math.SQRT1_2, lee = yearAt(now, p.at[0] - d, p.at[1] - d), wind = yearAt(now, p.at[0] + d, p.at[1] + d); return lee && wind ? { name: p.name, leeMm: lee.annualMm, windwardMm: wind.annualMm, leeShare: Math.round(lee.annualMm / wind.annualMm * 100) / 100 } : { name: p.name, leeMm: lee?.annualMm ?? null, windwardMm: wind?.annualMm ?? null, leeShare: null }; };
  // The Molkath country: the map's tan ground (dry tableland) round the Sondel's remnant, by the side of the
  // remnant's crest it lies on, today and with the wall standing. (The trades blow from the east: the west is the lee.)
  const box = D.molkath, tan = []; for (let lat = box.latDeg[0] + 0.25; lat < box.latDeg[1]; lat += 0.5) for (let lon = box.lonDeg[0] + 0.25; lon < box.lonDeg[1]; lon += 0.5) { const s = sampler(lat, lon); if (s?.land && s.relief >= 0.6 && s.relief < 1.6) tan.push({ lat, lon, side: lat - box.crestAt[0] > 2.2 ? "north" : lat - box.crestAt[0] < -1.5 ? "south" : lon < box.crestAt[1] ? "west" : "east" }); }
  const spread = (v) => { const s = [...v].sort((x, y) => x - y); return s.length ? [s[0], s[Math.floor(s.length / 2)], s.at(-1)] : null; };
  const molkath = (era) => { const rows = tan.map((c) => ({ ...c, y: yearAt(era, c.lat, c.lon) })).filter((c) => c.y), of = (list) => ({ places: list.length, annualMm: spread(list.map((c) => c.y.annualMm)), dryMonths: list.length ? r1(mean(list.map((c) => c.y.dryMonths))) : null, aridShare: list.length ? Math.round(list.filter((c) => c.y.annualMm <= 250).length / list.length * 100) / 100 : null }); return { ...of(rows), sides: Object.fromEntries(["west", "east", "north", "south"].map((side) => [side, of(rows.filter((c) => c.side === side))])) }; };
  const molkathNow = molkath(now), molkathBefore = molkath(before), target = [100, 250];
  // The map against the rain (the rain file's squares, by the degree): where the map draws forest in dry country,
  // open land in very wet country, or its tan dry ground in wet country. Reported; neither is overridden.
  const rainUrl = new URL("data/eym/rain.json", root), rainOf = existsSync(rainUrl) ? rainReader(JSON.parse(readFileSync(rainUrl, "utf8"))) : null, squares = new Map();
  for (const c of land) { const key = `${Math.floor(c.lat)}|${Math.floor(c.lon)}`, s = squares.get(key) ?? { lat: Math.floor(c.lat) + 0.5, lon: Math.floor(c.lon) + 0.5, n: 0, forest: 0, tan: 0, open: 0 }; s.n += 1; if (c.relief >= 1.6) { /* mountain */ } else if (c.forest) s.forest += 1; else if (c.relief >= 0.6) s.tan += 1; else s.open += 1; squares.set(key, s); }
  const against = rainOf && (() => {
    const full = Math.max(...[...squares.values()].map((s) => s.n)), list = [...squares.values()].filter((s) => s.n >= 0.5 * full).map((s) => ({ ...s, mm: rainOf.landYear(Math.floor(s.lat + 90), Math.floor(s.lon + 180))?.annualMm ?? null })).filter((s) => s.mm != null).sort((a, b) => b.lat - a.lat || a.lon - b.lon);
    const tag = (s) => ({ at: [s.lat, s.lon], annualMm: s.mm }), of = (kind, share, test) => { const mine = list.filter((s) => s[kind] / s.n >= share), mm = mine.map((s) => s.mm).sort((a, b) => a - b); return { squares: mine.length, middleMm: mm.length ? mm[Math.floor(mm.length / 2)] : null, disagree: mine.filter(test).map(tag) }; };
    return { squares: list.length, forestInDryCountry: { underMm: 900, ...of("forest", 0.6, (s) => s.mm < 900) }, openInVeryWetCountry: { overMm: 2500, ...of("open", 0.6, (s) => s.mm > 2500) }, tanInWetCountry: { overMm: 1000, ...of("tan", 0.5, (s) => s.mm > 1000) } };
  })();
  const north = part((c) => c.lat >= 4.5), centre = part((c) => c.lat > -4 && c.lat < 4.5), south = part((c) => c.lat <= -4), northWest = part((c) => c.lat >= 4.5 && c.lon < -2), northEast = part((c) => c.lat >= 4.5 && c.lon > 2);
  const plateauPlaces = land.filter((c, k) => k % 9 === 0 && c.lat >= NORTHERN_COAST_LAT && c.open && c.relief < 0.5 && c.m >= 1300).map((c) => yearAt(now, c.lat, c.lon)).filter(Boolean);
  const plateau = { places: plateauPlaces.length, annualMm: Math.round(mean(plateauPlaces.map((y) => y.annualMm))), meanC: r1(mean(plateauPlaces.map((y) => y.meanC))), swingC: r1(mean(plateauPlaces.map((y) => y.swingC))), coldestNightC: r1(Math.min(...plateauPlaces.map((y) => y.coldestNightC))), wetMonths: r1(mean(plateauPlaces.map((y) => y.wetMonths))), dryMonths: r1(mean(plateauPlaces.map((y) => y.dryMonths))), groundFrostMonths: r1(mean(plateauPlaces.map((y) => y.frostMonths))) };
  const byHeight = [0, 1000, 1750, 2500, 3250, 4000, 4800, 5400].map(atHeight), rainShadows = peaks.map(shadowOf), southOfEquator = beltByMonth.filter((v) => v < 0).length;
  const tongue = r1(mean(tongueByMonth)), coastSwing = r1(Math.max(...coastByMonth) - Math.min(...coastByMonth)), dree = town("Dree"), weth = rainShadows.find((s) => s.name === "Mt. Weth"), oplin = rainShadows.filter((s) => /Oplin|Danrich/.test(s.name));
  const reached = Boolean(molkathNow.annualMm && molkathNow.annualMm[1] <= target[1] && molkathBefore.annualMm && molkathBefore.annualMm[1] <= target[1]);
  const sides = (m) => ["west", "east", "north", "south"].filter((s) => m.sides[s].places).map((s) => `${s} ${m.sides[s].annualMm[1]} mm`).join(", ");
  // What the canon expects, and whether the rule gives it (found or not, with the measure): verified, not assumed.
  const expectations = [
    { expected: "a tongue of cold water toward Caren's west coast", found: tongue <= -0.3, measure: `the sea west of Caren is ${Math.abs(tongue)} °C colder than its latitude's, the year round` },
    { expected: "the western coasts' sea swings 5 to 8 °C through the year", found: coastSwing >= 5, measure: `${coastSwing.toFixed(1)} °C through the year` },
    { expected: "the rain belt south of the equator over Caren for more of the year", found: southOfEquator >= 6, measure: `${southOfEquator} months of 12 (the sea and the land draw it between ${Math.min(...pullByMonth)}° and ${Math.max(...pullByMonth)}° from the open ocean's place)` },
    { expected: "northern Caren cooler than the south", found: north.meanC < south.meanC - 2, measure: `${north.meanC} °C against ${south.meanC} °C` },
    { expected: "northern Caren drier than the south", found: north.annualMm < south.annualMm, measure: `${north.annualMm} mm against ${south.annualMm} mm (north-west ${northWest.annualMm} mm, north-east ${northEast.annualMm} mm): the rain belt stands over the north for more of the year, and the high ground wrings the air` },
    { expected: "a cool plateau with a mild rhythm of seasons", found: plateau.meanC <= 18 && plateau.swingC >= 1.5, measure: `${plateau.meanC} °C in the mean, the months ${plateau.swingC} °C apart` },
    { expected: "a dry season on the plateau, with frost at night", found: plateau.dryMonths >= 2 && plateau.coldestNightC <= D.temperature.groundFrostC, measure: `${plateau.dryMonths} dry months of 12; the coldest nights ${plateau.coldestNightC} °C (ground frost begins at ${D.temperature.groundFrostC} °C)` },
    { expected: "a rain shadow to the south-west of Mt. Weth", found: Boolean(weth?.leeShare && weth.leeShare < 0.8), measure: weth ? `${weth.leeMm} mm in its lee against ${weth.windwardMm} mm to windward` : "not measured" },
    { expected: "a rain shadow to the south-west of Mt. Oplin and Mt. Danrich, round Menera", found: oplin.length > 0 && oplin.every((s) => s.leeShare && s.leeShare < 0.8), measure: `${oplin.map((s) => `${s.name}: ${s.leeMm} mm against ${s.windwardMm} mm`).join("; ")}; Menera ${town("Menera").annualMm} mm` },
    { expected: "south Caren tropical wet and dry", found: south.dryMonths >= 3 && south.annualMm >= 800, measure: `${south.annualMm} mm a year with ${south.dryMonths} dry months; Dree ${dree.annualMm} mm with ${dree.dryMonths} dry months` },
    { expected: "snow all year only above about 4,800 m; none in the lowlands", found: byHeight.find((h) => h.heightM === 4800).snow === "all year" && byHeight.find((h) => h.heightM === 4000).snow !== "all year" && byHeight.find((h) => h.heightM === 0).snow === "none", measure: byHeight.map((h) => `${h.heightM} m: ${h.snow}`).join("; ") },
    { expected: "frost on clear dry-season nights at 1,500 to 2,000 m", found: byHeight.find((h) => h.heightM === 1750).groundFrostMonths > 0, measure: `the coldest nights at 1,750 m are ${byHeight.find((h) => h.heightM === 1750).coldestNightC} °C; ground frost begins near ${byHeight.find((h) => h.groundFrostMonths > 0)?.heightM ?? "?"} m and air frost near ${byHeight.find((h) => h.airFrostMonths > 0)?.heightM ?? "?"} m` },
    { expected: "the Molkath desert arid (100 to 250 mm a year), today and before the Sondel fell", found: reached, measure: `the map's tan ground round the Sondel's remnant: today ${molkathNow.annualMm?.[1]} mm in the middle (${molkathNow.annualMm?.[0]} to ${molkathNow.annualMm?.[2]}; ${sides(molkathNow)}; ${Math.round(molkathNow.aridShare * 100)}% of it under 250 mm); with the wall standing ${molkathBefore.annualMm?.[1]} mm (${molkathBefore.annualMm?.[0]} to ${molkathBefore.annualMm?.[2]}; ${sides(molkathBefore)}; ${Math.round(molkathBefore.aridShare * 100)}% under 250 mm)` },
  ];
  return {
    model: now.rule.model, rainModel: now.air.model, expectations,
    rainBelt: { latByMonth: beltByMonth, monthsSouthOfTheEquator: beltByMonth.filter((v) => v < 0).length, seaPullDegByMonth: pullByMonth },
    sea: { coldTongueCByMonth: tongueByMonth, coldTongueC: r1(mean(tongueByMonth)), westCoastCByMonth: coastByMonth, westCoastSwingC: r1(Math.max(...coastByMonth) - Math.min(...coastByMonth)), overTheRidgeC: hc ? r1(mean(Array.from({ length: 12 }, (_, m) => now.seaAnomalyAt(hc.center[0], hc.center[1], m)))) : null },
    parts: { north, northWest, northEast, centre, south },
    plateau, byHeight, rainShadows,
    towns: ["Folo", "Bostain", "Rach", "Aren", "Menera", "Plangi", "Dubos", "Geniv", "Lyla", "Dree", "Ewash"].map(town),
    mapAgainstRain: against ?? null,
    molkath: { box, targetMm: target, today: molkathNow, beforeTheFall: molkathBefore, wall: D.wallBeforeTheFall,
      reached,
      why: "The trades blow from the east off a warm sea. The remnant's lee (its west side) is dry; its windward side (the east) is wet, with only low ground between it and the sea the rain comes from. A range across the wind to the east of it, or a far colder sea there, would dry the east side; the map shows neither." },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const began = Date.now(), data = buildCaren(), text = `${JSON.stringify(data, null, 1)}\n`;
  if (process.argv.includes("--check")) { const same = readFileSync(OUT, "utf8") === text; console.log(same ? "caren.json is up to date" : "caren.json differs"); process.exit(same ? 0 : 1); }
  writeFileSync(OUT, text);
  console.log(`caren.json: plateau ${data.plateau.heightM[1]} to ${data.plateau.heightM[3]} m (middle ${data.plateau.heightM[2]}); crust ${data.support.crustKm.join(" to ")} km, swell's push ${data.support.swellPushM} m; highest natural summit ${data.highestNaturalM} m (${data.peaks.map((p) => `${p.name} ${p.heightM}`).join(", ")}); Sondel remnant ${data.sondel.heightM[2]} m; ${((Date.now() - began) / 1000).toFixed(1)} s`);
}
