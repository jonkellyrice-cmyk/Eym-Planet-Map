import { readFileSync } from "node:fs";
const repo = process.argv[2], imp = (p) => import(`${repo}/${p}`), J = (p) => JSON.parse(readFileSync(`${repo}/${p}`, "utf8"));
const { buildEymSurface, EYM_LAYOUT } = await imp("scripts/eym-surface.mjs"), { seaAnomalyReader } = await imp("scripts/eym-rain.mjs");
const { sampler } = buildEymSurface(J("data/eym/traced-continents.json"), EYM_LAYOUT, J("data/eym/tectonics.json"), J("data/eym/growth.json")), sea = seaAnomalyReader(J("data/eym/climate.json"));
const landC = Number(process.argv[3] ?? 1), raw = [], landShare = [], seaMean = [];
for (let lon = -175; lon < 180; lon += 10) { let q = 0, n = 0, l = 0, s = 0, sn = 0; for (let lat = -10; lat <= 14; lat += 2) for (let dl = -4; dl <= 4; dl += 4) { const p = sampler(lat, lon + dl), land = p?.land && !p.inlandWater; const a = [0, 3, 6, 9].reduce((x, m) => x + sea(lat, lon + dl, m), 0) / 4; if (land) { q += landC; l += 1; } else { q += a; s += a; sn += 1; } n += 1; } raw.push(q / n); landShare.push(l / n); seaMean.push(sn ? s / sn : 0); }
const N = raw.length, smooth = raw.map((_, i) => { let s = 0, w = 0; for (let d = -9; d <= 9; d += 1) { const k = Math.exp(-((d * 10 / 30) ** 2)); s += k * raw[(i + d + N) % N]; w += k; } return s / w; }), mean = smooth.reduce((a, b) => a + b, 0) / N;
console.log("lon   land  sea°C  Q     Q'(smoothed, less mean)");
smooth.forEach((v, i) => console.log(String(-175 + 10 * i).padStart(5), landShare[i].toFixed(2), seaMean[i].toFixed(1).padStart(5), raw[i].toFixed(2).padStart(6), (v - mean).toFixed(2).padStart(6)));
