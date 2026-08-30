import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const contract = fs.readFileSync(path.join(root, 'world-contract.js'), 'utf8');
const streamer = fs.readFileSync(path.join(root, 'world-chunk-streamer.js'), 'utf8');
const chunks = fs.readFileSync(path.join(root, 'infinite-city-chunks.js'), 'utf8');
const failures = [];
const ok = (condition, message) => { if (!condition) failures.push(message); };

ok(!fs.existsSync(path.join(root, 'test')), 'obsolete /test route must not exist');
ok(!fs.existsSync(path.join(root, 'synchronous')), 'obsolete /synchronous route must not exist');
ok(fs.existsSync(path.join(root, 'old', 'index.html')), 'regular /old website must remain available as escape target');

ok(main.includes("import * as BOOTSTRAP_NOISE from './noise-data-bootstrap.js';"), 'spawn path must use compact bootstrap corpus');
ok(!/^import .*noise-data-hard/m.test(main), 'full archival corpus must not be a static startup import');
ok(main.includes("import('./noise-data-hard.js')"), 'full archival local corpus must remain hydratable after runtime start');
ok(main.includes("import('./noise-data-remote.js')"), 'full archival remote corpus must remain hydratable after runtime start');
ok(main.includes("import('./noise-data-poetry.js')"), 'full archival poetry corpus must remain hydratable after runtime start');

ok(main.includes('cols: 13'), 'authored spawn district must remain compact');
ok(main.includes('rows: 13'), 'authored spawn district must remain compact');
ok(main.includes('const STREAM_CHUNK_SIZE = Math.max(GRID_W, GRID_H);'), 'stream chunk size must align exactly to authored spawn footprint');
ok(main.includes('grid[startRow][c] = false') && main.includes('grid[r][startCol] = false'), 'spawn district must expose real cardinal gateways to infinite neighbors');
ok(main.includes("const SIGNATURE_TYPES = ['artGallery', 'as400Archive', 'justinIndex', 'systemsWorkshop', 'loreShrine', 'futurePlaceholder'];"), 'spawn district must reserve five authored landmarks plus future slot');
ok(main.includes('entityId: singularEntityId(SEED, type)'), 'singulars must receive stable world identity');
ok(main.includes('createSpawnSingularManifest(SEED, signatureInstances)'), 'spawn singular manifest must be materialized into chunk 0,0');

ok(contract.includes('export const WORLD_FORMAT_VERSION = 1;'), 'world format must be explicitly versioned');
ok(contract.includes("export const SPAWN_CHUNK = Object.freeze({ x: 0, z: 0, key: '0,0' });"), 'spawn chunk identity must be stable at origin');
ok(contract.includes('export function worldChunkOwnerId'), 'chunk ownership ID contract missing');
ok(contract.includes('export function worldEntityId'), 'stable entity ID contract missing');
ok(contract.includes('export function worldWeirdnessAt'), 'distance weirdness contract missing');

ok(streamer.includes("UNLOADING: 'unloading'"), 'streamer must have reversible unload lifecycle');
ok(streamer.includes('createChunkDescriptor({'), 'streamer must consume renderer-agnostic chunk descriptors');
ok(streamer.includes('getPlayerHeading = null'), 'streamer must support heading-aware priority');
ok(streamer.includes('ensureNeighborhood();\n                const next = nearestQueuedChunk();'), 'long pumps must refresh the neighborhood between chunks');
ok(streamer.includes('chunks.delete(chunk.key)'), 'streamer must prune obsolete chunk metadata after unload/travel');
ok(streamer.includes('chunks.clear();'), 'streamer dispose must release all scheduler metadata');
ok(main.includes("pinnedChunkKeys: ['0,0']"), 'authored spawn/singular chunk must remain pinned');
ok(main.includes('commitChunk: (chunk, payload) => infiniteChunkFactory.commit(chunk, payload)'), 'generic chunks must build off-scene then commit atomically');
ok(chunks.includes('async function commit(chunk, payload)'), 'generic chunk factory must expose atomic commit seam');
ok(chunks.includes('worldChunkOwnerId'), 'generic physics/render ownership must use stable world IDs');
ok(chunks.includes('worldEntityId'), 'generic chunk metadata must expose stable entity IDs');
ok(chunks.includes('districtLandmarkFor'), 'repeatable district landmark contract missing');
ok(main.includes('landmarkSpacingChunks: 3') && main.includes('landmarkSpacingChunks: CONFIG.streaming.landmarkSpacingChunks'), 'district landmarks must recur every few chunks through cfg.streaming');
ok(chunks.includes('if (yieldControl &&'), 'generic off-scene construction must yield cooperatively');

ok(main.includes('createProgressiveStaticWorldOptimizer({'), 'spawn chunk optimizer must remain cooperative');
ok(main.includes("await testYieldNow('optimizing spawn chunk"), 'optimizer must be explicitly scoped to spawn chunk startup');
ok(main.includes('function pumpWorldChunksAggressively()'), 'live aggressive chunk streamer loop missing');
ok(main.includes('CONFIG.streaming.urgentPumpChunks') && main.includes('CONFIG.streaming.prefetchPumpChunks'), 'live stream must keep CPU busy until render/prefetch rings are warm');
ok(main.includes('prefetchRadiusChunks: CONFIG.streaming.prefetchRadiusChunks'), 'live stream must maintain a larger prefetch ring after handoff');
ok(!main.includes('worldChunkPumpTimer = 0.12'), 'old 120ms chunk drip-feed must remain removed');
const readyAt = main.indexOf('window.__boot?.ready();');
const animateAt = main.indexOf('\nanimate();', main.indexOf('Atomic handoff'));
const traversalScheduleAt = main.indexOf('scheduleTraversalValidation();');
ok(animateAt >= 0 && readyAt >= 0 && animateAt < readyAt, 'normal runtime must start before the startup overlay is dismissed');
ok(traversalScheduleAt > readyAt, 'traversal QA must be deferred until after first real interactivity');

ok(indexHtml.includes('id="bootTerminal"'), 'startup must use unified terminal presentation');
ok(indexHtml.includes('id="escapeSiteButton" href="./old/"'), 'startup must expose one clear escape to regular website');
ok(indexHtml.includes('Escape to regular website'), 'escape action label missing');
ok(!indexHtml.includes('continueWorld'), 'startup must not contain a redundant load/continue button');
ok(indexHtml.includes('data-stream="world"') && indexHtml.includes('data-stream="render"') && indexHtml.includes('data-stream="physics"') && indexHtml.includes('data-stream="data"'), 'terminal stream filters missing');
ok(indexHtml.includes('ORIGIN  rebasing seam reserved'), 'startup must describe floating-origin support as a reserved seam, not an implemented feature');
ok(!indexHtml.match(/Photosens/i), 'photosensitivity warning must remain removed');
ok(!indexHtml.match(/Old Site/i), 'old-site prompt must remain removed');

if (failures.length) {
  console.error(`[full-fidelity] FAIL (${failures.length})`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log('[full-fidelity] PASS: one root runtime, spawn-to-live handoff, aggressive infinite chunk stream');
