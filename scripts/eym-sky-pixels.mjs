// The night sky, drawn at the screen's own sharpness: the scholars' star chart at tier 4–5. The same sky the
// ground view works out (where every star, moon and wanderer stands for a place and a moment), drawn by rule:
//   - the dome: a smooth gradient from zenith to horizon with a faint glow along the horizon (the twilight's
//     colours at dusk and dawn), no bands and no checkerboard;
//   - Desna's Path: a soft, uneven glow with a brighter core and dark lanes of dust;
//   - stars: a sharp core and a small soft glow whose size and strength follow brightness, a fine cross on the
//     brightest few, faint stars tiny and dim as background dust, a restrained warm, white or cool tint;
//   - the wandering stars: sharp eight-pointed stars in a soft halo, brighter than any star;
//   - the moons: discs with a soft terminator, darker patches and earthshine on the night side;
//   - the Sun: a disc in a soft corona and rays, with a moon's disc before it in true proportion;
//   - constellation figures: thin, continuous, muted gilt lines that stop short of their stars (a chosen one
//     in bright gilt);
//   - cloud: a soft, uneven veil.
// Looking closer spreads the same stars wider apart; no new ones appear, and they are not drawn larger.
// Everything here is pure (no canvas): pictures are RGBA arrays, so the same input always gives the same picture.
// The view (sky-view.mjs) puts the background on a canvas and stamps the stars, wanderers, moons and Sun on
// it as sprites; renderSkyPixels() does the whole picture in software, for checking and for tests.

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const DEG = Math.PI / 180;

// ---------------------------------------------------------------- primitives

const hashUnit = (n) => { let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const hash3 = (x, y, z) => hashUnit(Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791));
/** Smooth value noise in three dimensions (0..1). */
function noise3(x, y, z) {
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z), fx = x - x0, fy = y - y0, fz = z - z0;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz), at = (a, b, c) => hash3(x0 + a, y0 + b, z0 + c);
  const lo = (at(0, 0, 0) * (1 - u) + at(1, 0, 0) * u) * (1 - v) + (at(0, 1, 0) * (1 - u) + at(1, 1, 0) * u) * v;
  const hi = (at(0, 0, 1) * (1 - u) + at(1, 0, 1) * u) * (1 - v) + (at(0, 1, 1) * (1 - u) + at(1, 1, 1) * u) * v;
  return lo * (1 - w) + hi * w;
}
const fbm = (x, y, z) => 0.62 * noise3(x, y, z) + 0.38 * noise3(x * 2.3 + 5.1, y * 2.3 + 1.7, z * 2.3 + 9.3);

export const SKY_PALETTE = Object.freeze({
  starTints: [hex("#ffffff"), hex("#ffe2b8"), hex("#cfdcff")], // white, warm, cool
  faint: [hex("#c9d2e8"), hex("#aab4cc"), hex("#8f9ab6"), hex("#7b86a4")], // faint stars, the background dust
  band: hex("#b4bedf"), bandCore: hex("#e6dcc4"),
  line: hex("#a88a4e"), lineBright: hex("#f2cf6a"),
  wanderers: { Thraximundus: hex("#d9ecff"), Tribune: hex("#f3e3c2"), Kandahar: hex("#f0a36a"), Ramses: hex("#ffe7a3") },
  moons: { "White Moon": { lit: [hex("#b4b9c3"), hex("#d6d9df"), hex("#f4f1e8")], dark: hex("#262a33"), eclipse: hex("#7a2f1a") }, "Red Moon": { lit: [hex("#7e3626"), hex("#ab4f37"), hex("#d9673f")], dark: hex("#2a1a17"), eclipse: hex("#5c1f12") } },
  sun: { disc: hex("#fff7dc"), ray: hex("#f2c14e"), glow: hex("#ffe9a8") },
  veil: { day: hex("#c4ccd4"), night: hex("#1b2229") },
});

/** Where an altitude and azimuth fall on the chart (null below the horizon): zenith at the centre, north up, east left. */
export function skyPoint(altDeg, azDeg, { cx, cy, radius, rotationDeg = 0 }) {
  if (altDeg < 0) return null;
  const r = (90 - altDeg) / 90 * radius, a = (azDeg + rotationDeg) * DEG;
  return { x: cx - r * Math.sin(a), y: cy - r * Math.cos(a) };
}

/** The Sun's disc on the chart, in screen pixels (before the screen's density). */
export const SUN_PIXELS = 5;
/** A moon's disc on the chart: five times its true size, and never too small to show its phase. */
export const moonRadius = (moon, radius) => Math.max(4, moon.radiusDeg * radius / 90 * 5);

/**
 * How a star is drawn, by its brightness: 0 the brightest few (a fine cross), 1 bright or named (a small plus in
 * a glow), 2 middling (a bright point with a short plus), 3 fainter (a single bright point), 4 the dust.
 */
export function starLevel(magnitude, named = false) {
  const level = magnitude < 0.5 ? 0 : magnitude < 2 ? 1 : magnitude < 3 ? 2 : magnitude < 4 ? 3 : 4;
  return named ? Math.min(level, 1) : level;
}
const STAR_LOOK = [
  { core: 0.95, peak: 1, glow: 3.4, glowStrength: 0.42, arm: 8.5, armStrength: 0.55 },
  { core: 0.8, peak: 1, glow: 2.3, glowStrength: 0.3, arm: 3.4, armStrength: 0.62 },
  { core: 0.62, peak: 1, glow: 1.3, glowStrength: 0.14, arm: 1.8, armStrength: 0.4 },
  { core: 0.55, peak: 0.82, glow: 0, glowStrength: 0, arm: 0, armStrength: 0 },
  { core: 0.5, peak: 0.42, glow: 0, glowStrength: 0, arm: 0, armStrength: 0 },
];

/** A sprite (RGBA, centred on its middle pixel) from a function of the offset (dx, dy) giving [r, g, b, alpha]. */
function makeSprite(half, shade) {
  const w = 2 * half + 1, data = new Uint8ClampedArray(w * w * 4);
  for (let y = 0; y < w; y += 1) for (let x = 0; x < w; x += 1) {
    const [r, g, b, a] = shade(x - half, y - half); if (a <= 0.004) continue;
    const o = (y * w + x) * 4; data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = Math.round(clamp(a, 0, 1) * 255);
  }
  return { width: w, height: w, half, data };
}

/** A star's sprite at a screen density (device pixels per CSS pixel). */
export function starSprite(level, tintIndex, density = 1) {
  const L = STAR_LOOK[level], d = density, tint = level === 4 ? SKY_PALETTE.faint[2] : SKY_PALETTE.starTints[tintIndex];
  const reach = Math.max(L.core * 3, L.glow * 3, L.arm) * d, half = Math.max(1, Math.ceil(reach));
  const sc = 2 * (L.core * d) ** 2, sg = 2 * (L.glow * d) ** 2, armLen = L.arm * d, armW = 0.42 * d + 0.35;
  return makeSprite(half, (x, y) => {
    const r2 = x * x + y * y;
    let core = L.peak * Math.exp(-r2 / sc), a = core + (L.glow ? L.glowStrength * Math.exp(-r2 / sg) : 0);
    if (armLen) for (const [u, v] of [[x, y], [y, x]]) if (Math.abs(v) < armW && Math.abs(u) < armLen) a += L.armStrength * (1 - Math.abs(u) / armLen) ** 1.6 * (1 - Math.abs(v) / armW);
    const white = level === 4 ? 0 : clamp(core * 1.2, 0, 1), c = lerp(tint, [255, 255, 255], white);
    return [c[0], c[1], c[2], a];
  });
}

/** A wandering star's sprite: a sharp eight-pointed star in a soft halo, the brightest mark in the sky. */
export function wandererSprite(color, density = 1) {
  const d = density, half = Math.ceil(9 * d), halo = 2 * (3.6 * d) ** 2, core = 2 * (1.05 * d) ** 2, w = 0.5 * d + 0.4;
  return makeSprite(half, (x, y) => {
    const r2 = x * x + y * y; let a = 0.5 * Math.exp(-r2 / halo) + Math.exp(-r2 / core);
    for (const [u, v, len] of [[x, y, 8 * d], [y, x, 8 * d], [(x + y) * Math.SQRT1_2, (x - y) * Math.SQRT1_2, 4.8 * d], [(x - y) * Math.SQRT1_2, (x + y) * Math.SQRT1_2, 4.8 * d]]) if (Math.abs(v) < w && Math.abs(u) < len) a += (1 - Math.abs(u) / len) ** 1.3 * (1 - Math.abs(v) / w);
    const c = lerp(color, [255, 255, 255], clamp(Math.exp(-r2 / core) * 1.3, 0, 1));
    return [c[0], c[1], c[2], a];
  });
}

/**
 * A moon's sprite: its disc (radius `r` device pixels) with the phase turned toward the Sun (`angle`, the
 * direction of the bright limb on the chart), a soft terminator, darker patches, earthshine on the night side
 * (stronger the darker the sky) and the world's shadow when it is eclipsed.
 */
export function moonSprite(moon, r, angle, darkness = 1) {
  const look = SKY_PALETTE.moons[moon.name] ?? SKY_PALETTE.moons["White Moon"], k = moon.illuminated, ca = Math.cos(angle), sa = Math.sin(angle), half = Math.ceil(r + 1);
  const seed = moon.name.length * 7.3, soft = 0.06 * r + 0.6, red = clamp(moon.umbralFraction * 0.95, 0, 1);
  return makeSprite(half, (x, y) => {
    const dist = Math.hypot(x, y), edge = clamp(r + 0.5 - dist, 0, 1); if (edge <= 0) return [0, 0, 0, 0];
    const u = x * ca + y * sa, v = -x * sa + y * ca, bound = (1 - 2 * k) * Math.sqrt(Math.max(0, r * r - v * v)), lit = smooth(-soft, soft, u - bound);
    const patches = smooth(0.52, 0.72, fbm(x / r * 2.1 + seed, y / r * 2.1, seed)), limb = 1 - 0.25 * (dist / r) ** 3;
    const day = lerp(lerp(look.lit[2], look.lit[0], patches * 0.8), look.lit[1], 0.15), dayLit = day.map((c) => c * limb);
    const night = lerp(look.dark, look.lit[0], 0.1 + 0.12 * darkness * (1 - k));
    const c = lerp(lerp(night, dayLit, lit), look.eclipse, red);
    return [c[0], c[1], c[2], edge * (0.25 + 0.75 * Math.max(lit, 0.1 + 0.75 * darkness))];
  });
}

/** The Sun's sprite: a disc (radius `R` device pixels) in a soft corona with eight rays (weaker in totality). */
export function sunSprite(R, total = false) {
  const P = SKY_PALETTE.sun, half = Math.ceil(R * 3.4), corona = 2 * (R * 1.35) ** 2, w = 0.35 * R / 5 + 0.5;
  return makeSprite(half, (x, y) => {
    const dist = Math.hypot(x, y), disc = clamp(R + 0.5 - dist, 0, 1);
    let glow = (total ? 0.55 : 0.75) * Math.exp(-(dist * dist) / corona);
    for (let a = 0; a < 8; a += 1) { const t = a * Math.PI / 4, u = x * Math.cos(t) + y * Math.sin(t), v = -x * Math.sin(t) + y * Math.cos(t), len = R * (a % 2 ? 2.3 : 3.2); if (u > R && u < len && Math.abs(v) < w) glow += 0.7 * (1 - (u - R) / (len - R)); }
    const c = lerp(lerp(P.glow, P.ray, clamp(dist / (R * 3), 0, 1)), P.disc, disc);
    return [c[0], c[1], c[2], Math.max(disc, clamp(glow, 0, 1))];
  });
}

// ---------------------------------------------------------------- the dome and Desna's Path

/** The rotation that takes a direction in the sky's frame to east, north and up at the observer (rows: the frame's axes as seen from the ground). */
function groundBasis(snapshot) {
  return [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map((e) => { const p = snapshot.project(e), alt = p.altDeg * DEG, az = p.azDeg * DEG; return [Math.cos(alt) * Math.sin(az), Math.cos(alt) * Math.cos(az), Math.sin(alt)]; });
}

/**
 * The dome without its marks (RGBA): the gradient and the horizon's glow, and Desna's Path. Transparent outside
 * the dome, with a soft edge one pixel wide. `cx`, `cy` and `radius` are in this picture's own pixels.
 */
export function renderSkyBackground({ width, height, cx, cy, radius, rotationDeg = 0, snapshot, starfield, colors }) {
  const out = new Uint8ClampedArray(width * height * 4), s = snapshot, zenith = hex(colors.zenith), horizon = hex(colors.horizon);
  const darkness = clamp((s.limitingMagnitude + 1) / 6.6, 0, 1), glowColor = lerp(horizon, [255, 255, 255], 0.06);
  const galaxy = s.galacticBandVisible && starfield?.galaxy ? starfield.galaxy : null, R = galaxy ? groundBasis(s) : null;
  let side = null; if (galaxy) { const n = galaxy.northPole, c = galaxy.center, v = [n[1] * c[2] - n[2] * c[1], n[2] * c[0] - n[0] * c[2], n[0] * c[1] - n[1] * c[0]], l = Math.hypot(...v) || 1; side = v.map((x) => x / l); }
  const x0 = Math.max(0, Math.floor(cx - radius - 1)), x1 = Math.min(width - 1, Math.ceil(cx + radius + 1)), y0 = Math.max(0, Math.floor(cy - radius - 1)), y1 = Math.min(height - 1, Math.ceil(cy + radius + 1));
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, dist = Math.hypot(dx, dy), edge = clamp(radius + 0.5 - dist, 0, 1); if (edge <= 0) continue;
    const d = dist / radius;
    let c = lerp(lerp(zenith, horizon, d ** 2.2), glowColor, 0.16 * smooth(0.82, 1, d) ** 2);
    if (galaxy) {
      // The point's direction in the sky's frame, and from it its latitude and longitude on Desna's Path.
      const alt = (90 - d * 90) * DEG, a = Math.atan2(-dx, -dy), az = a - rotationDeg * DEG, h = [Math.cos(alt) * Math.sin(az), Math.cos(alt) * Math.cos(az), Math.sin(alt)];
      const dir = [R[0][0] * h[0] + R[0][1] * h[1] + R[0][2] * h[2], R[1][0] * h[0] + R[1][1] * h[1] + R[1][2] * h[2], R[2][0] * h[0] + R[2][1] * h[1] + R[2][2] * h[2]];
      const n = galaxy.northPole, cc = galaxy.center, b = Math.asin(clamp(dir[0] * n[0] + dir[1] * n[1] + dir[2] * n[2], -1, 1)) / DEG;
      const lon = Math.atan2(dir[0] * side[0] + dir[1] * side[1] + dir[2] * side[2], dir[0] * cc[0] + dir[1] * cc[1] + dir[2] * cc[2]), core = ((1 + Math.cos(lon)) / 2) ** 2;
      const hw = galaxy.bandHalfWidthDeg * (0.8 + 0.5 * core), band = Math.exp(-((b / hw) ** 2));
      if (band > 0.004) {
        const uneven = 0.6 + 0.8 * fbm(dir[0] * 5 + 11, dir[1] * 5, dir[2] * 5), lane = Math.exp(-(((b - galaxy.bandHalfWidthDeg * 0.22 * Math.sin(2 * lon + 1)) / (galaxy.bandHalfWidthDeg * 0.2)) ** 2)) * (0.35 + 0.65 * fbm(dir[0] * 9, dir[1] * 9 + 3, dir[2] * 9));
        const light = (0.07 + 0.26 * core) * band * uneven * (1 - 0.8 * lane) * darkness;
        c = lerp(c, lerp(SKY_PALETTE.band, SKY_PALETTE.bandCore, core * 0.5), clamp(light, 0, 0.6));
      }
    }
    // A whisper of noise below a step of the palette keeps the gradient from banding.
    const n = (hashUnit(y * 65536 + x) - 0.5) * 1.2, o = (y * width + x) * 4;
    out[o] = c[0] + n; out[o + 1] = c[1] + n; out[o + 2] = c[2] + n; out[o + 3] = Math.round(edge * 255);
  }
  return out;
}

/** The cloud's veil over the dome (RGBA, to lay over everything), or null when the cloud is too thin to show. */
export function renderSkyVeil({ width, height, cx, cy, radius, snapshot, cloud = 0 }) {
  const day = snapshot.sun.altDeg > -6, strength = Math.max(0, cloud - 0.1) ** 1.3 * (day ? 0.8 : 0.93); if (strength <= 0.02) return null;
  const out = new Uint8ClampedArray(width * height * 4), c = day ? SKY_PALETTE.veil.day : SKY_PALETTE.veil.night, scale = 3.2 / radius;
  for (let y = Math.max(0, Math.floor(cy - radius)); y <= Math.min(height - 1, Math.ceil(cy + radius)); y += 1) for (let x = Math.max(0, Math.floor(cx - radius)); x <= Math.min(width - 1, Math.ceil(cx + radius)); x += 1) {
    const dist = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); if (dist > radius + 0.5) continue;
    const a = clamp(strength * (0.72 + 0.56 * (fbm((x - cx) * scale, (y - cy) * scale, cloud * 3) - 0.5)) * clamp(radius + 0.5 - dist, 0, 1), 0, 1), o = (y * width + x) * 4;
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = Math.round(a * 255);
  }
  return out;
}

// ---------------------------------------------------------------- the marks on the dome

/**
 * Where everything is drawn, in a picture's own pixels: stars (with how each is drawn), wanderers, moons, the
 * Sun and the constellation figures' lines (each stopping short of its stars). Only what stands above the
 * horizon, inside the dome. `density` is device pixels per CSS pixel: it sizes the marks, never their places.
 */
export function skyMarks({ cx, cy, radius, rotationDeg = 0, snapshot, sky, lines = false, highlight = null, density = 1 }) {
  const s = snapshot, frame = { cx, cy, radius, rotationDeg }, inside = (p) => p && (p.x - cx) ** 2 + (p.y - cy) ** 2 <= radius * radius;
  const place = (alt, az) => skyPoint(alt, az, frame), named = new Set((sky?.namedStars ?? []).map((n) => n.star)), out = { stars: [], wanderers: [], moons: [], sun: null, lines: [] };
  const starAt = (id) => s.stars[Number(id.slice(5)) - 1], gap = 3.2 * density;
  for (const c of sky?.constellations ?? []) {
    const bright = c.id === highlight; if (!lines && !bright) continue;
    for (const [a, b] of c.lines) {
      const sa = starAt(a), sb = starAt(b), pa = place(sa.altDeg, sa.azDeg), pb = place(sb.altDeg, sb.azDeg); if (!inside(pa) || !inside(pb)) continue;
      const len = Math.hypot(pb.x - pa.x, pb.y - pa.y); if (len <= 2 * gap + 1) continue;
      const ux = (pb.x - pa.x) / len, uy = (pb.y - pa.y) / len;
      out.lines.push({ ax: pa.x + ux * gap, ay: pa.y + uy * gap, bx: pb.x - ux * gap, by: pb.y - uy * gap, bright, figure: c.id });
    }
  }
  for (const star of s.stars) {
    if (!star.visible) continue; const p = place(star.altDeg, star.azDeg); if (!inside(p)) continue;
    const id = `star-${String(star.index + 1).padStart(4, "0")}`;
    out.stars.push({ x: p.x, y: p.y, level: starLevel(star.magnitude, named.has(id)), tint: Math.floor(hashUnit(star.index) * 3), magnitude: star.magnitude });
  }
  out.stars.sort((a, b) => b.level - a.level); // faint first, the bright on top
  for (const planet of s.planets) { if (!planet.visible) continue; const p = place(planet.altDeg, planet.azDeg); if (inside(p)) out.wanderers.push({ x: p.x, y: p.y, name: planet.name, color: SKY_PALETTE.wanderers[planet.name] ?? SKY_PALETTE.starTints[0] }); }
  for (const moon of s.moons) {
    const p = place(moon.altDeg, moon.azDeg); if (!moon.visible || !inside(p)) continue;
    const t = s.project([0, 1, 2].map((i) => moon.dir[i] + 0.02 * moon.brightLimb[i])), toward = place(t.altDeg, t.azDeg) ?? p;
    out.moons.push({ x: p.x, y: p.y, r: moonRadius(moon, radius / density) * density, angle: Math.atan2(toward.y - p.y, toward.x - p.x), moon });
  }
  const sun = place(s.sun.altDeg, s.sun.azDeg);
  if (inside(sun)) {
    const R = SUN_PIXELS * 1.3 * density, perDeg = R / s.sun.radiusDeg, skyPerDeg = radius / 90, covers = [];
    for (const moon of s.moons) { if (!(moon.sunCoverage > 0)) continue; const m = place(moon.altDeg, moon.azDeg) ?? sun; covers.push({ x: sun.x + (m.x - sun.x) / skyPerDeg * perDeg, y: sun.y + (m.y - sun.y) / skyPerDeg * perDeg, r: moon.radiusDeg * perDeg, red: moon.name === "Red Moon" }); }
    out.sun = { x: sun.x, y: sun.y, R, total: s.sun.coverage > 0.98, covers };
  }
  return out;
}

// ---------------------------------------------------------------- the whole picture in software

/** Lay a sprite over a picture, its middle on the pixel (x, y). */
export function stampSprite(out, width, height, sprite, x, y) {
  const cx = Math.round(x - 0.5), cy = Math.round(y - 0.5), w = sprite.width, h = sprite.half;
  for (let sy = 0; sy < w; sy += 1) { const py = cy - h + sy; if (py < 0 || py >= height) continue;
    for (let sx = 0; sx < w; sx += 1) { const px = cx - h + sx; if (px < 0 || px >= width) continue;
      const i = (sy * w + sx) * 4, a = sprite.data[i + 3] / 255; if (!a) continue; const o = (py * width + px) * 4; if (!out[o + 3]) continue;
      out[o] += (sprite.data[i] - out[o]) * a; out[o + 1] += (sprite.data[i + 1] - out[o + 1]) * a; out[o + 2] += (sprite.data[i + 2] - out[o + 2]) * a; } }
}

/** A thin antialiased line over a picture (only inside the dome). */
function strokeSoft(out, width, height, l, color, alpha, thickness) {
  const half = thickness / 2, x0 = Math.max(0, Math.floor(Math.min(l.ax, l.bx) - 2)), x1 = Math.min(width - 1, Math.ceil(Math.max(l.ax, l.bx) + 2)), y0 = Math.max(0, Math.floor(Math.min(l.ay, l.by) - 2)), y1 = Math.min(height - 1, Math.ceil(Math.max(l.ay, l.by) + 2));
  const dx = l.bx - l.ax, dy = l.by - l.ay, len2 = dx * dx + dy * dy || 1;
  for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) {
    const px = x + 0.5, py = y + 0.5, t = clamp(((px - l.ax) * dx + (py - l.ay) * dy) / len2, 0, 1), d = Math.hypot(px - l.ax - t * dx, py - l.ay - t * dy), a = alpha * clamp(half + 0.5 - d, 0, 1);
    const o = (y * width + x) * 4; if (a <= 0 || !out[o + 3]) continue;
    out[o] += (color[0] - out[o]) * a; out[o + 1] += (color[1] - out[o + 1]) * a; out[o + 2] += (color[2] - out[o + 2]) * a;
  }
}

/** How strongly the figures' lines are drawn: muted gilt, clearly dimmer than any bright star; a chosen figure bright. */
export const LINE_LOOK = Object.freeze({ muted: 0.48, bright: 0.95, width: 1, brightWidth: 1.4 });

/**
 * The whole sky as one picture (RGBA, transparent outside the dome). `cx`, `cy` and `radius` place the dome in
 * the picture's pixels; `density` is its pixels per CSS pixel (it sizes the marks). `colors` are the zenith and
 * horizon colours; `lines` draws every constellation figure, `highlight` (a figure's id) draws that one brightly
 * whether or not the rest are shown; `cloud` (0..1) veils the sky. `scale` (how much closer than the whole sky
 * the view is) spreads the stars and changes nothing else.
 */
export function renderSkyPixels({ width, height, cx, cy, radius, rotationDeg = 0, snapshot, sky, starfield, colors, lines = false, highlight = null, cloud = 0, density = 1 }) {
  const out = renderSkyBackground({ width, height, cx, cy, radius, rotationDeg, snapshot, starfield, colors });
  const marks = skyMarks({ cx, cy, radius, rotationDeg, snapshot, sky, lines, highlight, density }), darkness = clamp((snapshot.limitingMagnitude + 1) / 6.6, 0, 1), sprites = new Map();
  for (const l of marks.lines) strokeSoft(out, width, height, l, l.bright ? SKY_PALETTE.lineBright : SKY_PALETTE.line, l.bright ? LINE_LOOK.bright : LINE_LOOK.muted * (0.5 + 0.5 * darkness), (l.bright ? LINE_LOOK.brightWidth : LINE_LOOK.width) * density);
  const sprite = (key, make) => { if (!sprites.has(key)) sprites.set(key, make()); return sprites.get(key); };
  for (const st of marks.stars) {
    stampSprite(out, width, height, sprite(`s${st.level}|${st.tint}`, () => starSprite(st.level, st.tint, density)), st.x, st.y);
  }
  for (const w of marks.wanderers) stampSprite(out, width, height, sprite(`w${w.name}`, () => wandererSprite(w.color, density)), w.x, w.y);
  for (const m of marks.moons) stampSprite(out, width, height, moonSprite(m.moon, m.r, m.angle, darkness), m.x, m.y);
  if (marks.sun) {
    const sun = marks.sun; stampSprite(out, width, height, sunSprite(sun.R, sun.total), sun.x, sun.y);
    for (const c of sun.covers) for (let y = Math.floor(c.y - c.r - 1); y <= c.y + c.r + 1; y += 1) for (let x = Math.floor(c.x - c.r - 1); x <= c.x + c.r + 1; x += 1) {
      if (x < 0 || y < 0 || x >= width || y >= height) continue; const a = clamp(c.r + 0.5 - Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y), 0, 1), o = (y * width + x) * 4; if (!a || !out[o + 3]) continue;
      const col = c.red ? [31, 15, 12] : [13, 15, 20]; out[o] += (col[0] - out[o]) * a; out[o + 1] += (col[1] - out[o + 1]) * a; out[o + 2] += (col[2] - out[o + 2]) * a;
    }
  }
  const veil = renderSkyVeil({ width, height, cx, cy, radius, snapshot, cloud });
  if (veil) for (let o = 0; o < out.length; o += 4) { const a = veil[o + 3] / 255; if (!a) continue; out[o] += (veil[o] - out[o]) * a; out[o + 1] += (veil[o + 1] - out[o + 1]) * a; out[o + 2] += (veil[o + 2] - out[o + 2]) * a; }
  return out;
}
