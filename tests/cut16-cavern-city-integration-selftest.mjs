import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';
import { HANGING_CITY_CEILING_Y, ceilingSourceCoordinates } from '../world/hanging-city-topology.js';

const worldSeed = 0x13572468;
const scene = new THREE.Scene();
const rawSceneAdd = scene.add.bind(scene);
const owners = new Map();
const physics = {
  registerOwnedWorld(id, data, lifecycle = {}) {
    const record = { ownerId: id, data, activationState: 'active', deferredReason: null };
    owners.set(id, data);
    lifecycle.onActivationChange?.(record);
    return record;
  },
  unregisterOwnedWorld(id) { return owners.delete(id); },
};
const factory = createKowloonFabricEngine({
  THREE, scene, playerPhysics: physics, directSceneAdd: rawSceneAdd,
  worldSeed, chunkSize: 64, landmarkSpacingChunks: 3, yieldControl: null,
});
const chunk = {
  key: '1,0', x: 1, z: 0, centerX: 64, centerZ: 0,
  seed: deterministicChunkSeed(worldSeed, 1, 0),
  weirdness: worldWeirdnessAt(1, 0, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
};
const payload = await factory.build(chunk);
assert.ok(payload.hangingLayer?.payload, 'streamed chunk must carry a ceiling-city peer payload');
const ceiling = payload.hangingLayer.payload;
assert.equal(ceiling.frame.gravityDirection, 'world-down');
assert.equal(ceiling.frame.cameraUpDirection, 'world-up');
assert.deepEqual(ceiling.ceilingSourceChunk, ceilingSourceCoordinates(chunk.x, chunk.z));
assert.ok(ceiling.buildings > 0, 'phase-sampled ceiling field must contain ordinary buildings');
assert.ok(ceiling.root.children.some(child => child.name?.startsWith('ceiling-plane:')), 'ceiling peer must own the flat white roof plane');
assert.equal(ceiling.root.scale.y, 1, 'ceiling city root must never use Y inversion');
const buildings = ceiling.entities.filter(entity => entity.kind === 'building');
assert.ok(buildings.every(entity => entity.gravityDirection === 'world-down'));
assert.ok(buildings.every(entity => entity.growthDirection === 'world-down'));
assert.ok(buildings.every(entity => entity.baseY >= 0 && entity.baseY < HANGING_CITY_CEILING_Y));
assert.ok(buildings.every(entity => entity.ceilingY === HANGING_CITY_CEILING_Y));
assert.ok(buildings.some(entity => entity.invertedLowEndRoof === true), 'exposed low ends must receive mirrored roof vocabulary');
assert.ok(buildings.some(entity => entity.ceilingRooted === true), 'ordinary upright compounds must be rooted upward into the flat ceiling');
for (const entity of buildings) {
  const claim = entity.architecturalClaim;
  if (!claim?.blockers?.length) continue;
  assert.ok(entity.baseY - claim.undersideReserve >= claim.blockingTopY + claim.verticalClearance - 1e-8,
    'underside decoration reserve must remain outside opposing ground claims');
}
let ceilingRefineSteps = 0;
for (let i = 0; i < 24 && ceiling.refinement.cursor < 4; i++) {
  const result = factory.refine(chunk, payload, { maxSteps: 1, maxMillis: 20 });
  assert.equal(result.failed ?? 0, 0, 'sample refinement must not fail while alternating ground/ceiling payloads');
  if (ceiling.refinement.cursor > ceilingRefineSteps) ceilingRefineSteps = ceiling.refinement.cursor;
}
assert.ok(ceiling.refinement.cursor > 0, 'ceiling enrichment must participate in the normal progressive refinement lane');
await factory.commit(chunk, payload);
assert.ok(owners.has(payload.ownerId));
assert.ok(owners.has(ceiling.ownerId), 'ordinary player physics must register ceiling collision as a normal second owner');
await factory.unload(chunk, payload);
assert.equal(owners.has(ceiling.ownerId), false);
factory.disposeShared();
console.log('[cut16-cavern-city-integration-selftest] PASS', {
  ceilingY: HANGING_CITY_CEILING_Y,
  source: ceiling.ceilingSourceChunk,
  buildings: ceiling.buildings,
  skybridges: ceiling.skybridges,
  ladders: ceiling.ladders,
  invariant: 'normal-gravity ceiling city is phase-shifted, rooted to the white plane, and collision-budgeted before realization',
});
