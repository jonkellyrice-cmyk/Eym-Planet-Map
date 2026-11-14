// What people on Eym call things. Canonical names (the registry's `system` and `object` columns) stay
// as stable keys: data files, seeds and asset paths are derived from them. Only what is shown on
// screen goes through these lookups.

/** `${system}/${object}` → display name. */
export const OBJECT_DISPLAY_NAMES = Object.freeze({
  "Abydos/Abydos": "Mitkear",
  "Abydos/Sun": "Mitkear",
  "Abydos/Eventide": "Eym",
  "Abydos/White Moon": "Austarm",
  "Abydos/Red Moon": "Chatarm",
  // The four wandering stars, largest to smallest.
  "Abydos/Tribune": "Iarn",
  "Abydos/Thraximundus": "Esonth",
  "Abydos/Ramses": "Bruthi",
  "Abydos/Kandahar": "Lilta",
});

/** Registry system name → display name for the whole system. */
export const SYSTEM_DISPLAY_NAMES = Object.freeze({
  Abydos: "Mitkear",
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
