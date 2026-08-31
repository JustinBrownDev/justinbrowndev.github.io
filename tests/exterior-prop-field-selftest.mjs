import assert from 'node:assert/strict';
import { planExteriorPropField } from '../world/exterior-prop-field.js';

const opportunities = [
  {
    id:'a:n:service', role:'facade-service-band', entityId:'building:a', hostId:'building:a', surfaceId:'a:n', side:'north',
    transform:{x:2.3,y:4.2,z:-3.05,rotY:0}, clearanceBudget:{width:3.2,height:6.0}, decorationMayIntrude:true,
    surfaceFrame:{tangentX:1,tangentZ:0,normalX:0,normalZ:-1}, spatialTopologyHostId:'a:n',
  },
  {
    id:'a:n:sign', role:'facade-sign-zone', entityId:'building:a', hostId:'building:a', surfaceId:'a:n', side:'north',
    transform:{x:-2.2,y:3.5,z:-3.04,rotY:0}, clearanceBudget:{width:4.2,height:2.2}, decorationMayIntrude:true,
    surfaceFrame:{tangentX:1,tangentZ:0,normalX:0,normalZ:-1}, spatialTopologyHostId:'a:n',
  },
  {
    id:'door:a:hard', role:'connector-adjacent-zone', entityId:'building:a', connectorId:'door:a',
    transform:{x:0,y:0,z:-3,rotY:0}, decorationMayIntrude:false,
  },
  {
    id:'door:a:left', role:'portal-flank-ground-zone', entityId:'building:a', hostId:'building:a', surfaceId:'a:n', side:'north',
    connectorId:'door:a', apertureId:'door:a:aperture:0', reservationIds:['door:a:sweep'], spatialTopologyHostId:'door:a',
    transform:{x:-1.25,y:0,z:-3.24,rotY:0}, clearanceBudget:{width:0.75,depth:0.8,height:2}, decorationMayIntrude:true,
    surfaceFrame:{tangentX:1,tangentZ:0,normalX:0,normalZ:-1},
  },
  {
    id:'a:roof', role:'roof-utility-zone', entityId:'building:a', hostId:'building:a',
    transform:{x:0,y:9.45,z:0,rotY:0}, bounds:{x:0,z:0,halfX:3.65,halfZ:2.65,y:9.45}, decorationMayIntrude:true,
  },
];
const payload = {
  ownerId:'fixture:semantic-field',
  semanticContext:{ opportunities, surfaces:[{id:'a:n',entityId:'building:a',half:4,yMin:0,yMax:9.45}] },
};
const chunk={key:'0,0',seed:0x1234abcd};
const first=planExteriorPropField({chunk,payload});
const second=planExteriorPropField({chunk,payload});
assert.deepEqual(second, first, 'semantic field planning must remain deterministic');
assert.equal(first.stats.semanticAuthority, true);
assert.ok(first.stats.generated > 0);
assert.ok(first.stats.drawBuckets <= 4);
assert.ok(first.stats.facadeMacroAssemblies >= 1, 'large facade opportunities should still create readable macro assemblies');
assert.ok(first.stats.roofMechanicalAssemblies >= 1, 'roof utility opportunities should create mechanical mass');
assert.ok(first.placements.every(item => item.semanticAuthority && item.semanticOpportunityId), 'every primitive must explain its semantic opportunity');
assert.ok(first.placements.every(item => item.semanticOpportunityId !== 'door:a:hard'), 'hard connector approach must never become decoration');
assert.ok(first.placements.some(item => item.connectorId === 'door:a' && item.apertureId === 'door:a:aperture:0'), 'portal-flank clutter should retain circulation provenance');
assert.ok(first.placements.filter(item => item.domain === 'facade-macro').every(item => item.surfaceId === 'a:n'));
console.log('PASS semantic exterior prop field', first.stats);
