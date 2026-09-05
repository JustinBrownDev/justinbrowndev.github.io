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
  import('../kowloon-fabric-engine.js?progressive-interior-enrichment-selftest=21p'),
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
const hangingPayload = payload.hangingLayer?.payload;
assert.ok(hangingPayload?.ceilingCity, 'fixture must include the hanging city payload');

function drain(label, limit = 5000) {
  let remaining = limit;
  while (engine.hasPendingRefinement(chunk, payload) && remaining-- > 0) {
    engine.refine(chunk, payload, { maxSteps: 64, maxMillis: Infinity });
  }
  assert.ok(remaining > 0, `${label}: refinement did not converge`);
}

function physicalSnapshot(target) {
  return {
    props: target.physics.props?.length ?? 0,
    ramps: target.physics.ramps?.length ?? 0,
    platforms: target.physics.platforms?.length ?? 0,
    connectors: target.physics.semanticConnectors?.length ?? 0,
    accessPortals: target.physics.accessPortals?.length ?? 0,
    spatialPortals: target.spatialTopology?.portals?.length ?? 0,
    spatialApertures: target.spatialTopology?.apertures?.length ?? 0,
    spatialEdges: target.spatialTopology?.edges?.length ?? 0,
    circulation: structuredClone(target.worldCirculation?.stats ?? null),
  };
}

function layerSnapshot(target) {
  return {
    detailChildren: target.detailRoot.children.length,
    taskCount: target.refinement.tasks.length,
    reservations: target.detailReservations.length,
    physical: physicalSnapshot(target),
  };
}

function assertInteriorLayer(target, before, expectedLayer) {
  const state = target.refinement.progressiveInteriorEnrichment;
  assert.equal(state?.requested, true);
  assert.equal(state?.planned, true);
  assert.equal(state?.complete, true);
  assert.equal(state?.layout?.layer, expectedLayer);
  assert.ok(state?.eligiblePortals > 0, `${expectedLayer}: must expose real public floor-0 portals`);
  assert.ok(state?.bindingCount > 0, `${expectedLayer}: must bind at least one authored place identity`);
  assert.ok(state?.taskCount > 0 && state.taskCount <= 3, `${expectedLayer}: stage remains useful and tightly capped`);
  assert.equal(state?.published, state?.taskCount);
  assert.equal(state?.failed, 0);
  assert.equal(state?.layout?.unresolved, 0);

  const tasks = target.refinement.tasks.filter(task => task.progressiveInteriorEnrichment);
  assert.equal(tasks.length, state.taskCount);
  const portalById = new Map((target.spatialTopology?.portals ?? []).map(portal => [portal.id, portal]));
  const spaceById = new Map((target.spatialTopology?.spaces ?? []).map(space => [space.id, space]));
  const planById = new Map((target.spacePlans ?? []).map(plan => [plan.id, plan]));
  const families = new Set();
  for (const task of tasks) {
    assert.equal(task.kind, 'portal-bound-interior-place');
    assert.equal(task.topologySolved, true);
    assert.deepEqual(task.topologyDescriptors, []);
    const binding = task.portalBoundInteriorPlace;
    families.add(binding.fixtureFamily);
    assert.equal(binding.layer, expectedLayer);
    assert.ok(binding?.routeVerified);
    assert.ok(binding?.fixtureFamily);
    assert.equal(binding.floor, 0);
    assert.ok(!['entry', 'circulation'].includes(binding.spaceRole));
    assert.ok(target.worldCirculation?.routes?.[binding.spaceId], `${expectedLayer}: target room must already have an exit route`);
    assert.equal(binding.placeSource, expectedLayer === 'hanging' ? 'route-owned-rooftop-place' : 'route-owned-plaza-place');
    assert.equal(binding.placeRouteOwnership,
      expectedLayer === 'hanging' ? 'authoritative-exterior-transport-network' : 'world-street-plaza-circulation');
    const portal = portalById.get(binding.portalId);
    assert.ok(portal, `${expectedLayer}: binding must name an existing access portal`);
    assert.equal(portal.connectorType, 'door');
    assert.equal(portal.traversal?.role, 'public-access');
    assert.equal(portal.provenance?.source, 'compound-entrance');
    assert.equal(portal.floor, 0);
    const space = spaceById.get(binding.spaceId);
    assert.ok(space && space.floor === 0);
    const plan = planById.get(binding.spaceId);
    assert.ok(plan, `${expectedLayer}: progressive planner must publish the target SpacePlan`);
    assert.equal(spacePlanAcceptsBox(plan, task.semanticPlacement.reservation, {
      allowCirculation: false,
      requireSameRegion: true,
    }), true, `${expectedLayer}: fixture reservation must remain inside an egress-clear room region`);
    assert.ok(task.semanticPlacement.y >= space.bounds.yMin && task.semanticPlacement.y < space.bounds.yMax,
      `${expectedLayer}: fixture must use the room's translated vertical frame`);
  }

  assert.deepEqual(physicalSnapshot(target), before.physical,
    `${expectedLayer}: fixtures must not add blockers, platforms, connectors, portals, apertures, edges, or rewrite circulation`);
  assert.equal(target.detailRoot.children.length, before.detailChildren + state.published,
    `${expectedLayer}: every accepted binding should add one visible family-fixture group`);
  assert.equal(target.refinement.tasks.length, before.taskCount + state.taskCount);
  assert.ok(target.detailReservations.length >= before.reservations + state.published,
    `${expectedLayer}: fixtures reserve cosmetic space so later detail cannot stack on them`);

  const newGroups = target.detailRoot.children.slice(before.detailChildren);
  assert.equal(newGroups.length, state.published);
  for (const group of newGroups) {
    assert.equal(group.userData.detailKind, 'portal-bound-interior-place');
    assert.equal(group.userData.portalBoundLayer, expectedLayer);
    assert.ok(group.userData.portalBoundFixtureFamily);
    assert.ok(group.children.length >= 5, `${expectedLayer}: identity endpoint must be an actual small fixture grammar, not paint only`);
  }
  return { state, tasks, families: [...families].sort(), newGroups };
}

drain('baseline');
const exteriorRequest = engine.requestProgressiveDeepening(chunk, payload);
assert.equal(exteriorRequest.requested, 2, 'first request remains ground+hanging exterior deepening');
drain('progressive exterior');
assert.equal(payload.refinement.progressiveEnrichment?.complete, true);
assert.equal(hangingPayload.refinement.progressiveEnrichment?.complete, true);

const beforeGround = layerSnapshot(payload);
const beforeHanging = layerSnapshot(hangingPayload);
const interiorRequest = engine.requestProgressiveDeepening(chunk, payload);
assert.equal(interiorRequest.ground, true, 'ground plaza identity should open portal-bound interiors');
assert.equal(interiorRequest.hanging, true, 'hanging rooftop identity should now continue through real hanging entrances');
assert.equal(interiorRequest.requested, 2);
assert.equal(engine.requestProgressiveDeepening(chunk, payload).requested, 0,
  'interior request must be idempotent while pending');
assert.equal(engine.hasPendingRefinement(chunk, payload), true);

drain('portal-bound interior fixtures');
const ground = assertInteriorLayer(payload, beforeGround, 'ground');
const hanging = assertInteriorLayer(hangingPayload, beforeHanging, 'hanging');

assert.equal(payload.worldCirculation?.stats?.components, 1);
assert.equal(payload.worldCirculation?.stats?.unreachableSpaces, 0);
assert.equal(payload.worldCirculation?.stats?.unreachableTransportNodes, 0);
assert.equal(hangingPayload.worldCirculation?.stats?.unreachableSpaces, 0);
assert.equal(hangingPayload.worldCirculation?.stats?.unreachableTransportNodes, 0);

console.log('[progressive-interior-enrichment-selftest] PASS', {
  ground: {
    bindings: ground.state.bindingCount,
    published: ground.state.published,
    fixtureFamilies: ground.families,
    y: ground.tasks.map(task => Number(task.semanticPlacement.y.toFixed(3))),
  },
  hanging: {
    bindings: hanging.state.bindingCount,
    published: hanging.state.published,
    fixtureFamilies: hanging.families,
    y: hanging.tasks.map(task => Number(task.semanticPlacement.y.toFixed(3))),
  },
  physicsDelta: {
    groundProps: physicalSnapshot(payload).props - beforeGround.physical.props,
    hangingProps: physicalSnapshot(hangingPayload).props - beforeHanging.physical.props,
    groundPortals: physicalSnapshot(payload).spatialPortals - beforeGround.physical.spatialPortals,
    hangingPortals: physicalSnapshot(hangingPayload).spatialPortals - beforeHanging.physical.spatialPortals,
  },
  circulation: payload.worldCirculation.stats,
});

engine.disposeShared();
