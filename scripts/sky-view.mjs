// The night sky from the ground: a zenith-centred dome drawn from a groundSky() snapshot.
// North is at the top and east on the left, as on a star chart held overhead. Drag to turn, wheel or
// pinch to zoom, double-click to reset. Objects sizes are exaggerated for legibility, but a moon's disc
// over the Sun is drawn in true proportion so eclipses read correctly.
import { STAR_CLASSES, TWINKLE_GROUPS, starClassIndex } from "./starfield.mjs";
import { cross, normalize } from "./sky-frame.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";
const CX = 450, CY = 340, HORIZON_RADIUS = 315;
const MOON_SCALE = 5;           // moons drawn this many times their true angular size
const MIN_MOON_RADIUS = 8;
const SUN_DISPLAY_RADIUS = 13;
const PLANET_COLORS = Object.freeze({ Thraximundus: "#d9ecff", Tribune: "#f3e3c2", Kandahar: "#f0a36a", Ramses: "#ffe7a3" });
const MOON_COLORS = Object.freeze({ "White Moon": { lit: "#f6f3ea", dark: "#262a33", eclipse: "#7a2f1a" }, "Red Moon": { lit: "#d9673f", dark: "#2a1a17", eclipse: "#5c1f12" } });
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

export class SkyView {
  constructor(svg, { snapshot, sky, starfield, displayName = (name) => name, layers = {} }) {
    this.svg = svg; this.sky = sky; this.starfield = starfield; this.displayName = displayName;
    this.layers = { lines: false, names: true, ...layers };
    this.state = { rotationDeg: 0, zoom: 1 };
    this.snapshot = snapshot;
    this.#build(); this.#attach(); this.render();
  }

  destroy() {
    for (const [name, handler] of Object.entries(this._listeners ?? {})) this.svg.removeEventListener(name, handler);
    this.svg.replaceChildren();
  }

  update(snapshot) { this.snapshot = snapshot; this.render(); }
  /** Cloud cover (0–1) over the observer, from the weather. */
  setCloud(cloud) {
    const day = (this.snapshot?.sun?.altDeg ?? -90) > -6;
    this.cloudVeil.setAttribute("fill-opacity", (Math.max(0, cloud - 0.1) ** 1.3 * (day ? 0.8 : 0.93)).toFixed(2));
    this.cloudVeil.style.fill = day ? "#c4ccd4" : "#1b2229";
  }
  setLayerVisibility(layer, visible) { this.layers[layer] = Boolean(visible); this.render(); }
  resetView() { Object.assign(this.state, { rotationDeg: 0, zoom: 1 }); this.render(); }
  clearSelection() {}

  /** Screen position of an altitude/azimuth (null below the horizon). */
  place(altDeg, azDeg) {
    if (altDeg < 0) return null;
    const r = (90 - altDeg) / 90 * HORIZON_RADIUS * this.state.zoom, a = (azDeg + this.state.rotationDeg) * Math.PI / 180;
    return { x: CX - r * Math.sin(a), y: CY - r * Math.cos(a) };
  }

  #placeDir(direction) { const p = this.snapshot.project(direction); return this.place(p.altDeg, p.azDeg); }

  #build() {
    this.svg.replaceChildren();
    this.svg.setAttribute("viewBox", "0 0 900 680");
    const defs = el("defs");
    const sky = el("radialGradient", { id: "oscm-ground-sky", cx: "50%", cy: "50%", r: "50%" });
    this.skyStops = [el("stop", { offset: "0%" }), el("stop", { offset: "100%" })];
    sky.append(...this.skyStops);
    const glow = el("radialGradient", { id: "oscm-ground-glow" });
    glow.append(el("stop", { offset: "0%", "stop-color": "#dfe8ff", "stop-opacity": 1 }), el("stop", { offset: "100%", "stop-color": "#dfe8ff", "stop-opacity": 0 }));
    const sunGlow = el("radialGradient", { id: "oscm-ground-sun-glow" });
    sunGlow.append(el("stop", { offset: "0%", "stop-color": "#fff6d8", "stop-opacity": 0.95 }), el("stop", { offset: "100%", "stop-color": "#ffd27a", "stop-opacity": 0 }));
    const clip = el("clipPath", { id: "oscm-ground-dome" }); this.clipCircle = el("circle", { cx: CX, cy: CY }); clip.append(this.clipCircle);
    defs.append(sky, glow, sunGlow, clip);
    this.background = el("circle", { cx: CX, cy: CY, fill: "url(#oscm-ground-sky)" });
    this.dome = el("g", { "clip-path": "url(#oscm-ground-dome)" });
    this.bandLayer = el("g", { class: "oscm-ground-band" });
    this.lineLayer = el("path", { class: "oscm-ground-constellation-lines", fill: "none" });
    this.starPaths = STAR_CLASSES.map((entry, classIndex) => Array.from({ length: TWINKLE_GROUPS }, (_, twinkle) => el("path", { class: `oscm-sky-stars is-class-${classIndex} is-twinkle-${twinkle}`, fill: "none", stroke: "#ffffff", "stroke-linecap": "round", "stroke-width": entry.size * 1.15, "stroke-opacity": entry.opacity })));
    this.bodyLayer = el("g", { class: "oscm-ground-bodies" });
    this.labelLayer = el("g", { class: "oscm-ground-labels" });
    // Cloud cover from the weather veils the sky: stars first, then the moons and planets.
    this.cloudVeil = el("circle", { cx: CX, cy: CY, r: 2000, class: "oscm-sky-cloud", "fill-opacity": 0 });
    this.dome.append(this.bandLayer, this.lineLayer, ...this.starPaths.flat(), this.bodyLayer, this.cloudVeil, this.labelLayer);
    this.horizon = el("circle", { cx: CX, cy: CY, class: "oscm-ground-horizon", fill: "none" });
    this.cardinals = ["N", "E", "S", "W"].map((label) => { const t = el("text", { class: "oscm-ground-cardinal", "text-anchor": "middle", "dominant-baseline": "middle" }); t.textContent = label; return t; });
    this.svg.append(defs, el("rect", { x: 0, y: 0, width: 900, height: 680, class: "oscm-ground-backdrop" }), this.background, this.dome, this.horizon, ...this.cardinals);
  }

  #attach() {
    let drag = null;
    this._listeners = {
      pointerdown: (e) => { drag = { x: e.clientX, rotation: this.state.rotationDeg, id: e.pointerId }; this.svg.setPointerCapture?.(e.pointerId); },
      pointermove: (e) => { if (!drag || drag.id !== e.pointerId) return; this.state.rotationDeg = drag.rotation - (e.clientX - drag.x) * 0.35; this.render(); },
      pointerup: (e) => { if (drag?.id === e.pointerId) drag = null; },
      pointercancel: () => { drag = null; },
      wheel: (e) => { e.preventDefault(); this.state.zoom = clamp(this.state.zoom * Math.exp(-e.deltaY * 0.0012), 1, 4); this.render(); },
      dblclick: () => this.resetView(),
    };
    for (const [name, handler] of Object.entries(this._listeners)) this.svg.addEventListener(name, handler, name === "wheel" ? { passive: false } : undefined);
  }

  render() {
    const s = this.snapshot; if (!s) return;
    const radius = HORIZON_RADIUS * this.state.zoom;
    this.background.setAttribute("r", radius); this.clipCircle.setAttribute("r", radius); this.horizon.setAttribute("r", radius);
    const colors = skyColors(s.sun.altDeg, s.sun.coverage);
    this.skyStops[0].setAttribute("stop-color", colors.zenith); this.skyStops[1].setAttribute("stop-color", colors.horizon);
    this.svg.classList.toggle("is-daylight", s.twilight === "day" && s.sun.coverage < 0.9);
    ["N", "E", "S", "W"].forEach((_, i) => { const a = (i * 90 + this.state.rotationDeg) * Math.PI / 180, r = Math.min(radius, 325) + 14; this.cardinals[i].setAttribute("x", CX - r * Math.sin(a)); this.cardinals[i].setAttribute("y", CY - r * Math.cos(a)); });
    const darkness = clamp((s.limitingMagnitude + 1) / 6.6, 0, 1);

    // Desna's Path: the galactic band, on dark nights only.
    this.bandLayer.replaceChildren();
    if (s.galacticBandVisible) {
      const { northPole, center, bandHalfWidthDeg } = this.starfield.galaxy;
      const side = normalize(cross(northPole, center));
      for (let l = 0; l < 360; l += 4) {
        const rad = l * Math.PI / 180, dir = center.map((c, i) => c * Math.cos(rad) + side[i] * Math.sin(rad));
        const p = this.#placeDir(dir); if (!p) continue;
        const core = ((1 + Math.cos(rad)) / 2) ** 2;
        this.bandLayer.append(el("circle", { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: (bandHalfWidthDeg * (0.7 + 0.6 * core) * radius / 90).toFixed(1), fill: "url(#oscm-ground-glow)", opacity: ((0.03 + 0.06 * core) * darkness).toFixed(3) }));
      }
    }

    // Stars.
    const groups = STAR_CLASSES.map(() => Array.from({ length: TWINKLE_GROUPS }, () => []));
    for (const star of s.stars) {
      if (!star.visible) continue;
      const p = this.place(star.altDeg, star.azDeg); if (!p) continue;
      groups[starClassIndex(star.magnitude)][star.index % TWINKLE_GROUPS].push(`M${p.x.toFixed(1)} ${p.y.toFixed(1)}h0`);
    }
    groups.forEach((byTwinkle, c) => byTwinkle.forEach((dots, t) => this.starPaths[c][t].setAttribute("d", dots.join(""))));

    // Constellation lines (toggle). Shown even by day for reference, but faint.
    const starAt = (id) => s.stars[Number(id.slice(5)) - 1];
    let lines = "";
    if (this.layers.lines) for (const c of this.sky.constellations) for (const [a, b] of c.lines) {
      const pa = starAt(a), pb = starAt(b); const qa = this.place(pa.altDeg, pa.azDeg), qb = this.place(pb.altDeg, pb.azDeg);
      if (qa && qb) lines += `M${qa.x.toFixed(1)} ${qa.y.toFixed(1)}L${qb.x.toFixed(1)} ${qb.y.toFixed(1)}`;
    }
    this.lineLayer.setAttribute("d", lines);
    this.lineLayer.setAttribute("stroke-opacity", (0.25 + 0.4 * darkness).toFixed(2));

    // Bodies and labels.
    this.bodyLayer.replaceChildren(); this.labelLayer.replaceChildren();
    const label = (p, text, cls, dy = -9) => { const t = el("text", { x: (p.x + 7).toFixed(1), y: (p.y + dy).toFixed(1), class: `oscm-ground-label ${cls}` }); t.textContent = text; this.labelLayer.append(t); };
    if (this.layers.lines) for (const c of this.sky.constellations) {
      const p = this.#placeDir(c.center); if (p) { const t = el("text", { x: p.x.toFixed(1), y: p.y.toFixed(1), class: "oscm-ground-label is-constellation", "text-anchor": "middle" }); t.textContent = c.name; this.labelLayer.append(t); }
    }
    if (this.layers.names) for (const named of this.sky.namedStars) {
      const star = starAt(named.star); if (!star.visible) continue;
      const p = this.place(star.altDeg, star.azDeg); if (p) label(p, named.name, named.poleStar ? "is-pole-star" : "is-star");
    }
    for (const planet of s.planets) {
      if (!planet.visible) continue;
      const p = this.place(planet.altDeg, planet.azDeg); if (!p) continue;
      this.bodyLayer.append(el("circle", { cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: clamp(3.3 - 0.45 * planet.magnitude, 1.8, 6).toFixed(2), fill: PLANET_COLORS[planet.name] ?? "#fff", class: "oscm-ground-planet" }));
      label(p, this.displayName(planet.name), "is-planet");
    }
    const sunPoint = this.place(s.sun.altDeg, s.sun.azDeg);
    for (const moon of s.moons) {
      const p = this.place(moon.altDeg, moon.azDeg); if (!p || !moon.visible) continue;
      this.#drawMoon(moon, p, radius);
      label(p, this.displayName(moon.name), "is-moon", -Math.max(MIN_MOON_RADIUS, moon.radiusDeg * radius / 90 * MOON_SCALE) - 4);
    }
    if (sunPoint) this.#drawSun(sunPoint, radius);
  }

  #drawMoon(moon, p, radius) {
    const colors = MOON_COLORS[moon.name] ?? MOON_COLORS["White Moon"];
    const r = Math.max(MIN_MOON_RADIUS, moon.radiusDeg * radius / 90 * MOON_SCALE);
    const toward = this.#placeDir(normalize(moon.dir.map((v, i) => v + 0.02 * moon.brightLimb[i]))) ?? p;
    const angle = Math.atan2(toward.y - p.y, toward.x - p.x) * 180 / Math.PI;
    const lit = mix(colors.lit.slice(1), colors.eclipse.slice(1), moon.umbralFraction * 0.95);
    const g = el("g", { transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${angle.toFixed(1)})`, class: "oscm-ground-moon", "data-moon": moon.name });
    // The unlit side shows against a dark sky but melts into a bright one, as Earth's Moon's does by day.
    const darkness = clamp((this.snapshot.limitingMagnitude + 1) / 6.6, 0, 1);
    g.append(el("circle", { r: r.toFixed(2), fill: colors.dark, opacity: (0.1 + 0.75 * darkness).toFixed(2) }));
    g.append(el("path", { d: litPath(r, moon.illuminated), fill: lit, opacity: (1 - 0.35 * Math.max(0, moon.penumbralFraction - moon.umbralFraction)).toFixed(2) }));
    const title = el("title"); title.textContent = `${this.displayName(moon.name)} · ${Math.round(moon.illuminated * 100)}% lit${moon.umbralFraction > 0.01 ? " · eclipsed" : ""}`; g.append(title);
    this.bodyLayer.append(g);
  }

  #drawSun(p, radius) {
    const s = this.snapshot;
    const g = el("g", { class: "oscm-ground-sun" });
    g.append(el("circle", { cx: p.x, cy: p.y, r: SUN_DISPLAY_RADIUS * (s.sun.coverage > 0.98 ? 3.5 : 2.6), fill: "url(#oscm-ground-sun-glow)", opacity: s.sun.coverage > 0.98 ? 0.55 : 0.9 }));
    g.append(el("circle", { cx: p.x, cy: p.y, r: SUN_DISPLAY_RADIUS, fill: "#fff7dc" }));
    // A moon in front of the Sun: drawn at the true offset and size relative to the Sun's disc.
    const k = SUN_DISPLAY_RADIUS / s.sun.radiusDeg;
    for (const moon of s.moons) {
      if (moon.sunCoverage <= 0) continue;
      const m = this.place(moon.altDeg, moon.azDeg) ?? p;
      const pxPerDeg = radius / 90;
      const dx = (m.x - p.x) / pxPerDeg * k, dy = (m.y - p.y) / pxPerDeg * k;
      g.append(el("circle", { cx: (p.x + dx).toFixed(2), cy: (p.y + dy).toFixed(2), r: (moon.radiusDeg * k).toFixed(2), fill: moon.name === "Red Moon" ? "#1f0f0c" : "#0d0f14" }));
    }
    const title = el("title"); title.textContent = s.sun.coverage > 0 ? `The Sun · ${Math.round(s.sun.coverage * 100)}% eclipsed` : "The Sun"; g.append(title);
    this.bodyLayer.append(g);
  }
}

