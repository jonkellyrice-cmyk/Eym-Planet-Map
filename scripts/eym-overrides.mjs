// Hand-authored exceptions to what Eym's rules give (data/eym/overrides.json). The rules make the world; where a
// person judges a result wrong for the setting, an override states the exception, where it holds and why. They are
// applied last, by the cartography (scripts/eym-cartography.mjs), and every change report lists the ones in force.
//
// An override: { id, note, layer, value | add | scale, box: { south, north, west, east } | places: [[lat, lon], …],
// sea?: true }.
//   - layer "temperatureC" or "precipitationMm": `value` sets it, `add` shifts it, `scale` multiplies it. These act
//     before the biome is chosen, so the biome, soil and resources follow from the changed climate.
//   - layer "biome", "soil" or "resource": `value` sets the outcome itself.
// A box holds every 1° cell whose centre lies in it (west to east, across the date line if west > east); a place
// holds the cell it falls in. Land cells only, unless `sea` is true.
// Pure functions.

export const OVERRIDE_LAYERS = Object.freeze({ temperatureC: "climate", precipitationMm: "climate", biome: "outcome", soil: "outcome", resource: "outcome" });

/** The problems with an overrides document ([] when it is sound). */
export function overrideProblems(doc) {
  const out = [], seen = new Set();
  if (!doc || !Array.isArray(doc.overrides)) return ["the overrides file must hold an `overrides` list"];
  for (const [k, o] of doc.overrides.entries()) {
    const name = o?.id ? `override ${o.id}` : `override #${k + 1}`;
    if (!o?.id || typeof o.id !== "string") out.push(`${name}: needs an id`); else if (seen.has(o.id)) out.push(`${name}: the id is used twice`); else seen.add(o.id);
    if (!o?.note || String(o.note).trim().length < 10) out.push(`${name}: needs a note saying why (the owner's or the author's decision)`);
    const kind = OVERRIDE_LAYERS[o?.layer]; if (!kind) { out.push(`${name}: layer must be one of ${Object.keys(OVERRIDE_LAYERS).join(", ")}`); continue; }
    const given = ["value", "add", "scale"].filter((key) => o[key] !== undefined);
    if (given.length !== 1) out.push(`${name}: give exactly one of value, add, scale`);
    else if (kind === "outcome" && (given[0] !== "value" || typeof o.value !== "string")) out.push(`${name}: a ${o.layer} override sets a named value`);
    else if (kind === "climate" && !Number.isFinite(o[given[0]])) out.push(`${name}: ${given[0]} must be a number`);
    const box = o.box, places = o.places;
    if (Boolean(box) === Boolean(places)) out.push(`${name}: give a box or a list of places (one of them)`);
    else if (box && !["south", "north", "west", "east"].every((key) => Number.isFinite(box[key]))) out.push(`${name}: the box needs south, north, west and east`);
    else if (box && box.south > box.north) out.push(`${name}: the box's south is north of its north`);
    else if (places && !(Array.isArray(places) && places.length && places.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)))) out.push(`${name}: places are [latitude, longitude] pairs`);
  }
  return out;
}

const inBox = (box, lat, lon) => lat >= box.south && lat <= box.north && (box.west <= box.east ? lon >= box.west && lon <= box.east : lon >= box.west || lon <= box.east);

/**
 * The overrides ready to apply to 1° cells ({ lat, lon, ocean, landCovered, … }): { climate(cell), outcome(cell),
 * applied } where `applied` counts the cells each override touched (by id) once the cells have been walked.
 * Throws on an unsound document.
 */
export function prepareOverrides(doc, resolutionDeg = 1) {
  const list = doc?.overrides ?? [], problems = list.length ? overrideProblems(doc) : [];
  if (problems.length) throw new Error(`data/eym/overrides.json: ${problems.join("; ")}`);
  const applied = Object.fromEntries(list.map((o) => [o.id, 0])), touched = new Map();
  const cellOf = (lat, lon) => `${Math.floor((lat + 90) / resolutionDeg)},${Math.floor(((((lon + 180) % 360) + 360) % 360) / resolutionDeg)}`;
  const places = new Map(list.filter((o) => o.places).map((o) => [o.id, new Set(o.places.map(([lat, lon]) => cellOf(lat, lon)))]));
  const holds = (o, cell) => (o.sea || cell.landCovered || cell.ocean === false) && (o.box ? inBox(o.box, cell.lat, cell.lon) : places.get(o.id).has(cellOf(cell.lat, cell.lon)));
  const count = (o, cell) => { const key = `${o.id}|${cellOf(cell.lat, cell.lon)}`; if (!touched.has(key)) { touched.set(key, 1); applied[o.id] += 1; } };
  const run = (kind) => (cell) => {
    for (const o of list) {
      if (OVERRIDE_LAYERS[o.layer] !== kind || !holds(o, cell)) continue;
      cell[o.layer] = o.value !== undefined ? o.value : o.add !== undefined ? cell[o.layer] + o.add : cell[o.layer] * o.scale;
      count(o, cell);
    }
  };
  return { climate: run("climate"), outcome: run("outcome"), applied, any: list.length > 0 };
}

/** Each override in a sentence, for the change report. */
export function describeOverrides(doc) {
  return (doc?.overrides ?? []).map((o) => {
    const what = o.value !== undefined ? `set to ${o.value}` : o.add !== undefined ? `${o.add >= 0 ? "raised" : "lowered"} by ${Math.abs(o.add)}` : `multiplied by ${o.scale}`;
    const where = o.box ? `${o.box.south}° to ${o.box.north}° latitude, ${o.box.west}° to ${o.box.east}° longitude` : `${o.places.length} place${o.places.length === 1 ? "" : "s"}`;
    return `${o.id}: ${o.layer} ${what} over ${where}${o.sea ? " (sea included)" : ""}. Why: ${o.note}`;
  });
}
