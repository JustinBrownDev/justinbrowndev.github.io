import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';
import { reservationContainsRamp } from '../world/circulation-reservations.js';

const worldSeed = 671278205;
const chunkSize = 64;
const scene = new THREE.Scene();
const owners = new Map();
const playerPhysics = {
  registerOwnedWorld(id, data) { owners.set(id, data); return { activationState: 'active' }; },
  unregisterOwnedWorld(id) { return owners.delete(id); },
};
const factory = createKowloonFabricEngine({
  THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene),
  worldSeed, chunkSize, landmarkSpacingChunks: 3, yieldControl: null,
});
function chunk(x, z) {
  return {
    key: `${x},${z}`, x, z, centerX: x * chunkSize, centerZ: z * chunkSize,
    seed: deterministicChunkSeed(worldSeed, x, z),
    weirdness: worldWeirdnessAt(x, z, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
  };
}
const fixtures = [[1,0],[-2,-2],[8,8],[16,0],[36,0]];
let stairShafts = 0;
for (const [x, z] of fixtures) {
  const payload = await factory.build(chunk(x, z));
  assert.ok(payload, `${x},${z}: chunk planning/build must complete`);
  const reservations = payload.physics?.circulationReservations ?? [];
  const shafts = reservations.filter(item => item.kind === 'stair-shaft');
  stairShafts += shafts.length;
  for (const shaft of shafts) {
    assert.ok(shaft.flightCount === undefined || shaft.flightCount <= 4, `${x},${z}: no >4-flight story workaround`);
    assert.ok(Number.isFinite(shaft.slabOpeningWidth) && shaft.slabOpeningWidth > 0, `${x},${z}: stair shaft must publish slab opening`);
    assert.ok(Number.isFinite(shaft.slabOpeningDepth) && shaft.slabOpeningDepth > 0, `${x},${z}: stair shaft must publish slab opening depth`);
  }
  const ramps = payload.physics?.ramps ?? [];
  for (const ramp of ramps.filter(item => item.supportKind === 'compound-stair')) {
    assert.equal(shafts.filter(shaft => reservationContainsRamp(shaft, ramp)).length, 1,
      `${x},${z}: each compound stair must belong to exactly one structural reservation`);
  }
}
assert.ok(stairShafts > 0, 'fixtures must exercise committed multistory circulation');
console.log('[structural-feasibility-regression-selftest] PASS', {
  worldSeed, fixtures: fixtures.map(([x,z]) => `${x},${z}`), stairShafts,
  invariant: 'known Cut 20 crash chunks build without realization-time stair-fit exceptions',
});
factory.disposeShared();
