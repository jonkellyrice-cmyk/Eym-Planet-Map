// npm run tiles:refresh: the one step after a release that changes the world or its painting.
//
// The map server never serves a stored tile made from older code or data, so after such a release every Region
// tile is stale until it is made again. This asks the server to do that, frame by frame, until nothing is stale,
// and then removes the stored sets nothing reads any more:
//   1. reads GET /api/region/stale (what is current, what must be repainted or made again, what is superseded);
//   2. calls GET /api/region/fill over every range of every frame until each says it is done;
//   3. reads /api/region/stale again and stops with an error unless nothing is stale;
//   4. with --purge, deletes each superseded set through the server's guarded purge (a dry run first; the delete
//      only if the dry run counts files and names a different current version). The server refuses unless its
//      deployment has EYM_REGION_PURGE=on: then this says which sets remain and how to remove them.
// The fills run several at once: each frame's tiles are cut into ranges (--chunk tiles each) and --concurrency
// requests work on separate ranges at the same time, each retried with a growing wait if the server refuses it.
// At the end it says what was done and where the time went (the server's own account of each request).
// It reads and writes only through the map server's own endpoints.
//
//   node tools/refresh-region-tiles.mjs [--url https://eym-planet-map.vercel.app] [--purge] [--frame caren]
//                                       [--concurrency 8] [--chunk 24] [--inflight 12] [--force]
// --force makes and stores again the tiles that are already current (the same bytes): for timing a full refresh.
// Exit status: 0 when every tile is current (and, with --purge, nothing superseded remains), 1 otherwise.

import { pathToFileURL } from "node:url";

export const DEFAULT_MAP_SERVER = "https://eym-planet-map.vercel.app";

const TIMING = ["listMs", "computeMs", "firstTileMs", "pictureUploadMs", "shapesUploadMs", "tableMs", "tiles", "uploads"];

/**
 * Refresh a map server's Region tiles. `get(path)` fetches a path of the server and returns the parsed JSON body
 * with its HTTP status as `.status` (so the loop can be tested against a handler without a network).
 * Returns { ok, frames: [{ frame, remade, repainted, kept, sea, calls }], stale, superseded, purged, purgeOff,
 * errors, report }, where `report` counts the whole run: tiles examined, already current, repainted, made again,
 * new, uploads, requests, refusals, the time it took and the servers' account of where theirs went.
 */
export async function refreshRegionTiles({ get, purge = false, onlyFrame = null, log = () => {}, maxCalls = 400, concurrency = 8, chunk = 24, inflight = 12, force = false, backoffMs = 1000, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const errors = [], frames = [], purged = [], began = Date.now();
  const report = { examined: 0, already: 0, sea: 0, outside: 0, repainted: 0, remade: 0, kept: 0, uploads: 0, calls: 0, refusals: 0, wallMs: 0, serverMs: 0, timing: Object.fromEntries(TIMING.map((k) => [k, 0])) };
  const first = await get("/api/region/stale"); if (first.status !== 200) return { ok: false, frames, stale: null, superseded: [], purged, purgeOff: false, errors: [`/api/region/stale answered ${first.status}: ${first.error ?? ""}`], report };
  const wanted = first.frames.map((f) => f.frame).filter((id) => !onlyFrame || id === onlyFrame);
  log(`Server version ${first.picturesVersion}. Frames: ${first.frames.map((f) => `${f.frame} (${f.current} current, ${f.repaint} to repaint, ${f.remake} to make again)`).join("; ")}.`);
  // The work: ranges of tiles, each its own request. A frame's first range also says how many tiles the frame has,
  // and the rest of its ranges follow from that. A request that ran out of time leaves the rest of its range.
  const totals = new Map(wanted.map((frame) => [frame, { frame, remade: 0, repainted: 0, kept: 0, sea: 0, calls: 0 }])), failed = new Set(), work = wanted.map((frame) => ({ frame, start: 0, end: chunk, first: true }));
  const fail = (frame, message) => { failed.add(frame); errors.push(message); };
  const run = async (job) => {
    const { frame } = job, total = totals.get(frame); if (failed.has(frame)) return;
    if (total.calls >= maxCalls) return fail(frame, `${frame}: not done after ${maxCalls} calls`);
    let r = null; total.calls += 1;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      r = await get(`/api/region/fill?frame=${encodeURIComponent(frame)}&start=${job.start}&end=${job.end}&count=400&ms=50000&inflight=${inflight}${force ? "&force=1" : ""}`); report.calls += 1;
      if (r.status === 200) break; report.refusals += 1; if (attempt < 4) await wait(backoffMs * 2 ** (attempt - 1));
    }
    if (r.status !== 200) return fail(frame, `${frame} at ${job.start}: the server answered ${r.status} four times (${r.error ?? ""})`);
    for (const k of ["remade", "repainted", "kept", "sea"]) { total[k] += r[k] ?? 0; report[k] += r[k] ?? 0; }
    report.examined += Math.max(0, r.next - job.start); report.already += r.already ?? 0; report.outside += r.outside ?? 0; report.serverMs += r.ms ?? 0; for (const k of TIMING) report.timing[k] += r.timing?.[k] ?? 0;
    report.uploads += r.timing?.uploads ?? 0;
    if (r.errors?.length) return fail(frame, r.errors.map((e) => `${frame}: ${e}`).join("; "));
    if (job.first) for (let start = chunk; start < r.total; start += chunk) work.push({ frame, start, end: Math.min(r.total, start + chunk) });
    if (!r.done) { if (r.next <= job.start) return fail(frame, `${frame}: the fill did not advance past ${job.start}`); work.unshift({ frame, start: r.next, end: job.end }); }
    log(`  ${frame}: tiles ${job.start} to ${r.next} of ${r.total} looked at (${total.remade} made again, ${total.repainted} repainted, ${total.kept} new so far)`);
  };
  await new Promise((resolve) => {
    let active = 0;
    const pump = () => { if (!work.length && !active) return resolve(); while (active < concurrency && work.length) { active += 1; run(work.shift()).catch((error) => errors.push(error.message)).finally(() => { active -= 1; pump(); }); } };
    pump();
  });
  frames.push(...totals.values()); report.wallMs = Date.now() - began;
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
  return { ok: errors.length === 0 && !(purge && (purgeOff || superseded.length)), frames, stale, superseded, purged, purgeOff, errors, report };
}

/** `get` for a live server over HTTP. */
export const httpGet = (base) => async (path) => {
  try { const r = await fetch(`${base.replace(/\/$/, "")}${path}`, { signal: AbortSignal.timeout(70000) }); let body = {}; try { body = await r.json(); } catch { /* not JSON */ } return { ...body, status: r.status }; }
  catch (error) { return { status: 0, error: error.message }; }
};

/** The run's account in words: what was done, and where the time went. */
export function describeRefresh(report) {
  const t = report.timing, s = (ms) => `${(ms / 1000).toFixed(1)} s`, made = Math.max(1, t.tiles), other = Math.max(0, report.serverMs - t.listMs - t.computeMs - t.tableMs);
  return [
    `Tiles examined: ${report.examined}. Already current: ${report.already}. Open sea (never kept): ${report.sea}. Outside the frame: ${report.outside}.`,
    `Repainted: ${report.repainted}. Made again: ${report.remade}. New: ${report.kept}. Uploads made: ${report.uploads}.`,
    `Total time: ${s(report.wallMs)}, in ${report.calls} requests (${report.refusals} refused and tried again).`,
    `Where the servers' ${s(report.serverMs)} went: making tiles ${s(t.computeMs)} (${Math.round(t.computeMs / made)} ms a tile; the first tile of each request ${Math.round(t.firstTileMs / Math.max(1, report.calls - report.refusals))} ms on average, which is the warm-up); listing what is stored ${s(t.listMs)}; table writes ${s(t.tableMs)}; waiting on uploads and the rest ${s(other)}.`,
    `Uploads, while tiles were being made: pictures ${s(t.pictureUploadMs)} (${Math.round(t.pictureUploadMs / made)} ms each), shapes ${s(t.shapesUploadMs)} (${Math.round(t.shapesUploadMs / made)} ms each).`,
  ];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), value = (flag, fallback) => { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; }, count = (flag, fallback, max) => Math.min(max, Math.max(1, Math.trunc(Number(value(flag, fallback))) || fallback));
  const url = value("--url", process.env.EYM_MAP_SERVER ?? DEFAULT_MAP_SERVER), result = await refreshRegionTiles({ get: httpGet(url), purge: args.includes("--purge"), onlyFrame: value("--frame", null), log: console.log, concurrency: count("--concurrency", 8, 64), chunk: count("--chunk", 24, 400), inflight: count("--inflight", 12, 16), force: args.includes("--force") });
  for (const f of result.frames) console.log(`${f.frame}: ${f.remade} made again, ${f.repainted} repainted, ${f.kept} new, in ${f.calls} calls.`);
  for (const line of describeRefresh(result.report)) console.log(line);
  if (result.stale === 0) console.log("Every stored tile is current.");
  if (result.purged.length) console.log(`Purged ${result.purged.length} superseded set${result.purged.length === 1 ? "" : "s"}.`);
  if (result.purgeOff) console.log(`The server's purge is switched off. Superseded sets still stored: ${result.superseded.join(", ")}. Set EYM_REGION_PURGE=on for the deployment, redeploy, run this again with --purge, then switch it off.`);
  else if (result.superseded.length) console.log(`Superseded sets still stored: ${result.superseded.join(", ")}${args.includes("--purge") ? "" : " (run again with --purge to remove them)"}.`);
  for (const e of result.errors) console.error(`Error: ${e}`);
  process.exit(result.ok ? 0 : 1);
}
