import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import {
  ROUTE_OWNED_ROOFTOP_PLACE_TYPES,
  placeFootprintIntersectsReservation,
  routeSpokeRectanglesForSurface,
} from '../world/route-owned-rooftop-places.js';

globalThis.window = {};
globalThis.location = { search: '?generationProfile=skeleton&buildBudgetMs=5.5' };

const [
  { createKowloonFabricEngine },
  { deterministicChunkSeed, worldWeirdnessAt },
  { compileSemanticContext },
] = await Promise.all([
  import('../kowloon-fabric-engine.js?generated-route-owned-rooftop-places-selftest=1'),
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

function assertField(label, physics, expectedMinimum) {
  const plan = physics?.routeOwnedRooftopPlacePlan;
  const network = physics?.exteriorTransportNetwork;
  assert.ok(plan, `${label}: route-owned rooftop place plan must publish`);
  assert.equal(network?.closure?.unreachableRequired, 0, `${label}: content pass may only run over a closed required roof graph`);
  assert.ok(plan.places.length >= expectedMinimum, `${label}: deterministic fixture should visibly populate several roof places`);
  const reachable = new Set(network.reachableSurfaceIds ?? []);
  const required = new Set(network.requiredSurfaceIds ?? []);
  const surfaceById = new Map((physics.exteriorTransportSurfaces ?? []).map(surface => [surface.id, surface]));
  const collisionParts = (physics.props ?? []).filter(prop => prop.supportKind === 'route-owned-rooftop-place');
  assert.ok(collisionParts.length >= plan.places.length, `${label}: each authored scene should publish physical furniture/fixtures`);
  for (const place of plan.places) {
    assert.ok(reachable.has(place.surfaceId), `${label}:${place.id}: host roof must be reachable`);
    assert.ok(required.has(place.surfaceId), `${label}:${place.id}: host roof must be an authoritative circulation candidate`);
    const host = surfaceById.get(place.surfaceId);
    assert.ok(host, `${label}:${place.id}: host surface must still exist`);
    assert.ok(Math.abs(place.x - host.x) > 0.86 + place.halfX, `${label}:${place.id}: central x route must stay clear`);
    assert.ok(Math.abs(place.z - host.z) > 0.86 + place.halfZ, `${label}:${place.id}: central z route must stay clear`);
    assert.equal((physics.circulationReservations ?? []).some(reservation => placeFootprintIntersectsReservation(place, reservation)), false,
      `${label}:${place.id}: scene footprint must not occupy a circulation reservation`);
    for (const spoke of routeSpokeRectanglesForSurface(host, physics.circulationReservations ?? [])) {
      const overlaps = Math.abs(place.x - spoke.x) < place.halfX + spoke.halfX + 0.12
        && Math.abs(place.z - spoke.z) < place.halfZ + spoke.halfZ + 0.12;
      assert.equal(overlaps, false, `${label}:${place.id}: junction-to-cross spoke must remain open`);
    }
  }
  return plan;
}

const ground = assertField('ground', payload.physics, 5);
const hanging = assertField('ceiling', payload.hangingLayer?.payload?.physics, 5);
const allPlaces = [...ground.places, ...hanging.places];
assert.equal(new Set(allPlaces.map(place => place.placeType)).size, ROUTE_OWNED_ROOFTOP_PLACE_TYPES.length,
  'deterministic ground + hanging fixture should exercise the complete authored-place vocabulary');
assert.equal(payload.worldCirculation.stats.unreachableSpaces, 0);
assert.equal(payload.worldCirculation.stats.unreachableTransportNodes, 0);
assert.equal(payload.worldCirculation.stats.components, 1,
  'adding route-owned content must not split the unified circulation graph');

console.log('[generated-route-owned-rooftop-places-selftest] PASS', {
  groundPlaces: ground.places.length,
  groundTypes: ground.stats.distinctTypes,
  ceilingPlaces: hanging.places.length,
  ceilingTypes: hanging.stats.distinctTypes,
  combinedTypes: new Set(allPlaces.map(place => place.placeType)).size,
  circulationComponents: payload.worldCirculation.stats.components,
  unreachableSpaces: payload.worldCirculation.stats.unreachableSpaces,
  unreachableTransportNodes: payload.worldCirculation.stats.unreachableTransportNodes,
});
