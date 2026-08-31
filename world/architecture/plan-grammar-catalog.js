export const ARCHITECTURAL_NORTH_STAR = Object.freeze({
  schema: 'jweb.architectural-north-star.v1',
  organism: 'kowloon-walled-city',
  streetLayer: Object.freeze(['japanese-yokocho', 'korean-euljiro-service-alley']),
  rules: Object.freeze([
    'treat the district as accreted three-dimensional fabric, not freestanding buildings',
    'prefer narrow pedestrian alleys, compressed thresholds, tiny repeated street-front rooms, and deep mixed-use service space',
    'let shops/workrooms/dwellings/services interlock vertically and laterally across structural modules',
    'make projecting signs, shutters, stools, crates, tables, ducts, cages, stairs, balconies, and service hardware consequences of frontage ownership',
    'preserve irregular growth, party-wall dependence, lightwell/courtyard scarcity, roof accretion, bridges, and exterior circulation',
    'at spawn organize this organism with unnervingly plausible human-use logic; far away reverse the hierarchy while preserving the same obsessive alley cadence and physical reachability',
  ]),
  antiGoals: Object.freeze([
    'generic western office/suburban building averages',
    'wide clean boulevards as the dominant experience',
    'isolated tower objects with decorative neon pasted on afterward',
    'random weirdness that breaks circulation instead of reversing architectural causality',
  ]),
});

const space = (key, role, areaWeight, options = {}) => Object.freeze({
  key,
  role,
  areaWeight,
  minArea: options.minArea ?? 2.5,
  maxArea: options.maxArea ?? Infinity,
  repeat: options.repeat ?? null,
  exteriorPreference: options.exteriorPreference ?? 'neutral',
  privacy: options.privacy ?? 'semi',
  daylight: options.daylight ?? 'neutral',
  facadePattern: options.facadePattern ?? 'ordinary',
  requiredAdjacency: Object.freeze([...(options.requiredAdjacency ?? [])]),
  preferredAdjacency: Object.freeze([...(options.preferredAdjacency ?? [])]),
  floorPolicy: options.floorPolicy ?? 'all',
  program: options.program ?? null,
});

const grammar = (id, families, ground, upper, options = {}) => Object.freeze({
  id,
  families: Object.freeze([...families]),
  ground: Object.freeze(ground),
  upper: Object.freeze(upper),
  verticalPolicy: options.verticalPolicy ?? 'stack-service',
  circulationBias: options.circulationBias ?? 0.16,
  courtyardBias: options.courtyardBias ?? 0,
  notes: options.notes ?? '',
});

export const PLAN_GRAMMARS = Object.freeze({
  'shop-house': grammar('shop-house', ['mercantile-public', 'residential-lodging'], [
    space('entry', 'entry', 0.05, { exteriorPreference: 'street', privacy: 'public', facadePattern: 'threshold', requiredAdjacency: ['public-floor'] }),
    space('public-floor', 'public', 0.45, { exteriorPreference: 'street', privacy: 'public', daylight: 'high', facadePattern: 'broad-retail', requiredAdjacency: ['entry', 'work-band'], preferredAdjacency: ['service'] }),
    space('work-band', 'work', 0.22, { exteriorPreference: 'neutral', privacy: 'semi', requiredAdjacency: ['public-floor', 'service'] }),
    space('service', 'service', 0.16, { exteriorPreference: 'deep', privacy: 'service', daylight: 'low', facadePattern: 'service-sparse', requiredAdjacency: ['work-band', 'circulation'] }),
    space('circulation', 'circulation', 0.12, { exteriorPreference: 'deep', privacy: 'semi', facadePattern: 'vertical-slit', requiredAdjacency: ['service'] }),
  ], [
    space('circulation', 'circulation', 0.18, { exteriorPreference: 'deep', facadePattern: 'vertical-slit', requiredAdjacency: ['private-room'] }),
    space('private-room', 'private', 0.58, { repeat: { min: 2, max: 5, desiredArea: 13 }, exteriorPreference: 'perimeter', privacy: 'private', daylight: 'high', facadePattern: 'domestic-bay', requiredAdjacency: ['circulation'] }),
    space('service', 'service', 0.14, { exteriorPreference: 'deep', privacy: 'service', daylight: 'low', requiredAdjacency: ['circulation'] }),
    space('shared', 'shared', 0.10, { exteriorPreference: 'perimeter', privacy: 'semi', daylight: 'high', preferredAdjacency: ['circulation', 'private-room'] }),
  ], { circulationBias: 0.14, notes: 'Street public frontage with service depth and private upper life.' }),

  'double-loaded-lodging': grammar('double-loaded-lodging', ['residential-lodging'], [
    space('entry', 'entry', 0.06, { exteriorPreference: 'street', privacy: 'public', requiredAdjacency: ['lobby'] }),
    space('lobby', 'public', 0.18, { exteriorPreference: 'street', privacy: 'public', daylight: 'high', facadePattern: 'lobby-glazed', requiredAdjacency: ['entry', 'circulation'] }),
    space('circulation', 'circulation', 0.20, { exteriorPreference: 'deep', requiredAdjacency: ['lobby', 'lodging-room'] }),
    space('lodging-room', 'private', 0.46, { repeat: { min: 2, max: 7, desiredArea: 18 }, exteriorPreference: 'perimeter', privacy: 'private', daylight: 'high', facadePattern: 'lodging-repeat', requiredAdjacency: ['circulation'] }),
    space('service', 'service', 0.10, { exteriorPreference: 'deep', privacy: 'service', daylight: 'low', requiredAdjacency: ['circulation'] }),
  ], [
    space('circulation', 'circulation', 0.20, { exteriorPreference: 'deep', requiredAdjacency: ['lodging-room', 'service'] }),
    space('lodging-room', 'private', 0.68, { repeat: { min: 3, max: 10, desiredArea: 18 }, exteriorPreference: 'perimeter', privacy: 'private', daylight: 'high', facadePattern: 'lodging-repeat', requiredAdjacency: ['circulation'] }),
    space('service', 'service', 0.12, { exteriorPreference: 'deep', privacy: 'service', daylight: 'low', requiredAdjacency: ['circulation'] }),
  ], { circulationBias: 0.20, verticalPolicy: 'strict-core-stack' }),

  'single-loaded-tenement': grammar('single-loaded-tenement', ['residential-lodging', 'mercantile-public'], [
    space('entry', 'entry', 0.06, { exteriorPreference: 'street', privacy: 'semi', requiredAdjacency: ['circulation'] }),
    space('circulation', 'circulation', 0.17, { exteriorPreference: 'perimeter', requiredAdjacency: ['entry', 'dwelling'] }),
    space('dwelling', 'private', 0.62, { repeat: { min: 2, max: 6, desiredArea: 22 }, exteriorPreference: 'perimeter', privacy: 'private', daylight: 'high', facadePattern: 'domestic-bay', requiredAdjacency: ['circulation'] }),
    space('shared-service', 'service', 0.15, { exteriorPreference: 'deep', privacy: 'service', daylight: 'low', requiredAdjacency: ['circulation'] }),
  ], [
    space('circulation', 'circulation', 0.18, { exteriorPreference: 'perimeter', requiredAdjacency: ['dwelling'] }),
    space('dwelling', 'private', 0.68, { repeat: { min: 2, max: 7, desiredArea: 24 }, exteriorPreference: 'perimeter', privacy: 'private', daylight: 'high', facadePattern: 'domestic-bay', requiredAdjacency: ['circulation'] }),
    space('shared-service', 'service', 0.14, { exteriorPreference: 'deep', privacy: 'service', daylight: 'low', requiredAdjacency: ['circulation'] }),
  ], { circulationBias: 0.17 }),

  'courtyard-ring': grammar('courtyard-ring', ['residential-lodging', 'assembly-institutional', 'mercantile-public'], [
    space('entry', 'entry', 0.05, { exteriorPreference: 'street', privacy: 'public', requiredAdjacency: ['ring'] }),
    space('ring', 'circulation', 0.20, { exteriorPreference: 'courtyard', requiredAdjacency: ['entry', 'perimeter-room'] }),
    space('perimeter-room', 'public', 0.52, { repeat: { min: 3, max: 8, desiredArea: 20 }, exteriorPreference: 'perimeter', daylight: 'high', facadePattern: 'repeated-bay', requiredAdjacency: ['ring'] }),
    space('service', 'service', 0.13, { exteriorPreference: 'deep', daylight: 'low', requiredAdjacency: ['ring'] }),
    space('court-edge', 'shared', 0.10, { exteriorPreference: 'courtyard', daylight: 'high', preferredAdjacency: ['ring', 'perimeter-room'] }),
  ], [
    space('ring', 'circulation', 0.22, { exteriorPreference: 'courtyard', requiredAdjacency: ['perimeter-room'] }),
    space('perimeter-room', 'private', 0.62, { repeat: { min: 3, max: 9, desiredArea: 18 }, exteriorPreference: 'perimeter', daylight: 'high', facadePattern: 'repeated-bay', requiredAdjacency: ['ring'] }),
    space('service', 'service', 0.16, { exteriorPreference: 'deep', daylight: 'low', requiredAdjacency: ['ring'] }),
  ], { circulationBias: 0.22, courtyardBias: 0.75 }),

  'core-perimeter-office': grammar('core-perimeter-office', ['business'], [
    space('entry', 'entry', 0.05, { exteriorPreference: 'street', privacy: 'public', requiredAdjacency: ['reception'] }),
    space('reception', 'public', 0.14, { exteriorPreference: 'street', privacy: 'public', facadePattern: 'office-glazed', requiredAdjacency: ['entry', 'work-floor'] }),
    space('work-floor', 'work', 0.50, { exteriorPreference: 'perimeter', daylight: 'high', facadePattern: 'office-grid', requiredAdjacency: ['reception', 'core'] }),
    space('meeting', 'shared', 0.15, { exteriorPreference: 'perimeter', daylight: 'high', preferredAdjacency: ['work-floor', 'core'] }),
    space('core', 'circulation', 0.10, { exteriorPreference: 'deep', daylight: 'low', facadePattern: 'core-blank', requiredAdjacency: ['work-floor', 'service'] }),
    space('service', 'service', 0.06, { exteriorPreference: 'deep', daylight: 'low', facadePattern: 'service-sparse', requiredAdjacency: ['core'] }),
  ], [
    space('work-floor', 'work', 0.56, { exteriorPreference: 'perimeter', daylight: 'high', facadePattern: 'office-grid', requiredAdjacency: ['core'] }),
    space('meeting', 'shared', 0.18, { repeat: { min: 1, max: 4, desiredArea: 16 }, exteriorPreference: 'perimeter', daylight: 'high', preferredAdjacency: ['work-floor', 'core'] }),
    space('core', 'circulation', 0.16, { exteriorPreference: 'deep', daylight: 'low', facadePattern: 'core-blank', requiredAdjacency: ['work-floor', 'service'] }),
    space('service', 'service', 0.10, { exteriorPreference: 'deep', daylight: 'low', requiredAdjacency: ['core'] }),
  ], { circulationBias: 0.17, verticalPolicy: 'strict-core-stack' }),

  'service-band-workshop': grammar('service-band-workshop', ['industrial-service', 'maintenance-utility', 'mercantile-public'], [
    space('entry', 'entry', 0.05, { exteriorPreference: 'street', privacy: 'public', requiredAdjacency: ['work-hall'] }),
    space('work-hall', 'work', 0.56, { exteriorPreference: 'street', daylight: 'high', facadePattern: 'industrial-broad', requiredAdjacency: ['entry', 'service-band'] }),
    space('service-band', 'service', 0.19, { exteriorPreference: 'deep', daylight: 'low', facadePattern: 'service-sparse', requiredAdjacency: ['work-hall', 'storage'] }),
    space('storage', 'storage', 0.13, { exteriorPreference: 'deep', daylight: 'low', requiredAdjacency: ['service-band'] }),
    space('circulation', 'circulation', 0.07, { exteriorPreference: 'neutral', requiredAdjacency: ['service-band'] }),
  ], [
    space('work-loft', 'work', 0.46, { exteriorPreference: 'perimeter', daylight: 'high', facadePattern: 'industrial-grid', requiredAdjacency: ['circulation'] }),
    space('storage', 'storage', 0.24, { exteriorPreference: 'deep', daylight: 'low', requiredAdjacency: ['circulation'] }),
    space('circulation', 'circulation', 0.18, { exteriorPreference: 'deep', requiredAdjacency: ['work-loft', 'storage'] }),
    space('service', 'service', 0.12, { exteriorPreference: 'deep', daylight: 'low', requiredAdjacency: ['circulation'] }),
  ], { circulationBias: 0.11 }),

  'clear-span-industrial': grammar('clear-span-industrial', ['industrial-service', 'storage'], [
    space('entry', 'entry', 0.04, { exteriorPreference: 'street', requiredAdjacency: ['hall'] }),
    space('hall', 'work', 0.68, { exteriorPreference: 'perimeter', daylight: 'high', facadePattern: 'industrial-broad', requiredAdjacency: ['entry', 'service'] }),
    space('service', 'service', 0.12, { exteriorPreference: 'deep', daylight: 'low', requiredAdjacency: ['hall', 'storage'] }),
    space('storage', 'storage', 0.12, { exteriorPreference: 'deep', daylight: 'low', requiredAdjacency: ['service'] }),
    space('circulation', 'circulation', 0.04, { exteriorPreference: 'neutral', requiredAdjacency: ['service'] }),
  ], [
    space('catwalk-work', 'work', 0.54, { exteriorPreference: 'perimeter', daylight: 'high', requiredAdjacency: ['circulation'] }),
    space('service', 'service', 0.20, { exteriorPreference: 'deep', requiredAdjacency: ['circulation'] }),
    space('storage', 'storage', 0.16, { exteriorPreference: 'deep', requiredAdjacency: ['service'] }),
    space('circulation', 'circulation', 0.10, { exteriorPreference: 'deep', requiredAdjacency: ['catwalk-work', 'service'] }),
  ], { circulationBias: 0.08 }),

  'institutional-cluster': grammar('institutional-cluster', ['assembly-institutional', 'business'], [
    space('entry', 'entry', 0.05, { exteriorPreference: 'street', privacy: 'public', requiredAdjacency: ['lobby'] }),
    space('lobby', 'public', 0.13, { exteriorPreference: 'street', privacy: 'public', daylight: 'high', facadePattern: 'institutional-entry', requiredAdjacency: ['entry', 'circulation'] }),
    space('circulation', 'circulation', 0.22, { exteriorPreference: 'deep', requiredAdjacency: ['lobby', 'program-room', 'service'] }),
    space('program-room', 'program', 0.42, { repeat: { min: 2, max: 7, desiredArea: 22 }, exteriorPreference: 'perimeter', daylight: 'high', facadePattern: 'institutional-bay', requiredAdjacency: ['circulation'] }),
    space('shared', 'shared', 0.10, { exteriorPreference: 'perimeter', daylight: 'high', preferredAdjacency: ['circulation', 'program-room'] }),
    space('service', 'service', 0.08, { exteriorPreference: 'deep', daylight: 'low', requiredAdjacency: ['circulation'] }),
  ], [
    space('circulation', 'circulation', 0.24, { exteriorPreference: 'deep', requiredAdjacency: ['program-room', 'service'] }),
    space('program-room', 'program', 0.54, { repeat: { min: 2, max: 8, desiredArea: 22 }, exteriorPreference: 'perimeter', daylight: 'high', facadePattern: 'institutional-bay', requiredAdjacency: ['circulation'] }),
    space('shared', 'shared', 0.12, { exteriorPreference: 'perimeter', daylight: 'high', preferredAdjacency: ['circulation'] }),
    space('service', 'service', 0.10, { exteriorPreference: 'deep', daylight: 'low', requiredAdjacency: ['circulation'] }),
  ], { circulationBias: 0.22, verticalPolicy: 'stack-service' }),

  'public-hall-support': grammar('public-hall-support', ['assembly-institutional', 'mercantile-public'], [
    space('entry', 'entry', 0.05, { exteriorPreference: 'street', privacy: 'public', requiredAdjacency: ['hall'] }),
    space('hall', 'public', 0.56, { exteriorPreference: 'perimeter', privacy: 'public', daylight: 'high', facadePattern: 'hall-tall', requiredAdjacency: ['entry', 'support'] }),
    space('support', 'service', 0.17, { exteriorPreference: 'deep', daylight: 'low', requiredAdjacency: ['hall', 'circulation'] }),
    space('circulation', 'circulation', 0.12, { exteriorPreference: 'neutral', requiredAdjacency: ['support'] }),
    space('ancillary', 'shared', 0.10, { exteriorPreference: 'perimeter', preferredAdjacency: ['hall', 'circulation'] }),
  ], [
    space('gallery', 'public', 0.50, { exteriorPreference: 'perimeter', daylight: 'high', facadePattern: 'hall-tall', requiredAdjacency: ['circulation'] }),
    space('support', 'service', 0.20, { exteriorPreference: 'deep', requiredAdjacency: ['circulation'] }),
    space('circulation', 'circulation', 0.18, { exteriorPreference: 'neutral', requiredAdjacency: ['gallery', 'support'] }),
    space('ancillary', 'shared', 0.12, { exteriorPreference: 'perimeter', preferredAdjacency: ['gallery', 'circulation'] }),
  ], { circulationBias: 0.14 }),

  'storage-stack': grammar('storage-stack', ['storage', 'maintenance-utility'], [
    space('entry', 'entry', 0.04, { exteriorPreference: 'street', requiredAdjacency: ['control'] }),
    space('control', 'work', 0.12, { exteriorPreference: 'street', facadePattern: 'service-window', requiredAdjacency: ['entry', 'storage'] }),
    space('storage', 'storage', 0.64, { exteriorPreference: 'deep', daylight: 'low', facadePattern: 'core-blank', requiredAdjacency: ['control', 'circulation'] }),
    space('circulation', 'circulation', 0.12, { exteriorPreference: 'neutral', requiredAdjacency: ['storage', 'service'] }),
    space('service', 'service', 0.08, { exteriorPreference: 'deep', daylight: 'low', requiredAdjacency: ['circulation'] }),
  ], [
    space('storage', 'storage', 0.68, { exteriorPreference: 'deep', daylight: 'low', facadePattern: 'core-blank', requiredAdjacency: ['circulation'] }),
    space('circulation', 'circulation', 0.20, { exteriorPreference: 'neutral', requiredAdjacency: ['storage', 'service'] }),
    space('service', 'service', 0.12, { exteriorPreference: 'deep', daylight: 'low', requiredAdjacency: ['circulation'] }),
  ], { circulationBias: 0.14, verticalPolicy: 'strict-core-stack' }),

  'vertical-mixed-use': grammar('vertical-mixed-use', ['mercantile-public', 'business', 'residential-lodging'], [
    space('entry', 'entry', 0.05, { exteriorPreference: 'street', requiredAdjacency: ['public-floor'] }),
    space('public-floor', 'public', 0.48, { exteriorPreference: 'street', daylight: 'high', facadePattern: 'broad-retail', requiredAdjacency: ['entry', 'service'] }),
    space('service', 'service', 0.18, { exteriorPreference: 'deep', requiredAdjacency: ['public-floor', 'core'] }),
    space('core', 'circulation', 0.17, { exteriorPreference: 'deep', facadePattern: 'vertical-slit', requiredAdjacency: ['service'] }),
    space('back-room', 'work', 0.12, { exteriorPreference: 'deep', preferredAdjacency: ['service', 'public-floor'] }),
  ], [
    space('core', 'circulation', 0.17, { exteriorPreference: 'deep', requiredAdjacency: ['occupiable'] }),
    space('occupiable', 'private', 0.60, { repeat: { min: 2, max: 6, desiredArea: 18 }, exteriorPreference: 'perimeter', daylight: 'high', facadePattern: 'mixed-bay', requiredAdjacency: ['core'] }),
    space('shared', 'shared', 0.13, { exteriorPreference: 'perimeter', preferredAdjacency: ['core', 'occupiable'] }),
    space('service', 'service', 0.10, { exteriorPreference: 'deep', requiredAdjacency: ['core'] }),
  ], { circulationBias: 0.17, verticalPolicy: 'strict-core-stack' }),

  'fragmented-compound': grammar('fragmented-compound', ['maintenance-utility', 'industrial-service', 'storage', 'mercantile-public'], [
    space('entry', 'entry', 0.05, { exteriorPreference: 'street', requiredAdjacency: ['yard-edge'] }),
    space('yard-edge', 'circulation', 0.18, { exteriorPreference: 'perimeter', requiredAdjacency: ['entry', 'work-cell'] }),
    space('work-cell', 'work', 0.48, { repeat: { min: 2, max: 6, desiredArea: 18 }, exteriorPreference: 'perimeter', daylight: 'high', facadePattern: 'irregular-industrial', requiredAdjacency: ['yard-edge'] }),
    space('storage', 'storage', 0.18, { exteriorPreference: 'deep', requiredAdjacency: ['yard-edge'] }),
    space('service', 'service', 0.11, { exteriorPreference: 'deep', requiredAdjacency: ['yard-edge'] }),
  ], [
    space('gallery-walk', 'circulation', 0.22, { exteriorPreference: 'perimeter', requiredAdjacency: ['work-cell'] }),
    space('work-cell', 'work', 0.54, { repeat: { min: 2, max: 5, desiredArea: 16 }, exteriorPreference: 'perimeter', requiredAdjacency: ['gallery-walk'] }),
    space('storage', 'storage', 0.14, { exteriorPreference: 'deep', requiredAdjacency: ['gallery-walk'] }),
    space('service', 'service', 0.10, { exteriorPreference: 'deep', requiredAdjacency: ['gallery-walk'] }),
  ], { circulationBias: 0.18, verticalPolicy: 'drifting-stack' }),
});

export const FAMILY_GRAMMAR_POOLS = Object.freeze({
  'residential-lodging': Object.freeze(['double-loaded-lodging', 'single-loaded-tenement', 'courtyard-ring', 'shop-house', 'vertical-mixed-use']),
  'mercantile-public': Object.freeze(['shop-house', 'vertical-mixed-use', 'public-hall-support', 'courtyard-ring', 'fragmented-compound']),
  business: Object.freeze(['core-perimeter-office', 'vertical-mixed-use', 'institutional-cluster']),
  'assembly-institutional': Object.freeze(['institutional-cluster', 'public-hall-support', 'courtyard-ring']),
  'industrial-service': Object.freeze(['service-band-workshop', 'clear-span-industrial', 'fragmented-compound']),
  storage: Object.freeze(['storage-stack', 'clear-span-industrial', 'fragmented-compound']),
  'maintenance-utility': Object.freeze(['storage-stack', 'service-band-workshop', 'fragmented-compound']),
});

export const PROGRAM_GRAMMAR = Object.freeze({
  diner: 'shop-house', laundromat: 'shop-house', grocery: 'shop-house', convenience: 'shop-house', pharmacy: 'shop-house', florist: 'shop-house', butcher: 'shop-house',
  hardware_store: 'service-band-workshop', print_shop: 'service-band-workshop', photo_lab: 'service-band-workshop', electronics_repair: 'service-band-workshop',
  bar: 'public-hall-support', arcade: 'public-hall-support', motel_room: 'double-loaded-lodging',
  office: 'core-perimeter-office', '1980s_office': 'core-perimeter-office', bank: 'core-perimeter-office', post_office: 'institutional-cluster',
  library: 'institutional-cluster', archive: 'storage-stack', clinic: 'institutional-cluster', dentist: 'institutional-cluster', school_classroom: 'institutional-cluster', courtroom: 'public-hall-support', police_booking: 'institutional-cluster', funeral_home: 'public-hall-support',
  fire_station: 'service-band-workshop', auto_shop: 'service-band-workshop', laboratory: 'institutional-cluster',
  projection_booth: 'storage-stack', radio_station: 'core-perimeter-office', boiler_room: 'storage-stack', factory_control: 'storage-stack', server_room: 'storage-stack', mainframe_room: 'storage-stack',
});

// Spawn-specific intent is deliberately semantic, not geometric.  The existing
// authored site reservation remains authoritative for footprint and entrances;
// this table tells the planner how those reserved envelopes should organize.
export const SPAWN_AUTHORED_INTENTS = Object.freeze({
  artGallery: Object.freeze({
    grammar: 'public-hall-support',
    program: 'gallery',
    groundOverrides: Object.freeze({ hall: 'main-gallery', support: 'prep-storage', ancillary: 'side-gallery' }),
    accuracyNote: 'Public threshold -> dominant gallery -> prep/storage and side gallery; upper spaces remain subordinate to the exhibition sequence.',
  }),
  as400Archive: Object.freeze({
    grammar: 'storage-stack',
    program: 'archive',
    groundOverrides: Object.freeze({ control: 'index-desk', storage: 'archive-stacks', service: 'machine-service' }),
    accuracyNote: 'Readable control/index threshold guarding dense stacks and machine/service depth.',
  }),
  justinIndex: Object.freeze({
    grammar: 'institutional-cluster',
    program: 'library',
    groundOverrides: Object.freeze({ lobby: 'index-threshold', 'program-room': 'index-reading', shared: 'reference-bay', service: 'server-service' }),
    accuracyNote: 'Search/index threshold, clustered reading/reference rooms, and a deep service/server band.',
  }),
  systemsWorkshop: Object.freeze({
    grammar: 'service-band-workshop',
    program: 'electronics_repair',
    groundOverrides: Object.freeze({ 'work-hall': 'systems-workshop', 'service-band': 'bench-service', storage: 'parts-cage' }),
    accuracyNote: 'Large working hall with a dense service/bench back band and parts storage instead of generic chopped rooms.',
  }),
  loreShrine: Object.freeze({
    grammar: 'public-hall-support',
    program: 'assembly',
    groundOverrides: Object.freeze({ hall: 'central-shrine', support: 'keeper-service', ancillary: 'lore-alcove' }),
    accuracyNote: 'Strong axial threshold into one dominant chamber, with subordinate alcoves and keeper/service space.',
  }),
  futurePlaceholder: Object.freeze({
    grammar: 'fragmented-compound',
    program: 'unassigned',
    groundOverrides: Object.freeze({ 'work-cell': 'reserved-cell', storage: 'reserved-storage' }),
    accuracyNote: 'A coherent but intentionally unresolved shell; no fake program specificity.',
  }),
});

export function grammarById(id) {
  return PLAN_GRAMMARS[id] ?? null;
}
