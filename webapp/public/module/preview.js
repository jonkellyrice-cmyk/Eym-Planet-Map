// The module preview page: start the module on the Foundry stand-in and open its window.
import { startModule } from "./foundry-shim.js";

const $ = (s) => document.querySelector(s);
try {
  const { manifest, open, settings } = await startModule();
  $("#version").textContent = `v${manifest.version}`; $("#boot").remove();
  $("#open").addEventListener("click", () => open());
  // A plain version of Foundry's Configure Settings for this module (world and client settings alike).
  $("#settings").addEventListener("click", () => {
    const list = $("#settings-list"); list.replaceChildren();
    for (const [key, data] of settings) {
      if (!data.config) continue; const [moduleId, name] = key.split("."), value = game.settings.get(moduleId, name);
      const group = Object.assign(document.createElement("div"), { className: "form-group" }), label = Object.assign(document.createElement("label"), { textContent: data.name ?? name });
      let input;
      if (data.choices) { input = document.createElement("select"); for (const [v, text] of Object.entries(data.choices)) input.append(Object.assign(document.createElement("option"), { value: v, textContent: text, selected: String(v) === String(value) })); }
      else if (data.type === Boolean) input = Object.assign(document.createElement("input"), { type: "checkbox", checked: Boolean(value) });
      else input = Object.assign(document.createElement("input"), { type: data.type === Number ? "number" : "text", value: value ?? "" });
      input.addEventListener("change", () => game.settings.set(moduleId, name, data.type === Boolean ? input.checked : data.type === Number ? Number(input.value) : input.value));
      group.append(label, input); if (data.hint) group.append(Object.assign(document.createElement("p"), { className: "hint", textContent: data.hint }));
      list.append(group);
    }
    $("#settings-panel").showModal();
  });
  open();
} catch (error) {
  console.error(error); $("#boot").textContent = `The module could not start: ${error.message}`;
}
