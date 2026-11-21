// The season's wind over Eym by rule (owner's direction of 20 November 2026: one wind for the rain and for the sea).
// Given a latitude and the latitude the rain belt stands at over that longitude, the mean wind of the month: trades
// blowing toward the belt and from the east, a westerly monsoon where air has crossed the equator to reach a belt
// standing well off it, and westerlies beyond the dry belts. The rain (scripts/eym-rain.mjs) is carried by it, and
// the ocean model (tools/generate-eym-climate.mjs) is driven by its drag on the sea. Nothing here is random.

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const bell = (x, width) => Math.exp(-((x / width) ** 2));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/**
 * The wind at a latitude where the rain belt stands at `belt` (degrees): m/s toward the north and the east, and its
 * speed. `w` is the wind's dials (`WORLD_INPUTS.rain.wind`); with `monsoon` false the air that has crossed the
 * equator is not turned (the trades blow on from the east).
 */
export function beltWind(w, lat, belt, monsoon = true) {
  const y = lat - belt;
  // Trades: toward the belt and from the east, slack under the belt itself.
  let north = -w.towardBeltMs * Math.tanh(y / w.turnDeg) * bell(y, 35), east = -w.easterlyMs * (1 - w.doldrums * bell(y, w.turnDeg));
  // Air that has crossed the equator to reach a belt standing well off it is turned to blow from the west.
  if (monsoon && Math.abs(belt) > w.monsoonFromDeg && lat * belt > 0 && Math.abs(lat) < Math.abs(belt)) east += (w.easterlyMs + w.monsoonWestMs) * clamp((Math.abs(belt) - w.monsoonFromDeg) / w.monsoonFullDeg, 0, 1) * Math.sin(Math.PI * Math.abs(lat) / Math.abs(belt)) ** 0.8;
  // Beyond the dry belts: westerlies.
  const mid = smoothstep(w.westerliesFromDeg, w.westerliesFromDeg + 10, Math.abs(lat));
  north *= 1 - mid; east = east * (1 - mid) + w.westerlyMs * mid;
  const speed = Math.max(w.leastMs, Math.hypot(north, east));
  return { north, east, speed, belt };
}

/** The wind's drag on the sea (N/m², toward the north and the east): air's density × the drag number × speed × the wind. */
export function windDrag(wind, dragNumber = 1.3e-3, airDensity = 1.2) {
  const s = Math.hypot(wind.north, wind.east) * airDensity * dragNumber;
  return { north: s * wind.north, east: s * wind.east };
}
