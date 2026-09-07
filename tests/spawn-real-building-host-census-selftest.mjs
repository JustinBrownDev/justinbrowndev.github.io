import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';
import { collectSpawnFabricSpaces } from '../world/spawn-proof.js';

function makeChunk(worldSeed, x = 0, z = 0) {
  return {
    key: `${x},${z}`, x, z, centerX: x * 64, centerZ: z * 64,
    seed: deterministicChunkSeed(worldSeed, x, z),
    weirdness: worldWeirdnessAt(x, z, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
  };
}

const worldSeed = 42;
const scene = new THREE.Scene();
const playerPhysics = { registerOwnedWorld() { return { activationState: 'active' }; }, unregisterOwnedWorld() { return true; } };
const engine = createKowloonFabricEngine({ THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene), chunkSize: 64, worldSeed, yieldControl: null });
const chunk = makeChunk(worldSeed);
const payload = await engine.build(chunk);
const spaces = collectSpawnFabricSpaces(new Map([[chunk.key, payload]]));
const overhead = space => (space.overheadPatches?.length ?? 0) > 0;
const mega = spaces.filter(s => s.surfaceClass === 'interior-floor' && overhead(s) && s.supportAreaM2 >= 20 && s.largestSupportPatchAreaM2 >= 18 && s.maxSupportSpanM >= 3.5);
const giga = spaces.filter(s => s.surfaceClass === 'interior-floor' && overhead(s) && s.storefrontLike && s.supportAreaM2 >= 30 && s.largestSupportPatchAreaM2 >= 24 && s.maxSupportSpanM >= 4.2 && s.maxWallSpanM >= 3.8);
const terra = spaces.filter(s => s.surfaceClass === 'interior-floor' && overhead(s) && !s.retailLike && s.supportAreaM2 >= 90 && s.largestSupportPatchAreaM2 >= 42 && s.maxSupportSpanM >= 6.2 && s.maxWallSpanM >= 9.0);
assert.ok(mega.length > 0, 'seed 42 ordinary spawn chunk should contain a real Mega host');
assert.ok(giga.length > 0, 'seed 42 ordinary spawn chunk should contain a real GIGA storefront host');
assert.ok(terra.length > 0, 'seed 42 ordinary spawn chunk should contain a real TERRA compound-hall host');
assert.ok(spaces.some(s => s.payloadLayer === 'hanging'), 'census must include hanging-city building spaces');
console.log('[spawn-real-building-host-census-selftest] PASS', {
  terraPrograms: Object.fromEntries([...new Set(terra.map(s => s.programArchitectureId))].map(k => [k, terra.filter(s => s.programArchitectureId===k).length])),
  spaces: spaces.length,
  mega: mega.length,
  giga: giga.length,
  terra: terra.length,
  gigaHanging: giga.filter(s => s.payloadLayer === 'hanging').length,
  terraExamples: terra.slice(0, 3).map(s => ({ id:s.spaceId, layer:s.payloadLayer, program:s.programArchitectureId, area:Number(s.supportAreaM2.toFixed(1)), patch:Number(s.largestSupportPatchAreaM2.toFixed(1)), span:Number(s.maxSupportSpanM.toFixed(1)), wall:Number(s.maxWallSpanM.toFixed(1)) })),
});
engine.disposeShared();
