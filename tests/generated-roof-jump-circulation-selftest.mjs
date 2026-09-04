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

const circulation = payload.worldCirculation;
assert.equal(circulation.stats.roofCrossoverEdges, crossoverEdges.length);
assert.equal(circulation.stats.jumpEdges, jumpEdges.length);
assert.ok(circulation.stats.transportJunctionEdges > 0);
assert.ok(circulation.stats.reachableTransportNodes > 0);
assert.equal(circulation.stats.explicitEgressFailures, 0);
assert.equal(circulation.stats.unreachableSpaces, 0);

console.log('[generated-roof-jump-circulation-selftest] PASS', {
  crossovers: crossoverEdges.length,
  jumps: jumpEdges.length,
  transportEdges: circulation.stats.transportEdges,
  transportJunctionEdges: circulation.stats.transportJunctionEdges,
  reachableTransportNodes: circulation.stats.reachableTransportNodes,
  unreachableSpaces: circulation.stats.unreachableSpaces,
  maxCrossoverGap: Math.max(...crossoverEdges.map(edge => Number(edge.gap) || 0)),
  maxJumpGap: jumpEdges.length ? Math.max(...jumpEdges.map(edge => Number(edge.gap) || 0)) : null,
  minHeadroomAuthority: jumpConnectors[0]?.traversalEnvelope?.jump?.authority ?? null,
});
