import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';
import { HANGING_CITY_CEILING_Y } from '../world/hanging-city-topology.js';

const worldSeed = 0xdecafbad;
const scene = new THREE.Scene();
const rawAdd = scene.add.bind(scene);
const owners = new Map();
const playerPhysics = {
  registerOwnedWorld(id, data, lifecycle = {}) {
    owners.set(id, data);
    const record = { activationState: 'active' };
    lifecycle.onActivationChange?.(record);
    return record;
  },
  unregisterOwnedWorld(id) { return owners.delete(id); },
};
const factory = createKowloonFabricEngine({
  THREE, scene, playerPhysics, directSceneAdd: rawAdd, worldSeed, chunkSize: 64, yieldControl: null,
});
const originChunk = {
  key: '0,0', x: 0, z: 0, centerX: 0, centerZ: 0,
  seed: deterministicChunkSeed(worldSeed, 0, 0),
  weirdness: worldWeirdnessAt(0, 0, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
};

assert.equal('buildAuthoredOriginChunk' in factory, false, 'retired authored-origin shell must not remain in the engine API');
assert.equal('buildAuthoredCeilingOverlay' in factory, false, 'retired authored ceiling overlay must not remain in the engine API');

const origin = await factory.build(originChunk);
assert.equal(origin.committed, false);
assert.ok(origin.entities.some(entity => entity.kind === 'building'), 'origin must have the same ground building fabric as an ordinary chunk');
assert.ok(origin.hangingLayer?.payload, 'origin must build its hanging layer during the same ordinary chunk build');
assert.ok(origin.hangingLayer.buildings > 0, 'origin must contain downward-growing buildings');
assert.ok(origin.hangingLayer.payload.entities.some(entity => entity.kind === 'building' && entity.growthDirection === 'world-down'));
assert.ok(origin.hangingLayer.payload.entities.filter(entity => entity.kind === 'building').every(entity => entity.ceilingY === HANGING_CITY_CEILING_Y));
assert.equal(scene.children.includes(origin.root), false, 'ordinary origin build remains off-scene before atomic commit');

await factory.commit(originChunk, origin);
factory.setVisible(originChunk, origin, true);
assert.equal(origin.root.parent, scene, 'ordinary 0,0 publishes as a direct streamed chunk root');
assert.ok(owners.has(origin.ownerId), 'ordinary origin ground physics publishes through the normal chunk owner');
assert.ok(owners.has(origin.hangingLayer.payload.ownerId), 'ordinary origin hanging physics publishes with the same chunk lifecycle');
assert.equal(factory.verifyReady(originChunk, origin, true), true);

await factory.unload(originChunk, origin);
assert.equal(origin.root.parent, null);
assert.equal(owners.has(origin.ownerId), false);
assert.equal(owners.has(origin.hangingLayer.payload.ownerId), false);
factory.disposeShared();

console.log('[cut16-authored-ceiling-overlay-selftest] PASS', {
  doctrine: 'authored origin overlay retired',
  groundBuildings: origin.buildings,
  hangingBuildings: origin.hangingLayer.buildings,
  ceilingY: HANGING_CITY_CEILING_Y,
});
