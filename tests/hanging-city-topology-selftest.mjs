import assert from 'node:assert/strict';
import {
  HANGING_CITY_CEILING_Y,
  HANGING_CITY_FLOOR_HEIGHT,
  HANGING_CITY_PHASE_X,
  HANGING_CITY_PHASE_Z,
  ceilingFrame,
  ceilingSourceCoordinates,
  planCeilingBuildingHeight,
} from '../world/hanging-city-topology.js';

assert.ok(Math.abs(HANGING_CITY_CEILING_Y - 34.02) < 1e-9, 'parallel plane separation must be exactly 60% of Cut 15');
const a = ceilingSourceCoordinates(0, 0);
const east = ceilingSourceCoordinates(1, 0);
const south = ceilingSourceCoordinates(0, 1);
assert.deepEqual(a, { x: HANGING_CITY_PHASE_X, z: HANGING_CITY_PHASE_Z, key: `${HANGING_CITY_PHASE_X},${HANGING_CITY_PHASE_Z}` });
assert.equal(east.x, a.x + 1, 'ceiling phase must preserve chunk adjacency');
assert.equal(east.z, a.z);
assert.equal(south.x, a.x);
assert.equal(south.z, a.z + 1, 'ceiling phase must preserve chunk adjacency');
assert.notDeepEqual(a, { x: 0, z: 0, key: '0,0' }, 'ceiling topology may not be a registered copy of ground topology');

const frame = ceilingFrame();
assert.equal(frame.growthDirection, 'world-down');
assert.equal(frame.gravityDirection, 'world-down');
assert.equal(frame.cameraUpDirection, 'world-up');
assert.equal(frame.playerTraversal, 'ordinary');

const siteBounds = { minX: -3, maxX: 3, minZ: -3, maxZ: 3 };
const ground = [{
  id: 'ground:a', kind: 'building', floors: 4, floorH: HANGING_CITY_FLOOR_HEIGHT,
  compoundBounds: { minX: -2, maxX: 2, minZ: -2, maxZ: 2 },
}];
const constrained = planCeilingBuildingHeight({ siteBounds, groundEntities: ground, desiredFloors: 8 });
assert.ok(constrained.accepted || constrained.maxFloors === 0);
if (constrained.accepted) {
  const undersideBottom = constrained.baseY - constrained.undersideReserve;
  assert.ok(undersideBottom >= constrained.blockingTopY + constrained.verticalClearance - 1e-9,
    'full underside claim must clear opposing ground architectural claim');
}
const open = planCeilingBuildingHeight({ siteBounds: { minX: 20, maxX: 25, minZ: 20, maxZ: 25 }, groundEntities: ground, desiredFloors: 8 });
assert.equal(open.floors, 8, 'unblocked phase-sampled stalactite should retain desired height');
assert.ok(open.baseY < HANGING_CITY_CEILING_Y);

console.log('[hanging-city-topology-selftest] PASS', {
  ceilingY: HANGING_CITY_CEILING_Y,
  phase: [HANGING_CITY_PHASE_X, HANGING_CITY_PHASE_Z],
  openFloors: open.floors,
  constrainedFloors: constrained.floors,
  invariant: 'same generator + remote phase; world-down growth; ordinary gravity; pre-generation opposing claim budget',
});
