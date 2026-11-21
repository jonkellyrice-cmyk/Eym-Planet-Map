// Caren and Garyk by region with causes switched: node steps.mjs <repo> name=cause,cause ...
const repo = process.argv[2], { eymRain } = await import(`${repo}/tools/generate-eym-rain.mjs`), { RAIN_CAUSES } = await import(`${repo}/scripts/eym-rain.mjs`);
const sets = process.argv.slice(3).map((a) => { const [name, off = ""] = a.split("="); return { name, causes: { ...RAIN_CAUSES, ...Object.fromEntries(off.split(",").filter(Boolean).map((c) => [c, false])) } }; });
for (const set of sets) {
  const air = eymRain({ causes: set.causes }), groups = { north: [], plateau: [], south: [], molkathWest: [], garyk: [] };
  for (let lat = -8.5; lat <= 8.5; lat += 1) for (let lon = -6.5; lon <= 7.5; lon += 1) { const s = air.sampler(lat, lon); if (!s?.land || s.inlandWater) continue; const y = air.yearAt(lat, lon), h = s.elevationM;
    if (lat > 3) groups.north.push(y); if (lat > 1 && h >= 1200 && h <= 2100) groups.plateau.push(y); if (lat < -3) groups.south.push(y); if (lat > -2.5 && lat < 4.8 && lon > -3.6 && lon < -0.2 && h < 900) groups.molkathWest.push(y); }
  for (let lat = 9.5; lat <= 21.5; lat += 1.5) for (let lon = -89.5; lon <= -66; lon += 1.5) { const s = air.sampler(lat, lon); if (s?.land && !s.inlandWater) groups.garyk.push(air.yearAt(lat, lon)); }
  const band = Array.from({ length: 12 }, (_, m) => air.beltLat(0, m));
  console.log(`== ${set.name}: band over Caren ${Math.min(...band).toFixed(1)} to ${Math.max(...band).toFixed(1)}, mean ${(band.reduce((a, b) => a + b, 0) / 12).toFixed(1)}; zonal heat at Caren ${[0, 3, 6, 9].map((m) => air.zonalHeat(0, m).toFixed(2)).join(" ")}; at 35°W ${air.zonalHeat(-35, 0).toFixed(2)}; at 165°E ${air.zonalHeat(165, 0).toFixed(2)}`);
  for (const [k, list] of Object.entries(groups)) { const n = list.length || 1, mm = list.reduce((a, y) => a + y.annualMm, 0) / n, dry = list.reduce((a, y) => a + y.dryMonths, 0) / n, months = Array.from({ length: 12 }, (_, m) => Math.round(list.reduce((a, y) => a + y.monthsMm[m], 0) / n)); console.log(`  ${k.padEnd(12)} ${String(list.length).padStart(3)} places ${String(Math.round(mm)).padStart(5)} mm, ${dry.toFixed(1)} dry months | ${months.join(" ")}`); }
}
