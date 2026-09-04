import assert from 'node:assert/strict';
import { planInteriorSwitchbackStairCore } from '../world/interior-stair-core.js';
import { STRUCTURAL_FEASIBILITY_SCHEMA, planStructuralFeasibility } from '../world/architecture/structural-feasibility.js';

const truth = { stair: {
  widthSI: 1.36, landingDepthSI: 1.70, headroomSI: 2.10,
  riser: { realizedSI: 0.15 }, tread: { realizedSI: 0.34, sourceMinimum: { canonicalSI: 0.25 } },
} };
const modules = [
  { key: '0,0', cell: { col: 0, row: 0 }, rect: { cx: -2.30, cz: 0, halfX: 2.30, halfZ: 2.30 }, floors: 5 },
  { key: '1,0', cell: { col: 1, row: 0 }, rect: { cx: 2.30, cz: 0, halfX: 2.30, halfZ: 2.30 }, floors: 3 },
  { key: '2,0', cell: { col: 2, row: 0 }, rect: { cx: 6.90, cz: 0, halfX: 2.30, halfZ: 2.30 }, floors: 2 },
];
assert.equal(planInteriorSwitchbackStairCore({ rect: modules[0].rect, floorH: 5.8, physicalTruth: truth, traversalEnvelope: { playerRadius: 0.22 } }), null,
  'known severe single bay must reject rather than grow >4 flights');
const result = planStructuralFeasibility({
  modulePlans: modules, primaryModule: modules[0], floorH: 5.8, physicalTruth: truth,
  traversalEnvelope: { playerRadius: 0.22 }, stableKey: 'cut20r-selftest',
  planStairCore: planInteriorSwitchbackStairCore,
});
assert.equal(result.schema, STRUCTURAL_FEASIBILITY_SCHEMA);
assert.equal(result.accepted, true, 'architecture must negotiate a legal envelope before commit');
assert.equal(result.replanned, true);
assert.ok(result.consumedModuleKeys.length >= 2);
assert.ok(result.core.flightCount === 2 || result.core.flightCount === 4);
assert.equal(result.claims.structural.reservedBeforeCommit, true);
assert.ok(result.circulation.floorOpenings.length > 0);
assert.ok(result.circulation.landingEnvelopes.length >= 3);
assert.ok(result.circulation.headroomVolumes.length > 0);
assert.ok(result.replanHistory.length >= 2);
console.log('[structural-feasibility-selftest] PASS', {
  schema: result.schema, replanMode: result.replanMode,
  hosts: result.consumedModuleKeys, flights: result.core.flightCount,
  invariant: 'proposal -> stair feasibility -> reservations/claims -> committed architecture',
});
