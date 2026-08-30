const fs = require('fs');
const assert = require('assert');
const read = p => fs.readFileSync(p, 'utf8');

const main = read('main.js');
const engine = read('kowloon-fabric-engine.js');
const compat = read('infinite-city-chunks.js');
const shared = read('world/kowloon-structure.js');
const districtPlan = read('world/kowloon-district-plan.js');
const spawnPlan = read('world/spawn-district-plan.js');
const ground = read('world/ground-surfaces.js');
const authoredHelpers = read('world/authored-content-helpers.js');
const enrichment = read('world/kowloon-fabric-enrichment.js');
const optimizer = read('city-performance.js');
const exciter = read('world/procedural-text-exciter.js');
const signature = read('world/signature-buildings.js');

// One shared structural grammar.
for (const symbol of ['partitionKowloonCompounds', 'analyzeKowloonCompound', 'classifyKowloonEdge', 'selectKowloonCourtyardCell']) {
  assert.match(shared, new RegExp(`export function ${symbol}\\(`), `shared ${symbol} missing`);
}
assert.match(spawnPlan, /partitionKowloonCompounds\(/, 'spawn planning does not use shared compound partitioner');
assert.match(spawnPlan, /classifyKowloonEdge\(/, 'spawn planning does not use shared edge semantics');

// One maze/district topology algorithm: origin and infinity differ only by recipe inputs.
assert.match(districtPlan, /export function createKowloonMazeTopology\(/, 'canonical district topology planner missing');
assert.match(spawnPlan, /createKowloonMazeTopology\(/, 'spawn still owns a separate maze algorithm');
assert.match(engine, /createKowloonMazeTopology\(/, 'outer chunks still own a separate road algorithm');
assert.doesNotMatch(engine, /function carveManhattan\(/, 'retired outer Manhattan-hub topology returned');

// One canonical runtime geometry authority, neutrally named.
assert.match(engine, /export function createKowloonFabricEngine\(/, 'canonical KowloonFabricEngine export missing');
assert.doesNotMatch(engine, /export const createInfiniteCityChunkFactory/, 'canonical engine still exports an infinite-only factory name');
assert.match(main, /from '\.\/kowloon-fabric-engine\.js'/, 'runtime does not import neutral canonical fabric engine');
assert.doesNotMatch(main, /from '\.\/infinite-city-chunks\.js'/, 'runtime still imports infinite-only compatibility entrypoint');
assert.match(compat, /createKowloonFabricEngine as createInfiniteCityChunkFactory/, 'compatibility entrypoint should only alias canonical engine');
assert.doesNotMatch(compat, /function\s+build/, 'compatibility entrypoint contains construction logic');

// Historical structural systems may remain as reference files, but cannot be in the runtime graph.
for (const forbidden of ['building-construction.js', 'vertical-circulation.js', 'building-shell.js']) {
  assert.ok(!main.includes(forbidden), `runtime still imports legacy structural module ${forbidden}`);
}
for (const forbiddenSymbol of ['createBuildingConstructionSystem', 'createVerticalCirculationSystem', 'createBuildingShellSystem', 'buildRooftopCatwalkSteps', 'buildHangingBridgeSteps']) {
  assert.ok(!main.includes(forbiddenSymbol), `runtime still references legacy structural symbol ${forbiddenSymbol}`);
}

// Ordinary authored spawn and streamed infinity use the SAME engine instance and compound builder.
assert.match(main, /cityFabricEngine = createKowloonFabricEngine\(/, 'common engine instance missing');
assert.match(main, /function\* buildUnifiedKowloonSiteSteps\(/, 'ordinary spawn unified adapter missing');
assert.match(main, /cityFabricEngine\.buildAuthoredSite\(/, 'ordinary spawn does not call common engine');
assert.match(main, /buildChunk:\s*chunk\s*=>\s*chunk\.key === '0,0' \? authoredOriginChunkPayload : cityFabricEngine\.build\(chunk\)/, 'streamed chunks and the authored origin are not dispatched through the same streamer/engine instance');
assert.match(engine, /function buildKowloonCompound\(/, 'single compound builder missing');
assert.match(engine, /function buildAuthoredSite\([\s\S]*buildKowloonCompound\(/, 'authored site path bypasses common compound builder');
assert.doesNotMatch(engine, /function\s+buildBuilding\s*\(/, 'generic rectangle building fallback returned');

// Singular landmark shells are profiles over the same engine; recipe code may add content only.
assert.match(main, /function\* buildUnifiedSignatureSiteSteps\(/, 'signature shell adapter missing');
assert.match(main, /signatureFabricProfile\(/, 'signature structure profile missing');
assert.match(main, /addBuildingModuleSteps:\s*unifiedSignatureModuleAdapterSteps/, 'signature content recipe not bound to metadata-only module adapter');
assert.match(main, /function\* unifiedSignatureModuleAdapterSteps\(/, 'signature metadata adapter missing');
assert.doesNotMatch(main.match(/function\* unifiedSignatureModuleAdapterSteps\([\s\S]*?\n\}/)?.[0] || '', /scene\.add|buildCoreFloor|buildKowloonCompound|new THREE\.Mesh/, 'signature metadata adapter emits geometry');
assert.match(signature, /buildArtGallery|buildAs400Archive|buildJustinIndex|buildSystemsWorkshop|buildLoreShrine/, 'singular content recipes disappeared');

// Recurring district landmarks no longer own a second tower shell.
assert.doesNotMatch(engine, /buildDistrictLandmarkTower/, 'retired district landmark tower builder still exists');
const landmarkBody = engine.match(/function buildDistrictLandmark\([\s\S]*?\n    \}\n\n    function addOwnedBoundaryBarriers/)?.[0] || '';
assert.match(landmarkBody, /buildKowloonCompound\(/, 'district landmark does not use common compound builder');
assert.match(landmarkBody, /structureProfile:/, 'district landmark identity is not expressed as recipe/profile data');

// One relationship system: openings are planned before shells, same bridge publisher for origin/infinity.
assert.match(engine, /function emitSkybridge\(/, 'shared bridge publisher missing');
assert.match(engine, /function planAuthoredBridgeNetwork\(/, 'authored bridge planner missing');
assert.match(engine, /function buildAuthoredBridge\(/, 'authored bridge publisher missing');
assert.match(main, /cityFabricEngine\.planAuthoredBridgeNetwork\(/, 'origin relationships do not use common planner');
assert.match(main, /cityFabricEngine\.buildAuthoredBridge\(/, 'origin relationships do not use common publisher');
assert.doesNotMatch(main, /rooftop-catwalks|hanging-bridges/, 'old separate relationship jobs returned');

// One structural surface publisher: old spawn ground keeps its material planning but cannot emit meshes.
assert.match(engine, /function buildAuthoredSurfacePatch\(/, 'common authored surface publisher missing');
assert.match(main, /publishSurfacePatch:\s*patch\s*=>\s*\{[\s\S]*cityFabricEngine\.buildAuthoredSurfacePatch\(patch\)[\s\S]*cityFabricEngine\.commit\(/, 'spawn ground does not build and commit through common engine');
assert.match(ground, /publishSurfacePatch\(/, 'ground planner does not delegate publication');
assert.doesNotMatch(ground, /new THREE\.InstancedMesh/, 'spawn ground still owns a second instanced-mesh renderer');
assert.doesNotMatch(ground, /scene\.add\(/, 'spawn ground still publishes geometry directly');

// One lifecycle too: every structural route builds off-scene and crosses the SAME commit boundary.
for (const builder of ['buildAuthoredSite', 'buildAuthoredBridge', 'buildAuthoredSurfacePatch']) {
  const start = engine.indexOf(`function ${builder}(`);
  assert(start >= 0, `${builder} missing from common engine`);
  const tail = engine.slice(start + 1);
  const relNext = tail.search(/\n    (?:async\s+)?function\s+/);
  const next = relNext >= 0 ? start + 1 + relNext : engine.length;
  const body = engine.slice(start, next);
  assert.match(body, /committed:\s*false/, `${builder} does not return an uncommitted payload`);
  assert.doesNotMatch(body, /addStreamRoot\(|registerOwnedWorld\(/, `${builder} still self-publishes instead of using common commit`);
}
const commitStart = engine.indexOf('function commit(');
const commitNext = engine.indexOf('\n    function ', commitStart + 20);
const commitBody = engine.slice(commitStart, commitNext >= 0 ? commitNext : undefined);
assert(commitStart >= 0, 'single common commit function missing');
assert.match(commitBody, /addStreamRoot\(payload\.root\)/, 'common commit does not publish render root');
assert.match(commitBody, /registerOwnedWorld\(payload\.ownerId, payload\.physics\)/, 'common commit does not publish owned collision');
assert.match(commitBody, /payload\.committed = true/, 'common commit does not seal committed state');
assert.match(main, /buildUnifiedKowloonSiteSteps[\s\S]*cityFabricEngine\.commit\(payload\.chunk, payload\)/, 'ordinary spawn bypasses common commit');
assert.match(main, /buildUnifiedSignatureSiteSteps[\s\S]*cityFabricEngine\.commit\(payload\.chunk, payload\)/, 'singular shell bypasses common commit');
assert.match(main, /buildUnifiedAuthoredRelationshipSteps[\s\S]*cityFabricEngine\.commit\(/, 'authored cross-site link bypasses common commit');
assert.match(main, /buildAuthoredSurfacePatch\(patch\)[\s\S]*cityFabricEngine\.commit\(/, 'authored surface patch bypasses common commit');
assert.match(main, /commitChunk:\s*\(chunk, payload\)\s*=>\s*cityFabricEngine\.commit\(chunk, payload\)/, 'generic streamer bypasses same common commit');

// The authored origin is a real streamer-owned chunk, not a fake READY special case.
assert.match(engine, /function buildAuthoredOriginChunk\(/, 'real authored-origin composite builder missing');
assert.match(main, /const authoredOriginChunkPayload = cityFabricEngine\.buildAuthoredOriginChunk\(/, 'main does not build the authored origin through the canonical engine');
assert.match(main, /await worldChunkStreamer\.buildSpawnChunk\(\)/, 'origin is not entering the normal streamer build/commit lifecycle');
assert.doesNotMatch(main, /markChunkReady\(/, 'origin is still being hand-declared READY outside the streamer lifecycle');
assert.doesNotMatch(engine, /spawnDistrict/, 'canonical engine still contains the retired fake spawnDistrict payload path');
assert.match(commitBody, /authoredOriginChunkPayload\.root\.add\(payload\.root\)/, 'origin components are not parented under the real origin chunk root at common commit');
assert.match(commitBody, /authoredOriginChunkPayload\.components\.push\(payload\)/, 'origin component ownership is not tracked by the origin composite');

// Even the RESERVED courtyard paver keeps its old visual recipe but cannot own a second surface renderer.
const courtyardStart = authoredHelpers.indexOf('function buildCourtyardVoid(');
const courtyardTail = authoredHelpers.slice(courtyardStart);
const courtyardEndRel = courtyardTail.slice(1).search(/\n    function\s+/);
const courtyardBody = courtyardTail.slice(0, courtyardEndRel >= 0 ? courtyardEndRel + 1 : undefined);
assert(courtyardStart >= 0, 'reserved courtyard content helper missing');
assert.match(courtyardBody, /publishSurfacePatch\(/, 'reserved courtyard paver bypasses common surface publisher');
assert.doesNotMatch(courtyardBody, /scene\.add\(pavers\)/, 'reserved courtyard still publishes its own structural surface');

// Plaza specials remain preserved content plugins, not a second structural readiness definition.
const completionBody = main.match(/function maybeMarkSpawnDistrictStructuresComplete\(\)[\s\S]*?\n\}/)?.[0] || '';
assert.ok(completionBody && !completionBody.includes('specialPlazaJobs.length'), 'spawn structural readiness still waits on authored plaza content plugins');
assert.match(main, /plaza content continues independently/, 'runtime does not state plaza/content separation');
for (const kind of ['plaza-statue', 'plaza-construction-zone', 'plaza-crime-scene', 'plaza-newsstand', 'plaza-phone-booth', 'plaza-atm-kiosk', 'plaza-park', 'plaza-mega-billboard']) {
  assert.ok(enrichment.includes(kind), `universal enrichment lost old plaza capability ${kind}`);
}

// Capability absorption: old authored classes are represented in shared structure/refinement.
for (const token of ['mezzanines', 'interiorClutter', 'serviceCores', 'rooftopMechanical', 'roofCrowns', 'cantileverRooms', 'serviceCages']) {
  assert.ok(engine.includes(token), `common engine missing absorbed structural capability ${token}`);
}
for (const kind of ['sign', 'graffiti', 'pipe', 'awning', 'ivy', 'security', 'flyer', 'roof-clutter', 'elevator-hardware', 'spray-cans']) {
  assert.ok(enrichment.includes(`'${kind}'`), `common refinement missing preserved capability ${kind}`);
}
assert.match(enrichment, /facadeIndex/, 'refinement no longer targets actual compound facades');

// Design language + full corpus remains wired.
for (const axiom of ['ACCRETION IS A BUILDING SYSTEM', 'ROOFS ARE STREETS', 'SERVICES LIVE ON THE SKIN']) {
  assert.ok(exciter.includes(axiom), `design axiom missing: ${axiom}`);
}

// Progressive optimizer API regression from the live console remains fixed on the actual controller.
assert.match(main, /staticWorldOptimizer\?\.markDirtyObject\(leaf\)/, 'bootstrap compile pump no longer uses progressive dirty API');
const progressiveStart = optimizer.indexOf('export function createProgressiveStaticWorldOptimizer');
const legacyStart = optimizer.indexOf('export function createStaticWorldOptimizer');
assert(progressiveStart >= 0 && legacyStart > progressiveStart, 'optimizer function boundaries not found');
const progressiveBody = optimizer.slice(progressiveStart, legacyStart);
assert.match(progressiveBody, /markDirtyObject\(obj\)/, 'progressive optimizer does not expose markDirtyObject');
assert.match(progressiveBody, /worldChunkRoot/, 'progressive optimizer does not exclude common streamed roots');

console.log('[one-way-total-audit] PASS', {
  canonicalEngine: 'KowloonFabricEngine',
  topology: 'shared-kowloon-maze',
  ordinarySpawn: 'common',
  singularShells: 'common',
  districtLandmarks: 'common',
  relationships: 'common',
  groundPublisher: 'common',
  lifecycle: 'one-build-offscene-one-commit',
  originOwnership: 'real-streamer-composite',
  legacyRuntimeStructuralImports: 0,
  plazaSemanticClasses: 8,
});
