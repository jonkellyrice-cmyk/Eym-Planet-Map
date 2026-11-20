// The words Eym's seeds were first drawn from.
//
// Until 20 November 2026 the registry called the star and its system, the home world and the four wanderers by
// working names. Those names were hashed into seeds: the surveys of the moons and the gas giant, the place names
// of the wanderers' maps, the bodies' turning at the epoch, small variations of their air. When the registry took
// the names people use (Mitkear, Eym, Bruthi, Esonth, Lilta, Iarn), the seeds were frozen: wherever a name feeds a
// seed, the word it was first drawn from is used, so that nothing drawn changed with the names.
//
// This is the only place those words are kept. They are seed material, not names: nothing shows them.

export const SEED_WORDS = Object.freeze({ Mitkear: "Abydos", Eym: "Eventide", Bruthi: "Ramses", Esonth: "Thraximundus", Lilta: "Kandahar", Iarn: "Tribune" });
/** The word a name's seeds are drawn from: the name itself, unless it once had another. */
export const seedWord = (name) => SEED_WORDS[name] ?? name;
