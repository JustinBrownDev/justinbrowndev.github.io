import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { CHUNK_STATE, createWorldChunkStreamer, deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';
import {
  WORLD_STREAMING_GEAR,
  choosePlayerCenteredStreamingGear,
  pointNearRegion,
  shouldRunAuthoredLocalWork,
} from '../world/player-centered-streaming.js';

const gear = choosePlayerCenteredStreamingGear;
assert.equal(gear({}), WORLD_STREAMING_GEAR.VISIBLE_STRUCTURE);
assert.equal(gear({ renderComplete: true }), WORLD_STREAMING_GEAR.VISIBLE_FIRST_PASS);
assert.equal(gear({ renderComplete: true, visibleFirstPassComplete: true }), WORLD_STREAMING_GEAR.PREFETCH_STRUCTURE);
assert.equal(gear({ renderComplete: true, visibleFirstPassComplete: true, prefetchComplete: true }), WORLD_STREAMING_GEAR.LOCAL_DEEPEN);
assert.equal(gear({ renderComplete: true, visibleFirstPassComplete: true, prefetchComplete: true, authoredStructuralComplete: false }), WORLD_STREAMING_GEAR.LOCAL_DEEPEN,
  'finite authored completion must never become a global world-streaming gate');

assert.equal(pointNearRegion({ x: 0, z: 0 }, { halfX: 25, halfZ: 25, margin: 10 }), true);
assert.equal(pointNearRegion({ x: 34, z: 0 }, { halfX: 25, halfZ: 25, margin: 10 }), true);
assert.equal(pointNearRegion({ x: 50, z: 0 }, { halfX: 25, halfZ: 25, margin: 10 }), false);
assert.equal(shouldRunAuthoredLocalWork({ gear: WORLD_STREAMING_GEAR.LOCAL_DEEPEN, playerNearAuthoredRegion: true }), true);
assert.equal(shouldRunAuthoredLocalWork({ gear: WORLD_STREAMING_GEAR.LOCAL_DEEPEN, playerNearAuthoredRegion: false }), false,
  'spawn work must stop being a default background sink when the player leaves it');
assert.equal(shouldRunAuthoredLocalWork({ gear: WORLD_STREAMING_GEAR.VISIBLE_FIRST_PASS, playerNearAuthoredRegion: true }), false,
  'nearby procedural first-pass population outranks authored background work even at spawn');

// Exact user-reported seed: preserve the deterministic corpus, but make the
// semantic first pass visually substantial. 13 buildings + 3 plazas should
// collectively publish three-ish conspicuous objects each before deep work.
const worldSeed = 1895616516;
const chunkSize = 53;
const scene = new THREE.Scene();
const playerPhysics = {
  registerOwnedWorld() { return { activationState: 'active', deferredReason: null }; },
  unregisterOwnedWorld() { return true; },
};
const engine = createKowloonFabricEngine({
  THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene),
  chunkSize, worldSeed, landmarkSpacingChunks: 3, yieldControl: null,
});
const chunk = {
  key: '0,-1', x: 0, z: -1, centerX: 0, centerZ: -chunkSize,
  seed: deterministicChunkSeed(worldSeed, 0, -1),
  weirdness: worldWeirdnessAt(0, -1, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
};
const payload = await engine.build(chunk);
assert.equal(payload.buildings, 13, 'regression chunk structure changed unexpectedly');
assert.equal(payload.plazas, 3, 'regression chunk plaza plan changed unexpectedly');
assert.equal(payload.refinement.tasks.length, 129, 'visible-convergence ordering must not delete deterministic detail work');
assert.equal(payload.refinement.firstPassEntityTarget, 16, 'all 13 buildings + 3 plazas must participate in first-pass population');
assert.equal(payload.refinement.firstPassPublicationTarget, 45, 'exact seed should require 45 successful conspicuous first-pass publications');
assert.equal(payload.refinement.firstPassTaskCount, 45, 'compatibility firstPassTaskCount must now mean publication target, not one turn per entity');
const firstPass = payload.refinement.tasks.slice(0, payload.refinement.firstPassPublicationTarget);
assert.equal(firstPass.length, 45);
assert.equal(firstPass.some(task => task.kind === 'interior-prop'), false,
  'hidden interior props must not satisfy the visible first pass');
for (const [entityId, target] of Object.entries(payload.refinement.firstPassTargetByEntity)) {
  const count = firstPass.filter(task => String(task.entityId) === entityId).length;
  assert.equal(count, target, `first-pass bundle for ${entityId} must be fully scheduled before deep work`);
  assert.ok(target >= 1 && target <= 3, 'first-pass bundle target must stay bounded at three visible additions per entity');
}

// False-progress regression: an attempted task that creates no object must count
// as a no-op, not as a successful publication or semantic first-pass progress.
const noOpPayload = await engine.build(chunk);
noOpPayload.refinement.tasks[0] = { ...noOpPayload.refinement.tasks[0], entityId: 'missing-entity-for-no-op-regression' };
const noOpResult = engine.refine(chunk, noOpPayload, { maxSteps: 1, maxMillis: 100 });
assert.equal(noOpResult.attempted, 1);
assert.equal(noOpResult.published, 0);
assert.equal(noOpResult.noOp, 1);
assert.equal(noOpResult.failed, 0);
assert.equal(noOpPayload.refinement.attempted, 1);
assert.equal(noOpPayload.refinement.published, 0);
assert.equal(noOpPayload.refinement.noOp, 1);
assert.equal(noOpPayload.refinement.firstPassEntitiesComplete, 0,
  'no-op task must not fake semantic population');

// Kill the all-or-nothing 5x5 barrier. Eight published chunks may enrich while
// the ninth visible chunk is still structurally unresolved.
const partialPosition = { x: 0, y: 1.65, z: 0 };
const partialTurns = [];
const partialStreamer = createWorldChunkStreamer({
  chunkSize: 64,
  worldSeed: 77,
  getPlayerPosition: () => partialPosition,
  getPlayerHeading: () => ({ x: 1, z: 0 }),
  renderRadiusChunks: 1,
  prefetchRadiusChunks: 1,
  retentionRadiusChunks: 2,
  refineAfterPrefetchReady: false,
  buildChunk: async chunk => ({ key: chunk.key, pending: 2, visible: false, physicsActivationState: 'active', refinement: { cursor: 0 } }),
  setChunkVisibility: (_chunk, p, visible) => { p.visible = !!visible; p.renderPublished = !!visible; return p.renderPublished; },
  refineChunk: async (chunk, p) => {
    p.pending--;
    p.refinement.cursor++;
    partialTurns.push(chunk.key);
    return { progressed: true, steps: 1, attempted: 1, published: 1, noOp: 0, failed: 0, complete: p.pending <= 0, lastKind: 'test-visible-detail' };
  },
  hasPendingRefinement: (_chunk, p) => p.pending > 0,
});
for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) {
  if (x === -1 && z === -1) continue;
  partialStreamer.markChunkReady(x, z, {
    pending: x === 0 && z === 0 ? 0 : 2,
    visible: true,
    renderPublished: true,
    physicsActivationState: 'active',
    refinement: { cursor: 0 },
  });
}
const missing = partialStreamer.ensureChunk(-1, -1);
missing.state = CHUNK_STATE.BUILDING; // deliberately unresolved visible structure
assert.equal(partialStreamer.stats().localRenderRing.complete, false, 'regression setup requires an incomplete 5x5/3x3 render ring');
await partialStreamer.pump({ maxChunks: 2, maxMillis: 100, maxRefinements: 3, reserveRefinementMs: 4 });
assert.ok(partialTurns.length > 0, 'published visible chunks must enrich even while another visible chunk is unresolved');
assert.equal(partialStreamer.stats().localRenderRing.complete, false, 'enrichment must not require pretending the missing chunk is complete');
assert.ok(partialStreamer.stats().refinement.published > 0, 'successful visible publications must be counted explicitly');
await partialStreamer.dispose();

// Streamer semantic completion must use successful publication, never task cursor.
const position = { x: 0, y: 1.65, z: 0 };
const streamer = createWorldChunkStreamer({
  chunkSize: 64,
  worldSeed: 7,
  getPlayerPosition: () => position,
  getPlayerHeading: () => ({ x: 1, z: 0 }),
  renderRadiusChunks: 0,
  prefetchRadiusChunks: 0,
  retentionRadiusChunks: 1,
  minimumVisibleRefinementTurns: 8,
  buildChunk: async () => null,
  setChunkVisibility: (_chunk, p, visible) => { p.renderPublished = !!visible; return p.renderPublished; },
  refineChunk: async (_chunk, p) => {
    p.refinement.cursor++;
    p.refinement.attempted++;
    const shouldPublish = p.refinement.cursor !== 2; // one intentional no-op
    if (shouldPublish) {
      p.refinement.published++;
      const before = p.refinement.firstPassPublishedByEntity.a || 0;
      p.refinement.firstPassPublishedByEntity.a = before + 1;
      if (before < p.refinement.firstPassTargetByEntity.a) {
        p.refinement.firstPassSuccessfulPublications++;
        if (before + 1 >= p.refinement.firstPassTargetByEntity.a) p.refinement.firstPassEntitiesComplete = 1;
      }
      p.refinement.firstPassComplete = p.refinement.firstPassEntitiesComplete >= p.refinement.firstPassEntityTarget;
    } else p.refinement.noOp++;
    return { progressed: true, steps: 1, attempted: 1, published: shouldPublish ? 1 : 0, noOp: shouldPublish ? 0 : 1, failed: 0, complete: p.refinement.cursor >= p.refinement.tasks.length, lastKind: 'test-detail' };
  },
  hasPendingRefinement: (_chunk, p) => p.refinement.cursor < p.refinement.tasks.length,
  refineAfterPrefetchReady: false,
});
const semanticPayload = {
  renderPublished: false,
  physicsActivationState: 'active',
  refinement: {
    tasks: Array.from({ length: 6 }, (_, i) => ({ i })), cursor: 0,
    attempted: 0, published: 0, noOp: 0, failed: 0,
    firstPassTargetByEntity: { a: 3 }, firstPassPublishedByEntity: {},
    firstPassPublicationTarget: 3, firstPassSuccessfulPublications: 0,
    firstPassEntityTarget: 1, firstPassEntitiesComplete: 0, firstPassComplete: false,
  },
};
streamer.markChunkReady(0, 0, semanticPayload);
assert.equal(streamer.chunkVisibleFirstPassComplete(streamer.chunks.get('0,0')), false);
await streamer.refineOne(streamer.chunks.get('0,0'), { maxMillis: 100 });
await streamer.refineOne(streamer.chunks.get('0,0'), { maxMillis: 100 }); // no-op
await streamer.refineOne(streamer.chunks.get('0,0'), { maxMillis: 100 });
assert.equal(streamer.stats().localRenderRefinement.floorComplete, false,
  'cursor reaching three attempts must not fake a three-publication semantic first pass');
await streamer.refineOne(streamer.chunks.get('0,0'), { maxMillis: 100 });
assert.equal(streamer.stats().localRenderRefinement.floorComplete, true,
  'semantic first pass completes only after three successful publications');
assert.equal(streamer.stats().refinement.attempts, 4);
assert.equal(streamer.stats().refinement.published, 3);
assert.equal(streamer.stats().refinement.noOp, 1);
await streamer.dispose();

// Stagnation diagnostics must distinguish no attempts (starved) from repeated
// attempts that publish nothing (stalled), and include the visible-ring summary.
const healthDiagnostics = [];
const healthPosition = { x: 64, y: 1.65, z: 0 };
const healthStreamer = createWorldChunkStreamer({
  chunkSize: 64,
  worldSeed: 88,
  getPlayerPosition: () => healthPosition,
  renderRadiusChunks: 0,
  prefetchRadiusChunks: 0,
  retentionRadiusChunks: 1,
  refineAfterPrefetchReady: false,
  richnessStallAttemptThreshold: 3,
  richnessStarveAfterMs: 5,
  richnessStationaryDistance: 0.5,
  onRichnessDiagnostic: diagnostic => healthDiagnostics.push(diagnostic),
  buildChunk: async () => null,
  setChunkVisibility: (_chunk, p, visible) => { p.renderPublished = !!visible; return p.renderPublished; },
  refineChunk: async (_chunk, p) => {
    p.refinement.cursor++;
    p.refinement.attempted++;
    p.refinement.noOp++;
    return { progressed: true, steps: 1, attempted: 1, published: 0, noOp: 1, failed: 0, complete: false, lastKind: 'intentional-no-op' };
  },
  hasPendingRefinement: () => true,
});
const healthPayload = {
  renderPublished: false,
  physicsActivationState: 'active',
  refinement: { tasks: Array.from({ length: 20 }, (_, i) => ({ i })), cursor: 0, attempted: 0, published: 0, noOp: 0, failed: 0 },
};
healthStreamer.markChunkReady(1, 0, healthPayload);
healthStreamer.updateVisibility();
await new Promise(resolve => setTimeout(resolve, 12));
healthStreamer.updateVisibility();
assert.ok(healthDiagnostics.some(d => d.type === 'starved'), 'standing still with pending published detail and zero attempts must report refinement starvation');
for (let i = 0; i < 3; i++) await healthStreamer.refineOne(healthStreamer.chunks.get('1,0'), { maxMillis: 100 });
healthStreamer.updateVisibility();
assert.ok(healthDiagnostics.some(d => d.type === 'stalled'), 'three no-op attempts without rendered growth must report richness stall at the test threshold');
assert.ok(healthDiagnostics.at(-1)?.summary?.perChunk?.length >= 1, 'richness diagnostic must include per-chunk detail/publication evidence');
await healthStreamer.dispose();

console.log('[player-centered-streaming-selftest] PASS', {
  gearOrder: Object.values(WORLD_STREAMING_GEAR),
  exactSeed: worldSeed,
  detailTasks: payload.refinement.tasks.length,
  firstPassEntities: payload.refinement.firstPassEntityTarget,
  firstPassPublications: payload.refinement.firstPassPublicationTarget,
  partialRingRefinementTurns: partialTurns,
});
