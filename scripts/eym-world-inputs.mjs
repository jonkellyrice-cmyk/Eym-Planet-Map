// Eym's dials, in one place. Everything about the world that is a choice and not a consequence is set here; the
// rest is worked out from these (and from the traced maps of Caren and Garyk and their labels, which are drawings,
// not dials). To change the world: change a value here, run `npm run world`, and read the report it writes.
//
// The modules that use each group import it from here and keep their own exported names (EYM_LAYOUT,
// SHELF_KM, STEERING, …), so nothing else needs to know where a dial lives. This file is among the sources the
// tectonic history and the ocean climate are fingerprinted from: changing a dial makes the build redo what
// follows from it.
//
// Hand-authored exceptions to what the rules give are not dials: they go in data/eym/overrides.json.

const deepFreeze = (value) => { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const v of Object.values(value)) deepFreeze(v); } return value; };

export const WORLD_INPUTS = deepFreeze({
  /**
   * Where everything goes (scripts/eym-surface.mjs, EYM_LAYOUT). Caren straddles the equator; Garyk lies three weeks
   * by steamer from it. The three seeded continents: `areaCarens` is each one's size as a multiple of Caren's area
   * (Caren is about 1.53 million km²); `center` is [latitude, longitude]; `elongation` is length over width;
   * `orientationDeg` turns the long axis; `ridges` are the heights (m) its ranges are drawn toward.
   */
  layout: {
    seed: "eym-surface|v1",
    caren: { center: [0, 0] },
    // 21 days at an average 9 knots, sailing 8% further than the great circle.
    garyk: { centerLat: 15, steamer: { days: 21, knots: 9, routeFactor: 1.08 }, carenPortPx: [85, 421], garykPortPx: [1318, 828] },
    seeded: [
      { id: "eastern", name: "Gaffa", areaCarens: 1.6, center: [5, 161], elongation: 1.5, orientationDeg: 20, ridges: [4300, 3100], offshoreIslands: 12 },
      { id: "northern", name: "Khohalis", areaCarens: 0.65, center: [52, 138], elongation: 1.8, orientationDeg: 70, ridges: [2900], offshoreIslands: 9 },
      { id: "southern", name: "Demani", areaCarens: 0.55, center: [-50, 166], elongation: 1.6, orientationDeg: 115, ridges: [3300], offshoreIslands: 8 },
    ],
    // The archipelagos' centres are fixed (they were placed in eym-surface-v1 by 18 draws against the old seeded
    // coasts); the draws are still taken so each archipelago's islands come out exactly as before.
    // (17 November 2026: when Gaffa moved to the far side of Eym, the chain at 8.8°N 152.4°E stood in its way and
    // moved to 8.8°N 39°E, the open ocean Gaffa left; its islands keep their shape around the new centre.)
    archipelagos: { count: 10, islands: [5, 14], spreadKm: 420, minCoastClearanceKm: 900, areaKm2: [60, 18_000], placementDraws: 36,
      centers: [[-33.425, 154.562], [-15.44, -64.333], [-13.744, 60.808], [36.419, 115.164], [12.415, 95.444], [8.836, 39], [-21.136, -115.839], [20.432, -131.434], [-20.699, -163.072], [-16.488, 19.933]] },
  },

  /** The plate fit (tools/generate-eym-tectonics.mjs). */
  plates: {
    // How closely a seeded continent must come out to what the layout asks: its area within this fraction, its centre within this many degrees.
    targetTolerance: { areaFraction: 0.1, centerDeg: 3 },
    // Eym stays 98.6% ocean: the fit keeps the ocean's share between these.
    oceanFraction: [0.9855, 0.9865],
    // What drives a plate: with a sinking slab along at least `slabShare` of its edge it moves at `slabSpeedMmYr`
    // (mm a year); without, at `freeSpeedMmYr`. The plates named in `speedExempt` keep their fitted speeds.
    slabShare: 0.1, slabSpeedMmYr: [50, 100], freeSpeedMmYr: [10, 30], speedExempt: ["caren", "garyk"],
  },

  /** The sea floor's shape (scripts/eym-seafloor.mjs): shelf widths (km) by margin, the slope's width, the abyss's run. */
  seaFloor: { shelfKm: { active: 50, passive: 220 }, slopeKm: 260, abyssKm: 1500 },

  /** The ocean climate (tools/generate-eym-climate.mjs). */
  ocean: {
    // How far the wind belts follow the Sun (Earth's move about 0.6 of the declination; an aquaplanet's less).
    beltShift: 0.4,
    // How much of the sea floor's shape the upper ocean feels (0 = a flat floor, 1 = one unlayered sea).
    steering: 0.3,
    // The strength of upwelling along a continental slope (at 0.4 m/s) and over a seamount chain (at 0.3 m/s), on the wind-driven upwelling's scale.
    slopeUpwelling: 0.6, seamountUpwelling: 0.8,
  },
});
