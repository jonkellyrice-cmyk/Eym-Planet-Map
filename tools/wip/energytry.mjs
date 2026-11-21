import { readFileSync } from "node:fs";
const repo = process.argv[2], imp = (p) => import(`${repo}/${p}`);
const { buildEymSurface, EYM_LAYOUT } = await imp("scripts/eym-surface.mjs"), { WORLD_INPUTS } = await imp("scripts/eym-world-inputs.mjs");
const { hemisphereBalance } = await imp("scripts/eym-energy.mjs"), S = await imp("scripts/eym-seasons.mjs"), U = await imp("scripts/universal-time.mjs");
const J = (p) => JSON.parse(readFileSync(`${repo}/${p}`, "utf8"));
const { sampler } = buildEymSurface(J("data/eym/traced-continents.json"), EYM_LAYOUT, J("data/eym/tectonics.json"), J("data/eym/growth.json"));
const cells = []; for (let r = 0; r < 180; r += 1) for (let c = 0; c < 360; c += 1) { const lat = -89.5 + r, lon = -179.5 + c, s = sampler(lat, lon), land = Boolean(s?.land && !s.inlandWater); cells.push({ lat, lon, ocean: !land, elevationM: land ? Math.max(0, s.elevationM) : 0 }); }
const YEAR = U.DAYS_PER_YEAR * U.DAY_MS;
const temp = (cell, m) => S.seasonalTemperature({ annualMeanC: S.annualMeanTemperatureC(cell.lat, cell.elevationM), latDeg: cell.lat, continentality: cell.ocean ? 0 : 0.5, ocean: cell.ocean, timeMs: U.NORTHWARD_EQUINOX_MS + (m + 0.5) / 12 * YEAR }).dayMeanC;
console.log(JSON.stringify(hemisphereBalance(WORLD_INPUTS.energy, cells, temp), null, 1));
const noLand = cells.map((c) => ({ ...c, ocean: true, elevationM: 0 })); console.log("all sea:", hemisphereBalance(WORLD_INPUTS.energy, noLand, temp).bandMeanLat);
