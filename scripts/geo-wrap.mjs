// Longitude that wraps, and rings that cross the map's seam (the meridian at ±180°) or go round a pole.
// One place for it, so that no tool works out a ring's reach as the least and greatest of its longitudes: for a ring
// that crosses ±180° that gives a box right round the planet, and for a ring round a pole there is no such box.
// Points are [lat, lon] in degrees, rings are closed (the last point joins the first). Pure: no files, no imports.

const EPS = 1e-9;

/** A longitude brought into [-180, 180). */
export const normLon = (lon) => { const v = ((lon + 180) % 360 + 360) % 360 - 180; return v === 180 ? -180 : v; };

/** The signed difference lon − refLon, in (-180, 180]: how far east of `refLon` a longitude lies, the short way. */
export const lonOffset = (lon, refLon) => { const d = ((lon - refLon) % 360 + 360) % 360; return d > 180 ? d - 360 : d; };

/**
 * The same points with their longitudes made continuous: each step changes by at most 180°, so a ring that crosses
 * ±180° runs on past it (to 190°, say) instead of jumping. It starts within 180° of `refLon` (the first point's
 * own longitude unless given).
 */
export function unwrapRing(points, refLon = points[0]?.[1] ?? 0) {
  const out = []; let previous = null;
  for (const [lat, lon] of points) { const at = previous == null ? refLon + lonOffset(lon, refLon) : previous + lonOffset(lon, previous); out.push([lat, at]); previous = at; }
  return out;
}

/**
 * The summed change of longitude going once round the ring: about 0 for an ordinary ring, about ±360 for one that
 * goes round a pole. Returns { turnDeg, pole }: pole is "north", "south" or null. (Which pole: the one the ring lies
 * nearer, by its mean latitude; a ring round a pole keeps to that pole's side of the world.)
 */
export function ringWinding(points) {
  if (points.length < 3) return { turnDeg: 0, pole: null };
  let turn = 0, lat = 0;
  for (let i = 0; i < points.length; i += 1) { turn += lonOffset(points[(i + 1) % points.length][1], points[i][1]); lat += points[i][0]; }
  return { turnDeg: turn, pole: Math.abs(turn) > 180 ? (lat >= 0 ? "north" : "south") : null };
}

/**
 * The shortest arc of longitude that holds all the points: { centerLon, westLon, eastLon, spanDeg }, west and east
 * in [-180, 180) and possibly on either side of ±180° (then westLon > eastLon). A ring round a pole has no such arc:
 * { full: true, spanDeg: 360, centerLon: 0, westLon: -180, eastLon: 180, pole }.
 * For a ring that does not cross ±180°, westLon and eastLon are exactly its least and greatest longitudes.
 */
export function lonExtent(points) {
  if (!points.length) return { centerLon: 0, westLon: 0, eastLon: 0, spanDeg: 0 };
  const { pole } = ringWinding(points);
  if (pole) return { full: true, spanDeg: 360, centerLon: 0, westLon: -180, eastLon: 180, pole };
  // The plain case first, so that a ring away from the seam gives exactly what the least and greatest gave.
  let min = Infinity, max = -Infinity, crosses = false;
  for (let i = 0; i < points.length; i += 1) { const lon = points[i][1]; if (lon < min) min = lon; if (lon > max) max = lon; if (Math.abs(points[(i + 1) % points.length][1] - lon) > 180) crosses = true; }
  if (!crosses) return { centerLon: min + (max - min) / 2, westLon: min, eastLon: max, spanDeg: max - min };
  const run = unwrapRing(points); min = Infinity; max = -Infinity;
  for (const [, lon] of run) { if (lon < min) min = lon; if (lon > max) max = lon; }
  if (max - min >= 360) return { full: true, spanDeg: 360, centerLon: 0, westLon: -180, eastLon: 180, pole: null };
  return { centerLon: normLon(min + (max - min) / 2), westLon: normLon(min), eastLon: normLon(max), spanDeg: max - min };
}

/**
 * A ring's box: { minLat, maxLat, lonExtent }. For a ring round a pole the latitudes reach that pole.
 */
export function bboxWrap(points) {
  let minLat = Infinity, maxLat = -Infinity;
  for (const [lat] of points) { if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat; }
  const extent = lonExtent(points);
  if (extent.pole === "north") maxLat = 90; else if (extent.pole === "south") minLat = -90;
  return { minLat, maxLat, lonExtent: extent };
}

/** Whether a longitude lies within an extent (from lonExtent), widened by `marginDeg` on each side. Wrap-aware. */
export function lonInExtent(lon, extent, marginDeg = 0) {
  if (extent.full || extent.spanDeg + 2 * marginDeg >= 360) return true;
  // Away from the seam this is the plain comparison, exactly as the least and greatest were compared.
  if (extent.westLon <= extent.eastLon && lon >= extent.westLon - marginDeg && lon <= extent.eastLon + marginDeg) return true;
  const east = ((lon - extent.westLon) % 360 + 360) % 360; // degrees east of the west edge, in [0, 360)
  return east <= extent.spanDeg + marginDeg || east >= 360 - marginDeg;
}

/** The latitude at which the short edge from a to b meets the meridian at ±180°. */
function seamLat(a, b) { const run = lonOffset(b[1], a[1]), toSeam = a[1] >= 0 ? 180 - a[1] : -180 - a[1]; return a[0] + (b[0] - a[0]) * (Math.abs(run) < EPS ? 0 : toSeam / run); }

/**
 * A ring cut at ±180° into rings that each lie on one side of it, with the crossing points worked out and each
 * piece closed along the meridian: for filling and drawing on flat grids, and for anything that reads coasts as
 * plain latitude and longitude. A ring that does not cross comes back alone (the same array). A ring round a pole
 * comes back as one piece closed along that pole's edge of the flat map (down the seam to the pole, along the pole,
 * and back up the other side).
 */
export function splitRingAtAntimeridian(points) {
  const n = points.length, jump = (a, b) => Math.abs(b[1] - a[1]) > 180;
  let first = -1; for (let i = 0; i < n; i += 1) if (jump(points[i], points[(i + 1) % n])) { first = i; break; }
  if (first < 0) return [points];
  const { pole } = ringWinding(points);
  if (pole) {
    // Run the ring from just after a crossing right round the world to that crossing again (eastward or westward as
    // the ring goes), then close it down the far seam, along the pole's edge of the map, and back.
    const { turnDeg } = ringWinding(points), dir = turnDeg > 0 ? 1 : -1, startLon = dir > 0 ? -180 : 180, endLon = -startLon, edge = pole === "north" ? 90 : -90;
    const lat = seamLat(points[first], points[(first + 1) % n]), run = [[lat, startLon]];
    for (let k = 1; k <= n; k += 1) run.push(points[(first + k) % n]);
    const out = unwrapRing(run, startLon); out[0] = [lat, startLon];
    out.push([lat, endLon], [edge, endLon], [edge, startLon]);
    return [out];
  }
  // Chains of the ring between crossings, each starting and ending on the seam.
  const chains = []; let chain = null;
  for (let k = 1; k <= n; k += 1) {
    const before = points[(first + k - 1) % n], at = points[(first + k) % n], after = points[(first + k + 1) % n];
    if (!chain) { const side = at[1] >= 0 ? 180 : -180; chain = { side, points: [[seamLat(before, at), side]] }; }
    chain.points.push(at);
    if (jump(at, after)) { chain.points.push([seamLat(at, after), chain.side]); chains.push(chain); chain = null; }
  }
  // On each side the chains' ends along the seam pair off in order of latitude (inside the ring lies between each
  // pair): follow a chain to its end, cross the seam's stretch to the partner end, and carry on from there.
  const out = [];
  for (const side of [180, -180]) {
    const mine = chains.filter((c) => c.side === side);
    const ends = mine.flatMap((c, k) => [{ lat: c.points[0][0], chain: k, start: true }, { lat: c.points[c.points.length - 1][0], chain: k, start: false }]).sort((p, q) => p.lat - q.lat || (p.start ? 1 : -1));
    const partner = new Map(); for (let k = 0; k + 1 < ends.length; k += 2) { partner.set(ends[k], ends[k + 1]); partner.set(ends[k + 1], ends[k]); }
    const used = new Set();
    for (let k = 0; k < mine.length; k += 1) {
      if (used.has(k)) continue; const piece = []; let at = k;
      while (!used.has(at)) { used.add(at); piece.push(...mine[at].points); const next = partner.get(ends.find((e) => e.chain === at && !e.start)); if (!next?.start) break; at = next.chain; }
      if (piece.length >= 4) out.push(piece);
    }
  }
  return out;
}

/** Whether a point lies inside a ring that does not cross ±180° (an even-odd crossing test in plain degrees). */
export function pointInPlainRing(points, lat, lon) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) { const [yi, xi] = points[i], [yj, xj] = points[j]; if ((yi > lat) !== (yj > lat) && lon < xi + (lat - yi) / (yj - yi) * (xj - xi)) inside = !inside; }
  return inside;
}

/** The area of a ring that does not cross ±180°, in square degrees weighted by the cosine of latitude (for tests and shares). */
export function plainRingAreaDeg2(points) {
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) { const [yi, xi] = points[i], [yj, xj] = points[j]; area += (xi - xj) * (Math.sin(yi * Math.PI / 180) + Math.sin(yj * Math.PI / 180)) / 2; }
  return Math.abs(area) * 180 / Math.PI;
}
