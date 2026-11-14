# Roadmap

This roadmap was carried over from the Lancer GM Kit and Lancer cluster map, and most of it still applies to Eym. The table gives each item's status as recorded there, then where it stands in this repository now. The weather design below it was agreed on 3 September 2026.

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
