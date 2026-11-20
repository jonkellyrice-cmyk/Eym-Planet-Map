import { elevationGrid } from "./cartography-asset.mjs";
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function decodeBase64(value) {
  if (typeof Buffer !== "undefined") return Uint8Array.from(Buffer.from(value, "base64"));
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

export function decodeCartographyRaster(asset) {
  if (asset.schemaVersion !== 2) throw new TypeError("A schema-v2 refined cartography asset is required");
  const count = asset.grid.latCount * asset.grid.lonCount, ocean = decodeBase64(asset.raster.oceanMaskBase64);
  const decodeCategory = (field) => { const indices = decodeBase64(asset.raster[field].valuesBase64), categories = asset.raster[field].categories; return { indices, categories, at: (index) => categories[indices[index]] }; };
  const elevation = elevationGrid(asset);
  if (ocean.length !== count || elevation.length !== count) throw new Error("Refined cartography raster is incomplete");
  const biome = decodeCategory("biome"), soil = decodeCategory("soil"), resource = decodeCategory("resource");
  return { count, ocean, elevationM: Int32Array.from(elevation), biome, soil, resource };
}

export function cartographyLod(zoom, mobile = false) {
  if (zoom < 1.15) return { id: "orbital", minRegionCells: 42, labels: mobile ? 12 : 18, resourceRegions: 0, rasterStride: 3 };
  if (zoom < 2.15) return { id: "regional", minRegionCells: 10, labels: mobile ? 26 : 40, resourceRegions: mobile ? 80 : 140, rasterStride: 2 };
  return { id: "surface", minRegionCells: 1, labels: mobile ? 48 : 80, resourceRegions: mobile ? 150 : 240, rasterStride: 1 };
}

export function selectCartographyLabels(asset, zoom, mobile = false, limit = undefined) {
  const lod = cartographyLod(zoom, mobile), priority = { capital: 100, continent: 95, ocean: 94, region: 90, city: 82, port: 81, sea: 78, range: 70, river: 65, lake: 60, mountain: 58, hills: 57, island: 55, islands: 55, fort: 52, town: 50, valley: 50, desert: 48, forest: 46, grove: 44, wetland: 40, glacier: 40, landmark: 40, village: 30 };
  const settlements = asset.settlements.filter((site) => site.properName).map((site) => ({ ...site, featureClass: site.featureClass ?? site.kind, labelSource: "settlement", scale: site.kind === "capital" ? 10_000 : site.suitability * 1_000 }));
  return [...asset.gazetteer.map((feature) => ({ ...feature, labelSource: "gazetteer" })), ...settlements].sort((a, b) => (priority[b.featureClass] ?? 0) - (priority[a.featureClass] ?? 0) || (b.scale ?? 0) - (a.scale ?? 0) || a.properName.localeCompare(b.properName)).slice(0, limit ?? lod.labels);
}

export function orthographicGeoPoint(latDeg, lonDeg, yaw = 0, pitch = 0, radius = 250) {
  const lat = latDeg * Math.PI / 180, lon = lonDeg * Math.PI / 180 + yaw;
  const x = Math.cos(lat) * Math.sin(lon), y0 = Math.sin(lat), z0 = Math.cos(lat) * Math.cos(lon);
  const y = y0 * Math.cos(pitch) - z0 * Math.sin(pitch), z = y0 * Math.sin(pitch) + z0 * Math.cos(pitch);
  return { x: x * radius, y: -y * radius, z, visible: z >= 0 };
}

/** Project a geographic polyline, breaking it whenever it crosses the limb. */
export function projectGeoPath(points, yaw = 0, pitch = 0, radius = 250, center = [450, 340], closed = false, limbClose = false) {
  if (!points?.length) return "";
  if (closed && limbClose) return projectFilledRing(points, yaw, pitch, radius, center);
  const projected = points.map(([lat, lon]) => orthographicGeoPoint(lat, lon, yaw, pitch, radius)), commands = []; let drawing = false, visibleCount = 0;
  for (const point of projected) {
    if (!point.visible) { drawing = false; continue; }
    commands.push(`${drawing ? "L" : "M"}${(center[0] + point.x).toFixed(2)},${(center[1] + point.y).toFixed(2)}`); drawing = true; visibleCount += 1;
  }
  if (closed && visibleCount === projected.length && commands.length) commands.push("Z");
  return commands.join(" ");
}

/** How many rivers and waters a phone draws at each level of detail. */
const MOBILE_WATER = Object.freeze({ orbital: { rivers: 120, waters: 160 }, regional: { rivers: 180, waters: 220 }, surface: { rivers: 240, waters: 300 } });
/** The `count` items of a list with the greatest `size`, in the list's own order (all of them when there are no more than that). */
function greatest(list, count, size) {
  if (list.length <= count) return list;
  const keep = new Set(list.map((item, index) => [size(item), index]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, count).map(([, index]) => index));
  return list.filter((_, index) => keep.has(index));
}

export function buildCartographyRenderPlan(asset, zoom = 1, mobile = false) {
  const lod = cartographyLod(zoom, mobile);
  return {
    lod,
    ecoregions: asset.regions.ecoregions.filter((region) => region.cellCount >= lod.minRegionCells),
    resources: asset.regions.resourceProvinces.filter((region) => region.cellCount >= lod.minRegionCells).slice(0, lod.resourceRegions),
    coastlines: asset.terrain.coastlines,
    // On a phone the greatest rivers and the largest waters are drawn, up to a number for the zoom: a world with
    // continents tens of millions of km² across has hundreds of each. A world with fewer keeps them all, in order.
    rivers: mobile ? greatest(asset.hydrology.rivers, MOBILE_WATER[lod.id].rivers, (river) => river.dischargeIndex ?? 0) : asset.hydrology.rivers,
    waterbodies: mobile ? greatest([...asset.hydrology.lakes, ...asset.hydrology.wetlands, ...asset.hydrology.glaciers], MOBILE_WATER[lod.id].waters, (water) => water.areaKm2 ?? 0) : [...asset.hydrology.lakes, ...asset.hydrology.wetlands, ...asset.hydrology.glaciers],
    settlements: asset.settlements,
    routes: asset.transportRoutes,
    labels: selectCartographyLabels(asset, zoom, mobile),
  };
}

export function cartographyFeatureBudget(plan) {
  return plan.ecoregions.length + plan.resources.length + plan.coastlines.length + plan.rivers.length + plan.waterbodies.length + plan.settlements.length + plan.routes.length + plan.labels.length;
}

/**
 * Project a filled ring that may cross the limb: where it passes behind the globe, close it along the
 * limb (the shorter way round) so the visible part fills correctly.
 */
function projectFilledRing(points, yaw, pitch, radius, center) {
  const ring = points.length > 1 && points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1] ? points.slice(0, -1) : points;
  const p = ring.map(([lat, lon]) => orthographicGeoPoint(lat, lon, yaw, pitch, radius)), n = p.length;
  const fmt = (x, y) => `${(center[0] + x).toFixed(2)},${(center[1] + y).toFixed(2)}`;
  if (p.every((q) => q.visible)) return `M${p.map((q) => fmt(q.x, q.y)).join(" L")} Z`;
  if (!p.some((q) => q.visible)) return "";
  const crossing = (a, b) => { const t = a.z / (a.z - b.z), x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t, k = radius / (Math.hypot(x, y) || 1); return Math.atan2(y * k, x * k); };
  const start = p.findIndex((q, i) => q.visible && !p[(i - 1 + n) % n].visible);
  const parts = []; let exitAngle = null;
  for (let step = 0; step < n; step += 1) {
    const i = (start + step) % n, q = p[i], prev = p[(i - 1 + n) % n];
    if (q.visible) {
      if (!prev.visible) {
        const entry = crossing(prev, q);
        if (exitAngle != null) { let d = entry - exitAngle; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; const steps = Math.max(2, Math.ceil(Math.abs(d) / 0.08)); for (let k = 1; k < steps; k += 1) { const a = exitAngle + d * k / steps; parts.push(fmt(Math.cos(a) * radius, Math.sin(a) * radius)); } }
        parts.push(fmt(Math.cos(entry) * radius, Math.sin(entry) * radius));
      }
      parts.push(fmt(q.x, q.y));
      const next = p[(i + 1) % n];
      if (!next.visible) { exitAngle = crossing(q, next); parts.push(fmt(Math.cos(exitAngle) * radius, Math.sin(exitAngle) * radius)); }
    }
  }
  // close from the last exit back to the first entry along the limb
  const firstEntry = crossing(p[(start - 1 + n) % n], p[start]);
  if (exitAngle != null) { let d = firstEntry - exitAngle; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; const steps = Math.max(2, Math.ceil(Math.abs(d) / 0.08)); for (let k = 1; k < steps; k += 1) { const a = exitAngle + d * k / steps; parts.push(fmt(Math.cos(a) * radius, Math.sin(a) * radius)); } }
  return `M${parts.join(" L")} Z`;
}
