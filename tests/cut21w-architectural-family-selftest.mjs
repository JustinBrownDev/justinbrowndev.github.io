import assert from 'node:assert/strict';
import { planAlternatingFacadeStair } from '../world/facade-stair-authority.js';
import { resolvePhysicalTruth } from '../world/physical-truth.js';
import {
  STAIR_ARCHITECTURE_FAMILIES,
  planStairArchitectureExpression,
  stairArchitectureFamilyFor,
} from '../world/architectural-family-system.js';

const truth = resolvePhysicalTruth({ worldSeed: 21, chunkKey: '0,0', entityId: '21w-stair', physicalUse: { family: 'industrial-service' } });
const route = planAlternatingFacadeStair({
  routeId: '21w:stair', fp: { cx:0, cz:0, halfX:12, halfZ:6 }, side:'north', floors:4,
  floorH:3.15, physicalTruth:truth, stableKey:'21w:stair', clearWidthOverride:1.55,
});
assert.ok(route);
const counts = {};
for (const family of STAIR_ARCHITECTURE_FAMILIES) {
  const plan = planStairArchitectureExpression({ id:`21w:${family}`, route, family, field: family === 'utility-rack' ? 'ceiling' : 'ground', stableKey:`21w:${family}` });
  assert.equal(plan.family, family);
  assert.equal(plan.traversalAuthority, 'canonical-stair-kernel-unchanged');
  assert.ok(plan.parts >= route.flights.length * 2, `${family} needs materially visible structure`);
  assert.ok([...plan.metal, ...plan.concrete].every(part => part.stairArchitecture === true && part.visualOnly === true));
  for (const part of [...plan.metal, ...plan.concrete].filter(part => part.architectureRole === 'side-stringer')) {
    if (route.flights[0].axis === 'x') assert.ok(Math.abs(part.z - route.flights[0].fixedCoord) > route.flights[0].halfWidth, `${family} stringer entered stair clear width`);
    else assert.ok(Math.abs(part.x - route.flights[0].fixedCoord) > route.flights[0].halfWidth, `${family} stringer entered stair clear width`);
  }
  counts[family] = plan.parts;
}
assert.equal(stairArchitectureFamilyFor({ programArchitectureId:'apartment' }), 'residential-enclosed');
assert.equal(stairArchitectureFamilyFor({ programArchitectureId:'fire-station' }), 'industrial-fire-escape');
assert.equal(stairArchitectureFamilyFor({ programArchitectureId:'clinic' }), 'civic-monumental');
assert.equal(stairArchitectureFamilyFor({ programArchitectureId:'server-facility' }), 'utility-rack');
console.log('[cut21w-architectural-family-selftest] PASS', counts);
