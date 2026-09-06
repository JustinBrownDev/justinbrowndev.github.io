import assert from 'node:assert/strict';
import { planSkybridgeArchitecture } from '../world/skybridge-architecture.js';
import { planFacadeRouteGallery } from '../world/facade-route-gallery.js';

for(const family of ['box-girder','suspension-hanger','ramshackle-brace']){
  const plan=planSkybridgeArchitecture({id:`21w:${family}`,axis:'x',from:-12,to:12,fixedCoord:0,y:14,width:2.3,widthClass:'collector',family,stableKey:`21w:${family}`});
  assert.equal(plan.family,family);
  assert.equal(plan.traversalAuthority,'canonical-transport-slab-unchanged');
  assert.ok(plan.parts>=6,`${family}: expected real structural family`);
}
const families=new Set();
let familyParts=0;
for(let i=0;i<48;i++){
  const gallery=planFacadeRouteGallery({
    id:`21w:g:${i}`,routeId:`route:${i}`,field:i%3===0?'ground':'ceiling',width:3.4,widthClass:'sky-street',floorHeight:3.15,stableKey:`21w:g:${i}`,
    endpoint:{resolved:true,side:'north',y:12.6,tangent:0,width:1.5},
    module:{key:'m',cx:0,cz:0,halfX:10,halfZ:5},
    hostBounds:{minX:-14,maxX:14,minZ:-5,maxZ:8},
    footprintModules:[{key:'a',cx:-6,cz:0,halfX:7,halfZ:5},{key:'b',cx:7,cz:0,halfX:6,halfZ:5}],
    routeStrength:0.85,routeSpan:80,crossingWidth:1.5,junctionTangents:[0,5],
  });
  assert.ok(gallery);
  families.add(gallery.architectureFamily);
  familyParts+=gallery.familyParts;
  for(const part of [...gallery.metal,...gallery.supports].filter(part=>part.junctionYield===true && Number.isFinite(Number(part.x)))){
    for(const clearance of gallery.junctionClearances){
      if(part.architectureRole==='wall-anchor'||part.architectureRole==='upper-rack-crossbeam'||part.architectureRole==='gallery-truss-diagonal'||part.architectureRole==='underslung-bay-brace'){
        assert.ok(Math.abs(Number(part.x)-clearance.center)>clearance.half-0.05,`${gallery.architectureFamily}:${part.architectureRole} intruded junction`);
      }
    }
  }
}
assert.ok(families.size>=4,`gallery family population too narrow: ${[...families]}`);
assert.ok(familyParts>20);
console.log('[cut21w-bridge-gallery-families-selftest] PASS',{families:[...families],familyParts});
