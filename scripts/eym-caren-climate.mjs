// Caren's temperatures, month by month (canon of 20 November 2026, docs/eym-canon.md). The rain is the planet's
// (scripts/eym-rain.mjs: a budget of the water the air carries); this module adds what the survey of Caren needs
// beside it: it is cooler the higher the land (6.5 °C a kilometre), a little cooler or warmer with the sea near
// by, cooler under the cloud of a wet month, and the day's range is wide in a dry month inland. From the twelve
// months come the year's rain, its wet and dry seasons, the temperatures and the nights' frost.
// Pure: the sea's temperatures and the rain are passed in. Places are [latitude, longitude] in degrees.

export const CAREN_CLIMATE_MODEL = "eym-caren-climate-v2";
const DEG = Math.PI / 180, MONTHS = 12;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** The Sun's declination at the middle of a month (degrees; month 0 begins at the northward equinox). */
export const monthDeclinationDeg = (month) => 23.44 * Math.sin(2 * Math.PI * (month + 0.5) / MONTHS);

/**
 * Caren's year at a place. `dials` is WORLD_INPUTS.carenClimate; `seaAnomalyAt(lat, lon, month)` the sea's
 * temperature against its latitude's (°C); `rainMmAt(lat, lon, month)` the month's rain (mm).
 */
export function carenClimate(dials, { seaAnomalyAt, rainMmAt }) {
  const d = dials, t = d.temperature;
  /**
   * A place's year: twelve months of rain and temperature and their sum. `groundM` is its height, `coastKm` its
   * distance from the sea, `seaLevelC` its latitude's temperature at sea level.
   */
  function yearAt(lat, lon, groundM, coastKm, seaLevelC) {
    const months = [];
    for (let month = 0; month < MONTHS; month += 1) {
      const rainMm = rainMmAt(lat, lon, month), wet = clamp(rainMm / t.cloudyMm, 0, 1), seaC = seaAnomalyAt(lat, lon, month);
      // The Sun stands overhead twice a year this near the equator: the months are warmest then, coolest between.
      const overhead = Math.cos((monthDeclinationDeg(month) - lat) * DEG), sunC = t.sunSwingC * (overhead - t.sunMean);
      const meanC = seaLevelC - groundM * t.lapseCPerKm / 1000 + sunC + seaC * Math.exp(-coastKm / t.seaReachKm) - t.rainCoolC * wet;
      const rangeC = t.dayRangeC[0] + (t.dayRangeC[1] - t.dayRangeC[0]) * (1 - wet) * clamp(coastKm / t.rangeFullKm, 0.25, 1);
      months.push({ month, rainMm: Math.round(rainMm), meanC: Math.round(meanC * 10) / 10, nightC: Math.round((meanC - rangeC / 2) * 10) / 10, dayC: Math.round((meanC + rangeC / 2) * 10) / 10 });
    }
    const rain = months.map((m) => m.rainMm), means = months.map((m) => m.meanC), nights = months.map((m) => m.nightC);
    return {
      months, annualMm: rain.reduce((a, b) => a + b, 0), wetMonths: rain.filter((r) => r >= d.rain.wetMonthMm).length, dryMonths: rain.filter((r) => r < d.rain.dryMonthMm).length,
      driestMm: Math.min(...rain), wettestMm: Math.max(...rain), meanC: Math.round(means.reduce((a, b) => a + b, 0) / MONTHS * 10) / 10, swingC: Math.round((Math.max(...means) - Math.min(...means)) * 10) / 10,
      coldestNightC: Math.min(...nights), frostMonths: nights.filter((n) => n <= t.groundFrostC).length, airFrostMonths: nights.filter((n) => n <= 0).length,
    };
  }
  return { model: CAREN_CLIMATE_MODEL, yearAt };
}
