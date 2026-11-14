// The night sky: one fixed celestial sphere around the system (see tools/generate-starfield.mjs).
// Pure helpers turn the catalogue into SVG-ready frames for the system view's inside-looking-out
// backdrop. Stars are drawn as one path per brightness/twinkle group, so the DOM stays tiny no
// matter how many stars are on screen.

export const STARFIELD_PATH = "data/stellar/starfield.json";
export const SKY_VIEWBOX = Object.freeze({ width: 900, height: 680 });
/** Focal length in viewBox units: roughly a 90° horizontal field of view. */
export const SKY_FOCAL_LENGTH = 450;
/** Brightness classes, brightest first: dot diameter (viewBox units) and base opacity. */
export const STAR_CLASSES = Object.freeze([
  Object.freeze({ maxMagnitude: 0, size: 3.4, opacity: 1 }),
  Object.freeze({ maxMagnitude: 1, size: 2.8, opacity: 0.96 }),
  Object.freeze({ maxMagnitude: 2, size: 2.3, opacity: 0.9 }),
  Object.freeze({ maxMagnitude: 3, size: 1.85, opacity: 0.8 }),
  Object.freeze({ maxMagnitude: 4, size: 1.5, opacity: 0.66 }),
  Object.freeze({ maxMagnitude: 5, size: 1.2, opacity: 0.52 }),
  Object.freeze({ maxMagnitude: Infinity, size: 0.95, opacity: 0.4 }),
]);
export const TWINKLE_GROUPS = 3;
const MIN_FORWARD = 0.12; // ignore directions within ~83° of the screen edge-on plane
const MARGIN = 40;
const BAND_STEP_DEG = 3;

export async function loadStarfield(moduleId = "eym-planet-map") {
  const response = await fetch(`modules/${moduleId}/${STARFIELD_PATH}`);
  if (!response.ok) throw new Error(`Starfield fetch failed (${response.status})`);
  return response.json();
}

export function starClassIndex(magnitude) {
  return STAR_CLASSES.findIndex((entry) => magnitude < entry.maxMagnitude);
}

/** Same camera rotation as SystemView's projection, so the sky turns with the system. */
export function rotateDirection([x, y, z], yaw, pitch) {
  const cosY = Math.cos(yaw), sinY = Math.sin(yaw), cosP = Math.cos(pitch), sinP = Math.sin(pitch);
  const x1 = x * cosY - z * sinY, z1 = x * sinY + z * cosY;
  return [x1, y * cosP - z1 * sinP, y * sinP + z1 * cosP];
}

/**
 * Projects a sky direction onto the screen as seen from the system's centre, looking out past the
 * system. The camera sits on the +z side of the rotated frame, so the visible sky is the -z side.
 * Zoom spreads nearer stars slightly more than farther ones, giving a gentle sense of depth.
 */
export function projectSkyDirection(direction, { yaw, pitch, zoom = 1 }, depth = 1, viewBox = SKY_VIEWBOX) {
  const [x, y, z] = rotateDirection(direction, yaw, pitch);
  const forward = -z;
  if (forward < MIN_FORWARD) return null;
  const focal = SKY_FOCAL_LENGTH * Math.pow(Math.max(zoom, 1e-3), 0.06 + 0.12 * (1 - depth));
  const sx = viewBox.width / 2 + focal * x / forward, sy = viewBox.height / 2 - focal * y / forward;
  if (sx < -MARGIN || sx > viewBox.width + MARGIN || sy < -MARGIN || sy > viewBox.height + MARGIN) return null;
  return { x: sx, y: sy, forward, focal };
}

const dot = (point) => `M${point.x.toFixed(1)} ${point.y.toFixed(1)}h0`;

function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function normalize(a) { const length = Math.hypot(...a); return a.map((v) => v / length); }

/**
 * One frame of the sky for a camera state: dot paths per brightness class and twinkle group,
 * soft glow samples along the galactic band, and the sister galaxy's ellipse.
 */
export function buildSkyFrame(starfield, camera, viewBox = SKY_VIEWBOX) {
  const groups = STAR_CLASSES.map(() => Array.from({ length: TWINKLE_GROUPS }, () => []));
  let visible = 0;
  starfield.stars.forEach(([x, y, z, magnitude, depth], index) => {
    const point = projectSkyDirection([x, y, z], camera, depth, viewBox);
    if (!point) return;
    groups[starClassIndex(magnitude)][index % TWINKLE_GROUPS].push(dot(point));
    visible += 1;
  });
  const stars = groups.flatMap((byTwinkle, classIndex) => byTwinkle.map((dots, twinkle) => ({ classIndex, twinkle, d: dots.join("") })));

  const { northPole, center, bandHalfWidthDeg } = starfield.galaxy;
  const side = normalize(cross(northPole, center));
  const band = [];
  for (let l = 0; l < 360; l += BAND_STEP_DEG) {
    const rad = l * Math.PI / 180;
    const direction = center.map((c, i) => c * Math.cos(rad) + side[i] * Math.sin(rad));
    const point = projectSkyDirection(direction, camera, 1, viewBox);
    if (!point) continue;
    const towardCore = ((1 + Math.cos(rad)) / 2) ** 2; // brightest toward the galactic centre
    const halfWidth = bandHalfWidthDeg * (0.7 + 0.6 * towardCore) * Math.PI / 180;
    band.push({ x: point.x, y: point.y, r: Math.min(260, point.focal * Math.tan(halfWidth) / point.forward), opacity: 0.045 + 0.075 * towardCore });
  }

  let sister = null;
  const galaxy = starfield.sisterGalaxy;
  const sisterPoint = projectSkyDirection(galaxy.direction, camera, 1, viewBox);
  if (sisterPoint) {
    const axis = normalize(cross(cross(galaxy.direction, galaxy.majorAxisReference), galaxy.direction));
    const offset = normalize(galaxy.direction.map((v, i) => v + axis[i] * 0.02));
    const end = projectSkyDirection(offset, camera, 1, viewBox);
    const rotation = end ? Math.atan2(end.y - sisterPoint.y, end.x - sisterPoint.x) * 180 / Math.PI : 0;
    const perRad = sisterPoint.focal / sisterPoint.forward;
    sister = {
      x: sisterPoint.x, y: sisterPoint.y, rotation,
      rx: Math.max(5, perRad * galaxy.majorAxisDeg * Math.PI / 360),
      ry: Math.max(2, perRad * galaxy.minorAxisDeg * Math.PI / 360),
    };
  }
  return { stars, band, sister, visible };
}
