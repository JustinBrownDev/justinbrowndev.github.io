import assert from 'node:assert/strict';
import { planFacadeRouteGallery } from '../world/facade-route-gallery.js';

const endpoint = {
  id: 'exchange:north', resolved: true, side: 'north', tangent: 0, y: 17.01,
  width: 1.4, globalFloor: 5, cityRouteId: 'route:long', hangingLateralThroughput: true,
};
const module = { key: 'm:1', cx: 0, cz: 0, halfX: 4, halfZ: 5 };
const footprints = [-8, 0, 8].map((cx, i) => ({ key: `m:${i}`, cx, cz: 0, halfX: 4, halfZ: 5 }));
const plan = planFacadeRouteGallery({
  id: 'gallery:long', routeId: 'route:long', endpoint, module, field: 'ceiling',
  width: 3.5, widthClass: 'sky-street', floorHeight: 3.15,
  hostBounds: { minX: -12, maxX: 12, minZ: -5, maxZ: 5 }, footprintModules: footprints,
  routeStrength: 0.94, routeSpan: 68, crossingWidth: 1.5, stableKey: 'cut21t:gallery',
});
assert.ok(plan);
assert.equal(plan.compoundFace, true);
assert.ok(plan.length > 24, `expected compound-scale thoroughfare, got ${plan.length}`);
assert.ok(plan.hugCoverage > 0.86, `expected most route length to hug real mass, got ${plan.hugCoverage}`);
assert.ok(plan.cornerOverlap > 0.5, 'strong route should overlap corners so adjacent face galleries can union into a wrap');
assert.ok(plan.unsupportedLength < plan.length * 0.16, 'exposed gallery continuation must remain a minority of the route');
const openingHalf = 1.5 * 0.62 + 0.35;
for (const support of plan.supports) {
  const tangent = support.x;
  assert.ok(Math.abs(tangent - endpoint.tangent) > openingHalf - 0.05,
    'gallery support/decorative structure must vacate the crossing/portal junction');
}
console.log('[cut21t-gallery-thoroughfare-selftest] PASS', {
  length: plan.length, width: plan.width, hugCoverage: plan.hugCoverage,
  unsupportedLength: plan.unsupportedLength, cornerOverlap: plan.cornerOverlap,
  invariant: 'fat hanging route is a long building-hugging thoroughfare with only bounded exposed continuation',
});
