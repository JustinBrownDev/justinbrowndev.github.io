import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const main = read('main.js');
const music = read('systems/music-player.js');
const signatures = read('world/signature-buildings.js');
const buildings = read('world/building-construction.js');
const facade = read('world/facade-layout.js');
const chunks = read('infinite-city-chunks.js');
const streamer = read('world-chunk-streamer.js');
const chunkEnrichment = read('world/infinite-chunk-enrichment.js');
const failures = [];
const ok = (value, message) => { if (!value) failures.push(message); };

ok(!main.includes('createOscillator('), 'procedural oscillator audio must remain removed');
ok(!main.includes('new AudioContext(') && !main.includes('new webkitAudioContext('), 'startup WebAudio tone graph must remain removed');
ok(main.includes("import { createMusicPlayer } from './systems/music-player.js';"), 'lo-fi music player module is not wired');
ok(main.includes("#escapeSiteButton, #parameterEditorRoot, #musicPlayer"), 'music UI must be exempt from pointer-lock capture');
ok(music.includes("audio.preload = 'none';"), 'music must not preload against structural world construction');
ok(music.includes('const TRACKS = [') && music.includes("layer: 'undercity'") && music.includes("layer: 'street'") && music.includes("layer: 'upper'") && music.includes("layer: 'heaven'"), 'music playlist must retain world-layer mapping');

ok(main.includes('const PROGRESSIVE_PIXEL_RATIO = Math.min(1, TARGET_PIXEL_RATIO);'), 'progressive render resolution cap missing');
ok(main.includes('bloomPass.enabled = false;'), 'bloom must remain disabled during structural progressive phase');
ok(main.includes('function restoreFinalRenderQuality()'), 'final render-quality restoration hook missing');
const warmAt = main.indexOf('while (!worldChunkStreamer.stats().localRenderRing.complete)');
const prepareAt = main.indexOf('const materialRefinementStart = materialRefinementController.prepare();');
ok(warmAt >= 0 && prepareAt > warmAt, 'authored material refinement must wait until the playable chunk ring is warm');
ok(main.includes('maxReveals: 1, maxMillis: 2'), 'cosmetic reveal refinement must remain bounded per frame');

ok(signatures.includes('function* buildArtGallerySteps(site)') && signatures.includes('function* buildAS400ArchiveSteps(site)') && signatures.includes('function* buildJustinIndexSteps(site)') && signatures.includes('function* buildSystemsWorkshopSteps(site)') && signatures.includes('function* buildLoreShrineSteps(site)'), 'signature landmarks must remain resumable generators');
ok(buildings.includes('function* addBuildingSiteSteps(site)') && buildings.includes("yield { phase: 'facade-sign'"), 'ordinary authored buildings must retain resumable semantic steps');
ok(facade.includes('function* placeSignsOnFacadeSteps(') && facade.includes('yield { signIndex: i, placed }'), 'facade sign generation must remain interruptible below whole-facade granularity');

// Infinite chunks use the same structural-first philosophy without smuggling frame sleeps
// into the millisecond-scale structural factory. Each payload owns deterministic local work.
ok(chunks.includes('enhancementRng: mulberry32(hashString32(`${buildingId}:structure-v2`))'), 'generic rich structure must be isolated behind stable entity-local RNG');
ok(chunks.includes('enrichment.initializePayload(chunk, payload)'), 'generic chunk must create its own progressive detail state before publication');
ok(chunks.includes('const refine = (chunk, payload, budget) => enrichment.pump(chunk, payload, budget)'), 'generic chunk must expose resumable local refinement');
ok(!chunks.includes('requestAnimationFrame('), 'generic structural factory must not contain inner requestAnimationFrame sleeps');
ok(streamer.includes('nearestRefinableChunk') && streamer.includes('lastRefinedSerial'), 'outer streamer must fairly schedule independent chunk refinement turns');
ok(streamer.includes('readyWithinRadius(prefetchRadiusChunks).complete'), 'chunk cosmetics must wait for structural neighborhood warmth');
ok(chunkEnrichment.includes("kind: 'sign'") && chunkEnrichment.includes("kind: 'graffiti'") && chunkEnrichment.includes("kind: 'pipe'") && chunkEnrichment.includes("kind: 'awning'") && chunkEnrichment.includes("kind: 'ivy'"), 'infinite chunk enrichment must carry the authored-world facade vocabulary');
ok(chunkEnrichment.includes('pickMassiveNoisePair') && chunkEnrichment.includes('pickPoetryTag'), 'infinite signage/graffiti must use the packaged text corpus instead of placeholder labels');

if (failures.length) {
  console.error(`[progressive-runtime] FAIL (${failures.length})`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log('[progressive-runtime] PASS: bounded authored work + self-refining infinite chunks + structural-first rendering + opt-in lo-fi audio');
