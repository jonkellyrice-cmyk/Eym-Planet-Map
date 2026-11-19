# Roadmap

This roadmap was carried over from the Lancer GM Kit and Lancer cluster map, and most of it still applies to Eym. The table gives each item's status as recorded there, then where it stands in this repository now. The weather design below it was agreed on 3 September 2026.

## Where we are and what is left (17 November 2026, version 0.16.4)

This section is the current plan. The sections below it are the earlier agreements it builds on.

### Consolidated addenda (owner, 18 November 2026)

Part 1 retrofits work already done and comes next, before Stage 5; item 7 (owner, 19 November 2026) joins it. Part 2 is recorded in the sections below and is not started; its items D, F, G and H are superseded by the full record of the later programmes (owner, 19 November 2026). The usual rules hold: every change through Twig; renders shown first; no test weakened, skipped or deleted without the owner's yes; Caren's and Garyk's outlines are invariants. Stage 4 (rivers through the year) was already done when these were written (0.25.0); Stage 5 follows Part 1.

**Part 1, in the order it is done** (the order follows what feeds what: the store first, so that every later change refreshes the tiles it makes stale; the mantle before the sea floor, whose seamount chains it makes):

1. *Eym's magnetic field: canon* (done, recorded in `docs/eym-canon.md`). Confirmed by the world's author, Dave: an Earth-like dipole tilted about 10° from the spin axis; north magnetic pole over open ocean toward about 100° E (owner's choice, option A); Caren's and Garyk's coasts within ±12° magnetic latitude for every century; slow deterministic drift of 10–50 km a year inside 79°–80° N, 80°–100° E; never an aurora over Caren or Garyk. Compass declination is Earth-normal (up to about 11°; under 7° at Garyk): the ±12° and 7° figures were the owner's proxies, and no pole direction meets both, so the latitude was kept. Stage 6 implements it.
2. *Stored-tile staleness* (item 6; done in 0.25.3: tiles kept under fingerprints of their code and data, see `webapp/README.md`, "Stored Region tiles and staleness"). Reason: the Region store is keyed by a hand-bumped label (`eym-region-layer-v5`), so upstream changes (tectonics, erosion, items 3–5 below) can leave stale tiles that keep being served; 0.25.0 did exactly that.
   - Key stored tiles by a fingerprint of the generator code and every input data file, as the tectonics tool already does. The same for the Continent and Local stores when they exist.
   - Detect stale tiles and make them again, from the stored shapes where only the painting changed, reporting what was refreshed.
   - Render again the Region tiles that items 3–5 change.
3. *Mantle plausibility rules* (Stage 1, item 3). Reason: the plates are kinematic (rigid caps on Euler poles fitted backwards). That stays, but their motions should agree with what drives plates. No mantle or core simulation; the core needs none (its field is decided above).
   - Plate speeds consistent with their drivers: plates attached to subducting slabs faster (about 5–10 cm a year); plates without slabs slower (about 1–3 cm a year). Check the fitted rates; report and fix outliers within the targets.
   - Plumes fixed in the deep mantle, rising from the margins of two broad antipodal upwellings. Each hotspot leaves an age-ordered chain of volcanoes and seamounts along its plate's motion (the Hawaii–Emperor pattern). These are the seamount chains for the sea floor below.
   - Explain the fitted history by that pattern: the old supercontinent assembled over a downwelling and rifted above upwelling. Added to the history text.
   - Optional, ask the owner first: dynamic topography (a few hundred metres of broad uplift and subsidence).
   - Caren stays exempt (shaped by the gods).
4. *The sea floor in the ocean model* (Stage 2, item 2). Reason: Stage 1a built shelves, slopes, ridges, trenches and hotspots, but the current model does not use them, and on an ocean world with little land undersea ridges and plateaus are the main obstacles that steer the circumpolar flow.
   - Check Stage 2a's currents again with the bathymetry: steering by ridges, plateaus and continental slopes. Report how the currents, sea temperatures and cyclone birthplaces change.
   - Upwelling at shelf breaks and over seamounts (cold water, fog, rich fisheries).
   - Storm surge from cyclones, scaled by shelf width and depth (for coastal battle maps and the history engine's hazards).
   - Tides already use shelf width (kept). Add amplification in funnel-shaped bays (the Bay of Fundy pattern) where the coast's shape and depth support it.
   - Finer bathymetry (about 0.1°) only on Caren's and Garyk's shelves and in the strait corridor.
5. *Volcanic climate effects* (item 4). Reason: Stage 1b makes dated eruptions with sizes, but the weather ignores them (a Tambora-sized eruption followed by a normal year is a contradiction).
   - After large eruptions, cool the climate globally and regionally for 1–3 years, scaled by size (Tambora-scale about 0.5–1 °C, failed seasons).
   - Feed the weather, the seasons and seasonal snow and ice. Record the event for the history engine's timeline of shocks.
6. *Moonlight in battle scenes* (item 5). Reason: Pathfinder's light levels (bright, dim, darkness) change concealment and vision, and Eym has two moons with tracked phases, but night scenes do not use them.
   - Night scenes take their light from Austarm's and Chatarm's phase and altitude and the cloud cover at the scene's place and time, and set Foundry's darkness and global light to match (full moons give dim light outdoors; double-dark nights or overcast give darkness).
   - Tested on a full-moon night against a double-dark night.
7. *Caren canon and the weather addendum* (owner, 19 November 2026). Done with the next climate and weather work, alongside items 4 and 5: the check on Caren's smaller deserts needs item 4's currents. The canon is in `docs/eym-canon.md` (Caren). Caren's coastline is unchanged; its mountains, rivers and lakes stay where the source map draws them.
   - *Dubos:* the city labelled "Dubor" is "Dubos" (the world's author's spelling). Correct the label (`data/eym/caren-labels.json`) and everything derived from it (the cartography asset, the atlas snapshot). No canon note says "Dubose".
   - *Caren's main desert*, an enclosed basin north of the equator:
     - Find the ring of ranges on the source map. Set crest heights and the basin floor so the ring is continuous and blocks moisture from every direction. Caren is god-shaped, so heights may be set without tectonic cause.
     - Drainage agrees with the traced rivers and lakes: if none leave the basin, it drains inward (rivers ending in salt lakes, marshes or salt flats); if the map shows an outflow, it is kept.
     - Landforms from the wind model: salt flats, dune fields, desert pavement, gravel plains; dust and loess downwind beyond the ranges.
     - Resources: evaporite salt. Settlement potential: oases where water reaches the surface.
     - Climate: hot if the floor is low, cooler if it is a raised plateau; report which the source map's heights imply.
   - *Smaller deserts:* after item 4 re-runs the currents, check that rain shadows and any cold upwelling coast produce them. The current data shows no desert on Caren, only a little steppe. If they fall short, check the ranges' orientation against the trade winds (with their seasonal shift, below) and the current off the lee coast first; raise ranges only as a last resort. Do not tune to guessed places: if the source map does not settle where they are, ask the owner.
   - *Seasons readouts:* check that readouts for Caren places show a mild yearly temperature cycle (larger toward its north end, about 16° N) as well as wet and dry seasons.
   - *The weather model* (`scripts/eym-weather.mjs` now has fixed wind and pressure belts by latitude, a seasonal rain belt, and storms on straight, steady tracks):
     - The wind and pressure belts shift with the seasons, consistent with the rain belt's shift (a few degrees toward the summer hemisphere). Reasons: consistency, seasonal sailing on the trade-wind routes, and Caren's northern margin.
     - A jet stream in each hemisphere (subtropical and polar-front branches), meandering in a few slow waves whose phase and amplitude are deterministic functions of the clock; mid-latitude storms follow the jet instead of straight lines. Meanders kept modest: Eym's near-total ocean makes its jets stronger and more zonal than Earth's.
     - Occasional blocking: rare, deterministic episodes where a meander stalls for one to three weeks, bringing persistent dry, wet, hot or cold spells under and beside it. Recorded for the history engine's timeline of shocks.
   - *Tests:* Dubos throughout; the main basin is drier than its ranges' outer slopes, and its drainage agrees with the traced rivers and lakes; seasons readouts for Caren places include a mild temperature cycle as well as wet and dry seasons; the weather changes are deterministic; the belts shift with the seasons; storm tracks follow the jet; blocking comes a few times a year per hemisphere; Caren's tropical weather is essentially unchanged by the jet and blocking except at its northern margin.
   - *Shown to the owner before submitting:* before-and-after biome and rainfall maps of Caren with the main basin and the smaller deserts marked; seasons readouts for a few Caren places, Dubos among them; a jet-stream and storm-track overlay for two contrasting seasons, with one blocking episode.

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
  8. Later, not started: the ecology, human geography, history engine and planar lens programmes (owner, 19 November 2026; see "Later programmes" below).

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
   - *Smooth transitions between layers* (owner, 18 November 2026), built with the Continent layer. One mechanism for every boundary (Planet → Continent → Region → Local). In a narrow band of zoom, morph the projection (the globe's sphere to the layer's flat frame) and blend, tied to the zoom gesture. If the gesture stops inside the band, finish to the nearer side within about 200–300 ms; never rest mid-blend. Compatible palette and detail at each boundary; prefetch the incoming layer's tiles; check the frame rate on a phone.
4. **Local layer**, Caren and Garyk only. Speed up `scripts/eym-local-detail.mjs` (about 128,000 cells a second now), re-estimate the time for the reduced area before starting, then render and store it like the Region layer. Battle maps are already cut from this detail.
5. **The module reads the stored layers.** Zooming past the globe shows Region and then Local tiles from the web app; a chosen view is exported into the Foundry world as a picture or a scene. Outside Caren, Garyk and the sea between them, zoom stops where it does today. Only what is exported is kept in Foundry; the web app holds the rest.
6. **Battle maps to their tier.** Dedicated sprites for the remaining features, autotiled ground transitions, animated water and fire, more building styles, then tiers 3 to 5 as chosen in step 2.
7. **Polish.**
   - Remove the temporary `GET /api/region/purge` endpoint (0.25.2; see `webapp/README.md`, "Purging old Region tiles") once the Region and Local layers' models have settled (after steps 4 and 5), or before the map server is opened to anyone else, whichever comes first. Until then keep `EYM_REGION_PURGE` unset except during a clean-up.
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

*Retrofits (owner, 18 November 2026):* mantle plausibility rules (plate speeds by their drivers, fixed plumes and hotspot chains, the supercontinent's history), and the climate effects of large eruptions. See the consolidated addenda, Part 1, items 3 and 5, at the top of this roadmap.

### Stage 2: ocean currents, tides and climate

Split in three: *2a* currents, sea temperature, wet and dry seasons, El Niño and cyclones (done, 0.20.0); *2b* sea state and swell and direction-dependent sailing times (done, 0.21.0), low cloud and drizzle (done, 0.21.1); *2c* tides from the two moons and the Sun, with tidal flats on coastal battle maps (done, 0.22.0).

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

*Retrofit (owner, 18 November 2026):* the sea floor in the ocean model (steering by ridges, plateaus and slopes; upwelling at shelf breaks and seamounts; storm surge; tides amplified in funnel-shaped bays; finer bathymetry on Caren's and Garyk's shelves and in the strait). See the consolidated addenda, Part 1, item 4, at the top of this roadmap.

### Stage 3: erosion and landforms

This applies to all land, including Caren's and Garyk's interiors; their outlines stay fixed.

Done in 0.23.0: valleys, gorges and floodplains from the named rivers and a traced drainage network; beaches, dunes, cliffs, salt marsh, estuaries and deltas by exposure, rock and tide; the Region layer moved to v3 and its stored tiles rendered again. Left for later: river terraces (they drew step lines across the map and were taken out) and spits.

- Rivers carve valleys and gorges; floodplains, terraces and deltas form where they slow and meet the sea.
- Coastal forms by exposure and rock: beaches, cliffs, spits, estuaries.
- The result feeds Region and Local terrain. If it changes Region tiles already stored, they are rendered again from the stored shapes, and the pull request says so.

*Addendum: wind (owner's note, 18 November 2026; done in 0.24.0).* Wind erosion and deposition from the wind and climate of Stages 2a–2b, strongest where ground is dry and bare: deflation and desert pavement; yardangs where rock is soft; dune fields in dry regions and coastal dunes behind exposed beaches under strong onshore winds; loess blankets downwind of dust sources, fed into soil fertility. Coastal forms take their wave energy from Stage 2b's swell, not a fixed value. Outlines stay fixed. As expected on Eym: little inland; dunes on the coasts facing the trade winds and big seas; grassed dunes and a little loess in Garyk's dry-season north.

### Stage 4: rivers through the year

*Done in 0.25.0:* monthly flow from a water balance (snow, soil, groundwater) over the weather's monthly rain and warmth; floods, low water and droughts, with wet and dry years from the equatorial oscillation and a year-to-year swing; beds as wide as the water they carry; river stages on battle maps (gravel bars, wading depths, swollen streams, floodwater) and on the "Here and now" card with the days until a ford can be crossed; springs and spring-fed fens in porous rock. There is still no land travel-time system: the crossing delay is given on the card, and a journey planner would add it.

- River flow by season from the seasonal rain and snowmelt: spring floods, low water, droughts.
- Springs and wetlands from groundwater.
- Fords crossable only in some seasons, wired into battle maps and travel times.
- River widths follow discharge (consistent with the 0.16.3 river fix).

### Stage 5: ice ages and old sea levels

Next after Part 1 of the consolidated addenda.

Corrected by the aquaplanet addendum: ice ages are mainly sea-ice expansion and mountain glaciers. There are no large land ice sheets, the sea-level drop is small, and there are few land bridges or drowned valleys.

*Owner, 18 November 2026:* the cold periods are timed by Eym's own orbital cycles already in its data (obliquity 22.1°–24.5° over about 41,000 years, precession about every 25,772 years), Milankovitch-style, not chosen dates. Small on Eym (mostly sea ice and mountain glaciers, little drop in sea level), per the aquaplanet addendum. Land exposed at low sea level comes from the shelf depths.

- A deterministic glacial history: a few cold periods with their dates, sea-ice extent, mountain glaciers and a small sea-level drop.
- Effects on today's map: glacier-carved valleys, lakes and moraines in high mountains and at high latitudes; few drowned river valleys or land bridges.
- Past coastlines, sea levels and sea-ice edges by era, for lore (sunken ruins, old routes).

### Stage 6: the magnetic field and auroras

Implements the canon in `docs/eym-canon.md` (owner and the world's author, 18 November 2026).

- The field: a dipole tilted about 10°, the north magnetic pole near 80° N, 100° E over open ocean, drifting deterministically 10–50 km a year and always inside 79°–80° N, 80°–100° E, so that Caren's and Garyk's coasts stay within ±12° magnetic latitude in every century.
- Auroras only around the magnetic poles: an oval at about 65°–75° magnetic latitude, lower in strong storms; great storms reach about 20°–25°, rarely. Varying by night and with a slow activity cycle, drawn in the sky's style.
- Tests: Caren and Garyk never see an aurora; the pole stays in its box; the coasts' magnetic latitudes stay within the canon's figures.
- A compass-declination readout by place and date. Ask the owner before putting it in the panel.

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

## Later programmes: ecology, human geography, the history engine and the planar lenses (owner, 19 November 2026)

Agreed in the owner's planning conversations and written here in full; this record supersedes the partial sections made from the 18 November addenda (Part 2, items D, F, G and H). These are later work, after the physical-history programme (Stages 1–6) and the tier-2 layer work (the Continent layer, Local samples, the side-by-side). Not started.

### Ground rules for all four

- Derived by rule: offline tools in `tools/`, named seeds, same inputs give the same output. The module ships the results as data and overlays.
- Everything derived about life, people and history is potential, not canon, and is labelled so.
- Nothing overrides authored places: Caren's and Garyk's cities, realms and names are invariants. Generators never invent named places, peoples or events.
- Lore decisions belong to the world's author (Dave). Where his answer is needed, a stated default is used only where this record names one, flagged provisional.
- Spoilers: the owner is also a player. Garyk canon (the current campaign) is entered by the world's author and stored outside the Git repository (GM-only world data, or the web app's store); anything calibrated on it is GM-only. Development and tests use public or synthetic canon.

### 1. Ecology

1. Life on Eym is Earth's animals and plants plus Pathfinder's monsters, placed by the gods, not evolved: no evolution or biosphere simulation.
2. Habitat ranges for Earth species from climate, biome, season, water, depth and altitude, including the wild ancestors of crops (wheat, barley, rice, maize, olives and others) and of livestock (horse, aurochs and cattle, sheep, goat, pig, camel, llama, chicken, dog and others).
3. Placement rule, for the world's author: species live wherever their habitat exists ("by habitat"), or only where placed ("by choice"). Default: by habitat, flagged provisional.
4. Optional, ask the owner first: Pathfinder creatures tagged with habitat, giving encounter suitability by place and season; tameable creatures (riding drakes, giant lizards and so on) listed beside Earth's domesticates.
5. Ecology shapes geography:
   - *Vegetation and erosion:* plant cover holds soil and stream banks; bare or overgrazed ground erodes faster (the Dust Bowl pattern, with the wind model).
   - *Fire regimes:* dry-season fuel plus lightning from the weather, later people, and monsters if the world's author says so. Fire keeps savanna and grassland from becoming forest. Reason: without it the wet-dry tropics where both campaigns are set come out wrongly over-forested. Test that Caren's and Garyk's tropics are not uniformly forest.
   - *Biological landforms*, never changing Caren's or Garyk's outlines:
     - coral reefs, atolls, reef islands and lagoons on shallow warm platforms (from sea temperature and bathymetry);
     - mangroves and salt marshes;
     - peat bogs;
     - beaver-style wetlands where suitable species live.
   - *Iterate* landforms → climate → vegetation and animals → erosion → landforms, deterministically.

### 2. Human geography (potential maps)

1. *Ore provinces* from the geology, with single deposits drawn deterministically within them:
   - copper, gold and silver at volcanic arcs;
   - tin and tungsten in collision granites;
   - iron in old cores, and bog iron;
   - lead and zinc in sedimentary basins;
   - salt in evaporite basins (Caren's enclosed desert basin among them);
   - coal in old swamp basins;
   - placer gold and gems in rivers below mountains.
2. *Soils and farming:* soil fertility (loess plains included); crop suitability by crop and season; grazing suitability.
3. *Settlement-site potential:* harbours (drowned river mouths, sheltered bays), river crossings and confluences, passes, fertile plains, oases, resource sites, defensibility.
4. *Disease ecology:*
   - insect-borne fever zones in warm wet lowlands;
   - waterborne risk in dense river settlements;
   - crowding risk where many people live close to herd animals;
   - natural refuges (cold, dry, high): tropical highlands historically escaped fevers and became centres of population.
5. *Hazards:*
   - tsunamis from Stage 1b's trench earthquakes, with coastal run-up from the sea floor;
   - storm-surge risk by coast;
   - floods, eruptions and earthquakes by place.
6. *The sea:*
   - fisheries at upwelling zones and shelf edges;
   - shipwrecks clustering on shoals and reefs along routes and storm tracks (they feed the treasure map, 3.6);
   - aquatic peoples on shelves and reefs: for the world's author.
7. *Derived layers for the history engine:*
   - carrying capacity by region at several technology levels;
   - a travel-cost map over land, rivers and sea, with winds, currents, seasons and sea state (sea travel dominates on a world that is 98.6% ocean), and from it who neighbours whom, the routes of trade and invasion, and how far a state can project power;
   - chokepoints and strategic dependencies: straits, passes, river mouths, single-source resources (copper and tin are rarely found together, so bronze needs trade);
   - a dated timeline of shocks: droughts, weak wet seasons, volcanic winters, blocking episodes, earthquakes, tsunamis, plague introductions.

### 3. The history engine

1. *Questions for the world's author*; the engine waits for his answers:
   - peoples and ancestries: homelands, numbers, dates of arrival or creation;
   - lifespans and growth rates per ancestry;
   - how common magic is, and what it can do for food, healing, communication and travel;
   - how active the gods are, and the pantheon's accord (3.7);
   - monster pressure by region, and which monsters oppose which;
   - fixed history: known events, realms and dates (invariants the engine must reach);
   - the species placement rule (1.3).
2. *Physical and structural mechanisms*, calibrated where possible against published work on historical dynamics (Turchin's cliodynamics, the Seshat databank):
   - population growth to carrying capacity, and surplus;
   - the fiscal-demographic cycle (population pressure, then too many competing elites, then fiscal strain on the state, then unrest; roughly two to three centuries in agrarian states);
   - cohesion that rises at frontiers between very different peoples and decays in long-safe cores;
   - institutions, legitimacy, elite dynamics and path dependence as per-realm state;
   - diffusion of technology, religion and disease along the travel network;
   - conflict between neighbours with overlapping interests, decided by population, logistics within supply range, military technology, defensible terrain and sea power;
   - the timeline of shocks (2.7);
   - chance.
3. *Exceptional people and groups:*
   - They arise at a rate set by population, access to education and wealth, open ladders (armies, temples, academies, guilds, adventuring), clusters, frontiers and crises, access to magic and divine favour. Chance decides who.
   - Their influence is small in stable times and greatest at critical junctures (crisis, succession, collapse, invasion).
   - Player characters and the world's author's NPCs are fixed inputs, not simulated.
4. *Adventurers:*
   - The level pyramid: characters per level from population (the D&D 3.5 / PF1 settlement tables as a start), with power rising steeply by level. High-level individuals act as strategic deterrents.
   - State cultivation systems per realm: breadth of recruitment, training through graded danger (managed monster preserves included), licensing and ranks, loyalty controls. These shape the pyramid and the risk of rogue champions and coups.
5. *Monsters:*
   - a pressure map from habitat (wilderness, depth, altitude, distance from settlement), and a monster pyramid with slow breeding at the top;
   - monsters caused by events: wars and plagues raise undead; rifts and the Exilarchs bring outsiders;
   - frontier push-back over time;
   - tribute arrangements with intelligent monsters;
   - a monster relations table (prey, rival, sworn enemy, ally, indifferent) with territories, monster wars and waves of displacement;
   - monster statecraft by realms (tribute, alliances, luring threats onto rivals), with a chance of blowback;
   - cohesion that rises with monster pressure and drops when a threat is cleared;
   - a per-realm setting of who counts as people;
   - trophic cascades: removing predators (monsters cleared by people among them) can cause overgrazing, bank erosion and the loss of wetlands (the Yellowstone pattern); some damage persists after recovery;
   - people and monsters as engineers of the landscape over time (clearing forest, terracing, drainage, burning; monsters' effects only as the world's author defines them).
6. *Treasure:*
   - sources: ruins (from collapses and wars), monster hoards and tribute, tombs (burial customs), wrecks (2.6), adventurers' losses, monster parts;
   - less what has been taken: most taken where it is easy, least where it is guarded, so treasure and danger lie together;
   - loot taxes and local inflation.
7. *Gods:*
   - influence by region (worshippers, holy sites);
   - an escalation ladder of intervention (spells, omens, champions, miracles, servants, avatars, open divine war), each rung with a chance of a response from opposed powers;
   - proxy conflicts between churches; rare top-rung events with great collateral damage; pantheon-wide responses to existential threats.
   The accord itself (which rungs are allowed, who enforces it) is the world's author's.
8. *Magic and technology:*
   - a technology's motive = need × the cost and availability of the magical alternative (casters per head, from the pyramid) × political resistance from those it threatens;
   - magic wins low-volume, high-value work; technology wins bulk and scale;
   - firearms are political (they threaten the heroic class);
   - places where magic is scarce or unreliable become hotspots of invention.
9. *Spell availability:* a magical effect's social impact scales with how many can cast it (spell rank → the pyramid), its cost and who controls it. Effects to switch on per the world's author: resurrection, healing, a certain afterlife, undead labour, divination and scrying, instant communication, truth magic in courts, mind-control law, shapechangers, conjured food, durable magic capital, monetary instability, ancestries' lifespans and growth rates, planar lineages, supernatural geography (dead or wild magic, ley lines, rifts), defences against flight and teleportation in architecture, visible divine legitimacy, adventurers' side effects, rediscovered ancient knowledge.
10. *Calibration:*
    - Canon about Caren and Garyk is evidence: unknown rules are calibrated by ensemble runs, keeping only settings whose results resemble the canon (approximate Bayesian computation), then applied to the rest of Eym, whose results are reported as ranges.
    - Canon seeds neighbouring regions through the travel network.
    - Caren's land is god-shaped: its coastline and terrain are left out when calibrating rules for natural landscape. Its people and history are valid evidence. Northern Caren (ordinary development before the wall fell) is the clean calibration set; southern Caren shows the pacts' modifiers (`docs/eym-canon.md`, the previous campaign).
11. *Output*, run as an ensemble (many runs, each deterministic from its seed; only runs consistent with the fixed history count), labelled as simulated odds:
    - likely cores and peripheries of empires;
    - frontiers and flashpoints;
    - trade networks and plague corridors;
    - the odds of named outcomes;
    - per-run timelines, for inspiration.
    Never written into canon automatically.

### 4. The planar lenses (final phase)

1. *Scale:* the planes are universe-sized, and Eym is part of the Universe. Each lens shows only the portion of a plane linked to Eym, never the whole; its edges are open and fade into the rest of the plane, and nothing beyond Eym's portion is generated. Two levels per lens:
   - a schematic overview of the whole structure, for orientation: not to scale, not explorable;
   - the local view of Eym's portion, where navigation happens.
2. *Three lenses*, as new levels above the system map (the Pathfinder 2e Remaster cosmology). Per plane: one picture, a few named points of interest, and a short description written fresh (not copied from Paizo's text), in the same parchment and pixel-art style.
   - *The overlapping planes:* a vertical stack: Creation's Forge (top), the First World, the Universe, the Netherworld, the Void (bottom). The Ethereal Plane is the medium between them, not a layer. The Universe opens the system map.
   - *The Inner Sphere:* the Universe at the centre and six elemental planes (Fire, Earth, Metal, Water, Wood, Air). Air is a full plane and also the neutral membrane between the other five, so it is drawn both ways.
   - *The Outer Sphere:* the Inner Sphere at the centre, the Astral Plane as the sea around it, and the outer planes around that: Axis, Heaven, Nirvana, Elysium, the Outer Rifts, Abaddon, Hell, the Maelstrom and the Boneyard. Planes with canonical layers (Hell, Heaven and others) may have one step down into a layer, no further. Eym's own places there (where Eym's dead arrive in the Boneyard, for one) are for the world's author.
3. *The overlapping planes' gradient:* the closer a plane is to the Universe, the more it reflects it.
   - *The First World* (one step away, derived from Eym):
     - a smooth, deterministic, reversible warp (regions swell or shrink, coastlines bend, neighbours stay neighbours);
     - caricature that exaggerates each place's distinctive features against the average (taller, sharper mountains; denser forests; wider, more winding rivers; more ragged coasts; more saturated colour);
     - its own field of travel times, independent of the picture.
   - *The Netherworld* (one step away; the same machinery, with opposite settings):
     - ground down: Eym's erosion model run as if over deep time, features pulled toward the average;
     - hollowed out: rivers as dry channels, lakes as empty basins, a shallow, still, dark sea, forests as bare trunks, karst caves and hollow mountains (strongest where the geology supports karst), settlements as empty shells (battle maps may reuse building layouts as roofless ruins);
     - muted: a small dim palette, flat directionless light, a dim sky with few stars;
     - stretched distances.
   - *Creation's Forge and the Void* (two steps away): abstract spaces with no geography, routes or travel distances (the Forge: light and making; the Void: darkness and absence). Anchor points are correspondences with places on Eym, not physical bridges; if they have positions, they are arranged by nature, never by Eym's geography. An optional suggestion for the world's author, not to be built unasked: tectonic anchors (the Forge: ridges, hotspots, springs, deltas; the Void: subduction trenches, craters, drowned places).
   - *"See this place in another plane":* from any spot on Eym, open the same spot in the First World or the Netherworld, and back.
4. *The elemental planes:* abstractions themed on each element. A plane resembles Eym's portion in proportion to how much that element dominates Eym (default: dominance at the surface, the owner's preference), so the Plane of Water's echo is strong and recognisable and may reuse Eym's ocean data (great currents as rivers within the water, trenches as abysses). Anchors from each element's real expression on Eym:
   - Water: currents, trenches, ridges;
   - Air: wind belts, jet streams, storm tracks, cyclones;
   - Earth: mountains, old continental cores;
   - Fire: volcanoes, hotspots;
   - Metal: ore provinces;
   - Wood: forests.
5. *Data:* one canonical planes file (names, axis, position, connective planes, layers). Strengths, points of interest, descriptions and authored overrides (places that exist in only one plane) are for the world's author, with placeholders and seeded defaults until he decides. The generator never invents named places.

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

