import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../../vendor/three/three.module.js';
import { buildGeometryHarnessFixture } from '../geometry-fixture-adapter.js';
import {
  buildColliderProxyScene,
  buildTargetCatalog,
  searchTargetCatalog,
  visualFragmentsForObjects,
} from '../visual-probe-core.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../../..');
const readSpec=name=>JSON.parse(fs.readFileSync(path.join(repo,'tools/geometry-harness/specs',`${name}.json`),'utf8'));

const stairSpec=readSpec('apartment-stair');
const stair=await buildGeometryHarnessFixture(THREE,stairSpec);
const stairEntries=[{payload:stair.payload,chunkKey:'fixture:apartment-stair'}];
const catalog=buildTargetCatalog(THREE,stairEntries);

const exactStep=stair.targets.find(t=>t.id==='flight-low:step:4');
assert.ok(exactStep,'fixture adapter must expose individual stair treads');
assert.equal(exactStep.visualObjects.length,1,'one authored tread should map to one exact visual object');
assert.equal(exactStep.colliderObjects.length,0,'visual tread must not masquerade as collider geometry');
const stepFragments=visualFragmentsForObjects(THREE,exactStep.visualObjects);
assert.equal(stepFragments.length,1,'exact tread selection must remain surgical');
assert.equal(stepFragments[0].triangleCount,12,'box tread should retain exact box triangles');

const ramp=stair.targets.find(t=>t.id==='flight-low:collider-ramp');
assert.ok(ramp,'fixture adapter must expose the semantic flight collider independently');
assert.equal(ramp.visualObjects.length,0);
assert.equal(ramp.colliderObjects.length,1);
const rampProxy=buildColliderProxyScene(THREE,stairEntries,ramp.bounds,{exactObjects:ramp.colliderObjects});
assert.equal(rampProxy.records.length,1,'exact collider selection must not drag adjacent rails/platforms into the image');
assert.equal(rampProxy.records[0].kind,'exact-collider-mesh');

const flight=stair.targets.find(t=>t.targetKind==='fixture-element'&&t.id==='flight-low');
assert.ok(flight?.visualObjects.length>10,'whole-flight target must retain its authored visual components');
assert.ok(flight?.colliderObjects.length>=1,'whole-flight target must retain its authored collider components');
assert.ok(stair.targets.some(t=>t.id==='flight-low:handrail:left'),'handrail must be directly selectable');
assert.ok(stair.targets.some(t=>t.id==='flight-high:handrail:right'),'both flights must preserve handrail identity');
assert.equal(searchTargetCatalog(catalog,{id:'flight-low:step:4',kind:'fixture-component'},{limit:10}).length,1);

const forkSpec=readSpec('fork');
const fork=await buildGeometryHarnessFixture(THREE,forkSpec,{resolveObjText:async rel=>fs.readFileSync(path.resolve(repo,'tools/geometry-harness/specs',rel),'utf8')});
for(const name of ['model:fork-body','model:tine-1','model:tine-2','model:tine-3','model:tine-4']){
  const target=fork.targets.find(t=>t.id===name);assert.ok(target,`OBJ group ${name} must remain independently selectable`);assert.equal(target.visualObjects.length,1);assert.equal(target.colliderObjects.length,1);
}

console.log(JSON.stringify({
  pass:true,
  stairTargets:stair.targets.length,
  stairCatalog:catalog.length,
  lowFlightVisualObjects:flight.visualObjects.length,
  lowFlightColliderObjects:flight.colliderObjects.length,
  forkTargets:fork.targets.length,
  exactStepTriangles:stepFragments[0].triangleCount,
},null,2));
