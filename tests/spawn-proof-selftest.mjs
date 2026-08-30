import assert from 'node:assert/strict';
import { createPlayerPhysics } from '../player-physics.js';
import { provePlayableSpawn } from '../world/spawn-proof.js';

function makePhysics({ x = 0, z = 0, props = [], mazeWalls = [] } = {}) {
    const position = { x, y: 1.65, z };
    const physics = createPlayerPhysics({
        position,
        eyeHeight: 1.65,
        playerRadius: 0.22,
        wallThickness: 0.12,
        worldToCell: (px, pz) => ({ col: Math.floor(px / 4) + 8, row: Math.floor(pz / 4) + 8 }),
        grid: Array.from({ length: 17 }, () => Array(17).fill(false)),
        buildingWallSegments: new Map(),
        propColliders: props,
        elevatedPlatforms: [],
        rampRuns: [],
        overheadCeilings: [],
        boundsHalf: 100,
    });
    if (mazeWalls.length) physics.registerOwnedWorld('spawn-proof:test-walls', { mazeWalls });
    return { physics, position };
}

// The controller is constructed before main.js selects the final spawn. A bad
// requested spawn must search locally instead of silently restoring that older pose.
const historical = makePhysics({
    x: -6,
    props: [{ x: 0, z: 0, radius: 0.65, yMin: 0, height: 2.5 }],
});
historical.position.x = 0;
historical.position.z = 0;
historical.position.y = 1.65;
historical.physics.syncFromPosition({ allowLastSafeFallback: false });
assert.ok(Math.hypot(historical.position.x, historical.position.z) > 0.65, 'invalid requested spawn must move clear of the collider');
assert.ok(Math.hypot(historical.position.x, historical.position.z) <= 2.5 + 1e-9, 'bootstrap relocation must remain local to the requested spawn');
assert.notEqual(historical.position.x, -6, 'startup spawn must not fall back to the pre-spawn historical lastSafe');

// Open ground should prove immediately, and the proof itself must not mutate the
// real controller state or position.
const open = makePhysics();
const beforePosition = { ...open.position };
const beforeState = open.physics.getState();
const openProof = provePlayableSpawn({
    playerPhysics: open.physics,
    origin: { x: 0, z: 0, feetY: 0 },
});
assert.equal(openProof.ok, true, 'open ground must have a controller-valid escape route');
assert.equal(openProof.candidateIndex, 0, 'already-valid open spawn should not relocate');
assert.ok(openProof.escapeDistance >= 2.2, 'proof must demonstrate meaningful travel away from spawn');
assert.deepEqual(open.position, beforePosition, 'spawn proof must not move the real position');
assert.deepEqual(open.physics.getState(), beforeState, 'spawn proof must restore all controller state including lastSafe');

// A capsule-valid center can still be unplayable. Four close walls form a box that
// leaves the center pose legal but prevents the controller from escaping 2.2m.
const box = 0.65;
const trapped = makePhysics({
    mazeWalls: [
        { x1: -box, z1: -box, x2: box, z2: -box, yMin: 0, yMax: 3 },
        { x1: -box, z1: box, x2: box, z2: box, yMin: 0, yMax: 3 },
        { x1: -box, z1: -box, x2: -box, z2: box, yMin: 0, yMax: 3 },
        { x1: box, z1: -box, x2: box, z2: box, yMin: 0, yMax: 3 },
    ],
});
assert.equal(trapped.physics.poseIsValid(0, 0, 0), true, 'test center must be statically capsule-valid');
const trappedProof = provePlayableSpawn({
    playerPhysics: trapped.physics,
    origin: { x: 0, z: 0, feetY: 0 },
    searchRadius: 0,
});
assert.equal(trappedProof.ok, false, 'static capsule validity alone must not release an enclosed spawn');
assert.equal(trappedProof.reason, 'no-controller-escape-route');
assert.ok(trappedProof.bestDistance < 2.2, 'trapped controller must not fake the required escape distance');

console.log('[spawn-proof-selftest] PASS', {
    relocated: { x: historical.position.x, z: historical.position.z },
    openRoute: openProof.routeKind,
    openEscape: openProof.escapeDistance,
    trappedBest: trappedProof.bestDistance,
    trappedProbes: trappedProof.probes,
});
