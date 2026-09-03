import assert from 'node:assert/strict';
import { reconcileCavernFloorBudgets } from '../world/cavern-joint-synthesis.js';
import { planFastFacadeArchitecture } from '../world/fast-facade-architecture.js';

const joint = reconcileCavernFloorBudgets({
  ceilingY: 34.02,
  verticalClearance: 0.72,
  sharedReserve: 1.35,
  claimMargin: 0,
  groundPlans: [{ id: 'g', bounds: { minX: 0, maxX: 5, minZ: 0, maxZ: 5 }, desiredFloors: 8, floorHeight: 3.15 }],
  ceilingPlans: [{ id: 'c', bounds: { minX: 1, maxX: 6, minZ: 1, maxZ: 6 }, desiredFloors: 8, floorHeight: 3.15 }],
});
const g = joint.ground.get('g');
const c = joint.ceiling.get('c');
assert.ok(g && c);
assert.ok(g.floors >= 1 && c.floors >= 1, 'joint negotiation must preserve both opposing buildings');
assert.ok(g.occupiedHeight + c.occupiedHeight <= joint.usableHeight + 1e-8, 'resolved pair must fit cavern vertical budget');
assert.ok(Math.abs(g.floors - c.floors) <= 1, 'equal requests should be trimmed symmetrically');
assert.deepEqual(g.blockers, ['c']);
assert.deepEqual(c.blockers, ['g']);

const noOverlap = reconcileCavernFloorBudgets({
  groundPlans: [{ id: 'g0', bounds: { minX: 0, maxX: 2, minZ: 0, maxZ: 2 }, desiredFloors: 7, floorHeight: 3 }],
  ceilingPlans: [{ id: 'c0', bounds: { minX: 10, maxX: 12, minZ: 10, maxZ: 12 }, desiredFloors: 7, floorHeight: 3 }],
  claimMargin: 0,
});
assert.equal(noOverlap.ground.get('g0').floors, 7);
assert.equal(noOverlap.ceiling.get('c0').floors, 7);

// Short top-aligned hanging module: local floor 0 begins at global compound
// floor 3. Storefront/awning/frame geometry must follow that module datum.
const floorH = 3.15;
let facade = null;
for (let i = 0; i < 200 && !facade; i++) {
  const candidate = planFastFacadeArchitecture({
    stableKey: `hanging-storefront-${i}`,
    floorH,
    faces: [{
      moduleKey: 'short-wing', dirKey: 'N', side: 'north', floors: 2, floorBase: 3,
      rect: { cx: 0, cz: 0, halfX: 2.5, halfZ: 2 }, openings: [],
    }],
  });
  if (candidate.treatments.some(item => item.kind === 'storefront')) facade = candidate;
}
assert.ok(facade, 'fixture must find deterministic storefront seed');
const frame = facade.render.props.find(item => item.facadeRole === 'storefront-frame');
assert.ok(frame, 'storefront must emit frame geometry');
assert.ok(frame.y > 3 * floorH + 0.5, 'top-aligned short-module storefront must start at module floorBase, not y=0');
const aperture = facade.apertures.find(item => item.kind === 'storefront');
assert.equal(aperture.floor, 0, 'storefront remains local first-floor semantics');
assert.equal(aperture.floorBase, 3, 'aperture must retain module floor-base authority');

console.log('cut18 cavern joint synthesis selftest: PASS');
