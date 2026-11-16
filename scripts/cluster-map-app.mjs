// Single-system edition: the app opens on HOME_SYSTEM and never leaves it. The cluster view and
// the other nine systems' data have been removed from this module.
//
// ASTRAL TRAVEL (dormant): routes, voyages, the ship marker and the relativistic travel solver
// are commented out below, not deleted, so they can be revived later (e.g. for astral barges).
// To revive, restore these imports and uncomment every block marked "ASTRAL TRAVEL (dormant)".
// Branches for voyage.context === "cluster" (and the SYSTEMS / formatLightYears references) belong
// to the removed cluster view and should be dropped when reviving; in-system routes are self-contained.
// import { calculateTransit, formatDuration, formatVelocity, SECONDS_PER_JULIAN_YEAR, trajectoryMarkers } from "./relativity.mjs";
// import { abortVoyage, advanceVoyageToRouteFraction, engageVoyage, evaluateVoyage } from "./campaign-time.mjs";
// import { AU_KM, LIGHT_YEAR_KM, formatSystemDistance, physicalDistanceAu, physicalDistanceLy } from "./system-data.mjs";
import { buildSystemModel, loadSystemRegistry } from "./system-data.mjs";
import { SystemView } from "./system-view.mjs";
import { BodyView } from "./body-view.mjs";
import { naturalBodyKind, buildNaturalBodyModel } from "./natural-body-data.mjs";
import { artificialBodyKind, buildArtificialBodyModel } from "./artificial-body-data.mjs";
import { inspectSurfaceFeature } from "./body-layers.mjs";
import { loadBodyOperationAsset } from "./body-operations.mjs";
import { AstronomySnapshotCache, loadAstronomyOrientations } from "./astronomy.mjs";
import { CAMPAIGN_START_MS, DAY_MS, formatUniversalClock, formatUniversalDate } from "./universal-time.mjs";
import { coverRings, environmentField, placeReport, seasonalCover, subsolarPoint } from "./eym-seasons.mjs";
import { buildWeatherState, globeWeather, placeWeatherNow, STEP_HOURS, weatherReport } from "./eym-weather.mjs";
import { ATLAS_IMAGE_PRESETS, ATLAS_LEVELS, atlasMapSpec } from "./eym-map-presets.mjs";
import { savedMapDefaults } from "./eym-map-settings.mjs";
import { buildReferenceMap } from "./eym-reference-map.mjs";
import { mapPacket } from "./eym-map-packet.mjs";
import { loadStarfield } from "./starfield.mjs";
import { displayNameFor, objectDisplayName, parentDisplayName, systemDisplayName } from "./display-names.mjs";
import { groundSky, localSolarHours } from "./ground-sky.mjs";
import { SkyView } from "./sky-view.mjs";
import { mansionForDirection, sunPathLongitudeDeg } from "./lunar-mansions.mjs";
import { phaseName } from "./moon-events.mjs";
import { buildLocalTile, localDetailLayout, localDetailOverlaySvg, tileRgba } from "./eym-local-detail.mjs";

export const MODULE_ID = "eym-planet-map";
/** The only system this module exposes. Its name must match the `system` column of the registry CSV. */
export const HOME_SYSTEM = Object.freeze({ id: "abydos", name: "Abydos" });
const assetSlug = (value) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ClusterMapApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  mode = "system";
  activeSystem = HOME_SYSTEM;
  activeBody = null;
  _registryPromise = null;
  _astronomyOrientationsPromise = null;
  _starfieldPromise = null;
  _skyDocumentPromise = null;
  /** Where the ground view looks up from: { latDeg, lonDeg }. */
  lookUp = null;
  _astronomyCache = new AstronomySnapshotCache();
  _systemSnapshotReferenceMs = null;
  // ASTRAL TRAVEL (dormant): _astronomyArrivalVoyageId = null;
  selectedRoute = null;
  static DEFAULT_OPTIONS = {
    id: MODULE_ID,
    classes: [MODULE_ID, "standard-form"],
    position: { width: 1120, height: 760 },
    window: {
      title: systemDisplayName(HOME_SYSTEM.name),
      icon: "fa-solid fa-star",
      resizable: true,
      minimizable: true,
    },
  };

  static PARTS = {
    content: {
      template: `modules/${MODULE_ID}/templates/cluster-map.hbs`,
    },
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    return {
      ...context,
      // ASTRAL TRAVEL (dormant): accelerationG, cruiseBeta and gridSpacing fed the navigation profile card.
      isGM: game.user.isGM,
      systemTitle: systemDisplayName(HOME_SYSTEM.name),
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const root = this.element.querySelector(".oscm-shell");
    const svg = root?.querySelector(".oscm-cluster-svg");
    if (!root || !svg) return;

    this._clusterView?.destroy();
    this._resizeObserver?.disconnect();

    this._clusterView = null;

    root.querySelector('[data-action="reset-view"]')?.addEventListener("click", () => this._clusterView?.resetView?.());
    root.querySelector('[data-action="clear-route"]')?.addEventListener("click", () => this._clusterView?.clearSelection?.());
    // ASTRAL TRAVEL (dormant):
    // root.querySelector('[data-action="apply-profile"]')?.addEventListener("click", () => this.#applyProfile(root));
    // root.querySelector('[data-action="engage-route"]')?.addEventListener("click", () => this.#engageSelectedRoute());
    // root.querySelector('[data-action="abort-voyage"]')?.addEventListener("click", () => this.#abortActiveVoyage());
    root.querySelector('[data-action="back-to-system"]')?.addEventListener("click", () => this.#showSystem());
    root.querySelector('[data-action="look-up"]')?.addEventListener("click", () => {
      const lat = Number(root.querySelector('[name="lookUpLat"]')?.value), lon = Number(root.querySelector('[name="lookUpLon"]')?.value);
      if (!(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180)) return ui.notifications.warn("Latitude must be −90 to 90 and longitude −180 to 180.");
      this.#enterSky(lat, lon);
    });
    root.querySelector('[data-action="back-to-body"]')?.addEventListener("click", () => { if (this.activeBody) this.#enterBody(this.activeBody); });
    for (const control of root.querySelectorAll("[data-sky-layer]")) control.addEventListener("change", () => this._clusterView?.setLayerVisibility?.(control.dataset.skyLayer, control.checked));
    for (const name of ["lookUpLat", "lookUpLon"]) root.querySelector(`[name="${name}"]`)?.addEventListener("input", () => this.#updatePlaceReadout());
    this.#setUpAtlasControls(root);
    for (const control of root.querySelectorAll("[data-body-layer]")) control.addEventListener("change", () => this._clusterView?.setLayerVisibility?.(control.dataset.bodyLayer, control.checked));

    this._resizeObserver = new ResizeObserver(() => this._clusterView?.render());
    this._resizeObserver.observe(root);

    this.#updateRoutePanel(null, null);
    // The system is the outermost level, so there is always a system or a body to show.
    this.activeSystem ??= HOME_SYSTEM;
    if (this.mode === "sky" && this.activeBody && this.lookUp) this.#enterSky(this.lookUp.latDeg, this.lookUp.lonDeg);
    else if (this.mode === "body" && this.activeBody) this.#enterBody(this.activeBody);
    else this.#enterSystem(this.activeSystem);
    window.removeEventListener("oscm-campaign-time-changed", this._campaignTimeListener);
    // ASTRAL TRAVEL (dormant): window.clearInterval(this._voyageTicker);
    this._campaignTimeListener = () => {
      // ASTRAL TRAVEL (dormant): this.#refreshActiveVoyage();
      void this.#refreshVisibleAstronomy().catch((error) => console.warn(`${MODULE_ID} | Unable to refresh visible astronomy`, error));
      void this.#refreshSky().catch((error) => console.warn(`${MODULE_ID} | Unable to refresh the sky`, error));
      void this.#refreshBodyEnvironment().catch((error) => console.warn(`${MODULE_ID} | Unable to refresh day and night`, error));
      // ASTRAL TRAVEL (dormant): void this.#snapshotVoyageArrival().catch((error) => console.warn(`${MODULE_ID} | Unable to snapshot voyage arrival system`, error));
    };
    window.addEventListener("oscm-campaign-time-changed", this._campaignTimeListener);
    // ASTRAL TRAVEL (dormant):
    // this._voyageTicker = window.setInterval(() => this.#refreshActiveVoyage(), 1000);
    // this.#refreshActiveVoyage();
  }

  _onClose(options) {
    this._resizeObserver?.disconnect();
    this._resizeObserver = null;
    this._clusterView?.destroy();
    this._clusterView = null;
    window.removeEventListener("oscm-campaign-time-changed", this._campaignTimeListener);
    window.clearInterval(this._skyTicker);
    window.clearInterval(this._bodyTicker);
    // ASTRAL TRAVEL (dormant): window.clearInterval(this._voyageTicker);
    return super._onClose(options);
  }

  async #astronomicalModel(systemName, referenceTimestampMs) {
    this._registryPromise ??= loadSystemRegistry(MODULE_ID);
    this._astronomyOrientationsPromise ??= loadAstronomyOrientations(MODULE_ID);
    const [rows, orientationDocument] = await Promise.all([this._registryPromise, this._astronomyOrientationsPromise]);
    return this._astronomyCache.getOrCreate(systemName, referenceTimestampMs, () => buildSystemModel(rows, systemName, {
      referenceTimestampMs,
      orientations: orientationDocument.orientations,
    }));
  }

  async #refreshVisibleAstronomy() {
    if (this.mode !== "system" || !this.activeSystem) return; // ASTRAL TRAVEL (dormant): || this._clusterView?.isDraggingShip
    const referenceTimestampMs = game.modules.get(MODULE_ID)?.api?.getCampaignTimeState?.()?.referenceBaseMs;
    if (!Number.isFinite(referenceTimestampMs)) return;
    if (Number.isFinite(this._systemSnapshotReferenceMs) && Math.abs(referenceTimestampMs - this._systemSnapshotReferenceMs) < 3_600_000) return;
    await this.#enterSystem(this.activeSystem, referenceTimestampMs);
  }

  /* ASTRAL TRAVEL (dormant): voyage-arrival astronomy snapshot.
  async #snapshotVoyageArrival() {
    const state = game.modules.get(MODULE_ID)?.api?.getCampaignTimeState?.();
    const voyage = state?.activeVoyage;
    if (!voyage || voyage.context !== "cluster" || this._astronomyArrivalVoyageId === voyage.id) return;
    const evaluated = evaluateVoyage(voyage, state.properBaseMs);
    if (evaluated.phase !== "arrived") return;
    const arrivalReferenceMs = voyage.departureReferenceMs + voyage.referenceYears * SECONDS_PER_JULIAN_YEAR * 1000;
    await this.#astronomicalModel(voyage.destinationName, arrivalReferenceMs);
    this._astronomyArrivalVoyageId = voyage.id;
  }
  */

  async #enterSystem(system, requestedReferenceTimestampMs = null) {
    const root = this.element?.querySelector?.(".oscm-shell");
    const svg = root?.querySelector(".oscm-cluster-svg");
    if (!root || !svg) return;
    try {
      const api = game.modules.get(MODULE_ID)?.api;
      const referenceTimestampMs = Number.isFinite(requestedReferenceTimestampMs)
        ? requestedReferenceTimestampMs
        : api?.getCampaignTimeState?.()?.referenceBaseMs ?? CAMPAIGN_START_MS;
      const model = await this.#astronomicalModel(system.name, referenceTimestampMs);
      // The night sky is decoration: if it cannot load, the system map still opens without it.
      this._starfieldPromise ??= loadStarfield(MODULE_ID).catch((error) => { console.warn(`${MODULE_ID} | Starfield unavailable`, error); return null; });
      const starfield = await this._starfieldPromise;
      this._clusterView?.destroy();
      this._clusterView = new SystemView(svg, {
        model,
        starfield,
        onSelectionChange: (origin, destination) => this.#updateRoutePanel(origin, destination),
        // The system is the outermost level: zooming out stops at the minimum zoom instead of leaving.
        onExitRequested: () => {},
        onObjectActivate: (object) => this.#enterBody(object),
        // ASTRAL TRAVEL (dormant): onShipDrag: (fraction) => this.#scrubVoyageToFraction(fraction),
      });
      this.#leaveSky(root);
      this.mode = "system";
      this.activeSystem = system;
      this.activeBody = null;
      this._systemSnapshotReferenceMs = referenceTimestampMs;
      root.classList.add("is-system-mode");
      root.classList.remove("is-body-mode");
      root.classList.remove("has-geography");
      root.classList.remove("has-operations");
      root.querySelector('[data-action="back-to-system"]')?.classList.add("is-hidden");
      const title = root.querySelector("[data-map-title]"); if (title) title.textContent = systemDisplayName(system.name);
      const count = root.querySelector("[data-map-count]"); if (count) count.textContent = `${model.objects.length} mapped objects`;
      const help = root.querySelector("[data-map-help]"); if (help) help.textContent = "Click / tap to select; double-click / double-tap to open";
      this.#updateRoutePanel(null, null);
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to enter system view`, error);
      ui.notifications.error(`Unable to load ${systemDisplayName(system.name)} system data.`);
    }
  }

  #showSystem() { if (this.activeSystem) this.#enterSystem(this.activeSystem); }

  #leaveSky(root) {
    window.clearInterval(this._skyTicker);
    this._skyTicker = null;
    root.classList.remove("is-sky-mode");
    root.querySelector('[data-action="back-to-body"]')?.classList.add("is-hidden");
  }

  /** A fresh ground-sky snapshot for the current look-up place at the campaign clock's moment. */
  async #skySnapshot() {
    const api = game.modules.get(MODULE_ID)?.api;
    const t = api?.getCampaignTimeState?.()?.referenceBaseMs ?? CAMPAIGN_START_MS;
    this._registryPromise ??= loadSystemRegistry(MODULE_ID);
    this._astronomyOrientationsPromise ??= loadAstronomyOrientations(MODULE_ID);
    this._skyDocumentPromise ??= fetch(`modules/${MODULE_ID}/data/stellar/constellations.json`).then((r) => { if (!r.ok) throw new Error(`Sky data fetch failed (${r.status})`); return r.json(); });
    this._starfieldPromise ??= loadStarfield(MODULE_ID).catch((error) => { console.warn(`${MODULE_ID} | Starfield unavailable`, error); return null; });
    const [rows, orientationDocument, sky, starfield] = await Promise.all([this._registryPromise, this._astronomyOrientationsPromise, this._skyDocumentPromise, this._starfieldPromise]);
    if (!starfield) throw new Error("The star catalogue is unavailable.");
    const model = buildSystemModel(rows, HOME_SYSTEM.name, { referenceTimestampMs: t, orientations: orientationDocument.orientations });
    this._sun = { t, subsolar: subsolarPoint(model, sky) };
    return { snapshot: groundSky({ model, sky, starfield, latDeg: this.lookUp.latDeg, lonDeg: this.lookUp.lonDeg }), sky, starfield };
  }

  async #enterSky(latDeg, lonDeg) {
    const root = this.element?.querySelector?.(".oscm-shell"), svg = root?.querySelector(".oscm-cluster-svg");
    if (!root || !svg) return;
    try {
      this.lookUp = { latDeg, lonDeg };
      const { snapshot, sky, starfield } = await this.#skySnapshot();
      const layers = Object.fromEntries([...root.querySelectorAll("[data-sky-layer]")].map((c) => [c.dataset.skyLayer, c.checked]));
      this._clusterView?.destroy();
      this._clusterView = new SkyView(svg, { snapshot, sky, starfield, displayName: (name) => displayNameFor(HOME_SYSTEM.name, name), layers });
      this.mode = "sky";
      root.classList.add("is-sky-mode");
      root.classList.remove("is-system-mode", "is-body-mode", "has-geography", "has-operations", "can-look-up");
      root.querySelector('[data-action="back-to-system"]')?.classList.remove("is-hidden");
      root.querySelector('[data-action="back-to-body"]')?.classList.remove("is-hidden");
      const title = root.querySelector("[data-map-title]"); if (title) title.textContent = `The sky over ${displayNameFor(HOME_SYSTEM.name, "Eventide")}`;
      const help = root.querySelector("[data-map-help]"); if (help) help.textContent = "Drag to turn · wheel to zoom · double-click to reset";
      this.#updateSkyReadout(snapshot, sky);
      window.clearInterval(this._skyTicker);
      // The sky turns slowly; with the clock running, refresh it every few seconds.
      this._skyTicker = window.setInterval(() => void this.#refreshSky().catch(() => {}), 5000);
    } catch (error) {
      console.error(`${MODULE_ID} | Unable to show the sky`, error);
      ui.notifications.error("Unable to show the sky from here.");
    }
  }

  /** Where Mitkear is overhead on Eym at the campaign clock's moment. */
  async #sunNow() {
    const t = game.modules.get(MODULE_ID)?.api?.getCampaignTimeState?.()?.referenceBaseMs ?? CAMPAIGN_START_MS;
    this._registryPromise ??= loadSystemRegistry(MODULE_ID);
    this._astronomyOrientationsPromise ??= loadAstronomyOrientations(MODULE_ID);
    this._skyDocumentPromise ??= fetch(`modules/${MODULE_ID}/data/stellar/constellations.json`).then((r) => { if (!r.ok) throw new Error(`Sky data fetch failed (${r.status})`); return r.json(); });
    const [rows, orientationDocument, sky] = await Promise.all([this._registryPromise, this._astronomyOrientationsPromise, this._skyDocumentPromise]);
    const model = buildSystemModel(rows, HOME_SYSTEM.name, { referenceTimestampMs: t, orientations: orientationDocument.orientations });
    return { t, subsolar: subsolarPoint(model, sky) };
  }

  /** Real day and night on Eym's globe, and the season's snow and sea ice (recomputed once a day). */
  async #refreshBodyEnvironment() {
    if (this.mode !== "body" || this.activeBody?.name !== "Eventide" || !this._eymField || !this._clusterView?.setEnvironment) return;
    const { t, subsolar } = await this.#sunNow();
    if (this.mode !== "body" || !this._clusterView?.setEnvironment) return;
    const day = Math.floor(t / DAY_MS);
    if (this._coverDay !== day) { this._cover = seasonalCover(this._eymField, t); this._coverDay = day; }
    this._sun = { t, subsolar };
    if (this.#ensureWeather()) {
      this._globeWeather = globeWeather(this._weather);
      this._weatherSnow = coverRings(this._eymField, this._globeWeather.snow);
      this._clusterView.setWeather?.(this._globeWeather);
    }
    // Snow on the ground comes from the weather (the last week's snowfall and thaw); sea ice from the season.
    this._clusterView.setEnvironment({ subsolar, snow: this._weatherSnow ?? this._cover.snow, ice: this._cover.ice });
    this.#updatePlaceReadout();
  }

  /** Rebuild the weather state when the clock enters a new 3-hour step; true if it changed. */
  #ensureWeather() {
    if (!this._eymField || !this._sun) return false;
    const step = Math.round(this._sun.t / (DAY_MS / 24) / STEP_HOURS);
    if (this._weatherStep === step && this._weather) return false;
    this._weather = buildWeatherState({ timeMs: this._sun.t, subsolar: this._sun.subsolar, field: this._eymField });
    this._weatherStep = step;
    return true;
  }

  /** The weather at a place now, in words (null before the weather is ready). */
  #weatherHere(latDeg, lonDeg) {
    if (!this._weather || !this._sun) return null;
    const now = placeWeatherNow(this._weather, latDeg, lonDeg, { subsolar: this._sun.subsolar, timeMs: this._sun.t });
    return weatherReport(this._weather, latDeg, lonDeg, now);
  }

  // ---------------------------------------------------------------- atlas maps

  /** Fill the atlas card's choices from the presets and the saved defaults, and keep its summary current. */
  #setUpAtlasControls(root) {
    const level = root.querySelector('[name="atlasLevel"]'), continent = root.querySelector('[name="atlasContinent"]'), image = root.querySelector('[name="atlasImage"]');
    if (!level || !continent || !image) return;
    const option = (value, label) => Object.assign(document.createElement("option"), { value, textContent: label });
    level.replaceChildren(...ATLAS_LEVELS.map((l) => option(l.id, l.label))); level.value = "continent";
    continent.replaceChildren(...[["caren", "Caren"], ["garyk", "Garyk"], ["eastern", "The Eastern Continent"], ["northern", "The Northern Continent"], ["southern", "The Southern Continent"]].map(([id, label]) => option(id, label)));
    image.replaceChildren(...ATLAS_IMAGE_PRESETS.map((p) => option(p.id, p.label)), option("custom", "Custom size"));
    const defaults = savedMapDefaults(MODULE_ID).atlas;
    image.value = defaults.image;
    root.querySelector('[name="atlasWidth"]').value = defaults.width ?? 1536;
    root.querySelector('[name="atlasHeight"]').value = defaults.height ?? 1024;
    const sync = (changed) => {
      const chosen = ATLAS_LEVELS.find((l) => l.id === level.value);
      if (changed === level) { root.querySelector('[name="atlasMiles"]').value = chosen?.acrossMiles ?? ""; if (level.value === "planet") image.value = "planet-2to1"; }
      root.querySelector(".oscm-atlas-continent")?.classList.toggle("is-hidden", level.value !== "continent");
      root.querySelector(".oscm-atlas-miles")?.classList.toggle("is-hidden", !["region", "local"].includes(level.value));
      root.querySelector(".oscm-atlas-custom")?.classList.toggle("is-hidden", image.value !== "custom");
      const summary = root.querySelector("[data-atlas-summary]"); if (summary) summary.textContent = this.#atlasSpec(root).summary;
    };
    for (const control of root.querySelectorAll("[data-atlas-control]")) control.addEventListener("change", () => sync(control));
    sync(level);
    root.querySelector('[data-action="atlas-build"]')?.addEventListener("click", () => void this.#buildAtlasMap().catch((error) => { console.error(`${MODULE_ID} | Unable to make the reference map`, error); ui.notifications.error(`Unable to make the reference map: ${error.message}`); }));
    root.querySelector('[data-action="atlas-close"]')?.addEventListener("click", () => root.querySelector("[data-atlas-result]")?.classList.add("is-hidden"));
    for (const tab of root.querySelectorAll("[data-atlas-view]")) tab.addEventListener("click", () => this.#showAtlasView(tab.dataset.atlasView));
    const download = (blobKey, suffix) => () => { const result = this._atlasResult; if (result?.[blobKey]) saveBlob(result[blobKey], `${result.fileStem}${suffix}`); };
    root.querySelector('[data-action="atlas-download-base"]')?.addEventListener("click", download("basePng", "-reference.png"));
    root.querySelector('[data-action="atlas-download-labelled"]')?.addEventListener("click", download("labelledPng", "-with-names.png"));
    root.querySelector('[data-action="atlas-download-labels"]')?.addEventListener("click", download("labelSvgBlob", "-names.svg"));
    root.querySelector('[data-action="atlas-download-packet"]')?.addEventListener("click", download("packetBlob", "-packet.md"));
    root.querySelector('[data-action="atlas-download-detail"]')?.addEventListener("click", download("detailPng", "-ground.png"));
    root.querySelector('[data-action="atlas-copy-prompt"]')?.addEventListener("click", async () => { try { await navigator.clipboard.writeText(this._atlasResult?.prompt ?? ""); ui.notifications.info("Prompt copied."); } catch { ui.notifications.warn("Could not copy; download the packet instead."); } });
  }

  #atlasSpec(root) {
    const value = (name) => root.querySelector(`[name="${name}"]`)?.value;
    const level = value("atlasLevel") ?? "continent", image = value("atlasImage") ?? "model-landscape";
    return atlasMapSpec({ level, image, ...(image === "custom" ? { width: Number(value("atlasWidth")), height: Number(value("atlasHeight")) } : {}), ...(["region", "local"].includes(level) ? { acrossMiles: Number(value("atlasMiles")) } : {}) });
  }

  /** Build the reference map, its name layer and packet, and show them. */
  async #buildAtlasMap() {
    const root = this.element?.querySelector?.(".oscm-shell"); if (!root || !this._eymGeography) return;
    const spec = this.#atlasSpec(root), continentId = root.querySelector('[name="atlasContinent"]')?.value;
    const lat = Number(root.querySelector('[name="lookUpLat"]')?.value), lon = Number(root.querySelector('[name="lookUpLon"]')?.value);
    const nearest = this._eymGeography.settlements.filter((s) => s.properName).reduce((best, s) => { const d = Math.hypot(s.lat - lat, (s.lon - lon) * Math.cos(lat * Math.PI / 180)); return d < best.d ? { s, d } : best; }, { s: null, d: Infinity });
    const continentName = root.querySelector('[name="atlasContinent"]')?.selectedOptions?.[0]?.textContent ?? "";
    const title = spec.level === "planet" ? "Eym" : spec.level === "continent" ? continentName : nearest.s && nearest.d < 1.5 ? (spec.level === "local" ? nearest.s.properName : `The country around ${nearest.s.properName}`) : `${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`;
    const map = buildReferenceMap(this._eymGeography, spec, { center: [lat, lon], continentId, title });
    const packet = mapPacket({ asset: this._eymGeography, spec, frame: map.frame, features: map.features, title });
    const [basePng, labelledPng] = await Promise.all([svgToPng(map.baseSvg, spec.widthPx, spec.heightPx), svgToPng(map.labelledSvg, spec.widthPx, spec.heightPx)]);
    // The local level also gets the ground in detail: fields, woods, streams, lanes and farmsteads.
    let detailPng = null;
    if (spec.level === "local") {
      ui.notifications.info("Working out the ground in detail…");
      await new Promise((resolve) => setTimeout(resolve, 30));
      const layout = localDetailLayout(map.frame), tile = buildLocalTile(this._eymGeography, { center: layout.center, sizeKm: layout.sizeKm, resolutionM: layout.resolutionM, marginFraction: 0.15 });
      detailPng = await detailToPng(tile, layout, spec.widthPx, spec.heightPx, [localDetailOverlaySvg(tile, layout, spec.widthPx, spec.heightPx), map.labelSvg]);
    }
    for (const url of this._atlasResult?.urls ?? []) URL.revokeObjectURL(url);
    const urls = { base: URL.createObjectURL(basePng), labelled: URL.createObjectURL(labelledPng), ...(detailPng ? { detail: URL.createObjectURL(detailPng) } : {}) };
    const fileStem = `eym-${spec.level}-${title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    this._atlasResult = { basePng, labelledPng, detailPng, labelSvgBlob: new Blob([map.labelSvg], { type: "image/svg+xml" }), packetBlob: new Blob([packet.markdown], { type: "text/markdown" }), prompt: packet.prompt, urls: Object.values(urls), previews: urls, fileStem };
    root.querySelector("[data-atlas-title]").textContent = title;
    root.querySelector("[data-atlas-result-summary]").textContent = `${spec.summary} · ${map.features.length} named features`;
    root.querySelector('[data-atlas-view="detail"]')?.classList.toggle("is-hidden", !detailPng);
    root.querySelector('[data-action="atlas-download-detail"]')?.classList.toggle("is-hidden", !detailPng);
    root.querySelector("[data-atlas-result]")?.classList.remove("is-hidden");
    this.#showAtlasView(detailPng ? "detail" : "labelled");
  }

  #showAtlasView(view) {
    const root = this.element?.querySelector?.(".oscm-shell"), preview = root?.querySelector("[data-atlas-preview]"); if (!preview || !this._atlasResult) return;
    preview.src = this._atlasResult.previews[view] ?? this._atlasResult.previews.labelled;
    for (const tab of root.querySelectorAll("[data-atlas-view]")) tab.classList.toggle("is-active", tab.dataset.atlasView === view);
  }

  /** The "Here and now" card: date, season, sun and temperature at the chosen place. */
  #updatePlaceReadout() {
    const root = this.element?.querySelector?.(".oscm-shell"); if (!root || !this._eymField || !this._sun) return;
    const latDeg = Number(root.querySelector('[name="lookUpLat"]')?.value), lonDeg = Number(root.querySelector('[name="lookUpLon"]')?.value);
    if (!(latDeg >= -90 && latDeg <= 90) || !(lonDeg >= -180 && lonDeg <= 180)) return;
    const report = placeReport({ field: this._eymField, subsolar: this._sun.subsolar, latDeg, lonDeg, timeMs: this._sun.t });
    const weather = this.#weatherHere(latDeg, lonDeg);
    const values = { ...report, date: `${formatUniversalDate(this._sun.t)}, ${formatUniversalClock(this._sun.t).slice(0, 5)}` };
    if (weather) {
      const { values: ignored, ...words } = weather; void ignored;
      Object.assign(values, words, { temperature: `${weather.weatherTemperature} (seasonal high ${Math.round(report.values.temperature.highC)}, low ${Math.round(report.values.temperature.lowC)})`, ground: weather.groundNow });
    }
    for (const [field, value] of Object.entries(values)) { const element = root.querySelector(`[data-place-field="${field}"]`); if (element && typeof value === "string") element.textContent = value; }
  }

  async #refreshSky() {
    if (this.mode !== "sky" || !this.lookUp || !this._clusterView?.update) return;
    const { snapshot, sky } = await this.#skySnapshot();
    if (this.mode !== "sky") return;
    this._clusterView.update(snapshot);
    this.#updateSkyReadout(snapshot, sky);
  }

  #updateSkyReadout(snapshot, sky) {
    const root = this.element?.querySelector?.(".oscm-shell"); if (!root) return;
    const { latDeg, lonDeg } = snapshot;
    const hours = localSolarHours(snapshot), hh = Math.floor(hours), mm = Math.floor((hours - hh) * 60);
    const sunLongitude = sunPathLongitudeDeg(snapshot.sun.dir, sky);
    const moonText = (moon) => {
      const phase = phaseName(sunPathLongitudeDeg(moon.dir, sky) - sunLongitude);
      const where = moon.visible ? `up, ${Math.round(moon.altDeg)}°` : moon.altDeg > 0 ? "lost in daylight" : "below the horizon";
      const eclipse = moon.umbralFraction > 0.98 ? " · totally eclipsed" : moon.umbralFraction > 0.01 ? " · partly eclipsed" : "";
      return `${phase} (${Math.round(moon.illuminated * 100)}%) · ${where} · ${mansionForDirection(moon.dir, sky).name}${eclipse}`;
    };
    const sunEclipse = snapshot.sun.coverage > 0.995 ? " · TOTAL ECLIPSE" : snapshot.sun.coverage > 0.01 ? ` · ${Math.round(snapshot.sun.coverage * 100)}% eclipsed` : "";
    let extra = {}, cloud = 0;
    if (this._eymField && this._sun) {
      const report = placeReport({ field: this._eymField, subsolar: this._sun.subsolar, latDeg, lonDeg, timeMs: this._sun.t });
      extra = { season: report.season, sunriseSunset: `${report.sunriseSunset} (${report.dayLength})`, temperature: report.temperature };
      this.#ensureWeather();
      const weather = this.#weatherHere(latDeg, lonDeg);
      if (weather) {
        extra.weather = `${weather.conditions}; ${weather.wind}`;
        extra.temperature = `${weather.weatherTemperature} (seasonal high ${Math.round(report.values.temperature.highC)}, low ${Math.round(report.values.temperature.lowC)})`;
        cloud = weather.values.weather.cloud;
        this._clusterView?.setCloud?.(cloud);
      }
    }
    const visiblePlanets = snapshot.planets.filter((p) => p.visible).map((p) => displayNameFor(HOME_SYSTEM.name, p.name));
    const values = {
      place: `${Math.abs(latDeg).toFixed(1)}°${latDeg >= 0 ? "N" : "S"}, ${Math.abs(lonDeg).toFixed(1)}°${lonDeg >= 0 ? "E" : "W"}`,
      localTime: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")} (sun time)`,
      sun: `${snapshot.twilight}, ${Math.round(snapshot.sun.altDeg)}°${sunEclipse}`,
      whiteMoon: moonText(snapshot.moons.find((m) => m.name === "White Moon")),
      redMoon: moonText(snapshot.moons.find((m) => m.name === "Red Moon")),
      planets: visiblePlanets.length ? `${visiblePlanets.join(", ")}${cloud > 0.8 ? " (behind cloud)" : ""}` : "none visible",
      limit: `magnitude ${snapshot.limitingMagnitude.toFixed(1)}`,
      ...extra,
    };
    for (const [field, value] of Object.entries(values)) { const element = root.querySelector(`[data-sky-field="${field}"]`); if (element) element.textContent = value; }
    const count = root.querySelector("[data-map-count]"); if (count) count.textContent = values.place;
  }

  async #enterBody(object) {
    const root = this.element?.querySelector?.(".oscm-shell"), svg = root?.querySelector(".oscm-cluster-svg");
    if (!root || !svg || ["star", "barycenter"].includes(object.objectClass)) return;
    try {
      let model;
      if (naturalBodyKind(object)) model = buildNaturalBodyModel(object);
      else if (artificialBodyKind(object)) model = buildArtificialBodyModel(object);
      else return;
      let geography = null, operations = null;
      if (object.geography_seed) {
        const slug = assetSlug(object.name), base = `modules/${MODULE_ID}/data`;
        let response = await fetch(`${base}/planet-cartography/${object.system.toLowerCase()}/${slug}.json`);
        if (!response.ok) response = await fetch(`${base}/planet-geography/${object.system.toLowerCase()}/${slug}.json`);
        if (!response.ok) throw new Error(`cartography fetch failed (${response.status})`);
        geography = await response.json();
      } else {
        operations = await loadBodyOperationAsset(object.system, object.name, MODULE_ID).catch((error) => { console.warn(`${MODULE_ID} | Body operations unavailable for ${object.system}/${object.name}`, error); return null; });
        if (operations && artificialBodyKind(object)) model = buildArtificialBodyModel(object, operations);
      }
      this._clusterView?.destroy();
      this._clusterView = new BodyView(svg, { model, geography, operations, ownerFaction: object.owner_faction, onExitRequested: () => this.#showSystem(), onFeatureSelected: (feature) => this.#updateBodyFeature(feature) });
      this.#leaveSky(root);
      this.mode = "body"; this.activeBody = object;
      // Eym: real day and night and the seasons on the globe, kept current with the clock.
      window.clearInterval(this._bodyTicker); this._bodyTicker = null;
      if (object.name === "Eventide" && geography?.terrain?.coastlineSource === "vector") {
        this._eymGeography = geography;
        this._eymField = environmentField(geography); this._coverDay = null; this._weatherStep = null; this._weatherSnow = null;
        void this.#refreshBodyEnvironment().catch((error) => console.warn(`${MODULE_ID} | Unable to show day and night`, error));
        this._bodyTicker = window.setInterval(() => void this.#refreshBodyEnvironment().catch(() => {}), 10000);
      }
      root.classList.add("is-system-mode", "is-body-mode");
      // Only Eym has people on it to look up: offer the ground view from its surface map.
      root.classList.toggle("can-look-up", object.name === "Eventide" && Boolean(geography));
      root.classList.toggle("has-geography", Boolean(geography));
      root.classList.toggle("has-operations", Boolean(operations));
      root.querySelector('[data-action="back-to-system"]')?.classList.remove("is-hidden");
      const title = root.querySelector("[data-map-title]"); if (title) title.textContent = objectDisplayName(object);
      const count = root.querySelector("[data-map-count]"); if (count) count.textContent = geography ? geography.schemaVersion === 2 ? `${geography.gazetteer.length} named features · 2° survey` : `${geography.cells.length} surface cells` : operations ? `${operations.operationalSummary.featureCount} operational features` : object.type;
      const help = root.querySelector("[data-map-help]"); if (help) help.textContent = geography
        ? "Click / tap a mapped surface feature"
        : model.kind === "asteroid-field" ? "Click / tap a mapped belt body"
        : "Click / tap docking approaches; drag to inspect";
      this.#updateRoutePanel(null, null);
      this.#updateBodyMetadata(object, model);
    } catch (error) { console.error(`${MODULE_ID} | Unable to enter body view`, error); ui.notifications.error(`Unable to load ${objectDisplayName(object)} orbital view.`); }
  }

  #updateBodyFeature(feature) {
    const root = this.element?.querySelector?.(".oscm-shell"), card = root?.querySelector(".oscm-object-details"); if (!root || !card) return;
    if (!feature) { this.#updateBodyMetadata(this.activeBody, this._clusterView?.model); return; }
    card.classList.remove("is-hidden");
    const inspected = inspectSurfaceFeature(feature);
    const lat = Number(feature.lat ?? feature.at?.[0]), lon = Number(feature.lon ?? feature.at?.[1]);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      const latInput = root.querySelector('[name="lookUpLat"]'), lonInput = root.querySelector('[name="lookUpLon"]');
      if (latInput) latInput.value = lat.toFixed(1);
      if (lonInput) lonInput.value = ((((lon + 180) % 360) + 360) % 360 - 180).toFixed(1);
      this.#updatePlaceReadout();
    }
    const values = { objectName: inspected.name, objectType: inspected.type, objectParent: (this.activeBody && objectDisplayName(this.activeBody)) || "—", objectRole: inspected.detail, objectScale: inspected.scale ?? (feature.suitability != null ? `Settlement suitability ${feature.suitability}` : "Survey extent not fixed") };
    for (const [field, value] of Object.entries(values)) { const element = root.querySelector(`[data-field="${field}"]`); if (element) element.textContent = value; }
  }

  #updateBodyMetadata(object, model) {
    const root = this.element?.querySelector?.(".oscm-shell"), card = root?.querySelector(".oscm-object-details"); if (!root || !card || !object || !model) return;
    card.classList.remove("is-hidden");
    const values = {
      objectName: objectDisplayName(object),
      objectType: model.structureClass || object.type,
      objectParent: parentDisplayName(object) || "—",
      objectRole: model.function || model.resourceProfile || object.hz_or_role || "Mapped orbital body",
      objectScale: model.dimensions || (model.radiusKm ? `${model.radiusKm.toLocaleString()} km radius` : "Distributed mapped region"),
    };
    for (const [field, value] of Object.entries(values)) { const element = root.querySelector(`[data-field="${field}"]`); if (element) element.textContent = value; }
  }

  /** Selection without travel: shows the selected object's details. The route maths is dormant below. */
  #updateRoutePanel(origin, destination) {
    this.selectedRoute = null;
    this.#updateObjectDetails(origin, destination);
  }

  /* ASTRAL TRAVEL (dormant): navigation profile, relativistic routes, voyages and the ship marker.
     The original #updateRoutePanel is kept here as #updateTravelRoutePanel.
  async #applyProfile(root) {
    if (!game.user.isGM) return;

    const accelerationInput = root.querySelector('[name="accelerationG"]');
    const betaInput = root.querySelector('[name="cruiseBeta"]');
    const gridInput = root.querySelector('[name="gridSpacing"]');

    const accelerationG = Number(accelerationInput?.value);
    const cruiseBeta = Number(betaInput?.value);
    const gridSpacing = Number(gridInput?.value);

    if (!(accelerationG > 0)) return ui.notifications.warn("Acceleration must be greater than 0 g.");
    if (!(cruiseBeta > 0 && cruiseBeta < 1)) return ui.notifications.warn("Cruise speed must be between 0 and 1 c.");
    if (![1, 2].includes(gridSpacing)) return ui.notifications.warn("Grid spacing must be 1 or 2 light-years.");

    await game.settings.set(MODULE_ID, "accelerationG", accelerationG);
    await game.settings.set(MODULE_ID, "cruiseBeta", cruiseBeta);
    await game.settings.set(MODULE_ID, "gridSpacing", gridSpacing);

    this._clusterView?.setGridSpacing?.(gridSpacing);
    this.#updateRoutePanel(this._clusterView?.origin ?? null, this._clusterView?.destination ?? null);
    ui.notifications.info("Cluster navigation profile updated.");
  }

  #updateTravelRoutePanel(origin, destination) {
    const root = this.element?.querySelector?.(".oscm-shell");
    if (!root) return;

    const originEl = root.querySelector('[data-field="origin"]');
    const destinationEl = root.querySelector('[data-field="destination"]');
    const prompt = root.querySelector(".oscm-selection-prompt");
    const result = root.querySelector(".oscm-route-result");
    const hud = root.querySelector(".oscm-route-hud");

    if (originEl) originEl.textContent = origin?.name ?? "—";
    if (destinationEl) destinationEl.textContent = destination?.name ?? "—";

    if (!origin || !destination) {
      prompt?.classList.remove("is-hidden");
      result?.classList.add("is-hidden");
      hud?.classList.add("is-hidden");
      if (prompt) {
        const noun = this.mode === "system" ? "object" : this.mode === "body" ? "feature" : "system";
        prompt.textContent = origin ? `Select a destination ${noun}.` : `Select an origin ${noun}, then a destination.`;
      }
      this.#updateObjectDetails(origin, destination);
      this.selectedRoute = null;
      this.#refreshActiveVoyage();
      return;
    }

    prompt?.classList.add("is-hidden");
    result?.classList.remove("is-hidden");
    hud?.classList.remove("is-hidden");

    const isSystem = this.mode === "system";
    const localAu = isSystem ? physicalDistanceAu(origin, destination) : null;
    const projected = isSystem
      ? Math.hypot(destination.physical.x - origin.physical.x, destination.physical.y - origin.physical.y)
      : projectedDistanceLy(origin, destination);
    const depth = isSystem ? Math.abs(destination.physical.z - origin.physical.z) : Math.abs(destination.z - origin.z);
    const spatial = isSystem ? physicalDistanceLy(origin, destination) : spatialDistanceLy(origin, destination);
    const accelerationG = Number(game.settings.get(MODULE_ID, "accelerationG"));
    const cruiseBeta = Number(game.settings.get(MODULE_ID, "cruiseBeta"));
    const transit = calculateTransit(spatial, { accelerationG, cruiseBeta });
    this.selectedRoute = {
      originId: origin.id, destinationId: destination.id, originName: origin.name, destinationName: destination.name,
      context: isSystem ? "system" : "cluster", systemId: isSystem ? this.activeSystem?.id : null,
      originCoordinates: isSystem ? structuredClone(origin.physical) : { x: origin.x, y: origin.y, z: origin.z },
      destinationCoordinates: isSystem ? structuredClone(destination.physical) : { x: destination.x, y: destination.y, z: destination.z },
      distanceLy: spatial, accelerationG, cruiseBeta, transit, origin, destination,
    };
    this._clusterView?.setRouteVisualization?.({ origin, destination, markers: trajectoryMarkers(transit) });

    const values = {
      projected: isSystem ? formatSystemDistance(projected) : formatLightYears(projected),
      depth: isSystem ? formatSystemDistance(depth) : formatLightYears(depth),
      spatial: isSystem ? formatSystemDistance(localAu) : formatLightYears(spatial),
      contracted: isSystem ? formatSystemDistance(transit.contractedDistanceLy * LIGHT_YEAR_KM / AU_KM) : formatLightYears(transit.contractedDistanceLy),
      clusterTime: formatDuration(transit.clusterYears),
      shipTime: formatDuration(transit.shipYears),
      peakSpeed: `${(transit.peakBeta * 100).toFixed(4)}% c`,
      profile: transit.reachesCruise
        ? `${accelerationG} g → ${(cruiseBeta * 100).toFixed(3)}% c → ${accelerationG} g brake`
        : `${accelerationG} g midpoint flip; speed cap not reached`,
    };

    // Avoid language/template rerenders during rapid route selection.
    for (const [field, value] of Object.entries(values)) {
      const el = root.querySelector(`[data-field="${field}"]`);
      if (el) el.textContent = value;
    }

    const hudValues = {
      route: `${origin.name} → ${destination.name}`,
      spatial: `${values.spatial} true distance`,
      clusterTime: values.clusterTime,
      shipTime: values.shipTime,
      profile: values.profile,
    };
    for (const [field, value] of Object.entries(hudValues)) {
      const el = root.querySelector(`[data-hud-field="${field}"]`);
      if (el) el.textContent = value;
    }
    this.#updateObjectDetails(origin, destination);
    this.#refreshActiveVoyage();
  }

  async #engageSelectedRoute() {
    const api = game.modules.get(MODULE_ID)?.api;
    if (!game.user.isGM || !api?.isClockAuthority?.() || !this.selectedRoute) return;
    try {
      if (this.selectedRoute.context === "system" && this.activeSystem) {
        const state = api.getCampaignTimeState();
        const currentModel = await this.#astronomicalModel(this.activeSystem.name, state.referenceBaseMs);
        const origin = currentModel.objects.find((object) => object.id === this.selectedRoute.originId);
        const destination = currentModel.objects.find((object) => object.id === this.selectedRoute.destinationId);
        if (!origin || !destination) throw new Error("The selected bodies are absent from the departure snapshot.");
        const distanceLy = physicalDistanceLy(origin, destination);
        this.selectedRoute = {
          ...this.selectedRoute,
          originCoordinates: structuredClone(origin.physical), destinationCoordinates: structuredClone(destination.physical),
          distanceLy,
          transit: calculateTransit(distanceLy, { accelerationG: this.selectedRoute.accelerationG, cruiseBeta: this.selectedRoute.cruiseBeta }),
          astronomySnapshotReferenceMs: state.referenceBaseMs,
        };
      } else if (this.selectedRoute.context === "cluster") {
        const state = api.getCampaignTimeState();
        await this.#astronomicalModel(this.selectedRoute.originName, state.referenceBaseMs);
        this.selectedRoute = { ...this.selectedRoute, astronomySnapshotReferenceMs: state.referenceBaseMs };
      }
      const next = engageVoyage(api.getCampaignTimeState(), this.selectedRoute, Date.now());
      await api.saveCampaignTimeState(next);
      ui.notifications.info(`${this.selectedRoute.originName} → ${this.selectedRoute.destinationName} engaged.`);
      this.#refreshActiveVoyage();
    } catch (error) { ui.notifications.warn(error?.message || "Unable to engage route."); }
  }

  async #abortActiveVoyage() {
    const api = game.modules.get(MODULE_ID)?.api;
    if (!game.user.isGM || !api?.isClockAuthority?.()) return;
    await api.saveCampaignTimeState(abortVoyage(api.getCampaignTimeState(), Date.now()));
    ui.notifications.info("Active voyage aborted. Accumulated clock divergence was preserved.");
    this.#updateRoutePanel(this._clusterView?.origin ?? null, this._clusterView?.destination ?? null);
  }

  async #scrubVoyageToFraction(fraction) {
    const api = game.modules.get(MODULE_ID)?.api;
    if (!game.user.isGM || !api?.isClockAuthority?.()) return;
    try {
      await api.saveCampaignTimeState(advanceVoyageToRouteFraction(api.getCampaignTimeState(), fraction, Date.now()));
      this.#refreshActiveVoyage();
    } catch (error) { ui.notifications.warn(error?.message || "Unable to scrub voyage time."); }
  }

  #refreshActiveVoyage() {
    const root = this.element?.querySelector?.(".oscm-shell"), api = game.modules.get(MODULE_ID)?.api;
    if (!root || !api) return;
    const state = api.getCampaignTimeState(), voyage = state.activeVoyage;
    const live = root.querySelector("[data-voyage-live]"), engage = root.querySelector('[data-action="engage-route"]');
    const active = voyage && voyage.status !== "arrived";
    live?.classList.toggle("is-hidden", !voyage);
    if (engage) { engage.disabled = Boolean(active) || !this.selectedRoute; engage.textContent = active ? "VOYAGE ACTIVE" : "ENGAGE"; }
    if (!voyage) return;
    const evaluated = evaluateVoyage(voyage, state.properBaseMs);
    const hud = root.querySelector(".oscm-route-hud"); hud?.classList.remove("is-hidden");
    const voyageHud = {
      route: `${voyage.originName} → ${voyage.destinationName}`,
      spatial: voyage.context === "system" ? `${formatSystemDistance(voyage.distanceLy * LIGHT_YEAR_KM / AU_KM)} true distance` : `${formatLightYears(voyage.distanceLy)} true distance`,
      clusterTime: formatDuration(voyage.referenceYears), shipTime: formatDuration(voyage.shipYears),
      profile: `${voyage.accelerationG} g → ${(voyage.peakBeta * 100).toFixed(3)}% c${voyage.reachesCruise ? " → cruise → brake" : " peak → brake"}`,
    };
    for (const [field, value] of Object.entries(voyageHud)) { const el = root.querySelector(`[data-hud-field="${field}"]`); if (el) el.textContent = value; }
    const phaseLabels = { accelerating: evaluated.velocity >= .1 ? "RELATIVISTIC ACCELERATION" : "ACCELERATING", cruise: "CRUISE", decelerating: evaluated.velocity < .02 ? "ARRIVAL APPROACH" : "DECELERATING", arrived: "ARRIVED" };
    const phase = root.querySelector('[data-hud-field="phase"]'), velocity = root.querySelector('[data-hud-field="velocity"]');
    if (phase) phase.textContent = phaseLabels[evaluated.phase] || evaluated.phase.toUpperCase();
    if (velocity) velocity.textContent = `${formatVelocity(evaluated.velocity)}${evaluated.phase === "cruise" ? " · CRUISE LIMIT" : ""}`;

    const sameSelectedRoute = this.selectedRoute?.originId === voyage.originId && this.selectedRoute?.destinationId === voyage.destinationId;
    let origin = sameSelectedRoute ? this.selectedRoute.origin : null, destination = sameSelectedRoute ? this.selectedRoute.destination : null;
    if (!origin && voyage.context === "cluster" && this.mode === "cluster") {
      origin = SYSTEMS.find((system) => system.id === voyage.originId); destination = SYSTEMS.find((system) => system.id === voyage.destinationId);
    } else if (!origin && voyage.context === "system" && this.mode === "system" && this.activeSystem?.id === voyage.systemId) {
      origin = this._clusterView?.model?.objects?.find((object) => object.id === voyage.originId);
      destination = this._clusterView?.model?.objects?.find((object) => object.id === voyage.destinationId);
    }
    if (origin && destination && !this._clusterView?.isDraggingShip) this._clusterView?.setRouteVisualization?.({
      origin, destination,
      markers: trajectoryMarkers(evaluated.transit), shipFraction: evaluated.routeFraction,
      draggable: Boolean(game.user.isGM && api.isClockAuthority?.()),
    });
  }
  */

  #updateObjectDetails(origin, destination) {
    const root = this.element?.querySelector?.(".oscm-shell");
    const card = root?.querySelector(".oscm-object-details");
    if (!card) return;
    card.classList.toggle("is-hidden", this.mode !== "system" || (!origin && !destination));
    const object = destination ?? origin;
    const values = {
      objectName: object ? objectDisplayName(object) : "—",
      objectType: object?.type ?? "—",
      objectParent: (object && parentDisplayName(object)) ?? "—",
      objectRole: object?.hz_or_role || object?.primary_function || "—",
      objectScale: object?.dimensions_estimate || (object?.radiusRe ? `${object.radiusRe} Earth radii` : "Schematic marker"),
    };
    for (const [field, value] of Object.entries(values)) {
      const element = root.querySelector(`[data-field="${field}"]`); if (element) element.textContent = value;
    }
  }
}

/** Rasterize an SVG document to a PNG blob at its own size. */
async function svgToPng(svgText, width, height) {
  const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
  try {
    const image = new Image(); image.decoding = "async";
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("the map image could not be drawn")); image.src = url; });
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    canvas.getContext("2d").drawImage(image, 0, 0, width, height);
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))), "image/png"));
  } finally { URL.revokeObjectURL(url); }
}

/** The ground in detail as a PNG: the tile's cover raster scaled onto the frame, then the SVG layers on top. */
async function detailToPng(tile, layout, width, height, svgLayers) {
  const source = document.createElement("canvas"); source.width = tile.cols; source.height = tile.rows;
  source.getContext("2d").putImageData(new ImageData(tileRgba(tile), tile.cols, tile.rows), 0, 0);
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d"); context.imageSmoothingEnabled = true;
  context.drawImage(source, layout.x0, layout.y0, tile.cols * layout.scale, tile.rows * layout.scale);
  for (const svg of svgLayers) {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try { const image = new Image(); await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("the detail layer could not be drawn")); image.src = url; }); context.drawImage(image, 0, 0, width, height); } finally { URL.revokeObjectURL(url); }
  }
  return await new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))), "image/png"));
}

/** Offer a blob as a download. */
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob), link = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
