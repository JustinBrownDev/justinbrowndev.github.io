import assert from 'node:assert/strict';
import {
  BASELINE_COMPOUND_TARGETS,
  BUILDING_VOLUME_SCALE_TARGET,
  SCALED_COMPOUND_TARGETS,
  weightedCompoundTargetMean,
} from '../world/building-scale-policy.js';
import {
  HANGING_CITY_ANCHOR_FLOORS,
  HANGING_CITY_CEILING_Y,
  HANGING_CITY_FLOOR_HEIGHT,
  planHangingCityCounterparts,
} from '../world/hanging-city-topology.js';

assert.equal(BUILDING_VOLUME_SCALE_TARGET, 4);
const baselineMean = weightedCompoundTargetMean(BASELINE_COMPOUND_TARGETS);
const scaledMean = weightedCompoundTargetMean(SCALED_COMPOUND_TARGETS);
assert.ok(Math.abs(scaledMean - baselineMean * 4) < 1e-10);
assert.equal(HANGING_CITY_CEILING_Y, HANGING_CITY_ANCHOR_FLOORS * HANGING_CITY_FLOOR_HEIGHT);

const sitePlans = [
  { site: { id: 0 }, signature: '0,0|1,0|0,1|1,1', isPlaza: false },
  { site: { id: 1 }, signature: '4,0|5,0|4,1|5,1', isPlaza: false },
];
const groundEntities = [
  { id: 'g0', kind: 'building', siteId: 0, floors: 10 },
  { id: 'g1', kind: 'building', siteId: 1, floors: 4 },
];
const args = { worldSeed: 0x14c17a, chunkKey: '2,-3', sitePlans, groundEntities, weirdness: 0.9 };
const a = planHangingCityCounterparts(args);
const b = planHangingCityCounterparts(args);
assert.deepEqual(a, b, 'hanging city topology must be deterministic');
assert.equal(a.counterparts.length, 2);
for (const item of a.counterparts) {
  assert.ok(item.hangingTipY >= item.groundRoofY - 1e-9, 'hanging claim must never penetrate ground claim');
  assert.equal(item.frame.verticalPolarity, -1);
  if (item.dualPolarity) {
    assert.equal(item.entityId, item.groundEntityId, 'overlap promotes one shared building identity');
    assert.ok(Math.abs(item.hangingTipY - item.groundRoofY) < 1e-9, 'shared building must meet on one exact seam floor');
  }
}

console.log('[cut14-inverted-tower-massing-selftest] PASS', {
  baselineMean, scaledMean,
  hangingCounterparts: a.counterparts.length,
  dualPolarity: a.dualPolarityCount,
  invariant: 'Cut 14 sparse tower registry retired in favor of full-fat non-overlapping hanging city topology',
});
