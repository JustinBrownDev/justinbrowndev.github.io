import assert from 'node:assert/strict';
import {
  bindSemanticExteriorPlacement,
  chooseSemanticExteriorOpportunity,
  requiresSemanticExteriorPlacement,
  semanticPlacementPoint,
} from '../world/semantic-exterior-authority.js';
import { planExteriorPropField } from '../world/exterior-prop-field.js';

const opportunities = [
  {
    id:'surface:north:sign:0', role:'facade-sign-zone', entityId:'b:a', hostId:'b:a', surfaceId:'surface:north', side:'north',
    transform:{x:0,y:3,z:-4,rotY:0}, clearanceBudget:{width:4.8,height:2.2}, decorationMayIntrude:true,
    surfaceFrame:{tangentX:1,tangentZ:0,normalX:0,normalZ:-1}, spatialTopologyHostId:'surface:north',
  },
  {
    id:'door:a:lintel', role:'portal-lintel-zone', entityId:'b:a', hostId:'b:a', surfaceId:'surface:north', side:'north',
    connectorId:'door:a', apertureId:'door:a:aperture:0', reservationIds:['door:a:sweep'],
    transform:{x:0,y:2.65,z:-4.04,rotY:0}, clearanceBudget:{width:1.6,height:0.7}, decorationMayIntrude:true,
    surfaceFrame:{tangentX:1,tangentZ:0,normalX:0,normalZ:-1}, spatialTopologyHostId:'door:a',
  },
  {
    id:'door:a:portal', role:'connector-adjacent-zone', entityId:'b:a', connectorId:'door:a',
    transform:{x:0,y:0,z:-4,rotY:0}, decorationMayIntrude:false,
  },
  {
    id:'door:a:left-ground', role:'portal-flank-ground-zone', entityId:'b:a', hostId:'b:a', surfaceId:'surface:north', side:'north',
    connectorId:'door:a', apertureId:'door:a:aperture:0', reservationIds:['door:a:sweep'],
    transform:{x:-1.25,y:0,z:-4.22,rotY:0}, clearanceBudget:{width:0.8,depth:0.8,height:2}, decorationMayIntrude:true,
    surfaceFrame:{tangentX:1,tangentZ:0,normalX:0,normalZ:-1}, spatialTopologyHostId:'door:a',
  },
  {
    id:'surface:north:service', role:'facade-service-band', entityId:'b:a', hostId:'b:a', surfaceId:'surface:north', side:'north',
    transform:{x:2.5,y:4,z:-4.05,rotY:0}, clearanceBudget:{width:2.5,height:6}, decorationMayIntrude:true,
    surfaceFrame:{tangentX:1,tangentZ:0,normalX:0,normalZ:-1}, spatialTopologyHostId:'surface:north',
  },
  {
    id:'roof:a', role:'roof-utility-zone', entityId:'b:a', hostId:'b:a',
    transform:{x:0,y:9.45,z:0,rotY:0}, bounds:{x:0,z:0,halfX:3.5,halfZ:2.5,y:9.45}, decorationMayIntrude:true,
  },
];

const sign = {kind:'sign',entityId:'b:a',side:'north',seed:101};
const signOpportunity = chooseSemanticExteriorOpportunity(sign, opportunities);
assert.equal(signOpportunity.role, 'facade-sign-zone', 'ordinary signs should use free facade bands before consuming portal lintels');
bindSemanticExteriorPlacement(sign, signOpportunity);
assert.equal(sign.semanticPlacement.surfaceId, 'surface:north');
assert.equal(semanticPlacementPoint(sign).y, 3);

const security = {kind:'security',entityId:'b:a',side:'north',seed:111};
const securityOpportunity = chooseSemanticExteriorOpportunity(security, opportunities);
assert.equal(securityOpportunity.role, 'portal-lintel-zone');
bindSemanticExteriorPlacement(security, securityOpportunity);
assert.equal(security.semanticPlacement.connectorId, 'door:a');

const fixture = {kind:'street-fixture',entityId:'b:a',side:'north',seed:202};
const fixtureOpportunity = chooseSemanticExteriorOpportunity(fixture, opportunities);
assert.equal(fixtureOpportunity.role, 'portal-flank-ground-zone');
bindSemanticExteriorPlacement(fixture, fixtureOpportunity);
assert.deepEqual(fixture.semanticPlacement.reservationIds, ['door:a:sweep']);
assert.equal(requiresSemanticExteriorPlacement(fixture), true);
assert.throws(() => semanticPlacementPoint({kind:'pipe'}), /without authoritative placement/);

const payload = {
  semanticContext:{
    opportunities,
    surfaces:[{id:'surface:north',half:4,yMin:0,yMax:9.45}],
  },
};
const requests = [
  {opportunityId:'surface:north:service',semanticFamily:'vertical-mechanical',desiredScaleClass:'large',priorityTier:'macro'},
  {opportunityId:'door:a:left-ground',semanticFamily:'street-service',desiredScaleClass:'medium',priorityTier:'medium'},
  {opportunityId:'roof:a',semanticFamily:'roof-mechanical',desiredScaleClass:'large',priorityTier:'macro'},
];
const planA = planExteriorPropField({chunk:{key:'0,0'},payload,requests});
const planB = planExteriorPropField({chunk:{key:'0,0'},payload,requests});
assert.deepEqual(planB, planA, 'semantic exterior field must remain deterministic');
assert.equal(planA.stats.semanticAuthority, true);
assert.ok(planA.placements.length > 0);
assert.ok(planA.placements.every(item => item.semanticAuthority && item.semanticOpportunityId), 'every field primitive needs semantic provenance');
assert.ok(planA.placements.every(item => item.semanticOpportunityId !== 'door:a:portal'), 'hard portal opportunity must never be decorated');
assert.ok(planA.placements.some(item => item.connectorId === 'door:a'), 'portal complement should carry connector provenance into realized clutter');
assert.ok(planA.stats.drawBuckets <= 4);
console.log('PASS semantic exterior authority', planA.stats);
