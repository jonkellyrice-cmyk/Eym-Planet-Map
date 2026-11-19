// npm run tiles:refresh: the one step after a release that changes the world or its painting.
//
// The map server never serves a stored tile made from older code or data, so after such a release every Region
// tile is stale until it is made again. This asks the server to do that, frame by frame, until nothing is stale,
// and then removes the stored sets nothing reads any more:
//   1. reads GET /api/region/stale (what is current, what must be repainted or made again, what is superseded);
//   2. calls GET /api/region/fill for each frame, one call after another, until each says it is done;
//   3. reads /api/region/stale again and stops with an error unless nothing is stale;
//   4. with --purge, deletes each superseded set through the server's guarded purge (a dry run first; the delete
//      only if the dry run counts files and names a different current version). The server refuses unless its
//      deployment has EYM_REGION_PURGE=on: then this says which sets remain and how to remove them.
// It reads and writes only through the map server's own endpoints.
//
//   node tools/refresh-region-tiles.mjs [--url https://eym-planet-map.vercel.app] [--purge] [--frame caren]
// Exit status: 0 when every tile is current (and, with --purge, nothing superseded remains), 1 otherwise.

import { pathToFileURL } from "node:url";

export const DEFAULT_MAP_SERVER = "https://eym-planet-map.vercel.app";

/**
 * Refresh a map server's Region tiles. `get(path)` fetches a path of the server and returns the parsed JSON body
 * with its HTTP status as `.status` (so the loop can be tested against a handler without a network).
 * Returns { ok, frames: [{ frame, remade, repainted, kept, sea, calls }], stale, superseded, purged, purgeOff, errors }.
 */
export async function refreshRegionTiles({ get, purge = false, onlyFrame = null, log = () => {}, maxCalls = 400 } = {}) {
  const errors = [], frames = [], purged = [];
  const first = await get("/api/region/stale"); if (first.status !== 200) return { ok: false, frames, stale: null, superseded: [], purged, purgeOff: false, errors: [`/api/region/stale answered ${first.status}: ${first.error ?? ""}`] };
  const wanted = first.frames.map((f) => f.frame).filter((id) => !onlyFrame || id === onlyFrame);
  log(`Server version ${first.picturesVersion}. Frames: ${first.frames.map((f) => `${f.frame} (${f.current} current, ${f.repaint} to repaint, ${f.remake} to make again)`).join("; ")}.`);
  for (const frame of wanted) {
    const total = { frame, remade: 0, repainted: 0, kept: 0, sea: 0, calls: 0 };
    for (let start = 0, done = false; !done;) {
      if (total.calls >= maxCalls) { errors.push(`${frame}: not done after ${maxCalls} calls`); break; }
      let r = null; for (let attempt = 1; attempt <= 3; attempt += 1) { r = await get(`/api/region/fill?frame=${encodeURIComponent(frame)}&start=${start}&count=400&ms=50000`); if (r.status === 200) break; }
      total.calls += 1;
      if (r.status !== 200) { errors.push(`${frame} at ${start}: the server answered ${r.status} three times (${r.error ?? ""})`); break; }
      total.remade += r.remade; total.repainted += r.repainted; total.kept += r.kept; total.sea += r.sea;
      if (r.errors?.length) { errors.push(...r.errors.map((e) => `${frame}: ${e}`)); break; }
      if (!r.done && r.next <= start) { errors.push(`${frame}: the fill did not advance past ${start}`); break; }
      log(`  ${frame}: ${r.next} of ${r.total} looked at (${total.remade} made again, ${total.repainted} repainted, ${total.kept} new)`);
      start = r.next; done = r.done;
    }
    frames.push(total);
  }
  const after = await get("/api/region/stale"), stale = after.status === 200 ? after.frames.filter((f) => !onlyFrame || f.frame === onlyFrame).reduce((s, f) => s + f.repaint + f.remake, 0) : null;
  if (stale == null) errors.push(`/api/region/stale answered ${after.status}`); else if (stale > 0) errors.push(`${stale} tiles are still stale`);
  let superseded = after.superseded ?? [], purgeOff = false;
  if (purge && !errors.length && !onlyFrame) {
    for (const model of superseded) {
      const dry = await get(`/api/region/purge?model=${encodeURIComponent(model)}`);
      if (dry.status === 403) { purgeOff = true; break; }
      const files = Object.values(dry.files ?? {}).reduce((a, b) => a + b, 0);
      // Only a set the server itself calls old, with files in it, and never the version it is serving.
      if (dry.status !== 200 || !dry.dryRun || !files || [dry.current?.shapes, dry.current?.pictures].includes(model)) { errors.push(`${model}: not purged (the dry run answered ${dry.status}, ${files} files)`); continue; }
      const done = await get(`/api/region/purge?model=${encodeURIComponent(model)}&confirm=${encodeURIComponent(model)}`), deleted = Object.values(done.deleted ?? {}).reduce((a, b) => a + b, 0);
      if (done.status !== 200 || deleted !== files) errors.push(`${model}: ${deleted} of ${files} files deleted (status ${done.status})`); else { purged.push({ model, files }); log(`  purged ${model}: ${files} files`); }
    }
    if (!purgeOff) superseded = (await get("/api/region/stale")).superseded ?? [];
  }
  return { ok: errors.length === 0 && !(purge && (purgeOff || superseded.length)), frames, stale, superseded, purged, purgeOff, errors };
}

/** `get` for a live server over HTTP. */
export const httpGet = (base) => async (path) => {
  try { const r = await fetch(`${base.replace(/\/$/, "")}${path}`, { signal: AbortSignal.timeout(70000) }); let body = {}; try { body = await r.json(); } catch { /* not JSON */ } return { ...body, status: r.status }; }
  catch (error) { return { status: 0, error: error.message }; }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), value = (flag, fallback) => { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };
  const url = value("--url", process.env.EYM_MAP_SERVER ?? DEFAULT_MAP_SERVER), result = await refreshRegionTiles({ get: httpGet(url), purge: args.includes("--purge"), onlyFrame: value("--frame", null), log: console.log });
  for (const f of result.frames) console.log(`${f.frame}: ${f.remade} made again, ${f.repainted} repainted, ${f.kept} new, in ${f.calls} calls.`);
  if (result.stale === 0) console.log("Every stored tile is current.");
  if (result.purged.length) console.log(`Purged ${result.purged.length} superseded set${result.purged.length === 1 ? "" : "s"}.`);
  if (result.purgeOff) console.log(`The server's purge is switched off. Superseded sets still stored: ${result.superseded.join(", ")}. Set EYM_REGION_PURGE=on for the deployment, redeploy, run this again with --purge, then switch it off.`);
  else if (result.superseded.length) console.log(`Superseded sets still stored: ${result.superseded.join(", ")}${args.includes("--purge") ? "" : " (run again with --purge to remove them)"}.`);
  for (const e of result.errors) console.error(`Error: ${e}`);
  process.exit(result.ok ? 0 : 1);
}
