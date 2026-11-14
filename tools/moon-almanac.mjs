// Prints an almanac of Eym's moon events: phases, double full and double dark moons, solar and lunar
// eclipses, and the Red Moon passing in front of the White Moon.
//
// Usage: node tools/moon-almanac.mjs [fromYear] [toYear] [--phases]
//   Years are Eym calendar years (default: the epoch year, 5016). Phases are listed only with --phases.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../scripts/system-data.mjs";
import { formatUniversalClock, formatUniversalDate, makeUniversalTimeMs } from "../scripts/universal-time.mjs";
import { createEphemeris, findMoonEvents, moonGeometry } from "../scripts/moon-events.mjs";
import { mansionForDirection } from "../scripts/lunar-mansions.mjs";
import { displayNameFor } from "../scripts/display-names.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const years = args.filter((a) => /^\d+$/.test(a)).map(Number);
const from = years[0] ?? 5016, to = years[1] ?? from;
const showPhases = args.includes("--phases");

const rows = parseCsv(readFileSync(resolve(ROOT, "docs/system-orbital-distances.csv"), "utf8"));
const sky = JSON.parse(readFileSync(resolve(ROOT, "data/stellar/constellations.json"), "utf8"));
const eph = createEphemeris(rows);
const events = findMoonEvents(eph, makeUniversalTimeMs({ year: from, month: 1, day: 1 }), makeUniversalTimeMs({ year: to + 1, month: 1, day: 1 }));
const moon = (name) => displayNameFor("Abydos", name);
const describe = (e) => {
  switch (e.type) {
    case "new": case "full": case "first-quarter": case "last-quarter": return `${moon(e.moon)}: ${e.type.replace("-", " ")}`;
    case "double-full": return `DOUBLE FULL MOON (both full within ${e.offsetHours.toFixed(1)} h)`;
    case "double-dark": return `DOUBLE DARK (both new within ${e.offsetHours.toFixed(1)} h)`;
    case "solar-eclipse": return `${e.kind.toUpperCase()} SOLAR ECLIPSE by the ${moon(e.moon)}`;
    case "lunar-eclipse": return `${e.kind.toUpperCase()} LUNAR ECLIPSE of the ${moon(e.moon)}`;
    case "occultation": return `The ${moon(e.moon)} passes in front of the ${moon(e.occulted)}`;
    default: return e.type;
  }
};
for (const e of events) {
  if (!showPhases && ["new", "full", "first-quarter", "last-quarter"].includes(e.type)) continue;
  // The mansion of the event's moon (the White Moon for double events) at that moment.
  const k = Math.max(0, eph.moons.findIndex((m) => m.name === (e.moon ?? "White Moon")));
  const mansion = mansionForDirection(moonGeometry(eph, e.timeMs)[k].direction, sky);
  console.log(`${formatUniversalDate(e.timeMs).padEnd(32)} ${formatUniversalClock(e.timeMs)}  ${describe(e).padEnd(52)} in ${mansion.name} (${mansion.number})`);
}
