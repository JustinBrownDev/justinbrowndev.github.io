import assert from 'node:assert/strict';
import {
  ROUTE_OWNED_PLAZA_PLACE_TYPES,
  planRouteOwnedPlazaPlaces,
  plazaPlaceFootprintIntersectsBlocker,
} from '../world/route-owned-plaza-places.js';
import { routeOwnedScenePartWithinFootprint } from '../world/route-owned-place-scenes.js';

const plazas = Array.from({ length: 6 }, (_, index) => ({
  id: `plaza:${index}`,
  kind: 'plaza',
  siteId: index,
  roadAdjacent: index !== 5,
  kowloonServiceVoid: index === 5,
  x: (index % 3) * 12,
  z: Math.floor(index / 3) * 12,
  halfX: 3.5,
  halfZ: 3.5,
  footprintCells: [{
    id: `plaza:${index}:cell`,
    x: (index % 3) * 12,
    z: Math.floor(index / 3) * 12,
    halfX: 3.5,
    halfZ: 3.5,
  }],
}));
const blockers = [
  { id: 'crate-stack', x: -2.20, z: -2.20, radius: 0.72, yMin: 0, height: 1.1 },
  { id: 'elevated-sign', x: 12 - 2.20, z: -2.20, radius: 0.72, yMin: 8, height: 9 },
];
assert.equal(plazaPlaceFootprintIntersectsBlocker({ x: -2.2, z: -2.2, y: 0, halfX: 0.8, halfZ: 0.9 }, blockers[0]), true,
  'ground blocker helper must reject a colliding authored-place pad');
assert.equal(plazaPlaceFootprintIntersectsBlocker({ x: 9.8, z: -2.2, y: 0, halfX: 0.8, halfZ: 0.9 }, blockers[1]), false,
  'elevated blockers must not suppress ordinary ground plaza occupancy');

const args = {
  plazas,
  blockers,
  stableKey: 'route-owned-plaza-place-test',
  maxPlaces: 5,
  minPlaces: 4,
  density: 1,
};
const first = planRouteOwnedPlazaPlaces(args);
const second = planRouteOwnedPlazaPlaces(args);
assert.deepEqual(first, second, 'street-place planning must be deterministic');
assert.ok(first.places.length >= 4 && first.places.length <= 5);
assert.equal(first.places.some(place => place.plazaId === 'plaza:5'), false, 'service-void/non-road plaza must never host a place');
assert.ok(first.stats.distinctTypes >= 4, 'multi-plaza fixture should exercise several authored-place identities');

const hostById = new Map(plazas.map(plaza => [plaza.id, plaza]));
for (const place of first.places) {
  const host = hostById.get(place.plazaId);
  const cell = host.footprintCells[0];
  assert.ok(host.roadAdjacent && !host.kowloonServiceVoid);
  assert.ok(ROUTE_OWNED_PLAZA_PLACE_TYPES.some(type => type.placeType === place.placeType && type.sceneType === place.sceneType));
  assert.ok(Math.abs(place.x - cell.x) > 1.02 + place.halfX, `${place.id}: central north/south plaza route must stay clear`);
  assert.ok(Math.abs(place.z - cell.z) > 1.02 + place.halfZ, `${place.id}: central east/west plaza route must stay clear`);
  assert.equal(blockers.some(blocker => plazaPlaceFootprintIntersectsBlocker(place, blocker)), false, `${place.id}: existing ground blocker must remain clear`);
  assert.equal(place.routeOwnership, 'world-street-plaza-circulation');
  assert.ok(place.parts.length >= 12);
  assert.ok(place.parts.some(part => part.renderClass === 'paint'));
  assert.ok(place.parts.some(part => part.emissive));
  assert.ok(place.parts.some(part => part.collision));
  const approach = place.parts.filter(part => part.detailTier === 'approach');
  assert.ok(approach.length >= 4, `${place.id}: street place needs approach-scale identity`);
  assert.ok(approach.some(part => part.emissive), `${place.id}: approach identity needs a luminous marker`);
  assert.ok(approach.some(part => part.renderClass === 'paint'), `${place.id}: approach identity needs a painted ground cue`);
  assert.equal(approach.some(part => part.collision), false, `${place.id}: approach identity must not widen plaza collision`);
  assert.ok(Math.max(...approach.map(part => part.y + part.sy * 0.5)) >= 2.70, `${place.id}: identity marker must read above ordinary waist-height clutter`);
  for (const part of place.parts) assert.ok(routeOwnedScenePartWithinFootprint(place, part, 0.025));
}
assert.equal(first.stats.sceneParts, first.places.reduce((sum, place) => sum + place.parts.length, 0));
assert.ok(first.stats.scenePaintParts >= first.places.length * 4);
assert.ok(first.stats.sceneMicroParts >= first.places.length * 3);
assert.ok(first.stats.sceneApproachParts >= first.places.length * 4);

const aliased = first.places.find(place => place.placeType === 'street-bodega' || place.placeType === 'gallery-pocket');
if (aliased) assert.notEqual(aliased.placeType, aliased.sceneType, 'street semantics may reuse an existing visual grammar without lying about place identity');

console.log('[route-owned-plaza-places-selftest] PASS', {
  realized: first.places.length,
  distinctTypes: first.stats.distinctTypes,
  byType: first.stats.byType,
  rejectedBlockers: first.stats.rejectedBlockers,
  sceneParts: first.stats.sceneParts,
  invariant: first.stats.invariant,
});
