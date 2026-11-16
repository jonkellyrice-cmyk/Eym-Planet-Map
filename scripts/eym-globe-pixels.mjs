// Eym's globe as pixel art (Tier 2: traditional pixel art), drawn by rule from the same cartography the
// vector map uses and from the weather simulation, so the same world, moment and view always give the
// same pixels. A surface raster (land from the coastlines, biome, relief, depth of sea) is made once;
// each frame samples it through the globe's projection and colours every pixel from a small palette:
// sea in bands by depth, land by biome with a dark coast, mountains and snow, sea ice, day and night,
// and over it the weather — cloud in clumps with lit and shaded edges, rain under the heavy cloud,
// highs clear, lows as commas, and tropical cyclones as spirals about an eye. Pure: no canvas here.

const DEG = Math.PI / 180;
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const ramp = (...tones) => tones.map(hex);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------- the palette
export const GLOBE_PALETTE = Object.freeze({
  sea: ramp("#17386a", "#1d4a80", "#24609a", "#3a86b8", "#62b0cc"),
  warmSea: ramp("#15426e", "#1b578a", "#2378a6", "#3aa2bc", "#78d0d0"),
  water: hex("#4a9ccc"),
  land: {
    "tropical-rainforest": ramp("#1f5a2c", "#2c7436", "#3c8c40", "#58a64c"),
    "seasonal-forest": ramp("#3a6a2e", "#4e8436", "#689a44", "#86b058"),
    "temperate-forest": ramp("#2e5e34", "#3e7a3e", "#56924a", "#74aa5c"),
    "temperate-rainforest": ramp("#235446", "#2f6e52", "#44865e", "#62a070"),
    taiga: ramp("#2c4a3c", "#3a6048", "#4c7656", "#648c68"),
    savanna: ramp("#8a7a3a", "#a6943f", "#bfae52", "#d4c670"),
    steppe: ramp("#8c8450", "#a39a5e", "#b9b174", "#cfc88e"),
    tundra: ramp("#6e7462", "#868c78", "#9ea48e", "#b8bca8"),
    "hot-desert": ramp("#b08a4e", "#c8a260", "#dcba78", "#ecd296"),
    "cold-desert": ramp("#9a8a6a", "#b2a27e", "#c8ba96", "#dcd0b0"),
    "ice-cap": ramp("#a8bcd0", "#c6d6e4", "#e2ecf4", "#ffffff"),
  },
  upland: ramp("#6a6440", "#847c50", "#9c9462", "#b4ac7a"),
  rock: ramp("#54483e", "#74665a", "#968676", "#b8aa98"),
  peak: ramp("#7c7c88", "#aeb0bc", "#dde1ea", "#ffffff"),
  snow: ramp("#9fb2c8", "#c4d2e2", "#e6eef6", "#ffffff"),
  ice: ramp("#9cc0d8", "#c2dcea", "#e2f0f6", "#f6fbff"),
  coast: hex("#1c2a1e"),
  cloud: { lit: hex("#ffffff"), body: hex("#e8eef4"), shade: hex("#b0bfd2"), rain: hex("#8e9cb2"), streak: hex("#5c7aa8"), flash: hex("#ffec78"), snow: hex("#ffffff") },
  night: hex("#080c1e"),
  rim: hex("#8fd0e8"),
});
const BIOMES = Object.keys(GLOBE_PALETTE.land);
const LAND_RAMPS = BIOMES.map((b) => GLOBE_PALETTE.land[b]);

// ---------------------------------------------------------------- noise and dither
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
function h3(x, y, z, s) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177) + Math.imul(s, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519); h ^= h >>> 13; h = Math.imul(h, 3266489917); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
/** Smooth value noise in three dimensions (0..1): sampled on the sphere, it has no seam and no pole. */
export function noise3(x, y, z, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z), fx = x - x0, fy = y - y0, fz = z - z0;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const a = h3(x0, y0, z0, s), b = h3(x0 + 1, y0, z0, s), c = h3(x0, y0 + 1, z0, s), d = h3(x0 + 1, y0 + 1, z0, s);
  const e = h3(x0, y0, z0 + 1, s), f = h3(x0 + 1, y0, z0 + 1, s), g = h3(x0, y0 + 1, z0 + 1, s), i = h3(x0 + 1, y0 + 1, z0 + 1, s);
  const lo = a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v, hi = e + (f - e) * u + (g - e) * v + (e - f - g + i) * u * v;
  return lo + (hi - lo) * w;
}

// ---------------------------------------------------------------- rings into a raster
/**
 * Fill [lat, lon] rings into an equirectangular mask (north at the top, −180° at the left). Rings may
 * cross the date line; a ring that goes right round a pole is closed over that pole.
 */
export function fillRings(mask, W, H, rings, value) {
  for (const ring of rings) {
    if (!ring || ring.length < 3) continue;
    const xs = new Float64Array(ring.length), ys = new Float64Array(ring.length); let latSum = 0;
    for (let i = 0; i < ring.length; i += 1) {
      let x = (ring[i][1] + 180) / 360 * W;
      if (i) { while (x - xs[i - 1] > W / 2) x -= W; while (x - xs[i - 1] < -W / 2) x += W; }
      xs[i] = x; ys[i] = (90 - ring[i][0]) / 180 * H; latSum += ring[i][0];
    }
    const px = Array.from(xs), py = Array.from(ys), n0 = px.length, first = px[0], last = px[n0 - 1];
    if (Math.abs(last - first) > W / 2) { const pole = latSum > 0 ? 0 : H; px.push(last, first); py.push(pole, pole); }
    const n = px.length; let top = Infinity, bottom = -Infinity;
    for (let i = 0; i < n; i += 1) { if (py[i] < top) top = py[i]; if (py[i] > bottom) bottom = py[i]; }
    const r0 = Math.max(0, Math.floor(top)), r1 = Math.min(H - 1, Math.ceil(bottom)), cuts = [];
    for (let r = r0; r <= r1; r += 1) {
      const yc = r + 0.5; cuts.length = 0;
      for (let i = 0; i < n; i += 1) {
        const j = (i + 1) % n, ya = py[i], yb = py[j];
        if ((ya <= yc && yb > yc) || (yb <= yc && ya > yc)) cuts.push(px[i] + (yc - ya) / (yb - ya) * (px[j] - px[i]));
      }
      cuts.sort((a, b) => a - b);
      for (let k = 0; k + 1 < cuts.length; k += 2) {
        const from = Math.ceil(cuts[k] - 0.5), to = Math.floor(cuts[k + 1] - 0.5);
        for (let x = from; x <= to; x += 1) mask[r * W + (((x % W) + W) % W)] = value;
      }
    }
  }
  return mask;
}

/** A coarse mask (half a degree) of a cover given as rings: the season's snow, or its sea ice. */
export function coverMask(rings, W = 720, H = 360) { return { W, H, data: fillRings(new Uint8Array(W * H), W, H, rings ?? [], 1) }; }

const decodeBytes = (value) => (typeof Buffer !== "undefined" ? Uint8Array.from(Buffer.from(value, "base64")) : Uint8Array.from(atob(value), (c) => c.charCodeAt(0)));
export const LAKE = 250, STATIC_ICE = 251;
/** The pixel globe is shown up to this zoom; closer in, the surveyed (vector) map takes over. */
export const PIXEL_GLOBE_MAX_ZOOM = 6;

/**
 * The surface raster of a world with vector coastlines, made once: for each quarter-degree square its
 * class (0 sea, biome + 1 on land, LAKE, STATIC_ICE for the polar sea), its relief (0 none, 1 upland,
 * 2 mountains, 3 peaks; +4 where wooded) and, at sea, how many squares off the land it lies (up to 12).
 */
export function buildSurfaceRaster(asset, { perDegree = 4 } = {}) {
  const W = 360 * perDegree, H = 180 * perDegree, cls = new Uint8Array(W * H), relief = new Uint8Array(W * H), shore = new Uint8Array(W * H).fill(255);
  const land = fillRings(new Uint8Array(W * H), W, H, asset.terrain.coastlines.map((c) => c.points), 1);
  const { latCount, lonCount } = asset.grid, res = asset.resolutionDeg, cats = asset.raster.biome.categories, values = decodeBytes(asset.raster.biome.valuesBase64);
  const landBiome = (lat, lon) => {
    const r = clamp(Math.floor((lat + 90) / res), 0, latCount - 1), c = ((Math.floor((lon + 180) / res) % lonCount) + lonCount) % lonCount;
    for (let reach = 0; reach <= 4; reach += 1) for (let dr = -reach; dr <= reach; dr += 1) for (let dc = -reach; dc <= reach; dc += 1) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) !== reach) continue;
      const rr = r + dr; if (rr < 0 || rr >= latCount) continue;
      const k = BIOMES.indexOf(cats[values[rr * lonCount + ((c + dc + lonCount) % lonCount)]]); if (k >= 0) return k;
    }
    return BIOMES.indexOf(Math.abs(lat) > 62 ? "tundra" : Math.abs(lat) > 30 ? "temperate-forest" : "seasonal-forest");
  };
  for (let y = 0; y < H; y += 1) {
    const lat = 90 - (y + 0.5) / perDegree;
    for (let x = 0; x < W; x += 1) {
      const i = y * W + x, lon = -180 + (x + 0.5) / perDegree;
      if (land[i]) {
        // Biome borders are bent by noise so the one-degree source grid does not show as squares.
        const cl = Math.cos(lat * DEG), sx = cl * Math.sin(lon * DEG), sy = Math.sin(lat * DEG), sz = cl * Math.cos(lon * DEG);
        const bend = res * 1.1; cls[i] = landBiome(lat + (noise3(sx * 40, sy * 40, sz * 40, 71) - 0.5) * bend, lon + (noise3(sx * 40, sy * 40, sz * 40, 72) - 0.5) * bend / Math.max(0.3, cl)) + 1;
      } else if (cats[values[clamp(Math.floor((lat + 90) / res), 0, latCount - 1) * lonCount + (((Math.floor((lon + 180) / res)) % lonCount) + lonCount) % lonCount]] === "sea-ice") cls[i] = STATIC_ICE;
    }
  }
  const detail = asset.terrain.detail ?? [], level = { upland: 1, mountains: 2, peaks: 3 };
  for (const kind of ["upland", "mountains", "peaks"]) fillRings(relief, W, H, detail.filter((d) => d.kind === kind).flatMap((d) => d.rings), level[kind]);
  const wood = fillRings(new Uint8Array(W * H), W, H, detail.filter((d) => d.kind === "forest").flatMap((d) => d.rings), 1);
  const lakes = fillRings(new Uint8Array(W * H), W, H, (asset.hydrology?.lakes ?? []).map((l) => l.polygon), 1);
  const ice = fillRings(new Uint8Array(W * H), W, H, (asset.hydrology?.glaciers ?? []).map((g) => g.polygon), 1);
  for (let i = 0; i < W * H; i += 1) {
    if (!land[i]) { relief[i] = 0; continue; }
    if (lakes[i]) { cls[i] = LAKE; relief[i] = 0; continue; }
    if (ice[i]) cls[i] = BIOMES.indexOf("ice-cap") + 1;
    if (wood[i] && relief[i] < 2) relief[i] += 4;
  }
  // How far off the land each square of sea lies (in squares, up to 12): the sea is banded by it.
  let frontier = []; for (let i = 0; i < W * H; i += 1) if (land[i]) { shore[i] = 0; frontier.push(i); }
  for (let d = 1; d <= 12 && frontier.length; d += 1) {
    const next = [];
    for (const i of frontier) {
      const y = Math.floor(i / W), x = i % W;
      // Straight neighbours on odd steps, diagonal ones too on even steps: the bands come out rounded, not as diamonds.
      const e = (x + 1) % W, w = (x + W - 1) % W, up = y > 0 ? y - 1 : -1, dn = y < H - 1 ? y + 1 : -1;
      const near = [up >= 0 ? up * W + x : -1, dn >= 0 ? dn * W + x : -1, y * W + e, y * W + w];
      if (d % 2 === 0) near.push(up >= 0 ? up * W + e : -1, up >= 0 ? up * W + w : -1, dn >= 0 ? dn * W + e : -1, dn >= 0 ? dn * W + w : -1);
      for (const j of near) if (j >= 0 && shore[j] === 255) { shore[j] = d; next.push(j); }
    }
    frontier = next;
  }
  return { W, H, perDegree, cls, relief, shore, biomes: BIOMES };
}

// ---------------------------------------------------------------- the weather, ready for drawing
/** The globe's weather (from globeWeather) as grids the renderer can sample, with its storms. */
export function weatherGrid(globe) {
  if (!globe?.cells?.length) return null;
  const rows = 30, cols = 60, cloud = new Float32Array(rows * cols), rain = new Float32Array(rows * cols), kind = new Uint8Array(rows * cols);
  for (const c of globe.cells) {
    const r = Math.round((c.lat + 87) / 6), k = Math.round((c.lon + 177) / 6); if (r < 0 || r >= rows || k < 0 || k >= cols) continue;
    cloud[r * cols + k] = c.cloud; rain[r * cols + k] = c.precipKind ? Math.min(1, c.precipMmH / 3) : 0; kind[r * cols + k] = c.thunder ? 3 : c.precipKind === "snow" ? 2 : c.precipKind ? 1 : 0;
  }
  const reach = { hurricane: 7.5, "tropical storm": 6, "tropical depression": 4.5 };
  const storms = [
    ...(globe.cyclones ?? []).map((c) => ({ kind: "cyclone", lat: c.lat, lon: c.lon, radiusDeg: reach[c.kind] ?? 5, eye: c.kind === "hurricane" })),
    ...(globe.centres ?? []).map((c) => ({ kind: c.kind, lat: c.lat, lon: c.lon, radiusDeg: c.kind === "low" ? 10 : 9, eye: false })),
  ].map((s) => { const cl = Math.cos(s.lat * DEG); return { ...s, v: [cl * Math.sin(s.lon * DEG), Math.sin(s.lat * DEG), cl * Math.cos(s.lon * DEG)], cosReach: Math.cos(s.radiusDeg * DEG) }; });
  return { rows, cols, cloud, rain, kind, storms };
}
function sampleGrid(grid, w, lat, lon) {
  const fr = clamp((lat + 87) / 6, 0, w.rows - 1), fc = (lon + 177) / 6, r0 = Math.floor(fr), r1 = Math.min(w.rows - 1, r0 + 1), c0 = Math.floor(fc), tr = fr - r0, tc = fc - c0;
  const ca = ((c0 % w.cols) + w.cols) % w.cols, cb = (ca + 1) % w.cols;
  const top = grid[r0 * w.cols + ca] + (grid[r0 * w.cols + cb] - grid[r0 * w.cols + ca]) * tc, bot = grid[r1 * w.cols + ca] + (grid[r1 * w.cols + cb] - grid[r1 * w.cols + ca]) * tc;
  return top + (bot - top) * tr;
}
export const CLOUD_AT = 0.7, THICK_AT = 1.0;
/**
 * How much cloud stands over a point (cloud at CLOUD_AT and above, heavy at THICK_AT): the simulated
 * cover broken into clumps, cleared under a high, wound into a comma about a low and into spiral bands
 * about a tropical cyclone, whose eye (if it has one) is clear. `b` is the point as a unit vector.
 */
export function cloudDensity(w, lat, lon, b, eyeDeg = 0.7) {
  const n = noise3(b[0] * 11, b[1] * 11, b[2] * 11, 5) * 0.6 + noise3(b[0] * 27, b[1] * 27, b[2] * 27, 6) * 0.4;
  let d = sampleGrid(w.cloud, w, lat, lon) + (n - 0.5) * 0.8;
  for (const s of w.storms) {
    const dot = b[0] * s.v[0] + b[1] * s.v[1] + b[2] * s.v[2]; if (dot < s.cosReach) continue;
    const deg = Math.acos(Math.min(1, dot)) / DEG, r = deg / s.radiusDeg, spin = s.lat >= 0 ? 1 : -1;
    // Bearing of the point from the storm's centre (east of north).
    const theta = Math.atan2(Math.sin((lon - s.lon) * DEG) * Math.cos(lat * DEG), Math.cos(s.lat * DEG) * Math.sin(lat * DEG) - Math.sin(s.lat * DEG) * Math.cos(lat * DEG) * Math.cos((lon - s.lon) * DEG));
    if (s.kind === "high") { d -= 0.5 * (1 - r); continue; }
    if (s.kind === "low") {
      const arm = Math.cos(theta * spin + 2.6 * Math.log(r + 0.08) + 1.2);
      d += (arm > 0.45 ? 0.55 : -0.15) * (1 - r) + (r < 0.22 ? 0.5 : 0); continue;
    }
    if (s.eye && deg < eyeDeg) return 0;
    const arms = 0.5 + 0.5 * Math.cos(2 * (theta * spin + 3.1 * Math.log(r + 0.05)));
    const storm = r < 0.24 ? 1.35 : 1.5 * Math.pow(1 - r, 0.55) * (0.3 + 0.7 * arms) + (n - 0.5) * 0.25;
    d = Math.max(storm, d * r * r);
  }
  return d;
}

// ---------------------------------------------------------------- one frame
const tone = (v, n, x, y) => clamp(Math.floor(v * (n - 1) + bayer(x, y)), 0, n - 1);

/**
 * The globe as pixels. `width`×`height` art pixels, the globe centred at (cx, cy) with `radius` (all in
 * art pixels), turned by `yaw` and `pitch` as the vector map is. Optional: `sun` (the direction of the
 * Sun in view space: x right, y down, z towards the viewer) for day and night; `snow` and `ice` (cover
 * masks) for the season; `weather` (a weatherGrid); `rivers` ([lat, lon] lines, drawn once the globe is
 * large enough). Returns RGBA, transparent off the globe.
 */
export function renderGlobe({ raster, width, height, cx, cy, radius, yaw = 0, pitch = 0, sun = null, snow = null, ice = null, weather = null, rivers = null }) {
  const P = GLOBE_PALETTE, n = width * height, out = new Uint8ClampedArray(n * 4);
  const kind = new Uint8Array(n), klass = new Uint8Array(n), rel = new Uint8Array(n), off = new Uint8Array(n), white = new Uint8Array(n);
  const lit = new Float32Array(n), depth = new Float32Array(n), tex = new Float32Array(n), cloud = weather ? new Float32Array(n) : null, wet = weather ? new Uint8Array(n) : null;
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cyw = Math.cos(yaw), syw = Math.sin(yaw), { W, H, perDegree } = raster;
  const eyeDeg = Math.max(0.7, 1.3 * (180 / Math.PI) / radius), b = [0, 0, 0];
  const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(width - 1, Math.ceil(cx + radius)), y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(height - 1, Math.ceil(cy + radius));
  // Pass 1: what lies under each pixel.
  for (let py = y0; py <= y1; py += 1) for (let px = x0; px <= x1; px += 1) {
    const nx = (px + 0.5 - cx) / radius, ny = (py + 0.5 - cy) / radius, d2 = nx * nx + ny * ny; if (d2 > 1) continue;
    const nz = Math.sqrt(1 - d2), yv = -ny, by = yv * cp + nz * sp, zr = -yv * sp + nz * cp, bx = nx * cyw - zr * syw, bz = nx * syw + zr * cyw;
    const lat = Math.asin(clamp(by, -1, 1)) / DEG, lon = Math.atan2(bx, bz) / DEG, i = py * width + px;
    const ry = clamp(Math.floor((90 - lat) * perDegree), 0, H - 1), rx = ((Math.floor((lon + 180) * perDegree) % W) + W) % W, ri = ry * W + rx, c = raster.cls[ri];
    kind[i] = c === 0 || c === STATIC_ICE ? 1 : c === LAKE ? 3 : 2; klass[i] = c; rel[i] = raster.relief[ri]; off[i] = raster.shore[ri]; depth[i] = nz;
    lit[i] = sun ? nx * sun.x + ny * sun.y + nz * sun.z : 1;
    tex[i] = noise3(bx * 34, by * 34, bz * 34, 3) * 0.6 + noise3(bx * 90, by * 90, bz * 90, 4) * 0.4;
    const cover = kind[i] === 1 ? ice : kind[i] === 2 ? snow : null;
    if (cover) { const my = clamp(Math.floor((90 - lat) / 180 * cover.H), 0, cover.H - 1), mx = ((Math.floor((lon + 180) / 360 * cover.W) % cover.W) + cover.W) % cover.W; white[i] = cover.data[my * cover.W + mx]; }
    else if (kind[i] === 1 && !ice && c === STATIC_ICE) white[i] = 1;
    if (kind[i] === 1 && Math.abs(lat) < 20 + bayer(px, py) * 8) kind[i] = 4; // warm sea, its edge dithered
    if (weather) { b[0] = bx; b[1] = by; b[2] = bz; cloud[i] = cloudDensity(weather, lat, lon, b, eyeDeg); if (cloud[i] >= CLOUD_AT && sampleGrid(weather.rain, weather, lat, lon) + (tex[i] - 0.5) * 0.7 > 0.38) wet[i] = weather.kind[clamp(Math.round((lat + 87) / 6), 0, weather.rows - 1) * weather.cols + (((Math.round((lon + 177) / 6)) % weather.cols) + weather.cols) % weather.cols] || 1; }
  }
  // Rivers, once the globe is large enough for them to read as lines.
  if (rivers && radius >= 150) for (const line of rivers) {
    let prev = null;
    for (const [lat, lon] of line) {
      const la = lat * DEG, lo = lon * DEG + yaw, x = Math.cos(la) * Math.sin(lo), ys = Math.sin(la), zs = Math.cos(la) * Math.cos(lo), z = ys * sp + zs * cp;
      const cur = z > 0.05 ? [cx + x * radius, cy - (ys * cp - zs * sp) * radius] : null;
      if (prev && cur) { const steps = Math.max(1, Math.ceil(Math.max(Math.abs(cur[0] - prev[0]), Math.abs(cur[1] - prev[1])))); for (let k = 0; k <= steps; k += 1) { const qx = Math.floor(prev[0] + (cur[0] - prev[0]) * k / steps), qy = Math.floor(prev[1] + (cur[1] - prev[1]) * k / steps); if (qx >= 0 && qy >= 0 && qx < width && qy < height && kind[qy * width + qx] === 2) kind[qy * width + qx] = 3; } }
      prev = cur;
    }
  }
  // Pass 2: colour.
  const at = (x, y) => (x < 0 || y < 0 || x >= width || y >= height ? 0 : kind[y * width + x]);
  const cl = (x, y) => (cloud && x >= 0 && y >= 0 && x < width && y < height && kind[y * width + x] ? cloud[y * width + x] : 0);
  const isSea = (k) => k === 1 || k === 4;
  for (let py = y0; py <= y1; py += 1) for (let px = x0; px <= x1; px += 1) {
    const i = py * width + px, k = kind[i]; if (!k) continue;
    let c;
    // The limb darkens a step; texture is tied to the ground, the dither to the screen.
    const limb = depth[i] < 0.34 ? (0.34 - depth[i]) * 1.1 : 0, t = tex[i];
    if (isSea(k)) {
      if (white[i]) c = P.ice[tone(clamp(0.45 + (t - 0.5) * 1.1 - limb, 0, 1), 4, px, py)];
      else { const set = k === 4 ? P.warmSea : P.sea, d = off[i], base = d <= 1 ? 1 : d <= 3 ? 0.75 : d <= 7 ? 0.5 : d <= 12 ? 0.25 : 0.02; c = set[tone(clamp(base + (t - 0.5) * 0.1 - limb, 0, 1), 5, px, py)]; }
    } else if (k === 3) c = P.water;
    else {
      const r = rel[i] & 3, wooded = rel[i] & 4, shoreline = isSea(at(px + 1, py)) || isSea(at(px - 1, py)) || isSea(at(px, py + 1)) || isSea(at(px, py - 1));
      let set = white[i] ? P.snow : r === 3 ? P.peak : r === 2 ? P.rock : r === 1 ? P.upland : LAND_RAMPS[Math.max(0, klass[i] - 1)] ?? LAND_RAMPS[1];
      if (white[i] && r >= 2) set = P.peak;
      // Mountains are lit from the upper left: the texture's slope stands in for the ground's.
      const v = r >= 2 ? clamp(0.5 + (t - 0.5) * 2.4, 0, 1) : clamp(0.55 + (t - 0.5) * 0.9 - (wooded ? 0.28 : 0), 0, 1);
      c = shoreline && !white[i] ? P.coast : set[tone(clamp(v - limb, 0, 1), 4, px, py)];
    }
    let r = c[0], g = c[1], bl = c[2];
    if (cloud) {
      const d = cloud[i], thin = d >= CLOUD_AT && d < CLOUD_AT + 0.12;
      if (d >= CLOUD_AT && (!thin || ((px + py) & 1) === 0)) {
        const C = P.cloud, lightSide = cl(px - 1, py - 1) < CLOUD_AT, darkSide = cl(px + 1, py + 1) < CLOUD_AT;
        let cc = lightSide ? C.lit : darkSide ? C.shade : d >= THICK_AT ? C.lit : C.body;
        if (wet[i] && !lightSide) { cc = darkSide ? C.rain : C.shade; if (wet[i] === 2) { if (((px * 3 + py * 5) & 7) === 0) cc = C.snow; } else if (((px + 2 * py) & 3) === 0) cc = C.streak; if (wet[i] === 3 && h3(px, py, 0, 9) < 0.05) cc = C.flash; }
        r = cc[0]; g = cc[1]; bl = cc[2];
      } else if (cl(px - 1, py - 1) >= CLOUD_AT + 0.12) { r *= 0.72; g *= 0.74; bl *= 0.8; } // the cloud's shadow on the ground
    }
    // Day, twilight (dithered) and night.
    if (sun) { const s = lit[i], dark = s < -0.1 ? 1 : s > 0.1 ? 0 : bayer(px, py) < (0.1 - s) / 0.2 ? 1 : 0; if (dark) { r = r * 0.3 + P.night[0] * 0.7; g = g * 0.3 + P.night[1] * 0.7; bl = bl * 0.34 + P.night[2] * 0.66; } }
    // A rim of air, one pixel wide.
    if (depth[i] < Math.sqrt(2 / radius) * 0.75 && (!sun || lit[i] > -0.05)) { r = (r + P.rim[0]) / 2; g = (g + P.rim[1]) / 2; bl = (bl + P.rim[2]) / 2; }
    const o = i * 4; out[o] = r; out[o + 1] = g; out[o + 2] = bl; out[o + 3] = 255;
  }
  return out;
}
