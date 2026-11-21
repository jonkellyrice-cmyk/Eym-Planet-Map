// How high a range stands, from its history (owner's direction of 20 November 2026: heights by their causes, not
// by a category and some noise). A reduced model, one history for each range (not a map of the land wearing down):
//   - where plates converge, a share of the convergence shortens the crust of the belt and thickens it (most of a
//     subducting plate goes down; a collision takes far more of it up);
//   - thick crust floats high: the surface stands above the sea by the crust's excess thickness times
//     (1 − crust's density / mantle's), about 150 m for each kilometre of excess (Airy isostasy);
//   - the land wears down, far faster the higher it stands (as the cube of the crust's excess), faster the wetter
//     it is, and softer rock faster; as rock is
//     taken off the top the root rises, so 6.6 km of rock must go to lower the surface 1 km, and an old belt
//     keeps low mountains for hundreds of millions of years;
//   - crust cannot thicken without end: beyond about twice its normal thickness it spreads sideways.
// From these: the belt's crust today, its mean height and its summits, how deep it has been unroofed (which old
// rocks now lie at the surface), and the rock it sheds each million years. Pure.

export const OROGENY_MODEL = "eym-orogeny-v1";
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * A range's history. `dials` is WORLD_INPUTS.orogeny. `history`:
 *   kind             "subduction" | "accretion" | "collision": how much of the convergence shortens the belt;
 *   convergenceMmYr  how fast the plates close across it while it is active;
 *   activeMyr        for how long it has been (or was) active;
 *   endedMyrAgo      how long ago it stopped (0: still active);
 *   widthKm          the range's drawn width (the thickened belt is `beltWidths` times as wide);
 *   rainMm           the yearly rain over it (wetter wears faster); rock (1 = ordinary; under 1 softer, over 1 harder).
 * (`exhumedKm`: how deep the rock now at the surface once lay; a long-lived range brings up its own root and no
 * more, so it is never more than the thickened crust's excess at its limit.)
 * Returns { crustKm, excessKm, meanM, peakM, exhumedKm, shedKmPerMyr (rock taken off, km of thickness a million
 * years, today), upliftMPerMyr (the surface's rise from thickening alone, while active), steady (it has reached
 * the height at which wear matches thickening, or the crust's limit) }.
 */
export function rangeHistory(dials, { kind, convergenceMmYr, activeMyr, endedMyrAgo = 0, widthKm, rainMm = dials.referenceRainMm, rock = 1 }) {
  const d = dials, float = 1 - d.crustDensity / d.mantleDensity, most = d.maxCrustKm - d.crustKm;
  // Thickening (km of crust a million years): the belt's crust times the shortening over the belt's width.
  const thicken = d.crustKm * (d.shorteningShare[kind] ?? 0) * convergenceMmYr / (d.beltWidths * widthKm);
  // Wear: the excess is taken down at excess³ / `wearKm2Myr` a million years (steep ground wears far faster than
  // low: an Alpine range sheds half a kilometre of crust a million years, an old belt a few metres), faster in
  // wet country and soft rock.
  const wearScale = d.wearKm2Myr * rock * Math.sqrt(d.referenceRainMm / Math.max(50, rainMm));
  let excess = 0, exhumed = 0; const step = 0.5;
  for (let t = 0; t < activeMyr; t += step) { const worn = Math.min(excess, excess ** 3 / wearScale * step); excess = clamp(excess + thicken * step - worn, 0, most); exhumed += worn; }
  const atEnd = excess;
  for (let t = 0; t < endedMyrAgo; t += step) { const worn = Math.min(excess, excess ** 3 / wearScale * step); excess -= worn; exhumed += worn; }
  const meanM = excess * float * 1000, steadyExcess = Math.min(most, Math.cbrt(thicken * wearScale));
  return {
    crustKm: Math.round((d.crustKm + excess) * 10) / 10, excessKm: Math.round(excess * 10) / 10, meanM: Math.round(meanM), peakM: Math.round(meanM * d.peakOverMean),
    exhumedKm: Math.round(Math.min(exhumed, most) * 10) / 10, shedKmPerMyr: Math.round(excess ** 3 / wearScale * 1000) / 1000, upliftMPerMyr: Math.round(thicken * float * 1000),
    steady: endedMyrAgo === 0 && atEnd >= 0.97 * steadyExcess,
  };
}

/** How fast two plates close or part at a place (mm a year along the line between them is not asked: the speed of one against the other). `velocityOf(plate, place)` gives a plate's velocity there as a vector (mm a year). */
export function relativeSpeedMmYr(velocityOf, plateA, plateB, place) {
  const a = velocityOf(plateA, place), b = velocityOf(plateB, place); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
