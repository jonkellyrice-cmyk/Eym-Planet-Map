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
import { formatLatLon } from "./body-view-core.mjs";
import { knownCount, scholarEntry } from "./scholars-model.mjs";
import { greatCircleKm } from "./eym-surface.mjs";
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
import { DEFAULT_IMAGE_BASE_URL, checkBaseUrl, paintMap } from "./eym-image-provider.mjs";
import { CANON_SETTING, activeCanon, canonAbove, canonEntry, canonFolder, canonFor, frameRecord, mergeCanon, parentDirection, textHash } from "./eym-canon.mjs";
import { architectureLibrary, canonList, mapServerUrl, paintingSettings } from "./eym-paint-settings.mjs";
import { buildBattleMap, geometryHash } from "./eym-battle-rules.mjs";
import { MAP_FEATURE_CATEGORIES, MAP_FEATURES } from "./eym-battle-features.mjs";
import { buildInteriors, floorSvg, footprintMaskSvg, interiorArtDirection, mapFloors, roofMaskSvg } from "./eym-battle-interiors.mjs";
import { battleScenePlan } from "./eym-battle-scene.mjs";
import { ARCHITECTURE_SETTING, DEFAULT_LINK_RADIUS_KM, DOSSIER_FIELDS, archiveDossier, architecturePrompt, coversPlace, createDossier, createFolder, deleteDossier, deleteFolder, dossierChoices, dossierForPlace, dossierTree, folderPath, linkArea, moveFolder, renameFolder, styleArchitecturePrompt, styleForDossier, unlinkArea, updateDossier } from "./eym-architecture.mjs";
import { BUILDING_STYLES, styleForPlace } from "./eym-building-styles.mjs";
import { SETTINGS as BATTLE_SETTINGS } from "./eym-battle-settings.mjs";
import { battleArtDirection, battleGridSvg, battlePacket, battleReferenceSvg, battleSceneData, battleTacticalSvg, darknessFor, weatherEffectFor } from "./eym-battle-render.mjs";
import { BATTLE_SIZE_PRESETS, GRID_DENSITY_PRESETS, battleMapSpec } from "./eym-map-presets.mjs";
import { placeHistory, describeWeather } from "./eym-weather.mjs";
import { describeGround, describeStone, geologyAt, localStonePrompt } from "./eym-geology.mjs";
import { describeTremors, tremorsAt } from "./eym-quakes.mjs";
import { sunAltitudeDeg, yearFraction } from "./eym-seasons.mjs";
import { foliageSeason } from "./eym-battle-season.mjs";
import { guardPageZoom } from "./zoom-guard.mjs";

export const MODULE_ID = "eym-planet-map";
/** The only system this module exposes. Its name must match the `system` column of the registry CSV. */
export const HOME_SYSTEM = Object.freeze({ id: "abydos", name: "Abydos" });
const assetSlug = (value) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;


/** Enlarge pixel art by a whole number (nearest neighbour: each pixel a k×k block) and return a PNG blob. */
async function enlargePixelArt(blob, k) {
  if (!(k > 1)) return blob;
  const bitmap = await createImageBitmap(blob), canvas = document.createElement("canvas");
  canvas.width = bitmap.width * k; canvas.height = bitmap.height * k;
  const ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = false; ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close?.();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("could not enlarge the layer"))), "image/png"));
}

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
    // A pinch on the map zooms the map, never the page (iPhone Safari would otherwise do both).
    guardPageZoom(root.querySelector(".oscm-view"));
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
      const count = root.querySelector("[data-map-count]"); if (count) count.textContent = `${knownCount(model.objects)} known bodies`;
      const help = root.querySelector("[data-map-help]"); if (help) help.textContent = "Click / tap a body to name it; double-click / double-tap Eym to open its map";
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
      const help = root.querySelector("[data-map-help]"); if (help) help.textContent = "Drag to turn · pinch to look closer · tap to name";
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
    root.querySelector('[data-action="atlas-download-painted"]')?.addEventListener("click", download("paintedPng", "-painted.png"));
    // Painting is for the GM: players never see the controls, and the key lives only in the GM's browser.
    root.classList.toggle("is-player", !game.user?.isGM);
    const guard = (label, task) => () => void task().catch((error) => { console.error(`${MODULE_ID} | ${label}`, error); this.#paintStatus(`${label}: ${error.message}`); ui.notifications.error(`${label}: ${error.message}`); }).finally(() => root.querySelector(".oscm-atlas-paint")?.classList.remove("is-busy"));
    root.querySelector('[data-action="atlas-paint"]')?.addEventListener("click", guard("Unable to paint the map", () => this.#paintAtlasMap()));
    root.querySelector('[data-action="atlas-save-canon"]')?.addEventListener("click", guard("Unable to save the painted map", () => this.#saveCanonMap()));
    root.querySelector('[data-action="atlas-image-settings"]')?.addEventListener("click", guard("Image generator settings", () => this.#editImageSettings()));
    root.querySelector('[data-action="atlas-open-canon"]')?.addEventListener("click", guard("Unable to open the canon map", () => this.#openCanonMap(root.querySelector('[name="atlasCanon"]')?.value)));
    this.#refreshCanonList();
    this.#setUpBattleControls(root);
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
    // Region and local maps: the architecture dossier linked to the area goes into the prompt too.
    const areaDossier = ["region", "local"].includes(spec.level) ? dossierForPlace(architectureLibrary(MODULE_ID), ...map.frame.center)?.dossier : null;
    // A dossier that says nothing of materials takes the local stone (scripts/eym-geology.mjs).
    if (areaDossier) { const text = [architecturePrompt(areaDossier), areaDossier.materials ? "" : localStonePrompt(geologyAt(this._eymGeography, ...map.frame.center))].filter(Boolean).join("\n\n"); packet.prompt = `${packet.prompt}\n\n${text}`; packet.markdown = `${packet.markdown}\n## Architecture: ${areaDossier.name}\n\n${text}\n`; }
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
    this.#setResultKind("atlas");
    this._atlasMap = { kind: "atlas", map, spec, packet, title, continentId: spec.level === "continent" ? continentId : null, referenceHash: textHash(map.baseSvg) };
    this.#showPainted(null);
    const canon = canonFor(canonList(MODULE_ID), { level: spec.level, continentId: this._atlasMap.continentId, frame: frameRecord(map.frame) });
    if (canon) this.#showCanonEntry(canon, { changed: canon.referenceHash !== this._atlasMap.referenceHash });
    else this.#paintStatus(game.user?.isGM ? "Not painted yet." : "");
    root.querySelector('[data-atlas-view="detail"]')?.classList.toggle("is-hidden", !detailPng);
    root.querySelector('[data-action="atlas-download-detail"]')?.classList.toggle("is-hidden", !detailPng);
    root.querySelector("[data-atlas-result]")?.classList.remove("is-hidden");
    this.#showAtlasView(this._atlasResult.previews.painted ? "painted" : detailPng ? "detail" : "labelled");
  }

  #paintStatus(text) { const node = this.element?.querySelector?.("[data-atlas-paint-status]"); if (node) node.textContent = text ?? ""; }

  /** Show (or with null, hide) a painted version in the result panel; `urls` are {painted, paintedBare}. */
  #showPainted(painted) {
    const root = this.element?.querySelector?.(".oscm-shell"); if (!root || !this._atlasResult) return;
    for (const url of this._atlasResult.paintedUrls ?? []) URL.revokeObjectURL(url);
    Object.assign(this._atlasResult, { paintedPng: painted?.png ?? null, paintedLabelledPng: painted?.labelledPng ?? null, paintedUrls: painted?.ownedUrls ?? [], fresh: painted?.fresh ?? false });
    Object.assign(this._atlasResult.previews, { painted: painted?.urls?.painted, paintedBare: painted?.urls?.paintedBare });
    for (const view of ["painted", "paintedBare"]) root.querySelector(`[data-atlas-view="${view}"]`)?.classList.toggle("is-hidden", !painted);
    root.querySelector('[data-action="atlas-download-painted"]')?.classList.toggle("is-hidden", !painted?.png);
    root.querySelector('[data-action="atlas-save-canon"]')?.classList.toggle("is-hidden", !painted?.fresh || this._atlasMap?.kind === "battle");
    if (painted) this.#showAtlasView("painted");
  }

  /** Paint the current reference map with the configured image model (GM only). */
  async #paintAtlasMap() {
    if (!game.user?.isGM) throw new Error("only the GM can paint maps");
    const current = this._atlasMap, result = this._atlasResult; if (!current || !result) throw new Error("make a reference map first");
    let settings = paintingSettings(MODULE_ID);
    if (!settings.apiKey) { await this.#editImageSettings(); settings = paintingSettings(MODULE_ID); if (!settings.apiKey) return; }
    const { spec, map, packet } = current, images = [{ blob: result.basePng, name: "reference.png" }];
    let prompt = packet.prompt;
    const parent = map.frame ? canonAbove(canonList(MODULE_ID), map.frame) : null;
    if (parent) {
      const crop = await cropImage(parent.entry.files.painted, parent.crop, parent.entry.frame.W, spec.widthPx, spec.heightPx).catch(() => null);
      if (crop) { images.push({ blob: crop, name: "painted-parent.png" }); prompt = `${prompt}\n\n${parentDirection(parent)}`; }
    }
    this.element?.querySelector(".oscm-atlas-paint")?.classList.add("is-busy");
    this.#paintStatus(`Painting with ${settings.model}${images.length > 1 ? `, in the style of the canon ${parent.entry.level} map` : ""}… (this can take a minute)`);
    const painted = await paintMap({ ...settings, prompt, images, width: spec.widthPx, height: spec.heightPx });
    const png = await scaleImageBlob(painted.blob, spec.widthPx, spec.heightPx), labelledPng = await layerSvg(png, map.labelSvg, spec.widthPx, spec.heightPx);
    const urls = { painted: URL.createObjectURL(labelledPng), paintedBare: URL.createObjectURL(png) };
    this._atlasPaint = { model: settings.model, quality: settings.quality, prompt, parentId: parent?.entry.id ?? null };
    this.#showPainted({ png, labelledPng, urls, ownedUrls: Object.values(urls), fresh: true });
    this.#paintStatus(`Painted by ${settings.model} (asked for ${painted.size}, scaled to ${spec.widthPx}×${spec.heightPx}). ${current.kind === "battle" ? "Check it against the grid, then create the scene." : "Save it as canon to keep it."}`);
  }

  /** Upload the painted map and its companions to the world's folder and add it to the canon. */
  async #saveCanonMap() {
    if (!game.user?.isGM) throw new Error("only the GM can change the canon");
    const current = this._atlasMap, result = this._atlasResult; if (!current || !result?.paintedPng || !result.fresh) throw new Error("paint the map first");
    const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
    if (!FP?.upload) throw new Error("this Foundry has no file upload");
    const worldId = game.world?.id ?? "world", folder = `${canonFolder(worldId)}/${current.spec.level}`;
    for (const dir of [canonFolder(worldId), folder]) { try { await FP.createDirectory("data", dir, {}); } catch { /* already there */ } }
    const stem = `${result.fileStem}-${current.referenceHash.slice(0, 8)}-${Date.now().toString(36)}`;
    const upload = async (blob, suffix) => { const file = new File([blob], `${stem}${suffix}`, { type: blob.type || "application/octet-stream" }); const answer = await FP.upload("data", folder, file, {}, { notify: false }); if (!answer?.path && answer?.status !== "success") throw new Error(`upload of ${file.name} failed`); return answer.path ?? `${folder}/${file.name}`; };
    const files = { painted: await upload(result.paintedPng, "-painted.png"), labelled: await upload(result.paintedLabelledPng, "-painted-names.png"), labels: await upload(result.labelSvgBlob, "-names.svg"), reference: await upload(result.basePng, "-reference.png"), packet: await upload(result.packetBlob, "-packet.md") };
    const id = foundry.utils?.randomID?.() ?? `eym${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const entry = canonEntry({ id, title: current.title, spec: current.spec, frame: current.map.frame, continentId: current.continentId, files, model: this._atlasPaint?.model, quality: this._atlasPaint?.quality, prompt: this._atlasPaint?.prompt, referenceHash: current.referenceHash, userId: game.user?.id ?? null, createdAt: new Date().toISOString() });
    if (this._atlasPaint?.parentId) entry.parentId = this._atlasPaint.parentId;
    await game.settings.set(MODULE_ID, CANON_SETTING, mergeCanon(canonList(MODULE_ID), entry));
    result.fresh = false; this.element?.querySelector('[data-action="atlas-save-canon"]')?.classList.add("is-hidden");
    this.#refreshCanonList(id);
    this.#paintStatus(`Saved as canon: ${files.painted}`); ui.notifications.info(`"${current.title}" is now the canon ${current.spec.level} map.`);
  }

  /** Show a canon entry's saved files in the result panel. */
  #showCanonEntry(entry, { changed = false } = {}) {
    this.#showPainted({ urls: { painted: entry.files.labelled, paintedBare: entry.files.painted }, fresh: false });
    this.#paintStatus(`Canon painting from ${entry.createdAt.slice(0, 10)} (${entry.model ?? "unknown model"}).${changed ? " The reference has changed since it was painted; paint again to update it." : ""}`);
  }

  /** Open a canon map by id: rebuild its reference map (same level and place) and show its painting. */
  async #openCanonMap(id) {
    const entry = activeCanon(canonList(MODULE_ID)).find((e) => e.id === id); if (!entry) throw new Error("choose a canon map");
    const root = this.element?.querySelector?.(".oscm-shell"), set = (name, value) => { const el = root?.querySelector(`[name="${name}"]`); if (el) el.value = value; };
    set("atlasLevel", entry.level); if (entry.continentId) set("atlasContinent", entry.continentId);
    set("atlasImage", "custom"); set("atlasWidth", entry.spec.widthPx); set("atlasHeight", entry.spec.heightPx);
    if (["region", "local"].includes(entry.level)) { set("atlasMiles", Math.round(entry.frame.kmPerPx * entry.frame.W / 1.609344 * 1000) / 1000); set("lookUpLat", entry.frame.center[0]); set("lookUpLon", entry.frame.center[1]); }
    await this.#buildAtlasMap();
  }

  /** Fill the canon list in the atlas card (newest first). */
  #refreshCanonList(selected = null) {
    const select = this.element?.querySelector?.('[name="atlasCanon"]'); if (!select) return;
    const entries = activeCanon(canonList(MODULE_ID)).slice().reverse();
    select.replaceChildren(...(entries.length ? entries.map((e) => Object.assign(document.createElement("option"), { value: e.id, textContent: `${e.title} (${e.level})`, selected: e.id === selected })) : [Object.assign(document.createElement("option"), { value: "", textContent: "None yet" })]));
    this.element?.querySelector('[data-action="atlas-open-canon"]')?.toggleAttribute("disabled", !entries.length);
  }

  /** The GM's image generator key and server, kept in this browser only. */
  async #editImageSettings() {
    if (!game.user?.isGM) throw new Error("only the GM sets the image generator");
    const current = paintingSettings(MODULE_ID), Dialog = foundry.applications?.api?.DialogV2;
    if (!Dialog?.wait) throw new Error("this Foundry has no dialog support");
    const escape = (text) => String(text).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const content = `<p>The key is kept in this browser only. It is never saved to the world or shown to players, and it is sent only to the server address below.</p>
      <div class="form-group"><label>API key</label><input type="password" name="apiKey" autocomplete="off" placeholder="${current.apiKey ? "A key is set (leave blank to keep it)" : "Paste your key"}"></div>
      <div class="form-group"><label>Server address</label><input type="text" name="baseUrl" value="${escape(current.baseUrl)}"></div>
      <p class="hint">OpenAI: ${DEFAULT_IMAGE_BASE_URL}. A local or VPC server that speaks the same API works too. Model and quality are in Configure Settings.</p>`;
    const answer = await Dialog.wait({ window: { title: "Image generator" }, content, rejectClose: false, buttons: [
      { action: "save", label: "Save", default: true, callback: (event, button) => ({ action: "save", apiKey: button.form.elements.apiKey.value.trim(), baseUrl: button.form.elements.baseUrl.value.trim() }) },
      { action: "clear", label: "Forget the key", callback: () => ({ action: "clear" }) },
      { action: "cancel", label: "Cancel" },
    ] });
    if (answer?.action === "clear") { await game.settings.set(MODULE_ID, "imageApiKey", ""); this.#paintStatus("The key was removed from this browser."); return; }
    if (answer?.action !== "save") return;
    const base = checkBaseUrl(answer.baseUrl || DEFAULT_IMAGE_BASE_URL); if (!base.ok) throw new Error(`server address: ${base.reason}`);
    await game.settings.set(MODULE_ID, "imageBaseUrl", base.url);
    if (answer.apiKey) await game.settings.set(MODULE_ID, "imageApiKey", answer.apiKey);
    this.#paintStatus(paintingSettings(MODULE_ID).apiKey ? "Image generator ready." : "No key set yet.");
  }

  // ---------------------------------------------------------------- battle maps

  /** Atlas or battle results share one panel; switch its labels and buttons. */
  #setResultKind(kind) {
    const root = this.element?.querySelector?.(".oscm-shell"); if (!root) return;
    const battle = kind === "battle";
    root.querySelector("[data-atlas-result]")?.classList.toggle("is-battle", battle);
    const tab = root.querySelector("[data-atlas-tab-label]"); if (tab) tab.textContent = battle ? "Tactical (GM)" : "With names";
    const label = root.querySelector("[data-atlas-labelled-label]"); if (label) label.textContent = battle ? "Tactical PNG" : "PNG with names";
    root.querySelector('[data-action="battle-create-scene"]')?.classList.toggle("is-hidden", !battle);
    root.querySelector('[data-action="battle-paint-interiors"]')?.classList.toggle("is-hidden", !battle);
    root.querySelector('[data-action="battle-render-server"]')?.classList.toggle("is-hidden", !battle);
    if (!battle) root.querySelector('[data-atlas-view="pixel"]')?.classList.add("is-hidden");
    root.querySelector('[data-atlas-view="floors"]')?.classList.toggle("is-hidden", !battle);
    const notes = root.querySelector("[data-battle-notes]"); if (notes && !battle) notes.textContent = "";
    if (!battle) root.querySelector('[data-atlas-view="detail"]')?.classList.add("is-hidden");
  }

  /** Fill the battle card's choices from the presets and saved defaults. */
  #setUpBattleControls(root) {
    const setting = root.querySelector('[name="battleSetting"]'), size = root.querySelector('[name="battleSize"]'), density = root.querySelector('[name="battleDensity"]');
    if (!setting || !size || !density) return;
    const option = (value, label) => Object.assign(document.createElement("option"), { value, textContent: label });
    const group = (label, entries) => { const g = Object.assign(document.createElement("optgroup"), { label }); g.append(...entries.map(([id, s]) => option(id, s.label))); return g; };
    const all = Object.entries(BATTLE_SETTINGS);
    setting.replaceChildren(option("auto", "From the ground (automatic)"), group("The natural world", all.filter(([, s]) => s.group !== "fantastic")), group("The fantastic (chosen; reshapes the ground)", all.filter(([, s]) => s.group === "fantastic")));
    size.replaceChildren(...BATTLE_SIZE_PRESETS.map((p) => option(p.id, p.label)));
    density.replaceChildren(...GRID_DENSITY_PRESETS.map((p) => option(p.id, p.label)));
    const defaults = savedMapDefaults(MODULE_ID).battle;
    if (defaults.size !== "custom") size.value = defaults.size; if (defaults.density !== "custom") density.value = defaults.density;
    root.querySelector('[name="battleOrientation"]').value = defaults.orientation ?? "auto";
    const sync = () => { const summary = root.querySelector("[data-battle-summary]"); if (summary) summary.textContent = this.#battleSpec(root).summary; };
    for (const el of [size, density, root.querySelector('[name="battleOrientation"]')]) el?.addEventListener("change", sync);
    sync();
    const guard = (label, task) => () => void task().catch((error) => { console.error(`${MODULE_ID} | ${label}`, error); this.#paintStatus(`${label}: ${error.message}`); ui.notifications.error(`${label}: ${error.message}`); });
    // The GM's checklist of features, by category.
    const extras = root.querySelector("[data-battle-extras]");
    if (extras) {
      extras.replaceChildren(...MAP_FEATURE_CATEGORIES.map((cat) => { const set = document.createElement("fieldset"); set.append(Object.assign(document.createElement("legend"), { textContent: cat.label })); for (const f of MAP_FEATURES.filter((x) => x.category === cat.id)) { const label = document.createElement("label"); label.append(Object.assign(document.createElement("input"), { type: "checkbox", name: "battleExtra", value: f.id }), document.createTextNode(f.label)); set.append(label); } return set; }));
      const count = () => { const n = root.querySelectorAll('[name="battleExtra"]:checked').length, el = root.querySelector("[data-battle-extras-count]"); if (el) el.textContent = n ? `(${n} chosen)` : ""; };
      extras.addEventListener("change", count);
      root.querySelector('[data-action="battle-extras-clear"]')?.addEventListener("click", () => { for (const box of root.querySelectorAll('[name="battleExtra"]')) box.checked = false; count(); });
    }
    this.#refreshArchitectureSelect();
    this.#setUpDossierPanel(root);
    root.querySelector('[data-action="battle-build"]')?.addEventListener("click", guard("Unable to make the battle map", () => this.#buildBattle()));
    root.querySelector('[data-action="battle-create-scene"]')?.addEventListener("click", guard("Unable to create the scene", () => this.#createBattleScene()));
    root.querySelector('[data-action="battle-paint-interiors"]')?.addEventListener("click", guard("Unable to paint the interiors", () => this.#paintInteriors()));
    root.querySelector('[data-action="battle-render-server"]')?.addEventListener("click", guard("Unable to render pixel art", () => this.#renderOnServer()));
  }

  #battleSpec(root) {
    const value = (name) => root.querySelector(`[name="${name}"]`)?.value;
    const saved = savedMapDefaults(MODULE_ID).battle;
    return battleMapSpec({ ...saved, size: value("battleSize") ?? saved.size, density: value("battleDensity") ?? saved.density, orientation: value("battleOrientation") ?? "auto" });
  }

  // ---------------------------------------------------------------- architecture dossiers

  #library() { return architectureLibrary(MODULE_ID); }
  async #saveLibrary(lib, message = "") {
    if (!game.user?.isGM) throw new Error("only the GM edits the architecture dossiers");
    await game.settings.set(MODULE_ID, ARCHITECTURE_SETTING, lib);
    this.#refreshArchitectureSelect(); this.#renderDossierPanel();
    if (message) { const el = this.element?.querySelector?.("[data-dossier-status]"); if (el) el.textContent = message; }
  }
  #newId() { return foundry.utils?.randomID?.() ?? `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }
  async #confirm(title, text) {
    const Dialog = foundry.applications?.api?.DialogV2;
    if (Dialog?.confirm) return Boolean(await Dialog.confirm({ window: { title }, content: `<p>${text}</p>`, rejectClose: false }));
    return globalThis.confirm ? globalThis.confirm(text) : false;
  }

  /** The battle card's architecture choice: automatic (the dossier linked to the area), none, or one dossier. */
  #refreshArchitectureSelect() {
    const select = this.element?.querySelector?.('[name="battleArchitecture"]'); if (!select) return;
    const previous = select.value || "auto", option = (value, label) => Object.assign(document.createElement("option"), { value, textContent: label });
    const groups = new Map(); for (const c of dossierChoices(this.#library())) { if (!groups.has(c.path)) groups.set(c.path, []); groups.get(c.path).push(c); }
    select.replaceChildren(option("auto", "The dossier linked to this area"), option("none", "None"), ...[...groups].map(([path, items]) => { const g = Object.assign(document.createElement("optgroup"), { label: path || "Top level" }); g.append(...items.map((c) => option(c.id, c.name))); return g; }));
    select.value = [...select.options].some((o) => o.value === previous) ? previous : "auto";
  }

  /** The dossier for a battle map; a dossier picked by hand is linked to the area, so next time it comes up by itself. */
  async #dossierForBattle(root, lat, lon) {
    const choice = root.querySelector('[name="battleArchitecture"]')?.value ?? "auto", lib = this.#library();
    if (choice === "none") return null;
    if (choice === "auto") return dossierForPlace(lib, lat, lon)?.dossier ?? null;
    const dossier = lib.dossiers.find((d) => d.id === choice); if (!dossier) return null;
    if (game.user?.isGM && !coversPlace(dossier, lat, lon)) {
      const nearest = this._eymGeography.settlements.filter((s) => s.properName).map((s) => ({ s, km: Math.hypot(s.lat - lat, (s.lon - lon) * Math.cos(lat * Math.PI / 180)) * 111.2 })).sort((a, b) => a.km - b.km)[0];
      const area = nearest && nearest.km < DEFAULT_LINK_RADIUS_KM ? { lat: nearest.s.lat, lon: nearest.s.lon, radiusKm: DEFAULT_LINK_RADIUS_KM, label: nearest.s.properName } : { lat, lon, radiusKm: DEFAULT_LINK_RADIUS_KM, label: `${lat.toFixed(3)}°, ${lon.toFixed(3)}°` };
      await this.#saveLibrary(linkArea(lib, dossier.id, area));
      ui.notifications.info(`"${dossier.name}" will be used for ${area.label} from now on.`);
      root.querySelector('[name="battleArchitecture"]').value = "auto";
    }
    return dossier;
  }

  #setUpDossierPanel(root) {
    const panel = root.querySelector("[data-dossier-panel]"); if (!panel) return;
    const guard = (label, task) => (event) => void Promise.resolve(task(event)).catch((error) => { console.error(`${MODULE_ID} | ${label}`, error); ui.notifications.error(`${label}: ${error.message}`); });
    root.querySelector('[data-action="dossier-open"]')?.addEventListener("click", () => { panel.classList.remove("is-hidden"); this.#renderDossierPanel(); });
    panel.querySelector('[data-action="dossier-close"]')?.addEventListener("click", () => panel.classList.add("is-hidden"));
    panel.querySelector('[name="dossierShowArchived"]')?.addEventListener("change", () => this.#renderDossierPanel());
    const parent = () => (this._dossierSelection?.type === "folder" ? this._dossierSelection.id : this.#library().dossiers.find((d) => d.id === this._dossierSelection?.id)?.folderId ?? null);
    panel.querySelector('[data-action="dossier-new-folder"]')?.addEventListener("click", guard("New folder", async () => { const id = this.#newId(), parentId = parent(); this._dossierSelection = { type: "folder", id }; await this.#saveLibrary(createFolder(this.#library(), { name: "New folder", parentId }, id), "Folder created."); }));
    panel.querySelector('[data-action="dossier-new"]')?.addEventListener("click", guard("New dossier", async () => { const id = this.#newId(), folderId = parent(); this._dossierSelection = { type: "dossier", id }; await this.#saveLibrary(createDossier(this.#library(), { name: "New dossier", folderId }, id, new Date().toISOString()), "Dossier created: write it once, use it everywhere."); }));
    panel.querySelector("[data-dossier-tree]")?.addEventListener("click", (event) => { const button = event.target.closest("[data-select]"); if (!button) return; const [type, id] = button.dataset.select.split(":"); this._dossierSelection = { type, id }; this.#renderDossierPanel(); });
    panel.querySelector("[data-dossier-editor]")?.addEventListener("click", guard("Dossier", async (event) => {
      const button = event.target.closest("[data-dossier-action]"); if (!button) return;
      const editor = panel.querySelector("[data-dossier-editor]"), sel = this._dossierSelection, lib = this.#library(), now = new Date().toISOString(), value = (name) => editor.querySelector(`[name="${name}"]`)?.value ?? "";
      switch (button.dataset.dossierAction) {
        case "save-dossier": await this.#saveLibrary(updateDossier(lib, sel.id, { name: value("name"), folderId: value("folderId") || null, style: value("style"), ...Object.fromEntries(DOSSIER_FIELDS.map(({ key }) => [key, value(key)])) }, now), "Saved."); break;
        case "archive": await this.#saveLibrary(archiveDossier(lib, sel.id, !lib.dossiers.find((d) => d.id === sel.id)?.archived, now), "Archive status changed."); break;
        case "delete-dossier": if (await this.#confirm("Delete dossier", `Delete "${lib.dossiers.find((d) => d.id === sel.id)?.name}"? Archive it instead to keep it.`)) { this._dossierSelection = null; await this.#saveLibrary(deleteDossier(lib, sel.id), "Deleted."); } break;
        case "unlink": await this.#saveLibrary(unlinkArea(lib, sel.id, Number(button.dataset.index)), "Area removed."); break;
        case "link-here": {
          const lat = Number(root.querySelector('[name="lookUpLat"]')?.value), lon = Number(root.querySelector('[name="lookUpLon"]')?.value); if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("set a place in Here and now first");
          await this.#saveLibrary(linkArea(lib, sel.id, { lat, lon, radiusKm: Math.max(0.5, Number(value("radiusKm")) || DEFAULT_LINK_RADIUS_KM), label: value("areaLabel") || `${lat.toFixed(3)}°, ${lon.toFixed(3)}°` }), "Linked to the Here and now place.");
          break;
        }
        case "save-folder": { let next = renameFolder(lib, sel.id, value("name")); next = moveFolder(next, sel.id, value("parentId") || null); await this.#saveLibrary(next, "Folder saved."); break; }
        case "delete-folder": if (await this.#confirm("Delete folder", "Delete this folder? Its dossiers and folders move up a level; nothing is lost.")) { this._dossierSelection = null; await this.#saveLibrary(deleteFolder(lib, sel.id), "Folder deleted; its contents moved up."); } break;
        default: break;
      }
    }));
  }

  /** Draw the folder tree and the editor for the selection. */
  #renderDossierPanel() {
    const panel = this.element?.querySelector?.("[data-dossier-panel]"); if (!panel || panel.classList.contains("is-hidden")) return;
    const lib = this.#library(), sel = this._dossierSelection, showArchived = panel.querySelector('[name="dossierShowArchived"]')?.checked ?? false;
    const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const item = (type, x, icon, extra = "") => `<button type="button" data-select="${type}:${esc(x.id)}" class="${sel?.type === type && sel.id === x.id ? "is-selected" : ""} ${extra}"><i class="fa-solid ${icon}"></i> ${esc(x.name)}${x.archived ? " (archived)" : ""}</button>`;
    const tree = (node) => `<ul>${node.folders.map((f) => `<li>${item("folder", f, "fa-folder")}${tree(f)}</li>`).join("")}${node.dossiers.map((d) => `<li>${item("dossier", d, "fa-landmark", d.archived ? "is-archived" : "")}</li>`).join("")}</ul>`;
    const root = dossierTree(lib, { showArchived });
    panel.querySelector("[data-dossier-tree]").innerHTML = root.folders.length || root.dossiers.length ? tree(root) : `<p class="oscm-muted">No dossiers yet. Make one for each people's way of building; link it to the places where they live.</p>`;
    const folderOptions = (selected, exclude = null) => `<option value="">Top level</option>${lib.folders.filter((f) => f.id !== exclude).map((f) => ({ f, path: folderPath(lib, f.id) })).sort((a, b) => a.path.localeCompare(b.path)).map(({ f, path }) => `<option value="${esc(f.id)}" ${f.id === selected ? "selected" : ""}>${esc(path)}</option>`).join("")}`;
    const editor = panel.querySelector("[data-dossier-editor]");
    const dossier = sel?.type === "dossier" ? lib.dossiers.find((d) => d.id === sel.id) : null, folder = sel?.type === "folder" ? lib.folders.find((f) => f.id === sel.id) : null;
    if (dossier) {
      editor.innerHTML = `<label><span>Name</span><input name="name" value="${esc(dossier.name)}"></label>
        <label><span>Folder</span><select name="folderId">${folderOptions(dossier.folderId)}</select></label>
        <label><span>Pixel-art building style</span><select name="style"><option value="">From the place (or generic)</option>${Object.values(BUILDING_STYLES).filter((st) => st.id !== "default").map((st) => `<option value="${esc(st.id)}" ${st.id === dossier.style ? "selected" : ""}>${esc(st.label)}</option>`).join("")}</select></label>
        ${DOSSIER_FIELDS.map(({ key, label, short }) => `<label><span>${esc(label)}</span>${short ? `<input name="${key}" value="${esc(dossier[key])}">` : `<textarea name="${key}">${esc(dossier[key])}</textarea>`}</label>`).join("")}
        <div class="oscm-atlas-actions"><button type="button" data-dossier-action="save-dossier"><i class="fa-solid fa-floppy-disk"></i> Save</button><button type="button" data-dossier-action="archive">${dossier.archived ? "Unarchive" : "Archive"}</button><button type="button" data-dossier-action="delete-dossier"><i class="fa-solid fa-trash"></i> Delete</button></div>
        <strong>Used in these areas</strong>
        <ul>${dossier.areas.map((a, k) => `<li>${esc(a.label || `${a.lat.toFixed(3)}°, ${a.lon.toFixed(3)}°`)} · ${a.radiusKm} km <button type="button" data-dossier-action="unlink" data-index="${k}">Remove</button></li>`).join("") || "<li class='oscm-muted'>None yet: pick it for a battle map, or link it here.</li>"}</ul>
        <div class="oscm-atlas-actions"><input name="areaLabel" placeholder="Area name (optional)"><input name="radiusKm" type="number" min="0.5" max="500" step="0.5" value="${DEFAULT_LINK_RADIUS_KM}" title="Radius (km)"><button type="button" data-dossier-action="link-here">Link to the Here and now place</button></div>
        <strong>In the image prompt</strong><pre>${esc(architecturePrompt(dossier) || "(empty: write something above and save)")}</pre>`;
    } else if (folder) {
      editor.innerHTML = `<label><span>Folder name</span><input name="name" value="${esc(folder.name)}"></label>
        <label><span>Inside</span><select name="parentId">${folderOptions(folder.parentId, folder.id)}</select></label>
        <div class="oscm-atlas-actions"><button type="button" data-dossier-action="save-folder"><i class="fa-solid fa-floppy-disk"></i> Save</button><button type="button" data-dossier-action="delete-folder"><i class="fa-solid fa-trash"></i> Delete folder</button></div>`;
    } else editor.innerHTML = `<p class="oscm-muted">Choose a dossier or folder, or make a new one.</p>`;
  }

  /** Ground, weather and light at a place now (from the campaign clock), for the rules and the scene. */
  async #battleConditions(lat, lon) {
    if (!this._sun) { const { t, subsolar } = await this.#sunNow(); this._sun = { t, subsolar }; }
    if (!this._eymField) this._eymField = environmentField(this._eymGeography);
    this.#ensureWeather();
    const now = this._weather ? placeWeatherNow(this._weather, lat, lon, { subsolar: this._sun.subsolar, timeMs: this._sun.t }) : null;
    const history = this._weather ? placeHistory(this._weather, lat, lon) : null;
    const report = placeReport({ field: this._eymField, subsolar: this._sun.subsolar, latDeg: lat, lonDeg: lon, timeMs: this._sun.t });
    const altitude = sunAltitudeDeg(lat, lon, this._sun.subsolar);
    // The season the trees and grass are in (light and shadow are Foundry's, live).
    const season = foliageSeason(lat, yearFraction(this._sun.t));
    return {
      conditions: { snowDepthCm: history?.snowDepthCm ?? 0, ground: history?.ground ?? "dry", tempC: now?.tempC ?? report.values.temperature.nowC, precipKind: now?.precipMmH > 0.1 ? now.precipKind : null, precipMmH: now?.precipMmH ?? 0, windMs: now?.windMs ?? 0, thunder: Boolean(now?.thunder), fog: (now?.humidity ?? 0) > 0.97 && (now?.windMs ?? 0) < 3, sunAltitudeDeg: altitude, season: report.season },
      season,
      words: { time: `${report.localTime}, ${report.season}; the sun ${report.sun}`, weather: now ? describeWeather(now) : "", light: altitude >= 0 ? "daylight" : altitude > -6 ? "civil twilight (dim)" : altitude > -12 ? "dusk or dawn (dim to dark)" : "night (darkness, moonlight aside)" },
    };
  }

  /** Make a battle map at the Here and now place and show it with its tactical overlay. */
  async #buildBattle() {
    const root = this.element?.querySelector?.(".oscm-shell"); if (!root || !this._eymGeography) return;
    const lat = Number(root.querySelector('[name="lookUpLat"]')?.value), lon = Number(root.querySelector('[name="lookUpLon"]')?.value);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("set a place in Here and now first");
    const spec = this.#battleSpec(root), useClock = root.querySelector('[name="battleConditions"]')?.checked ?? true;
    ui.notifications.info("Laying out the battle map…");
    await new Promise((resolve) => setTimeout(resolve, 30));
    const env = useClock ? await this.#battleConditions(lat, lon) : { conditions: {}, season: null, words: { time: "", weather: "", light: "" } };
    const extras = [...root.querySelectorAll('[name="battleExtra"]:checked')].map((box) => box.value), settingChoice = root.querySelector('[name="battleSetting"]')?.value ?? "auto";
    // The people's way of building: the dossier's style, else the place's. It shapes the buildings too.
    const dossier = await this.#dossierForBattle(root, lat, lon), style = styleForDossier(dossier, styleForPlace(lat, lon));
    const map = buildBattleMap(this._eymGeography, { center: [lat, lon], spec, conditions: env.conditions, setting: settingChoice, extras, style });
    // Exactly what built this map, so the map server can build the same one.
    const serverRequest = { center: [lat, lon], columns: spec.columns, rows: spec.rows, gridPx: spec.gridPx, setting: settingChoice, extras, conditions: env.conditions, season: env.season, style };
    const architecture = [architecturePrompt(dossier) || styleArchitecturePrompt(style), dossier?.materials ? "" : localStonePrompt(map.geology)].filter(Boolean).join(" ");
    const nearest = this._eymGeography.settlements.filter((s) => s.properName).reduce((best, s) => { const d = Math.hypot(s.lat - lat, (s.lon - lon) * Math.cos(lat * Math.PI / 180)); return d < best.d ? { s, d } : best; }, { s: null, d: Infinity });
    const place = nearest.s && nearest.d < 0.3 ? `near ${nearest.s.properName}` : `${Math.abs(lat).toFixed(3)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(3)}°${lon >= 0 ? "E" : "W"}`;
    const title = `${BATTLE_SETTINGS[map.setting].label}, ${place}`;
    const referenceSvg = battleReferenceSvg(map), tacticalSvg = battleTacticalSvg(map), interiors = buildInteriors(map);
    const basePng = await svgToPng(referenceSvg, spec.widthPx, spec.heightPx), labelledPng = await layerSvg(basePng, tacticalSvg, spec.widthPx, spec.heightPx);
    const prompt = battleArtDirection(map, { architecture, season: env.season, timeWords: env.words.time ? `Season and time: ${env.words.time}.` : "", weatherWords: env.words.weather ? `Weather: ${env.words.weather}; show its effect on the ground (wet, snowy or dry) but not falling rain or snow.` : "" });
    const packet = battlePacket(map, { title, place, timeWords: env.words.time, weatherWords: env.words.weather, lightWords: env.words.light, architecture, dossierName: dossier?.name ?? "" });
    for (const url of this._atlasResult?.urls ?? []) URL.revokeObjectURL(url);
    const floorsPng = interiors.length ? await svgToPng(floorSvg(map, interiors, 0, { outdoorSvg: referenceSvg }), spec.widthPx, spec.heightPx) : basePng;
    const urls = { base: URL.createObjectURL(basePng), labelled: URL.createObjectURL(labelledPng), floors: URL.createObjectURL(floorsPng) };
    const fileStem = `eym-battle-${map.setting}-${place.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    this._atlasResult = { basePng, labelledPng, detailPng: null, labelSvgBlob: null, packetBlob: new Blob([packet], { type: "text/markdown" }), prompt, urls: Object.values(urls), previews: urls, fileStem };
    this._atlasMap = { kind: "battle", map: { labelSvg: battleGridSvg(spec), frame: null }, battle: map, interiors, referenceSvg, spec, packet: { prompt, markdown: packet }, title, env, architecture, referenceHash: textHash(referenceSvg), paintedFloors: {}, serverRequest, pixel: null };
    this.#setResultKind("battle");
    this.#showPainted(null);
    root.querySelector("[data-atlas-title]").textContent = title;
    root.querySelector("[data-atlas-result-summary]").textContent = `${spec.summary} · ${map.analysis.routes} routes · cover ${Math.round(map.analysis.coverShare * 100)}%${dossier ? ` · architecture: ${dossier.name}` : ""}`;
    const notes = root.querySelector("[data-battle-notes]"); if (notes) notes.textContent = map.notes.join(" ");
    this.#paintStatus(game.user?.isGM ? "Not painted yet: the scene can use the reference layout, or paint it first." : "");
    root.querySelector("[data-atlas-result]")?.classList.remove("is-hidden");
    this.#showAtlasView("labelled");
  }

  /** Render the battle map as pixel art on the map server, check it is the same map, and keep its layers for the scene. */
  async #renderOnServer() {
    const current = this._atlasMap; if (current?.kind !== "battle") throw new Error("make a battle map first");
    const base = mapServerUrl(MODULE_ID); if (!base) throw new Error("set the map server address in Game Settings → Eym Planet Map first");
    if (globalThis.location?.protocol === "https:" && base.startsWith("http:") && !/^http:\/\/(localhost|127\.)/.test(base)) throw new Error("this Foundry is served over https, so the map server must be too (browsers block plain http here)");
    this.#paintStatus("Rendering pixel art on the map server… (a first render takes several seconds)");
    let response; try { response = await fetch(`${base}/api/battle-maps`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...current.serverRequest, tier: 2 }) }); } catch (error) { throw new Error(`could not reach the map server at ${base} (${error.message})`); }
    const manifest = await response.json().catch(() => ({})); if (!response.ok) throw new Error(manifest.error ?? `the map server answered ${response.status}`);
    // The same map, or nothing: the walls, regions and stairs come from this module's own geometry.
    const ours = geometryHash(current.battle); if (manifest.geometryHash !== ours) throw new Error(`the map server built a different map (its geometry ${manifest.geometryHash}, ours ${ours}); update the module or the server so both run the same version`);
    // Layers come at their native size (small, quick) and are enlarged here, each pixel a crisp block.
    const file = async (name) => { const r = await fetch(`${base}/api/battle-maps/${manifest.id}/files/${name}?size=native`); if (!r.ok) throw new Error(`could not fetch ${name} (${r.status})`); return enlargePixelArt(await r.blob(), manifest.scale); };
    const pixel = { manifest, exterior: await file(manifest.files.exterior), ground: await file(manifest.files.ground), roofs: {}, floors: {} };
    for (const [floor, name] of Object.entries(manifest.files.roofs ?? {})) pixel.roofs[floor] = await file(name);
    for (const [floor, name] of Object.entries(manifest.files.floors ?? {})) pixel.floors[floor] = await file(name);
    current.pixel = pixel;
    const root = this.element?.querySelector?.(".oscm-shell"), url = URL.createObjectURL(pixel.exterior);
    (this._atlasResult.urls ??= []).push(url); this._atlasResult.previews.pixel = url;
    root?.querySelector('[data-atlas-view="pixel"]')?.classList.remove("is-hidden"); this.#showAtlasView("pixel");
    this.#paintStatus(`Pixel art (Tier ${manifest.tier}, ${manifest.native} px per square ×${manifest.scale}) — the same map (geometry ${ours}). Create the scene to use it.`);
  }

  /** Paint every floor's interiors (ground floor, upper floors, basement) with the image model. */
  async #paintInteriors() {
    if (!game.user?.isGM) throw new Error("only the GM can paint maps");
    const current = this._atlasMap; if (current?.kind !== "battle") throw new Error("make a battle map first");
    if (!current.interiors.length) { this.#paintStatus("No buildings on this map: nothing inside to paint."); return; }
    let settings = paintingSettings(MODULE_ID);
    if (!settings.apiKey) { await this.#editImageSettings(); settings = paintingSettings(MODULE_ID); if (!settings.apiKey) return; }
    const { spec, battle: map, interiors } = current, floors = mapFloors(interiors);
    this.element?.querySelector(".oscm-atlas-paint")?.classList.add("is-busy");
    try {
      for (const floor of floors) {
        this.#paintStatus(`Painting the ${floor < 0 ? "basements" : floor === 0 ? "ground floors" : `floor ${floor + 1}`} (${floors.indexOf(floor) + 1} of ${floors.length})…`);
        const reference = await svgToPng(floorSvg(map, interiors, floor, floor === 0 ? { outdoorSvg: current.referenceSvg } : { fill: floor < 0 ? "#141210" : "#808080" }), spec.widthPx, spec.heightPx);
        const images = [{ blob: reference, name: "floor-reference.png" }, ...(this._atlasResult?.paintedPng ? [{ blob: this._atlasResult.paintedPng, name: "outside-painted.png" }] : [])];
        const prompt = `${interiorArtDirection(map, interiors, floor, { architecture: current.architecture })}${images.length > 1 ? "\n\nA second image is attached: the painted outside of this same map. Match its style and palette." : ""}`;
        const painted = await paintMap({ ...settings, prompt, images, width: spec.widthPx, height: spec.heightPx });
        current.paintedFloors[floor] = await scaleImageBlob(painted.blob, spec.widthPx, spec.heightPx);
      }
      this.#paintStatus(`Interiors painted for ${floors.length} floor${floors.length > 1 ? "s" : ""}. Create the scene to use them.`);
    } finally { this.element?.querySelector(".oscm-atlas-paint")?.classList.remove("is-busy"); }
  }

  /** The images a multi-floor scene needs, as PNG blobs: ground (outside + opened buildings), roofs per floor, each other floor. */
  async #floorImages(current) {
    // Pixel art from the map server comes with every layer already made.
    if (current.pixel) return { ground: current.pixel.ground, roofs: { ...current.pixel.roofs }, floors: { ...current.pixel.floors } };
    const { spec, battle: map, interiors } = current, W = spec.widthPx, H = spec.heightPx, outdoor = this._atlasResult.paintedPng ?? this._atlasResult.basePng;
    const painted = current.paintedFloors ?? {}, out = { ground: null, roofs: {}, floors: {} };
    const inside = async (floor) => (painted[floor] ? maskImage(painted[floor], footprintMaskSvg(map, interiors, floor), W, H) : svgToPng(floorSvg(map, interiors, floor), W, H));
    out.ground = await stackImages([outdoor, await inside(0)], W, H);
    if (interiors.length) out.roofs[0] = await maskImage(outdoor, roofMaskSvg(map, interiors, 0), W, H);
    for (const floor of mapFloors(interiors).filter((f) => f !== 0)) {
      out.floors[floor] = floor < 0 ? await stackImages([await svgToPng(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#141210"/></svg>`, W, H), await inside(floor)], W, H) : await inside(floor);
      if (floor > 0) out.roofs[floor] = await maskImage(outdoor, roofMaskSvg(map, interiors, floor), W, H);
    }
    return out;
  }

  /** Upload the battle map's images and create the Foundry scene: native Scene Levels on v14 (one per floor), a single image before. */
  async #createBattleScene() {
    if (!game.user?.isGM) throw new Error("only the GM can create scenes");
    const current = this._atlasMap, result = this._atlasResult; if (current?.kind !== "battle" || !result) throw new Error("make a battle map first");
    const FP = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker; if (!FP?.upload) throw new Error("this Foundry has no file upload");
    const worldId = game.world?.id ?? "world", folder = `${canonFolder(worldId)}/battle`;
    for (const dir of [canonFolder(worldId), folder]) { try { await FP.createDirectory("data", dir, {}); } catch { /* already there */ } }
    const stem = `${result.fileStem}-${current.referenceHash.slice(0, 8)}-${Date.now().toString(36)}`, painted = Boolean(result.paintedPng);
    const upload = async (blob, suffix) => { const file = new File([blob], `${stem}${suffix}`, { type: blob.type || "application/octet-stream" }); const answer = await FP.upload("data", folder, file, {}, { notify: false }); return answer?.path ?? `${folder}/${file.name}`; };
    await upload(result.packetBlob, "-packet.md");
    const { conditions } = current.env ?? { conditions: {} };
    const movementCost = Boolean(globalThis.CONFIG?.RegionBehavior?.dataModels?.modifyMovementCost);
    const SceneClass = globalThis.getDocumentClass?.("Scene") ?? globalThis.Scene; if (!SceneClass?.create) throw new Error("this Foundry has no scenes");
    const hasLevels = Boolean(SceneClass.schema?.fields?.levels ?? globalThis.CONFIG?.Level ?? (game.release?.generation >= 14));
    const options = { name: current.title, darkness: darknessFor(conditions.sunAltitudeDeg), weather: weatherEffectFor(conditions), movementCost, notes: current.battle.notes.join(" "), style: current.serverRequest?.style ?? "default" };
    if (!hasLevels) {
      const imagePath = current.pixel ? await upload(current.pixel.exterior, "-pixel.png") : await upload(painted ? result.paintedPng : result.basePng, painted ? "-painted.png" : "-layout.png");
      const data = battleSceneData(current.battle, { ...options, imagePath });
      let scene; try { scene = await SceneClass.create(data); } catch (error) { console.warn(`${MODULE_ID} | Scene with terrain regions was refused; creating it without them`, error); scene = await SceneClass.create({ ...data, regions: [] }); }
      this.#paintStatus(`Scene created: ${scene?.name ?? current.title} (one floor: this Foundry has no Scene Levels).`); ui.notifications.info(`Scene "${current.title}" created.`); return;
    }
    // Foundry v14: a Level per floor, then walls, roofs and regions on their Levels.
    this.#paintStatus("Preparing the floors…");
    const blobs = await this.#floorImages(current), images = { ground: await upload(blobs.ground, "-ground.png"), roofs: {}, floors: {} };
    for (const [floor, blob] of Object.entries(blobs.roofs)) images.roofs[floor] = await upload(blob, `-roofs-${floor}.png`);
    for (const [floor, blob] of Object.entries(blobs.floors)) images.floors[floor] = await upload(blob, `-floor-${floor}.png`);
    const plan = battleScenePlan(current.battle, current.interiors, { ...options, images });
    const scene = await SceneClass.create({ ...plan.scene, levels: plan.levels.map(({ key, visibility, ...level }) => level) });
    const idOf = new Map(plan.levels.map((l) => [l.key, scene.levels?.find?.((x) => x.name === l.name)?.id ?? scene.levels?.contents?.find((x) => x.name === l.name)?.id]));
    const ids = (keys) => keys.map((k) => idOf.get(k)).filter(Boolean);
    const updates = plan.levels.filter((l) => l.visibility.levelKeys.length).map((l) => ({ _id: idOf.get(l.key), visibility: { levels: ids(l.visibility.levelKeys) } }));
    if (updates.length) await scene.updateEmbeddedDocuments?.("Level", updates);
    if (idOf.get("floor0")) await scene.update?.({ initialLevel: idOf.get("floor0") });
    await scene.createEmbeddedDocuments?.("Wall", plan.walls.map(({ levelKeys, ...w }) => ({ ...w, levels: ids(levelKeys) })));
    if (plan.tiles.length) await scene.createEmbeddedDocuments?.("Tile", plan.tiles.map(({ levelKey, ...t }) => ({ ...t, levels: ids([levelKey]) })));
    // Lights: Foundry lights them live (lanterns and candles come on as the scene darkens).
    if (plan.lights.length) { try { await scene.createEmbeddedDocuments?.("AmbientLight", plan.lights.map(({ levelKeys, ...l }) => ({ ...l, levels: ids(levelKeys) }))); } catch (error) { console.warn(`${MODULE_ID} | Some lights were refused`, error); ui.notifications.warn("Some lights could not be added on this Foundry version."); } }
    const regions = plan.regions.map(({ levelKeys, ...r }) => ({ ...r, levels: ids(levelKeys) }));
    try { await scene.createEmbeddedDocuments?.("Region", regions); }
    catch (error) { console.warn(`${MODULE_ID} | Some regions were refused; retrying without behaviours`, error); await scene.createEmbeddedDocuments?.("Region", regions.map((r) => ({ ...r, behaviors: [] }))); ui.notifications.warn("Region behaviours (stairs, movement costs) could not be added on this Foundry version; the areas are marked."); }
    this.#paintStatus(`Scene created: ${scene?.name ?? current.title} — ${plan.levels.map((l) => l.name).join(", ")}; ${plan.walls.length} walls, ${plan.tiles.length} roof layer${plan.tiles.length === 1 ? "" : "s"}, ${plan.regions.filter((r) => r.behaviors.some((b) => b.type === "changeLevel")).length} stairs, ${plan.lights.length} lights.`);
    ui.notifications.info(`Scene "${current.title}" created.`);
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
    // The rock and soil here, and the earthquakes and eruptions of the last 30 days (worked out once a day per place).
    const geo = geologyAt(this._eymGeography, latDeg, lonDeg);
    Object.assign(values, { rock: describeGround(geo), stone: describeStone(geo) });
    const key = `${latDeg.toFixed(3)},${lonDeg.toFixed(3)},${Math.floor(this._sun.t / DAY_MS)}`;
    if (this._tremorKey !== key) { this._tremorKey = key; this._tremorText = describeTremors(tremorsAt(this._eymGeography?.geology, { lat: latDeg, lon: lonDeg, fromMs: this._sun.t - 30 * DAY_MS, toMs: this._sun.t, onGodstone: geo?.onGodstone }), this._sun.t); }
    values.tremors = this._tremorText;
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
    if (!root || !svg || ["star", "barycenter"].includes(object.objectClass) || !scholarEntry(object).openable) return;
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
      this._clusterView = new BodyView(svg, { model, geography, operations, ownerFaction: object.owner_faction, onExitRequested: () => this.#showSystem(), onFeatureSelected: (feature) => this.#updateBodyFeature(feature), onPlaceSelected: (place) => this.#selectPlace(place) });
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
      if (latInput) latInput.value = String(Math.round(lat * 1e4) / 1e4);
      if (lonInput) lonInput.value = String(Math.round(((((lon + 180) % 360) + 360) % 360 - 180) * 1e4) / 1e4);
      this.#updatePlaceReadout();
    }
    const values = { objectName: inspected.name, objectType: inspected.type, objectParent: (this.activeBody && objectDisplayName(this.activeBody)) || "—", objectRole: inspected.detail, objectScale: inspected.scale ?? (feature.suitability != null ? `Settlement suitability ${feature.suitability}` : "Survey extent not fixed") };
    for (const [field, value] of Object.entries(values)) { const element = root.querySelector(`[data-field="${field}"]`); if (element) element.textContent = value; }
  }

  /** A place clicked on Eym's surface (not on a feature): it becomes the place for the sky, Here and now, atlas and battle maps. */
  #selectPlace({ lat, lon }) {
    const root = this.element?.querySelector?.(".oscm-shell"), card = root?.querySelector(".oscm-object-details"); if (!root) return;
    const round = (v) => String(Math.round(v * 1e4) / 1e4), latInput = root.querySelector('[name="lookUpLat"]'), lonInput = root.querySelector('[name="lookUpLon"]');
    if (latInput) latInput.value = round(lat); if (lonInput) lonInput.value = round(lon);
    this.#updatePlaceReadout();
    const named = (this._eymGeography?.settlements ?? []).filter((x) => x.properName && Number.isFinite(x.lat));
    const nearest = named.reduce((best, x) => { const d = greatCircleKm([lat, lon], [x.lat, x.lon]); return d < best.d ? { x, d } : best; }, { x: null, d: Infinity });
    const values = {
      objectName: formatLatLon(lat, lon, 4), objectType: "A place on Eym (clicked)", objectParent: (this.activeBody && objectDisplayName(this.activeBody)) || "Eym",
      objectRole: nearest.x ? `${Math.round(nearest.d)} km from ${nearest.x.properName} (${nearest.x.kind})` : "—", objectScale: "Set as the place for the sky, Here and now, atlas and battle maps",
    };
    card?.classList.remove("is-hidden");
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
    // What the scholars know of it: the wanderers are stars to them, so nothing of their true nature shows.
    const object = destination ?? origin, known = object ? scholarEntry(object) : null;
    const values = {
      objectName: object ? objectDisplayName(object) : "—",
      objectType: known?.label || "—",
      objectParent: (object && parentDisplayName(object)) ?? "—",
      objectRole: known?.note || "—",
      objectScale: known?.openable ? "Mapped: double-click to open" : "Seen in the sky only",
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

/** Load an image (URL or Blob). */
async function loadImage(source) {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  try { const image = new Image(); image.decoding = "async"; await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error("an image could not be loaded")); image.src = url; }); return image; }
  finally { if (typeof source !== "string") setTimeout(() => URL.revokeObjectURL(url), 0); }
}
const canvasPng = (canvas) => new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("PNG encoding failed"))), "image/png"));

/** Scale a painted image to the map's exact size (the model paints at its own native sizes). */
async function scaleImageBlob(blob, width, height) {
  const image = await loadImage(blob), canvas = Object.assign(document.createElement("canvas"), { width, height }), context = canvas.getContext("2d");
  context.imageSmoothingQuality = "high"; context.drawImage(image, 0, 0, width, height); return canvasPng(canvas);
}

/** A PNG with an SVG layer (the names) drawn over it. */
async function layerSvg(pngBlob, svgText, width, height) {
  const canvas = Object.assign(document.createElement("canvas"), { width, height }), context = canvas.getContext("2d");
  context.drawImage(await loadImage(pngBlob), 0, 0, width, height);
  context.drawImage(await loadImage(new Blob([svgText], { type: "image/svg+xml" })), 0, 0, width, height);
  return canvasPng(canvas);
}

/** The part of a saved painting (by path) that a smaller map covers, at that map's size. */
async function cropImage(path, crop, parentWidth, width, height) {
  const image = await loadImage(path), scale = image.naturalWidth / parentWidth, canvas = Object.assign(document.createElement("canvas"), { width, height });
  canvas.getContext("2d").drawImage(image, crop.x * scale, crop.y * scale, crop.w * scale, crop.h * scale, 0, 0, width, height);
  return canvasPng(canvas);
}

/** A PNG of several images (blobs) drawn one over another. */
async function stackImages(blobs, width, height) {
  const canvas = Object.assign(document.createElement("canvas"), { width, height }), context = canvas.getContext("2d");
  for (const blob of blobs) context.drawImage(await loadImage(blob), 0, 0, width, height);
  return canvasPng(canvas);
}

/** An image cut to a mask (white = keep), transparent elsewhere. */
async function maskImage(blob, maskSvg, width, height) {
  const canvas = Object.assign(document.createElement("canvas"), { width, height }), context = canvas.getContext("2d");
  context.drawImage(await loadImage(blob), 0, 0, width, height);
  context.globalCompositeOperation = "destination-in";
  context.drawImage(await loadImage(new Blob([maskSvg], { type: "image/svg+xml" })), 0, 0, width, height);
  return canvasPng(canvas);
}

/** Offer a blob as a download. */
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob), link = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
