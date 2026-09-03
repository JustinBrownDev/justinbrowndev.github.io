import assert from 'node:assert/strict';
import {
  HANGING_CITY_ANCHOR_FLOORS,
  HANGING_CITY_CEILING_Y,
  HANGING_CITY_FLOOR_HEIGHT,
  planHangingCityCounterparts,
} from '../world/hanging-city-topology.js';

assert.equal(HANGING_CITY_CEILING_Y, HANGING_CITY_ANCHOR_FLOORS * HANGING_CITY_FLOOR_HEIGHT);
const sitePlans = [
  { site: { id: 1 }, signature: 'a', isPlaza: false },
  { site: { id: 2 }, signature: 'b', isPlaza: false },
  { site: { id: 3 }, signature: 'c', isPlaza: true },
];
const groundEntities = [
  { id: 'ground:a', kind: 'building', siteId: 1, floors: 11 },
  { id: 'ground:b', kind: 'building', siteId: 2, floors: 3 },
];
const plan = planHangingCityCounterparts({ worldSeed: 12345, chunkKey: '2,-1', sitePlans, groundEntities, weirdness: 0.8 });
assert.equal(plan.counterparts.length, 2);
for (const item of plan.counterparts) {
  assert.ok(item.hangingTipY >= item.groundRoofY - 1e-9, 'pre-generation ownership must prevent vertical overlap');
  assert.equal(item.frame.verticalPolarity, -1);
  if (item.dualPolarity) {
    assert.equal(item.entityId, item.groundEntityId, 'colliding claims become one building identity');
    assert.equal(item.sharedSeamY, item.groundRoofY);
    assert.ok(Math.abs(item.hangingTipY - item.groundRoofY) < 1e-9, 'dual building meets on one exact double-sided seam floor');
    assert.equal(item.groundFloors + item.hangingFloors, HANGING_CITY_ANCHOR_FLOORS);
  } else {
    assert.ok(item.gapFloors > 0, 'independent frames must retain a real vertical gap');
  }
}
assert.ok(plan.dualPolarityCount >= 1, 'fixture must exercise the same-building collision decision');
console.log('[hanging-city-topology-selftest] PASS', {
  ceilingY: plan.ceilingY,
  counterparts: plan.counterparts.length,
  dual: plan.dualPolarityCount,
  invariant: 'collision => same building; otherwise non-overlapping peer hanging city',
});
