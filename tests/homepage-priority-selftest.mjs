import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const homepage = read('index.html');
const main = read('main.js');
const streamer = read('world-chunk-streamer.js');
const chunks = read('kowloon-fabric-engine.js');
const perf = read('city-performance.js');
const config = read('config/game-config.js');
const ground = read('world/ground-surfaces.js');
const adornment = read('systems/adornment-assets.js');
const failures = [];
const ok = (v, msg) => { if (!v) failures.push(msg); };

ok(homepage.includes('src="./main.js"'), 'homepage must launch the one root streaming runtime');
ok(!fs.existsSync(path.join(root, 'test')), 'obsolete /test route still exists');
ok(!fs.existsSync(path.join(root, 'synchronous')), 'obsolete /synchronous route still exists');
ok(homepage.includes('Escape to regular website'), 'regular-site escape action missing');
ok(!homepage.includes('The website loading'), 'redundant load-site choice still present');

ok(main.includes('function buildingSiteDistanceSqToPlayer(site)'), 'spawn building priority helper missing');
ok(main.includes("await testYieldNow('building minimum-safe authored neighborhood'") && main.includes('pumpAuthoredBuildingJobs({'), 'spawn buildings must hand off after a minimum-safe neighborhood and continue in live prioritized turns');
ok(ground.includes('function pumpOpenCellSurfaces(') && ground.includes('ensureOpenCellSurfaceNeighborhood'), 'spawn ground must expose a live nearest-first chunk pump plus minimum-safe readiness');
ok(adornment.includes('function sortPlacementRequestsNearestToPlayer(requests)'), 'spawn async model placements are not player-prioritized');
ok(main.includes('sortDecorationQueueNearPlayer'), 'spawn deferred decoration is not player-prioritized');

ok(streamer.includes('function chunkPriorityScore(chunk)'), 'heading-aware infinite stream priority helper missing');
ok(streamer.includes('const forwardDot ='), 'chunk priority must bias the player heading');
ok(streamer.includes('function nearestQueuedChunk()'), 'infinite stream nearest-chunk selector missing');
ok(main.includes('pumpWorldChunksAggressively();'), 'render loop must continuously service world streaming');
ok(main.includes('CONFIG.streaming.urgentPumpChunks') && main.includes('CONFIG.streaming.prefetchPumpChunks'), 'render ring must refill more aggressively than the old one-chunk timer');
ok(main.includes('renderRadiusChunks: CONFIG.streaming.renderRadiusChunks') && main.includes('prefetchRadiusChunks: CONFIG.streaming.prefetchRadiusChunks'), 'stream must maintain render + warm prefetch rings');
ok(chunks.includes('async function commit(chunk, payload)'), 'generic chunk must have atomic commit');
ok(chunks.includes('freezeChunkRoot(root);'), 'generic chunk must be optimized/frozen before commit');
ok(main.includes('commitChunk: (chunk, payload) => cityFabricEngine.commit(chunk, payload)'), 'streamer commit hook not wired');

ok(chunks.includes("districtLandmarkTypes = Object.freeze(['spire', 'stack', 'gatehouse', 'archive', 'beacon'])"), 'district landmark family missing');
ok(config.includes('landmarkSpacingChunks: 3'), 'district landmark recurrence must be frequent but not every chunk');
ok(main.includes('landmarkSpacingChunks: CONFIG.streaming.landmarkSpacingChunks'), 'district landmark spacing config is not wired into streamed chunks');
ok(chunks.includes("kind: 'district-landmark'"), 'district landmarks must be exposed in chunk entity metadata');

ok(main.includes('createProgressiveStaticWorldOptimizer({'), 'spawn optimizer must remain cooperative');
ok(main.includes('staticWorldOptimizer.beginIncremental();'), 'spawn optimizer must begin incremental batching before authored construction');
ok(main.includes('staticWorldOptimizer.optimizeNearestDirtyChunk(') && perf.includes('function optimizeNearestDirtyChunk('), 'spawn sites must optimize nearest dirty authored chunks incrementally during live runtime');
const animateAt = main.indexOf('\nanimate();');
const finalizeAt = main.indexOf('await staticWorldOptimizer.finalizeIncremental({');
ok(animateAt >= 0 && finalizeAt > animateAt, 'expensive final optimizer refinement must occur after live runtime handoff');
ok(perf.includes('optimizing static world · merging nearest chunks'), 'spawn optimizer lost nearest-chunk cooperative merge phase');

if (failures.length) {
  console.error(`[homepage-priority] FAIL (${failures.length})`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log('[homepage-priority] PASS: modular nearest spawn work -> live handoff -> continuous heading-aware chunk stream');
