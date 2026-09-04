import assert from 'node:assert/strict';
import {
  ROUTE_OWNED_ROOFTOP_PLACE_TYPES,
  placeFootprintIntersectsReservation,
  planRouteOwnedRooftopPlaces,
  routeSpokeRectanglesForSurface,
} from '../world/route-owned-rooftop-places.js';

import {
  ROUTE_OWNED_PLACE_SCENE_VERSION,
  ROUTE_OWNED_PLACE_SCENE_VARIANTS,
  routeOwnedScenePartWithinFootprint,
} from '../world/route-owned-place-scenes.js';

const surfaces = Array.from({ length: 12 }, (_, index) => ({
  id: `roof:${index}`,
  kind: 'clear-roof-street-layer',
  priority: 'circulation-candidate',
  x: (index % 4) * 12,
  z: Math.floor(index / 4) * 12,
  y: 9 + Math.floor(index / 4) * 3,
  hx: 3.6,
  hz: 3.6,
  siteId: Math.floor(index / 2),
  moduleKey: `m${index}`,
}));
const requiredSurfaceIds = surfaces.map(surface => surface.id);
const reachableSurfaceIds = requiredSurfaceIds.filter(id => id !== 'roof:11');
const reservations = [{
  id: 'roof:0:junction', x: -2.0, z: -2.0, halfX: 0.75, halfZ: 0.75,
  yMin: 8.9, yMax: 11.1, surfaceId: 'roof:0',
}];
const transportNetwork = { requiredSurfaceIds, reachableSurfaceIds };

const args = {
  surfaces, transportNetwork, reservations,
  stableKey: 'route-owned-test', field: 'ground', maxPlaces: 7, minPlaces: 4,
};
const first = planRouteOwnedRooftopPlaces(args);
const second = planRouteOwnedRooftopPlaces(args);
assert.deepEqual(first, second, 'planning must be deterministic');
assert.ok(first.places.length >= 4, 'fixture must realize several authored places');
assert.ok(first.places.length <= 7);
assert.equal(first.places.some(place => place.surfaceId === 'roof:11'), false, 'unreachable roof must never host an authored place');
assert.ok(first.stats.distinctSites >= 3, 'places should spread across roof sites');
assert.ok(first.stats.distinctTypes >= 2, 'one deterministic chunk should not collapse to one scene template');

const hostById = new Map(surfaces.map(surface => [surface.id, surface]));
for (const place of first.places) {
  assert.ok(ROUTE_OWNED_ROOFTOP_PLACE_TYPES.includes(place.placeType));
  assert.ok(reachableSurfaceIds.includes(place.surfaceId));
  const host = hostById.get(place.surfaceId);
  assert.ok(host);
  assert.ok(Math.abs(place.x - host.x) > 0.86 + place.halfX, `${place.id}: footprint must stay outside the central north/south route corridor`);
  assert.ok(Math.abs(place.z - host.z) > 0.86 + place.halfZ, `${place.id}: footprint must stay outside the central east/west route corridor`);
  assert.equal(reservations.some(reservation => placeFootprintIntersectsReservation(place, reservation)), false, `${place.id}: footprint must avoid circulation reservations`);
  for (const spoke of routeSpokeRectanglesForSurface(host, reservations)) {
    const overlaps = Math.abs(place.x - spoke.x) < place.halfX + spoke.halfX + 0.12
      && Math.abs(place.z - spoke.z) < place.halfZ + spoke.halfZ + 0.12;
    assert.equal(overlaps, false, `${place.id}: footprint must leave a clear spoke from each transport junction to the central route cross`);
  }
  assert.equal(place.sceneVersion, ROUTE_OWNED_PLACE_SCENE_VERSION);
  assert.ok(Number.isInteger(place.sceneVariant) && place.sceneVariant >= 0 && place.sceneVariant < ROUTE_OWNED_PLACE_SCENE_VARIANTS);
  assert.ok(place.sceneTags.length >= 3, `${place.id}: authored scene must carry a stable semantic identity`);
  assert.ok(place.parts.length >= 12, `${place.id}: authored scene must be visibly enriched`);
  assert.ok(place.parts.some(part => part.role === 'paint-pad'), `${place.id}: authored scene must establish a visual floor/paint identity`);
  assert.ok(place.parts.filter(part => part.renderClass === 'paint').length >= 3, `${place.id}: paint identity must use the matte paint lane`);
  assert.ok(place.parts.some(part => part.emissive), `${place.id}: authored scene must contain an emissive identity cue`);
  assert.ok(place.parts.some(part => part.collision), `${place.id}: authored scene must contain at least one physically present object`);
  for (const part of place.parts) assert.ok(routeOwnedScenePartWithinFootprint(place, part, 0.025), `${place.id}:${part.role}: scene detail escaped its route-owned footprint`);
}
assert.equal(first.stats.sceneParts, first.places.reduce((sum, place) => sum + place.parts.length, 0));
assert.ok(first.stats.scenePaintParts >= first.places.length * 3);
assert.ok(first.stats.sceneEmissiveParts >= first.places.length);
assert.ok(first.stats.sceneMicroParts >= first.places.length * 3);

console.log('[route-owned-rooftop-places-selftest] PASS', {
  realized: first.places.length,
  distinctSites: first.stats.distinctSites,
  distinctTypes: first.stats.distinctTypes,
  byType: first.stats.byType,
  rejectedReservations: first.stats.rejectedReservations,
  sceneParts: first.stats.sceneParts,
  scenePaintParts: first.stats.scenePaintParts,
  sceneEmissiveParts: first.stats.sceneEmissiveParts,
  sceneMicroParts: first.stats.sceneMicroParts,
  invariant: first.stats.invariant,
});
