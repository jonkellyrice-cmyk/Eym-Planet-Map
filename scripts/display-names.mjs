// What people on Eym call things. The registry (its `system` and `object` columns) calls the star and its system,
// the home world and the four wandering stars by those same names (Mitkear, Eym, Bruthi, Esonth, Lilta, Iarn;
// since 20 November 2026), so only the two moons still have a display name of their own. The registry's names stay
// stable keys: data files and asset paths are derived from them (seeds are drawn as scripts/seed-words.mjs says).

/** `${system}/${object}` → display name, where it differs from the registry's. */
export const OBJECT_DISPLAY_NAMES = Object.freeze({
  "Mitkear/Sun": "Mitkear",
  "Mitkear/White Moon": "Austarm",
  "Mitkear/Red Moon": "Chatarm",
});

/** Registry system name → display name for the whole system. */
export const SYSTEM_DISPLAY_NAMES = Object.freeze({
  Mitkear: "Mitkear",
});

export function displayNameFor(system, name) {
  return OBJECT_DISPLAY_NAMES[`${system}/${name}`] ?? name;
}

/** Display name of a system object (an object from buildSystemModel, or a registry row). */
export function objectDisplayName(object) {
  return displayNameFor(object?.system, object?.name ?? object?.object);
}

/** Display name of a system object's parent; parents are named in the same system. */
export function parentDisplayName(object) {
  return object?.parent ? displayNameFor(object.system, object.parent) : object?.parent;
}

export function systemDisplayName(system) {
  return SYSTEM_DISPLAY_NAMES[system] ?? `${system} System`;
}
