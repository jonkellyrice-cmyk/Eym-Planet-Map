// Eym's sea floor by rule: the depth of the sea at a place from its distance to the coast and to the plates'
// edges (data/eym/tectonics.json), and the seamounts the mantle's plumes have left. One statement of it, shared by
// the cartography (scripts/eym-cartography.mjs, which draws it) and the ocean climate
// (tools/generate-eym-climate.mjs, whose currents it steers), so the two can never disagree.
// Pure functions: no files are read here.

import { greatCircleKm } from "./eym-surface.mjs";
import { WORLD_INPUTS } from "./eym-world-inputs.mjs";

/** Shelf width (km) by the kind of margin: narrow where sea floor goes down or continents collide, wide on rifted coasts. */
export const SHELF_KM = WORLD_INPUTS.seaFloor.shelfKm;
/** The continental slope's width (km) beyond the shelf, and the stretch over which the abyss goes on deepening. */
export const SLOPE_KM = WORLD_INPUTS.seaFloor.slopeKm, ABYSS_KM = WORLD_INPUTS.seaFloor.abyssKm;

/** A coast's margin from its distances (km) to the nearest trench and collision. */
export const marginOf = (trenchKm, collideKm) => (trenchKm <= 500 || collideKm <= 400 ? "active" : "passive");

/**
 * The sea floor's height (m, negative) from the distance to the nearest coast, ridge and trench (km) and the
 * margin: a shelf (40–150 m), a slope down to about 3,200 m, an abyss deepening to about 4,500 m, mid-ocean
 * ridges up to 2,300 m above it and trenches up to 3,200 m below. Not clamped or rounded.
 */
export function seaFloorHeightM(coastKm, ridgeKm, trenchKm, margin) {
  const d = coastKm, shelfKm = SHELF_KM[margin];
  const shelf = -40 - Math.min(d, shelfKm) / shelfKm * 110, slope = d > shelfKm ? -Math.min(1, (d - shelfKm) / SLOPE_KM) * 3050 : 0, abyss = d > shelfKm + SLOPE_KM ? -Math.min(1, (d - shelfKm - SLOPE_KM) / ABYSS_KM) * 1300 : 0;
  const ridge = d > 400 ? 2300 * Math.exp(-((ridgeKm / 320) ** 2)) : 0, trench = -3200 * Math.exp(-((trenchKm / 110) ** 2));
  return shelf + slope + abyss + ridge + trench;
}

/**
 * The floor raised over the hotspot chains' seamounts (each some 50 km across, its summit deeper the older it is):
 * a 1° cell holds about a fifth of one, so it rises about a third of the way toward a summit at its centre.
 */
export function shoalOverSeamounts(seamounts, lat, lon, heightM) {
  let e = heightM;
  for (const s of seamounts) {
    if (Math.abs(s.at[0] - lat) > 3 || s.summitDepthM <= e) continue;
    const km = greatCircleKm(s.at, [lat, lon]); if (km < 250) e += (s.summitDepthM - e) * 0.35 * Math.exp(-((km / 80) ** 2));
  }
  return e;
}

/** Every seamount of the tectonic history's hotspot chains ([] before the mantle was fitted). */
export const seamountsOf = (tectonics) => (tectonics?.mantle ? tectonics.mantle.chains.flatMap((c) => c.seamounts) : []);

/**
 * The tectonic history's distance rasters (1°, rows from the north), decoded to km: { ridgeKm, trenchKm,
 * collideKm, index(latIndexFromSouth, lonIndex) }.
 */
export function tectonicDistances(tectonics, latCount = 180, lonCount = 360) {
  const decode = (b64) => (typeof Buffer !== "undefined" ? Uint8Array.from(Buffer.from(b64, "base64")) : Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  const R = tectonics.rasters, toKm = (bytes) => Float32Array.from(bytes, (v) => (v === 255 ? 5000 : v * 10));
  return {
    ridgeKm: toKm(decode(R.ridgeDistance10Km)), trenchKm: toKm(decode(R.trenchDistance10Km)), collideKm: toKm(decode(R.collisionDistance10Km)),
    // The rasters run from the north; the cells from the south.
    index: (latIndex, lonIndex) => (latCount - 1 - latIndex) * lonCount + lonIndex,
  };
}
