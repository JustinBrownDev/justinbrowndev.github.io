import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const homepage = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const synchronous = fs.readFileSync(path.join(root, 'synchronous', 'index.html'), 'utf8');
const testHtml = fs.readFileSync(path.join(here, 'index.html'), 'utf8');
const testBridge = fs.readFileSync(path.join(here, 'main.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const streamer = fs.readFileSync(path.join(root, 'world-chunk-streamer.js'), 'utf8');
const chunks = fs.readFileSync(path.join(root, 'infinite-city-chunks.js'), 'utf8');
const perf = fs.readFileSync(path.join(root, 'city-performance.js'), 'utf8');
const failures = [];
const ok = (v, msg) => { if (!v) failures.push(msg); };

ok(homepage.includes('src="./main.js"'), 'homepage must launch root streaming runtime');
ok(!homepage.includes('<base href="../">'), 'homepage must resolve assets from root');
ok(testHtml.includes('<base href="../">'), '/test must resolve root assets');
ok(testBridge.trim() === "import '../main.js';", '/test must be a zero-divergence bridge to root runtime');
ok(synchronous.includes('src="./synchronous/main.js"'), '/synchronous must launch preserved synchronous runtime');

for (const [name, html] of [['homepage', homepage], ['synchronous', synchronous], ['/test', testHtml]]) {
  ok(!/old site/i.test(html), `${name}: old-site link still present`);
  ok(!/photosensitive|epilepsyWarning/i.test(html.replace(/#epilepsyWarning[^}]*}/g, '')), `${name}: photosensitivity warning still present`);
}

// Spawn-chunk authoring still paints nearest real work first while it is the
// only startup chunk.
ok(main.includes('function buildingSiteDistanceSqToPlayer(site)'), 'spawn building priority helper missing');
ok(main.includes("await testYieldNow('streaming nearest real buildings'"), 'spawn buildings are not cooperatively painted nearest-first');
ok(main.includes("await testYieldNow('streaming nearest real streets/alleys'"), 'spawn ground is not cooperatively painted nearest-first');
ok(main.includes('sortPlacementRequestsNearestToPlayer'), 'spawn async model placements are not player-prioritized');
ok(main.includes('sortDecorationQueueNearPlayer'), 'spawn deferred decoration is not player-prioritized');

// After handoff the atomic scheduling unit is the chunk, not another world phase.
ok(streamer.includes('function nearestQueuedChunk()'), 'infinite stream nearest-chunk selector missing');
ok(streamer.includes('const d = chunkDistanceSq(chunk);'), 'chunk priority must use current player distance');
ok(main.includes('worldChunkStreamer?.pump({ maxChunks: 1 })'), 'runtime must admit one complete chunk per pump');
ok(chunks.includes('async function commit(chunk, payload)'), 'generic chunk must have atomic commit');
ok(chunks.includes('freezeChunkRoot(root);'), 'generic chunk must be optimized/frozen before commit');
ok(main.includes('commitChunk: (chunk, payload) => infiniteChunkFactory.commit(chunk, payload)'), 'streamer commit hook not wired');

ok(main.includes('createProgressiveStaticWorldOptimizer({'), 'spawn optimizer must remain cooperative');
ok(main.includes('await staticWorldOptimizer.optimize({'), 'spawn optimizer must be awaited before chunk 0,0 READY');
ok(perf.includes('optimizing static world · merging nearest chunks'), 'spawn optimizer lost nearest-chunk cooperative merge phase');

if (failures.length) {
  console.error(`[homepage-priority] FAIL (${failures.length})`);
  for (const f of failures) console.error(` - ${f}`);
  process.exit(1);
}
console.log('[homepage-priority] PASS: nearest spawn work -> atomic nearest chunk stream');
