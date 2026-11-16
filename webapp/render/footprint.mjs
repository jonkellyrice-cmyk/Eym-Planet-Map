// Whether a point (in square units) is inside a building's footprint: its rectangles, or its outline with cut corners.
import { footprintPolygon } from "../../scripts/eym-battle-buildings.mjs";

export function inPoly(px, py, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c; } return c; }

export function inFootprint(b, sx, sy) {
  if (b.chamfers?.length) return inPoly(sx, sy, footprintPolygon(b));
  return (b.rects ?? [b]).some((r) => sx >= r.x0 && sx < r.x1 + 1 && sy >= r.y0 && sy < r.y1 + 1);
}
