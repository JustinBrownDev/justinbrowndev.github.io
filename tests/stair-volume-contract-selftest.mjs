// JWEB_INTENT: STAIR_WALKABILITY_V1
import assert from 'node:assert/strict';
import { resolvePhysicalTruth } from '../world/physical-truth.js';
import { createStairShaftReservation } from '../world/circulation-reservations.js';
import { planExteriorScaffoldRoute } from '../world/scaffold-circulation-plan.js';
import { assertCanonicalFacadeZigzag, assertStairShaftContainsFlight } from '../world/stair-volume-contract.js';

const truth = resolvePhysicalTruth({ physicalUse: 'industrial-service', role: 'maintenance-access', weirdness: 0.25, stableKey: 'stair-volume-contract-selftest' });
const plan = planExteriorScaffoldRoute({ fp: { cx: 0, cz: 0, halfX: 10, halfZ: 4 }, siteId: 7, moduleKey: 'm', floors: 3, floorH: 3.2, side: 'north', seed: 123, physicalTruth: truth, maxExteriorDepth: 4.0, routeId: 'unit:scaffold' });
assert.ok(plan);
assert.equal(assertCanonicalFacadeZigzag(plan), true);
assert.ok(plan.scaffoldEnvelope.normalDepth > plan.clearWidth * 2);
for (let level = 0; level < plan.floors; level++) {
  const f = plan.flights[level];
  assert.equal(f.fixedCoord, plan.scaffoldEnvelope.laneCoords[level % 2]);
  assert.equal(f.from, plan.landings[level].stairEndpointTangent);
  assert.equal(f.to, plan.landings[level + 1].stairEndpointTangent);
  assert.equal(plan.landings[level].stairCarveAllowed, false);
}
for (let level = 1; level < plan.floors; level++) {
  assert.notEqual(plan.landings[level].incomingMouth.laneIndex, plan.landings[level].outgoingMouth.laneIndex);
}

const shaft = createStairShaftReservation({ id: 'unit:shaft', x: 0, z: 0, openingWidth: 1.4, openingDepth: 5.8, baseY: 0, roofY: 3.2, exitHeadroom: 2.05, rampAxis: 'z', rampFrom: -2.5, rampTo: 2.5, rampHalfWidth: 0.55 });
assert.equal(assertStairShaftContainsFlight({ id: 'unit:shaft', reservation: shaft, axis: 'z', from: -2.5, to: 2.5, fixedCoord: 0, halfWidth: 0.55, y0: 0, y1: 3.2 }), true);
assert.throws(() => assertStairShaftContainsFlight({ id: 'unit:bad-shaft', reservation: shaft, axis: 'x', from: -4, to: 4, fixedCoord: 0, halfWidth: 0.8, y0: 0, y1: 3.2 }), /does not contain/);

console.log('[stair-volume-contract-selftest] PASS', { topology: plan.topology, stories: plan.floors, invariant: 'landings are intact horizontal circulation; narrow full-story flights alternate side-by-side lanes' });
