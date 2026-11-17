// The night sky from the ground: a zenith-centred dome drawn from a groundSky() snapshot at the screen's own
// sharpness (scripts/eym-sky-pixels.mjs) on a canvas, with the compass ring and the names drawn over it. The dome
// fills the view (its horizon about 91% of the view's smaller side, the four winds just outside it). The background is worked out once for each
// view and the stars, wanderers, moons and Sun are laid on it as sprites; while a finger moves, that picture is
// turned, moved or scaled as it is, and drawn sharp again once the finger rests.
// North is at the top and east on the left, as on a star chart held overhead. Drag to turn the whole sky;
// pinch or scroll to look closer, and then drag to move about; tap a star, moon or wanderer to name it;
// double-tap to reset. Looking closer only enlarges the chart: no new stars appear. Object sizes are
// exaggerated for legibility, but a moon's disc over the Sun is drawn in true proportion so eclipses read correctly.
import { LINE_LOOK, SKY_PALETTE, moonRadius, moonSprite, renderSkyBackground, renderSkyVeil, skyMarks, skyPoint, starSprite, sunSprite, wandererSprite, SUN_PIXELS } from "./eym-sky-pixels.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";
const CX = 450, CY = 340, HORIZON_RADIUS = 315;
const DOME_FILL = 0.91;          // the horizon's diameter as a share of the view's smaller side (room left for the four winds)
const SHARP_AFTER_MS = 150;      // how soon after a finger rests the sky is drawn sharp again
/** Screen sizes of the names, in CSS pixels, and which kind gives way to which where two would overlap. */
const LABEL_PX = { "is-chosen": 15, "is-moon": 13, "is-planet": 13, "is-pole-star": 13, "is-star": 12.5, "is-constellation": 11.5 };
const LABEL_RANK = { "is-chosen": 0, "is-moon": 1, "is-planet": 1, "is-pole-star": 2, "is-star": 3, "is-constellation": 4 };
/** How much closer than the whole sky the view can go. */
export const SKY_MAX_ZOOM = 6;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function el(name, attrs = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const mix = (a, b, t) => {
  const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16)), pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * clamp(t, 0, 1)).toString(16).padStart(2, "0")).join("")}`;
};

/** Zenith and horizon colours for a Sun altitude, darkened by eclipse coverage. */
export function skyColors(sunAltDeg, coverage = 0) {
  const stops = [[10, "4b86c9", "a9cdee"], [0, "3f6fa8", "e3a46a"], [-6, "1d3354", "b0603c"], [-12, "0b1528", "2b2a3a"], [-18, "040811", "0a1020"]];
  let zenith = stops.at(-1)[1], horizon = stops.at(-1)[2];
  if (sunAltDeg >= stops[0][0]) { zenith = stops[0][1]; horizon = stops[0][2]; }
  else for (let i = 1; i < stops.length; i += 1) {
    const [a1, z1, h1] = stops[i - 1], [a2, z2, h2] = stops[i];
    if (sunAltDeg >= a2) { const t = (a1 - sunAltDeg) / (a1 - a2); zenith = mix(z1, z2, t).slice(1); horizon = mix(h1, h2, t).slice(1); break; }
  }
  const dark = sunAltDeg > -6 ? clamp((coverage - 0.85) / 0.15, 0, 1) * 0.85 : 0;
  return { zenith: mix(zenith, "060a14", dark), horizon: mix(horizon, "1a1420", dark) };
}

/** SVG path of a moon's lit part: radius r, bright limb toward +x, illuminated fraction k. */
export function litPath(r, k) {
  const rx = Math.abs(2 * k - 1) * r;
  return `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${rx.toFixed(2)} ${r} 0 0 ${k > 0.5 ? 1 : 0} 0 ${-r} Z`;
}

/** Keep a view within bounds: zoom 1..SKY_MAX_ZOOM, and the dome never dragged further than its own growth. */
export function clampSkyView(state) {
  state.zoom = clamp(state.zoom, 1, SKY_MAX_ZOOM);
  const limit = HORIZON_RADIUS * (state.zoom - 1), d = Math.hypot(state.panX, state.panY);
  if (d > limit) { const k = d ? limit / d : 0; state.panX *= k; state.panY *= k; }
  return state;
}

/** Look closer (or less close) by `factor`, keeping the chart point (x, y) under the finger where it is. */
export function zoomSkyAbout(state, factor, x = CX, y = CY) {
  const zoom = clamp(state.zoom * factor, 1, SKY_MAX_ZOOM), k = zoom / state.zoom;
  state.panX = x + (CX + state.panX - x) * k - CX; state.panY = y + (CY + state.panY - y) * k - CY; state.zoom = zoom;
  return clampSkyView(state);
}

export class SkyView {
  constructor(svg, { snapshot, sky, starfield, displayName = (name) => name, layers = {} }) {
    this.svg = svg; this.sky = sky; this.starfield = starfield; this.displayName = displayName;
    this.layers = { lines: false, names: false, ...layers };
    this.state = { rotationDeg: 0, zoom: 1, panX: 0, panY: 0 }; this.fit = 1; this.moving = false; this.sprites = new Map();
    this.snapshot = snapshot; this.cloud = 0; this.selection = null; this.stamp = 0;
    // Which figure each star belongs to, and which stars have names: what a tap can name.
    this.figureOf = new Map(); this.nameOf = new Map();
    for (const c of sky.constellations) for (const pair of c.lines) for (const id of pair) if (!this.figureOf.has(id)) this.figureOf.set(id, c);
    for (const named of sky.namedStars) this.nameOf.set(named.star, named);
    this.#build(); this.#attach(); this.render();
  }

  destroy() {
    for (const [name, handler] of Object.entries(this._listeners ?? {})) this.svg.removeEventListener(name, handler);
    if (this.frame != null) (globalThis.cancelAnimationFrame ?? clearTimeout)(this.frame);
    clearTimeout(this.idleTimer);
    this.canvas?.remove(); this.svg.classList.remove("is-pixel-sky", "is-daylight"); this.svg.style?.removeProperty?.("--sky-px"); this.svg.replaceChildren();
  }

  update(snapshot) { this.snapshot = snapshot; this.stamp += 1; this.render(); }
  /** Cloud cover (0–1) over the observer, from the weather. */
  setCloud(cloud) { if (cloud !== this.cloud) { this.cloud = cloud; this.stamp += 1; this.render(); } }
  setLayerVisibility(layer, visible) { this.layers[layer] = Boolean(visible); this.stamp += 1; this.render(); }
  resetView() { Object.assign(this.state, { rotationDeg: 0, zoom: 1, panX: 0, panY: 0 }); this.render(); }
  clearSelection() { this.selection = null; this.stamp += 1; this.render(); }

  get #frameNow() { return { cx: CX + this.state.panX, cy: CY + this.state.panY, radius: HORIZON_RADIUS * this.state.zoom, rotationDeg: this.state.rotationDeg }; }
  /** Chart position of an altitude/azimuth (null below the horizon). */
  place(altDeg, azDeg) { return skyPoint(altDeg, azDeg, this.#frameNow); }
  #placeDir(direction) { const p = this.snapshot.project(direction); return this.place(p.altDeg, p.azDeg); }

  #build() {
    this.svg.replaceChildren();
    this.svg.setAttribute("viewBox", "0 0 900 680");
    this.svg.classList.add("is-pixel-sky");
    this.canvas = Object.assign(document.createElement("canvas"), { className: "oscm-globe-canvas oscm-sky-canvas is-on" });
    this.svg.parentNode?.insertBefore(this.canvas, this.svg);
    this.horizon = el("circle", { class: "oscm-ground-horizon", fill: "none" });
    this.ticks = el("path", { class: "oscm-ground-ticks", fill: "none" });
    this.cardinals = ["N", "E", "S", "W"].map((label) => { const t = el("text", { class: "oscm-ground-cardinal", "text-anchor": "middle", "dominant-baseline": "middle" }); t.textContent = label; return t; });
    this.labelLayer = el("g", { class: "oscm-ground-labels" });
    this.svg.append(this.horizon, this.ticks, this.labelLayer, ...this.cardinals);
  }

  /**
   * How the chart (the 900 × 680 frame the view state is kept in) lies in the view: the chart's centre at the
   * view's centre, `s` CSS pixels to a chart unit, chosen so that the horizon fills DOME_FILL of the view's smaller side.
   */
  #fitNow() {
    const box = this.svg.getBoundingClientRect?.(); if (!box?.width || !box?.height) return null;
    // The help line laid over the bottom of the view is kept clear: the dome is centred in what is left above it.
    const help = this.svg.closest?.(".oscm-shell")?.querySelector?.(".oscm-view-help")?.getBoundingClientRect?.(), cover = help?.height ? Math.max(0, Math.min(box.height / 4, box.bottom - help.top + 4)) : 0;
    return { left: box.left, top: box.top, w: box.width, h: box.height, oy: -cover / 2, s: DOME_FILL * Math.min(box.width, box.height - cover) / 2 / HORIZON_RADIUS };
  }

  /** A pointer's place on the chart. */
  #chartPoint(event) {
    const f = this.#fitNow() ?? { left: 0, top: 0, w: 900, h: 680, s: 1 };
    return { x: CX + (event.clientX - f.left - f.w / 2) / f.s, y: CY + (event.clientY - f.top - f.h / 2 - (f.oy ?? 0)) / f.s, fit: f.s };
  }

  /** A finger (or the wheel) is moving the sky: draw quickly now, and sharply once it rests. */
  #moving() {
    this.moving = true; clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => { this.moving = false; this.render(); }, SHARP_AFTER_MS);
  }

  #attach() {
    const fingers = new Map(); let drag = null, pinch = null, lastTap = 0;
    const spread = () => { const [a, b] = [...fingers.values()]; return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1, mid: this.#chartPoint({ clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 }) }; };
    const end = (e) => {
      const had = fingers.delete(e.pointerId); if (fingers.size < 2) pinch = null;
      if (had && drag?.id === e.pointerId) {
        const tap = !drag.moved && e.type === "pointerup"; drag = null;
        if (tap) { const now = Date.now(); if (now - lastTap < 350) { lastTap = 0; this.resetView(); } else { lastTap = now; this.#select(this.#chartPoint(e)); } }
      }
    };
    this._listeners = {
      pointerdown: (e) => {
        fingers.set(e.pointerId, e); this.svg.setPointerCapture?.(e.pointerId);
        if (fingers.size === 2) { pinch = spread(); if (drag) drag.moved = true; }
        else if (fingers.size === 1) drag = { id: e.pointerId, x: e.clientX, y: e.clientY, rotation: this.state.rotationDeg, panX: this.state.panX, panY: this.state.panY, moved: false };
      },
      pointermove: (e) => {
        if (!fingers.has(e.pointerId)) return; fingers.set(e.pointerId, e);
        if (pinch && fingers.size >= 2) { const now = spread(); zoomSkyAbout(this.state, now.d / pinch.d, now.mid.x, now.mid.y); pinch = now; this.#moving(); this.render(); return; }
        if (!drag || drag.id !== e.pointerId) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!drag.moved && Math.hypot(dx, dy) < 6) return; drag.moved = true;
        // At the whole sky, a drag turns it; looked at closer, a drag moves about it.
        if (this.state.zoom <= 1.02) this.state.rotationDeg = drag.rotation - dx * 0.35;
        else { const { fit } = this.#chartPoint(e); this.state.panX = drag.panX + dx / fit; this.state.panY = drag.panY + dy / fit; clampSkyView(this.state); }
        this.#moving(); this.render();
      },
      pointerup: end, pointercancel: end,
      wheel: (e) => { e.preventDefault(); const p = this.#chartPoint(e); zoomSkyAbout(this.state, Math.exp(-e.deltaY * 0.0012), p.x, p.y); this.#moving(); this.render(); },
    };
    for (const [name, handler] of Object.entries(this._listeners)) this.svg.addEventListener(name, handler, name === "wheel" ? { passive: false } : undefined);
  }

  /** Everything a tap can name, with where it stands on the chart now (`reach` and `room`, how far its mark reaches, in CSS pixels). */
  #targets() {
    const s = this.snapshot, out = [], add = (p, entry) => { if (p) out.push({ ...entry, x: p.x, y: p.y }); };
    add(this.place(s.sun.altDeg, s.sun.azDeg), { key: "sun", reach: 26, room: SUN_PIXELS * 1.3 + 6, text: s.sun.coverage > 0 ? `The Sun · ${Math.round(s.sun.coverage * 100)}% eclipsed` : "The Sun", short: "The Sun", cls: "is-moon" });
    for (const moon of s.moons) if (moon.visible) add(this.place(moon.altDeg, moon.azDeg), { key: `moon:${moon.name}`, reach: 24, room: moonRadius(moon, HORIZON_RADIUS * this.state.zoom * this.fit) + 5, text: `${this.displayName(moon.name)} · ${Math.round(moon.illuminated * 100)}% lit${moon.umbralFraction > 0.01 ? " · eclipsed" : ""}`, short: this.displayName(moon.name), cls: "is-moon" });
    for (const planet of s.planets) if (planet.visible) add(this.place(planet.altDeg, planet.azDeg), { key: `planet:${planet.name}`, reach: 22, room: 10, text: this.displayName(planet.name), short: this.displayName(planet.name), cls: "is-planet" });
    for (const star of s.stars) {
      if (!star.visible || star.altDeg < 0) continue;
      const id = `star-${String(star.index + 1).padStart(4, "0")}`, named = this.nameOf.get(id), figure = this.figureOf.get(id); if (!named && !figure) continue;
      add(this.place(star.altDeg, star.azDeg), { key: id, reach: named ? 20 : 16, room: 6, text: named ? (figure ? `${named.name} · ${figure.name}` : named.name) : figure.name, short: named?.name, magnitude: star.magnitude, figure: figure?.id ?? null, cls: named?.poleStar ? "is-pole-star" : named ? "is-star" : "is-constellation" });
    }
    return out;
  }

  /** Name what was tapped (the nearest thing within reach), or put the name away. */
  #select(point) {
    let best = null, bestD = Infinity; const px = 1 / (this.fit || 1);
    for (const t of this.#targets()) { const d = Math.hypot(t.x - point.x, t.y - point.y); if (d <= t.reach * px && d < bestD) { best = t; bestD = d; } }
    this.selection = best && best.key !== this.selection?.key ? { key: best.key, figure: best.figure ?? null } : null;
    this.stamp += 1; this.render();
  }

  render() {
    if (!this.snapshot) return;
    // Many changes in one frame (a finger moving) are drawn once, at the next frame.
    if (this.frame == null) this.frame = (globalThis.requestAnimationFrame ?? ((run) => setTimeout(run, 16)))(() => { this.frame = null; this.#draw(); });
  }

  /** A sprite (made once for its kind, colour and the screen's density) as a small canvas, ready to stamp with drawImage. */
  #sprite(key, make) {
    let c = this.sprites.get(key); if (c) return c;
    const sp = make(); c = Object.assign(document.createElement("canvas"), { width: sp.width, height: sp.height }); c.half = sp.half;
    c.getContext("2d").putImageData(new ImageData(sp.data, sp.width, sp.height), 0, 0);
    if (this.sprites.size > 400) this.sprites.clear(); this.sprites.set(key, c); return c;
  }
  #stamp(ctx, sprite, x, y) { ctx.drawImage(sprite, Math.round(x - 0.5) - sprite.half, Math.round(y - 0.5) - sprite.half); }
  /** An RGBA picture laid on a context, stretched smoothly to `w` × `h`. */
  #lay(ctx, data, bw, bh, w, h, c = this.scratch ??= document.createElement("canvas")) {
    c.width = bw; c.height = bh; c.getContext("2d").putImageData(new ImageData(data, bw, bh), 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.drawImage(c, 0, 0, w, h);
  }
  /**
   * The dome's background (the gradient and Desna's Path) as the sky stands unturned, made again only when the
   * time, the place, the zoom or the view's size changes: turning the sky only turns this picture.
   */
  #background(W, H, dcx, dcy, R, colors, dpr) {
    // What the background shows: where Desna's Path stands (to a quarter of a degree), the Sun's height and the sky's darkness.
    const s = this.snapshot, g = s.galacticBandVisible && this.starfield?.galaxy ? s.project(this.starfield.galaxy.center) : null, q = (v, step) => Math.round(v / step);
    const key = [g ? `${q(g.altDeg, 0.25)},${q(g.azDeg, 0.25)}` : "-", q(s.sun.altDeg, 0.25), q(s.limitingMagnitude, 0.05), W, H, dcx.toFixed(1), dcy.toFixed(1), R.toFixed(1)].join("|");
    if (this.bg?.key === key) return this.bg.canvas;
    // It is smooth, so one sample a CSS pixel is enough; it is stretched smoothly to the screen's density.
    const step = Math.max(1, dpr), bw = Math.ceil(W / step), bh = Math.ceil(H / step), canvas = this.bg?.canvas ?? document.createElement("canvas"); canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d"); ctx.clearRect(0, 0, W, H);
    this.#lay(ctx, renderSkyBackground({ width: bw, height: bh, cx: dcx / step, cy: dcy / step, radius: R / step, rotationDeg: 0, snapshot: this.snapshot, starfield: this.starfield, colors }), bw, bh, W, H);
    this.bg = { key, canvas }; return canvas;
  }

  /** The whole sky, sharp, for the view as it is now: a canvas of the view's size at the screen's density. */
  #compose(W, H, k, dpr, oy) {
    const s = this.snapshot, { cx, cy, radius, rotationDeg } = this.#frameNow, X = (x) => (x - CX) * k + W / 2, Y = (y) => (y - CY) * k + H / 2 + oy;
    const dcx = X(cx), dcy = Y(cy), R = radius * k, colors = skyColors(s.sun.altDeg, s.sun.coverage), darkness = Math.min(1, Math.max(0, (s.limitingMagnitude + 1) / 6.6));
    const out = this.composite ??= document.createElement("canvas"); out.width = W; out.height = H;
    const ctx = out.getContext("2d"), step = Math.max(1, dpr), bw = Math.ceil(W / step), bh = Math.ceil(H / step);
    ctx.save(); ctx.translate(dcx, dcy); ctx.rotate(-rotationDeg * Math.PI / 180); ctx.translate(-dcx, -dcy); ctx.drawImage(this.#background(W, H, dcx, dcy, R, colors, dpr), 0, 0); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(dcx, dcy, R, 0, Math.PI * 2); ctx.clip();
    const marks = skyMarks({ cx: dcx, cy: dcy, radius: R, rotationDeg, snapshot: s, sky: this.sky, lines: this.layers.lines, highlight: this.selection?.figure ?? null, density: dpr });
    // Figures: thin, continuous, muted gilt lines that stop short of their stars; a chosen one in bright gilt.
    ctx.lineCap = "round";
    for (const l of marks.lines) {
      const [r, g, b] = l.bright ? SKY_PALETTE.lineBright : SKY_PALETTE.line, a = l.bright ? LINE_LOOK.bright : LINE_LOOK.muted * (0.5 + 0.5 * darkness);
      ctx.strokeStyle = `rgba(${r},${g},${b},${a})`; ctx.lineWidth = (l.bright ? LINE_LOOK.brightWidth : LINE_LOOK.width) * dpr;
      ctx.beginPath(); ctx.moveTo(l.ax, l.ay); ctx.lineTo(l.bx, l.by); ctx.stroke();
    }
    for (const st of marks.stars) this.#stamp(ctx, this.#sprite(`s${st.level}|${st.tint}|${dpr}`, () => starSprite(st.level, st.tint, dpr)), st.x, st.y);
    for (const w of marks.wanderers) this.#stamp(ctx, this.#sprite(`w${w.name}|${dpr}`, () => wandererSprite(w.color, dpr)), w.x, w.y);
    for (const m of marks.moons) this.#stamp(ctx, this.#sprite(`m${m.moon.name}|${m.r.toFixed(1)}|${m.angle.toFixed(2)}|${m.moon.illuminated.toFixed(3)}|${m.moon.umbralFraction.toFixed(2)}|${darkness.toFixed(2)}`, () => moonSprite(m.moon, m.r, m.angle, darkness)), m.x, m.y);
    if (marks.sun) {
      const sun = marks.sun; this.#stamp(ctx, this.#sprite(`sun|${sun.R.toFixed(1)}|${sun.total}`, () => sunSprite(sun.R, sun.total)), sun.x, sun.y);
      for (const c of sun.covers) { ctx.fillStyle = c.red ? "rgb(31,15,12)" : "rgb(13,15,20)"; ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill(); }
    }
    const veil = renderSkyVeil({ width: bw, height: bh, cx: dcx / step, cy: dcy / step, radius: R / step, snapshot: s, cloud: this.cloud });
    if (veil) this.#lay(ctx, veil, bw, bh, W, H);
    ctx.restore();
    return out;
  }

  #draw() {
    const s = this.snapshot, f = this.#fitNow(); if (!f) return;
    this.svg.classList.toggle("is-daylight", s.twilight === "day" && s.sun.coverage < 0.9);
    // The chart is laid so that the dome fills the view, and the names keep one size on the screen.
    if (this.fit !== f.s || this.viewW !== f.w || this.viewH !== f.h || this.viewOy !== f.oy) {
      this.fit = f.s; this.viewW = f.w; this.viewH = f.h; this.viewOy = f.oy;
      this.svg.setAttribute("viewBox", `${(CX - f.w / 2 / f.s).toFixed(2)} ${(CY - (f.h / 2 + f.oy) / f.s).toFixed(2)} ${(f.w / f.s).toFixed(2)} ${(f.h / f.s).toFixed(2)}`);
      this.svg.style?.setProperty?.("--sky-px", (1 / f.s).toFixed(4));
    }
    const dpr = Math.min(3, Math.max(1, Math.round((globalThis.devicePixelRatio || 1) * 4) / 4)), W = Math.round(f.w * dpr), H = Math.round(f.h * dpr), k = f.s * W / f.w;
    // While a finger moves, the picture is drawn at half the density (a quarter of the pixels); sharp again at rest.
    const q = this.moving ? 0.5 : 1, CW = Math.round(W * q), CH = Math.round(H * q);
    if (this.canvas.width !== CW || this.canvas.height !== CH) { this.canvas.width = CW; this.canvas.height = CH; }
    Object.assign(this.canvas.style, { width: `${f.w}px`, height: `${f.h}px`, left: `${this.svg.offsetLeft}px`, top: `${this.svg.offsetTop}px` });

    // The sharp picture is made again when anything but the view has changed, or when the view has changed and
    // the finger has rested; while it moves, the last sharp picture is turned, moved and scaled to the new view.
    const oy = f.oy * W / f.w, view = { ...this.state }, key = [this.stamp, W, H, dpr].join("|"), same = (a, b) => a.rotationDeg === b.rotationDeg && a.zoom === b.zoom && a.panX === b.panX && a.panY === b.panY;
    // (While a finger moves, even a new moment from the clock waits for it to rest, unless the view's size has changed.)
    const size = `${W}|${H}|${dpr}|${oy.toFixed(1)}`, sized = this.sharp && this.sharp.size === size;
    if (!sized || (!this.moving && (this.sharp.key !== key || !same(this.sharp.view, view)))) this.sharp = { key, size, view, canvas: this.#compose(W, H, k, dpr, oy) };
    const ctx = this.canvas.getContext("2d"), was = this.sharp.view;
    ctx.setTransform(q, 0, 0, q, 0, 0); ctx.clearRect(0, 0, W, H);
    if (same(was, view)) ctx.drawImage(this.sharp.canvas, 0, 0);
    else {
      ctx.translate(W / 2 + view.panX * k, H / 2 + oy + view.panY * k); ctx.rotate(-(view.rotationDeg - was.rotationDeg) * Math.PI / 180); ctx.scale(view.zoom / was.zoom, view.zoom / was.zoom); ctx.translate(-(W / 2 + was.panX * k), -(H / 2 + oy + was.panY * k));
      ctx.imageSmoothingEnabled = true; ctx.drawImage(this.sharp.canvas, 0, 0); ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // The compass ring: the horizon, a tick every fifteen degrees (longer at the quarters), and the four winds just outside it.
    const { cx, cy, radius, rotationDeg } = this.#frameNow, px = 1 / f.s;
    for (const [a, v] of [["cx", cx], ["cy", cy], ["r", radius + 1.5 * px]]) this.horizon.setAttribute(a, v.toFixed(1));
    let ticks = "";
    for (let a = 0; a < 360; a += 15) { const rad = (a + rotationDeg) * Math.PI / 180, r1 = radius + 1.5 * px, r2 = r1 + (a % 90 === 0 ? 6 : a % 45 === 0 ? 4 : 2.5) * px; ticks += `M${(cx - r1 * Math.sin(rad)).toFixed(1)} ${(cy - r1 * Math.cos(rad)).toFixed(1)}L${(cx - r2 * Math.sin(rad)).toFixed(1)} ${(cy - r2 * Math.cos(rad)).toFixed(1)}`; }
    this.ticks.setAttribute("d", ticks);
    const winds = ["N", "E", "S", "W"].map((_, i) => { const a = (i * 90 + rotationDeg) * Math.PI / 180, r = radius + 11 * px, x = cx - r * Math.sin(a), y = cy - r * Math.cos(a); this.cardinals[i].setAttribute("x", x.toFixed(1)); this.cardinals[i].setAttribute("y", y.toFixed(1)); return { x0: x - 7 * px, x1: x + 7 * px, y0: y - 8 * px, y1: y + 8 * px }; });
    // Names are set again once the finger rests (laying them out is the costly part of a frame); meanwhile they are put away.
    if (this.moving) { if (this.labelLayer.firstChild) this.labelLayer.replaceChildren(); this.labelsStale = true; }
    else this.#labels(f, winds);
  }

  /**
   * Names: only what was tapped, unless every name is asked for (named stars, wanderers and moons) or the figures
   * are shown (their names). Each is set beside what it names, never over it or another bright mark; where two
   * would overlap, the less important gives way; only what is in view is named.
   */
  #labels(f, placed) {
    this.labelLayer.replaceChildren();
    const px = 1 / f.s, view = { x0: CX - f.w / 2 * px, x1: CX + f.w / 2 * px, y0: CY - (f.h / 2 + f.oy) * px, y1: CY + (f.h / 2 + f.oy) * px }, { cx, cy, radius } = this.#frameNow;
    const inView = (p) => p.x > view.x0 && p.x < view.x1 && p.y > view.y0 && p.y < view.y1 && (p.x - cx) ** 2 + (p.y - cy) ** 2 <= radius * radius;
    const targets = this.#targets().filter(inView), chosen = this.selection ? targets.find((t) => t.key === this.selection.key) : null;
    // Bright marks are obstacles too: no name is set over a star.
    for (const t of targets) if (t.cls !== "is-constellation" || (t.magnitude ?? 9) < 3) placed.push({ x0: t.x - 3 * px, x1: t.x + 3 * px, y0: t.y - 3 * px, y1: t.y + 3 * px });
    const hits = (b) => placed.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0) || b.x0 < view.x0 || b.x1 > view.x1 || b.y0 < view.y0 || b.y1 > view.y1;
    const put = (text, kind, x, y, anchor) => { const node = el("text", { x: x.toFixed(1), y: y.toFixed(1), class: `oscm-ground-label ${kind}`, "text-anchor": anchor, "dominant-baseline": "middle" }); node.textContent = text; this.labelLayer.append(node); };
    const box = (x, y, w, h, anchor) => ({ x0: anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2, x1: anchor === "start" ? x + w : anchor === "end" ? x : x + w / 2, y0: y - h / 2, y1: y + h / 2 });
    const wanted = [];
    if (chosen) wanted.push({ t: chosen, text: chosen.text, kind: `${chosen.cls} is-chosen`, size: LABEL_PX["is-chosen"], rank: LABEL_RANK["is-chosen"] });
    if (this.layers.names) for (const t of targets) if (t !== chosen && t.short) wanted.push({ t, text: t.short, kind: t.cls, size: LABEL_PX[t.cls], rank: LABEL_RANK[t.cls] + (t.magnitude ?? 0) / 100 });
    if (this.layers.lines) for (const c of this.sky.constellations) {
      if (c.id === this.selection?.figure && chosen) continue;
      const pts = []; for (const id of new Set(c.lines.flat())) { const st = this.snapshot.stars[Number(id.slice(5)) - 1]; const p = this.place(st.altDeg, st.azDeg); if (p && inView(p)) pts.push(p); }
      if (pts.length < 2) continue;
      wanted.push({ figure: pts, text: c.name, kind: "is-constellation", size: LABEL_PX["is-constellation"], rank: LABEL_RANK["is-constellation"] });
    }
    for (const l of wanted.sort((a, b) => a.rank - b.rank)) {
      const size = l.size * px, w = l.text.length * size * 0.5, h = size * 1.15, gap = 5 * px;
      let tries;
      if (l.figure) {
        // A figure's name sits just outside it, on the side with the most room.
        const xs = l.figure.map((p) => p.x), ys = l.figure.map((p) => p.y), b = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }, mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
        tries = [{ room: cy + radius - b.y1, x: mx, y: b.y1 + gap + h / 2, anchor: "middle" }, { room: b.y0 - (cy - radius), x: mx, y: b.y0 - gap - h / 2, anchor: "middle" }, { room: cx + radius - b.x1, x: b.x1 + gap, y: my, anchor: "start" }, { room: b.x0 - (cx - radius), x: b.x0 - gap, y: my, anchor: "end" }].sort((a, c) => c.room - a.room);
      } else {
        // A name sits beside what it names, to the right if there is room, else to the left, else above or below.
        const off = (l.t.room ?? 6) * px;
        tries = [{ x: l.t.x + off, y: l.t.y, anchor: "start" }, { x: l.t.x - off, y: l.t.y, anchor: "end" }, { x: l.t.x, y: l.t.y - off - h / 2, anchor: "middle" }, { x: l.t.x, y: l.t.y + off + h / 2, anchor: "middle" }];
      }
      for (const t of tries) { const b = box(t.x, t.y, w, h, t.anchor); if (hits(b)) continue; placed.push(b); put(l.text, l.kind, t.x, t.y, t.anchor); break; }
    }
  }
}
