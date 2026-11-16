// Season for battle maps. Light and shadow that change with the time of day (the sun's direction, cast
// shadows, darkness, lamps coming on, weather) are Foundry's to draw, live, as the clock moves; the art
// carries only what is true at any hour: the shadows objects make of themselves, and the season the
// trees and grass are in when the map is made. Pure; shared by the module and the map server.

export const SEASONS = Object.freeze(["spring", "summer", "autumn", "winter", "tropical"]);

/** Which season the trees show: spring, summer, autumn, winter, or tropical (no leaf fall within the tropics). */
export function foliageSeason(latDeg, yearFraction) {
  if (Math.abs(latDeg) < 23.5) return "tropical";
  const f = (((latDeg >= 0 ? yearFraction : yearFraction + 0.5) % 1) + 1) % 1; // 0 = this hemisphere's spring equinox
  return f < 0.25 ? "spring" : f < 0.5 ? "summer" : f < 0.75 ? "autumn" : "winter";
}

/** A valid season (a named one, or the default for the latitude). */
export function normalizeSeason(season, latDeg = 30) {
  return SEASONS.includes(season) ? season : Math.abs(latDeg) < 23.5 ? "tropical" : "summer";
}

/** The season in words, for the painter. */
export function seasonWords(season) {
  return { tropical: "evergreen tropical foliage", autumn: "autumn colours in the leaves", winter: "bare winter branches on broadleaf trees (conifers keep their needles)", spring: "fresh spring green with blossom", summer: "full summer leaf" }[season] ?? "full summer leaf";
}

/** How the painter should treat light: neutral, with only the shadows objects make of themselves. */
export const NEUTRAL_LIGHT = "Paint in even, neutral light from above: Foundry adds the time of day, the direction and length of sun shadows, darkness, lamps and weather live, so draw no cast sun shadows, no sunset or night colours and no glowing lamps. Do draw the shadows objects always make of themselves: under eaves and overhangs, inside and directly beneath tree crowns, at the foot of walls, rocks, crates and furniture, in doorways, window recesses, crevices, at the base of cliffs and in the corners of rooms.";
