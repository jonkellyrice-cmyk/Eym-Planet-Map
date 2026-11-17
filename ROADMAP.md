# Roadmap

This roadmap was carried over from the Lancer GM Kit and Lancer cluster map, and most of it still applies to Eym. The table gives each item's status as recorded there, then where it stands in this repository now. The weather design below it was agreed on 3 September 2026.

## Where we are and what is left (17 November 2026, version 0.16.4)

This section is the current plan. The sections below it are the earlier agreements it builds on.

### Scope of detail (owner's decision, 17 November 2026)

This overrides anything below that plans for all five continents.

- **Only Caren, Garyk and the sea directly between them** get more detail or deeper zoom: the Continent, Region and Local layers are made and stored for that area alone.
- **Gaffa, Khohalis and Demani** (named 17 November 2026; ids eastern, northern and southern) stay exactly as they are now: no further detail, no deeper zoom, no stored tiles.
- **The rest of the ocean** stays as it is now too, including the island groups that belong to no continent.
- The point is to cut rendering a great deal. Nothing outside that area is rendered or stored. Outside it, zoom stops where it does today.
- Caren's and Garyk's frames hold only their own mainland and their own islands. The sea between them has a frame of its own: a corridor 600 km wide along the shortest line between their coasts (owner's choice, 17 November 2026: the narrow sea-route corridor, not the whole basin). It is all open sea; no ocean tile is stored until the sea gets detail of its own.

### Owner's decisions and order (17 November 2026, later the same day)

These override anything below where they differ.

- **The System view is finished** at tier 2. No further work on it; it is not in any tier trial.
- **Tier 2 everywhere first.** Continent, Region and Local are made at the current tier-2 pixel art; the owner then judges each layer side by side and decides which need a higher tier. No tier-3-or-higher work on any layer until then. Later, probably: the globe to tier 3 at most (it is redrawn live on the phone; tier 3 would mean softer layered clouds, relief shading and graded shallows); the sky higher, since it is cheap. Both wait for the side-by-side.
- **Detail only for Caren, Garyk and the ocean between them**, as above.
- **Order of work:**
  1. *(Done, 0.16.4.)* Finish Region step 1: rivers (done, 0.16.3); long straight roads, faint hills, sparse farmland, octagonal shore bands (0.16.4). Renders shown to the owner.
  2. *(Done, 17 November 2026: run once on `eym-world` with the owner's yes and checked read-only; merged in #26.)* The `eym_tiles` frame-column migration: the SQL file shown at a named commit; nothing runs before the owner's yes.
  3. *(Done, 17 November 2026: 392 Caren and 437 Garyk land tiles kept under `eym-region-layer-v2`, plus 40 coast and island tiles in the strait corridor; no errors.)* Render the 829 land tiles into the store and report what was kept.
  4. *(Done: 0.16.5, then tier 4–5 in 0.16.6.)* Night-sky legibility (a release), before any higher tier: text sized in screen pixels (about 12–13 px for star and body names, 11–12 px for constellations; on a phone the 900-unit chart is scaled to about 0.4×, so names now come out at 4–6 px); the lower-priority label hidden where two overlap; a darker, calmer sky with little or no dither in its middle, a higher minimum brightness for faint stars, solid brighter gold constellation lines and a softer Desna's Path; one art pixel at a constant on-screen size (about 2 CSS px) on every device, and clearly visible stars at least 2×2. Phone-sized renders shown before submitting.
  5. Globe fixes (owner 2026-11-17: folded into Stage 1 of the physical history and climate programme, item 6; not a release of their own): the vertical dotted streaks in the ocean around Caren at deep zoom; labels in the panel's serif, hidden where they would overlap (Gowain, Caren and Lyle pile up); the H and L pressure letters off by default, behind the weather toggle; sea ice and cloud in clearly different colours.
  6. *Eym's physical history and climate*, Stages 1–6 (see that section below), each stage its own pull request, with renders shown before submitting. The globe fixes (item 5) go into Stage 1. This comes before the globe's tier-3 work and the side-by-side.
  7. The Continent layer at tier 2 (Caren and Garyk, two pictures; no tier-2 renderer for it exists yet), then the Local layer at tier 2 for sample places only (Dree, a coast, mountains, farmland, forest), then the side-by-side for the owner's judgement.

### Done

- **System view**: finished at tier 2 (owner's decision, 17 November 2026). Pixel sprites for the Sun, worlds, moons and wanderers; every body in its orbit; tap a body to name it; double-tap Eym to open its map; no ownership badges. No further art or detail work.
- **Eym's globe**: pixel art at every zoom up to 30× (`scripts/eym-globe-pixels.mjs`), drawn by rule, with weather, day and night, seasonal snow and ragged sea ice; cached and drawn at half sharpness while moving.
- **Night sky**: a pixel-art star chart (`scripts/eym-sky-pixels.mjs`) with pan, magnify and tap-to-name.
- **Panel**: parchment styling and a serif face (`styles/parchment.css`); the panel scrolls on phones; a pinch on the map never zooms the page (`scripts/zoom-guard.mjs`).
- **Atlas maps, painted maps, battle maps** (tier 2 pixel art from the map server, interiors, floors, Foundry scenes): see the sections below and the README.
- **Rivers** (0.16.3): Caren's and Garyk's river channels, 5 to 40 km wide in the traced maps, are drawn as rivers 114 m to 1.2 km wide on the Region layer, the ground detail and battle maps (`scripts/eym-river-courses.mjs`).
- **Region step 1** (0.16.4): roads follow the land; hills, hinterland farmland and smooth shore bands on the Region layer.
- **Stored layers, first slice**: the Region layer's generator (`scripts/eym-region-layer.mjs`: shapes first, then a flat check picture, then pixel art) and its store (`webapp/region-store.mjs`: Supabase project `eym-world`, buckets `eym-tiles` and `eym-shapes`, tables `eym_tiles` and `eym_render_runs`). One Caren tile has been made, kept and served back from the store.

### The layers and their intended pixel-art tier

Every layer is made at tier 2 first; the intended tiers below are provisional until the owner's side-by-side (see the order above). Cheap layers (few pictures) can afford a high tier; layers with very many tiles cannot. The System view is finished and is not part of the trial.

| Layer | What it is | Where it is made | Stored | Intended tier | State |
|---|---|---|---|---|---|
| System | The model of the heavens | Module, live | No | — | Done at tier 2; no further work |
| Night sky | The dome from a place and time | Module, live | No | 4–5 | Tier 4–5 (0.16.6): see the sky's tier below |
| Planet | Eym's globe | Module, live | No | 3 at most | Tier 2 done |
| Continent | One picture each for Caren and Garyk (two) | Map server, once | Yes | 5 | Not started |
| Region | 76.8 km tiles at 0.3 km a cell: Caren, Garyk and the sea between | Map server, once | Yes | 3 | Generator, store and step 1 done; layer not rendered |
| Local | Ground detail at 10–50 m: Caren and Garyk | Map server, once | Yes | 2 | Generator exists but is slow; not rendered |
| Battle map | 5-ft squares at one place and time | Map server, on request | Per map | 5 | Tier 2 done |

### Steps to completion, in order

The order of work above comes first; the steps below are the fuller list it is drawn from.

0. **Hold the code to the scope.** `regionFrames()` in `scripts/eym-region-layer.mjs` returns five frames (Caren, Garyk and the three unnamed continents), and Garyk's takes in far-off islands that belong to no continent. Limit it to Caren and Garyk with their own islands, add the sea between them, and keep each frame's number in the store (`z`) unchanged, since the one stored Caren tile is filed under it.
1. **Finish the Region layer** (Caren, Garyk and the sea between them only).
   - Decided by the owner, 17 November 2026: mend the rivers first, then render the layer once.
   - Rivers: the data's channels are 5–10 km wide angular polygons. Narrow them to believable widths with natural banks.
   - Roads run in long straight stretches; hills shade too faintly; farmland is sparse; sea shore bands are octagonal.
   - Size (17 November 2026). The five old frames held 43,393 tiles (Northern 16,740; Garyk 12,320; Southern 6,732; Eastern 6,215; Caren 1,386); Caren's and Garyk's were stretched by island groups that belong to no continent. Held to their own islands (pull request 20) Caren has 464 tiles and Garyk 798. Of these, 72 of Caren's and 361 of Garyk's are entirely water and are skipped (made to check, never stored), which leaves 829 tiles to store: about 2% of the old layer, some two minutes of rendering at 0.15 s a tile. The sea frame between them (870 tiles) is all water and stores nothing until the sea gets detail of its own. The Local layer follows land area and should shrink by a similar share; it is measured before step 4.
   - Give `eym_tiles` a column for the continent frame (it is held in `z` for now). This is a SQL migration: the owner must approve it.
   - Render the whole layer into the store with `GET /api/region/fill?frame=&start=&count=&ms=`, frame by frame, recording each run in `eym_render_runs`. About 0.15 s a tile after a 7 s warm-up.
2. **Try the tiers.** Define tiers 3, 4 and 5 concretely (only tiers 1 and 2 exist), render the same place at each for the layers in question (a Dree side-by-side was offered), and let the owner fix a tier for each layer. Update the table above.
3. **Continent layer.** Two pictures, Caren and Garyk, at the chosen tier, shapes first and pixel art after, kept in the store.
4. **Local layer**, Caren and Garyk only. Speed up `scripts/eym-local-detail.mjs` (about 128,000 cells a second now), re-estimate the time for the reduced area before starting, then render and store it like the Region layer. Battle maps are already cut from this detail.
5. **The module reads the stored layers.** Zooming past the globe shows Region and then Local tiles from the web app; a chosen view is exported into the Foundry world as a picture or a scene. Outside Caren, Garyk and the sea between them, zoom stops where it does today. Only what is exported is kept in Foundry; the web app holds the rest.
6. **Battle maps to their tier.** Dedicated sprites for the remaining features, autotiled ground transitions, animated water and fire, more building styles, then tiers 3 to 5 as chosen in step 2.
7. **Polish.**
   - Names collide on the globe when zoomed on Caren, and in the sky with every name shown.
   - Dialogs (dossier manager, settings) and the window title bar are not parchment-styled.
   - About 3 MB of other bodies' cartography data is unused.
   - The test suite takes five minutes on every change; arrange it so unaffected tests can be skipped.
   - Only if the owner asks, two phone fixes for the System view: shrink its help card to one line or hide it after the first tap (on a phone it takes three lines and covers the bottom of the orbits), and open slightly more zoomed out so the outermost orbit is not at the edge.
8. **Verify where it will be used.** A live Foundry world (nothing has been checked in one yet) and a real iPhone (the pinch guard and the sky's two-finger pinch).
9. **Carried over from the table below.** Check Caren's settlement names; name Garyk's settlements; a road network between settlements; live environmental sync to the GM Kit.

### Complete means

Every layer in the table is drawn in pixel art at its chosen tier. The Continent, Region and Local layers are fully rendered and stored for Caren, Garyk and the sea between them. From Foundry a GM can go from the system down to any place there, export that view, and make a battle map there. All of it has been checked in a live world.

### Working rules

- Every code change goes through Twig, which tests it and opens a pull request. Nothing is pushed to GitHub directly. Twig does not merge.
- A module release happens only when the squash-merge title contains `[release]`. Each release bumps `module.json` (version and download address), `package.json` and the three version strings in `tests/release-package.test.mjs`. Web-app-only and documentation changes merge without it.
- No test is weakened, skipped or deleted without the owner's yes.
- A pull request that is behind `main` is tested again in full through Twig, on top of the current `main`, before it is merged; never a subset of the tests.
- No secret is stored in the repository or pasted into chat. The image API key is a client-scope setting; the Supabase service-role key lives only in Vercel's environment.
- Shapes first, pixel art after. Everything is drawn by rule: the same input always gives the same picture.

## Status

| Area | Recorded status | Recorded notes | Eym now |
|---|---|---|---|
| Dynamic orbital mechanics | Complete | Keplerian orbital positions, planetary rotations, tidal locking and binary stars. | Complete for Mitkear's system (one star, no binaries). Moon node and apsidal precession added; moon phases, eclipses and tides computed (`scripts/moon-events.mjs`). |
| Civilization geography | Complete | 774 settlements, 73 routes, city classifications and faction-specific routing. | Replaced for Eym by the authored maps: 81 Caren settlements (most names still need checking), 51 unnamed Garyk settlements grouped by realm colour, and no road network yet. The other worlds keep their generated settlements and routes. |
| Planetary illustrated textures | Partial | Jinyara texture registered and packaged; live globe renderer integration unfinished. | Jinyara texture removed with the cluster. Eym is drawn from vector coastlines with forest, upland, mountain and peak overlays traced from the source maps. Illustrated textures not started. |
| Day/night and seasonal environment | Planned | Astronomical foundation available; environmental calculations not confirmed implemented. | Done for Eym (`scripts/eym-seasons.mjs`): the real terminator and twilight bands on the globe, seasonal snow and sea ice, and for any place the season, sunrise, sunset, day length and a seasonal and daily temperature, following the campaign clock. Weather is not yet modelled: temperatures are seasonal averages. |
| Dynamic planetary weather | Planned | Detailed simulation architecture agreed upon; no completed implementation found. | Done for Eym, to the agreed design (`scripts/eym-weather.mjs`): deterministic weather systems on analytic tracks, a 6° grid of 1,800 cells for the globe, accumulations reconstructed over the previous 168 hours in 3-hour steps, computed only when Eym is opened, identical for identical inputs. Not yet: rain shadows and orographic rain inside the weather (the climate has them), fog, hail. |
| Environmental map overlays | Planned | Snow, ice, storms, rainfall, wetness and flooding. | Done for Eym: cloud, rain, sleet, snow and thunderstorm fields; highs and lows; tropical cyclones; snow cover from the last week's weather; seasonal sea ice; floods; wind arrows (off by default). Wetness is reported per place, not drawn. |
| Live environmental sync to GM Kit | Planned | Static maps synchronized; dynamic environmental snapshot sync unfinished. | Planned. |
| Elevation/normal/displacement rendering | Deferred | Intended to add depth and relief to illustrated planetary textures. | Deferred. |

## Map ladder and battle maps (agreed 16 November 2026)

Everything lives in this module. Maps are made top-down, each level grounded in the one above:

1. **Planet → continent → region → local/city reference maps** — deterministic, from Eym's data. *Done (step 1)*: the Atlas maps card makes the reference image, a name layer and a packet with the art direction; presets for map sizes and battle-map grids, adjustable in Game Settings.
2. **Painting them in the module** — an image-generator adapter (OpenAI's image model first; later an open-weight model on Dave's GPU or the Glassbox inference service), the API key kept in the GM's browser only, painted maps saved to the world's data (not the module folder) and registered as canon; lower levels use the painted level above as their reference. *Done (step 2)*, tested against a mocked server; not yet tried with a real key. Later: a second adapter if the open-weight server does not speak the OpenAI image API.
   - *Done*: the **ground-detail layer** below the 1° data (`scripts/eym-local-detail.mjs`): fields, woods, streams, ponds, marsh, roads, built-up areas and farmsteads at 10–50 m, pinned to the world; shown on the local level.
3. **Battle maps** *(done, step 3)* — pick a place, date and time: terrain, slope, water, plants, season, weather, light and nearby structures are already known; a deterministic 5-ft layout becomes a painted image and a ready Foundry scene (grid, darkness, weather effects). *Started*: the deterministic 5-ft layout (`buildBattleSite`: cover and height per square, trees, bushes, boulders, buildings, streams, rivers and roads). Defaults: 140 px per square, 24×30 squares (Flip-Mat), all adjustable. Done: the rules engine (settings, PF2e terrain per square, towns, design pass and analysis), the anchored painting brief and Foundry scene creation. Added: the GM's map-feature checklist (with hidden traps), architecture dossiers linked to areas, height (inclines, levels, cliffs, line of sight) and fourteen fantastic settings. Buildings have interiors on native v14 Scene Levels (ground with roofs revealed by sight, upper floors, basements, stairs that change level). Known limits: one walkable outdoor height per square (the ground under a platform or bridge is not walkable); upper floors of buildings on raised terraces use floor bands above the terrain rather than their true height; checked against the v14 data schemas and a stand-in, not yet a live Foundry. Next: paint large battle maps in tiles (the model paints at most 1536 px, so a 3360×4200 map is upscaled about 3×); check regions and walls against a live Foundry v14 and PF2e; GM edits to a battle map before it becomes a scene.

## Weather design (agreed 3 September 2026)

Weather must be physically plausible, coherent over time and deterministic. The Foundry module must not run a large simulation in the background.

### Pipeline

1. **Reference time.** One authoritative universal timestamp: the campaign clock (`scripts/universal-time.mjs`). This was called Cradle Reference Time in the Lancer setting.
2. **Orbital and rotational snapshot.** Star position, season, latitude, daylight and axial tilt at that timestamp, computed on demand.
3. **Planetary climate and weather reconstruction.** Terrain, atmosphere, oceans, wind, temperature, humidity and precipitation.
4. **Outputs:**
   - **The map:** weather and seasonal overlays.
   - **The GM Kit:** a matching 2D environmental snapshot.

### Specifications

- **Climate grid:** 6° resolution, about 1,800 weather cells per planet.
- **Reconstruction window:** 120–168 hours. Each reconstruction is bounded: it replays only the preceding five to seven standard days.
- **Internal step:** 1–3 hours.
- **What each cell takes into account:** terrain, ocean proximity, atmospheric properties, rotation, Coriolis effects, seasonal solar heating and neighbouring cells.
- **What each cell reports:** temperature, atmospheric pressure, humidity, wind, cloud cover, precipitation type, storms, snow, ice, wetness and flooding.
- **Coherence:** weather systems move and evolve coherently between places and timestamps. They are not a collection of independent random rolls.

### Performance rule (a firm architectural decision)

- Do not simulate every planet continuously.
- The map keeps the universal clock and calculates orbital snapshots on demand. It reconstructs a planet's environment only when someone opens or examines that planet.
- Jumping forward 100 years must not require simulating every day in between.
- Identical inputs must produce identical results.

### Notes for Eym

- **Grid:** Eym's coarse geography already uses a 6° grid of 1,800 cells (`data/planet-geography/abydos/eventide.json`). Its 1° cartography raster can supply terrain and ocean proximity.
- **Climate:** the annual-mean climate in `scripts/eym-cartography.mjs` is a baseline that weather can deviate from.
- **Continents:** Eym is 98.6% ocean, so maritime weather and tropical cyclones should dominate. Caren straddles the equator, and Garyk sits near 15°N.

## Eym's physical history and climate (owner's decision, 17 November 2026)

One programme, in the stages below. It comes after the queue above (the `eym_tiles` migration, the 829 Region land tiles, the night-sky release and the globe fixes, which now go into Stage 1) and before the globe's tier-3 work and the side-by-side judgement of the layers. Each stage is its own pull request, with a release where the module changes, and its renders are shown to the owner before it is submitted.

### The problem

Eym has no formation history.

- The Eastern, Northern and Southern continents come from `seededRing` in `scripts/eym-surface.mjs`: a blob of the right area with sine-wave wobbles and random bumps. They look misshapen and unnatural.
- The plate model in `scripts/planet-geography.mjs` (`generatePlateModel`) is used only for other planets and only shades height.
- Sea temperature depends only on latitude and season (`seasonalTemperature` with `ocean: true` in `scripts/eym-seasons.mjs`). There are no currents, and tropical cyclones form evenly around the latitude band (`TROPICAL_GENESIS_SST_C` in `scripts/eym-weather.mjs`).
- The tropical rain belt is fixed at about 4° N all year (`zonalPrecipitationMm`).
- There is no erosion.
- Soils are guessed from elevation.
- Tides exist only as a strength number (`tidalStrength` in `scripts/moon-events.mjs`).

Already present (not redone): zonal rain bands with rain shadows and orographic lift, prevailing winds, rivers routed by priority flood, biomes from temperature and rain, the tide-strength calculation.

### Invariants

- *Caren:* unchanged, exactly as traced. Lore: the gods and angels shaped it deliberately, so its form and composition do not follow plate tectonics. It is masked out of the tectonic simulation (the sea floor around it is still tectonic) and given its own stated geology in the lore.
- *Garyk:* unchanged, exactly as traced. It formed naturally, so the simulation must explain it: a convergent plate edge along its existing mountains and an old core under its interior.
- *Gaffa, Khohalis, Demani (eastern, northern, southern):* keep their current centres and target areas from `EYM_LAYOUT.seeded`, within ±10% of area and 3° of centre. Their shapes come from the simulation.
- Eym stays 98.6% ocean.
- Everything is drawn by rule, with named seeds: same inputs, same world. Generators run offline in `tools/`; the module ships their output data.
- Lore: life on Eym was placed by the gods, not evolved. No biosphere or evolution simulation.

### Addendum: Eym is nearly an aquaplanet (owner, 17 November 2026)

Eym is about 98.6% ocean, close to an aquaplanet. This applies throughout the programme.

- *Temperatures:* small seasonal and daily swings everywhere, including Caren's interior; continentality stays weak.
  - Checked against the current model (`seasonalTemperature` in `scripts/eym-seasons.mjs`) on 17 November 2026.
  - Seasonal swings are already small:
    - Caren's interior: a range of about 1 °C;
    - Garyk's interior: about 4 °C;
    - Khohalis and Demani: 13–14 °C;
    - the sea at 50° N: about 9 °C.
  - Daily ranges on land are Earth-like and too wide: 7–9 °C (sea 1 °C). They are to be narrowed, and continentality weighed down.
  - `tools/calibrate-eym-weather.mjs` checks only rain against the climate; it is to check temperature ranges too.
- *Wind belts:* near-continuous trade winds, strong mid-latitude westerlies and polar easterlies, broken only near Caren, Garyk and Gaffa.
- *Sea state:* wave height and swell from wind and fetch (the fetch is very large, so big swells in the westerly belts), exposed for sailing times, coastal battle maps and lore.
- *Cloud and humidity:* more low cloud and drizzle over the sea and somewhat more rain than Earth, but rain stays energy-limited (not doubled). The weather's cloud and rain fields are recalibrated.
- *Tropical cyclones:* about 50 a year stays plausible, kept tied to warm water from the current model.

### Stage 1: plate tectonics, geology and volcanoes (with the globe fixes)

1. *Plates:* about 8–12 major plates plus microplates, with noise-warped boundaries. Each plate turns about its own pole at a believable speed. Each boundary is classed as convergent, divergent or transform.
2. *Deep history* in a few coarse stages, worked backwards from the fixed end positions: supercontinent break-up along rifts, then drift to the present positions, then accretion at subduction margins (coastal ranges, island arcs), then collision belts (inland ranges), then erosion and isostasy smoothing.
3. *Fitting:* try a fixed, ordered list of seeds and keep the first that meets the targets. No hand-tuning.
4. *Outputs*, in the shape the pipeline now takes from `seededRing` (rings, ridges, offshore islands), plus:
   - Coast character from geology: smooth coasts and wide shelves on rifted margins; steep coasts with ranges and island chains on active margins; fjords at cold high latitudes.
   - Mountains at collision and subduction zones.
   - Bathymetry: mid-ocean ridges, trenches, shelves.
   - Bedrock by origin: old cores (granite, gneiss), basins (sandstone, shale, limestone), active margins (volcanic rock), collision belts (metamorphic rock).
   - Volcanoes at subduction margins and a few hotspots, each with an age and an activity level.
   - Soils from bedrock and climate, replacing the elevation guess in `scripts/eym-cartography.mjs`.
   - Rock type exposed to the Region, Local and battle maps: landform look (karst, granite domes, mesas, cones), building stone for the architecture dossiers, ore and mines.
5. *Earthquakes and eruptions:* dated, deterministic events from the plate boundaries and volcanoes, queryable by place and date (for story hooks), with how strongly a place felt them.
6. *The tool reports* the plates, boundary types, history stages, final areas and centres against the targets, and the seed used.
7. *The globe fixes:* the vertical dotted streaks in the ocean around Caren at deep zoom; labels in the panel's serif, hidden where they would overlap; the H and L pressure letters in their own layer, off by default; sea ice and cloud in clearly different colours.

### Stage 2: ocean currents, tides and climate

1. *Currents:*
   - Wind-driven surface currents from the wind belts and rotation (Coriolis), steered by the coastlines. With Eym 98.6% ocean, expect mostly circumpolar, east–west flow, with boundary currents and gyres where Caren, Garyk and the Eastern Continent block it.
   - Upwelling where the wind pushes coastal water offshore.
   - Seasonal variation.
   - Output: a current field and a sea-temperature anomaly map, by season.
2. *Wet and dry seasons* (corrected by the aquaplanet addendum): the tropical rain belt follows the sun through the year but shifts less than on Earth, and monsoons are weak: at most a weak monsoon on Gaffa. Caren and Garyk get real but milder wet and dry seasons.
3. *Fed into what exists:*
   - Coastal and sea temperatures (`seasonalTemperature` takes the anomaly).
   - Rain and aridity for biomes: wet coasts with warm water offshore; dry, foggy coasts with cold water offshore.
   - Tropical cyclone birthplaces (warm pools) and paths.
   - The sea-ice edge.
   - Weather by season.
   - Battle-map conditions.
   - Sailing times: the Caren–Garyk crossing (21 days at 9 knots now) becomes direction-dependent.
   - A slow El Niño-like oscillation for year-to-year variation, deterministic from the clock (owner's yes, 17 November 2026).
4. *Tides from the two moons and the Sun:*
   - Tidal range on coasts, highest at spring tides when the moons line up.
   - Tide height at a place and time.
   - Coastal battle maps show tidal flats exposed or covered by the hour (owner's yes, 17 November 2026).

### Stage 3: erosion and landforms

This applies to all land, including Caren's and Garyk's interiors; their outlines stay fixed.

- Rivers carve valleys and gorges; floodplains, terraces and deltas form where they slow and meet the sea.
- Coastal forms by exposure and rock: beaches, cliffs, spits, estuaries.
- The result feeds Region and Local terrain. If it changes Region tiles already stored, they are rendered again from the stored shapes, and the pull request says so.

### Stage 4: rivers through the year

- River flow by season from the seasonal rain and snowmelt: spring floods, low water, droughts.
- Springs and wetlands from groundwater.
- Fords crossable only in some seasons, wired into battle maps and travel times.
- River widths follow discharge (consistent with the 0.16.3 river fix).

### Stage 5: ice ages and old sea levels

Corrected by the aquaplanet addendum: ice ages are mainly sea-ice expansion and mountain glaciers. There are no large land ice sheets, the sea-level drop is small, and there are few land bridges or drowned valleys.

- A deterministic glacial history: a few cold periods with their dates, sea-ice extent, mountain glaciers and a small sea-level drop.
- Effects on today's map: glacier-carved valleys, lakes and moraines in high mountains and at high latitudes; few drowned river valleys or land bridges.
- Past coastlines, sea levels and sea-ice edges by era, for lore (sunken ruins, old routes).

### Stage 6: auroras

- A magnetic pole position (deterministic, stated in the lore) and an aurora oval.
- Auroras in the night sky at high latitudes, varying by night and with a slow activity cycle, drawn in the sky's style.

### Downstream and tests

- Regenerate Eym's geography, cartography, rivers, biomes, the globe's surface data, weather inputs, snow and ice, and the Atlas maps.
- Caren's and Garyk's coastlines must come out byte-identical. Their climate, rivers and interior terrain may change, and the pull request says so plainly.
- The weather on a given date will change; the pull request says so.
- Tests pinned to the old seeded shapes or the old climate are updated, and the pull request says so plainly as its own line. No test is weakened, skipped or deleted without the owner's yes.
- New tests for: the invariants; the continent targets; determinism; mountains lying on convergent boundaries; volcanoes at subduction zones and hotspots; the 98.6% ocean fraction; a warm boundary current where the model should produce one; the rain belt moving with the seasons; seasonal river flow; tide range peaking when the moons align; the aurora appearing only at high latitudes.

### Shown to the owner at each stage, before submitting

- *Stage 1:* globe renders of the three continents before and after (the whole globe and each close up), a plate-boundary overlay, volcanoes and rock types; the globe fixes before and after.
- *Stage 2:* current, sea-temperature and swell overlays by season; before-and-after climate and biome maps for Caren and Garyk; the new cyclone birthplaces; the wet and dry seasons for a few Caren places.
- *Stage 3:* before-and-after Region tiles of Caren and Garyk.
- *Stage 4:* one river's flow through the year.
- *Stage 5:* the glacial maximum's coastlines and sea-ice edge.
- *Stage 6:* a night sky with an aurora.

## The night sky's tier (owner's decision, 17 November 2026)

The night sky goes to tier 4–5: it is small and simple (a dome, about 2,000 stars, two moons, four wanderers and one band of light), so it can afford it. It is drawn at the screen's own density (canvas = shown size × devicePixelRatio, about 3 on an iPhone), sharp at rest, never a low-resolution canvas stretched with `image-rendering: pixelated`. The pixel-art identity is in the shapes and a small, deliberate palette, not in the size of the pixels. For the sky, tier 4–5 means:

- **Stars:** a sharp bright core and a small soft glow, whose size and strength follow brightness; a fine cross only on the brightest few; faint stars tiny and dim, read as background dust; a restrained warm, white or cool tint.
- **Desna's Path:** a smooth, soft glow of uneven brightness, with dark lanes of dust and a brighter core region; no dither grid.
- **The sky:** a smooth gradient from zenith to horizon with a faint glow at the horizon (the twilight's colours at dusk and dawn); no banding, no checkerboard.
- **Moons:** discs at the screen's density with a soft terminator, darker patches on the lit side and earthshine on the dark side.
- **Wanderers:** a sharp eight-pointed star in a soft halo, brighter than any star.
- **The Sun:** a bright disc in a soft corona with rays; eclipses in true proportion.
- **Constellation figures:** thin, antialiased, continuous lines in muted gold that stop short of their stars; a tapped figure's lines in bright gold.
- **Cloud:** a soft, uneven veil, not dithered pixels.
- **Legibility:** the dome fills the view; names are a fixed size on the screen, set beside what they name in a solid halo of the sky's colour, and the less important gives way where two would overlap; with "All names", only named stars, wanderers and moons are named, and figures' names only with the figures.
- **Speed:** stars are stamped from sprites made once; the background is worked out once for each time, place and zoom and turned with the sky; while a finger moves the last sharp picture is turned, moved or scaled at half density, and drawn sharp again about 150 ms after it rests. Target: under 30 ms a frame while dragging on a phone.

The globe will probably go to tier 3 at most (it is redrawn live on the phone: softer layered clouds, relief shading, graded shallows); that waits for the owner's side-by-side.

## Pixel-art tiers (agreed 16 November 2026)

Battle maps can be drawn without AI, deterministically, by the map server (`webapp/`), from the same map geometry at every tier: identical squares and objects, one three-quarter orthographic perspective, reusable procedural materials and components, pixel-art rendering (not pixelation), cached high-resolution assets, and Foundry scene import.

| Tier | | Status |
|---|---|---|
| 1 | Geometric illustration: flat colours, simple geometry, basic dimensional cues | Done (the module's own drawing) |
| 2 | Traditional RPG pixel art: textures, patterned roofs, detailed foliage, water edges, soil variation, several shadow tones | Done, first version (map server) |
| 3 | High-definition pixel environments: individual roof tiles, masonry, layered vegetation, material-dependent lighting | Planned |
| 4 | Volumetric pixel art (KOF XIII-inspired richness in the fixed three-quarter view) | Planned |
| 5 | Artist-quality procedural pixel art: architectural identities, organic irregularity, environmental storytelling, composition-aware choices | Planned |

Done in Tier 2: object-own shadows and season in the art; lamps as Foundry lights (time-of-day light is Foundry's, live); objects encoded with their heights so Foundry's lights cast their shadows (light-blocking walls with `wall-height` flags, since v14 walls have no height of their own); furniture shading of its own. Next for Tier 2: dedicated sprites for the remaining features (now shaded blocks), animated water and fire frames, autotiled transitions between specific grounds, and more building styles as cultures come up (the format and Dree are done: `scripts/eym-building-styles.mjs`).

