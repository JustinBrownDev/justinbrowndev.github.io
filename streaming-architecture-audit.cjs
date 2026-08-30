const fs = require('fs');
const path = require('path');

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function read(name) { return fs.readFileSync(path.join(__dirname, name), 'utf8'); }

const main = read('main.js');
const chunks = read('kowloon-fabric-engine.js');
const perf = read('city-performance.js');
const streamer = read('world-chunk-streamer.js');
const adornment = read('systems/adornment-assets.js');

assert(/directSceneAdd:\s*_origSceneAdd/.test(main), 'main must give infinite chunks an explicit raw scene commit path');
assert(/worldChunkRoot/.test(chunks) && /renderAuthority\s*=\s*'KowloonFabricEngine'/.test(chunks) && /streamAuthority\s*=\s*'WorldChunkStreamer'/.test(chunks), 'streamed roots need explicit ownership metadata');
const commitBody = chunks.match(/async function commit\(chunk, payload\) \{[\s\S]*?\n    \}/)?.[0] || '';
assert(/addStreamRoot\(payload\.root\)/.test(commitBody), 'infinite commit must use direct stream-root add');
assert(!/scene\.add\(payload\.root\)/.test(commitBody), 'infinite commit must not use intercepted scene.add');
assert((perf.match(/worldChunkRoot/g) || []).length >= 8, 'both legacy optimizer variants must explicitly exclude worldChunkRoot');
assert(/setChunkVisibility/.test(streamer) && /verifyChunkReady/.test(streamer), 'streamer must own visibility and READY verification');
assert(/verifyChunkReady\) await verifyChunkReady/.test(streamer), 'READY verification must run before READY state publication');
assert(!/GLTFLoader|fetch\s*\(|new Image\s*\(/.test(chunks), 'structural infinite chunk factory must have no network/decode dependency');
assert(/createPriorityLoadQueue/.test(adornment) && /paused:\s*true/.test(adornment), 'non-structural asset queue must begin paused before runtime handoff');
assert(/maybeOpenAuthoredAssetLane/.test(main) && /setConcurrency\(QP\[1024\]\)/.test(main), 'near-player authored assets need an early concurrency-1 lane');
assert(/localPrefetchRing\.complete/.test(main) && /_spawnDistrictStructuresComplete/.test(main) && /setConcurrency\(CONFIG\.streaming\.adornmentConcurrency\)/.test(main), 'full authored asset concurrency must wait for warm local prefetch plus authored structural completion');
assert(/syncAuthoredBackgroundQueueLocality\(playerNearSpawn\)/.test(main), 'authored asset locality must follow physical spawn proximity, never streaming gear');
assert(/const refineFirst = structureIncomplete/.test(main), 'visible refinement must run before atomic visible-structure builds can overrun the budget');
assert(/if \(playerNearSpawn\) updateDecorationStreaming\(delta\)/.test(main), 'nearby decoration streaming must not wait for authored district completion');
assert(!fs.existsSync(path.join(__dirname, 'test')), '/test runtime path must remain deleted');
assert(!fs.existsSync(path.join(__dirname, 'synchronous')), '/synchronous runtime path must remain deleted');
assert(fs.existsSync(path.join(__dirname, 'old', 'index.html')), '/old escape site must remain present');

console.log('[streaming-architecture-audit] PASS', {
  directCommit: true,
  optimizerExclusions: (perf.match(/worldChunkRoot/g) || []).length,
  earlyAdornmentLane: true,
  fullAdornmentGate: true,
  refineBeforeAtomicBuild: true,
  decorationLocalityLane: true,
  alternateRuntimeRoutes: false,
});
