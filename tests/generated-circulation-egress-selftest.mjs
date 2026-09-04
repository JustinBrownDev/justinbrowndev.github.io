import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';

globalThis.window = {};
globalThis.location = { search: '?generationProfile=skeleton&buildBudgetMs=5.5' };

const [
  { createKowloonFabricEngine },
  { deterministicChunkSeed, worldWeirdnessAt },
  { compileSemanticContext },
] = await Promise.all([
  import('../kowloon-fabric-engine.js?generated-circulation-egress-selftest=1'),
  import('../world-chunk-streamer.js'),
  import('../world/semantic-context.js'),
]);

const worldSeed = 0x51CEB00C;
const chunkSize = 64;
const chunk = {
  key: '1,0', x: 1, z: 0,
  centerX: chunkSize, centerZ: 0,
  seed: deterministicChunkSeed(worldSeed, 1, 0),
  weirdness: worldWeirdnessAt(1, 0, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
};
const scene = new THREE.Scene();
const playerPhysics = {
  registerOwnedWorld() { return { activationState: 'active', deferredReason: null }; },
  unregisterOwnedWorld() { return true; },
};
const factory = createKowloonFabricEngine({
  THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene),
  worldSeed, chunkSize, landmarkSpacingChunks: 3,
});

const payload = await factory.build(chunk);
compileSemanticContext({ chunk, payload, tasks: [] });
const circulation = payload.worldCirculation;
assert.ok(circulation, 'generated chunk must publish unified world circulation');
assert.ok(circulation.stats.explicitEgressBuildings > 0, 'fixture must contain buildings with explicit egress');
assert.ok(circulation.stats.worldNodes > 0, 'generated circulation must reach real world nodes');
assert.equal(circulation.stats.explicitEgressFailures, 0, 'generated explicit-egress buildings must have no disconnected authored spaces');
assert.equal(circulation.stats.unreachableSpaces, 0, 'deterministic generated fixture must route every authored space to world circulation');
assert.ok(circulation.stats.crossLayerEdges > 0, 'ground and hanging circulation must be joined by physical cavern connectors');
assert.equal(circulation.stats.unreachableTransportNodes, 0,
  'every published ground and hanging transport surface must participate in unified world circulation');
const hangingPhysics = payload.hangingLayer?.payload?.physics;
assert.ok(hangingPhysics?.exteriorTransportNetwork, 'hanging city must publish its own authoritative exterior transport network');
assert.equal(hangingPhysics.exteriorTransportNetwork.closure.unreachableRequired, 0,
  'hanging clear-roof circulation candidates must close before unified graph publication');
for (const bridge of payload.hangingLayer?.payload?.entities?.filter(entity => entity.kind === 'skybridge') ?? []) {
  assert.ok(Math.abs(Number(bridge.aEndpoint?.y) - Number(bridge.bEndpoint?.y)) <= 0.08,
    `${bridge.id}: emitted flat hanging bridge endpoints must agree on world height`);
  const surface = (hangingPhysics.exteriorTransportSurfaces ?? []).find(candidate => candidate.bridgeId === bridge.id);
  assert.ok(surface, `${bridge.id}: emitted hanging bridge must publish a transport surface`);
  assert.ok(Math.abs(Number(surface.y) - (Number(bridge.aEndpoint.y) + Number(bridge.bEndpoint.y)) * 0.5) <= 1e-9,
    `${bridge.id}: bridge surface must use authoritative facade endpoint world Y`);
  assert.ok((hangingPhysics.semanticConnectors ?? []).some(connector => connector.metadata?.surfaceId === surface.id),
    `${bridge.id}: bridge transport surface must bind into semantic circulation`);
}

console.log('[generated-circulation-egress-selftest] PASS', circulation.stats);
