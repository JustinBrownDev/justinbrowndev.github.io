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
const rolesByFamily = {};
for (const family of STAIR_ARCHITECTURE_FAMILIES) {
  const plan = planStairArchitectureExpression({ id:`21w:${family}`, route, family, field: family === 'utility-ship-stair' ? 'ceiling' : 'ground', stableKey:`21w:${family}` });
  assert.equal(plan.family, family);
  assert.equal(plan.traversalAuthority, 'species-selected-before-visual-expression');
  assert.ok(plan.parts >= route.flights.length, `${family} needs materially visible structure`);
  assert.ok([...plan.metal, ...plan.concrete].every(part => part.stairArchitecture === true && part.visualOnly === true));
  for (const part of [...plan.metal, ...plan.concrete].filter(part => part.architectureRole === 'side-stringer')) {
    if (route.flights[0].axis === 'x') assert.ok(Math.abs(part.z - route.flights[0].fixedCoord) > route.flights[0].halfWidth, `${family} stringer entered stair clear width`);
    else assert.ok(Math.abs(part.x - route.flights[0].fixedCoord) > route.flights[0].halfWidth, `${family} stringer entered stair clear width`);
  }
  counts[family] = plan.parts;
  rolesByFamily[family] = new Set([...plan.metal, ...plan.concrete].map(part => part.architectureRole));
}
assert.ok(rolesByFamily['domestic-enclosed-dogleg'].has('enclosure-side-wall'), 'domestic stair must read as a shaft even with rails removed');
assert.ok(rolesByFamily['institutional-egress'].has('enclosure-side-wall'), 'institutional egress must own an enclosed core');
assert.ok(rolesByFamily['retrofit-facade-fire-escape'].has('facade-tieback-bracket'), 'retrofit fire escape must visibly return load to the facade');
assert.ok(rolesByFamily['industrial-work-stair'].has('platform-frame-column'), 'industrial stair must align to a work-platform frame');
assert.ok(rolesByFamily['scaffold-access-tower'].has('scaffold-bay-post') && rolesByFamily['scaffold-access-tower'].has('scaffold-x-brace'), 'scaffold stairs must live inside a scaffold frame');
assert.ok(rolesByFamily['district-thoroughfare'].has('street-landing-plinth') && rolesByFamily['district-thoroughfare'].has('public-infrastructure-pier'), 'district stair landings must read as public infrastructure');
assert.ok(rolesByFamily['civic-monumental'].has('monumental-base-mass'), 'civic stair must carry itself through architectural mass');
assert.equal(stairArchitectureFamilyFor({ programArchitectureId:'apartment', physicalUse:'residential-lodging' }), 'domestic-enclosed-dogleg');
assert.equal(stairArchitectureFamilyFor({ programArchitectureId:'fire-station', physicalUse:'industrial-service' }), 'industrial-work-stair');
assert.equal(stairArchitectureFamilyFor({ programArchitectureId:'clinic', physicalUse:'assembly-institutional' }), 'institutional-egress');
assert.equal(stairArchitectureFamilyFor({ programArchitectureId:'server-facility', physicalUse:'maintenance-utility' }), 'industrial-work-stair');
assert.equal(stairArchitectureFamilyFor({ programArchitectureId:'fire-station', physicalUse:'industrial-service', routeFamily:'retrofit-fire-escape', emergencyOnly:true }), 'retrofit-facade-fire-escape');
assert.equal(stairArchitectureFamilyFor({ programArchitectureId:'apartment', physicalUse:'residential-lodging', field:'ceiling', routeWidthScale:2 }), 'domestic-enclosed-dogleg');
console.log('[cut21w-architectural-family-selftest] PASS', counts);
