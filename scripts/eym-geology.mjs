// Eym's rock and ground (Stage 1b of the physical history and climate programme): what each kind of bedrock
// looks like as land, what it gives a builder and a miner, and the soil that forms on it under each climate.
// The bedrock itself comes from the plates (scripts/eym-cartography.mjs writes it into the cartography raster);
// this module reads it back at any place, for the Region, Local and battle maps, the architecture dossiers and
// the "Here and now" card. Pure functions; nothing here is random.

import { loessAt, windClimate } from "./eym-aeolian.mjs";

const DEG = Math.PI / 180;

/**
 * Each bedrock kind as land, stone and ore. `colour` is the bare rock's colour on battle maps; `battle` is how
 * exposed rock, cliffs and boulders look; `landform` goes into map art direction.
 */
export const ROCKS = Object.freeze({
  "granite-gneiss": {
    name: "granite and gneiss (an old core)", colour: "#a39488", colourWords: "grey-pink",
    landform: "rounded granite domes, tors and bare whaleback ridges, with boulder-strewn slopes and clear, rocky streams",
    battle: "grey-pink granite: rounded boulders, tors and slabs with coarse crystals",
    stone: "grey-pink granite and banded gneiss: hard to cut, so used as rough blocks, with dressed corners on fine buildings",
    ores: ["tin", "gold in quartz veins", "mica and feldspar (for glazes)"],
  },
  "sandstone-shale": {
    name: "sandstone and shale (a basin)", colour: "#b8946a", colourWords: "buff and red",
    landform: "flat-topped benches and scarps; in dry country red and buff mesas and cliffs, in wet country broad gentle vales",
    battle: "buff and red sandstone: flat ledges, square-cut blocks and layered shelves",
    stone: "buff and red sandstone, easy to cut into ashlar; shale splits into flags; plenty of clay for brick and tile",
    ores: ["coal", "ironstone", "salt and gypsum", "brick clay"],
  },
  limestone: {
    name: "limestone (warm shallow seas)", colour: "#d8cfb8", colourWords: "cream-white",
    landform: "white crags, gorges and dry valleys, caves and sinkholes, with springs where the limestone meets clay",
    battle: "cream-white limestone: pitted, fluted pavements, ledges and fallen blocks",
    stone: "cream limestone, cut into fine ashlar and burnt for lime mortar and whitewash",
    ores: ["lime", "lead and zinc in veins", "flint"],
  },
  volcanic: {
    name: "volcanic rock (an active margin)", colour: "#4a4744", colourWords: "dark grey to black",
    landform: "steep volcanic cones and crater lakes, black lava fields, cliffs of columnar basalt and steaming hot springs",
    battle: "dark basalt: black, jagged lava and blocky columns, with rust-red cinders",
    stone: "dark basalt for walls and paving, soft grey and red tuff carved into houses and cellars, pumice",
    ores: ["sulphur", "copper and gold (porphyry)", "obsidian"],
  },
  metamorphic: {
    name: "schist, slate and marble (a collision belt)", colour: "#7d8288", colourWords: "blue-grey",
    landform: "sharp, folded ridges and slaty crags, deep narrow valleys and steep scree",
    battle: "blue-grey schist and slate: sharp, flaky outcrops and shattered scree",
    stone: "slate for roofs, schist rubble walls, and white or banded marble",
    ores: ["silver and lead", "copper veins", "garnet and emerald"],
  },
  // (Caren's people call its white quartzite and its massive white leucogranite "the Godstone": natural rocks of
  // the ancient belt, the hardest it has. The granite's own fluids left the veins round it; quartzite holds little.)
  "godstone-granite": {
    name: "the Godstone (white leucogranite and quartzite)", colour: "#e6e2da", colourWords: "white",
    landform: "smooth white domes and bare walls of massive granite and quartzite, with few joints, that weather very slowly",
    battle: "white Godstone: smooth, massive white granite and quartzite with few cracks",
    stone: "white Godstone in great blocks with few joints: fit for temples and palaces",
    ores: ["tin and tungsten close to the granite", "silver, lead, zinc and copper in veins round it", "little in the quartzite"],
  },
  marble: {
    name: "Caren's marble", colour: "#d7d3cb", colourWords: "banded white and grey",
    landform: "smooth foothills of banded white and grey marble",
    battle: "banded white and grey marble: smooth outcrops and polished slabs",
    stone: "banded white and grey marble: Caren's classic building stone",
    ores: ["marble", "lime", "coal in the old foothill basins"],
  },
  "caren-limestone": {
    name: "limestone and sandstone over Caren's old core", colour: "#d9cfb4", colourWords: "pale cream",
    landform: "even plains of fertile limestone and sandstone, with caves, sinkholes and springs",
    battle: "pale cream limestone: low flat ledges and loose blocks",
    stone: "pale limestone and lime mortar",
    ores: ["lime", "copper beds", "lead and zinc in the limestone", "ironstone", "salt from old dried-up seas"],
  },
});

/** The kinds of bedrock that shake least in an earthquake: hard and little broken (scripts/eym-quakes.mjs). */
const HARD_GROUND = new Set(["granite-gneiss", "godstone-granite", "marble", "metamorphic"]);

/** The soils, in words (the cartography's soil layer uses these keys). */
export const SOILS = Object.freeze({
  "marine-sediment": "sea-floor mud and sand",
  "glacial-mineral": "raw glacial gravel and rock flour",
  "alluvial-fertile": "deep alluvium along the rivers (very fertile)",
  "volcanic-fertile": "dark volcanic ash soil (very fertile)",
  "arid-mineral": "thin desert soil and stony pavement",
  "thin-rocky": "thin, stony mountain soil",
  "tundra-peat": "frozen peat over permafrost",
  podzol: "grey, acid forest soil (poor for crops)",
  laterite: "red, leached tropical soil (poor once cleared)",
  "black-earth": "deep black grassland soil (very fertile)",
  "terra-rossa": "red clay soil over limestone (good for vines and olives)",
  rendzina: "thin dark soil over limestone or marble (good pasture)",
  "sandy-acid": "sandy, acid soil over granite (poor)",
  "stony-loam": "stony loam over schist and slate",
  "leached-humid": "leached, wet soil",
  "temperate-loam": "brown loam (good farmland)",
  loess: "deep, wind-laid loess (very fertile, easily worked)",
});

/**
 * The soil a 1° cell grows from its bedrock and climate. `cell` has bedrock, biome, temperatureC,
 * precipitationMm, riverAccumulation, elevationMaxM, ocean and landCovered.
 */
export function soilFromRock(cell) {
  if (cell.ocean && !cell.landCovered) return "marine-sediment";
  if (cell.biome === "ice-cap") return "glacial-mineral";
  if (cell.riverAccumulation > 6) return "alluvial-fertile";
  const rock = cell.bedrock, wet = cell.precipitationMm, warm = cell.temperatureC;
  if (rock === "volcanic") return wet > 400 ? "volcanic-fertile" : "arid-mineral";
  if (String(cell.biome).includes("desert")) return "arid-mineral";
  if (cell.elevationMaxM > 2500) return "thin-rocky";
  if (cell.biome === "tundra") return "tundra-peat";
  if (cell.biome === "taiga") return "podzol";
  if (rock === "limestone" || rock === "caren-limestone" || rock === "marble") return warm > 14 && wet < 1400 ? "terra-rossa" : "rendzina";
  if (warm > 20 && wet > 1500) return "laterite";
  if (rock === "granite-gneiss" || rock === "godstone-granite") return wet > 1500 ? "leached-humid" : "sandy-acid";
  if (rock === "metamorphic") return "stony-loam";
  if (cell.biome === "steppe") return "black-earth";
  if (wet > 1800) return "leached-humid";
  return "temperate-loam";
}

// ---------------------------------------------------------------- reading the raster back

const cache = new WeakMap();
const decode = (b64) => (typeof Buffer !== "undefined" ? Uint8Array.from(Buffer.from(b64, "base64")) : Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

/** The bedrock and soil layers of a cartography asset, decoded once (null for a world without geology). */
function layers(asset) {
  if (!asset?.raster?.bedrock) return null;
  if (cache.has(asset)) return cache.get(asset);
  const res = asset.resolutionDeg ?? 1, cols = Math.round(360 / res);
  const layer = (field) => ({ categories: asset.raster[field].categories, values: decode(asset.raster[field].valuesBase64) });
  const out = { res, cols, rows: Math.round(180 / res), bedrock: layer("bedrock"), soil: layer("soil") };
  cache.set(asset, out);
  return out;
}

/** Index of the raster cell under a place (rows from the south, columns from 180°W). */
function cellIndex(L, lat, lon) {
  const row = Math.min(L.rows - 1, Math.max(0, Math.floor((lat + 90) / L.res))), col = ((Math.floor((lon + 180) / L.res) % L.cols) + L.cols) % L.cols;
  return row * L.cols + col;
}

/** Great-circle distance (km). */
function distanceKm(a, b) {
  const p1 = a[0] * DEG, p2 = b[0] * DEG, dl = (b[1] - a[1]) * DEG;
  return 6371 * Math.acos(Math.min(1, Math.max(-1, Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl))));
}

/**
 * The rock and ground at a place: the bedrock and soil of its 1° cell (a coastal place in a cell counted as sea
 * takes the nearest land cell's), the rock's look, stone and ores, and the volcanoes within 300 km.
 * Null for a world whose cartography has no geology.
 */
export function geologyAt(asset, lat, lon) {
  const L = layers(asset); if (!L) return null;
  let index = cellIndex(L, lat, lon), kind = L.bedrock.categories[L.bedrock.values[index]];
  if (!ROCKS[kind]) {
    // Search the ring of neighbouring cells for land rock (nearest first).
    let best = null;
    for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) {
      const la = lat + dr * L.res, lo = lon + dc * L.res, i = cellIndex(L, la, lo), k = L.bedrock.categories[L.bedrock.values[i]];
      if (!ROCKS[k]) continue;
      const d = Math.hypot(dr, dc * Math.cos(lat * DEG)); if (!best || d < best.d) best = { d, i, k };
    }
    if (best) { index = best.i; kind = best.k; }
  }
  const volcanoes = (asset.geology?.volcanoes ?? []).map((v) => ({ ...v, distanceKm: Math.round(distanceKm([lat, lon], v.at)) })).filter((v) => v.distanceKm <= 300).sort((a, b) => a.distanceKm - b.distanceKm);
  // A volcanic island too small for the 1° raster is still volcanic rock.
  let soil = L.soil.categories[L.soil.values[index]];
  if (!ROCKS[kind] && volcanoes[0]?.distanceKm <= 30) { kind = "volcanic"; soil = "volcanic-fertile"; }
  // A blanket of wind-laid loess (scripts/eym-aeolian.mjs) a couple of metres or more deep is the soil, whatever lies beneath.
  const climate = windClimate(asset), loessM = climate ? loessAt(climate, lat, lon) : 0;
  if (loessM >= 2) soil = "loess";
  const rock = ROCKS[kind] ?? null;
  return { bedrock: kind, rock, soil, loessM: Math.round(loessM * 10) / 10, soilWords: SOILS[soil] ?? soil, onGodstone: ["godstone-granite", "marble", "caren-limestone"].includes(kind), hardRock: HARD_GROUND.has(kind), volcanoes };
}

/** The rock and ground at a place in one line, for the "Here and now" card. */
export function describeGround(geo) {
  if (!geo?.rock) return "sea floor";
  const near = geo.volcanoes.find((v) => v.activity !== "extinct");
  return `${geo.rock.name}; soil: ${geo.soilWords}${near ? `; ${near.activity} volcano ${near.distanceKm} km away` : ""}`;
}

/** Building stone and ores at a place in one line. */
export function describeStone(geo) {
  if (!geo?.rock) return "—";
  return `${geo.rock.stone}. Ores: ${geo.rock.ores.join(", ")}`;
}

/** The rock kinds under a set of places, by share (for map packets): [{ bedrock, rock, share }]. */
export function rockShares(asset, places) {
  const L = layers(asset); if (!L) return [];
  const counts = new Map();
  for (const [lat, lon] of places) { const k = L.bedrock.categories[L.bedrock.values[cellIndex(L, lat, lon)]]; if (ROCKS[k]) counts.set(k, (counts.get(k) ?? 0) + 1); }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([bedrock, n]) => ({ bedrock, rock: ROCKS[bedrock], share: n / total }));
}

/** What the local rock suggests to a builder, as a line for the architecture prompt. */
export function localStonePrompt(geo) {
  if (!geo?.rock) return "";
  return `Local stone: ${geo.rock.stone}. The land is ${geo.rock.landform}.`;
}
