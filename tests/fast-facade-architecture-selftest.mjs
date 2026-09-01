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
console.log('[fast-facade-architecture-selftest] PASS', {
  metrics: plan.metrics,
  invariant: 'existing portals get frames; unused facade gets closed frontage/windows; facade layer creates zero circulation portals',
});
