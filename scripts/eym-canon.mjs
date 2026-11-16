// The canon: painted maps the GM has accepted. Each entry records what was painted (level, place, frame,
// size), from which reference (a hash of the reference image's SVG), with which model and prompt, and
// where its files are in the world's data folder. Entries are never deleted: a new painting of the
// same map supersedes the old one, which stays on disk and in the list. Pure functions; the app stores
// the list in a world setting and the files with Foundry's file upload.

import { fromLocal, toLocal } from "./eym-surface.mjs";

export const CANON_SETTING = "canonMaps";
export const LEVEL_ORDER = Object.freeze({ planet: 0, continent: 1, region: 2, local: 3 });

/** Where painted maps live: the world's own folder (kept with the world, not the module). */
export const canonFolder = (worldId) => `worlds/${worldId}/eym-maps`;

/** A short stable hash (hex) of text, for naming files after their reference. */
export function textHash(text) {
  let a = 2166136261, b = 5381;
  for (let i = 0; i < text.length; i += 1) { const c = text.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = (Math.imul(b, 33) + c) | 0; }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

/** The frame's facts that let it be rebuilt later (not its functions). */
export function frameRecord(frame) {
  return { level: frame.level, W: frame.W, H: frame.H, center: [...frame.center], kmPerPx: frame.kmPerPx, wraps: Boolean(frame.wraps) };
}

/** Projection and its inverse for a recorded frame (equirectangular for the planet, azimuthal otherwise). */
export function frameFromRecord(record) {
  const { W, H, center, kmPerPx } = record;
  if (record.level === "planet") return { ...record, project: ([lat, lon]) => [(lon + 180) / 360 * W, (90 - lat) / 180 * H], unproject: ([x, y]) => [90 - (y / H) * 180, (x / W) * 360 - 180] };
  return { ...record, project: ([lat, lon]) => { const [x, y] = toLocal(center, lat, lon); return [W / 2 + x / kmPerPx, H / 2 - y / kmPerPx]; }, unproject: ([x, y]) => fromLocal(center, (x - W / 2) * kmPerPx, (H / 2 - y) * kmPerPx) };
}

/** The part of a parent map (pixels) that a child map covers, or null if it is off the parent or tiny. */
export function parentCrop(parentRecord, childRecord) {
  const parent = frameFromRecord(parentRecord), child = frameFromRecord(childRecord), points = [];
  for (const fx of [0, 0.5, 1]) for (const fy of [0, 0.5, 1]) points.push(parent.project(child.unproject([fx * child.W, fy * child.H])));
  let xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
  // On the planet map a child straddling the date line splits; use the side its centre is on.
  if (parent.level === "planet" && Math.max(...xs) - Math.min(...xs) > parent.W / 2) { const cx = parent.project(child.center)[0]; xs = xs.map((x) => (Math.abs(x - cx) > parent.W / 2 ? x + Math.sign(cx - x) * parent.W : x)); }
  const x0 = Math.max(0, Math.min(...xs)), x1 = Math.min(parent.W, Math.max(...xs)), y0 = Math.max(0, Math.min(...ys)), y1 = Math.min(parent.H, Math.max(...ys));
  if (x1 - x0 < 8 || y1 - y0 < 8) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Whether two entries paint the same map (same level and continent, or the same place and size). */
export function sameMap(a, b) {
  if (a.level !== b.level) return false;
  if (a.level === "planet") return true;
  if (a.level === "continent") return a.continentId === b.continentId;
  const across = a.frame.kmPerPx * a.frame.W, other = b.frame.kmPerPx * b.frame.W;
  const [x, y] = toLocal(a.frame.center, ...b.frame.center);
  return Math.abs(across / other - 1) < 0.05 && Math.hypot(x, y) < 0.02 * across;
}

/** A canon entry for a painted map. */
export function canonEntry({ id, title, spec, frame, continentId = null, files, model, quality, prompt, referenceHash, userId = null, createdAt }) {
  return { id, title, level: spec.level, continentId: spec.level === "continent" ? continentId : null, spec: { level: spec.level, widthPx: spec.widthPx, heightPx: spec.heightPx }, frame: frameRecord(frame), files, model, quality, prompt, referenceHash, userId, createdAt, supersededBy: null };
}

/** Add an entry; earlier paintings of the same map are marked superseded (kept, not deleted). */
export function mergeCanon(list, entry) {
  return [...(list ?? []).map((old) => (!old.supersededBy && sameMap(old, entry) ? { ...old, supersededBy: entry.id } : old)), entry];
}

export const activeCanon = (list) => (list ?? []).filter((e) => !e.supersededBy);

/** The canon painting of this exact map, if there is one. */
export function canonFor(list, probe) { return activeCanon(list).filter((e) => sameMap(e, probe)).at(-1) ?? null; }

/** The nearest painted level above a map that covers it, with the part it covers. */
export function canonAbove(list, childFrame) {
  const child = frameRecord(childFrame), rank = LEVEL_ORDER[child.level];
  const options = activeCanon(list).filter((e) => LEVEL_ORDER[e.level] < rank).map((e) => ({ entry: e, crop: parentCrop(e.frame, child) })).filter((o) => o.crop);
  return options.sort((a, b) => LEVEL_ORDER[b.entry.level] - LEVEL_ORDER[a.entry.level] || b.entry.createdAt.localeCompare(a.entry.createdAt))[0] ?? null;
}

/** Extra direction when a painted parent is sent along as the style reference. */
export function parentDirection(parent) {
  return `A second image is attached: the canon painted ${parent.entry.level} map of the area around this one ("${parent.entry.title}"), cropped to roughly this map's area. Match its palette, brushwork, paper texture and the colours of its land and sea, so this map reads as a closer view of it. Where the two differ in shape, follow the first (reference) image.`;
}
