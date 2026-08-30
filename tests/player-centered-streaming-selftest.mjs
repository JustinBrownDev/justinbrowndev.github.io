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
for (const streamingGear of [
  WORLD_STREAMING_GEAR.VISIBLE_STRUCTURE,
  WORLD_STREAMING_GEAR.VISIBLE_FIRST_PASS,
  WORLD_STREAMING_GEAR.PREFETCH_STRUCTURE,
  WORLD_STREAMING_GEAR.LOCAL_DEEPEN,
]) {
  assert.equal(shouldRunAuthoredLocalWork({ gear: streamingGear, playerNearAuthoredRegion: true }), true,
    'streaming gear may shrink the authored budget but must not forbid physically local authored work');
}

// Exact user-reported seed: preserve the deterministic corpus, but let one
// meaningful visible publication per entity release first-pass mode. Second and
// third features remain queued for opportunistic deepening.
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
assert.equal(payload.refinement.tasks.length, 137, 'richness-parity corpus must preserve all deterministic detail work plus 8 street fixtures');
assert.equal(payload.refinement.tasks.filter(task => task.kind === 'street-fixture').length, 8,
  'exact regression seed must retain the 8 deterministic player-local street fixtures');
assert.equal(payload.refinement.firstPassEntityTarget, 16, 'all 13 buildings + 3 plazas must participate in first-pass population');
assert.equal(payload.refinement.firstPassPublicationTarget, 16, 'exact seed should require one meaningful successful publication per visible entity');
assert.equal(payload.refinement.firstPassTaskCount, 16, 'compatibility firstPassTaskCount must match the one-per-entity publication target');
const firstPass = payload.refinement.tasks.slice(0, payload.refinement.firstPassPublicationTarget);
assert.equal(firstPass.length, 16);
assert.equal(firstPass.some(task => task.kind === 'interior-prop'), false,
  'hidden interior props must not satisfy the visible first pass');
for (const [entityId, target] of Object.entries(payload.refinement.firstPassTargetByEntity)) {
  const count = firstPass.filter(task => String(task.entityId) === entityId).length;
  assert.equal(count, 1, `first pass must schedule exactly one meaningful task for ${entityId}`);
  assert.equal(target, 1, 'first-pass target must be exactly one visible publication per entity');
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

// Reproduce the real failure mode: a queued atomic build overruns the nominal
// frame budget. Visible refinement must happen BEFORE that build, while a second
// unresolved chunk proves enrichment does not depend on completing the whole ring.
const partialPosition = { x: 0, y: 1.65, z: 0 };
const partialTurns = [];
const partialEvents = [];
const partialStreamer = createWorldChunkStreamer({
  chunkSize: 64,
  worldSeed: 77,
  getPlayerPosition: () => partialPosition,
  getPlayerHeading: () => ({ x: 1, z: 0 }),
  renderRadiusChunks: 1,
  prefetchRadiusChunks: 1,
  retentionRadiusChunks: 2,
  refineAfterPrefetchReady: false,
  buildChunk: async chunk => {
    partialEvents.push(`build:start:${chunk.key}`);
    const overrunUntil = performance.now() + 12;
    while (performance.now() < overrunUntil) {}
    partialEvents.push(`build:end:${chunk.key}`);
    return { key: chunk.key, pending: 2, visible: false, physicsActivationState: 'active', refinement: { cursor: 0 } };
  },
  setChunkVisibility: (_chunk, p, visible) => { p.visible = !!visible; p.renderPublished = !!visible; return p.renderPublished; },
  refineChunk: async (chunk, p) => {
    partialEvents.push(`refine:${chunk.key}`);
    p.pending--;
    p.refinement.cursor++;
    partialTurns.push(chunk.key);
    return { progressed: true, steps: 1, attempted: 1, published: 1, noOp: 0, failed: 0, complete: p.pending <= 0, lastKind: 'test-visible-detail' };
  },
  hasPendingRefinement: (_chunk, p) => p.pending > 0,
});
for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) {
  if ((x === -1 && z === -1) || (x === 1 && z === 1)) continue;
  partialStreamer.markChunkReady(x, z, {
    pending: x === 0 && z === 0 ? 0 : 2,
    visible: true,
    renderPublished: true,
    physicsActivationState: 'active',
    refinement: { cursor: 0 },
  });
}
const expensiveMissing = partialStreamer.ensureChunk(-1, -1);
expensiveMissing.state = CHUNK_STATE.QUEUED;
const heldMissing = partialStreamer.ensureChunk(1, 1);
heldMissing.state = CHUNK_STATE.BUILDING;
assert.equal(partialStreamer.stats().localRenderRing.complete, false, 'regression setup requires an incomplete visible ring');
await partialStreamer.pump({ maxChunks: 1, maxMillis: 4, maxRefinements: 1, refineFirst: true, refinementBudgetMs: 1.5 });
assert.ok(partialTurns.length > 0, 'published visible chunks must enrich even while visible structure is unresolved');
const firstRefineAt = partialEvents.findIndex(event => event.startsWith('refine:'));
const firstBuildAt = partialEvents.findIndex(event => event.startsWith('build:start:'));
assert.ok(firstRefineAt >= 0 && firstBuildAt >= 0 && firstRefineAt < firstBuildAt,
  'visible refinement must run before an indivisible build can overrun the nominal frame budget');
assert.equal(partialStreamer.stats().localRenderRing.complete, false, 'the held missing chunk must keep the visible ring incomplete');
assert.ok(partialStreamer.stats().refinement.published > 0, 'successful visible publications must be counted explicitly');
await partialStreamer.dispose();

// Setup work has no right to consume the refinement lane. Simulate an expensive
// unload before a tiny 0.5ms detail budget and require the local turn anyway.
const setupEvents = [];
const setupPosition = { x: 0, y: 1.65, z: 0 };
const setupStreamer = createWorldChunkStreamer({
  chunkSize: 64,
  worldSeed: 78,
  getPlayerPosition: () => setupPosition,
  renderRadiusChunks: 0,
  prefetchRadiusChunks: 0,
  retentionRadiusChunks: 1,
  refineAfterPrefetchReady: false,
  buildChunk: async () => null,
  unloadChunk: async chunk => {
    setupEvents.push(`unload:${chunk.key}`);
    const overrunUntil = performance.now() + 8;
    while (performance.now() < overrunUntil) {}
  },
  setChunkVisibility: (_chunk, p, visible) => { p.renderPublished = !!visible; return p.renderPublished; },
  refineChunk: async (chunk, p) => {
    setupEvents.push(`refine:${chunk.key}`);
    p.refinement.cursor++;
    p.refinement.attempted++;
    p.refinement.published++;
    return { progressed: true, steps: 1, attempted: 1, published: 1, noOp: 0, failed: 0, complete: true, lastKind: 'setup-budget-proof' };
  },
  hasPendingRefinement: (_chunk, p) => p.refinement.cursor < p.refinement.tasks.length,
});
setupStreamer.markChunkReady(0, 0, {
  renderPublished: false, physicsActivationState: 'active',
  refinement: { tasks: [{}], cursor: 0, attempted: 0, published: 0, noOp: 0, failed: 0 },
});
setupStreamer.markChunkReady(4, 4, {
  renderPublished: false, physicsActivationState: 'active',
  refinement: { tasks: [], cursor: 0, attempted: 0, published: 0, noOp: 0, failed: 0 },
});
await setupStreamer.pump({ maxChunks: 0, maxMillis: 1, maxRefinements: 1, refineFirst: true, refinementBudgetMs: 0.5 });
assert.ok(setupEvents.some(event => event.startsWith('unload:')), 'regression setup must spend longer than the nominal pump budget before refinement');
assert.ok(setupEvents.includes('refine:0,0'), 'refinement must own an independent clock after setup overruns');
await setupStreamer.dispose();

// Focus is a ranking rule, not a new state machine. The current block wins, and
// crossing one chunk boundary transfers convergence pressure immediately.
const focusPosition = { x: 0, y: 1.65, z: 0 };
const focusTurns = [];
const focusStreamer = createWorldChunkStreamer({
  chunkSize: 64,
  worldSeed: 79,
  getPlayerPosition: () => focusPosition,
  getPlayerHeading: () => ({ x: 1, z: 0 }),
  renderRadiusChunks: 2,
  prefetchRadiusChunks: 2,
  retentionRadiusChunks: 3,
  refineAfterPrefetchReady: false,
  buildChunk: async () => null,
  setChunkVisibility: (_chunk, p, visible) => { p.renderPublished = !!visible; return p.renderPublished; },
  refineChunk: async (chunk, p) => {
    p.refinement.cursor++;
    focusTurns.push(chunk.key);
    return { progressed: true, steps: 1, attempted: 1, published: 1, noOp: 0, failed: 0, complete: p.refinement.cursor >= p.refinement.tasks.length, lastKind: 'focus-proof' };
  },
  hasPendingRefinement: (_chunk, p) => p.refinement.cursor < p.refinement.tasks.length,
});
for (const [x, z] of [[0, 0], [1, 0], [2, 0]]) {
  focusStreamer.markChunkReady(x, z, {
    renderPublished: false, physicsActivationState: 'active',
    refinement: { tasks: [{}, {}, {}], cursor: 0 },
  });
}
await focusStreamer.pump({ maxChunks: 0, maxMillis: 4, maxRefinements: 1, refineFirst: true, refinementBudgetMs: 1 });
assert.equal(focusTurns[0], '0,0', 'the block under the player must be the first refinement target');
focusPosition.x = 64;
await focusStreamer.pump({ maxChunks: 0, maxMillis: 4, maxRefinements: 1, refineFirst: true, refinementBudgetMs: 1 });
assert.equal(focusTurns[1], '1,0', 'crossing a boundary must transfer convergence pressure to the new current chunk');
await focusStreamer.dispose();

// Hot-path stats and visibility health checks must never traverse scene trees.
// Only the explicit diagnostic snapshot may pay that cost.
let diagnosticTreeVisits = 0;
const diagnosticPosition = { x: 0, y: 1.65, z: 0 };
const diagnosticStreamer = createWorldChunkStreamer({
  chunkSize: 64,
  worldSeed: 80,
  getPlayerPosition: () => diagnosticPosition,
  renderRadiusChunks: 0,
  prefetchRadiusChunks: 0,
  retentionRadiusChunks: 1,
  refineAfterPrefetchReady: false,
  buildChunk: async () => null,
  setChunkVisibility: (_chunk, p, visible) => { p.renderPublished = !!visible; return p.renderPublished; },
  refineChunk: async () => ({ progressed: false, steps: 0, complete: false }),
  hasPendingRefinement: (_chunk, p) => p.refinement.cursor < p.refinement.tasks.length,
});
diagnosticStreamer.markChunkReady(0, 0, {
  renderPublished: false,
  physicsActivationState: 'active',
  root: { traverse(fn) { diagnosticTreeVisits++; fn({ isMesh: true, isInstancedMesh: false }); } },
  detailRoot: { children: [], traverse(fn) { diagnosticTreeVisits++; fn({ isMesh: true, isInstancedMesh: false }); } },
  entities: [],
  refinement: { tasks: [{}, {}], cursor: 0, attempted: 0, published: 0, noOp: 0, failed: 0 },
});
diagnosticStreamer.stats();
diagnosticStreamer.updateVisibility();
diagnosticStreamer.stats();
assert.equal(diagnosticTreeVisits, 0, 'normal scheduler stats and visibility health checks must not traverse render trees');
const explicitDiagnostic = diagnosticStreamer.stats({ includeRichness: true });
assert.ok(diagnosticTreeVisits > 0 && explicitDiagnostic.richness?.perChunk?.length === 1,
  'the explicit diagnostic snapshot may traverse render trees on its low-frequency cadence');
await diagnosticStreamer.dispose();

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
