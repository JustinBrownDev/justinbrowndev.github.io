import assert from 'node:assert/strict';
import { planInteriorStairCoreStructuralFeasibility } from '../world/interior-stair-core.js';
import { recoverCellFootprintForCirculation } from '../world/architecture/circulation-footprint-recovery.js';

const physicalTruth = {
  stair: {
    widthSI: 1.179,
    landingDepthSI: 1.172,
    headroomSI: 2.05,
    riser: { realizedSI: 0.178 },
    tread: { realizedSI: 0.286, sourceMinimum: { canonicalSI: 0.25 } },
  },
};
const cellSize = 64 / 9;
const module = {
  key: '4,4',
  cell: { col: 4, row: 4 },
  floors: 5,
  edgeKinds: { N: 'street', S: 'street', W: 'street', E: 'street' },
  rect: { cx: 0, cz: 0, halfX: 2.38, halfZ: 2.38 },
};
const common = {
  modulePlans: [module],
  primaryModule: module,
  floorH: 3.15,
  physicalTruth,
  traversalEnvelope: { playerRadius: 0.22 },
  stableKey: 'cut20r2-isolated-cell',
};
const before = planInteriorStairCoreStructuralFeasibility(common);
assert.equal(before.accepted, false, '4.76m isolated footprint should expose the real circulation infeasibility');
assert.equal(before.rejectionReason, 'no-legal-circulation-envelope');

const recovery = recoverCellFootprintForCirculation({
  module, cx0: 0, cz0: 0, half: 32, cellSize,
});
assert.ok(recovery, 'allocated procedural cell must offer a larger precommit footprint');
assert.ok(recovery.rect.halfX * 2 > 5.25 && recovery.rect.halfZ * 2 > 5.25,
  'recovery envelope must be large enough for the known legal compact switchback range');
module.rect = { ...recovery.rect };
const after = planInteriorStairCoreStructuralFeasibility(common);
assert.equal(after.accepted, true, 'architecture must become legal without weakening stair truth');
assert.ok(after.core.flightCount === 2 || after.core.flightCount === 4);
assert.ok(after.circulation.floorOpenings.length > 0);
console.log('[circulation-footprint-recovery-selftest] PASS', {
  original: recovery.originalRect,
  recovered: recovery.rect,
  flights: after.core.flightCount,
  invariant: 'failed stair fit expands allocated architecture before realization',
});
