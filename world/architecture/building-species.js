export const BUILDING_SPECIES_SCHEMA = 'jweb.building-species.v1';
export const BUILDING_MASSING_FEASIBILITY_SCHEMA = 'jweb.building-massing-feasibility.v1';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, finite(value))); }
function hash32(text) {
  let h = 2166136261 >>> 0;
  for (const ch of String(text ?? '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d) >>> 0; h ^= h >>> 15;
  return h >>> 0;
}
function unit(text) { return (hash32(text) & 0xffffff) / 0x1000000; }

const SPECIES = Object.freeze({
  'urban-walkup': Object.freeze({
    id: 'urban-walkup', section: 'street-wall-walkup', minFloors: 2, maxFloors: 7,
    tower: false, podiumFloors: 0, preferredAspect: 1.45, maxAspect: 3.4,
    structuralSystem: 'party-wall-or-small-frame', corePattern: 'compact-stair',
    floorplanPattern: 'shop-house-or-small-residential', facadeCadence: 'narrow-repeated-bays',
  }),
  'courtyard-midrise': Object.freeze({
    id: 'courtyard-midrise', section: 'perimeter-midrise', minFloors: 5, maxFloors: 13,
    tower: false, podiumFloors: 0, preferredAspect: 1.35, maxAspect: 3.0,
    structuralSystem: 'masonry-or-concrete-frame', corePattern: 'stacked-core-with-corridor',
    floorplanPattern: 'courtyard-or-corridor-ring', facadeCadence: 'regular-residential-bays',
  }),
  'industrial-loft-block': Object.freeze({
    id: 'industrial-loft-block', section: 'broad-low-loft', minFloors: 2, maxFloors: 8,
    tower: false, podiumFloors: 0, preferredAspect: 1.85, maxAspect: 4.8,
    structuralSystem: 'wide-bay-frame', corePattern: 'service-edge-stair',
    floorplanPattern: 'clear-span-work-bays', facadeCadence: 'wide-structural-bays',
  }),
  'civic-institutional-block': Object.freeze({
    id: 'civic-institutional-block', section: 'broad-institutional-block', minFloors: 3, maxFloors: 12,
    tower: false, podiumFloors: 0, preferredAspect: 1.4, maxAspect: 3.2,
    structuralSystem: 'regular-civic-frame', corePattern: 'public-core-and-service-stack',
    floorplanPattern: 'public-hall-and-program-clusters', facadeCadence: 'large-formal-bays',
  }),
  'residential-point-tower': Object.freeze({
    id: 'residential-point-tower', section: 'podium-plus-compact-point-tower', minFloors: 14, maxFloors: 32,
    tower: true, podiumFloors: 4, preferredAspect: 1.15, maxAspect: 1.9,
    structuralSystem: 'compact-frame-or-shear-wall', corePattern: 'central-residential-core',
    floorplanPattern: 'perimeter-dwellings-around-core', facadeCadence: 'stacked-domestic-bays',
  }),
  'hotel-bar-tower': Object.freeze({
    id: 'hotel-bar-tower', section: 'podium-plus-narrow-bar', minFloors: 12, maxFloors: 28,
    tower: true, podiumFloors: 3, preferredAspect: 2.25, maxAspect: 4.2,
    structuralSystem: 'regular-frame-with-central-service-core', corePattern: 'double-loaded-corridor-core',
    floorplanPattern: 'double-loaded-room-bar', facadeCadence: 'tight-repetitive-room-bays',
  }),
  'office-slab-tower': Object.freeze({
    id: 'office-slab-tower', section: 'podium-plus-office-slab', minFloors: 14, maxFloors: 36,
    tower: true, podiumFloors: 4, preferredAspect: 1.75, maxAspect: 3.3,
    structuralSystem: 'regular-column-frame-with-core', corePattern: 'central-or-offset-office-core',
    floorplanPattern: 'core-plus-lease-depth-perimeter', facadeCadence: 'structural-office-grid',
  }),
  'mixed-use-podium-tower': Object.freeze({
    id: 'mixed-use-podium-tower', section: 'broad-active-podium-plus-tower', minFloors: 12, maxFloors: 32,
    tower: true, podiumFloors: 5, preferredAspect: 1.4, maxAspect: 2.7,
    structuralSystem: 'transfer-podium-and-tower-frame', corePattern: 'shared-transfer-core',
    floorplanPattern: 'public-podium-plus-repeated-upper-occupancy', facadeCadence: 'large-podium-bays-to-smaller-tower-bays',
  }),
});

export const BUILDING_SPECIES = SPECIES;

const SPECIES_GRAMMAR = Object.freeze({
  'urban-walkup': 'shop-house',
  'courtyard-midrise': 'courtyard-ring',
  'industrial-loft-block': 'clear-span-industrial',
  'civic-institutional-block': 'institutional-cluster',
  'residential-point-tower': 'single-loaded-tenement',
  'hotel-bar-tower': 'double-loaded-lodging',
  'office-slab-tower': 'core-perimeter-office',
  'mixed-use-podium-tower': 'vertical-mixed-use',
});

export function buildingSpeciesGrammar(speciesId) { return SPECIES_GRAMMAR[String(speciesId)] ?? null; }
export function buildingSpeciesSpec(speciesId) { return SPECIES[String(speciesId)] ?? SPECIES['urban-walkup']; }

export function selectBuildingSpecies({
  physicalUse = null, programHint = null, archetype = null, siteCellCount = 1,
  desiredFloors = 1, stableKey = '', explicitSpecies = null,
} = {}) {
  if (explicitSpecies && SPECIES[explicitSpecies]) return SPECIES[explicitSpecies];
  const family = String(typeof physicalUse === 'string' ? physicalUse : physicalUse?.family ?? 'mercantile-public');
  const program = String(programHint ?? '');
  const morphology = String(archetype ?? (typeof physicalUse === 'object' ? physicalUse?.morphology : '') ?? '');
  const cells = Math.max(1, Math.floor(finite(siteCellCount, 1)));
  const floors = Math.max(1, Math.floor(finite(desiredFloors, 1)));
  const roll = unit(`${stableKey}:building-species`);

  if (family === 'industrial-service' || family === 'storage' || family === 'maintenance-utility') {
    return SPECIES['industrial-loft-block'];
  }
  if (family === 'assembly-institutional') return SPECIES['civic-institutional-block'];
  if (family === 'business') {
    return (cells >= 9 && (floors >= 9 || morphology === 'vertical-stack'))
      ? SPECIES['office-slab-tower'] : SPECIES['courtyard-midrise'];
  }
  if (family === 'residential-lodging') {
    if (/motel|hotel/.test(program) && cells >= 7) return SPECIES['hotel-bar-tower'];
    if (cells >= 9 && (floors >= 9 || morphology === 'vertical-stack' || roll < 0.30)) return SPECIES['residential-point-tower'];
    return cells >= 7 ? SPECIES['courtyard-midrise'] : SPECIES['urban-walkup'];
  }
  if (family === 'mercantile-public') {
    if (cells >= 12 && (floors >= 9 || morphology === 'vertical-stack' || roll < 0.20)) return SPECIES['mixed-use-podium-tower'];
    return cells >= 8 ? SPECIES['courtyard-midrise'] : SPECIES['urban-walkup'];
  }
  return cells >= 8 ? SPECIES['courtyard-midrise'] : SPECIES['urban-walkup'];
}

function siteCellHeightCap(cells) {
  if (cells <= 2) return 6;
  if (cells <= 3) return 10;
  if (cells <= 4) return 12;
  if (cells <= 5) return 14;
  if (cells <= 7) return 18;
  if (cells <= 9) return 24;
  if (cells <= 11) return 30;
  return 48;
}

export function resolveBuildingHeightIntent({
  baseFloors = 1, ordinaryScale = 1, cavernFloorCap = 48, physicalUse = null,
  programHint = null, archetype = null, siteCellCount = 1, weirdness = 0,
  stableKey = '', explicitPrimaryFloors = null, explicitSpecies = null, explicitHeightAuthority = null,
} = {}) {
  const hasExplicitFloors = explicitPrimaryFloors != null && Number.isFinite(Number(explicitPrimaryFloors));
  const explicit = hasExplicitFloors && explicitHeightAuthority !== false;
  const raw = hasExplicitFloors
    ? Math.max(1, Math.floor(Number(explicitPrimaryFloors)))
    : Math.max(1, Math.round(Math.max(1, finite(baseFloors, 1)) * Math.max(1, finite(ordinaryScale, 1))));
  const species = selectBuildingSpecies({
    physicalUse, programHint, archetype, siteCellCount, desiredFloors: raw, stableKey, explicitSpecies,
  });
  const cells = Math.max(1, Math.floor(finite(siteCellCount, 1)));
  const cavernCap = Math.max(1, Math.floor(finite(cavernFloorCap, 48)));
  const ordinaryCap = Math.min(cavernCap, species.maxFloors, siteCellHeightCap(cells));
  let desiredFloors = explicit ? Math.min(cavernCap, raw) : Math.min(raw, ordinaryCap);
  let skylinePromotion = false;
  let cavernSpanPromotion = false;

  // Ordinary skyscrapers are a species/footprint event, not a lottery that can
  // turn one surviving micro-cell into a 30-storey stick.
  if (!explicit && species.tower) {
    const skylineRoll = unit(`${stableKey}:skyline-height`);
    const skylineChance = clamp(0.16 + finite(weirdness) * 0.12 + (archetype === 'vertical-stack' ? 0.16 : 0), 0, 0.48);
    if (cells >= 9 && skylineRoll < skylineChance) {
      const band = species.id === 'hotel-bar-tower' ? 8 : 12;
      const target = species.minFloors + Math.floor(unit(`${stableKey}:skyline-band`) * band);
      desiredFloors = Math.min(ordinaryCap, Math.max(desiredFloors, target));
      skylinePromotion = desiredFloors >= species.minFloors;
    }
    const spanEligible = cells >= 16 && ['office-slab-tower', 'mixed-use-podium-tower', 'residential-point-tower'].includes(species.id);
    if (spanEligible && unit(`${stableKey}:cavern-span-species`) < 0.035 + clamp(weirdness, 0, 1) * 0.035) {
      desiredFloors = Math.min(cavernCap, Math.max(desiredFloors, cavernCap - (unit(`${stableKey}:cavern-span-top`) < 0.32 ? 1 : 0)));
      cavernSpanPromotion = true;
    }
  }

  return Object.freeze({
    schema: BUILDING_SPECIES_SCHEMA,
    species: species.id,
    section: species.section,
    requestedFloors: raw,
    desiredFloors,
    ordinaryCap,
    siteCellCount: cells,
    explicitHeightAuthority: explicit,
    skylinePromotion,
    cavernSpanPromotion,
    structuralSystem: species.structuralSystem,
    corePattern: species.corePattern,
    floorplanPattern: species.floorplanPattern,
    facadeCadence: species.facadeCadence,
  });
}

function moduleArea(module) { return Math.max(0, finite(module?.rect?.halfX) * 2) * Math.max(0, finite(module?.rect?.halfZ) * 2); }
function keyForCell(cell) { return `${Math.floor(finite(cell?.col))},${Math.floor(finite(cell?.row))}`; }
function moduleCellKey(module) { return keyForCell(module?.cell); }
function touching(a, b) {
  const ac = a?.cell, bc = b?.cell;
  if (!ac || !bc) return false;
  return Math.abs(finite(ac.col) - finite(bc.col)) + Math.abs(finite(ac.row) - finite(bc.row)) === 1;
}
function plateStats(modules) {
  if (!modules.length) return { area: 0, width: 0, depth: 0, minSpan: 0, aspect: Infinity, compactness: 0, moduleCount: 0 };
  const bounds = modules.reduce((acc, module) => ({
    minX: Math.min(acc.minX, finite(module.rect?.cx) - finite(module.rect?.halfX)),
    maxX: Math.max(acc.maxX, finite(module.rect?.cx) + finite(module.rect?.halfX)),
    minZ: Math.min(acc.minZ, finite(module.rect?.cz) - finite(module.rect?.halfZ)),
    maxZ: Math.max(acc.maxZ, finite(module.rect?.cz) + finite(module.rect?.halfZ)),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  const width = Math.max(0.01, bounds.maxX - bounds.minX), depth = Math.max(0.01, bounds.maxZ - bounds.minZ);
  const area = modules.reduce((sum, module) => sum + moduleArea(module), 0);
  const aspect = Math.max(width, depth) / Math.max(0.01, Math.min(width, depth));
  return {
    area, width, depth, minSpan: Math.min(width, depth), aspect,
    compactness: Math.min(1, area / Math.max(0.01, width * depth)),
    moduleCount: modules.length,
  };
}
function requiredOrdinaryUpperPlateModules(floors) {
  if (floors >= 10) return 5;
  if (floors >= 7) return 4;
  if (floors >= 4) return 3;
  if (floors >= 2) return 2;
  return 1;
}
function requiredTowerModules(floors) {
  if (floors >= 34) return 15;
  if (floors >= 26) return 13;
  if (floors >= 20) return 10;
  if (floors >= 15) return 7;
  if (floors >= 9) return 5;
  return requiredOrdinaryUpperPlateModules(floors);
}
function capacityFromPlate(stats, species) {
  if (stats.moduleCount <= 1 || stats.area < 115 || stats.minSpan < 5.5) return 6;
  let cap = 10;
  if (stats.moduleCount >= 4 && stats.area >= 230 && stats.minSpan >= 10) cap = 14;
  if (stats.moduleCount >= 7 && stats.area >= 360 && stats.minSpan >= 13) cap = 18;
  if (stats.moduleCount >= 9 && stats.area >= 470 && stats.minSpan >= 15) cap = 24;
  if (stats.moduleCount >= 10 && stats.area >= 560 && stats.minSpan >= 16.5) cap = 30;
  if (stats.moduleCount >= 12 && stats.area >= 680 && stats.minSpan >= 18) cap = 38;
  if (stats.moduleCount >= 15 && stats.area >= 850 && stats.minSpan >= 20) cap = 48;
  if (stats.aspect > species.maxAspect) cap = Math.min(cap, 18);
  if (stats.compactness < 0.58) cap = Math.min(cap, 18);
  return cap;
}

function chooseTowerPlate(modulePlans, primaryModule, targetCount, species, stableKey) {
  const selected = [primaryModule];
  const selectedKeys = new Set([String(primaryModule.key)]);
  while (selected.length < Math.min(targetCount, modulePlans.length)) {
    const candidates = modulePlans.filter(module => !selectedKeys.has(String(module.key))
      && selected.some(existing => touching(existing, module)));
    if (!candidates.length) break;
    const ranked = candidates.map(module => {
      const next = [...selected, module];
      const stats = plateStats(next);
      const touches = selected.filter(existing => touching(existing, module)).length;
      const aspectPenalty = Math.abs(stats.aspect - species.preferredAspect);
      const compactnessReward = species.id === 'hotel-bar-tower' ? stats.compactness * 1.5 : stats.compactness * 5.5;
      const jitter = unit(`${stableKey}:plate:${module.key}`) * 0.12;
      const score = touches * 3.4 + compactnessReward - aspectPenalty * 2.2 + jitter;
      return { module, score };
    }).sort((a, b) => b.score - a.score || String(a.module.key).localeCompare(String(b.module.key)));
    const winner = ranked[0]?.module;
    if (!winner) break;
    selected.push(winner); selectedKeys.add(String(winner.key));
  }
  return selected;
}

export function applyBuildingSpeciesMassing({
  modulePlans = [], primaryModule = null, heightIntent = null, stableKey = '', preserveExplicitHeight = true,
} = {}) {
  if (!modulePlans.length || !primaryModule || !heightIntent) return null;
  const species = buildingSpeciesSpec(heightIntent.species);
  const requestedFloors = Math.max(1, Math.floor(finite(heightIntent.desiredFloors, primaryModule.floors)));
  const explicit = heightIntent.explicitHeightAuthority === true;
  // Feasibility must test at least the same real upper-floor plate that the
  // circulation normalizer requires later. Probing an 8-storey block with only
  // three modules (or a 10-storey tower-eligible block with two) manufactured
  // false anti-stick failures and invalidated already-planned bridge floors.
  const targetCount = Math.min(
    modulePlans.length,
    species.tower ? requiredTowerModules(requestedFloors) : requiredOrdinaryUpperPlateModules(requestedFloors),
  );
  const plate = chooseTowerPlate(modulePlans, primaryModule, targetCount, species, stableKey);
  const stats = plateStats(plate);
  const plateCapacity = capacityFromPlate(stats, species);
  const resolvedFloors = explicit && preserveExplicitHeight
    ? requestedFloors
    : Math.min(requestedFloors, species.maxFloors, plateCapacity);
  const downgraded = resolvedFloors < requestedFloors;
  const plateKeys = new Set(plate.map(module => String(module.key)));

  if (species.tower && resolvedFloors >= 11) {
    const podiumFloors = Math.min(resolvedFloors, Math.max(2, species.podiumFloors));
    for (const module of modulePlans) {
      if (plateKeys.has(String(module.key))) module.floors = resolvedFloors;
      else module.floors = Math.min(module.floors, podiumFloors + (unit(`${stableKey}:podium:${module.key}`) < 0.20 ? 1 : 0));
    }
  } else {
    for (const module of modulePlans) module.floors = Math.min(module.floors, resolvedFloors, species.maxFloors);
    primaryModule.floors = resolvedFloors;
  }

  // Recompute after shaping. This is the actual highest occupied plate, not the
  // site/base footprint. A tall building is feasible only if this plate remains a
  // real building floor rather than one stair module.
  const topPlate = modulePlans.filter(module => Number(module.floors) >= resolvedFloors);
  const topStats = plateStats(topPlate);
  const usablePlateAreaFloor = Math.max(80, topStats.area - Math.min(72, topStats.area * 0.22));
  const circulationOnlyRisk = resolvedFloors >= 12 && usablePlateAreaFloor < 240;

  return Object.freeze({
    schema: BUILDING_MASSING_FEASIBILITY_SCHEMA,
    species: species.id,
    section: species.section,
    requestedFloors,
    resolvedFloors,
    downgraded,
    downgradeReason: downgraded ? 'upper-floorplate-cannot-support-requested-height' : null,
    plateCapacity,
    topPlateModuleKeys: Object.freeze(topPlate.map(module => String(module.key)).sort()),
    topPlateModuleCount: topStats.moduleCount,
    topPlateArea: topStats.area,
    topPlateMinSpan: topStats.minSpan,
    topPlateAspect: topStats.aspect,
    topPlateCompactness: topStats.compactness,
    estimatedUsablePlateArea: usablePlateAreaFloor,
    circulationOnlyRisk,
    structuralSystem: species.structuralSystem,
    corePattern: species.corePattern,
    floorplanPattern: species.floorplanPattern,
    facadeCadence: species.facadeCadence,
    podiumFloors: species.tower && resolvedFloors >= 11 ? Math.min(resolvedFloors, Math.max(2, species.podiumFloors)) : 0,
    authority: 'height-follows-viable-floorplate-v1',
  });
}
