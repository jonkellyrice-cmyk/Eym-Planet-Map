// The Eym map server: renders battle maps as pixel art (Tier 2 and, later, higher tiers) from the same
// deterministic map the Foundry module builds, caches the results on disk, and serves them to the
// module's "Render pixel art" button and to its own web page. No dependencies beyond Node.
//
//   PORT (8787), HOST (127.0.0.1), CACHE_DIR (webapp/cache), CORS_ORIGINS ("*" or a comma list)
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
import { encodePng } from "./render/png.mjs";

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
  return { center, spec, setting, extras, conditions, tier, season, style };
}

/** Render a request (or return the cached render). Returns the manifest. */
export async function renderRequest(asset, request, cacheDir) {
  // A repeat of the same request goes straight to its cached render, without rebuilding the map.
  const { tier } = request, renderer = RENDERERS[tier], requestKey = hashText(`${JSON.stringify(request)}|${renderer.info.version}`), indexPath = join(cacheDir, "requests", `${requestKey}.json`);
  if (existsSync(indexPath)) { const { id } = JSON.parse(readFileSync(indexPath, "utf8")), cached = join(cacheDir, id, "manifest.json"); if (existsSync(cached)) return JSON.parse(readFileSync(cached, "utf8")); }
  const { style } = request, map = buildBattleMap(asset, request), geometry = geometryHash(map), lightKey = request.season;
  const id = `${geometry}-t${tier}-${request.spec.gridPx}-${lightKey}-${style}-${renderer.info.version}`.replace(/[^a-z0-9.-]/gi, "_"), dir = join(cacheDir, id), manifestPath = join(dir, "manifest.json");
  const remember = () => { mkdirSync(join(cacheDir, "requests"), { recursive: true }); writeFileSync(indexPath, JSON.stringify({ id })); };
  if (existsSync(manifestPath)) { remember(); return JSON.parse(readFileSync(manifestPath, "utf8")); }
  const interiors = buildInteriors(map), layers = renderer.render(map, interiors, { gridPx: request.spec.gridPx, season: request.season, style });
  mkdirSync(dir, { recursive: true });
  const save = (name, fb, scale = layers.scale) => { writeFileSync(join(dir, name), encodePng(fb.upscale(scale))); return name; };
  const files = { exterior: save("exterior.png", layers.exterior), ground: save("ground.png", layers.ground), preview: save("preview.png", layers.exterior, 1), roofs: {}, floors: {} };
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

/** The web server. */
export function createMapServer({ asset, cacheDir = join(HERE, "cache"), corsOrigins = "*" } = {}) {
  const data = asset ?? JSON.parse(readFileSync(join(HERE, "..", "data", "planet-cartography", "abydos", "eventide.json"), "utf8"));
  mkdirSync(cacheDir, { recursive: true });
  const allowed = corsOrigins === "*" ? null : new Set(String(corsOrigins).split(",").map((s) => s.trim()).filter(Boolean));
  const inflight = new Map();
  let queue = Promise.resolve();
  const send = (res, status, body, type = "application/json") => { res.writeHead(status, { "content-type": type, "cache-control": type === "image/png" ? "public, max-age=31536000, immutable" : "no-store" }); res.end(type === "application/json" ? JSON.stringify(body) : body); };
  return createServer(async (req, res) => {
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
      const m = /^\/api\/battle-maps\/([A-Za-z0-9._-]+)(?:\/files\/([A-Za-z0-9._-]+\.png))?$/.exec(path);
      if (req.method === "GET" && m) {
        const dir = join(cacheDir, m[1]); if (normalize(dir).indexOf(normalize(cacheDir)) !== 0) return send(res, 400, { error: "bad id" });
        const file = m[2] ? join(dir, m[2]) : join(dir, "manifest.json");
        if (!existsSync(file)) return send(res, 404, { error: "not found" });
        return m[2] ? send(res, 200, readFileSync(file), "image/png") : send(res, 200, JSON.parse(readFileSync(file, "utf8")));
      }
      return send(res, 404, { error: "not found" });
    } catch (error) {
      console.error(error);
      return send(res, 500, { error: error.message });
    }
  });
}

// Run directly: node webapp/server.mjs
if (process.argv[1] && fileURLToPath(import.meta.url) === normalize(process.argv[1])) {
  const port = Number(process.env.PORT ?? 8787), host = process.env.HOST ?? "127.0.0.1";
  createMapServer({ cacheDir: process.env.CACHE_DIR ?? join(HERE, "cache"), corsOrigins: process.env.CORS_ORIGINS ?? "*" }).listen(port, host, () => console.log(`Eym map server on http://${host}:${port} (renderer ${RENDERER.version})`));
}
