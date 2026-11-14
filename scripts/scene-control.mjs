// Where the map's scene-control button goes. Foundry v13 and v14 both pass `getSceneControlButtons`
// a record of controls keyed by name. The Token controls exist in both (the PF2e system adds its own
// World Clock button there too); Foundry v14 removed the separate measured-template controls in favor
// of Regions, so the template controls are only a fallback for unusual setups.

function legacyMeasurementControl(controls) {
  if (controls.measure?.tools) return controls.measure;
  if (controls.templates?.tools) return controls.templates;
  return Object.values(controls).find((control) => Object.values(control?.tools ?? {}).some((tool) => {
    const name = String(tool?.name ?? "").toLowerCase();
    return name.includes("clear") && name.includes("template");
  }));
}

/** The control group the map button should join, or null if none is suitable. */
export function mapButtonControl(controls) {
  if (!controls || typeof controls !== "object") return null;
  if (controls.tokens?.tools) return controls.tokens;
  return legacyMeasurementControl(controls) ?? null;
}

/** Adds the map button as the last tool of the chosen control. Returns that control, or null. */
export function addMapSceneControl(controls, tool) {
  const control = mapButtonControl(controls);
  if (!control?.tools) return null;
  const existing = Object.values(control.tools);
  const lastOrder = existing.reduce((max, entry) => {
    const order = Number(entry?.order);
    return Number.isFinite(order) ? Math.max(max, order) : max;
  }, existing.length - 1);
  control.tools[tool.name] = { ...tool, order: lastOrder + 1 };
  return control;
}
