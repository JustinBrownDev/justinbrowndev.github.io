import assert from 'node:assert/strict';
import { planDistrictRouteIntent, DISTRICT_ROUTE_CONTINUITY_SCHEMA } from '../world/district-route-continuity.js';
import { composeCityRoutes } from '../world/city-route-composer.js';

const worldSeed = 918273;
const intents = [];
for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) {
  intents.push(planDistrictRouteIntent({ worldSeed, chunk: { x, z }, field: 'ceiling', chunkSize: 64 }));
}
const active = intents.filter(intent => intent.active);
assert.equal(active.length, 3, 'one row/column of a 3x3 district should carry the arterial');
assert.ok(active.every(intent => intent.schema === DISTRICT_ROUTE_CONTINUITY_SCHEMA));
assert.equal(new Set(active.map(intent => intent.routeId)).size, 1, 'district arterial identity must persist across participating chunks');
assert.equal(new Set(active.map(intent => intent.axis)).size, 1);
assert.equal(new Set(active.map(intent => intent.centerline)).size, 1);
assert.equal(new Set(active.map(intent => intent.preferredBandNorm)).size, 1);
assert.deepEqual(active.map(intent => intent.alongIndex).sort((a,b)=>a-b), [0,1,2]);
assert.deepEqual(active.map(intent => intent.routeRole).sort(), ['district-entry','district-exit','district-interior'].sort());
const ground = planDistrictRouteIntent({ worldSeed, chunk: { x: active[0].localX, z: active[0].localZ }, field: 'ground', chunkSize: 64 });
assert.notEqual(ground.routeId, active[0].routeId, 'ground and ceiling route systems remain independently addressable');

const districtRouteIntent = Object.freeze({
  schema: DISTRICT_ROUTE_CONTINUITY_SCHEMA,
  routeId: 'district-route:test:ceiling:x:1',
  active: true,
  axis: 'x',
  centerline: 0,
  corridorHalfWidth: 12,
  preferredBandNorm: 0.52,
  strength: 0.94,
  routeRole: 'district-interior',
  chunkSize: 64,
  chunkBounds: Object.freeze({ minX:-32, maxX:32, minZ:-32, maxZ:32 }),
});
const geometry = new Map([
  ['A',{x:-29,z:0,halfX:2,halfZ:2}], ['B',{x:-10,z:1,halfX:2,halfZ:2}],
  ['C',{x:10,z:-1,halfX:2,halfZ:2}], ['D',{x:29,z:0,halfX:2,halfZ:2}],
  ['E',{x:-22,z:23,halfX:2,halfZ:2}], ['F',{x:0,z:24,halfX:2,halfZ:2}], ['G',{x:22,z:23,halfX:2,halfZ:2}],
]);
const endpoint = id => ({ id, resolved:true });
const edge = (id,a,b) => ({ id, aSiteId:a, bSiteId:b, aEndpoint:endpoint(`${id}:a`), bEndpoint:endpoint(`${id}:b`) });
const bridgePlans = [
  edge('ab','A','B'), edge('bc','B','C'), edge('cd','C','D'),
  edge('ae','A','E'), edge('ef','E','F'), edge('fg','F','G'), edge('gd','G','D'),
];
const composition = composeCityRoutes({ bridgePlans, field:'ceiling', stableKey:'21z:composer', siteGeometry:geometry, districtRouteIntent });
const arterial = composition.routes.find(route => route.districtArterial);
assert.ok(arterial, 'active district intent should recruit a compatible local component');
assert.equal(arterial.districtRouteId, districtRouteIntent.routeId);
assert.equal(arterial.districtRouteAxis, 'x');
assert.ok(arterial.districtRouteAffinity >= 0.34);
assert.equal(arterial.preferredBandNorm, districtRouteIntent.preferredBandNorm);
assert.ok(arterial.primaryNodes.includes('B') && arterial.primaryNodes.includes('C'), 'the centerline path should beat the longer off-axis detour');
for (const plan of bridgePlans.filter(plan => plan.cityRouteRole === 'primary-spine')) {
  assert.equal(plan.districtRouteId, districtRouteIntent.routeId);
  assert.equal(plan.districtArterial, true);
  for (const ep of [plan.aEndpoint, plan.bEndpoint]) assert.equal(ep.districtRouteId, districtRouteIntent.routeId);
}
console.log('[cut21z-district-route-continuity-selftest] PASS', {
  routeId: active[0].routeId,
  axis: active[0].axis,
  participatingChunks: active.map(intent => `${intent.localX},${intent.localZ}`),
  composerAffinity: arterial.districtRouteAffinity,
  primaryNodes: arterial.primaryNodes,
});
