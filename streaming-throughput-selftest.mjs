import assert from 'node:assert/strict';
import * as THREE from './vendor/three/three.module.js';
import { createKowloonFabricEngine } from './kowloon-fabric-engine.js';
import { createWorldChunkStreamer } from './world-chunk-streamer.js';

const worldSeed = 671278205;
const scene = new THREE.Scene();
const rawSceneAdd = scene.add.bind(scene);
const owners = new Map();
const physics = {
  registerOwnedWorld(id, data) { owners.set(id, data); },
  unregisterOwnedWorld(id) { return owners.delete(id); },
};
const position = { x: 0, z: 0 };
const heading = { x: 1, z: 0 };
const factory = createKowloonFabricEngine({
  THREE,
  scene,
  playerPhysics: physics,
  directSceneAdd: rawSceneAdd,
  worldSeed,
  chunkSize: 51,
  landmarkSpacingChunks: 3,
  yieldControl: null,
});
const streamer = createWorldChunkStreamer({
  chunkSize: 51,
  worldSeed,
  getPlayerPosition: () => position,
  getPlayerHeading: () => heading,
  renderRadiusChunks: 2,
  prefetchRadiusChunks: 3,
  retentionRadiusChunks: 4,
  pinnedChunkKeys: ['0,0'],
  weirdness: { startRadius: 1.5, fullRadius: 36, curve: 1.3 },
  buildChunk: chunk => factory.build(chunk),
  commitChunk: (chunk, payload) => factory.commit(chunk, payload),
  setChunkVisibility: (chunk, payload, visible) => factory.setVisible(chunk, payload, visible),
  verifyChunkReady: (chunk, payload, visible) => factory.verifyReady(chunk, payload, visible),
  unloadChunk: (chunk, payload) => factory.unload(chunk, payload),
});
streamer.markChunkReady(0, 0, { spawnDistrict: true });
streamer.ensureNeighborhood();

const started = performance.now();
while (!streamer.stats().localPrefetchRing.complete) {
  const built = await streamer.pump({ maxChunks: 64, maxMillis: 1000 });
  assert.equal(built, true, 'prefetch ring should make forward progress');
}
const elapsed = performance.now() - started;
const stats = streamer.stats();
assert.equal(stats.localRenderRing.ready, 25, '5x5 structural render ring must be READY');
assert.equal(stats.localPrefetchRing.ready, 49, '7x7 structural prefetch ring must be READY');
assert.equal(stats.ready, 49, 'spawn + 48 procedural chunks expected');
assert.equal(scene.children.length, 48, 'procedural roots should be direct scene children; spawn is authored elsewhere');
assert.equal(owners.size, 48, 'every procedural READY chunk must own active physics');
const visibleRoots = scene.children.filter(root => root.userData.worldChunkRoot && root.visible);
assert.equal(visibleRoots.length, 24, 'only procedural roots inside 5x5 render ring should be visible');
for (const root of scene.children) {
  assert.equal(root.parent, scene, `${root.name} must remain a direct scene child`);
  assert.equal(root.userData.renderAuthority, 'KowloonFabricEngine');
}
console.log('[streaming-throughput-selftest] PASS', {
  elapsedMs: Number(elapsed.toFixed(2)),
  avgBuildMs: Number(stats.throughput.avgBuildMs.toFixed(3)),
  avgCommitMs: Number(stats.throughput.avgCommitMs.toFixed(3)),
  avgCommitToVisibleMs: Number(stats.throughput.avgCommitToVisibleMs.toFixed(3)),
  worstBuildMs: Number(stats.throughput.worstBuildMs.toFixed(3)),
  worstCommitMs: Number(stats.throughput.worstCommitMs.toFixed(3)),
  worstCommitToVisibleMs: Number(stats.throughput.worstCommitToVisibleMs.toFixed(3)),
  render: stats.localRenderRing,
  prefetch: stats.localPrefetchRing,
  directRoots: scene.children.length,
  visibleRoots: visibleRoots.length,
});
await streamer.dispose();
factory.disposeShared();
