const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const exists = rel => fs.existsSync(path.join(root, rel));
const main = read('main.js');
const fabric = read('kowloon-fabric-engine.js');
const streamer = read('world-chunk-streamer.js');
const playerCentered = read('world/player-centered-streaming.js');
const streetProps = read('world/street-props.js');
const signage = read('world/signage.js');
const performance = read('city-performance.js');
const adornment = read('systems/adornment-assets.js');
const buildingPlan = read('world/architecture/building-plan-sidecar.js');
const semanticLayout = read('world/semantic-layout.js');
const semanticContext = read('world/semantic-context.js');
const semanticPlacement = read('world/semantic-placement.js');
const frontageBinding = read('world/frontage-semantic-binding.js');
const spatialClaims = read('world/spatial-claims.js');

const retired = [
  'world/building-construction.js',
  'world/vertical-circulation.js',
  'world/building-shell.js',
  'world/inverted-tower-field.js',
  'world/dual-polarity-player-physics.js',
  'world/infinite-chunk-enrichment.js',
  'infinite-city-chunks.js',
  'content/photo-catalog.js',
  'world/architecture/jweb-adapter.js',
  'content/code-lore',
  'code-lore-comment-audit.cjs',
  'tools/harvest-code-lore.cjs',
  'one-way-total-audit.cjs',
  'kowloon-consolidation-audit.cjs',
  'tdz-generation-audit.cjs',
  'tdz-boot-audit.cjs',
  'runtime-handoff-audit.cjs',
  'systems/material-refinement.js',
  'streaming-architecture-audit.cjs',
  'progressive-spawn-checkpoint-audit.cjs',
];
for (const rel of retired) assert.equal(exists(rel), false, `retired source/tooling still present: ${rel}`);

// One current city-builder authority. Historical implementation/reference files are gone.
assert.match(main, /createKowloonFabricEngine/);
assert.doesNotMatch(main, /building-construction|infinite-city-chunks|jweb-adapter|dual-polarity-player-physics/);
assert.match(fabric, /function\* buildKowloonCompoundSteps\(/);
assert.match(fabric, /async function buildKowloonCompoundCooperative\(/);
assert.doesNotMatch(fabric, /function buildKowloonCompound\(args\)/, 'synchronous compound wrapper should remain retired');
assert.doesNotMatch(fabric, /runCompoundStepperToCompletion/, 'retired synchronous drain helper must not survive as a dangling reference');
assert.match(fabric, /function buildAuthoredSite\(args = \{\}\)[\s\S]*?const stepper = buildAuthoredSiteSteps\(args\)/,
  'direct authored-site compatibility seam must drain the canonical stepped builder');
assert.match(fabric, /planBuildingSidecarSteps/);
assert.match(fabric, /yield\* getOrCompileBuildingPlanSteps/);
assert.match(buildingPlan, /export function\* planBuildingSidecarSteps\(/);
assert.match(semanticLayout, /export function\* solveSemanticLayoutSteps\(/);
assert.match(semanticContext, /export function\* compileSemanticContextSteps\(/);
assert.match(semanticPlacement, /export function\* resolveSemanticPlacementSteps\(/);
assert.match(frontageBinding, /export function\* bindFrontageSemanticTruthSteps\(/);
assert.match(spatialClaims, /claimWithoutDisplacement\(claim\)/);
assert.match(fabric, /accessAnchorsForBuildingPortals\(accessPortals\)/);
assert.match(fabric, /districtComposition:\s*districtBuildingContext\s*\?\?\s*districtBuildingPolicy/);

// Streaming authority remains explicit even though pixels may now be provisional while BUILDING.
assert.match(main, /directSceneAdd:\s*_origSceneAdd/);
assert.match(fabric, /worldChunkRoot/);
assert.match(fabric, /renderAuthority = 'KowloonFabricEngine'/);
assert.match(fabric, /streamAuthority = 'WorldChunkStreamer'/);
assert.match(fabric, /addStreamRoot\(payload\.root\)/);
assert.doesNotMatch(fabric.match(/async function commit\(chunk, payload\)[\s\S]*?\n    \}/)?.[0] ?? '', /scene\.add\(payload\.root\)/,
  'authoritative streamed root must bypass intercepted scene.add');
assert.ok((performance.match(/worldChunkRoot/g) || []).length >= 8,
  'static optimizer must explicitly exclude streamed world roots');
assert.match(streamer, /setChunkVisibility/);
assert.match(streamer, /verifyChunkReady/);
assert.match(streamer, /verifyChunkReady\) await verifyChunkReady/,
  'READY verification must run before READY publication');
assert.doesNotMatch(fabric, /GLTFLoader|fetch\s*\(|new Image\s*\(/,
  'structural chunk generation must stay free of network/decode dependencies');

// BUILDING preview: render-only, bounded, and always replaced before authority commit.
assert.match(fabric, /speculativeVisualOnly = true/);
assert.match(fabric, /collisionAuthority = 'none'/);
assert.match(fabric, /traversalAuthority = 'none'/);
assert.match(fabric, /discardSpeculativePreview\(chunk, 'commit-start'\)/);
assert.match(fabric, /discardSpeculativePreview\(chunk, 'build-failed'\)/);
assert.match(fabric, /MAX_SPECULATIVE_PREVIEW_GROUPS = 24/);
assert.match(fabric, /SPECULATIVE_PREVIEW_YIELD_STRIDE = 4/);
assert.match(streamer, /provisionalRenderRequested = shouldBeVisible\(chunk, playerChunkCoords\(\)\)/);

// Strict readiness is truth; scheduler settlement is liveness. Color never waits for a ring-wide paint event.
assert.match(streamer, /settled:\s*ready \+ failed === total/);
assert.match(streamer, /floorSettled:\s*ready \+ failed === total/);
assert.match(main, /renderSettled:\s*!!stats\?\.localRenderRing\.settled/);
assert.match(main, /visibleFirstPassSettled:\s*!!stats\?\.localRenderRefinement\?\.floorSettled/);
assert.match(main, /prefetchSettled:\s*!!stats\?\.localPrefetchRing\.settled/);
assert.doesNotMatch(main, /materialRefinementController|bootstrapPreviewOverrideActive|scene\.overrideMaterial = bootstrapPreviewMaterial/);
assert.match(main, /function bootstrapPreviewMaterialFor\(/);
assert.match(main, /leaf\.material = bootstrapPreviewForLeaf\(leaf, originalMaterial\)/);
assert.match(main, /visual\.publish-speculative/);
assert.match(playerCentered, /renderSettled = undefined/);

// Asset/enrichment scheduling keeps locality and liveness without resurrecting the old exact staging order.
assert.match(adornment, /createPriorityLoadQueue/);
assert.match(adornment, /paused:\s*true/);
assert.match(main, /maybeOpenAuthoredAssetLane/);
assert.match(main, /setConcurrency\(QP\[1024\]\)/);
assert.match(main, /syncAuthoredBackgroundQueueLocality\(playerNearSpawn\)/);
assert.match(main, /worldStats\.localPrefetchRing\.settled/);
assert.match(main, /_spawnDistrictStructuresComplete/);
assert.match(main, /setConcurrency\(CONFIG\.streaming\.adornmentConcurrency\)/);
assert.match(main, /const refineFirst = structureIncomplete/);
assert.match(main, /minimum-safe authored neighborhood/);
assert.match(main, /authoredBuildingsCompletePromise/);
assert.match(main, /authoredPostStructureCompletePromise/);

// One commit lifecycle covers authored sites, links, surfaces, and generic chunks.
for (const builder of ['buildAuthoredSite', 'buildAuthoredBridge', 'buildAuthoredSurfacePatch']) {
  assert.match(fabric, new RegExp(`function ${builder}\\(`), `${builder} must remain on common fabric authority`);
}
assert.match(fabric, /async function commit\(chunk, payload\)/);
assert.match(main, /commitChunk:\s*\(chunk, payload\) => cityFabricEngine\.commit\(chunk, payload\)/);
assert.doesNotMatch(main, /markChunkReady\(/, 'WorldChunkStreamer must remain the READY-state authority');

for (const stale of [
  'getPoetryShort', 'getPoetryMedium', 'getPickPoetryTag', 'addFissureCrack', 'addWantedPoster',
  'pickCityNoisePair', 'pickInkColor', 'pickNetworkNoise', 'pickPaperColor', 'pickTextFont', 'placeRealModel',
]) assert.doesNotMatch(streetProps, new RegExp(`\\b${stale}\\b`), `street-props still accepts dead capability ${stale}`);
assert.doesNotMatch(signage, /fitCanvasText|drawCanvasLines|SIGN_BORDER_STYLES|SIGN_BACKINGS|SIGN_FONTS/);

for (const dead of [
  'makeTopologyStainTexture', 'runWithStableStreamingRng', 'sortBuildingSitesNearestToPlayer',
  'validateFacadeOccupancy', 'authoredPostOneShotSteps', 'wallAnchorForOpenCell', 'clearSpotAlongWall',
  'findCornerDirs', 'throughAxis', 'findClearSpot',
]) assert.doesNotMatch(main, new RegExp(`function\\s*\\*?\\s+${dead}\\b`), `dead main helper survived: ${dead}`);

assert.equal(exists('test'), false, '/test runtime path must remain retired');
assert.equal(exists('synchronous'), false, '/synchronous runtime path must remain retired');
assert.equal(exists('old/index.html'), true, '/old escape site must remain present');

console.log('[architectural-invariants-audit] PASS', {
  retiredEntries: retired.length,
  liveness: 'strict complete + scheduler settled; color never waits on ring completion',
  buildPublication: 'visible-ring BUILDING previews are bounded/render-only and replaced before commit',
  authority: 'final render + physics + traversal + READY remain atomic',
  cityAuthority: 'KowloonFabricEngine cooperative path',
  codeLore: 'retired',
});
