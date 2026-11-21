// What the land sheds and where it comes to rest (owner's direction of 20 November 2026: erosion and sediment by
// their causes). A reduced, planet-wide account on the map's own squares, not a model that reshapes the land:
//   - a square wears down by how steep it is, how much water runs off it and how hard its rock is (a little even
//     where it is flat and dry);
//   - what it sheds goes downhill from square to square; gentle, low ground keeps a share on the way (alluvial
//     plains), a hollow with no way out keeps all that reaches it (a basin), and what reaches the sea is laid down
//     at the river's mouth (a delta) and along the shelf beside it.
// Pure: heights, runoff and rock are passed in.

export const SEDIMENT_MODEL = "eym-sediment-v1";

/** How fast a square of land wears down (metres of rock a million years): `reliefM` is how far it stands above its lowest neighbour, `runoffMm` the water it sheds a year, `rock` its hardness (1 ordinary; more is harder). */
export function denudationMPerMyr(dials, { reliefM, runoffMm, rock = 1 }) {
  return (dials.flatMPerMyr + dials.steepMPerMyr * Math.max(0, reliefM) / 1000 * Math.sqrt(Math.max(0, runoffMm) / dials.referenceRunoffMm)) / rock;
}

/**
 * Carry what each square sheds downhill to where it rests. `grid` is { rows, cols, heightM (a number for land, null
 * for sea; rows from the south, columns wrapping round the world), yieldKm3 (what each land square sheds, km³ a
 * million years), widthKmAt(row) (a square's east-west width) }. Returns { depositKm3 (per square, a million years),
 * kind (per square: "" | "plain" | "basin" | "delta" | "shelf"), passingKm3 (the load leaving each land square),
 * receiver (the square each land square sheds to, or -1) }.
 */
export function routeSediment(dials, { rows, cols, heightM, yieldKm3, widthKmAt }) {
  const n = rows * cols, at = (r, c) => r * cols + ((c % cols) + cols) % cols, receiver = new Int32Array(n).fill(-1), slope = new Float64Array(n), filled = new Float64Array(n), done = new Uint8Array(n);
  const NEAR = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  // Water finds its way to the sea: the land is flooded from the sea upward (lowest first), each square draining
  // to the square it was reached from. A hollow is filled to its lip on the way; one deeper than `basinDepthM` is a
  // true closed basin and keeps what reaches it.
  const heap = [], push = (i) => { heap.push(i); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (filled[heap[p]] < filled[heap[k]] || (filled[heap[p]] === filled[heap[k]] && heap[p] < heap[k])) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const less = (a, b) => filled[a] < filled[b] || (filled[a] === filled[b] && a < b);
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && less(heap[l], heap[m])) m = l; if (r < heap.length && less(heap[r], heap[m])) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  for (let i = 0; i < n; i += 1) if (heightM[i] == null) { const r = Math.floor(i / cols), c = i % cols; let shore = false; for (const [dr, dc] of NEAR) { const rr = r + dr; if (rr >= 0 && rr < rows && heightM[at(rr, c + dc)] != null) { shore = true; break; } } if (shore) { filled[i] = -1; done[i] = 1; push(i); } }
  const order = [];
  while (heap.length) {
    const i = pop(), r = Math.floor(i / cols), c = i % cols; if (heightM[i] != null) order.push(i);
    for (const [dr, dc] of NEAR) { const rr = r + dr; if (rr < 0 || rr >= rows) continue; const j = at(rr, c + dc); if (done[j] || heightM[j] == null) continue; done[j] = 1; filled[j] = Math.max(heightM[j], filled[i]); receiver[j] = i; slope[j] = Math.max(0, heightM[j] - Math.max(0, heightM[i] ?? 0)) / Math.hypot(dr * 111.2, dc * widthKmAt(rr)); push(j); }
  }
  const load = Float64Array.from(yieldKm3, (v, i) => (heightM[i] == null ? 0 : v || 0)), deposit = new Float64Array(n), kind = new Array(n).fill(""), passing = new Float64Array(n);
  // From the highest ground down (the reverse of the flood): each square passes its load to the square it drains to.
  for (let q = order.length - 1; q >= 0; q -= 1) {
    const i = order[q]; let carried = load[i]; const to = receiver[i];
    if (to < 0 || filled[i] - heightM[i] > dials.basinDepthM) { deposit[i] += carried; if (carried > 0) kind[i] = "basin"; continue; }
    // Gentle ground keeps a share of what comes down to it from above (not of what it sheds itself).
    const fromAbove = carried - (yieldKm3[i] || 0);
    if (fromAbove > 0 && slope[i] < dials.plainSlopeMPerKm) { const kept = fromAbove * dials.plainKeeps * (1 - slope[i] / dials.plainSlopeMPerKm); deposit[i] += kept; carried -= kept; if (kept > 0) kind[i] = "plain"; }
    passing[i] = carried;
    if (heightM[to] != null) { load[to] += carried; continue; }
    // The sea: a delta at the mouth, the rest along the shelf (the sea squares beside the mouth).
    const r = Math.floor(to / cols), c = to % cols, beside = [];
    for (const [dr, dc] of NEAR) { const rr = r + dr; if (rr < 0 || rr >= rows) continue; const j = at(rr, c + dc); if (heightM[j] == null) beside.push(j); }
    const atMouth = beside.length ? carried * dials.deltaShare : carried; deposit[to] += atMouth; if (carried > 0) kind[to] = "delta";
    for (const j of beside) { deposit[j] += (carried - atMouth) / beside.length; if (carried > 0 && !kind[j]) kind[j] = "shelf"; }
  }
  // (Land the flood never reached, an island of one square with no sea square beside it on the grid, keeps its own.)
  for (let i = 0; i < n; i += 1) if (heightM[i] != null && !done[i] && load[i] > 0) { deposit[i] += load[i]; kind[i] = "basin"; }
  return { depositKm3: deposit, kind, passingKm3: passing, receiver };
}
