# Eym Map Server

A small web app, living in the same repository as the Foundry module, that renders battle maps as
**pixel art** without any AI image generation. It runs the module's own deterministic map generator, so
every square, building, wall, door, tree and feature is exactly where the module puts it: only the
drawing changes. The AI image generator in the module remains as an optional alternative.

## Run it

```bash
npm run webapp            # http://127.0.0.1:8787
PORT=9000 HOST=0.0.0.0 CACHE_DIR=/srv/eym-cache CORS_ORIGINS=https://your-foundry.example npm run webapp
```

No dependencies beyond Node 20+. Renders are cached on disk (`webapp/cache/`, or `CACHE_DIR`), keyed by
the map's geometry fingerprint, tier, grid size and renderer version; a repeat request is served from the
cache in milliseconds.

## Use it

- **On its own page:** pick a settlement (and an offset in km) or exact coordinates, a setting, a size, a
  grid density, conditions and map features; Render; download the layers.
- **From Foundry:** set *Map server address* (Game Settings → Eym Planet Map), make a battle map as usual,
  press **Render pixel art**, then **Create scene**. The module sends exactly the inputs it used; the
  server returns the layers and the map's geometry fingerprint, and the module refuses them unless the
  fingerprint matches its own map (so walls, doors, stairs and terrain regions always line up with the
  picture). The scene then uses the pixel-art layers on its Levels.
- **Reaching it from Foundry:** a Foundry page served over https (The Forge) can call a map server on
  `http://localhost` (same machine) or over https elsewhere; plain http to another machine is blocked by
  browsers. The server answers Chrome's Private Network Access preflight, so a Forge page can reach a
  server on the GM's own machine or local network.

## API

| Method | Path | |
|---|---|---|
| GET | `/api/health` | renderer and tiers |
| GET | `/api/options` | settings, sizes, densities, features, settlements |
| POST | `/api/battle-maps` | `{ center: [lat, lon], columns, rows, gridPx, setting, extras, conditions, tier }` → manifest |
| GET | `/api/battle-maps/:id` | manifest |
| GET | `/api/battle-maps/:id/files/:name` | a layer (PNG) |

The manifest lists the layers: `exterior` (outside with roofs), `ground` (outside with every building
opened), `roofs[floor]` (roofs alone, for Foundry's roof layer), `floors[floor]` (upper floors over
transparency, the basement over solid dark), and `preview` (native size).

## Tiers

| Tier | | Where |
|---|---|---|
| 1 | Geometric illustration | the Foundry module's own drawing |
| 2 | Traditional RPG pixel art | **this server, now** |
| 3 | High-definition pixel environments | planned |
| 4 | Volumetric pixel art | planned |
| 5 | Artist-quality procedural pixel art | planned |

Every tier draws the same geometry; a tier is a renderer registered in `server.mjs` (`RENDERERS`).

## Light and shadow

Light is drawn into the pixel art, worked out from where and when the map is (`scripts/eym-battle-lighting.mjs`,
`render/light.mjs`). From Foundry it comes from the campaign clock and the weather. The sun's height and
bearing come from the exact subsolar point for the place; the cloud, rain and fog from the weather; the
season from the date and hemisphere. On the page you choose the time of day, season and weather.

- **Sun shadows** are cast from a height field of the ground, the buildings and everything standing. Cliffs, walls, towers and pillars throw them away from the sun, longer as it sinks. Trees throw stretched crown shadows.
- **Contact shadows** sit at the foot of everything. They are all an overcast sky leaves.
- **Sprites are lit from the sun's side:** tree crowns, rocks, roof facets and block tops. South-facing walls are sunlit or in shade depending on where the sun stands.
- **The colour of the light** changes through the day: neutral by day, golden when low, blue-violet at twilight, moonlit blue at night. Cloud greys and desaturates it, and fog hazes it.
- **Rain** darkens and wets the ground, with puddles that hold the sky.
- **Seasons:**
  - Spring: fresh green, with blossom on some trees.
  - Summer: full leaf.
  - Autumn: orange, gold and red crowns, with warmer grass.
  - Winter: bare broadleaf trees, with conifers kept, and duller grass.
  - Within the tropics trees stay evergreen.
- **Lamps** are lit at dusk and at night: door lanterns, glowing windows, fires, lava, crystals, magic. They show as stepped pools of light in the pixel-art manner and never light the roofs.
- **Indoors** has its own light: daylight through the windows by day, candles in every room and hearths at night. Basements are dark apart from their lamps, and underground settings have no sun.

Each light is cached separately (the light is part of a render's id). The painter's prompt in the module
describes the same light, with its direction, length of shadows, colour and season.

## Tier 2 rendering (`render/`)

- `framebuffer.mjs`: integer RGBA pixels with pixel-art primitives (no anti-aliasing), ordered dithering,
  outlines and whole-number upscaling (each native pixel becomes a k×k block, e.g. 35 px per square ×4 =
  140 px per square).
- `png.mjs`: a dependency-free PNG encoder.
- `materials.mjs`: reusable ground materials (grass with tufts and flowers, furrowed fields, packed earth,
  cobbles, flagstones, marble quays, planks, sand ripples, water with glints, rock with cracks, strata,
  snow, ice, ash, lava, sky, abyss), pinned to world pixel coordinates so neighbouring maps join, with
  hue-shifted colour ramps (cool shadows, warm highlights).
- `sprites.mjs`: trees by setting (broadleaf crowns with lit lobes, conifers, jungle, dead), bushes,
  rocks; buildings with tiled hipped roofs that follow L-shapes and cut corners, half-timbered plaster,
  stone or temple-column walls, framed windows and plank doors; common features (crates, barrels,
  haystacks, fountains, wells, statues and stones, fences and walls, stalls with striped awnings, tents,
  campfires, logs, carts and boats) and a shaded block for the rest; furniture.
- `render-battle.mjs`: natural ground edges that wander (architecture keeps straight edges), shore foam,
  cliff and quay faces, rock under island rims, cast shadows, everything standing drawn north to south;
  interiors; and the layers above.
