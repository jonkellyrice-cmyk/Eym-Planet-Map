// The information packet and art direction that go with a reference map: what the map shows, at what
// scale, what the land and climate are like, and the instructions an image model needs to paint it
// without moving anything. Pure functions; the same map always gives the same packet.

import { environmentField, seaLevelTemperatureC } from "./eym-seasons.mjs";
import { rockShares } from "./eym-geology.mjs";

const BIOME_WORDS = Object.freeze({
  "tropical-rainforest": "tropical rainforest", "seasonal-forest": "seasonal tropical woodland and grassland", savanna: "dry savanna and tableland", steppe: "steppe grassland",
  "temperate-forest": "temperate and montane forest", "temperate-rainforest": "temperate rainforest", taiga: "conifer forest", tundra: "tundra and alpine meadow",
  "ice-cap": "snowfields and glaciers", "cold-desert": "cold desert", "hot-desert": "hot desert",
});
const LEVEL_WORDS = Object.freeze({ planet: "the whole world, in an equirectangular projection", continent: "a whole continent", region: "a region", local: "a town or city and the country around it" });

function place(x, y, W, H) {
  const col = x < W / 3 ? "west" : x > (2 * W) / 3 ? "east" : "", row = y < H / 3 ? "north" : y > (2 * H) / 3 ? "south" : "";
  return row || col ? `${row}${row && col ? "-" : ""}${col}` : "centre";
}

/** What covers the land in the frame, by share of 1° cells (or the single cell under a small map). */
function landCover(asset, frame) {
  const field = environmentField(asset), counts = new Map();
  for (const cell of field.cells) {
    if (cell.ocean) continue;
    if (!frame.wraps && !frame.visible([cell.lat, cell.lon])) continue;
    const [x, y] = frame.project([cell.lat, cell.lon]); if (x < 0 || y < 0 || x > frame.W || y > frame.H) continue;
    counts.set(cell.biome, (counts.get(cell.biome) ?? 0) + 1);
  }
  if (!counts.size) { const cell = field.cellAt(...frame.center); counts.set(cell.biome, 1); }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([biome, n]) => ({ biome, words: BIOME_WORDS[biome] ?? biome, share: n / total }));
}

/** The bedrock under the land in the frame, by share (empty for a world without geology). */
function rockCover(asset, frame) {
  const field = environmentField(asset), places = [];
  for (const cell of field.cells) {
    if (cell.ocean) continue;
    if (!frame.wraps && !frame.visible([cell.lat, cell.lon])) continue;
    const [x, y] = frame.project([cell.lat, cell.lon]); if (x < 0 || y < 0 || x > frame.W || y > frame.H) continue;
    places.push([cell.lat, cell.lon]);
  }
  if (!places.length) places.push(frame.center);
  return rockShares(asset, places);
}

/** How the rock shapes the land, as a sentence for the painter (the two commonest rocks). */
function rockSentence(rock) {
  const main = rock.slice(0, 2).filter((r) => r.share >= 0.15 || r === rock[0]);
  return main.length ? ` The rock shapes the land: ${main.map((r) => `${r.rock.landform} (${r.rock.colourWords} ${r.rock.name.split(" (")[0]})`).join("; elsewhere ")}.` : "";
}

/** The art direction: paint over the reference, keep everything where it is, add no text. */
export function artDirection({ spec, frame, cover, rock = [] }) {
  const climate = Math.abs(frame.center[0]) < 23.5 ? "tropical" : Math.abs(frame.center[0]) < 45 ? "warm temperate" : Math.abs(frame.center[0]) < 62 ? "cool temperate" : "polar";
  const ground = cover.slice(0, 3).map((c) => c.words).join(", ");
  return [
    `Paint this as a hand-drawn fantasy cartographer's map in a rich painterly style: ink linework, layered watercolour washes, subtle aged-parchment texture, gentle wave patterns at sea. Nothing is a flat symbol: mountains, hills, forests, towns, castles and towers are small illustrations in three-quarter view, each showing its south-facing side and its height (peaks with lit and shaded faces, trees with crowns over trunks, towns as clustered roofs and walls), as on illustrated old-world maps and classic 2D role-playing game maps.`,
    `The attached reference image is structurally authoritative. Keep every coastline, island, lake, river channel, mountain range, upland, forest and settlement mark exactly where it is, at the same size and shape. Do not add, remove, merge or move any land, water or settlement. Settlement marks become small illustrated towns, cities, forts or ports at the same spots; keep their relative sizes.`,
    `It shows ${LEVEL_WORDS[spec.level]}${frame.level === "planet" ? "" : `, about ${Math.round(frame.kmPerPx * frame.W / 1.609344)} miles across`}. North is at the top. The land here is mostly ${ground}, in a ${climate} climate; colour it accordingly (pale snow only on the white peaks).${frame.level === "planet" ? "" : rockSentence(rock)}`,
    `Draw no text, labels, letters, numbers, borders, cartouches, compass roses, scale bars or legends: names and markings are added afterwards on a separate layer. Keep the full image filled to the edges, at ${spec.widthPx}×${spec.heightPx} pixels.`,
  ].join("\n\n");
}

/** The full packet as Markdown: the brief, the features with where they are, the land, and the prompt. */
export function mapPacket({ asset, spec, frame, features, title }) {
  const cover = landCover(asset, frame), rock = rockCover(asset, frame);
  const lines = [
    `# ${title}`, "",
    `- Level: ${spec.level} — ${LEVEL_WORDS[spec.level]}`,
    `- Image: ${spec.widthPx}×${spec.heightPx} px${frame.level === "planet" ? "" : `; ${(frame.kmPerPx / 1.609344).toFixed(3)} mi per px; ${Math.round(frame.kmPerPx * frame.W / 1.609344)}×${Math.round(frame.kmPerPx * frame.H / 1.609344)} mi`}`,
    `- Centre: ${frame.center[0].toFixed(2)}°, ${frame.center[1].toFixed(2)}°; north at the top`,
    `- Typical climate at the centre: ${Math.round(seaLevelTemperatureC(frame.center[0]))} °C mean at sea level`, "",
    "## Land cover", "",
    ...cover.slice(0, 6).map((c) => `- ${c.words}: ${Math.round(c.share * 100)}%`), "",
    ...(rock.length ? ["## Rock, stone and ores", "", ...rock.slice(0, 4).map((r) => `- ${r.rock.name}: ${Math.round(r.share * 100)}% — ${r.rock.landform}. Stone: ${r.rock.stone}. Ores: ${r.rock.ores.join(", ")}.`), ""] : []),
    "## Named features on this map", "",
    ...features.map((f) => `- **${f.name}** (${f.featureClass}${f.confidence === "low" ? ", name uncertain" : ""}) — ${place(f.x, f.y, frame.W, frame.H)}`), "",
    "## Art direction", "", artDirection({ spec, frame, cover, rock }), "",
  ];
  return { markdown: lines.join("\n"), prompt: artDirection({ spec, frame, cover, rock }), cover, rock };
}
