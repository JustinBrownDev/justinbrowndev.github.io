import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';

globalThis.window = {};
globalThis.location = { search: '?generationProfile=skeleton&buildBudgetMs=5.5' };

const [
  { createKowloonFabricEngine },
  { deterministicChunkSeed, worldWeirdnessAt },
] = await Promise.all([
  import('../kowloon-fabric-engine.js?generated-cross-chunk-transport-seams-selftest=1'),
  import('../world-chunk-streamer.js'),
]);

const worldSeed = 0x51CEB00C;
const chunkSize = 64;
const scene = new THREE.Scene();
const owners = new Map();
const playerPhysics = {
  registerOwnedWorld(id, data, lifecycle = {}) {
    assert.ok(!owners.has(id), `owner ${id} must not be registered twice`);
    owners.set(id, data);
    const record = { activationState: 'active', deferredReason: null };
    lifecycle.onActivationChange?.(record);
    return record;
  },
  unregisterOwnedWorld(id) { return owners.delete(id); },
};
const factory = createKowloonFabricEngine({
  THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene),
  worldSeed, chunkSize, landmarkSpacingChunks: 3,
});

// Match the real browser order: 0,0 itself is the authored origin shell, so the
// first seam-capable origin payload arrives later as buildAuthoredCeilingOverlay().
const neighborChunk = {
  key: '1,0', x: 1, z: 0, centerX: chunkSize, centerZ: 0,
  seed: deterministicChunkSeed(worldSeed, 1, 0),
  weirdness: worldWeirdnessAt(1, 0, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
};
const neighbor = await factory.build(neighborChunk);
await factory.commit(neighborChunk, neighbor);
factory.setVisible(neighborChunk, neighbor, true);
assert.equal(factory.crossChunkSeamStats().activePairs, 0,
  'streamed neighbor alone cannot fabricate a boundary seam before its peer authority exists');

const authoredCeiling = await factory.buildAuthoredCeilingOverlay({ groundEntities: [] });
assert.equal(authoredCeiling.ceilingCity, true);
assert.equal(authoredCeiling.chunk.key, '0,0');
await factory.commit(authoredCeiling.chunk, authoredCeiling);
const stats = factory.crossChunkSeamStats();
assert.equal(stats.committedChunks, 2);
assert.equal(stats.activePairs, 1);
assert.equal(stats.groundRoadHandoffs, 0,
  'ceiling-only authored origin must not claim ground-road authority it does not own');
assert.equal(stats.skyStreetSeams, 1,
  'late authored-origin ceiling layer must stitch to the already-live streamed neighbor');
assert.equal(stats.visibleSkyStreetSeams, 1);
assert.deepEqual(stats.edgeKeys, ['V:1:0']);

const sky = (authoredCeiling.crossChunkTransportSeams ?? []).find(item => item.kind === 'hanging-sky-street-seam');
assert.ok(sky);
assert.equal(sky.id, 'cross-chunk-sky-street:V:1:0');
assert.equal(sky.axis, 'x');
assert.ok(sky.gap > 0.08 && sky.gap <= 2.0, `expected a short sky-street seam, got gap=${sky.gap}`);
assert.ok(Math.abs(sky.rise) <= 0.08, 'cross-chunk sky seam must remain level');
assert.ok(sky.from < 32 && sky.to > 32, 'seam deck must physically cross the x=32 chunk boundary');
assert.ok(Math.abs(sky.boundaryCoordinate - 32) < 1e-9);

const originSurface = (authoredCeiling.physics.exteriorTransportSurfaces ?? []).find(item => item.id === sky.firstSurfaceId);
const neighborSurface = (neighbor.hangingLayer?.payload?.physics?.exteriorTransportSurfaces ?? []).find(item => item.id === sky.secondSurfaceId);
assert.equal(originSurface?.kind, 'clear-roof-street-layer');
assert.equal(neighborSurface?.kind, 'clear-roof-street-layer');
assert.ok(Math.abs(Number(originSurface.y) - Number(neighborSurface.y)) <= 0.08,
  'selected hanging roof streets must share one global world-height band');

const seamPhysics = owners.get(sky.ownerId);
assert.ok(seamPhysics, 'generated sky seam must register one independent collision owner');
assert.equal(seamPhysics.platforms.length, 1, 'generated seam must own one short support deck');
const deck = seamPhysics.platforms[0];
assert.ok(deck.x - deck.hx < 32 && deck.x + deck.hx > 32);
assert.ok(Math.abs(deck.y - sky.y) < 1e-9);
const rails = (seamPhysics.mazeWalls ?? []).filter(wall => wall.surfaceId === deck.surfaceId && wall.transportRailId);
assert.equal(rails.length, 2, 'generated boundary deck needs side rails only');
assert.ok(rails.every(wall => Math.abs(Number(wall.x2) - Number(wall.x1)) > Math.abs(Number(wall.z2) - Number(wall.z1))),
  'east-west seam rails must run parallel to travel and leave both roof mouths open');
assert.equal((seamPhysics.semanticConnectors ?? []).filter(item => item.kind === 'bridge').length, 1,
  'generated seam collision owner must publish a semantic bridge sweep');

const seamRoot = scene.children.find(child => child.userData?.crossChunkEdgeKey === 'V:1:0');
assert.ok(seamRoot?.visible, 'generated seam root must be directly visible once both peers are live');
factory.setVisible(neighborChunk, neighbor, false);
assert.equal(seamRoot.visible, false);
factory.setVisible(neighborChunk, neighbor, true);
assert.equal(seamRoot.visible, true);

await factory.unload(neighborChunk, neighbor);
assert.equal(factory.crossChunkSeamStats().activePairs, 0,
  'unloading streamed neighbor must remove authored-origin cross-chunk seam immediately');
assert.equal(owners.has(sky.ownerId), false);
assert.equal(seamRoot.parent, null);
assert.equal((authoredCeiling.crossChunkTransportSeams ?? []).length, 0,
  'surviving authored ceiling must not retain stale cross-chunk metadata');
await factory.unload(authoredCeiling.chunk, authoredCeiling);
assert.equal(factory.crossChunkSeamStats().committedChunks, 0);

console.log('[generated-cross-chunk-transport-seams-selftest] PASS', {
  edgeKey: sky.edgeKey,
  skyGap: Number(sky.gap.toFixed(3)),
  skyY: sky.y,
  sideRails: rails.length,
  authoredOriginLateJoin: true,
  invariant: 'the real authored 0,0 ceiling overlay can join a previously committed streamed neighbor through one short canonical sky-street deck',
});
