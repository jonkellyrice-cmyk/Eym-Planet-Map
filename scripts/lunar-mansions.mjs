// Which lunar mansion a direction on the sky (typically a moon's) lies in. Mansions are the 28 equal
// divisions of the path of the sun stored in data/stellar/constellations.json, numbered from the
// northward equinox in the direction the sun and moons move.
import { cross, dot, normalize } from "./sky-frame.mjs";

/** Longitude (degrees) along the path of the sun, measured from the northward equinox. */
export function sunPathLongitudeDeg(direction, sky) {
  const equinox = normalize(cross(sky.sunPathPole, sky.celestialPole));
  const third = cross(sky.sunPathPole, equinox);
  return ((Math.atan2(dot(direction, third), dot(direction, equinox)) * 180 / Math.PI) + 360) % 360;
}

/** The lunar mansion containing `direction`, given the constellations document. */
export function mansionForDirection(direction, sky) {
  const longitude = sunPathLongitudeDeg(direction, sky);
  return sky.lunarMansions.find((m) => longitude >= m.startLongitudeDeg && longitude < m.endLongitudeDeg) ?? sky.lunarMansions.at(-1);
}
