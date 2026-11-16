// Architecture dossiers: the GM's notes on how each people builds, written once and reused. A dossier is
// filed in folders, can be archived (kept but hidden) or deleted, and is linked to the areas it applies
// to, so that a map made there again picks it up by itself. Its text goes into the image prompt.
// Pure functions over a plain library object { version, folders, dossiers }; every change returns a new
// library (the app stores it in a world setting).

import { greatCircleKm } from "./eym-surface.mjs";
import { BUILDING_STYLES, STYLE_IDS } from "./eym-building-styles.mjs";

export const ARCHITECTURE_SETTING = "architectureDossiers";
export const DEFAULT_LINK_RADIUS_KM = 5;
const MAX_TEXT = 4000, MAX_NAME = 120;

/** The parts of a dossier, in prompt order. `overview` is the free description. */
export const DOSSIER_FIELDS = Object.freeze([
  { key: "people", label: "People / culture", short: true },
  { key: "overview", label: "Overview" },
  { key: "materials", label: "Building materials" },
  { key: "roofs", label: "Roofs" },
  { key: "streets", label: "Streets, paving and layout" },
  { key: "defences", label: "Walls and defences" },
  { key: "sacred", label: "Shrines and temples" },
  { key: "details", label: "Details, motifs and decoration" },
  { key: "colours", label: "Colours" },
]);

export const emptyLibrary = () => ({ version: 1, folders: [], dossiers: [] });

const clean = (text, max = MAX_TEXT) => String(text ?? "").replace(/\r\n?/g, "\n").trim().slice(0, max);
const nameOf = (text, fallback) => clean(text, MAX_NAME) || fallback;

/** Accept whatever is stored (or nothing) and return a well-formed library. */
export function normalizeLibrary(raw) {
  const lib = raw && typeof raw === "object" ? raw : {};
  const folders = (Array.isArray(lib.folders) ? lib.folders : []).filter((f) => f?.id).map((f) => ({ id: String(f.id), name: nameOf(f.name, "Folder"), parentId: f.parentId ? String(f.parentId) : null }));
  const ids = new Set(folders.map((f) => f.id));
  for (const f of folders) if (f.parentId && (!ids.has(f.parentId) || f.parentId === f.id)) f.parentId = null;
  const dossiers = (Array.isArray(lib.dossiers) ? lib.dossiers : []).filter((d) => d?.id).map((d) => ({
    id: String(d.id), name: nameOf(d.name, "Untitled dossier"), folderId: d.folderId && ids.has(String(d.folderId)) ? String(d.folderId) : null,
    ...Object.fromEntries(DOSSIER_FIELDS.map(({ key }) => [key, clean(d[key])])), style: STYLE_IDS.includes(d.style) && d.style !== "default" ? d.style : "", archived: Boolean(d.archived),
    areas: (Array.isArray(d.areas) ? d.areas : []).filter((a) => Number.isFinite(a?.lat) && Number.isFinite(a?.lon)).map((a) => ({ lat: a.lat, lon: a.lon, radiusKm: Number(a.radiusKm) > 0 ? Number(a.radiusKm) : DEFAULT_LINK_RADIUS_KM, label: clean(a.label, MAX_NAME) })),
    createdAt: d.createdAt ?? null, updatedAt: d.updatedAt ?? null,
  }));
  return { version: 1, folders, dossiers };
}

const withLib = (lib, change) => { const next = normalizeLibrary(lib); change(next); return normalizeLibrary(next); };
const must = (item, what) => { if (!item) throw new Error(`no such ${what}`); return item; };

// ---------------------------------------------------------------- folders

export function createFolder(lib, { name, parentId = null }, id) {
  return withLib(lib, (next) => { if (parentId) must(next.folders.find((f) => f.id === parentId), "folder"); next.folders.push({ id, name: nameOf(name, "New folder"), parentId }); });
}
export function renameFolder(lib, id, name) { return withLib(lib, (next) => { must(next.folders.find((f) => f.id === id), "folder").name = nameOf(name, "Folder"); }); }

/** Whether `folderId` is `ancestorId` or inside it. */
function within(lib, folderId, ancestorId) { for (let f = folderId, guard = 0; f && guard < 100; guard += 1) { if (f === ancestorId) return true; f = lib.folders.find((x) => x.id === f)?.parentId ?? null; } return false; }

export function moveFolder(lib, id, parentId) {
  return withLib(lib, (next) => { const folder = must(next.folders.find((f) => f.id === id), "folder"); if (parentId && within(next, parentId, id)) throw new Error("a folder cannot go inside itself"); folder.parentId = parentId || null; });
}
/** Delete a folder; what was in it moves up to its parent (nothing is lost). */
export function deleteFolder(lib, id) {
  return withLib(lib, (next) => {
    const folder = must(next.folders.find((f) => f.id === id), "folder");
    for (const f of next.folders) if (f.parentId === id) f.parentId = folder.parentId;
    for (const d of next.dossiers) if (d.folderId === id) d.folderId = folder.parentId;
    next.folders = next.folders.filter((f) => f.id !== id);
  });
}
/** "Caren / Molkath" for a folder (empty for the top level). */
export function folderPath(lib, folderId) {
  const parts = []; for (let f = folderId, guard = 0; f && guard < 100; guard += 1) { const folder = lib.folders.find((x) => x.id === f); if (!folder) break; parts.unshift(folder.name); f = folder.parentId; }
  return parts.join(" / ");
}

// ---------------------------------------------------------------- dossiers

export function createDossier(lib, fields, id, now) {
  return withLib(lib, (next) => { next.dossiers.push({ ...Object.fromEntries(DOSSIER_FIELDS.map(({ key }) => [key, fields?.[key] ?? ""])), id, name: nameOf(fields?.name, "New dossier"), folderId: fields?.folderId ?? null, archived: false, areas: [], createdAt: now, updatedAt: now }); });
}
export function updateDossier(lib, id, fields, now) {
  return withLib(lib, (next) => {
    const d = must(next.dossiers.find((x) => x.id === id), "dossier");
    if ("name" in fields) d.name = nameOf(fields.name, d.name);
    if ("folderId" in fields) d.folderId = fields.folderId || null;
    for (const { key } of DOSSIER_FIELDS) if (key in fields) d[key] = clean(fields[key]);
    if ("style" in fields) d.style = String(fields.style ?? "");
    d.updatedAt = now;
  });
}
export function archiveDossier(lib, id, archived = true, now = null) { return withLib(lib, (next) => { const d = must(next.dossiers.find((x) => x.id === id), "dossier"); d.archived = Boolean(archived); d.updatedAt = now ?? d.updatedAt; }); }
export function deleteDossier(lib, id) { return withLib(lib, (next) => { must(next.dossiers.find((x) => x.id === id), "dossier"); next.dossiers = next.dossiers.filter((d) => d.id !== id); }); }
export function moveDossier(lib, id, folderId) { return withLib(lib, (next) => { must(next.dossiers.find((x) => x.id === id), "dossier").folderId = folderId || null; }); }

// ---------------------------------------------------------------- areas

/** Link a dossier to an area (replacing a link to the same spot); a place inside it will pick the dossier. */
export function linkArea(lib, id, { lat, lon, radiusKm = DEFAULT_LINK_RADIUS_KM, label = "" }) {
  return withLib(lib, (next) => {
    const d = must(next.dossiers.find((x) => x.id === id), "dossier");
    d.areas = d.areas.filter((a) => greatCircleKm([a.lat, a.lon], [lat, lon]) > 0.5);
    d.areas.push({ lat, lon, radiusKm, label });
  });
}
export function unlinkArea(lib, id, index) { return withLib(lib, (next) => { const d = must(next.dossiers.find((x) => x.id === id), "dossier"); d.areas = d.areas.filter((_, k) => k !== index); }); }

/** The active dossier for a place: of the linked areas that hold it, the most specific (smallest), then the nearest. */
export function dossierForPlace(lib, lat, lon) {
  let best = null;
  for (const d of normalizeLibrary(lib).dossiers) if (!d.archived) for (const a of d.areas) {
    const km = greatCircleKm([a.lat, a.lon], [lat, lon]);
    if (km <= a.radiusKm && (!best || a.radiusKm < best.area.radiusKm || (a.radiusKm === best.area.radiusKm && km < best.km))) best = { dossier: d, area: a, km };
  }
  return best;
}

/** Whether some linked area of the dossier already covers the place. */
export const coversPlace = (dossier, lat, lon) => dossier.areas.some((a) => greatCircleKm([a.lat, a.lon], [lat, lon]) <= a.radiusKm);

// ---------------------------------------------------------------- listing and prompt

/** Folders and dossiers as a tree for display, sorted by name; archived dossiers only when asked. */
export function dossierTree(lib, { showArchived = false } = {}) {
  const l = normalizeLibrary(lib), byName = (a, b) => a.name.localeCompare(b.name);
  const node = (folderId) => ({
    folders: l.folders.filter((f) => f.parentId === folderId).sort(byName).map((f) => ({ ...f, ...node(f.id) })),
    dossiers: l.dossiers.filter((d) => d.folderId === folderId && (showArchived || !d.archived)).sort(byName),
  });
  return node(null);
}

/** Choices for a select: active dossiers with their folder path, sorted. */
export function dossierChoices(lib) {
  const l = normalizeLibrary(lib);
  return l.dossiers.filter((d) => !d.archived).map((d) => ({ id: d.id, name: d.name, path: folderPath(l, d.folderId) })).sort((a, b) => (a.path || "~").localeCompare(b.path || "~") || a.name.localeCompare(b.name));
}

/** The dossier as it goes into an image prompt. */
export function architecturePrompt(dossier) {
  if (!dossier) return "";
  const parts = DOSSIER_FIELDS.filter(({ key }) => dossier[key]).map(({ key, label }) => (key === "overview" ? dossier[key] : `${label}: ${dossier[key]}`));
  if (!parts.length) return "";
  return `Architecture of the people who live here${dossier.people ? ` (${dossier.people})` : ""}, from the GM's dossier "${dossier.name}" — paint every building, wall, fortification, shrine, bridge and piece of street furniture in this style:\n${parts.filter((p) => !p.startsWith("People / culture:")).map((p) => `- ${p}`).join("\n")}`;
}

/**
 * The pixel-art building style for a place: the dossier's own choice, else the style linked to the place
 * (eym-building-styles.mjs), else the default. With no dossier text, the style's own words go to the painter.
 */
export function styleForDossier(dossier, placeStyle) { return dossier?.style || placeStyle || "default"; }
export function styleArchitecturePrompt(styleId) {
  const s = BUILDING_STYLES[styleId]; if (!s?.words) return "";
  return `Architecture of the people who live here (built-in style "${s.label}") — paint every building, wall, bridge and piece of street furniture in this style:\n- ${s.words}`;
}
