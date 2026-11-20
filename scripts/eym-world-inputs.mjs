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
    // (mm a year); without, at `freeSpeedMmYr`. The plates named in `speedKept` keep the speeds their fitted
    // histories give them (Caren's and Garyk's: slow plates with no slab, about a centimetre a year).
    slabShare: 0.1, slabSpeedMmYr: [50, 100], freeSpeedMmYr: [10, 30], speedKept: ["caren", "garyk"],
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
    // How much warmer a summer and colder a winter the land has than the sea at its latitude (scripts/eym-seasons.mjs):
    // the yearly swing of the day's mean temperature is the sine of the latitude times `coastC` on the coast, rising
    // by `inlandC` to the deep interior (1,200 km from the sea). Earth-like since the far continents were grown:
    // Earth's interiors swing by about 21 to 26 times the sine of their latitude (Winnipeg, Irkutsk, Kansas City,
    // Alice Springs) and its west coasts by about 6 to 10 (San Francisco, Lisbon, Paris). They were 4 and 10.
    continentality: { coastC: 5, inlandC: 20 },
    /**
     * The land's hand on the large-scale atmosphere (scripts/eym-land-atmosphere.mjs; owner, 20 November 2026).
     */
    land: {
      // Monsoons. The land that heats is what lies between `heatLat` degrees from the equator, counted along each
      // longitude and smoothed over `reachDeg` (so a coast's neighbouring sea feels it); high ground counts for up
      // to `plateauGain` more. Over land from end to end of that band the rain belt follows the Sun `monsoonReach`
      // of its declination farther than over ocean (Earth's reaches 25° to 30° N over southern Asia, 5° to 10° over
      // the open Pacific). Where the belt is drawn `monsoonFullDeg` beyond the ocean's, the wind between the equator
      // and the belt is fully turned: `monsoonWestMs` from the west and `monsoonOnshoreMs` toward the land (m/s).
      heatLat: [5, 40], reachDeg: 18, plateauGain: 0.3, monsoonReach: 0.75, monsoonFullDeg: 10, monsoonWestMs: 10, monsoonOnshoreMs: 4,
      // Stationary waves. What bends a jet is the land and high ground between `jetLat` degrees of latitude, smoothed
      // over `waveDeg` of longitude; ground of `highM` metres counts as fully high. High ground puts a ridge
      // `ridgeDeg` upwind of itself and a trough `troughDeg` downwind, up to `orographyDeg` of latitude; a continent's
      // winter cold puts a trough `coldEastDeg` east of its middle, up to `thermalDeg`. In summer the bends keep
      // `summerShare` of their strength.
      jetLat: [25, 70], waveDeg: 14, highM: 2000, ridgeDeg: 10, troughDeg: 30, orographyDeg: 14, coldEastDeg: 20, thermalDeg: 7, summerShare: 0.35,
      // Blocking. A block is `blockRidgeBias` times as likely to form at the strongest fixed ridge as where the jet
      // is unbent (and as much less likely in a trough as deep), and a hemisphere whose jet is bent by `blockFullDeg` has `blockMore` times as many blocks again.
      blockRidgeBias: 4, blockFullDeg: 6, blockMore: 1,
    },
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

  /** The magnetic field and the auroras (scripts/eym-magnetic.mjs, tools/generate-eym-magnetic.mjs; canon: docs/eym-canon.md). */
  magnetic: {
    // In the campaign's era the north magnetic pole stays inside this box (degrees north, degrees east), over open
    // sea; the south magnetic pole is its antipode (a dipole). The box is the canon's: anywhere in it every coast of
    // the continents named below lies within `coastLatDeg` of the magnetic equator. The era is `campaignEraYears`
    // either side of the calendar's start; over longer spans the pole wanders naturally and the box does not hold
    // (for the history engine).
    poleBox: { latDeg: [79, 80], lonDeg: [80, 100] }, campaignEraYears: 1000,
    // The pole's wander: once round a long, narrow loop that fills this share of the box, in this many years,
    // starting (at the calendar's northward equinox) this far round it. With these it never moves slower than
    // `driftKmYr[0]` or faster than `driftKmYr[1]` kilometres a year.
    loop: { fill: 0.9, years: 26, phaseDeg: 0 }, driftKmYr: [10, 50],
    // The field's strength at the magnetic equator, in microtesla (twice that at the poles).
    equatorMicrotesla: 31,
    // The continents the canon protects: their coasts stay within `coastLatDeg` of the magnetic equator, and the
    // pole keeps at least `openSeaKm` of sea between itself and any land.
    continents: ["Caren", "Garyk"], coastLatDeg: 12, openSeaKm: 150,
    // Auroras. Activity runs from 0 (quiet) to 9 (a severe storm), and 10 is a great storm. The oval lies between
    // `ovalDeg` of magnetic latitude when quiet; its equatorward edge moves `edgePerLevelDeg` toward the equator
    // with each level. An aurora overhead is seen low in the sky from `horizonDeg` farther toward the equator
    // (`greatHorizonDeg` in a great storm, whose red tops stand higher). A great storm is seen down to somewhere
    // in `greatStormDeg` of magnetic latitude and never below it; there are about `greatStormsPerCentury`.
    // Storms come oftener near the top of the sun's cycle of `cycleYears`.
    aurora: { ovalDeg: [65, 75], edgePerLevelDeg: 2, horizonDeg: 7, greatHorizonDeg: 15, greatStormDeg: [20, 25], greatStormsPerCentury: 3, cycleYears: 11 },
  },

});
