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
];
for (const rel of retired) assert.equal(exists(rel), false, `retired source/tooling still present: ${rel}`);

assert.match(main, /createKowloonFabricEngine/);
assert.doesNotMatch(main, /building-construction|infinite-city-chunks|jweb-adapter|dual-polarity-player-physics/);
assert.match(fabric, /function\* buildKowloonCompoundSteps\(/);
assert.match(fabric, /async function buildKowloonCompoundCooperative\(/);
assert.doesNotMatch(fabric, /function buildKowloonCompound\(args\)/, 'synchronous compound wrapper should remain retired');
assert.match(fabric, /planBuildingSidecar\(/);
assert.match(fabric, /accessAnchorsForBuildingPortals\(accessPortals\)/);
assert.match(fabric, /districtComposition:\s*districtBuildingContext\s*\?\?\s*districtBuildingPolicy/);

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

console.log('[architectural-invariants-audit] PASS', {
  retiredEntries: retired.length,
  liveness: 'strict complete + scheduler settled; color never waits on ring completion',
  cityAuthority: 'KowloonFabricEngine cooperative path',
  codeLore: 'retired',
});
