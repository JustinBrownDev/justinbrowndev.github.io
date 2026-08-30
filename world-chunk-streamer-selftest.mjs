import assert from 'node:assert/strict';
import {
  CHUNK_STATE,
  WORLD_SPACE_STATE,
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
assert.equal(streamer.classifyWorldPosition(40, 0).state, WORLD_SPACE_STATE.UNKNOWN, 'unbuilt neighboring space must be unknown, not solid');
assert.equal(streamer.isWorldPositionAvailable(40, 0), true, 'compatibility availability must allow movement into unknown procedural space');

streamer.ensureNeighborhood();
const nearest = streamer.nearestQueuedChunk();
assert.ok(nearest, 'spawn neighborhood must queue surrounding chunks');
assert.equal(Math.max(Math.abs(nearest.x), Math.abs(nearest.z)), 1, 'nearest non-spawn work must be first ring');
assert.equal(nearest.key, '1,0', 'equally-near chunks in front of the player must win the heading tie-break');
await streamer.pump({ maxChunks: 1 });
assert.equal(built.length, 1, 'one pump budget must build one complete chunk');
assert.equal(streamer.chunks.get(built[0]).state, CHUNK_STATE.READY);

 
 
position.x = 64 * 4;
position.z = 0;
await streamer.pump({ maxChunks: 1 });
assert.equal(built.at(-1), '4,0', 'current player chunk must outrank stale queued work');
assert.ok(unloaded.length >= 1, 'far resident procedural chunks must unload after travel');
assert.ok(!unloaded.includes('0,0'), 'authored singular spawn chunk must stay pinned');
assert.equal(streamer.isWorldPositionAvailable(position.x, position.z), true);

 
 
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

// Chunk-local enrichment should converge from the player outward: keep work bounded,
// but finish the nearest/forward READY chunk before smearing one turn across every neighbor.
const refinementPosition = { x: 0, z: 0 };
const refinementTurns = [];
const refinementStreamer = createWorldChunkStreamer({
  chunkSize: 64,
  worldSeed: 123,
  getPlayerPosition: () => refinementPosition,
  getPlayerHeading: () => ({ x: 1, z: 0 }),
  renderRadiusChunks: 1,
  prefetchRadiusChunks: 1,
  retentionRadiusChunks: 2,
  buildChunk: async chunk => ({ key: chunk.key, pending: 2 }),
  refineChunk: async (chunk, payload) => {
    if (payload.pending <= 0) return { progressed: false, steps: 0, complete: true };
    payload.pending--;
    refinementTurns.push(chunk.key);
    return { progressed: true, steps: 1, complete: payload.pending === 0, lastKind: 'test-detail' };
  },
  hasPendingRefinement: (_chunk, payload) => payload.pending > 0,
});
for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) {
  refinementStreamer.markChunkReady(x, z, { key: `${x},${z}`, pending: x === 0 && z === 0 ? 0 : 2 });
}
assert.equal(refinementStreamer.stats().localPrefetchRing.complete, true, 'refinement test requires a structurally warm neighborhood');
await refinementStreamer.pump({ maxChunks: 0, maxMillis: 100, maxRefinements: 4 });
assert.equal(refinementTurns.length, 4, 'bounded refinement pump must honor semantic turn cap');
assert.equal(refinementTurns[0], '1,0', 'heading-biased nearest chunk should receive the first equal-distance refinement turn');
assert.equal(refinementTurns[1], '1,0', 'nearest visible chunk should receive consecutive turns until its local detail queue completes');
assert.ok(new Set(refinementTurns).size < refinementTurns.length, 'nearest-first convergence must repeat a close chunk instead of smearing one turn across every neighbor');
await refinementStreamer.pump({ maxChunks: 0, maxMillis: 100, maxRefinements: 4 });
assert.equal(refinementStreamer.stats().refinement.steps, 8);
assert.equal(refinementStreamer.stats().refinement.failures, 0);
await refinementStreamer.dispose();

const gatedRefinementTurns = [];
const gatedStreamer = createWorldChunkStreamer({
  chunkSize: 64,
  worldSeed: 124,
  getPlayerPosition: () => ({ x: 0, z: 0 }),
  renderRadiusChunks: 1,
  prefetchRadiusChunks: 1,
  retentionRadiusChunks: 2,
  buildChunk: async chunk => ({ key: chunk.key, pending: 1 }),
  refineChunk: async chunk => { gatedRefinementTurns.push(chunk.key); return { progressed: true, steps: 1, complete: true }; },
  hasPendingRefinement: (_chunk, payload) => payload.pending > 0,
});
gatedStreamer.markChunkReady(0, 0, { pending: 1 });
await gatedStreamer.pump({ maxChunks: 0, maxMillis: 100, maxRefinements: 8 });
assert.equal(gatedRefinementTurns.length, 0, 'chunk cosmetics must not compete with an incomplete structural prefetch neighborhood');
await gatedStreamer.dispose();

const earlyRefinementTurns = [];
const earlyStreamer = createWorldChunkStreamer({
  chunkSize: 64,
  worldSeed: 125,
  getPlayerPosition: () => ({ x: 0, z: 0 }),
  renderRadiusChunks: 0,
  prefetchRadiusChunks: 1,
  retentionRadiusChunks: 2,
  refineAfterPrefetchReady: false,
  buildChunk: async chunk => ({ key: chunk.key, pending: 1 }),
  refineChunk: async (chunk, payload) => {
    if (payload.pending <= 0) return { progressed: false, steps: 0, complete: true };
    payload.pending--;
    earlyRefinementTurns.push(chunk.key);
    return { progressed: true, steps: 1, complete: payload.pending === 0 };
  },
  hasPendingRefinement: (_chunk, payload) => payload.pending > 0,
});
earlyStreamer.markChunkReady(0, 0, { pending: 1 });
assert.equal(earlyStreamer.stats().localRenderRing.complete, true, 'early-refinement test requires the visible ring to be structurally safe');
assert.equal(earlyStreamer.stats().localPrefetchRing.complete, false, 'early-refinement test must begin before the outer prefetch ring is warm');
await earlyStreamer.pump({ maxChunks: 0, maxMillis: 100, maxRefinements: 1 });
assert.deepEqual(earlyRefinementTurns, ['0,0'], 'visible local detail should begin before farther prefetch shells finish');
await earlyStreamer.dispose();

// A visible richness floor prevents both extremes: one-turn round-robin smear and
// fully completing a single chunk while every other visible chunk stays barren.
const floorTurns = [];
const floorStreamer = createWorldChunkStreamer({
  chunkSize: 64,
  worldSeed: 126,
  getPlayerPosition: () => ({ x: 0, z: 0 }),
  getPlayerHeading: () => ({ x: 1, z: 0 }),
  renderRadiusChunks: 1,
  prefetchRadiusChunks: 1,
  retentionRadiusChunks: 2,
  refineAfterPrefetchReady: false,
  minimumVisibleRefinementTurns: 2,
  buildChunk: async chunk => ({ key: chunk.key, pending: 5 }),
  refineChunk: async (chunk, payload) => {
    payload.pending--;
    floorTurns.push(chunk.key);
    return { progressed: true, steps: 1, complete: payload.pending <= 0 };
  },
  hasPendingRefinement: (_chunk, payload) => payload.pending > 0,
});
for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) {
  floorStreamer.markChunkReady(x, z, { pending: x === 0 && z === 0 ? 0 : 5 });
}
await floorStreamer.pump({ maxChunks: 0, maxMillis: 100, maxRefinements: 4, refineFirst: true, refinementBudgetMs: 100 });
assert.deepEqual(floorTurns.slice(0, 2), ['1,0', '1,0'], 'nearest forward chunk must receive its minimum visible detail floor first');
assert.notEqual(floorTurns[2], '1,0', 'after reaching the floor, another visible chunk must get its first detail layer before deep convergence resumes');
assert.equal(floorStreamer.stats().localRenderRefinement.floorPendingChunks > 0, true);
await floorStreamer.dispose();

const order = [];
const refineFirstStreamer = createWorldChunkStreamer({
  chunkSize: 64, worldSeed: 127,
  getPlayerPosition: () => ({ x: 0, z: 0 }),
  renderRadiusChunks: 0, prefetchRadiusChunks: 1, retentionRadiusChunks: 2,
  refineAfterPrefetchReady: false, minimumVisibleRefinementTurns: 1,
  buildChunk: async chunk => { order.push('build:' + chunk.key); return { pending: 0 }; },
  refineChunk: async (chunk, payload) => { payload.pending = 0; order.push('refine:' + chunk.key); return { progressed: true, steps: 1, complete: true }; },
  hasPendingRefinement: (_chunk, payload) => payload.pending > 0,
});
refineFirstStreamer.markChunkReady(0, 0, { pending: 1 });
refineFirstStreamer.ensureNeighborhood();
await refineFirstStreamer.pump({ maxChunks: 1, maxMillis: 100, maxRefinements: 1, refineFirst: true, refinementBudgetMs: 10 });
assert.equal(order[0], 'refine:0,0', 'visible detail sprint must refine before spending the remaining pump on farther prefetch structure');
assert.ok(order[1]?.startsWith('build:'), 'prefetch structure must continue in the same bounded sprint pump after the visible detail turn');
await refineFirstStreamer.dispose();

console.log('[world-chunk-refinement-selftest] PASS', { refinementTurns, floorTurns, order });
