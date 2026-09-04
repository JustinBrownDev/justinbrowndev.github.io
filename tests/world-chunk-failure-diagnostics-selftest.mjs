import assert from 'node:assert/strict';
import { CHUNK_STATE, createWorldChunkStreamer } from '../world-chunk-streamer.js';

const streamer = createWorldChunkStreamer({
  chunkSize: 64,
  worldSeed: 20,
  getPlayerPosition: () => ({ x: 0, z: 0 }),
  renderRadiusChunks: 0,
  prefetchRadiusChunks: 0,
  retentionRadiusChunks: 1,
  buildChunk: async () => {
    const error = new Error('synthetic structural-feasibility rejection');
    error.code = 'JWEB_STRUCTURAL_FEASIBILITY_REJECTED';
    throw error;
  },
});
const chunk = streamer.ensureChunk(0, 0);
await assert.rejects(() => streamer.buildOne(chunk, 'failure-diagnostic-fixture'), /synthetic structural-feasibility rejection/);
assert.equal(chunk.state, CHUNK_STATE.FAILED);
const stats = streamer.stats();
assert.equal(stats.failureDiagnostics.resident, 1);
assert.equal(stats.failureDiagnostics.visible, 1);
assert.equal(stats.failureDiagnostics.recent[0].key, '0,0');
assert.equal(stats.failureDiagnostics.recent[0].code, 'JWEB_STRUCTURAL_FEASIBILITY_REJECTED');
assert.match(stats.failureDiagnostics.recent[0].message, /synthetic structural-feasibility rejection/);
await streamer.dispose();
console.log('[world-chunk-failure-diagnostics-selftest] PASS', stats.failureDiagnostics);
