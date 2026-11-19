# Eym Planet Map

A Foundry VTT v14 module (v13 also supported): an interactive three-dimensional SVG map of a single star system (currently the **Abydos** system), with orbital, planetary-surface and local operational views. It is a single-system edition of the Orphaned Sun Cluster Map, being retooled for a fantasy campaign.

On screen the star is **Mitkear**, Eventide is **Eym**, its moons are **Austarm** (white) and **Chatarm** (red), and the four wandering planets, largest to smallest, are **Iarn**, **Esonth**, **Bruthi** and **Lilta**. These display names live in `scripts/display-names.mjs`. The registry keeps the old canonical names (Abydos, Eventide, White Moon, Red Moon, Tribune, Thraximundus, Ramses, Kandahar) because data files and seeds are keyed by them.

The module id is `eym-planet-map`, so it installs alongside the original Orphaned Sun Cluster Map without conflict.

## Features

- An interactive AU-scale map of all 9 objects of Mitkear's system (Mitkear, Eym, the four wandering planets, Eym's moons Austarm and Chatarm, and Iarn's moon Enoch), keeping physical hierarchical coordinates separate from compressed display coordinates.
- The system is the outermost level: double-click/double-tap or zoom inward from system → body, with a breadcrumb back to the system; zooming out stops at the system.
- A fixed night sky around the system: 2,000 naked-eye stars, the galactic band and a distant sister galaxy, drawn inside-looking-out behind the system view and turning with the camera (see `tools/generate-starfield.mjs`).
- 48 named constellations (24 per hemisphere: 35 discovered in the generated stars plus 13 sculpted by nudging spare stars; 7 chief constellations per hemisphere; 8 on the path of the sun, in order), 4 asterisms and 28 lunar mansions, in plain English with Pathfinder 2e canon deity names where a figure matches a deity's symbol or favored weapon. Stored as star-to-star line data in `data/stellar/constellations.json` (see `tools/constellation-canon.mjs`, `tools/sculpt-constellations.mjs` and `tools/generate-constellations.mjs`).
- **Ground view of the sky:** on Eym's surface map, choose a latitude and longitude (or click a place) and press *Look up from here* to see the sky from that spot at the campaign date and time: stars to the naked-eye limit, named stars, optional constellation lines and names, the four wandering planets, both moons with phases and eclipses, and Mitkear. Daylight and twilight wash out the stars; the moons and the brightest planets can still show by day. A readout gives local sun time, Mitkear's altitude, each moon's phase, place and lunar mansion, and which planets are up.
- **Day, night and the seasons on Eym's globe:** the real terminator with civil, nautical and astronomical twilight bands, following the campaign clock; seasonal snow on land and sea ice that grow and retreat through the year. A **Here and now** card gives any place's date, season (wet and dry seasons in the tropics), sun time, sunrise and sunset, day length, temperature (now, high and low) and whether there is snow on the ground; click a place or type coordinates. The model is `scripts/eym-seasons.mjs`.
- **Weather on Eym** (`scripts/eym-weather.mjs`): mid-latitude lows and highs, tropical waves and tropical cyclones (in season, about 50 a year) are born from a fixed seed and move along their tracks, so the weather at any place and time is computed directly: no background simulation, and a jump of a century costs no more than a jump of an hour. Pressure, wind (geostrophic, turning the right way round lows in each hemisphere), cloud, rain, sleet, snow, thunderstorms and temperature follow from them and the seasonal climate, calibrated so each latitude's rainfall matches its climate over the year (`tools/calibrate-eym-weather.mjs`). Snow cover, ground wetness and flooding are reconstructed over the previous 168 hours in 3-hour steps. The globe shows cloud and rain fields, highs and lows, cyclones, floods and (optional) wind arrows; the Here and now card adds the weather, wind, pressure and its tendency, humidity, the last week's rain, the ground, the next 24 hours and nearby storms; cloud veils the sky in the ground view.
- **Atlas maps** (the Atlas maps card on Eym's surface map): deterministic reference maps of the whole planet, a continent, a region (≈300 mi) or a town and its country (≈25 mi), drawn from the vector coastlines, terrain, water, biomes and settlements. Each comes as a text-free reference PNG for an image model to paint over, a PNG with names, the name layer on its own (SVG) to lay over a painted version, and a packet (.md) with the features, land cover and a painterly fantasy art direction that keeps everything in place. Map sizes use presets from published standards (model-native 1536×1024 and others) or custom sizes; defaults live in Game Settings → Configure Settings, with battle-map presets (5-ft squares: Flip-Mat 24×30 and others; 70/100/140/200 px per square) ready for the battle-map maker.
- **Ground detail** (`scripts/eym-local-detail.mjs`): a seeded detail layer below the 1° data, pinned to the world so the same field, stream or tree is in the same place on every map. From the vector coastlines, water, forest and relief it works out the ground at 10–50 m (Caren's and Garyk's rivers, which the traced maps drew as channels kilometres wide, are drawn as the rivers that ran down them: `scripts/eym-river-courses.mjs`): roughened shores and beaches, rivers, streams that run downhill (a priority flood over the refined terrain, more streams in wetter country), ponds and marsh in hollows, the town's built-up area, fields around towns and along roads, woods, scrub, meadow, rock and snow, roads between settlements, and farmsteads, mills, bridges and fords. The atlas's local level shows it as a **Ground detail** tab and PNG. Below that, a **battle site** gives every 5-ft square of a battle map its cover and height, with trees, bushes, boulders and buildings and the streams, rivers and roads crossing it; it reads a canonical tile around a world-pinned anchor (0.02°), so neighbouring battle maps agree.
- **Painted maps** (GM only; `scripts/eym-image-provider.mjs`, `scripts/eym-canon.mjs`): after making a reference map, **Paint with image model** sends the text-free reference and the art direction to an image model (OpenAI's image-edit API, `gpt-image-1.5` by default; any OpenAI-compatible server, such as an open-weight model on a local GPU or a VPC inference service, by changing the server address). The painting is scaled to the map's exact size and the name layer is laid over it. **Save as canon** uploads the painting, the version with names, the name layer, the reference and the packet to the world's own folder (`worlds/<world>/eym-maps/<level>/`) and records it in the canon list; making the same map again shows its canon painting, and says so if the reference has changed since. A new painting of the same map supersedes the old one, which is kept. Lower levels are painted with the canon level above, cropped to their area, as a style reference, so a region looks like a closer view of its continent. The API key is set in **Image generator…** on the result panel: it is stored only in the GM's browser (a client setting, never in the world or sent to players) and goes only to the configured server (https, or plain http to a local or private address). Model and quality are GM-only world settings.
- **Battle maps** (Battle maps card; `scripts/eym-battle-rules.mjs`, `scripts/eym-battle-settings.mjs`, `scripts/eym-battle-render.mjs`): a Pathfinder 2e battlefield at the Here and now place, laid out by rule from the world and authoritative for play.
  - *The ground comes from the world*: the map is snapped to a world-pinned 5-ft grid and reads the ground detail there (cover, height, water, roads, the town's extent, trees and rocks), so the same place gives the same squares on every map.
  - *Setting*: classified from the ground and biome (city, village, farmland, grassland, savanna, forest, jungle, taiga, tundra, marsh, riverside, coast, hot and cold desert, rocky hills, mountain, snowfield, glacier), or chosen by the GM, including volcanic. Each setting has its own features (fallen logs, thickets, hedgerows, low walls, carts, crates, market stalls, fountains, street trees, dunes, quicksand, scree, ledges, crevasses, seracs, lava channels, fumaroles…), each with its footprint, movement, cover, concealment and height.
  - *Terrain per square*: normal, difficult, greater difficult, hazardous, swim, climb or impassable; lesser, standard or greater cover; concealment; elevation in 5-ft steps. Conditions from the campaign clock change it: snow 15 cm deep makes open ground difficult (60 cm, greater), waterlogged ground turns bare soil to mud (all soft ground when flooding), hard frost freezes streams; streets and roads stay clear.
  - *Towns*: streets and alleys on a world-pinned block pattern, buildings on lots facing the street with walls and one door each, yards and gardens behind, an occasional town square with a fountain or statue, and street trees in planters (villages: lanes, cottages, fences, gardens and trees).
  - *Design rules*: two deployment zones on the opposite edges with the most usable ground (preferring the long axis); a setting hazard in the middle third beside the main route (a risk to take, not a wall); contested high ground halfway between the sides if the ground has none; a centrepiece in the middle; then cover added where a side would cross more open ground than the setting allows, until the setting's cover target is met and both sides have a similar amount of cover in their first 30 ft. Every placement must keep at least two distinct routes between the sides and must not cut any ground off; otherwise it is undone.
  - *Output*: a text-free, gridless reference layout for the image model with a prompt that holds the painting to it (every building, wall, door, trunk, rock, hazard and water edge stays put; colours explained); a tactical overlay for the GM (grid, movement hatching, cover and concealment marks, elevation, deployment zones, routes, choke points, labels); a packet with the analysis, features by square (A1…), hazards and the prompt; and **Create scene** (GM), which uploads the painting (or the layout) to the world's folder and creates a Foundry scene with the 5-ft grid, walls and doors, terrain regions (with Foundry's movement-cost behaviour where available), darkness from the sun's altitude and the weather effect.
- **Height, inclines and sight** (`scripts/eym-battle-terrain.mjs`): natural ground keeps its real slope, and steepness is movement: 20° or more is difficult terrain, 32° greater difficult, 45° a climb. Shaped settings and features add flat levels (terraces, platforms, quays, daises); stepping between levels costs like difficult terrain at 5 ft, is a climb at 10–15 ft, and is a cliff above that, crossed only by stairs, ramps, ladders or flight. Every square knows its ground height and the height of what stands on it: buildings, walls, rock and pillars block sight up to their tops, tree crowns and mushroom caps conceal from 10 ft up, undergrowth conceals what is low in it. Each map reports how much of the field a standing creature, a creature on the highest ground and a flyer over the centre can see (under the ceiling, underground). The reference image shades height and draws cliff edges, and the prompt tells the painter how high things are. In the Foundry scene, cliffs are movement-blocking walls that do not block sight, carrying Wall Height-style bottom and top flags (as do building walls). Each height level is a labelled region, open air is a "fall" region, and underground maps have no sun or weather.
- **Fantastic settings** (chosen in the Setting list; most reshape the ground): canyon city (four terraces 20 ft apart up a canyon wall, rock-cut dwellings, stairs, a river below; the sides face each other along the terraces), cliffside monastery (terraces over an abyss), lake temple city (temples and tall houses on islands between canals, a bridge over every canal, gondolas), sky islands (floating rock over open sky, mirrored so neither side is short of ground, joined by rope bridges), chasm crossing (a stone arch and a rope bridge), planar rift, crystal cavern (chambers and two winding passages that never close, glowing crystals, a 40-ft ceiling), dwarven hall (pillars, a molten-metal channel with two bridges, a dais), treetop city (platforms 20 ft up around colossal trunks, ladders, rope bridges), giant mushroom forest, necropolis (rows of mausoleums), overgrown ruins (with a fallen colossus head), blighted wood and coral shallows. The checklist gains magic and wonders to add anywhere: teleportation circle, ley-line nexus, ring of ward stones, planar rift, elemental vents, levitation disc, rune-sealed door, crystal formations, giant and glowing mushrooms, fey ring, luminous pool, sacred spring, floating stones, a great sacred tree, a fallen colossus head, a dragon skull, petrified warriors, a bone throne, a sky-anchor chain and prayer flags.
- **Three-quarter view** (`scripts/eym-battle-oblique.mjs`): nothing is drawn as a flat top-down symbol. As classic 2D role-playing games draw their towns, the ground is seen from above but everything standing on it shows its top and its south-facing side, so heights read at a glance. The reference the image model paints over is drawn that way:
  - Buildings fit their footprint, with the roof to the north and a front wall with windows and door along the south (so the Foundry roof layer covers exactly the building's squares).
  - Trees show crowns over trunks; boulders, walls, carts, crates, stalls, pillars, statues and towers show their sides, taller things taller (one square of picture per 10 ft, capped).
  - Cliffs and terraces show rock faces, quays show stone faces above the water, and floating islands hang rock into the void.
  - Things are drawn north to south, so nearer things overlap farther ones.

  - This is the generated map itself, not only what the painter is asked for: the same drawing is the scene background when nothing is painted, and it is what the GM previews.
  - Atlas reference maps (planet to local) draw mountains with lit and shaded faces (snow on the peaks), hills as mounds, forests as trees with trunks and settlements as little roofed houses (a keep for a capital, a tower for a fort).
  - Nothing is held to straight lines on the grid. Where one ground meets another (shores, field edges, island rims, cave walls, height levels), the drawing cuts the corners at 45°, so edges read as stepped diagonals. Roofs are hipped, with diagonal hips. Terrace and canyon cliff lines curve and step along their length. Big round things (giant trunks, the sacred tree, stone towers) take stepped-circle footprints, and a stone tower gets an eight-sided wall in the scene. The rules stay on 5-ft squares: a cut corner is drawing only.
  - **Buildings come in shapes** (`scripts/eym-battle-buildings.mjs`):
    - Plain rectangles.
    - L-shapes: a back corner of the lot left as yard, with the street front whole.
    - 45° cut corners: one or both front corners. Temples are cut on all four.

    Houses face the street with their long side. A cut corner keeps its square inside the building (one can stand in it), but it cannot be entered from outside. In the drawing, the interiors and the Foundry walls, the wall runs across that square on the diagonal. An L is drawn as two hipped blocks, the nearer overlapping the farther, and a cut-corner building as its true outline, with angled walls and a hipped roof. Inside, each wing of an L is divided on its own, with a door where the wings meet; stairs and furniture keep out of cut corners. Roofs, floor plans and the roof layer are all cut to the true outline. Dwellings cut into rock and mausoleums stay square.

  Interiors follow suit, with each room's back wall shown with its height and furniture showing its front. The battle-map, interior and atlas prompts all ask for this perspective and forbid flat symbols. The GM's tactical overlay stays a flat rules diagram.
- **Inside the buildings, floor by floor** (`scripts/eym-battle-interiors.mjs`, `scripts/eym-battle-scene.mjs`): every building is laid out inside, pinned to the building so it never changes. Each floor is split into rooms with a door through every dividing wall (so every room can be reached), the outer walls have the street door and windows, and furniture suits each room (common rooms, shops, kitchens, storerooms, bedrooms, studies, cellars, temple naves and vestries, crypts with sarcophagi) and stands against the walls, never in a doorway or on the stairs. Taller houses have an upper floor, some houses a cellar, temples sometimes a crypt, mausoleums always. Stairs take the same squares on every floor. **Paint interiors** paints each floor (matching the painted outside), and **Create scene** on Foundry v14 builds one native Scene Level per floor:
  - **Ground**: the outside with every building opened up, plus one overhead roof layer that Foundry reveals only where a token can see beneath it. Walk through a door and that building's roof clears to show its rooms; the rest of the map, and the other roofs, stay as they were.
  - **Upper floors**: drawn only where buildings reach that floor, with the ground level visible around them, so the outside stays in view while the floor below is hidden under the building. Windows let tokens see out.
  - **Basement**: only the cellars and crypts, solid dark around them, with no other level in view: underground, nothing outside can be seen.
  - Walls, doors and windows are on their own floors. Each staircase is a region on both floors it joins, with Foundry's change-level behaviour, so a token stepping onto it is offered the floor above or below.
  - On Foundry versions without Scene Levels the scene falls back to a single image.
- **Map features** (Battle maps card → Map features): a checklist of 45 things a battle map can have besides its ground, in ten groups: sacred places (shrine, wayside shrine, altar, standing-stone circle, graveyard, obelisk, statue), dungeons and caves (dungeon entrance, cave, mine, trapdoor), fortifications (wooden palisade with a gate, watchtower, stone tower, earthwork, trench, sharpened stakes, barricade), camps and travellers (camp, wagon circle, wreck, signpost, beacon), town and farm (well, market stalls, livestock pen, beehives, haystacks, gallows), ruins (ruined temple, walls, columns, giant bones, cairn), water (jetty, rowboat, pond), wilderness (hunting blind, tree platform, fallen trees, boulder field), magic (magic circle, portal arch) and traps. Each is placed by its rule: objectives in the middle, camps and hives on a flank, fortifications on the side that holds the ground (a palisade's gate faces the attackers; lines of stakes or trenches leave a gap), wells and signposts by a road, jetties at the water's edge, blinds in the woods, caves against rock. Features keep 15 ft apart where they can and obey the design rules (two routes, nothing cut off); anything that cannot be placed is listed, never forced. **Traps are hidden**: they go on the routes the sides will take, look like ordinary ground, are never drawn in the reference or mentioned to the image model, and appear only on the GM's overlay, in the packet and as GM-only regions in the scene.
- **Architecture dossiers** (Battle maps card → Architecture dossiers…, GM only): write once how a people builds (people, overview, materials, roofs, streets, walls and defences, shrines and temples, details and motifs, colours), and the dossier goes into the image prompt of every battle map, and every region and local atlas map, made where it applies. Dossiers live in nested folders; they can be edited, moved, archived (kept but hidden from the choices) or deleted, and deleting a folder moves its contents up a level. Each is linked to areas (a place and a radius): pick a dossier by hand for a battle map and it is linked to that area (the nearest named settlement within 5 km, or the spot itself), so returning there later picks it automatically; where areas overlap, the smallest wins. Links can also be added or removed in the dossier. Stored in a world setting.
- Eym's five continents (see below), drawn from vector coastlines with forest, mountain and peak overlays; zoom in to 30× to read Caren's towns.
- Three other terrestrial worlds (Bruthi, Esonth, Lilta) with accepted deterministic 2° cartography: coastlines, elevation/contours, hydrology, ecoregions, soils, resources, settlements, permanent cultural gazetteers, and transport geometry.
- Four non-cartographic natural bodies with accepted deterministic local surveys (the three moons and the gas giant Iarn).
- Culture-aware permanent names (Vadan for Abydos; the Aurethic, Vostrann, Xuānhari and Union naming cultures remain available for new systems).
- Zoom-dependent SVG level of detail keeps orbital, regional, and close inspection useful on desktop and mobile without unbounded DOM growth.
- Desktop: drag to rotate, mouse wheel to zoom, double-click empty space to reset the camera. Mobile/touch: one-finger drag rotates; pinch zooms.
- One campaign clock in Eym's calendar (play/pause, step, set date and time). System views resolve deterministic Keplerian planet/moon positions and body rotations from it on demand; no frame-by-frame astronomy simulation runs.
- No runtime third-party libraries or CDN calls.

## Map server (pixel art, no AI)

`webapp/` holds a small web app that renders battle maps as **pixel art** from the same deterministic map the module builds: same squares, buildings, walls, doors, stairs and features, only a richer drawing. Run it with `npm run webapp`, set **Map server address** in Game Settings, and press **Render pixel art** on a battle map before **Create scene**. The module checks that the server built the very same map (a geometry fingerprint) before using its layers. Tier 2 (traditional RPG pixel art) is there now, with Tiers 3–5 planned on the same pipeline. Time-of-day light and shadow stay Foundry's, live; the art carries only the shadows objects make of themselves and the season, and scenes come with their lamps as Foundry lights at real heights, plus every object taller than a lamp near it encoded as a light-blocking wall with its height, so Foundry casts the shadows. The AI image generator stays available as an alternative. See `webapp/README.md`.

## Eym and its sky

- **Mitkear**, the sun, is as bright as Earth's Sun (G2V, 1.00 solar luminosity): about 1.02 solar masses and 3.5 billion years old, which comes to the same brightness.
- **Eym** is an Earth twin: 1 AU, Earth's radius, mass and gravity, 23.44° tilt (precessing every ~25,772 years; obliquity rocking 22.1°–24.5° over ~41,000 years), eccentricity 0.0167 and an Earth-like magnetic field (a dipole tilted about 10°, its north pole over open ocean toward 100° E, so that Caren and Garyk never see an aurora: see `docs/eym-canon.md`, the canon notes).
- **Eym's surface** is five continents in a planet-wide ocean (98.6% water, 7.3 million km² of land):
  - **Caren**, 590,000 sq mi (1.53 million km²), straddles the equator, centered on 0°, 0°. It is traced from its source map with its coastline, islands, lakes, great rivers, mountains, forests, 4 nations, 81 settlements and 39 named features.
  - **Garyk**, four fifths of Caren's size, lies slightly north of the equator (centered 15°N, 79.8°W), west-north-west of Caren. From Caren's north-west port (Pouk) to Garyk's south-east port is three weeks by steamer: 7,780 km on the great circle, taken as 8,400 km sailed at an average 9 knots. It is traced from its map with its 51 settlements, grouped by realm colour (yellow, red, magenta, green, blue, orange) and not yet named.
  - **Gaffa** (a hard G), the largest (1.6× Caren), lies near the equator on the far side of Eym (centred 5°N, 161°E), twice as far from Caren as Garyk is: about 17,800 km. **Khohalis** in the north and **Demani** in the south (about 0.65× and 0.55× Caren) lie near it, at 52°N 138°E and 50°S 166°E, in taiga and tundra. These three are pieces of an old supercontinent (the First Land) that broke from Garyk's side and were carried by the plates to where they stand (`data/eym/tectonics.json`); ten island chains in the open ocean are seeded. Caren, set down whole by the gods, takes no part in the plates.

  How to change it: the layout and seed are in `scripts/eym-world-inputs.mjs` (see "Changing Eym's world" below). The traced continents are `data/eym/traced-continents.json` (from `tools/trace-eym-continents.py` and the two source maps, which are not stored in the repository). Caren's labels and Garyk's markers are `data/eym/caren-labels.json` and `data/eym/garyk-markers.json`; most of Caren's settlement names were read from small text and are marked `"confidence": "low"`, so correct them there. After any change, run `npm run build`: it makes the tectonic history again if its sources changed (`tools/generate-eym-tectonics.mjs`), sets Eym's input fingerprint in its registry row, and regenerates the geography, cartography and atlas snapshot; it does nothing when nothing changed.
- **Rock, soil, earthquakes and eruptions.** The bedrock follows the plates; soils grow from it and the climate; each rock says how it shapes the land, what stone it gives and what ores it holds (`scripts/eym-geology.mjs`). Earthquakes and eruptions are drawn by rule from the plate boundaries and volcanoes, the same whenever they are asked for, and can be looked up by place and dates with how strongly each was felt (`tremorsAt` in `scripts/eym-quakes.mjs`). The "Here and now" card shows them for the chosen place; map packets, battle maps and architecture prompts use the local rock.
- **Time.** Eym's year is exactly 350 days of 24 hours × 60 minutes × 60 seconds. Because Eym's year is as long as Earth's, each Eym second is 1.0435 SI seconds; every day and hour value in the registry is in Eym units.
- **Calendar.** Twelve months with Gregorian names, each exactly 28 days (4 weeks), then the 14-day **Year's End** holiday (month 13 in the clock's date inputs). Every month and every year begins on a Monday. The calendar follows the seasons: the March equinox falls at noon on 20 March every year. Years count from the new calendar; the campaign begins on **Sunday, 14 March, year 50**, at 08:00, and the clock starts there.
- **Moons.** **Austarm**, the white moon (382,029 km, 0.50° across), has phases that repeat every 28 days and set the month. **Chatarm**, the red moon (195,000 km, 0.40° across), cycles every 9.77 days, so the two are only full together roughly every 7½ months. Their combined tides equal Earth's on average: great tides (~1.35×) when they line up, slack tides (~0.4×) when they are 90° apart.
- **Moon events.** `scripts/moon-events.mjs` computes phases, double full moons and double dark nights (both within 12 hours, about every 9 months), solar eclipses (Austarm's are total or annular like Earth's Moon's; Chatarm is too small to cover Mitkear), lunar eclipses, Chatarm passing in front of Austarm, and combined tides. Both moons' nodes regress and periapses advance like Earth's Moon's, so eclipse seasons drift through the calendar. `npm run moons:almanac -- 50` lists a year's events with the lunar mansion each falls in.
- **The pole star.** Cynosure (Golarion's North Star in Pathfinder canon, home of Desna's palace) stands 0.7° from Eym's north celestial pole at magnitude 1.4, at the waist of the Hourglass, which turns around it through the night. Like Earth, Eym has no bright southern pole star; the Bell hangs around the south pole.
- **Named stars.** The 21 brightest stars and Cynosure have their own names, about Earth's count of household-name navigation stars; most also belong to a constellation, as Polaris belongs to the Little Dipper. Three are named for Pathfinder 2e canon gods of the night sky: Pulura (the brightest, high in the north), Ketephys (in the Stag) and Ashava (a lone bright star). Southlight, deep in the south, is the southern guide star.
- **The wandering stars.** Besides Eym there are exactly four planets, all naked-eye wanderers. Largest to smallest: Iarn (the gas giant, brightest about magnitude −5.9), Esonth (the next world out, −6.7), Bruthi (an inner world seen as a morning or evening star, −3.5) and Lilta (−3.6). Fainter worlds (Cataphract, Sumatra, Ventus) were removed.
- **The other worlds** keep their original architecture: every orbit was scaled by 1/0.68 when the star changed, and periods follow Kepler's third law.

## History

- About 50,000 years ago the elves began building civilization.
- About 40,000 years ago, the dragons.
- Between 20,000 and 10,000 years ago, humans, dwarves and the other peoples.
- Recorded history reaches back about 10,000 years for most of Caren.
- The present calendar is new: the campaign opens in its year 50.

**Astral travel (dormant).** Routes, relativistic voyages, the ship marker, the navigation profile and the second (shipboard proper time) clock are commented out in place, marked `ASTRAL TRAVEL (dormant)`, so they can be revived later.

## Data

`docs/system-orbital-distances.csv` is the canonical object registry. Accepted detail lives beside it: planetary cartography under `data/planet-cartography/` and `data/planet-geography/`, local operational surveys under `data/body-operations/`, epoch orientations under `data/astronomy/`, superstructure identities in `data/superstructure-identities.json`, and the night sky under `data/stellar/`. `exports/` holds the frozen reference-sheet bundle derived from them.

Every generated asset records its permanent seed, model version and source fingerprint, and regenerates byte-for-byte.

## Installing from a manifest

In Foundry, install the module with this manifest URL:

`https://github.com/jonkellyrice-cmyk/Eym-Planet-Map/releases/latest/download/module.json`

That URL resolves once a GitHub release exists. Releases are built by `.github/workflows/release.yml` when a commit whose message contains `[release]` is pushed to `main`; it packages `eym-planet-map-v<version>.zip` and attaches it with `module.json`.

## Compatibility

- Game system: **Pathfinder Second Edition** (`pf2e`) **7.0+**, targeted at **8.6.1** (the campaign's version, which itself needs Foundry 14.361–14). Nothing in the module depends on PF2e rules; the system is declared so it is offered in PF2e worlds.
- Foundry VTT: **14** (targeted at v14 Stable, build 370, the campaign's version; `verified` is set to 14.370) and **13** (still supported). PF2e 8.x runs on Foundry v14 and PF2e 7.x on v13. As of 0.12.0 the module has been checked in a headless browser, not yet in a live v14 world.
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
npm run moons:almanac -- 50
```

## Changing Eym's world

Eym's world is made by rule from a few inputs and everything else follows from them: the plates, the ocean, the coasts, heights, biomes and rivers, the drainage, the wind and the rivers' flow. The inputs are:

- the dials, all in `scripts/eym-world-inputs.mjs`: where the continents lie and how large they are (each seeded continent's `areaCarens` is its size as a multiple of Caren's), the plates' speed rules, the sea floor's shape, the ocean's settings (how far the wind belts follow the Sun, how much the sea floor steers the currents, the strength of upwelling), and the shelf seas' (which coasts are surveyed, what counts as a bay, the limits on a funnel's tide and a storm's surge);
- the drawings: the traced maps of Caren and Garyk (`data/eym/traced-continents.json`) and their labels;
- the exceptions: `data/eym/overrides.json`, for places where a person judges the rules' result wrong for the setting. Each override says what it sets (temperature or rainfall, which the biome then follows; or the biome, soil or resource itself), where (a box or a list of places) and why. They are applied last and listed in every report.

To change the world, change an input and let the tools carry it through:

```bash
npm run world           # rebuild everything made from the inputs, check it, and report what changed since HEAD
npm run world:report    # check and report only (no rebuild); add -- --base v0.25.5 to compare with another commit
```

`npm run world` (`tools/world.mjs`):

1. runs the build until it is finished, the plate fit's many steps included;
2. checks the world against the standing rules (`tools/world-checks.mjs`): the owner's coasts of Caren and Garyk unchanged, 98–99% ocean, rivers that end somewhere, settlements on land, plates at speeds their drivers allow, and that every derived file is up to date. A rule that must hold and does not is an error; a rule that should hold is a warning;
3. compares the world with the commit, layer by layer (`tools/world-snapshot.mjs`): land, each continent's coast, heights and biomes, rivers, names, plates, the ocean. Changes past the look-at thresholds (`LOOK_AT`: a tenth of a continent's cells changing biome, a coast moving, sea temperature by more than 1.5 °C, and so on) are flagged for a person's look;
4. writes `reports/world/latest/report.md` with before-and-after pictures (`tools/world-maps.mjs`). The folder is not committed.

Pinned values are in `tools/world-pins.json`. The *fixed* pins (Caren's and Garyk's coastlines) are invariants no tool changes. The *managed* pins follow the world (the registry file's hash): a rebuild that moves one says so in the report, and `node tools/world.mjs --accept-pins --note "why"` records it once the change is accepted.

After a release that changes the world or the painting, the stored Region tiles are stale. One step refreshes them and removes the sets nothing reads any more:

```bash
npm run tiles:refresh -- --purge   # refill every frame on the map server, check nothing is stale, purge superseded sets
```

(The purge works only while the deployment has `EYM_REGION_PURGE=on`; see `webapp/README.md`.)

The refresh sends several requests at once, each working on its own range of a frame's tiles (`--concurrency`, 16 unless told otherwise; `--chunk`, 24 tiles a range, as the server plans them), tries a refused request again after a growing wait, and ends with an account of the run: tiles examined, already current, repainted, made again, uploads, the time taken and where the servers' time went (making tiles, the first tile's warm-up, uploads, table writes). `--force` makes and stores again the tiles that are already current, the same bytes under the same names: for timing a full refresh.

### Adding a system to the world

A new system that makes derived data joins the same chain, so that it follows every later change by itself. `tests/world-tooling.test.mjs` fails until it does all of these:

1. Its generator is `tools/generate-eym-<name>.mjs`, writes one data file, and exports a `…SourcesSha256()` fingerprint of what it is made from (kept in the file as `sourcesSha256`).
2. Its dials are a group in `scripts/eym-world-inputs.mjs`, named in an exported `…_INPUTS` list and included in that fingerprint with `inputsFingerprint(...)`. It fingerprints only the groups it uses, so its dials do not make other systems rebuild.
3. `tools/build-generated.mjs` runs it when its fingerprint moves, after the steps it depends on.
4. `tools/world-snapshot.mjs` reads its file (`WORLD_FILES`), summarises it, and compares it in a section of the change report, with look-at thresholds in `LOOK_AT`.
5. `tools/world-checks.mjs` holds its standing rules and checks it is up to date.

The survey of the coasts (`tools/generate-eym-coasts.mjs`, 0.27.0) was added this way and is the pattern to copy.

## Coordinate model

System navigation retains the established physical coordinate model. Operational assets explicitly declare whether their geometry is physical, a physical reference-epoch snapshot, a constrained estimate, or an uncertain observation volume. Belt layouts are reference-epoch snapshots; anomalies remain observational/uncertain; gas giants use atmospheric coordinates rather than a fictitious solid surface. The night sky uses the same system frame. See `docs/IMPLEMENTATION_NOTES.md`.
