// Eym's wind at work on the land (the wind addendum to Stage 3 of the physical history and climate programme):
// the wind and wave climate fitted from the weather and the swell (tools/generate-eym-wind.mjs, attached as
// `asset.wind`), read back, and the forms the wind makes where the ground is dry and bare:
//   - deflation: the fines blown away, leaving a stony desert pavement;
//   - abrasion: soft rock carved into yardangs, long ridges lying with the wind;
//   - dunes: sand heaped into ridges across the wind, inland where a dry country has sand, and behind exposed
//     beaches under strong onshore winds (scripts/eym-landforms.mjs reads the coasts' share);
//   - loess: the blown dust settled downwind, a deep, very fertile blanket over the land.
// Eym is maritime and humid, so inland the wind does little; coasts facing big seas and strong onshore wind
// carry dunes, and the dry-season country of Garyk's north has a little loess. Nothing here is random: the
// patterns are keyed to the world, and the climate is the weather's own.

export const AEOLIAN_MODEL = "eym-aeolian-v1";
const DEG = Math.PI / 180, KM_PER_DEG = 111.2, SECTORS = 16;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smoothstep = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
/** How bare the ground of a biome is (the share of the year it lies open to the wind); as the generator's. */
const BARE = Object.freeze({ "hot-desert": 1, "cold-desert": 1, "ice-cap": 0, tundra: 0.5, steppe: 0.6, savanna: 0.45, "seasonal-forest": 0.12, "temperate-forest": 0.05, taiga: 0.05, "temperate-rainforest": 0.02, "tropical-rainforest": 0.02 });
/** Soils that hold sand the wind can heap into dunes. */
const SANDY = new Set(["arid-mineral", "sandy-acid", "alluvial-fertile", "glacial-mineral"]);
/** Rocks soft enough for the wind to carve. */
export const SOFT_ROCK = new Set(["sandstone-shale", "limestone", "caren-limestone"]);
/** The sand-moving power (drift potential) that counts as windy country (the top tenth of Caren's and Garyk's land). */
const WINDY_DP = 300, ONSHORE_DP = 400;

/** How dry a place is (0–1): from the year's rain, or a long dry season (as the generator's). */
export const dryness = (annualMm, driestShare) => Math.max(clamp((800 - annualMm) / 600, 0, 1), 0.7 * clamp((0.35 - driestShare) / 0.3, 0, 1));

// ---------------------------------------------------------------- the climate file, unpacked

const cache = new WeakMap();
const bytes = (b64) => (typeof Buffer !== "undefined" ? Uint8Array.from(Buffer.from(b64, "base64")) : Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

/** The wind climate of an asset, decoded once, or null when it is not attached. */
export function windClimate(asset) {
  const doc = asset?.wind; if (!doc?.sea) return null;
  const hit = cache.get(doc); if (hit) return hit;
  const wave = bytes(doc.sea.waveU8Base64), seaDrift = bytes(doc.sea.driftU8Base64), hs = bytes(doc.sea.hsDmU8Base64);
  const sea = new Map(doc.sea.cells.map((id, k) => [id, {
    waveM2: Array.from(wave.subarray(k * SECTORS, (k + 1) * SECTORS), (v) => (v / 40) ** 2),
    drift: Array.from(seaDrift.subarray(k * SECTORS, (k + 1) * SECTORS), (v) => (v / 20) ** 3),
    hsM: hs[k] / 10,
  }]));
  const landDrift = bytes(doc.land.driftU8Base64), mm = bytes(doc.land.annualMmU16Base64), share = bytes(doc.land.driestSharePctU8Base64);
  const land = new Map(doc.land.cells.map((id, k) => [id, {
    drift: Array.from(landDrift.subarray(k * SECTORS, (k + 1) * SECTORS), (v) => (v / 20) ** 3),
    annualMm: mm[2 * k] + 256 * mm[2 * k + 1], driestShare: share[k] / 100,
  }]));
  const loess = doc.loess.grids.map((g) => ({ ...g, res: doc.loess.resDeg, values: bytes(g.thicknessDmU8Base64) }));
  const out = { sea, land, loess };
  cache.set(doc, out);
  return out;
}

/** The sea climate off a coast: the climate's sea cell nearest the field cell of `seaAt` ([lat, lon] at sea), within ~3°. */
export function seaClimateNear(climate, field, seaAt) {
  const cell = field.cellAt(seaAt[0], seaAt[1]), hit = climate.sea.get(cell.id); if (hit) return hit;
  let best = null;
  for (let dr = -3; dr <= 3; dr += 1) for (let dc = -3; dc <= 3; dc += 1) {
    const c = field.cellAt(seaAt[0] + dr, seaAt[1] + dc), e = climate.sea.get(c.id); if (!e) continue;
    const d = Math.hypot(dr, dc * Math.cos(seaAt[0] * DEG)); if (!best || d < best.d) best = { d, e };
  }
  return best?.e ?? null;
}

/**
 * What the sea brings a coast, from its sea climate and which of 16 directions lie open to the sea from it
 * (`openFar`: open to some hundreds of km, for swell; `openNear`: sea close by, for onshore wind):
 * { waveEnergy (0–1: the root-mean-square wave height reaching it over 3 m), hsM, onshoreDrift (0–1: the
 * sand-moving power of onshore winds), fromDeg (where most wave energy comes from) }.
 */
export function coastSea(sea, openFar, openNear) {
  let energy = 0, onshore = 0, best = -1, fromDeg = 0;
  for (let k = 0; k < SECTORS; k += 1) {
    // Swell bends round headlands a little: a closed direction still lets in a sixth of its energy.
    const e = sea.waveM2[k] * (openFar[k] ? 1 : 0.15); energy += e; if (e > best) { best = e; fromDeg = k * 360 / SECTORS; }
    if (openNear[k]) onshore += sea.drift[k];
  }
  return { waveEnergy: clamp(Math.sqrt(energy) / 3, 0, 1), hsM: Math.sqrt(energy), onshoreDrift: clamp(onshore / ONSHORE_DP, 0, 1), fromDeg };
}

// ---------------------------------------------------------------- the wind over the land

/**
 * The wind and dryness over the land at a place, mixed from the four nearest 1° cells of the climate:
 * { dp (sand-moving power), towardDeg (where the year's net drift carries sand), steadiness (0–1), annualMm,
 * driestShare, dryness (0–1) }, or null off the fitted land.
 */
export function landWindAt(climate, field, lat, lon) {
  const fy = lat - 0.5, fx = lon - 0.5, y0 = Math.floor(fy), x0 = Math.floor(fx), ty = fy - y0, tx = fx - x0;
  let w = 0, dp = 0, e = 0, n = 0, mm = 0, share = 0;
  for (const [dy, dx, wt] of [[0, 0, (1 - ty) * (1 - tx)], [0, 1, (1 - ty) * tx], [1, 0, ty * (1 - tx)], [1, 1, ty * tx]]) {
    const cell = field.cellAt(y0 + dy + 0.5, x0 + dx + 0.5), c = climate.land.get(cell.id); if (!c || wt <= 0) continue;
    w += wt; mm += wt * c.annualMm; share += wt * c.driestShare;
    c.drift.forEach((v, k) => { const to = (k * 360 / SECTORS + 180) * DEG; dp += wt * v; e += wt * v * Math.sin(to); n += wt * v * Math.cos(to); });
  }
  if (w <= 0) return null;
  dp /= w; mm /= w; share /= w; e /= w; n /= w;
  return { dp, towardDeg: (Math.atan2(e, n) / DEG + 360) % 360, steadiness: dp > 0 ? Math.hypot(e, n) / dp : 0, annualMm: mm, driestShare: share, dryness: dryness(mm, share) };
}

/** Loess thickness (m) at a place, from the climate's 0.25° grids (bilinear), 0 off them. */
export function loessAt(climate, lat, lon) {
  for (const g of climate.loess) {
    const fy = (lat - g.lat0) / g.res - 0.5, fx = (lon - g.lon0) / g.res - 0.5;
    if (fy < -0.5 || fx < -0.5 || fy > g.rows - 0.5 || fx > g.cols - 0.5) continue;
    const y0 = Math.floor(fy), x0 = Math.floor(fx), ty = fy - y0, tx = fx - x0;
    const at = (r, c) => (r < 0 || c < 0 || r >= g.rows || c >= g.cols ? 0 : g.values[r * g.cols + c] / 5);
    return (at(y0, x0) * (1 - tx) + at(y0, x0 + 1) * tx) * (1 - ty) + (at(y0 + 1, x0) * (1 - tx) + at(y0 + 1, x0 + 1) * tx) * ty;
  }
  return 0;
}

/** How fertile a loess blanket makes the ground (0–1): a few metres already make deep, easily worked soil. */
export const loessFertility = (thicknessM) => smoothstep(thicknessM / 4);

/** Whether a soil holds sand the wind can heap into dunes, and whether a bedrock is soft enough to carve (0 or 1). */
export const sandyOf = (soil) => (SANDY.has(soil) ? 1 : 0);
export const softOf = (bedrock) => (SOFT_ROCK.has(bedrock) ? 1 : 0);
/** How bare a biome's ground lies to the wind (0–1). */
export const bareOf = (biome) => BARE[biome] ?? 0.1;

/**
 * The wind's work at a land place: given the land wind (landWindAt), how bare the ground is (0–1, bareOf of the
 * biome), the share of sandy soil and of soft rock about the place (0–1; all three blended between raster cells so
 * nothing ends at a cell's edge), the place
 * (`lat`, `lon`: the ridge patterns are keyed to it) and two world-keyed noises `n`, `m` (−1…1):
 * { deflation (0–1), ground ("pavement" | "dunes" | "yardangs" | null), liftM (the ridges' height change),
 * roughness (how much local roughness is left) }, or null where the wind leaves no mark.
 */
export function aeolianAt(wind, bare, sandShare, softShare, lat, lon, n = 0, m = 0) {
  if (!wind) return null;
  const windy = clamp(wind.dp / WINDY_DP, 0, 1.5), deflation = clamp(wind.dryness * bare * windy, 0, 1);
  if (deflation < 0.12) return null;
  // Distances (km) along and across the net drift, for ridges that lie with it or across it.
  const to = wind.towardDeg * DEG, ax = Math.sin(to), ay = Math.cos(to), x = lon * KM_PER_DEG * Math.cos(lat * DEG), y = lat * KM_PER_DEG;
  const along = x * ax + y * ay, across = -x * ay + y * ax;
  const strength = smoothstep((deflation - 0.12) / 0.3);
  // Where the sand runs out the edge wanders with the noise rather than following the soil map's cells.
  const sand = smoothstep((sandShare + 0.3 * n - 0.35) / 0.3), soft = (1 - sand) * smoothstep((softShare + 0.3 * n - 0.35) / 0.3);
  let liftM = 0, ground = null, roughness = 1 - 0.2 * strength;
  if (sand > 0) {
    // Dunes: ridges across the wind some 400 m apart, their crests bending and rising and falling along their length
    // (never ruled lines), a few metres to some tens of metres high. Where the country is dry only in one season they
    // are low and grassed over between storms.
    const bend = along + 0.12 * Math.sin(2 * Math.PI * across / 1.1 + 3 * n) + 0.05 * Math.sin(2 * Math.PI * across / 0.37 + 5 * m);
    const crest = 0.5 + 0.5 * Math.sin(2 * Math.PI * bend / 0.42 + 2.5 * n), swell = 0.55 + 0.45 * Math.sin(2 * Math.PI * across / 1.7 + 4 * m);
    const dunes = strength * sand;
    liftM += dunes * (3 + 10 * windy) * (0.4 + 0.6 * bare) * crest ** 2 * swell;
    if (crest > 0.55 && dunes > 0.3) ground = "dunes";
    roughness -= 0.4 * dunes;
  }
  // Scouring rock bare takes a dry climate all year round, not only a dry season: an arid country (the year's rain).
  const arid = clamp((800 - wind.annualMm) / 600, 0, 1) * bare * windy, scour = smoothstep((arid - 0.2) / 0.3) * (1 - sand);
  if (scour > 0) {
    if (soft > 0) {
      // Yardangs: soft rock scoured into long ridges lying with the wind, some 250 m apart.
      const ridge = (0.5 + 0.5 * Math.sin(2 * Math.PI * (across + 0.08 * Math.sin(2 * Math.PI * along / 1.3 + 3 * m)) / 0.25 + 2 * n)) ** 3;
      liftM += scour * soft * 10 * ridge; if (scour * soft > 0.5 && ridge > 0.4) ground = "yardangs";
    } else if (scour > 0.5) ground = "pavement"; // the fines blown away: a stony desert pavement
    roughness -= 0.3 * scour;
  }
  return { deflation, ground, liftM, roughness };
}
