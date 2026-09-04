import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';

globalThis.window = {};
globalThis.location = { search: '?generationProfile=skeleton&buildBudgetMs=5.5' };

const [
  { createKowloonFabricEngine },
  { deterministicChunkSeed, worldWeirdnessAt },
  { compileSemanticContext },
] = await Promise.all([
  import('../kowloon-fabric-engine.js?generated-route-owned-plaza-places-selftest=1'),
  import('../world-chunk-streamer.js'),
  import('../world/semantic-context.js'),
]);

const worldSeed = 0x51CEB00C;
const chunkSize = 64;
const chunk = {
  key: '0,0', x: 0, z: 0, centerX: 0, centerZ: 0,
  seed: deterministicChunkSeed(worldSeed, 0, 0),
  weirdness: worldWeirdnessAt(0, 0, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
};
const scene = new THREE.Scene();
const playerPhysics = {
  registerOwnedWorld() { return { activationState: 'active', deferredReason: null }; },
  unregisterOwnedWorld() { return true; },
};
const factory = createKowloonFabricEngine({ THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene), worldSeed, chunkSize, landmarkSpacingChunks: 3 });
const payload = await factory.build(chunk);
compileSemanticContext({ chunk, payload, tasks: [] });

const plazas = payload.entities.filter(entity => entity.kind === 'plaza');
const places = payload.entities.filter(entity => entity.kind === 'route-owned-plaza-place');
assert.ok(plazas.length >= 1, 'deterministic spawn-adjacent fixture must contain a real generated plaza');
assert.ok(places.length >= 1, 'real generated plaza must receive a street-level authored place');
assert.equal(payload.routeOwnedPlazaPlaces.realized, places.length);

const plazaById = new Map(plazas.map(plaza => [plaza.id, plaza]));
for (const place of places) {
  const host = plazaById.get(place.plazaId);
  assert.ok(host, `${place.id}: host plaza must be a published entity`);
  assert.equal(host.roadAdjacent, true);
  assert.equal(host.kowloonServiceVoid, false);
  assert.ok(Array.isArray(host.footprintCells) && host.footprintCells.some(cell => cell.id === place.cellId));
  assert.equal(place.routeOwnership, 'world-street-plaza-circulation');
  assert.ok(place.sceneMetrics.parts >= 12);
  assert.ok(place.sceneMetrics.paintParts >= 3);
  assert.ok(place.sceneMetrics.emissiveParts >= 2);
  assert.ok(place.sceneMetrics.microParts >= 3);
  assert.ok(place.sceneMetrics.approachParts >= 4);
  const realized = (payload.physics.routeOwnedPlazaPlaces ?? []).find(item => item.id === place.id);
  assert.ok(realized, `${place.id}: realized street place must remain in physics registry`);
  const approach = realized.parts.filter(part => part.detailTier === 'approach');
  assert.equal(approach.some(part => part.collision), false);
  assert.ok(approach.some(part => part.emissive));
  assert.ok(approach.some(part => part.renderClass === 'paint'));
}

const circulation = payload.worldCirculation;
assert.equal(circulation.stats.components, 1, 'street-place enrichment must not fragment unified circulation');
assert.equal(circulation.stats.explicitEgressFailures, 0);
assert.equal(circulation.stats.unreachableSpaces, 0);
assert.equal(circulation.stats.unreachableTransportNodes, 0);
assert.equal(circulation.stats.reachableSpaces, circulation.stats.spaces);
assert.equal(circulation.stats.reachableTransportNodes, circulation.stats.transportNodes);

console.log('[generated-route-owned-plaza-places-selftest] PASS', {
  plazas: plazas.length,
  streetPlaces: places.length,
  streetPlaceTypes: new Set(places.map(place => place.placeType)).size,
  streetSceneParts: payload.routeOwnedPlazaPlaces.sceneParts,
  streetApproachParts: payload.routeOwnedPlazaPlaces.sceneApproachParts,
  circulationComponents: circulation.stats.components,
  reachableSpaces: circulation.stats.reachableSpaces,
  reachableTransportNodes: circulation.stats.reachableTransportNodes,
  unreachableTransportNodes: circulation.stats.unreachableTransportNodes,
});
