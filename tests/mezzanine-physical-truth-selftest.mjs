import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';

const worldSeed = 671278205;
const coordinates = [[0, 0], [1, 0]];
let mezzaninesChecked = 0;

for (const [x, z] of coordinates) {
  const scene = new THREE.Scene();
  const playerPhysics = { registerOwnedWorld() { return { activationState: 'active' }; }, unregisterOwnedWorld() { return true; } };
  const factory = createKowloonFabricEngine({ THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene), worldSeed, chunkSize: 64, landmarkSpacingChunks: 3, yieldControl: null });
  const chunk = { key: `${x},${z}`, x, z, centerX: x * 64, centerZ: z * 64, seed: deterministicChunkSeed(worldSeed, x, z), weirdness: worldWeirdnessAt(x, z, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }) };
  const payload = await factory.build(chunk);
  const mezzanineStairs = (payload.physics.semanticConnectors ?? []).filter(connector => connector.source === 'mezzanine-stair' && connector.stairFlight);
  assert.ok(mezzanineStairs.length > 0, `${chunk.key}: fixture must publish at least one valid mezzanine stair`);
  for (const connector of mezzanineStairs) {
    mezzaninesChecked++;
    assert.equal(connector.stairFlight.fitClassification, 'fits-resolved-truth', `${connector.id}: published mezzanine tread/run violates resolved truth`);
    assert.ok(connector.sweep.halfWidth * 2 + 1e-9 >= connector.stairFlight.clearWidth, `${connector.id}: published mezzanine width is below resolved clear width`);
  }
  factory.disposeShared();
}
assert.ok(mezzaninesChecked > 0);
console.log('[mezzanine-physical-truth-selftest] PASS', { coordinates: coordinates.map(([x, z]) => `${x},${z}`), mezzaninesChecked, invariant: 'published mezzanine stairs fit resolved tread/run and clear-width truth; invalid optional mezzanines are suppressed' });
