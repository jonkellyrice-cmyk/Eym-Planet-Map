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

## Light and shadow: Foundry's live, the objects' own in the art

Foundry draws everything that changes with the time of day, live, as the clock moves: the sun's direction
and cast shadows, darkness, the colour of the light, lamps coming on, weather. The art therefore carries
only light and shade that are true at any hour:

- **Neutral form light.** Forms are lit from above so they read as solid: tree crowns, rocks, roof facets, block tops.
- **Shadows objects make of themselves:**
  - under eaves and overhangs
  - in the shade beneath tree crowns
  - contact shadows at the foot of buildings, walls, rocks and everything standing, and at the base of cliffs
  - in window recesses
  - indoors, along the foot of every wall, and around each piece of furniture: a soft contact shadow
    that widens with the piece's height, its front darkening toward the floor, a seam under its top, and
    the recesses of shelves, racks and wardrobe doors
- **The season the trees and grass are in** when the map is made: spring blossom, summer leaf, autumn colours, bare winter broadleaves. Within the tropics trees stay evergreen.

Lamps are not painted in. The scene comes with **Foundry lights** on the right floors:

- **Switch on as the scene darkens:** door lanterns, window glow at the street front, a candle in every room, and lamps in cellars.
- **Always lit:** hearths, campfires, lava, crystals, glowing water, magic, and braziers in underground halls.

Foundry handles them with its own lighting and walls. Each sits at a real height on its floor: a hearth's
fire 2 ft, a candle 4 ft (on the free square nearest the room's middle, never inside a tall piece), a
cellar lamp 6 ft, a door lantern 7 ft.

### Objects in the way of Foundry's light

Foundry can only shadow a light behind an object if it knows the object is there and how tall it is.
Every piece of furniture has a height (table 2.5 ft, chest 2, counter 3.5, crates 5, wine rack 6,
wardrobe and shelves 7, pillar 10), and so does every standing feature outside (boulders, statues,
pillars, carts and the rest). Foundry v14's walls have no height of their own: a wall on a Level blocks
every light on that Level. So the scene (`scripts/eym-battle-occluders.mjs`) turns an object into walls
only where it stands taller than a light that reaches it on its floor:

- the wardrobe shadows the room's candle; the table does not, though it does shadow a hearth's low fire;
- the walls block light, and sight too if the object is taller than eye height (6 ft); never movement
  (the grid's terrain says how a square moves) or sound;
- round objects get an eight-sided outline, the rest their rectangle drawn slightly in;
- each wall carries the object's true base and top in `flags["wall-height"]` (`{bottom, top}`, feet),
  the convention elevation-aware wall modules read, so with such a module a light above the object
  passes over it;
- the scene's `flags["eym-planet-map"].occluders` lists every object's footprint, level and height,
  including those too short to shadow anything yet.

Not yet verified in a running Foundry v14: these walls follow the v14 data types; the behaviour has not
been tried live.

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
