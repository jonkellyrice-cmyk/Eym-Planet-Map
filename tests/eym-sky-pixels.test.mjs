import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSystemModel, parseCsv } from "../scripts/system-data.mjs";
import { groundSky } from "../scripts/ground-sky.mjs";
import { SKY_MAX_ZOOM, clampSkyView, skyColors, zoomSkyAbout } from "../scripts/sky-view.mjs";
import { LINE_LOOK, SKY_PALETTE, moonRadius, renderSkyBackground, renderSkyPixels, skyMarks, skyPoint, starLevel, starSprite } from "../scripts/eym-sky-pixels.mjs";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), json = (path) => JSON.parse(source(path));
const rows = parseCsv(source("docs/system-orbital-distances.csv")), orientations = json("data/astronomy/epoch-orientations.json").orientations, sky = json("data/stellar/constellations.json"), starfield = json("data/stellar/starfield.json");
const snapshotAt = (t) => groundSky({ model: buildSystemModel(rows, "Mitkear", { referenceTimestampMs: t, orientations }), sky, starfield, latDeg: 11.4, lonDeg: 64.6 });
const HOUR = 3600000, find = (want) => { for (let h = 0; h < 60; h += 0.5) { const s = snapshotAt(h * HOUR); if (want(s)) return s; } throw new Error("no such sky in sixty hours"); };
const night = find((s) => s.sun.altDeg < -25), day = find((s) => s.sun.altDeg > 30);
const W = 240, H = 200, frame = { cx: 120, cy: 100, radius: 90 };
const paint = (snapshot, extra = {}) => renderSkyPixels({ width: W, height: H, ...frame, snapshot, sky, starfield, colors: skyColors(snapshot.sun.altDeg, snapshot.sun.coverage), ...extra });
const count = (px, test) => { let n = 0; for (let o = 0; o < px.length; o += 4) if (test(px[o], px[o + 1], px[o + 2], px[o + 3])) n += 1; return n; };
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

test("the sky is a dome of pixels: nothing outside it, the same picture every time", () => {
  const px = paint(night);
  assert.equal(px.length, W * H * 4);
  assert.equal(px[3], 0, "the corner is outside the dome");
  assert.equal(px[(100 * W + 120) * 4 + 3], 255, "the zenith is inside it");
  const inside = count(px, (r, g, b, a) => a === 255), disc = Math.PI * 90 * 90;
  assert.ok(Math.abs(inside - disc) / disc < 0.02, `dome area ${inside}`);
  assert.ok(same(px, paint(night)), "drawn by rule: twice the same");
});

test("night shows stars and day does not; day is bright and night is dark", () => {
  const dark = paint(night), bright = paint(day), lum = (px) => { let s = 0; for (let o = 0; o < px.length; o += 4) s += px[o] + px[o + 1] + px[o + 2]; return s; };
  assert.ok(lum(bright) > lum(dark) * 4);
  const white = (px) => count(px, (r, g, b) => r > 235 && g > 235 && b > 235);
  assert.ok(white(dark) >= 10 && white(bright) < white(dark) * 20, `bright stars at night: ${white(dark)}`);
  assert.ok(count(paint(night, { cloud: 1 }), (r, g, b) => r > 235 && g > 235 && b > 235) < white(dark));
  assert.ok(night.stars.filter((s) => s.visible && s.altDeg > 0).length > 200);
});

test("looking closer spreads the same stars apart; it does not add any", () => {
  const wide = paint(night), close = paint(night, { radius: 270, scale: 3 });
  const lit = (px) => count(px, (r, g, b, a) => a === 255 && r + g + b > 330);
  assert.ok(lit(close) < lit(wide) * 3, "no flood of new stars");
  const up = night.stars.find((s) => s.visible && s.altDeg > 40), a = skyPoint(up.altDeg, up.azDeg, frame), b = skyPoint(up.altDeg, up.azDeg, { ...frame, radius: 270 });
  assert.ok(Math.abs((b.x - 120) - 3 * (a.x - 120)) < 1e-9 && Math.abs((b.y - 100) - 3 * (a.y - 100)) < 1e-9, "the same star, three times further from the zenith");
  assert.equal(skyPoint(-1, 0, frame), null, "nothing is drawn from below the horizon");
});

test("constellation figures are drawn only when asked for, and a chosen one in bright gilt", () => {
  const plain = paint(night), lined = paint(night, { lines: true });
  assert.ok(!same(plain, lined));
  const up = sky.constellations.find((c) => c.lines.every(([a, b]) => [a, b].every((id) => night.stars[Number(id.slice(5)) - 1].altDeg > 10)));
  assert.ok(up, "a constellation wholly above the horizon");
  const chosen = paint(night, { highlight: up.id }), [r, g, b] = SKY_PALETTE.lineBright;
  const gilt = (px) => count(px, (pr, pg, pb) => Math.abs(pr - r) < 30 && Math.abs(pg - g) < 30 && Math.abs(pb - b) < 30);
  assert.ok(gilt(chosen) > gilt(plain) + 5, "the chosen figure stands out");
});

test("cloud veils the sky, and a moon is never too small to show its phase", () => {
  const clear = paint(night), veiled = paint(night, { cloud: 0.9 });
  const white = (px) => count(px, (r, g, b) => r > 235 && g > 235 && b > 235);
  assert.ok(white(veiled) < white(clear) / 2);
  assert.ok(same(clear, paint(night, { cloud: 0.05 })), "thin cloud leaves it clear");
  assert.equal(moonRadius({ radiusDeg: 0.01 }, 126), 4);
  assert.ok(moonRadius({ radiusDeg: 0.26 }, 126 * 4) > 4);
});

test("the view can be looked at closer and moved about, within bounds", () => {
  const state = { rotationDeg: 0, zoom: 1, panX: 40, panY: -30 };
  clampSkyView(state); assert.equal(Math.hypot(state.panX, state.panY), 0, "the whole sky cannot be dragged aside");
  // Looking closer keeps the point under the finger where it is.
  const s = { rotationDeg: 0, zoom: 1, panX: 0, panY: 0 }, at = (st, x, y) => [(x - 450 - st.panX) / st.zoom, (y - 340 - st.panY) / st.zoom], before = at(s, 500, 300);
  zoomSkyAbout(s, 2, 500, 300); const after = at(s, 500, 300);
  assert.equal(s.zoom, 2); assert.ok(Math.abs(after[0] - before[0]) < 1e-9 && Math.abs(after[1] - before[1]) < 1e-9);
  zoomSkyAbout(s, 100); assert.equal(s.zoom, SKY_MAX_ZOOM);
  s.panX = 99999; clampSkyView(s); assert.ok(Math.hypot(s.panX, s.panY) <= 315 * (SKY_MAX_ZOOM - 1) + 1e-6);
  zoomSkyAbout(s, 0.0001); assert.equal(s.zoom, 1); assert.equal(Math.hypot(s.panX, s.panY), 0, "all the way out is the whole sky again");
});

test("the sky view is the pixel chart with names on request only", () => {
  const view = source("scripts/sky-view.mjs"), css = source("styles/sky-view.css"), template = source("templates/cluster-map.hbs");
  // The view lays the background on its canvas and stamps the marks as sprites (renderSkyPixels draws the same sky in software).
  assert.match(view, /renderSkyBackground\(/); assert.match(view, /drawImage\(/); assert.match(view, /oscm-sky-canvas/); assert.match(view, /names: false/);
  assert.ok(!/stroke: #6fb6ff/.test(css), "the blue wireframe lines are gone");
  assert.match(css, /\.oscm-ground-label \{ font: 13px var\(--oscm-serif/);
  assert.ok(template.includes('<input type="checkbox" data-sky-layer="names">'), "names are off until asked for");
});

test("the dome fills the view at the screen's own sharpness; names keep one size and give way where they would overlap", () => {
  const view = source("scripts/sky-view.mjs"), css = source("styles/sky-view.css");
  assert.match(css, /\.is-pixel-sky \.oscm-ground-label \{ font-size: calc\(var\(--sky-px, 1\) \* 12\.5px\)/);
  assert.match(css, /\.is-pixel-sky \.oscm-ground-label\.is-constellation \{ font-size: calc\(var\(--sky-px, 1\) \* 11\.5px\)/);
  assert.match(css, /\.oscm-sky-canvas \{[^}]*image-rendering: auto/, "the sky is not a stretched low-resolution canvas");
  assert.match(view, /const DOME_FILL = 0\.9\d;/); assert.match(view, /devicePixelRatio/); assert.match(view, /setProperty\?\.\("--sky-px"/);
  assert.match(view, /LABEL_RANK/); assert.match(view, /placed\.some\(/);
  assert.match(source("scripts/cluster-map-app.mjs"), /"Drag to turn · pinch to look closer · tap to name"/, "one line of help");
});

test("a clear order of brightness: bright stars are small crosses in a glow, faint ones single dim specks", () => {
  assert.deepEqual([-1, 0.6, 2.5, 3.5, 5].map((m) => starLevel(m)), [0, 1, 2, 3, 4]); assert.equal(starLevel(3.5, true), 1, "a named star is drawn as a bright one");
  const bright = starSprite(1, 0, 3), faint = starSprite(4, 0, 3), at = (sp, dx, dy) => sp.data[((sp.half + dy) * sp.width + sp.half + dx) * 4 + 3];
  assert.equal(at(bright, 0, 0), 255); assert.ok(at(bright, 5, 0) > at(bright, 4, 4) + 40, "a plus: its arms reach further than its glow does diagonally");
  assert.ok(at(faint, 0, 0) < 130 && at(faint, 4, 0) < 10, "the dust is dim and a speck (about a CSS pixel across)");
  assert.ok(starSprite(1, 0, 3).width > starSprite(1, 0, 1).width, "drawn at the screen's own density");
  // The order holds in the picture: the bright stars' cores are white, the faint ones never are.
  const px = paint(night), marks = skyMarks({ ...frame, snapshot: night, sky }), core = (m) => { const o = (Math.round(m.y - 0.5) * W + Math.round(m.x - 0.5)) * 4; return px[o] + px[o + 1] + px[o + 2]; };
  for (const m of marks.stars.filter((m) => m.level <= 1)) assert.ok(core(m) > 700, `bright star at ${m.x},${m.y}`);
  const dust = marks.stars.filter((m) => m.level === 4), dim = dust.filter((m) => core(m) < 400).length; // (a few sit in a bright star's glow)
  assert.ok(dust.length > 50 && dim >= dust.length * 0.95, `faint stars stay well below the bright: ${dim} of ${dust.length}`);
});

test("figures are thin, continuous, muted lines that stop short of their stars", () => {
  const up = sky.constellations.find((c) => c.lines.every(([a, b]) => [a, b].every((id) => night.stars[Number(id.slice(5)) - 1].altDeg > 25)));
  const marks = skyMarks({ ...frame, radius: 270, cx: 300, cy: 300, snapshot: night, sky, lines: true }), lines = marks.lines.filter((l) => l.figure === up.id);
  assert.ok(lines.length && lines.every((l) => !l.bright));
  const starAt = (id) => night.stars[Number(id.slice(5)) - 1], f = { cx: 300, cy: 300, radius: 270 }, ends = up.lines.map(([a]) => skyPoint(starAt(a).altDeg, starAt(a).azDeg, f));
  for (const l of lines) assert.ok(ends.every((p) => Math.hypot(p.x - l.ax, p.y - l.ay) > 2 && Math.hypot(p.x - l.bx, p.y - l.by) > 2), "a gap where a line meets its star");
  assert.ok(LINE_LOOK.muted < 0.6 && LINE_LOOK.width === 1 && LINE_LOOK.bright > LINE_LOOK.muted, "muted, one pixel, bright only when chosen");
  // Continuous: every pixel along the middle of a line is touched.
  const W2 = 600, px = renderSkyPixels({ width: W2, height: W2, cx: 300, cy: 300, radius: 270, snapshot: night, sky, starfield, colors: skyColors(night.sun.altDeg), lines: true }), plain = renderSkyPixels({ width: W2, height: W2, cx: 300, cy: 300, radius: 270, snapshot: night, sky, starfield, colors: skyColors(night.sun.altDeg) });
  const l = lines.reduce((a, c) => (Math.hypot(c.bx - c.ax, c.by - c.ay) > Math.hypot(a.bx - a.ax, a.by - a.ay) ? c : a)), n = Math.floor(Math.hypot(l.bx - l.ax, l.by - l.ay));
  let touched = 0; for (let k = 0; k <= n; k += 1) { const x = Math.floor(l.ax + (l.bx - l.ax) * k / n), y = Math.floor(l.ay + (l.by - l.ay) * k / n), o = (y * W2 + x) * 4; if (px[o] !== plain[o] || px[o + 1] !== plain[o + 1]) touched += 1; }
  assert.ok(touched >= n * 0.95, `${touched} of ${n + 1} pixels along the line`);
});

test("the dome is a smooth gradient: no bands, no checkerboard", () => {
  const W2 = 400, bg = renderSkyBackground({ width: W2, height: W2, cx: 200, cy: 200, radius: 190, snapshot: { ...night, galacticBandVisible: false }, starfield, colors: skyColors(night.sun.altDeg) });
  let worst = 0; for (let y = 100; y < 300; y += 1) for (let x = 100; x < 299; x += 1) { const o = (y * W2 + x) * 4; worst = Math.max(worst, Math.abs(bg[o] - bg[o + 4]) + Math.abs(bg[o + 2] - bg[o + 6])); }
  assert.ok(worst <= 4, `neighbouring pixels differ by ${worst}`);
});
