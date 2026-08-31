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
assert.equal(plan1.placements.filter(item => item.slot === 'seating').length, 2);
assert.equal(plan1.placements.filter(item => item.slot === 'warm-practical').length, 1);

const keepClears = plan1.reservations.filter(item => item.kind === 'spawn-arrival-keep-clear' || item.kind === 'spawn-route-fan-keep-clear');
const furniture = plan1.reservations.filter(item => item.kind === 'spawn-furniture-envelope');
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
