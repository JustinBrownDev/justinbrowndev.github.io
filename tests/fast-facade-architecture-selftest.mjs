import assert from 'node:assert/strict';
import { FAST_FACADE_ARCHITECTURE_SCHEMA, planFastFacadeArchitecture } from '../world/fast-facade-architecture.js';

const floorH = 3.2;
const faceWithPortals = {
  moduleKey: 'm0', dirKey: 'N', side: 'north', floors: 4,
  rect: { cx: 0, cz: 0, halfX: 3.6, halfZ: 2.8 },
  openings: [
    { floor: 0, kind: 'primary-entrance', openingKey: 'm0:N:0', width: 1.25, height: 2.18, center: 0 },
    { floor: 2, kind: 'street-layer-portal', openingKey: 'm0:N:2', width: 1.1, height: 2.12, center: 1.1 },
  ],
};
const closedFace = {
  moduleKey: 'm1', dirKey: 'E', side: 'east', floors: 3,
  rect: { cx: 8, cz: 0, halfX: 2.8, halfZ: 3.2 }, openings: [],
};
const plan = planFastFacadeArchitecture({
  stableKey: 'facade-unit', faces: [faceWithPortals, closedFace], floorH,
  defaultDoorWidth: 1.3, defaultDoorHeight: 2.2,
});
assert.equal(plan.schema, FAST_FACADE_ARCHITECTURE_SCHEMA);
assert.equal(plan.metrics.newPortalCount, 0, 'facade architecture may not invent circulation doors');
assert.equal(plan.metrics.portalFrames, 2, 'every supplied real portal should receive exactly one open architectural frame');
assert.equal(plan.metrics.groundPortalFrames, 1);
assert.equal(plan.metrics.upperPortalFrames, 1);
assert.equal(plan.treatments.filter(t => t.kind === 'portal-frame').length, 2);
assert.ok(plan.treatments.every(t => !['door', 'new-portal'].includes(t.kind)), 'facade plan must not manufacture new portal semantics');
assert.equal(plan.treatments.some(t => t.kind === 'window' && t.moduleKey === 'm0' && t.floor === 2), false,
  'a real street-layer doorway owns its facade slot; a generic window must not cover it');
assert.equal(plan.treatments.some(t => (t.kind === 'storefront' || t.kind === 'service-shutter') && t.moduleKey === 'm0'), false,
  'ground entrance face must not also receive a closed ground bay');
assert.ok(plan.treatments.some(t => (t.kind === 'storefront' || t.kind === 'service-shutter') && t.moduleKey === 'm1'),
  'unused ground facade should receive human-scale closed frontage');
assert.ok(plan.metrics.windows >= 3, 'upper facade should regain inhabited window rhythm');
assert.ok(plan.metrics.canopies >= 1, 'ground portal/storefront architecture should project into the facade silhouette');
for (const prop of plan.render.props) {
  assert.ok(Number.isFinite(prop.x) && Number.isFinite(prop.y) && Number.isFinite(prop.z));
  assert.ok(prop.sx > 0 && prop.sy > 0 && prop.sz > 0);
}

// Program-aware construction directives must override legacy "spare wall = shopfront" logic.
const semanticFaces = [
  { moduleKey: 'apt', dirKey: 'N', side: 'north', floors: 3, rect: { cx: 0, cz: 8, halfX: 4, halfZ: 3 }, openings: [] },
  { moduleKey: 'srv', dirKey: 'E', side: 'east', floors: 3, rect: { cx: 12, cz: 0, halfX: 3, halfZ: 4 }, openings: [] },
  { moduleKey: 'bay', dirKey: 'S', side: 'south', floors: 2, rect: { cx: 0, cz: -8, halfX: 5, halfZ: 3 }, openings: [] },
];
const semanticDirectives = [
  ...Array.from({ length: 3 }, (_, floor) => ({ moduleKey: 'apt', side: 'north', localFloor: floor, facadeLanguage: 'domestic-cellular', architectureFamily: 'domestic-access-stack', constructionFlavor: 'painted-tenement-frame', semanticRole: 'private' })),
  ...Array.from({ length: 3 }, (_, floor) => ({ moduleKey: 'srv', side: 'east', localFloor: floor, facadeLanguage: floor === 0 ? 'technical-service' : 'service-opaque', architectureFamily: 'data-utility-megastructure', constructionFlavor: 'service-megastructure', semanticRole: 'service' })),
  ...Array.from({ length: 2 }, (_, floor) => ({ moduleKey: 'bay', side: 'south', localFloor: floor, facadeLanguage: 'large-operational-bay', architectureFamily: 'industrial-bay-megastructure', constructionFlavor: 'heavy-service-bay', semanticRole: 'work' })),
];
const semanticPlan = planFastFacadeArchitecture({
  stableKey: 'semantic-facade-unit', faces: semanticFaces, floorH,
  defaultDoorWidth: 1.3, defaultDoorHeight: 2.2,
  constructionProfile: { architectureFamily: 'mixed-selftest' },
  constructionDirectives: semanticDirectives,
});
assert.equal(semanticPlan.metrics.storefronts, 0, 'program-aware domestic/technical/operational walls must not receive random storefronts');
assert.ok(semanticPlan.metrics.suppressedGenericGroundBays >= 1, 'domestic ground wall should explicitly suppress the legacy spare-wall shopfront');
assert.ok(semanticPlan.treatments.some(t => t.moduleKey === 'srv' && t.kind === 'technical-panel'), 'technical ground facade should read as service infrastructure');
assert.ok(semanticPlan.treatments.some(t => t.moduleKey === 'bay' && t.kind === 'service-shutter'), 'operational ground facade should read as a broad closed bay');
assert.ok(semanticPlan.treatments.filter(t => t.moduleKey === 'apt' && t.kind === 'window').length >= 6, 'domestic facade should get cellular inhabited window rhythm');
assert.equal(semanticPlan.treatments.some(t => t.moduleKey === 'srv' && t.floor === 0 && t.kind === 'window'), false, 'technical ground floor should stay opaque');
assert.ok(semanticPlan.metrics.constructionDirectedFloors >= 6, 'semantic directives should own the facade schedule');
assert.ok(semanticPlan.metrics.semanticWindows > 0, 'semantic facade windows should become real glazing render records');

console.log('[fast-facade-architecture-selftest] PASS', {
  metrics: plan.metrics,
  invariant: 'existing portals get frames; unused facade gets closed frontage/windows; facade layer creates zero circulation portals',
});
