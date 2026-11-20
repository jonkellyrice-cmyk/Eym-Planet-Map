// The land's hand on the large-scale atmosphere (owner's addendum of 20 November 2026). Until Eym's far continents
// were grown the atmosphere could ignore the land: the rain belt followed the Sun alike at every longitude, and the
// jets meandered by the clock alone. With a fifth of the world land, three things follow from where the land is:
//   - Monsoons. Land heats faster than sea, so over and beside a large land the tropical rain belt follows the
//     summer Sun much farther than over open ocean, and the trade winds between the equator and the belt turn
//     about and blow onshore.
//   - Stationary waves. A jet is bent in fixed places by what lies under it: a ridge over and just upwind of high
//     ground and a trough downwind of it; and in winter a trough over the cold eastern side of a continent, with a
//     ridge over the milder sea beyond. Blocking highs form more often where the ridges stand.
// Everything here is worked out once from the coarse world (the 1° land mask and heights of
// scripts/eym-seasons.mjs's field) and kept with it: no clock, no noise, nothing random. Over a longitude with no
// land in reach every function gives exactly what the atmosphere gave before.

import { WORLD_INPUTS } from "./eym-world-inputs.mjs";
import { rainBeltLat } from "./eym-seasons.mjs";

const L = WORLD_INPUTS.weather.land, DEG = Math.PI / 180, BIN_DEG = 5, BINS = 360 / BIN_DEG;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const cache = new WeakMap();

/** A ring of values (one for each 5° of longitude) smoothed round the world with a bell of `sigmaDeg`. */
function smoothRing(values, sigmaDeg) {
  const out = new Float64Array(BINS), reach = Math.ceil(3 * sigmaDeg / BIN_DEG);
  for (let b = 0; b < BINS; b += 1) { let sum = 0, weight = 0; for (let d = -reach; d <= reach; d += 1) { const w = Math.exp(-((d * BIN_DEG / sigmaDeg) ** 2) / 2); sum += w * values[((b + d) % BINS + BINS) % BINS]; weight += w; } out[b] = sum / weight; }
  return out;
}
/** A ring read at a longitude, between its two nearest bins. */
function ringAt(ring, lon) { const u = (((lon + 180) % 360) + 360) % 360 / BIN_DEG - 0.5, b0 = Math.floor(u), f = u - b0; return ring[((b0 % BINS) + BINS) % BINS] * (1 - f) + ring[(((b0 + 1) % BINS) + BINS) % BINS] * f; }
/** The same ring turned so that what stood `deg` to the west is read here. */
const shifted = (ring, deg) => Float64Array.from({ length: BINS }, (_, b) => ringAt(ring, -180 + (b + 0.5) * BIN_DEG - deg));

/**
 * The land's atmosphere for a world (a field from `environmentField`): made once and kept with the field.
 * Hemispheres are 1 (north) and -1 (south).
 */
export function landAtmosphere(field) {
  if (!field) return null;
  const hit = cache.get(field); if (hit) return hit;
  // For each 5° of longitude and each hemisphere: how much of the tropics and subtropics is land (weighted up where
  // it is high: a plateau heats the air above it), how much of the jet's latitudes is land, and how high they stand.
  const sums = { heat: [new Float64Array(BINS), new Float64Array(BINS)], heatArea: [new Float64Array(BINS), new Float64Array(BINS)], land: [new Float64Array(BINS), new Float64Array(BINS)], high: [new Float64Array(BINS), new Float64Array(BINS)], jetArea: [new Float64Array(BINS), new Float64Array(BINS)] };
  for (const cell of field.cells) {
    const a = Math.abs(cell.lat), h = cell.lat >= 0 ? 0 : 1, b = clamp(Math.floor((cell.lon + 180) / BIN_DEG), 0, BINS - 1), area = Math.cos(cell.lat * DEG), isLand = cell.ocean ? 0 : 1;
    if (a >= L.heatLat[0] && a <= L.heatLat[1]) { sums.heatArea[h][b] += area; sums.heat[h][b] += area * isLand * (1 + L.plateauGain * clamp(cell.elevationM / 3000, 0, 1)); }
    if (a >= L.jetLat[0] && a <= L.jetLat[1]) { sums.jetArea[h][b] += area; sums.land[h][b] += area * isLand; sums.high[h][b] += area * isLand * clamp(cell.elevationM / L.highM, 0, 1.5); }
  }
  const share = (sum, area) => Float64Array.from(sum, (v, b) => (area[b] ? v / area[b] : 0));
  const hemispheres = [0, 1].map((h) => {
    const heat = smoothRing(share(sums.heat[h], sums.heatArea[h]), L.reachDeg).map((v) => clamp(v, 0, 1));
    const land = smoothRing(share(sums.land[h], sums.jetArea[h]), L.waveDeg), high = smoothRing(share(sums.high[h], sums.jetArea[h]), L.waveDeg);
    // The jet's fixed bends, in degrees of latitude poleward: from the high ground (a ridge over and a little upwind
    // of it, a trough `troughDeg` downwind), and in winter from the land's cold (a trough toward its eastern side).
    const mean = (ring) => ring.reduce((s, v) => s + v, 0) / BINS, centred = (ring) => { const m = mean(ring); return ring.map((v) => v - m); };
    const upwind = shifted(high, -L.ridgeDeg), downwind = shifted(high, L.troughDeg), relief = centred(Float64Array.from(upwind, (v, b) => L.orographyDeg * (v - downwind[b])));
    const eastSide = shifted(land, L.coldEastDeg), cold = centred(Float64Array.from(eastSide, (v) => -L.thermalDeg * v));
    return { heat, relief, cold };
  });
  const of = (hemisphere) => hemispheres[hemisphere >= 0 ? 0 : 1];
  /** How much of a winter it is in a hemisphere (1 at its midwinter, -1 at its midsummer). */
  const winter = (hemisphere, declinationDeg) => clamp(-declinationDeg * hemisphere / 23.44, -1, 1);

  const atmosphere = {
    /** How strongly the land along a longitude heats in its summer, 0 (open ocean) to 1 (land from 5° to 40°). */
    heatingAt: (hemisphere, lon) => ringAt(of(hemisphere).heat, lon),
    /** The rain belt's latitude at a longitude: the ocean's place for the season, carried on toward the summer pole by the land. */
    rainBeltLatAt: (lon, declinationDeg) => rainBeltLat(declinationDeg) + L.monsoonReach * ringAt(of(declinationDeg).heat, lon) * declinationDeg,
    /**
     * The monsoon's wind (m/s east and north) at a place: nothing where the belt stands where the ocean's would;
     * where the land has drawn it on, a westerly, onshore wind between the equator and the belt, strongest midway.
     */
    monsoonWind(lat, lon, declinationDeg) {
      const pull = L.monsoonReach * ringAt(of(declinationDeg).heat, lon) * declinationDeg, strength = clamp(Math.abs(pull) / L.monsoonFullDeg, 0, 1);
      if (strength < 0.02) return { east: 0, north: 0, strength: 0 };
      const h = declinationDeg >= 0 ? 1 : -1, belt = (rainBeltLat(declinationDeg) + pull) * h, at = lat * h;
      if (belt <= 2 || at <= -2 || at >= belt + 3) return { east: 0, north: 0, strength: 0 };
      const w = strength * Math.sin(Math.PI * clamp((at + 2) / (belt + 5), 0, 1)) ** 0.8;
      return { east: w * L.monsoonWestMs, north: h * w * L.monsoonOnshoreMs, strength: w };
    },
    /** How far (degrees of latitude, poleward positive) a hemisphere's jet is bent at a longitude by what lies under it. */
    stationaryJetDeg(hemisphere, lon, declinationDeg) {
      const set = of(hemisphere), cold = winter(hemisphere, declinationDeg);
      return (L.summerShare + (1 - L.summerShare) * Math.max(0, cold)) * ringAt(set.relief, lon) + Math.max(cold, -L.summerShare) * ringAt(set.cold, lon);
    },
    /**
     * The longitude for a blocking high, from a number drawn evenly in 0–1: evenly round the world where the jet is
     * not bent, more often where its fixed ridges stand (`blockRidgeBias` times as often at the strongest) and less
     * often in its fixed troughs.
     */
    /** How many times as often a hemisphere blocks as a world with unbent jets: more, the more its jet is bent. */
    blockRate(hemisphere, declinationDeg) { let top = 0; for (let b = 0; b < BINS; b += 1) top = Math.max(top, atmosphere.stationaryJetDeg(hemisphere, -180 + (b + 0.5) * BIN_DEG, declinationDeg)); return 1 + L.blockMore * clamp(top / L.blockFullDeg, 0, 1); },
    blockLon(hemisphere, u, declinationDeg) {
      const bends = Float64Array.from({ length: BINS }, (_, b) => atmosphere.stationaryJetDeg(hemisphere, -180 + (b + 0.5) * BIN_DEG, declinationDeg)), top = Math.max(...bends);
      if (top < 0.05) return u * 360 - 180;
      // (As likely again at the strongest ridge as the bias says, and as much less likely in a trough as deep.)
      const weights = bends.map((v) => L.blockRidgeBias ** clamp(v / top, -1, 1)), total = weights.reduce((s, v) => s + v, 0); let run = 0;
      for (let b = 0; b < BINS; b += 1) { const next = run + weights[b] / total; if (u < next || b === BINS - 1) return -180 + (b + clamp((u - run) / (next - run), 0, 1)) * BIN_DEG; run = next; }
      return 180;
    },
  };
  cache.set(field, atmosphere); return atmosphere;
}
