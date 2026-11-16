# Changelog

## 0.15.1 (2026-11-16)

- The panel is dressed as a scholar's parchment: ink on vellum, a legible old-style serif, rubricated headings, leather buttons, in place of the light-on-dark instrument look. The map keeps its own colours.
- Phones and narrow windows: the window now scrolls, so everything under the map can be reached (swipe on the panel; the map itself still takes touches for turning and zooming).
- The pixel globe fills the whole view; a tall window no longer shows flat blue bars above and below it.

## 0.15.0 (2026-11-16)

- Eym's globe is drawn as pixel art (Tier 2), by rule from the same coastlines, biomes, mountains, rivers and lakes as the surveyed map: the sea in bands by depth, land by biome with a dark coast, the season's snow and sea ice, and day and night with a dithered twilight. Zoom in past 6× and the surveyed (vector) map takes over.
- The polar ice has a ragged, lobed edge that breaks into floes, in place of a perfect circle about each pole; the two poles differ.
- The weather is drawn the same way from the weather simulation: cloud in clumps with lit and shaded edges, rain, snow and lightning under the heavy cloud, cloud shadows on the ground, clear skies under a high, a comma of cloud about a low, and tropical cyclones as spiral bands about an eye. The same world, moment and view always give the same pixels.

## 0.14.2 (2026-11-16)

- The ownership badge that floated above a body (over Eym's globe, and over a star in the system view) is gone everywhere.

## 0.14.1 (2026-11-16)

- System map: names no longer crowd the painted model. A body is named only when it is selected (or focused with the keyboard); hovering still gives its name as a tooltip.

## 0.14.0 (2026-11-16)

- The system map is now the scholars' model of the heavens, in the manner of a Renaissance orrery (`scripts/scholars-model.mjs`). The bodies ride evenly spaced rings in their true order and true directions, so they still turn with the clock, but not at their true distances. The registry keeps the true orbits for the calendar, sky, eclipses and tides.
- Only Eym opens. The four wanderers are shown as wandering stars, with nothing of their true nature in labels or the details card; their surface data stays in the module, hidden. The wandering star Iarn's moon is not shown at all (it cannot be seen without a glass). The ownership badge over the Sun is gone.
- The model is painted in Tier 2 pixel art, drawn by rule in the browser (`scripts/system-sprites.mjs`): an ornate Sun in splendour with a face and sixteen straight and wavy rays, the wanderers as eight-pointed jewelled stars in their own colours, Eym as a small globe, the white and red moons, and rings engraved in gold. Bodies are drawn large; moon names show when zoomed in or selected.
- Map server: a module preview at `/module/` runs the module's own scripts, template, styles and data outside Foundry (for phones, or without a world), on a small stand-in for the parts of Foundry the module uses. Settings are kept in the browser; creating scenes still needs Foundry.

## 0.13.2 (2026-11-16)

- System view: clicking a planet or moon now recenters the camera on it and makes it the pivot for turning and zooming (a short glide). Deselecting, clearing the selection or resetting the view returns to Mictir.

## 0.13.1 (2026-11-16)

- Eym's globe: click anywhere to choose a place. A click on or near a settlement selects it (Dree, for instance); a click on open ground or sea selects that latitude and longitude, shown in the selection card with the nearest settlement and its distance. Either way it becomes the place for the sky view, Here and now, atlas and battle maps, to four decimals (it was one, about 11 km). Fixed: clicks never reached the markers, because the globe captures the pointer to drag it; the globe now picks for them, and a drag never selects.
- A latitude and longitude readout follows the cursor over the globe (more decimals as you zoom in), naming the settlement under it.

## 0.13.0 (2026-11-16)

- Atlas maps: deterministic reference maps of Eym at four levels (planet, continent, region, local) with a text-free base for image models, a name layer, a PNG with names and an information packet with a painterly fantasy art direction (`scripts/eym-reference-map.mjs`, `scripts/eym-map-packet.mjs`).
- Map presets from published standards, adjustable as Foundry settings: atlas image sizes, battle-map grid density (70/100/140/200 px per square) and battle-map size in 5-ft squares (Flip-Mat 24×30, half Flip-Mat, common digital 23×16, Foundry's 40×30, large 40×40) or custom (`scripts/eym-map-presets.mjs`, `scripts/eym-map-settings.mjs`).
- Ground detail (`scripts/eym-local-detail.mjs`): a world-pinned, seeded layer of fields, woods, streams, ponds, marsh, beaches, roads, built-up areas and farmsteads at 10–50 m, shown as a Ground detail tab and PNG on the atlas's local level; and battle sites, which give each 5-ft square of a battle map its cover and height, with trees, bushes, boulders, buildings, streams and roads, for the coming battle-map maker.
- Painted maps: paint a reference map with an image model from inside the module (OpenAI image-edit API first; any OpenAI-compatible server by address), save it as canon to the world's data folder with its name layer, reference and packet, and reopen canon maps from the Atlas maps card. Lower levels use the canon painting above as a style reference. The API key is kept only in the GM's browser; painting controls are GM-only (`scripts/eym-image-provider.mjs`, `scripts/eym-canon.mjs`, `scripts/eym-paint-settings.mjs`).
- Battle maps by rule: a world-pinned 5-ft grid over the ground detail; settings classified from the ground (or chosen, including volcanic) with their own PF2e features; terrain per square (movement, cover, concealment, elevation) changed by snow, mud and frost; towns with streets, walled buildings with doors, gardens and street trees; a design pass for deployment, hazards, contested high ground, cover spacing and balance that never closes the last two routes; a text-free reference and an anchoring prompt for the painter, a tactical overlay and packet for the GM, and Create scene (grid, walls, doors, terrain regions, darkness, weather).
- Map features: a checklist of 45 GM-chosen features in ten groups (sacred places, dungeons and caves, fortifications, camps, town and farm, ruins, water, wilderness, magic, traps), each placed by its own rule within the design rules; traps are hidden on the routes, never painted, and shown only to the GM (overlay, packet, GM-only scene regions) (`scripts/eym-battle-features.mjs`).
- Architecture dossiers: a GM library of how each people builds, in folders, with archive and delete, linked to areas so the right one is picked automatically when a map returns there; it goes into the image prompt for battle maps and region and local atlas maps (`scripts/eym-architecture.mjs`).
- Height on battle maps: inclines from the real ground (20° difficult, 32° greater, 45° climb), flat levels with step, climb and cliff rules, stairs, ramps and ladders, solid tops and canopies for line of sight, a sight report (standing, high ground, flying), height shading and cliffs in the reference, and cliff walls, height regions and open-air regions in the scene (`scripts/eym-battle-terrain.mjs`).
- Fourteen fantastic settings, most reshaping the ground (canyon city, cliffside monastery, lake temple city, sky islands, chasm crossing, planar rift, crystal cavern, dwarven hall, treetop city, giant mushroom forest, necropolis, overgrown ruins, blighted wood, coral shallows), and magic and wonders in the feature checklist.
- Buildings you can enter, floor by floor: deterministic interiors (rooms, doors, windows, stairs, furniture by room) for ground, upper and basement floors; Paint interiors; and Foundry v14 scenes with native Scene Levels — the ground with roofs revealed by sight, upper floors that show the outside but hide the floor below, basements that show nothing outside, and stairs that change level. Scenes on v14 now keep their images on Levels (the Scene has no background of its own there).
- Three-quarter (oblique) view everywhere the painter looks: battle-map references draw roofs over front walls, trees with trunks, rock and quay faces and the sides of everything that stands, north to south; interiors show back walls and furniture fronts; battle, interior and atlas prompts ask for forced perspective and forbid flat symbols.
- The generated maps themselves carry the look: atlas references gain three-quarter-view mountains, hills, trees and settlements; battle references cut corners at 45° where grounds meet, roofs are hipped, terrace and canyon cliffs curve and step, big round things have stepped-circle footprints (an eight-sided tower wall), and island undersides vary.
- Building shapes: L-shaped houses (a back corner left as yard) and 45° cut corners (temples cut all round), with houses facing the street lengthwise; walls, doors, windows and diagonal walls follow the true outline in the grid, the drawing, the interiors (rooms per wing with a door between) and the Foundry scene.
- Map server (`webapp/`): a dependency-free Node web app that renders battle maps as Tier 2 pixel art (traditional RPG style) from the module's own deterministic map, with every layer a multi-floor scene needs, a disk cache, its own page, and a **Render pixel art** button in the module that refuses layers unless the server's geometry fingerprint matches the module's map. A Map server address setting; the server answers Chrome's Private Network Access preflight.
- Light and shadow split between the art and Foundry. Everything that changes with the hour is Foundry's, live: sun direction and cast shadows, darkness, the colour of the light, lamps, weather. The art keeps neutral form light and the shadows objects make of themselves (eaves, beneath tree crowns, contact shadows at the foot of walls, rocks and cliffs, window recesses, wall bases and furniture indoors), plus the season of the trees and grass (`scripts/eym-battle-season.mjs`, `webapp/render/light.mjs`). Scenes now come with Foundry lights on the right floors: door lanterns, window glow, candles and cellar lamps switch on as the scene darkens; hearths, fires, lava, crystals, glowing water, magic and underground braziers always burn. The painter's prompt asks for the same neutral light.
- A city or village chosen by hand is laid out even where the world has open ground.
- Building styles (`scripts/eym-building-styles.mjs`): how a people builds, as numbers the pixel renderer uses: a palette plus choices from shared kits (wall: timbered, brick, stone; roof: tile, slate, flat; windows: casement, sash; chimneys; street paving; street lamps). Most peoples will be a new combination, not new art. A style is linked to places, or a dossier names one ("Pixel-art building style" in the dossier editor), and its words go to the AI painter when the dossier has no text of its own. The first is **Dree** (south Caren): magic-punk Victorian, with red-brown brick terraces in stretcher bond with stone bands between floors, grey slate roofs, white sash windows under stone lintels and sills, green painted doors with fanlights, chimney stacks with copper pots, copper downpipes going to verdigris, granite setts, and iron arc-lamp posts that are Foundry lights (cold crystal light, switching on as the scene darkens). The map server and its page take a style (default: the place's).
- Dree builds top-heavy (`scripts/eym-battle-jetties.mjs`), and it is real in play. A style can now shape the buildings, so it is an input to the map: the module and the map server build with the same style and so the same geometry.
  - **Storeys:** Dree houses are mostly two or three storeys and mostly plain rectangles.
  - **Overhangs:** their upper floors step out over the street, a square on each street side, and a third storey steps out again. The ground floor keeps its footprint. The squares beneath stay walkable street with a ceiling 10 ft up (20 ft under a second step), which gives cover from above and blocks flying up through it, and line of sight is blocked through the slab but clear beneath it. An overhang never covers a building, a tree, a tall feature or water, and open sky stays between facing overhangs.
  - **Skybridges:** enclosed bridges between the first floors of two buildings across a street or yard, one square wide and up to five long, with doors at both ends.
  - **Lifts:** the three-storey houses have a brass-and-crystal lift where the stairs would be (a Foundry change-level region named Lift).
  - **Interiors, scene and painter:** upper floors have their own larger rooms and walls. The scene marks the squares under a ceiling with an Overhead region, and the AI painter is told about the overhangs and bridges.
  - **The pixel art:** each storey's front stands out over the one below, with joist ends and brackets at its foot and the street in deep shade beneath. Bridges rise clear of their shadow on brass trusses. The ground layer shows the shaded street under every overhang and bridge.
- Dree is packed tight and full of visible machinery:
  - **Density:** narrow terraced houses, 3–4 squares a side, stand back to back in blocks of 5–7 squares. Every lot is built, and the gaps between houses are cobbled back alleys rather than yards. Streets are mostly 2–3 abreast, now and then 4, so no street between houses is wider than five squares. Squares, gardens and street trees are rare.
  - **Shared rules:** the machinery comes from the map alone (`styleMachinery`, `scripts/eym-building-styles.mjs`), so the art and the Foundry lights agree.
  - **Outside:** copper boilers bolted to upper-storey fronts like units in a window, each with domed ends, riveted bands, a funnel letting off steam, a gauge, a valve wheel, a pipe elbowing into the wall and a caged fire crystal glowing beneath. Roofs carry riveted water tanks, brass crystal condensers and vent stacks. Copper pipes are slung across lanes 15 ft up.
  - **Inside:** crystal boilers, pipework with valves and gauges, geared presses and aether coils, in kitchens, workshops, studies, cellars and bedrooms.
  - **In play:** each piece has a height, movement and cover, and each glowing crystal (the boilers' fire crystals, the coils and the condensers) is a Foundry light that is always lit.
- The map server runs on Vercel (`vercel.json`, `api/map-server.mjs`): the page as static files, `/api/*` as one function. Layers are stored at native size and enlarged on request (`?size=native` for the native file), so every response stays small; the module fetches native layers and enlarges them in the browser, pixel for pixel. A map's id carries its request, so a cold instance rebuilds a map it never saw, identically. The module's Map server address now defaults to https://eym-planet-map.vercel.app.
- Fixed: the ground layer showed a scrap of roof in the outer triangle of a cut corner; it now shows the ground.
- Fixed: the outer triangle of a building's cut corner drew as indoor floorboards in the pixel art; it now takes the ground of the open square beside it.
- Objects Foundry's lights can be shadowed by: every piece of furniture has a height (a table 2.5 ft, a wardrobe 7, a pillar 10) and every standing feature its own, and scenes encode them for Foundry (`scripts/eym-battle-occluders.mjs`). Foundry v14 walls have no height, so an object becomes a light-blocking wall only where it stands taller than a light near it on its floor: a wardrobe shadows the room's candle, a table does not (it does shadow a hearth's low fire). Objects above eye height (6 ft) block sight too; none block movement or sound. Each such wall carries the object's true base and top in `wall-height` flags, and the scene keeps every object's footprint and height in its flags. Lights sit at real heights on each floor (hearth fire 2 ft, candle 4 ft on the free square nearest the room's middle, cellar lamp 6 ft, door lantern 7 ft). The pixel art gives each piece of furniture its own shading at any hour: a soft contact shadow around its foot that widens with its height, its front darkening toward the floor, a seam under its top, and shelf and door recesses.
- Painted maps: paint a reference map with an image model from inside the module (OpenAI image-edit API first; any OpenAI-compatible server by address), save it as canon to the world's data folder with its name layer, reference and packet, and reopen canon maps from the Atlas maps card. Lower levels use the canon painting above as a style reference. The API key is kept only in the GM's browser; painting controls are GM-only (`scripts/eym-image-provider.mjs`, `scripts/eym-canon.mjs`, `scripts/eym-paint-settings.mjs`).

## 0.12.0 — Eym Planet Map (single-system edition)

- Weather on Eym, to the roadmap's design: deterministic weather systems (lows, highs, tropical waves, seasonal tropical cyclones) on analytic tracks; pressure, wind, cloud, rain/sleet/snow, thunderstorms and temperature at any place and time; snow cover, ground wetness and flooding reconstructed over the previous 168 hours in 3-hour steps; rainfall calibrated to the climate by latitude (`tools/calibrate-eym-weather.mjs`, `npm run weather:calibrate`). Shown on the globe (cloud and rain fields, highs and lows, cyclones, floods, optional wind), in the Here and now card and the sky readout, and as a cloud veil over the ground view's sky.
- Day, night and the seasons on Eym: the globe shows the real terminator and twilight bands, and seasonal snow and sea ice, all following the campaign clock. A "Here and now" card (and the sky readout) gives a place's season, sun time, sunrise and sunset, day length and temperature. Filled shapes that run behind the globe's edge are now closed along the edge, so polar ice and large regions fill correctly. Eym's poles are a little colder, so the Arctic keeps some ice in summer.
- Names: the sun is **Mitkear**; the moons are **Austarm** (white) and **Chatarm** (red); the wandering planets, largest to smallest, are **Iarn**, **Esonth**, **Bruthi** and **Lilta** (registry names unchanged; display names in `scripts/display-names.mjs`).
- Calendar: tied to the seasons (the March equinox, found from the astronomy model, falls at noon on 20 March). The campaign and the clock start on Sunday, 14 March, year 50, at 08:00. Orbital elements keep their internal anchor instant.
- Garyk moved to three weeks by steamer from Caren (Pouk to Garyk's south-east port, 9 knots): it now lies west-north-west of Caren, centered 15°N, 79.8°W.
- README: a short history of Eym's peoples.
- Eym's new surface: five continents in a planet-wide ocean (98.6% water), replacing the archipelago canon. **Caren** (590,000 sq mi, 1.53 million km²) and **Garyk** (four fifths of that) are traced from their source maps by `tools/trace-eym-continents.py`, keeping their coastlines, islands, lakes, rivers, mountains and forests. Caren straddles the equator; Garyk lies west-north-west of it (see below). A larger continent lies to the east and two smaller, colder ones lie far to the north and south; these three, their offshore islands and ten open-ocean archipelagos are seeded deterministically (`scripts/eym-surface.mjs`, layout and seed in `EYM_LAYOUT`). Caren's 81 settlements and 39 named features (nations, lakes, rivers, ranges, forests) come from its map; Garyk's 51 settlements keep their realm colours but are unnamed. The seeded continents have placeholder names.
- Eym's cartography is built by `scripts/eym-cartography.mjs`: Earth-like climate (wet equator, dry subtropics, rain shadows), 1° biomes clipped to vector coastlines, routed rivers and basin lakes on the seeded continents, and forest, upland, mountain and peak overlays at 6–10 km. The globe draws land from the coastlines, zooms to 30× on worlds with vector coasts, and its land layer now grows with zoom instead of staying clipped to the starting disc.
- Ground view: from Eym's surface map, pick a spot (or click a place) and **Look up from here** to see the sky over that spot at the campaign date and time. It shows the stars down to the naked-eye limit for the sky's brightness (daylight, civil/nautical/astronomical twilight, moonlight, haze near the horizon), the 22 named stars, constellation lines and names (toggles), the four wandering planets, both moons with their phases, earthshine-dark sides and eclipse shading, and the Sun with any solar eclipse drawn to scale. The moons can show by day, as Earth's Moon does. The view follows the campaign clock; drag to turn, wheel to zoom, double-click to reset. New `scripts/ground-sky.mjs` (sky model) and `scripts/sky-view.mjs` (renderer); the registry gains a `geometric_albedo` column for planet and moon brightness.
- Named stars: the 21 brightest stars plus Cynosure (22, in `namedStars`), in plain English apart from Pulura, Ketephys and Ashava (Pathfinder 2e canon gods of the night sky).
- Pole star: Cynosure (Pathfinder canon's North Star), magnitude 1.4 and 0.7° from Eym's north celestial pole, pinned at the waist of the re-sculpted Hourglass. No southern pole star, as on Earth.
- Only four planets besides Eym remain, the four brightest wandering stars of Eym's sky (Thraximundus, Tribune, Kandahar, Ramses); Cataphract, Sumatra and Ventus were removed (Sumatra peaks at magnitude −0.3, Cataphract never leaves the twilight 30° from the Sun, Ventus is invisible to the eye).
- Sky: 13 more constellations sculpted from spare stars (80 of 2,000 stars nudged a median 2.3°; the original 35 and the asterisms unchanged), for 48 in all, 24 per hemisphere; 28 lunar mansions along the path of the sun, each with a determinative star.
- Moons: the White Moon (radius 1,760 km, eccentricity 0.055) now gives both total and annular solar eclipses; the Red Moon is inclined 10° so it eclipses only near its nodes; both moons' nodes regress and periapses advance like Earth's Moon's. New moon-event model and almanac: phases, double full and double dark, solar and lunar eclipses, occultations of the White Moon by the Red, and tides that match Earth's on average.
- The star is now a twin of Earth's Sun (G2V) and Eym an Earth twin at 1 AU (Earth's radius, mass, gravity, 23.44° tilt with precession and obliquity metadata, eccentricity 0.0167, Earth-like magnetic field). Every heliocentric orbit was scaled by 1/0.68 so the system keeps its architecture; periods follow Kepler. Surface water and continents are unchanged pending the reseed.
- Eym's year is exactly 350 days of 24 hours, so an Eym second is 1.0435 SI seconds; registry days and hours are now Eym units.
- Added Eym's White Moon (sets the 28-day month) and Red Moon, with Earth-like average tides, Hill-stable non-resonant orbits, and occasional double full moons.
- Removed all artificial objects: Vada Anchorage, the Thornwatch Array and Thornfield (and with them every superstructure identity).
- The clock now uses Eym's calendar: twelve Gregorian-named 28-day months plus the 14-day Year's End holiday; every month starts on a Monday. The timeline epoch keeps its date (3 September 5016, 10:38), now a Wednesday.
- Renamed the module to `eym-planet-map` (id, title, window id, CSS namespace, scene-control button and language key), so it installs alongside the original module. Manifest and download URLs point at the Eym-Planet-Map repository's releases; the release workflow packages `eym-planet-map-v<version>.zip` and requires only files that exist.
- Removed the leftover Thebes/Jinyara body texture from `assets/`.
- Targets the Pathfinder Second Edition system (`pf2e` 7.0+) instead of LANCER, on Foundry v13 (verified) through v14. The System Map button moved to the Token controls, which exist in both v13 and v14; Foundry v14 removed the measured-template controls it used to join.

- The map opens on the Abydos system and treats it as the outermost level; the cluster view and its breadcrumb are removed.
- Removed the other nine systems: their registry rows, planetary cartography and geography, operational surveys, epoch orientations, superstructure identities and reference sheets; the Thebes/Jinyara surface-art intake; the cluster view, cluster coordinates and faction-territory volumes; and the one-off migration tools written against the ten-system data. Abydos data is byte-identical to before.
- Validators and generators now expect the Abydos inventory (13 registry rows, 4 cartographic worlds, 8 operational bodies, 2 superstructures).
- Astral travel (routes, voyages, ship marker, navigation profile, shipboard clock) is commented out in place as dormant code; one campaign clock remains.
- Added a fixed night sky: 2,000 deterministic naked-eye stars, the galactic band and a distant sister galaxy behind the system view.
- On screen, Abydos (the star) is now the Sun, Eventide is Eym, and the system is The Sun. These are display names only; canonical registry names remain the data keys.
- Added Eym's constellations: 35 named stick figures and 4 asterisms found in the star catalogue and named in plain English (proper names from Pathfinder 2e canon deities where the figure matches a deity's favored weapon or symbol: Erastil's Bow, Iomedae's Sword, Gozreh's Trident, Cayden's Tankard, Irori's Belt; the galactic band is Desna's Path), with hemisphere, chief/lesser tier and path-of-the-sun order. `scripts/sky-frame.mjs` defines Eym's celestial pole (21° tilt toward its season-phase direction) for these and the coming ground view.

## 0.8.1

- Moved solver-derived speed-cap and braking/thrust-flip dots into a dedicated upper SVG layer so endpoint system/body markers cannot obscure them.
- Increased transition dots from 4 px to 6.5 px radius with dark outlines and restrained green/red glow while preserving their exact solved route positions.

## 0.8.0

- Added an authoritative-GM-only draggable ship control constrained to the selected route rail.
- Converted dragged spatial position through the inverse solved relativistic trajectory so proper time, reference time, velocity, phase, and ship position remain one deterministic state.
- Allowed bidirectional GM timeline scrubbing, including restoring an earlier point after arrival, while players remain read-only.

## 0.7.1

- Rendered the active party-vessel triangle in a dedicated top SVG layer so it remains visible over its origin marker during the visually negligible opening portion of a voyage.

## 0.7.0

- Split campaign chronology into visible Cradle reference-frame and shipboard proper-time clocks while preserving offline pause semantics and authoritative-GM persistence.
- Added GM-engaged deterministic voyages with immutable departure profiles, live velocity/phase readouts, arrival clamping, abort support, and permanent relativistic clock divergence.
- Added solver-derived green speed-cap and red braking/thrust-flip route markers plus a trajectory-correct triangular party-vessel marker at cluster and system scales.
- Added analytical trajectory evaluation and deterministic tests for clock advancement, voyage persistence, phase transitions, marker agreement, authority, and post-arrival offsets.

## v0.6.1

- Propagated the existing faction emblems into system view, anchored above each system's canonical star or binary-star midpoint.
- Added the controlling faction emblem above every entered planet, moon, station, ship, fleet, belt, megastructure and other body-level view.
- Resolved system and body emblems from canonical `owner_faction` metadata rather than inferred territory geometry, preserving Mandate control of Seti and Conclave control of only Memphis and Nekhen.
- Kept all propagated emblems screen-upright, constant-size and non-interactive across rotation and zoom.

## v0.6.0

- Added accepted deterministic local operational surveys for all 71 eligible non-cartographic canonical objects, including the canonically present Arrowfall Range distributed installation field.
- Added named craters, basins, ridges, volatile fields, mines, habitats, landing fields, hazards and traverse routes to barren/marginal natural bodies without promoting them into Earthlike worlds.
- Added atmospheric bands, storms, vortices, radiation zones and sampling corridors to gas/ice giants without inventing solid traversable surfaces.
- Added reference-epoch mapped asteroid samples, resource claims, processing clusters, debris hazards and traffic corridors while preserving belt centroids as distributed regions rather than literal asteroids.
- Added inspectable superstructure surveys for stations, installations, yards, vessels, fleets, Akhetan, megastructures and Thornfield, including docks, modules, approaches, structural segments, formation elements and uncertainty/exclusion volumes.
- Added culture-aware deterministic local names, stable feature IDs, permanent seeds, canonical-row fingerprints and explicit coordinate-frame/geometry-status declarations.
- Added adaptive operational survey layers and zoom-dependent mobile-safe SVG LOD while preserving all existing cluster/system navigation and the 43 accepted inhabited-world cartography assets.
- Added exact-regeneration, coverage, coordinate/reference, special-world, packaging and performance validation for the body-operation corpus.
- Bumped Foundry/package release metadata and archive URL to v0.6.0.

## v0.5.0

- Added accepted high-resolution deterministic cartography for all 43 inhabited terrestrial worlds.
- Added smooth coastlines, terrain meshes, contours, routed hydrology, ecoregions, soils, resource provinces, settlements, and exact transport geometry.
- Added culture-aware permanent gazetteers and city/route names for every controlling polity.
- Added zoom-dependent SVG cartography to the existing orbital body viewer while retaining mobile gestures and outward navigation.

## v0.4.0

- Replaced placeholder non-habitable body discs with deterministic metadata-driven SVG renderers.
- Added cratered, icy, volatile-rich and mineral-bearing moon/minor-world surfaces plus banded gas giants and storm systems.
- Added substantive station, ring-station, shipyard, vessel, fleet, blinkgate, tether/ring megastructure and anomaly silhouettes.
- Added asteroid-belt fly-through views without treating distributed belt centroids as route endpoints.
- Structure color accents now follow canonical visual palettes, and docking approaches remain inspectable.
- Hid planetary survey-layer controls when viewing ships, stations and other non-geographic bodies.

## v0.3.1

- Fixed Forge orbital-body views failing to load because the v0.3.0 release archive omitted `data/planet-geography`.
- Added release-package checks for the geography manifest and representative Sais world assets.

## v0.3.0

- Added a third orbital/body zoom level for terrestrial planets, moons, dwarf worlds, giants, stations, shipyards, vessels, fleets, blinkgates, megastructures, and anomalies.
- Added gesture-safe cluster → system → body navigation with double-click/double-tap, selected-object inward zoom, outward-zoom return, and explicit breadcrumbs.
- Materialized deterministic accepted-working-canon surface geometry for all 43 inhabited terrestrial worlds from the canonical CSV metadata and permanent seeds.
- Added tectonic plates, elevation and sea-level fitting, climate, rainfall, rivers, lakes, biomes, soils, resource provinces, settlement sites, capitals, and transport corridors.
- Added inspectable orbital survey layers and distinct natural/artificial approach presentation contracts.
- Preserved the canonical object registry byte-for-byte and added exact-regeneration, coverage, interaction, and asset-budget validation; 64 tests now pass.

## v0.2.0

- Added interactive three-dimensional system views for all ten major systems, generated from the canonical system-object registry.
- Double-click/double-tap or zoom into a selected cluster system to enter it; zoom outward or use the explicit cluster-back control to return.
- Added schematic stars, planets, moons, giants, stations, shipyards, vessels, fleets, belts, installations, blinkgates, and anomalies.
- Added hierarchical physical reference-epoch coordinates with parent-relative AU/km conversion and separate compressed display coordinates.
- Added physical point-to-point local navigation using the existing relativistic solver, with useful km, million-km, AU, seconds, and minutes formatting.
- Added system object details, inclined orbital paths, belt-region rendering, touch targets, keyboard selection, and cluster-only overlay suppression.
- Added deterministic tests across all ten systems and all 126 catalogued objects.
- Expanded the canonical inhabited-world registry with deterministic physical-geography, ecology, resource, and settlement metadata for 43 terrestrial worlds.

## v0.1.8

- Reworked faction-to-faction borders into genuinely three-dimensional frontier surfaces instead of carrying one XY seam straight through the depth axis.
- Territorial footprints are now lofted through multiple Z slices, allowing a shared border to wander laterally as depth changes: one polity can bulge into a region at one depth while its neighbor regains that space at another.
- The lateral deformation field is shared across factions, so adjacent territories move along the same seam rather than developing arbitrary cracks between independently randomized borders.
- The original 2D faction-control map remains the exact Z=0 cross-section, preserving the established campaign-map topology.
- Lateral warping fades to zero at the cluster-box exterior and is strongly suppressed around every Big Ten system, keeping inhabited systems as hard political anchors.
- Added deterministic tests for lofted side surfaces, changing seam position across depth, Z=0 map preservation, Big Ten anchor stability, and system containment in warped 3D cross-sections.

## v0.1.7

- Reworked faction-control volumes so the inferred Z dimension is no longer a constant flat extrusion.
- Front and rear depth boundaries now vary smoothly across each faction footprint, allowing territorial influence to bulge forward in some regions and recede in others.
- The front and rear surfaces use independent depth variation, so territories can shift and taper rather than simply becoming uniformly thicker or thinner.
- Political-system locations remain hard anchor regions: depth warping is smoothly suppressed around each faction's owned Big Ten systems so those systems remain securely inside their established territory.
- Grayspace receives the strongest unconstrained depth variation, helping the unclaimed region read as an irregular volume rather than another fitted block.
- Added deterministic tests for non-flat front/rear depth boundaries and anchor-system containment.

## v0.1.6

- Added a compact route-travel HUD directly over the upper-right corner of the 3D cluster view.
- The HUD appears only after two systems are selected and stays visible while the cube rotates.
- It shows origin → destination, true 3D distance, cluster/reference-frame elapsed time, and shipboard/subjective elapsed time.
- Added the current acceleration/cruise profile as a compact footer so the time assumptions remain visible.
- Added responsive mobile sizing and made the HUD non-interactive so it cannot block star taps or rotation gestures.
- Added deterministic tests for HUD fields, visibility wiring, and upper-right mobile overlay behavior.

## v0.1.5

- Added upright screen-space SVG emblems above each faction capital system.
- Capital assignments: Eventide/Abydos, XUANJIA Mandate/Sais, Adainian Conclave/Nekhen, Signatories of the Accords Paramount/Saqqara, and Union/Amarna.
- Added simplified map glyphs based on the established faction flag designs: Eventide enclosed sunrise, Mandate Fivefold Lotus, Conclave eclipsed sun, Accords Bound Star, and Union three-bars mark.
- Capital emblems follow their projected star positions while remaining visually north-up and constant-size as the 3D cube rotates and zooms.
- Added non-interactive leader lines so capital symbols remain clearly associated with their systems without interfering with star selection.
- Added deterministic tests for all five capital assignments and system references.

## v0.1.4

- Extrapolated the 2D Manger faction-control map into approximate three-dimensional territorial volumes.
- Added very faint translucent control fields for Union, the Signatories of the Accords, XUANJIA Mandate, Adainian Conclave, Eventide, and Grayspace.
- Territorial footprints preserve the source map's broad borders and adjacency while inferred Z-depth scales with each region's planar dimensions.
- The faction volumes rotate and zoom with the cluster while remaining behind the white lattice, stars, and route line.
- Added a compact territorial-control legend and explicit note that Z boundaries are approximate rather than surveyed.
- Added deterministic tests for faction-volume structure and Big Ten placement against the 2D control map.

## v0.1.3

- Added canonical stellar configuration, spectral type, and visible-color metadata for all Big Ten systems.
- Star markers now use system-specific stellar colors instead of a universal white marker.
- Memphis is rendered as its anomalous viridian-green K1V star with a pale green-white core.
- Tanis is rendered as a close binary with a larger golden-yellow G8V primary and a smaller orange K4V secondary.
- Route-selection highlighting now uses an outer ring so selecting a system no longer overwrites its stellar color.
- Added hover/title metadata for stellar classifications and visible-color descriptions.

## v0.1.2

- Moved the Cluster Map launcher from Token Controls to Measurement Controls.
- The map button now appears last in the measurement tool palette, directly beneath Clear Templates for GMs and as the last visible measurement tool for players.
- Changed the launcher icon to a map icon and shortened the tooltip to "Cluster Map".

## v0.1.1

- Initial Forge/Foundry VTT 13 release.
- Interactive 3D SVG cluster view with ten Orphaned Sun systems.
- Mouse and mobile controls: drag/one-finger rotate, wheel/pinch zoom, click/tap route selection.
- Relativistic route calculator using configurable proper acceleration and cruise speed.
