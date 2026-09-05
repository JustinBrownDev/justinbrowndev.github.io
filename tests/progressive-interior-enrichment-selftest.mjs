import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { spacePlanAcceptsBox } from '../world/space-plan.js';

// Keep node-side GLTF upgrades inert while exercising deterministic placement.
globalThis.window = {};
globalThis.location = { search: '?generationProfile=skeleton&buildBudgetMs=5.5' };

const [
  { createKowloonFabricEngine },
  { deterministicChunkSeed, worldWeirdnessAt },
] = await Promise.all([
  import('../kowloon-fabric-engine.js?progressive-interior-enrichment-selftest=1'),
  import('../world-chunk-streamer.js'),
]);

const worldSeed = 0x51CEB00C;
const chunk = {
  key: '0,0', x: 0, z: 0, centerX: 0, centerZ: 0,
  seed: deterministicChunkSeed(worldSeed, 0, 0),
  weirdness: worldWeirdnessAt(0, 0, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
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

function drain(label, limit = 5000) {
  let remaining = limit;
  while (engine.hasPendingRefinement(chunk, payload) && remaining-- > 0) {
    engine.refine(chunk, payload, { maxSteps: 64, maxMillis: Infinity });
  }
  assert.ok(remaining > 0, `${label}: refinement did not converge`);
}

function physicalSnapshot() {
  return {
    props: payload.physics.props?.length ?? 0,
    ramps: payload.physics.ramps?.length ?? 0,
    platforms: payload.physics.platforms?.length ?? 0,
    connectors: payload.physics.semanticConnectors?.length ?? 0,
    accessPortals: payload.physics.accessPortals?.length ?? 0,
    spatialPortals: payload.spatialTopology?.portals?.length ?? 0,
    spatialApertures: payload.spatialTopology?.apertures?.length ?? 0,
    spatialEdges: payload.spatialTopology?.edges?.length ?? 0,
    circulation: structuredClone(payload.worldCirculation?.stats ?? null),
  };
}

drain('baseline');
const exteriorRequest = engine.requestProgressiveDeepening(chunk, payload);
assert.equal(exteriorRequest.requested, 2, 'first request remains 21N ground+hanging exterior deepening');
drain('progressive exterior');
assert.equal(payload.refinement.progressiveEnrichment?.complete, true);
assert.equal(payload.hangingLayer?.payload?.refinement?.progressiveEnrichment?.complete, true);

const before = {
  detailChildren: payload.detailRoot.children.length,
  taskCount: payload.refinement.tasks.length,
  reservations: payload.detailReservations.length,
  physical: physicalSnapshot(),
};
const interiorRequest = engine.requestProgressiveDeepening(chunk, payload);
assert.equal(interiorRequest.ground, true, 'ground route-owned place should open 21O after exterior completion');
assert.equal(interiorRequest.hanging, false, '21O must not populate hanging interiors');
assert.equal(interiorRequest.requested, 1);
assert.equal(engine.requestProgressiveDeepening(chunk, payload).requested, 0,
  'interior request must be idempotent while pending');
assert.equal(engine.hasPendingRefinement(chunk, payload), true);

drain('portal-bound interior');
const state = payload.refinement.progressiveInteriorEnrichment;
assert.equal(state?.requested, true);
assert.equal(state?.planned, true);
assert.equal(state?.complete, true);
assert.ok(state?.eligiblePortals > 0, 'fixture must expose real public floor-0 portals');
assert.ok(state?.bindingCount > 0, 'fixture must bind at least one authored street place');
assert.ok(state?.taskCount > 0 && state.taskCount <= 3, 'interior continuity remains visibly useful and tightly capped');
assert.equal(state?.published, state?.taskCount);
assert.equal(state?.failed, 0);
assert.equal(state?.layout?.unresolved, 0);

const tasks = payload.refinement.tasks.filter(task => task.progressiveInteriorEnrichment);
assert.equal(tasks.length, state.taskCount);
const portalById = new Map((payload.spatialTopology?.portals ?? []).map(portal => [portal.id, portal]));
const spaceById = new Map((payload.spatialTopology?.spaces ?? []).map(space => [space.id, space]));
const planById = new Map((payload.spacePlans ?? []).map(plan => [plan.id, plan]));
for (const task of tasks) {
  assert.equal(task.kind, 'portal-bound-interior-place');
  assert.equal(task.topologySolved, true);
  assert.deepEqual(task.topologyDescriptors, []);
  const binding = task.portalBoundInteriorPlace;
  assert.ok(binding?.routeVerified);
  assert.equal(binding.floor, 0);
  assert.ok(!['entry', 'circulation'].includes(binding.spaceRole));
  assert.ok(payload.worldCirculation?.routes?.[binding.spaceId], 'target room must already have an exit route');
  const portal = portalById.get(binding.portalId);
  assert.ok(portal, 'binding must name an existing access portal');
  assert.equal(portal.connectorType, 'door');
  assert.equal(portal.traversal?.role, 'public-access');
  assert.equal(portal.provenance?.source, 'compound-entrance');
  assert.equal(portal.floor, 0);
  const space = spaceById.get(binding.spaceId);
  assert.ok(space && space.floor === 0);
  const plan = planById.get(binding.spaceId);
  assert.ok(plan, 'progressive planner must publish the target SpacePlan');
  assert.equal(spacePlanAcceptsBox(plan, task.semanticPlacement.reservation, {
    allowCirculation: false,
    requireSameRegion: true,
  }), true, 'paint reservation must remain inside an egress-clear room region');
}

assert.deepEqual(physicalSnapshot(), before.physical,
  '21O must not add blockers, ramps, platforms, connectors, portals, apertures, edges, or rewrite circulation');
assert.equal(payload.detailRoot.children.length, before.detailChildren + state.published,
  'every accepted portal-bound binding should add exactly one cheap visible paint group');
assert.equal(payload.refinement.tasks.length, before.taskCount + state.taskCount);
assert.ok(payload.detailReservations.length >= before.reservations + state.published,
  'paint marks reserve cosmetic space so later detail cannot stack on them');
assert.equal(payload.worldCirculation?.stats?.components, 1);
assert.equal(payload.worldCirculation?.stats?.unreachableSpaces, 0);
assert.equal(payload.worldCirculation?.stats?.unreachableTransportNodes, 0);

console.log('[progressive-interior-enrichment-selftest] PASS', {
  bindings: state.bindingCount,
  published: state.published,
  eligiblePortals: state.eligiblePortals,
  targetSpaces: tasks.map(task => ({
    role: task.portalBoundInteriorPlace.spaceRole,
    program: task.portalBoundInteriorPlace.semanticProgram,
    portalDistance: Number(task.portalBoundInteriorPlace.portalDistance.toFixed(2)),
  })),
  visibleDelta: payload.detailRoot.children.length - before.detailChildren,
  physicsDelta: {
    props: physicalSnapshot().props - before.physical.props,
    connectors: physicalSnapshot().connectors - before.physical.connectors,
    portals: physicalSnapshot().spatialPortals - before.physical.spatialPortals,
  },
  circulation: payload.worldCirculation.stats,
});

engine.disposeShared();
