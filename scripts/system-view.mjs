import { displayPosition, orbitVector } from "./system-data.mjs";
import { createFactionEmblem, factionPresentationForOwner } from "./capital-icons.mjs";
import { STAR_CLASSES, TWINKLE_GROUPS, buildSkyFrame } from "./starfield.mjs";
import { objectDisplayName, parentDisplayName, systemDisplayName } from "./display-names.mjs";
import { JURISDICTION_BADGES, scholarEntry } from "./scholars-model.mjs";
import { spriteDataUrl } from "./system-sprites.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function svgElement(name, attrs = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  return element;
}

function paletteFor(object) {
  if (object.objectClass === "star") {
    if (/F\d/i.test(object.type)) return { fill: "#fff1c9", core: "#fffbed" };
    if (/G\d/i.test(object.type)) return { fill: "#f4ce68", core: "#fff0b7" };
    return { fill: "#e98d43", core: "#ffc687" };
  }
  const palette = String(object.visual_palette || "").toLowerCase();
  if (object.objectClass === "giant") return { fill: palette.includes("blue") ? "#668eb6" : "#b58a63", core: "#d8c5a5" };
  if (object.objectClass === "moon") return { fill: "#93a1a6", core: "#d8e0df" };
  if (object.objectClass === "installation") return { fill: "#63d9df", core: "#d2ffff" };
  if (object.objectClass === "vessel") return { fill: "#e5c56a", core: "#fff0b0" };
  if (object.objectClass === "belt") return { fill: "#7f9295", core: "#b8c4c4" };
  if (object.objectClass === "anomaly") return { fill: "#ae66d8", core: "#e1b9fa" };
  if (palette.includes("ocean") || Number(object.water_pct) > 60) return { fill: "#3d82a8", core: "#79c6cc" };
  if (palette.includes("ice") || Number(object.permanent_ice_pct) > 15) return { fill: "#9ebdcc", core: "#dff6f7" };
  if (Number(object.mean_surface_temp_c) > 24) return { fill: "#b76b44", core: "#e6b074" };
  return { fill: "#718d72", core: "#b9c996" };
}

/** Half the drawn size of a body of the scholars' model (they draw the heavens large), or null. */
function modelRadius(object) {
  const entry = scholarEntry(object);
  if (entry.kind === "sun") return 48;
  if (entry.kind === "world") return 26;
  if (entry.kind === "wanderer") return [24, 21, 19, 18][entry.rank ?? 3];
  if (entry.kind === "moon") return /red/i.test(object.name) ? 11 : 13;
  return null;
}

function baseRadius(object) {
  const model = modelRadius(object); if (model) return model;
  if (object.objectClass === "star") return 11;
  if (object.objectClass === "giant") return 8.5;
  if (object.objectClass === "moon") return 3.6;
  if (object.objectClass === "planet") return clamp(4.6 * Math.sqrt(object.radiusRe || 1), 4.2, 7.4);
  if (object.objectClass === "installation") return 6.5;
  if (object.objectClass === "vessel") return 6;
  return 5;
}

function appendGlyph(group, object, radius, colors) {
  // The scholars' model is painted: pixel-art sprites (the Sun in splendour, jewelled wandering stars…).
  const entry = scholarEntry(object), sprite = modelRadius(object) ? spriteDataUrl(entry.kind, { name: object.name, rank: entry.rank }) : null;
  if (sprite) {
    if (entry.kind === "sun") group.append(svgElement("circle", { class: "oscm-system-sun-glow", r: radius * 1.5, fill: "#f4ce68", opacity: 0.07 }));
    const image = svgElement("image", { class: `oscm-system-sprite is-${entry.kind}`, href: sprite.url, x: -radius, y: -radius, width: radius * 2, height: radius * 2 });
    image.style.imageRendering = "pixelated"; group.append(image);
    return;
  }
  if (object.objectClass === "belt") {
    group.append(svgElement("ellipse", { class: "oscm-system-belt-glyph", rx: 13, ry: 4.5, fill: "none", stroke: colors.fill, "stroke-width": 2, "stroke-dasharray": "2 3" }));
    return;
  }
  if (object.objectClass === "anomaly") {
    group.append(svgElement("circle", { class: "oscm-system-anomaly-glyph", r: 10, fill: colors.fill, opacity: 0.18, stroke: colors.core, "stroke-width": 1.5, "stroke-dasharray": "3 2" }));
    return;
  }
  if (object.objectClass === "installation") {
    group.append(svgElement("polygon", { class: "oscm-system-installation-glyph", points: "0,-8 7,0 0,8 -7,0", fill: "rgba(5,18,21,.9)", stroke: colors.fill, "stroke-width": 2 }));
    group.append(svgElement("circle", { r: 2.5, fill: colors.core }));
    return;
  }
  if (object.objectClass === "vessel") {
    group.append(svgElement("path", { class: "oscm-system-vessel-glyph", d: "M -8 5 L 9 0 L -8 -5 L -4 0 Z", fill: colors.fill, stroke: colors.core, "stroke-width": 1 }));
    return;
  }
  const halo = svgElement("circle", { r: radius + 3, fill: colors.fill, opacity: object.objectClass === "star" ? .22 : .1 });
  const body = svgElement("circle", { r: radius, fill: colors.fill, stroke: colors.core, "stroke-width": object.objectClass === "star" ? 1.8 : 1 });
  const highlight = svgElement("circle", { cx: -radius * .28, cy: -radius * .28, r: Math.max(1.2, radius * .28), fill: colors.core, opacity: .72 });
  group.append(halo, body, highlight);
}

/** A point seen from a pivot: the camera turns and zooms about the pivot, which sits at the view's centre. */
export function recenterPoint(point, pivot) {
  return { x: point.x - pivot.x, y: point.y - pivot.y, z: point.z - pivot.z };
}

export class SystemView {
  constructor(svg, options) {
    this.svg = svg;
    this.model = options.model;
    this.starfield = options.starfield ?? null;
    this.onSelectionChange = options.onSelectionChange ?? (() => {});
    this.onExitRequested = options.onExitRequested ?? (() => {});
    // Only what the scholars can map opens (the world); the Sun, moons and wandering stars are looked at, not entered.
    const activate = options.onObjectActivate ?? (() => {});
    this.onObjectActivate = (object) => { if (scholarEntry(object).openable) activate(object); };
    this.onShipDrag = options.onShipDrag ?? null;
    this.state = { yaw: -0.62, pitch: 0.82, zoom: 1, panX: 0, panY: 0 };
    // What the camera centres and pivots on: Mictir (the origin) until a body is selected.
    this.pivot = { x: 0, y: 0, z: 0 };
    this.origin = null;
    this.destination = null;
    this.activePointers = new Map();
    this.drag = null;
    this.pinch = null;
    this.suppressClickUntil = 0;
    this.exitTriggered = false;
    this.pendingSelectionTimer = null;
    this.lastActivation = null;
    this.activationSuppressedUntil = 0;
    this.routeVisualization = null;
    this.displayPositions = new Map(this.model.objects.map((object) => [object.id, displayPosition(object, this.model)]));
    this.#buildScene();
    this.#attachEvents();
    this.render();
  }

  destroy() {
    this._destroyed = true;
    clearTimeout(this.pendingSelectionTimer);
    for (const [name, handler] of Object.entries(this._listeners ?? {})) this.svg.removeEventListener(name, handler);
    this.svg.replaceChildren();
  }

  resetView() {
    Object.assign(this.state, { yaw: -0.62, pitch: 0.82, zoom: 1, panX: 0, panY: 0 });
    this.#pivotTo(null);
    this.render();
  }

  /** Glide the camera's centre and pivot to a body (null: back to Mictir). */
  #pivotTo(object) {
    const target = (object && this.displayPositions?.get(object.id)) || { x: 0, y: 0, z: 0 }, from = { ...this.pivot }, token = (this._pivotToken = (this._pivotToken ?? 0) + 1);
    this.state.panX = 0; this.state.panY = 0;
    if (typeof requestAnimationFrame !== "function" || typeof performance === "undefined") { this.pivot = { x: target.x, y: target.y, z: target.z }; return; }
    const start = performance.now(), step = (now) => {
      if (this._destroyed || token !== this._pivotToken) return;
      const t = Math.min(1, (now - start) / 330), k = 1 - (1 - t) ** 3;
      this.pivot = { x: from.x + (target.x - from.x) * k, y: from.y + (target.y - from.y) * k, z: from.z + (target.z - from.z) * k };
      this.render(); if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  clearSelection() {
    this.origin = null;
    this.destination = null;
    this.#pivotTo(null);
    this.#syncSelection();
    this.onSelectionChange(null, null);
    this.render();
  }

  setRouteVisualization(visualization) { this.routeVisualization = visualization; this.render(); }
  get isDraggingShip() { return Boolean(this.shipDrag); }

  #clientPoint(event) {
    const matrix = this.svg.getScreenCTM?.(); if (!matrix) return { x: event.clientX, y: event.clientY };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()); return { x: point.x, y: point.y };
  }

  /* ASTRAL TRAVEL (dormant): GM drag of the ship marker along the route rail.
  #bindShipRailDrag(ship, a, b, initialFraction) {
    if (!this.routeVisualization?.draggable || !this.onShipDrag) return;
    const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
    const fractionAt = (event) => { const point = this.#clientPoint(event), dx = b.x - a.x, dy = b.y - a.y; return clamp(((point.x-a.x)*dx+(point.y-a.y)*dy)/Math.max(1e-9,dx*dx+dy*dy), 0, 1); };
    const move = (event) => { if (this.shipDrag?.id !== event.pointerId) return; event.preventDefault(); event.stopPropagation(); this.shipDrag.fraction = fractionAt(event); const f=this.shipDrag.fraction, point={x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f}; ship.setAttribute("transform",`translate(${point.x} ${point.y}) rotate(${angle})`); };
    const finish = (event) => { if (this.shipDrag?.id !== event.pointerId) return; event.preventDefault(); event.stopPropagation(); move(event); const fraction=this.shipDrag.fraction; this.shipDrag=null; ship.classList.remove("is-dragging"); ship.releasePointerCapture?.(event.pointerId); void this.onShipDrag(fraction); };
    ship.classList.add("is-draggable"); ship.addEventListener("pointerdown",(event)=>{ event.preventDefault(); event.stopPropagation(); this.shipDrag={id:event.pointerId,fraction:initialFraction}; ship.classList.add("is-dragging"); ship.setPointerCapture?.(event.pointerId); });
    ship.addEventListener("pointermove",move); ship.addEventListener("pointerup",finish); ship.addEventListener("pointercancel",finish);
  }
  */

  #buildScene() {
    this.svg.replaceChildren();
    this.svg.setAttribute("viewBox", "0 0 900 680");
    const defs = svgElement("defs");
    const filter = svgElement("filter", { id: "oscm-system-glow", x: "-80%", y: "-80%", width: "260%", height: "260%" });
    filter.append(svgElement("feGaussianBlur", { stdDeviation: 3.2, result: "blur" }));
    const merge = svgElement("feMerge");
    merge.append(svgElement("feMergeNode", { in: "blur" }), svgElement("feMergeNode", { in: "SourceGraphic" }));
    filter.append(merge); defs.append(filter); this.svg.append(defs);
    this.orbitLayer = svgElement("g", { class: "oscm-system-orbit-layer" });
    this.routeLayer = svgElement("g", { class: "oscm-system-route-layer" });
    this.objectLayer = svgElement("g", { class: "oscm-system-object-layer" });
    this.factionLayer = svgElement("g", { class: "oscm-faction-context-layer is-system", "aria-hidden": "true" });
    this.transitionLayer = svgElement("g", { class: "oscm-trajectory-transition-layer" });
    this.shipLayer = svgElement("g", { class: "oscm-ship-layer" });
    this.svg.append(this.orbitLayer, this.routeLayer, this.objectLayer, this.factionLayer, this.transitionLayer, this.shipLayer);
    this.#buildSky();

    const faction = factionPresentationForOwner(this.model.ownerFaction);
    this.factionAnchorObjects = this.model.objects.filter((object) => object.objectClass === "star");
    this.factionMarker = null;
    // The scholars' model carries no badge of ownership over the Sun.
    if (JURISDICTION_BADGES && faction && this.factionAnchorObjects.length && !this.factionAnchorObjects.some((object) => scholarEntry(object).kind === "sun")) {
      const marker = svgElement("g", { class: `oscm-faction-context-marker is-${faction.factionId}` });
      marker.append(svgElement("line", { class: "oscm-faction-context-leader", x1: 0, y1: 18, x2: 0, y2: 35 }));
      marker.append(createFactionEmblem(faction));
      const title = svgElement("title");
      title.textContent = `${faction.factionName} jurisdiction — ${systemDisplayName(this.model.name)}`;
      marker.append(title); this.factionLayer.append(marker); this.factionMarker = marker;
    }

    this.orbitNodes = [];
    for (const object of this.model.objects) {
      if (!object.parentObject || object.distanceAu <= 0 || scholarEntry(object).hidden) continue;
      const parentDisplay = this.displayPositions.get(object.parentObject.id) ?? { x: 0, y: 0, z: 0 };
      const display = this.displayPositions.get(object.id);
      const radius = Math.hypot(display.x - parentDisplay.x, display.y - parentDisplay.y, display.z - parentDisplay.z);
      const orbit = svgElement("path", {
        class: `oscm-system-orbit is-${object.distance_unit === "km" ? "local" : "planetary"}${object.objectClass === "belt" ? " is-region" : ""}`,
        fill: "none",
      });
      this.orbitLayer.append(orbit);
      this.orbitNodes.push({ orbit, center: parentDisplay, radius, object });
    }

    this.objectNodes = new Map();
    for (const object of this.model.objects) {
      if (object.objectClass === "barycenter" || scholarEntry(object).hidden) continue;
      const known = scholarEntry(object);
      const group = svgElement("g", {
        class: `oscm-system-object is-${object.objectClass}${object.selectable ? " is-selectable" : ""}`,
        tabindex: object.selectable ? 0 : -1,
        role: object.selectable ? "button" : "img",
        "aria-label": `${objectDisplayName(object)}, ${known.label}`,
        "data-object-id": object.id,
      });
      const radius = baseRadius(object), colors = paletteFor(object);
      const hit = svgElement("circle", { class: "oscm-system-hit-target", r: Math.max(13, radius + 7), fill: "transparent" });
      const selection = svgElement("circle", { class: "oscm-system-selection-ring", r: radius + 5, fill: "none" });
      const glyph = svgElement("g", { class: "oscm-system-glyph" });
      appendGlyph(glyph, object, radius, colors);
      const label = svgElement("text", { class: "oscm-system-object-label", x: radius + 8, y: -4 }); label.textContent = objectDisplayName(object);
      const type = svgElement("text", { class: "oscm-system-object-type", x: radius + 8, y: 9 }); type.textContent = known.label;
      const title = svgElement("title"); title.textContent = `${objectDisplayName(object)}, ${known.label}; parent: ${parentDisplayName(object)}`;
      group.append(hit, selection, glyph, label, type, title); this.objectLayer.append(group);
      this.objectNodes.set(object.id, { group, glyph, label, type, selection, object });
      if (object.selectable) {
        group.addEventListener("click", (event) => {
          event.stopPropagation(); if (performance.now() < this.suppressClickUntil) return;
          const now = performance.now();
          if (this.lastActivation?.id === object.id && now - this.lastActivation.at < 330) {
            clearTimeout(this.pendingSelectionTimer); this.pendingSelectionTimer = null; this.lastActivation = null;
            this.activationSuppressedUntil = now + 450; this.onObjectActivate(object); return;
          }
          this.lastActivation = { id: object.id, at: now };
          clearTimeout(this.pendingSelectionTimer); this.pendingSelectionTimer = setTimeout(() => { this.pendingSelectionTimer = null; this.#select(object); }, 260);
        });
        group.addEventListener("dblclick", (event) => {
          event.preventDefault(); event.stopPropagation(); clearTimeout(this.pendingSelectionTimer); this.pendingSelectionTimer = null;
          if (performance.now() < this.activationSuppressedUntil) return;
          this.activationSuppressedUntil = performance.now() + 450; this.onObjectActivate(object);
        });
        group.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); this.#select(object); } });
      } else if (object.objectClass === "belt") {
        group.addEventListener("click", (event) => {
          event.stopPropagation(); const now = performance.now();
          if (this.lastActivation?.id === object.id && now - this.lastActivation.at < 330) { this.lastActivation = null; this.activationSuppressedUntil = now + 450; this.onObjectActivate(object); }
          else this.lastActivation = { id: object.id, at: now };
        });
        group.addEventListener("dblclick", (event) => { event.preventDefault(); event.stopPropagation(); if (performance.now() >= this.activationSuppressedUntil) this.onObjectActivate(object); });
      }
    }
  }

  #attachEvents() {
    const distance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
    const beginDrag = (pointer) => { this.drag = { ...pointer, yaw: this.state.yaw, pitch: this.state.pitch }; this.pinch = null; };
    const beginPinch = () => {
      const points = [...this.activePointers.values()].slice(0, 2); if (points.length < 2) return;
      this.drag = null; this.pinch = { ids: points.map((p) => p.id), distance: distance(points[0], points[1]), zoom: this.state.zoom };
      this.suppressClickUntil = performance.now() + 350;
    };
    this._listeners = {
      pointerdown: (event) => {
        const pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startsOnObject: Boolean(event.target.closest?.(".oscm-system-object")) };
        this.activePointers.set(pointer.id, pointer); if (!pointer.startsOnObject) this.svg.setPointerCapture?.(pointer.id);
        if (this.activePointers.size === 1) beginDrag(pointer); else beginPinch();
      },
      pointermove: (event) => {
        const pointer = this.activePointers.get(event.pointerId); if (!pointer) return;
        pointer.x = event.clientX; pointer.y = event.clientY;
        if (this.pinch) {
          const [a, b] = this.pinch.ids.map((id) => this.activePointers.get(id)); if (!a || !b) return;
          const requestedZoom = this.pinch.zoom * distance(a, b) / this.pinch.distance;
          if (requestedZoom < .34 && !this.exitTriggered) { this.exitTriggered = true; this.onExitRequested(); return; }
          this.state.zoom = clamp(requestedZoom, .38, 4.2);
          this.suppressClickUntil = performance.now() + 350; this.render(); return;
        }
        if (!this.drag || this.drag.id !== event.pointerId) return;
        const dx = event.clientX - this.drag.x, dy = event.clientY - this.drag.y;
        if (Math.hypot(dx, dy) > 5) { this.suppressClickUntil = performance.now() + 250; this.svg.setPointerCapture?.(event.pointerId); }
        this.state.yaw = this.drag.yaw + dx * .008;
        this.state.pitch = clamp(this.drag.pitch + dy * .008, -1.45, 1.45); this.render();
      },
      pointerup: (event) => {
        if (!this.activePointers.delete(event.pointerId)) return; this.svg.releasePointerCapture?.(event.pointerId);
        if (this.activePointers.size >= 2) beginPinch();
        else if (this.activePointers.size === 1) beginDrag([...this.activePointers.values()][0]);
        else { this.drag = null; this.pinch = null; }
      },
      pointercancel: (event) => this._listeners.pointerup(event),
      wheel: (event) => {
        event.preventDefault();
        const requestedZoom = this.state.zoom * Math.exp(-event.deltaY * .0012);
        if (event.deltaY > 0 && requestedZoom < .34 && !this.exitTriggered) { this.exitTriggered = true; this.onExitRequested(); return; }
        this.state.zoom = clamp(requestedZoom, .38, 4.2);
        if (event.deltaY < 0 && this.state.zoom > 4.1 && this.origin && performance.now() >= this.activationSuppressedUntil) {
          this.activationSuppressedUntil = performance.now() + 600; this.onObjectActivate(this.origin); return;
        }
        this.render();
      },
      dblclick: (event) => { if (!event.target.closest?.(".oscm-system-object")) this.resetView(); },
    };
    for (const [name, handler] of Object.entries(this._listeners)) this.svg.addEventListener(name, handler, name === "wheel" ? { passive: false } : undefined);
  }

  #select(object) {
    if (!this.origin || this.destination) { this.origin = object; this.destination = null; }
    else if (this.origin.id === object.id) { this.origin = null; this.destination = null; }
    else this.destination = object;
    // The camera follows the selection: the body just chosen, or Mictir when nothing is.
    this.#pivotTo(this.destination ?? this.origin);
    this.#syncSelection(); this.onSelectionChange(this.origin, this.destination); this.render();
  }

  #syncSelection() {
    for (const { group, object } of this.objectNodes.values()) {
      group.classList.toggle("is-origin", this.origin?.id === object.id);
      group.classList.toggle("is-destination", this.destination?.id === object.id);
    }
  }

  #project(worldPoint) {
    const { yaw, pitch, zoom, panX, panY } = this.state, point = recenterPoint(worldPoint, this.pivot);
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw), cosP = Math.cos(pitch), sinP = Math.sin(pitch);
    const x1 = point.x * cosY - point.z * sinY, z1 = point.x * sinY + point.z * cosY;
    const y2 = point.y * cosP - z1 * sinP, z2 = point.y * sinP + z1 * cosP;
    const scale = 85 * zoom, perspective = 850 / (850 - z2 * scale * .16);
    return { x: 450 + panX + x1 * scale * perspective, y: 340 + panY - y2 * scale * perspective, z: z2, scale: perspective };
  }

  /** Inside-looking-out celestial sphere, drawn behind everything else. */
  #buildSky() {
    this.skyLayer = svgElement("g", { class: "oscm-sky-layer", "aria-hidden": "true" });
    this.svg.insertBefore(this.skyLayer, this.orbitLayer);
    if (!this.starfield) return;
    const defs = svgElement("defs");
    const glow = svgElement("radialGradient", { id: "oscm-sky-glow" });
    glow.append(svgElement("stop", { offset: "0%", "stop-color": "#dfe8ff", "stop-opacity": 1 }), svgElement("stop", { offset: "100%", "stop-color": "#dfe8ff", "stop-opacity": 0 }));
    defs.append(glow);
    this.skyBand = svgElement("g", { class: "oscm-sky-band" });
    this.skySister = svgElement("ellipse", { class: "oscm-sky-sister-galaxy", fill: "url(#oscm-sky-glow)" });
    const title = svgElement("title"); title.textContent = "Distant spiral galaxy"; this.skySister.append(title);
    this.skyStars = STAR_CLASSES.map((entry, classIndex) => Array.from({ length: TWINKLE_GROUPS }, (_, twinkle) => {
      const path = svgElement("path", { class: `oscm-sky-stars is-class-${classIndex} is-twinkle-${twinkle}`, fill: "none", stroke: "#ffffff", "stroke-linecap": "round", "stroke-width": entry.size, "stroke-opacity": entry.opacity });
      return path;
    }));
    this.skyLayer.append(defs, this.skyBand, this.skySister, ...this.skyStars.flat());
  }

  #renderSky() {
    if (!this.starfield || !this.skyStars) return;
    const frame = buildSkyFrame(this.starfield, this.state);
    for (const group of frame.stars) this.skyStars[group.classIndex][group.twinkle].setAttribute("d", group.d);
    this.skyBand.replaceChildren(...frame.band.map((sample) => svgElement("circle", { cx: sample.x.toFixed(1), cy: sample.y.toFixed(1), r: sample.r.toFixed(1), fill: "url(#oscm-sky-glow)", opacity: sample.opacity.toFixed(3) })));
    if (frame.sister) {
      const { x, y, rx, ry, rotation } = frame.sister;
      for (const [key, value] of Object.entries({ cx: x.toFixed(1), cy: y.toFixed(1), rx: rx.toFixed(1), ry: ry.toFixed(1), transform: `rotate(${rotation.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})` })) this.skySister.setAttribute(key, value);
      this.skySister.removeAttribute("display");
    } else this.skySister.setAttribute("display", "none");
  }

  render() {
    this.#renderSky();
    for (const node of this.orbitNodes) {
      const points = Array.from({ length: 49 }, (_, index) => {
        const local = orbitVector(node.object, node.radius, index * 7.5, this.model.referenceTimestampMs);
        return this.#project({ x: node.center.x + local.x, y: node.center.y + local.y, z: node.center.z + local.z });
      });
      node.orbit.setAttribute("d", points.map((point, index) => `${index ? "L" : "M"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ") + " Z");
    }
    const projected = [];
    for (const node of this.objectNodes.values()) {
      const point = this.#project(this.displayPositions.get(node.object.id)); projected.push({ ...node, point });
      node.group.setAttribute("transform", `translate(${point.x} ${point.y})`);
      node.glyph.setAttribute("transform", `scale(${clamp(point.scale, .72, 1.3)})`);
    }
    projected.sort((a, b) => a.point.z - b.point.z).forEach((node) => this.objectLayer.append(node.group));
    if (this.factionMarker && this.factionAnchorObjects.length) {
      const anchors = this.factionAnchorObjects.map((object) => this.#project(this.displayPositions.get(object.id)));
      const x = anchors.reduce((sum, point) => sum + point.x, 0) / anchors.length;
      const y = Math.min(...anchors.map((point) => point.y));
      this.factionMarker.setAttribute("transform", `translate(${x.toFixed(2)} ${(y - 46).toFixed(2)})`);
    }
    this.routeLayer.replaceChildren();
    this.transitionLayer.replaceChildren();
    this.shipLayer.replaceChildren();
    /* ASTRAL TRAVEL (dormant): route line, trajectory markers and ship marker between two selected objects.
    const routeOrigin = this.routeVisualization?.origin ?? this.origin;
    const routeDestination = this.routeVisualization?.destination ?? this.destination;
    if (routeOrigin && routeDestination) {
      const a = this.#project(this.displayPositions.get(routeOrigin.id) ?? routeOrigin), b = this.#project(this.displayPositions.get(routeDestination.id) ?? routeDestination);
      this.routeLayer.append(svgElement("line", { class: "oscm-system-route-line", x1: a.x, y1: a.y, x2: b.x, y2: b.y }));
      const pointAt = (fraction) => ({ x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction });
      for (const marker of this.routeVisualization?.markers ?? []) {
        const point = pointAt(marker.routeFraction), dot = svgElement("circle", { class: `oscm-trajectory-marker is-${marker.kind}`, cx: point.x, cy: point.y, r: 6.5 });
        const title = svgElement("title"); title.textContent = marker.label; dot.append(title); this.transitionLayer.append(dot);
      }
      if (Number.isFinite(this.routeVisualization?.shipFraction)) {
        const point = pointAt(this.routeVisualization.shipFraction), angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
        const ship = svgElement("g", { class: "oscm-active-ship-control", transform: `translate(${point.x} ${point.y}) rotate(${angle})` });
        ship.append(svgElement("circle", { class: "oscm-active-ship-hit", r: 13 }), svgElement("polygon", { class: "oscm-active-ship-marker", points: "8,0 -6,-5 -4,0 -6,5" }));
        this.#bindShipRailDrag(ship, a, b, this.routeVisualization.shipFraction); this.shipLayer.append(ship);
      }
    }
    */
  }
}
