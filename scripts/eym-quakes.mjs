// Earthquakes and eruptions on Eym, drawn by rule (Stage 1b of the physical history and climate programme).
// Every stretch of plate boundary in the cartography's geology section is a fault with a yearly rate of
// earthquakes; every volcano erupts at a rate set by its activity. Each (source, Eym year) pair seeds its own
// draws, so the catalogue is the same whenever and wherever it is asked for: a quake that shook a town on a
// given day shook it on every map and in every session. Ask by place and date range; each event comes with
// how strongly it was felt there (the Mercalli scale).

import { DAY_MS, DAYS_PER_YEAR } from "./universal-time.mjs";

export const QUAKE_MODEL = "eym-quakes-v1";
const DEG = Math.PI / 180, YEAR_MS = DAYS_PER_YEAR * DAY_MS;
/** Smallest magnitude drawn (smaller ones are hardly felt beyond their epicentre). */
export const MIN_MAGNITUDE = 3.5;
/** Quakes of at least MIN_MAGNITUDE per boundary point per year (ten times the rate at 4.5: Gutenberg–Richter), the largest possible, and the usual depth. */
export const FAULTS = Object.freeze({
  trenches: { rate: 110, maxMagnitude: 9.1, depthKm: 35, words: "a subduction quake" },
  collisions: { rate: 40, maxMagnitude: 8.2, depthKm: 15, words: "a collision-belt quake" },
  ridges: { rate: 15, maxMagnitude: 6.8, depthKm: 10, words: "a mid-ocean-ridge quake" },
});
/** Eruptions per year by activity, and the explosivity (VEI 0–6) they reach, by share. */
const ERUPTION_RATE = { active: 1 / 5, dormant: 1 / 400, extinct: 0 };
const VEI_SHARES = { subduction: [0.12, 0.3, 0.3, 0.17, 0.08, 0.025, 0.005], hotspot: [0.45, 0.35, 0.15, 0.04, 0.01, 0, 0] };
const VEI_WORDS = ["gentle lava flows", "small explosions and lava", "an explosive eruption with an ash column", "a large explosive eruption", "a great explosive eruption", "a cataclysmic eruption", "a colossal eruption"];
/** Felt-intensity words, Mercalli I–XII. */
export const MERCALLI = Object.freeze(["", "not felt", "weak (felt by a few at rest)", "weak (felt indoors)", "light (windows rattle, sleepers wake)", "moderate (felt by all, crockery breaks)", "strong (plaster cracks, chimneys fall)", "very strong (poor buildings damaged)", "severe (walls collapse)", "violent (houses shift off foundations)", "extreme (most stone buildings fall)", "extreme (bridges and roads destroyed)", "total destruction"]);
const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

// ---------------------------------------------------------------- small helpers

function rngFor(text) {
  let h = 2166136261; for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  let s = h >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function poisson(rng, mean) { if (mean <= 0) return 0; const l = Math.exp(-mean); let k = 0, p = 1; do { k += 1; p *= rng(); } while (p > l); return k - 1; }
function distanceKm(a, b) {
  const p1 = a[0] * DEG, p2 = b[0] * DEG, dl = (b[1] - a[1]) * DEG;
  return 6371 * Math.acos(Math.min(1, Math.max(-1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl))));
}
/** The point `km` from p towards a bearing (degrees). */
function offset([lat, lon], bearingDeg, km) {
  const d = km / 6371, b = bearingDeg * DEG, la = lat * DEG;
  const lat2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(b));
  const lon2 = lon * DEG + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(lat2));
  return [Math.round(lat2 / DEG * 1000) / 1000, Math.round(((lon2 / DEG + 540) % 360 - 180) * 1000) / 1000];
}

/** Felt intensity (Mercalli, unrounded) at hypocentral distance R km from a quake of magnitude M. */
export function feltIntensity(magnitude, distanceKmValue, depthKm) {
  const r = Math.max(5, Math.hypot(distanceKmValue, depthKm));
  return 3.67 + 1.17 * magnitude - 3.19 * Math.log10(r);
}

/** The plate boundaries of a geology section, unpacked once: { trenches, collisions, ridges } as [lat, lon] lists. */
const unpacked = new WeakMap();
export function boundaryPoints(geology) {
  const b = geology?.boundaries; if (!b) return null;
  if (b.encoding !== "int16-le-tenth-degree") return b;
  if (unpacked.has(b)) return unpacked.get(b);
  const bytes = (b64) => (typeof Buffer !== "undefined" ? Uint8Array.from(Buffer.from(b64, "base64")) : Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  const read = (b64) => { const u = bytes(b64), v = new DataView(u.buffer), out = []; for (let i = 0; i + 3 < u.length; i += 4) out.push([v.getInt16(i, true) / 10, v.getInt16(i + 2, true) / 10]); return out; };
  const out = { trenches: read(b.trenches), collisions: read(b.collisions), ridges: read(b.ridges) };
  unpacked.set(b, out);
  return out;
}

// ---------------------------------------------------------------- the catalogue

/**
 * Every quake from one boundary point in one Eym year with a magnitude in [band, band + 1). Each band has its
 * own draws, so asking for the large quakes only (from far away) gives exactly the large quakes of the full list.
 */
function quakesOf(kind, index, at, year, band) {
  const f = FAULTS[kind], lo = band, hi = Math.min(band + 1, f.maxMagnitude); if (lo >= hi) return [];
  const share = (m) => 10 ** -(m - MIN_MAGNITUDE), rng = rngFor(`${QUAKE_MODEL}|${kind}|${index}|${year}|${band}`), out = [];
  const count = poisson(rng, f.rate * (share(lo) - share(hi)));
  for (let k = 0; k < count; k += 1) {
    const timeMs = year * YEAR_MS + Math.floor(rng() * YEAR_MS);
    // Gutenberg–Richter within the band.
    const magnitude = Math.round(Math.min(hi - 0.05, lo - Math.log10(1 - rng() * (1 - 10 ** -(hi - lo)))) * 10) / 10;
    // Under a trench the sinking slab carries quakes up to 160 km inland, deeper the farther they are (a 30° dip).
    const reachKm = kind === "trenches" ? 160 * rng() ** 1.5 : 40 * rng();
    const epicentre = offset(at, rng() * 360, reachKm), depthKm = Math.round(f.depthKm * (0.5 + rng()) + (kind === "trenches" ? reachKm * 0.55 : 0));
    out.push({ kind: "earthquake", source: kind, timeMs, magnitude, depthKm, at: epicentre, words: f.words });
  }
  return out;
}

/** The smallest magnitude that can be felt (intensity II) at d km. */
const feltFromMagnitude = (d) => (2 + 3.19 * Math.log10(Math.max(5, d)) - 3.67) / 1.17;

/** Every eruption of one volcano that starts in one Eym year. */
function eruptionsOf(volcano, index, year) {
  const rate = ERUPTION_RATE[volcano.activity] ?? 0; if (!rate) return [];
  const rng = rngFor(`${QUAKE_MODEL}|volcano|${index}|${year}`), out = [], shares = VEI_SHARES[volcano.setting] ?? VEI_SHARES.subduction;
  for (let k = poisson(rng, rate); k > 0; k -= 1) {
    const timeMs = year * YEAR_MS + Math.floor(rng() * YEAR_MS);
    let u = rng(), vei = 0; while (vei < shares.length - 1 && u > shares[vei]) { u -= shares[vei]; vei += 1; }
    const days = Math.max(1, Math.round((1 + 3 * vei) * (0.5 + 2 * rng()) * (volcano.setting === "hotspot" ? 4 : 1)));
    out.push({ kind: "eruption", timeMs, endMs: timeMs + days * DAY_MS, vei, at: volcano.at, volcano: { kind: volcano.kind, setting: volcano.setting, heightM: volcano.heightM, activity: volcano.activity }, words: VEI_WORDS[vei] });
  }
  return out;
}

/** How an eruption reaches a place `d` km away: the effects, or null if it does not. */
function eruptionEffect(e, d) {
  const effects = [];
  if (d <= 30) effects.push("tremors and booming");
  if (d <= 8 * 2 ** e.vei) effects.push(e.vei <= 1 ? "lava flows nearby" : "falling ash");
  if (d <= 60 + 60 * e.vei) effects.push(e.vei >= 2 ? "an ash column on the horizon" : "a glow at night");
  return effects.length ? effects : null;
}

/**
 * Earthquakes felt and eruptions noticed at a place between two times (ms). `geology` is the cartography
 * asset's geology section. A place on Caren's Godstone feels only a little of the shaking from the sea floor
 * around it (at most intensity III). At most ten Eym years are searched.
 */
export function tremorsAt(geology, { lat, lon, fromMs, toMs, onGodstone = false }) {
  const boundaries = boundaryPoints(geology); if (!boundaries) return { quakes: [], eruptions: [] };
  const firstYear = Math.floor(fromMs / YEAR_MS), lastYear = Math.min(Math.floor(toMs / YEAR_MS), firstYear + 9), here = [lat, lon];
  const quakes = [], eruptions = [];
  for (const kind of Object.keys(FAULTS)) {
    const f = FAULTS[kind];
    boundaries[kind].forEach((at, index) => {
      // Only the bands that could be felt here (allowing for the epicentre's spread round the source point).
      const k0 = Math.max(0, Math.floor(feltFromMagnitude(distanceKm(here, at) - 170) - MIN_MAGNITUDE));
      for (let band = MIN_MAGNITUDE + k0; band < f.maxMagnitude; band += 1) for (let year = firstYear; year <= lastYear; year += 1) for (const q of quakesOf(kind, index, at, year, band)) {
        if (q.timeMs < fromMs || q.timeMs > toMs) continue;
        const d = distanceKm(here, q.at); let intensity = feltIntensity(q.magnitude, d, q.depthKm);
        if (onGodstone) intensity = Math.min(3, intensity - 1.5);
        if (intensity < 2) continue;
        const level = Math.min(12, Math.round(intensity));
        quakes.push({ ...q, distanceKm: Math.round(d), intensity: Math.round(intensity * 10) / 10, mercalli: ROMAN[level], felt: MERCALLI[level] });
      }
    });
  }
  (geology.volcanoes ?? []).forEach((v, index) => {
    const d = distanceKm(here, v.at); if (d > 500) return;
    for (let year = firstYear - 1; year <= lastYear; year += 1) for (const e of eruptionsOf(v, index, year)) {
      if (e.endMs < fromMs || e.timeMs > toMs) continue;
      const effects = eruptionEffect(e, d); if (!effects) continue;
      eruptions.push({ ...e, distanceKm: Math.round(d), effects });
    }
  });
  quakes.sort((a, b) => a.timeMs - b.timeMs); eruptions.sort((a, b) => a.timeMs - b.timeMs);
  return { quakes, eruptions };
}

/** A short line for the "Here and now" card: the strongest quake felt and any eruption, over the last 30 days. */
export function describeTremors(result, nowMs) {
  const ago = (t) => { const days = Math.floor((nowMs - t) / DAY_MS); return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`; };
  const parts = [];
  const strongest = [...result.quakes].sort((a, b) => b.intensity - a.intensity || b.timeMs - a.timeMs)[0];
  if (strongest) parts.push(`${result.quakes.length} felt; strongest ${strongest.mercalli}, ${strongest.felt.split(" (")[0]}: M${strongest.magnitude.toFixed(1)} ${strongest.distanceKm} km away, ${ago(strongest.timeMs)}`);
  const going = result.eruptions.filter((e) => e.timeMs <= nowMs && e.endMs >= nowMs), recent = result.eruptions.filter((e) => e.endMs < nowMs);
  for (const e of going) parts.push(`volcano erupting ${e.distanceKm} km away (${e.effects.join(", ")})`);
  const last = recent.at(-1); if (!going.length && last) parts.push(`volcano erupted ${last.distanceKm} km away, ${ago(last.timeMs)}`);
  return parts.length ? parts.join("; ") : "none felt in the last 30 days";
}
