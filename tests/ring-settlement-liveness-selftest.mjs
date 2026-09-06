import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHUNK_STATE, createWorldChunkStreamer } from '../world-chunk-streamer.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8').replace(/\r\n/g, '\n');

assert.ok(!main.includes('if (materialRing.settled)'), 'color publication must not wait for neighborhood settlement anymore');
assert.ok(main.includes('function bootstrapPreviewMaterialFor('), 'color publication must use per-object compile proxies instead of a ring-wide paint handoff');
assert.ok(main.includes('renderSettled: !!stats?.localRenderRing.settled'), 'streaming gear must consume render settlement');
assert.ok(main.includes('visibleFirstPassSettled: !!stats?.localRenderRefinement?.floorSettled'), 'first-pass gear must consume floor settlement');
assert.ok(main.includes('prefetchSettled: !!stats?.localPrefetchRing.settled'), 'prefetch gear must consume structural settlement');
assert.ok(main.includes('worldStats.localPrefetchRing.settled'), 'background enrichment must use prefetch settlement');

const streamer = createWorldChunkStreamer({
  chunkSize: 64,
  worldSeed: 0x21f00d,
  getPlayerPosition: () => ({ x: 0, z: 0 }),
  renderRadiusChunks: 1,
  prefetchRadiusChunks: 1,
  retentionRadiusChunks: 2,
  buildChunk: async chunk => {
    if (chunk.key === '1,0') {
      const error = new Error('intentional visible chunk failure for settlement regression');
      error.code = 'TEST_VISIBLE_FAILURE';
      throw error;
    }
    return { key: chunk.key };
  },
});

for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) {
  if (x === 1 && z === 0) continue;
  streamer.markChunkReady(x, z, { key: `${x},${z}` });
}
streamer.ensureNeighborhood();
const failedChunk = streamer.chunks.get('1,0');
await assert.rejects(() => streamer.buildOne(failedChunk, 'settlement-regression'), /intentional visible chunk failure/);
assert.equal(failedChunk.state, CHUNK_STATE.FAILED);

const stats = streamer.stats();
assert.equal(stats.localRenderRing.complete, false, 'strict render readiness remains false');
assert.equal(stats.localRenderRing.failed, 1);
assert.equal(stats.localRenderRing.settled, true, 'render scheduling settles after READY/FAILED resolution');
assert.equal(stats.localPrefetchRing.complete, false, 'strict structural readiness remains false');
assert.equal(stats.localPrefetchRing.settled, true, 'prefetch scheduling settles after READY/FAILED resolution');
assert.equal(stats.localRenderRefinement.floorComplete, false, 'strict first-pass completeness remains false');
assert.equal(stats.localRenderRefinement.floorSettled, true, 'first-pass scheduling settles around terminal failure');

await streamer.dispose();
console.log('[ring-settlement-liveness] PASS: strict readiness stays strict while scheduling cannot deadlock on terminal failures');
