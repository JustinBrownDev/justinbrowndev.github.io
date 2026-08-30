const fs = require('fs');
const path = require('path');

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function read(name) { return fs.readFileSync(path.join(__dirname, name), 'utf8'); }

const main = read('main.js');
const chunks = read('infinite-city-chunks.js');
const perf = read('city-performance.js');
const streamer = read('world-chunk-streamer.js');

assert(/directSceneAdd:\s*_origSceneAdd/.test(main), 'main must give infinite chunks an explicit raw scene commit path');
assert(/worldChunkRoot/.test(chunks) && /renderAuthority\s*=\s*'WorldChunkStreamer'/.test(chunks), 'streamed roots need explicit ownership metadata');
const commitBody = chunks.match(/async function commit\(chunk, payload\) \{[\s\S]*?\n    \}/)?.[0] || '';
assert(/addStreamRoot\(payload\.root\)/.test(commitBody), 'infinite commit must use direct stream-root add');
assert(!/scene\.add\(payload\.root\)/.test(commitBody), 'infinite commit must not use intercepted scene.add');
assert((perf.match(/worldChunkRoot/g) || []).length >= 8, 'both legacy optimizer variants must explicitly exclude worldChunkRoot');
assert(/setChunkVisibility/.test(streamer) && /verifyChunkReady/.test(streamer), 'streamer must own visibility and READY verification');
assert(/verifyChunkReady\) await verifyChunkReady/.test(streamer), 'READY verification must run before READY state publication');
assert(!/GLTFLoader|fetch\s*\(|new Image\s*\(/.test(chunks), 'structural infinite chunk factory must have no network/decode dependency');
assert(/createPriorityLoadQueue/.test(main) && /paused:\s*true/.test(main), 'non-structural asset queue must begin paused');
assert(/localPrefetchRing\.complete/.test(main) && /adornmentLoadQueue\.resume\(\)/.test(main), 'adornment network must release only after structural prefetch is warm');
assert(!fs.existsSync(path.join(__dirname, 'test')), '/test runtime path must remain deleted');
assert(!fs.existsSync(path.join(__dirname, 'synchronous')), '/synchronous runtime path must remain deleted');
assert(fs.existsSync(path.join(__dirname, 'old', 'index.html')), '/old escape site must remain present');

console.log('[streaming-architecture-audit] PASS', {
  directCommit: true,
  optimizerExclusions: (perf.match(/worldChunkRoot/g) || []).length,
  boundedAdornmentQueue: true,
  alternateRuntimeRoutes: false,
});
