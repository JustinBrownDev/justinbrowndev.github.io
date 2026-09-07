import assert from 'node:assert/strict';
import { augmentSpawnProgressionLayout } from '../world/spawn-progression-layout.js';

const hostSpace = {
    surfaceY: 6,
    supportPatches: [{ x: 0, z: 0, halfX: 7.5, halfZ: 6.0, yMin: 6, yMax: 6.1 }],
    nearbyWalls: [
        { x1: -7.5, z1: -6, x2: 7.5, z2: -6, yMin: 6, yMax: 9.2, thickness: 0.14 },
        { x1: 7.5, z1: -6, x2: 7.5, z2: 6, yMin: 6, yMax: 9.2, thickness: 0.14 },
        { x1: 7.5, z1: 6, x2: -7.5, z2: 6, yMin: 6, yMax: 9.2, thickness: 0.14 },
        { x1: -7.5, z1: 6, x2: -7.5, z2: -6, yMin: 6, yMax: 9.2, thickness: 0.14 },
    ],
};
const placements = [
    { instanceId: 'tv', slot: 'primary-tv', dimensionsM: [6.5, 3.2, 3.0], transform: { x: 0, y: 8, z: -2.6, rotY: 0 } },
    { instanceId: 'support', slot: 'tv-support', dimensionsM: [5.4, 0.9, 2.5], transform: { x: 0, y: 6.45, z: -2.6, rotY: 0 } },
];
const reservations = [
    { id: 'arrival', x: 0, z: 2.5, halfX: 0.8, halfZ: 0.8, yMin: 6, yMax: 8.1 },
    { id: 'tv', x: 0, z: -2.6, halfX: 3.4, halfZ: 1.7, yMin: 6, yMax: 10 },
];
const summary = augmentSpawnProgressionLayout({
    locationId: 'spawn.rooftop-reality-leak',
    pose: { x: 0, z: 2.5, feetY: 6 },
    hostSpace,
    composition: { startProfile: { id: 'terra-backroom' } },
    placements,
    reservations,
});
assert.equal(summary.applied, true);
assert.ok(summary.workstations >= 4, `expected a real workstation field, got ${summary.workstations}`);
assert.ok(summary.racks >= 4, `expected a real rack bank, got ${summary.racks}`);
assert.ok(summary.chairs >= 3, `expected extra operator seating, got ${summary.chairs}`);
assert.ok(placements.some(item => item.slot === 'progression-server-rack'));
assert.ok(placements.some(item => item.slot === 'progression-workstation'));
assert.ok(reservations.every(item => item.id), 'all progression fixtures must publish reservations');
console.log('[spawn-progression-layout-selftest] PASS', summary);
