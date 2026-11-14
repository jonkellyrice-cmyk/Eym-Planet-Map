import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCsv } from "../scripts/system-data.mjs";
import {
  ATMOSPHERE_MODEL_VERSION,
  deriveAtmosphereMetadata,
  validateRaHabitableAtmosphere,
} from "../scripts/atmosphere.mjs";

const rows = parseCsv(readFileSync(new URL("../docs/system-orbital-distances.csv", import.meta.url), "utf8"));
const seededWorlds = rows.filter((row) => row.geography_seed);

function naturalBodyWithAtmosphere(row) {
  const type = String(row.type ?? "").toLowerCase();
  if (!String(row.atmosphere_profile ?? "").trim() && String(row.atmosphere_pressure_atm ?? "").trim() === "") return false;
  if (type.includes("star") || type === "barycenter" || type.includes("belt") || type.includes("anomaly") || type.includes("field")) return false;
  if (["station", "installation", "shipyard", "vessel", "fleet", "carrier", "blinkgate", "megastructure", "tether", "array"].some((token) => type.includes(token))) return false;
  return true;
}

test("all 4 Ra-seeded Abydos terrestrial worlds have varied, conservative life-compatible atmospheres", () => {
  assert.equal(seededWorlds.length, 4, "canonical geography registry must still contain exactly 4 Ra-seeded terrestrial worlds");

  const pressures = new Set();
  const oxygenFractions = new Set();
  for (const row of seededWorlds) {
    const result = validateRaHabitableAtmosphere(row);
    assert.equal(result.valid, true, `${row.system}/${row.object}: ${result.errors.join("; ")}`);
    assert.equal(result.atmosphere.modelVersion, ATMOSPHERE_MODEL_VERSION);
    assert.equal(result.atmosphere.breathability.longTermUnassistedHumanCompatible, true);
    assert.equal(result.atmosphere.ozone.present, true);
    assert.equal(result.atmosphere.magneticProtection.sufficientForLongTermSurfaceLife, true);
    pressures.add(result.atmosphere.pressureAtm);
    oxygenFractions.add(result.atmosphere.dryCompositionPct.O2);
  }

  // With four worlds, "meaningful variation" means every world differs.
  assert.equal(pressures.size, seededWorlds.length, `expected canonical pressure variation; found ${pressures.size} distinct pressures`);
  assert.equal(oxygenFractions.size, seededWorlds.length, `expected oxygen fraction to adapt to differing pressures; found ${oxygenFractions.size} distinct fractions`);
});

test("atmospheric derivation is deterministic and preserves canonical numeric pressure", () => {
  for (const row of rows.filter(naturalBodyWithAtmosphere)) {
    const first = deriveAtmosphereMetadata(row);
    const second = deriveAtmosphereMetadata(row);
    assert.deepEqual(first, second, `${row.system}/${row.object} atmospheric derivation changed between identical calls`);

    const canonicalPressure = Number(row.atmosphere_pressure_atm);
    if (row.atmosphere_pressure_atm !== "" && Number.isFinite(canonicalPressure)) {
      assert.equal(first.pressureAtm, canonicalPressure, `${row.system}/${row.object} changed canonical atmospheric pressure`);
    }
  }
});

test("every natural body with an established atmosphere gets a usable composition classification", () => {
  for (const row of rows.filter(naturalBodyWithAtmosphere)) {
    const atmosphere = deriveAtmosphereMetadata(row);
    assert.ok(atmosphere, `${row.system}/${row.object} returned no atmosphere metadata`);
    const hasNumericComposition = atmosphere.dryCompositionPct && Object.keys(atmosphere.dryCompositionPct).length > 0;
    const hasDominantSpecies = Array.isArray(atmosphere.dominantSpecies) && atmosphere.dominantSpecies.length > 0;
    const isAirless = atmosphere.atmosphericClass === "airless";
    assert.ok(hasNumericComposition || hasDominantSpecies || isAirless, `${row.system}/${row.object} has neither composition, species, nor airless classification`);
  }
});

test("known nonhabitable atmosphere cases remain nonhabitable", () => {
  // Abydos has no thin-but-oxygenated respirator world, so this marginal case keeps its fixture as
  // the atmosphere-relevant fields of the removed Eilean Volna registry row (Saqqara, v0.4.0 base).
  const eileanVolna = {
    system: "Saqqara", object: "Eilean Volna", type: "moon",
    atmosphere_pressure_atm: "0.42", atmosphere_profile: "thin N2/CO2/O2; respirator recommended",
    mean_surface_temp_c: "-8", magnetosphere_radiation: "within Bannoch Vost radiation belts; moderate-high radiation",
    geography_seed: "", bulk_composition: "rock/ice large moon",
    volatile_profile: "water ice; likely CO2, ammonia and minor carbon-bearing ices in cold traps/regolith",
  };
  const eileanAtmosphere = deriveAtmosphereMetadata(eileanVolna);
  assert.equal(eileanAtmosphere.breathability.longTermUnassistedHumanCompatible, false);
  assert.match(eileanAtmosphere.breathability.classification, /respirator/i);
  assert.ok(eileanAtmosphere.partialPressureAtm.O2 < 0.1);

  const tribune = rows.find((row) => row.object === "Tribune");
  const tribuneAtmosphere = deriveAtmosphereMetadata(tribune);
  assert.equal(tribuneAtmosphere.breathability.longTermUnassistedHumanCompatible, false);
  assert.ok(tribuneAtmosphere.dryCompositionPct.H2 > 70);

  // Enoch's tenuous exosphere is the surviving thin, nonzero-pressure, nonbreathable case.
  const enoch = deriveAtmosphereMetadata(rows.find((row) => row.object === "Enoch"));
  assert.equal(enoch.breathability.longTermUnassistedHumanCompatible, false);
  assert.equal(enoch.pressureAtm, 0.02);
});
