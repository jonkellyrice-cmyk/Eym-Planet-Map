// The map defaults, as Foundry settings (Game Settings → Configure Settings → Eym Planet Map). Each
// choice is a published standard or "custom", with the custom numbers alongside; the atlas panel and
// the battle-map dialog start from these and can override them per map.
import { ATLAS_IMAGE_PRESETS, BATTLE_SIZE_PRESETS, DEFAULT_ATLAS_IMAGE, DEFAULT_BATTLE_SIZE, DEFAULT_GRID_DENSITY, GRID_DENSITY_PRESETS, MIN_GRID_PX } from "./eym-map-presets.mjs";

const choices = (presets) => ({ ...Object.fromEntries(presets.map((p) => [p.id, p.label])), custom: "Custom (use the numbers below)" });

export const MAP_SETTING_KEYS = Object.freeze(["atlasImage", "atlasWidth", "atlasHeight", "battleGridDensity", "battleGridPx", "battleSize", "battleColumns", "battleRows", "battleOrientation"]);

export function registerMapPresetSettings(moduleId) {
  const add = (key, data) => game.settings.register(moduleId, key, { scope: "world", config: true, ...data });
  add("atlasImage", { name: "Atlas maps: image size", hint: "Size of planet, continent, region and local reference maps. 1536×1024 and 1024×1024 are what current image models produce natively.", type: String, choices: choices(ATLAS_IMAGE_PRESETS), default: DEFAULT_ATLAS_IMAGE });
  add("atlasWidth", { name: "Atlas maps: custom width (px)", type: Number, default: 1536, range: { min: 256, max: 8192, step: 1 } });
  add("atlasHeight", { name: "Atlas maps: custom height (px)", type: Number, default: 1024, range: { min: 256, max: 8192, step: 1 } });
  add("battleGridDensity", { name: "Battle maps: pixels per square", hint: "Forgotten Adventures and Czepeku use 140 px; Foundry's default is 100 px.", type: String, choices: choices(GRID_DENSITY_PRESETS), default: DEFAULT_GRID_DENSITY });
  add("battleGridPx", { name: "Battle maps: custom pixels per square", type: Number, default: 140, range: { min: MIN_GRID_PX, max: 400, step: 1 } });
  add("battleSize", { name: "Battle maps: size in 5-ft squares", hint: "A Pathfinder Flip-Mat is 24×30 squares.", type: String, choices: choices(BATTLE_SIZE_PRESETS), default: DEFAULT_BATTLE_SIZE });
  add("battleColumns", { name: "Battle maps: custom width (squares)", type: Number, default: 24, range: { min: 4, max: 120, step: 1 } });
  add("battleRows", { name: "Battle maps: custom height (squares)", type: Number, default: 30, range: { min: 4, max: 120, step: 1 } });
  add("battleOrientation", { name: "Battle maps: orientation", type: String, choices: { auto: "As the preset", landscape: "Landscape", portrait: "Portrait" }, default: "auto" });
}

/** The saved defaults, as the inputs battleMapSpec and atlasMapSpec take. */
export function savedMapDefaults(moduleId) {
  const get = (key, fallback) => { try { return game.settings.get(moduleId, key); } catch { return fallback; } };
  const atlasImage = get("atlasImage", DEFAULT_ATLAS_IMAGE), density = get("battleGridDensity", DEFAULT_GRID_DENSITY), size = get("battleSize", DEFAULT_BATTLE_SIZE);
  return {
    atlas: atlasImage === "custom" ? { image: "custom", width: get("atlasWidth", 1536), height: get("atlasHeight", 1024) } : { image: atlasImage },
    battle: {
      ...(density === "custom" ? { density: "custom", gridPx: get("battleGridPx", 140) } : { density }),
      ...(size === "custom" ? { size: "custom", columns: get("battleColumns", 24), rows: get("battleRows", 30) } : { size }),
      orientation: get("battleOrientation", "auto"),
    },
  };
}
