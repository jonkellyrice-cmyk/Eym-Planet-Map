// The night sky from the ground: a zenith-centred dome drawn from a groundSky() snapshot, as a pixel-art star
// chart (scripts/eym-sky-pixels.mjs) on a canvas, with the compass ring and the names drawn over it.
// North is at the top and east on the left, as on a star chart held overhead. Drag to turn the whole sky;
// pinch or scroll to look closer, and then drag to move about; tap a star, moon or wanderer to name it;
// double-tap to reset. Looking closer only enlarges the chart: no new stars appear. Object sizes are
// exaggerated for legibility, but a moon's disc over the Sun is drawn in true proportion so eclipses read correctly.
import { moonRadius, renderSkyPixels, skyPoint, SUN_PIXELS } from "./eym-sky-pixels.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";
const CX = 450, CY = 340, HORIZON_RADIUS = 315;
const ART_PX = 2;               // one art pixel is this many CSS pixels on every screen
const MAX_ART = 720;            // art pixels across, at most (a very large window gets larger pixels instead)
/** Screen sizes of the names, in CSS pixels, by kind; and which kind of name gives way to which where two would overlap. */
const LABEL_PX = { "is-chosen": 15, "is-moon": 13, "is-planet": 13, "is-pole-star": 13, "is-star": 12.5, "is-constellation": 11.5 };
const LABEL_RANK = { "is-chosen": 0, "is-moon": 1, "is-pole-star": 2, "is-planet": 3, "is-star": 4, "is-constellation": 5 };
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
    this.state = { rotationDeg: 0, zoom: 1, panX: 0, panY: 0 }; this.artUnit = 2.5; this.fit = 1;
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
    this.canvas?.remove(); this.svg.classList.remove("is-pixel-sky", "is-daylight"); this.svg.replaceChildren();
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

  /** A pointer's place on the chart (the 900 × 680 frame, which the window may show more or less of). */
  #chartPoint(event) {
    const box = this.svg.getBoundingClientRect(), fit = Math.min(box.width / 900, box.height / 680) || 1;
    return { x: 450 + (event.clientX - box.left - box.width / 2) / fit, y: 340 + (event.clientY - box.top - box.height / 2) / fit, fit };
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
        if (pinch && fingers.size >= 2) { const now = spread(); zoomSkyAbout(this.state, now.d / pinch.d, now.mid.x, now.mid.y); pinch = now; this.render(); return; }
        if (!drag || drag.id !== e.pointerId) return;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!drag.moved && Math.hypot(dx, dy) < 6) return; drag.moved = true;
        // At the whole sky, a drag turns it; looked at closer, a drag moves about it.
        if (this.state.zoom <= 1.02) this.state.rotationDeg = drag.rotation - dx * 0.35;
        else { const { fit } = this.#chartPoint(e); this.state.panX = drag.panX + dx / fit; this.state.panY = drag.panY + dy / fit; clampSkyView(this.state); }
        this.render();
      },
      pointerup: end, pointercancel: end,
      wheel: (e) => { e.preventDefault(); const p = this.#chartPoint(e); zoomSkyAbout(this.state, Math.exp(-e.deltaY * 0.0012), p.x, p.y); this.render(); },
    };
    for (const [name, handler] of Object.entries(this._listeners)) this.svg.addEventListener(name, handler, name === "wheel" ? { passive: false } : undefined);
  }

  /** Everything a tap can name, with where it stands on the chart now. */
  #targets() {
    const s = this.snapshot, out = [], add = (p, entry) => { if (p) out.push({ ...entry, x: p.x, y: p.y }); };
    const sun = this.place(s.sun.altDeg, s.sun.azDeg);
    add(sun, { key: "sun", reach: 26, lift: SUN_PIXELS * this.artUnit + 8, text: s.sun.coverage > 0 ? `The Sun · ${Math.round(s.sun.coverage * 100)}% eclipsed` : "The Sun", cls: "is-moon" });
    for (const moon of s.moons) if (moon.visible) add(this.place(moon.altDeg, moon.azDeg), { key: `moon:${moon.name}`, reach: 24, lift: moonRadius(moon, HORIZON_RADIUS * this.state.zoom / this.artUnit) * this.artUnit + 6, text: `${this.displayName(moon.name)} · ${Math.round(moon.illuminated * 100)}% lit${moon.umbralFraction > 0.01 ? " · eclipsed" : ""}`, short: this.displayName(moon.name), cls: "is-moon" });
    for (const planet of s.planets) if (planet.visible) add(this.place(planet.altDeg, planet.azDeg), { key: `planet:${planet.name}`, reach: 22, lift: 14, text: this.displayName(planet.name), cls: "is-planet" });
    for (const star of s.stars) {
      if (!star.visible || star.altDeg < 0) continue;
      const id = `star-${String(star.index + 1).padStart(4, "0")}`, named = this.nameOf.get(id), figure = this.figureOf.get(id); if (!named && !figure) continue;
      add(this.place(star.altDeg, star.azDeg), { key: id, reach: named ? 20 : 16, lift: 10, text: named ? (figure ? `${named.name} · ${figure.name}` : named.name) : figure.name, short: named?.name, magnitude: star.magnitude, figure: figure?.id ?? null, cls: named?.poleStar ? "is-pole-star" : named ? "is-star" : "is-constellation" });
    }
    return out;
  }

  /** Name what was tapped (the nearest thing within reach), or put the name away. */
  #select(point) {
    let best = null, bestD = Infinity;
    for (const t of this.#targets()) { const d = Math.hypot(t.x - point.x, t.y - point.y); if (d <= t.reach && d < bestD) { best = t; bestD = d; } }
    this.selection = best && best.key !== this.selection?.key ? { key: best.key, figure: best.figure ?? null } : null;
    this.stamp += 1; this.render();
  }

  render() {
    if (!this.snapshot) return;
    // Many changes in one frame (a finger moving) are drawn once, at the next frame.
    if (this.frame == null) this.frame = (globalThis.requestAnimationFrame ?? ((run) => setTimeout(run, 16)))(() => { this.frame = null; this.#draw(); });
  }

  #draw() {
    const s = this.snapshot, { cx, cy, radius, rotationDeg } = this.#frameNow;
    this.svg.classList.toggle("is-daylight", s.twilight === "day" && s.sun.coverage < 0.9);

    // The chart itself, as pixels: it covers all of the view that shows, which may be more than the frame.
    const box = this.svg.getBoundingClientRect?.(), fit = box?.width && box?.height ? Math.min(box.width / 900, box.height / 680) : 0;
    if (fit) {
      // One art pixel is ART_PX CSS pixels whatever the screen (a larger window gets more of them, up to MAX_ART across).
      const unit = Math.max(ART_PX / fit, Math.max(box.width, box.height) / fit / MAX_ART), ART_UNIT = unit; this.artUnit = unit; this.fit = fit;
      this.svg.style?.setProperty?.("--sky-px", (1 / fit).toFixed(4));
      const W = Math.ceil(box.width / fit / ART_UNIT), H = Math.ceil(box.height / fit / ART_UNIT);
      const key = [rotationDeg.toFixed(2), this.state.zoom.toFixed(3), this.state.panX.toFixed(1), this.state.panY.toFixed(1), this.stamp, W, H].join("|");
      if (key !== this.paintKey) {
        this.paintKey = key;
        const data = renderSkyPixels({ width: W, height: H, cx: W / 2 + (cx - 450) / ART_UNIT, cy: H / 2 + (cy - 340) / ART_UNIT, radius: radius / ART_UNIT, rotationDeg, snapshot: s, sky: this.sky, starfield: this.starfield, colors: skyColors(s.sun.altDeg, s.sun.coverage), lines: this.layers.lines, highlight: this.selection?.figure ?? null, cloud: this.cloud, scale: this.state.zoom });
        if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
        const shown = [W * ART_UNIT * fit, H * ART_UNIT * fit];
        Object.assign(this.canvas.style, { width: `${shown[0]}px`, height: `${shown[1]}px`, left: `${this.svg.offsetLeft + (box.width - shown[0]) / 2}px`, top: `${this.svg.offsetTop + (box.height - shown[1]) / 2}px` });
        this.canvas.getContext("2d").putImageData(new ImageData(data, W, H), 0, 0);
      }
    }

    // The compass ring: the horizon, a tick every fifteen degrees (longer at the quarters), and the four winds.
    for (const [k, v] of [["cx", cx], ["cy", cy], ["r", radius + 3]]) this.horizon.setAttribute(k, v.toFixed(1));
    let ticks = "";
    for (let a = 0; a < 360; a += 15) { const rad = (a + rotationDeg) * Math.PI / 180, r1 = radius + 3, r2 = r1 + (a % 90 === 0 ? 11 : a % 45 === 0 ? 8 : 5); ticks += `M${(cx - r1 * Math.sin(rad)).toFixed(1)} ${(cy - r1 * Math.cos(rad)).toFixed(1)}L${(cx - r2 * Math.sin(rad)).toFixed(1)} ${(cy - r2 * Math.cos(rad)).toFixed(1)}`; }
    this.ticks.setAttribute("d", ticks);
    ["N", "E", "S", "W"].forEach((_, i) => { const a = (i * 90 + rotationDeg) * Math.PI / 180, r = radius + 26; this.cardinals[i].setAttribute("x", (cx - r * Math.sin(a)).toFixed(1)); this.cardinals[i].setAttribute("y", (cy - r * Math.cos(a)).toFixed(1)); });

    // Names: only what was tapped, unless every name is asked for.
    this.labelLayer.replaceChildren();
    const targets = this.#targets(), chosen = this.selection ? targets.find((t) => t.key === this.selection.key) : null;
    // Each name is a fixed size on the screen; where two would overlap, the less important one is left out.
    const wanted = [], px = 1 / (this.fit || 1);
    const want = (t, text, kind) => { if (t.x < -20 || t.x > 920 || t.y < -20 || t.y > 700) return; const size = LABEL_PX[kind] * px, w = text.length * size * 0.52, x = clamp(t.x, w / 2 + 4, 900 - w / 2 - 4), y = Math.max(size + 2, t.y - Math.max(t.lift, 6 * px)); wanted.push({ t, text, kind, x, y, w, h: size * 1.15, rank: LABEL_RANK[kind] + (t.magnitude ?? 0) / 100 }); };
    if (chosen) want(chosen, chosen.text, "is-chosen");
    if (this.layers.names) for (const t of targets) if (t !== chosen && (t.short || t.cls === "is-planet")) want(t, t.short ?? t.text, t.cls);
    if (this.layers.lines) for (const c of this.sky.constellations) { if (c.id === this.selection?.figure) continue; const p = this.#placeDir(c.center); if (p) want({ ...p, lift: 0 }, c.name, "is-constellation"); }
    // The four winds are placed first: no name is drawn over them.
    const placed = ["N", "E", "S", "W"].map((_, i) => { const a = (i * 90 + rotationDeg) * Math.PI / 180, r = radius + 26, x = cx - r * Math.sin(a), y = cy - r * Math.cos(a), h = 10 * px; return { x0: x - h, x1: x + h, y0: y - h, y1: y + h }; });
    for (const l of wanted.sort((a, b) => a.rank - b.rank)) {
      const box = { x0: l.x - l.w / 2 - 2 * px, x1: l.x + l.w / 2 + 2 * px, y0: l.y - l.h, y1: l.y + 2 * px };
      if (placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
      placed.push(box);
      const node = el("text", { x: l.x.toFixed(1), y: l.y.toFixed(1), class: `oscm-ground-label ${l.kind === "is-chosen" ? `${l.t.cls} is-chosen` : l.kind}`, "text-anchor": "middle" }); node.textContent = l.text; this.labelLayer.append(node);
    }
  }
}
