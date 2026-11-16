// The heavens as Eym's scholars picture them: a model like those of Earth's Renaissance. They know the
// Sun, the world, its two moons and four wandering stars, and the order they go round in. They do not know
// the true distances, that the wanderers are worlds, or that the greatest of them has a moon of its own.
// The registry keeps the truth (orbits, sizes, surfaces) for the calendar, the sky and the tides; this
// module says what the system map shows of it. Pure.

/** `${system}/${object}` → what the scholars take it for. */
const KNOWN = Object.freeze({
  "Abydos/Abydos": { kind: "sun", label: "the Sun", note: "The lamp of the heavens, about which the world and the wandering stars turn." },
  "Abydos/Sun": { kind: "sun", label: "the Sun", note: "The lamp of the heavens, about which the world and the wandering stars turn." },
  "Abydos/Eventide": { kind: "world", label: "the world", note: "The world of land and sea. Double-click to open its map.", openable: true },
  "Abydos/White Moon": { kind: "moon", label: "the white moon", note: "The greater moon; its phases count the month of 28 days." },
  "Abydos/Red Moon": { kind: "moon", label: "the red moon", note: "The lesser, swifter moon, rust-red, circling inside the white." },
  "Abydos/Tribune": { kind: "wanderer", label: "wandering star", note: "The greatest of the four wandering stars, slow and cream-gold.", rank: 0 },
  "Abydos/Thraximundus": { kind: "wanderer", label: "wandering star", note: "A steady blue-grey wandering star.", rank: 1 },
  "Abydos/Ramses": { kind: "wanderer", label: "wandering star", note: "A quick, rust-coloured wandering star that keeps near the Sun.", rank: 2 },
  "Abydos/Kandahar": { kind: "wanderer", label: "wandering star", note: "The faintest of the wandering stars, ochre and slow.", rank: 3 },
  // Too faint to see without a glass: not on the scholars' model at all.
  "Abydos/Enoch": { kind: "unknown", hidden: true },
});

/** What the scholars make of a system object: { kind, label, note, openable, hidden, rank }. */
export function scholarEntry(object) {
  const entry = KNOWN[`${object?.system}/${object?.name ?? object?.object}`];
  if (entry) return { openable: false, hidden: false, note: "", ...entry };
  // Anything else in a registry keeps its own description and can be opened as before.
  return { kind: object?.objectClass ?? "body", label: object?.type ?? "", note: object?.hz_or_role ?? "", openable: true, hidden: false };
}

/** Rings of the model, in display units: the wanderers and the world about the Sun, moons about their world. */
export const ORRERY = Object.freeze({ firstRing: 1.3, ringStep: 0.72, firstMoonRing: 0.42, moonRingStep: 0.2 });

/** How many bodies the scholars' model shows. */
export const knownCount = (objects) => objects.filter((o) => o.objectClass !== "barycenter" && !scholarEntry(o).hidden).length;

/** Which ring a body rides, counted outward among the bodies the scholars know about the same centre. */
export function ringIndex(object, objects) {
  const siblings = objects.filter((o) => o.parentObject === object.parentObject && o.distanceAu > 0 && o.objectClass !== "barycenter" && !scholarEntry(o).hidden).sort((a, b) => a.distanceAu - b.distanceAu);
  return Math.max(0, siblings.indexOf(object));
}

/** The radius of a body's ring in the model: evenly spaced, whatever its true distance. */
export function ringRadius(object, objects) {
  const k = ringIndex(object, objects), local = object.distance_unit === "km";
  return local ? ORRERY.firstMoonRing + ORRERY.moonRingStep * k : ORRERY.firstRing + ORRERY.ringStep * k;
}
