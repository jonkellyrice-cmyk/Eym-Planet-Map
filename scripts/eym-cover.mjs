// The kinds of ground every Eym map shares (the local detail, the Region layer, battle sites), their plain
// colours, and the world-keyed hash that places details. Kept apart from scripts/eym-local-detail.mjs so that the
// Region layer's painting (scripts/eym-region-paint.mjs) depends on these alone: its fingerprint then changes only
// when the painting does (data/eym/region-fingerprint.json).

export const COVER = Object.freeze({ sea: 0, lake: 1, river: 2, stream: 3, beach: 4, marsh: 5, meadow: 6, farmland: 7, scrub: 8, woods: 9, rock: 10, snow: 11, built: 12, road: 13 });
export const COVER_NAMES = Object.freeze(Object.fromEntries(Object.entries(COVER).map(([k, v]) => [v, k])));

// FNV-1a with a final avalanche (keys differing only in their last digits must not give correlated values).
export const hashUnit = (text) => {
  let h = 2166136261; for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

export const COVER_COLORS = Object.freeze({
  [COVER.sea]: [38, 82, 109], [COVER.lake]: [91, 155, 196], [COVER.river]: [91, 155, 196], [COVER.stream]: [104, 166, 205], [COVER.beach]: [222, 205, 160], [COVER.marsh]: [104, 128, 92],
  [COVER.meadow]: [148, 168, 98], [COVER.farmland]: [189, 177, 112], [COVER.scrub]: [118, 140, 82], [COVER.woods]: [62, 104, 58], [COVER.rock]: [140, 128, 112], [COVER.snow]: [238, 241, 243], [COVER.built]: [150, 120, 96],
});
