import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';

globalThis.window = {};
globalThis.location = { search: '?generationProfile=skeleton&buildBudgetMs=5.5' };

const [
  { createKowloonFabricEngine },
  { deterministicChunkSeed, worldWeirdnessAt },
  { compileSemanticContext },
] = await Promise.all([
  import('../kowloon-fabric-engine.js?generated-roof-jump-circulation-selftest=1'),
  import('../world-chunk-streamer.js'),
  import('../world/semantic-context.js'),
]);

const worldSeed = 0x51CEB00C;
const chunkSize = 64;
const chunk = {
  key: '1,0', x: 1, z: 0, centerX: chunkSize, centerZ: 0,
  seed: deterministicChunkSeed(worldSeed, 1, 0),
  weirdness: worldWeirdnessAt(1, 0, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
};
const scene = new THREE.Scene();
const playerPhysics = {
  registerOwnedWorld() { return { activationState: 'active', deferredReason: null }; },
  unregisterOwnedWorld() { return true; },
};
const factory = createKowloonFabricEngine({ THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene), worldSeed, chunkSize, landmarkSpacingChunks: 3 });
const payload = await factory.build(chunk);
compileSemanticContext({ chunk, payload, tasks: [] });

const physics = payload.physics;
const crossoverEdges = (physics.exteriorTransportEdges ?? []).filter(edge => edge.kind === 'roof-crossover-link' || edge.source === 'roof-crossover-link');
const jumpEdges = (physics.exteriorTransportEdges ?? []).filter(edge => edge.kind === 'jump-link' || edge.source === 'jump-link');
assert.ok(crossoverEdges.length >= 1, 'deterministic fixture must realize at least one physical roof crossover');
const surfaces = new Map((physics.exteriorTransportSurfaces ?? []).map(surface => [surface.id, surface]));
const jumpConnectors = (physics.semanticConnectors ?? []).filter(connector => connector.kind === 'jump');
assert.equal(jumpConnectors.length, jumpEdges.length, 'each selected nonzero-gap roof jump must publish exactly one semantic jump connector');
assert.ok((physics.semanticConnectors ?? []).some(connector => connector.source === 'compound-stair-roof-junction' && connector.metadata?.surfaceId),
  'persistent interior core must publish a semantic roof-surface junction');

function pointSegmentDistance(point, wall) {
  const x1 = Number(wall.x1), z1 = Number(wall.z1), x2 = Number(wall.x2), z2 = Number(wall.z2);
  const dx = x2 - x1, dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  if (!(len2 > 1e-9)) return Math.hypot(point.x - x1, point.z - z1);
  const t = Math.max(0, Math.min(1, ((point.x - x1) * dx + (point.z - z1) * dz) / len2));
  return Math.hypot(point.x - (x1 + dx * t), point.z - (z1 + dz * t));
}

for (const edge of [...crossoverEdges, ...jumpEdges]) {
  const a = surfaces.get(edge.aId), b = surfaces.get(edge.bId);
  assert.equal(a?.kind, 'clear-roof-street-layer');
  assert.equal(b?.kind, 'clear-roof-street-layer');
  if (edge.kind === 'jump-link' || edge.source === 'jump-link') {
    assert.ok(Number(edge.gap) > 0.08, `${edge.id}: a jump must cross a real nonzero gap`);
    assert.ok(Number(edge.gap) <= Number(edge.maxRange) + 1e-9, `${edge.id}: gap must stay within controller-derived range`);
    assert.equal(edge.traversalAuthority, 'gameplay-controller-ballistic-envelope');
  } else {
    assert.ok(Number(edge.gap) <= 0.08 + 1e-9, `${edge.id}: roof crossover is reserved for touching roof plates`);
    assert.equal(edge.traversalAuthority, 'gameplay-controller-step-envelope');
  }
  for (const [surface, point] of [[a, edge.aPoint], [b, edge.bPoint]]) {
    const blockingRails = (physics.mazeWalls ?? []).filter(wall => wall.surfaceId === surface.id && wall.transportRailId && pointSegmentDistance(point, wall) < 0.30);
    assert.equal(blockingRails.length, 0, `${edge.id}:${surface.id}: selected roof crossing mouth must be physically open through the parapet`);
  }
}
for (const connector of jumpConnectors) {
  assert.equal(connector.metadata?.spaceBindingMode, 'transport-surface-only');
  assert.deepEqual(connector.spaceIds ?? [], [], 'jump airspace must not bypass transport-surface graph authority by binding rooms directly');
}

const network = physics.exteriorTransportNetwork;
assert.equal(network?.closure?.unreachableRequired, 0,
  'every clear roof explicitly published as a circulation candidate must be attached to a live transport component');
assert.deepEqual(network?.unreachableRequiredSurfaceIds ?? [], []);
assert.equal(network?.planning?.requiredSurfaceMode, 'local-seed-components');
assert.ok((network?.closure?.optionalIsolatedCandidates ?? 0) > 0,
  'ground fixture must classify nonlocal roof islands as optional instead of forcing long catwalk closure');
assert.ok((network?.rejectionCounts?.volumeBlocked ?? 0) > 0,
  'generated roof planner must reject at least one route corridor that intersects an unrelated solid building volume');
assert.ok((network?.links?.length ?? 0) <= (network?.closure?.linkBudget ?? Infinity));
assert.equal(network?.planning?.stopWhenRequiredReachable, true,
  'ground transport must stop once every required roof is live instead of spending the remaining forest budget');
assert.equal(network?.planning?.restrictArterialsToRequiredClosure, true);
const groundArterialWalkways = (network?.links ?? []).filter(link => link.kind === 'walkway-link' && link.arterial === true);
assert.equal(groundArterialWalkways.length, 0,
  'ground closure must not synthesize long same-level arterial catwalks after ordinary streets/building egress already exist');
assert.ok((network?.links ?? []).filter(link => link.kind === 'walkway-link').every(link => Number(link.gap) <= 10 + 1e-9),
  'ground fabricated walkways stay within the tightened local span envelope');

const circulation = payload.worldCirculation;
const hangingPhysics = payload.hangingLayer?.payload?.physics;
const hangingPayload = payload.hangingLayer?.payload;
const hangingSkybridges = (hangingPayload?.entities ?? []).filter(entity => entity.kind === 'skybridge');
assert.ok(hangingSkybridges.length >= 2,
  'deterministic hanging fixture must visibly realize multiple building-to-building sky connections');
assert.equal(hangingPayload?.skybridgePlanning?.realized, hangingSkybridges.length);
assert.ok((hangingPayload?.skybridgePlanning?.planned ?? 0) >= hangingSkybridges.length);
assert.equal(hangingPayload?.skybridgePlanning?.authority, 'ceiling-field-peer-planner');
for (const bridge of hangingSkybridges) {
  assert.notEqual(bridge.aSiteId, bridge.bSiteId, `${bridge.id}: a hanging skybridge must join distinct buildings`);
  assert.equal(bridge.aEndpoint?.resolved, true);
  assert.equal(bridge.bEndpoint?.resolved, true);
  assert.ok(Math.abs(Number(bridge.aEndpoint.y) - Number(bridge.bEndpoint.y)) <= 0.08,
    `${bridge.id}: ceiling peer endpoints must resolve to one flat world-height band`);
}
assert.ok(hangingSkybridges.some(bridge => Number(bridge.aEndpoint?.floor) !== Number(bridge.bEndpoint?.floor)),
  'fixture must prove top-aligned ceiling bridges can join different local floor numbers at the same world height');
const hangingCrossoverEdges = (hangingPhysics?.exteriorTransportEdges ?? []).filter(edge => edge.kind === 'roof-crossover-link' || edge.source === 'roof-crossover-link');
const hangingJumpEdges = (hangingPhysics?.exteriorTransportEdges ?? []).filter(edge => edge.kind === 'jump-link' || edge.source === 'jump-link');
assert.equal(circulation.stats.roofCrossoverEdges, crossoverEdges.length + hangingCrossoverEdges.length);
assert.equal(circulation.stats.jumpEdges, jumpEdges.length + hangingJumpEdges.length);
assert.ok(circulation.stats.transportJunctionEdges > 0);
assert.equal(circulation.stats.unreachableTransportNodes, 0,
  'unified graph must not leave published walkway, route, ground-roof, or hanging-roof shadow nodes behind');
assert.ok(circulation.stats.crossLayerEdges > 0, 'roof circulation must join the hanging and ground layers through cavern circulation');
assert.equal(circulation.stats.explicitEgressFailures, 0);
assert.equal(circulation.stats.unreachableSpaces, 0);
assert.equal(hangingPhysics?.exteriorTransportNetwork?.closure?.unreachableRequired, 0,
  'hanging clear roofs must close under the same transport planner authority');

console.log('[generated-roof-jump-circulation-selftest] PASS', {
  crossovers: crossoverEdges.length,
  jumps: jumpEdges.length,
  transportEdges: circulation.stats.transportEdges,
  transportJunctionEdges: circulation.stats.transportJunctionEdges,
  reachableTransportNodes: circulation.stats.reachableTransportNodes,
  unreachableTransportNodes: circulation.stats.unreachableTransportNodes,
  crossLayerEdges: circulation.stats.crossLayerEdges,
  unreachableSpaces: circulation.stats.unreachableSpaces,
  hangingSkybridges: hangingSkybridges.length,
  hangingBridgePlans: hangingPayload.skybridgePlanning?.planned ?? 0,
  groundWalkways: (network.links ?? []).filter(link => link.kind === 'walkway-link').length,
  groundArterialWalkways: groundArterialWalkways.length,
  groundOptionalIsolatedRoofs: network.closure.optionalIsolatedCandidates ?? 0,
  hangingRequiredRoofs: hangingPhysics.exteriorTransportNetwork.closure.required,
  hangingUnreachableRequiredRoofs: hangingPhysics.exteriorTransportNetwork.closure.unreachableRequired,
  requiredRoofs: network.closure.required,
  unreachableRequiredRoofs: network.closure.unreachableRequired,
  arterialLinks: network.planning.arterialLinks,
  laneShiftedLinks: network.planning.laneShiftedLinks,
  maxCrossoverGap: Math.max(...crossoverEdges.map(edge => Number(edge.gap) || 0)),
  maxJumpGap: jumpEdges.length ? Math.max(...jumpEdges.map(edge => Number(edge.gap) || 0)) : null,
  minHeadroomAuthority: jumpConnectors[0]?.traversalEnvelope?.jump?.authority ?? null,
});
