// The tides on Eym (Stage 2c of the physical history and climate programme): the pull of Mitkear (the Sun), the
// White Moon and the Red Moon, worked from the same orbital model as the sky, and the tide it raises on each coast.
// Nothing here is random.
//   - The equilibrium tide: each body raises two bulges, (3cos²z − 1)/2 times its strength, reduced by the planet's
//     own elastic yielding (Earth's 0.69). Split into its parts: twice a day (semidiurnal), once a day (diurnal) and
//     slow (long-period). The White Moon pulls about 0.88 as hard as Earth's moon, the Red Moon about 0.47 and the
//     Sun 0.44, each on its own rhythm (the Red Moon's tide comes round every 13.4 hours, the White Moon's every
//     12.4), so spring and neap tides come when they fall into or out of step.
//   - The tide on a coast: the ocean answers the daily and twice-daily pull more strongly than the equilibrium
//     (as on Earth), and a broad, shallow continental shelf amplifies it further and delays it; the width of the
//     shelf comes from Eym's sea floor (the height grid, from the plates). A steep coast with deep water close in
//     has small tides; a coast behind a wide shelf has large ones.
//   - Tide reports (height now, rising or falling, the next high and low water, the day's range, springs or neaps)
//     and what a battle map needs (the height relative to mean sea level and the day's range).

import { buildSystemModel } from "./system-data.mjs";
import { bodyFrame } from "./ground-sky.mjs";
import { elevationGrid } from "./cartography-asset.mjs";
import { nearestSea, destination } from "./eym-sea.mjs";
import { formatUniversalClock } from "./universal-time.mjs";

const DEG = Math.PI / 180, AU_KM = 149_597_870.7, EARTH_RADIUS_KM = 6371, MINUTE_MS = 60_000, HOUR_MS = 3_600_000;
/** The Sun's mass in Earth masses; the planet's elastic yielding (1 + k − h, Earth's value). */
const SUN_MASS_EARTHS = 332_946, YIELD = 0.69;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };

// ---------------------------------------------------------------- the pull

/**
 * The tide-raising bodies at the model's moment: where each stands overhead on Eym (latitude, longitude) and the
 * height of its equilibrium tide (metres, already reduced by the planet's yielding).
 */
export function tideBodies(model, sky, { planet = "Eym", moons = ["White Moon", "Red Moon"] } = {}) {
  const home = model.byName.get(planet), body = bodyFrame(sky.celestialPole, sky.sunPathPole, home.rotationState?.primeMeridianAngleDeg ?? 0);
  const p = [home.physical.x, home.physical.y, home.physical.z], radiusKm = EARTH_RADIUS_KM * (Number(home.radiusRe) || 1);
  const over = (v) => { const n = norm(v); return { latDeg: Math.asin(clamp(dot(n, body.z), -1, 1)) / DEG, lonDeg: Math.atan2(dot(n, body.y), dot(n, body.x)) / DEG }; };
  const strength = (massEarths, v) => YIELD * massEarths * (radiusKm / (Math.hypot(...v) * AU_KM)) ** 3 * radiusKm * 1000;
  const sun = [-p[0], -p[1], -p[2]];
  return [
    { name: "Mitkear", ...over(sun), amplitudeM: strength(SUN_MASS_EARTHS, sun) },
    ...moons.map((name) => { const m = model.byName.get(name), v = [m.physical.x - p[0], m.physical.y - p[1], m.physical.z - p[2]]; return { name, ...over(v), amplitudeM: strength(Number(m.mass_me ?? m.massMe) || 0, v) }; }),
  ];
}

/**
 * The equilibrium tide at a place (metres), in its three parts: twice-daily, daily and slow. For a body overhead at
 * (δ, λ₀) and a place at (φ, λ) with hour angle H = λ − λ₀: (3cos²z − 1)/2 = ¾cos²φcos²δ·cos2H + ¾sin2φ·sin2δ·cosH +
 * ¼(3sin²φ − 1)(3sin²δ − 1).
 */
export function equilibriumParts(bodies, latDeg, lonDeg) {
  const phi = latDeg * DEG; let semidiurnal = 0, diurnal = 0, slow = 0;
  for (const b of bodies) {
    const d = b.latDeg * DEG, H = (lonDeg - b.lonDeg) * DEG;
    semidiurnal += b.amplitudeM * 0.75 * Math.cos(phi) ** 2 * Math.cos(d) ** 2 * Math.cos(2 * H);
    diurnal += b.amplitudeM * 0.75 * Math.sin(2 * phi) * Math.sin(2 * d) * Math.cos(H);
    slow += b.amplitudeM * 0.25 * (3 * Math.sin(phi) ** 2 - 1) * (3 * Math.sin(d) ** 2 - 1);
  }
  return { semidiurnal, diurnal, slow };
}

/**
 * How well the bodies' twice-daily pulls line up (0 to 1): near 1 when the Sun and both moons pull along one axis
 * (great spring tides), small when they pull across one another (neaps).
 */
export function springIndex(bodies) {
  let re = 0, im = 0, total = 0;
  for (const b of bodies) { re += b.amplitudeM * Math.cos(2 * b.lonDeg * DEG); im += b.amplitudeM * Math.sin(2 * b.lonDeg * DEG); total += b.amplitudeM; }
  return total ? Math.hypot(re, im) / total : 0;
}

/**
 * A clock for the tide-raising bodies: their places at any moment, from the registry's orbits (a system model per
 * minute, cached; each costs well under a millisecond).
 */
export function createTideClock({ rows, orientations, sky, system = "Mitkear" }) {
  const cache = new Map();
  return {
    bodiesAt(timeMs) {
      const key = Math.round(timeMs / MINUTE_MS);
      if (!cache.has(key)) { if (cache.size > 4000) cache.clear(); cache.set(key, tideBodies(buildSystemModel(rows, system, { referenceTimestampMs: key * MINUTE_MS, orientations }), sky)); }
      return cache.get(key);
    },
  };
}

// ---------------------------------------------------------------- the coast's answer

/** The sea floor's height (m) at a place, between the cells of the 1° grid. */
function seaFloorM(grid, res, lat, lon) {
  const cols = Math.round(360 / res), rows = Math.round(180 / res);
  const y = (lat + 90) / res - 0.5, x = (lon + 180) / res - 0.5, r0 = Math.floor(y), c0 = Math.floor(x), ty = y - r0, tx = x - c0;
  const at = (r, c) => grid[clamp(r, 0, rows - 1) * cols + ((c % cols) + cols) % cols];
  return (at(r0, c0) * (1 - tx) + at(r0, c0 + 1) * tx) * (1 - ty) + (at(r0 + 1, c0) * (1 - tx) + at(r0 + 1, c0 + 1) * tx) * ty;
}

/**
 * How a coast answers the pull: the open ocean's response (about 2.2 times the equilibrium tide, as Earth's deep
 * oceans) amplified by the continental shelf in front of it (its width: how far one sails, in the 16 directions
 * that lead out to sea, before the floor drops below 200 m) and delayed while it crosses the shelf. Null inland.
 * Returns { at (the sea point), shelfKm, gain, lagHours }.
 */
export function coastalResponse(asset, field, lat, lon) {
  const at = nearestSea(field, lat, lon); if (!at) return null;
  const grid = elevationGrid(asset), res = asset.resolutionDeg ?? 1, widths = [];
  for (let k = 0; k < 16; k += 1) {
    let km = 0, out = null;
    for (let step = 20; step <= 800; step += 20) {
      const [a, b] = destination(at[0], at[1], k * 22.5, step);
      if (!field.cellAt(a, b).ocean) { out = null; break; }
      if (seaFloorM(grid, res, a, b) < -200) { out = step; break; }
      km = step; out = step;
    }
    if (out !== null) widths.push(Math.min(out, km + 20));
  }
  widths.sort((a, b) => a - b);
  const shelfKm = widths.length ? widths[Math.floor(widths.length / 2)] : 0;
  return { at, shelfKm, gain: Math.min(9, 2.2 * (1 + shelfKm / 120)), lagHours: 0.8 + shelfKm / 90 };
}

/**
 * The tide on a coast at a moment (metres above or below mean sea level): the twice-daily and daily parts, as the
 * coast answers them (amplified and delayed), with the slow part as it is.
 */
export function tideHeightM(clock, response, timeMs) {
  const late = clock.bodiesAt(timeMs - response.lagHours * HOUR_MS), now = clock.bodiesAt(timeMs);
  const a = equilibriumParts(late, ...response.at), b = equilibriumParts(now, ...response.at);
  return response.gain * (a.semidiurnal + a.diurnal) + b.slow;
}

/**
 * The tide at a coast now, and the hours around it: { heightM, rising, nextHigh, nextLow ({ timeMs, heightM }),
 * rangeM (the next day's), spring (0–1), springWords, words }.
 */
export function tideReport(clock, response, timeMs) {
  const step = 10 * MINUTE_MS, samples = [];
  for (let t = timeMs - step; t <= timeMs + 26 * HOUR_MS; t += step) samples.push({ t, h: tideHeightM(clock, response, t) });
  const extremes = [];
  for (let i = 1; i < samples.length - 1; i += 1) {
    const [a, b, c] = [samples[i - 1], samples[i], samples[i + 1]];
    if ((b.h > a.h && b.h >= c.h) || (b.h < a.h && b.h <= c.h)) {
      // A parabola through the three points places the turn between them.
      const denom = a.h - 2 * b.h + c.h, shift = denom ? 0.5 * (a.h - c.h) / denom : 0;
      extremes.push({ kind: b.h > a.h ? "high" : "low", timeMs: b.t + shift * step, heightM: b.h - 0.25 * (a.h - c.h) * shift });
    }
  }
  const heightM = tideHeightM(clock, response, timeMs), rising = tideHeightM(clock, response, timeMs + step) > heightM;
  const after = extremes.filter((e) => e.timeMs > timeMs), nextHigh = after.find((e) => e.kind === "high") ?? null, nextLow = after.find((e) => e.kind === "low") ?? null;
  const day = samples.filter((s) => s.t >= timeMs && s.t <= timeMs + 25 * HOUR_MS).map((s) => s.h), rangeM = Math.max(...day) - Math.min(...day);
  const spring = springIndex(clock.bodiesAt(timeMs)), springWords = spring > 0.75 ? "spring tides" : spring < 0.4 ? "neap tides" : "between springs and neaps";
  const m = (x) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(1)} m`, at = (e) => `${m(e.heightM)} at ${formatUniversalClock(e.timeMs).slice(0, 5)}`;
  const turns = [nextHigh && { ...nextHigh, label: "high water" }, nextLow && { ...nextLow, label: "low water" }].filter(Boolean).sort((a, b) => a.timeMs - b.timeMs);
  const words = `${m(heightM)}, ${rising ? "rising" : "falling"}; ${turns.map((e) => `${e.label} ${at(e)}`).join(", ")}; ${springWords}, range ${rangeM.toFixed(1)} m`;
  return { heightM, rising, nextHigh, nextLow, rangeM, spring, springWords, words };
}

/** What a battle map needs of the tide (kept small: it travels to the web app's map server); a storm surge (m) raises the water by its height. */
export function battleTide(report, surgeM = 0) {
  if (!report) return null;
  if (surgeM > 0) return { ...battleTide(report), heightM: Math.round((report.heightM + surgeM) * 100) / 100, surgeM: Math.round(surgeM * 100) / 100 };
  const next = [report.nextHigh, report.nextLow].filter(Boolean).sort((a, b) => a.timeMs - b.timeMs)[0];
  return { heightM: Math.round(report.heightM * 100) / 100, rangeM: Math.round(report.rangeM * 100) / 100, rising: report.rising, turn: next ? `${next.kind} water at ${formatUniversalClock(next.timeMs).slice(0, 5)}` : "" };
}
