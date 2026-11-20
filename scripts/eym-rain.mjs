// Eym's rain, month by month, as a budget of the water the air carries (owner's direction of 20 November 2026:
// "fix the causal chain"). Nothing here is set to a wanted answer for any place. For each place and month the model
// follows the air that arrives there back along the season's wind, and then forward again from far upwind, keeping
// account of the water in the column of air above each step of the way:
//   - over the sea the air takes up water, toward what the sea's own temperature allows (colder water gives less:
//     6.4% less for each degree, the vapour-pressure law), while the column above is as warm as its latitude's
//     air everywhere, so over cold water the column is far from full: stable, capped air that hardly rains;
//   - the great overturning of the air gathers water under the rain belt and spreads it apart in the dry belts
//     on either side, and gathers it again along the storm tracks; the belt stands where the Sun and the sea's
//     warmth put it at each longitude, off cold water and over warm;
//   - warm water draws the low air together and cold water spreads it (the sea's temperature against that of the
//     sea around it);
//   - rain falls by how full the column is: hardly at all below about six tenths, steeply more above (the measured
//     law of the tropical oceans, Bretherton and others 2004);
//   - over high ground the column is shorter and holds less, so climbing air is wrung out (the windward slopes),
//     and air that comes down again is far from full (the rain shadow) until it has taken up water anew;
//   - over land the rain goes back into the air from soil and leaf (nearly all of it in dry country, as much as
//     the Sun can lift in wet) and can fall again farther on; what runs off to the rivers is lost to the air;
//   - wind squeezed between two high grounds runs fast and fans out beyond: the low air spreads, air sinks into
//     its place, and the column thins;
//   - all the while the air mixes with the air round and above it, which has not come the same way, so no place
//     is cut off from water for good.
// The winds are the season's: trades blowing toward the rain belt, turned westerly where they have crossed the
// equator to reach it (a monsoon), westerlies beyond the dry belts.
// Pure: the land's heights, the sea's temperatures and the belt's seasonal place are passed in. Each cause can be
// switched off (`causes`), which is how the tests show that a cause reaches its effect.

export const RAIN_MODEL = "eym-rain-v1";
export const RAIN_CAUSES = Object.freeze({ sea: true, beltPull: true, orography: true, recycling: true, jets: true, seasonalWinds: true, mixing: true });
const DEG = Math.PI / 180, KM = 111.195, MONTHS = 12, DAY_S = 86400, MONTH_DAYS = 365.25 / 12;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const bell = (x, width) => Math.exp(-((x / width) ** 2));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
/** The Sun's declination at the middle of a month (degrees; month 0 begins at the northward equinox). */
export const monthDeclinationDeg = (month) => 23.44 * Math.sin(2 * Math.PI * (month + 0.5) / MONTHS);

/**
 * The rain rule. `dials` is WORLD_INPUTS.rain. `world` gives:
 *   heightAt(lat, lon)            the land's height (m), or null at sea;
 *   seaAnomalyAt(lat, lon, month) the sea's temperature against its latitude's (°C);
 *   seaLevelC(lat)                the latitude's temperature at sea level (°C);
 *   beltLatAt(lon, declination)   the rain belt's latitude before the sea's pull (the weather's rule: the Sun's
 *                                 place, carried on over heated land);
 *   openBeltLat(declination)      the same over open ocean, far from any land (if not given, beltLatAt at 0°).
 */
export function rainModel(dials, world, causes = RAIN_CAUSES) {
  const d = dials, { heightAt, seaAnomalyAt, seaLevelC, beltLatAt, openBeltLat = (declinationDeg) => beltLatAt(0, declinationDeg) } = world, on = { ...RAIN_CAUSES, ...causes };
  const groundAt = (lat, lon) => { const m = heightAt(lat, lon); return m == null ? null : on.orography ? Math.max(0, m) : 0; };
  /** What a full column of air holds (mm of water) over ground at sea level where the air at sea level is `c` °C. */
  const fullMm = (c) => d.column.fullMmAt27 * Math.exp(d.column.perC * (c - 27));
  /** The air's temperature at sea level at a latitude in a month: the latitude's own, with the belts' seasonal shift. */
  const airC = (lat, month) => seaLevelC(clamp(lat - d.wind.seasonShift * monthDeclinationDeg(month) * (1 - Math.abs(lat) / 90), -90, 90));

  // The sea's anomaly averaged round a place (for the low air's gathering over warm water), and along a band of
  // longitude (for the belt's place): each worked once for a grid square and month and kept.
  const kept = new Map(), wrap = (lon) => ((lon + 180) % 360 + 360) % 360;
  // (Keys are whole numbers: a kind, a month, and a grid square.)
  const keep = (kind, month, row, col, make) => { const key = ((kind * 12 + month) * 2048 + row + 1024) * 4096 + col; let v = kept.get(key); if (v === undefined) { v = make(); kept.set(key, v); } return v; };
  // (Each is worked at the middle of its grid square, whoever asks first, so the answer never depends on the order of asking.)
  const ringAnomaly = (atLat, atLon, month) => keep(0, month, Math.round(atLat / 2), Math.round(wrap(atLon) / 2), () => {
    let sum = 0, n = 0; const R = d.sea.ringDeg, lat = Math.round(atLat / 2) * 2, lon = Math.round(wrap(atLon) / 2) * 2 - 180;
    for (const [a, b] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-0.7, -0.7], [-0.7, 0.7], [0.7, -0.7], [0.7, 0.7]]) { const la = lat + a * R, lo = lon + b * R; if (Math.abs(la) < 88 && heightAt(la, lo) == null) { sum += seaAnomalyAt(la, lo, month); n += 1; } }
    return n ? sum / n : null;
  });
  const bandAnomaly = (atLat, atLon, month) => keep(1, month, Math.round(atLat * 2), Math.round(wrap(atLon) / 4), () => {
    let sum = 0, n = 0; const lat = Math.round(atLat * 2) / 2, lon = Math.round(wrap(atLon) / 4) * 4 - 180; for (let dl = -d.belt.pullReachDeg; dl <= d.belt.pullReachDeg; dl += 4) if (heightAt(lat, lon + dl) == null) { sum += seaAnomalyAt(lat, lon + dl, month); n += 1; }
    return n >= 2 ? sum / n : null;
  });
  /**
   * The broad lie of the land round a place (m): its height averaged over some 300 km (the sea counts as nought).
   * A whole column of air is lifted over broad high ground and is shorter there; over a narrow range standing
   * above the broad land only the low air is lifted, and the air above passes over.
   */
  const broadAt = (atLat, atLon) => keep(8, 0, Math.round(atLat * 2), Math.round(wrap(atLon) * 2), () => {
    const lat = Math.round(atLat * 2) / 2, lon = Math.round(wrap(atLon) * 2) / 2 - 180; let sum = 2 * (groundAt(lat, lon) ?? 0), n = 2;
    for (const km of [150, 300]) for (let k = 0; k < 8; k += 1) { const a = k * Math.PI / 4, [la, lo] = step(lat, lon, Math.cos(a), Math.sin(a), km); sum += groundAt(la, lo) ?? 0; n += 1; }
    return sum / n;
  });

  /**
   * The rain belt's latitude at a longitude in a month. The belt stands over the warmest water: the latitude's own
   * warmth falls away from the belt's seasonal place as the planet's does from its equator (30 °C × sin² of the
   * distance), and the sea's anomaly along that longitude is added; the belt is where the sum is greatest.
   */
  const beltLat = (lon, month) => keep(2, month, 0, Math.round(wrap(lon) / 2), () => {
    const lo = Math.round(wrap(lon) / 2) * 2 - 180, base = beltLatAt(lo, monthDeclinationDeg(month)); if (!on.beltPull) return base;
    let best = base, top = -Infinity;
    for (let lat = base - d.belt.pullMostDeg; lat <= base + d.belt.pullMostDeg + 1e-9; lat += 0.5) {
      const a = bandAnomaly(lat, lo, month), score = -30 * Math.sin((lat - base) * DEG) ** 2 + (a ?? 0);
      if (score > top + 1e-12) { top = score; best = lat; }
    }
    return best;
  });

  /** The season's wind at a place: m/s toward the north and the east, its speed, and the belt's latitude there. */
  const windAt = (lat, lon, month) => windFor(lat, on.seasonalWinds ? beltLat(lon, month) : 0);
  function windFor(lat, belt) {
    const w = d.wind, y = lat - belt;
    // Trades: toward the belt and from the east, slack under the belt itself.
    let north = -w.towardBeltMs * Math.tanh(y / w.turnDeg) * bell(y, 35), east = -w.easterlyMs * (1 - w.doldrums * bell(y, w.turnDeg));
    // Air that has crossed the equator to reach a belt standing well off it is turned to blow from the west.
    if (on.seasonalWinds && Math.abs(belt) > w.monsoonFromDeg && lat * belt > 0 && Math.abs(lat) < Math.abs(belt)) east += (w.easterlyMs + w.monsoonWestMs) * clamp((Math.abs(belt) - w.monsoonFromDeg) / w.monsoonFullDeg, 0, 1) * Math.sin(Math.PI * Math.abs(lat) / Math.abs(belt)) ** 0.8;
    // Beyond the dry belts: westerlies.
    const mid = smoothstep(w.westerliesFromDeg, w.westerliesFromDeg + 10, Math.abs(lat));
    north *= 1 - mid; east = east * (1 - mid) + w.westerlyMs * mid;
    const speed = Math.max(w.leastMs, Math.hypot(north, east));
    return { north, east, speed, belt };
  }
  function step(lat, lon, north, east, km) { const la = clamp(lat + north * km / KM, -89, 89); return [la, lon + east * km / (KM * Math.max(0.1, Math.cos(lat * DEG)))]; }

  /** How shut in a place is between high grounds across a wind (0 open, 1 a narrow gap), for one of eight headings. */
  const squeezeAt = (atLat, atLon, north, east) => {
    if (!on.jets || !on.orography) return 0;
    const j = d.jet, heading = Math.round(Math.atan2(east, north) / (Math.PI / 4)) & 3;
    return keep(3 + heading, 0, Math.round(atLat * 2), Math.round(wrap(atLon) * 2), () => {
      const lat = Math.round(atLat * 2) / 2, lon = Math.round(wrap(atLon) * 2) / 2 - 180, ground = groundAt(lat, lon) ?? groundAt(atLat, atLon); if (ground == null) return 0;
      const a = heading * Math.PI / 4, n = Math.cos(a), e = Math.sin(a); let left = Infinity, right = Infinity;
      for (let km = j.stepKm; km <= j.widthKm; km += j.stepKm) {
        if (left === Infinity) { const [la, lo] = step(lat, lon, e, -n, km), m = groundAt(la, lo); if (m != null && m - ground >= j.wallM) left = km; }
        if (right === Infinity) { const [la, lo] = step(lat, lon, -e, n, km), m = groundAt(la, lo); if (m != null && m - ground >= j.wallM) right = km; }
      }
      return left + right <= j.widthKm ? 1 - (left + right) / j.widthKm : 0;
    });
  };

  /** The wind and the water of an all-ocean Eym at a latitude in a month (the belt at its seasonal place, no land, no anomaly): what the air mixes toward. */
  const openBelt = (month) => openBeltLat(monthDeclinationDeg(month)), openWindAt = (lat, month) => windFor(lat, openBelt(month));
  const openWater = (lat, month) => keep(7, month, Math.round(lat), 0, () => pathMonth(Math.round(lat), 0, month, 0, true).waterMm);

  /** The overturning's gathering (+) and spreading (−) of the column's water, per day, at a latitude with the belt at `belt`. */
  const overturning = (lat, belt) => {
    const o = d.overturning, y = lat - belt, a = Math.abs(lat);
    return o.beltPerDay * bell(y, o.beltWidthDeg) - o.dryPerDay * bell(Math.abs(y) - o.dryOffsetDeg, o.dryWidthDeg) * (1 - smoothstep(40, 55, a)) + o.stormPerDay * bell(a - o.stormLat, o.stormWidthDeg) - o.polarPerDay * smoothstep(60, 80, a);
  };

  /**
   * One month at one place: the rain (mm) and what made it. The air is followed back `steps` steps along the wind
   * and then forward again, carrying its water.
   */
  function pathMonth(lat, lon, month, turnDeg, open = false) {
    const path = [], cos = Math.cos(turnDeg * DEG), sin = Math.sin(turnDeg * DEG); let la = lat, lo = lon;
    for (let k = 0; k <= d.path.steps; k += 1) {
      const w0 = open ? openWindAt(la, month) : windAt(la, lo, month), w = turnDeg ? { ...w0, north: w0.north * cos - w0.east * sin, east: w0.east * cos + w0.north * sin } : w0, ground = open ? null : groundAt(la, lo), squeeze = ground == null ? 0 : squeezeAt(la, lo, w.north, w.east);
      const broad = ground == null ? 0 : Math.min(ground, broadAt(la, lo));
      path.push({ lat: la, lon: lo, w, ground, broad, narrow: ground == null ? 0 : ground - broad, speed: w.speed * (1 + d.jet.speedUp * squeeze), squeeze });
      [la, lo] = step(la, lo, -w.north / w.speed, -w.east / w.speed, d.path.stepKm);
    }
    const far = path[path.length - 1]; let water = d.path.startFull * fullMm(airC(far.lat, month)) * Math.exp(-far.broad / d.column.scaleM);
    const blockSteps = Math.round(d.wind.blockKm / d.path.stepKm); let rainDay = 0, rainBefore = 0, fullness = 0, crossedM = 0, landKm = 0, seaC = null, fastest = 0, lostToHeight = 0, lowest = Infinity;
    for (let k = path.length - 1; k >= 0; k -= 1) {
      const p = path[k], sea = p.ground == null, air = airC(p.lat, month), holds = fullMm(air) * Math.exp(-p.broad / d.column.scaleM);
      // Low air does not all climb high ground: of a layer moving at U against the air's layering (N), only what
      // lies within U/N of the top gets over; the rest is turned aside. So less air, and less water, arrives the
      // higher the ground stands above where the air has lately been (the lowest ground of the last `blockKm`).
      let low = p.ground ?? 0; for (let b = 1; b <= blockSteps && k + b < path.length; b += 1) low = Math.min(low, path[k + b].ground ?? 0);
      const over = p.speed / d.wind.layeringPerS, passing = over / (over + Math.max(0, (p.ground ?? 0) - low)), days = d.path.stepKm * 1000 / (p.speed * passing * DAY_S);
      let gather = overturning(p.lat, p.w.belt);
      if (sea) {
        const a = on.sea && !open ? seaAnomalyAt(p.lat, p.lon, month) : 0, ring = on.sea && !open ? ringAnomaly(p.lat, p.lon, month) : null;
        // Taking up water toward what the sea's own temperature allows.
        water += Math.max(0, d.sea.airFull * fullMm(air + a) - water) / d.sea.uptakeDays * days;
        if (ring != null) gather += d.sea.gatherPerC * (a - ring);
        seaC = a; landKm = 0; crossedM = 0; lowest = Infinity;
      } else {
        landKm += d.path.stepKm; lowest = Math.min(lowest, p.ground); crossedM = Math.max(crossedM, p.ground);
        // A wind squeezed through a gap runs fast and fans out as the gap opens: the low air spreads, air sinks
        // into its place, and the column thins (as in the Turkana channel on Earth). The spreading is the jet's
        // extra speed over the gap's width.
        if (on.jets && p.squeeze) gather -= d.jet.lowAirShare * p.w.speed * d.jet.speedUp * p.squeeze / (d.jet.widthKm * 1000) * DAY_S;
        if (p.squeeze > fastest) fastest = p.squeeze;
      }
      water = Math.max(0.5, water * (1 + clamp(gather * days, -0.6, 0.6)));
      // Rain by how full the column is; what the column cannot hold at all falls at once.
      fullness = water / holds;
      let rain = Math.min(d.rain.mmPerDay * Math.exp(d.rain.steepness * (Math.min(1, fullness) - d.rain.fromFull)) * days, 0.5 * water);
      // (What the column cannot hold condenses at once, and falls within the next `spillKm` or so.)
      if (water - rain > holds) { const forced = (water - rain - holds) * (1 - Math.exp(-d.path.stepKm / d.rain.spillKm)); lostToHeight += forced; rain += forced; }
      // Climbing a narrow range, the low air (what lies below its top and within speed/N above it) is lifted and
      // wrung out by as much as the climb; the air above passes over with its water.
      const climb = k + 1 < path.length ? p.narrow - path[k + 1].narrow : 0;
      if (climb > 0) { const forced = (water - rain) * (1 - Math.exp(-climb / d.column.scaleM)) * (1 - Math.exp(-(p.narrow + over) / d.column.scaleM)); lostToHeight += forced; rain += forced; }
      water -= rain; rainBefore = rainDay; rainDay = rain / days;
      // The land gives rain back to the air from soil and leaf: nearly all of it where rain is scarce, and no more
      // than the Sun can lift where it is plentiful (Budyko's curve of the world's catchments).
      if (!sea && on.recycling && rain > 0) { const dry = d.land.evaporationMmDay * days / rain; water += rain * Math.sqrt(dry * Math.tanh(1 / dry) * (1 - Math.exp(-dry))); }
      // The air mixes with the air round and above it, which has not come the same way: toward what the open
      // ocean's air holds at this latitude in this month (as much of it as the column over this ground can hold).
      if (!open && on.mixing) water += (openWater(p.lat, month) * Math.exp(-p.broad / d.column.scaleM) - water) * Math.min(1, days / d.mixing.days);
    }
    const here = path[0]; rainDay = (rainDay + rainBefore) / 2;
    return { rainMm: rainDay * MONTH_DAYS, rainMmDay: rainDay, fullness, beltLat: here.w.belt, windFromDeg: (Math.atan2(-here.w.east, -here.w.north) / DEG + 360) % 360, windMs: here.speed, landKm, seaC: seaC ?? 0, crossedM: here.ground == null ? 0 : Math.max(0, crossedM - here.ground), squeeze: here.squeeze, squeezeUpwind: fastest, waterMm: water };
  }

  /**
   * One month at one place. The wind does not blow from one quarter all month: the air is followed along the
   * month's wind and along winds turned `spreadDeg` to either side (a quarter of the days each), and the rain is
   * the mean of the three.
   */
  function monthAt(lat, lon, month) {
    const s = d.wind.spreadDeg, mid = pathMonth(lat, lon, month, 0); if (!s) return mid;
    const a = pathMonth(lat, lon, month, -s), b = pathMonth(lat, lon, month, s), rainMm = 0.5 * mid.rainMm + 0.25 * (a.rainMm + b.rainMm);
    return { ...mid, rainMm, rainMmDay: rainMm / MONTH_DAYS, fullness: 0.5 * mid.fullness + 0.25 * (a.fullness + b.fullness) };
  }

  /** A place's twelve months of rain and their sum. */
  function yearAt(lat, lon) {
    const months = Array.from({ length: MONTHS }, (_, month) => monthAt(lat, lon, month)), rain = months.map((m) => m.rainMm);
    return { months, monthsMm: rain, annualMm: rain.reduce((a, b) => a + b, 0), driestMm: Math.min(...rain), wettestMm: Math.max(...rain), dryMonths: rain.filter((r) => r < d.rain.dryMonthMm).length, wetMonths: rain.filter((r) => r >= d.rain.wetMonthMm).length };
  }
  return { model: RAIN_MODEL, causes: on, beltLat, windAt, monthAt, yearAt, overturning, fullMm, airC, squeezeAt };
}

/** The sea's anomaly (°C) at a place in a month, read from the ocean climate document (four seasons on a grid; a month lies between two of them). */
export function seaAnomalyReader(climate) {
  const res = climate.resolutionDeg, cols = Math.round(360 / res), rows = Math.round(180 / res), seasons = climate.seasons;
  const at = (lat, lon, k) => seasons[k].sstAnomaly[clamp(Math.floor((lat + 90) / res), 0, rows - 1) * cols + ((Math.floor((lon + 180) / res) % cols) + cols) % cols];
  return (lat, lon, month) => { const t = (month + 0.5) / MONTHS * seasons.length, k = Math.floor(t) % seasons.length, f = t - Math.floor(t); return at(lat, lon, k) * (1 - f) + at(lat, lon, (k + 1) % seasons.length) * f; };
}

/**
 * The land's height as the air feels it: the mean over some 80 km round each quarter-degree square of the surface
 * (the low air flows round a lone peak, not over it)
 * (`sampler` is scripts/eym-surface.mjs's: null or not land at sea), worked once for a square and kept. `wall`,
 * if given, is a range that once stood across the land ({ latDeg, halfWidthKm, crestM }).
 */
export function feltHeights(sampler, wall = null) {
  const kept = new Map(), Q = 0.25, wallM = wall ? (lat) => wall.crestM * Math.exp(-(((lat - wall.latDeg) * KM / wall.halfWidthKm) ** 2)) : null;
  return (lat, lon) => {
    const r = Math.floor(lat / Q), c = Math.floor((((lon + 180) % 360) + 360) % 360 / Q), key = r * 4000 + c; let v = kept.get(key);
    if (v === undefined) {
      const la = (r + 0.5) * Q, lo = (c + 0.5) * Q - 180, here = sampler(la, lo); let sum = 0, n = 0;
      if (here?.land) for (let a = -1.5; a <= 1.5; a += 0.75) for (let b = -1.5; b <= 1.5; b += 0.75) { const s = sampler(la + a * Q, lo + b * Q); if (s?.land) { sum += Math.max(0, s.elevationM); n += 1; } }
      v = n ? sum / n : null; if (v != null && wallM) v = Math.max(v, wallM(la)); kept.set(key, v);
    }
    return v;
  };
}

/** The rain rule made ready for a world: the surface's sampler, the ocean climate document and the seasons' own rules. */
export function rainFor({ dials, sampler, climate, seaLevelC, beltLatAt, openBeltLat, wall = null, causes = RAIN_CAUSES }) {
  const heightAt = feltHeights(sampler, wall), seaAnomalyAt = seaAnomalyReader(climate);
  return { ...rainModel(dials, { heightAt, seaAnomalyAt, seaLevelC, beltLatAt, openBeltLat }, causes), heightAt, seaAnomalyAt };
}

/**
 * A reader of the rain file (data/eym/rain.json: the land's twelve months by the degree, the sea's year on a
 * coarser grid). `landYear(latIndex, lonIndex)` gives { monthsMm, annualMm, driestMm } for a land square of the
 * one-degree grid, or the nearest land square's within two squares, or null; `seaAnnualMm(lat, lon)` the sea's.
 */
export function rainReader(doc) {
  const rows = 180, cols = 360, bytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)), mask = bytes(doc.land.maskBase64), raw = bytes(doc.land.monthsMmUint16Base64);
  const order = new Int32Array(rows * cols).fill(-1); let n = 0; for (let i = 0; i < rows * cols; i += 1) if (mask[i >> 3] & (1 << (i & 7))) { order[i] = n; n += 1; }
  const own = (r, c) => { if (r < 0 || r >= rows) return null; const k = order[r * cols + ((c % cols) + cols) % cols]; if (k < 0) return null; const monthsMm = Array.from({ length: MONTHS }, (_, m) => raw[(k * MONTHS + m) * 2] | (raw[(k * MONTHS + m) * 2 + 1] << 8)); return { monthsMm, annualMm: monthsMm.reduce((a, b) => a + b, 0), driestMm: Math.min(...monthsMm) }; };
  const landYear = (r, c) => { const hit = own(r, c); if (hit) return hit; for (let reach = 1; reach <= 2; reach += 1) for (let dr = -reach; dr <= reach; dr += 1) for (let dc = -reach; dc <= reach; dc += 1) { if (Math.max(Math.abs(dr), Math.abs(dc)) !== reach) continue; const near = own(r + dr, c + dc); if (near) return near; } return null; };
  const S = doc.sea.resolutionDeg, sCols = Math.round(360 / S), sRows = Math.round(180 / S), sea = bytes(doc.sea.annualMmUint16Base64);
  const seaAnnualMm = (lat, lon) => { const i = clamp(Math.floor((lat + 90) / S), 0, sRows - 1) * sCols + ((Math.floor((lon + 180) / S) % sCols) + sCols) % sCols; return sea[i * 2] | (sea[i * 2 + 1] << 8); };
  return { landYear, seaAnnualMm, landCount: n };
}
