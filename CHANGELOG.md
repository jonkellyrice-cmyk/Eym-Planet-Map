# Changelog

## 0.25.4 (2026-11-19)

Part 1 of the owner's consolidated addenda, item 3: the plates' motions agree with what drives them.

- Plate speeds by their drivers (`tools/generate-eym-tectonics.mjs`): a plate with at least a tenth of its edge sinking at a trench moves 50–100 mm a year; one without slabs 10–30 mm a year. The fitted rates are rescaled with each plate's pole kept, so the continents, First Land and the poles do not move; Caren and Garyk keep theirs. The eastern, northern and southern plates slow from 52–61 to 25 mm a year; ocean-1, ocean-4 and micro-2 speed up to 55, and ocean-2, ocean-3 and micro-4 drop to 25. Each plate records its speed, slab share and driver.
- Fixed plumes: two broad antipodal upwellings in the deep mantle (centred at 30° S 100° E and 30° N 80° W, 41° across), fitted so that their margins pass the archipelagos and First Land lies inside. Five hotspots rise on the margins, and each leaves an age-ordered chain of 8–20 seamounts along its plate's motion, one every 4 million years back to 80 million, deeper as they age (`geology.mantle` in the cartography asset). The sea floor shoals over each seamount.
- The history text gains the mantle and the hotspots, and explains the assembly, break-up and accretion by the upwellings and downwellings.
- The look: the coastal ranges of Gaffa, Khohalis and Demani are some 600–700 m lower (their highest points 3,006, 3,222 and 3,333 m, from 3,623, 3,815 and 4,029 m), because a range's height follows the slower plate. No land is gained or lost; the old hotspot swells go and new ones come. Renders were shown to the owner, who approved them.
- Eym's derived data is made again by `npm run build` (the tectonic history kept seed 24; the climate, the cartography, drainage, wind and flow follow), and every stored Region tile is stale once and is made again.
- Tests: `tests/eym-tectonics.test.mjs` gains a test of the mantle rules (speeds follow their drivers; plumes on the upwellings' margins; seamount chains ordered by age). Updated: `tests/cartography-acceptance.test.mjs` re-pins the canonical CSV deliberately, because Eventide's fingerprint covers the tectonic history (nothing loosened); `tests/release-package.test.mjs` updated for 0.25.4.

## 0.25.3 (2026-11-18)

Part 1 of the owner's consolidated addenda, item 6: stored tiles that cannot go stale.

- The Region layer's stored tiles are kept under fingerprints of what they were made from, not a hand-bumped label (`tools/generate-region-fingerprint.mjs`, written to `data/eym/region-fingerprint.json` by `npm run build`): one for the shapes (every module the generator imports, followed automatically, and every data file it reads) and one for the painting. A tile made from older code or data is no longer found under the current name, so it is made again rather than served. (0.25.0 changed the rivers' widths and the stored tiles kept the old ones; that can no longer happen.)
- The map server reports stale tiles (`GET /api/region/stale`) and the fill refreshes them: repainted from the kept shapes when only the painting changed, made again when the shapes are stale.
- The Region layer's painting moved to `scripts/eym-region-paint.mjs`, and the cover classes, their colours and the world-keyed hash to `scripts/eym-cover.mjs` (still exported from `scripts/eym-local-detail.mjs`), so that the painting's fingerprint changes only when the painting does. Nothing draws differently.
- The temporary purge endpoint also takes the current model made from other code or data.
- After this release every stored Region tile is stale once (none was made under a fingerprint) and is made again.
- Tests: `tests/eym-region-layer.test.mjs` checks the fingerprint is current and covers the code and data; `tests/eym-region-store.test.mjs` gains tests of staleness, repainting and remaking, and of shapes read back painting the same picture. Updated: three assertions there that named the bare model (`eym-region-layer-v5`) as the stored version now name the fingerprinted version, and the purge test's current folder and refused names follow it (the bare model's folder is now a stale one that may be purged); the import of the painting functions in `tests/eym-region-layer.test.mjs` moved to their new module. `tests/release-package.test.mjs` updated for 0.25.3.

## 0.25.2 (2026-11-18)

- A temporary, guarded endpoint to delete the stored files of old Region models (`GET /api/region/purge` in `webapp/server.mjs`, with `files` and `remove` in `webapp/region-store.mjs`). Each model keeps its tiles in its own folder, and v1 to v4 hold some 230 MB nothing reads. It is off unless the deployment sets `EYM_REGION_PURGE=on`, only takes a model older than the server's own, only counts unless `confirm` repeats the model's name, and touches only that model's folder in the two Region buckets. It is to be removed once the layers' models settle; `webapp/README.md` ("Purging old Region tiles") and step 7 of `ROADMAP.md` say when.
- Tests: `tests/eym-region-store.test.mjs` gains a test of the endpoint and its guards (its stand-in for Supabase learns to list and delete files); `tests/release-package.test.mjs` updated for 0.25.2.

## 0.25.1 (2026-11-18)

- The Region layer moves to model v5 (`scripts/eym-region-layer.mjs`): 0.25.0 changed its rivers' widths but kept the model at v4, so the tiles already stored at v4 were never made again and the layer still showed the old widths. Under the new name every Region tile is made again with the rivers as wide as the water they carry, and pictures cached under the old name are no longer used.
- Tests: `tests/eym-landforms.test.mjs` expects model v5 (updated, nothing loosened); `tests/release-package.test.mjs` updated for 0.25.1.

## 0.25.0 (2026-11-18)

Stage 4 of Eym's physical history: rivers through the year. With it, the loose ends of Stage 3.

- The rivers' monthly climate (`tools/generate-eym-flow.mjs`, written to `data/planet-cartography/abydos/eventide-flow.json`, 18 KB): four years of the weather sampled every 5 hours over Caren, Garyk and their islands, kept month by month (rain, the share that fell as snow, and warmth). `npm run build` makes it again whenever its sources change.
- River flow (`scripts/eym-river-flow.mjs`): a water balance turns each month's rain and warmth into runoff. Snow lies while it freezes and melts as it warms (headwaters are cooled for their height, so high mountains feed a spring flood). The soil holds some 150 mm. What it cannot hold runs off at once or soaks down to groundwater, which keeps rivers running through the dry season. A big river smooths and delays its flood. Every river and drainage channel gets a flow for every day of the year, with a stage: dry, low, normal, high or in flood.
- Wet and dry years: as on Earth, the oscillation of the great equatorial ocean brings more rain to the eastern side of its basin in a warm year and less to the western side. On top of that is a smooth year-to-year swing of some ±15%. So some years flood and some are droughts. A Garyk river near its delta floods for about five weeks in an ordinary year and not at all in a dry one, and runs low for nearly half of every year.
- Rivers' beds follow the water they carry: Caren's and Garyk's rivers are now 0.7–1.35 times as wide as before, wider where more of the rain runs off (most of Caren) and narrower where less does (much of Garyk). The Region layer, local maps and battle maps show the new widths.
- Battle maps follow the river's stage (`scripts/eym-battle-rules.mjs`):
  - At low water a river's bed is partly bare gravel bars, and it can be waded: knee-deep at the edge of the water (difficult terrain), waist-deep further in (greater difficult), deeper in the middle (swimming).
  - Streams run dry (ordinary ground) or swell (greater difficult terrain).
  - In flood the river and its streams cannot be forded (Athletics DC 20), streams are torrents, and the low ground near them lies under knee-deep floodwater (greater difficult terrain).
  - The GM's note says which. The pictures draw the water at the stage, and the tier-2 pictures now have their own colours for the new ground and for the tide's flats and surf, which had fallen back to grass.
- The "Here and now" card has a River line: the nearest river or stream within 3 km, its stage and flow, its bed, and whether it can be waded at a ford. If it can't, it gives how many days until it can (the delay a crossing adds to a journey); a bed over 400 m wide needs a bridge or a ferry. The map server passes the river's stage through to battle maps, checked field by field.
- Springs: where porous rock (limestone, marble, sandstone, volcanic rock) holds groundwater, streams rise from springs and water seeps out at the foot of slopes, more of both the more rain soaks down. Each wets a small spring-fed fen on gentle ground. Springs are marked on the local map.
- Clean-up of Stage 3:
  - Streams on local and battle maps no longer run ruler-straight down long even slopes or across flat hollows: the water's path is steered by a gentle, world-keyed wander, while the ponds and marsh the land holds are unchanged.
  - The tile store now dates a tile when it is made again, not when it was first made.
  - A battle map made again at the same place (under other weather, tide or river) reuses the land around it, so it comes some 80 times faster; the test suite takes half the time.
  - The 40 Region tiles of the strait between Caren and Garyk were rendered again at v4 (they had stayed at v2).
- The Region layer stays at model v4, but its tiles change with the new river widths and are rendered again after this release (0.25.1 moves it to v5 so that they are).
- Tests: a new `tests/eym-river-flow.test.mjs` (6 tests); `tests/eym-region-store.test.mjs` checks that a tile is dated when it is made; `tests/release-package.test.mjs` updated for 0.25.0.

## 0.24.0 (2026-11-18)

The wind addendum to Stage 3 (owner's note): the wind as a maker of landforms, and the coasts driven by the real wave climate.

- A wind and wave climate (`tools/generate-eym-wind.mjs`, written to `data/planet-cartography/abydos/eventide-wind.json`, 37 KB): four years of the weather and the swell of Stages 2a–2b, sampled every 7 hours over Caren, Garyk and their islands. Off every coast it gives the wave energy and the sand-moving power of the wind arriving from each of 16 directions; over the land, the wind's sand-moving power by direction, the year's rain and how dry the driest season is; and a loess map. `npm run build` makes it again whenever its sources change.
- Coasts now take their wave energy from that climate, not from a fixed measure of how open they are (`scripts/eym-landforms.mjs`). Garyk's coasts facing the trade winds take the biggest seas (about 3.4 m, mostly from the north-east): their hard-rock headlands are cliffs, their beaches wide. Its west coast, in the lee, is calmer: more of it is beach and less is cliff. Caren's western bay stays calm salt marsh.
- Coastal dunes: behind a well-fed beach under strong onshore winds, a belt of dunes up to a couple of kilometres deep, bare sand at the front and grassed behind, with crests up to some 18 m. They are common on Garyk's trade-wind coasts and rare on Caren, whose equatorial winds are light.
- Inland (`scripts/eym-aeolian.mjs`): where the ground is dry, bare and windy, the wind heaps sand into dunes, scours stony desert pavement, and carves yardangs from soft rock. Eym is maritime and humid, so this is limited: nothing on Caren, and in Garyk's dry-season north a few fields of low, grassed dunes with sinuous crests. Nowhere on Caren or Garyk is arid enough for pavement or yardangs (the rules are there for drier places).
- Loess: dust lifted from dry, bare, windy ground with fine sediment is carried with the year's net wind and laid where grass and woods trap it, on lowland and gentle upland. Garyk's dry-season north has a blanket up to about 5 m deep. Two metres or more is the soil (`geologyAt` reports "deep, wind-laid loess (very fertile, easily worked)"), it smooths the land, and it raises how much is farmed on the Region layer and on local maps.
- The Region layer moves to model v4 (`eym-region-layer-v4`): its tiles have new paths in the tile store and are rendered again after this release.
- Caren's and Garyk's outlines are unchanged; the wind works inside them.
- Tests: a new `tests/eym-aeolian.test.mjs` (6 tests). Updated: `tests/eym-landforms.test.mjs` now expects the Region model `eym-region-layer-v4` (was v3), and `tests/release-package.test.mjs` expects 0.24.0.

## 0.23.0 (2026-11-18)

Stage 3 of Eym's physical history: erosion and landforms. Coastlines are unchanged; the land behind them is reshaped.

- Valleys (`scripts/eym-landforms.mjs`): every river cuts a valley sized to its width and the land it drains. In the lowlands it lies in a broad, flat floodplain a few metres to some tens of metres below the land around it, with backswamp marsh beside rivers 200 m wide or more; in high, rough country it cuts a narrow gorge, up to about 430 m deep in Garyk's mountains.
- Drainage: besides the named rivers, the water of every mainland is traced downhill on the 2.2 km lattice (`tools/generate-eym-drainage.mjs`) to 2,443 channels draining at least 800 km² each, which meander and cut their own valleys. They are kept in a file of their own, `data/planet-cartography/abydos/eventide-drainage.json` (313 KB, loaded with the geology); `npm run build` makes it again whenever what it is made from changes.
- Coasts by exposure, rock and tide: each stretch of coast is a beach (dunes behind the most exposed), cliffs (hard rock or rough country; the land behind stands 12–150 m higher), a salt marsh with mudflats (sheltered coasts with big tides), an estuary or a delta (the mouths of big rivers). Caren's coast is mostly beach, with marble cliffs in the south-west, salt marsh in its western bay and two estuaries; Garyk's has metamorphic cliffs in the west and deltas. Neighbouring stretches blend into each other rather than meeting at a line.
- Battle maps and local maps everywhere near a river or the sea change: valleys, floodplain marsh, cliffs, dunes, marsh and mudflat, and streams that wind across flat ground instead of running in straight lines.
- The Region layer moves to model v3 (`eym-region-layer-v3`), so its tiles have new paths in the tile store and are rendered again from the stored shapes after this release.
- Not in this stage: river terraces (tried, and removed because they drew step lines across the map) and spits.
- Tests: a new `tests/eym-landforms.test.mjs` (6 tests); `tests/release-package.test.mjs` updated for 0.23.0.

## 0.22.0 (2026-11-18)

Stage 2c of Eym's physical history: tides from the two moons and the Sun, and tidal flats on battle maps.

- The tide-raising pull of Mitkear, the White Moon and the Red Moon (`scripts/eym-tides.mjs`), each from where it stands over Eym at the moment, from the same orbits as the night sky: the equilibrium tide in its twice-daily, daily and slow parts, reduced by the planet's elastic yielding. The White Moon pulls about 0.88 as hard as Earth's moon, the Red Moon and the Sun about half as hard. The White Moon's tide comes round every 12.4 hours and the Red Moon's every 13.4, so springs and neaps are uneven: some springs much bigger than others, some neaps almost still.
- The tide on each coast: the ocean answers about 2.2 times the equilibrium tide, and a wide, shallow continental shelf (measured from Eym's sea floor) amplifies and delays it. Pouk, behind a 180 km shelf, has a mean range of about 2.2 m (0.5 m at neaps, up to 3.9 m at the greatest springs); Garyk's south-east port and open-ocean islands about 1 m; a few coasts off Caren and Gaffa 5–6 m at springs.
- The "Here and now" card shows the tide on the nearest coast: the height now, rising or falling, the next high and low water (universal time), springs or neaps, and the day's range.
- Coastal battle maps follow the tide by the hour: at low water the sea draws back over the shore, uncovering wet sand flats, tidal mud or weedy rock (difficult terrain; mud greater difficult); at high water the lower beach is shallow surf (difficult terrain); at half tide the map is as before. The waterline moves at a typical slope for the shore (sand 1 in 20, mud 1 in 250, rock 1 in 8). The brief gives the tide and when it turns, the painting prompt names the flats and surf, and the web app's map server passes the tide through.
- Tests: a new `tests/eym-tides.test.mjs` (6 tests); `tests/release-package.test.mjs` updated for 0.22.0.

## 0.21.1 (2026-11-18)

The rest of Stage 2b: low cloud, drizzle and sea fog over the oceans (the aquaplanet addendum).

- A marine cloud layer over the sea and up to about 200 km inland (`weatherAt` in `scripts/eym-weather.mjs`): thickest under sinking air (high pressure, the subtropical belts), over cool water (upwelling and cold currents, from the ocean climate) and at night, and broken up where the air rises into storms. Over a year the sea is 55–73% clouded (it was 45–73%), nearer Earth's ocean cloud cover.
- Drizzle falls from a thick marine layer when nothing heavier is falling: at most 0.2 mm an hour, 3–9% of the time over the sea, most in the stormy mid-latitudes and over cool water. It is rain to everything that reads the weather; the weather report says "drizzle".
- Sea fog where warm air lies over cold water in light winds, away from the doldrums; it is rare, mostly over the cool northern seas, and it sets the fog effect on battle maps.
- The rain was recalibrated with `tools/calibrate-eym-weather.mjs`, which now takes the ocean climate's warm and cool patches into account, so drizzle replaces some shower rain and totals stay as before.
- Tests: a new weather test (cloud over the sea, how often it drizzles and how lightly, no sea fog in the doldrums or deep inland); `tests/release-package.test.mjs` updated for 0.21.1.

## 0.21.0 (2026-11-18)

Stage 2b of Eym's physical history: waves, swell and sailing times.

- Waves at any place and moment (`scripts/eym-sea.mjs`): the wind sea from the local wind, the open water upwind of it (the fetch, to the nearest coast) and how long it has blown, by the standard wave-growth curves, with storm seas saturating near 16 m; and swell from every low and tropical cyclone of the last five days, travelling at its group speed, weakening with distance, sent mostly east and toward the equator by the westerly storms, and stopped by land in between. Over a year the median sea is about 3.3 m in the westerly belts and 1.8 m near the equator.
- Voyages: an all-water route between two places, sailed in 3-hour steps through the weather, waves and currents the ship meets. A steamer makes 9 knots in still water and is slowed by head seas; a sailing ship goes with the wind's strength and angle and tacks to windward, and may take the long way round through the westerlies when that is quicker. The Caren–Garyk crossing by steamer, Pouk to Garyk's south-east port, takes 18–23 days westward (with the trades and the current) and 21–27 days eastward, about the three weeks the layout was set from; by sailing ship 24–33 and 41–58 days.
- The "Here and now" card shows the sea (or "Inland") and the passage across to Garyk or Caren leaving now. Eym's currents file is now fetched the first time a voyage needs it (the 0.20.0 entry said a currents overlay loads it; there is no such overlay yet).
- Coastal battle maps note the sea, the surf on the shore and the Swim DC (Athletics: 10 calm, 15 rough, 20 stormy); the brief and the painting prompt mention the sea, and the web app's map server passes it through.
- Fixed: the battle-map brief and painting prompt read "Weather: [object Object]"; they now give the weather in words.
- Low cloud and drizzle over the sea are left for a step of their own (they change the rain totals and need the weather recalibrated).
- Tests: a new `tests/eym-sea.test.mjs` (8 tests); `tests/release-package.test.mjs` updated for 0.21.0.

## 0.20.0 (2026-11-17)

Stage 2a of Eym's physical history: ocean currents, sea temperature and climate.

- Wind-driven surface currents from the wind belts, Eym's rotation and the coastlines (`tools/generate-eym-climate.mjs`, solved for four seasons on a 2° grid), with Ekman drift and upwelling. A strong circumpolar current runs east in the southern westerlies; gyres and boundary currents form where Caren, Garyk and Gaffa block the flow. The currents are in their own file, `data/planet-cartography/abydos/eventide-ocean.json`, loaded only for the currents overlay; `scripts/eym-climate.mjs` reads them back (`currentAt`).
- A sea-temperature anomaly map by season (`data/eym/climate.json`), carried by the year-round currents: warm and cold wakes keep their sign all year, are at most about 2 °C, are strongest in each hemisphere's winter and fade 20–30° downstream. Each wide equatorial basin has a warm pool in the west and a cold tongue in the east.
- A slow El Niño-like oscillation, deterministic from the clock (three cycles of 3.7, 5.3 and 2.6 years), warming or cooling the east of the great equatorial ocean by up to about 2 °C (`ensoIndex`, `describeEnso`).
- Fed into what exists: coastal and sea temperatures (`seasonalTemperature` takes the anomaly), rain on nearby coasts (wetter beside warm water, drier beside cold), biomes, the weather and battle-map conditions.
- The tropical rain belt follows the Sun through the year, at 0.4 of its declination (weaker than Earth's, as on an aquaplanet). Daily ranges on land are narrowed to 2–4 °C and the inland seasonal swing is weighed down.
- Tropical cyclones form only over sea at 25.5 °C or warmer, so they come from the warm pools: about 58 a year (threshold and rate changed). Rain was recalibrated with `tools/calibrate-eym-weather.mjs`, so mean rainfall matches the climate as before.
- The weather on any given date changes. On the land: 3 of Caren's 128 cells change biome (rainforest and seasonal forest), 1 of Garyk's 109 (steppe to savanna), 18 elsewhere. Caren's and Garyk's stored region tiles are left as they are until Stage 3.
- Tests: a new `tests/eym-climate.test.mjs` (6 tests). Updated: the pinned hash of `docs/system-orbital-distances.csv` in `tests/cartography-acceptance.test.mjs`, because the cartography fingerprint now covers the climate.

## 0.19.0 (2026-11-17)

Gaffa, Khohalis and Demani move to the far side of Eym (the owner's decision); the plates are fitted again.

- Gaffa is centred at 5°N 161°E, twice as far from Caren as Garyk is (about 17,800 km). Khohalis moves 120° east to 52°N 138°E, Demani 180° west to 50°S 166°E. Their latitudes and sizes are kept.
- The tectonic history is fitted again (seed 24): new plates and boundaries, sea floor, 134 volcanoes and bedrock; new coastlines, ranges, rivers, lakes and biomes for the three continents. The First Land story now has the three breaking from Garyk's side and drifting together to the far side of the world, 56–66 mm a year.
- The fit takes two more rules, so the seed it keeps is physically sound: every coastal range stands within 330 km of a convergent edge, and Garyk keeps an old core under its interior. Its coasts get more natural texture (bays and headlands 100–200 km across on rifted coasts) and its old collision belts wander instead of running straight.
- One ocean archipelago, which stood where Gaffa now is (8.8°N 152.4°E), moves whole to 8.8°N 39°E, the open ocean Gaffa left; the other nine are unchanged, byte for byte, as are Caren's and Garyk's coasts.
- Soils, rock, earthquakes and eruptions, and the weather near the three continents follow from the new map.

## 0.18.2 (2026-11-17)

The three seeded continents are named.

- The large eastern continent is **Gaffa** (a hard G), the small northern one **Khohalis**, the small southern one **Demani**. The names replace "the Eastern, Northern and Southern Continent" everywhere: the map labels and gazetteer (no longer marked as placeholders), the coastlines, rivers and lakes, their plates (Gaffa Plate, Khohalis Plate, Demani Plate), the tectonic history, the atlas continent choice, the README and the roadmap.
- Nothing else changes: the same fitted tectonic seed, the same shapes, ranges, rivers and weather. Their internal ids (eastern, northern, southern) stay, so everything drawn from them is the same.

## 0.18.1 (2026-11-17)

Room for the climate stages: the map every view loads is a quarter smaller.

- Eym's geology (the bedrock grid, plates, volcanoes, fault lines and history) moves to its own file, `data/planet-cartography/abydos/eventide-geology.json` (123 KB), fetched the first time something asks about rock or earthquakes: the "Here and now" card, a battle map or an atlas map. Geology changes on a time scale that does not touch play; only earthquakes and eruptions need it, and they need little.
- Every world's height grid is stored as packed 16-bit numbers instead of a JSON list (`scripts/cartography-asset.mjs`). The values are the same.
- Eym's main cartography file goes from 1,749,497 to 1,412,717 bytes (budget 1,750,000); the other worlds' files shrink too. A new test keeps the geology file within 200 KB and out of the main file.

## 0.18.0 (2026-11-17)

Stage 1b of Eym's physical history: soils, rock in the maps and dossiers, earthquakes and eruptions.

- Soils grow from the bedrock and the climate (`scripts/eym-geology.mjs`), not from height alone: terra rossa and rendzina on limestone and Caren's marble, dark fertile ash soils on volcanic ground, sandy acid soils on granite, stony loam on schist, black earth on dry grassland basins, laterite in the wet tropics, podzol and tundra peat in the cold. River valleys stay alluvial.
- Every rock kind says how it shapes the land, what building stone it gives and what ores it holds. Region and local map packets get a "Rock, stone and ores" section and tell the painter how the rock shapes the land; battle maps paint bare rock, boulders, outcrops, ledges and scree in the local rock's colour and name it in the brief; an architecture dossier that says nothing of materials takes the local stone.
- Earthquakes and eruptions drawn by rule (`scripts/eym-quakes.mjs`): each stretch of plate boundary has a yearly rate of quakes (Gutenberg–Richter, from magnitude 3.5; slab quakes under the arcs), each volcano erupts at a rate set by its activity, with an explosivity. Ask by place and dates and each event comes with how strongly it was felt there (Mercalli). Caren's Godstone feels at most faint tremors.
- The "Here and now" card shows the rock and soil, the stone and ores, and the quakes and eruptions of the last 30 days.
- The cartography asset carries the plate boundaries (packed small) for the quakes; the asset stays within its mobile budget.

## 0.17.0 (2026-11-17)

Stage 1a of Eym's physical history: plates, the continents' formation, the sea floor, volcanoes and rock.

- The Eastern, Northern and Southern continents are no longer seeded blobs. They are pieces of an old supercontinent, the First Land, which rifted apart around Garyk; each piece turned about its own pole to where its continent stands today (`scripts/eym-tectonics.mjs`, fitted by `tools/generate-eym-tectonics.mjs` to `data/eym/tectonics.json`). Rifted coasts are smooth with wide shelves; leading coasts carry coastal ranges, volcanoes and island arcs over a trench; cold coasts have fjords; each interior keeps an old collision belt. Their centres and areas are kept (within 10% and 3°), and Eym stays 98.6% ocean.
- Sixteen plates (ten major, six micro), each turning about its own pole; every boundary is convergent, divergent or transform. Garyk's northern ranges stand on its collision with the Northern Garyk Sea Plate, over an old core of granite and gneiss. Caren takes no part: it was set down whole by the gods (the Godstone), and its stated geology is granite, marble and limestone.
- The sea floor follows the plates: mid-ocean ridges, trenches below 7,000 m, wide shelves on rifted coasts and narrow ones on active coasts. The globe draws its shallows from it.
- 152 volcanoes at subduction margins and hotspots, each with an age and an activity level; a bedrock layer (old cores, basins, volcanic margins, collision belts, Caren's Godstone); both in the cartography's new geology section.
- Caren's and Garyk's coasts and the ten ocean archipelagos are unchanged, byte for byte. The three continents' rivers, biomes and the weather on a given date change with them.
- The globe: no more dotted streaks in the sea at deep zoom; sea ice is a grey-cyan, not cloud white; highs and lows have their own layer, off by default; place names are set in the panel's serif and give way where they would overlap.
- `npm run build` makes Eym's derived data again when what it is made from has changed.

## 0.16.6 (2026-11-17)

- The night sky goes to tier 4–5, drawn at the screen's own sharpness (about three device pixels to a CSS pixel on an iPhone): stars as a sharp core in a small glow that follow their brightness, a fine cross on the brightest few and the faint ones as dim dust; the wandering stars as eight-pointed stars in a halo, brighter than any star; Desna's Path as a soft, uneven glow with dark lanes of dust; a smooth sky from zenith to horizon with a faint glow at the horizon; moons with a soft terminator, darker patches and earthshine; the Sun in a corona with rays; a soft veil of cloud.
- Constellation figures are thin, continuous, muted gold lines that stop short of their stars (bright gold when tapped).
- The dome fills the view (on a phone, about a third larger than before), with the four winds just outside it and clear of the help line, which is now one line: "Drag to turn · pinch to look closer · tap to name".
- Names: set beside what they name, never over a star; figure names just outside their figures, in a paler parchment italic; star and body names off-white and upright; every name in a solid halo of the sky's colour. With "All names" only named stars, wanderers and moons are named; figures' names come with the figures. Only what is in view is named.
- Smooth on a phone: stars are stamped from sprites, the background is worked out once for each time, place and zoom and turned with the sky, and while a finger moves the last sharp picture is turned, moved or scaled, then drawn sharp again once it rests.

## 0.16.5 (2026-11-17)

- The night sky reads on a phone. Names are a fixed size on the screen however small the chart is drawn (about 12–13 px for stars, moons and wanderers, 11–12 px for constellations, 15 px for the one tapped); before, a phone drew them at 4–6 px. Where two names would overlap, the less important one gives way (the tapped name, then moons, the pole star, wanderers, named stars by brightness, constellations), and none is drawn over the four winds.
- One art pixel is about 2 screen pixels on every device, instead of a fixed share of the chart; clearly visible stars are at least two pixels by two; the faintest stars are a little brighter.
- A darker, calmer sky: solid overhead, shading toward the horizon only in its outer part; constellation figures in solid, brighter gold; Desna's Path a soft glow instead of a grid of dithered squares.

## 0.16.4 (2026-11-17)

- Roads follow the land. They no longer run along the lattice's eight directions in long straight stretches: each road takes a slightly uneven route over the land, is eased into curves and wanders a little, the same way on the Region layer, the ground detail and battle maps. A road entering a town becomes one of its streets instead of cutting a strip through its lots.
- Region layer (map server): hill country shows its hills (ridges and dells a few kilometres across, with stronger light and shade); lowland country is farmed well beyond the named towns, thinning out to about 40 km from them; the sea's bands follow the shore smoothly, measured exactly within 12 km of it, instead of in blocky octagons; and the edges of the climate's biomes wander instead of running along whole degrees of latitude.

## 0.16.3 (2026-11-17)

- Rivers on Caren and Garyk are rivers again. The traced maps drew each one as a channel of open water 5 to 40 km wide; the ground detail, its battle maps and the map server's Region layer now draw the river that ran down that channel (`scripts/eym-river-courses.mjs`): a course down the middle of it through every fork, 114 m to 1.2 km wide (the main stem broadest, its branches narrower), meandering in bends and loops of its own, with uneven banks. A town that stood on the old channel's bank stays on the river. The rest of the old channel is land again: fields, woods and meadow by the usual rules, with roads no longer routed round it.
- The globe and the atlas reference maps still show the channels; they follow in a later release.

## 0.16.2 (2026-11-17)

- The night sky is now a pixel-art star chart, in keeping with the globe: stars as single pixels or small sparkles by their brightness, the wandering stars as eight-pointed stars, the moons as discs with their phase, the Sun in its rays, Desna's Path as a dithered band, constellation figures as dotted gilt lines, and a gilt compass ring with the four winds in the panel's serif. It is drawn by rule: the same sky always gives the same picture.
- Look closer at the sky: pinch or scroll to magnify (up to six times), and drag to move about once magnified (at the whole sky a drag still turns it). Magnifying only enlarges the chart; no new stars appear. Double-tap to reset.
- Names are off until asked for: tap a star, moon or wanderer to name it (a star in a figure names and lights its constellation). "All names" shows them all.

## 0.16.1 (2026-11-16)

- A pinch on the map zooms the map, never the page. On iPhone Safari the browser was also zooming the whole page, so the two fought.

## 0.16.0 (2026-11-16)

- Eym's globe is pixel art at every zoom, all the way in: the old vector ground no longer takes over at 6×. Close views are drawn from the same coastlines, lakes and mountains at the view's own sharpness, with a finer grain to the ground; past 6× the cloud thins to a veil so the map can be read.
- Turning and zooming the globe are much quicker. Changes are drawn once a frame, at half sharpness while the globe moves and sharp when it rests; the globe is painted straight onto a canvas; the cloud and the close-up land are kept between frames instead of being worked out again.

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
