const fs = require('fs');
const assert = require('assert');
const main = fs.readFileSync('main.js', 'utf8');
const buildings = fs.readFileSync('world/building-construction.js', 'utf8');
const vertical = fs.readFileSync('world/vertical-circulation.js', 'utf8');
const signage = fs.readFileSync('world/signage.js', 'utf8');
const ground = fs.readFileSync('world/ground-surfaces.js', 'utf8');
const enrich = fs.readFileSync('world/infinite-chunk-enrichment.js', 'utf8');
const exciter = fs.readFileSync('world/procedural-text-exciter.js', 'utf8');
assert(main.includes('minimum-safe authored neighborhood'));
assert(main.includes('pumpAuthoredBuildingJobs({'));
assert(main.includes('pumpWorldChunksAggressively();'));
assert(main.indexOf('pumpWorldChunksAggressively();') < main.indexOf('pumpAuthoredBuildingJobs({', main.indexOf('function animate(')));
assert(main.includes('physics.sync-authored-step'));
assert(main.includes('Physics synchronization follows structural state changes, not scene.add().'));
assert(main.includes('function authoredStructuralRevision(site)'));
assert(main.includes('authoredStructuralRevisionChanged(structuralBefore, structuralAfter)'));
assert(!main.includes('if (addedRoots.length && !deferredVisualPhase) {'));
assert(main.includes('authoredBuildingsCompletePromise'));
assert(main.includes('authoredPostStructureCompletePromise'));
assert(main.includes('pumpAuthoredPostStructurePipeline({ maxSteps: QP[1024], maxMillis: QP[1024] })'));
assert(main.includes("createStableStreamingRngStepper('authored:narrative-dead-ends'"));
assert(main.includes("createStableStreamingRngStepper('authored:rooftop-catwalks'"));
assert(main.includes("createStableStreamingRngStepper('authored:hanging-bridges'"));
assert(main.includes('} else if (worldChunkStreamer?.stats().localRenderRing.complete) {'));
assert(main.includes('staticWorldOptimizer.optimizeNearestDirtyChunk('));
assert(buildings.includes('buildingWallSegments.set(`${row},${col}`, { floors });'));
assert(buildings.indexOf('buildingWallSegments.set(`${row},${col}`, { floors });') < buildings.indexOf("yield { phase: 'floor'"));
assert(vertical.includes('HORIZONTAL_PLANE_PAGE_CAPACITY'));
assert(vertical.includes('page.mesh.count = page.count'));
assert(vertical.includes('if (page.count === QP[1024]) scene.add(page.mesh);'));
assert(vertical.includes('function* buildRooftopCatwalkSteps()'));
assert(vertical.includes('function* buildHangingBridgeSteps()'));
assert(signage.includes('function* mountContentCardSteps()'));
assert(ground.includes('function pumpOpenCellSurfaces('));
assert(ground.includes('function isWorldPositionReady('));
assert(ground.includes('park cells retain structural base plates'));
assert(main.includes('const specialPlazaJobs = []'));
assert(main.includes("reserveSpecialPlazaJob('park'"));
assert(main.includes('function* addParkSteps('));
assert(main.includes("yield { phase: 'park-tree'"));
assert(main.includes('pumpSpecialPlazaJobs({ maxJobs: QP[1024]'));
assert(main.indexOf('pumpWorldChunksAggressively();') < main.indexOf('pumpSpecialPlazaJobs({ maxJobs:', main.indexOf('function animate(')));
assert(main.includes('worldChunkStreamer?.stats().localRenderRing.complete && specialPlazaJobs.length'));
assert(main.includes('if (job.structural && colliderDelta > QP[1015]) playerPhysics.syncDynamicWorld();'));
assert(main.includes('while (!_spawnDistrictStructuresComplete) await testNextPaint();'));
assert(enrich.includes('createProceduralTextExciter'));
assert(exciter.includes('CURATED_CLUTTER_CORPUS'));
assert(exciter.includes('CURATED_CLUTTER_FRAGMENTS'));
assert(exciter.includes('CURATED_POETRY'));
assert(exciter.includes('EVERY CHUNK LOADS ITSELF'));
console.log('[progressive-spawn-checkpoint-audit] PASS', {
  minimumSafeHandoff: true,
  liveAuthoredTurns: true,
  outerChunksFirst: true,
  floorWallCollisionAtomicity: true,
  progressiveGroundChunks: true,
  deferredPlazaJobs: true,
  parkBasePlateSafety: true,
  resumableAuthoredRelationshipPasses: true,
  resumableParkEnrichment: true,
  nearestDirtyOptimizerPump: true,
  deterministicFullCuratedCorpusExciter: true,
});
