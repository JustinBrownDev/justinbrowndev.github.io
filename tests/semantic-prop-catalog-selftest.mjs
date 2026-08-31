import assert from 'node:assert/strict';
import { compileSemanticContextMultiplier, selectSemanticContextAsset } from '../world/semantic-context-multiplier.js';

const assets = [
  { id:'wall-camera',file:'a.glb',mount:'wall',kind:'security_camera',collision:'none',dimensionsXYZ:[0.4,0.4,0.2],programs:['office'],semanticGraph:{roles:['semantic-prop']} },
  { id:'weird-floor-object',file:'b.glb',mount:'ground',kind:'weird_floor_object',collision:'none',dimensionsXYZ:[0.8,0.9,0.7],programs:[],semanticGraph:{roles:['semantic-prop']} },
  { id:'another-strange-object',file:'c.glb',mount:'ground',kind:'another_strange_object',collision:'none',dimensionsXYZ:[0.5,1.1,0.5],programs:[],semanticGraph:{roles:['semantic-prop']} },
  { id:'rooftop/odd_machine',file:'d.glb',mount:'ground',kind:'rooftop_vent_machine',collision:'none',dimensionsXYZ:[1.2,1.0,1.1],programs:[],semanticGraph:{roles:['semantic-prop']} },
  { id:'colliding-machine',file:'e.glb',mount:'ground',kind:'vending_machine',collision:'box',dimensionsXYZ:[1,1,1],programs:[],semanticGraph:{roles:['semantic-prop']} },
];
const opportunities=[
  {id:'wall',role:'wall-mounted-prop-zone',entityId:'b',hostId:'b',contextId:'ctx',transform:{x:0,y:2,z:0,rotY:0},clearanceBudget:{width:1,height:1.4}},
  {id:'ground1',role:'ground-edge-zone',entityId:'b',hostId:'b',contextId:'ctx',transform:{x:1,y:0,z:0,rotY:0},clearanceBudget:{width:1.2,height:1.5,depth:1.2}},
  {id:'ground2',role:'portal-flank-ground-zone',entityId:'b',hostId:'b',contextId:'ctx',transform:{x:2,y:0,z:0,rotY:0},clearanceBudget:{width:1.2,height:1.5,depth:1.2}},
  {id:'roof',role:'roof-utility-zone',entityId:'b',hostId:'b',contextId:'ctx',transform:{x:0,y:8,z:0,rotY:0},clearanceBudget:{width:2,depth:2}},
];
const payload={entities:[{id:'b',kind:'building'}],semanticContext:{entities:[{id:'ctx',entityId:'b',program:'mixed'}],spaces:[],surfaces:[{id:'s',entityId:'b',half:4,yMin:0,yMax:8}],opportunities}};
const chunk={key:'0,0'};
const disabled=compileSemanticContextMultiplier({chunk,payload,assets});
assert.equal(disabled.tasks.length,0);
assert.ok(disabled.stats.contextualEligible>=5,'ordinary ground assets and collider-bearing macro candidates should remain exposed to selection');
assert.ok(disabled.stats.colliderBearingContextual>=1,'collider-bearing contextual candidates must be counted rather than erased');
assert.equal(disabled.stats.precommitOnlyBecauseCollider,0,'collider-bearing assets are no longer globally excluded from visual planning');
assert.equal(disabled.stats.catalogSearchDepth,undefined,'no selection scan is needed until a planner request exists');
assert.ok(disabled.stats.coverageRatio>=0.6);
const requests=opportunities.map(opportunity=>({opportunity,semanticFamily:'any',desiredScaleClass:'medium',priorityTier:'medium'}));
const result=compileSemanticContextMultiplier({chunk,payload,assets,requests});
assert.equal(result.stats.catalogSearchDepth,768,'requested selection should inspect a broad rotating corpus slice');
assert.ok(result.tasks.some(t=>t.assetId==='weird-floor-object'||t.assetId==='another-strange-object'),'generic eligible ground corpus must actually participate when requested');
assert.ok(result.tasks.every(t=>t.assetId!=='colliding-machine'),'medium requests must not acquire deferred collider-bearing assets');
assert.ok(result.tasks.every(t=>t.semanticOpportunityId));

const macroOpportunity={id:'macro-ground',role:'ground-open-zone',entityId:'b',hostId:'b',contextId:'ctx',transform:{x:3,y:0,z:0,rotY:0},clearanceBudget:{width:1.3,height:1.5,depth:1.3}};
const macroOnly=selectSemanticContextAsset({
  chunk,
  payload:{...payload,semanticContext:{...payload.semanticContext,opportunities:[macroOpportunity]}},
  assets:[assets[4]],
  opportunity:macroOpportunity,
  request:{semanticFamily:'any',desiredScaleClass:'large',priorityTier:'macro'},
});
assert.equal(macroOnly?.assetId,'colliding-machine','an explicit macro visual request may use a collider-bearing corpus asset');
assert.equal(macroOnly?.semanticCollisionDeferred,true);
assert.equal(macroOnly?.semanticCollisionProxy?.activation,'deferred');
console.log('PASS semantic prop catalog request coverage',result.stats);
