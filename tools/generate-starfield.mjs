// Generates the fixed night-sky catalogue shared by every viewpoint in the system.
//
// Stars are light-years away and the system is tens of AU across, so parallax inside the system is
// far below anything an eye or a Renaissance telescope can see: one celestial sphere serves every
// planet, moon and station. Only the direction (unit vector, system frame) and brightness matter;
// `depth` is a presentation-only value that gives the system view a subtle sense of layered depth.
//
// Usage: node tools/generate-starfield.mjs          writes data/stellar/starfield.json
//        node tools/generate-starfield.mjs --check  fails if the committed file is stale
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = resolve(ROOT, "data/stellar/starfield.json");

export const STARFIELD_SEED = "eym-night-sky-v1";
export const STARFIELD_MODEL_VERSION = "eym-starfield-v1";
// About 2,000 stars over the whole sphere, so roughly 1,000 above any horizon: a good dark
// pre-industrial sky as people actually perceive it, without the barely-visible faint tail.
export const STAR_COUNT = 2000;
export const LIMITING_MAGNITUDE = 5.6;
// Star counts roughly triple per magnitude: N(<m) ∝ 10^(0.48 m).
const COUNT_SLOPE = 0.48;

// Frame: the system frame used by system-data.mjs (x, y in the reference orbital plane, z toward
// orbital north). The galactic plane is tilted 60° to it, close to Earth's ecliptic/galactic tilt.
const GALACTIC_TILT_DEG = 60;
const GALACTIC_NODE_DEG = 35;
const GALACTIC_CENTER_LONGITUDE_DEG = 0;
const BAND_HALF_WIDTH_DEG = 9;
// The distant sister galaxy (the Milky Way seen from here), placed well off the galactic plane so
// it is not lost in the band, at roughly the brightness and size Andromeda shows from Earth.
const SISTER_GALACTIC_LATITUDE_DEG = -24;
const SISTER_GALACTIC_LONGITUDE_DEG = 128;

const DEG = Math.PI / 180;
const round = (value, places = 5) => Number(value.toFixed(places));

function hash32(text) {
  let value = 2166136261;
  for (const char of String(text)) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a, k) => a.map((value) => value * k);
const add = (...vectors) => vectors.reduce((sum, v) => sum.map((value, i) => value + v[i]), [0, 0, 0]);
const normalize = (a) => scale(a, 1 / Math.hypot(...a));

/** Galactic basis in the system frame: north pole, direction to the galactic centre, and the third axis. */
export function galacticBasis() {
  const node = GALACTIC_NODE_DEG * DEG, tilt = GALACTIC_TILT_DEG * DEG;
  const north = normalize([Math.sin(tilt) * Math.sin(node), -Math.sin(tilt) * Math.cos(node), Math.cos(tilt)]);
  const nodeAxis = normalize([Math.cos(node), Math.sin(node), 0]);
  const centerAt0 = nodeAxis, third = normalize(cross(north, centerAt0));
  const l0 = GALACTIC_CENTER_LONGITUDE_DEG * DEG;
  const center = normalize(add(scale(centerAt0, Math.cos(l0)), scale(third, Math.sin(l0))));
  const side = normalize(cross(north, center));
  return { north, center, side };
}

function fromGalactic(basis, longitudeRad, latitudeRad) {
  return normalize(add(
    scale(basis.center, Math.cos(latitudeRad) * Math.cos(longitudeRad)),
    scale(basis.side, Math.cos(latitudeRad) * Math.sin(longitudeRad)),
    scale(basis.north, Math.sin(latitudeRad)),
  ));
}

export function buildStarfield() {
  const random = mulberry32(hash32(STARFIELD_SEED));
  const basis = galacticBasis();
  const stars = [];
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const magnitude = LIMITING_MAGNITUDE + Math.log10(Math.max(random(), 1e-9)) / COUNT_SLOPE;
    // Bright stars are nearby and nearly isotropic; fainter ones crowd toward the galactic band.
    const faintness = Math.min(1, Math.max(0, (magnitude + 1) / (LIMITING_MAGNITUDE + 1)));
    const concentration = 0.1 + 0.45 * faintness;
    let latitude;
    for (;;) {
      latitude = Math.asin(2 * random() - 1);
      const inBand = Math.exp(-((latitude / (18 * DEG)) ** 2));
      if (random() < (1 - concentration) + concentration * inBand) break;
    }
    const longitude = random() * 2 * Math.PI;
    const direction = fromGalactic(basis, longitude, latitude);
    // Presentation depth 0 (nearest) … 1 (farthest); brighter stars skew nearer.
    const depth = Math.min(1, Math.max(0, 0.15 + 0.7 * faintness + (random() - 0.5) * 0.3));
    stars.push({ direction, magnitude, depth });
  }
  stars.sort((a, b) => a.magnitude - b.magnitude);
  return {
    schemaVersion: 1,
    modelVersion: STARFIELD_MODEL_VERSION,
    status: "deterministic-working-canon",
    seed: STARFIELD_SEED,
    frame: "system frame: x,y in the reference orbital plane, z toward orbital north; unit direction vectors",
    note: "One celestial sphere serves every viewpoint in the system; in-system parallax is invisible. Stars are sorted brightest first, so index-based ids (star-0001 is the brightest) stay stable for naming.",
    count: stars.length,
    limitingMagnitude: LIMITING_MAGNITUDE,
    galaxy: {
      northPole: basis.north.map((v) => round(v)),
      center: basis.center.map((v) => round(v)),
      bandHalfWidthDeg: BAND_HALF_WIDTH_DEG,
    },
    sisterGalaxy: {
      direction: fromGalactic(basis, SISTER_GALACTIC_LONGITUDE_DEG * DEG, SISTER_GALACTIC_LATITUDE_DEG * DEG).map((v) => round(v)),
      magnitude: 3.4,
      majorAxisDeg: 3.2,
      minorAxisDeg: 1.0,
      // Orientation of the major axis: the galactic north pole projected onto the sky at that direction.
      majorAxisReference: basis.north.map((v) => round(v)),
    },
    columns: ["x", "y", "z", "magnitude", "depth"],
    stars: stars.map((star) => [...star.direction.map((v) => round(v)), round(star.magnitude, 3), round(star.depth, 3)]),
  };
}

export function serializeStarfield(starfield) {
  return `${JSON.stringify(starfield)}\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = serializeStarfield(buildStarfield());
  if (process.argv.includes("--check")) {
    if (readFileSync(OUTPUT, "utf8") !== text) throw new Error("Stale starfield: run npm run starfield:generate");
    console.log("starfield deterministic: data/stellar/starfield.json");
  } else {
    mkdirSync(dirname(OUTPUT), { recursive: true });
    writeFileSync(OUTPUT, text);
    console.log(`generated ${STAR_COUNT} stars → data/stellar/starfield.json`);
  }
}
