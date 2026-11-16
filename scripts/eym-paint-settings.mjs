// Settings for painting maps. The API key and the server address are client-scope (this browser only:
// never sent to the world database or to players) and are edited in the atlas's Image generator
// dialog, not in the shared settings list. The model and quality are world settings anyone can see.
// The canon list is a world setting written only by the GM.
import { DEFAULT_IMAGE_BASE_URL, DEFAULT_IMAGE_MODEL, DEFAULT_IMAGE_QUALITY, IMAGE_MODELS, IMAGE_QUALITIES } from "./eym-image-provider.mjs";
import { CANON_SETTING } from "./eym-canon.mjs";

export const PAINT_SETTING_KEYS = Object.freeze(["imageApiKey", "imageBaseUrl", "imageModel", "imageModelCustom", "imageQuality", CANON_SETTING]);

export function registerPaintingSettings(moduleId) {
  const add = (key, data) => game.settings.register(moduleId, key, data);
  add("imageApiKey", { scope: "client", config: false, type: String, default: "" });
  add("imageBaseUrl", { scope: "client", config: false, type: String, default: DEFAULT_IMAGE_BASE_URL });
  add("imageModel", { name: "Painted maps: image model", hint: "The model that paints atlas maps. The API key is set per browser in the Atlas maps card (Image generator…), never here.", scope: "world", config: true, restricted: true, type: String, choices: { ...Object.fromEntries(IMAGE_MODELS.map((m) => [m.id, m.label])), custom: "Custom (name below)" }, default: DEFAULT_IMAGE_MODEL });
  add("imageModelCustom", { name: "Painted maps: custom model name", hint: "For an OpenAI-compatible server (for example an open-weight model on a local GPU).", scope: "world", config: true, restricted: true, type: String, default: "" });
  add("imageQuality", { name: "Painted maps: quality", scope: "world", config: true, restricted: true, type: String, choices: { ...IMAGE_QUALITIES }, default: DEFAULT_IMAGE_QUALITY });
  add(CANON_SETTING, { scope: "world", config: false, type: Array, default: [] });
}

/** What painting needs, read from the settings (the key only from this browser). */
export function paintingSettings(moduleId) {
  const get = (key, fallback) => { try { return game.settings.get(moduleId, key) ?? fallback; } catch { return fallback; } };
  const model = get("imageModel", DEFAULT_IMAGE_MODEL), custom = String(get("imageModelCustom", "")).trim();
  return { apiKey: String(get("imageApiKey", "")).trim(), baseUrl: get("imageBaseUrl", DEFAULT_IMAGE_BASE_URL) || DEFAULT_IMAGE_BASE_URL, model: model === "custom" && custom ? custom : model === "custom" ? DEFAULT_IMAGE_MODEL : model, quality: get("imageQuality", DEFAULT_IMAGE_QUALITY) };
}

export function canonList(moduleId) { try { return game.settings.get(moduleId, CANON_SETTING) ?? []; } catch { return []; } }
