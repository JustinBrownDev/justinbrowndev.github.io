import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';

globalThis.window = {};
globalThis.location = { search: '?generationProfile=skeleton&buildBudgetMs=5.5' };

const [
  { createKowloonFabricEngine },
  { deterministicChunkSeed, worldWeirdnessAt },
] = await Promise.all([
  import('../kowloon-fabric-engine.js?hanging-city-content-parity-selftest=21p'),
  import('../world-chunk-streamer.js'),
]);

const worldSeed = 0x51CEB00C;
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
const engine = createKowloonFabricEngine({
  THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene),
  worldSeed, chunkSize: 64, landmarkSpacingChunks: 3,
});
const payload = await engine.build(chunk);
const hanging = payload.hangingLayer?.payload;
assert.ok(hanging?.ceilingCity, 'fixture must publish a real hanging-city payload');

function drain(label, limit = 5000) {
  let remaining = limit;
  while (engine.hasPendingRefinement(chunk, payload) && remaining-- > 0) {
    engine.refine(chunk, payload, { maxSteps: 64, maxMillis: Infinity });
  }
  assert.ok(remaining > 0, `${label}: refinement did not converge`);
}

drain('baseline');
const exterior = engine.requestProgressiveDeepening(chunk, payload);
assert.deepEqual({ ground: exterior.ground, hanging: exterior.hanging }, { ground: true, hanging: true });
drain('exterior parity');
const interior = engine.requestProgressiveDeepening(chunk, payload);
assert.deepEqual({ ground: interior.ground, hanging: interior.hanging }, { ground: true, hanging: true });
drain('interior parity');

const hangingPlaces = hanging.physics.routeOwnedRooftopPlaces ?? [];
const placeTypes = new Set(hangingPlaces.map(place => place.placeType));
const expectedPlaceTypes = [
  'roof-bodega', 'thrift-stall', 'gallery-terrace', 'repair-bay',
  'refuge', 'utility-yard', 'fuel-kiosk',
];
for (const type of expectedPlaceTypes) assert.ok(placeTypes.has(type), `hanging content fixture must include ${type}`);
assert.equal(placeTypes.size, expectedPlaceTypes.length,
  'deterministic hanging fixture should exercise the complete seven-family authored-place vocabulary');
for (const place of hangingPlaces) {
  assert.equal(place.routeOwnership, 'authoritative-exterior-transport-network');
  assert.ok(place.parts?.length >= 12, `${place.placeType}: authored exterior scene must remain rich`);
}

const kindCounts = new Map();
for (const task of hanging.refinement.tasks ?? []) kindCounts.set(task.kind, (kindCounts.get(task.kind) ?? 0) + 1);
for (const kind of ['sign', 'pipe', 'awning', 'street-fixture', 'service-hardware']) {
  assert.ok((kindCounts.get(kind) ?? 0) > 0, `hanging exterior enrichment must retain ${kind}`);
}
assert.ok((hanging.refinement.progressiveEnrichment?.published ?? 0) > 0,
  'hanging city must receive its own progressive exterior deepening');

const interiorTasks = (hanging.refinement.tasks ?? []).filter(task => task.progressiveInteriorEnrichment);
assert.ok(interiorTasks.length > 0 && interiorTasks.length <= 3,
  'hanging exterior identities must continue through real entrances into capped interior fixtures');
const publicPortals = new Map((hanging.spatialTopology?.portals ?? []).map(portal => [portal.id, portal]));
const spaces = new Map((hanging.spatialTopology?.spaces ?? []).map(space => [space.id, space]));
for (const task of interiorTasks) {
  const binding = task.portalBoundInteriorPlace;
  assert.equal(binding.layer, 'hanging');
  assert.equal(binding.placeSource, 'route-owned-rooftop-place');
  assert.equal(binding.placeRouteOwnership, 'authoritative-exterior-transport-network');
  assert.ok(expectedPlaceTypes.includes(binding.sceneType ?? binding.placeType));
  const portal = publicPortals.get(binding.portalId);
  const space = spaces.get(binding.spaceId);
  assert.ok(portal && space, 'continuity must bind existing hanging topology');
  assert.equal(portal.traversal?.role, 'public-access');
  assert.equal(portal.provenance?.source, 'compound-entrance');
  assert.equal(portal.floor, 0);
  assert.equal(space.floor, 0);
  assert.ok(task.semanticPlacement.y >= space.bounds.yMin && task.semanticPlacement.y < space.bounds.yMax,
    'hanging interior fixture must live in the translated ceiling-city room frame');
  assert.ok(hanging.worldCirculation?.routes?.[binding.spaceId], 'bound hanging room must already route to an exit');
}

assert.equal(hanging.worldCirculation?.stats?.unreachableSpaces, 0);
assert.equal(hanging.worldCirculation?.stats?.unreachableTransportNodes, 0);
assert.equal(payload.worldCirculation?.stats?.components, 1,
  'ground + hanging city must remain one unified circulation component');
assert.equal(payload.worldCirculation?.stats?.unreachableSpaces, 0);
assert.equal(payload.worldCirculation?.stats?.unreachableTransportNodes, 0);

console.log('[hanging-city-content-parity-selftest] PASS', {
  placeTypes: [...placeTypes].sort(),
  exteriorKinds: Object.fromEntries([...kindCounts].filter(([kind]) =>
    ['sign', 'pipe', 'awning', 'street-fixture', 'service-hardware', 'security', 'ivy'].includes(kind))),
  progressiveExteriorPublished: hanging.refinement.progressiveEnrichment?.published ?? 0,
  portalBoundInteriorFixtures: interiorTasks.length,
  interiorFamilies: [...new Set(interiorTasks.map(task => task.portalBoundInteriorPlace.fixtureFamily))].sort(),
  hangingCirculation: hanging.worldCirculation.stats,
  unifiedCirculation: payload.worldCirculation.stats,
});

engine.disposeShared();
