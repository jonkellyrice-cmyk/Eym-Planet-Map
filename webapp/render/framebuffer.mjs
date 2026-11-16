// A pixel-art framebuffer: RGBA pixels, integer coordinates, no anti-aliasing. Every primitive writes
// whole pixels, so shapes keep the crisp, hand-placed look of pixel art; dithering mixes two colours in
// a fixed pattern instead of blending them. Deterministic: the same calls always give the same pixels.

/** A colour as [r, g, b, a] from "#rrggbb" (a = 255) or an array. */
export function rgb(c) {
  if (Array.isArray(c)) return c.length === 4 ? c : [...c, 255];
  const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

/** Ordered 4×4 Bayer thresholds (0..15) for dithering. */
export const BAYER4 = Object.freeze([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
export const bayer = (x, y) => BAYER4[(y & 3) * 4 + (x & 3)] / 16;

export class Framebuffer {
  constructor(width, height, fill = null) {
    this.width = width; this.height = height; this.data = new Uint8ClampedArray(width * height * 4);
    if (fill) this.clear(fill);
  }
  clear(color) { const [r, g, b, a] = rgb(color); for (let i = 0; i < this.data.length; i += 4) { this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = a; } }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.width && y < this.height; }
  /** Write one pixel (alpha 255 replaces; below 255 mixes over what is there). */
  set(x, y, color) {
    x |= 0; y |= 0; if (!this.inside(x, y)) return;
    const [r, g, b, a] = color, i = (y * this.width + x) * 4;
    if (a >= 255) { this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = 255; return; }
    if (a <= 0) return;
    const t = a / 255, d = this.data; d[i] += (r - d[i]) * t; d[i + 1] += (g - d[i + 1]) * t; d[i + 2] += (b - d[i + 2]) * t; d[i + 3] = Math.max(d[i + 3], a);
  }
  get(x, y) { if (!this.inside(x, y)) return [0, 0, 0, 0]; const i = (y * this.width + x) * 4; return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]]; }
  /** Darken (k < 0) or lighten (k > 0) a pixel in place: shadows and highlights over what is drawn. */
  tone(x, y, k) {
    x |= 0; y |= 0; if (!this.inside(x, y)) return; const i = (y * this.width + x) * 4, d = this.data;
    for (let c = 0; c < 3; c += 1) d[i + c] = k < 0 ? d[i + c] * (1 + k) : d[i + c] + (255 - d[i + c]) * k;
  }
  rect(x0, y0, w, h, color) { const c = rgb(color); for (let y = Math.round(y0); y < Math.round(y0 + h); y += 1) for (let x = Math.round(x0); x < Math.round(x0 + w); x += 1) this.set(x, y, c); }
  /** Fill a polygon (pixel centres inside, even-odd). `paint(x, y)` may replace the colour per pixel. */
  polygon(points, color, paint = null) {
    const c = color ? rgb(color) : null; let y0 = Infinity, y1 = -Infinity;
    for (const [, y] of points) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(this.height - 1, Math.ceil(y1)); y += 1) {
      const cy = y + 0.5, xs = [];
      for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) { const [xi, yi] = points[i], [xj, yj] = points[j]; if ((yi > cy) !== (yj > cy)) xs.push(xi + ((cy - yi) * (xj - xi)) / (yj - yi)); }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.max(0, Math.ceil(xs[k] - 0.5)); x <= Math.min(this.width - 1, Math.floor(xs[k + 1] - 0.5)); x += 1) this.set(x, y, paint ? rgb(paint(x, y)) : c);
    }
  }
  /** Fill an ellipse; `paint(x, y, u, v)` gets the position inside it (u, v in -1..1). */
  ellipse(cx, cy, rx, ry, color, paint = null) {
    const c = color ? rgb(color) : null;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry; if (u * u + v * v > 1) continue;
      this.set(x, y, paint ? rgb(paint(x, y, u, v)) : c);
    }
  }
  /** A 1-pixel line (Bresenham). */
  line(x0, y0, x1, y1, color) {
    const c = rgb(color); x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy;
    for (;;) { this.set(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  /** Draw another framebuffer on top (its transparent pixels leave this one as it is). */
  draw(other, ox = 0, oy = 0) { for (let y = 0; y < other.height; y += 1) for (let x = 0; x < other.width; x += 1) { const p = other.get(x, y); if (p[3]) this.set(x + ox, y + oy, p); } }
  /** Keep only the pixels where `keep(x, y)` is true (the rest become transparent). */
  mask(keep) { for (let y = 0; y < this.height; y += 1) for (let x = 0; x < this.width; x += 1) if (!keep(x, y)) this.data[(y * this.width + x) * 4 + 3] = 0; }
  /** Scale up by a whole number, each pixel a k×k block: pixel art stays crisp. */
  upscale(k) {
    if (k === 1) return this;
    const out = new Framebuffer(this.width * k, this.height * k), s = this.data, d = out.data, W = out.width;
    for (let y = 0; y < this.height; y += 1) for (let x = 0; x < this.width; x += 1) {
      const i = (y * this.width + x) * 4;
      for (let dy = 0; dy < k; dy += 1) { let o = ((y * k + dy) * W + x * k) * 4; for (let dx = 0; dx < k; dx += 1, o += 4) { d[o] = s[i]; d[o + 1] = s[i + 1]; d[o + 2] = s[i + 2]; d[o + 3] = s[i + 3]; } }
    }
    return out;
  }
  /** A 1-pixel dark outline around everything opaque that borders transparency (for sprites). */
  outline(color) {
    const c = rgb(color), solid = (x, y) => this.inside(x, y) && this.data[(y * this.width + x) * 4 + 3] > 0, marks = [];
    for (let y = 0; y < this.height; y += 1) for (let x = 0; x < this.width; x += 1) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) marks.push([x, y]);
    for (const [x, y] of marks) this.set(x, y, c);
  }
}
