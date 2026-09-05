import assert from 'node:assert/strict';
import { planFacadeRouteGallery, FACADE_ROUTE_GALLERY_SCHEMA } from '../world/facade-route-gallery.js';

const endpoint = {
  id: 'exchange:north', resolved: true, side: 'north', tangent: 2.4, y: 17.01,
  width: 1.35, globalFloor: 5, cityRouteId: 'route:mid', hangingLateralThroughput: true,
};
const module = { key: 'm', cx: 0, cz: 0, halfX: 8, halfZ: 5 };
const plan = planFacadeRouteGallery({
  id: 'gallery:test', routeId: 'route:mid', endpoint, module, field: 'ceiling',
  width: 4.0, widthClass: 'sky-street', floorHeight: 3.15, stableKey: 'cut21s:gallery',
});
assert.ok(plan);
assert.equal(plan.schema, FACADE_ROUTE_GALLERY_SCHEMA);
assert.equal(plan.supportMode, 'hung-from-above', 'hanging gallery should visibly attach upward into the host structure');
assert.ok(plan.length > plan.width * 2, 'fat route should read as lateral throughput along facade, not a square landing');
assert.ok(plan.surface.hx > plan.surface.hz, 'north/south gallery long axis must run laterally along facade');
assert.ok(plan.surface.z + plan.surface.hz < -module.halfZ + 0.001,
  'gallery walking surface must remain exterior to the north facade');
assert.ok(plan.metal.length >= 4);
assert.ok(plan.supports.length >= 4, 'thick gallery needs visible structural support, not a floating slab');
assert.ok(plan.supports.some(part => part.architectureRole === 'upper-suspension-brace'));
assert.ok(plan.supports.some(part => part.architectureRole === 'wall-anchor'));

console.log('[cut21s-facade-gallery-selftest] PASS', {
  width: plan.width,
  length: plan.length,
  supportMode: plan.supportMode,
  supportParts: plan.supports.length,
  invariant: 'major hanging circulation hugs facade laterally and is visibly supported from the host building above',
});
