export const STAIR_ARCHITECTURE_BRIEF_SCHEMA = 'jweb.stair-architecture-brief.v1';

export const STAIR_ARCHITECTURE_SPECIES = Object.freeze([
  'domestic-enclosed-dogleg',
  'retrofit-facade-fire-escape',
  'industrial-work-stair',
  'institutional-egress',
  'civic-monumental',
  'district-thoroughfare',
  'scaffold-access-tower',
  'utility-ship-stair',
]);

const SPECIES_PROFILES = Object.freeze({
  'domestic-enclosed-dogleg': Object.freeze({
    topologyStem: 'domestic-dogleg',
    minClearWidth: 0.95,
    preferredClearWidth: 1.08,
    laneGap: 0.34,
    floorLandingMin: 1.38,
    turnLandingMin: 1.22,
    floorLandingWidthScale: 1.30,
    turnLandingWidthScale: 1.16,
    wallMarginGenerous: 0.22,
    wallMarginCompact: 0.08,
    sideClearanceGenerous: 0.09,
    sideClearanceCompact: 0.05,
    guardFamily: 'residential-half-wall',
    landingGrammar: 'floor-threshold-and-residential-turn',
    endpointGrammar: 'hall-door-threshold',
    enclosure: 'shaft-walls',
    detailBudget: 'low',
  }),
  'retrofit-facade-fire-escape': Object.freeze({
    topologyStem: 'facade-retrofit-zigzag',
    minClearWidth: 0.85,
    preferredClearWidth: 0.94,
    laneGap: 0.30,
    floorLandingMin: 0.96,
    turnLandingMin: 0.92,
    floorLandingWidthScale: 1.08,
    turnLandingWidthScale: 1.04,
    wallMarginGenerous: 0.16,
    wallMarginCompact: 0.06,
    sideClearanceGenerous: 0.07,
    sideClearanceCompact: 0.04,
    guardFamily: 'fire-escape-pipe',
    landingGrammar: 'door-perch',
    endpointGrammar: 'emergency-opening',
    enclosure: 'exterior-open',
    detailBudget: 'low',
  }),
  'industrial-work-stair': Object.freeze({
    topologyStem: 'industrial-platform-dogleg',
    minClearWidth: 1.00,
    preferredClearWidth: 1.18,
    laneGap: 0.36,
    floorLandingMin: 1.36,
    turnLandingMin: 1.24,
    floorLandingWidthScale: 1.24,
    turnLandingWidthScale: 1.16,
    wallMarginGenerous: 0.20,
    wallMarginCompact: 0.07,
    sideClearanceGenerous: 0.09,
    sideClearanceCompact: 0.05,
    guardFamily: 'industrial-two-rail',
    landingGrammar: 'work-platform',
    endpointGrammar: 'platform-or-work-bay',
    enclosure: 'frame-open',
    detailBudget: 'medium',
  }),
  'institutional-egress': Object.freeze({
    topologyStem: 'institutional-egress-core',
    minClearWidth: 1.30,
    preferredClearWidth: 1.48,
    laneGap: 0.38,
    floorLandingMin: 1.58,
    turnLandingMin: 1.46,
    floorLandingWidthScale: 1.18,
    turnLandingWidthScale: 1.14,
    wallMarginGenerous: 0.24,
    wallMarginCompact: 0.10,
    sideClearanceGenerous: 0.11,
    sideClearanceCompact: 0.07,
    guardFamily: 'institutional-handrail',
    landingGrammar: 'egress-lobby',
    endpointGrammar: 'floor-lobby',
    enclosure: 'egress-shaft',
    detailBudget: 'low',
  }),
  'civic-monumental': Object.freeze({
    topologyStem: 'civic-broad-turn',
    minClearWidth: 2.50,
    preferredClearWidth: 3.20,
    laneGap: 0.46,
    floorLandingMin: 2.40,
    turnLandingMin: 2.20,
    floorLandingWidthScale: 1.05,
    turnLandingWidthScale: 1.03,
    wallMarginGenerous: 0.28,
    wallMarginCompact: 0.14,
    sideClearanceGenerous: 0.12,
    sideClearanceCompact: 0.08,
    guardFamily: 'municipal-concrete',
    landingGrammar: 'foyer-or-plaza',
    endpointGrammar: 'plaza-or-civic-hall',
    enclosure: 'monolithic-open',
    detailBudget: 'low',
  }),
  'district-thoroughfare': Object.freeze({
    topologyStem: 'district-journey-switchback',
    minClearWidth: 1.80,
    preferredClearWidth: 2.20,
    laneGap: 0.46,
    floorLandingMin: 2.15,
    turnLandingMin: 1.88,
    floorLandingWidthScale: 1.10,
    turnLandingWidthScale: 1.06,
    wallMarginGenerous: 0.26,
    wallMarginCompact: 0.11,
    sideClearanceGenerous: 0.12,
    sideClearanceCompact: 0.08,
    guardFamily: 'municipal-concrete',
    landingGrammar: 'street-address-junction',
    endpointGrammar: 'street-catwalk-interchange',
    enclosure: 'public-infrastructure',
    detailBudget: 'low',
  }),
  'scaffold-access-tower': Object.freeze({
    topologyStem: 'scaffold-bay-switchback',
    minClearWidth: 0.80,
    preferredClearWidth: 0.92,
    laneGap: 0.30,
    floorLandingMin: 1.02,
    turnLandingMin: 0.96,
    floorLandingWidthScale: 1.10,
    turnLandingWidthScale: 1.06,
    wallMarginGenerous: 0.16,
    wallMarginCompact: 0.05,
    sideClearanceGenerous: 0.06,
    sideClearanceCompact: 0.04,
    guardFamily: 'scaffold-pipe',
    landingGrammar: 'scaffold-bay-platform',
    endpointGrammar: 'frame-bay-transfer',
    enclosure: 'scaffold-frame',
    detailBudget: 'medium',
  }),
  'utility-ship-stair': Object.freeze({
    topologyStem: 'utility-service-flight',
    minClearWidth: 0.65,
    preferredClearWidth: 0.78,
    laneGap: 0.26,
    floorLandingMin: 0.86,
    turnLandingMin: 0.82,
    floorLandingWidthScale: 1.02,
    turnLandingWidthScale: 1.02,
    wallMarginGenerous: 0.14,
    wallMarginCompact: 0.05,
    sideClearanceGenerous: 0.05,
    sideClearanceCompact: 0.03,
    guardFamily: 'industrial-two-rail',
    landingGrammar: 'service-terminal-platform',
    endpointGrammar: 'machinery-roof-service-zone',
    enclosure: 'service-open',
    detailBudget: 'low',
  }),
});

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function normalize(value) {
  return String(value ?? '').trim().toLowerCase().replace(/_/g, '-');
}
function physicalUseFamily(value) {
  return normalize(typeof value === 'object' ? (value?.family ?? value?.physicalUse ?? value?.id) : value);
}
function hasAny(text, needles) {
  return needles.some(needle => text.includes(needle));
}

export function stairSpeciesProfile(species) {
  const profile = SPECIES_PROFILES[species];
  if (!profile) throw new Error(`unknown stair architecture species: ${species}`);
  return profile;
}

function inferredPurpose({ purpose, routeClass, routeFamily, program, use, emergencyOnly, ceremonial, specialPurpose }) {
  if (purpose) return normalize(purpose);
  const routeText = `${normalize(routeClass)}|${normalize(routeFamily)}`;
  if (ceremonial) return 'ceremonial-entry';
  if (emergencyOnly || hasAny(routeText, ['fire-escape', 'emergency-egress', 'retrofit-egress'])) return 'emergency-escape';
  if (hasAny(routeText, ['district-thoroughfare', 'street-layer', 'district-arterial', 'public-route'])) return 'district-pedestrian-movement';
  if (hasAny(routeText, ['scaffold'])) return 'temporary-access';
  if (specialPurpose || hasAny(routeText, ['maintenance', 'utility-service', 'machinery-access', 'roof-service'])) return 'maintenance-access';
  if (hasAny(program, ['apartment', 'motel'])) return 'domestic-circulation';
  if (hasAny(use, ['industrial-service', 'storage', 'maintenance-utility'])) return 'worker-circulation';
  if (hasAny(use, ['assembly-institutional', 'business', 'mercantile-public'])) return 'institutional-egress';
  return 'ordinary-building-circulation';
}

function speciesFor({ purpose, program, use, routeClass, routeFamily, specialPurpose }) {
  const routeText = `${normalize(routeClass)}|${normalize(routeFamily)}`;
  if (hasAny(purpose, ['district-pedestrian', 'street-movement']) || hasAny(routeText, ['district-thoroughfare', 'district-arterial', 'street-layer'])) return 'district-thoroughfare';
  if (hasAny(purpose, ['ceremonial'])) return 'civic-monumental';
  if (hasAny(purpose, ['emergency-escape']) || hasAny(routeText, ['fire-escape', 'retrofit-egress'])) return 'retrofit-facade-fire-escape';
  if (hasAny(purpose, ['temporary-access']) || hasAny(routeText, ['scaffold'])) return 'scaffold-access-tower';
  if (specialPurpose || hasAny(purpose, ['maintenance-access', 'machinery-access', 'roof-service'])) return 'utility-ship-stair';
  if (hasAny(program, ['apartment', 'motel']) || use === 'residential-lodging') return 'domestic-enclosed-dogleg';
  if (hasAny(program, ['clinic', 'courthouse', 'office', 'police', 'school', 'hospital']) || hasAny(use, ['assembly-institutional', 'business', 'mercantile-public'])) return 'institutional-egress';
  if (hasAny(program, ['fire-station', 'auto-shop', 'warehouse', 'workshop', 'laboratory', 'server-facility', 'utility-plant']) || hasAny(use, ['industrial-service', 'storage', 'maintenance-utility'])) return 'industrial-work-stair';
  return 'institutional-egress';
}

function defaultsForSpecies(species, field) {
  const hanging = normalize(field) === 'ceiling';
  switch (species) {
    case 'domestic-enclosed-dogleg':
      return { builder: 'original-building-architect', budget: 'cheap-permanent', permanence: 'permanent-original', pedestrians: 'residents', carriedObjects: 'groceries-furniture', throughput: 'residential-two-way', hostStructure: 'building-core', exposure: 'interior', loadPath: hanging ? 'shaft-walls-to-overhead-building-frame' : 'shaft-walls-to-building-fabric' };
    case 'retrofit-facade-fire-escape':
      return { builder: 'local-retrofit-welder', budget: 'cheap-permanent', permanence: 'retrofit', pedestrians: 'emergency-evacuees', carriedObjects: 'nothing', throughput: 'emergency-single-file', hostStructure: 'existing-facade', exposure: 'exterior', loadPath: hanging ? 'facade-tiebacks-to-overhead-frame' : 'facade-brackets-to-building-wall' };
    case 'industrial-work-stair':
      return { builder: 'industrial-fabricator', budget: 'ordinary-capital', permanence: 'permanent-original', pedestrians: 'workers-technicians', carriedObjects: 'tools-equipment', throughput: 'worker-two-way', hostStructure: 'plant-frame', exposure: 'sheltered', loadPath: hanging ? 'platform-frame-to-overhead-hangers' : 'platform-frame-to-columns' };
    case 'civic-monumental':
      return { builder: 'civic-architect', budget: 'civic-prestige', permanence: 'permanent-original', pedestrians: 'crowds', carriedObjects: 'nothing', throughput: 'ceremonial-crowd', hostStructure: 'civic-mass', exposure: 'sheltered', loadPath: hanging ? 'monolithic-mass-to-overhead-structure' : 'monolithic-mass-to-foundation' };
    case 'district-thoroughfare':
      return { builder: 'municipal-public-works', budget: 'ordinary-public-capital', permanence: 'permanent-infrastructure', pedestrians: 'public-two-way-streams', carriedObjects: 'packages-groceries', throughput: 'district-scale-pedestrian', hostStructure: 'district-route-frame', exposure: 'exterior', loadPath: hanging ? 'public-frame-to-overhead-hangers' : 'public-piers-to-ground-and-buildings' };
    case 'scaffold-access-tower':
      return { builder: 'scaffold-crew', budget: 'improvised', permanence: 'temporary-or-accreted', pedestrians: 'workers', carriedObjects: 'tools', throughput: 'continuous-single-file', hostStructure: 'scaffold-frame', exposure: 'exterior', loadPath: hanging ? 'scaffold-bays-to-overhead-ties' : 'scaffold-bays-to-ground-and-ties' };
    case 'utility-ship-stair':
      return { builder: 'plant-fabricator', budget: 'cheap-permanent', permanence: 'permanent-service', pedestrians: 'technicians', carriedObjects: 'tools', throughput: 'occasional-technician', hostStructure: 'machinery-frame', exposure: 'sheltered', loadPath: hanging ? 'service-frame-to-overhead-hangers' : 'service-frame-to-equipment-platform' };
    default:
      return { builder: 'institutional-architect', budget: 'ordinary-capital', permanence: 'permanent-original', pedestrians: 'occupants', carriedObjects: 'bags-packages', throughput: 'continuous-two-way-public', hostStructure: 'egress-core', exposure: 'interior', loadPath: hanging ? 'egress-core-to-overhead-building-frame' : 'egress-core-to-building-structure' };
  }
}

export function deriveStairArchitectureBrief({
  programArchitectureId = null,
  physicalUse = null,
  routeClass = 'local',
  routeFamily = null,
  purpose = null,
  builder = null,
  budget = null,
  permanence = null,
  pedestrians = null,
  carriedObjects = null,
  throughput = null,
  hostStructure = null,
  exposure = null,
  field = 'ground',
  routeWidthScale = 1,
  emergencyOnly = false,
  ceremonial = false,
  specialPurpose = false,
  species = null,
  stableKey = '',
} = {}) {
  const program = normalize(programArchitectureId);
  const use = physicalUseFamily(physicalUse);
  const resolvedPurpose = inferredPurpose({ purpose, routeClass, routeFamily, program, use, emergencyOnly, ceremonial, specialPurpose });
  const requestedSpecies = normalize(species);
  const resolvedSpecies = STAIR_ARCHITECTURE_SPECIES.includes(requestedSpecies)
    ? requestedSpecies
    : speciesFor({ purpose: resolvedPurpose, program, use, routeClass, routeFamily, specialPurpose });
  const profile = stairSpeciesProfile(resolvedSpecies);
  const defaults = defaultsForSpecies(resolvedSpecies, field);
  const supportPolarity = normalize(field) === 'ceiling' ? 'load-up' : 'load-down';
  const widthScale = Math.max(0.65, Math.min(2.5, finite(routeWidthScale, 1)));
  return Object.freeze({
    schema: STAIR_ARCHITECTURE_BRIEF_SCHEMA,
    stableKey: String(stableKey ?? ''),
    species: resolvedSpecies,
    purpose: resolvedPurpose,
    builder: normalize(builder || defaults.builder),
    budget: normalize(budget || defaults.budget),
    permanence: normalize(permanence || defaults.permanence),
    pedestrians: normalize(pedestrians || defaults.pedestrians),
    carriedObjects: normalize(carriedObjects || defaults.carriedObjects),
    throughput: normalize(throughput || defaults.throughput),
    hostStructure: normalize(hostStructure || defaults.hostStructure),
    exposure: normalize(exposure || defaults.exposure),
    field: normalize(field) === 'ceiling' ? 'ceiling' : 'ground',
    supportPolarity,
    loadPath: normalize(defaults.loadPath),
    landingGrammar: profile.landingGrammar,
    endpointGrammar: profile.endpointGrammar,
    enclosure: profile.enclosure,
    guardFamily: profile.guardFamily,
    routeClass: normalize(routeClass) || 'local',
    routeFamily: normalize(routeFamily) || null,
    programArchitectureId: program || null,
    physicalUse: use || null,
    routeWidthScale: widthScale,
    // Width changes throughput expression; it is deliberately not a style/species selector.
    requestedWidthClass: widthScale >= 1.55 ? 'broad' : widthScale >= 1.20 ? 'generous' : widthScale <= 0.82 ? 'narrow' : 'ordinary',
  });
}

export function stairInteriorProfileFor(brief) {
  if (!brief?.species) return null;
  return stairSpeciesProfile(brief.species);
}

export function stairTopologyLabelFor(brief, flightCount) {
  if (!brief?.species) return flightCount === 2 ? 'two-flight-switchback' : 'four-flight-switchback';
  const stem = stairSpeciesProfile(brief.species).topologyStem;
  return `${stem}:${flightCount}-flight`;
}
