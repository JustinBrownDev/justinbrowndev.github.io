import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const streamer = fs.readFileSync(path.join(root, 'world-chunk-streamer.js'), 'utf8');
const chunks = fs.readFileSync(path.join(root, 'infinite-city-chunks.js'), 'utf8');
const perf = fs.readFileSync(path.join(root, 'city-performance.js'), 'utf8');
const failures = [];
const ok = (v, msg) => { if (!v) failures.push(msg); };

ok(homepage.includes('src="./main.js"'), 'homepage must launch the one root streaming runtime');
ok(!fs.existsSync(path.join(root, 'test')), 'obsolete /test route still exists');
ok(!fs.existsSync(path.join(root, 'synchronous')), 'obsolete /synchronous route still exists');
ok(homepage.includes('Escape to regular website'), 'regular-site escape action missing');
ok(!homepage.includes('The website loading'), 'redundant load-site choice still present');

// Spawn authoring paints nearest real work first while it is the only startup gate.
ok(main.includes('function buildingSiteDistanceSqToPlayer(site)'), 'spawn building priority helper missing');
ok(main.includes("await testYieldNow('streaming nearest real buildings'"), 'spawn buildings are not cooperatively painted nearest-first');
ok(main.includes("await testYieldNow('streaming nearest real streets/alleys'"), 'spawn ground is not cooperatively painted nearest-first');
ok(main.includes('sortPlacementRequestsNearestToPlayer'), 'spawn async model placements are not player-prioritized');
ok(main.includes('sortDecorationQueueNearPlayer'), 'spawn deferred decoration is not player-prioritized');

// After handoff, chunk streaming is continuous and spatially prioritized.
ok(streamer.includes('function chunkPriorityScore(chunk)'), 'heading-aware infinite stream priority helper missing');
ok(streamer.includes('const forwardDot ='), 'chunk priority must bias the player heading');
ok(streamer.includes('function nearestQueuedChunk()'), 'infinite stream nearest-chunk selector missing');
ok(main.includes('pumpWorldChunksAggressively();'), 'render loop must continuously service world streaming');
ok(main.includes('CONFIG.streaming.urgentPumpChunks') && main.includes('CONFIG.streaming.prefetchPumpChunks'), 'render ring must refill more aggressively than the old one-chunk timer');
ok(main.includes('renderRadiusChunks: CONFIG.streaming.renderRadiusChunks') && main.includes('prefetchRadiusChunks: CONFIG.streaming.prefetchRadiusChunks'), 'stream must maintain render + warm prefetch rings');
ok(chunks.includes('async function commit(chunk, payload)'), 'generic chunk must have atomic commit');
ok(chunks.includes('freezeChunkRoot(root);'), 'generic chunk must be optimized/frozen before commit');
ok(main.includes('commitChunk: (chunk, payload) => infiniteChunkFactory.commit(chunk, payload)'), 'streamer commit hook not wired');

// Recurring landmarks are deterministic ordinary chunk content, not new singulars.
ok(chunks.includes("districtLandmarkTypes = Object.freeze(['spire', 'stack', 'gatehouse', 'archive', 'beacon'])"), 'district landmark family missing');
ok(main.includes('landmarkSpacingChunks: 3'), 'district landmark recurrence must be frequent but not every chunk');
ok(chunks.includes("kind: 'district-landmark'"), 'district landmarks must be exposed in chunk entity metadata');

ok(main.includes('createProgressiveStaticWorldOptimizer({'), 'spawn optimizer must remain cooperative');
ok(main.includes('await staticWorldOptimizer.optimize({'), 'spawn optimizer must be awaited before chunk 0,0 READY');
ok(perf.includes('optimizing static world · merging nearest chunks'), 'spawn optimizer lost nearest-chunk cooperative merge phase');

if (failures.length) {
  console.error(`[homepage-priority] FAIL (${failures.length})`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log('[homepage-priority] PASS: nearest spawn work -> continuous heading-aware chunk stream');
