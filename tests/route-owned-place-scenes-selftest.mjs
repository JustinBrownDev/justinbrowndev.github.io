import assert from 'node:assert/strict';
import {
  ROUTE_OWNED_PLACE_SCENE_SCHEMA,
  ROUTE_OWNED_PLACE_SCENE_VERSION,
  ROUTE_OWNED_PLACE_SCENE_VARIANTS,
  buildRouteOwnedPlaceScene,
  routeOwnedScenePartWithinFootprint,
} from '../world/route-owned-place-scenes.js';
import { ROUTE_OWNED_ROOFTOP_PLACE_TYPES } from '../world/route-owned-rooftop-places.js';

function fixture(placeType, quarterTurns = 0) {
  const swapped = (quarterTurns & 1) === 1;
  return {
    id: `fixture:${placeType}:${quarterTurns}`,
    placeType,
    quarterTurns,
    x: 14.25,
    z: -7.75,
    y: 18,
    halfX: swapped ? 0.78 : 0.96,
    halfZ: swapped ? 0.96 : 0.78,
  };
}

const signatures = new Map();
for (const placeType of ROUTE_OWNED_ROOFTOP_PLACE_TYPES) {
  const variants = [];
  for (let variant = 0; variant < ROUTE_OWNED_PLACE_SCENE_VARIANTS; variant++) {
    const place = fixture(placeType, variant & 3);
    const first = buildRouteOwnedPlaceScene(place, { stableKey: 'scene-selftest', variant });
    const second = buildRouteOwnedPlaceScene(place, { stableKey: 'scene-selftest', variant });
    assert.deepEqual(first, second, `${placeType}:${variant}: scene construction must be deterministic`);
    assert.equal(first.schema, ROUTE_OWNED_PLACE_SCENE_SCHEMA);
    assert.equal(first.version, ROUTE_OWNED_PLACE_SCENE_VERSION);
    assert.equal(first.variant, variant);
    assert.ok(first.parts.length >= 12, `${placeType}:${variant}: authored scene should be visibly richer than a token prop cluster`);
    assert.ok(first.parts.length <= 20, `${placeType}:${variant}: scene grammar must stay within the cheap instanced-detail budget`);
    assert.ok(first.metrics.collisionParts >= 2, `${placeType}:${variant}: scene needs sparse physical furniture`);
    assert.ok(first.metrics.emissiveParts >= 1, `${placeType}:${variant}: scene needs an identity light/sign cue`);
    assert.ok(first.metrics.paintParts >= 3, `${placeType}:${variant}: scene needs a floor-paint identity`);
    assert.ok(first.metrics.microParts >= 3, `${placeType}:${variant}: scene needs recognizable low-cost micro detail`);
    assert.ok(first.metrics.identityParts >= 1, `${placeType}:${variant}: scene needs at least one signature element`);
    assert.ok(first.tags.length >= 3);
    for (const part of first.parts) {
      assert.ok(routeOwnedScenePartWithinFootprint(place, part, 0.025), `${placeType}:${variant}:${part.role}: detail escaped the route-owned pad`);
      assert.ok(Number.isFinite(part.ry));
      assert.ok(part.sy > 0 && part.sx > 0 && part.sz > 0);
    }
    variants.push(first.parts.map(part => `${part.role}:${part.x.toFixed(2)}:${part.z.toFixed(2)}:${part.color}`).join('|'));
  }
  assert.ok(new Set(variants).size >= 2, `${placeType}: deterministic variants must alter the visible arrangement or palette placement`);
  signatures.set(placeType, variants[0]);
}
assert.equal(new Set(signatures.values()).size, ROUTE_OWNED_ROOFTOP_PLACE_TYPES.length,
  'each authored-place family must have a distinct scene grammar');

console.log('[route-owned-place-scenes-selftest] PASS', {
  placeTypes: ROUTE_OWNED_ROOFTOP_PLACE_TYPES.length,
  variants: ROUTE_OWNED_PLACE_SCENE_VARIANTS,
  invariant: 'scene grammar is deterministic, visibly distinct, footprint-bound, materially layered, and cheap enough for instancing',
});
