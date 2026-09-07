// Semantic invariant for the 2026-09-07 "reconnect spawn to real Building
// Plan room topology" pass: once collectSpawnFabricSpaces() exposes real
// room identity (world/spawn-proof.js's roomSpaces), wall-anchored
// workstations/racks must actually respect it - staying grouped by room and
// preferring the role-appropriate room - not just picking whichever wall in
// the whole aggregate host scores best in isolation.
import assert from 'node:assert/strict';
import { augmentSpawnProgressionLayout } from '../world/spawn-progression-layout.js';

const controlRoom = {
    id: 'room:control', role: 'work', operationalRole: 'control-room', semanticProgram: 'server-facility',
    spaceType: 'server-facility:work', serviceSpine: false, adjacentSpaceIds: ['room:server'],
    regions: [{ minX: -7.5, maxX: 0, minZ: -6, maxZ: 6 }],
};
const serverRoom = {
    id: 'room:server', role: 'service', operationalRole: 'server-room', semanticProgram: 'server-facility',
    spaceType: 'server-facility:service', serviceSpine: true, adjacentSpaceIds: ['room:control'],
    regions: [{ minX: 0, maxX: 7.5, minZ: -6, maxZ: 6 }],
};

const hostSpace = {
    surfaceY: 6,
    supportPatches: [{ x: 0, z: 0, halfX: 7.5, halfZ: 6.0, yMin: 6, yMax: 6.1 }],
    roomSpaces: [controlRoom, serverRoom],
    nearbyWalls: [
        { x1: -7.5, z1: -6, x2: 7.5, z2: -6, yMin: 6, yMax: 9.2, thickness: 0.14 }, // north (both rooms)
        { x1: -7.5, z1: 6, x2: 7.5, z2: 6, yMin: 6, yMax: 9.2, thickness: 0.14 },   // south (both rooms)
        { x1: -7.5, z1: -6, x2: -7.5, z2: 6, yMin: 6, yMax: 9.2, thickness: 0.14 }, // west exterior (control room only)
        { x1: 7.5, z1: -6, x2: 7.5, z2: 6, yMin: 6, yMax: 9.2, thickness: 0.14 },   // east exterior (server room only)
        { x1: 0, z1: -6, x2: 0, z2: 6, yMin: 6, yMax: 9.2, thickness: 0.14, supportKind: 'building-plan-partition' }, // center partition
    ],
};
const placements = [
    { instanceId: 'tv', slot: 'primary-tv', dimensionsM: [1.2, 0.8, 0.4], transform: { x: -3, y: 7, z: -2.6, rotY: 0 } },
    { instanceId: 'support', slot: 'tv-support', dimensionsM: [1.0, 0.6, 0.5], transform: { x: -3, y: 6.4, z: -2.6, rotY: 0 } },
];
const reservations = [
    { id: 'arrival', x: -3, z: 2.5, halfX: 0.8, halfZ: 0.8, yMin: 6, yMax: 8.1 },
];

const summary = augmentSpawnProgressionLayout({
    locationId: 'spawn.room-grouping-test',
    pose: { x: -3, z: 2.5, feetY: 6 },
    hostSpace,
    composition: { startProfile: { id: 'terra-backroom' } },
    placements,
    reservations,
});
assert.equal(summary.applied, true);
assert.ok(summary.workstations >= 2, `expected multiple workstations, got ${summary.workstations}`);
assert.ok(summary.racks >= 2, `expected multiple racks, got ${summary.racks}`);

function roomIdFor(x, z) {
    for (const room of hostSpace.roomSpaces) {
        for (const region of room.regions) {
            if (x >= region.minX && x <= region.maxX && z >= region.minZ && z <= region.maxZ) return room.id;
        }
    }
    return null;
}

const workstations = placements.filter(item => item.slot === 'progression-workstation');
const racks = placements.filter(item => item.slot === 'progression-server-rack');
const workstationRooms = new Set(workstations.map(w => roomIdFor(w.transform.x, w.transform.z)));
const rackRooms = new Set(racks.map(r => roomIdFor(r.transform.x, r.transform.z)));

assert.equal(workstationRooms.size, 1, `all workstations should land in one room, got rooms: ${[...workstationRooms]}`);
assert.equal([...workstationRooms][0], 'room:control', 'workstations should prefer the work-role room');
assert.equal(rackRooms.size, 1, `all racks should land in one room, got rooms: ${[...rackRooms]}`);
assert.equal([...rackRooms][0], 'room:server', 'racks should prefer the service-role room');

console.log('[spawn-progression-room-grouping-selftest] PASS', {
    workstations: workstations.length,
    racks: racks.length,
    workstationRoom: [...workstationRooms][0],
    rackRoom: [...rackRooms][0],
});
