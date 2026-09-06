import assert from 'node:assert/strict';
import * as THREE from '../../../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../../../kowloon-fabric-engine.js';
import { createStoreZip } from '../runtime-visual-probe.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../../../world-chunk-streamer.js';
import {
  DEFAULT_IMAGE_FILTERS,
  DEFAULT_RENDER_PASSES,
  DIAGNOSTIC_COLORS,
  applyImageFilterRGBA,
  buildColliderProxyScene,
  buildIsolatedVisualScene,
  buildTargetCatalog,
  expandBounds,
  frameCameraForBounds,
  searchTargetCatalog,
  unionBounds,
  visualFragmentForInstance,
  visualFragmentsForBounds,
} from '../visual-probe-core.js';

const worldSeed=671278205,x=0,z=0;
const scene=new THREE.Scene();
const playerPhysics={registerOwnedWorld(){return {activationState:'active'};},unregisterOwnedWorld(){return true;}};
const engine=createKowloonFabricEngine({THREE,scene,playerPhysics,directSceneAdd:scene.add.bind(scene),worldSeed,chunkSize:64,landmarkSpacingChunks:3,yieldControl:null});
const chunk={key:'0,0',x,z,centerX:0,centerZ:0,seed:deterministicChunkSeed(worldSeed,x,z),weirdness:worldWeirdnessAt(x,z,{worldSeed,startRadius:1.5,fullRadius:36,curve:1.3})};
const payload=await engine.build(chunk);
payload.root.visible=true;
const entries=[{payload,chunkKey:chunk.key}];
const catalog=buildTargetCatalog(THREE,entries);
assert.ok(catalog.length>300,`expected rich semantic/physics target catalog, got ${catalog.length}`);
assert.ok(DEFAULT_RENDER_PASSES.includes('visual-collider-overlay'));
assert.ok(DEFAULT_IMAGE_FILTERS.includes('highpass-9'));

const stairs=searchTargetCatalog(catalog,{text:'compound-stair',kind:'semantic-connector'},{limit:20});
assert.ok(stairs.length>0,'expected compound-stair semantic connector target');
const stair=stairs[0];
const stairBounds=expandBounds(stair.bounds,0.55);
const fragments=visualFragmentsForBounds(THREE,[payload.root],stairBounds);
assert.ok(fragments.length>0,'semantic stair bounds must resolve to actual runtime visual fragments');
assert.ok(fragments.some(f=>f.instanceIndices?.length),'expected at least one extracted instanced-render fragment');
const sourceInstanced=fragments.find(f=>f.instanceIndices?.length)?.object;
const sourceInstanceIndex=fragments.find(f=>f.instanceIndices?.length)?.instanceIndices?.[0];
const singleInstance=visualFragmentForInstance(THREE,sourceInstanced,sourceInstanceIndex);
assert.deepEqual(singleInstance.instanceIndices,[sourceInstanceIndex],'single-instance extraction must preserve the requested source instance index');
assert.ok(singleInstance.bounds&&singleInstance.triangleCount>0,'single-instance extraction must have finite bounds and triangles');
assert.ok(fragments.reduce((sum,f)=>sum+f.triangleCount,0)>0,'target fragments need triangles');

const isolated=buildIsolatedVisualScene(THREE,fragments,{sourceScene:scene,background:0x000000});
assert.equal(isolated.clones.length,fragments.length,'every selected fragment should become an isolated render object');
assert.ok(isolated.clones.every(clone=>clone.userData?.visualProbeSource),'isolated fragments must preserve source provenance');
const isolatedInstanced=isolated.clones.find(clone=>clone.isInstancedMesh);
assert.ok(isolatedInstanced?.userData.visualProbeSource.sourceInstanceIndices?.length,'isolated instanced geometry must preserve source instance indices');
const collider=buildColliderProxyScene(THREE,entries,stairBounds,{includeSemantic:true,background:0x000000,style:'mask'});
assert.ok(collider.records.length>0,'stair target must have collider/semantic proxy records');
assert.ok(collider.records.some(r=>r.kind==='collider-ramp'),'stair target must expose its actual ramp collider');
assert.equal(collider.materials[0].opacity,1,'mask collider material must be opaque');
assert.equal(collider.materials[0].color.getHex(),DIAGNOSTIC_COLORS.collider,'mask collider material must use the documented exact palette');
const overlay=buildColliderProxyScene(THREE,entries,stairBounds,{includeSemantic:true,background:0x000000,style:'overlay'});
assert.ok(overlay.materials.some(material=>material.transparent&&material.opacity<1),'overlay style must remain translucent');

const catwalks=searchTargetCatalog(catalog,'guarded-catwalk',{limit:20});
assert.ok(catwalks.some(t=>t.targetKind==='transport-surface'),'transport surface catalog must expose guarded-catwalk targets');

const combined=unionBounds(stair.bounds,catwalks[0]?.bounds);
const camera=frameCameraForBounds(THREE,combined,{view:'iso',aspect:16/9});
assert.ok(camera.position.toArray().every(Number.isFinite),'framed camera must be finite');

const w=8,h=8,rgba=new Uint8ClampedArray(w*h*4);
for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,v=x<4?20:230;rgba[i]=rgba[i+1]=rgba[i+2]=v;rgba[i+3]=255;}
for(const filter of DEFAULT_IMAGE_FILTERS){const out=applyImageFilterRGBA(rgba,w,h,filter);assert.equal(out.length,rgba.length,`${filter} output length`);}
const sobel=applyImageFilterRGBA(rgba,w,h,'sobel');assert.ok(Math.max(...sobel)>0,'Sobel should detect the synthetic vertical edge');
const high=applyImageFilterRGBA(rgba,w,h,'highpass-9');assert.notDeepEqual([...high],[...rgba],'high-pass must transform pixels');

const zipBlob=await createStoreZip([{name:'probe/a.txt',data:new Blob(['alpha'])},{name:'probe/b.json',data:new Blob(['{\"ok\":true}'])}]);
const zipBytes=new Uint8Array(await zipBlob.arrayBuffer());const zipView=new DataView(zipBytes.buffer,zipBytes.byteOffset,zipBytes.byteLength);
assert.equal(zipView.getUint32(0,true),0x04034b50,'ZIP must start with a local file header');
assert.equal(zipView.getUint32(zipBytes.length-22,true),0x06054b50,'ZIP must end with EOCD for no-comment store archive');

await assert.rejects(()=>createStoreZip([{name:'same.txt',data:'a'},{name:'same.txt',data:'b'}]),/duplicate ZIP entry path/,'ZIP writer must reject duplicate paths');
await assert.rejects(()=>createStoreZip([{name:'../escape.txt',data:'x'}]),/unsafe ZIP entry path/,'ZIP writer must reject traversal paths');
const exactStair=searchTargetCatalog(catalog,{id:stair.id,kind:'semantic-connector'},{limit:20});
assert.equal(exactStair.length,1,'object id queries must be exact');
assert.equal(searchTargetCatalog(catalog,{id:`${stair.id}-definitely-not-exact`,kind:'semantic-connector'},{limit:20}).length,0,'id query must not degrade to substring matching');

for(const clone of isolated.clones){clone.geometry?.dispose?.();}
for(const record of collider.records){record.mesh.geometry?.dispose?.();record.mesh.material?.dispose?.();}
for(const record of overlay.records){record.mesh.geometry?.dispose?.();record.mesh.material?.dispose?.();}
engine.disposeShared?.();
console.log(JSON.stringify({pass:true,catalogTargets:catalog.length,stairMatches:stairs.length,stairFragments:fragments.length,stairTriangles:fragments.reduce((sum,f)=>sum+f.triangleCount,0),stairColliderProxies:collider.records.length,catwalkMatches:catwalks.length},null,2));
