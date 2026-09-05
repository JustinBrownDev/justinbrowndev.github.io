import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';

globalThis.window = {};
globalThis.location = { search: '?generationProfile=skeleton&buildBudgetMs=5.5' };

const [
  { createKowloonFabricEngine },
  { deterministicChunkSeed, worldWeirdnessAt },
  { PROGRESSIVE_EXTERIOR_DETAIL_KINDS },
] = await Promise.all([
  import('../kowloon-fabric-engine.js?progressive-enrichment-selftest=1'),
  import('../world-chunk-streamer.js'),
  import('../world/kowloon-fabric-enrichment.js?progressive-enrichment-selftest=1'),
]);

const worldSeed = 0x51CEB00C;
const chunk = {
  key: '1,0', x: 1, z: 0, centerX: 64, centerZ: 0,
  seed: deterministicChunkSeed(worldSeed, 1, 0),
  weirdness: worldWeirdnessAt(1, 0, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
};
const scene = new THREE.Scene();
const physicsAuthority = {
  registerOwnedWorld() { return { activationState: 'active', deferredReason: null }; },
  unregisterOwnedWorld() { return true; },
};
const engine = createKowloonFabricEngine({
  THREE, scene, playerPhysics: physicsAuthority, directSceneAdd: scene.add.bind(scene),
  worldSeed, chunkSize: 64, landmarkSpacingChunks: 3,
});
const payload = await engine.build(chunk);

function drain(label, limit = 3000) {
  let remaining = limit;
  while (engine.hasPendingRefinement(chunk, payload) && remaining-- > 0) {
    engine.refine(chunk, payload, { maxSteps: 64, maxMillis: Infinity });
  }
  assert.ok(remaining > 0, `${label}: refinement did not converge`);
}

function physicsShape(physics) {
  return {
    props: physics.props?.length ?? 0,
    ramps: physics.ramps?.length ?? 0,
    platforms: physics.platforms?.length ?? 0,
    connectors: physics.semanticConnectors?.length ?? 0,
    transportNodes: physics.worldCirculation?.stats?.transportNodes ?? null,
    circulationComponents: physics.worldCirculation?.stats?.components ?? null,
  };
}

drain('baseline');
const before = {
  detailChildren: payload.detailRoot.children.length,
  physics: physicsShape(payload.physics),
  taskCount: payload.refinement.tasks.length,
  circulation: {
    components: payload.worldCirculation?.stats?.components ?? null,
    reachableSpaces: payload.worldCirculation?.stats?.reachableSpaces ?? null,
    unreachableSpaces: payload.worldCirculation?.stats?.unreachableSpaces ?? null,
    reachableTransportNodes: payload.worldCirculation?.stats?.reachableTransportNodes ?? null,
    unreachableTransportNodes: payload.worldCirculation?.stats?.unreachableTransportNodes ?? null,
  },
};

const requested = engine.requestProgressiveDeepening(chunk, payload);
assert.equal(requested.ground, true, 'ground skeleton should accept one progressive deepening request');
assert.equal(requested.hanging, true, 'hanging skeleton should accept one progressive deepening request');
assert.equal(requested.requested, 2);
assert.equal(engine.hasPendingRefinement(chunk, payload), true,
  'progressive planning must re-enter the existing refinement queue after baseline completion');
assert.equal(engine.requestProgressiveDeepening(chunk, payload).requested, 0,
  'deepening request must be idempotent per payload');

drain('progressive');

const ground = payload.refinement.progressiveEnrichment;
const hanging = payload.hangingLayer?.payload?.refinement?.progressiveEnrichment;
for (const [field, state] of [['ground', ground], ['hanging', hanging]]) {
  assert.equal(state?.requested, true, `${field}: request telemetry`);
  assert.equal(state?.planned, true, `${field}: second-stage planner completed`);
  assert.equal(state?.complete, true, `${field}: realization completed`);
  assert.ok(state?.rawTaskCount > 0, `${field}: omitted skeleton corpus must exist`);
  assert.ok(state?.planningSteps > 1, `${field}: composition planning must be cooperatively sliced`);
  assert.equal(state?.planningSteps, state?.planningUnits, `${field}: one compiler unit per refinement planning turn`);
  assert.ok(state?.taskCount > 0, `${field}: authoritative composition should accept some progressive tasks`);
  assert.ok(state?.published > 0, `${field}: progressive detail should visibly publish`);
  assert.equal(state?.failed, 0, `${field}: no coordinate-orphan/detail failures`);
}

const progressiveTasks = [
  ...payload.refinement.tasks,
  ...(payload.hangingLayer?.payload?.refinement?.tasks ?? []),
].filter(task => task.progressiveEnrichment);
assert.ok(progressiveTasks.length > 0);
for (const task of progressiveTasks) {
  assert.ok(PROGRESSIVE_EXTERIOR_DETAIL_KINDS.includes(task.kind),
    `progressive task ${task.kind} escaped the cosmetic whitelist`);
}

const afterPhysics = physicsShape(payload.physics);
assert.deepEqual(afterPhysics, before.physics,
  'post-handoff exterior deepening must not mutate blockers, ramps, platforms, connectors, or circulation topology');
assert.deepEqual({
  components: payload.worldCirculation?.stats?.components ?? null,
  reachableSpaces: payload.worldCirculation?.stats?.reachableSpaces ?? null,
  unreachableSpaces: payload.worldCirculation?.stats?.unreachableSpaces ?? null,
  reachableTransportNodes: payload.worldCirculation?.stats?.reachableTransportNodes ?? null,
  unreachableTransportNodes: payload.worldCirculation?.stats?.unreachableTransportNodes ?? null,
}, before.circulation,
  'progressive exterior detail must not rewrite the unified circulation graph');
assert.ok(payload.detailRoot.children.length > before.detailChildren,
  'progressive pass should add visible detail after baseline is already complete');
assert.ok(payload.refinement.tasks.length > before.taskCount,
  'accepted progressive tasks should append to the existing deterministic refinement corpus');

console.log('[progressive-exterior-enrichment-selftest] PASS', {
  baselineDetailChildren: before.detailChildren,
  finalDetailChildren: payload.detailRoot.children.length,
  ground: {
    raw: ground.rawTaskCount, accepted: ground.taskCount, published: ground.published,
    planningSteps: ground.planningSteps,
  },
  hanging: {
    raw: hanging.rawTaskCount, accepted: hanging.taskCount, published: hanging.published,
    planningSteps: hanging.planningSteps,
  },
  physicsInvariant: afterPhysics,
  circulationInvariant: before.circulation,
});

engine.disposeShared();
