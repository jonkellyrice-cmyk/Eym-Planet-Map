// Shared celestial geometry for sky features: a body's orbital plane (its "path of the sun" as seen
// from the body), its spin axis (celestial pole), and helpers for angular measurements on the sky.
// Everything is in the system frame used by system-data.mjs: x,y in the reference orbital plane and
// z toward orbital north; vectorFromOrbit tilts an orbit by rotating it about the x axis.

const DEG = Math.PI / 180;

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const normalize = (a) => { const length = Math.hypot(a[0], a[1], a[2]); return [a[0] / length, a[1] / length, a[2] / length]; };
export const angularDistanceDeg = (a, b) => Math.acos(Math.min(1, Math.max(-1, dot(a, b)))) / DEG;

/** Unit normal of an orbit inclined by `inclinationDeg` (same convention as vectorFromOrbit). */
export function orbitNormal(inclinationDeg = 0) {
  const i = Number(inclinationDeg || 0) * DEG;
  return [0, -Math.sin(i), Math.cos(i)];
}

/**
 * A body's north celestial pole. The spin axis leans `axialTiltDeg` away from the orbit normal,
 * toward the orbital-plane direction at longitude `axialSeasonPhaseDeg` (measured from +x within the
 * inclined orbital plane). That longitude is where the northern hemisphere's summer solstice falls.
 */
export function celestialPole({ inclinationDeg = 0, axialTiltDeg = 0, axialSeasonPhaseDeg = 0 } = {}) {
  const i = Number(inclinationDeg || 0) * DEG, t = Number(axialTiltDeg || 0) * DEG, l = Number(axialSeasonPhaseDeg || 0) * DEG;
  const normal = orbitNormal(inclinationDeg);
  const e1 = [1, 0, 0], e2 = [0, Math.cos(i), Math.sin(i)];
  const lean = [0, 1, 2].map((k) => Math.cos(l) * e1[k] + Math.sin(l) * e2[k]);
  return normalize([0, 1, 2].map((k) => Math.cos(t) * normal[k] + Math.sin(t) * lean[k]));
}

/** Signed angular distance (degrees) of a direction from the plane whose normal is `pole`. */
export function latitudeDeg(direction, pole) {
  return Math.asin(Math.min(1, Math.max(-1, dot(direction, pole)))) / DEG;
}

/** Gnomonic (tangent-plane) projection about `center`: straight lines on the sky stay straight. */
export function tangentProjector(center) {
  const c = normalize(center);
  const helper = Math.abs(c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = normalize(cross(helper, c)), v = cross(c, u);
  return (direction) => {
    const w = dot(direction, c);
    return w <= 0 ? null : { x: dot(direction, u) / w, y: dot(direction, v) / w };
  };
}
