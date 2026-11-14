// Generates Eym's named constellations and asterisms from the night-sky catalogue.
//
// Figures come from tools/find-constellation-candidates.mjs (compact groups of bright stars joined
// into stick figures). The names below were chosen by reviewing each figure on a chart; they are in
// plain English, the common tongue of Eym; proper names come from Pathfinder 2e canon deities, used
// only where the figure matches that deity's established favored weapon or symbol. Names are keyed by
// each figure's brightest star, so if the
// finder or the catalogue ever changes, generation fails instead of silently relabelling figures.
//
// Usage: node tools/generate-constellations.mjs          writes data/stellar/constellations.json
//        node tools/generate-constellations.mjs --check  fails if the committed file is stale
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { angularDistanceDeg, cross, dot, latitudeDeg, normalize } from "../scripts/sky-frame.mjs";
import { eymSky, findCandidates, starId } from "./find-constellation-candidates.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STARFIELD = "data/stellar/starfield.json";
const OUTPUT = resolve(ROOT, "data/stellar/constellations.json");
export const CONSTELLATIONS_MODEL_VERSION = "eym-constellations-v1";
const CHIEF_PER_HEMISPHERE = 7; // the brightest figures in each half of the sky: the ones everyone knows

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

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const round = (value, places = 5) => Number(value.toFixed(places));

export function buildConstellations(root = ROOT) {
  const starfieldText = readFileSync(resolve(root, STARFIELD), "utf8");
  const starfield = JSON.parse(starfieldText);
  const sky = eymSky(root);
  const candidates = findCandidates(starfield, sky);
  const missing = Object.keys(CONSTELLATION_NAMES).filter((id) => !candidates.some((c) => c.stars[0] === id));
  if (missing.length) throw new Error(`Named figures no longer found by the finder: ${missing.join(", ")}`);

  // Path-of-the-sun order: ecliptic longitude measured from the northward equinox, in the direction the sun moves.
  const equinox = normalize(cross(sky.sunPathPole, sky.celestialPole)), third = cross(sky.sunPathPole, equinox);
  const longitude = (d) => ((Math.atan2(dot(d, third), dot(d, equinox)) * 180 / Math.PI) + 360) % 360;

  const named = candidates.filter((c) => CONSTELLATION_NAMES[c.stars[0]]);
  const brightestIn = (north) => named.filter((c) => (c.declinationDeg >= 0) === north).sort((a, b) => b.brightness - a.brightness).slice(0, CHIEF_PER_HEMISPHERE);
  const chiefIds = new Set([...brightestIn(true), ...brightestIn(false)].map((c) => c.stars[0]));
  const sunPathOrder = named.filter((c) => c.alongSunPath).sort((a, b) => longitude(a.center) - longitude(b.center)).map((c) => c.stars[0]);

  const constellations = named.map((c) => {
    const [name, description] = CONSTELLATION_NAMES[c.stars[0]];
    const id = name.toLowerCase().replace(/^the /, "").replace(/'s\b/g, "").replace(/[^a-z0-9]+/g, "-");
    return {
      id, name, description,
      tier: chiefIds.has(c.stars[0]) ? "chief" : "lesser",
      hemisphere: c.declinationDeg >= 0 ? "north" : "south",
      declinationDeg: c.declinationDeg,
      sunPath: c.alongSunPath ? { order: sunPathOrder.indexOf(c.stars[0]) + 1, longitudeDeg: round(longitude(c.center), 1) } : null,
      shape: c.shape,
      center: c.center,
      stars: c.stars,
      lines: c.lines,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  const owner = new Map(constellations.flatMap((c) => c.stars.map((s) => [s, c.id])));
  const asterisms = ASTERISMS.map((a) => {
    for (const s of a.stars) if (Number(s.slice(5)) > starfield.count) throw new Error(`${a.name}: unknown star ${s}`);
    return { ...a, within: [...new Set(a.stars.map((s) => owner.get(s)).filter(Boolean))].sort() };
  });

  return {
    schemaVersion: 1,
    modelVersion: CONSTELLATIONS_MODEL_VERSION,
    status: "working-canon",
    language: "English (the common tongue of Eym); proper names from Pathfinder 2e canon",
    galacticBand: { name: "Desna's Path", description: "The bright band of the home galaxy across the sky; a name some Golarion cultures give it, after Desna, goddess of stars and travelers." },
    sourceStarfield: { path: STARFIELD, modelVersion: starfield.modelVersion, sha256: sha256(starfieldText) },
    note: "Star ids index data/stellar/starfield.json (star-0001 is the brightest). Lines are drawn between listed stars. Hemisphere and declination are relative to Eym's celestial equator; the path of the sun is Eym's orbital plane.",
    celestialPole: sky.celestialPole.map((v) => round(v)),
    sunPathPole: sky.sunPathPole.map((v) => round(v)),
    counts: {
      constellations: constellations.length,
      north: constellations.filter((c) => c.hemisphere === "north").length,
      south: constellations.filter((c) => c.hemisphere === "south").length,
      chief: constellations.filter((c) => c.tier === "chief").length,
      sunPath: sunPathOrder.length,
      asterisms: asterisms.length,
    },
    constellations,
    asterisms,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = `${JSON.stringify(buildConstellations(), null, 2)}\n`;
  if (process.argv.includes("--check")) {
    if (readFileSync(OUTPUT, "utf8") !== text) throw new Error("Stale constellations: run npm run constellations:generate");
    console.log("constellations deterministic: data/stellar/constellations.json");
  } else {
    writeFileSync(OUTPUT, text);
    const data = JSON.parse(text);
    console.log(`wrote ${data.counts.constellations} constellations (${data.counts.north} north / ${data.counts.south} south, ${data.counts.chief} chief, ${data.counts.sunPath} on the sun's path) and ${data.counts.asterisms} asterisms`);
  }
}
