// Hand-made canon for Eym's sky, shared by the starfield and constellation generators.
//
// CONSTELLATION_NAMES and ASTERISMS name the 35 figures the finder discovers in the unsculpted star
// catalogue (reviewed on charts; plain English, or Pathfinder 2e canon deity possessives where the figure
// matches that deity's established favored weapon or symbol). SCULPTED_FIGURES are 13 further figures:
// templates that tools/sculpt-constellations.mjs realizes by nudging spare stars into place.

/** Brightest star id → [name, description]. */
export const CONSTELLATION_NAMES = Object.freeze({
  "star-0001": ["The Shepherd", "A walking figure high in the north, led by the brightest star in the sky."],
  "star-0002": ["The Scythe", "A short blade with a long handle; the sun passes through it."],
  "star-0003": ["The Plough", "A crooked share and handle lying on the path of the sun."],
  "star-0004": ["The Ladle", "A long handle ending in a small bent bowl."],
  "star-0005": ["The Pike", "A long straight fish whose tail forks at the lower end."],
  "star-0006": ["The Stag", "A standing stem with branching antlers above."],
  "star-0007": ["The Wagon", "A long wagon bed with its tongue reaching out to one side."],
  "star-0008": ["The Windmill", "Crossed sails around the Twin Lamps."],
  "star-0009": ["The Hinge", "Three bright stars bent at a joint."],
  "star-0014": ["The Staff", "A short walking staff on the path of the sun, holding the Hearthstones."],
  "star-0016": ["The Eel", "A long wavering line of stars in the northern sky."],
  "star-0017": ["The Wishbone", "A forked bone with a short stem, low in the south."],
  "star-0018": ["The Adder", "A small zigzag serpent on the path of the sun."],
  "star-0023": ["The Crane", "A long-legged bird near the southern pole."],
  "star-0037": ["The Heron", "An arched neck curling into a loop."],
  "star-0041": ["The Kite", "Four stars in a lopsided diamond."],
  "star-0042": ["The Chain", "Links hanging down to a bright pair."],
  "star-0046": ["The Swan", "A bird with outstretched neck and wings."],
  "star-0048": ["The Bolt", "A jagged stroke like lightning."],
  "star-0049": ["Gozreh's Trident", "The trident of Gozreh, god of nature, weather and the sea: a shaft splitting into tines."],
  "star-0052": ["The Mast", "A tall upright with a spar to one side."],
  "star-0054": ["Erastil's Bow", "The longbow of Erastil, god of farming and the hunt; the sun passes through it."],
  "star-0058": ["The Yoke", "A shallow bowed beam on the path of the sun."],
  "star-0064": ["The Throne", "A high back above a broad seat."],
  "star-0065": ["The Tent", "Three stars in a clean triangle, low in the south."],
  "star-0079": ["The Beggar", "A crooked figure with a bent arm."],
  "star-0088": ["The Ribbon", "A long S-shaped curve of stars."],
  "star-0091": ["The Fishhook", "A line with a barbed hook at its end."],
  "star-0098": ["The Ferryman", "A figure leaning on a long pole; Irori's Belt crosses him."],
  "star-0119": ["The Spindle", "A long narrow spindle on the path of the sun."],
  "star-0130": ["The Sling", "A small forked sling."],
  "star-0131": ["Cayden's Tankard", "The tankard of Cayden Cailean: four stars in an open V."],
  "star-0161": ["Iomedae's Sword", "The longsword of Iomedae: a long blade with a short crossguard near its top."],
  "star-0179": ["The Horseshoe", "An open bent shape like a horseshoe."],
  "star-0233": ["The Crook", "A shepherd's crook with a bent head."],
});

/** Notable patterns that are not constellations; they may overlap constellations. */
export const ASTERISMS = Object.freeze([
  { id: "twin-lamps", name: "The Twin Lamps", stars: ["star-0008", "star-0010"], lines: [["star-0008", "star-0010"]], description: "Two brilliant stars side by side, the most striking pair in the sky." },
  { id: "hearthstones", name: "The Hearthstones", stars: ["star-0014", "star-0060", "star-0062", "star-0319", "star-0426"], lines: [], description: "A tight knot of bright stars on the path of the sun." },
  { id: "wayfarers-triangle", name: "The Wayfarer's Triangle", stars: ["star-0002", "star-0003", "star-0008"], lines: [["star-0002", "star-0003"], ["star-0003", "star-0008"], ["star-0008", "star-0002"]], description: "A great triangle of three of the brightest stars, straddling the celestial equator and seen from both hemispheres." },
  { id: "irori-belt", name: "Irori's Belt", stars: ["star-0098", "star-0105", "star-0183"], lines: [["star-0098", "star-0105"], ["star-0105", "star-0183"]], description: "Three evenly spaced stars of similar brightness in a straight row, the belt of Irori." },
]);

/**
 * Figures sculpted from spare stars. Template points are tangent-plane offsets in degrees (x right,
 * y up); lines join point indices. Every line is at most 9° long, like the discovered figures.
 * `hemisphere` is where the figure is placed.
 */
export const SCULPTED_FIGURES = Object.freeze([
  { id: "desna-butterfly", name: "Desna's Butterfly", hemisphere: "north", description: "The butterfly of Desna, goddess of stars and travelers: two pairs of wings on a slender body.",
    points: [[0, 3.5], [0, -3.5], [-7.5, 6], [-6, -5.5], [7.5, 6], [6, -5.5]], lines: [[0, 1], [0, 2], [2, 3], [3, 1], [0, 4], [4, 5], [5, 1]] },
  { id: "torag-hammer", name: "Torag's Hammer", hemisphere: "north", description: "The warhammer of Torag, god of the forge: a broad head on a long haft.",
    points: [[-5, 6.5], [5, 6.5], [5, 3], [-5, 3], [0, 3], [0, -3], [0, -9]], lines: [[0, 1], [1, 2], [2, 4], [4, 3], [3, 0], [4, 5], [5, 6]] },
  { id: "sarenrae-scimitar", name: "Sarenrae's Scimitar", hemisphere: "north", description: "The scimitar of Sarenrae, goddess of the sun: a curved blade above a short hilt and crossguard.",
    points: [[-12, -3], [-9, -1], [-10, 2], [-8, -4], [-3, 2.5], [3, 4], [9, 2.5]], lines: [[0, 1], [2, 1], [1, 3], [1, 4], [4, 5], [5, 6]] },
  { id: "abadar-crossbow", name: "Abadar's Crossbow", hemisphere: "south", description: "The crossbow of Abadar, god of cities and trade: a bent prod across a long stock.",
    points: [[-8, 2], [0, 5], [8, 2], [0, -2], [0, -9]], lines: [[0, 1], [1, 2], [1, 3], [3, 4], [0, 3], [2, 3]] },
  { id: "crown", name: "The Crown", hemisphere: "north", description: "A half-ring of seven stars, like a circlet seen from the side.",
    points: [200, 225, 250, 270, 290, 315, 340].map((a) => [8 * Math.cos(a * Math.PI / 180), 8 * Math.sin(a * Math.PI / 180) + 4]), lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]] },
  { id: "arrow", name: "The Arrow", hemisphere: "north", description: "A long shaft with a barbed head at one end and fletching at the other.",
    points: [[8, 0], [5, 2.5], [5, -2.5], [-1, 0], [-9, 0], [-11.5, 2.5], [-11.5, -2.5]], lines: [[0, 1], [0, 2], [0, 3], [3, 4], [4, 5], [4, 6]] },
  { id: "anchor", name: "The Anchor", hemisphere: "south", description: "A ringed shank with a crossbar stock and two curved flukes.",
    points: [[0, 9], [-4, 5.5], [4, 5.5], [0, 1], [0, -6], [-5.5, -3], [5.5, -3]], lines: [[0, 1], [0, 2], [0, 3], [3, 4], [4, 5], [4, 6]] },
  { id: "lyre", name: "The Lyre", hemisphere: "north", description: "Two curved arms rising from a base and joined by a crossbar.",
    points: [[0, -7], [-4, -5], [-5, 4], [4, -5], [5, 4], [0, 4.5]], lines: [[0, 1], [1, 2], [0, 3], [3, 4], [2, 5], [5, 4], [5, 0]] },
  { id: "ship", name: "The Ship", hemisphere: "south", description: "A hull with a raised stern and bow beneath a single triangular sail.",
    points: [[-9, 1], [-4.5, -3], [4.5, -3], [9, 1], [-4.5, 5.5], [3, 0]], lines: [[0, 1], [1, 2], [2, 3], [1, 4], [4, 5], [5, 2]] },
  { id: "bell", name: "The Bell", hemisphere: "south", description: "A bell with sloping shoulders and a flared lip around its clapper.",
    points: [[0, 7], [-3, 5], [3, 5], [-6, -3], [6, -3], [0, -6]], lines: [[0, 1], [1, 3], [3, 5], [5, 4], [4, 2], [2, 0]] },
  { id: "hourglass", name: "The Hourglass", hemisphere: "north", description: "Two triangles meeting at Cynosure, the pole star; the whole figure turns around its waist through the night.",
    points: [[-5, 7], [5, 7], [0, 0], [-5, -7], [5, -7]], lines: [[0, 1], [1, 2], [2, 0], [3, 4], [4, 2], [2, 3]],
    // The waist (point 2) is pinned 0.7° from Eym's north celestial pole, Polaris's distance from Earth's.
    anchor: { point: 2, pole: "north", offsetDeg: 0.7 } },
  { id: "ladder", name: "The Ladder", hemisphere: "south", description: "Two rails joined by three rungs.",
    points: [[-3, 8], [3, 8], [-3, 0], [3, 0], [-3, -8], [3, -8]], lines: [[0, 2], [2, 4], [1, 3], [3, 5], [0, 1], [2, 3], [4, 5]] },
  { id: "lantern", name: "The Lantern", hemisphere: "north", description: "A hanging ring above a tall lantern body.",
    points: [[0, 8], [-3, 5], [3, 5], [-3, -5], [3, -5]], lines: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 4]] },
]);

/**
 * The 28 lunar mansions: equal 12.86° divisions of the path of the sun (where both moons travel),
 * numbered from the northward equinox in the direction the sun and moons move. The White Moon crosses
 * about one mansion a night. Each is named for its determinative star (the brightest within 10° of
 * the path) and the figure or stretch of sky it lies in. Order matters: entry n is mansion n + 1.
 */
export const LUNAR_MANSION_NAMES = Object.freeze([
  ["The Yoke-Pin", "The bright pin of the Yoke, where the year's mansions begin."],
  ["The Ox", "The faint stars trailing the Yoke, the beast in harness."],
  ["The Ploughshare", "The blade of the Plough, beside the Adder's coils."],
  ["The Furrow", "A dim stretch behind the Plough, the turned earth."],
  ["The Hearth", "The Hearthstones in the Staff, a tight knot of bright stars."],
  ["The Smoke", "A few faint stars rising beyond the Hearth."],
  ["The Well", "A lone modest star in an open field of sky."],
  ["The Beacon", "A brilliant solitary star that belongs to no figure."],
  ["The Shallows", "A bright star just ahead of the Pike."],
  ["The Pike's Eye", "The brightest star of the Pike."],
  ["The Weir", "Open sky past the Pike's tail."],
  ["The Net", "A loose scatter of middling stars."],
  ["The Distaff", "The Spindle, where thread is spun."],
  ["The Loom", "A bright star on the edge of the path, beyond the Spindle."],
  ["The Hollow", "An almost empty stretch of the path."],
  ["The Bowstring", "The trailing stars of Erastil's Bow."],
  ["The Bow's Belly", "The bright curve of Erastil's Bow."],
  ["The Quiver", "Middling stars beside the Bow."],
  ["The Watchfire", "A brilliant lone star on the empty road of the sun."],
  ["The Thicket", "Faint stars clustered off the path."],
  ["The Barren Field", "The dimmest mansion, with hardly a star to mark it."],
  ["The Hedge", "A row of middling stars along the empty road."],
  ["The Fallow", "Faint stars in the heart of the sun's empty road."],
  ["The Milestone", "A bright star standing at the edge of the path."],
  ["The Crossroads", "Scattered faint stars where the road turns."],
  ["The Gate", "A lone star before the Scythe."],
  ["The Scythe's Edge", "The bright blade of the Scythe."],
  ["The Sheaf", "The gathered stars after the Scythe, closing the year's round."],
]);

/**
 * Named individual stars. Cynosure is Golarion's North Star in Pathfinder canon (Desna's palace, the
 * Sevenfold Cynosure, sits at its heart); here it is the brightest star of the Hourglass, held at the
 * waist 0.7° from Eym's north celestial pole. Eym, like Earth, has no southern pole star.
 */
export const POLE_STAR = Object.freeze({
  name: "Cynosure", figure: "hourglass", point: 2, pole: "north",
  description: "The pole star: it holds steady and marks north while the sky turns around it. Desna's palace is said to sit at its heart.",
});

/**
 * Individually named bright stars: the 21 brightest, plus Cynosure (POLE_STAR), matching the 20-odd
 * stars Earth cultures named for navigation and lore. A named star may also belong to a constellation
 * or asterism. Plain English, except three Pathfinder 2e canon gods of the night sky (Pulura, the
 * Shimmering Maiden of constellations and lost northern travellers; Ketephys, the Hunter; Ashava, the
 * True Spark of lonely spirits and moonlight), placed where their portfolios fit.
 */
export const NAMED_STARS = Object.freeze({
  "star-0001": ["Pulura", "The brightest star in the sky, high in the north in the Shepherd: the lost traveller's guide, named for the Shimmering Maiden."],
  "star-0002": ["Reaper", "The blade of the Scythe, on the path of the sun; one corner of the Wayfarer's Triangle."],
  "star-0003": ["Sower", "The share of the Plough, on the path of the sun; one corner of the Wayfarer's Triangle."],
  "star-0004": ["Brim", "The bright lip of the Ladle, high in the north."],
  "star-0005": ["Gleam", "The Pike's eye, on the path of the sun."],
  "star-0006": ["Ketephys", "The brightest star of the Stag, named for the Hunter."],
  "star-0007": ["Carter", "The driver of the Wagon."],
  "star-0008": ["Elderlamp", "The brighter of the Twin Lamps in the Windmill; one corner of the Wayfarer's Triangle."],
  "star-0009": ["Doorpost", "The bright post of the Hinge, near the celestial equator."],
  "star-0010": ["Younglamp", "The fainter of the Twin Lamps in the Windmill."],
  "star-0011": ["Ashava", "A brilliant star that belongs to no figure, named for the True Spark of lonely spirits."],
  "star-0012": ["Cartwheel", "A wheel of the Wagon."],
  "star-0013": ["Vigil", "A bright lone star keeping watch north of the path of the sun."],
  "star-0014": ["Hearthfire", "The brightest of the Hearthstones in the Staff, on the path of the sun."],
  "star-0015": ["Latch", "The second star of the Hinge."],
  "star-0016": ["Ripple", "The brightest star of the Eel, high in the north."],
  "star-0017": ["Southlight", "The Wishbone's bright star deep in the south: the southern sky's guide, as there is no southern pole star."],
  "star-0018": ["Fang", "The Adder's fang, on the path of the sun."],
  "star-0019": ["Axle", "The axle of the Wagon."],
  "star-0020": ["Sandfall", "A bright star of the Hourglass, near Cynosure."],
  "star-0021": ["Wayfire", "A lone bright star on the empty road of the sun; it marks the mansion of the Watchfire."],
});
