// Caren's climate, month by month, by physical cause (canon of 20 November 2026, docs/eym-canon.md).
//
// Nothing here is set to a wanted answer. For each place and month it follows the air:
//   - the rain belt stands where the Sun and the sea put it that month (it keeps off cold water), and rain falls
//     under it, less with every degree away;
//   - the trade winds blow toward the belt from the north-east on its northern side and from the south-east on its
//     southern side;
//   - air that has crossed high ground has dropped part of its water there (a rain shadow), air climbing a slope
//     drops more (the windward ramps), and air that left the sea long ago has less to give;
//   - air that comes in over cold water is cool and stable and rains less;
//   - air squeezed between two high grounds runs fast and sinks, and rains less (a wind channel);
//   - it is cooler the higher the land (6.5 °C a kilometre), and a little cooler or warmer with the sea upwind.
// From the twelve months come the year's rain, its wet and dry seasons, the temperatures and the nights' frost.
// Pure: the land's heights and the sea's temperatures are passed in. Places are [latitude, longitude] in degrees.

export const CAREN_CLIMATE_MODEL = "eym-caren-climate-v1";
const DEG = Math.PI / 180, KM = 111.195, MONTHS = 12;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** The Sun's declination at the middle of a month (degrees; month 0 begins at the northward equinox). */
export const monthDeclinationDeg = (month) => 23.44 * Math.sin(2 * Math.PI * (month + 0.5) / MONTHS);

/**
 * Caren's climate rule. `dials` is WORLD_INPUTS.carenClimate; `heightAt(lat, lon)` gives the land's height (m) or
 * null at sea; `seaAnomalyAt(lat, lon, month)` the sea's temperature against its latitude's (°C);
 * `beltLatAt(lon, declinationDeg)` the rain belt's latitude before the sea's pull (the weather's own rule).
 */
export function carenClimate(dials, { heightAt, seaAnomalyAt, beltLatAt }) {
  const d = dials, bell = (x, width) => Math.exp(-((x / width) ** 2));
  /** How far the rain belt is drawn off cold water at a longitude in a month (degrees north): toward the warmer side of the equator. */
  const seaPullDeg = (lon, month) => {
    let north = 0, south = 0, n = 0, s = 0;
    for (let dLon = -d.belt.seaReachDeg; dLon <= d.belt.seaReachDeg; dLon += 2) for (let lat = 1; lat <= d.belt.seaBandDeg; lat += 2) {
      if (heightAt(lat, lon + dLon) == null) { north += seaAnomalyAt(lat, lon + dLon, month); n += 1; }
      if (heightAt(-lat, lon + dLon) == null) { south += seaAnomalyAt(-lat, lon + dLon, month); s += 1; }
    }
    return n && s ? clamp(d.belt.degPerC * (north / n - south / s), -d.belt.maxPullDeg, d.belt.maxPullDeg) : 0;
  };
  /** The rain belt's latitude at a longitude in a month. */
  const beltLat = (lon, month) => beltLatAt(lon, monthDeclinationDeg(month)) + seaPullDeg(lon, month);
  /** The trade wind at a place in a month, as the unit direction it blows toward [north, east] and where the belt is. */
  const windAt = (lat, lon, month) => {
    const belt = beltLat(lon, month), toBelt = clamp((belt - lat) / d.wind.turnDeg, -1, 1), north = d.wind.towardBeltMs * toBelt, east = -d.wind.easterlyMs, speed = Math.hypot(north, east);
    return { belt, north: north / speed, east: east / speed, speedMs: speed };
  };
  /** A point `km` from a place along a unit direction [north, east]. */
  const step = (lat, lon, north, east, km) => [lat + north * km / KM, lon + east * km / (KM * Math.cos(lat * DEG))];

  /** One month at one place: its rain (mm) and what made it. `groundM` is the land's height there. */
  function monthAt(lat, lon, groundM, month) {
    const w = windAt(lat, lon, month), o = d.orography, upwind = [];
    for (let km = o.stepKm; km <= o.reachKm; km += o.stepKm) { const [la, lo] = step(lat, lon, -w.north, -w.east, km); upwind.push({ km, lat: la, lon: lo, m: heightAt(la, lo) }); }
    // The barrier the air has crossed, how far it has come over land, and the sea it came from.
    let barrierM = 0, landKm = o.reachKm, sea = null;
    for (const p of upwind) { if (p.m == null) { landKm = p.km - o.stepKm; sea = p; break; } if (p.m - groundM > barrierM) barrierM = p.m - groundM; }
    const shadow = 1 - o.rainedOut * (1 - Math.exp(-barrierM / o.moistureScaleM));
    // The slope the air is climbing here (m per km, over the nearest `slopeKm` upwind).
    const near = upwind.filter((p) => p.km <= o.slopeKm).map((p) => p.m ?? 0), slope = near.length ? (groundM - near.reduce((a, b) => a + b, 0) / near.length) / (o.slopeKm / 2) : 0;
    const lift = 1 + Math.min(o.liftMost, o.liftPerMPerKm * Math.max(0, slope));
    const inland = Math.exp(-landKm / o.inlandKm);
    const seaC = sea ? seaAnomalyAt(sea.lat, sea.lon, month) : 0, seaShare = clamp(1 + d.sea.rainPerC * seaC * Math.exp(-landKm / d.sea.reachKm), d.sea.least, d.sea.most);
    // A wind channel: high ground on both sides, across the wind, within reach. The narrower and the more shut in, the faster and drier.
    const c = d.channel; let left = Infinity, right = Infinity;
    for (let km = c.stepKm; km <= c.widthKm; km += c.stepKm) {
      if (left === Infinity) { const [la, lo] = step(lat, lon, w.east, -w.north, km), m = heightAt(la, lo); if (m != null && m - groundM >= c.wallM) left = km; }
      if (right === Infinity) { const [la, lo] = step(lat, lon, -w.east, w.north, km), m = heightAt(la, lo); if (m != null && m - groundM >= c.wallM) right = km; }
    }
    const squeeze = left + right <= c.widthKm ? 1 - (left + right) / c.widthKm : 0, channel = 1 - c.driest * squeeze;
    const under = bell(lat - w.belt, d.belt.widthDeg), rainMm = (d.rain.backgroundMm + d.rain.beltMm * under) * shadow * lift * inland * seaShare * channel;
    return { rainMm, beltLat: w.belt, under, barrierM, shadow, lift, inland, seaC, seaShare, squeeze, channel, windFromDeg: (Math.atan2(-w.east, -w.north) / DEG + 360) % 360 };
  }

  /**
   * A place's year: twelve months of rain and temperature and their sum. `coastKm` is its distance from the sea.
   * Temperature: the latitude's, less 6.5 °C a kilometre, with the sea upwind felt near the coast, and the cloud
   * of the wet months narrowing the day's range.
   */
  function yearAt(lat, lon, groundM, coastKm, seaLevelC) {
    const t = d.temperature, months = [];
    for (let month = 0; month < MONTHS; month += 1) {
      const m = monthAt(lat, lon, groundM, month), wet = clamp(m.rainMm / t.cloudyMm, 0, 1);
      // The Sun stands overhead twice a year this near the equator: the months are warmest then, coolest between.
      const overhead = Math.cos((monthDeclinationDeg(month) - lat) * DEG), sunC = t.sunSwingC * (overhead - t.sunMean);
      const meanC = seaLevelC - groundM * t.lapseCPerKm / 1000 + sunC + m.seaC * Math.exp(-coastKm / t.seaReachKm) - t.rainCoolC * wet;
      const rangeC = t.dayRangeC[0] + (t.dayRangeC[1] - t.dayRangeC[0]) * (1 - wet) * clamp(coastKm / t.rangeFullKm, 0.25, 1);
      months.push({ month, rainMm: Math.round(m.rainMm), meanC: Math.round(meanC * 10) / 10, nightC: Math.round((meanC - rangeC / 2) * 10) / 10, dayC: Math.round((meanC + rangeC / 2) * 10) / 10, beltLat: Math.round(m.beltLat * 10) / 10, shadow: m.shadow, lift: m.lift, channel: m.channel, seaShare: m.seaShare, barrierM: m.barrierM, windFromDeg: Math.round(m.windFromDeg) });
    }
    const rain = months.map((m) => m.rainMm), means = months.map((m) => m.meanC), nights = months.map((m) => m.nightC);
    return {
      months, annualMm: rain.reduce((a, b) => a + b, 0), wetMonths: rain.filter((r) => r >= d.rain.wetMonthMm).length, dryMonths: rain.filter((r) => r < d.rain.dryMonthMm).length,
      driestMm: Math.min(...rain), wettestMm: Math.max(...rain), meanC: Math.round(means.reduce((a, b) => a + b, 0) / MONTHS * 10) / 10, swingC: Math.round((Math.max(...means) - Math.min(...means)) * 10) / 10,
      coldestNightC: Math.min(...nights), frostMonths: nights.filter((n) => n <= t.groundFrostC).length, airFrostMonths: nights.filter((n) => n <= 0).length,
    };
  }
  return { model: CAREN_CLIMATE_MODEL, beltLat, seaPullDeg, windAt, monthAt, yearAt };
}

/**
 * The rule made ready for a world: `sampler(lat, lon)` is the surface's (scripts/eym-surface.mjs: null at sea),
 * `climate` the ocean climate document (data/eym/climate.json: the sea's anomaly in four seasons on a grid),
 * `seaLevelC(lat)` and `beltLat(declinationDeg)` the seasons' own rules. `wall`, if given, is the Sondel Range as
 * it stood before it fell ({ latDeg, halfWidthKm, crestM }: a range across Caren from coast to coast), for the
 * climate of that time. Returns the rule and `cellYear(lat, lon, coastKm, spanDeg)`: the year of a square of land,
 * averaged over four places in it.
 */
export function carenClimateFor({ dials, sampler, climate, seaLevelC, beltLat, wall = null }) {
  const res = climate.resolutionDeg, cols = Math.round(360 / res), rows = Math.round(180 / res), seasons = climate.seasons;
  const seaAt = (lat, lon, k) => seasons[k].sstAnomaly[clamp(Math.floor((lat + 90) / res), 0, rows - 1) * cols + ((Math.floor((lon + 180) / res) % cols) + cols) % cols];
  // The sea's anomaly in a month: between the two seasons it lies between (the seasons stand at the equinoxes and solstices).
  const seaAnomalyAt = (lat, lon, month) => { const at = (month + 0.5) / MONTHS * seasons.length, k = Math.floor(at) % seasons.length, f = at - Math.floor(at); return seaAt(lat, lon, k) * (1 - f) + seaAt(lat, lon, (k + 1) % seasons.length) * f; };
  const wallM = wall ? (lat) => wall.crestM * Math.exp(-(((lat - wall.latDeg) * KM / wall.halfWidthKm) ** 2)) : null;
  const heightAt = (lat, lon) => { const s = sampler(lat, lon); if (!s || !s.land) return null; return wallM ? Math.max(s.elevationM, wallM(lat)) : s.elevationM; };
  const rule = carenClimate(dials, { heightAt, seaAnomalyAt, beltLatAt: (lon, declinationDeg) => beltLat(declinationDeg) });
  const cellYear = (lat, lon, coastKm, spanDeg = 1) => {
    const years = [];
    for (const [a, b] of [[-0.25, -0.25], [-0.25, 0.25], [0.25, -0.25], [0.25, 0.25]]) { const la = lat + a * spanDeg, lo = lon + b * spanDeg, m = heightAt(la, lo); if (m != null) years.push(rule.yearAt(la, lo, m, coastKm, seaLevelC(la))); }
    if (!years.length) return null;
    const mean = (f) => years.reduce((s, y) => s + f(y), 0) / years.length;
    return { annualMm: Math.round(mean((y) => y.annualMm)), monthsMm: Array.from({ length: MONTHS }, (_, k) => Math.round(mean((y) => y.months[k].rainMm))), meanC: Math.round(mean((y) => y.meanC) * 10) / 10, swingC: Math.round(mean((y) => y.swingC) * 10) / 10, coldestNightC: Math.round(Math.min(...years.map((y) => y.coldestNightC)) * 10) / 10, years };
  };
  return { rule, cellYear, heightAt, seaAnomalyAt };
}
