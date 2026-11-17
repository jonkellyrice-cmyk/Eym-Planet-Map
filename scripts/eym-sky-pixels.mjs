// The night sky as pixel art: the scholars' star chart. The same sky the ground view works out (where every
// star, moon and wanderer stands for a place and a moment) drawn pixel by pixel from a small palette: the
// dome shaded in dithered bands from zenith to horizon, Desna's Path as a dithered river of light, stars as
// single pixels or small sparkles by their brightness, the wandering stars as eight-pointed stars (as on the
// model of the heavens), the moons as discs with their phase, the Sun in its rays, constellation figures as
// dotted gilt lines, and cloud as a veil. Looking closer spreads the same stars wider apart and draws them a
// little larger; no new ones appear. Pure: no canvas here.

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const hashUnit = (n) => { let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };

export const SKY_PALETTE = Object.freeze({
  starTints: [hex("#ffffff"), hex("#ffe6c2"), hex("#d6e4ff")], // white, warm, cool
  faint: [hex("#cfd7ea"), hex("#a9b3cc"), hex("#8791ae"), hex("#6f7998")], // single pixels, bright to dim (the dimmest still reads on a phone)
  band: hex("#aeb8dc"),
  line: hex("#c79c3e"), lineBright: hex("#f2cf6a"),
  wanderers: { Thraximundus: hex("#d9ecff"), Tribune: hex("#f3e3c2"), Kandahar: hex("#f0a36a"), Ramses: hex("#ffe7a3") },
  moons: { "White Moon": { lit: [hex("#b9bec8"), hex("#dcdfe4"), hex("#f6f3ea")], dark: hex("#262a33"), eclipse: hex("#7a2f1a") }, "Red Moon": { lit: [hex("#8a3a28"), hex("#b4533a"), hex("#d9673f")], dark: hex("#2a1a17"), eclipse: hex("#5c1f12") } },
  sun: { disc: hex("#fff7dc"), ray: hex("#f2c14e"), glow: hex("#ffe9a8") },
  veil: { day: hex("#c4ccd4"), night: hex("#1b2229") },
});

/** Where an altitude and azimuth fall on the chart (null below the horizon): zenith at the centre, north up, east left. */
export function skyPoint(altDeg, azDeg, { cx, cy, radius, rotationDeg = 0 }) {
  if (altDeg < 0) return null;
  const r = (90 - altDeg) / 90 * radius, a = (azDeg + rotationDeg) * Math.PI / 180;
  return { x: cx - r * Math.sin(a), y: cy - r * Math.cos(a) };
}

/**
 * The sky as pixels (RGBA, transparent outside the dome). `cx`, `cy` and `radius` place the dome in art pixels;
 * `scale` is how much closer than the whole sky the view is (stars are drawn a size larger at 2.5 and again at 5).
 * `colors` are the zenith and horizon colours ("#rrggbb"); `lines` draws every constellation figure, `highlight`
 * (a constellation's id) draws that one brightly whether or not the rest are shown; `cloud` (0..1) veils the sky.
 */
export function renderSkyPixels({ width, height, cx, cy, radius, rotationDeg = 0, snapshot, sky, starfield, colors, lines = false, highlight = null, cloud = 0, scale = 1 }) {
  const P = SKY_PALETTE, out = new Uint8ClampedArray(width * height * 4), frame = { cx, cy, radius, rotationDeg }, s = snapshot;
  const inDome = (x, y) => x >= 0 && y >= 0 && x < width && y < height && (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= radius * radius;
  const put = (x, y, c) => { x = Math.floor(x); y = Math.floor(y); if (inDome(x, y)) { const o = (y * width + x) * 4; out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255; } };
  const blend = (x, y, c, t) => { x = Math.floor(x); y = Math.floor(y); if (inDome(x, y)) { const o = (y * width + x) * 4; out[o] += (c[0] - out[o]) * t; out[o + 1] += (c[1] - out[o + 1]) * t; out[o + 2] += (c[2] - out[o + 2]) * t; } };
  const place = (alt, az) => skyPoint(alt, az, frame), placeDir = (dir) => { const p = s.project(dir); return place(p.altDeg, p.azDeg); };
  const darkness = clamp((s.limitingMagnitude + 1) / 6.6, 0, 1), zenith = hex(colors.zenith), horizon = hex(colors.horizon);

  // The dome: a calm, solid sky overhead, shading toward the horizon in dithered bands only in its outer part.
  const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(width - 1, Math.ceil(cx + radius)), y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(height - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / radius; if (d > 1) continue;
    const t = Math.max(0, d - 0.55) / 0.45, level = clamp(Math.floor(t ** 1.4 * 6 + (t > 0 ? bayer(x, y) : 0)), 0, 6), c = lerp(zenith, horizon, level / 6), o = (y * width + x) * 4;
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
  }

  // Desna's Path: light gathered along the galaxy's band, then dithered.
  if (s.galacticBandVisible && starfield?.galaxy) {
    const { northPole, center, bandHalfWidthDeg } = starfield.galaxy, n = northPole, side = [n[1] * center[2] - n[2] * center[1], n[2] * center[0] - n[0] * center[2], n[0] * center[1] - n[1] * center[0]], len = Math.hypot(...side) || 1;
    const light = new Float32Array(width * height);
    for (let l = 0; l < 360; l += 3) {
      const rad = l * Math.PI / 180, dir = center.map((c, i) => c * Math.cos(rad) + side[i] / len * Math.sin(rad)), p = placeDir(dir); if (!p) continue;
      const core = ((1 + Math.cos(rad)) / 2) ** 2, reach = bandHalfWidthDeg * (0.7 + 0.6 * core) * radius / 90, strength = 0.1 + 0.2 * core;
      for (let y = Math.max(0, Math.floor(p.y - reach)); y <= Math.min(height - 1, Math.ceil(p.y + reach)); y += 1) for (let x = Math.max(0, Math.floor(p.x - reach)); x <= Math.min(width - 1, Math.ceil(p.x + reach)); x += 1) { const q = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y) / reach; if (q < 1) light[y * width + x] += strength * (1 - q) ** 1.5; }
    }
    // a soft glow, graded in a few even steps rather than dithered into a grid of squares
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) { const v = light[y * width + x] * darkness; if (v > 0.04) blend(x, y, P.band, Math.round(Math.min(1, v) * 5) / 5 * 0.24); }
  }

  // Constellation figures: dotted gilt lines between their stars.
  const starAt = (id) => s.stars[Number(id.slice(5)) - 1];
  for (const c of sky?.constellations ?? []) {
    const bright = c.id === highlight; if (!lines && !bright) continue;
    for (const [a, b] of c.lines) {
      const sa = starAt(a), sb = starAt(b), pa = place(sa.altDeg, sa.azDeg), pb = place(sb.altDeg, sb.azDeg); if (!pa || !pb) continue;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(pb.x - pa.x), Math.abs(pb.y - pa.y))));
      for (let k = 2; k <= steps - 2; k += 1) blend(pa.x + (pb.x - pa.x) * k / steps, pa.y + (pb.y - pa.y) * k / steps, bright ? P.lineBright : P.line, bright ? 0.95 : 0.6 + 0.3 * darkness); // solid gilt
    }
  }

  // Stars: a pixel each, the brighter ones small sparkles; closer in, each is drawn a size larger.
  const bump = scale >= 5 ? 2 : scale >= 2.5 ? 1 : 0;
  for (const star of s.stars) {
    if (!star.visible) continue; const p = place(star.altDeg, star.azDeg); if (!p) continue;
    const x = Math.floor(p.x), y = Math.floor(p.y), tint = P.starTints[Math.floor(hashUnit(star.index) * 3)], rank = star.magnitude < 0 ? 0 : star.magnitude < 1 ? 1 : star.magnitude < 2 ? 2 : star.magnitude < 3 ? 3 : star.magnitude < 4 ? 4 : star.magnitude < 5 ? 5 : 6, size = Math.max(0, rank - bump);
    if (size <= 1) { // a sparkle: a bright heart and four arms (longer for the brightest)
      const arm = size === 0 ? 2 : 1; put(x, y, P.starTints[0]);
      for (let k = 1; k <= arm; k += 1) for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k]]) blend(x + dx, y + dy, tint, k === 1 ? 0.85 : 0.4);
      if (size === 0) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) blend(x + dx, y + dy, tint, 0.25);
    } else if (size === 2) { put(x, y, P.starTints[0]); put(x + 1, y, tint); put(x, y + 1, tint); blend(x + 1, y + 1, tint, 0.75); } // clearly visible: two by two
    else blend(x, y, P.faint[size - 3], size >= 5 ? 0.55 + 0.25 * darkness : 0.75 + 0.25 * darkness);
  }

  // The wandering stars: eight points, as on the model of the heavens.
  for (const planet of s.planets) {
    if (!planet.visible) continue; const p = place(planet.altDeg, planet.azDeg); if (!p) continue;
    const x = Math.floor(p.x), y = Math.floor(p.y), c = P.wanderers[planet.name] ?? P.starTints[0], long = bump ? 4 : 3;
    for (let k = 1; k <= long; k += 1) for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k]]) blend(x + dx, y + dy, c, k < long ? 1 : 0.55);
    for (let k = 1; k <= long - 2; k += 1) for (const [dx, dy] of [[k, k], [-k, k], [k, -k], [-k, -k]]) blend(x + dx, y + dy, c, 0.8);
    put(x, y, P.starTints[0]);
  }

  // The moons: a disc with its phase turned toward the Sun, reddened in the world's shadow.
  for (const moon of s.moons) {
    const p = place(moon.altDeg, moon.azDeg); if (!p || !moon.visible) continue;
    const look = P.moons[moon.name] ?? P.moons["White Moon"], r = moonRadius(moon, radius), k = moon.illuminated;
    const toward = placeDir(unit(moon.dir.map((v, i) => v + 0.02 * moon.brightLimb[i]))) ?? p, ang = Math.atan2(toward.y - p.y, toward.x - p.x), ca = Math.cos(ang), sa = Math.sin(ang);
    for (let y = Math.floor(p.y - r); y <= p.y + r; y += 1) for (let x = Math.floor(p.x - r); x <= p.x + r; x += 1) {
      const dx = x + 0.5 - p.x, dy = y + 0.5 - p.y; if (dx * dx + dy * dy > r * r) continue;
      const u = dx * ca + dy * sa, v = -dx * sa + dy * ca, lit = u > (1 - 2 * k) * Math.sqrt(Math.max(0, r * r - v * v));
      if (!lit) { blend(x, y, look.dark, 0.1 + 0.75 * darkness); continue; }
      const tone = hashUnit(x * 7919 + y * 104729 + moon.name.length) > 0.8 ? 0 : u / r > 0.25 ? 2 : 1;
      put(x, y, lerp(look.lit[tone], look.eclipse, clamp(moon.umbralFraction * 0.95, 0, 1)));
    }
  }

  // The Sun: a disc in its rays, with a moon's disc before it in true proportion when one crosses.
  const sun = place(s.sun.altDeg, s.sun.azDeg);
  if (sun) {
    const R = SUN_PIXELS, total = s.sun.coverage > 0.98;
    for (let y = Math.floor(sun.y - R * 3); y <= sun.y + R * 3; y += 1) for (let x = Math.floor(sun.x - R * 3); x <= sun.x + R * 3; x += 1) { const d = Math.hypot(x + 0.5 - sun.x, y + 0.5 - sun.y) / (R * 3); if (d < 1 && (1 - d) ** 2 * (total ? 0.6 : 0.9) > bayer(x, y)) blend(x, y, P.sun.glow, 0.5); }
    for (let a = 0; a < 8; a += 1) for (let k = R + 1; k <= R + (a % 2 ? 2 : 4); k += 1) put(sun.x + Math.cos(a * Math.PI / 4) * k, sun.y + Math.sin(a * Math.PI / 4) * k, P.sun.ray);
    for (let y = Math.floor(sun.y - R); y <= sun.y + R; y += 1) for (let x = Math.floor(sun.x - R); x <= sun.x + R; x += 1) if ((x + 0.5 - sun.x) ** 2 + (y + 0.5 - sun.y) ** 2 <= R * R) put(x, y, P.sun.disc);
    const perDeg = R / s.sun.radiusDeg, skyPerDeg = radius / 90;
    for (const moon of s.moons) {
      if (!(moon.sunCoverage > 0)) continue; const m = place(moon.altDeg, moon.azDeg) ?? sun, mx = sun.x + (m.x - sun.x) / skyPerDeg * perDeg, my = sun.y + (m.y - sun.y) / skyPerDeg * perDeg, mr = moon.radiusDeg * perDeg;
      for (let y = Math.floor(my - mr); y <= my + mr; y += 1) for (let x = Math.floor(mx - mr); x <= mx + mr; x += 1) if ((x + 0.5 - mx) ** 2 + (y + 0.5 - my) ** 2 <= mr * mr) put(x, y, moon.name === "Red Moon" ? [31, 15, 12] : [13, 15, 20]);
    }
  }

  // Cloud from the weather veils it all: the thicker the cloud, the more pixels it takes.
  const day = s.sun.altDeg > -6, veil = Math.max(0, cloud - 0.1) ** 1.3 * (day ? 0.8 : 0.93);
  if (veil > 0.02) for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) if (veil > bayer(x, y)) blend(x, y, day ? P.veil.day : P.veil.night, 0.92);
  return out;
}

const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
/** The Sun's disc on the chart, in art pixels. */
export const SUN_PIXELS = 5;
/** A moon's disc on the chart, in art pixels: five times its true size, and never too small to show its phase. */
export const moonRadius = (moon, radius) => Math.max(4, moon.radiusDeg * radius / 90 * 5);
