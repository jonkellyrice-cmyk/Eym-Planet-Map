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
import { ASTERISMS, CONSTELLATION_NAMES, LUNAR_MANSION_NAMES } from "./constellation-canon.mjs";
import { buildBaseStarfield } from "./generate-starfield.mjs";
import { planSculpt } from "./sculpt-constellations.mjs";

export { ASTERISMS, CONSTELLATION_NAMES };

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STARFIELD = "data/stellar/starfield.json";
const OUTPUT = resolve(ROOT, "data/stellar/constellations.json");
export const CONSTELLATIONS_MODEL_VERSION = "eym-constellations-v1";
const CHIEF_PER_HEMISPHERE = 7; // the brightest figures in each half of the sky: the ones everyone knows

const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const round = (value, places = 5) => Number(value.toFixed(places));

export function buildConstellations(root = ROOT) {
  const starfieldText = readFileSync(resolve(root, STARFIELD), "utf8");
  const starfield = JSON.parse(starfieldText);
  const sky = eymSky(root);
  // The 35 discovered figures come from the unsculpted catalogue; their stars never move when sculpting.
  const base = buildBaseStarfield();
  const candidates = findCandidates(base, sky);
  const plan = planSculpt(base, sky);
  const missing = Object.keys(CONSTELLATION_NAMES).filter((id) => !candidates.some((c) => c.stars[0] === id));
  if (missing.length) throw new Error(`Named figures no longer found by the finder: ${missing.join(", ")}`);

  // Path-of-the-sun order: ecliptic longitude measured from the northward equinox, in the direction the sun moves.
  const equinox = normalize(cross(sky.sunPathPole, sky.celestialPole)), third = cross(sky.sunPathPole, equinox);
  const longitude = (d) => ((Math.atan2(dot(d, third), dot(d, equinox)) * 180 / Math.PI) + 360) % 360;

  const named = candidates.filter((c) => CONSTELLATION_NAMES[c.stars[0]]);
  const brightestIn = (north) => named.filter((c) => (c.declinationDeg >= 0) === north).sort((a, b) => b.brightness - a.brightness).slice(0, CHIEF_PER_HEMISPHERE);
  const chiefIds = new Set([...brightestIn(true), ...brightestIn(false)].map((c) => c.stars[0]));
  const sunPathOrder = named.filter((c) => c.alongSunPath).sort((a, b) => longitude(a.center) - longitude(b.center)).map((c) => c.stars[0]);

  const discovered = named.map((c) => {
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
      origin: "discovered",
    };
  });
  // The 13 sculpted figures: lesser constellations placed away from the path of the sun.
  const sculpted = plan.figures.map((f) => {
    const directions = f.stars.map((id) => starfield.stars[Number(id.slice(5)) - 1].slice(0, 3));
    const center = normalize(directions.reduce((sum, d) => [sum[0] + d[0], sum[1] + d[1], sum[2] + d[2]], [0, 0, 0]));
    const declinationDeg = round(latitudeDeg(center, sky.celestialPole), 1);
    if (Math.abs(latitudeDeg(center, sky.sunPathPole)) <= 12) throw new Error(`${f.name} landed on the path of the sun`);
    return {
      id: f.id, name: f.name, description: f.description,
      tier: "lesser",
      hemisphere: declinationDeg >= 0 ? "north" : "south",
      declinationDeg,
      sunPath: null,
      shape: "sculpted",
      center: center.map((v) => round(v)),
      stars: f.stars,
      lines: f.lines,
      origin: "sculpted",
    };
  });
  const constellations = [...discovered, ...sculpted].sort((a, b) => a.name.localeCompare(b.name));

  const owner = new Map(constellations.flatMap((c) => c.stars.map((s) => [s, c.id])));
  const asterisms = ASTERISMS.map((a) => {
    for (const s of a.stars) if (Number(s.slice(5)) > starfield.count) throw new Error(`${a.name}: unknown star ${s}`);
    return { ...a, within: [...new Set(a.stars.map((s) => owner.get(s)).filter(Boolean))].sort() };
  });

  // Lunar mansions: 28 equal divisions of the path of the sun, from the northward equinox.
  const MANSION_WIDTH = 360 / LUNAR_MANSION_NAMES.length, MANSION_HALF_WIDTH_DEG = 10;
  const figureOf = new Map(constellations.flatMap((c) => c.stars.map((s) => [s, c.id])));
  const lunarMansions = LUNAR_MANSION_NAMES.map(([name, description], index) => {
    const start = index * MANSION_WIDTH, end = start + MANSION_WIDTH;
    const members = starfield.stars.map((row, i) => ({ id: starId(i), d: row.slice(0, 3), mag: row[3] }))
      .filter((star) => { const l = longitude(star.d); return l >= start && l < end && Math.abs(latitudeDeg(star.d, sky.sunPathPole)) <= MANSION_HALF_WIDTH_DEG; })
      .sort((a, b) => a.mag - b.mag);
    if (!members.length) throw new Error(`${name} has no stars`);
    const determinative = members[0];
    return {
      number: index + 1,
      id: name.toLowerCase().replace(/^the /, "").replace(/'s\b/g, "").replace(/[^a-z0-9]+/g, "-"),
      name, description,
      startLongitudeDeg: round(start, 4), endLongitudeDeg: round(end, 4),
      determinativeStar: determinative.id,
      determinativeMagnitude: determinative.mag,
      constellations: [...new Set(members.map((star) => figureOf.get(star.id)).filter(Boolean))].sort(),
    };
  });

  return {
    schemaVersion: 1,
    modelVersion: CONSTELLATIONS_MODEL_VERSION,
    status: "working-canon",
    language: "English (the common tongue of Eym); proper names from Pathfinder 2e canon",
    galacticBand: { name: "Desna's Path", description: "The bright band of the home galaxy across the sky; a name some Golarion cultures give it, after Desna, goddess of stars and travelers." },
    sourceStarfield: { path: STARFIELD, modelVersion: starfield.modelVersion, sha256: sha256(starfieldText) },
    note: "Star ids index data/stellar/starfield.json (star-0001 is the brightest). Lines are drawn between listed stars. Hemisphere and declination are relative to Eym's celestial equator; the path of the sun is Eym's orbital plane. 'discovered' figures were found in the generated stars; 'sculpted' ones were made by nudging spare stars into a template.",
    celestialPole: sky.celestialPole.map((v) => round(v)),
    sunPathPole: sky.sunPathPole.map((v) => round(v)),
    counts: {
      constellations: constellations.length,
      north: constellations.filter((c) => c.hemisphere === "north").length,
      south: constellations.filter((c) => c.hemisphere === "south").length,
      chief: constellations.filter((c) => c.tier === "chief").length,
      sunPath: sunPathOrder.length,
      asterisms: asterisms.length,
      lunarMansions: lunarMansions.length,
    },
    constellations,
    asterisms,
    lunarMansions,
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
