import assert from 'node:assert/strict';
import {
  ROUTE_OWNED_PLACE_SCENE_VERSION,
  ROUTE_OWNED_PLACE_SCENE_VARIANTS,
  buildRouteOwnedPlaceScene,
  routeOwnedScenePartWithinFootprint,
} from '../world/route-owned-place-scenes.js';
import { ROUTE_OWNED_PLAZA_PLACE_TYPES } from '../world/route-owned-plaza-places.js';

function fixture(type, variant) {
  return {
    id: `street-approach:${type.placeType}:${variant}`,
    kind: 'route-owned-plaza-place',
    placeType: type.placeType,
    sceneType: type.sceneType,
    routeOwnership: 'world-street-plaza-circulation',
    quarterTurns: variant & 3,
    x: 11.5,
    z: -4.25,
    y: 0,
    halfX: (variant & 1) ? 0.78 : 0.96,
    halfZ: (variant & 1) ? 0.96 : 0.78,
  };
}

for (const type of ROUTE_OWNED_PLAZA_PLACE_TYPES) {
  for (let variant = 0; variant < ROUTE_OWNED_PLACE_SCENE_VARIANTS; variant++) {
    const place = fixture(type, variant);
    const scene = buildRouteOwnedPlaceScene(place, { stableKey: 'street-approach-selftest', variant });
    assert.equal(scene.version, ROUTE_OWNED_PLACE_SCENE_VERSION);
    const approach = scene.parts.filter(part => part.detailTier === 'approach');
    assert.ok(approach.length >= 4, `${type.placeType}:${variant}: needs approach-scale identity`);
    assert.ok(approach.some(part => part.renderClass === 'paint'), `${type.placeType}:${variant}: needs painted approach cue`);
    assert.ok(approach.some(part => part.emissive), `${type.placeType}:${variant}: needs luminous approach cue`);
    assert.equal(approach.some(part => part.collision), false, `${type.placeType}:${variant}: approach detail must be visual-only`);
    assert.ok(Math.max(...approach.map(part => part.y + part.sy * 0.5)) >= 2.70,
      `${type.placeType}:${variant}: mast/lightbox must rise above ordinary prop clutter`);
    for (const part of approach) assert.ok(routeOwnedScenePartWithinFootprint(place, part, 0.025));

    const roofLike = { ...place, id: `${place.id}:roof`, routeOwnership: 'reachable-required-roof-transport' };
    const roofScene = buildRouteOwnedPlaceScene(roofLike, { stableKey: 'street-approach-selftest', variant });
    assert.equal(roofScene.parts.some(part => part.detailTier === 'approach'), false,
      `${type.placeType}:${variant}: 21J street identity must not silently inflate rooftop scenes`);
  }
}

console.log('[route-owned-street-approach-identity-selftest] PASS', {
  placeTypes: ROUTE_OWNED_PLAZA_PLACE_TYPES.length,
  variants: ROUTE_OWNED_PLACE_SCENE_VARIANTS,
  invariant: 'street authored places gain readable non-colliding approach identity while rooftop scene density stays unchanged',
});
