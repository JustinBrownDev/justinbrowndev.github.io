import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cityAssetPlacementMetadata } from '../vendor/city-pack/placement-metadata.js';
import { compileSpawnSpatialPlan } from '../world/spawn-spatial-plan.js';

const meta = id => cityAssetPlacementMetadata({ id, mount: id.startsWith('rooftop/') ? 'roof' : 'ground' });
for (const id of ['interior/table_01', 'interior/desk_01', 'systems_workshop/workbench_01', 'systems_workshop/server_bench_01', 'art_gallery/pedestal_01']) {
    const value = meta(id);
    assert.equal(value.canSupportProps, true, id + ' should provide an intentional support surface');
    assert.ok(value.supportSurfaces.length > 0, id + ' should publish a support socket');
}
for (const id of ['street/bench_01', 'art_gallery/gallery_bench_01', 'interior/couch_01', 'street/trash_can_01', 'rooftop/hvac_01', 'art_gallery/display_case_01', 'vegetation/planter_01']) {
    assert.equal(meta(id).canSupportProps, false, id + ' must not become a generic stacking surface');
}
assert.equal(meta('rooftop/hvac_01').mount, 'roof');
assert.deepEqual(meta('industrial/electrical_cabinet_01').placementAffinity, ['wall-adjacent']);

const authoredAssets = JSON.parse(fs.readFileSync(new URL('../jweb-authored-location-data-pack/assets/spawnpoint-asset-families.json', import.meta.url), 'utf8'));
const tvFamily = authoredAssets.families.find(item => item.id === 'spawn.media.television');
const wallVariant = tvFamily.variants.find(item => item.id === 'tv.flat.wall-salvage');
const crtVariant = tvFamily.variants.find(item => item.id === 'tv.crt.motel-woodgrain') ?? tvFamily.variants.find(item => item.id.startsWith('tv.crt.'));
assert.equal(wallVariant.placement.mount, 'wall');
assert.equal(wallVariant.placement.canSupportProps, false);
assert.equal(crtVariant.placement.mount, 'surface');
const supportFamily = authoredAssets.families.find(item => item.id === 'spawn.support.tv');
assert.ok(supportFamily.variants.every(item => item.placement.canSupportProps === true));
const seatingFamily = authoredAssets.families.find(item => item.id === 'spawn.seating');
assert.ok(seatingFamily.variants.every(item => item.placement.canSupportProps === false));
const authoredLocation = JSON.parse(fs.readFileSync(new URL('../jweb-authored-location-data-pack/locations/spawn-rooftop-reality-leak.json', import.meta.url), 'utf8'));
assert.match(authoredLocation.compositionSlots.find(item => item.slot === 'tv-support').relationship, /otherwise acts as the refuge shared surface/);

const hostSpace = {
    spaceId: 'test:roof',
    surfaceY: 10,
    bounds: { x: 0, z: 0, halfX: 5, halfZ: 5, minX: -5, maxX: 5, minZ: -5, maxZ: 5 },
    supportPatches: [{ x: 0, z: 0, halfX: 5, halfZ: 5, minX: -5, maxX: 5, minZ: -5, maxZ: 5, yMin: 10, yMax: 10.12 }],
    nearbyWalls: [{ x1: -5, z1: -5, x2: 5, z2: -5, yMin: 10, yMax: 12.2 }],
    reservations: [],
    existingDetailReservations: [],
};
const pose = { x: 0, z: 0, feetY: 10 };
const baseSupport = { familyId: 'spawn.support.tv', variantId: 'support.test', label: 'support', dimensionsM: [1.05, 0.73, 0.66], placement: { mount: 'ground', canSupportProps: true } };
const compositionFor = tv => ({ slots: [
    { slot: 'tv-support', picks: [baseSupport] },
    { slot: 'primary-tv', picks: [tv] },
] });

const wallPlan = compileSpawnSpatialPlan({
    locationId: 'test', pose, hostSpace, composition: compositionFor({
        familyId: 'spawn.media.television', variantId: 'tv.flat.wall-salvage', label: 'wall tv',
        dimensionsM: [0.88, 0.53, 0.12],
        placement: { mount: 'wall', canSupportProps: false, wallOffsetM: 0.03, centerHeightAboveSurfaceM: 1.35 },
    }),
});
const wallTv = wallPlan.placements.find(item => item.slot === 'primary-tv');
const wallSupport = wallPlan.placements.find(item => item.slot === 'tv-support');
assert.equal(wallTv.mount, 'wall');
assert.equal(wallTv.relationTo, null);
assert.equal(wallSupport.mount, 'ground');
assert.ok(wallTv.transform.z > -5, 'wall TV should be offset inward from its host wall');
assert.ok(wallPlan.reservations.some(item => item.kind === 'spawn-wall-mounted-envelope'));

const surfacePlan = compileSpawnSpatialPlan({
    locationId: 'test2', pose, hostSpace, composition: compositionFor({
        familyId: 'spawn.media.television', variantId: 'tv.crt.test', label: 'crt',
        dimensionsM: [0.7, 0.53, 0.55],
        placement: { mount: 'surface', canSupportProps: false, requiresSupportSurface: true },
    }),
});
const surfaceTv = surfacePlan.placements.find(item => item.slot === 'primary-tv');
const surfaceSupport = surfacePlan.placements.find(item => item.slot === 'tv-support');
assert.equal(surfaceTv.mount, 'surface');
assert.equal(surfaceTv.relationTo, surfaceSupport.instanceId);
assert.ok(surfaceTv.transform.y > surfaceSupport.transform.y);

console.log('prop placement metadata selftest: ok');
