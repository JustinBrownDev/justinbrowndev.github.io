import assert from 'node:assert/strict';
import { compileSemanticContextMultiplier } from '../world/semantic-context-multiplier.js';

const assets = [
  { id:'wall-camera',file:'a.glb',mount:'wall',collision:'none',dimensionsXYZ:[0.4,0.4,0.2],programs:['office'],semanticGraph:{roles:['semantic-prop']} },
  { id:'weird-floor-object',file:'b.glb',mount:'ground',collision:'none',dimensionsXYZ:[0.8,0.9,0.7],programs:[],semanticGraph:{roles:['semantic-prop']} },
  { id:'another-strange-object',file:'c.glb',mount:'ground',collision:'none',dimensionsXYZ:[0.5,1.1,0.5],programs:[],semanticGraph:{roles:['semantic-prop']} },
  { id:'rooftop/odd_machine',file:'d.glb',mount:'ground',collision:'none',dimensionsXYZ:[1.2,1.0,1.1],programs:[],semanticGraph:{roles:['semantic-prop']} },
  { id:'colliding-machine',file:'e.glb',mount:'ground',collision:'box',dimensionsXYZ:[1,1,1],programs:[],semanticGraph:{roles:['semantic-prop']} },
];
const opportunities=[
  {id:'wall',role:'wall-mounted-prop-zone',entityId:'b',hostId:'b',contextId:'ctx',transform:{x:0,y:2,z:0,rotY:0},clearanceBudget:{width:1,height:1.4}},
  {id:'ground1',role:'ground-edge-zone',entityId:'b',hostId:'b',contextId:'ctx',transform:{x:1,y:0,z:0,rotY:0},clearanceBudget:{width:1.2,depth:1.2}},
  {id:'ground2',role:'portal-flank-ground-zone',entityId:'b',hostId:'b',contextId:'ctx',transform:{x:2,y:0,z:0,rotY:0},clearanceBudget:{width:1.2,depth:1.2}},
  {id:'roof',role:'roof-utility-zone',entityId:'b',hostId:'b',contextId:'ctx',transform:{x:0,y:8,z:0,rotY:0},clearanceBudget:{width:2,depth:2}},
];
const payload={semanticContext:{entities:[{id:'ctx',entityId:'b',program:'mixed'}],spaces:[],surfaces:[{id:'s',entityId:'b',half:4,yMin:0,yMax:8}],opportunities}};
const result=compileSemanticContextMultiplier({chunk:{key:'0,0'},payload,assets,maxTasks:12});
assert.ok(result.stats.contextualEligible>=4,'ordinary ground assets should no longer need a name-regex blessing to join the corpus');
assert.ok(result.stats.precommitOnlyBecauseCollider>=1,'colliding assets remain explicitly staged for the future precommit switch');
assert.equal(result.stats.catalogSearchDepth,512,'catalog scan should rotate through a broad slice of the 3000+ runtime corpus');
assert.ok(result.stats.coverageRatio>=0.6,'placement metadata should expose most representative semantic assets to exterior role pools');
assert.ok(result.tasks.some(t=>t.assetId==='weird-floor-object'||t.assetId==='another-strange-object'),'generic eligible ground corpus must actually participate');
assert.ok(result.tasks.every(t=>t.semanticOpportunityId),'catalog output must still be opportunity bound');
console.log('PASS semantic prop catalog coverage',result.stats);
