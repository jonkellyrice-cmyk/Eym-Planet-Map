# Eym Planet Map

A Foundry VTT v13 module: an interactive three-dimensional SVG map of a single star system (currently the **Abydos** system), with orbital, planetary-surface and local operational views. It is a single-system edition of the Orphaned Sun Cluster Map, being retooled for a fantasy campaign.

The module id is still `orphaned-sun-cluster-map`, so it cannot be installed alongside the original module.

## Features

- An interactive AU-scale system map of all 13 canonical Abydos objects (star, planets, moon, giants, station, installation array, anomaly region), keeping physical hierarchical coordinates separate from compressed display coordinates.
- The system is the outermost level: double-click/double-tap or zoom inward from system → body, with a breadcrumb back to the system; zooming out stops at the system.
- A fixed night sky around the system: 2,000 naked-eye stars, the galactic band and a distant sister galaxy, drawn inside-looking-out behind the system view and turning with the camera (see `tools/generate-starfield.mjs`).
- Four inhabited terrestrial worlds (Ramses, Eventide, Thraximundus, Kandahar) with accepted deterministic 2° cartography: coastlines, elevation/contours, hydrology, ecoregions, soils, resources, settlements, permanent cultural gazetteers, and transport geometry.
- Eight non-cartographic bodies and orbital structures with accepted deterministic local operational surveys (barren worlds, moon, giants, station, installation array, anomaly region).
- Culture-aware permanent names (Vadan for Abydos; the Aurethic, Vostrann, Xuānhari and Union naming cultures remain available for new systems).
- Zoom-dependent SVG level of detail keeps orbital, regional, and close inspection useful on desktop and mobile without unbounded DOM growth.
- Desktop: drag to rotate, mouse wheel to zoom, double-click empty space to reset the camera. Mobile/touch: one-finger drag rotates; pinch zooms.
- One campaign clock (play/pause, step, set date and time). System views resolve deterministic Keplerian planet/moon positions and body rotations from it on demand; no frame-by-frame astronomy simulation runs.
- No runtime third-party libraries or CDN calls.

**Astral travel (dormant).** Routes, relativistic voyages, the ship marker, the navigation profile and the second (shipboard proper time) clock are commented out in place, marked `ASTRAL TRAVEL (dormant)`, so they can be revived later.

## Data

`docs/system-orbital-distances.csv` is the canonical object registry. Accepted detail lives beside it: planetary cartography under `data/planet-cartography/` and `data/planet-geography/`, local operational surveys under `data/body-operations/`, epoch orientations under `data/astronomy/`, superstructure identities in `data/superstructure-identities.json`, and the night sky under `data/stellar/`. `exports/` holds the frozen reference-sheet bundle derived from them.

Every generated asset records its permanent seed, model version and source fingerprint, and regenerates byte-for-byte.

## Compatibility

- Foundry VTT: **13**
- LANCER system: **3.1.3+**

## Development / local install

Copy this folder into:

`{Foundry user data}/Data/modules/orphaned-sun-cluster-map/`

Restart Foundry, enable the module, then use the **System Map** button in the Measurement controls. It may also be opened from the browser console or a macro:

```js
game.modules.get("orphaned-sun-cluster-map").api.open();
```

Run the complete deterministic suite with:

```bash
npm test
```

Generated canon can also be audited directly:

```bash
npm run body-operations:validate
npm run body-operations:check
npm run astronomy:check
npm run astronomy:validate
npm run atlas:snapshot:check
npm run starfield:check
```

## Coordinate model

System navigation retains the established physical coordinate model. Operational assets explicitly declare whether their geometry is physical, a physical reference-epoch snapshot, a constrained estimate, or an uncertain observation volume. Belt layouts are reference-epoch snapshots; anomalies remain observational/uncertain; gas giants use atmospheric coordinates rather than a fictitious solid surface. The night sky uses the same system frame. See `docs/IMPLEMENTATION_NOTES.md`.
