const SVG_NS = "http://www.w3.org/2000/svg";
import { buildBodyLayers } from "./body-layers.mjs";
import { orthographicGeoPoint, projectGeoPath, selectCartographyLabels } from "./body-cartography.mjs";
import { nightOutlinePath, TWILIGHT_STEPS } from "./eym-seasons.mjs";
import { CLOUD_VEIL_ZOOM, PIXEL_GLOBE_MAX_ZOOM, buildSurfacePatch, buildSurfaceRaster, coverMask, patchServes, patchWindow, renderGlobe, weatherGrid } from "./eym-globe-pixels.mjs";
import { renderSuperstructureAtlas } from "./superstructure-atlas-visuals.mjs";
import { factionFamilyFor, superstructureProfile, SUPERSTRUCTURE_MODEL_VERSION } from "./superstructure-identities.mjs";
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const svg = (name, attrs = {}) => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  return node;
};

function hashUnit(text) {
  let value = 2166136261;
  for (const char of String(text)) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return (value >>> 0) / 4294967295;
}

function seededPoints(model, count, salt = "detail") {
  const identity = `${model.system}/${model.body}/${salt}`;
  return Array.from({ length: count }, (_, index) => ({
    lat: -66 + hashUnit(`${identity}/lat/${index}`) * 132,
    lon: -180 + hashUnit(`${identity}/lon/${index}`) * 360,
    size: .55 + hashUnit(`${identity}/size/${index}`) * 1.15,
  }));
}

export function liveSuperstructureIdentity(model) {
  const profile = superstructureProfile(model?.system, model?.body);
  if (!profile) return null;
  return {
    ...profile,
    modelVersion: SUPERSTRUCTURE_MODEL_VERSION,
    factionFamily: factionFamilyFor({
      system: model?.system,
      owner_faction: model?.ownerFaction ?? model?.owner_faction ?? "",
    }),
  };
}

export function schematicVisualProfile(model) {
  const text = `${model.structureClass ?? ""} ${model.visualArchetype ?? ""} ${model.function ?? ""}`.toLowerCase();
  if (["moon", "minor-world", "terrestrial"].includes(model.kind)) {
    const density = model.regions?.find((region) => region.type === "crater-provinces")?.density ?? "moderate";
    const volatile = model.regions?.find((region) => region.type === "ice-or-volatile-deposits")?.coveragePct ?? 0;
    return { renderer: "solid-world", craters: density === "dense" ? 34 : density === "sparse" ? 12 : 22, volatile, palette: model.palette };
  }
  if (model.kind === "giant") return { renderer: "giant", bands: model.regions?.find((region) => region.type === "atmospheric-bands")?.count ?? 9, storms: model.regions?.find((region) => region.type === "storm-systems")?.count ?? 4, palette: model.palette };
  if (model.kind === "asteroid-field") return { renderer: "asteroid-field", count: model.regions?.find((region) => region.type === "asteroid-population")?.count ?? 40, composition: model.composition };
  const renderer = model.kind === "station" && /ring|crown|halo/.test(text) ? "ring-station" : model.kind;
  return { renderer, mobile: /mobile|vessel|fleet/.test(`${text} ${model.mobility ?? ""}`.toLowerCase()), archetype: text, docks: model.approach?.dockingNodes?.length ?? 0 };
}

export function orthographicProject(latDeg, lonDeg, yaw = 0, pitch = 0, radius = 250) {
  const lat = latDeg * Math.PI / 180, lon = lonDeg * Math.PI / 180 + yaw;
  const x = Math.cos(lat) * Math.sin(lon), y0 = Math.sin(lat), z0 = Math.cos(lat) * Math.cos(lon);
  const y = y0 * Math.cos(pitch) - z0 * Math.sin(pitch), z = y0 * Math.sin(pitch) + z0 * Math.cos(pitch);
  return { x: x * radius, y: -y * radius, z, visible: z >= 0 };
}

/**
 * The inverse of orthographicProject: a point on the disc (x, y relative to the globe's centre, the same
 * units as `radius`) back to latitude and longitude in degrees; null off the globe.
 */
export function orthographicUnproject(x, y, yaw = 0, pitch = 0, radius = 250) {
  const X = x / radius, Y = -y / radius, r2 = X * X + Y * Y; if (!(r2 <= 1)) return null;
  const Z = Math.sqrt(1 - r2), y0 = Y * Math.cos(pitch) + Z * Math.sin(pitch), z0 = -Y * Math.sin(pitch) + Z * Math.cos(pitch);
  const lat = Math.asin(Math.max(-1, Math.min(1, y0))) * 180 / Math.PI, lon = (Math.atan2(X, z0) - yaw) * 180 / Math.PI;
  return { lat, lon: ((((lon + 180) % 360) + 360) % 360) - 180 };
}

/** A latitude and longitude as text, e.g. "6.79°S 0.41°E" (decimals as asked). */
export function formatLatLon(lat, lon, decimals = 2) {
  return `${Math.abs(lat).toFixed(decimals)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(decimals)}°${lon >= 0 ? "E" : "W"}`;
}

/** Decimals worth showing at a zoom (the globe is ~500 units across at zoom 1). */
export const latLonDecimals = (zoom) => (zoom < 2 ? 1 : zoom < 8 ? 2 : 3);

export function bodyVisualContract(model, geography = null) {
  if (geography) return { kind: geography.schemaVersion === 2 ? "refined-cartographic-globe" : "geographic-globe", atmosphere: true, features: geography.schemaVersion === 2 ? geography.gazetteer.length + geography.settlements.length : geography.cells.length };
  if (["terrestrial", "moon", "minor-world", "giant"].includes(model.kind)) return { kind: `${model.kind}-globe`, atmosphere: model.kind === "giant" || model.atmosphere !== "none or negligible", features: model.regions.length };
  return { kind: `${model.kind}-structure`, atmosphere: false, features: model.approach?.dockingNodes?.length ?? 0 };
}

// ---------------------------------------------------------------- map names: tiers by zoom, sizes in screen pixels

/** A name's tier: 0 continents and oceans; 1 what can be seen from space; 2 realms and capitals; 3 cities, ports and the larger natural features; 4 towns and smaller places. */
export const labelTier = (featureClass) => ["continent", "ocean"].includes(featureClass) ? 0
  : ["range", "forest", "islands", "sea", "desert", "jungle"].includes(featureClass) ? 1
  : ["capital", "region"].includes(featureClass) ? 2
  : ["city", "port", "lake", "river", "mountain", "hills", "valley", "island"].includes(featureClass) ? 3 : 4;
/** The zoom from which each tier's names show on worlds with vector coastlines. */
export const LABEL_TIER_ZOOM = Object.freeze([0.46, 2.2, 3.2, 5.5, 9]);
/** Beyond this zoom a continent's or ocean's name is hidden (the view is inside it). */
export const LABEL_TIER0_MAX_ZOOM = 6;
/** Each name's size on the screen, in CSS pixels (styles/body-map.css uses the same sizes). */
export const labelScreenPx = (featureClass) => featureClass === "continent" ? 20 : featureClass === "ocean" ? 16 : featureClass === "capital" ? 15 : ({ 1: 14.5, 2: 14, 3: 13 })[labelTier(featureClass)] ?? 12;

export class BodyView {
  constructor(svgRoot, { model, geography = null, onExitRequested = () => {}, onFeatureSelected = () => {}, onPlaceSelected = () => {} }) {
    this.svg = svgRoot; this.model = model; this.geography = geography;
    this.onExitRequested = onExitRequested; this.onFeatureSelected = onFeatureSelected; this.onPlaceSelected = onPlaceSelected;
    this.state = { yaw: -.35, pitch: .18, zoom: 1 }; this.pointers = new Map(); this.drag = null; this.pinch = null; this.exitTriggered = false;
    this.build(); this.attachEvents(); this.render();
  }

  destroy() {
    for (const [event, handler] of Object.entries(this.listeners)) this.svg.removeEventListener(event, handler); this.svg.replaceChildren();
    if (this.pixel) { clearTimeout(this.pixel.sharpTimer); this.pixel.canvas.remove(); this.pixel = null; this.svg.classList.remove("is-pixel-globe"); }
  }
  resetView() { Object.assign(this.state, { yaw: -.35, pitch: .18, zoom: 1 }); this.render(); }
  clearSelection() { this.onFeatureSelected(null); }
  setLayerVisibility(layer, visible) { this.layerGroups?.get(layer)?.classList.toggle("is-hidden", !visible); if (this.pixel) this.#queuePixels(); }

  build() {
    this.svg.replaceChildren(); this.svg.setAttribute("viewBox", "0 0 900 680"); this.svg.classList.add("oscm-body-view");
    const defs = svg("defs"), clip = svg("clipPath", { id: "oscm-body-disc-clip" }); this.discClip = svg("circle", { cx: 450, cy: 340, r: 250 }); clip.append(this.discClip); defs.append(clip);
    const rocky = svg("radialGradient", { id: "oscm-rocky-gradient", cx: "32%", cy: "27%" }); rocky.append(svg("stop", { offset: "0%", "stop-color": "#c2b7a2" }), svg("stop", { offset: "58%", "stop-color": "#6e6a63" }), svg("stop", { offset: "100%", "stop-color": "#272d30" })); defs.append(rocky);
    const icy = svg("radialGradient", { id: "oscm-icy-gradient", cx: "30%", cy: "25%" }); icy.append(svg("stop", { offset: "0%", "stop-color": "#e7fbff" }), svg("stop", { offset: "58%", "stop-color": "#87aeb8" }), svg("stop", { offset: "100%", "stop-color": "#344a54" })); defs.append(icy);
    const metal = svg("linearGradient", { id: "oscm-metal-gradient", x1: "0%", x2: "100%" }); metal.append(svg("stop", { offset: "0%", "stop-color": "#24373d" }), svg("stop", { offset: "45%", "stop-color": "#a8bdbe" }), svg("stop", { offset: "58%", "stop-color": "#3d555b" }), svg("stop", { offset: "100%", "stop-color": "#101b20" })); defs.append(metal);
    this.backdrop = svg("g", { class: "oscm-body-backdrop" });
    this.disc = svg("circle", { class: "oscm-body-disc", cx: 450, cy: 340, r: 250 });
    this.surface = svg("g", { class: "oscm-body-surface", "clip-path": "url(#oscm-body-disc-clip)" });
    this.night = svg("ellipse", { class: "oscm-body-night", cx: 540, cy: 340, rx: 180, ry: 250 });
    this.atmosphere = svg("circle", { class: "oscm-body-atmosphere", cx: 450, cy: 340, r: 256 });
    this.structure = svg("g", { class: "oscm-body-structure" });
    this.labels = svg("g", { class: "oscm-body-labels" }); this.svg.append(defs, this.backdrop, this.disc, this.surface, this.night, this.atmosphere, this.structure, this.labels);
    this.featureNodes = [];
    if (this.geography) this.buildGeography(); else this.buildSchematic();
  }

  buildGeography() {
    if (this.geography.schemaVersion === 2) { this.#buildRefinedGeography(); return; }
    const layers = buildBodyLayers(this.geography); this.layerGroups = new Map();
    for (const id of ["terrain", "hydrology", "resources", "settlements", "transport"]) { const group = svg("g", { class: `oscm-body-layer is-${id}` }); this.surface.append(group); this.layerGroups.set(id, group); }
    const step = this.geography.resolutionDeg;
    for (const cell of this.geography.cells) {
      const node = svg("rect", { class: `oscm-body-cell biome-${cell.biome}`, width: Math.max(2, step * 2.2), height: Math.max(2, step * 2.2), "data-feature": cell.biome, "data-resource": cell.resource, "data-soil": cell.soil });
      node.addEventListener("click", () => this.onFeatureSelected(cell)); this.layerGroups.get("terrain").append(node); this.featureNodes.push({ node, lat: cell.lat, lon: cell.lon, feature: cell });
    }
    for (const feature of layers.hydrology) {
      const node = svg(feature.kind === "river" ? "line" : "circle", { class: `oscm-body-${feature.kind}`, r: 3, "data-feature": feature.id });
      this.layerGroups.get("hydrology").append(node); this.featureNodes.push(feature.kind === "river" ? { node, lat: feature.from[0], lon: feature.from[1], lat2: feature.to[0], lon2: feature.to[1], feature } : { node, lat: feature.at[0], lon: feature.at[1], feature });
    }
    for (const feature of layers.resources.filter((_, index) => index % 4 === 0)) {
      const node = svg("circle", { class: "oscm-body-resource", r: 2.5, "data-feature": feature.id, "data-resource": feature.resource });
      node.addEventListener("click", () => this.onFeatureSelected(feature)); this.layerGroups.get("resources").append(node); this.featureNodes.push({ node, lat: feature.at[0], lon: feature.at[1], feature });
    }
    for (const site of layers.settlements) {
      const node = svg("circle", { class: `oscm-body-settlement is-${site.kind}`, r: site.kind === "capital" ? 5 : 3, "data-feature": site.id });
      node.addEventListener("click", () => this.onFeatureSelected(site)); this.layerGroups.get("settlements").append(node); this.featureNodes.push({ node, lat: site.lat, lon: site.lon, feature: site });
    }
    for (const route of layers.transport) {
      if (!route.fromSite || !route.toSite) continue;
      const node = svg("line", { class: `oscm-body-transport is-${route.mode}`, "data-feature": route.id }); this.layerGroups.get("transport").append(node);
      this.featureNodes.push({ node, lat: route.fromSite.lat, lon: route.fromSite.lon, lat2: route.toSite.lat, lon2: route.toSite.lon, feature: route });
    }
    this.layerGroups.get("resources").classList.add("is-hidden");
  }

  #buildRefinedGeography() {
    const asset = this.geography, namedByRef = new Map(asset.gazetteer.filter((feature) => feature.geometryRef).map((feature) => [feature.geometryRef, feature]));
    this.cartography = true; this.disc.classList.add("is-refined-ocean"); this.layerGroups = new Map();
    for (const id of ["terrain", "hydrology", "resources", "settlements", "transport", "labels"]) { const group = svg("g", { class: `oscm-body-layer is-${id}` }); (id === "labels" ? this.labels : this.surface).append(group); this.layerGroups.set(id, group); }
    const addPath = (group, feature, rings, className, { minZoom = .46, closed = false, filled = false } = {}) => {
      const node = svg("path", { class: className, "data-feature": feature.id ?? feature.properName });
      node.addEventListener("click", () => this.onFeatureSelected(feature)); group.append(node); this.featureNodes.push({ node, rings, feature, minZoom, closed, limbClose: filled, cartographicPath: true }); return node;
    };
    // Vector coastlines (Eym): land is filled from the coastline rings, and land
    // biomes are clipped to it, so the coarse biome raster never spills into the sea.
    const vectorCoast = asset.terrain.coastlineSource === "vector", oceanBiome = (category) => /ocean|sea-ice/.test(category);
    const landRings = asset.terrain.coastlines.map((coast) => coast.points);
    if (vectorCoast) {
      const clip = svg("clipPath", { id: "oscm-land-clip" }), clipPath = svg("path", { "clip-rule": "evenodd" }); clip.append(clipPath); this.svg.querySelector("defs").append(clip);
      this.featureNodes.push({ node: clipPath, rings: landRings, feature: {}, minZoom: 0, closed: true, limbClose: true, cartographicPath: true });
    }
    const regions = asset.regions.ecoregions.slice(0, 700), drawRegion = (region) => {
      const feature = { ...region, ...(namedByRef.get(region.id) ?? {}), type: "ecoregion", scientificClassification: region.category };
      const node = addPath(this.layerGroups.get("terrain"), feature, region.polygons, `oscm-cartography-region biome-${region.category}`, { minZoom: vectorCoast ? 0 : region.cellCount >= 42 ? .46 : region.cellCount >= 10 ? 1.15 : 2.15, closed: true, filled: vectorCoast });
      if (vectorCoast && !oceanBiome(region.category)) node.setAttribute("clip-path", "url(#oscm-land-clip)");
    };
    if (vectorCoast) {
      // Small continents need a closer look: allow much deeper zoom, and draw the
      // forests, uplands, mountains and peaks traced or seeded at 6–10 km.
      this.maxZoom = 30; this.disc.classList.add("is-vector-ocean"); this.fadeNightWithZoom = true;
      const before = this.featureNodes.length;
      for (const region of regions.filter((item) => item.category === "sea-ice")) drawRegion(region);
      this.staticIceNodes = this.featureNodes.slice(before).map((item) => item.node);
      // Seasonal sea ice goes under the land, seasonal snow over it (see setEnvironment).
      this.iceLayer = svg("g", { class: "oscm-season-ice" }); this.layerGroups.get("terrain").append(this.iceLayer);
      addPath(this.layerGroups.get("terrain"), { type: "land" }, landRings, "oscm-cartography-land", { minZoom: 0, closed: true, filled: true });
      for (const region of regions.filter((item) => !oceanBiome(item.category))) drawRegion(region);
      for (const detail of asset.terrain.detail ?? []) addPath(this.layerGroups.get("terrain"), { id: detail.id, type: detail.kind, continent: detail.continent }, detail.rings, `oscm-cartography-detail is-${detail.kind}`, { minZoom: detail.kind === "forest" ? 1.6 : .46, closed: true, filled: true }).setAttribute("clip-path", "url(#oscm-land-clip)");
      this.snowLayer = svg("g", { class: "oscm-season-snow", "clip-path": "url(#oscm-land-clip)" }); this.layerGroups.get("terrain").append(this.snowLayer);
      // Weather: clouds and rain, storms and pressure centres, and (off by default) wind.
      this.weatherGroups = {};
      // Clouds and rain are drawn as merged, blurred fields rather than separate discs.
      const blur = svg("filter", { id: "oscm-weather-blur", filterUnits: "userSpaceOnUse", x: -200, y: -200, width: 1300, height: 1080 }); this.weatherBlur = svg("feGaussianBlur", { stdDeviation: 6 }); blur.append(this.weatherBlur); this.svg.querySelector("defs").append(blur);
      for (const id of ["clouds", "storms", "centres", "wind"]) { const group = svg("g", { class: `oscm-body-layer oscm-weather-layer is-weather-${id}` }); this.surface.append(group); this.layerGroups.set(`weather-${id}`, group); this.weatherGroups[id] = group; }
      // Wind and the highs and lows are off until asked for.
      this.weatherGroups.wind.classList.add("is-hidden"); this.weatherGroups.centres.classList.add("is-hidden");
      // The globe as pixel art (scripts/eym-globe-pixels.mjs): it stands in for the ground, water, cloud and night
      // until the view is close enough for the surveyed map to take over.
      // It is painted on a canvas laid under the (see-through) map, which costs far less than an image in it.
      if (this.svg.parentNode) {
        this.pixel = { canvas: Object.assign(document.createElement("canvas"), { className: "oscm-globe-canvas" }), rivers: asset.hydrology.rivers.map((river) => river.points) };
        this.svg.parentNode.insertBefore(this.pixel.canvas, this.svg);
      }
      // Night and the three twilights, darkest last, over everything on the surface.
      this.nightLayer = svg("g", { class: "oscm-terminator is-hidden" }); this.surface.append(this.nightLayer);
      this.nightBands = TWILIGHT_STEPS.map((step) => { const node = svg("path", { class: `oscm-night-band below-${-step}` }); this.nightLayer.append(node); return { node, belowDeg: -step }; });
    } else for (const region of regions) drawRegion(region);
    for (const coast of asset.terrain.coastlines) addPath(this.layerGroups.get("terrain"), namedByRef.get(coast.id) ?? { ...coast, type: "coastline" }, [coast.points], "oscm-cartography-coast", { closed: true, minZoom: vectorCoast && coast.areaKm2 < 2000 ? 1.15 : .46 });
    for (const river of asset.hydrology.rivers) addPath(this.layerGroups.get("hydrology"), namedByRef.get(river.id) ?? { ...river, type: "river" }, [river.points], "oscm-cartography-river");
    for (const [kind, features] of [["lake", asset.hydrology.lakes], ["wetland", asset.hydrology.wetlands], ["glacier", asset.hydrology.glaciers]]) for (const feature of features) addPath(this.layerGroups.get("hydrology"), namedByRef.get(feature.id) ?? { ...feature, type: feature.waterKind === "river-channel" ? "river" : kind }, [feature.polygon, ...(feature.islands ?? [])], `oscm-cartography-${kind}`, { minZoom: kind === "lake" ? (vectorCoast ? .46 : 1.05) : 1.35, closed: true });
    for (const region of asset.regions.resourceProvinces.slice(0, 240)) addPath(this.layerGroups.get("resources"), { ...region, type: "resource province", scientificClassification: region.category }, region.polygons, `oscm-cartography-resource resource-${region.category}`, { minZoom: region.cellCount >= 10 ? 1.15 : 2.15, closed: true });
    for (const site of asset.settlements) {
      const minor = !["capital", "city"].includes(site.kind);
      const minZoom = site.kind === "capital" ? .46 : vectorCoast ? (minor ? 6 : 2.5) : minor ? 1.6 : .85;
      const node = svg("circle", { class: `oscm-body-settlement is-${site.kind}`, r: site.kind === "capital" ? 5 : minor ? 2 : 3, "data-feature": site.id }); node.addEventListener("click", () => this.onFeatureSelected(site)); this.layerGroups.get("settlements").append(node); this.featureNodes.push({ node, lat: site.lat, lon: site.lon, feature: site, minZoom });
    }
    for (const route of asset.transportRoutes) addPath(this.layerGroups.get("transport"), route, [route.points], `oscm-body-transport is-${route.mode}`, { minZoom: route.kind?.includes("primary") ? 1.05 : 1.35 });
    // Names come in by tiers as the view closes in (owner, 19 November 2026): the continents and oceans from afar; then
    // what can be seen from space (ranges, great forests, island groups, seas); then the realms and their capitals;
    // then cities, ports, lakes, rivers and peaks; last the towns, forts and smaller places.
    const vectorLabelZoom = (featureClass) => LABEL_TIER_ZOOM[labelTier(featureClass)];
    for (const feature of selectCartographyLabels(asset, 4.5, false, vectorCoast ? 400 : undefined)) {
      const node = svg("text", { class: `oscm-cartography-label is-${feature.featureClass}`, "data-feature": feature.id }); node.textContent = feature.properName; node.addEventListener("click", () => this.onFeatureSelected(feature)); this.layerGroups.get("labels").append(node);
      const minZoom = vectorCoast ? vectorLabelZoom(feature.featureClass) : ["capital", "continent", "ocean"].includes(feature.featureClass) ? .46 : ["city", "port", "sea", "range", "region"].includes(feature.featureClass) ? 1.15 : 2.15;
      // Close in, a continent's or ocean's name would sit over the very places it contains: it gives way.
      const maxZoom = vectorCoast && labelTier(feature.featureClass) === 0 ? LABEL_TIER0_MAX_ZOOM : undefined;
      this.featureNodes.push({ node, lat: feature.at[0], lon: feature.at[1], feature, minZoom, maxZoom, label: true });
    }
    this.layerGroups.get("resources").classList.add("is-hidden");
  }

  /**
   * Show the real day and night and the season's snow and sea ice (worlds with vector coastlines).
   * @param environment { subsolar: { latDeg, lonDeg }, snow: rings, ice: rings }
   */
  setEnvironment(environment) {
    if (!this.nightLayer) return;
    this.environment = environment;
    if (this.pixel && this.pixel.coverOf !== environment.snow) { this.pixel.coverOf = environment.snow; this.pixel.snow = coverMask(environment.snow); this.pixel.ice = coverMask(environment.ice); this.pixel.stamp = (this.pixel.stamp ?? 0) + 1; }
    this.night.classList.add("is-hidden"); this.nightLayer.classList.remove("is-hidden");
    for (const node of this.staticIceNodes ?? []) node.style.display = "none";
    this.featureNodes = this.featureNodes.filter((item) => !item.seasonal);
    for (const [layer, rings, kind] of [[this.iceLayer, environment.ice ?? [], "ice"], [this.snowLayer, environment.snow ?? [], "snow"]]) {
      layer.replaceChildren();
      if (!rings.length) continue;
      const node = svg("path", { class: `oscm-season-cover is-${kind}` }); layer.append(node);
      this.featureNodes.push({ node, rings, feature: { type: kind === "ice" ? "sea ice" : "snow cover" }, minZoom: 0, closed: true, limbClose: true, cartographicPath: true, seasonal: true });
    }
    this.render();
  }

  /**
   * Show the weather (from globeWeather in scripts/eym-weather.mjs): cloud and rain, highs and lows,
   * tropical cyclones, floods and wind.
   */
  setWeather(globe) {
    if (!this.weatherGroups) return;
    if (this.pixel) { this.pixel.weather = weatherGrid(globe); this.pixel.stamp = (this.pixel.stamp ?? 0) + 1; }
    this.featureNodes = this.featureNodes.filter((item) => !item.weather);
    for (const group of Object.values(this.weatherGroups)) group.replaceChildren();
    const point = (group, node, lat, lon, extra = {}) => { group.append(node); this.featureNodes.push({ node, lat, lon, feature: extra.feature ?? {}, minZoom: extra.minZoom ?? 0, radiusDeg: extra.radiusDeg, weather: true, steadyOpacity: extra.steadyOpacity }); };
    // One blurred group per cloud thickness and per kind of rain: discs merge instead of stacking.
    const field = (name) => { const g = svg("g", { class: `oscm-weather-field is-${name}`, filter: "url(#oscm-weather-blur)" }); this.weatherGroups.clouds.append(g); return g; };
    const fields = { thin: field("cloud-thin"), mid: field("cloud-mid"), thick: field("cloud-thick"), rain: field("rain"), sleet: field("sleet"), snow: field("snow"), heavy: field("rain-heavy"), thunder: field("thunder") };
    for (const cell of globe.cells) {
      if (cell.cloud > 0.4) point(cell.cloud > 0.85 ? fields.thick : cell.cloud > 0.62 ? fields.mid : fields.thin, svg("circle", { class: "oscm-weather-cloud" }), cell.lat, cell.lon, { radiusDeg: 3.9, steadyOpacity: true });
      if (cell.precipKind && cell.precipMmH > 0.1) point(cell.thunder ? fields.thunder : cell.precipKind === "rain" && cell.precipMmH > 3 ? fields.heavy : fields[cell.precipKind], svg("circle", { class: "oscm-weather-precip" }), cell.lat, cell.lon, { radiusDeg: 2.6, steadyOpacity: true });
      // Wind: an arrow downwind, its length growing with the speed.
      const k = 0.09 * Math.min(cell.windMs, 30), cos = Math.max(0.2, Math.cos(cell.lat * Math.PI / 180)), speed = Math.hypot(cell.windE, cell.windN) || 1;
      const dn = cell.windN / speed * k, de = cell.windE / speed * k / cos, end = [cell.lat + dn, cell.lon + de];
      const head = (sign) => { const a = sign * 0.45, bn = -dn * 0.35, be = -de * 0.35 * cos; return [end[0] + bn * Math.cos(a) - be * Math.sin(a), end[1] + (bn * Math.sin(a) + be * Math.cos(a)) / cos]; };
      const arrow = svg("path", { class: `oscm-weather-wind${cell.windMs >= 17 ? " is-gale" : ""}` }); this.weatherGroups.wind.append(arrow);
      this.featureNodes.push({ node: arrow, rings: [[[cell.lat, cell.lon], end], [head(1), end, head(-1)]], feature: {}, minZoom: 0, cartographicPath: true, weather: true });
    }
    for (const centre of globe.centres) {
      const text = svg("text", { class: `oscm-weather-centre is-${centre.kind}`, "text-anchor": "middle", "dominant-baseline": "middle" }); text.textContent = centre.kind === "low" ? "L" : "H";
      const title = svg("title"); title.textContent = `${centre.kind === "low" ? "Low" : "High"} ${centre.pressureHpa} hPa`; text.append(title);
      point(this.weatherGroups.centres, text, centre.lat, centre.lon);
    }
    for (const cyclone of globe.cyclones) {
      const g = svg("g", { class: `oscm-weather-cyclone is-${cyclone.kind.replace(/ /g, "-")}` });
      g.append(svg("circle", { r: 3 }), svg("path", { d: "M 0 -9 C 7 -9 9 -2 6 3 M 0 9 C -7 9 -9 2 -6 -3" }));
      const label = svg("text", { x: 11, y: 4 }); label.textContent = `${cyclone.kind[0].toUpperCase()}${cyclone.kind.slice(1)}, ${Math.round(cyclone.maxWindMs * 3.6)} km/h`; g.append(label);
      point(this.weatherGroups.storms, g, cyclone.lat, cyclone.lon, { feature: { type: cyclone.kind, scientificClassification: `${Math.round(cyclone.maxWindMs * 3.6)} km/h winds` } });
    }
    for (const flood of globe.floods) point(this.weatherGroups.storms, svg("circle", { class: "oscm-weather-flood" }), flood.lat, flood.lon, { radiusDeg: 0.45, minZoom: 1.5, feature: { type: "flooding" } });
    this.render();
  }

  buildSchematic() {
    const profile = schematicVisualProfile(this.model), natural = ["solid-world", "giant"].includes(profile.renderer);
    this.svg.classList.toggle("is-structure-body", !natural);
    if (natural) this.#buildNaturalSchematic(profile); else if (profile.renderer === "asteroid-field") this.#buildAsteroidField(profile); else this.#buildArtificialSchematic(profile);
  }

  #buildNaturalSchematic(profile) {
    this.disc.classList.add(`is-${profile.renderer}`, Number(profile.volatile) > 15 ? "is-icy" : "is-rocky");
    this.atmosphere.classList.toggle("is-hidden", !bodyVisualContract(this.model).atmosphere);
    if (profile.renderer === "giant") {
      for (let index = 0; index < profile.bands; index += 1) {
        const y = -205 + index * (410 / Math.max(1, profile.bands - 1));
        const width = Math.sqrt(Math.max(0, 1 - (y / 238) ** 2)) * 238;
        const band = svg("rect", { class: `oscm-giant-band band-${index % 4}`, x: 450 - width, y: 340 + y - 11, width: width * 2, height: 22 });
        this.surface.append(band);
      }
      for (const point of seededPoints(this.model, profile.storms, "storm")) {
        const storm = svg("ellipse", { class: "oscm-giant-storm", rx: 13 * point.size, ry: 6 * point.size });
        this.surface.append(storm); this.featureNodes.push({ node: storm, lat: point.lat, lon: point.lon, feature: { type: "storm system" } });
      }
      return;
    }
    for (const [index, point] of seededPoints(this.model, profile.craters, "crater").entries()) {
      const crater = svg("g", { class: "oscm-solid-crater" }); crater.append(svg("circle", { r: 5.5 * point.size, class: "oscm-crater-rim" }), svg("circle", { cx: 1.8 * point.size, cy: 1.4 * point.size, r: 3.5 * point.size, class: "oscm-crater-floor" }));
      this.surface.append(crater); this.featureNodes.push({ node: crater, lat: point.lat, lon: point.lon, feature: { id: `crater-${index + 1}`, type: "impact crater" } });
    }
    const depositCount = Math.round(clamp(Number(profile.volatile) / 5, 0, 14));
    for (const point of seededPoints(this.model, depositCount, "volatile")) {
      const deposit = svg("path", { class: "oscm-volatile-deposit", d: `M -${11 * point.size} 2 Q 0 -${9 * point.size} ${12 * point.size} 1 Q 2 ${8 * point.size} -${11 * point.size} 2 Z` });
      this.surface.append(deposit); this.featureNodes.push({ node: deposit, lat: Math.sign(point.lat || 1) * (58 + Math.abs(point.lat) % 25), lon: point.lon, feature: { type: "ice / volatile deposit" } });
    }
  }

  #buildAsteroidField(profile) {
    this.disc.classList.add("is-hidden"); this.surface.classList.add("is-hidden"); this.night.classList.add("is-hidden"); this.atmosphere.classList.add("is-hidden");
    this.structure.classList.add("is-asteroid-field");
    const points = seededPoints(this.model, profile.count, "asteroid");
    points.forEach((point, index) => {
      const distance = 45 + hashUnit(`${this.model.body}/distance/${index}`) * 235, angle = hashUnit(`${this.model.body}/angle/${index}`) * Math.PI * 2;
      const size = 4 + point.size * 10, rough = .72 + hashUnit(`${this.model.body}/rough/${index}`) * .35;
      const rock = svg("path", { class: `oscm-asteroid-rock mineral-${index % 4}`, d: `M ${-size} ${-size * .25} L ${-size * .45} ${-size * rough} L ${size * .4} ${-size * .7} L ${size} ${-size * .05} L ${size * .58} ${size * .8} L ${-size * .36} ${size} Z`, transform: `translate(${Math.cos(angle) * distance} ${Math.sin(angle) * distance * .72}) rotate(${index * 37})` });
      rock.addEventListener("click", () => this.onFeatureSelected({ id: `asteroid-${index + 1}`, type: "mapped belt body", resource: this.model.resourceProfile })); this.structure.append(rock);
    });
    this.structure.append(svg("ellipse", { class: "oscm-belt-reference-orbit", rx: 275, ry: 198 }));
  }

  #line(x1, y1, x2, y2, className = "oscm-structure-line") { const node = svg("line", { x1, y1, x2, y2, class: className }); this.structure.append(node); return node; }
  #module(x, y, width, height, className = "oscm-structure-module") { const node = svg("rect", { x, y, width, height, rx: 3, class: className }); this.structure.append(node); return node; }
  #hull(x, y, scale = 1, className = "oscm-vessel-hull") { const node = svg("path", { class: className, d: "M -92 0 L -54 -24 L 42 -19 L 96 0 L 42 19 L -54 24 Z", transform: `translate(${x} ${y}) scale(${scale})` }); this.structure.append(node); return node; }

  #buildArtificialSchematic(profile) {
    this.disc.classList.add("is-hidden"); this.surface.classList.add("is-hidden"); this.night.classList.add("is-hidden"); this.atmosphere.classList.add("is-hidden");
    this.structure.classList.add(`is-${profile.renderer}`);
    const palette = `${this.model.palette ?? ""}`.toLowerCase();
    if (/gold|amber|ochre/.test(palette)) this.structure.classList.add("palette-gold");
    if (/red|crimson/.test(palette)) this.structure.classList.add("palette-red");
    if (/jade|green|viridian/.test(palette)) this.structure.classList.add("palette-jade");

    const superstructure = liveSuperstructureIdentity(this.model);
    if (superstructure) {
      this.structure.classList.add("is-superstructure-parity");
      this.structure.setAttribute("data-superstructure-family", superstructure.silhouetteFamily);
      this.structure.insertAdjacentHTML(
        "beforeend",
        renderSuperstructureAtlas(
          superstructure,
          { x: -340, y: -260, width: 680, height: 520 },
          { includeSectionalBand: false },
        ),
      );
      this.#buildDockingNodes();
      return;
    }

    if (profile.renderer === "shipyard") this.#buildShipyard();
    else if (profile.renderer === "vessel") this.#buildVessel();
    else if (profile.renderer === "fleet") this.#buildFleet();
    else if (profile.renderer === "blinkgate") this.#buildBlinkgate();
    else if (profile.renderer === "megastructure") this.#buildMegastructure(profile);
    else if (profile.renderer === "anomaly") this.#buildAnomaly();
    else this.#buildStation(profile.renderer === "ring-station");
    this.#buildDockingNodes();
  }

  #buildStation(ringStation = false) {
    const rings = ringStation ? [86, 145, 205] : [78, 150];
    for (const radius of rings) { this.structure.append(svg("ellipse", { class: "oscm-station-ring", rx: radius, ry: radius * .38 })); for (const angle of [0, 60, 120, 180, 240, 300]) this.#line(Math.cos(angle * Math.PI / 180) * 30, Math.sin(angle * Math.PI / 180) * 13, Math.cos(angle * Math.PI / 180) * radius, Math.sin(angle * Math.PI / 180) * radius * .38, "oscm-station-spoke"); }
    this.structure.append(svg("circle", { class: "oscm-station-hub", r: 38 }), svg("ellipse", { class: "oscm-station-core", rx: 22, ry: 12 }));
    for (let index = 0; index < 8; index += 1) { const angle = index * Math.PI / 4, x = Math.cos(angle) * 150, y = Math.sin(angle) * 57; this.#module(x - 17, y - 7, 34, 14, index % 2 ? "oscm-habitat-module" : "oscm-service-module"); }
    this.#module(-215, -8, 54, 16, "oscm-solar-array"); this.#module(161, -8, 54, 16, "oscm-solar-array");
  }

  #buildShipyard() {
    this.#line(-220, 0, 220, 0, "oscm-yard-truss"); this.#line(-205, -22, 205, -22, "oscm-yard-truss-minor"); this.#line(-205, 22, 205, 22, "oscm-yard-truss-minor");
    for (const x of [-150, 0, 150]) { this.structure.append(svg("path", { class: "oscm-yard-gantry", d: `M ${x - 42} -108 L ${x - 42} 108 M ${x + 42} -108 L ${x + 42} 108 M ${x - 42} -108 L ${x + 42} -108 M ${x - 42} 108 L ${x + 42} 108` })); this.#hull(x, x === 0 ? 38 : -35, .46, "oscm-docked-hull"); }
    for (const x of [-225, 225]) this.#module(x - 22, -34, 44, 68, "oscm-yard-reactor");
  }

  #buildVessel() { this.#hull(0, 0, 2.15); this.#module(-132, -42, 104, 22, "oscm-vessel-deck"); this.#module(-132, 20, 104, 22, "oscm-vessel-deck"); for (const y of [-48, 0, 48]) this.structure.append(svg("circle", { class: "oscm-engine-bell", cx: -204, cy: y, r: 16 })); this.#line(-150, 0, 165, 0, "oscm-vessel-keel"); }
  #buildFleet() { for (const [x, y, scale] of [[0, 0, 1.35], [-155, -105, .62], [-155, 105, .62], [150, -72, .48], [150, 72, .48]]) this.#hull(x, y, scale, scale > 1 ? "oscm-vessel-hull" : "oscm-escort-hull"); }
  #buildBlinkgate() { for (let index = 0; index < 12; index += 1) this.structure.append(svg("path", { class: "oscm-gate-segment", d: "M 0 -232 A 232 232 0 0 1 116 -201 L 92 -159 A 184 184 0 0 0 0 -184 Z", transform: `rotate(${index * 30})` })); this.structure.append(svg("circle", { class: "oscm-gate-horizon", r: 169 }), svg("circle", { class: "oscm-gate-core", r: 142 })); }
  #buildMegastructure(profile) { if (/tether|linear/.test(profile.archetype)) { this.#line(0, -265, 0, 265, "oscm-megastructure-tether"); for (const y of [-230, -120, 0, 120, 230]) { this.structure.append(svg("circle", { class: "oscm-tether-node", cy: y, r: y ? 18 : 34 })); this.#module(-92, y - 8, 184, 16, "oscm-tether-crossbar"); } } else this.#buildStation(true); }
  #buildAnomaly() { for (let index = 0; index < 9; index += 1) this.structure.append(svg("ellipse", { class: "oscm-anomaly-loop", rx: 65 + index * 18, ry: 30 + index * 13, transform: `rotate(${index * 23})`, opacity: .72 - index * .055 })); }

  #buildDockingNodes() {
    for (const [index, dock] of (this.model.approach?.dockingNodes ?? []).entries()) { const angle = (dock.bearingDeg ?? index * 120) * Math.PI / 180, x = Math.cos(angle) * 270, y = Math.sin(angle) * 235; const node = svg("g", { class: "oscm-docking-approach", transform: `translate(${x} ${y})` }); node.append(svg("path", { d: "M 0 -9 L 9 0 L 0 9 L -9 0 Z" }), svg("text", { x: 14, y: 4 })); node.lastChild.textContent = dock.id; node.addEventListener("click", () => this.onFeatureSelected({ ...dock, type: "docking approach" })); this.structure.append(node); }
  }

  attachEvents() {
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    this.listeners = {
      pointerdown: (event) => { const p = { id: event.pointerId, x: event.clientX, y: event.clientY }; this.press = this.pointers.size === 0 ? { ...p } : null; this.pointers.set(p.id, p); this.svg.setPointerCapture?.(p.id); if (this.pointers.size === 1) this.drag = { ...p, yaw: this.state.yaw, pitch: this.state.pitch }; else { const [a, b] = [...this.pointers.values()]; this.drag = null; this.pinch = { distance: dist(a, b), zoom: this.state.zoom }; } },
      pointermove: (event) => { this.#hover(event); const p = this.pointers.get(event.pointerId); if (!p) return; p.x = event.clientX; p.y = event.clientY; if (this.pinch && this.pointers.size > 1) { const [a, b] = [...this.pointers.values()]; this.changeZoom(this.pinch.zoom * dist(a, b) / this.pinch.distance); } else if (this.drag) { this.state.yaw = this.drag.yaw + (event.clientX - this.drag.x) * .008; this.state.pitch = clamp(this.drag.pitch + (event.clientY - this.drag.y) * .008, -1.45, 1.45); this.render(); } },
      // A press that ends where it began is a click (the pointer capture used for dragging keeps clicks
      // from reaching the markers, so the view picks for them): a settlement or feature near it, else the place.
      pointerup: (event) => { const press = this.press; this.press = null; this.pointers.delete(event.pointerId); this.drag = null; this.pinch = null; if (press && press.id === event.pointerId && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 6) this.#click(event); },
      pointerleave: () => this.#hideReadout(),
      pointercancel: (event) => this.listeners.pointerup(event),
      wheel: (event) => { event.preventDefault(); this.changeZoom(this.state.zoom * Math.exp(-event.deltaY * .0012)); },
      dblclick: (event) => { if (event.target === this.svg) this.resetView(); },
    };
    for (const [event, handler] of Object.entries(this.listeners)) this.svg.addEventListener(event, handler, event === "wheel" ? { passive: false } : undefined);
  }

  /** A client (screen) point in the view's own units, relative to the globe's centre. */
  #local(event) {
    const m = this.svg.getScreenCTM?.(); if (!m || typeof DOMPoint === "undefined") return null;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(m.inverse()); return { x: p.x - 450, y: p.y - 340, sx: p.x, sy: p.y };
  }

  /** The visible point feature (a settlement first) within reach of a point in view units, if any. */
  pickFeature(sx, sy, reach = 11) {
    const radius = 250 * this.state.zoom; let best = null;
    for (const item of this.featureNodes ?? []) {
      if (item.cartographicPath || item.schematic || !Number.isFinite(item.lat) || item.node?.hidden || !item.feature) continue;
      const p = orthographicProject(item.lat, item.lon, this.state.yaw, this.state.pitch, radius); if (!p.visible) continue;
      const settlement = /settlement/.test(item.node?.getAttribute?.("class") ?? "") || ["capital", "city", "town", "village", "fort", "port"].includes(item.feature.featureClass ?? item.feature.kind);
      const d = Math.hypot(450 + p.x - sx, 340 + p.y - sy) - (settlement ? 4 : 0); if (d > reach) continue;
      if (!best || d < best.d) best = { d, feature: item.feature };
    }
    return best?.feature ?? null;
  }

  #click(event) {
    if (!this.geography) return;
    const at = this.#local(event); if (!at) return;
    const feature = this.pickFeature(at.sx, at.sy); if (feature) { this.onFeatureSelected(feature); return; }
    const place = orthographicUnproject(at.x, at.y, this.state.yaw, this.state.pitch, 250 * this.state.zoom); if (place) this.onPlaceSelected(place);
  }

  /** The latitude and longitude under the cursor, beside it (and the settlement under it, if any). */
  #hover(event) {
    if (!this.geography || this.drag || this.pinch) { if (this.drag || this.pinch) this.#hideReadout(); return; }
    const at = this.#local(event), place = at && orthographicUnproject(at.x, at.y, this.state.yaw, this.state.pitch, 250 * this.state.zoom); if (!place) { this.#hideReadout(); return; }
    if (!this.readout?.isConnected) {
      const ns = "http://www.w3.org/2000/svg"; this.readout = document.createElementNS(ns, "g"); this.readout.setAttribute("class", "oscm-cursor-readout"); this.readout.setAttribute("pointer-events", "none");
      this.readoutBox = document.createElementNS(ns, "rect"); this.readoutBox.setAttribute("rx", "3"); this.readoutText = document.createElementNS(ns, "text");
      this.readout.append(this.readoutBox, this.readoutText); this.svg.append(this.readout);
    }
    const feature = this.pickFeature(at.sx, at.sy), name = feature ? (feature.properName ?? feature.name ?? "") : "";
    this.readoutText.textContent = `${name ? `${name} · ` : ""}${formatLatLon(place.lat, place.lon, latLonDecimals(this.state.zoom))}`;
    const w = 7.2 * this.readoutText.textContent.length + 10, x = Math.min(900 - w - 4, at.sx + 14), y = Math.max(18, at.sy - 14);
    this.readoutBox.setAttribute("x", x); this.readoutBox.setAttribute("y", y - 13); this.readoutBox.setAttribute("width", w); this.readoutBox.setAttribute("height", 18);
    this.readoutText.setAttribute("x", x + 5); this.readoutText.setAttribute("y", y); this.readout.removeAttribute("display");
  }

  #hideReadout() { this.readout?.setAttribute("display", "none"); }

  changeZoom(requested) { if (requested < .43 && !this.exitTriggered) { this.exitTriggered = true; this.onExitRequested(); return; } this.state.zoom = clamp(requested, .46, this.maxZoom ?? 4.5); this.render(); }
  #queuePixels() { if (this.pixelFrame == null) this.pixelFrame = (globalThis.requestAnimationFrame ?? ((run) => setTimeout(run, 16)))(() => this.#paintPixels()); }

  /** Paint Eym's globe as pixel art for the view as it now stands (only when something has changed). */
  #paintPixels() {
    this.pixelFrame = null; const p = this.pixel; if (!p || this.state.zoom > PIXEL_GLOBE_MAX_ZOOM) return;
    const { yaw, pitch, zoom } = this.state, s = this.environment?.subsolar, clouds = !this.weatherGroups?.clouds?.classList.contains("is-hidden");
    // The drawing covers all of the view that shows, which on a tall or wide window is more than the 900×680 frame.
    const box = this.svg.getBoundingClientRect?.(), fit = box?.width && box?.height ? Math.min(box.width / 900, box.height / 680) : 0; if (!fit) return;
    // While the globe is being turned or zoomed it is drawn at half the sharpness (a quarter of the work),
    // and drawn sharp once it has rested a moment.
    const view = [yaw.toFixed(4), pitch.toFixed(4), zoom.toFixed(3)].join("|"), moving = p.view != null && view !== p.view; p.view = view;
    clearTimeout(p.sharpTimer); if (moving) p.sharpTimer = setTimeout(() => this.#queuePixels(), 170);
    const unit = moving ? 5 : 2.5, W = Math.min(520, Math.ceil(box.width / fit / unit)), H = Math.min(640, Math.ceil(box.height / fit / unit));
    const key = [view, s ? `${s.latDeg.toFixed(1)},${s.lonDeg.toFixed(1)}` : "", clouds, p.stamp ?? 0, W, H, unit].join("|");
    if (key === p.key) return; p.key = key;
    p.raster ??= buildSurfaceRaster(this.geography);
    // Close in, the land is taken from a patch made at the view's own sharpness. A patch is kept and used again
    // while the view stays inside it; in motion a rather coarser one will do, so it is seldom made mid-turn.
    const win = patchWindow({ lat: pitch * 180 / Math.PI, lon: -yaw * 180 / Math.PI, radius: 100 * zoom, width: Math.ceil(box.width / fit / 2.5), height: Math.ceil(box.height / fit / 2.5) });
    if (!win) p.patch = null; else if (!patchServes(p.patch, win, moving ? 2.4 : 1.25)) p.patch = buildSurfacePatch(p.raster, win);
    const sun = s ? orthographicGeoPoint(s.latDeg, s.lonDeg, yaw, pitch, 1) : null;
    const data = renderGlobe({ raster: p.raster, width: W, height: H, cx: W / 2, cy: H / 2, radius: 250 * zoom / unit, yaw, pitch, sun, snow: p.snow, ice: p.ice, weather: clouds ? p.weather : null, rivers: p.rivers, patch: p.patch, veil: zoom > CLOUD_VEIL_ZOOM });
    if (p.canvas.width !== W || p.canvas.height !== H) { p.canvas.width = W; p.canvas.height = H; }
    const shown = [W * unit * fit, H * unit * fit];
    Object.assign(p.canvas.style, { width: `${shown[0]}px`, height: `${shown[1]}px`, left: `${this.svg.offsetLeft + (box.width - shown[0]) / 2}px`, top: `${this.svg.offsetTop + (box.height - shown[1]) / 2}px` });
    p.canvas.getContext("2d").putImageData(new ImageData(data, W, H), 0, 0);
  }

  /**
   * Where two names would overlap, the less important gives way: continents and oceans, then capitals, then what can
   * be seen from space, the realms, cities and the larger natural features, and last the towns. Sizes are the names'
   * screen sizes in view units, so the test matches what is drawn on any screen.
   */
  #hideOverlappingLabels() {
    const rank = (cls) => cls === "capital" ? 1 : [0, 2, 3, 4, 5][labelTier(cls)], placed = [];
    const shown = this.featureNodes.filter((item) => item.label && !item.node.hidden).map((item) => {
      const m = /translate\(([-\d.]+) ([-\d.]+)\)/.exec(item.node.getAttribute("transform") ?? ""), cls = item.feature.featureClass, px = labelScreenPx(cls) * (this.unitPerPx ?? 1);
      const w = (item.node.textContent?.length ?? 4) * px * 0.56 + 4, h = px * 1.25;
      return { item, r: rank(cls), area: item.feature.scale ?? 0, x: m ? Number(m[1]) : 0, y: m ? Number(m[2]) : 0, w, h };
    }).sort((a, b) => a.r - b.r || b.area - a.area);
    for (const l of shown) {
      const box = { x0: l.x - l.w / 2, x1: l.x + l.w / 2, y0: l.y - l.h, y1: l.y + l.h * 0.3 };
      if (placed.some((o) => box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0)) { l.item.node.hidden = true; l.item.node.style.opacity = "0"; continue; }
      placed.push(box);
    }
  }

  render() {
    // With the pixel globe, many changes in one frame (a finger moving) are drawn once, at the next frame.
    if (this.pixel && !this.renderingNow) {
      if (this.renderFrame == null) this.renderFrame = (globalThis.requestAnimationFrame ?? ((run) => setTimeout(run, 16)))(() => { this.renderFrame = null; if (!this.pixel) return; this.renderingNow = true; try { this.render(); } finally { this.renderingNow = false; } });
      return;
    }
    const radius = 250 * this.state.zoom; this.discClip?.setAttribute("r", radius);
    // Names keep one size on the screen whatever the view's size: the CSS scales them by the view units in a screen pixel.
    const shownBox = this.svg.getBoundingClientRect?.(), fitScale = shownBox?.width ? Math.min(shownBox.width / 900, shownBox.height / 680) : 1, unitPerPx = fitScale > 0 ? 1 / fitScale : 1;
    if (unitPerPx !== this.unitPerPx) { this.unitPerPx = unitPerPx; this.svg.style?.setProperty?.("--body-px", unitPerPx.toFixed(4)); }
    const pixels = Boolean(this.pixel) && this.state.zoom <= PIXEL_GLOBE_MAX_ZOOM, windHidden = this.weatherGroups?.wind?.classList.contains("is-hidden");
    if (this.pixel) { this.svg.classList.toggle("is-pixel-globe", pixels); this.pixel.canvas.classList.toggle("is-on", pixels); if (pixels) this.#queuePixels(); }
    if (this.fadeNightWithZoom) this.night.style.opacity = String(clamp(1.8 - this.state.zoom * 0.8, 0, 1));
    this.weatherBlur?.setAttribute("stdDeviation", (radius * 0.022).toFixed(1));
    if (!pixels && this.environment?.subsolar && this.nightBands) {
      const sun = orthographicGeoPoint(this.environment.subsolar.latDeg, this.environment.subsolar.lonDeg, this.state.yaw, this.state.pitch, 1);
      for (const band of this.nightBands) band.node.setAttribute("d", nightOutlinePath({ x: sun.x, y: sun.y, z: sun.z }, radius, [450, 340], band.belowDeg));
    } for (const node of [this.disc, this.atmosphere]) node.setAttribute("r", radius + (node === this.atmosphere ? 6 : 0));
    if (this.structure) this.structure.setAttribute("transform", `translate(450 340) scale(${this.state.zoom}) rotate(${this.state.yaw * 28}) skewX(${this.state.pitch * 7})`);
    for (const item of this.featureNodes) {
      // What the pixel globe stands in for (the vector ground, water and cloud) is hidden, so it is not worked out.
      if (pixels && ((item.pixelHidden ??= Boolean(item.node.closest?.(".oscm-body-layer.is-terrain, .oscm-body-layer.is-hydrology, .oscm-weather-field, clipPath"))) || (windHidden && item.node.parentNode === this.weatherGroups.wind))) continue;
      const lodVisible = this.state.zoom >= (item.minZoom ?? .46) && this.state.zoom <= (item.maxZoom ?? Infinity);
      if (item.cartographicPath) {
        const paths = item.rings.map((ring) => projectGeoPath(ring, this.state.yaw, this.state.pitch, radius, [450, 340], item.closed, item.limbClose)).filter(Boolean);
        item.node.setAttribute("d", paths.join(" ")); item.node.hidden = !lodVisible || !paths.length; item.node.style.opacity = item.node.hidden ? "0" : "1"; continue;
      }
      const point = item.schematic ? { x: item.x * this.state.zoom, y: item.y * this.state.zoom, visible: true, z: 1 } : orthographicProject(item.lat, item.lon, this.state.yaw, this.state.pitch, radius);
      item.node.setAttribute("transform", `translate(${450 + point.x} ${340 + point.y})`); item.node.hidden = !lodVisible || !point.visible;
      if (item.radiusDeg) item.node.setAttribute("r", Math.max(0.8, radius * item.radiusDeg * Math.PI / 180).toFixed(1));
      if (item.steadyOpacity) item.node.style.opacity = "1"; item.node.style.opacity = item.node.hidden ? "0" : String(clamp(.35 + point.z * .65, .35, 1));
      if (item.lat2 != null) { const end = orthographicProject(item.lat2, item.lon2, this.state.yaw, this.state.pitch, radius); item.node.removeAttribute("transform"); item.node.setAttribute("x1", 450 + point.x); item.node.setAttribute("y1", 340 + point.y); item.node.setAttribute("x2", 450 + end.x); item.node.setAttribute("y2", 340 + end.y); item.node.hidden = !point.visible || !end.visible; }
    }
    this.#hideOverlappingLabels();
  }
}
