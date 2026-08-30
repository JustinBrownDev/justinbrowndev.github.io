import assert from 'node:assert/strict';
import {
  CHUNK_STATE,
  createWorldChunkStreamer,
  deterministicChunkSeed,
  worldWeirdnessAt,
} from './world-chunk-streamer.js';

const position = { x: 0, z: 0 };
const built = [];
const unloaded = [];
const streamer = createWorldChunkStreamer({
  chunkSize: 64,
  worldSeed: 0x12345678,
  getPlayerPosition: () => position,
  getPlayerHeading: () => ({ x: 1, z: 0 }),
  renderRadiusChunks: 1,
  prefetchRadiusChunks: 1,
  retentionRadiusChunks: 1,
  pinnedChunkKeys: ['0,0'],
  buildChunk: async chunk => {
    built.push(chunk.key);
    return { key: chunk.key, seed: chunk.seed };
  },
  unloadChunk: async chunk => unloaded.push(chunk.key),
});

assert.equal(streamer.playerChunkCoords().x, 0);
assert.equal(streamer.playerChunkCoords().z, 0);
position.x = 31.999;
assert.equal(streamer.playerChunkCoords().x, 0, 'chunk 0 must be centered on origin');
position.x = 32.001;
assert.equal(streamer.playerChunkCoords().x, 1, '+half chunk crosses into +1');
position.x = -32.001;
assert.equal(streamer.playerChunkCoords().x, -1, '-half chunk crosses into -1');
position.x = 0;

const spawn = streamer.markChunkReady(0, 0, { authored: true });
assert.equal(spawn.state, CHUNK_STATE.READY);
assert.equal(streamer.isWorldPositionAvailable(0, 0), true);
assert.equal(streamer.isWorldPositionAvailable(40, 0), false);

streamer.ensureNeighborhood();
const nearest = streamer.nearestQueuedChunk();
assert.ok(nearest, 'spawn neighborhood must queue surrounding chunks');
assert.equal(Math.max(Math.abs(nearest.x), Math.abs(nearest.z)), 1, 'nearest non-spawn work must be first ring');
assert.equal(nearest.key, '1,0', 'equally-near chunks in front of the player must win the heading tie-break');
await streamer.pump({ maxChunks: 1 });
assert.equal(built.length, 1, 'one pump budget must build one complete chunk');
assert.equal(streamer.chunks.get(built[0]).state, CHUNK_STATE.READY);

// Teleporting reprioritizes around the current player, and old non-singular
// chunks beyond retention are unloaded rather than accumulating forever.
position.x = 64 * 4;
position.z = 0;
await streamer.pump({ maxChunks: 1 });
assert.equal(built.at(-1), '4,0', 'current player chunk must outrank stale queued work');
assert.ok(unloaded.length >= 1, 'far resident procedural chunks must unload after travel');
assert.ok(!unloaded.includes('0,0'), 'authored singular spawn chunk must stay pinned');
assert.equal(streamer.isWorldPositionAvailable(position.x, position.z), true);

// Walk for a long time. Scheduler bookkeeping must remain local to the
// player rather than retaining every queued/unloaded coordinate ever seen.
for (let step = 5; step <= 80; step++) {
  position.x = 64 * step;
  position.z = 64 * ((step % 7) - 3);
  await streamer.pump({ maxChunks: 1 });
  assert.ok(
    streamer.chunks.size <= 10,
    `chunk metadata must stay bounded while traveling (step ${step}, size ${streamer.chunks.size})`,
  );
  assert.ok(streamer.chunks.has('0,0'), 'pinned authored spawn metadata must survive arbitrary travel');
}
assert.ok(streamer.stats().pruned > 0, 'travel must prune obsolete scheduler records');

const seedA = deterministicChunkSeed(55, 1000, -900, 'city');
const seedB = deterministicChunkSeed(55, 1000, -900, 'city');
const seedC = deterministicChunkSeed(55, 1001, -900, 'city');
assert.equal(seedA, seedB, 'chunk seed must be coordinate deterministic');
assert.notEqual(seedA, seedC, 'adjacent coordinates must not share chunk identity');

const w0 = worldWeirdnessAt(0, 0, { worldSeed: 55, startRadius: 1.5, fullRadius: 36 });
const w10 = worldWeirdnessAt(10, 0, { worldSeed: 55, startRadius: 1.5, fullRadius: 36 });
const w36 = worldWeirdnessAt(36, 0, { worldSeed: 55, startRadius: 1.5, fullRadius: 36 });
assert.equal(w0.value, 0, 'spawn weirdness baseline must be zero');
assert.ok(w10.value > w0.value, 'broad weirdness must increase away from spawn');
assert.ok(w36.value > w10.value && w36.value <= 1, 'far weirdness must approach one monotonically');
assert.equal(worldWeirdnessAt(10, 0, { worldSeed: 55 }).grain, worldWeirdnessAt(10, 0, { worldSeed: 55 }).grain, 'local weirdness grain must be deterministic');

await streamer.dispose();
assert.equal(streamer.chunks.size, 0, 'dispose must release scheduler metadata too');
console.log('[world-chunk-streamer-selftest] PASS', { built, unloaded, w0, w10, w36 });

// Visibility is part of the streamer's ownership contract, not a side effect
// of an unrelated render optimizer. Prefetched READY chunks may be hidden, but
// entering their render ring must flip them visible immediately without a
// rebuild or another spatial authority.
const visibilityPosition = { x: 0, z: 0 };
const visibilityEvents = [];
const visibilityStreamer = createWorldChunkStreamer({
  chunkSize: 64,
  worldSeed: 99,
  getPlayerPosition: () => visibilityPosition,
  renderRadiusChunks: 0,
  prefetchRadiusChunks: 1,
  retentionRadiusChunks: 2,
  buildChunk: async chunk => ({ key: chunk.key, committed: false, visible: false }),
  commitChunk: async (chunk, payload) => { payload.committed = true; },
  setChunkVisibility: (chunk, payload, visible) => {
    payload.visible = visible;
    visibilityEvents.push(`${chunk.key}:${visible}`);
  },
  verifyChunkReady: async (chunk, payload, expectedVisible) => {
    assert.equal(payload.committed, true, 'READY verification must run after commit');
    assert.equal(payload.visible, expectedVisible, 'visibility must be applied before READY');
  },
});
visibilityStreamer.markChunkReady(0, 0, { authored: true });
const eastChunk = visibilityStreamer.ensureChunk(1, 0);
await visibilityStreamer.buildOne(eastChunk);
assert.equal(eastChunk.state, CHUNK_STATE.READY);
assert.equal(eastChunk.visible, false, 'prefetched READY chunk outside render radius must stay hidden');
assert.equal(eastChunk.payload.visible, false);
visibilityPosition.x = 64;
await visibilityStreamer.updateVisibility();
assert.equal(eastChunk.visible, true, 'moving render center onto READY chunk must expose it immediately');
assert.equal(eastChunk.payload.visible, true);
assert.equal(visibilityStreamer.isChunkVisible(1, 0), true);
assert.ok(visibilityStreamer.stats().throughput.avgCommitToVisibleMs >= 0);
await visibilityStreamer.dispose();
console.log('[world-chunk-visibility-selftest] PASS', { visibilityEvents });
