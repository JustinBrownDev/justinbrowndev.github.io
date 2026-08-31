import assert from 'node:assert/strict';
import { planExteriorPropField, planExteriorPropFieldRequest } from '../world/exterior-prop-field.js';

const opportunities = [
  { id:'a:n:service', role:'facade-service-band', entityId:'building:a', hostId:'building:a', surfaceId:'a:n', side:'north', transform:{x:2.3,y:4.2,z:-3.05,rotY:0}, clearanceBudget:{width:3.2,height:6.0}, decorationMayIntrude:true, surfaceFrame:{tangentX:1,tangentZ:0,normalX:0,normalZ:-1}, spatialTopologyHostId:'a:n' },
  { id:'a:n:sign', role:'facade-sign-zone', entityId:'building:a', hostId:'building:a', surfaceId:'a:n', side:'north', transform:{x:-2.2,y:3.5,z:-3.04,rotY:0}, clearanceBudget:{width:4.2,height:2.2}, decorationMayIntrude:true, surfaceFrame:{tangentX:1,tangentZ:0,normalX:0,normalZ:-1}, spatialTopologyHostId:'a:n' },
  { id:'door:a:hard', role:'connector-adjacent-zone', entityId:'building:a', connectorId:'door:a', transform:{x:0,y:0,z:-3,rotY:0}, decorationMayIntrude:false },
  { id:'door:a:left', role:'portal-flank-ground-zone', entityId:'building:a', hostId:'building:a', surfaceId:'a:n', side:'north', connectorId:'door:a', apertureId:'door:a:aperture:0', reservationIds:['door:a:sweep'], spatialTopologyHostId:'door:a', transform:{x:-1.25,y:0,z:-3.24,rotY:0}, clearanceBudget:{width:0.75,depth:0.8,height:2}, decorationMayIntrude:true, surfaceFrame:{tangentX:1,tangentZ:0,normalX:0,normalZ:-1} },
  { id:'a:roof', role:'roof-utility-zone', entityId:'building:a', hostId:'building:a', transform:{x:0,y:9.45,z:0,rotY:0}, bounds:{x:0,z:0,halfX:3.65,halfZ:2.65,y:9.45}, decorationMayIntrude:true },
];
const payload = { ownerId:'fixture:semantic-field', semanticContext:{ opportunities, surfaces:[{id:'a:n',entityId:'building:a',half:4,yMin:0,yMax:9.45}], spatialTopology:{reservations:[]} } };
const chunk={key:'0,0',seed:0x1234abcd};

const disabled = planExteriorPropField({chunk,payload});
assert.equal(disabled.placements.length, 0);
assert.equal(disabled.stats.automaticPopulationDisabled, true);

const requests = [
  {opportunityId:'a:n:service',semanticFamily:'vertical-mechanical',desiredScaleClass:'large',priorityTier:'macro'},
  {opportunityId:'a:n:sign',semanticFamily:'signage',desiredScaleClass:'large',priorityTier:'identity'},
  {opportunityId:'door:a:left',semanticFamily:'street-service',desiredScaleClass:'medium',priorityTier:'medium'},
  {opportunityId:'a:roof',semanticFamily:'roof-mechanical',desiredScaleClass:'large',priorityTier:'macro'},
];
const first=planExteriorPropField({chunk,payload,requests});
const second=planExteriorPropField({chunk,payload,requests});
assert.deepEqual(second, first, 'request realization must remain deterministic');
assert.ok(first.stats.generated > 0);
assert.ok(first.placements.every(item => item.semanticAuthority && item.semanticOpportunityId));
assert.ok(first.placements.every(item => item.semanticOpportunityId !== 'door:a:hard'));
assert.ok(first.placements.some(item => item.connectorId === 'door:a' && item.apertureId === 'door:a:aperture:0'));
const facadeMacro = first.placements.filter(item => item.domain === 'facade-macro');
assert.ok(facadeMacro.length >= 3 && facadeMacro.some(item => Math.max(item.sx,item.sy,item.sz) >= 2), 'one explicit macro request should realize one large multi-part facade assembly');
const roofMacro = first.placements.filter(item => item.domain === 'roof-mechanical-macro');
assert.ok(roofMacro.length >= 3 && roofMacro.some(item => Math.max(item.sx,item.sy,item.sz) >= 2), 'one explicit roof request should realize a large HVAC cluster');
const one = planExteriorPropFieldRequest({chunk,payload,opportunity:opportunities[0],request:requests[0]});
assert.ok(one?.placements?.length >= 3);
console.log('PASS semantic exterior prop field request service', first.stats);
