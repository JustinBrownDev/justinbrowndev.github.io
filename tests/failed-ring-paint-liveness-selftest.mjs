import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHUNK_STATE, createWorldChunkStreamer } from '../world-chunk-streamer.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8').replace(/\r\n/g, '\n');

assert.ok(main.includes('materialRing.complete || materialRing.terminalSettled'),
  'material/color handoff must accept terminally settled visible rings');
assert.ok(main.includes('stats?.localRenderRing.complete || stats?.localRenderRing.terminalSettled'),
  'streaming gear must advance around terminal visible chunk failures');
assert.ok(main.includes('stats?.localRenderRefinement?.floorComplete || stats?.localRenderRefinement?.terminalFloorSettled'),
  'first-pass gear must advance around terminal visible chunk failures');
assert.ok(main.includes('stats?.localPrefetchRing.complete || stats?.localPrefetchRing.terminalSettled'),
  'prefetch gear must advance around terminal chunk failures');
assert.ok(main.includes('worldStats.localPrefetchRing.complete || worldStats.localPrefetchRing.terminalSettled'),
  'background enrichment must not wait forever on terminal prefetch failures');

const streamer = createWorldChunkStreamer({
  chunkSize: 64,
  worldSeed: 0x21f00d,
  getPlayerPosition: () => ({ x: 0, z: 0 }),
  renderRadiusChunks: 1,
  prefetchRadiusChunks: 1,
  retentionRadiusChunks: 2,
  buildChunk: async chunk => {
    if (chunk.key === '1,0') {
      const error = new Error('intentional visible chunk failure for paint-liveness regression');
      error.code = 'TEST_VISIBLE_FAILURE';
      throw error;
    }
    return { key: chunk.key };
  },
});

for (let z = -1; z <= 1; z++) {
  for (let x = -1; x <= 1; x++) {
    if (x === 1 && z === 0) continue;
    streamer.markChunkReady(x, z, { key: String(x) + ',' + String(z) });
  }
}
streamer.ensureNeighborhood();
const failedChunk = streamer.chunks.get('1,0');
assert.ok(failedChunk, 'fixture must queue the intentionally failing visible chunk');
await assert.rejects(() => streamer.buildOne(failedChunk, 'paint-liveness-regression'), /intentional visible chunk failure/);
assert.equal(failedChunk.state, CHUNK_STATE.FAILED);

const stats = streamer.stats();
assert.equal(stats.localRenderRing.complete, false, 'strict render readiness must remain false when geometry failed');
assert.equal(stats.localRenderRing.failed, 1);
assert.equal(stats.localRenderRing.terminalSettled, true, 'presentation must be allowed to escape purgatory after terminal failure');
assert.equal(stats.localPrefetchRing.complete, false, 'strict structural prefetch truth must remain false');
assert.equal(stats.localPrefetchRing.terminalSettled, true, 'scheduler may advance once every prefetch slot is READY or FAILED');
assert.equal(stats.localRenderRefinement.floorComplete, false, 'strict first-pass truth must remain false');
assert.equal(stats.localRenderRefinement.terminalFloorSettled, true, 'visible refinement gear may advance around terminal failure');

await streamer.dispose();
console.log('[failed-ring-paint-liveness] PASS: terminal chunk failure cannot deadlock global material/color progression');
