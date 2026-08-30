import assert from 'node:assert/strict';
import {
  WORLD_FORMAT_VERSION,
  SPAWN_CHUNK,
  SPAWN_SINGULAR_TYPES,
  createChunkDescriptor,
  createSpawnSingularManifest,
  deterministicChunkSeed,
  singularEntityId,
  worldChunkOwnerId,
  worldEntityId,
  worldWeirdnessAt,
} from './world-contract.js';

const seed = 0x1234abcd;
assert.equal(WORLD_FORMAT_VERSION, 1);
assert.equal(SPAWN_CHUNK.key, '0,0');
assert.equal(SPAWN_SINGULAR_TYPES.length, 6, 'five authored singulars + one reserved slot');

const a = createChunkDescriptor({ worldSeed: seed, chunkX: 17, chunkZ: -9, chunkSize: 64 });
const b = createChunkDescriptor({ worldSeed: seed, chunkX: 17, chunkZ: -9, chunkSize: 64 });
assert.deepEqual(a, b, 'descriptor must be pure and deterministic');
assert.equal(a.ownerId, worldChunkOwnerId(seed, 17, -9));
assert.equal(a.seed, deterministicChunkSeed(seed, 17, -9));
assert.notEqual(a.ownerId, worldChunkOwnerId(seed, 18, -9));
assert.notEqual(worldChunkOwnerId(seed, 2147483648, 0), worldChunkOwnerId(seed, -2147483648, 0), 'chunk identity must not wrap at signed 32-bit range');
assert.notEqual(worldEntityId(seed, 17, -9, 'building', '3,4'), worldEntityId(seed, 17, -9, 'building', '4,4'));

const manifest = createSpawnSingularManifest(seed, [{ type: 'artGallery', mainEntrance: { doorX: 3, doorZ: -2 } }]);
assert.equal(manifest.length, 6);
assert.equal(manifest[0].entityId, singularEntityId(seed, 'artGallery'));
assert.deepEqual(manifest[0].worldPosition, { x: 3, z: -2 });
assert.equal(manifest.at(-1).reserved, true);
assert.ok(manifest.every(item => item.chunkKey === '0,0'));

const near = worldWeirdnessAt(2, 0, { worldSeed: seed, startRadius: 1.5, fullRadius: 36 });
const far = worldWeirdnessAt(30, 0, { worldSeed: seed, startRadius: 1.5, fullRadius: 36 });
assert.ok(far.value > near.value, 'broad weirdness must rise with distance');

console.log('[world-contract-selftest] PASS', { ownerId: a.ownerId, singulars: manifest.map(x => x.type), near: near.value, far: far.value });
