import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';
import { planSkybridgeArchitecture } from '../world/skybridge-architecture.js';
import {
  buildTargetCatalog,
  searchTargetCatalog,
  expandBounds,
  visualFragmentsForBounds,
} from '../tools/visual-harness/visual-probe-core.js';

const common = {
  id:'r2b-grammar', surfaceId:'r2b-surface', axis:'x', from:-10, to:10, fixedCoord:3,
  y:18, width:1.2, family:'simple-guarded', widthClass:'local', stableKey:'r2b-grammar', field:'ceiling',
};
const generic = planSkybridgeArchitecture({...common, variant:'guarded-catwalk'});
const hanging = planSkybridgeArchitecture({...common, variant:'hanging-bridge'});
assert.equal(generic.structuralGrammar,'family-native-v1');
assert.equal(generic.variantParts,0);
assert.equal(hanging.bridgeVariant,'hanging-bridge');
assert.equal(hanging.structuralGrammar,'suspended-catenary-v1');
assert.ok(hanging.variantParts>=10,'hanging bridge needs a substantial variant-owned structure');
assert.ok(hanging.parts>generic.parts,'hanging bridge must be structurally more than a generic guarded catwalk');
assert.ok(hanging.metal.some(part=>part.architectureRole==='hanging-suspension-cable'&&part.structuralRole==='tension-cable'));
assert.ok(hanging.metal.some(part=>part.architectureRole==='hanging-vertical-hanger'&&part.structuralRole==='tension-hanger'));
assert.ok(!generic.metal.some(part=>String(part.architectureRole??'').startsWith('hanging-')),'generic catwalk may not inherit hanging grammar');

const worldSeed=671278205,x=8,z=8,chunkSize=64;
const scene=new THREE.Scene();
const playerPhysics={registerOwnedWorld(){return {activationState:'active'};},unregisterOwnedWorld(){return true;}};
const engine=createKowloonFabricEngine({THREE,scene,playerPhysics,directSceneAdd:scene.add.bind(scene),worldSeed,chunkSize,landmarkSpacingChunks:3,yieldControl:null});
const chunk={key:`${x},${z}`,x,z,centerX:x*chunkSize,centerZ:z*chunkSize,seed:deterministicChunkSeed(worldSeed,x,z),weirdness:worldWeirdnessAt(x,z,{worldSeed,startRadius:1.5,fullRadius:36,curve:1.3})};
const payload=await engine.build(chunk);
const ceiling=payload.hangingLayer?.payload;
assert.ok(ceiling?.root&&ceiling?.physics,'reported hanging chunk must produce a real hanging payload');
ceiling.root.updateMatrixWorld(true);

const architecture=ceiling.physics.bridgeArchitecture??[];
const hangingRecords=architecture.filter(record=>record.bridgeVariant==='hanging-bridge');
assert.ok(hangingRecords.length>0,'reported chunk must contain hanging-bridge semantic variants');
assert.ok(hangingRecords.every(record=>record.structuralGrammar==='suspended-catenary-v1'&&record.variantParts>0),'every hanging bridge registry record must publish its distinct grammar');

let identityMeshes=0,identityEntries=0;
ceiling.root.traverse(object=>{
  const sources=object?.userData?.visualProbeInstanceSources;
  if(!(sources instanceof Map))return;
  identityMeshes++;
  identityEntries+=sources.size;
  assert.equal(object.userData.visualProbeInstanceAuthority,'exact-structural-instance-ownership-v2');
  assert.equal(Object.prototype.propertyIsEnumerable.call(object.userData,'visualProbeInstanceSources'),false,'sparse source map must stay out of ordinary userData serialization');
  for(const [index,source] of sources){
    assert.ok(Number.isInteger(index)&&index>=0&&index<object.count,'source identity index must address a live instance');
    assert.ok(source.stairOwnerId!=null||source.surfaceId!=null||source.bridgeId!=null||source.routeId!=null||source.guardSpanId!=null||source.endpointId!=null||source.thresholdAuthority!=null||source.bridgeArchitecture===true||source.shellOwnerId!=null||source.shellPieceId!=null,'only strong structural identities should be retained');
    for(const value of Object.values(source)) assert.ok(['string','number','boolean'].includes(typeof value),'identity records must stay primitive-only');
  }
});
assert.ok(identityMeshes>0&&identityEntries>20,'real hanging city should publish sparse exact visual ownership');

const entries=[{payload:ceiling,chunkKey:chunk.key}];
const catalog=buildTargetCatalog(THREE,entries);
const stair=searchTargetCatalog(catalog,{kind:'stair-assembly'},{limit:1})[0];
assert.ok(stair,'hanging chunk needs a stair assembly target');
const stairFragments=visualFragmentsForBounds(THREE,[ceiling.root],expandBounds(stair.bounds,0.55),{includeInvisible:true});
assert.ok(stairFragments.length>0,'stair ownership must resolve exact render instances without AABB fallback');
assert.ok(stairFragments.every(fragment=>fragment.selectionAuthority==='exact-structural-instance-ownership-v2'));
for(const fragment of stairFragments){
  const sources=fragment.object.userData.visualProbeInstanceSources;
  for(const index of fragment.instanceIndices) assert.equal(String(sources.get(index)?.stairOwnerId??''),stair.id,'selected stair visual instance must belong to requested stair root');
}

const stairConnector=searchTargetCatalog(catalog,{text:'compound-stair',kind:'semantic-connector'},{limit:1})[0];
assert.equal(String(stairConnector?.raw?.metadata?.stairOwnerId??''),stair.id,'semantic stair connector must point at the exact visual stair owner');
const stairConnectorFragments=visualFragmentsForBounds(THREE,[ceiling.root],expandBounds(stairConnector.bounds,0.55),{includeInvisible:true});
assert.ok(stairConnectorFragments.length>0,'semantic stair connector must resolve strict owned visuals through metadata');

const bridgeConnector=searchTargetCatalog(catalog,{text:'hanging-bridge',kind:'semantic-connector'},{limit:1})[0];
assert.ok(bridgeConnector?.raw?.metadata?.bridgeId&&bridgeConnector?.raw?.metadata?.surfaceId,'semantic bridge connector must publish visual ownership metadata');
const bridgeConnectorFragments=visualFragmentsForBounds(THREE,[ceiling.root],expandBounds(bridgeConnector.bounds,0.55),{includeInvisible:true});
assert.ok(bridgeConnectorFragments.length>0,'semantic bridge connector must resolve strict owned visuals through its surface');

const bridgeSurface=searchTargetCatalog(catalog,{text:'hanging-bridge',kind:'transport-surface'},{limit:1})[0];
assert.ok(bridgeSurface?.raw?.bridgeId,'hanging transport surface needs bridge ownership');
const bridgeFragments=visualFragmentsForBounds(THREE,[ceiling.root],expandBounds(bridgeSurface.bounds,0.55),{includeInvisible:true});
assert.ok(bridgeFragments.length>0,'hanging bridge ownership must resolve exact render instances');
for(const fragment of bridgeFragments){
  const sources=fragment.object.userData.visualProbeInstanceSources;
  for(const index of fragment.instanceIndices) assert.equal(String(sources.get(index)?.bridgeId??''),String(bridgeSurface.raw.bridgeId),'selected bridge visual instance must belong to requested bridge');
}

for(const [sampleX,sampleZ] of [[-9,4],[10,-7]]){
  const sampleChunk={key:`${sampleX},${sampleZ}`,x:sampleX,z:sampleZ,centerX:sampleX*chunkSize,centerZ:sampleZ*chunkSize,seed:deterministicChunkSeed(worldSeed,sampleX,sampleZ),weirdness:worldWeirdnessAt(sampleX,sampleZ,{worldSeed,startRadius:1.5,fullRadius:36,curve:1.3})};
  const samplePayload=await engine.build(sampleChunk);
  const sampleArchitecture=samplePayload.hangingLayer?.payload?.physics?.bridgeArchitecture??[];
  const sampleHanging=sampleArchitecture.filter(record=>record.bridgeVariant==='hanging-bridge');
  assert.ok(sampleHanging.length>0,`${sampleChunk.key}: reported hanging-city sample needs hanging bridges`);
  assert.ok(sampleHanging.every(record=>record.structuralGrammar==='suspended-catenary-v1'&&record.variantParts>0),`${sampleChunk.key}: all hanging bridges need variant-owned structure`);
}

// The current REAL CITY runtime continues to call visualFragmentsForBounds().
// Ownership selectors ride non-enumerably on catalog bounds, through union/expand,
// so existing runtime captureTarget() automatically takes exact ownership first
// and falls back to geometric neighborhood only when no owner mapping exists.
assert.ok(stairFragments.every(fragment=>fragment.selectionAuthority==='exact-structural-instance-ownership-v2'),'runtime bounds selection must become strict visual ownership for stairs');
assert.ok(stairConnectorFragments.every(fragment=>fragment.selectionAuthority==='exact-structural-instance-ownership-v2'),'semantic stair selection must become strict visual ownership');
assert.ok(bridgeConnectorFragments.every(fragment=>fragment.selectionAuthority==='exact-structural-instance-ownership-v2'),'semantic bridge selection must become strict visual ownership');
assert.ok(bridgeFragments.every(fragment=>fragment.selectionAuthority==='exact-structural-instance-ownership-v2'),'transport surface selection must become strict visual ownership');

engine.disposeShared?.();
console.log('[geometry-r2b-live-visual-selftest] PASS',{
  chunk:chunk.key,
  hangingBridges:hangingRecords.length,
  identityMeshes,
  identityEntries,
  stairOwnedFragments:stairFragments.length,
  stairConnectorOwnedFragments:stairConnectorFragments.length,
  bridgeOwnedFragments:bridgeFragments.length,
  bridgeConnectorOwnedFragments:bridgeConnectorFragments.length,
});
