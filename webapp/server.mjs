// The Eym map server: renders battle maps as pixel art (Tier 2 and, later, higher tiers) from the same
// deterministic map the Foundry module builds, caches the results on disk, and serves them to the
// module's "Render pixel art" button and to its own web page. No dependencies beyond Node.
//
//   PORT (8787), HOST (127.0.0.1), CACHE_DIR (webapp/cache; /tmp on Vercel), CORS_ORIGINS ("*" or a comma list)
//   Runs as a Node server (npm run webapp) or as one Vercel function (api/map-server.mjs, vercel.json).
//   Layers are stored at their native pixel size and enlarged on request (?size=native for the native
//   file); every id carries the request that made it, so any instance can rebuild a map it never saw.
//   GET  /                         the web page
//   GET  /api/health               renderer and tiers
//   GET  /api/options              settings, sizes, densities, features, settlements (for the page)
//   POST /api/battle-maps          render (or fetch from cache) → manifest
//   GET  /api/battle-maps/:id      manifest
//   GET  /api/battle-maps/:id/files/:name   a layer (PNG)

import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { buildBattleMap, geometryHash } from "../scripts/eym-battle-rules.mjs";
import { buildInteriors } from "../scripts/eym-battle-interiors.mjs";
import { SETTINGS } from "../scripts/eym-battle-settings.mjs";
import { MAP_FEATURE_CATEGORIES, MAP_FEATURES } from "../scripts/eym-battle-features.mjs";
import { BATTLE_SIZE_PRESETS, GRID_DENSITY_PRESETS, battleMapSpec } from "../scripts/eym-map-presets.mjs";
import { RENDERER, renderBattleLayers } from "./render/render-battle.mjs";
import { normalizeSeason } from "../scripts/eym-battle-season.mjs";
import { BUILDING_STYLES, styleForPlace } from "../scripts/eym-building-styles.mjs";
import { decodePng, encodePng } from "./render/png.mjs";
import { Framebuffer } from "./render/framebuffer.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const hashText = (text) => { let a = 2166136261, b = 5381; for (let i = 0; i < text.length; i += 1) { const c = text.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = (Math.imul(b, 33) + c) | 0; } return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0"); };
export const TIERS = Object.freeze([
  { tier: 1, name: "Geometric illustration", available: false, note: "Drawn by the Foundry module itself (no server needed)." },
  { tier: 2, name: "Traditional RPG pixel art", available: true },
  { tier: 3, name: "High-definition pixel environments", available: false, note: "Planned." },
  { tier: 4, name: "Volumetric pixel art", available: false, note: "Planned." },
  { tier: 5, name: "Artist-quality procedural pixel art", available: false, note: "Planned." },
]);
const RENDERERS = { 2: { render: renderBattleLayers, info: RENDERER } };

/** Validate a render request; returns the inputs for buildBattleMap, or throws a readable error. */
export function parseRequest(body) {
  const center = body?.center;
  if (!Array.isArray(center) || center.length !== 2 || !center.every(Number.isFinite) || Math.abs(center[0]) > 90 || Math.abs(center[1]) > 180) throw new Error("center must be [lat, lon]");
  const columns = Number(body.columns), rows = Number(body.rows), gridPx = Number(body.gridPx);
  for (const [name, v, lo, hi] of [["columns", columns, 4, 60], ["rows", rows, 4, 60], ["gridPx", gridPx, 50, 400]]) if (!Number.isInteger(v) || v < lo || v > hi) throw new Error(`${name} must be a whole number from ${lo} to ${hi}`);
  const setting = body.setting ?? "auto"; if (setting !== "auto" && !SETTINGS[setting]) throw new Error("unknown setting");
  const extras = Array.isArray(body.extras) ? body.extras : []; const known = new Set(MAP_FEATURES.map((f) => f.id)); if (extras.some((e) => !known.has(e))) throw new Error("unknown map feature");
  const tier = Number(body.tier ?? 2); if (!RENDERERS[tier]) throw new Error(`tier ${tier} is not available here`);
  const c = body.conditions ?? {}, conditions = {};
  for (const k of ["snowDepthCm", "tempC", "precipMmH", "windMs", "sunAltitudeDeg"]) if (Number.isFinite(c[k])) conditions[k] = c[k];
  if (["dry", "damp", "wet", "waterlogged", "flooding"].includes(c.ground)) conditions.ground = c.ground;
  if (["rain", "sleet", "snow"].includes(c.precipKind)) conditions.precipKind = c.precipKind;
  if (typeof c.thunder === "boolean") conditions.thunder = c.thunder;
  const spec = battleMapSpec({ size: "custom", columns, rows, density: "custom", gridPx });
  // Only the season: light, shadows, darkness and lamps are Foundry's, live.
  const season = normalizeSeason(body.season ?? body.light?.season, center[0]);
  // The building style: named, or the one linked to the place. It shapes the buildings too (Dree's
  // overhanging upper floors, skybridges, lifts), so the module sends the one it built its map with.
  if (body.style != null && body.style !== "" && !BUILDING_STYLES[body.style]) throw new Error("unknown building style");
  const style = body.style || styleForPlace(center[0], center[1]);
  // The request in a fixed, minimal form: what an id carries, so the map can be rebuilt from the id alone.
  const wire = { center, columns, rows, gridPx, setting, extras, conditions, tier, season, style };
  return { center, spec, setting, extras, conditions, tier, season, style, wire };
}

const b64url = (text) => Buffer.from(text, "utf8").toString("base64url");
/** A map's id: readable, then the request itself (so the id alone rebuilds the map). */
export function idFor(request, geometry, renderer = RENDERERS[request.tier]) {
  return `${geometry}-t${request.tier}-${request.spec.gridPx}-${request.season}-${request.style}-${renderer.info.version}`.replace(/[^a-z0-9-]/gi, "_") + `.r${b64url(JSON.stringify(request.wire))}`;
}
/** The request an id carries, validated again; null if it carries none. */
export function requestFromId(id) {
  const m = /\.r([A-Za-z0-9_-]+)$/.exec(id); if (!m) return null;
  try { return parseRequest(JSON.parse(Buffer.from(m[1], "base64url").toString("utf8"))); } catch { return null; }
}
const dirFor = (cacheDir, id) => join(cacheDir, hashText(id));

/** A layer at full size: the native file enlarged by the manifest's scale (each pixel a block), cached. */
function fullSize(dir, name, scale) {
  const full = join(dir, `full-${name}`); if (existsSync(full)) return readFileSync(full);
  const native = decodePng(readFileSync(join(dir, name))), fb = new Framebuffer(native.width, native.height); fb.data.set(native.data);
  const png = encodePng(fb.upscale(scale)); writeFileSync(full, png); return png;
}

/** Render a request (or return the cached render). Returns the manifest. */
export async function renderRequest(asset, request, cacheDir) {
  // A repeat of the same request goes straight to its cached render, without rebuilding the map.
  const { tier } = request, renderer = RENDERERS[tier], requestKey = hashText(`${JSON.stringify(request)}|${renderer.info.version}`), indexPath = join(cacheDir, "requests", `${requestKey}.json`);
  if (existsSync(indexPath)) { const { id } = JSON.parse(readFileSync(indexPath, "utf8")), cached = join(dirFor(cacheDir, id), "manifest.json"); if (existsSync(cached)) return JSON.parse(readFileSync(cached, "utf8")); }
  const { style } = request, map = buildBattleMap(asset, request), geometry = geometryHash(map), lightKey = request.season;
  const id = idFor(request, geometry, renderer), dir = dirFor(cacheDir, id), manifestPath = join(dir, "manifest.json");
  const remember = () => { mkdirSync(join(cacheDir, "requests"), { recursive: true }); writeFileSync(indexPath, JSON.stringify({ id })); };
  if (existsSync(manifestPath)) { remember(); return JSON.parse(readFileSync(manifestPath, "utf8")); }
  const interiors = buildInteriors(map), layers = renderer.render(map, interiors, { gridPx: request.spec.gridPx, season: request.season, style });
  mkdirSync(dir, { recursive: true });
  // Native size only (small and quick); the full size is made when someone asks for it.
  const save = (name, fb) => { writeFileSync(join(dir, name), encodePng(fb)); return name; };
  const files = { exterior: save("exterior.png", layers.exterior), ground: save("ground.png", layers.ground), preview: "exterior.png", roofs: {}, floors: {} };
  for (const [floor, fb] of Object.entries(layers.roofs)) files.roofs[floor] = save(`roofs-${floor}.png`, fb);
  for (const [floor, fb] of Object.entries(layers.floors)) files.floors[floor] = save(`floor-${floor}.png`, fb);
  const manifest = {
    id, tier, renderer: renderer.info, geometryHash: geometry, mapKey: map.key, mapVersion: map.version, setting: map.setting, center: map.center,
    spec: { columns: request.spec.columns, rows: request.spec.rows, gridPx: request.spec.gridPx }, native: layers.native, scale: layers.scale, width: layers.width, height: layers.height,
    floors: layers.floorList, files, notes: map.notes, analysis: map.analysis, season: layers.season, style: layers.style,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2)); remember();
  return manifest;
}

/** The web server (a Node http server around the request handler). */
export function createMapServer(options = {}) { return createServer(createMapHandler(options)); }

/** The request handler: (req, res), for a Node server or a Vercel function. */
export function createMapHandler({ asset, cacheDir = process.env.CACHE_DIR ?? (process.env.VERCEL ? "/tmp/eym-map-cache" : join(HERE, "cache")), corsOrigins = process.env.CORS_ORIGINS ?? "*" } = {}) {
  const data = asset ?? JSON.parse(readFileSync(join(HERE, "..", "data", "planet-cartography", "abydos", "eventide.json"), "utf8"));
  mkdirSync(cacheDir, { recursive: true });
  const allowed = corsOrigins === "*" ? null : new Set(String(corsOrigins).split(",").map((s) => s.trim()).filter(Boolean));
  const inflight = new Map();
  let queue = Promise.resolve();
  const send = (res, status, body, type = "application/json") => { res.writeHead(status, { "content-type": type, "cache-control": type === "image/png" ? "public, max-age=31536000, immutable" : "no-store" }); res.end(type === "application/json" ? JSON.stringify(body) : body); };
  return async (req, res) => {
    const origin = req.headers.origin;
    if (origin && (!allowed || allowed.has(origin))) { res.setHeader("access-control-allow-origin", allowed ? origin : "*"); res.setHeader("access-control-allow-headers", "content-type"); res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS"); res.setHeader("vary", "origin");
      // Let a Foundry page on the internet reach a map server on this machine or the local network (Chrome's Private Network Access).
      if (req.headers["access-control-request-private-network"]) res.setHeader("access-control-allow-private-network", "true"); }
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
    const url = new URL(req.url, "http://localhost"), path = url.pathname;
    try {
      if (req.method === "GET" && (path === "/" || path === "/index.html" || path === "/app.js" || path === "/style.css")) {
        const file = join(HERE, "public", path === "/" ? "index.html" : path.slice(1)), type = file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html";
        return send(res, 200, readFileSync(file), `${type}; charset=utf-8`);
      }
      // The module's own files, at the paths Foundry serves them from, for the module preview page.
      const moduleFile = /^\/modules\/eym-planet-map\/((?:scripts|templates|styles|lang|data|docs)\/[A-Za-z0-9._\/-]+|module\.json)$/.exec(path);
      if (req.method === "GET" && moduleFile && !moduleFile[1].includes("..")) {
        const file = join(HERE, "..", moduleFile[1]); if (!existsSync(file)) return send(res, 404, { error: "not found" });
        const ext = moduleFile[1].split(".").pop(), type = { mjs: "text/javascript", js: "text/javascript", json: "application/json", css: "text/css", hbs: "text/plain", csv: "text/csv", svg: "image/svg+xml", png: "image/png", webp: "image/webp", jpg: "image/jpeg" }[ext] ?? "application/octet-stream";
        res.writeHead(200, { "content-type": /^text|json|javascript/.test(type) ? `${type}; charset=utf-8` : type, "cache-control": "public, max-age=300" }); res.end(readFileSync(file)); return;
      }
      if (req.method === "GET" && (path === "/module" || path === "/module/")) { res.writeHead(302, { location: "/module/index.html" }); res.end(); return; }
      if (req.method === "GET" && /^\/module\/[a-z-]+\.(html|js|css)$/.test(path)) {
        const file = join(HERE, "public", path.slice(1)); if (!existsSync(file)) return send(res, 404, { error: "not found" });
        return send(res, 200, readFileSync(file), `${path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" : "text/html"}; charset=utf-8`);
      }
      if (req.method === "GET" && path === "/api/health") return send(res, 200, { ok: true, renderer: RENDERER, tiers: TIERS });
      if (req.method === "GET" && path === "/api/options") return send(res, 200, {
        tiers: TIERS, styles: Object.values(BUILDING_STYLES).map((st) => ({ id: st.id, label: st.label, places: (st.places ?? []).map((p) => p.name) })), settings: Object.entries(SETTINGS).map(([id, s]) => ({ id, label: s.label, group: s.group ?? "natural" })), sizes: BATTLE_SIZE_PRESETS, densities: GRID_DENSITY_PRESETS,
        featureCategories: MAP_FEATURE_CATEGORIES, features: MAP_FEATURES.map((f) => ({ id: f.id, label: f.label, category: f.category })),
        settlements: data.settlements.filter((s) => s.properName).map((s) => ({ name: s.properName, kind: s.kind, lat: s.lat, lon: s.lon })).sort((a, b) => a.name.localeCompare(b.name)),
      });
      if (req.method === "POST" && path === "/api/battle-maps") {
        let raw = ""; for await (const chunk of req) { raw += chunk; if (raw.length > 65536) return send(res, 413, { error: "request too large" }); }
        let request; try { request = parseRequest(JSON.parse(raw || "{}")); } catch (error) { return send(res, 400, { error: error.message }); }
        const key = JSON.stringify(request);
        if (!inflight.has(key)) inflight.set(key, (queue = queue.then(() => renderRequest(data, request, cacheDir))).finally(() => inflight.delete(key)));
        const manifest = await inflight.get(key);
        return send(res, 200, manifest);
      }
      const m = /^\/api\/battle-maps\/([A-Za-z0-9._-]+)(?:\/files\/([A-Za-z0-9-]+\.png))?$/.exec(path);
      if (req.method === "GET" && m) {
        const dir = dirFor(cacheDir, m[1]), manifestPath = join(dir, "manifest.json");
        // Not here (another instance made it, or the cache was cleared): rebuild it from the id.
        if (!existsSync(manifestPath)) {
          const request = requestFromId(m[1]); if (!request) return send(res, 404, { error: "not found" });
          const key = JSON.stringify(request);
          if (!inflight.has(key)) inflight.set(key, (queue = queue.then(() => renderRequest(data, request, cacheDir))).finally(() => inflight.delete(key)));
          const made = await inflight.get(key); if (made.id !== m[1]) return send(res, 404, { error: "this map was made by another version of the server" });
        }
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
        if (!m[2]) return send(res, 200, manifest);
        if (!existsSync(join(dir, m[2]))) return send(res, 404, { error: "not found" });
        return send(res, 200, url.searchParams.get("size") === "native" ? readFileSync(join(dir, m[2])) : fullSize(dir, m[2], manifest.scale), "image/png");
      }
      return send(res, 404, { error: "not found" });
    } catch (error) {
      console.error(error);
      return send(res, 500, { error: error.message });
    }
  };
}

// Run directly: node webapp/server.mjs
if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const port = Number(process.env.PORT ?? 8787), host = process.env.HOST ?? "127.0.0.1";
  createMapServer().listen(port, host, () => console.log(`Eym map server on http://${host}:${port} (renderer ${RENDERER.version})`));
}
