// Semantic-layout invariants for spawn seating, not just geometric ones.
// The existing spawn-spatial-plan-selftest already proves "N seats exist and
// don't overlap"; that can pass while a chair is rotated toward the TV
// through a wall, or sits behind the screen. This file proves the actual
// human-use relationships the 2026-09-07 spawn-scene-semantics report asked
// for: every seat is on the TV's viewing side, and no seat's sightline to
// the TV crosses a solid wall.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileSpawnLocationRuntime, createSpawnComposition } from '../world/spawn-location-runtime.js';
import { compileSpawnSpatialPlan } from '../world/spawn-spatial-plan.js';

const location = JSON.parse(fs.readFileSync(new URL('../jweb-authored-location-data-pack/locations/spawn-rooftop-reality-leak.json', import.meta.url), 'utf8'));
const assets = JSON.parse(fs.readFileSync(new URL('../jweb-authored-location-data-pack/assets/spawnpoint-asset-families.json', import.meta.url), 'utf8'));
const runtime = compileSpawnLocationRuntime({ location, assets });

// Independent reimplementation of the segment-intersection test spawn-spatial-plan.js
// uses internally, so this genuinely verifies the real behavior instead of trusting it.
function segmentsIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
    const d1x = bx - ax, d1z = bz - az;
    const d2x = dx - cx, d2z = dz - cz;
    const denom = d1x * d2z - d1z * d2x;
    if (Math.abs(denom) < 1e-9) return false;
    const t = ((cx - ax) * d2z - (cz - az) * d2x) / denom;
    const u = ((cx - ax) * d1z - (cz - az) * d1x) / denom;
    return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
}

function assertFocalFrameInvariants(label, plan, hostSpace) {
    const tv = plan.placements.find(item => item.slot === 'primary-tv');
    assert.ok(tv, `${label}: plan must contain a focal TV`);
    const seats = plan.placements.filter(item => item.slot === 'seating');
    assert.ok(seats.length >= 2, `${label}: expected at least 2 viewer seats, got ${seats.length}`);

    const rotY = tv.transform.rotY || 0;
    const forward = { x: Math.sin(rotY), z: Math.cos(rotY) };
    for (const seat of seats) {
        const dx = seat.transform.x - tv.transform.x;
        const dz = seat.transform.z - tv.transform.z;
        const forwardOffset = dx * forward.x + dz * forward.z;
        assert.ok(forwardOffset > 0,
            `${label}: seat ${seat.instanceId} must be on the TV's viewing side (forwardOffset=${forwardOffset.toFixed(3)})`);

        let crossed = false;
        for (const wall of hostSpace.nearbyWalls ?? []) {
            if (segmentsIntersect(
                seat.transform.x, seat.transform.z, tv.transform.x, tv.transform.z,
                wall.x1, wall.z1, wall.x2, wall.z2,
            )) { crossed = true; break; }
        }
        assert.equal(crossed, false, `${label}: seat ${seat.instanceId}'s sightline to the TV must not cross a wall`);
    }
    return { tv, seats };
}

function enclosedHost(archetype, halfX, halfZ, extraWalls = []) {
    const y = 6;
    const area = halfX * 2 * halfZ * 2;
    return {
        spaceId: `test:focal-frame:${archetype}`, surfaceY: y, hostArchetype: archetype,
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
            ...extraWalls,
        ],
        reservations: [], existingDetailReservations: [],
    };
}

// Plain rectangular rooms across a few sizes/ids - proves the basic invariant
// and lets a handful of different seed/id combinations roll different
// SEAT_COMPOSITIONS arrangements (checked below).
const arrangementsSeen = new Set();
for (const [id, halfX, halfZ] of [
    ['focal-frame-a', 3.4, 3.0], ['focal-frame-b', 4.0, 2.6], ['focal-frame-c', 2.8, 3.6],
    ['focal-frame-d', 3.6, 3.6], ['focal-frame-e', 3.0, 2.8], ['focal-frame-f', 4.2, 3.1],
]) {
    const host = enclosedHost('sheltered-roof', halfX, halfZ);
    const composition = createSpawnComposition(runtime, id, host);
    const plan = compileSpawnSpatialPlan({
        locationId: location.id, pose: { x: 0, z: 0, feetY: 6 }, hostSpace: host, routeFan: [], composition,
    });
    assert.ok(plan.ready, `${id}: plan unresolved: ${plan.unresolved.join(', ')}`);
    const { seats } = assertFocalFrameInvariants(id, plan, host);
    arrangementsSeen.add(seats.map(s => `${s.transform.x.toFixed(2)},${s.transform.z.toFixed(2)}`).join('|'));
}
assert.ok(arrangementsSeen.size >= 2,
    `expected a handful of distinct seating layouts across ids, got ${arrangementsSeen.size} - a single composition or a room-agnostic ring would collapse this to 1`);

// A partition wall standing between the TV and part of its own viewing side:
// some of the old candidate positions are now genuinely behind an obstruction
// even though they're geometrically on the correct side of the TV. Every
// seat that survives must still have a real, unobstructed sightline.
const partitionHost = enclosedHost('sheltered-roof', 4.5, 4.5, [
    { x1: 1.0, z1: -4.5, x2: 1.0, z2: 0.5, yMin: 6, yMax: 9.1 },
]);
const partitionComposition = createSpawnComposition(runtime, 'focal-frame-partition', partitionHost);
const partitionPlan = compileSpawnSpatialPlan({
    locationId: location.id, pose: { x: 0, z: 0, feetY: 6 }, hostSpace: partitionHost, routeFan: [], composition: partitionComposition,
});
assert.ok(partitionPlan.ready, `partition host plan unresolved: ${partitionPlan.unresolved.join(', ')}`);
assertFocalFrameInvariants('focal-frame-partition', partitionPlan, partitionHost);

// TERRA and GIGA (the two profiles with the largest seating groups) must
// satisfy the same invariants, not just the plain-room case.
const terraHost = {
    ...enclosedHost('deep-backroom', 6.0, 4.0),
    supportAreaM2: 96, largestSupportPatchAreaM2: 48, maxSupportSpanM: 8, maxWallSpanM: 12,
    supportPatches: [
        { x: -3, z: 0, halfX: 3, halfZ: 4, minX: -6, maxX: 0, minZ: -4, maxZ: 4, yMin: 6, yMax: 6.12 },
        { x: 3, z: 0, halfX: 3, halfZ: 4, minX: 0, maxX: 6, minZ: -4, maxZ: 4, yMin: 6, yMax: 6.12 },
    ],
};
const terraComposition = createSpawnComposition(runtime, 'focal-frame-terra', terraHost);
const terraPlan = compileSpawnSpatialPlan({
    locationId: location.id, pose: { x: 0, z: 0, feetY: 6 }, hostSpace: terraHost, routeFan: [], composition: terraComposition,
});
assert.ok(terraPlan.ready, `TERRA plan unresolved: ${terraPlan.unresolved.join(', ')}`);
assertFocalFrameInvariants('focal-frame-terra', terraPlan, terraHost);

const gigaHost = enclosedHost('hanging-storefront', 4.2, 3.7);
const gigaComposition = createSpawnComposition(runtime, 'focal-frame-giga', gigaHost);
const gigaPlan = compileSpawnSpatialPlan({
    locationId: location.id, pose: { x: 0, z: 0, feetY: 6 }, hostSpace: gigaHost, routeFan: [], composition: gigaComposition,
});
assert.ok(gigaPlan.ready, `GIGA plan unresolved: ${gigaPlan.unresolved.join(', ')}`);
assertFocalFrameInvariants('focal-frame-giga', gigaPlan, gigaHost);

console.log('[spawn-seating-focal-frame-selftest] PASS', {
    distinctArrangements: arrangementsSeen.size,
    terraSeats: terraPlan.placements.filter(item => item.slot === 'seating').length,
    gigaSeats: gigaPlan.placements.filter(item => item.slot === 'seating').length,
});
