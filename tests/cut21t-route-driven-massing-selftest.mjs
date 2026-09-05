import assert from 'node:assert/strict';
import { reconcileCavernFloorBudgets } from '../world/cavern-joint-synthesis.js';

function plan(id, routeDemandScore, routeRole = 'transfer', absorbedInterveningTower = false) {
  return {
    id, desiredFloors: 10, minimumFloors: 1, floorHeight: 3.15,
    bounds: { minX: 0, maxX: 8, minZ: 0, maxZ: 8 },
    routeDemandScore, routeRole, absorbedInterveningTower,
    routeDrivenHeightTarget: 9, baseDesiredFloors: 4,
  };
}
const upright = reconcileCavernFloorBudgets({
  groundPlans: [plan('g:u', 0.92, 'transfer', true)],
  ceilingPlans: [plan('c:u', 0.10, 'endpoint')],
  ceilingY: 34.02, verticalClearance: 0.72, sharedReserve: 1.35, claimMargin: 0,
  stableKey: 'cut21t:upright',
});
assert.equal(upright.overlaps[0].sectionArchetype, 'upright-collector');
assert.equal(upright.overlaps[0].routeDriven, true);
assert.ok(upright.overlaps[0].groundCap > upright.overlaps[0].ceilingCap);

const hanging = reconcileCavernFloorBudgets({
  groundPlans: [plan('g:h', 0.08, 'endpoint')],
  ceilingPlans: [plan('c:h', 0.90, 'transfer', true)],
  ceilingY: 34.02, verticalClearance: 0.72, sharedReserve: 1.35, claimMargin: 0,
  stableKey: 'cut21t:hanging',
});
assert.equal(hanging.overlaps[0].sectionArchetype, 'hanging-collector');
assert.ok(hanging.overlaps[0].ceilingCap > hanging.overlaps[0].groundCap);

const braid = reconcileCavernFloorBudgets({
  groundPlans: [plan('g:b', 0.76)], ceilingPlans: [plan('c:b', 0.73)],
  ceilingY: 34.02, verticalClearance: 0.72, sharedReserve: 1.35, claimMargin: 0,
  stableKey: 'cut21t:braid',
});
assert.equal(braid.overlaps[0].sectionArchetype, 'midsection-braid',
  'two strong competing route systems should braid rather than arbitrarily erasing one polarity');
assert.equal(braid.metrics.routeDrivenPairs, 1);
assert.equal(upright.metrics.absorbedRoutePairs, 1);
console.log('[cut21t-route-driven-massing-selftest] PASS', {
  upright: upright.overlaps[0],
  hanging: hanging.overlaps[0],
  braid: braid.overlaps[0],
  invariant: 'route demand participates in sectional massing before bridge elevation is realized',
});
