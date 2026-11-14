// Realizes the SCULPTED_FIGURES templates in the night sky by nudging spare stars into place.
//
// The 35 discovered constellations and the asterisms are protected: their stars never move. For each
// template (largest first) the sculptor searches empty sky in the requested hemisphere, away from the
// path of the sun, tries rotations, and assigns the nearest spare bright stars to the template points,
// minimizing how far stars move and preferring brighter ones. Only star directions change; magnitudes
// and star ids are untouched. The plan is deterministic for a given base catalogue.
import { angularDistanceDeg, cross, dot, latitudeDeg, normalize } from "../scripts/sky-frame.mjs";
import { ASTERISMS, CONSTELLATION_NAMES, SCULPTED_FIGURES } from "./constellation-canon.mjs";
import { findCandidates, starId } from "./find-constellation-candidates.mjs";

export const SCULPT_MAGNITUDE_LIMIT = 4.5;
const MAX_LINE_DEG = 8.8;
const MAX_MOVE_DEG = 8;
const CLEARANCE_MARGIN_DEG = 4;
const MIN_SUN_PATH_LATITUDE_DEG = 18; // keep the eight path-of-the-sun constellations and their order intact
const CENTER_GRID = 4000;
const ROTATION_STEP_DEG = 10;
const DEG = Math.PI / 180;

const indexOf = (id) => Number(id.slice(5)) - 1;

/** Template scaled so its longest line is at most MAX_LINE_DEG. */
export function scaledTemplate(figure) {
  const longest = Math.max(...figure.lines.map(([a, b]) => Math.hypot(figure.points[a][0] - figure.points[b][0], figure.points[a][1] - figure.points[b][1])));
  const k = Math.min(1, MAX_LINE_DEG / longest);
  const points = figure.points.map(([x, y]) => [x * k, y * k]);
  const radius = Math.max(...points.map(([x, y]) => Math.hypot(x, y)));
  return { points, radius, scale: k };
}

/** A direction `offsetDeg` from `pole`, displaced toward the path of the sun's pole (a fixed, reproducible side). */
function poleOffset(pole, reference, offsetDeg) {
  const p = normalize(pole);
  const side = normalize(cross(cross(p, reference), p));
  const a = offsetDeg * DEG;
  return normalize([0, 1, 2].map((k) => p[k] * Math.cos(a) + side[k] * Math.sin(a)));
}

function fibonacciSphere(n) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * i + 1) / n, r = Math.sqrt(1 - y * y), t = golden * i;
    return [r * Math.cos(t), y, r * Math.sin(t)];
  });
}

/** Directions of template points placed at `center`, rotated by `rotationDeg` (inverse gnomonic projection). */
function placeTemplate(points, center, rotationDeg) {
  const c = normalize(center);
  const helper = Math.abs(c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = normalize(cross(helper, c)), v = cross(c, u);
  const cr = Math.cos(rotationDeg * DEG), sr = Math.sin(rotationDeg * DEG);
  return points.map(([x0, y0]) => {
    const x = Math.tan((x0 * cr - y0 * sr) * DEG), y = Math.tan((x0 * sr + y0 * cr) * DEG);
    return normalize([0, 1, 2].map((k) => c[k] + x * u[k] + y * v[k]));
  });
}

export function planSculpt(baseStarfield, sky) {
  const directions = baseStarfield.stars.map((row) => row.slice(0, 3));
  const magnitudes = baseStarfield.stars.map((row) => row[3]);
  const discovered = findCandidates(baseStarfield, sky).filter((c) => CONSTELLATION_NAMES[c.stars[0]]);
  const protectedIds = new Set([...discovered.flatMap((c) => c.stars), ...ASTERISMS.flatMap((a) => a.stars)]);
  const anchors = [...protectedIds].map((id) => directions[indexOf(id)]);
  const taken = new Set(protectedIds);
  const grid = fibonacciSphere(CENTER_GRID);
  const order = [...SCULPTED_FIGURES].sort((a, b) => b.points.length - a.points.length || a.id.localeCompare(b.id));
  const moves = [], figures = [];

  for (const figure of order) {
    const { points, radius } = scaledTemplate(figure);
    const north = figure.hemisphere === "north";
    // An anchored figure has exactly one candidate centre: its anchor point pinned near a celestial pole.
    const anchorTarget = figure.anchor ? poleOffset(figure.anchor.pole === "north" ? sky.celestialPole : sky.celestialPole.map((v) => -v), sky.sunPathPole, figure.anchor.offsetDeg) : null;
    const centers = anchorTarget ? [{ c: anchorTarget }] : grid
      .filter((c) => (latitudeDeg(c, sky.celestialPole) >= 0) === north)
      .filter((c) => Math.abs(latitudeDeg(c, sky.sunPathPole)) >= MIN_SUN_PATH_LATITUDE_DEG + radius)
      .map((c) => ({ c, clearance: Math.min(...anchors.map((a) => angularDistanceDeg(a, c))) }))
      .filter(({ clearance }) => clearance >= radius + CLEARANCE_MARGIN_DEG);
    const spare = directions.map((d, i) => ({ i, id: starId(i), d, mag: magnitudes[i] })).filter((s) => s.mag < SCULPT_MAGNITUDE_LIMIT && !taken.has(s.id));
    let best = null;
    for (const { c } of centers) {
      const nearby = spare.filter((s) => angularDistanceDeg(s.d, c) <= radius + MAX_MOVE_DEG);
      if (nearby.length < points.length) continue;
      for (let rotation = 0; rotation < 360; rotation += ROTATION_STEP_DEG) {
        const targets = figure.anchor ? placeTemplate(points.map(([x, y]) => [x - points[figure.anchor.point][0], y - points[figure.anchor.point][1]]), c, rotation) : placeTemplate(points, c, rotation);
        const used = new Set(), assignment = new Array(targets.length);
        let cost = 0, ok = true;
        // The anchor point (if any) is assigned first so it gets first pick of bright stars.
        const orderOfPoints = [...targets.keys()].sort((a, b) => (b === figure.anchor?.point) - (a === figure.anchor?.point));
        for (const pointIndex of orderOfPoints) {
          const target = targets[pointIndex];
          let pick = null;
          // The anchor point takes the brightest spare star in reach: a pole star should stand out.
          const anchored = figure.anchor?.point === pointIndex;
          for (const s of nearby) {
            if (used.has(s.id)) continue;
            const move = angularDistanceDeg(s.d, target);
            if (move > MAX_MOVE_DEG) continue;
            const score = anchored ? s.mag : move + 1.5 * Math.max(0, s.mag - 3.6);
            if (!pick || score < pick.score) pick = { i: s.i, id: s.id, move, score };
          }
          if (!pick) { ok = false; break; }
          used.add(pick.id); assignment[pointIndex] = { ...pick, target }; cost += pick.score;
        }
        if (ok && (!best || cost < best.cost)) best = { cost, assignment, center: c, rotation };
      }
    }
    if (!best) throw new Error(`No placement found for ${figure.name}`);
    for (const a of best.assignment) {
      taken.add(a.id);
      anchors.push(a.target);
      moves.push({ star: a.id, to: a.target, moveDeg: a.move });
    }
    figures.push({
      ...figure,
      stars: best.assignment.map((a) => a.id),
      lines: figure.lines.map(([p, q]) => [best.assignment[p].id, best.assignment[q].id]),
      center: normalize(best.assignment.reduce((s, a) => [s[0] + a.target[0], s[1] + a.target[1], s[2] + a.target[2]], [0, 0, 0])),
      rotationDeg: best.rotation,
    });
  }
  return { moves, figures: figures.sort((a, b) => SCULPTED_FIGURES.findIndex((f) => f.id === a.id) - SCULPTED_FIGURES.findIndex((f) => f.id === b.id)), protectedCount: protectedIds.size };
}

/** Starfield with the sculpt moves applied (directions only). */
export function applySculpt(baseStarfield, plan) {
  const stars = baseStarfield.stars.map((row) => [...row]);
  for (const move of plan.moves) {
    const row = stars[indexOf(move.star)];
    move.to.forEach((value, k) => { row[k] = Number(value.toFixed(5)); });
  }
  return stars;
}
