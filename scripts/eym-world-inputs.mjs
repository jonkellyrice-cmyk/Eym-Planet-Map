// Eym's dials, in one place. Everything about the world that is a choice and not a consequence is set here; the
// rest is worked out from these (and from the traced maps of Caren and Garyk and their labels, which are drawings,
// not dials). To change the world: change a value here, run `npm run world`, and read the report it writes.
//
// The modules that use each group import it from here and keep their own exported names (EYM_LAYOUT,
// SHELF_KM, STEERING, …), so nothing else needs to know where a dial lives. Each generator fingerprints the groups
// of dials it uses (inputsFingerprint below), so changing a dial makes the build redo what follows from it and
// nothing that does not: a shelf-sea dial does not refit the plates.
//
// Hand-authored exceptions to what the rules give are not dials: they go in data/eym/overrides.json.

const deepFreeze = (value) => { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const v of Object.values(value)) deepFreeze(v); } return value; };

/** The dials of the named groups as text, for a generator's fingerprint of what it is made from. */
export const inputsFingerprint = (...groups) => JSON.stringify(groups.map((g) => { if (!(g in WORLD_INPUTS)) throw new Error(`no such group of dials: ${g}`); return [g, WORLD_INPUTS[g]]; }));

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

    /**
     * How coarsely a continent too large for a flat frame is written into the shipped cartography
     * (scripts/eym-cartography.mjs). Such a continent is known only coarsely (22 km squares, no Region tiles), and
     * every kilobyte of it is loaded by the module, on phones too; so it is kept to what a whole-world or
     * whole-continent map can show. Nothing here touches Caren, Garyk or any land on a flat frame.
     */
    farLand: {
      // A river is drawn where it drains at least one part in `riverLandShare` of its continent (and never less than
      // the 18,000 km² that holds everywhere): about two hundred rivers on the largest continent, not eight hundred.
      riverLandShare: 800,
      // A lake is kept from this many squares (about 5,900 km²) instead of five.
      lakeMinSquares: 12,
      // Courses and coasts are thinned (Douglas–Peucker, measured on the sphere) so that no point dropped lies
      // farther than this from the line kept: a quarter of a square for rivers and for coasts.
      courseThinKm: 6, coastThinKm: 5,
    },
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

  /**
   * The growth of the three far continents (tools/generate-eym-growth.mjs; canon of 19 November 2026: Eym is about
   * 80% water). The plate fit above is left exactly as it is: its continents are the cores, and the land is grown
   * outward from them with no plate boundary moved. Areas in km².
   */
  growth: {
    // The ocean's share of Eym once the continents are grown, and each continent's area (kept within `tolerance`).
    oceanFraction: [0.795, 0.805], tolerance: 0.05,
    areaKm2: { eastern: 65e6, northern: 19e6, southern: 15e6 },
    // Which way each one's growth leans (a compass bearing from its core, and how strongly, 0 to 1): Khohalis west,
    // Gaffa and Demani east, to spread the three out (owner, 19 November 2026).
    lean: { eastern: [90, 0.35], northern: [270, 0.35], southern: [90, 0.35] },
    // How much of its core's shape each keeps as it grows (1 = the same shape, enlarged; 0 = equally in every
    // direction): Khohalis and Demani keep theirs, Gaffa may be reshaped more freely.
    shape: { eastern: 0.3, northern: 1, southern: 1 },
    // The order they are grown in: the two that keep their shapes first, Gaffa round them.
    order: ["northern", "southern", "eastern"],
    // No new land nearer than this (km) to Caren's coast, to Garyk's coast or the strait corridor, or to another
    // grown continent; the growth is held back smoothly over `easeKm` before each limit.
    clearanceKm: { caren: 6000, garyk: 3500, between: 1800 }, easeKm: 1200,
    // Land on a continent's own plate comes first (means a and c); land across a plate boundary (accreted crust,
    // means b) costs this much more reach.
    offPlate: 2.2,
    // The coasts' unevenness (a share of the reach) and its grain (km); the grid the outlines are drawn on (km).
    coastNoise: 0.14, noiseKm: 900, cellKm: 30,
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

  /** The weather's large-scale circulation (scripts/eym-weather.mjs): the belts' seasonal shift, the jet streams and blocking. */
  weather: {
    // How far the wind and pressure belts follow the Sun at the equator, as a share of its declination (the rain
    // belt's own share); the shift fades toward the poles (about 6° each way at 30°, 3° at 60°).
    beltShift: 0.4,
    // The polar-front jet: its mean latitude, and the slow waves it meanders in (how many round the world, how far
    // each swings in degrees, how fast it drifts east in degrees of longitude a day). Modest: a world of ocean has
    // stronger, straighter jets than Earth. The subtropical branch lies at `subtropicalLat` and hardly meanders.
    jetLat: 47, subtropicalLat: 30,
    jetWaves: [{ count: 3, swingDeg: 3.5, eastDegPerDay: 3 }, { count: 4, swingDeg: 2.5, eastDegPerDay: 6 }, { count: 6, swingDeg: 1.5, eastDegPerDay: 11 }],
    // How closely each kind of system keeps to the jet's swings (1 = moves with it).
    follow: { low: 1, high: 0.5 },
    // Blocking: a meander that stalls. Chances are drawn every `blockSlotDays` for each hemisphere (about
    // `blocksPerYear` a year); a block lasts `blockDays`, bends the jet `blockSwingDeg` poleward around a stationary
    // high of `blockHpa`, and warms a summer or chills a winter under it by up to `blockTempC`.
    blockSlotDays: 14, blocksPerYear: 4, blockDays: [7, 21], blockSwingDeg: 9, blockHpa: [12, 18], blockRadiusKm: [1500, 2000], blockTempC: 4,
  },

  /** The shelf seas of the mapped continents (tools/generate-eym-coasts.mjs, scripts/eym-shelf-seas.mjs): tides in bays and storm surge. */
  shelfSeas: {
    // The continents whose coasts are surveyed, and how far apart (km) the survey's points lie along them.
    continents: ["Caren", "Garyk"], sampleSpacingKm: 25,
    // A bay: sea with land within `bayReachKm` in at least `bayEnclosedShare` of directions (an open coast has land in
    // about half), at least `bayMinLengthKm` from where the sea opens. A funnel-shaped one raises the tide as it
    // narrows and shoals (Green's law), by no more than `funnelMaxGain` times.
    bayReachKm: 100, bayEnclosedShare: 0.75, bayMinLengthKm: 30, funnelMaxGain: 2.5,
    // Storm surge: the wind's drag on the sea (a drag coefficient of this size at storm strength) piles water up
    // across the shelf; no surge is reported below `surgeMinM` metres or allowed above `surgeMaxM`.
    surgeDragCoefficient: 0.0025, surgeMinM: 0.3, surgeMaxM: 9,
  },

});
