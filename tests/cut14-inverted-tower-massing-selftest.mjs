import assert from 'node:assert/strict';
import {
  BASELINE_COMPOUND_TARGETS,
  BUILDING_VOLUME_SCALE_TARGET,
  SCALED_COMPOUND_TARGETS,
  weightedCompoundTargetMean,
} from '../world/building-scale-policy.js';
import {
  HANGING_CITY_CEILING_Y,
  HANGING_CITY_PHASE_X,
  HANGING_CITY_PHASE_Z,
  ceilingSourceCoordinates,
  planCeilingBuildingHeight,
} from '../world/hanging-city-topology.js';

assert.equal(BUILDING_VOLUME_SCALE_TARGET, 4);
const baselineMean = weightedCompoundTargetMean(BASELINE_COMPOUND_TARGETS);
const scaledMean = weightedCompoundTargetMean(SCALED_COMPOUND_TARGETS);
assert.ok(Math.abs(scaledMean - baselineMean * 4) < 1e-10);
assert.ok(Math.abs(HANGING_CITY_CEILING_Y - 34.02) < 1e-9);
const source = ceilingSourceCoordinates(2, -3);
assert.deepEqual(source, { x: 2 + HANGING_CITY_PHASE_X, z: -3 + HANGING_CITY_PHASE_Z, key: `${2 + HANGING_CITY_PHASE_X},${-3 + HANGING_CITY_PHASE_Z}` });
const budget = planCeilingBuildingHeight({
  siteBounds: { minX: -4, maxX: 4, minZ: -4, maxZ: 4 },
  groundEntities: [{ id: 'g', kind: 'building', floors: 5, floorH: 3.15, compoundBounds: { minX: -3, maxX: 3, minZ: -3, maxZ: 3 } }],
  desiredFloors: 8,
});
assert.ok(budget.floors <= 8);
assert.ok(budget.baseY <= HANGING_CITY_CEILING_Y);
console.log('[cut14-inverted-tower-massing-selftest] PASS', {
  baselineMean, scaledMean, phase: source.key, ceilingY: HANGING_CITY_CEILING_Y,
  invariant: 'Cut 14 sparse inversion remains retired; Cut 16 ceiling city is phase-shifted and ordinary-gravity',
});
