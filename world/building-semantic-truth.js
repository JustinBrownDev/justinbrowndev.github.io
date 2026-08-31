import {
  physicalUseFamiliesForProgram,
  programCompatibleWithPhysicalUse,
} from './physical-use.js';

export const BUILDING_SEMANTIC_TRUTH_SCHEMA = 'jweb.building-semantic-truth.v1';

const DEFAULT_PROGRAM_BY_FAMILY = Object.freeze({
  'residential-lodging': 'motel_room',
  'mercantile-public': 'convenience',
  business: 'office',
  'assembly-institutional': 'library',
  'industrial-service': 'electronics_repair',
  storage: 'archive',
  'maintenance-utility': 'server_room',
});

const FAMILY_CHARACTER = Object.freeze({
  'residential-lodging': Object.freeze({
    publicCharacter: 'resident-facing',
    frontageRoles: Object.freeze(['resident-entry', 'small-identity', 'service-flank']),
    publicZones: Object.freeze(['entry', 'shared']),
    privateZones: Object.freeze(['private', 'shared']),
    serviceZones: Object.freeze(['service', 'storage', 'circulation']),
    serviceAccess: 'secondary',
    mechanicalIntensity: 'medium',
    roofMechanicalCharacter: 'domestic-dense',
    signageCharacter: 'local-identity',
    mediaCharacter: 'incidental',
    spectacleEligibility: 'rare',
    compositionStyles: Object.freeze(['roof-heavy', 'mixed', 'signage-bazaar']),
    facadeSemanticFamily: 'residential-service',
    roofSemanticFamily: 'roof-mechanical',
  }),
  'mercantile-public': Object.freeze({
    publicCharacter: 'street-commercial',
    frontageRoles: Object.freeze(['public-entry', 'identity-signage', 'display', 'service-flank']),
    publicZones: Object.freeze(['entry', 'public', 'program']),
    privateZones: Object.freeze(['work', 'storage']),
    serviceZones: Object.freeze(['service', 'storage', 'circulation']),
    serviceAccess: 'secondary',
    mechanicalIntensity: 'medium',
    roofMechanicalCharacter: 'commercial-service',
    signageCharacter: 'high-identity',
    mediaCharacter: 'commercial',
    spectacleEligibility: 'eligible',
    compositionStyles: Object.freeze(['signage-bazaar', 'media-monster', 'mixed']),
    facadeSemanticFamily: 'commercial-service',
    roofSemanticFamily: 'roof-mechanical',
  }),
  business: Object.freeze({
    publicCharacter: 'office-public',
    frontageRoles: Object.freeze(['public-entry', 'institution-identity', 'service-flank']),
    publicZones: Object.freeze(['entry', 'public', 'work']),
    privateZones: Object.freeze(['work', 'private']),
    serviceZones: Object.freeze(['service', 'storage', 'circulation']),
    serviceAccess: 'secondary',
    mechanicalIntensity: 'medium',
    roofMechanicalCharacter: 'office-plant',
    signageCharacter: 'institutional-identity',
    mediaCharacter: 'corporate',
    spectacleEligibility: 'conditional',
    compositionStyles: Object.freeze(['institutional-monolith', 'signage-bazaar', 'roof-heavy']),
    facadeSemanticFamily: 'office-service',
    roofSemanticFamily: 'roof-mechanical',
  }),
  'assembly-institutional': Object.freeze({
    publicCharacter: 'institutional-public',
    frontageRoles: Object.freeze(['public-entry', 'institution-identity', 'controlled-service']),
    publicZones: Object.freeze(['entry', 'public', 'program']),
    privateZones: Object.freeze(['work', 'private', 'storage']),
    serviceZones: Object.freeze(['service', 'storage', 'circulation']),
    serviceAccess: 'controlled',
    mechanicalIntensity: 'medium',
    roofMechanicalCharacter: 'institutional-plant',
    signageCharacter: 'formal-identity',
    mediaCharacter: 'institutional',
    spectacleEligibility: 'conditional',
    compositionStyles: Object.freeze(['institutional-monolith', 'roof-heavy', 'mixed']),
    facadeSemanticFamily: 'institutional-service',
    roofSemanticFamily: 'roof-mechanical',
  }),
  'industrial-service': Object.freeze({
    publicCharacter: 'service-industrial',
    frontageRoles: Object.freeze(['service-entry', 'service-band', 'loading', 'safety-identity']),
    publicZones: Object.freeze(['entry', 'work']),
    privateZones: Object.freeze(['work', 'storage']),
    serviceZones: Object.freeze(['service', 'storage', 'circulation']),
    serviceAccess: 'primary',
    mechanicalIntensity: 'heavy',
    roofMechanicalCharacter: 'industrial-plant',
    signageCharacter: 'service-warning',
    mediaCharacter: 'operational',
    spectacleEligibility: 'rare',
    compositionStyles: Object.freeze(['pipe-nightmare', 'service-bunker', 'roof-heavy']),
    facadeSemanticFamily: 'vertical-mechanical',
    roofSemanticFamily: 'roof-mechanical-heavy',
  }),
  storage: Object.freeze({
    publicCharacter: 'storage-service',
    frontageRoles: Object.freeze(['service-entry', 'loading', 'controlled-identity']),
    publicZones: Object.freeze(['entry']),
    privateZones: Object.freeze(['storage', 'work']),
    serviceZones: Object.freeze(['service', 'storage', 'circulation']),
    serviceAccess: 'primary',
    mechanicalIntensity: 'medium',
    roofMechanicalCharacter: 'warehouse-plant',
    signageCharacter: 'controlled-identity',
    mediaCharacter: 'minimal',
    spectacleEligibility: 'rare',
    compositionStyles: Object.freeze(['service-bunker', 'pipe-nightmare', 'institutional-monolith']),
    facadeSemanticFamily: 'mechanical-service',
    roofSemanticFamily: 'roof-mechanical',
  }),
  'maintenance-utility': Object.freeze({
    publicCharacter: 'utility-service',
    frontageRoles: Object.freeze(['maintenance-entry', 'service-band', 'warning-identity']),
    publicZones: Object.freeze(['entry']),
    privateZones: Object.freeze(['service', 'work']),
    serviceZones: Object.freeze(['service', 'storage', 'circulation']),
    serviceAccess: 'primary',
    mechanicalIntensity: 'heavy',
    roofMechanicalCharacter: 'utility-plant',
    signageCharacter: 'warning-identity',
    mediaCharacter: 'operational',
    spectacleEligibility: 'rare',
    compositionStyles: Object.freeze(['service-bunker', 'roof-heavy', 'pipe-nightmare']),
    facadeSemanticFamily: 'vertical-mechanical',
    roofSemanticFamily: 'roof-mechanical-heavy',
  }),
});

function hashString32(value) {
  let h = 0x811c9dc5;
  const text = String(value ?? '');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

function freezeRecord(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(item => freezeRecord(item)));
  if (!value || typeof value !== 'object') return value;
  for (const [key, item] of Object.entries(value)) value[key] = freezeRecord(item);
  return Object.freeze(value);
}

function physicalUseFamily(physicalUse, programHint = null, exteriorMacroPreference = null) {
  const explicitFamily = typeof physicalUse === 'string' ? physicalUse : physicalUse?.family;
  if (explicitFamily) return explicitFamily;

  const compatibleFamilies = physicalUseFamiliesForProgram(programHint);
  if (compatibleFamilies.length) return compatibleFamilies[0];

  // Older authored/semantic entities predate the physical-use descriptor. Absorb
  // their stable semantic intent here instead of letting each downstream planner
  // invent a different fallback building family.
  const legacyIntent = [
    programHint,
    exteriorMacroPreference?.facadeSemanticFamily,
    exteriorMacroPreference?.roofSemanticFamily,
  ].filter(Boolean).join(' ').toLowerCase();
  if (/industrial|factory|repair|auto[_ -]?shop|vertical-mechanical|mechanical-service|pipe|duct|riser|exhaust/.test(legacyIntent)) {
    return 'industrial-service';
  }
  if (/utility|server|mainframe|boiler|plant|maintenance/.test(legacyIntent)) return 'maintenance-utility';
  if (/storage|archive|warehouse/.test(legacyIntent)) return 'storage';
  if (/residential|lodging|motel|hotel/.test(legacyIntent)) return 'residential-lodging';
  if (/institution|public|library|clinic|school|court|police|fire/.test(legacyIntent)) return 'assembly-institutional';
  if (/office|business|corporate|bank/.test(legacyIntent)) return 'business';
  return 'mercantile-public';
}

function morphologyOf(physicalUse, archetype) {
  return String(archetype ?? (typeof physicalUse === 'object' ? physicalUse?.morphology : null) ?? 'default');
}

function finiteOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).filter(Boolean).map(value => String(value)))];
}

function normalizeDistrictComposition(districtContext) {
  if (!districtContext || typeof districtContext !== 'object') return null;
  const hints = districtContext.exteriorHints ?? {};
  return {
    schema: districtContext.schema ?? null,
    compositionId: districtContext.compositionId ?? null,
    districtId: districtContext.districtId ?? null,
    districtFamily: districtContext.districtFamily ?? null,
    districtSubCharacter: districtContext.districtSubCharacter ?? null,
    blockId: districtContext.blockId ?? null,
    blockRole: districtContext.blockRole ?? null,
    primaryEdge: districtContext.primaryEdge ?? null,
    frontageCharacter: districtContext.frontageCharacter ?? null,
    spectacleCorridor: !!districtContext.spectacleCorridor,
    anchor: !!districtContext.anchor,
    secondaryLandmark: !!districtContext.secondaryLandmark,
    commercialPressure: finiteOrZero(districtContext.commercialPressure),
    servicePressure: finiteOrZero(districtContext.servicePressure),
    quietPressure: finiteOrZero(districtContext.quietPressure),
    mechanicalPressure: finiteOrZero(districtContext.mechanicalPressure),
    bridgePressure: finiteOrZero(districtContext.bridgePressure),
    connectorPressure: finiteOrZero(districtContext.connectorPressure),
    spectaclePriority: finiteOrZero(districtContext.spectaclePriority),
    visualIntensity: finiteOrZero(districtContext.visualIntensity),
    courtyardVoidTendency: finiteOrZero(districtContext.courtyardVoidTendency),
    rooflineRhythm: districtContext.rooflineRhythm ?? null,
    rooflineTarget: districtContext.rooflineTarget ?? null,
    semanticFamilyHint: districtContext.semanticFamilyHint ?? null,
    buildingProgramHint: districtContext.buildingProgramHint ?? null,
    exteriorHints: {
      styleBiases: uniqueStrings(hints.styleBiases),
      facadeSemanticFamily: hints.facadeSemanticFamily ?? null,
      roofSemanticFamily: hints.roofSemanticFamily ?? null,
    },
  };
}

function programDecision({ family, physicalUse, programHint, authoredIntent }) {
  if (authoredIntent?.program) {
    return { program: String(authoredIntent.program), source: 'spawn-authored-intent', rejectedProgramHint: null };
  }
  if (programHint && programCompatibleWithPhysicalUse(programHint, physicalUse ?? family)) {
    return { program: String(programHint), source: 'compatible-program-hint', rejectedProgramHint: null };
  }
  return {
    program: DEFAULT_PROGRAM_BY_FAMILY[family] ?? 'office',
    source: 'physical-use-family-default',
    rejectedProgramHint: programHint ? String(programHint) : null,
  };
}

export function buildingSemanticStableKey({ worldSeed = 0, chunkKey = '0,0', entityId = 'building' } = {}) {
  return `${worldSeed >>> 0}:${String(chunkKey)}:${String(entityId)}`;
}

export function deriveBuildingSemanticTruth({
  worldSeed = 0,
  chunkKey = '0,0',
  entityId = 'building',
  physicalUse = null,
  archetype = null,
  signatureType = null,
  programHint = null,
  authoredIntent = null,
  districtContext = null,
  exteriorMacroPreference = null,
} = {}) {
  const stableKey = buildingSemanticStableKey({ worldSeed, chunkKey, entityId });
  const family = physicalUseFamily(physicalUse, programHint, exteriorMacroPreference);
  const character = FAMILY_CHARACTER[family] ?? FAMILY_CHARACTER['mercantile-public'];
  const decision = programDecision({ family, physicalUse, programHint, authoredIntent });
  const morphology = morphologyOf(physicalUse, archetype);
  const semanticSeed = hashString32(`${stableKey}:building-semantic-truth`);
  const districtComposition = normalizeDistrictComposition(districtContext);
  const districtStyleBiases = districtComposition?.exteriorHints?.styleBiases ?? [];
  const compositionStyles = uniqueStrings([
    ...districtStyleBiases,
    ...districtStyleBiases,
    ...character.compositionStyles,
  ]);
  const publicFacingIdentity = {
    family: signatureType ? 'signature-institution' : character.publicCharacter,
    program: decision.program,
    signatureType: signatureType ? String(signatureType) : null,
  };
  const truthBody = {
    schema: BUILDING_SEMANTIC_TRUTH_SCHEMA,
    stableKey,
    semanticSeed,
    worldSeed: worldSeed >>> 0,
    chunkKey: String(chunkKey),
    entityId: String(entityId),
    districtContext: String(
      districtComposition?.districtId
      ?? (typeof districtContext === 'string' ? districtContext : null)
      ?? (typeof physicalUse === 'object' ? physicalUse?.districtContext : null)
      ?? 'kowloon'
    ),
    districtComposition,
    physicalUseFamily: family,
    archetype: morphology,
    program: decision.program,
    programDecision: decision.source,
    rejectedProgramHint: decision.rejectedProgramHint,
    publicFacingIdentity,
    tenantInstitutionServiceCharacter: decision.program,
    frontageRoles: [...character.frontageRoles],
    serviceRequirements: {
      access: character.serviceAccess,
      mechanicalIntensity: character.mechanicalIntensity,
      roofMechanicalCharacter: character.roofMechanicalCharacter,
    },
    signageMediaCharacter: {
      signage: character.signageCharacter,
      media: character.mediaCharacter,
      spectacleEligibility: character.spectacleEligibility,
      districtFamily: districtComposition?.districtFamily ?? null,
      frontageCharacter: districtComposition?.frontageCharacter ?? null,
      spectacleCorridor: !!districtComposition?.spectacleCorridor,
    },
    expectedZones: {
      public: [...character.publicZones],
      private: [...character.privateZones],
      service: [...character.serviceZones],
    },
    exteriorTendencies: {
      compositionStyles,
      facadeSemanticFamily: exteriorMacroPreference?.facadeSemanticFamily
        ?? districtComposition?.exteriorHints?.facadeSemanticFamily
        ?? character.facadeSemanticFamily,
      roofSemanticFamily: exteriorMacroPreference?.roofSemanticFamily
        ?? districtComposition?.exteriorHints?.roofSemanticFamily
        ?? character.roofSemanticFamily,
      blockRole: districtComposition?.blockRole ?? null,
      frontageCharacter: districtComposition?.frontageCharacter ?? null,
      spectaclePriority: districtComposition?.spectaclePriority ?? 0,
      spectacleCorridor: !!districtComposition?.spectacleCorridor,
      rooflineTarget: districtComposition?.rooflineTarget ?? null,
    },
    sourcePhysicalUseSchema: typeof physicalUse === 'object' ? physicalUse?.schema ?? null : null,
  };
  const fingerprint = hashString32(JSON.stringify(truthBody)).toString(16).padStart(8, '0');
  return freezeRecord({
    ...truthBody,
    id: `${BUILDING_SEMANTIC_TRUTH_SCHEMA}:${String(chunkKey)}:${String(entityId)}:${semanticSeed.toString(16).padStart(8, '0')}`,
    fingerprint,
  });
}

export function ensureBuildingSemanticTruth({ existing = null, ...inputs } = {}) {
  const stableKey = buildingSemanticStableKey(inputs);
  if (existing?.schema === BUILDING_SEMANTIC_TRUTH_SCHEMA && existing?.stableKey === stableKey) return existing;
  return deriveBuildingSemanticTruth(inputs);
}

export function buildingSemanticCompositionStyles(truth) {
  const styles = truth?.exteriorTendencies?.compositionStyles;
  return Array.isArray(styles) && styles.length ? [...styles] : ['mixed'];
}
