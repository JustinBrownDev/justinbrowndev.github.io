import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileSpawnLocationRuntime } from '../world/spawn-location-runtime.js';
import { collectSpawnFabricSpaces, provePlayableSpawn, selectSpawnEnclaveCandidate } from '../world/spawn-proof.js';

const location = JSON.parse(fs.readFileSync(new URL('../jweb-authored-location-data-pack/locations/spawn-rooftop-reality-leak.json', import.meta.url), 'utf8'));
const assets = JSON.parse(fs.readFileSync(new URL('../jweb-authored-location-data-pack/assets/spawnpoint-asset-families.json', import.meta.url), 'utf8'));
const runtime = compileSpawnLocationRuntime({ location, assets });

function topHeight(x, z) {
    // Tempting physics-only support inside/under a tower. It is deliberately NOT
    // published as a fabric roof space and therefore may never win authored spawn.
    if (Math.hypot(x + 8, z) <= 3.2) return 11;
    // Authoritative east roof pocket.
    const d = Math.hypot(x - 8, z);
    if (d <= 3.4) return 6;
    // Taller neighboring masses around several sides of the real roof.
    const a = Math.atan2(z, x - 8);
    if (d >= 4.4 && d <= 7.0 && (a > -2.7 && a < -1.7 || a > -0.6 && a < 0.5 || a > 1.35 && a < 2.3)) return 12;
    return 0;
}

const physics = {
    supportHeightAt(x, z) { return topHeight(x, z); },
    poseIsValid(x, z, feetY) {
        const top = topHeight(x, z);
        return Number.isFinite(feetY) && Math.abs(top - feetY) < 0.01;
    },
    probeControllerPath({ start, steps }) {
        const dx = steps.reduce((sum, step) => sum + step.wishVelocityX * step.dt, 0);
        const dz = steps.reduce((sum, step) => sum + step.wishVelocityZ * step.dt, 0);
        const distance = Math.hypot(dx, dz);
        const heading = Math.atan2(dz, dx);
        // Keep a broad but non-omnidirectional route fan so the refuge side remains usable.
        const valid = Math.cos(heading) > -0.55 || Math.sin(heading) > 0.55;
        return {
            validStart: true,
            validEnd: valid,
            distance: valid ? distance : Math.min(0.6, distance),
            maxDistance: valid ? distance : Math.min(0.6, distance),
            completedSteps: steps.length,
            end: { x: start.x + dx, z: start.z + dz, feetY: start.feetY, grounded: true },
        };
    },
};

const fabricPayloads = new Map([
    ['site-east', {
        entity: {
            id: 'entity-east',
            siteId: 'site-east',
            floorH: 3,
            footprintModules: [{ key: '8,0', cx: 8, cz: 0, halfX: 3.1, halfZ: 3.1, floors: 2 }],
        },
        physics: {
            platforms: [{ x: 8, z: 0, hx: 3.0, hz: 3.0, y: 6, supportKind: 'roof' }],
            mazeWalls: [],
            semanticConnectors: [{
                id: 'entity-east:stair',
                endpoints: [{ id: 'bottom', x: 8, y: 0, z: 0 }, { id: 'top', x: 8, y: 6, z: 0 }],
                reservations: [{ id: 'entity-east:stair:shaft' }],
            }],
            circulationReservations: [{
                id: 'entity-east:stair:shaft', kind: 'stair-shaft', x: 8, z: 0,
                halfX: 0.55, halfZ: 0.65, yMin: 0, yMax: 8.1,
            }],
        },
        detailReservations: [],
    }],
]);

const spaces = collectSpawnFabricSpaces(fabricPayloads);
assert.equal(spaces.length, 1);
assert.equal(spaces[0].spaceId, 'entity-east:8,0:roof');
assert.deepEqual(spaces[0].connectorIds, ['entity-east:stair']);

const origin = { x: 0, z: 0, feetY: 0 };
const selected = selectSpawnEnclaveCandidate({ playerPhysics: physics, origin, locationRuntime: runtime, fabricSpaces: spaces });
assert.ok(selected, 'an authoritative elevated roof enclave should be found');
assert.ok(selected.x > 0, `published east roof must beat the tempting physics-only west support, got x=${selected.x}`);
assert.equal(selected.space.spaceId, 'entity-east:8,0:roof');
assert.equal(selected.peakLike, false);
assert.ok(selected.higherContextDirections >= 2);
assert.ok(selected.navigation.successful.length >= 3);

const proof = provePlayableSpawn({ playerPhysics: physics, origin, locationRuntime: runtime, fabricPayloads });
assert.equal(proof.ok, true);
assert.equal(proof.routeKind, 'authored-elevated-enclave');
assert.equal(proof.locationSelection.mode, 'fabric-space:elevated-roof-enclave');
assert.equal(proof.locationSelection.hostSpace.spaceId, 'entity-east:8,0:roof');
assert.equal(proof.location.hostSpace.entityId, 'entity-east');
assert.ok(proof.location.routeFan.length >= 3, 'bound location must retain successful controller routes');
assert.ok(proof.location.spatialPlan?.ready, `spawn spatial plan unresolved: ${proof.location.spatialPlan?.unresolved?.join(', ')}`);
assert.ok(proof.location.spatialPlan.placements.some(item => item.slot === 'primary-tv'));
assert.ok(proof.location.spatialPlan.placements.filter(item => item.slot === 'seating').length >= 2);

console.log('[spawn-enclave-selftest] PASS', {
    pose: proof.pose,
    hostSpace: proof.location.hostSpace.spaceId,
    connectorIds: proof.location.hostSpace.connectorIds,
    navigableHeadings: proof.locationSelection.navigableHeadings,
    placements: proof.location.spatialPlan.placements.length,
});

const flatPhysics = {
    supportHeightAt() { return 0; },
    poseIsValid(_x, _z, feetY) { return Math.abs(feetY) < 0.01; },
    probeControllerPath({ start, steps }) {
        const dx = steps.reduce((sum, step) => sum + step.wishVelocityX * step.dt, 0);
        const dz = steps.reduce((sum, step) => sum + step.wishVelocityZ * step.dt, 0);
        const distance = Math.hypot(dx, dz);
        return { validStart: true, validEnd: true, distance, maxDistance: distance, end: { x: start.x + dx, z: start.z + dz, feetY: 0, grounded: true } };
    },
};
const fallback = provePlayableSpawn({ playerPhysics: flatPhysics, origin, locationRuntime: runtime, fabricPayloads: new Map() });
assert.equal(fallback.ok, true, 'no authoritative roof must fall back to conservative local proof');
assert.equal(fallback.routeKind, 'straight');
assert.equal(fallback.location.hostSpace, null, 'fallback may bind authored identity data but must not fake fabric host-space authority');
