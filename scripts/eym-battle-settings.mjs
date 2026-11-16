// The catalogue for battle maps: what terrain means in Pathfinder 2e terms, the features that can be
// placed (each with its footprint, movement, cover and height), and the settings (city, forest,
// glacier, volcano…) with the design targets that make a fight there interesting. Data only; the rules
// that use it are in eym-battle-rules.mjs.

/** Movement classes (PF2e): difficult costs +5 ft per square, greater difficult +10 ft. */
export const MOVE = Object.freeze({ normal: "normal", difficult: "difficult", greater: "greater", hazardous: "hazardous", impassable: "impassable", swim: "swim", climb: "climb" });
/** Path cost per square used by the design pass (impassable is Infinity). */
export const MOVE_COST = Object.freeze({ normal: 1, difficult: 2, greater: 3, hazardous: 5, impassable: Infinity, swim: 3, climb: 3 });
/** Cover a square's obstacle gives to someone behind it (PF2e: none, lesser +1, standard +2, greater +4). */
export const COVER_LEVELS = Object.freeze(["none", "lesser", "standard", "greater"]);

/**
 * Features a battle map can carry. footprint: [w, h] in squares (rotated 90° as needed). move: the
 * squares' movement class; cover: 0-3; concealed: creatures inside are concealed; heightFt: top above
 * the ground (high ground when climbable); wall: drawn as a sight-blocking Foundry wall around it.
 */
const F = (label, footprint, move, cover, extra = {}) => Object.freeze({ label, footprint, move, cover, concealed: false, heightFt: 0, color: "#7d7468", shape: "rect", ...extra });
export const FEATURES = Object.freeze({
  // Rock and wood
  boulder: F("boulder", [1, 1], MOVE.impassable, 2, { heightFt: 5, shape: "round", color: "#8a8378", words: "a large boulder" }),
  "boulder-pile": F("boulder pile", [2, 2], MOVE.impassable, 2, { heightFt: 5, shape: "blob", color: "#857d70", words: "a pile of boulders" }),
  "rock-outcrop": F("rock outcrop", [3, 2], MOVE.climb, 2, { heightFt: 10, shape: "blob", color: "#9a9083", words: "a rock outcrop that can be climbed for high ground" }),
  "fallen-log": F("fallen log", [1, 3], MOVE.difficult, 1, { shape: "log", color: "#6b4a2e", words: "a fallen log" }),
  "stump-cluster": F("stumps", [1, 2], MOVE.difficult, 1, { shape: "dots", color: "#7a5a3a", words: "old tree stumps" }),
  thicket: F("thicket", [2, 2], MOVE.difficult, 1, { concealed: true, shape: "blob", color: "#466b35", words: "a dense thicket" }),
  "thorn-brake": F("thorn brake", [2, 2], MOVE.hazardous, 1, { concealed: true, shape: "blob", color: "#5a5a2a", hazard: "thorns: 1d4 piercing for each square entered", words: "a thorny bramble patch" }),
  deadfall: F("deadfall", [2, 3], MOVE.greater, 2, { shape: "log", color: "#5e4129", words: "a tangle of fallen trunks" }),
  "lone-tree": F("old tree", [1, 1], MOVE.impassable, 2, { shape: "tree", color: "#2f5a2c", words: "a single old tree" }),
  "standing-stone": F("standing stone", [1, 1], MOVE.impassable, 2, { heightFt: 10, shape: "round", color: "#9b968c", words: "a weathered standing stone" }),
  rise: F("low rise", [3, 3], MOVE.normal, 0, { heightFt: 5, shape: "rise", color: "#a2a86e", high: true, words: "a low grassy rise giving high ground" }),
  hollow: F("hollow", [2, 2], MOVE.normal, 0, { heightFt: -5, shape: "rise", color: "#7e8a58", words: "a shallow hollow" }),
  "tall-grass": F("tall grass", [3, 3], MOVE.normal, 0, { concealed: true, shape: "blob", color: "#b5b06a", words: "a stand of chest-high grass" }),
  // Water and wet ground
  pool: F("deep pool", [2, 2], MOVE.swim, 0, { shape: "blob", color: "#4d86ad", words: "a deep pool" }),
  "reed-bed": F("reeds", [2, 3], MOVE.difficult, 0, { concealed: true, shape: "blob", color: "#7f9a5a", words: "a bed of tall reeds" }),
  bog: F("sucking bog", [2, 2], MOVE.greater, 0, { shape: "blob", color: "#5b6a45", words: "a patch of sucking bog" }),
  hummock: F("hummock", [2, 2], MOVE.normal, 0, { heightFt: 5, shape: "rise", color: "#80915a", high: true, words: "a firm grassy hummock above the wet ground" }),
  boardwalk: F("boardwalk", [1, 4], MOVE.normal, 0, { shape: "planks", color: "#8a6a44", words: "an old plank boardwalk" }),
  "tide-pools": F("tide pools", [2, 2], MOVE.difficult, 0, { shape: "blob", color: "#6e9bb0", words: "slick rocks and tide pools" }),
  driftwood: F("driftwood", [1, 2], MOVE.difficult, 1, { shape: "log", color: "#a08a6a", words: "a heap of driftwood" }),
  "sea-stack": F("sea stack", [1, 1], MOVE.impassable, 2, { heightFt: 15, shape: "round", color: "#7d7468", words: "a rock pillar" }),
  // Farm
  hedgerow: F("hedgerow", [1, 4], MOVE.difficult, 2, { concealed: true, shape: "hedge", color: "#3f6a33", words: "a thick hedgerow" }),
  "low-wall": F("low stone wall", [1, 4], MOVE.difficult, 2, { shape: "wall", color: "#a49b8c", words: "a low dry-stone wall" }),
  fence: F("fence", [1, 4], MOVE.difficult, 1, { shape: "fence", color: "#8a6a44", words: "a wooden fence" }),
  haystack: F("haystack", [1, 1], MOVE.impassable, 2, { heightFt: 5, shape: "round", color: "#d2b45a", words: "a haystack" }),
  cart: F("cart", [1, 2], MOVE.climb, 2, { heightFt: 5, shape: "cart", color: "#7a5532", words: "a parked wagon" }),
  ditch: F("ditch", [1, 4], MOVE.difficult, 0, { heightFt: -5, shape: "ditch", color: "#6b6a45", words: "a drainage ditch" }),
  // Town
  crates: F("stacked crates", [1, 1], MOVE.climb, 2, { heightFt: 5, shape: "crate", color: "#9a7448", words: "stacked crates" }),
  barrels: F("barrels", [1, 1], MOVE.difficult, 1, { shape: "dots", color: "#7a5532", words: "a cluster of barrels" }),
  "market-stall": F("market stall", [2, 1], MOVE.impassable, 2, { shape: "stall", color: "#b0603c", words: "a market stall with an awning" }),
  fountain: F("fountain", [2, 2], MOVE.impassable, 2, { heightFt: 5, shape: "round", color: "#8fb4c8", words: "a stone fountain" }),
  well: F("well", [1, 1], MOVE.impassable, 2, { shape: "round", color: "#8a8378", words: "a stone well" }),
  "planter-tree": F("street tree", [1, 1], MOVE.impassable, 1, { shape: "tree", color: "#3d6b33", words: "a street tree in a stone planter" }),
  statue: F("statue", [1, 1], MOVE.impassable, 2, { heightFt: 10, shape: "round", color: "#b8b3a8", words: "a statue on a plinth" }),
  barricade: F("barricade", [1, 3], MOVE.difficult, 2, { shape: "wall", color: "#6e5233", words: "an improvised barricade of carts and planks" }),
  garden: F("garden", [2, 3], MOVE.difficult, 1, { shape: "blob", color: "#5f8a45", words: "a small garden with shrubs and a tree" }),
  // Dry land
  "dune-ridge": F("dune ridge", [2, 5], MOVE.difficult, 1, { heightFt: 5, shape: "rise", color: "#e0c58a", high: true, words: "a sand dune ridge" }),
  quicksand: F("quicksand", [2, 2], MOVE.hazardous, 0, { shape: "blob", color: "#c9a96a", hazard: "quicksand: Athletics to escape or sink", words: "a patch of quicksand" }),
  "ruined-wall": F("ruined wall", [1, 4], MOVE.impassable, 2, { heightFt: 10, wall: true, shape: "wall", color: "#b09a7a", words: "a ruined stone wall" }),
  "cactus-stand": F("cactus stand", [1, 1], MOVE.hazardous, 1, { shape: "dots", color: "#5f7a3a", hazard: "spines: 1 piercing on entering", words: "a stand of cactus" }),
  "rock-shelf": F("rock shelf", [3, 2], MOVE.climb, 2, { heightFt: 10, shape: "blob", color: "#a58a6a", high: true, words: "a sandstone shelf" }),
  // Mountain, snow and ice
  scree: F("scree", [3, 3], MOVE.difficult, 0, { shape: "dots", color: "#9a9288", words: "a slope of loose scree" }),
  ledge: F("ledge", [4, 2], MOVE.climb, 2, { heightFt: 10, shape: "blob", color: "#8d857a", high: true, words: "a rock ledge 10 feet up" }),
  crevice: F("crevice", [1, 3], MOVE.impassable, 0, { heightFt: -20, shape: "ditch", color: "#3a3a3a", hazard: "a 20-ft drop", words: "a narrow crevice" }),
  snowdrift: F("snowdrift", [2, 3], MOVE.greater, 1, { shape: "blob", color: "#f2f5f7", words: "a deep snowdrift" }),
  crevasse: F("crevasse", [1, 5], MOVE.impassable, 0, { heightFt: -30, shape: "ditch", color: "#2f4f66", hazard: "crevasse: a fall of 30 ft or more", words: "a blue-shadowed crevasse" }),
  "ice-ridge": F("ice ridge", [1, 4], MOVE.climb, 2, { heightFt: 5, shape: "wall", color: "#cfe3ee", high: true, words: "a pressure ridge of ice" }),
  serac: F("serac", [2, 2], MOVE.impassable, 3, { heightFt: 15, shape: "blob", color: "#bcd8e8", words: "a towering block of ice" }),
  "thin-ice": F("thin ice", [2, 3], MOVE.hazardous, 0, { shape: "blob", color: "#a9cde0", hazard: "thin ice: breaks under Medium or larger creatures", words: "a sheet of thin ice over water" }),
  // Volcano
  "lava-channel": F("lava channel", [1, 6], MOVE.hazardous, 0, { shape: "lava", color: "#e0521f", hazard: "lava: 4d6 fire on entering, 8d6 if submerged", words: "a glowing channel of molten lava" }),
  "cooled-flow": F("jagged cooled lava", [3, 2], MOVE.difficult, 1, { shape: "blob", color: "#3b3532", words: "jagged black cooled lava" }),
  fumarole: F("fumarole", [1, 1], MOVE.hazardous, 0, { concealed: true, shape: "round", color: "#c8b56a", hazard: "steam vent: 2d6 fire, concealed by steam", words: "a hissing steam vent" }),
  "ash-field": F("ash drift", [3, 3], MOVE.difficult, 0, { shape: "blob", color: "#7b7670", words: "a drift of grey ash" }),
  "obsidian-spire": F("obsidian spire", [1, 1], MOVE.impassable, 2, { heightFt: 10, shape: "round", color: "#262230", words: "a glassy obsidian spire" }),
  // Jungle
  "giant-roots": F("buttress roots", [2, 2], MOVE.difficult, 2, { shape: "blob", color: "#5a4a2e", words: "the buttress roots of a giant tree" }),
  "vine-tangle": F("vine tangle", [2, 2], MOVE.greater, 1, { concealed: true, shape: "blob", color: "#3c6e2e", words: "a hanging tangle of vines" }),
  // Chosen by the GM (the map-feature checklist)
  shrine: F("shrine", [2, 2], MOVE.impassable, 2, { heightFt: 10, shape: "shrine", color: "#c9b27a", words: "a small roofed shrine" }),
  "wayside-shrine": F("wayside shrine", [1, 1], MOVE.impassable, 1, { heightFt: 5, shape: "shrine", color: "#c9b27a", words: "a wayside shrine with offerings" }),
  altar: F("altar", [2, 1], MOVE.impassable, 2, { shape: "rect", color: "#d8d0c0", words: "a stone altar" }),
  "temple-ruin": F("temple ruin", [4, 4], MOVE.normal, 0, { shape: "floor", color: "#c2b8a3", words: "the cracked flagstone floor of a ruined temple" }),
  "broken-column": F("broken column", [1, 1], MOVE.impassable, 2, { heightFt: 10, shape: "round", color: "#d4ccbb", words: "a broken column" }),
  "dungeon-entrance": F("dungeon entrance", [2, 2], MOVE.normal, 0, { shape: "stairs", color: "#2a2620", words: "a stone stairway descending into darkness, framed by worn masonry" }),
  "cave-mouth": F("cave mouth", [3, 2], MOVE.normal, 0, { shape: "cave", color: "#1f1c1a", words: "a dark cave mouth in a rock face" }),
  "mine-entrance": F("mine entrance", [2, 2], MOVE.normal, 0, { shape: "stairs", color: "#3a2e22", words: "a timber-framed mine entrance with rails" }),
  trapdoor: F("trapdoor", [1, 1], MOVE.normal, 0, { shape: "crate", color: "#6b4e30", words: "a wooden trapdoor in the ground" }),
  "palisade-wall": F("palisade", [1, 4], MOVE.impassable, 2, { heightFt: 10, wall: true, shape: "palisade", color: "#7a5a36", words: "a wooden palisade of sharpened logs" }),
  watchtower: F("watchtower", [2, 2], MOVE.climb, 3, { heightFt: 20, shape: "tower", color: "#6e5233", high: true, words: "a wooden watchtower with a ladder" }),
  "stone-tower": F("stone tower", [3, 3], MOVE.impassable, 3, { heightFt: 30, wall: true, shape: "tower", color: "#8d877c", words: "a round stone tower" }),
  earthwork: F("earthwork bank", [1, 5], MOVE.climb, 2, { heightFt: 5, shape: "rise", color: "#8a7a52", high: true, words: "an earthwork bank" }),
  trench: F("trench", [1, 5], MOVE.difficult, 2, { heightFt: -5, shape: "ditch", color: "#5e5236", words: "a dug trench" }),
  abatis: F("sharpened stakes", [1, 4], MOVE.hazardous, 1, { shape: "stakes", color: "#7a5a36", hazard: "stakes: 1d6 piercing on entering", words: "a row of sharpened wooden stakes" }),
  tent: F("tent", [2, 2], MOVE.impassable, 1, { heightFt: 5, shape: "tent", color: "#c8b48a", words: "a canvas tent" }),
  campfire: F("campfire", [1, 1], MOVE.hazardous, 0, { shape: "fire", color: "#e07a2a", hazard: "fire: 1d6 fire on entering", words: "a campfire ringed with stones" }),
  graveyard: F("graveyard", [3, 4], MOVE.difficult, 1, { shape: "graves", color: "#7d8a6a", words: "a small graveyard with leaning headstones" }),
  gallows: F("gallows", [1, 2], MOVE.impassable, 1, { heightFt: 10, shape: "rect", color: "#5a4028", words: "a wooden gallows" }),
  obelisk: F("obelisk", [1, 1], MOVE.impassable, 2, { heightFt: 20, shape: "round", color: "#5d5a66", words: "a carved stone obelisk" }),
  signpost: F("signpost", [1, 1], MOVE.normal, 0, { shape: "dots", color: "#6b4e30", words: "a wooden signpost" }),
  cairn: F("cairn", [1, 1], MOVE.impassable, 1, { heightFt: 5, shape: "round", color: "#9a9284", words: "a stone cairn" }),
  wreckage: F("wreckage", [2, 3], MOVE.difficult, 2, { shape: "log", color: "#6e5a44", words: "the wreckage of a wagon" }),
  dock: F("jetty", [1, 5], MOVE.normal, 0, { shape: "planks", color: "#8a6a44", words: "a wooden jetty" }),
  rowboat: F("rowboat", [1, 2], MOVE.difficult, 1, { shape: "cart", color: "#8a6a44", words: "a moored rowboat" }),
  beehives: F("beehives", [1, 2], MOVE.hazardous, 1, { shape: "dots", color: "#d9b44a", hazard: "bees: a swarm if disturbed", words: "a row of straw beehives" }),
  "magic-circle": F("magic circle", [3, 3], MOVE.normal, 0, { shape: "circle", color: "#7a6ad8", words: "a magic circle inlaid in the ground, faintly glowing" }),
  portal: F("portal arch", [2, 1], MOVE.impassable, 2, { heightFt: 15, shape: "rect", color: "#5a4a8a", words: "a freestanding stone portal arch" }),
  "hunting-blind": F("hunting blind", [1, 1], MOVE.difficult, 2, { concealed: true, shape: "crate", color: "#5e6a3a", words: "a camouflaged hunting blind" }),
  treehouse: F("tree platform", [2, 2], MOVE.climb, 2, { heightFt: 15, shape: "tower", color: "#6b4e30", high: true, words: "a wooden platform built in a tree" }),
  beacon: F("signal beacon", [1, 1], MOVE.impassable, 1, { heightFt: 10, shape: "fire", color: "#c86a2a", words: "a stone signal beacon with a fire basket" }),
  "giant-bones": F("giant bones", [3, 2], MOVE.difficult, 2, { shape: "log", color: "#e6dcc4", words: "the bleached ribs of an enormous creature" }),
  pen: F("fence", [1, 4], MOVE.difficult, 1, { shape: "fence", color: "#8a6a44", words: "a livestock pen fence" }),
  // Traps: hidden (the GM sees them; they are not painted)
  "pit-trap": F("pit trap", [1, 1], MOVE.normal, 0, { hidden: true, color: "#d0342c", hazard: "hidden pit: Perception to notice; 10-ft fall (1d6 bludgeoning)", words: "" }),
  "spiked-pit": F("spiked pit", [1, 1], MOVE.normal, 0, { hidden: true, color: "#d0342c", hazard: "hidden spiked pit: 10-ft fall onto spikes (1d6 bludgeoning + 2d6 piercing)", words: "" }),
  snare: F("snare", [1, 1], MOVE.normal, 0, { hidden: true, color: "#d0342c", hazard: "snare: Reflex or grabbed and hoisted", words: "" }),
  "bear-trap": F("bear trap", [1, 1], MOVE.normal, 0, { hidden: true, color: "#d0342c", hazard: "bear trap: 2d6 piercing and immobilized (Athletics to escape)", words: "" }),
  tripwire: F("tripwire alarm", [1, 1], MOVE.normal, 0, { hidden: true, color: "#d0342c", hazard: "tripwire: rings an alarm", words: "" }),
  "net-trap": F("net trap", [2, 2], MOVE.normal, 0, { hidden: true, color: "#d0342c", hazard: "falling net: Reflex or restrained", words: "" }),
  "rockfall-trap": F("rockfall", [2, 2], MOVE.normal, 0, { hidden: true, color: "#d0342c", hazard: "rockfall: 3d6 bludgeoning, Reflex basic", words: "" }),
  "collapsing-floor": F("collapsing ground", [2, 2], MOVE.normal, 0, { hidden: true, color: "#d0342c", hazard: "collapsing ground: 15-ft fall", words: "" }),
});

/**
 * Settings. dressing: weights for features the design pass may add; high: features that make high
 * ground; hazard: the setting's hazards; poi: a centrepiece; openMax: the widest run of open ground (in
 * squares) a side may have to cross without cover; coverTarget: share of squares within one square of
 * cover. words: for the painter.
 */
const S = (label, words, extra) => Object.freeze({ label, words, dressing: {}, high: [], hazard: [], poi: [], openMax: 6, coverTarget: 0.3, ...extra });
export const SETTINGS = Object.freeze({
  urban: S("City streets", "a dense town quarter: cobbled streets, timber and stone houses with tiled roofs, a small square, and street trees and planters", { dressing: { crates: 3, barrels: 3, cart: 2, "market-stall": 2, barricade: 1, "planter-tree": 3 }, high: ["cart", "crates"], hazard: [], poi: ["fountain", "well", "statue"], openMax: 5, coverTarget: 0.35 }),
  village: S("Village", "a village lane between cottages with gardens, fences, sheds and old trees", { dressing: { fence: 3, garden: 2, cart: 2, haystack: 2, barrels: 1, "lone-tree": 2, crates: 1 }, high: ["cart", "rise"], hazard: [], poi: ["well"], openMax: 6, coverTarget: 0.3 }),
  farmland: S("Farmland", "fields and pasture divided by hedgerows and low stone walls, with a farm track", { dressing: { hedgerow: 3, "low-wall": 3, haystack: 2, cart: 1, ditch: 2, "lone-tree": 2, fence: 2 }, high: ["rise", "cart"], hazard: [], poi: ["haystack", "lone-tree"], openMax: 7, coverTarget: 0.25 }),
  grassland: S("Open grassland", "rolling open grassland with tall grass, scattered stones and lone trees", { dressing: { "tall-grass": 4, boulder: 2, "standing-stone": 1, "lone-tree": 2, hollow: 1, thicket: 1 }, high: ["rise"], hazard: ["thorn-brake"], poi: ["standing-stone", "lone-tree"], openMax: 8, coverTarget: 0.2 }),
  savanna: S("Savanna and scrub", "dry grass and thorny scrub with flat-topped trees and termite mounds", { dressing: { "tall-grass": 3, thicket: 3, "lone-tree": 2, boulder: 2, "thorn-brake": 1 }, high: ["rise", "rock-outcrop"], hazard: ["thorn-brake"], poi: ["lone-tree"], openMax: 7, coverTarget: 0.22 }),
  forest: S("Forest", "mature woodland: tall trunks, undergrowth, fallen logs, ferns and leaf litter", { dressing: { "fallen-log": 4, thicket: 3, boulder: 2, "stump-cluster": 2, deadfall: 1 }, high: ["rock-outcrop", "rise"], hazard: ["thorn-brake"], poi: ["boulder-pile", "lone-tree"], openMax: 4, coverTarget: 0.35 }),
  jungle: S("Jungle", "humid rainforest: giant buttressed trunks, hanging vines, ferns and dense undergrowth", { dressing: { "giant-roots": 3, "vine-tangle": 3, "fallen-log": 2, thicket: 2, pool: 1 }, high: ["rock-outcrop"], hazard: ["thorn-brake"], poi: ["giant-roots"], openMax: 4, coverTarget: 0.4 }),
  taiga: S("Conifer forest", "dark conifer forest: spruce and pine trunks, needle litter, deadfall and mossy rocks", { dressing: { deadfall: 3, "fallen-log": 3, boulder: 3, thicket: 1, snowdrift: 1 }, high: ["rock-outcrop"], hazard: [], poi: ["boulder-pile"], openMax: 4, coverTarget: 0.33 }),
  tundra: S("Tundra", "flat tundra of moss, lichen and low shrubs, with frost-heaved hummocks and boulders", { vegetation: 0.3, dressing: { hummock: 3, boulder: 3, "standing-stone": 1, pool: 1, snowdrift: 2 }, high: ["hummock", "rock-outcrop"], hazard: ["thin-ice"], poi: ["standing-stone"], openMax: 8, coverTarget: 0.18 }),
  marsh: S("Marsh", "marshland: reeds, sedge, black pools, bog and firm hummocks joined by an old boardwalk", { dressing: { "reed-bed": 4, bog: 3, pool: 2, hummock: 2, boardwalk: 2, "lone-tree": 1 }, high: ["hummock"], hazard: ["bog"], poi: ["hummock"], openMax: 6, coverTarget: 0.25 }),
  riverside: S("Riverbank", "a stream or river with banks, reeds, gravel bars and overhanging trees", { dressing: { "reed-bed": 3, boulder: 2, "fallen-log": 2, thicket: 2, "lone-tree": 2 }, high: ["rise", "rock-outcrop"], hazard: [], poi: ["boulder-pile"], openMax: 6, coverTarget: 0.28 }),
  coast: S("Coast", "a shoreline of sand and rock with surf, tide pools, driftwood and dune grass", { dressing: { "tide-pools": 3, driftwood: 3, boulder: 2, "sea-stack": 1, "tall-grass": 2 }, high: ["rock-outcrop", "rise"], hazard: [], poi: ["sea-stack"], openMax: 7, coverTarget: 0.22 }),
  "hot-desert": S("Desert", "hot desert: wind-rippled sand, dunes, sandstone shelves and a ruined wall", { vegetation: 0.2, dressing: { "dune-ridge": 3, "rock-shelf": 2, "ruined-wall": 2, boulder: 2, "cactus-stand": 1 }, high: ["dune-ridge", "rock-shelf"], hazard: ["quicksand"], poi: ["ruined-wall"], openMax: 8, coverTarget: 0.18 }),
  "cold-desert": S("Cold desert", "cold stony desert: gravel flats, wind-carved rocks and sparse grey shrubs", { vegetation: 0.3, dressing: { boulder: 3, "rock-shelf": 2, "ruined-wall": 1, scree: 2, thicket: 1 }, high: ["rock-shelf", "rock-outcrop"], hazard: [], poi: ["boulder-pile"], openMax: 8, coverTarget: 0.18 }),
  hills: S("Rocky hills", "rocky hillside: boulders, outcrops, scree and wiry grass", { dressing: { boulder: 3, "rock-outcrop": 2, scree: 2, "boulder-pile": 1, thicket: 1 }, high: ["rock-outcrop", "ledge"], hazard: [], poi: ["boulder-pile"], openMax: 6, coverTarget: 0.28 }),
  mountain: S("Mountain", "a mountain pass: bare rock, ledges, scree slopes and crevices", { vegetation: 0.4, dressing: { ledge: 2, scree: 3, boulder: 3, "boulder-pile": 1, crevice: 1 }, high: ["ledge", "rock-outcrop"], hazard: ["crevice"], poi: ["boulder-pile"], openMax: 6, coverTarget: 0.3 }),
  alpine: S("Snowfield", "a high snowfield: wind-packed snow, drifts, rock islands and cornices", { vegetation: 0.15, dressing: { snowdrift: 3, boulder: 2, "rock-outcrop": 2, scree: 1 }, high: ["rock-outcrop", "ledge"], hazard: ["crevice"], poi: ["rock-outcrop"], openMax: 7, coverTarget: 0.22 }),
  glacier: S("Glacier", "a glacier: blue-white ice, crevasses, seracs, pressure ridges and meltwater", { vegetation: 0, dressing: { serac: 2, "ice-ridge": 3, snowdrift: 2, boulder: 1, crevasse: 2 }, high: ["ice-ridge", "serac"], hazard: ["crevasse", "thin-ice"], poi: ["serac"], openMax: 7, coverTarget: 0.22 }),
  volcanic: S("Volcanic", "the flank of an active volcano: black rock, cooled lava, ash, steam vents and channels of glowing lava", { vegetation: 0.05, dressing: { "cooled-flow": 4, "ash-field": 2, "obsidian-spire": 2, boulder: 2, fumarole: 2 }, high: ["rock-outcrop", "ledge"], hazard: ["lava-channel", "fumarole"], poi: ["obsidian-spire"], openMax: 6, coverTarget: 0.28 }),
});
export const SETTING_IDS = Object.freeze(Object.keys(SETTINGS));
