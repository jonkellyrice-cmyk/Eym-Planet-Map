// Map presets: the standard sizes people actually use, plus custom values. Battle maps are measured
// in PF2e's 5-ft squares; atlas maps (planet, continent, region, local) by how much ground they cover.
// Every preset can be overridden; these are starting points, not limits.

/** Pixels per grid square, from published Foundry maps. */
export const GRID_DENSITY_PRESETS = Object.freeze([
  { id: "foundry-100", label: "Foundry default (100 px)", px: 100, source: "Foundry core default; Atropos/Tom Cartos older maps" },
  { id: "fa-140", label: "Forgotten Adventures / Czepeku (140 px)", px: 140, source: "Forgotten Adventures and Czepeku battle maps" },
  { id: "hd-200", label: "High detail (200 px)", px: 200, source: "Atropos/Tom Cartos newer maps" },
  { id: "light-70", label: "Light (70 px)", px: 70, source: "many older maps; smaller files" },
]);
export const DEFAULT_GRID_DENSITY = "fa-140";
/** Foundry will not draw a grid finer than this. */
export const MIN_GRID_PX = 50;

/** Battle map sizes in 5-ft squares (width × height, landscape where it matters). */
export const BATTLE_SIZE_PRESETS = Object.freeze([
  { id: "flip-mat", label: "Flip-Mat (24×30)", columns: 24, rows: 30, source: "Paizo Pathfinder Flip-Mats: 24″×30″ with 1″ squares" },
  { id: "half-flip-mat", label: "Half Flip-Mat (15×24)", columns: 15, rows: 24, source: "one fold of a Flip-Mat" },
  { id: "common-digital", label: "Common digital (23×16)", columns: 23, rows: 16, source: "3220×2240 at 140 px creator template" },
  { id: "foundry-example", label: "Foundry example (40×30)", columns: 40, rows: 30, source: "Foundry's content-creation guide (4000×3000 at 100 px)" },
  { id: "large-encounter", label: "Large encounter (40×40)", columns: 40, rows: 40, source: "open-field and wilderness fights" },
]);
export const DEFAULT_BATTLE_SIZE = "flip-mat";
export const FEET_PER_SQUARE = 5;

/** Atlas levels, from the whole planet down to a town and its surroundings. */
export const ATLAS_LEVELS = Object.freeze([
  { id: "planet", label: "Planet", acrossMiles: null, labels: ["continent", "capital", "region"] },
  { id: "continent", label: "Continent", acrossMiles: null, labels: ["continent", "region", "range", "lake", "river", "forest", "capital", "city"] },
  { id: "region", label: "Region (≈300 mi)", acrossMiles: 300, labels: ["region", "range", "mountain", "hills", "lake", "river", "forest", "valley", "grove", "islands", "capital", "city", "town", "fort", "port"] },
  { id: "local", label: "Local / city (≈25 mi)", acrossMiles: 25, labels: ["region", "mountain", "hills", "lake", "river", "forest", "valley", "grove", "islands", "capital", "city", "town", "fort", "port", "village"] },
]);

/** Atlas image sizes. 1536×1024 and 1024×1024 are what current image models produce natively. */
export const ATLAS_IMAGE_PRESETS = Object.freeze([
  { id: "model-landscape", label: "Model native, landscape (1536×1024)", width: 1536, height: 1024 },
  { id: "model-square", label: "Model native, square (1024×1024)", width: 1024, height: 1024 },
  { id: "model-portrait", label: "Model native, portrait (1024×1536)", width: 1024, height: 1536 },
  { id: "print-2k", label: "Large (2048×1536)", width: 2048, height: 1536 },
  { id: "planet-2to1", label: "Planet 2:1 (2048×1024)", width: 2048, height: 1024 },
]);
export const DEFAULT_ATLAS_IMAGE = "model-landscape";

const KM_PER_MILE = 1.609344;
const clampInt = (value, min, max, fallback) => { const n = Math.round(Number(value)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };

/** Resolve a battle-map choice (preset ids or custom numbers) into a full specification. */
export function battleMapSpec({ density = DEFAULT_GRID_DENSITY, gridPx, size = DEFAULT_BATTLE_SIZE, columns, rows, orientation = "auto" } = {}) {
  const densityPreset = GRID_DENSITY_PRESETS.find((p) => p.id === density);
  const sizePreset = BATTLE_SIZE_PRESETS.find((p) => p.id === size);
  const px = clampInt(gridPx ?? densityPreset?.px, MIN_GRID_PX, 400, 140);
  let cols = clampInt(columns ?? sizePreset?.columns, 4, 120, 24), rws = clampInt(rows ?? sizePreset?.rows, 4, 120, 30);
  if (orientation === "landscape" && rws > cols) [cols, rws] = [rws, cols];
  if (orientation === "portrait" && cols > rws) [cols, rws] = [rws, cols];
  return {
    gridPx: px, columns: cols, rows: rws, feetPerSquare: FEET_PER_SQUARE,
    widthPx: cols * px, heightPx: rws * px, widthFt: cols * FEET_PER_SQUARE, heightFt: rws * FEET_PER_SQUARE,
    density: densityPreset?.id ?? "custom", size: sizePreset?.id ?? "custom",
    summary: `${cols}×${rws} squares · ${cols * px}×${rws * px} px · ${cols * FEET_PER_SQUARE}×${rws * FEET_PER_SQUARE} ft`,
  };
}

/** Resolve an atlas-map choice into a specification (ground covered, image size, scale). */
export function atlasMapSpec({ level = "region", image = DEFAULT_ATLAS_IMAGE, width, height, acrossMiles } = {}) {
  const levelPreset = ATLAS_LEVELS.find((l) => l.id === level) ?? ATLAS_LEVELS[2];
  const imagePreset = ATLAS_IMAGE_PRESETS.find((p) => p.id === image);
  const w = clampInt(width ?? imagePreset?.width, 256, 8192, 1536), h = clampInt(height ?? imagePreset?.height, 256, 8192, 1024);
  const miles = level === "planet" ? null : Number(acrossMiles ?? levelPreset.acrossMiles) || null;
  const milesPerPx = miles ? miles / w : null;
  return {
    level: levelPreset.id, labels: levelPreset.labels, widthPx: w, heightPx: h, acrossMiles: miles, acrossKm: miles ? miles * KM_PER_MILE : null,
    image: imagePreset?.id ?? "custom",
    summary: level === "planet" ? `whole planet · ${w}×${h} px` : miles ? `${Math.round(miles)} mi across · ${w}×${h} px · ${milesPerPx < 0.1 ? `${Math.round(milesPerPx * 5280)} ft` : `${milesPerPx.toFixed(2)} mi`} per px` : `fitted to the continent · ${w}×${h} px`,
  };
}
