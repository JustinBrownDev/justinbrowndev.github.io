const fs = require('fs');
const assert = require('assert');
const main = fs.readFileSync('main.js', 'utf8');
const engine = fs.readFileSync('kowloon-fabric-engine.js', 'utf8');
const signage = fs.readFileSync('world/signage.js', 'utf8');
const ground = fs.readFileSync('world/ground-surfaces.js', 'utf8');
const enrich = fs.readFileSync('world/kowloon-fabric-enrichment.js', 'utf8');
const exciter = fs.readFileSync('world/procedural-text-exciter.js', 'utf8');

// Minimum-safe origin handoff remains progressive rather than whole-district boot.
assert(main.includes('minimum-safe authored neighborhood'));
assert(main.includes('pumpAuthoredBuildingJobs({'));
assert(main.includes('authoredBuildingsCompletePromise'));
assert(main.includes('authoredPostStructureCompletePromise'));
assert(main.includes('while (!_spawnDistrictStructuresComplete) await testNextPaint();'));

// Outer structural chunks retain first claim on each live frame.
const animateAt = main.indexOf('function animate(');
const outerPumpAt = main.indexOf('pumpWorldChunksAggressively();', animateAt);
const authoredPumpAt = main.indexOf('pumpAuthoredBuildingJobs({', animateAt);
const plazaPumpAt = main.indexOf('pumpSpecialPlazaJobs({ maxJobs:', animateAt);
assert(outerPumpAt >= 0 && authoredPumpAt > outerPumpAt, 'outer world must pump before authored background sites');
assert(plazaPumpAt > outerPumpAt, 'outer world must pump before plaza content');

// Structural state, not scene.add side effects, controls authored collision sync.
assert(main.includes('physics.sync-authored-step'));
assert(main.includes('Physics synchronization follows structural state changes, not scene.add().'));
assert(main.includes('function authoredStructuralRevision(site)'));
assert(main.includes('authoredStructuralRevisionChanged(structuralBefore, structuralAfter)'));
assert(!main.includes('if (addedRoots.length && !deferredVisualPhase) {'));

// Old origin-only catwalk/hanging-bridge builders are retired. Their capability is
// expressed by one common link planner/publisher with wall openings planned first.
assert(main.includes("id: 'kowloon-cross-site-links'"));
assert(main.includes("createStableStreamingRngStepper('authored:kowloon-links'"));
assert(main.includes('cityFabricEngine.planAuthoredBridgeNetwork('));
assert(main.includes('cityFabricEngine.buildAuthoredBridge('));
assert(main.includes('cityFabricEngine.commit({ key: `spawn-link:${bridge.id}` }, payload)'));
assert(engine.includes('function emitSkybridge('));
assert(engine.includes('function planAuthoredBridgeNetwork('));
assert(!main.includes("createStableStreamingRngStepper('authored:rooftop-catwalks'"));
assert(!main.includes("createStableStreamingRngStepper('authored:hanging-bridges'"));

// Narrative/facade content remains resumable after structural consolidation.
assert(main.includes("createStableStreamingRngStepper('authored:narrative-dead-ends'"));
assert(main.includes("createStableStreamingRngStepper('authored:content-cards'"));
assert(signage.includes('function* mountContentCardSteps()'));

// Ground remains nearest-first and safe, but publication itself is common-engine owned.
assert(ground.includes('function pumpOpenCellSurfaces('));
assert(ground.includes('function isWorldPositionReady('));
assert(ground.includes('park cells retain structural base plates'));
assert(ground.includes('publishSurfacePatch('));
assert(!ground.includes('new THREE.InstancedMesh'));
assert(main.includes('cityFabricEngine.buildAuthoredSurfacePatch(patch)'));
assert(main.includes('cityFabricEngine.commit({ key: `spawn-surface:${patch.patchKey}` }, payload)'));

// Plaza features are preserved as resumable content, never structural readiness gates.
assert(main.includes('const specialPlazaJobs = []'));
assert(main.includes("reserveSpecialPlazaJob('park'"));
assert(main.includes('function* addParkSteps('));
assert(main.includes("yield { phase: 'park-tree'"));
assert(main.includes('pumpSpecialPlazaJobs({ maxJobs: QP[1024]'));
assert(main.includes('function specialPlazaJobGroundReady(job)'));
assert(main.includes('groundSurfaceSystem.isWorldPositionReady'));
assert(main.includes('sortUnifiedSpawnFabricRefinementNearPlayer'));
assert(main.includes('if (unifiedSpawnFabricRefinementQueue.length)'));
assert(!main.includes('localRenderRing.complete && unifiedSpawnFabricRefinementQueue.length'));
assert(!main.includes('localRenderRing.complete && specialPlazaJobs.length'));
assert(main.includes('plaza content continues independently'));
assert(main.includes('if (colliderDelta > QP[1015]) playerPhysics.syncDynamicWorld();')); // content obstacles still enter dynamic collision

// One atomic publication lifecycle now covers authored sites, links, surfaces and generic chunks.
for (const builder of ['buildAuthoredSite', 'buildAuthoredBridge', 'buildAuthoredSurfacePatch']) {
  const start = engine.indexOf(`function ${builder}(`);
  const tail = engine.slice(start + 1);
  const relNext = tail.search(/\n    (?:async\s+)?function\s+/);
  const end = relNext >= 0 ? start + 1 + relNext : engine.length;
  const body = engine.slice(start, end);
  assert(start >= 0 && body.includes('committed: false'), `${builder} must build uncommitted`);
  assert(!body.includes('addStreamRoot(') && !body.includes('registerOwnedWorld('), `${builder} must not self-publish`);
}
assert(engine.includes('async function commit(chunk, payload)'));
assert(main.includes('commitChunk: (chunk, payload) => cityFabricEngine.commit(chunk, payload)'));
assert(main.includes('const authoredOriginChunkPayload = cityFabricEngine.buildAuthoredOriginChunk({ singulars: spawnSingularManifest });'));
assert(main.includes("buildChunk: chunk => chunk.key === '0,0' ? authoredOriginChunkPayload : cityFabricEngine.build(chunk)"));
assert(main.includes('await worldChunkStreamer.buildSpawnChunk();'));
assert(!main.includes('markChunkReady('));
assert(engine.includes('authoredOriginChunkPayload.root.add(payload.root)'));

// Optimizer stays cooperative and the full deterministic corpus stays universal.
assert(main.includes('staticWorldOptimizer.optimizeNearestDirtyChunk('));
assert(enrich.includes('createProceduralTextExciter'));
assert(exciter.includes('CURATED_CLUTTER_CORPUS'));
assert(exciter.includes('CURATED_CLUTTER_FRAGMENTS'));
assert(exciter.includes('CURATED_POETRY'));
assert(exciter.includes('EVERY CHUNK LOADS ITSELF'));

console.log('[progressive-spawn-checkpoint-audit] PASS', {
  minimumSafeHandoff: true,
  outerChunksFirst: true,
  oneFabricBuilder: true,
  oneCommitLifecycle: true,
  realOriginChunkLifecycle: true,
  commonCrossSiteLinks: true,
  progressiveGroundChunks: true,
  deferredPlazaContent: true,
  parkBasePlateSafety: true,
  nearestDirtyOptimizerPump: true,
  deterministicFullCuratedCorpusExciter: true,
});
