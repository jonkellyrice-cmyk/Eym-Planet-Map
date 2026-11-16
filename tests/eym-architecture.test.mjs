import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { archiveDossier, architecturePrompt, coversPlace, createDossier, createFolder, deleteDossier, deleteFolder, dossierChoices, dossierForPlace, dossierTree, emptyLibrary, folderPath, linkArea, moveDossier, moveFolder, normalizeLibrary, renameFolder, unlinkArea, updateDossier } from "../scripts/eym-architecture.mjs";
import { ARCHITECTURE_SETTING } from "../scripts/eym-architecture.mjs";
import { architectureLibrary, registerArchitectureSettings } from "../scripts/eym-paint-settings.mjs";

const t0 = "2026-11-16T00:00:00Z";
function library() {
  let lib = createFolder(emptyLibrary(), { name: "Caren" }, "f1");
  lib = createFolder(lib, { name: "Molkath", parentId: "f1" }, "f2");
  lib = createDossier(lib, { name: "Molkath river towns", folderId: "f2", people: "Molkath humans", overview: "Tall narrow brick houses.", roofs: "Red tile, stepped gables." }, "d1", t0);
  lib = createDossier(lib, { name: "Elven halls", folderId: "f1", overview: "Living wood." }, "d2", t0);
  return lib;
}

test("folders nest, rename, move and delete without losing what is in them", () => {
  let lib = library();
  assert.equal(folderPath(lib, "f2"), "Caren / Molkath");
  lib = renameFolder(lib, "f2", "  Molkath Confederation ");
  assert.equal(folderPath(lib, "f2"), "Caren / Molkath Confederation");
  assert.throws(() => moveFolder(lib, "f1", "f2"), /inside itself/);
  lib = deleteFolder(lib, "f1");
  assert.deepEqual(lib.folders.map((f) => [f.id, f.parentId]), [["f2", null]], "the child folder moved up");
  assert.equal(lib.dossiers.find((d) => d.id === "d2").folderId, null, "the dossier moved up");
  assert.equal(lib.dossiers.find((d) => d.id === "d1").folderId, "f2");
});

test("dossiers: edit, archive (kept, hidden), move, delete; the stored form is cleaned", () => {
  let lib = updateDossier(library(), "d1", { overview: "  Whitewashed brick.\r\n", defences: "Round towers.", ignored: "x" }, "2026-11-17T00:00:00Z");
  const d1 = lib.dossiers.find((d) => d.id === "d1");
  assert.equal(d1.overview, "Whitewashed brick."); assert.equal(d1.defences, "Round towers."); assert.equal(d1.updatedAt, "2026-11-17T00:00:00Z"); assert.ok(!("ignored" in d1));
  lib = archiveDossier(lib, "d2", true);
  assert.deepEqual(dossierChoices(lib).map((c) => c.id), ["d1"], "archived dossiers are not offered");
  assert.equal(dossierTree(lib).folders[0].dossiers.length, 0);
  assert.equal(dossierTree(lib, { showArchived: true }).folders[0].dossiers.length, 1);
  lib = moveDossier(archiveDossier(lib, "d2", false), "d2", null);
  assert.equal(dossierTree(lib).dossiers[0].id, "d2");
  lib = deleteDossier(lib, "d2");
  assert.deepEqual(lib.dossiers.map((d) => d.id), ["d1"]);
  assert.throws(() => deleteDossier(lib, "nope"), /no such dossier/);
  assert.deepEqual(normalizeLibrary({ dossiers: [{ id: 1, name: "", folderId: "gone", areas: [{ lat: "x" }] }] }).dossiers[0], { id: "1", name: "Untitled dossier", folderId: null, people: "", overview: "", materials: "", roofs: "", streets: "", defences: "", sacred: "", details: "", colours: "", archived: false, areas: [], createdAt: null, updatedAt: null });
});

test("areas: a dossier linked to a place comes back there by itself; archived ones do not", () => {
  let lib = linkArea(library(), "d1", { lat: 6.9, lon: 0.1, radiusKm: 5, label: "Pelasmus" });
  lib = linkArea(lib, "d2", { lat: 6.92, lon: 0.1, radiusKm: 30, label: "the hills" });
  assert.equal(dossierForPlace(lib, 6.905, 0.1).dossier.id, "d1", "the most specific area (a town over its region) wins");
  assert.equal(dossierForPlace(lib, 7.1, 0.1).dossier.id, "d2");
  assert.equal(dossierForPlace(lib, 10, 10), null);
  assert.ok(coversPlace(lib.dossiers[0], 6.9, 0.12));
  lib = linkArea(lib, "d1", { lat: 6.9001, lon: 0.1, radiusKm: 8 });
  assert.equal(lib.dossiers[0].areas.length, 1, "relinking the same spot replaces it");
  assert.equal(dossierForPlace(archiveDossier(lib, "d1"), 6.905, 0.1).dossier.id, "d2");
  assert.equal(unlinkArea(lib, "d1", 0).dossiers[0].areas.length, 0);
});

test("the prompt text names the people and lists the dossier's parts; it is stored in a world setting", () => {
  const text = architecturePrompt(library().dossiers[0]);
  assert.match(text, /^Architecture of the people who live here \(Molkath humans\), from the GM's dossier "Molkath river towns"/);
  assert.match(text, /- Tall narrow brick houses\./); assert.match(text, /- Roofs: Red tile, stepped gables\./);
  assert.ok(!/People \/ culture/.test(text));
  assert.equal(architecturePrompt(null), "");
  const registered = new Map();
  globalThis.game = { settings: { register: (m, k, d) => registered.set(k, d), get: () => ({ dossiers: [{ id: "a", name: "A" }] }) } };
  try { registerArchitectureSettings("eym-planet-map"); assert.equal(registered.get(ARCHITECTURE_SETTING).scope, "world"); assert.equal(architectureLibrary("eym-planet-map").dossiers[0].name, "A"); } finally { delete globalThis.game; }
  const app = readFileSync(new URL("../scripts/cluster-map-app.mjs", import.meta.url), "utf8");
  assert.match(app, /if \(!game\.user\?\.isGM\) throw new Error\("only the GM edits the architecture dossiers"\)/);
  assert.match(app, /battleArtDirection\(map, \{ architecture,/);
});
