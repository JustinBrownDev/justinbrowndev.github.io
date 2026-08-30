const fs = require('fs');
const assert = require('assert');

const read = p => fs.readFileSync(p, 'utf8');
const shared = read('world/kowloon-structure.js');
const spawn = read('world/spawn-district-plan.js');
const authored = read('world/building-construction.js');
const infinite = read('infinite-city-chunks.js');
const enrichment = read('world/infinite-chunk-enrichment.js');
const optimizer = read('city-performance.js');
const main = read('main.js');
const exciter = read('world/procedural-text-exciter.js');

assert.match(shared, /export function partitionKowloonCompounds\(/, 'shared compound partitioner missing');
assert.match(shared, /export function analyzeKowloonCompound\(/, 'shared compound topology analyzer missing');
assert.match(shared, /export function classifyKowloonEdge\(/, 'shared edge semantics missing');
assert.match(shared, /export function selectKowloonCourtyardCell\(/, 'shared courtyard\/lightwell selector missing');
assert.match(spawn, /partitionKowloonCompounds\(/, 'spawn ordinary fabric does not consume shared partitioner');
assert.match(spawn, /classifyKowloonEdge\(/, 'spawn edge ownership does not consume shared edge semantics');
assert.match(authored, /analyzeKowloonCompound\(/, 'authored builder does not consume shared compound topology');
assert.match(infinite, /partitionKowloonCompounds\(/, 'infinite fabric does not consume shared partitioner');
assert.match(infinite, /buildKowloonCompound\(/, 'infinite fabric does not render shared compound plans');
assert.match(infinite, /analyzeKowloonCompound\(/, 'infinite builder does not consume shared topology');
assert.doesNotMatch(infinite, /function\s+buildBuilding\s*\(/, 'legacy generic rectangle builder still exists under generic name');
const landmarkCalls = [...infinite.matchAll(/buildDistrictLandmarkTower\s*\(/g)].length;
assert.equal(landmarkCalls, 2, 'district landmark tower helper must have exactly one declaration and one call');
assert.match(infinite, /bridgeOpeningKeys/, 'upper-level bridge portals must be planned before walls');
assert.match(infinite, /serviceCageOpeningKeys/, 'service-cage circulation openings must be structural, not decorative');
assert.match(enrichment, /facadeIndex/, 'compound-aware enrichment must target real exposed module facades');
assert.match(exciter, /ACCRETION IS A BUILDING SYSTEM/, 'Kowloon design language missing from procedural text doctrine');
assert.match(exciter, /ROOFS ARE STREETS/, 'roof circulation doctrine missing');
assert.match(main, /staticWorldOptimizer\?\.markDirtyObject\(leaf\)/, 'shader-family pump no longer marks authored chunk dirty after staging');
const progressiveStart = optimizer.indexOf('export function createProgressiveStaticWorldOptimizer');
const legacyStart = optimizer.indexOf('export function createStaticWorldOptimizer');
assert(progressiveStart >= 0 && legacyStart > progressiveStart, 'optimizer function boundaries not found');
const progressiveBody = optimizer.slice(progressiveStart, legacyStart);
assert.match(progressiveBody, /markDirtyObject\(obj\)/, 'progressive optimizer does not expose markDirtyObject');
assert.match(progressiveBody, /worldChunkRoot/, 'progressive dirty marking must explicitly exclude streamed world roots');

console.log('[kowloon-consolidation-audit] PASS', {
  sharedPlanner: true,
  spawnUsesSharedPlanner: true,
  infiniteUsesSharedPlanner: true,
  genericRectangleFallback: false,
  districtLandmarkTowerCalls: landmarkCalls - 1,
  compoundAwareEnrichment: true,
  progressiveDirtyAPI: true,
});
