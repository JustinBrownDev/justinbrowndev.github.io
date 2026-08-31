import assert from 'node:assert/strict';
import { solveSemanticLayout } from '../world/semantic-layout.js';
import { classifyPhysicalUse, programCompatibleWithPhysicalUse } from '../world/physical-use.js';

const physicalUse=classifyPhysicalUse({morphology:'service-tenement',stableKey:'svc',override:'industrial-service'});
const entity={id:'e',siteId:'s',semanticSiteKey:'s',floorH:3.5,physicalUse,physicalTruth:{schema:'jweb.physical-truth.v1'},footprintModules:[{key:'m',floors:1,cx:0,cz:0,halfX:3,halfZ:3}]};
const payload={entities:[entity],physics:{props:[],semanticConnectors:[],circulationReservations:[]},semanticPlacements:[],semanticSpaces:[],detailReservations:[]};
const assets=new Map();
for (const [id,importance] of [['auto-id','identity'],['auto-fn','functional'],['auto-life','narrative']]) assets.set(id,{id,programs:['auto_shop'],importance,dimensionsXYZ:[.4,.4,.4]});
assets.set('motel-id',{id:'motel-id',programs:['motel_room'],importance:'identity',dimensionsXYZ:[.4,.4,.4]});
assets.set('motel-fn',{id:'motel-fn',programs:['motel_room'],importance:'functional',dimensionsXYZ:[.4,.4,.4]});
assets.set('motel-life',{id:'motel-life',programs:['motel_room'],importance:'narrative',dimensionsXYZ:[.4,.4,.4]});
const tasks=[
 {kind:'semantic-identity',entityId:'e',moduleKey:'m',floor:0,program:'motel_room',assetId:'motel-id',seed:1},
 {kind:'semantic-functional',entityId:'e',moduleKey:'m',floor:0,program:'motel_room',assetId:'motel-fn',seed:2},
 {kind:'semantic-life',entityId:'e',moduleKey:'m',floor:0,program:'motel_room',assetId:'motel-life',seed:3},
];
const result=solveSemanticLayout({chunk:{key:'0,0'},payload,tasks,assetById:assets});
assert.equal(result.destinationCompatibility.remappedSpaces,1);
assert.equal(result.destinationCompatibility.rejectedTasks,0);
assert.ok(tasks.every(t=>programCompatibleWithPhysicalUse(t.program,physicalUse)));
assert.ok(tasks.every(t=>t.requestedProgram==='motel_room'));
assert.ok(payload.semanticSpaces.every(s=>programCompatibleWithPhysicalUse(s.program,physicalUse)));
console.log('PASS destination physical-use compatibility', result.destinationCompatibility, tasks.map(t=>t.program));
