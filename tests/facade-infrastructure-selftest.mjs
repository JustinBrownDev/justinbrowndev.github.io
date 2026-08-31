import assert from 'node:assert/strict';
import { planExteriorPropField } from '../world/exterior-prop-field.js';

const opportunities=[];
for(let i=0;i<10;i++) opportunities.push({
  id:`facade:service:${i}`, role:'facade-service-band', entityId:'b:a', hostId:'b:a', surfaceId:'b:a:n', side:'north',
  transform:{x:-4+i*0.9,y:2.2+(i%4)*2.1,z:-4.05,rotY:0}, clearanceBudget:{width:1.4,height:2.0}, decorationMayIntrude:true,
  surfaceFrame:{tangentX:1,tangentZ:0,normalX:0,normalZ:-1}, spatialTopologyHostId:'b:a:n',
});
opportunities.push({
  id:'facade:macro', role:'facade-sign-zone', entityId:'b:a', hostId:'b:a', surfaceId:'b:a:n', side:'north',
  transform:{x:0,y:8.8,z:-4.05,rotY:0}, clearanceBudget:{width:6.0,height:2.5}, decorationMayIntrude:true,
  surfaceFrame:{tangentX:1,tangentZ:0,normalX:0,normalZ:-1}, spatialTopologyHostId:'b:a:n',
});
opportunities.push({
  id:'portal:lintel', role:'portal-lintel-zone', entityId:'b:a', hostId:'b:a', surfaceId:'b:a:n', side:'north',
  connectorId:'door', apertureId:'door:aperture:0', reservationIds:['door:sweep'], spatialTopologyHostId:'door',
  transform:{x:0,y:2.7,z:-4.05,rotY:0}, clearanceBudget:{width:1.8,height:0.7}, decorationMayIntrude:true,
  surfaceFrame:{tangentX:1,tangentZ:0,normalX:0,normalZ:-1},
});
const payload={semanticContext:{opportunities,surfaces:[{id:'b:a:n',entityId:'b:a',half:5,yMin:0,yMax:12.6}],spatialTopology:{reservations:[]}}};
const chunk={key:'3,-2'};
const disabled=planExteriorPropField({chunk,payload});
assert.equal(disabled.placements.length,0,'opportunity count alone must never populate the facade');
const requests=[
  {opportunityId:'facade:service:3',semanticFamily:'vertical-mechanical',desiredScaleClass:'large',priorityTier:'macro'},
  {opportunityId:'facade:macro',semanticFamily:'signage',desiredScaleClass:'large',priorityTier:'identity'},
  {opportunityId:'portal:lintel',semanticFamily:'security-hardware',desiredScaleClass:'medium',priorityTier:'medium'},
];
const a=planExteriorPropField({chunk,payload,requests});
const b=planExteriorPropField({chunk,payload,requests});
assert.deepEqual(a,b);
const facade=a.placements.filter(p=>p.domain.startsWith('facade')||p.domain==='portal-hardware');
const macro=a.placements.filter(p=>p.domain==='facade-macro');
assert.ok(facade.length>=5,`three planner requests should realize composed assemblies, got ${facade.length}`);
assert.ok(macro.length>=3,`large mechanical request should be multi-part, got ${macro.length}`);
assert.ok(macro.some(p=>Math.max(p.sx,p.sy,p.sz)>=1.4));
assert.ok(facade.every(p=>p.semanticOpportunityId));
assert.ok(a.stats.opportunitiesConsumed<=requests.length);
console.log('PASS semantic facade request realization',a.stats);
