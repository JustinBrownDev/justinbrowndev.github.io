import assert from 'node:assert/strict';
import { planInteriorSwitchbackStairCore } from '../world/interior-stair-core.js';

const physicalTruth = {
  stair: {
    widthSI: 0.91,
    landingDepthSI: 0.91,
    headroomSI: 2.03,
    riser: { realizedSI: 0.18 },
    tread: { realizedSI: 0.28, sourceMinimum: { canonicalSI: 0.25 } },
  },
};
const rect = { cx: 0, cz: 0, halfX: 4.2, halfZ: 6.0 };
const traversalEnvelope = { playerRadius: 0.22 };
const make = stableKey => planInteriorSwitchbackStairCore({
  rect, floorH: 3.15, physicalTruth, traversalEnvelope, stableKey,
});
const negative = make('mirror-a');
const positive = make('mirror-b');
assert.ok(negative && positive);
assert.equal(negative.topology, 'two-flight-switchback');
assert.equal(positive.topology, 'two-flight-switchback');
assert.equal(negative.returnHandedness, 'negative-cross-first');
assert.equal(positive.returnHandedness, 'positive-cross-first');
assert.deepEqual(negative.flights.map(f => f.laneIndex), [0, 1]);
assert.deepEqual(positive.flights.map(f => f.laneIndex), [1, 0]);
assert.deepEqual(
  [negative.opening.sx, negative.opening.sz, negative.segmentFlight.requiredRun, negative.clearWidth],
  [positive.opening.sx, positive.opening.sz, positive.segmentFlight.requiredRun, positive.clearWidth],
  'handedness may not change the physical envelope/truth',
);
console.log('[geometry-r2f-stair-handedness-selftest] PASS', {
  negative: negative.topologyVariant,
  positive: positive.topologyVariant,
  invariant: 'same physical stair contract; deterministic mirrored lane order',
});
