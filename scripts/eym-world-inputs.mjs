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
     * The island cluster west of Caren (canon of 20 November 2026): a plume under the Caren Plate at `center` has
     * built `islands` volcanic islands of `areaKm2` each on a shallow ridge within `halfKm` of it ([east–west,
     * north–south]), 800 to 1,200 km off Caren's west coast. A natural outlier among the plumes (it stands far
     * from the margins of the mantle's upwellings, where the others rise). It is no part of the plate fit.
     */
    hotspotCluster: { id: "western-isles", center: [1.5, -14], halfKm: [210, 270], islands: 9, areaKm2: [40, 1600], minGapKm: 25 },

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
    // The plate fit places the continents' cores, which with Caren and Garyk leave 98.6% ocean: the fit keeps the
    // cores' share between these. (Not the world's: the land grown from the cores, `growth` below, brings Eym to
    // about 80% ocean, each grown area with its tectonic origin.)
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

  /**
   * Caren's land surface from its natural history (scripts/eym-caren-relief.mjs; canon of 20 November 2026,
   * docs/eym-canon.md). Places are [latitude, longitude]; heights in metres. The outline, the waters, the forests and
   * where the mountains stand are the owner's map; these say how high the land is and why.
   */
  caren: {
    // Where the rule is used (Caren and its islands).
    box: { latDeg: [-11, 9.5], lonDeg: [-6.5, 6.5] },
    // Above this, so near the equator, snow lies all year and small glaciers form (m); below it snow comes only now
    // and then, in cold, wet spells, and does not stay.
    snowLineM: 4800,
    // The northern swell (the plume under northern Caren: a nudge): a dome `heightM` high at its centre, falling
    // away over `reachKm` (faster to the south, toward the Sondel), eased to nothing at the coast over
    // `coastRampKm` so that every northern coast rises to it by a long, gentle ramp. `dynamicShare` of the lift is
    // the mantle's push (about a kilometre at most, as under Earth's swells); the rest is thicker crust.
    swell: { center: [6, 0], reachKm: { north: 420, south: 250, eastWest: 480 }, shape: 3, heightM: 1700, dynamicShare: 0.57, coastRampKm: 150 },
    // The great rivers of the dome (the Myra, the Thran, the Palma and the river by Menera, by their ids in the
    // traced map): older than the uplift, they cut down as it rose. Each is tidal for its lowest `estuaryKm`, then
    // climbs `gradientMPerKm` (navigable; rapids, no falls); its valley's sides rise to the plateau over `valleyKm`.
    // `drawnAsRivers` are waters the tracing took for lakes that are rivers drawn wide (the Palma). On every wide
    // river of Caren the real channel is at most `channelMaxKm` wide, and a great one (`estuaryFromM` wide or more)
    // widens `estuaryWidens` times, to no more than `estuaryMaxKm`, over its tidal reach.
    rivers: { ids: ["caren-water-1", "caren-water-2", "caren-water-3", "caren-water-6"], estuaryKm: 75, gradientMPerKm: 0.3, valleyKm: 50, drawnAsRivers: ["caren-water-2"], channelMaxKm: 3, estuaryFromM: 1000, estuaryWidens: 2.5, estuaryMaxKm: 7 },
    // Lakes lie in sags of the warped surface: each has one level, `belowShoreM` under the lowest ground on its
    // shore, and the ground eases down to it over `sagKm`.
    lakes: { belowShoreM: 6, sagKm: 25 },
    // The massifs of the ancient belt (quartzite and massive granite; none is a volcano), where the map draws them.
    massifs: [
      { name: "Mt. Weth", at: [4.48, -2.51], reachKm: 95 },
      { name: "Mt. Shila", at: [4.25, 1.05], reachKm: 95 },
      { name: "Mt. Oplin and Mt. Danrich", line: [[5.55, 2.6], [6.62, 4.09]], reachKm: 80 },
    ],
    // How high such a massif can stand above the land round it: the greatest relief hard rock keeps on an old,
    // worn-down continent (`inselbergM`: Earth's largest, as Mulanje, stand about 2,300 m above their plains), the
    // throw of the small faults that raise it as a block on the swell (`blockThrowM`: small, since no fault here
    // gives a great earthquake), and the crust's rebound as `valleyErosionM` of rock is cut away round it. Its
    // shoulders (the map's mountains, below its high peaks) stand at `shoulderShare` of that.
    massif: { inselbergM: 2300, blockThrowM: 300, valleyErosionM: 350, shoulderShare: 0.45 },
    // Hills: [the map's mountains, the map's high peaks] above the land round them.
    hills: [
      { name: "Trate Hills", at: [-5.26, -2.23], reachKm: 120, heightM: [450, 1150] },
      { name: "Sarven Hills", at: [-5.28, 0.68], reachKm: 120, heightM: [450, 1150] },
    ],
    // What is left of the Sondel Range (artificial: real magic, now a ruin): the heights the map gave it are kept.
    sondel: { name: "Sondel Range", latDeg: [-2.4, 4], lonDeg: [-1.4, 2], heightM: [2300, 5400] },
    // The map's tan country is dry country, not high ground: it stands this much above the plain. Mountains and
    // peaks that belong to none of the above: [mountains, peaks].
    dryCountryM: 90, otherHeightM: [600, 1200],
    // The Arluna impact structure: its ring trough runs through the middles of these lakes; a central uplift
    // `upliftM` high, the trough `troughM`, and an outer rim `rimM` high at `rimAt` times the trough's radius.
    // Its age is the world's author's to fix: old enough to be worn low, young enough to keep its ring.
    arluna: { lakes: ["caren-water-26", "caren-water-27", "caren-water-28", "caren-water-31", "caren-water-32"], upliftM: 250, troughM: -60, rimM: 150, rimAt: 1.25, ageMyr: [20, 200] },
    // The crust: `lowlandKm` thick where the land stands at `lowlandM`; its density and the mantle's (kg/m³).
    crust: { lowlandKm: 36, lowlandM: 150, densityCrust: 2800, densityMantle: 3300 },
  },

  /**
   * Eym's rain as a budget of the water the air carries (scripts/eym-rain.mjs; owner's direction of 20 November
   * 2026). The sizes of the causes are taken from measured physics, and the overturning is fitted to one thing
   * only: the rain by latitude of an all-ocean Eym (scripts/eym-seasons.mjs, `zonalPrecipitationMm`), which it
   * gives back within about a tenth. No number is set to reach a wanted rainfall at any place.
   */
  rain: {
    // The air is followed back `steps` steps of `stepKm` along the month's wind, and forward again from there,
    // starting `startFull` full (what it starts with is forgotten within a few days' travel).
    path: { stepKm: 50, steps: 100, startFull: 0.6 },
    // A full column of air over sea-level ground holds `fullMmAt27` mm of water where the air at sea level is
    // 27 °C, and `perC` more or less for each degree (the vapour-pressure law as measured over the oceans, Stephens
    // 1990); the water thins out upward with a scale of `scaleM`, so the column over ground that high holds 1/e.
    column: { fullMmAt27: 59, perC: 0.064, scaleM: 2500 },
    // Rain by how full the column is: `mmPerDay` when it is `fromFull` full, and e times more for each 1/`steepness`
    // fuller (the monthly law measured over the tropical oceans, Bretherton, Peters and Back 2004). What a column
    // cannot hold at all falls within about `spillKm`. A month is dry under `dryMonthMm` and wet from `wetMonthMm`.
    rain: { mmPerDay: 1, steepness: 11.4, fromFull: 0.522, spillKm: 60, dryMonthMm: 60, wetMonthMm: 100 },
    // The sea: the low air over it is `airFull` full for the sea's own temperature, and the column takes water up
    // toward that with a time of `uptakeDays`. Warm water draws the low air together and cold water spreads it:
    // `gatherPerC` a day for each degree the sea is warmer than the sea `ringDeg` round it (Lindzen and Nigam 1987).
    sea: { airFull: 0.85, uptakeDays: 4, gatherPerC: 0.09, ringDeg: 8 },
    // The land gives its rain back to the air by Budyko's curve: nearly all where the rain is far less than the
    // `evaporationMmDay` the Sun could lift, a falling share where it is more (the rest runs off).
    land: { evaporationMmDay: 4.5 },
    // The air mixes with the air round and above it toward what the open ocean's air holds at its latitude, with
    // a time of `days` (the stirring of the weather: about a million m² a second across some 700 km, the width of a rain shadow).
    mixing: { days: 6 },
    // The overturning of the air: gathering under the rain belt, spreading round it, gathering along the storm
    // tracks (each per day, with a width in degrees). Fitted to the all-ocean rain by latitude; shapes, not places.
    overturning: { beltPerDay: 0.229, beltWidthDeg: 10.1, dryPerDay: 0.0632, dryOffsetDeg: 6.36, dryWidthDeg: 44.2, stormPerDay: 0.366, stormLat: 58.1, stormWidthDeg: 16.1, polarPerDay: 0 },
    // The rain belt stands over the warmest water within `pullMostDeg` of its seasonal place, the sea's anomaly
    // taken along `pullReachDeg` of longitude to either side.
    belt: { pullReachDeg: 12, pullMostDeg: 12 },
    // The season's wind: trades of `easterlyMs` from the east (slack by `doldrums` under the belt) blowing toward
    // the belt at up to `towardBeltMs` (full `turnDeg` from it); air that has crossed the equator to a belt more than
    // `monsoonFromDeg` from it is turned to a westerly of up to `monsoonWestMs` (full when the belt is `monsoonFullDeg`
    // farther still); westerlies of `westerlyMs` beyond `westerliesFromDeg`. (The belts' seasonal shift is Eym's own: scripts/eym-rain-band.generated.mjs.)
    // The wind is never slacker than `leastMs`, and through a month it blows from
    // `spreadDeg` to either side of its mean a quarter of the time each. Low air climbs high ground only within
    // speed/`layeringPerS` of its top (the air's layering, N = 0.01 a second), measured above the lowest ground
    // of the last `blockKm`.
    wind: { towardBeltMs: 3, turnDeg: 6, easterlyMs: 6, doldrums: 0.6, monsoonFromDeg: 4, monsoonFullDeg: 8, monsoonWestMs: 4, westerliesFromDeg: 28, westerlyMs: 8, leastMs: 2, spreadDeg: 25, layeringPerS: 0.01, blockKm: 500 },
    // A wind gap: ground `wallM` higher on both sides, across the wind, within `widthKm` in all. In the narrowest
    // the wind runs `speedUp` times faster again and spreads by that extra speed over the gap's width (a few
    // millionths a second, as measured in the Turkana channel); `lowAirShare` of the column is in the air that spreads.
    jet: { stepKm: 50, widthKm: 600, wallM: 600, speedUp: 1, lowAirShare: 0.5 },
    // The rain file (data/eym/rain.json): land by the degree (four places in each square, and `neighbourShare` of
    // each square's rain taken from the land squares beside it), the sea every `seaDeg` degrees.
    grid: { seaDeg: 4, neighbourShare: 0.34 },
  },

  /**
   * Caren's temperatures and its survey (scripts/eym-caren-climate.mjs; canon of 20 November 2026). Its rain is the
   * planet's (the `rain` group above).
   */
  carenClimate: {
    // A month is wet from `wetMonthMm` and dry under `dryMonthMm`.
    rain: { wetMonthMm: 60, dryMonthMm: 60 },
    // Temperature: cooler by `lapseCPerKm` with height; the months swing by `sunSwingC` times how far the Sun
    // stands from overhead (its cosine against `sunMean`); the sea upwind is felt within `seaReachKm` of the coast;
    // a wet month (`cloudyMm` or more) is `rainCoolC` cooler. The day's range runs from `dayRangeC[0]` in a wet
    // month or on the coast to `dayRangeC[1]` in a dry month `rangeFullKm` or more inland. Ground frost forms in
    // hollows on a clear night when the air falls to `groundFrostC`.
    temperature: { lapseCPerKm: 6.5, sunSwingC: 25, sunMean: 0.96, seaReachKm: 300, rainCoolC: 1.5, cloudyMm: 200, dayRangeC: [8, 16], rangeFullKm: 150, groundFrostC: 4 },
    // The Sondel Range before it fell (real magic; for the climate of that time only): a wall across Caren from
    // coast to coast along `latDeg`, `crestM` high and `halfWidthKm` to either side. Its line and height are taken
    // from what is left of it; the world's author may correct them.
    wallBeforeTheFall: { latDeg: 1.2, halfWidthKm: 120, crestM: 4500 },
    // The Molkath desert's country for the survey: the map's tan ground (dry tableland) within this box round the
    // Sondel's remnant, taken in four parts by where it lies from the remnant's crest (`crestAt`).
    molkath: { latDeg: [-2.5, 4.8], lonDeg: [-3.6, 2.6], crestAt: [1.2, -0.2] },
  },

  /**
   * How high a range stands, from its history (scripts/eym-orogeny.mjs; owner, 20 November 2026). Normal crust is
   * `crustKm` thick and cannot be thickened beyond `maxCrustKm` (it spreads sideways instead: Tibet's is about 70).
   * The surface floats (1 − `crustDensity`/`mantleDensity`) of the excess above the sea. Of the plates' convergence
   * `shorteningShare` shortens the belt (a subducting plate mostly goes down; where terranes are swept up more is
   * taken; a collision takes half), over a belt `beltWidths` times the range's drawn width. The excess wears down
   * at excess³ / `wearKm2Myr` a million years under `referenceRainMm` of rain, faster in wetter country. These are
   * set by Earth's ranges, not Eym's: an Alpine collision (10 mm a year for 35 million years) stands with about
   * 17 km of excess crust and a mean height of 2.5 km; the Himalaya (45 mm a year) with 28 km; a coastal range
   * over a plate going down at 65 mm a year with 16 km; and a belt that stopped 300 million years ago keeps
   * about 4 km, low mountains, as the Appalachians do.
   * Summits stand `peakOverMean` times the belt's mean height. The rain a range wears under is its latitude's on an
   * all-ocean Eym (the rain budget reads the heights, so the heights cannot read the budget).
   */
  orogeny: { crustKm: 35, maxCrustKm: 70, crustDensity: 2800, mantleDensity: 3300, shorteningShare: { subduction: 0.04, accretion: 0.08, collision: 0.5 }, beltWidths: 3, wearKm2Myr: 10000, referenceRainMm: 1000, peakOverMean: 2,
    // The histories the plate record does not date range by range: the First Land's assembly closed its seams at
    // `assembly.convergenceMmYr` for `assembly.activeMyr` and ended `assembly.endedMyrAgo` (420 to 320 Myr ago); the
    // far continents' collisions of today began `collisionMyr` ago, and terranes have been swept up along their
    // leading edges for `accretionMyr`. (The rates of today's ranges are the plates' own.)
    assembly: { convergenceMmYr: 40, activeMyr: 100, endedMyrAgo: 320 }, collisionMyr: 25, accretionMyr: 120 },

  /**
   * What the land sheds and where it rests, and the crust under it (scripts/eym-sediment.mjs, tools/generate-eym-
   * crust.mjs; owner, 20 November 2026). A square wears `flatMPerMyr` even where flat and dry, and `steepMPerMyr`
   * more for each kilometre it stands above its lowest neighbour under `referenceRunoffMm` of runoff (about 50 m a
   * million years is the world's mean on Earth; a kilometre of relief in wet country sheds several times that),
   * divided by its rock's hardness (`rock`: granite and quartzite wear slowly, shale fast). Ground gentler than
   * `plainSlopeMPerKm` keeps up to `plainKeeps` of what comes down to it; a hollow deeper than `basinDepthM` below its lip is a
   * closed basin and keeps all that reaches it; `deltaShare` of what reaches the sea is
   * laid at the mouth and the rest along the shelf beside it. Thicknesses are today's rates kept up for
   * `depositMyr` (the time since the First Land broke up), no thicker than `maxFillKm`. Rock that formed deep
   * (granite, gneiss, metamorphic rock, marble, quartzite) at the surface has been unroofed at least
   * `basementUnroofedKm`; a cover of sediment or lava has not.
   */
  sediment: { flatMPerMyr: 5, steepMPerMyr: 150, referenceRunoffMm: 650, plainSlopeMPerKm: 1.5, plainKeeps: 0.35, basinDepthM: 300, deltaShare: 0.5, depositMyr: 190, maxFillKm: 12, basementUnroofedKm: 10,
    rock: { "granite-gneiss": 1.6, "godstone-granite": 2.2, "godstone-quartzite": 2.5, metamorphic: 1.4, marble: 1.1, volcanic: 1, limestone: 0.9, "caren-limestone": 0.9, "sandstone-shale": 0.6 } },

  /**
   * Rivers that carry the climate (owner, 20 November 2026; scripts/eym-river-flow.mjs, the drainage and the far
   * continents' routing). A stream crossing arid ground (where the land's own yearly runoff is under `aridMm`) loses
   * water to the air and its bed: up to `aridLossPer100Km` of what it carries for each 100 km (as the Nile does in
   * the Sudd and the Okavango in its delta), so a river can dwindle and die in a dry basin. On the far continents a
   * square counts toward a river by the water it sheds against `farReferenceRunoffMm` (the mean runoff of their
   * land, fixed): a square shedding twice that counts double, so wet country has more rivers and dry country fewer.
   * A river drawn on the maps runs in a valley it has cut: where the drainage routes water over the land, the
   * ground along a drawn river lies `valleyFloorM` lower, so the land beside it drains into it.
   */
  rivers: { aridMm: 25, aridLossPer100Km: 0.2, farReferenceRunoffMm: 650, valleyFloorM: 60 },

  /** The sea floor's shape (scripts/eym-seafloor.mjs): shelf widths (km) by margin, the slope's width, the abyss's run. */
  seaFloor: {
    shelfKm: { active: 50, passive: 220 }, slopeKm: 260, abyssKm: 1500,
    // Broad shallow banks (owner's direction of 20 November 2026, lever 1 of "Shifting Caren's rain band south,
    // naturally"): a shelf sea tens of metres deep round the islets and islands drawn south and east of Caren, a
    // drowned platform of the continent's own shelf built up by reefs and their sands. Sea-floor only: no drawn
    // land or coast is changed. Each bank lies round `center`, in the bearings `bearingDeg` from it (clockwise from
    // north, fading over `fadeDeg` at either end), out to `reachKm` from the nearest land and no farther than
    // `withinKm` from the centre; its floor is `depthM[0]` deep by the land and `depthM[1]` at its edge, where it
    // falls to the ocean's floor over `edgeKm`.
    // (None for now, by the owner's decision of 20 November 2026: the bank is added at step 6 only if still needed.
    // The one that was measured: { name: "the southern and eastern banks of Caren", center: [0, 0.5],
    // bearingDeg: [70, 205], fadeDeg: 12, reachKm: 500, withinKm: 1500, depthM: [25, 60], edgeKm: 120 }.)
    banks: [],
  },

  /** The ocean climate (tools/generate-eym-climate.mjs). */
  ocean: {
    // (How far the wind belts follow the Sun is no longer a dial: it is worked out from where Eym's land lies,
    // `weather.land.oceanSwing` and `monsoonReach`, and written to scripts/eym-rain-band.generated.mjs.)
    // How much of the sea floor's shape the upper ocean feels (0 = a flat floor, 1 = one unlayered sea).
    steering: 0.3,
    // The strength of upwelling along a continental slope (at 0.4 m/s) and over a seamount chain (at 0.3 m/s), on the wind-driven upwelling's scale.
    slopeUpwelling: 0.6, seamountUpwelling: 0.8,
    // Along the equator a deep current runs east under the surface (the undercurrent, about a metre a second).
    // Where a ridge or seamount chain stands in its way within `undercurrentLat` degrees of the equator it is forced
    // up: `undercurrentUpwelling` on the same scale, for a cell wholly over the ridge (as west of the Galápagos).
    undercurrentLat: 3, undercurrentUpwelling: 1.2,
    // Within `offshoreLat` degrees of the equator the wind's drift is not turned aside (the Earth's turning is too
    // weak there), so a trade wind blowing off a west-facing coast drags the surface water straight out to sea and
    // cold water wells up at the coast: `offshoreUpwelling` at the trades' full strength, fading over the two
    // cells next to the coast.
    offshoreLat: 9, offshoreUpwelling: 0.9,
    // The wind that drives the sea is the season's wind over each longitude (scripts/eym-winds.mjs, the rain's own:
    // the belt carried on over heated land, the monsoon's westerlies where air has crossed the equator to reach it),
    // dragging on the water by `dragNumber` (air's density × this × speed × wind; about 0.0013 over open sea).
    // With `seasonalWinds` false the sea is driven by belts that are the same at every longitude, as it was before.
    seasonalWinds: true, dragNumber: 0.0013,
    // A broad sea less than `shallowM` deep keeps the Sun's heat in its few tens of metres instead of stirring it
    // down: in warm latitudes it stands up to `shallowWarmC` warmer than the open sea beside it (Earth's Sunda and
    // Sahul shelf seas are about a degree warmer than the ocean off them). A narrow shelf is flushed by the ocean
    // and hardly warmer.
    // (Off for now, with the banks: 0. Measured at 1.)
    shallowM: 100, shallowWarmC: 0,
    // The westerlies blow harder over sea than over land, which drags on them: each hemisphere's are stronger by
    // `westerliesLandDrag` for each whole share of its 40° to 60° latitudes that is sea rather than land, about the
    // two hemispheres' mean (Earth's southern westerlies, over almost unbroken sea, are some 15% stronger than its
    // northern, half of whose belt is land). It was a fixed 15% for the south, Earth's own geography.
    westerliesLandDrag: 0.3,
  },

  /**
   * The sunlight each half of the world keeps, and the rain band's mean latitude from it (scripts/eym-energy.mjs;
   * owner's direction of 20 November 2026). `albedo` is the share of sunlight each kind of surface throws back
   * (open sea, sea ice, snow-free land, snow on land, an ice cap); `topOfAirShare` is how much of a difference at
   * the surface shows at the top of the air, through cloud and haze (about a third on Earth). Land is under snow
   * in a month colder than `snowBelowC` and under an ice cap where its warmest month is colder than `iceCapBelowC`;
   * the sea freezes in a month colder than `seaIceBelowC`. The air carries `airShare` of the difference between
   * the halves across the equator (the rest is lost to space from the warmer half), and the rain band stands
   * `degPerPW` degrees toward the warmer half for each petawatt carried (Earth's measured relation, about 2.7),
   * never more than `mostDeg` from the equator. `seaCarriesSouthPW` is heat carried south across the equator by
   * the sea (none: an overturning ocean circulation is a planet-wide change kept for the world's author's yes).
   */
  energy: {
    albedo: { sea: 0.07, seaIce: 0.55, land: 0.2, snow: 0.6, ice: 0.7 }, topOfAirShare: 0.35,
    snowBelowC: 0, iceCapBelowC: 0, seaIceBelowC: -1.8,
    airShare: 0.5, degPerPW: 2.7, mostDeg: 8, seaCarriesSouthPW: 0,
    // Whether the rain band's mean latitude is the balance's. Off for now by the owner's decision of 20 November
    // 2026 ("Caren climate: decision + next steps"): the balance is worked out and recorded, and the band's mean
    // stays where it was (`bandMeanLatUntilThen`, the old fixed 4° N) until the land's own swing and the trade-wind
    // inversion are in; then it is switched on (step 6).
    bandFollowsBalance: false, bandMeanLatUntilThen: 4,
  },

  /** The weather's large-scale circulation (scripts/eym-weather.mjs): the belts' seasonal shift, the jet streams and blocking. */
  weather: {
    // (How far the wind and pressure belts follow the Sun at the equator, as a share of its declination, is worked
    // out from where Eym's land lies: see `land.oceanSwing` below. The shift fades toward the poles.)
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
    // The yearly runoff (mm) at which a river's bed is as wide as its old channel's measure gave; wetter country
    // gives wider rivers, drier narrower (scripts/eym-river-flow.mjs). Fixed, so that one land's climate never
    // changes another land's rivers.
    riverReferenceRunoffMm: 1000,
    // How much more rain the daily weather's lift yields over tropical and subtropical land than its measure by
    // latitude allows for (the afternoon storms): measured over Caren and Garyk, four years of weather against the
    // rain budget's totals.
    landAfternoonYield: 1.41,
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
      // How far the belts follow the Sun (owner's direction of 20 November 2026: from the land as it is, not an
      // aquaplanet's guess). Water is slow to warm, so over open ocean the rain belt follows the Sun by only
      // `oceanSwing` of its declination (Earth's open Pacific: 0.15 to 0.2); over land from end to end of the heated
      // band by `monsoonReach` more (Earth's southern Asia: about 1.15 in all). Each longitude lies between by its
      // land. The winds' and pressure belts' own shift, which runs round the world, is the mean of that over Eym's
      // longitudes (worked out by tools/generate-eym-energy.mjs). It was 0.4 everywhere over ocean.
      oceanSwing: 0.2,
      heatLat: [5, 40], reachDeg: 18, plateauGain: 0.3, monsoonReach: 0.95, monsoonFullDeg: 10, monsoonWestMs: 10, monsoonOnshoreMs: 4,
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
