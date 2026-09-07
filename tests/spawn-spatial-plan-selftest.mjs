import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileSpawnLocationRuntime, createSpawnComposition } from '../world/spawn-location-runtime.js';
import { compileSpawnSpatialPlan, spawnSpatialPlanOverlaps } from '../world/spawn-spatial-plan.js';

const location = JSON.parse(fs.readFileSync(new URL('../jweb-authored-location-data-pack/locations/spawn-rooftop-reality-leak.json', import.meta.url), 'utf8'));
const assets = JSON.parse(fs.readFileSync(new URL('../jweb-authored-location-data-pack/assets/spawnpoint-asset-families.json', import.meta.url), 'utf8'));
const runtime = compileSpawnLocationRuntime({ location, assets });
const composition = createSpawnComposition(runtime, 'spatial-plan-selftest');
const hostSpace = {
    spaceId: 'entity:test:roof', surfaceY: 6,
    bounds: { x: 0, z: 0, halfX: 3.5, halfZ: 3.5, minX: -3.5, maxX: 3.5, minZ: -3.5, maxZ: 3.5, yMin: 6, yMax: 8.2 },
    supportPatches: [{ x: 0, z: 0, halfX: 3.5, halfZ: 3.5, minX: -3.5, maxX: 3.5, minZ: -3.5, maxZ: 3.5, yMin: 6, yMax: 6.12 }],
    reservations: [{ id: 'stair:shaft', kind: 'stair-shaft', x: 0, z: 0, halfX: 0.55, halfZ: 0.65, minX: -0.55, maxX: 0.55, minZ: -0.65, maxZ: 0.65, yMin: 0, yMax: 8.1 }],
    existingDetailReservations: [],
};
const pose = { x: 0.9, z: 0, feetY: 6 };
const routeFan = [
    { heading: 0, end: { x: 3.1, z: 0, feetY: 6, grounded: true } },
    { heading: Math.PI / 2, end: { x: 0.9, z: 2.6, feetY: 6, grounded: true } },
    { heading: -Math.PI / 2, end: { x: 0.9, z: -2.6, feetY: 6, grounded: true } },
];
const plan1 = compileSpawnSpatialPlan({ locationId: location.id, pose, hostSpace, routeFan, composition });
const plan2 = compileSpawnSpatialPlan({ locationId: location.id, pose, hostSpace, routeFan, composition });
assert.deepEqual(plan1, plan2, 'spatial plan must be deterministic');
assert.ok(plan1.ready, `plan unresolved: ${plan1.unresolved.join(', ')}`);
assert.equal(plan1.placements.filter(item => item.slot === 'primary-tv').length, 1);
assert.equal(plan1.placements.filter(item => item.slot === 'tv-support').length, 1);
assert.ok(['television', 'radio'].includes(plan1.mediaKind), `unexpected media kind ${plan1.mediaKind}`);
assert.ok(plan1.placements.filter(item => item.slot === 'seating').length >= 2);
assert.ok(plan1.placements.filter(item => item.slot === 'seating').length <= 3);
assert.equal(plan1.placements.filter(item => item.slot === 'warm-practical').length, 1);
assert.ok(plan1.placements.length >= 6, 'bounded first-look detail should add a few authored props');

const keepClears = plan1.reservations.filter(item => item.kind === 'spawn-arrival-keep-clear' || item.kind === 'spawn-route-fan-keep-clear');
const furniture = plan1.reservations.filter(item => item.kind === 'spawn-furniture-envelope' || item.kind === 'spawn-detail-envelope');
for (const envelope of furniture) {
    for (const keepClear of keepClears) {
        assert.equal(spawnSpatialPlanOverlaps(envelope, keepClear), false, `${envelope.id} overlaps ${keepClear.id}`);
    }
}
console.log('[spawn-spatial-plan-selftest] PASS', {
    placements: plan1.placements.length,
    keepClears: keepClears.length,
    furnitureEnvelopes: furniture.length,
});

function enclosedHost(archetype, halfX, halfZ) {
    const y = 6;
    const area = halfX * 2 * halfZ * 2;
    return {
        spaceId: `test:${archetype}`, surfaceY: y, hostArchetype: archetype,
        supportAreaM2: area, largestSupportPatchAreaM2: area,
        maxSupportSpanM: Math.max(halfX, halfZ) * 2,
        maxWallSpanM: Math.max(halfX, halfZ) * 2,
        overheadCovered: true, overheadClearanceM: 3.1,
        bounds: { x: 0, z: 0, halfX, halfZ, minX: -halfX, maxX: halfX, minZ: -halfZ, maxZ: halfZ, yMin: y, yMax: y + 3.1 },
        supportPatches: [{ x: 0, z: 0, halfX, halfZ, minX: -halfX, maxX: halfX, minZ: -halfZ, maxZ: halfZ, yMin: y, yMax: y + 0.12 }],
        nearbyWalls: [
            { x1: -halfX, z1: -halfZ, x2: halfX, z2: -halfZ, yMin: y, yMax: y + 3.1 },
            { x1: halfX, z1: -halfZ, x2: halfX, z2: halfZ, yMin: y, yMax: y + 3.1 },
            { x1: halfX, z1: halfZ, x2: -halfX, z2: halfZ, yMin: y, yMax: y + 3.1 },
            { x1: -halfX, z1: halfZ, x2: -halfX, z2: -halfZ, yMin: y, yMax: y + 3.1 },
        ],
        reservations: [], existingDetailReservations: [],
    };
}

const terraHost = {
    ...enclosedHost('deep-backroom', 6.0, 4.0),
    supportAreaM2: 96,
    largestSupportPatchAreaM2: 48,
    maxSupportSpanM: 8,
    maxWallSpanM: 12,
    // Model the way current large JWEB buildings are actually built: one big
    // operational hall carried by adjacent structural floor bays.
    supportPatches: [
        { x: -3, z: 0, halfX: 3, halfZ: 4, minX: -6, maxX: 0, minZ: -4, maxZ: 4, yMin: 6, yMax: 6.12 },
        { x: 3, z: 0, halfX: 3, halfZ: 4, minX: 0, maxX: 6, minZ: -4, maxZ: 4, yMin: 6, yMax: 6.12 },
    ],
};
const terraComposition = createSpawnComposition(runtime, 'terra-spatial-plan', terraHost);
assert.equal(terraComposition.startProfile.id, 'terra-backroom');
const terraPlan = compileSpawnSpatialPlan({
    locationId: location.id,
    pose: { x: 0, z: 0, feetY: 6 },
    hostSpace: terraHost,
    routeFan: [],
    composition: terraComposition,
});
assert.ok(terraPlan.ready, `TERRA room should fit a real hangout: ${terraPlan.unresolved.join(', ')}`);
assert.equal(terraPlan.placements.filter(item => item.slot === 'seating').length, 4, 'TERRA requires four realized seats');
const terraPlannedMedia = terraPlan.placements.find(item => item.slot === 'primary-tv');
assert.equal(terraPlannedMedia?.constructionRecipe, 'crt-box', 'TERRA planned media must remain a deep CRT');
assert.ok(terraPlannedMedia?.dimensionsM?.[0] >= 4.8, 'TERRA CRT must remain room-dominating after spatial planning');
assert.ok(terraPlannedMedia?.dimensionsM?.[2] >= 2.5, 'TERRA CRT must retain substantial physical depth after spatial planning');

const gigaHost = enclosedHost('hanging-storefront', 4.2, 3.7);
const gigaComposition = createSpawnComposition(runtime, 'giga-spatial-plan', gigaHost);
assert.equal(gigaComposition.startProfile.id, 'giga-shopfront');
const gigaPlan = compileSpawnSpatialPlan({
    locationId: location.id,
    pose: { x: 0, z: 0, feetY: 6 },
    hostSpace: gigaHost,
    routeFan: [],
    composition: gigaComposition,
});
assert.ok(gigaPlan.ready, `GIGA storefront should fit its furniture cluster: ${gigaPlan.unresolved.join(', ')}`);
assert.ok(gigaPlan.placements.filter(item => item.slot === 'seating').length >= 3, 'GIGA needs a real shop hangout, not only a facade-scale screen');

console.log('[spawn-spatial-plan-selftest] LARGE TIERS PASS', {
    gigaSeats: gigaPlan.placements.filter(item => item.slot === 'seating').length,
    terraSeats: terraPlan.placements.filter(item => item.slot === 'seating').length,
});
