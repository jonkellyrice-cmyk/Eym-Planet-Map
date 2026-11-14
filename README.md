# Eym Planet Map

A Foundry VTT v13 module: an interactive three-dimensional SVG map of a single star system (currently the **Abydos** system), with orbital, planetary-surface and local operational views. It is a single-system edition of the Orphaned Sun Cluster Map, being retooled for a fantasy campaign.

On screen the system is called **The Sun**: its star is the **Sun** and Eventide is **Eym** (display names in `scripts/display-names.mjs`; the registry keeps the canonical names Abydos and Eventide because data files and seeds are keyed by them).

The module id is `eym-planet-map`, so it installs alongside the original Orphaned Sun Cluster Map without conflict.

## Features

- An interactive AU-scale map of all 9 objects of the Sun's system (the Sun, Eym, the four other planets, Eym's White and Red Moons, and Tribune's moon Enoch), keeping physical hierarchical coordinates separate from compressed display coordinates.
- The system is the outermost level: double-click/double-tap or zoom inward from system → body, with a breadcrumb back to the system; zooming out stops at the system.
- A fixed night sky around the system: 2,000 naked-eye stars, the galactic band and a distant sister galaxy, drawn inside-looking-out behind the system view and turning with the camera (see `tools/generate-starfield.mjs`).
- 48 named constellations (24 per hemisphere: 35 discovered in the generated stars plus 13 sculpted by nudging spare stars; 7 chief constellations per hemisphere; 8 on the path of the sun, in order), 4 asterisms and 28 lunar mansions, in plain English with Pathfinder 2e canon deity names where a figure matches a deity's symbol or favored weapon. Stored as star-to-star line data in `data/stellar/constellations.json` (see `tools/constellation-canon.mjs`, `tools/sculpt-constellations.mjs` and `tools/generate-constellations.mjs`).
- Four inhabited terrestrial worlds (Ramses, Eventide, Thraximundus, Kandahar) with accepted deterministic 2° cartography: coastlines, elevation/contours, hydrology, ecoregions, soils, resources, settlements, permanent cultural gazetteers, and transport geometry.
- Four non-cartographic natural bodies with accepted deterministic local surveys (the three moons and the gas giant Tribune).
- Culture-aware permanent names (Vadan for Abydos; the Aurethic, Vostrann, Xuānhari and Union naming cultures remain available for new systems).
- Zoom-dependent SVG level of detail keeps orbital, regional, and close inspection useful on desktop and mobile without unbounded DOM growth.
- Desktop: drag to rotate, mouse wheel to zoom, double-click empty space to reset the camera. Mobile/touch: one-finger drag rotates; pinch zooms.
- One campaign clock in Eym's calendar (play/pause, step, set date and time). System views resolve deterministic Keplerian planet/moon positions and body rotations from it on demand; no frame-by-frame astronomy simulation runs.
- No runtime third-party libraries or CDN calls.

## Eym and its sky

- **The Sun** is a twin of Earth's Sun (G2V, 1 solar mass and luminosity).
- **Eym** is an Earth twin: 1 AU, Earth's radius, mass and gravity, 23.44° tilt (precessing every ~25,772 years; obliquity rocking 22.1°–24.5° over ~41,000 years), eccentricity 0.0167 and an Earth-like magnetic field. Its surface water and continents are due to be reseeded.
- **Time.** Eym's year is exactly 350 days of 24 hours × 60 minutes × 60 seconds. Because Eym's year is as long as Earth's, each Eym second is 1.0435 SI seconds; every day and hour value in the registry is in Eym units.
- **Calendar.** Twelve months with Gregorian names, each exactly 28 days (4 weeks), then the 14-day **Year's End** holiday (month 13 in the clock's date inputs). Every month and every year begins on a Monday.
- **Moons.** The **White Moon** (382,029 km, 0.50° across) has phases that repeat every 28 days and set the month. The **Red Moon** (195,000 km, 0.40° across) cycles every 9.77 days, so the two are only full together roughly every 7½ months. Their combined tides equal Earth's on average: great tides (~1.35×) when they line up, slack tides (~0.4×) when they are 90° apart.
- **Moon events.** `scripts/moon-events.mjs` computes phases, double full moons and double dark nights (both within 12 hours, about every 9 months), solar eclipses (the White Moon's are total or annular like Earth's Moon's; the Red Moon is too small to cover the Sun), lunar eclipses, the Red Moon passing in front of the White Moon, and combined tides. Both moons' nodes regress and periapses advance like Earth's Moon's, so eclipse seasons drift through the calendar. `npm run moons:almanac -- 5017` lists a year's events with the lunar mansion each falls in.
- **The pole star.** Cynosure (Golarion's North Star in Pathfinder canon, home of Desna's palace) stands 0.7° from Eym's north celestial pole at magnitude 1.4, at the waist of the Hourglass, which turns around it through the night. Like Earth, Eym has no bright southern pole star; the Bell hangs around the south pole.
- **The wandering stars.** Besides Eym there are exactly four planets, all naked-eye wanderers: Thraximundus (brightest about magnitude −6.7, the next world out), Tribune (gas giant, −5.9), Kandahar (−3.6) and Ramses (an inner world seen as a morning or evening star, −3.5). Fainter worlds (Cataphract, Sumatra, Ventus) were removed.
- **The other worlds** keep their original architecture: every orbit was scaled by 1/0.68 when the star changed, and periods follow Kepler's third law.

**Astral travel (dormant).** Routes, relativistic voyages, the ship marker, the navigation profile and the second (shipboard proper time) clock are commented out in place, marked `ASTRAL TRAVEL (dormant)`, so they can be revived later.

## Data

`docs/system-orbital-distances.csv` is the canonical object registry. Accepted detail lives beside it: planetary cartography under `data/planet-cartography/` and `data/planet-geography/`, local operational surveys under `data/body-operations/`, epoch orientations under `data/astronomy/`, superstructure identities in `data/superstructure-identities.json`, and the night sky under `data/stellar/`. `exports/` holds the frozen reference-sheet bundle derived from them.

Every generated asset records its permanent seed, model version and source fingerprint, and regenerates byte-for-byte.

## Installing from a manifest

In Foundry, install the module with this manifest URL:

`https://github.com/jonkellyrice-cmyk/Eym-Planet-Map/releases/latest/download/module.json`

That URL resolves once a GitHub release exists. Releases are built by `.github/workflows/release.yml` when a commit whose message contains `[release]` is pushed to `main`; it packages `eym-planet-map-v<version>.zip` and attaches it with `module.json`.

## Compatibility

- Game system: **Pathfinder Second Edition** (`pf2e`) **7.0+**. Nothing in the module depends on PF2e rules; the system is declared so it is offered in PF2e worlds.
- Foundry VTT: **13** (verified) and **14** (allowed, not yet verified in a live world). PF2e 7.x runs on Foundry v13 and PF2e 8.x on Foundry v14.
- The **System Map** button sits in the Token controls, where it exists on both Foundry v13 and v14 (v14 replaced measured templates with Regions).

## Development / local install

Copy this folder into:

`{Foundry user data}/Data/modules/eym-planet-map/`

Restart Foundry, enable the module, then use the **System Map** button in the Token controls. It may also be opened from the browser console or a macro:

```js
game.modules.get("eym-planet-map").api.open();
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
npm run constellations:check
npm run moons:almanac -- 5017
```

## Coordinate model

System navigation retains the established physical coordinate model. Operational assets explicitly declare whether their geometry is physical, a physical reference-epoch snapshot, a constrained estimate, or an uncertain observation volume. Belt layouts are reference-epoch snapshots; anomalies remain observational/uncertain; gas giants use atmospheric coordinates rather than a fictitious solid surface. The night sky uses the same system frame. See `docs/IMPLEMENTATION_NOTES.md`.
