export const SUPERSTRUCTURE_MODEL_VERSION = "orphaned-sun-superstructure-identity-v1";

const SYSTEM_FACTION = Object.freeze({
  Abydos: "frontier",
});

export const FACTION_GRAMMARS = Object.freeze({
  conclave: Object.freeze({
    label: "Adanian Conclave",
    designGrammar: "sacred-technological architecture; Gothic cathedral verticality fused with Tibetan shrine/reliquary massing and advanced technocratic AI-interface infrastructure; processional axes, halos, spires and monumental devotional volumes are structural rather than decorative",
    materialLanguage: "dark structural metal, gold/bronze sacred framing, ivory or pale stone-like panels, restrained cyan or blue AI-interface light",
    interiorLogic: "pilgrimage/processional circulation; civic habitation wrapped around sacred computational precincts, sancta, observatories, archives, docks and engineering districts",
    militaryLogic: "fortification and weapons remain subordinate to sacred hierarchy; military superstructures read as armed cathedral-cities rather than secular warships with ornament glued on",
    prohibited: ["generic gothic skin over an otherwise ordinary ship", "small church-like station", "uniform cathedral towers on every object"],
  }),
  mandate: Object.freeze({
    label: "Xuanjia Mandate",
    designGrammar: "perfected geometry, mathematical repetition, hierarchical axial or radial composition, disciplined bilateral symmetry and strong vertical authority markers; Chinese and Indian architectural influence is abstracted into advanced structure rather than historical pastiche",
    materialLanguage: "precise layered armor and structural ribs, dark metal, lacquer-like red accents, jade/green or warm gold details used sparingly, luminous controlled interfaces",
    interiorLogic: "ordered civic and military districts arranged by rank, function and traffic hierarchy; circulation is legible, redundant and intentionally geometrized",
    militaryLogic: "precision, formation control and engineered perfection; mobile combat superstructures favor long efficient axes, speed, power and disciplined weapon geometry over maximal armor mass",
    prohibited: ["generic historical Chinese palace in space", "ornament without structural order", "random asymmetry that breaks the primary geometry"],
  }),
  accords: Object.freeze({
    label: "Accords Paramount",
    designGrammar: "accretive spacefaring construction: useful modules, docks, yards and hulls added over centuries and then structurally reconciled until the mature whole reads as intentional rather than junkyard; exploration, trade and traffic are visible in the architecture",
    materialLanguage: "layered industrial metals, repaired and reworked structural skins, integrated gantries and docking collars, warm work lights and restrained practical markings",
    interiorLogic: "polycentric civic, commercial, cargo and engineering districts joined by heavy transit spines; old and new sections remain functionally legible without looking crudely mismatched",
    militaryLogic: "outrun, outmaneuver and outgun: high drive volume, maneuvering systems and weapons power; somewhat lighter armor is intentional rather than a deficiency",
    prohibited: ["scrapyard kitbash", "chaotic modules with no mature integration", "slow over-armored fortress treatment for Accord combat vessels"],
  }),
  union: Object.freeze({
    label: "Union / Amarna",
    designGrammar: "plausible high-technology eco-punk and space-punk engineering; sleek but practical modularity, explicit structural logic, inhabited civic volumes and efficient traffic infrastructure",
    materialLanguage: "clean industrial metal, composite armor, exposed but orderly trusses where useful, cool interface light and restrained utility markings",
    interiorLogic: "clear civic, logistics, command, engineering and transit zoning with comfortable inhabited volumes and scalable modular expansion",
    militaryLogic: "modern systems-engineering priorities; balanced protection, mobility, redundancy and maintainability",
    prohibited: ["ornate imperial styling", "religious monumentalism unless object-specific canon requires it", "sterile featureless white sci-fi minimalism"],
  }),
  frontier: Object.freeze({
    label: "Abydos / Eventide / unaffiliated",
    designGrammar: "plausible sleek frontier eco-punk/space-punk construction; logical modular growth, robust maintenance access, strong local self-sufficiency and clear operational purpose",
    materialLanguage: "weathered but well-kept structural metal, modular pressure volumes, visible service trusses, practical lights and locally maintained surface variation",
    interiorLogic: "self-sufficient habitation, repair, logistics, civic and emergency districts with conservative redundancy",
    militaryLogic: "practical defensive design emphasizing maintainability, sensor coverage and local autonomy",
    prohibited: ["primitive frontier shack aesthetic", "generic military gray box", "unnecessary factional ornament"],
  }),
});

const p = (system, body, data) => [`${system}/${body}`, Object.freeze({ system, body, ...data })];

export const SUPERSTRUCTURE_PROFILES = Object.freeze(Object.fromEntries([
  p("Abydos", "Thornwatch Array", { topology: "distributed-watch-array", scaleClass: "distributed megacity-scale defense network", effectiveDimensions: "individual watch citadels roughly 20–50 km; network extends across a system-scale Thornfield surveillance corridor", populationBand: "~1–5 million distributed residents, crews and support population", primaryAxis: "distributed chain along the Thornfield boundary", symmetry: "network repetition rather than one-body symmetry", silhouetteFamily: "watch-citadel chain", massing: "multiple inhabited sensor-defense citadels with broad array planes and compact armored hubs", signatureStructures: ["repeating city-scale watch citadels", "sensor-array planes", "defense and docking hubs", "long distributed surveillance chain"], interiorZones: ["sensor and command precincts", "habitation districts", "defense batteries", "maintenance and docking districts", "Axiolith/power infrastructure"], circulationLogic: "local hub circulation within each citadel plus long-range shuttle/traffic links between nodes", visualCanonNotes: "System art establishes a chain of separate watch installations tracking the Thornfield rather than one station." }),
  p("Abydos", "Vada Anchorage", { topology: "single-anchorage", scaleClass: "major-city-scale orbital anchorage", effectiveDimensions: "roughly 40–70 km principal inhabited/docking span", populationBand: "~0.5–2 million permanent and transient population", primaryAxis: "horizontal docking spine", symmetry: "functional bilateral tendency with asymmetric service growth", silhouetteFamily: "frontier-anchorage", massing: "compact inhabited core with elongated docking and logistics arms", signatureStructures: ["horizontal anchorage spine", "multiple heavy docking collars", "compact civic/logistics core"], interiorZones: ["port administration", "habitation districts", "cargo and customs", "repair yards", "traffic control", "Axiolith/power infrastructure"], circulationLogic: "central port concourses feeding radial/axial dock transit", visualCanonNotes: "System art shows a compact practical anchorage adjacent to Eventide." }),

]));

export const SUPERSTRUCTURE_KEYS = Object.freeze(Object.keys(SUPERSTRUCTURE_PROFILES).sort());

export function factionFamilyFor(row) {
  const owner = String(row?.owner_faction ?? "").toLowerCase();
  if (owner.includes("conclave")) return "conclave";
  if (owner.includes("mandate")) return "mandate";
  if (owner.includes("accord")) return "accords";
  if (owner.includes("union")) return "union";
  if (owner.includes("eventide") || owner.includes("abydos")) return "frontier";
  return SYSTEM_FACTION[row?.system] ?? "frontier";
}

export function superstructureKey(system, body) {
  return `${system}/${body}`;
}

export function superstructureProfile(system, body) {
  return SUPERSTRUCTURE_PROFILES[superstructureKey(system, body)] ?? null;
}

export function isSuperstructureAsset(asset) {
  return Boolean(asset && SUPERSTRUCTURE_PROFILES[superstructureKey(asset.system, asset.body)]);
}

export function buildSuperstructureIdentity(row, asset = null) {
  const profile = superstructureProfile(row?.system, row?.object ?? asset?.body);
  if (!profile) return null;
  const factionFamily = factionFamilyFor(row ?? profile);
  const grammar = FACTION_GRAMMARS[factionFamily];
  return {
    schemaVersion: 1,
    modelVersion: SUPERSTRUCTURE_MODEL_VERSION,
    status: "accepted-working-canon",
    system: profile.system,
    body: profile.body,
    factionFamily,
    factionLabel: grammar.label,
    canonicalType: row?.type ?? asset?.canonicalType ?? "artificial superstructure",
    operationalKind: asset?.operationalKind ?? null,
    superstructureRule: "Every listed artificial body is a permanent-enough, strategically significant city-scale-or-larger superstructure with a large resident/working population; Axiolith reduces effective inertial/structural stress enough to make this scale practical.",
    topology: profile.topology,
    scaleClass: profile.scaleClass,
    effectiveDimensions: profile.effectiveDimensions,
    populationBand: profile.populationBand,
    legacyRegistryDimensions: row?.dimensions_estimate || null,
    legacyRegistryPopulation: row?.population_crew_scale || null,
    primaryAxis: profile.primaryAxis,
    symmetry: profile.symmetry,
    silhouetteFamily: profile.silhouetteFamily,
    massing: profile.massing,
    signatureStructures: [...profile.signatureStructures],
    interiorZones: [...profile.interiorZones],
    circulationLogic: profile.circulationLogic,
    factionDesignGrammar: grammar.designGrammar,
    materialLanguage: grammar.materialLanguage,
    factionInteriorLogic: grammar.interiorLogic,
    militaryLogic: grammar.militaryLogic,
    visualCanonNotes: profile.visualCanonNotes,
    registryFunction: row?.primary_function || null,
    registryStrategicRole: row?.strategic_role || null,
    registryVisualArchetype: row?.visual_archetype || null,
    registryPalette: row?.visual_palette || null,
    axiolithRole: "distributed mass/inertia and structural-stress management integrated with primary power/drive architecture",
    mustPreserve: [profile.primaryAxis, profile.symmetry, profile.massing, ...profile.signatureStructures],
    prohibitedMisreadings: ["conventional small spacecraft/station scale", ...grammar.prohibited],
    provenance: "campaign-author system atlas art + canonical registry + body-operations metadata; exact unmapped local detail may be deterministically inferred within these constraints",
  };
}
