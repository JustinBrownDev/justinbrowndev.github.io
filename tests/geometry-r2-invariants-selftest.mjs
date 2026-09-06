import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';
import { planSkybridgeArchitecture } from '../world/skybridge-architecture.js';
import {
  buildColliderProxyScene,
  buildTargetCatalog,
  expandBounds,
  searchTargetCatalog,
} from '../tools/visual-harness/visual-probe-core.js';

function alongExtent(part, axis) {
  if (axis === 'x') {
    const rx = Number(part.rz) || 0;
    const half = (Math.abs((Number(part.sx) || 0) * Math.cos(rx)) + Math.abs((Number(part.sy) || 0) * Math.sin(rx))) * 0.5;
    return [Number(part.x) - half, Number(part.x) + half];
  }
  const rx = Number(part.rx) || 0;
  const half = (Math.abs((Number(part.sz) || 0) * Math.cos(rx)) + Math.abs((Number(part.sy) || 0) * Math.sin(rx))) * 0.5;
  return [Number(part.z) - half, Number(part.z) + half];
}

for (const axis of ['x', 'z']) {
  const lo = -9, hi = 11;
  const plan = planSkybridgeArchitecture({
    id: `r2:${axis}`, surfaceId: `surface:${axis}`, axis, from: lo, to: hi,
    fixedCoord: 2, y: 16.2, width: 3.6, widthClass: 'sky-street',
    family: 'through-truss', stableKey: 'geometry-r2', supportModeHint: 'braced-from-below',
  });
  assert.equal(plan.attachmentAuthority, 'exterior-seat-v1');
  assert.ok(plan.endpointClearance >= 0.1, `${axis}: explicit endpoint clearance`);
  const parts = [...plan.metal, ...plan.concrete];
  assert.ok(parts.length > 20, `${axis}: expected real bridge architecture`);
  assert.ok(parts.every(part => part.surfaceId === `surface:${axis}`), `${axis}: all bridge architecture must retain exact surface ownership`);
  for (const part of parts.filter(part => part.junctionYield || part.bridgeSupport)) {
    const [a, b] = alongExtent(part, axis);
    assert.ok(a >= lo - 1e-6 && b <= hi + 1e-6, `${axis}:${part.architectureRole ?? part.structuralRole ?? 'part'} must not cross receiving facade plane (${a}, ${b})`);
  }
  const supports = parts.filter(part => part.bridgeSupport);
  assert.ok(supports.some(part => part.structuralRole === 'facade-attachment-seat'), `${axis}: explicit facade seats required`);
  assert.ok(supports.filter(part => /facade-brace/.test(String(part.structuralRole))).every(part => part.fromAttachment === 'deck-side-seat' && part.toAttachment === 'facade-seat'), `${axis}: every brace must have two explicit attachment endpoints`);
}

const worldSeed = 671278205, x = 8, z = 8, chunkSize = 64;
const scene = new THREE.Scene();
const playerPhysics = { registerOwnedWorld(){ return { activationState:'active' }; }, unregisterOwnedWorld(){ return true; } };
const engine = createKowloonFabricEngine({ THREE, scene, playerPhysics, directSceneAdd:scene.add.bind(scene), worldSeed, chunkSize, landmarkSpacingChunks:3, yieldControl:null });
const chunk = {
  key:`${x},${z}`, x, z, centerX:x*chunkSize, centerZ:z*chunkSize,
  seed:deterministicChunkSeed(worldSeed,x,z),
  weirdness:worldWeirdnessAt(x,z,{worldSeed,startRadius:1.5,fullRadius:36,curve:1.3}),
};
const payload = await engine.build(chunk);
const hanging = payload.hangingLayer?.payload;
assert.ok(hanging?.physics, 'expected full hanging payload for the reported non-spawn sample');
const ph = hanging.physics;
const bridgeArchitecture = ph.bridgeArchitecture ?? [];
assert.ok(bridgeArchitecture.length >= 5, 'reported hanging sample must retain multiple bridge families');
assert.ok(bridgeArchitecture.every(record => record.attachmentAuthority === 'exterior-seat-v1' && record.endpointClearance > 0), 'every hanging bridge must publish attachment-plane authority');
const thresholds = (ph.platforms ?? []).filter(item => item.supportKind === 'bridge-portal-threshold');
assert.equal(thresholds.length, bridgeArchitecture.length * 2, 'every bridge gets two explicit portal threshold landings');
assert.ok(thresholds.every(item => item.thresholdAuthority === 'bridge-portal-transition-v1' && item.surfaceId && item.endpointId), 'thresholds must remain attached to exact bridge/surface/endpoint identity');
assert.ok((ph.transportJunctionVisualCarves ?? 0) > 0, 'hanging circulation junctions must carve same-surface yieldable bridge decoration');

const ownership = ph.stairOwnership ?? [];
assert.ok(ownership.length >= 3, 'hanging buildings must publish stair ownership roots');
assert.ok(ownership.every(item => item.ownershipAuthority === 'stair-core-owns-opening-and-children-v1'), 'stair core owns opening and children');
const entries = [{ payload:hanging, chunkKey:`ceiling:${chunk.key}` }];
const catalog = buildTargetCatalog(THREE, entries);
const assemblies = searchTargetCatalog(catalog,{kind:'stair-assembly'},{limit:100});
assert.equal(assemblies.length, ownership.length, 'visual harness must expose one structural stair assembly per ownership root');
const stair = assemblies[0];
const broad = buildColliderProxyScene(THREE,entries,expandBounds(stair.bounds,0.55),{includePhysical:true,includeSemantic:true});
const strict = buildColliderProxyScene(THREE,entries,expandBounds(stair.bounds,0.55),{includePhysical:true,includeSemantic:true,structuralOwnerId:stair.id});
assert.equal(strict.selectionMode,'structural-owner');
assert.ok(strict.records.length > 0, 'strict stair owner pass must contain owned geometry');
assert.ok(strict.records.length <= broad.records.length, 'strict owner pass may not add foreign nearby proxies');
assert.ok(strict.records.every(record => {
  const item = record.raw ?? {};
  return String(item.stairOwnerId ?? '') === stair.id || String(item.stairId ?? '') === stair.id || String(item.id ?? '') === stair.id || String(item.id ?? '').startsWith(`${stair.id}:`);
}), 'strict stair owner pass must contain no foreign physical/semantic proxies');

for (const bundle of [broad, strict]) {
  for (const record of bundle.records) record.mesh.geometry?.dispose?.();
  for (const material of bundle.materials ?? []) material.dispose?.();
}
engine.disposeShared?.();
console.log('[geometry-r2-invariants-selftest] PASS', {
  chunk:chunk.key,
  hangingBridges:bridgeArchitecture.length,
  thresholdLandings:thresholds.length,
  junctionVisualCarves:ph.transportJunctionVisualCarves,
  stairAssemblies:assemblies.length,
  broadColliderProxies:broad.records.length,
  strictOwnedColliderProxies:strict.records.length,
});
