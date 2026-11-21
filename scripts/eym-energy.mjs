// The sunlight each half of Eym keeps, and where that puts the tropical rain band (owner's direction of 20 November
// 2026, "Shifting Caren's rain band south, naturally": the band's mean latitude follows the warmer hemisphere, not
// the season alone).
//
// The surface of each square of the world reflects some of the sunlight that reaches it: the sea little, bare or
// green land more, snow and ice most. Part of that shows at the top of the air (clouds and the air itself hide the
// rest). The half of the world that keeps less sunlight is the cooler; the air carries heat across the equator to
// it, and the rain band stands on the other, warmer side, by about 2.7° of latitude for each petawatt the air carries
// (Earth's measured relation). The sea may also carry heat across the equator (none is modelled unless the dial
// says so). Nothing here is random, and no place's rain is set: only the causes are.

const DEG = Math.PI / 180, R_M = 6.371e6, SOLAR_W_M2 = 1361, MONTHS = 12, OBLIQUITY_DEG = 23.44;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export const ENERGY_MODEL = "eym-energy-v1";

/** The Sun's declination in the middle of a month (month 0 begins at the March equinox). */
export const monthSunDeg = (month) => OBLIQUITY_DEG * Math.sin(2 * Math.PI * (month + 0.5) / MONTHS);

/** Sunlight at the top of the air, averaged over a day (W/m²), at a latitude with the Sun at a declination. */
export function daySunlightWm2(latDeg, sunDeg) {
  const phi = latDeg * DEG, d = sunDeg * DEG, h0 = Math.acos(clamp(-Math.tan(phi) * Math.tan(d), -1, 1));
  return Math.max(0, SOLAR_W_M2 / Math.PI * (h0 * Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.sin(h0)));
}

/**
 * What a square's surface is in a month, from its temperatures: "ice" where even the warmest month is below
 * freezing on land (snow that never melts builds an ice cap), "snow" on land in a month below `snowBelowC`,
 * "seaIce" on sea in a month below `seaIceBelowC`, else "land" or "sea".
 */
export function surfaceKind(dials, { ocean, monthC, warmestC }) {
  if (ocean) return monthC < dials.seaIceBelowC ? "seaIce" : "sea";
  if (warmestC < dials.iceCapBelowC) return "ice";
  return monthC < dials.snowBelowC ? "snow" : "land";
}

/**
 * The balance of the two halves of the world.
 * @param dials  `WORLD_INPUTS.energy`
 * @param cells  [{ lat, lon, ocean, elevationM, areaShare? }] covering the world evenly in latitude and longitude
 * @param monthTemperatureC (cell, month) → that month's mean temperature there (°C)
 * @returns reflected sunlight by hemisphere and kind (PW), the difference in sunlight kept (north less south, PW),
 *   what the air carries north across the equator (PW), and the rain band's mean latitude (degrees north).
 */
export function hemisphereBalance(dials, cells, monthTemperatureC) {
  const kinds = ["sea", "seaIce", "land", "snow", "ice"], blank = () => Object.fromEntries(kinds.map((k) => [k, 0]));
  const reflected = { north: blank(), south: blank() }, area = { north: blank(), south: blank() };
  // Each cell's area: the sphere's, shared out by the cosine of latitude over the cells given.
  let weight = 0; for (const c of cells) weight += Math.cos(c.lat * DEG);
  const sphere = 4 * Math.PI * R_M * R_M;
  for (const cell of cells) {
    const m2 = sphere * Math.cos(cell.lat * DEG) / weight, half = cell.lat >= 0 ? "north" : "south";
    const temps = Array.from({ length: MONTHS }, (_, m) => monthTemperatureC(cell, m)), warmestC = Math.max(...temps);
    for (let m = 0; m < MONTHS; m += 1) {
      const kind = surfaceKind(dials, { ocean: cell.ocean, monthC: temps[m], warmestC });
      reflected[half][kind] += m2 * daySunlightWm2(cell.lat, monthSunDeg(m)) * dials.albedo[kind] * dials.topOfAirShare / MONTHS / 1e15;
      area[half][kind] += m2 / MONTHS / 1e12;
    }
  }
  const total = (h) => kinds.reduce((s, k) => s + reflected[h][k], 0);
  // The half that reflects more keeps less.
  const keptNorthLessSouthPW = -(total("north") - total("south"));
  // The air carries part of the difference across the equator toward the half that keeps less (the rest is lost to
  // space from the warmer half); heat the sea carries south must be carried back north by the air, by the same share.
  const airNorthPW = -dials.airShare * keptNorthLessSouthPW / 2 + dials.airShare * dials.seaCarriesSouthPW;
  const bandMeanLat = clamp(-dials.degPerPW * airNorthPW, -dials.mostDeg, dials.mostDeg);
  const round = (v, k = 1000) => Math.round(v * k) / k, each = (o, k) => Object.fromEntries(Object.entries(o).map(([key, v]) => [key, round(v, k)]));
  return {
    model: ENERGY_MODEL,
    reflectedPW: { north: each(reflected.north), south: each(reflected.south) },
    areaMkm2: { north: each(area.north, 100), south: each(area.south, 100) },
    keptNorthLessSouthPW: round(keptNorthLessSouthPW), airCarriesNorthPW: round(airNorthPW), bandMeanLat: round(bandMeanLat, 100),
  };
}
