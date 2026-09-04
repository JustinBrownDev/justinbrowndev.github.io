import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { reservationContainsRamp } from '../world/circulation-reservations.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';

// SOAK / ADVERSARIAL: intentionally broader than the pushzip operator lane.
const seeds = [
  0x00000001, 0x13572468, 0x20c0ffee, 0x31415926,
  0x5eed1234, 0x7fffffff, 0x89abcdef, 0xc001d00d,
];
const coordinates = [[1, 0], [8, 8]];
let chunksBuilt = 0;
let shaftsChecked = 0;
let replansSeen = 0;

for (const worldSeed of seeds) {
  const scene = new THREE.Scene();
  const owners = new Map();
  const playerPhysics = {
    registerOwnedWorld(id, data) { owners.set(id, data); return { activationState: 'active' }; },
    unregisterOwnedWorld(id) { return owners.delete(id); },
  };
  const factory = createKowloonFabricEngine({
    THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene),
    worldSeed, chunkSize: 64, landmarkSpacingChunks: 3, yieldControl: null,
  });
  for (const [x, z] of coordinates) {
    const chunk = {
      key: `${x},${z}`, x, z, centerX: x * 64, centerZ: z * 64,
      seed: deterministicChunkSeed(worldSeed, x, z),
      weirdness: worldWeirdnessAt(x, z, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
    };
    const payload = await factory.build(chunk);
    chunksBuilt++;
    const reservations = payload.physics.circulationReservations ?? [];
    const shafts = reservations.filter(item => item.kind === 'stair-shaft');
    const openings = reservations.filter(item => item.kind === 'stair-slab-opening');
    assert.ok(shafts.length >= payload.buildings, `${worldSeed}:${chunk.key}: every building needs structural stair authority`);
    assert.equal(openings.length, shafts.length, `${worldSeed}:${chunk.key}: one slab-opening reservation per stair shaft`);
    for (const shaft of shafts) {
      shaftsChecked++;
      assert.equal(shaft.structuralFeasibilitySchema, 'jweb.structural-feasibility.v1', `${shaft.id}: missing precommit feasibility schema`);
      assert.ok([2, 4].includes(shaft.flightCount), `${shaft.id}: illegal ${shaft.flightCount}-flight story`);
      assert.ok(Array.isArray(shaft.structuralFeasibilityHistory), `${shaft.id}: missing replan history`);
      if (shaft.architectureReplanMode !== 'none') replansSeen++;
      const opening = openings.find(item => item.fullReservationId === shaft.id);
      assert.ok(opening, `${shaft.id}: missing matching slab opening`);
      const flights = payload.physics.ramps.filter(ramp => ramp.supportKind === 'compound-stair' && reservationContainsRamp(shaft, ramp));
      assert.ok(flights.length >= shaft.flightCount, `${shaft.id}: realized stair flights must remain inside structural reservation`);
    }
  }
  factory.disposeShared();
}

assert.ok(chunksBuilt > 0 && shaftsChecked > 0);
console.log('[structural-feasibility-chunk-soak] PASS', {
  seeds: seeds.length,
  coordinates: coordinates.map(([x, z]) => `${x},${z}`),
  chunksBuilt,
  shaftsChecked,
  replansSeen,
  invariant: 'multi-seed real chunk generation never commits a multistory building without legal 2/4-flight stair and slab-opening authority',
});
