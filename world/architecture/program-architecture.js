import { TRAVERSAL_PERMISSION } from '../sectional-circulation.js';

export const PROGRAM_ARCHITECTURE_SCHEMA = 'jweb.program-architecture.v1';

const zone = (key, role, areaWeight, options = {}) => Object.freeze({
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
  traversalPermission: options.traversalPermission ?? null,
  frontagePriority: options.frontagePriority ?? 'neutral',
  serviceSpine: options.serviceSpine ?? false,
  operationalRole: options.operationalRole ?? key,
  functionalFixture: options.functionalFixture ?? null,
  unitEnvelope: options.unitEnvelope ?? null,
});

const flow = (id, sequence, options = {}) => Object.freeze({
  id,
  sequence: Object.freeze([...sequence]),
  routeClass: options.routeClass ?? 'operational',
  permission: options.permission ?? null,
  mustRemainDistinctFrom: Object.freeze([...(options.mustRemainDistinctFrom ?? [])]),
});

const profile = (id, morphologies, ground, upper, options = {}) => Object.freeze({
  schema: PROGRAM_ARCHITECTURE_SCHEMA,
  id,
  morphologies: Object.freeze([...morphologies]),
  ground: Object.freeze(ground),
  upper: Object.freeze(upper),
  route: Object.freeze(options.route === 'ground' ? ground : (options.route ?? [])),
  flows: Object.freeze([...(options.flows ?? [])]),
  serviceCharacter: options.serviceCharacter ?? null,
  serviceSpineKeys: Object.freeze([...(options.serviceSpineKeys ?? [])]),
  frontageKeys: Object.freeze([...(options.frontageKeys ?? [])]),
  identityFixtures: Object.freeze([...(options.identityFixtures ?? [])]),
  notes: options.notes ?? '',
});

const PUBLIC = TRAVERSAL_PERMISSION.PUBLIC_THROUGH;
const SEMI = TRAVERSAL_PERMISSION.SEMI_PUBLIC_THROUGH;
const STAFF = TRAVERSAL_PERMISSION.STAFF_THROUGH;
const SERVICE = TRAVERSAL_PERMISSION.SERVICE_THROUGH;
const SECURE = TRAVERSAL_PERMISSION.SECURE;
const PRIVATE = TRAVERSAL_PERMISSION.PRIVATE_DESTINATION_ONLY;
const NONE = TRAVERSAL_PERMISSION.NO_THROUGH;

const APARTMENT_UNIT = Object.freeze({
  schema: 'jweb.dwelling-unit-program.v1',
  rooms: Object.freeze([
    Object.freeze({ key: 'entry', role: 'entry', areaWeight: 0.08 }),
    Object.freeze({ key: 'living-dining', role: 'shared', areaWeight: 0.36 }),
    Object.freeze({ key: 'kitchen', role: 'work', areaWeight: 0.18 }),
    Object.freeze({ key: 'bedroom', role: 'private', areaWeight: 0.25 }),
    Object.freeze({ key: 'bathroom', role: 'service', areaWeight: 0.13 }),
  ]),
  entryTarget: 'living-dining',
  adjacency: Object.freeze([
    Object.freeze(['entry', 'kitchen']),
    Object.freeze(['entry', 'bathroom']),
    Object.freeze(['kitchen', 'living-dining']),
    Object.freeze(['bathroom', 'bedroom']),
    Object.freeze(['living-dining', 'bedroom']),
  ]),
});

const apartment = profile('apartment', ['single-loaded-tenement', 'double-loaded-lodging', 'courtyard-ring'], [
  zone('entry', 'entry', 0.06, { exteriorPreference: 'street', privacy: 'public', requiredAdjacency: ['circulation'], traversalPermission: PUBLIC, frontagePriority: 'preferred' }),
  zone('circulation', 'circulation', 0.18, { exteriorPreference: 'perimeter', requiredAdjacency: ['entry', 'dwelling-unit'], traversalPermission: PUBLIC }),
  zone('dwelling-unit', 'private', 0.62, { repeat: { min: 2, max: 4, desiredArea: 38 }, exteriorPreference: 'perimeter', privacy: 'private', daylight: 'high', facadePattern: 'domestic-bay', requiredAdjacency: ['circulation'], traversalPermission: PRIVATE, unitEnvelope: APARTMENT_UNIT }),
  zone('shared-service', 'service', 0.14, { exteriorPreference: 'deep', privacy: 'service', daylight: 'low', requiredAdjacency: ['circulation'], traversalPermission: SERVICE, serviceSpine: true }),
], [
  zone('circulation', 'circulation', 0.18, { exteriorPreference: 'perimeter', requiredAdjacency: ['dwelling-unit'], traversalPermission: PUBLIC }),
  zone('dwelling-unit', 'private', 0.68, { repeat: { min: 2, max: 4, desiredArea: 38 }, exteriorPreference: 'perimeter', privacy: 'private', daylight: 'high', facadePattern: 'domestic-bay', requiredAdjacency: ['circulation'], traversalPermission: PRIVATE, unitEnvelope: APARTMENT_UNIT }),
  zone('shared-service', 'service', 0.14, { exteriorPreference: 'deep', privacy: 'service', daylight: 'low', requiredAdjacency: ['circulation'], traversalPermission: SERVICE, serviceSpine: true }),
], {
  flows: [flow('resident-access', ['circulation', 'dwelling-unit'], { routeClass: 'resident' })],
  serviceCharacter: 'stacked-domestic-wet-service',
  serviceSpineKeys: ['shared-service'],
  notes: 'Dwelling is an apartment envelope containing a nested room program, not a terminal room label.',
});

const motel = profile('motel-room-building', ['double-loaded-lodging'], [
  zone('entry', 'entry', 0.06, { exteriorPreference: 'street', privacy: 'public', requiredAdjacency: ['lobby', 'circulation'], traversalPermission: PUBLIC }),
  zone('lobby', 'public', 0.16, { exteriorPreference: 'street', privacy: 'public', daylight: 'high', facadePattern: 'lobby-glazed', requiredAdjacency: ['entry'], traversalPermission: PUBLIC, frontagePriority: 'preferred' }),
  zone('circulation', 'circulation', 0.20, { exteriorPreference: 'deep', requiredAdjacency: ['entry', 'lodging-room'], traversalPermission: PUBLIC }),
  zone('lodging-room', 'private', 0.48, { repeat: { min: 2, max: 3, desiredArea: 18 }, exteriorPreference: 'perimeter', privacy: 'private', daylight: 'high', facadePattern: 'lodging-repeat', requiredAdjacency: ['circulation'], traversalPermission: PRIVATE }),
  zone('service', 'service', 0.10, { exteriorPreference: 'deep', requiredAdjacency: ['circulation'], traversalPermission: SERVICE, serviceSpine: true }),
], [
  zone('circulation', 'circulation', 0.20, { exteriorPreference: 'deep', requiredAdjacency: ['lodging-room', 'service'], traversalPermission: PUBLIC }),
  zone('lodging-room', 'private', 0.68, { repeat: { min: 3, max: 10, desiredArea: 18 }, exteriorPreference: 'perimeter', privacy: 'private', daylight: 'high', facadePattern: 'lodging-repeat', requiredAdjacency: ['circulation'], traversalPermission: PRIVATE }),
  zone('service', 'service', 0.12, { exteriorPreference: 'deep', requiredAdjacency: ['circulation'], traversalPermission: SERVICE, serviceSpine: true }),
], { flows: [
  flow('guest-check-in', ['entry', 'lobby'], { routeClass: 'public' }),
  flow('guest-room-access', ['entry', 'circulation', 'lodging-room'], { routeClass: 'public' }),
], serviceSpineKeys: ['service'] });


const RETAIL_ROUTE_FLOOR = Object.freeze([
  zone('route-spine', 'circulation', 0.18, { requiredAdjacency: ['sales-floor', 'back-work'], traversalPermission: PUBLIC }),
  zone('sales-floor', 'public', 0.42, { exteriorPreference: 'perimeter', daylight: 'high', facadePattern: 'broad-retail', requiredAdjacency: ['route-spine', 'back-work'], traversalPermission: PUBLIC, frontagePriority: 'required', functionalFixture: 'primary-sales-display' }),
  zone('back-work', 'work', 0.18, { exteriorPreference: 'neutral', requiredAdjacency: ['route-spine', 'sales-floor', 'stock'], traversalPermission: STAFF }),
  zone('stock', 'storage', 0.12, { exteriorPreference: 'deep', requiredAdjacency: ['back-work', 'service'], traversalPermission: NONE, serviceSpine: true }),
  zone('service', 'service', 0.10, { exteriorPreference: 'deep', requiredAdjacency: ['stock'], traversalPermission: SERVICE, serviceSpine: true }),
]);

const FOOD_ROUTE_FLOOR = Object.freeze([
  zone('route-spine', 'circulation', 0.15, { requiredAdjacency: ['dining', 'counter'], traversalPermission: PUBLIC }),
  zone('dining', 'public', 0.34, { exteriorPreference: 'perimeter', daylight: 'high', facadePattern: 'broad-retail', requiredAdjacency: ['route-spine', 'counter'], traversalPermission: PUBLIC, frontagePriority: 'required', functionalFixture: 'dining-zone' }),
  zone('counter', 'work', 0.12, { requiredAdjacency: ['route-spine', 'dining', 'kitchen'], traversalPermission: STAFF, frontagePriority: 'preferred', functionalFixture: 'service-counter' }),
  zone('kitchen', 'work', 0.18, { exteriorPreference: 'deep', requiredAdjacency: ['counter', 'prep', 'wash'], traversalPermission: STAFF, serviceSpine: true, functionalFixture: 'cook-line' }),
  zone('prep', 'work', 0.08, { exteriorPreference: 'deep', requiredAdjacency: ['kitchen', 'storage'], traversalPermission: STAFF, serviceSpine: true }),
  zone('storage', 'storage', 0.06, { exteriorPreference: 'deep', requiredAdjacency: ['prep'], traversalPermission: NONE, serviceSpine: true }),
  zone('wash', 'service', 0.07, { exteriorPreference: 'deep', requiredAdjacency: ['kitchen'], traversalPermission: SERVICE, serviceSpine: true }),
]);

const WORKSHOP_ROUTE_FLOOR = Object.freeze([
  zone('route-spine', 'circulation', 0.14, { requiredAdjacency: ['customer-counter', 'work-bay'], traversalPermission: PUBLIC }),
  zone('customer-counter', 'public', 0.12, { exteriorPreference: 'perimeter', requiredAdjacency: ['route-spine', 'work-bay'], traversalPermission: PUBLIC, frontagePriority: 'required', functionalFixture: 'service-counter' }),
  zone('work-bay', 'work', 0.46, { exteriorPreference: 'perimeter', daylight: 'high', requiredAdjacency: ['route-spine', 'customer-counter', 'service-band'], traversalPermission: STAFF, frontagePriority: 'preferred', functionalFixture: 'workbench-or-machine-bay' }),
  zone('service-band', 'service', 0.18, { exteriorPreference: 'deep', requiredAdjacency: ['work-bay', 'parts'], traversalPermission: SERVICE, serviceSpine: true }),
  zone('parts', 'storage', 0.10, { exteriorPreference: 'deep', requiredAdjacency: ['service-band'], traversalPermission: NONE, serviceSpine: true }),
]);

const CLINIC_ROUTE_FLOOR = Object.freeze([
  zone('patient-corridor', 'circulation', 0.20, { requiredAdjacency: ['waiting', 'reception', 'exam-room', 'nurse-work'], traversalPermission: PUBLIC }),
  zone('waiting', 'public', 0.14, { exteriorPreference: 'perimeter', daylight: 'high', requiredAdjacency: ['patient-corridor', 'reception'], traversalPermission: PUBLIC, frontagePriority: 'required', functionalFixture: 'waiting-zone' }),
  zone('reception', 'public', 0.08, { exteriorPreference: 'perimeter', requiredAdjacency: ['waiting', 'patient-corridor'], traversalPermission: PUBLIC, frontagePriority: 'preferred', functionalFixture: 'registration-desk' }),
  zone('exam-room', 'program', 0.32, { repeat: { min: 2, max: 5, desiredArea: 12 }, exteriorPreference: 'perimeter', requiredAdjacency: ['patient-corridor'], traversalPermission: NONE }),
  zone('nurse-work', 'work', 0.10, { requiredAdjacency: ['patient-corridor', 'clean-supply', 'soiled-utility'], traversalPermission: STAFF }),
  zone('clean-supply', 'service', 0.08, { exteriorPreference: 'deep', requiredAdjacency: ['nurse-work'], traversalPermission: STAFF, serviceSpine: true }),
  zone('soiled-utility', 'service', 0.08, { exteriorPreference: 'deep', requiredAdjacency: ['nurse-work'], traversalPermission: SERVICE, serviceSpine: true }),
]);

const OFFICE_ROUTE_FLOOR = Object.freeze([
  zone('route-spine', 'circulation', 0.16, { requiredAdjacency: ['reception', 'work-floor', 'service'], traversalPermission: PUBLIC }),
  zone('reception', 'public', 0.10, { exteriorPreference: 'perimeter', requiredAdjacency: ['route-spine', 'work-floor'], traversalPermission: PUBLIC, frontagePriority: 'required' }),
  zone('work-floor', 'work', 0.50, { exteriorPreference: 'perimeter', requiredAdjacency: ['route-spine', 'reception'], traversalPermission: STAFF, frontagePriority: 'preferred' }),
  zone('meeting', 'shared', 0.14, { exteriorPreference: 'perimeter', requiredAdjacency: ['work-floor'], traversalPermission: SEMI }),
  zone('service', 'service', 0.10, { exteriorPreference: 'deep', requiredAdjacency: ['route-spine'], traversalPermission: SERVICE, serviceSpine: true }),
]);

const retail = profile('retail-service', ['shop-house', 'vertical-mixed-use'], [
  zone('entry', 'entry', 0.05, { exteriorPreference: 'street', requiredAdjacency: ['sales-floor'], traversalPermission: PUBLIC, frontagePriority: 'required' }),
  zone('sales-floor', 'public', 0.48, { exteriorPreference: 'street', daylight: 'high', facadePattern: 'broad-retail', requiredAdjacency: ['entry', 'back-work'], traversalPermission: PUBLIC, frontagePriority: 'required', functionalFixture: 'primary-sales-display' }),
  zone('back-work', 'work', 0.20, { exteriorPreference: 'neutral', requiredAdjacency: ['sales-floor', 'stock'], traversalPermission: STAFF }),
  zone('stock', 'storage', 0.15, { exteriorPreference: 'deep', requiredAdjacency: ['back-work', 'service'], traversalPermission: NONE, serviceSpine: true }),
  zone('service', 'service', 0.12, { exteriorPreference: 'deep', requiredAdjacency: ['stock'], traversalPermission: SERVICE, serviceSpine: true }),
], [
  zone('circulation', 'circulation', 0.18, { exteriorPreference: 'neutral', requiredAdjacency: ['work-floor'], traversalPermission: PUBLIC }),
  zone('work-floor', 'work', 0.56, { exteriorPreference: 'perimeter', requiredAdjacency: ['circulation', 'service'], traversalPermission: STAFF, frontagePriority: 'preferred' }),
  zone('service', 'service', 0.16, { exteriorPreference: 'deep', requiredAdjacency: ['work-floor'], traversalPermission: SERVICE, serviceSpine: true }),
  zone('storage', 'storage', 0.10, { exteriorPreference: 'deep', requiredAdjacency: ['service'], traversalPermission: NONE, serviceSpine: true }),
], { flows: [flow('customer-to-stock', ['entry', 'sales-floor', 'back-work', 'stock'])], route: RETAIL_ROUTE_FLOOR, frontageKeys: ['entry', 'sales-floor'], serviceSpineKeys: ['stock', 'service'] });

const foodService = profile('food-service', ['shop-house', 'public-hall-support'], [
  zone('entry', 'entry', 0.04, { exteriorPreference: 'street', requiredAdjacency: ['dining'], traversalPermission: PUBLIC, frontagePriority: 'required' }),
  zone('dining', 'public', 0.38, { exteriorPreference: 'street', daylight: 'high', facadePattern: 'broad-retail', requiredAdjacency: ['entry', 'counter'], traversalPermission: PUBLIC, frontagePriority: 'required', functionalFixture: 'dining-zone' }),
  zone('counter', 'work', 0.12, { exteriorPreference: 'street', requiredAdjacency: ['dining', 'kitchen'], traversalPermission: STAFF, frontagePriority: 'preferred', functionalFixture: 'service-counter' }),
  zone('kitchen', 'work', 0.20, { exteriorPreference: 'deep', requiredAdjacency: ['counter', 'prep', 'wash'], traversalPermission: STAFF, serviceSpine: true, functionalFixture: 'cook-line' }),
  zone('prep', 'work', 0.10, { exteriorPreference: 'deep', requiredAdjacency: ['kitchen', 'storage'], traversalPermission: STAFF, serviceSpine: true }),
  zone('storage', 'storage', 0.08, { exteriorPreference: 'deep', requiredAdjacency: ['prep'], traversalPermission: NONE, serviceSpine: true }),
  zone('wash', 'service', 0.08, { exteriorPreference: 'deep', requiredAdjacency: ['kitchen'], traversalPermission: SERVICE, serviceSpine: true }),
], [
  zone('circulation', 'circulation', 0.18, { requiredAdjacency: ['support'], traversalPermission: PUBLIC }),
  zone('support', 'work', 0.50, { exteriorPreference: 'perimeter', requiredAdjacency: ['circulation', 'service'], traversalPermission: STAFF }),
  zone('service', 'service', 0.20, { exteriorPreference: 'deep', requiredAdjacency: ['support'], traversalPermission: SERVICE, serviceSpine: true }),
  zone('storage', 'storage', 0.12, { exteriorPreference: 'deep', requiredAdjacency: ['service'], traversalPermission: NONE, serviceSpine: true }),
], {
  flows: [
    flow('customer-flow', ['entry', 'dining', 'counter'], { routeClass: 'public' }),
    flow('production-flow', ['storage', 'prep', 'kitchen', 'counter'], { routeClass: 'staff' }),
    flow('dirty-return', ['dining', 'kitchen', 'wash'], { routeClass: 'service' }),
  ],
  serviceCharacter: 'food-production-exhaust-wet-service',
  serviceSpineKeys: ['kitchen', 'prep', 'storage', 'wash'],
  frontageKeys: ['entry', 'dining', 'counter'],
  identityFixtures: ['service-counter', 'cook-line', 'exhaust-riser'],
  route: FOOD_ROUTE_FLOOR,
});

const workshopRetail = profile('workshop-retail', ['service-band-workshop', 'clear-span-industrial'], [
  zone('entry', 'entry', 0.04, { exteriorPreference: 'street', requiredAdjacency: ['customer-counter'], traversalPermission: PUBLIC }),
  zone('customer-counter', 'public', 0.12, { exteriorPreference: 'street', requiredAdjacency: ['entry', 'work-bay'], traversalPermission: PUBLIC, frontagePriority: 'required', functionalFixture: 'service-counter' }),
  zone('work-bay', 'work', 0.48, { exteriorPreference: 'perimeter', daylight: 'high', facadePattern: 'industrial-broad', requiredAdjacency: ['customer-counter', 'service-band'], traversalPermission: STAFF, frontagePriority: 'preferred', functionalFixture: 'workbench-or-machine-bay' }),
  zone('service-band', 'service', 0.20, { exteriorPreference: 'deep', requiredAdjacency: ['work-bay', 'parts'], traversalPermission: SERVICE, serviceSpine: true }),
  zone('parts', 'storage', 0.12, { exteriorPreference: 'deep', requiredAdjacency: ['service-band'], traversalPermission: NONE, serviceSpine: true }),
  zone('circulation', 'circulation', 0.04, { requiredAdjacency: ['service-band'], traversalPermission: PUBLIC }),
], [
  zone('circulation', 'circulation', 0.16, { requiredAdjacency: ['work-loft'], traversalPermission: PUBLIC }),
  zone('work-loft', 'work', 0.54, { exteriorPreference: 'perimeter', requiredAdjacency: ['circulation', 'service'], traversalPermission: STAFF, frontagePriority: 'preferred' }),
  zone('service', 'service', 0.18, { exteriorPreference: 'deep', requiredAdjacency: ['work-loft', 'storage'], traversalPermission: SERVICE, serviceSpine: true }),
  zone('storage', 'storage', 0.12, { exteriorPreference: 'deep', requiredAdjacency: ['service'], traversalPermission: NONE, serviceSpine: true }),
], { flows: [flow('customer-workflow', ['entry', 'customer-counter', 'work-bay', 'service-band', 'parts'])], route: WORKSHOP_ROUTE_FLOOR, serviceSpineKeys: ['service-band', 'parts', 'service', 'storage'] });

const fireStation = profile('fire-station', ['clear-span-industrial', 'service-band-workshop'], [
  zone('public-entry', 'entry', 0.04, { exteriorPreference: 'street', requiredAdjacency: ['watch-admin'], traversalPermission: PUBLIC }),
  zone('watch-admin', 'public', 0.08, { exteriorPreference: 'street', requiredAdjacency: ['public-entry', 'response-spine'], traversalPermission: PUBLIC, frontagePriority: 'preferred' }),
  zone('apparatus-bay', 'work', 0.42, { exteriorPreference: 'street', daylight: 'high', facadePattern: 'industrial-broad', requiredAdjacency: ['response-spine', 'gear-support', 'maintenance'], traversalPermission: STAFF, functionalFixture: 'apparatus-bay-clear-span' }),
  zone('response-spine', 'circulation', 0.12, { exteriorPreference: 'neutral', requiredAdjacency: ['watch-admin', 'apparatus-bay', 'living-dayroom'], traversalPermission: STAFF }),
  zone('gear-support', 'service', 0.12, { exteriorPreference: 'deep', requiredAdjacency: ['apparatus-bay', 'response-spine'], traversalPermission: SERVICE, serviceSpine: true, functionalFixture: 'turnout-gear-zone' }),
  zone('maintenance', 'work', 0.10, { exteriorPreference: 'deep', requiredAdjacency: ['apparatus-bay'], traversalPermission: STAFF, serviceSpine: true }),
  zone('living-dayroom', 'shared', 0.12, { exteriorPreference: 'perimeter', requiredAdjacency: ['response-spine'], traversalPermission: STAFF }),
], [
  zone('response-spine', 'circulation', 0.18, { requiredAdjacency: ['sleep-room', 'dayroom', 'service'], traversalPermission: STAFF }),
  zone('sleep-room', 'private', 0.42, { repeat: { min: 2, max: 5, desiredArea: 13 }, exteriorPreference: 'perimeter', daylight: 'high', requiredAdjacency: ['response-spine'], traversalPermission: PRIVATE }),
  zone('dayroom', 'shared', 0.20, { exteriorPreference: 'perimeter', requiredAdjacency: ['response-spine'], traversalPermission: STAFF }),
  zone('admin', 'work', 0.10, { exteriorPreference: 'perimeter', requiredAdjacency: ['response-spine'], traversalPermission: STAFF }),
  zone('service', 'service', 0.10, { exteriorPreference: 'deep', requiredAdjacency: ['response-spine'], traversalPermission: SERVICE, serviceSpine: true }),
], {
  flows: [flow('response-path', ['living-dayroom', 'response-spine', 'apparatus-bay'], { routeClass: 'emergency', permission: STAFF })],
  serviceCharacter: 'apparatus-exhaust-gear-wet-service',
  serviceSpineKeys: ['gear-support', 'maintenance', 'service'],
  identityFixtures: ['apparatus-bay-clear-span', 'turnout-gear-zone', 'apparatus-door-bank'],
});

const autoShop = profile('auto-shop', ['clear-span-industrial', 'service-band-workshop'], [
  zone('customer-entry', 'entry', 0.04, { exteriorPreference: 'street', requiredAdjacency: ['customer-counter'], traversalPermission: PUBLIC }),
  zone('customer-counter', 'public', 0.10, { exteriorPreference: 'street', requiredAdjacency: ['customer-entry', 'repair-bay'], traversalPermission: PUBLIC, frontagePriority: 'required', functionalFixture: 'service-counter' }),
  zone('repair-bay', 'work', 0.52, { exteriorPreference: 'street', daylight: 'high', facadePattern: 'industrial-broad', requiredAdjacency: ['customer-counter', 'parts-service'], traversalPermission: STAFF, functionalFixture: 'vehicle-repair-bay' }),
  zone('parts-service', 'storage', 0.16, { exteriorPreference: 'deep', requiredAdjacency: ['repair-bay', 'service'], traversalPermission: STAFF, serviceSpine: true }),
  zone('service', 'service', 0.12, { exteriorPreference: 'deep', requiredAdjacency: ['parts-service'], traversalPermission: SERVICE, serviceSpine: true }),
  zone('circulation', 'circulation', 0.06, { requiredAdjacency: ['repair-bay'], traversalPermission: STAFF }),
], [
  zone('circulation', 'circulation', 0.18, { requiredAdjacency: ['work-loft'], traversalPermission: STAFF }),
  zone('work-loft', 'work', 0.52, { exteriorPreference: 'perimeter', requiredAdjacency: ['circulation', 'parts'], traversalPermission: STAFF }),
  zone('parts', 'storage', 0.18, { exteriorPreference: 'deep', requiredAdjacency: ['work-loft', 'service'], traversalPermission: NONE, serviceSpine: true }),
  zone('service', 'service', 0.12, { exteriorPreference: 'deep', requiredAdjacency: ['parts'], traversalPermission: SERVICE, serviceSpine: true }),
], { flows: [flow('repair-flow', ['customer-entry', 'customer-counter', 'repair-bay', 'parts-service'])], serviceSpineKeys: ['parts-service', 'service', 'parts'] });

const clinic = profile('clinic', ['institutional-cluster', 'core-perimeter-office', 'courtyard-ring'], [
  zone('entry', 'entry', 0.04, { exteriorPreference: 'street', requiredAdjacency: ['waiting'], traversalPermission: PUBLIC, frontagePriority: 'required' }),
  zone('waiting', 'public', 0.16, { exteriorPreference: 'street', daylight: 'high', requiredAdjacency: ['entry', 'reception'], traversalPermission: PUBLIC, frontagePriority: 'required', functionalFixture: 'waiting-zone' }),
  zone('reception', 'public', 0.09, { exteriorPreference: 'street', requiredAdjacency: ['waiting', 'patient-corridor'], traversalPermission: PUBLIC, frontagePriority: 'preferred', functionalFixture: 'registration-desk' }),
  zone('patient-corridor', 'circulation', 0.18, { requiredAdjacency: ['reception', 'exam-room', 'nurse-work'], traversalPermission: PUBLIC }),
  zone('exam-room', 'program', 0.30, { repeat: { min: 2, max: 6, desiredArea: 12 }, exteriorPreference: 'perimeter', requiredAdjacency: ['patient-corridor'], traversalPermission: NONE }),
  zone('nurse-work', 'work', 0.09, { exteriorPreference: 'neutral', requiredAdjacency: ['patient-corridor', 'clean-supply', 'soiled-utility'], traversalPermission: STAFF }),
  zone('clean-supply', 'service', 0.07, { exteriorPreference: 'deep', requiredAdjacency: ['nurse-work'], traversalPermission: STAFF, serviceSpine: true }),
  zone('soiled-utility', 'service', 0.07, { exteriorPreference: 'deep', requiredAdjacency: ['nurse-work'], traversalPermission: SERVICE, serviceSpine: true }),
], [
  zone('patient-corridor', 'circulation', 0.22, { requiredAdjacency: ['exam-room', 'nurse-work'], traversalPermission: PUBLIC }),
  zone('exam-room', 'program', 0.46, { repeat: { min: 2, max: 7, desiredArea: 12 }, exteriorPreference: 'perimeter', requiredAdjacency: ['patient-corridor'], traversalPermission: NONE }),
  zone('nurse-work', 'work', 0.12, { requiredAdjacency: ['patient-corridor', 'service'], traversalPermission: STAFF }),
  zone('service', 'service', 0.12, { exteriorPreference: 'deep', requiredAdjacency: ['nurse-work'], traversalPermission: SERVICE, serviceSpine: true }),
  zone('staff-support', 'shared', 0.08, { exteriorPreference: 'perimeter', requiredAdjacency: ['nurse-work'], traversalPermission: STAFF }),
], {
  flows: [flow('patient-flow', ['entry', 'waiting', 'reception', 'patient-corridor', 'exam-room'], { routeClass: 'public' }), flow('clinical-service', ['nurse-work', 'clean-supply'], { routeClass: 'staff' })],
  serviceCharacter: 'medical-clean-soiled-wet-service',
  serviceSpineKeys: ['clean-supply', 'soiled-utility', 'service'],
  frontageKeys: ['entry', 'waiting', 'reception'],
  route: CLINIC_ROUTE_FLOOR,
});

const courthouse = profile('courthouse', ['public-hall-support', 'institutional-cluster'], [
  zone('entry', 'entry', 0.04, { exteriorPreference: 'street', requiredAdjacency: ['public-corridor'], traversalPermission: PUBLIC, frontagePriority: 'required' }),
  zone('public-corridor', 'circulation', 0.22, { requiredAdjacency: ['entry', 'courtroom'], traversalPermission: PUBLIC }),
  zone('courtroom', 'program', 0.34, { exteriorPreference: 'perimeter', requiredAdjacency: ['public-corridor', 'judge-route', 'secure-route'], traversalPermission: NONE, functionalFixture: 'courtroom-hall' }),
  zone('judge-route', 'circulation', 0.12, { exteriorPreference: 'deep', requiredAdjacency: ['courtroom', 'judge-support'], traversalPermission: STAFF }),
  zone('judge-support', 'work', 0.10, { exteriorPreference: 'deep', requiredAdjacency: ['judge-route'], traversalPermission: STAFF }),
  zone('secure-route', 'circulation', 0.10, { exteriorPreference: 'deep', requiredAdjacency: ['courtroom', 'holding'], traversalPermission: SECURE, serviceSpine: true }),
  zone('holding', 'private', 0.08, { exteriorPreference: 'deep', requiredAdjacency: ['secure-route'], traversalPermission: SECURE, serviceSpine: true }),
], [
  zone('public-corridor', 'circulation', 0.24, { requiredAdjacency: ['courtroom'], traversalPermission: PUBLIC }),
  zone('courtroom', 'program', 0.36, { exteriorPreference: 'perimeter', requiredAdjacency: ['public-corridor', 'judge-route', 'secure-route'], traversalPermission: NONE, functionalFixture: 'courtroom-hall' }),
  zone('judge-route', 'circulation', 0.14, { exteriorPreference: 'deep', requiredAdjacency: ['courtroom', 'judge-support'], traversalPermission: STAFF }),
  zone('judge-support', 'work', 0.10, { exteriorPreference: 'deep', requiredAdjacency: ['judge-route'], traversalPermission: STAFF }),
  zone('secure-route', 'circulation', 0.10, { exteriorPreference: 'deep', requiredAdjacency: ['courtroom', 'holding'], traversalPermission: SECURE, serviceSpine: true }),
  zone('holding', 'private', 0.06, { exteriorPreference: 'deep', requiredAdjacency: ['secure-route'], traversalPermission: SECURE, serviceSpine: true }),
], {
  flows: [
    flow('public-court', ['entry', 'public-corridor', 'courtroom'], { routeClass: 'public', mustRemainDistinctFrom: ['secure-court', 'judge-court'] }),
    flow('judge-court', ['judge-support', 'judge-route', 'courtroom'], { routeClass: 'staff', mustRemainDistinctFrom: ['secure-court'] }),
    flow('secure-court', ['holding', 'secure-route', 'courtroom'], { routeClass: 'secure', permission: SECURE, mustRemainDistinctFrom: ['public-court'] }),
  ],
  serviceCharacter: 'segregated-public-judicial-secure',
  serviceSpineKeys: ['secure-route', 'holding'],
});

const policeBooking = profile('police-booking', ['institutional-cluster', 'service-band-workshop'], [
  zone('public-entry', 'entry', 0.04, { exteriorPreference: 'street', requiredAdjacency: ['public-desk'], traversalPermission: PUBLIC }),
  zone('public-desk', 'public', 0.12, { exteriorPreference: 'street', requiredAdjacency: ['public-entry', 'staff-route'], traversalPermission: PUBLIC, frontagePriority: 'required' }),
  zone('staff-route', 'circulation', 0.18, { requiredAdjacency: ['public-desk', 'booking', 'staff-work'], traversalPermission: STAFF }),
  zone('booking', 'program', 0.22, { requiredAdjacency: ['staff-route', 'secure-route'], traversalPermission: STAFF, functionalFixture: 'booking-counter' }),
  zone('secure-route', 'circulation', 0.16, { exteriorPreference: 'deep', requiredAdjacency: ['booking', 'holding'], traversalPermission: SECURE, serviceSpine: true }),
  zone('holding', 'private', 0.16, { repeat: { min: 1, max: 3, desiredArea: 10 }, exteriorPreference: 'deep', requiredAdjacency: ['secure-route'], traversalPermission: SECURE, serviceSpine: true }),
  zone('staff-work', 'work', 0.12, { exteriorPreference: 'perimeter', requiredAdjacency: ['staff-route'], traversalPermission: STAFF }),
], [
  zone('staff-route', 'circulation', 0.22, { requiredAdjacency: ['staff-work', 'secure-route'], traversalPermission: STAFF }),
  zone('staff-work', 'work', 0.40, { repeat: { min: 2, max: 5, desiredArea: 14 }, exteriorPreference: 'perimeter', requiredAdjacency: ['staff-route'], traversalPermission: STAFF }),
  zone('secure-route', 'circulation', 0.18, { exteriorPreference: 'deep', requiredAdjacency: ['staff-route', 'holding'], traversalPermission: SECURE, serviceSpine: true }),
  zone('holding', 'private', 0.12, { exteriorPreference: 'deep', requiredAdjacency: ['secure-route'], traversalPermission: SECURE, serviceSpine: true }),
  zone('service', 'service', 0.08, { exteriorPreference: 'deep', requiredAdjacency: ['staff-route'], traversalPermission: SERVICE, serviceSpine: true }),
], { flows: [flow('public-contact', ['public-entry', 'public-desk']), flow('secure-booking', ['booking', 'secure-route', 'holding'], { permission: SECURE })], serviceSpineKeys: ['secure-route', 'holding', 'service'] });

const laboratory = profile('laboratory', ['institutional-cluster', 'core-perimeter-office'], [
  zone('entry', 'entry', 0.04, { exteriorPreference: 'street', requiredAdjacency: ['control'], traversalPermission: PUBLIC }),
  zone('control', 'public', 0.10, { exteriorPreference: 'street', requiredAdjacency: ['entry', 'lab-corridor'], traversalPermission: PUBLIC, frontagePriority: 'preferred' }),
  zone('lab-corridor', 'circulation', 0.18, { requiredAdjacency: ['control', 'lab-room', 'service-corridor'], traversalPermission: STAFF }),
  zone('lab-room', 'program', 0.40, { repeat: { min: 2, max: 6, desiredArea: 18 }, exteriorPreference: 'perimeter', requiredAdjacency: ['lab-corridor', 'service-corridor'], traversalPermission: STAFF, functionalFixture: 'lab-bench-zone' }),
  zone('service-corridor', 'service', 0.16, { exteriorPreference: 'deep', requiredAdjacency: ['lab-corridor', 'lab-room', 'utility-spine'], traversalPermission: SERVICE, serviceSpine: true }),
  zone('utility-spine', 'service', 0.12, { exteriorPreference: 'deep', requiredAdjacency: ['service-corridor'], traversalPermission: SERVICE, serviceSpine: true, functionalFixture: 'utility-riser-bank' }),
], [
  zone('lab-corridor', 'circulation', 0.18, { requiredAdjacency: ['lab-room', 'service-corridor'], traversalPermission: STAFF }),
  zone('lab-room', 'program', 0.48, { repeat: { min: 2, max: 7, desiredArea: 18 }, exteriorPreference: 'perimeter', requiredAdjacency: ['lab-corridor', 'service-corridor'], traversalPermission: STAFF }),
  zone('service-corridor', 'service', 0.20, { exteriorPreference: 'deep', requiredAdjacency: ['lab-room', 'utility-spine'], traversalPermission: SERVICE, serviceSpine: true }),
  zone('utility-spine', 'service', 0.14, { exteriorPreference: 'deep', requiredAdjacency: ['service-corridor'], traversalPermission: SERVICE, serviceSpine: true }),
], { flows: [flow('research-flow', ['control', 'lab-corridor', 'lab-room'], { routeClass: 'staff' }), flow('utility-flow', ['utility-spine', 'service-corridor', 'lab-room'], { routeClass: 'service' })], serviceCharacter: 'utility-corridor-vertical-chase', serviceSpineKeys: ['service-corridor', 'utility-spine'], identityFixtures: ['utility-riser-bank'] });

const warehouse = profile('warehouse', ['clear-span-industrial', 'fragmented-compound'], [
  zone('receiving', 'service', 0.10, { exteriorPreference: 'street', requiredAdjacency: ['staging-in'], traversalPermission: SERVICE, frontagePriority: 'preferred', functionalFixture: 'loading-dock' }),
  zone('staging-in', 'work', 0.10, { requiredAdjacency: ['receiving', 'aisle-grid'], traversalPermission: STAFF }),
  zone('aisle-grid', 'circulation', 0.16, { requiredAdjacency: ['staging-in', 'storage', 'pick-pack'], traversalPermission: STAFF }),
  zone('storage', 'storage', 0.42, { exteriorPreference: 'deep', requiredAdjacency: ['aisle-grid'], traversalPermission: NONE, functionalFixture: 'storage-rack-field' }),
  zone('pick-pack', 'work', 0.10, { requiredAdjacency: ['aisle-grid', 'staging-out'], traversalPermission: STAFF }),
  zone('staging-out', 'work', 0.06, { requiredAdjacency: ['pick-pack', 'shipping'], traversalPermission: STAFF }),
  zone('shipping', 'service', 0.06, { exteriorPreference: 'street', requiredAdjacency: ['staging-out'], traversalPermission: SERVICE, frontagePriority: 'preferred', functionalFixture: 'shipping-dock' }),
], [
  zone('aisle-grid', 'circulation', 0.18, { requiredAdjacency: ['storage', 'service'], traversalPermission: STAFF }),
  zone('storage', 'storage', 0.58, { exteriorPreference: 'deep', requiredAdjacency: ['aisle-grid'], traversalPermission: NONE }),
  zone('service', 'service', 0.14, { exteriorPreference: 'deep', requiredAdjacency: ['aisle-grid'], traversalPermission: SERVICE, serviceSpine: true }),
  zone('work', 'work', 0.10, { exteriorPreference: 'perimeter', requiredAdjacency: ['aisle-grid'], traversalPermission: STAFF }),
], { flows: [flow('goods-flow', ['receiving', 'staging-in', 'aisle-grid', 'storage', 'pick-pack', 'staging-out', 'shipping'], { routeClass: 'goods' })], serviceCharacter: 'dock-staging-material-flow', serviceSpineKeys: ['service'], identityFixtures: ['loading-dock', 'storage-rack-field', 'shipping-dock'] });

const serverFacility = profile('server-facility', ['storage-stack', 'clear-span-industrial'], [
  zone('entry-control', 'entry', 0.05, { exteriorPreference: 'street', requiredAdjacency: ['control'], traversalPermission: SECURE }),
  zone('control', 'work', 0.10, { exteriorPreference: 'street', requiredAdjacency: ['entry-control', 'rack-aisles'], traversalPermission: STAFF, frontagePriority: 'preferred' }),
  zone('rack-aisles', 'program', 0.52, { exteriorPreference: 'deep', requiredAdjacency: ['control', 'power-cooling-spine'], traversalPermission: SECURE, functionalFixture: 'hot-cold-rack-field' }),
  zone('power-cooling-spine', 'service', 0.20, { exteriorPreference: 'deep', requiredAdjacency: ['rack-aisles', 'service'], traversalPermission: SERVICE, serviceSpine: true, functionalFixture: 'power-cooling-spine' }),
  zone('service', 'service', 0.13, { exteriorPreference: 'deep', requiredAdjacency: ['power-cooling-spine'], traversalPermission: SERVICE, serviceSpine: true }),
], [
  zone('secure-circulation', 'circulation', 0.18, { requiredAdjacency: ['rack-aisles', 'power-cooling-spine'], traversalPermission: SECURE }),
  zone('rack-aisles', 'program', 0.56, { exteriorPreference: 'deep', requiredAdjacency: ['secure-circulation', 'power-cooling-spine'], traversalPermission: SECURE }),
  zone('power-cooling-spine', 'service', 0.18, { exteriorPreference: 'deep', requiredAdjacency: ['rack-aisles'], traversalPermission: SERVICE, serviceSpine: true }),
  zone('service', 'service', 0.08, { exteriorPreference: 'deep', requiredAdjacency: ['power-cooling-spine'], traversalPermission: SERVICE, serviceSpine: true }),
], { flows: [flow('secure-operations', ['entry-control', 'control', 'rack-aisles']), flow('thermal-service', ['rack-aisles', 'power-cooling-spine', 'service'], { routeClass: 'service' })], serviceCharacter: 'power-cooling-hot-cold-aisle', serviceSpineKeys: ['power-cooling-spine', 'service'], identityFixtures: ['hot-cold-rack-field', 'power-cooling-spine'] });

const office = profile('office-public', ['core-perimeter-office'], [
  zone('entry', 'entry', 0.05, { exteriorPreference: 'street', requiredAdjacency: ['reception'], traversalPermission: PUBLIC }),
  zone('reception', 'public', 0.12, { exteriorPreference: 'street', requiredAdjacency: ['entry', 'work-floor'], traversalPermission: PUBLIC, frontagePriority: 'required' }),
  zone('work-floor', 'work', 0.52, { exteriorPreference: 'perimeter', requiredAdjacency: ['reception', 'core'], traversalPermission: STAFF, frontagePriority: 'preferred' }),
  zone('meeting', 'shared', 0.15, { exteriorPreference: 'perimeter', requiredAdjacency: ['work-floor'], traversalPermission: SEMI }),
  zone('core', 'circulation', 0.10, { exteriorPreference: 'deep', requiredAdjacency: ['work-floor', 'service'], traversalPermission: PUBLIC }),
  zone('service', 'service', 0.06, { exteriorPreference: 'deep', requiredAdjacency: ['core'], traversalPermission: SERVICE, serviceSpine: true }),
], [
  zone('core', 'circulation', 0.16, { exteriorPreference: 'deep', requiredAdjacency: ['work-floor', 'service'], traversalPermission: PUBLIC }),
  zone('work-floor', 'work', 0.56, { exteriorPreference: 'perimeter', requiredAdjacency: ['core'], traversalPermission: STAFF, frontagePriority: 'preferred' }),
  zone('meeting', 'shared', 0.18, { repeat: { min: 1, max: 4, desiredArea: 16 }, exteriorPreference: 'perimeter', requiredAdjacency: ['work-floor'], traversalPermission: SEMI }),
  zone('service', 'service', 0.10, { exteriorPreference: 'deep', requiredAdjacency: ['core'], traversalPermission: SERVICE, serviceSpine: true }),
], { flows: [flow('office-access', ['entry', 'reception', 'work-floor', 'core'])], route: OFFICE_ROUTE_FLOOR, serviceSpineKeys: ['service'] });

const archive = profile('archive', ['storage-stack'], [
  zone('entry', 'entry', 0.04, { exteriorPreference: 'street', requiredAdjacency: ['index-control'], traversalPermission: PUBLIC }),
  zone('index-control', 'public', 0.12, { exteriorPreference: 'street', requiredAdjacency: ['entry', 'stacks'], traversalPermission: PUBLIC, frontagePriority: 'required' }),
  zone('stacks', 'storage', 0.58, { exteriorPreference: 'deep', requiredAdjacency: ['index-control', 'circulation'], traversalPermission: NONE, functionalFixture: 'archive-stack-field' }),
  zone('circulation', 'circulation', 0.16, { requiredAdjacency: ['stacks', 'service'], traversalPermission: STAFF }),
  zone('service', 'service', 0.10, { exteriorPreference: 'deep', requiredAdjacency: ['circulation'], traversalPermission: SERVICE, serviceSpine: true }),
], [
  zone('circulation', 'circulation', 0.18, { requiredAdjacency: ['stacks', 'service'], traversalPermission: STAFF }),
  zone('stacks', 'storage', 0.66, { exteriorPreference: 'deep', requiredAdjacency: ['circulation'], traversalPermission: NONE }),
  zone('service', 'service', 0.16, { exteriorPreference: 'deep', requiredAdjacency: ['circulation'], traversalPermission: SERVICE, serviceSpine: true }),
], { flows: [flow('archive-control', ['entry', 'index-control', 'stacks'])], serviceSpineKeys: ['service'] });

const utility = profile('utility-plant', ['storage-stack', 'service-band-workshop'], [
  zone('entry', 'entry', 0.04, { exteriorPreference: 'street', requiredAdjacency: ['control'], traversalPermission: STAFF }),
  zone('control', 'work', 0.12, { exteriorPreference: 'street', requiredAdjacency: ['entry', 'plant'], traversalPermission: STAFF }),
  zone('plant', 'program', 0.54, { exteriorPreference: 'deep', requiredAdjacency: ['control', 'service-spine'], traversalPermission: STAFF, functionalFixture: 'major-plant-zone' }),
  zone('service-spine', 'service', 0.20, { exteriorPreference: 'deep', requiredAdjacency: ['plant', 'storage'], traversalPermission: SERVICE, serviceSpine: true, functionalFixture: 'utility-riser-bank' }),
  zone('storage', 'storage', 0.10, { exteriorPreference: 'deep', requiredAdjacency: ['service-spine'], traversalPermission: NONE, serviceSpine: true }),
], [
  zone('circulation', 'circulation', 0.16, { requiredAdjacency: ['plant', 'service-spine'], traversalPermission: STAFF }),
  zone('plant', 'program', 0.56, { exteriorPreference: 'deep', requiredAdjacency: ['circulation', 'service-spine'], traversalPermission: STAFF }),
  zone('service-spine', 'service', 0.20, { exteriorPreference: 'deep', requiredAdjacency: ['plant'], traversalPermission: SERVICE, serviceSpine: true }),
  zone('storage', 'storage', 0.08, { exteriorPreference: 'deep', requiredAdjacency: ['service-spine'], traversalPermission: NONE, serviceSpine: true }),
], { flows: [flow('plant-service', ['control', 'plant', 'service-spine'])], serviceSpineKeys: ['service-spine', 'storage'], identityFixtures: ['major-plant-zone', 'utility-riser-bank'] });

const exact = new Map([
  ['apartment', apartment],
  ['motel_room', motel],
  ['diner', foodService],
  ['convenience', retail], ['grocery', retail], ['pharmacy', retail], ['florist', retail], ['butcher', retail],
  ['hardware_store', workshopRetail], ['electronics_repair', workshopRetail], ['print_shop', workshopRetail], ['photo_lab', workshopRetail],
  ['fire_station', fireStation], ['auto_shop', autoShop], ['clinic', clinic], ['courtroom', courthouse], ['police_booking', policeBooking],
  ['laboratory', laboratory], ['warehouse', warehouse], ['server_room', serverFacility], ['mainframe_room', serverFacility],
  ['office', office], ['1980s_office', office], ['bank', office], ['post_office', office],
  ['archive', archive], ['boiler_room', utility], ['factory_control', utility],
]);

export function programArchitectureFor(program) {
  return exact.get(String(program ?? '')) ?? null;
}

export function programMorphologyPool(program) {
  return Object.freeze([...(programArchitectureFor(program)?.morphologies ?? [])]);
}

export function programTemplatesForFloor(programArchitecture, { isBaseFloor = false, routeServed = false } = {}) {
  if (!programArchitecture) return null;
  if (!isBaseFloor && routeServed && programArchitecture.route?.length) return programArchitecture.route;
  return isBaseFloor ? programArchitecture.ground : programArchitecture.upper;
}

export function isSpecificProgramArchitecture(program) {
  return exact.has(String(program ?? ''));
}

function frontageKindForProgramArchitecture(programArchitectureId) {
  if (programArchitectureId === 'retail-service') return 'storefront';
  if (programArchitectureId === 'food-service') return 'food-frontage';
  if (programArchitectureId === 'workshop-retail') return 'workshop-frontage';
  return 'public-frontage';
}

function faceTangentSpan(face) {
  const rect = face?.rect ?? {};
  const side = String(face?.side ?? '');
  if (side === 'north' || side === 'south') return Math.max(0, Number(rect.halfX) || 0) * 2;
  if (side === 'east' || side === 'west') return Math.max(0, Number(rect.halfZ) || 0) * 2;
  return 0;
}

export function programFacadeFrontageDirectives({ buildingPlan, faces = [] } = {}) {
  const programArchitectureId = String(buildingPlan?.programArchitecture?.id ?? '');
  if (!programArchitectureId || !Array.isArray(buildingPlan?.topologySpaces)) return Object.freeze([]);
  const routeSidesByFloor = new Map();
  for (const anchor of buildingPlan?.accessAuthority?.anchors ?? []) {
    if (anchor?.kind !== 'city-exchange' || !anchor?.side || !Number.isFinite(Number(anchor.floor))) continue;
    const floor = Math.floor(Number(anchor.floor));
    const sides = routeSidesByFloor.get(floor) ?? new Set();
    sides.add(String(anchor.side));
    routeSidesByFloor.set(floor, sides);
  }

  const candidates = [];
  for (const space of buildingPlan.topologySpaces) {
    const frontage = space?.circulationFrontage;
    if (!frontage?.eligible || !['required', 'preferred'].includes(String(space.frontagePriority))) continue;
    if (!['public', 'shared', 'work'].includes(String(space.role))) continue;
    const globalFloor = Math.floor(Number(space.floor));
    if (!Number.isFinite(globalFloor)) continue;
    const moduleKeys = new Set((space.moduleKeys ?? [space.moduleKey]).filter(Boolean).map(String));
    const frontageSides = new Set((frontage.facadeSides ?? []).map(String));
    const routeSides = routeSidesByFloor.get(globalFloor) ?? new Set();
    const eligibleFaces = faces.filter(face => {
      if (!moduleKeys.has(String(face.moduleKey))) return false;
      if (!frontageSides.has(String(face.side))) return false;
      const floorBase = Math.floor(Number(face.floorBase) || 0);
      const floors = Math.max(1, Math.floor(Number(face.floors) || 1));
      return globalFloor >= floorBase && globalFloor < floorBase + floors;
    });
    if (!eligibleFaces.length) continue;
    eligibleFaces.sort((a, b) => {
      const aRoute = routeSides.has(String(a.side)) ? 1 : 0;
      const bRoute = routeSides.has(String(b.side)) ? 1 : 0;
      return bRoute - aRoute
        || faceTangentSpan(b) - faceTangentSpan(a)
        || `${a.moduleKey}:${a.side}`.localeCompare(`${b.moduleKey}:${b.side}`);
    });
    const face = eligibleFaces[0];
    const floorBase = Math.floor(Number(face.floorBase) || 0);
    candidates.push({
      schema: 'jweb.program-facade-frontage.v1',
      id: `${space.id}:program-frontage`,
      spaceId: space.id,
      moduleKey: String(face.moduleKey),
      side: String(face.side),
      dirKey: face.dirKey ?? null,
      floor: globalFloor - floorBase,
      globalFloor,
      semanticProgram: space.semanticProgram ?? buildingPlan?.grammar?.semanticProgram ?? null,
      programArchitectureId,
      frontageKind: frontageKindForProgramArchitecture(programArchitectureId),
      priority: space.frontagePriority,
      routeAligned: routeSides.has(String(face.side)),
      routeBoundaryEdges: Number(frontage.routeBoundaryEdges) || 0,
      exposedFacadeEdges: Number(frontage.exposedFacadeEdges) || 0,
      functionalFixture: space.functionalFixture ?? null,
      traversalPermission: space.traversalPermission ?? null,
    });
  }

  // A single facade-floor gets one architectural frontage authority. If dining
  // and counter, or sales floor and work bay, both touch the same sky street,
  // the strongest public-facing zone owns the facade rather than stacking
  // overlapping storefront treatments on top of each other.
  const byFaceFloor = new Map();
  for (const item of candidates) {
    const key = `${item.moduleKey}:${item.side}:${item.floor}`;
    const current = byFaceFloor.get(key);
    const score = (item.priority === 'required' ? 100 : 30)
      + (item.routeAligned ? 25 : 0)
      + item.routeBoundaryEdges * 2
      + item.exposedFacadeEdges;
    const currentScore = current?._score ?? -Infinity;
    if (!current || score > currentScore || (score === currentScore && item.id < current.id)) {
      byFaceFloor.set(key, { ...item, _score: score });
    }
  }
  return Object.freeze([...byFaceFloor.values()]
    .map(({ _score, ...item }) => Object.freeze(item))
    .sort((a, b) => a.globalFloor - b.globalFloor
      || `${a.moduleKey}:${a.side}`.localeCompare(`${b.moduleKey}:${b.side}`)
      || a.id.localeCompare(b.id)));
}
