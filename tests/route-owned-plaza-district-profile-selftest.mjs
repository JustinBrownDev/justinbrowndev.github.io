import assert from 'node:assert/strict';
import {
  ROUTE_OWNED_PLAZA_PLACE_TYPES,
  planRouteOwnedPlazaPlaces,
  routeOwnedPlazaDistrictProfile,
} from '../world/route-owned-plaza-places.js';

const worldSeed = 0x51CEB00C;
const field = 'ground';
const signatures = new Map();
for (let z = -4; z <= 4; z++) {
  for (let x = -4; x <= 4; x++) {
    const profile = routeOwnedPlazaDistrictProfile({ worldSeed, chunkX: x, chunkZ: z, field });
    const repeat = routeOwnedPlazaDistrictProfile({ worldSeed, chunkX: x, chunkZ: z, field });
    assert.deepEqual(profile, repeat, `${x},${z}: district profile must be deterministic`);
    assert.equal(profile.activeTypes.length, 5, `${x},${z}: local vocabulary must stay intentionally narrower than the global seven-family vocabulary`);
    assert.equal(new Set(profile.activeTypes).size, profile.activeTypes.length, `${x},${z}: active family palette must not contain duplicates`);
    assert.equal(profile.familyQuotas[profile.signatureType], 2, `${x},${z}: signature family gets the only repeat quota`);
    assert.equal(Object.values(profile.familyQuotas).reduce((sum, value) => sum + value, 0), 6);
    signatures.set(`${x},${z}`, profile.signatureType);
  }
}
for (let z = -4; z <= 4; z++) {
  for (let x = -4; x <= 4; x++) {
    const here = signatures.get(`${x},${z}`);
    if (x < 4) assert.notEqual(here, signatures.get(`${x + 1},${z}`), `${x},${z}: east/west neighbors must not share a signature family`);
    if (z < 4) assert.notEqual(here, signatures.get(`${x},${z + 1}`), `${x},${z}: north/south neighbors must not share a signature family`);
  }
}

const plazas = Array.from({ length: 8 }, (_, index) => ({
  id: `district-plaza:${index}`,
  kind: 'plaza',
  siteId: index,
  roadAdjacent: true,
  x: (index % 4) * 14,
  z: Math.floor(index / 4) * 14,
  halfX: 3.6,
  halfZ: 3.6,
  footprintCells: [{
    id: `district-plaza:${index}:cell`,
    x: (index % 4) * 14,
    z: Math.floor(index / 4) * 14,
    halfX: 3.6,
    halfZ: 3.6,
  }],
}));
const plan = planRouteOwnedPlazaPlaces({
  plazas,
  stableKey: 'route-owned-plaza-district-profile-test',
  worldSeed,
  chunkX: 11,
  chunkZ: -7,
  field,
  density: 1,
  minPlaces: 6,
  maxPlaces: 6,
});
assert.equal(plan.places.length, 6);
assert.equal(plan.stats.districtSignatureType, plan.districtProfile.signatureType);
assert.equal(plan.places[0].placeType, plan.districtProfile.signatureType, 'first realized place should establish the chunk signature');
assert.equal(plan.places[5].placeType, plan.districtProfile.signatureType, 'six-place chunks repeat only the signature family');
assert.equal(plan.stats.byType[plan.districtProfile.signatureType], 2);
assert.equal(plan.stats.distinctTypes, 5);
for (const [type, count] of Object.entries(plan.stats.byType)) {
  assert.ok(plan.districtProfile.activeTypes.includes(type), `${type}: realized family must belong to this chunk's active palette`);
  assert.ok(count <= plan.districtProfile.familyQuotas[type], `${type}: realized count must obey deterministic family quota`);
}
for (const place of plan.places) {
  assert.equal(place.districtKey, plan.districtProfile.districtKey);
  assert.equal(place.districtTheme, plan.districtProfile.districtTheme);
  assert.equal(place.neighborhoodRole, plan.districtProfile.neighborhoodRole);
  assert.equal(place.districtSignatureType, plan.districtProfile.signatureType);
}
assert.equal(ROUTE_OWNED_PLAZA_PLACE_TYPES.length, 7, 'global authored-place vocabulary remains seven families');

console.log('[route-owned-plaza-district-profile-selftest] PASS', {
  sampledChunks: signatures.size,
  districtKey: plan.districtProfile.districtKey,
  districtTheme: plan.districtProfile.districtTheme,
  neighborhoodRole: plan.districtProfile.neighborhoodRole,
  signatureType: plan.districtProfile.signatureType,
  activeTypes: plan.districtProfile.activeTypes,
  byType: plan.stats.byType,
  adjacencyInvariant: plan.stats.adjacencyInvariant,
});
