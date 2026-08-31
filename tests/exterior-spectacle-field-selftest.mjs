import assert from 'node:assert/strict';
import { planExteriorPropField } from '../world/exterior-prop-field.js';

const northSegment = { surfaceId:'hero:north',side:'north',surfaceFrame:{tangentX:1,tangentZ:0,normalX:0,normalZ:-1},transform:{x:0,y:5,z:-4.05,rotY:0},width:7.2,height:5.2 };
const eastSegment = { surfaceId:'hero:east',side:'east',surfaceFrame:{tangentX:0,tangentZ:1,normalX:1,normalZ:0},transform:{x:4.05,y:5,z:0,rotY:-Math.PI*0.5},width:6.6,height:5.2 };
const opportunities = [
  {id:'hero:corner-media',role:'corner-media-band',entityId:'hero',hostId:'hero',segments:[northSegment,eastSegment],transform:{x:2,y:5,z:-2,rotY:0},clearanceBudget:{width:13.8,height:5.2},decorationMayIntrude:true},
  {id:'hero:north:tiny',role:'wall-mounted-prop-zone',entityId:'hero',hostId:'hero',surfaceId:'hero:north',side:'north',surfaceFrame:northSegment.surfaceFrame,transform:{x:1,y:3,z:-4.05,rotY:0},clearanceBudget:{width:1.1,height:1.2},decorationMayIntrude:true},
  {id:'quiet:sign',role:'facade-sign-zone',entityId:'quiet',hostId:'quiet',surfaceId:'quiet:north',side:'north',surfaceFrame:northSegment.surfaceFrame,transform:{x:14,y:3.4,z:-3.05,rotY:0},clearanceBudget:{width:4.5,height:2.4},decorationMayIntrude:true},
  {id:'roof:hero',role:'roof-spectacle-envelope',entityId:'roof-hero',hostId:'roof-hero',transform:{x:24,y:12,z:0,rotY:0},bounds:{x:24,y:12,z:0,halfX:5,halfZ:3.5},clearanceBudget:{width:10,depth:7,height:5},decorationMayIntrude:true},
];
const payload={ownerId:'fixture:spectacle-field',semanticContext:{opportunities,surfaces:[],spatialTopology:{reservations:[]}}};
const chunk={key:'0,0',seed:0x1234abcd};
assert.equal(planExteriorPropField({chunk,payload}).placements.length,0,'spectacle hosts are still candidate opportunities until requested');
const requests=[
  {opportunityId:'hero:corner-media',semanticFamily:'media-spectacle',desiredScaleClass:'spectacle',priorityTier:'spectacle'},
  {opportunityId:'roof:hero',semanticFamily:'media-spectacle',desiredScaleClass:'spectacle',priorityTier:'spectacle'},
  {opportunityId:'quiet:sign',semanticFamily:'signage',desiredScaleClass:'large',priorityTier:'identity'},
];
const first=planExteriorPropField({chunk,payload,requests});
const second=planExteriorPropField({chunk,payload,requests});
assert.deepEqual(second,first);
const spectacle=first.placements.filter(item=>item.visualTier==='spectacle');
assert.ok(spectacle.length>=4);
assert.ok(spectacle.some(item=>item.assemblyKind==='corner-megascreen'));
assert.ok(spectacle.some(item=>item.domain==='roof-spectacle'));
assert.ok(spectacle.some(item=>Math.max(item.sx,item.sy,item.sz)>=5));
assert.equal(first.placements.some(item=>item.semanticOpportunityId==='hero:north:tiny'),false,'unrequested micro anchor stays empty');
assert.ok(first.placements.some(item=>item.semanticOpportunityId==='quiet:sign'));
console.log('[exterior-spectacle-field-selftest] PASS', first.stats);
