// Fits Eym's ocean climate (Stage 2 of the physical history and climate programme) and writes
// data/eym/climate.json: surface currents, upwelling and sea-surface temperature anomalies for the four
// seasons, and the pattern of a slow El Niño-like oscillation. Drawn by rule from the land and the wind belts:
//   - Wind belts (trades, westerlies, polar easterlies) shift a little with the Sun (an aquaplanet's belts move
//     less than Earth's). Their curl drives a wind-driven circulation (a Stommel model: friction, the beta effect
//     and the wind, with every coast a wall), solved on a 2° grid; it gives the circumpolar flow, gyres and the
//     strong western boundary currents where Caren, Garyk, Gaffa, Khohalis and Demani block the way.
//   - Ekman drift (to the right of the wind in the north, to the left in the south) adds to the surface current;
//     where it pulls water apart (along the equator, and on coasts the wind drives water away from) cold water
//     wells up.
//   - Sea-surface temperature is the seasonal temperature of each latitude, carried by the currents, cooled by
//     upwelling and relaxed back over about six weeks; the anomaly is what the currents add.
// Everything is a pure function of the land mask and fixed constants; nothing is random.
//
//   node tools/generate-eym-climate.mjs           write the data file
//   node tools/generate-eym-climate.mjs --check   rebuild and compare with the data file

import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { buildEymSurface, EYM_LAYOUT } from "../scripts/eym-surface.mjs";
import { marginOf, seaFloorHeightM, seamountsOf, shoalOverSeamounts, tectonicDistances } from "../scripts/eym-seafloor.mjs";
import { seaLevelTemperatureC, seasonalTemperature } from "../scripts/eym-seasons.mjs";
import { DAY_MS, DAYS_PER_YEAR, NORTHWARD_EQUINOX_MS } from "../scripts/universal-time.mjs";

const root = new URL("../", import.meta.url), OUT = new URL("data/eym/climate.json", root);
export const EYM_CLIMATE_MODEL = "eym-climate-v2";
/** What the climate is made from: this tool, the surface (its land) and the seasons (base temperatures). */
export const CLIMATE_SOURCES = ["tools/generate-eym-climate.mjs", "scripts/eym-surface.mjs", "scripts/eym-seafloor.mjs", "scripts/eym-seasons.mjs", "data/eym/traced-continents.json", "data/eym/tectonics.json"];
export const climateSourcesSha256 = () => { const h = createHash("sha256"); for (const p of CLIMATE_SOURCES) h.update(readFileSync(new URL(p, root))); return h.digest("hex"); };

const DEG = Math.PI / 180, R = 6.371e6, OMEGA = 7.292e-5, RHO = 1025, YEAR_MS = DAYS_PER_YEAR * DAY_MS;
const RES = 2, NLAT = 180 / RES, NLON = 360 / RES, N = NLAT * NLON;
/** Fractions of the year (0 = March equinox) the four seasons are taken at. */
export const SEASONS = Object.freeze([0, 0.25, 0.5, 0.75]);
/** How far the wind belts follow the Sun (Earth's move about 0.6 of the declination; an aquaplanet's less). */
export const BELT_SHIFT = 0.4;
const latOf = (r) => -90 + RES * (r + 0.5), lonOf = (c) => -180 + RES * (c + 0.5);
const g = (x, m, s) => Math.exp(-(((x - m) / s) ** 2));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Zonal wind stress (N/m²) at a latitude in a season: trades, westerlies (stronger in the south), polar easterlies. */
export function windStress(lat, declinationDeg) {
  const p = lat - BELT_SHIFT * declinationDeg, a = Math.abs(p);
  return -0.07 * g(a, 13, 10) + 0.13 * (p < 0 ? 1.15 : 1) * g(a, 48, 10) - 0.03 * g(a, 75, 7);
}

/** Land fraction of each 2° cell (3×3 samples), from the surface. */
export function landMask() {
  const traced = JSON.parse(readFileSync(new URL("data/eym/traced-continents.json", root), "utf8"));
  const tectonics = JSON.parse(readFileSync(new URL("data/eym/tectonics.json", root), "utf8"));
  const { sampler } = buildEymSurface(traced, EYM_LAYOUT, tectonics);
  const land = new Uint8Array(N);
  for (let r = 0; r < NLAT; r += 1) for (let c = 0; c < NLON; c += 1) {
    let k = 0; for (const dy of [-0.66, 0, 0.66]) for (const dx of [-0.66, 0, 0.66]) { const s = sampler(latOf(r) + dy, lonOf(c) + dx); if (s?.land && !s.inlandWater) k += 1; }
    land[r * NLON + c] = k >= 5 ? 1 : 0;
  }
  return land;
}

const idx = (r, c) => r * NLON + ((c % NLON) + NLON) % NLON;

/**
 * The sea's depth (m, positive) on the 2° grid, from the sea floor the cartography draws (scripts/eym-seafloor.mjs):
 * worked on a 1° grid (distance to the nearest coast, the plates' ridges and trenches, the seamount chains) and
 * averaged over each cell's sea. Also each cell's share of shelf break (water between 150 m and 1,500 m deep on the
 * continental slope) and of seamount (floor raised 300 m or more by a chain).
 */
export function bathymetry() {
  const traced = JSON.parse(readFileSync(new URL("data/eym/traced-continents.json", root), "utf8"));
  const tectonics = JSON.parse(readFileSync(new URL("data/eym/tectonics.json", root), "utf8"));
  const { sampler } = buildEymSurface(traced, EYM_LAYOUT, tectonics);
  const rows = 180, cols = 360, lat1 = (r) => -89.5 + r, lon1 = (c) => -179.5 + c, n = rows * cols, at = (r, c) => r * cols + ((c % cols) + cols) % cols;
  const land = new Uint8Array(n); for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) { const s = sampler(lat1(r), lon1(c)); land[at(r, c)] = s?.land && !s.inlandWater ? 1 : 0; }
  // Distance to the nearest land cell (km), by sweeping until nothing shortens (eight neighbours).
  const dist = Float64Array.from(land, (l) => (l ? 0 : Infinity));
  for (let changed = true; changed;) {
    changed = false;
    for (const dir of [1, -1]) for (let k = dir > 0 ? 0 : n - 1; k >= 0 && k < n; k += dir) {
      const r = Math.floor(k / cols), c = k % cols; if (land[k]) continue;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const rr = r + dr; if (rr < 0 || rr >= rows) continue;
        const d = dist[at(rr, c + dc)] + 111.195 * Math.hypot(dr, dc * Math.cos(((lat1(r) + lat1(rr)) / 2) * DEG));
        if (d < dist[k] - 1e-9) { dist[k] = d; changed = true; }
      }
    }
  }
  const tect = tectonicDistances(tectonics, rows, cols), seamounts = seamountsOf(tectonics);
  const depth = new Float64Array(N), shelfBreak = new Float64Array(N), seamount = new Float64Array(N);
  for (let R2 = 0; R2 < NLAT; R2 += 1) for (let C2 = 0; C2 < NLON; C2 += 1) {
    let sum = 0, k = 0, brk = 0, mount = 0;
    for (const dr of [0, 1]) for (const dc of [0, 1]) {
      const r = 2 * R2 + dr, c = 2 * C2 + dc; if (land[at(r, c)]) continue;
      const t = tect.index(r, c), margin = marginOf(tect.trenchKm[t], tect.collideKm[t]);
      const plain = seaFloorHeightM(dist[at(r, c)], tect.ridgeKm[t], tect.trenchKm[t], margin), h = Math.max(-9500, Math.min(-20, shoalOverSeamounts(seamounts, lat1(r), lon1(c), plain)));
      sum += -h; k += 1; if (dist[at(r, c)] < 450 && -h > 150 && -h < 3300) brk += 1; if (h - plain >= 300) mount += 1;
    }
    const i = R2 * NLON + C2; depth[i] = k ? sum / k : 0; shelfBreak[i] = k ? brk / k : 0; seamount[i] = k ? mount / k : 0;
  }
  return { depthM: depth, shelfBreak, seamount };
}
const percentile = (values, q) => { const v = values.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.floor(q * v.length))] : 0; };

/** How much of the sea floor's shape the upper ocean feels (0 = a flat floor, 1 = one unlayered sea). */
export const STEERING = 0.3;

/**
 * What the floor adds to f in f/h (f·(1/h − 1), h in units of the mean depth) on the 2° grid, with h the depth the flow feels: the reference depth where the floor is not felt, toward
 * the real depth by STEERING (never shallower than 800 m, so a shelf is a gentle wall, not a cliff), smoothed
 * once over the neighbouring sea. Land cells take the reference depth (the coast itself is already a wall).
 */
function potentialVorticity(land, depthM, H) {
  const mean = (() => { let s = 0, k = 0; for (let i = 0; i < N; i += 1) if (!land[i]) { s += depthM[i]; k += 1; } return s / k; })();
  const felt = Float64Array.from(depthM, (d, i) => (land[i] ? 1 : 1 / (1 - STEERING + STEERING * mean / Math.max(800, d))));
  const smooth = Float64Array.from(felt, (v, i) => {
    if (land[i]) return 1; const r = Math.floor(i / NLON), c = i % NLON; let s = 2 * v, k = 2;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const rr = r + dr; if (rr < 0 || rr >= NLAT) continue; const j = idx(rr, c + dc); if (!land[j]) { s += felt[j]; k += 1; } }
    return s / k;
  });
  return Float64Array.from(smooth, (h, i) => 2 * OMEGA * Math.sin(latOf(Math.floor(i / NLON)) * DEG) * (1 / h - 1));
}

/** The strength of upwelling along a continental slope (at 0.4 m/s) and over a seamount chain (at 0.3 m/s), on the wind-driven upwelling's scale. */
export const SLOPE_UPWELLING = 0.6, SEAMOUNT_UPWELLING = 0.8;

/** One season: currents (m/s), upwelling (0–1.5) and the sea-surface temperature anomaly (°C), on the 2° grid. */
export function solveSeason(land, f, floor = null) {
  const decl = 23.44 * Math.sin(2 * Math.PI * f), timeMs = NORTHWARD_EQUINOX_MS + f * YEAR_MS;
  const ocean = (r, c) => !land[idx(r, c)];
  // Wind stress and its curl by latitude.
  const tau = Array.from({ length: NLAT }, (_, r) => windStress(latOf(r), decl));
  const curl = tau.map((_, r) => { const n = tau[Math.min(NLAT - 1, r + 1)], s = tau[Math.max(0, r - 1)]; return -(n - s) / (2 * R * RES * DEG); });
  // The wind-driven circulation: r∇²ψ + H·J(ψ, f/h) = curl τ / (ρH), ψ = 0 on every coast and beyond 78°. Over a
  // flat floor (h = H) the middle term is the beta effect, β ∂ψ/∂x; over the real floor the flow also follows the
  // lines of f/h, so ridges, plateaus and continental slopes steer it. The layers of a real ocean shield the upper
  // water from most of the floor's shape, so only a share of it is felt (STEERING), smoothed to the grid.
  const H = 500, fr = 6e-6, psi = new Float64Array(N), dy = R * RES * DEG;
  const q = floor ? potentialVorticity(land, floor.depthM, H) : null;
  const active = []; for (let r = 0; r < NLAT; r += 1) if (Math.abs(latOf(r)) < 78) for (let c = 0; c < NLON; c += 1) if (ocean(r, c)) active.push([r, c]);
  for (let it = 0; it < 5000; it += 1) for (const [r, c] of active) {
    const lat = latOf(r), dx = R * Math.cos(lat * DEG) * RES * DEG, beta = 2 * OMEGA * Math.cos(lat * DEG) / R;
    const e = psi[idx(r, c + 1)], w = psi[idx(r, c - 1)], n = psi[idx(r + 1, c)] ?? 0, s = psi[idx(r - 1, c)] ?? 0;
    // The floor's share of f/h's gradient (q is what the floor adds to f, so a flat floor adds nothing). It carries ψ
    // along the lines of f/h like a wind: differenced from the side it blows from, which keeps the sweep steady
    // however steep the floor.
    const cx = q ? (q[idx(Math.min(NLAT - 1, r + 1), c)] - q[idx(Math.max(0, r - 1), c)]) / (2 * dy) : 0, cy = q ? -(q[idx(r, c + 1)] - q[idx(r, c - 1)]) / (2 * dx) : 0;
    const ax = Math.abs(cx) / dx, ay = Math.abs(cy) / dy;
    const target = (fr * (e + w) / (dx * dx) + fr * (n + s) / (dy * dy) + beta * (e - w) / (2 * dx) + ax * (cx > 0 ? e : w) + ay * (cy > 0 ? n : s) - curl[r] / (RHO * H)) / (2 * fr / (dx * dx) + 2 * fr / (dy * dy) + ax + ay);
    psi[idx(r, c)] += 1.3 * (target - psi[idx(r, c)]);
  }
  // Geostrophic (gyre) velocities, and Ekman drift from the zonal stress.
  const gu = new Float64Array(N), gv = new Float64Array(N), eu = new Float64Array(N), ev = new Float64Array(N);
  for (let r = 1; r < NLAT - 1; r += 1) for (let c = 0; c < NLON; c += 1) {
    if (!ocean(r, c)) continue;
    const lat = latOf(r), dx = R * Math.cos(lat * DEG) * RES * DEG;
    gu[idx(r, c)] = -(psi[idx(r + 1, c)] - psi[idx(r - 1, c)]) / (2 * dy);
    gv[idx(r, c)] = (psi[idx(r, c + 1)] - psi[idx(r, c - 1)]) / (2 * dx);
    const fc = 2 * OMEGA * Math.sin(Math.sign(lat || 1) * Math.max(Math.abs(lat), 4) * DEG);
    ev[idx(r, c)] = -tau[r] / (RHO * fc * 50);
  }
  // Scale to an ocean's speeds: boundary currents near a metre a second, the open drift a tenth of that.
  const gScale = 0.9 / (percentile([...gu].map((u, i) => Math.hypot(u, gv[i])).filter((v) => v > 0), 0.99) || 1);
  const eScale = 0.12 / (percentile([...ev].map(Math.abs).filter((v) => v > 0), 0.9) || 1);
  const u = new Float64Array(N), v = new Float64Array(N);
  for (let i = 0; i < N; i += 1) { u[i] = gu[i] * gScale + eu[i] * eScale; v[i] = gv[i] * gScale + ev[i] * eScale; }
  // Upwelling: where the Ekman drift pulls water apart (a coast counts as still water).
  const div = new Float64Array(N);
  for (let r = 1; r < NLAT - 1; r += 1) for (let c = 0; c < NLON; c += 1) {
    if (!ocean(r, c)) continue;
    const lat = latOf(r), dx = R * Math.cos(lat * DEG) * RES * DEG, at = (rr, cc) => (ocean(rr, cc) ? ev[idx(rr, cc)] * eScale * Math.cos(latOf(rr) * DEG) : 0);
    div[idx(r, c)] = (at(r + 1, c) - at(r - 1, c)) / (2 * dy * Math.cos(lat * DEG));
  }
  const top = percentile([...div].filter((d) => d > 0), 0.95) || 1, up = Float64Array.from(div, (d) => clamp(d / top, 0, 1.5));
  // The sea floor's own upwelling: a current running along a continental slope draws deep water up it (most when
  // the shallows lie on its right in the north, its left in the south: the bottom layer then creeps upslope), and
  // any current crossing a seamount chain is lifted over it. Both scale with the current's speed.
  if (floor) for (let r = 1; r < NLAT - 1; r += 1) for (let c = 0; c < NLON; c += 1) {
    const i = idx(r, c); if (!ocean(r, c) || (!floor.shelfBreak[i] && !floor.seamount[i])) continue;
    const lat = latOf(r), dx = R * Math.cos(lat * DEG) * RES * DEG, speed = Math.hypot(u[i], v[i]);
    const hAt = (rr, cc) => (ocean(rr, cc) ? floor.depthM[idx(rr, cc)] : 0), hx = (hAt(r, c + 1) - hAt(r, c - 1)) / (2 * dx), hy = (hAt(r + 1, c) - hAt(r - 1, c)) / (2 * dy), steep = Math.hypot(hx, hy);
    // (The shallows are down the depth's gradient; to the right of the flow is (v, −u).)
    const along = speed && steep ? (v[i] * -hx - u[i] * -hy) / (speed * steep) * Math.sign(lat || 1) : 0;
    up[i] = clamp(up[i] + SLOPE_UPWELLING * floor.shelfBreak[i] * (speed / 0.4) * (0.3 + 0.7 * Math.max(0, along)) + SEAMOUNT_UPWELLING * floor.seamount[i] * (speed / 0.3), 0, 1.5);
  }
  return { declinationDeg: decl, u, v, upwelling: up };
}

/**
 * The sea-surface temperature anomaly the lasting circulation makes (°C, on the 2° grid). It is worked from the
 * year's mean currents and upwelling acting on the yearly mean temperature of each latitude, so a warm current
 * stays warm all year (as on Earth; only its strength follows the seasons, set later). Heat is lost to the air
 * faster where the westerlies blow hard (about 30 days to forget an anomaly in the tropics, 12 days at 60°), and
 * eddies in the westerly jets stir harder, so wakes behind the continents fade within some 20-30° downstream.
 */
export function solveAnomaly(land, u, v, up) {
  const ocean = (r, c) => !land[idx(r, c)], dy = R * RES * DEG;
  const base = Float64Array.from({ length: N }, (_, i) => seaLevelTemperatureC(latOf(Math.floor(i / NLON))));
  let T = Float64Array.from(base);
  const dt = 6 * 3600, cool = 3.5;
  // Upwelled water cools the surface by how much colder the deep is: fully where the surface is 24 °C or warmer,
  // not at all where it is already as cold as the deep (about 4 °C), as in the far north and south.
  const contrast = Array.from({ length: NLAT }, (_, r) => clamp((seaLevelTemperatureC(latOf(r)) - 4) / 20, 0, 1));
  for (let step = 0; step < 2400; step += 1) {
    const next = Float64Array.from(T);
    for (let r = 1; r < NLAT - 1; r += 1) {
      const lat = latOf(r); if (Math.abs(lat) > 72) continue;
      const dx = R * Math.cos(lat * DEG) * RES * DEG, s2 = Math.sin(lat * DEG) ** 2;
      const relax = (30 - 24 * s2) * 86400, kappa = 3000 + 9000 * g(Math.abs(lat), 50, 14);
      for (let c = 0; c < NLON; c += 1) {
        const i = idx(r, c); if (!ocean(r, c)) continue;
        const t = T[i], tw = ocean(r, c - 1) ? T[idx(r, c - 1)] : t, te = ocean(r, c + 1) ? T[idx(r, c + 1)] : t, ts = ocean(r - 1, c) ? T[idx(r - 1, c)] : t, tn = ocean(r + 1, c) ? T[idx(r + 1, c)] : t;
        const adv = -(u[i] > 0 ? u[i] * (t - tw) : u[i] * (te - t)) / dx - (v[i] > 0 ? v[i] * (t - ts) : v[i] * (tn - t)) / dy;
        const diff = kappa * ((te + tw - 2 * t) / (dx * dx) + (tn + ts - 2 * t) / (dy * dy));
        next[i] = t + dt * (adv + diff + (base[i] - t) / relax - cool * contrast[r] * up[i] / relax);
      }
    }
    T = next;
  }
  // The latitude's own temperature stands for the zonal-mean climate: keep only what the currents and coasts add,
  // east to west (each latitude's ocean mean is taken away).
  const raw = Float64Array.from(T, (t, i) => t - base[i]), anomaly = new Float64Array(N);
  for (let r = 0; r < NLAT; r += 1) {
    let s = 0, k = 0; for (let c = 0; c < NLON; c += 1) if (ocean(r, c)) { s += raw[idx(r, c)]; k += 1; }
    const mean = k ? s / k : 0; for (let c = 0; c < NLON; c += 1) if (ocean(r, c)) anomaly[idx(r, c)] = raw[idx(r, c)] - mean;
  }
  return anomaly;
}

/**
 * One season's anomaly: the lasting one, a quarter stronger in each hemisphere's winter (when the westerlies and
 * the contrasts are strongest) and a quarter weaker in its summer, softly capped (±5 °C in the tropics, ±3 °C
 * poleward of 40°), plus the trade winds' warm pool and cold tongue.
 */
function seasonalAnomaly(annual, tilt, land, f) {
  return Float64Array.from(annual, (a, i) => {
    if (land[i]) return 0;
    const lat = latOf(Math.floor(i / NLON)), winter = lat >= 0 ? 0.75 : 0.25, cap = Math.abs(lat) >= 40 ? 3 : 5;
    const scaled = a * (1 + 0.25 * Math.cos(2 * Math.PI * (f - winter)));
    return clamp(cap * Math.tanh(scaled / cap) + tilt[i], -5, 5);
  });
}

/** The equatorial stretches of open ocean at least 60° wide: [{ start (2° column), len }]. */
function equatorialBasins(land) {
  const open = Array.from({ length: NLON }, (_, c) => [44, 45].every((r) => !land[r * NLON + c])), out = [];
  for (let s = 0; s < NLON; s += 1) { if (!open[s] || open[(s - 1 + NLON) % NLON]) continue; let len = 0; while (len < NLON && open[(s + len) % NLON]) len += 1; if (len * RES >= 60) out.push({ start: s, len }); }
  return out;
}

/**
 * The trade winds tilt the warm upper layer of every wide equatorial ocean: a warm pool in its west, a cold
 * tongue in its east (what a surface model cannot make by itself). The El Niño-like oscillation weakens and,
 * in warm years, reverses it in the widest basin.
 */
function tradeTilt(land) {
  const out = new Float64Array(N);
  for (const b of equatorialBasins(land)) for (let r = 0; r < NLAT; r += 1) for (let k = 0; k < b.len; k += 1) {
    const c = (b.start + k) % NLON, x = (k + 0.5) / b.len, lat = latOf(r);
    out[r * NLON + c] += 1.2 * g(x, 0.2, 0.22) * g(lat, 0, 13) - 1.5 * g(x, 0.82, 0.18) * g(lat, -1, 6);
  }
  return out;
}

/** Coarsen a 2° field to 4° (mean of its ocean cells; land cells take the mean of their ocean neighbours, so values reach inland). */
function coarsen(field, land, fill = true) {
  const nr = NLAT / 2, nc = NLON / 2, out = new Float64Array(nr * nc), has = new Uint8Array(nr * nc);
  for (let r = 0; r < nr; r += 1) for (let c = 0; c < nc; c += 1) {
    let s = 0, k = 0; for (const [a, b] of [[0, 0], [0, 1], [1, 0], [1, 1]]) { const i = (2 * r + a) * NLON + 2 * c + b; if (!land[i]) { s += field[i]; k += 1; } }
    if (k) { out[r * nc + c] = s / k; has[r * nc + c] = 1; }
  }
  if (fill) for (let pass = 0; pass < 6; pass += 1) {
    const copy = Float64Array.from(out), seen = Uint8Array.from(has);
    for (let r = 0; r < nr; r += 1) for (let c = 0; c < nc; c += 1) {
      const i = r * nc + c; if (has[i]) continue; let s = 0, k = 0;
      for (const [a, b] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const rr = r + a; if (rr < 0 || rr >= nr) continue; const j = rr * nc + ((c + b + nc) % nc); if (has[j]) { s += out[j]; k += 1; } }
      if (k) { copy[i] = s / k; seen[i] = 1; }
    }
    out.set(copy); has.set(seen);
  }
  return out;
}

/**
 * The El Niño-like pattern on the 4° grid: warm water spreading over the east of the widest stretch of
 * equatorial ocean, cooler water in its west. The index that scales it is a function of the clock alone
 * (scripts/eym-climate.mjs).
 */
function ensoPattern(land) {
  const nr = NLAT / 2, nc = NLON / 2, eq = [44, 45], open = Array.from({ length: NLON }, (_, c) => eq.every((r) => !land[r * NLON + c]));
  let best = { start: 0, len: 0 };
  for (let s = 0; s < NLON; s += 1) { if (!open[s] || open[(s - 1 + NLON) % NLON]) continue; let len = 0; while (len < NLON && open[(s + len) % NLON]) len += 1; if (len > best.len) best = { start: s, len }; }
  const out = new Float64Array(nr * nc);
  for (let r = 0; r < nr; r += 1) for (let c = 0; c < nc; c += 1) {
    const lat = -90 + 4 * (r + 0.5), x = (((2 * c - best.start) % NLON + NLON) % NLON) / best.len;
    if (x < 0 || x > 1) continue;
    out[r * nc + c] = 1.6 * g(x, 0.72, 0.18) * g(lat, 0, 9) - 0.7 * g(x, 0.15, 0.15) * g(lat, 0, 12);
  }
  return { pattern: out, basin: { westLon: lonOf(best.start), widthDeg: best.len * RES } };
}

const round = (a, k) => Array.from(a, (x) => Math.round(x * k) / k);

/** Build the whole climate document. */
export function buildClimate() {
  const land = landMask(), floor = bathymetry();
  const solved = SEASONS.map((f) => solveSeason(land, f, floor));
  const mean = (k) => Float64Array.from({ length: N }, (_, i) => solved.reduce((s, x) => s + x[k][i], 0) / solved.length);
  const annual = solveAnomaly(land, mean("u"), mean("v"), mean("upwelling")), tilt = tradeTilt(land);
  const seasons = solved.map((s, k) => {
    const f = SEASONS[k], anomaly = seasonalAnomaly(annual, tilt, land, f);
    return { yearFraction: f, declinationDeg: Math.round(s.declinationDeg * 10) / 10, u: round(coarsen(s.u, land, false), 100), v: round(coarsen(s.v, land, false), 100), upwelling: round(coarsen(s.upwelling, land, false), 100), sstAnomaly: round(coarsen(anomaly, land, true), 10) };
  });
  const enso = ensoPattern(land);
  return {
    schemaVersion: 1, model: EYM_CLIMATE_MODEL, sourcesSha256: climateSourcesSha256(), resolutionDeg: 4, beltShift: BELT_SHIFT,
    seasons, enso: { pattern: round(enso.pattern, 10), basin: enso.basin, periodsYears: [3.7, 5.3, 2.6], weights: [0.62, 0.45, 0.28], phases: [1.1, 2.9, 0.4] },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const data = buildClimate(), text = `${JSON.stringify(data)}\n`;
  if (process.argv.includes("--check")) { const same = readFileSync(OUT, "utf8") === text; console.log(same ? "climate.json is up to date" : "climate.json differs"); process.exit(same ? 0 : 1); }
  writeFileSync(OUT, text);
  const a = data.seasons.flatMap((s) => s.sstAnomaly);
  console.log(`climate.json: ${text.length} bytes; SST anomaly ${Math.min(...a)}..${Math.max(...a)} °C; El Niño basin ${JSON.stringify(data.enso.basin)}`);
}
