import assert from 'node:assert/strict';
import { createWorldChunkStreamer, CHUNK_STATE } from '../world-chunk-streamer.js';

const position = { x: 0, z: 0 };
const built = [];
const streamer = createWorldChunkStreamer({
  chunkSize: 64, worldSeed: 0x1A11CE,
  getPlayerPosition: () => position,
  getPlayerHeading: () => ({ x: 1, z: 0 }),
  renderRadiusChunks: 1, prefetchRadiusChunks: 2, retentionRadiusChunks: 4,
  buildChunk: async chunk => { built.push(chunk.key); return { key: chunk.key, visible: false }; },
  setChunkVisibility: (_chunk, payload, visible) => { payload.visible = visible; return visible; },
});
streamer.markChunkReady(0, 0, { visible: true });
streamer.ensureNeighborhood();
assert.ok(streamer.nearestQueuedChunk(), 'normal predictive scheduling must stay armed without a collision frontier');
await streamer.pump({ maxChunks: 2, maxMillis: 100 });
assert.ok(built.length >= 1, 'prefetch/build work continues proactively');

position.x = 64 * 3;
streamer.ensureNeighborhood();
await streamer.pump({ maxChunks: 1, maxMillis: 100 });
assert.equal(built.at(-1), '3,0', 'current player chunk outranks stale speculative work after unrestricted movement');
assert.equal(streamer.chunks.get('3,0')?.state, CHUNK_STATE.READY);
await streamer.dispose();
console.log('[world-liveness-selftest] PASS', { built });
