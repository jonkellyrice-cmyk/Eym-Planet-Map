const SVG_NS = "http://www.w3.org/2000/svg";

function svgElement(name, attrs = {}) {
  const el = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

export const FACTION_PRESENTATIONS = Object.freeze({
  eventide: Object.freeze({ factionId: "eventide", factionName: "Eventide", emblem: "eventide" }),
  mandate: Object.freeze({ factionId: "mandate", factionName: "XUANJIA Mandate", emblem: "mandate" }),
  conclave: Object.freeze({ factionId: "conclave", factionName: "Adainian Conclave", emblem: "conclave" }),
  accords: Object.freeze({ factionId: "accords", factionName: "Signatories of the Accords Paramount", emblem: "accords" }),
  union: Object.freeze({ factionId: "union", factionName: "Union", emblem: "union" }),
});

/** Resolve canonical CSV ownership names to the existing faction-emblem contract. */
export function factionPresentationForOwner(ownerFaction) {
  const owner = String(ownerFaction ?? "").trim().toLowerCase();
  if (owner.includes("eventide")) return FACTION_PRESENTATIONS.eventide;
  if (owner.includes("accords")) return FACTION_PRESENTATIONS.accords;
  if (owner.includes("mandate")) return FACTION_PRESENTATIONS.mandate;
  if (owner.includes("conclave")) return FACTION_PRESENTATIONS.conclave;
  if (owner.includes("union")) return FACTION_PRESENTATIONS.union;
  return null;
}

function starPoints(points = 8, outerRadius = 10, innerRadius = 4.5) {
  const result = [];
  const step = Math.PI / points;
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    const angle = -Math.PI / 2 + i * step;
    result.push(`${(Math.cos(angle) * radius).toFixed(2)},${(Math.sin(angle) * radius).toFixed(2)}`);
  }
  return result.join(" ");
}

function addBadge(group, { fill, stroke, radius = 17 }) {
  group.append(svgElement("circle", {
    class: "oscm-capital-badge",
    cx: 0,
    cy: 0,
    r: radius,
    fill,
    stroke,
    "stroke-width": 1.6,
  }));
}

function drawEventide(group) {
  const gold = "#f1b83a";
  addBadge(group, { fill: "#08275d", stroke: gold });
  group.append(svgElement("line", { x1: -11, y1: 5, x2: 11, y2: 5, stroke: gold, "stroke-width": 1.8 }));
  group.append(svgElement("path", {
    d: "M -7.5 5 A 7.5 7.5 0 0 1 7.5 5 Z",
    fill: gold,
  }));
  const rays = [
    [-8.5, -1.5, -12, -4.7],
    [-4.2, -5.0, -6.1, -10.0],
    [0, -6.0, 0, -12.3],
    [4.2, -5.0, 6.1, -10.0],
    [8.5, -1.5, 12, -4.7],
  ];
  for (const [x1, y1, x2, y2] of rays) {
    group.append(svgElement("line", { x1, y1, x2, y2, stroke: gold, "stroke-width": 1.6, "stroke-linecap": "round" }));
  }
}

function drawMandate(group) {
  const red = "#b90f25";
  const gold = "#f0b82e";
  addBadge(group, { fill: red, stroke: gold });
  const petalPath = "M 0 -3.0 C -3.7 -5.0 -4.0 -9.7 0 -13.1 C 4.0 -9.7 3.7 -5.0 0 -3.0 Z";
  for (const rotation of [0, 72, 144, 216, 288]) {
    group.append(svgElement("path", { d: petalPath, fill: gold, transform: `rotate(${rotation})` }));
  }
  group.append(svgElement("circle", { cx: 0, cy: 0, r: 3.2, fill: red, stroke: gold, "stroke-width": 1.5 }));
}

function drawConclave(group) {
  const gold = "#f2bd17";
  const black = "#101010";
  addBadge(group, { fill: gold, stroke: black });
  for (let rotation = 0; rotation < 360; rotation += 45) {
    group.append(svgElement("path", {
      d: "M -1.45 -9.8 L 0 -14.6 L 1.45 -9.8 Z",
      fill: black,
      transform: `rotate(${rotation})`,
    }));
  }
  group.append(svgElement("circle", { cx: 0, cy: 0, r: 9.6, fill: black }));
}

function drawAccords(group) {
  const green = "#0d5c3e";
  const cream = "#f4f0df";
  addBadge(group, { fill: green, stroke: cream });
  for (const rotation of [0, 60, -60]) {
    group.append(svgElement("ellipse", {
      cx: 0,
      cy: 0,
      rx: 12.2,
      ry: 7.0,
      fill: "none",
      stroke: cream,
      "stroke-width": 1.45,
      transform: `rotate(${rotation})`,
    }));
  }
  group.append(svgElement("polygon", { points: starPoints(8, 8.7, 3.6), fill: cream }));
}

function drawUnion(group) {
  const red = "#c31345";
  const white = "#ffffff";
  group.append(svgElement("rect", {
    class: "oscm-capital-badge",
    x: -20,
    y: -14,
    width: 40,
    height: 28,
    rx: 4,
    fill: red,
    stroke: "rgba(255,255,255,0.82)",
    "stroke-width": 1.2,
  }));
  group.append(svgElement("polygon", { points: "-16,0 -12,-7 -12,7", fill: white }));
  group.append(svgElement("polygon", { points: "-11,-7 -4,-7 1,0 -4,7 -11,7 -7,0", fill: white }));
  for (const y of [-6, 0, 6]) {
    group.append(svgElement("rect", { x: 5, y: y - 1.4, width: 11.5, height: 2.8, fill: white }));
  }
}

function drawEmblem(group, emblem) {
  if (emblem === "eventide") return drawEventide(group);
  if (emblem === "mandate") return drawMandate(group);
  if (emblem === "conclave") return drawConclave(group);
  if (emblem === "accords") return drawAccords(group);
  if (emblem === "union") return drawUnion(group);
}

/** Create one screen-upright emblem group for cluster, system, or body views. */
export function createFactionEmblem(ownerOrPresentation, className = "oscm-faction-emblem") {
  const presentation = typeof ownerOrPresentation === "string"
    ? factionPresentationForOwner(ownerOrPresentation)
    : ownerOrPresentation;
  if (!presentation) return null;
  const group = svgElement("g", {
    class: `${className} is-${presentation.factionId}`,
    "data-faction-id": presentation.factionId,
  });
  drawEmblem(group, presentation.emblem);
  return group;
}
