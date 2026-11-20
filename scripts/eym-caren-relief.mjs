// Caren's land surface from its natural history (canon of 20 November 2026, docs/eym-canon.md).
//
// Caren's outline, rivers, lakes, forests and peaks are the owner's map. Its heights follow from what made it:
//   - an old, buoyant continental core: low country that rises gently from the sea;
//   - north of the Sondel, a broad dome raised over the last few million years by a swell of the mantle under thick
//     crust (the northern plume: a nudge): a plateau, reached from every northern coast by a long, gentle ramp;
//   - the great rivers, older than the uplift, which cut down as the land rose: broad valleys through the dome, with
//     tidal estuaries in their lowest reaches;
//   - the hard massifs of the ancient belt (quartzite and massive granite), standing above the plateau as far as
//     their hardness, a little faulting and the crust's rebound can hold them;
//   - lakes in shallow sags of the warped surface, each with one level;
//   - the Arluna impact structure: a central uplift, a ring trough (where its lakes lie) and a low outer rim;
//   - the Sondel Range, which is not natural: what is left of it keeps the heights the map gives it;
//   - the map's tan country, which is dry country and not high ground, and its hills, which are hills.
// The same rule is read by the surface (scripts/eym-surface.mjs) and by the local detail
// (scripts/eym-local-detail.mjs), so every scale has the same land. Pure: nothing is read but the arguments.
// Places are [latitude, longitude] in degrees; distances in km; heights in m.

export const CAREN_RELIEF_MODEL = "eym-caren-relief-v1";
const DEG = Math.PI / 180, KM = 111.195, CORE_RISE_KM = 160;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { const u = clamp(t, 0, 1); return u * u * (3 - 2 * u); };
/** A value read off a line of [x, y] knots (flat beyond its ends). */
const along = (knots, x) => { if (x <= knots[0][0]) return knots[0][1]; for (let i = 1; i < knots.length; i += 1) if (x <= knots[i][0]) { const [x0, y0] = knots[i - 1], [x1, y1] = knots[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } return knots.at(-1)[1]; };

// ---------------------------------------------------------------- small geometry (Caren lies on the equator: a flat frame is true to 1%)

const flat = ([lat, lon]) => [lon * KM * Math.cos(lat * DEG), lat * KM];
const kmBetween = (a, b) => { const p = flat(a), q = flat(b); return Math.hypot(p[0] - q[0], p[1] - q[1]); };
/** Distance from a point to the segment a–b (all flat km). */
const toSegment = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const inside = (ring, [x, y]) => { let k = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) k = !k; } return k; };

/** A water body made ready: its ring in flat km, thinned to `stepKm`, with its box. */
function prepared(water, stepKm = 3) {
  const all = water.ring.map(flat), ring = [all[0]];
  for (const p of all) if (Math.hypot(p[0] - ring.at(-1)[0], p[1] - ring.at(-1)[1]) >= stepKm) ring.push(p);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const [x, y] of ring) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { id: water.id, ring, box: [x0, x1, y0, y1] };
}
/** How far a flat point lies outside a prepared water body (0 inside), or Infinity if farther than `reach`; and the nearest point of its bank. */
function outside(body, p, reach) {
  const [x0, x1, y0, y1] = body.box; if (p[0] < x0 - reach || p[0] > x1 + reach || p[1] < y0 - reach || p[1] > y1 + reach) return { km: Infinity, at: null };
  const { ring } = body; let best = Infinity, at = null;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const d = toSegment(p, ring[j], ring[i]); if (d < best) { best = d; at = ring[i]; } }
  return { km: inside(ring, p) ? 0 : best, at };
}

// ---------------------------------------------------------------- the model

/**
 * Caren's relief from its dials (WORLD_INPUTS.caren) and its mapped waters.
 * `waters` are Caren's inland waters as { id, lake: true or false, ring: [[lat, lon], …] } (outer rings only);
 * `coastKmAt(lat, lon)` gives the distance to the sea. The great rivers of the dome are named in the dials: each
 * is drawn wide on the map, and its band is its valley floor. The other waters the map calls lakes are lakes.
 */
export function carenRelief(dials, waters, coastKmAt) {
  const { swell, rivers: riverDials, lakes: lakeDials, massif, arluna: arlunaDials } = dials;
  // The dome: full height at its centre, falling away east and west, north and (faster) south.
  const dome = (lat, lon) => { const dy = (lat - swell.center[0]) * KM, dx = (lon - swell.center[1]) * KM * Math.cos(lat * DEG), ry = dy >= 0 ? swell.reachKm.north : swell.reachKm.south; return Math.exp(-(((dx / swell.reachKm.eastWest) ** 2 + (dy / ry) ** 2) ** (swell.shape / 2))); };
  /** The ramp from the coast: mostly an S-curve, part a straight rise, so that its steepest stretch stays gentle. */
  const ramp = (coastKm) => { const u = clamp(coastKm / swell.coastRampKm, 0, 1); return 0.3 * u + 0.7 * smooth(u); };
  /** The swell's lift at a place (m): the dome, eased to nothing at the coast over the ramp. */
  const swellM = (lat, lon, coastKm) => swell.heightM * dome(lat, lon) * ramp(coastKm);
  /**
   * The old core's own gentle rise from the sea (m). It is complete 160 km inland: the local detail measures the
   * distance to the sea no farther than that, and the surface must read the same land.
   */
  const coreM = (coastKm, n = 0) => 12 + 300 * (1 - Math.exp(-Math.min(coastKm, CORE_RISE_KM) / 140)) * (1 + 0.5 * n);
  /** The broad surface before rivers, lakes and mountains (m). */
  const surfaceM = (lat, lon, coastKm, n = 0) => coreM(coastKm, n) + swellM(lat, lon, coastKm);

  // The great rivers (waters that reach the sea) and the lakes.
  const bodies = waters.map((w) => { const body = prepared(w), seaKm = w.ring.map((p) => coastKmAt(p[0], p[1])); let k = 0; for (let i = 1; i < seaKm.length; i += 1) if (seaKm[i] < seaKm[k]) k = i; return { ...body, seaKm: seaKm[k], mouth: flat(w.ring[k]), source: w }; });
  const great = bodies.filter((b) => riverDials.ids.includes(b.id)), lakeBodies = bodies.filter((b) => b.source.lake && !riverDials.ids.includes(b.id));
  /** A great river's bed at a distance from its mouth (m): tidal for the estuary, then a gentle climb. */
  const bedM = (kmFromMouth) => 2 + riverDials.gradientMPerKm * Math.max(0, kmFromMouth - riverDials.estuaryKm);
  /** The surface with the great rivers' valleys cut into it (m). */
  const withValleys = (lat, lon, coastKm, n = 0) => {
    let h = surfaceM(lat, lon, coastKm, n); const p = flat([lat, lon]);
    for (const river of great) {
      const { km, at } = outside(river, p, riverDials.valleyKm); if (km >= riverDials.valleyKm) continue;
      const bed = bedM(Math.hypot((km ? at[0] : p[0]) - river.mouth[0], (km ? at[1] : p[1]) - river.mouth[1]));
      const cut = bed + (h - bed) * smooth(km / riverDials.valleyKm); if (cut < h) h = cut;
    }
    return h;
  };

  // The Arluna structure: a circle through the middles of the lakes named in the dials (its ring trough).
  const arlunaLakes = arlunaDials.lakes.map((id) => waters.find((w) => w.id === id)).filter(Boolean).map((w) => { let a = 0, b = 0; for (const p of w.ring) { a += p[0]; b += p[1]; } return [a / w.ring.length, b / w.ring.length]; });
  const arlunaCentre = arlunaLakes.length ? [arlunaLakes.reduce((s, p) => s + p[0], 0) / arlunaLakes.length, arlunaLakes.reduce((s, p) => s + p[1], 0) / arlunaLakes.length] : null;
  const troughKm = arlunaCentre ? arlunaLakes.reduce((s, p) => s + kmBetween(p, arlunaCentre), 0) / arlunaLakes.length : 0;
  const arluna = arlunaCentre ? { centre: arlunaCentre.map((v) => Math.round(v * 1000) / 1000), troughKm: Math.round(troughKm), diameterKm: Math.round(2 * troughKm * arlunaDials.rimAt) } : null;
  /** What the Arluna structure adds (m): a central uplift, a ring trough at its lakes, a low outer rim, nothing beyond. */
  const arlunaM = (lat, lon) => { if (!arluna) return 0; const r = kmBetween([lat, lon], arlunaCentre) / troughKm; return r >= arlunaDials.rimAt * 1.35 ? 0 : along([[0, arlunaDials.upliftM], [0.45, arlunaDials.upliftM * 0.4], [1, arlunaDials.troughM], [arlunaDials.rimAt, arlunaDials.rimM], [arlunaDials.rimAt * 1.35, 0]], r); };

  /** Which mountains a place belongs to: a massif of the ancient belt, hills, the Sondel's remnant, or none of them. */
  const featureAt = (lat, lon) => {
    const p = [lat, lon];
    for (const m of dials.massifs) { const km = m.line ? toSegment(flat(p), flat(m.line[0]), flat(m.line[1])) : kmBetween(p, m.at); if (km <= m.reachKm) return { kind: "massif", name: m.name }; }
    for (const h of dials.hills) if (kmBetween(p, h.at) <= h.reachKm) return { kind: "hills", name: h.name, heightM: h.heightM };
    const s = dials.sondel; if (lat >= s.latDeg[0] && lat <= s.latDeg[1] && lon >= s.lonDeg[0] && lon <= s.lonDeg[1]) return { kind: "sondel", name: s.name };
    return { kind: "other", name: null };
  };
  /** How high a massif of the ancient belt can stand above the land round it (m), and what holds it there. */
  const massifReliefM = massif.inselbergM + massif.blockThrowM + Math.round(massif.valleyErosionM * dials.crust.densityCrust / dials.crust.densityMantle);
  /** What the map's relief (0 lowland, 1 dry country, 2 mountains, 3 high peaks; fractions between) adds at a place (m). */
  const reliefM = (lat, lon, relief) => {
    if (relief <= 0) return 0; const f = featureAt(lat, lon), dry = dials.dryCountryM;
    const [mountains, peaks] = f.kind === "massif" ? [massifReliefM * massif.shoulderShare, massifReliefM] : f.kind === "hills" ? f.heightM : f.kind === "sondel" ? dials.sondel.heightM : dials.otherHeightM;
    return along([[0, 0], [0.35, dry * 0.4], [1, dry], [2, mountains], [3, peaks]], relief);
  };

  /**
   * The land's height before its lakes are levelled (m). Mountains are hard rock the rivers did not cut away: where
   * the map draws them, the land stands on the uncut surface, not in a valley.
   */
  const groundM = (lat, lon, coastKm, relief = 0, n = 0) => { const cut = withValleys(lat, lon, coastKm, n), stands = relief > 0 ? smooth(relief / 1.5) : 0; return cut + (stands ? (surfaceM(lat, lon, coastKm, n) - cut) * stands : 0) + reliefM(lat, lon, relief) * (1 + 0.14 * n) + arlunaM(lat, lon); };
  // Each lake has one level: a little under the lowest ground on its shore (a sag in the warped surface).
  const lakes = lakeBodies.map((b) => { let low = Infinity; for (const p of b.source.ring) { const h = groundM(p[0], p[1], coastKmAt(p[0], p[1])); if (h < low) low = h; } return { ...b, levelM: Math.max(2, Math.round(low - lakeDials.belowShoreM)) }; });
  /**
   * Caren's height at a place (m). `relief` is the map's relief there (0 to 3), `n` a noise in −1…1 for the old core's
   * unevenness. Inside a lake it is the lake's level; near one, the ground eases down to it.
   */
  const heightM = (lat, lon, coastKm, relief = 0, n = 0) => {
    let h = groundM(lat, lon, coastKm, relief, n); const p = flat([lat, lon]);
    for (const lake of lakes) { const { km } = outside(lake, p, lakeDials.sagKm); if (km >= lakeDials.sagKm) continue; const eased = lake.levelM + (h - lake.levelM) * smooth(km / lakeDials.sagKm); if (km === 0) return lake.levelM; if (eased < h || h < lake.levelM) h = Math.max(lake.levelM + 1, eased); }
    return Math.max(1, h);
  };

  /** What holds the land up at a place: the crust's thickness (km), the mantle swell's push (m) and the height they support together (m). */
  const supportAt = (lat, lon, coastKm) => {
    const lift = swellM(lat, lon, coastKm), dynamicM = lift * swell.dynamicShare, c = dials.crust, perKm = 1000 * (1 - c.densityCrust / c.densityMantle);
    const crustKm = c.lowlandKm + (coreM(coastKm) - c.lowlandM + lift - dynamicM) / perKm;
    return { crustKm, dynamicM, supportedM: c.lowlandM + (crustKm - c.lowlandKm) * perKm + dynamicM };
  };
  /** The pressure a massif's rock bears at its foot (MPa), against the strength of quartzite and massive granite. */
  const massifLoadMpa = massifReliefM * dials.crust.densityCrust * 9.81 / 1e6;

  return {
    model: CAREN_RELIEF_MODEL, heightM, groundM, surfaceM, swellM, coreM, reliefM, featureAt, supportAt, arlunaM, bedM,
    massifReliefM, massifLoadMpa, arluna,
    greatRivers: great.map((b) => ({ id: b.id, seaKm: b.seaKm })), lakes: lakes.map((l) => ({ id: l.id, levelM: l.levelM })),
  };
}

/** Whether a place lies in Caren's part of the world (the box its relief rule is used in). */
export const inCarenBox = (lat, lon, dials) => lat >= dials.box.latDeg[0] && lat <= dials.box.latDeg[1] && lon >= dials.box.lonDeg[0] && lon <= dials.box.lonDeg[1];
