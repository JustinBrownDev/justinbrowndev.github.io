import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileSpawnLocationRuntime } from '../world/spawn-location-runtime.js';
import { provePlayableSpawn, selectSpawnEnclaveCandidate } from '../world/spawn-proof.js';

const location = JSON.parse(fs.readFileSync(new URL('../jweb-authored-location-data-pack/locations/spawn-rooftop-reality-leak.json', import.meta.url), 'utf8'));
const assets = JSON.parse(fs.readFileSync(new URL('../jweb-authored-location-data-pack/assets/spawnpoint-asset-families.json', import.meta.url), 'utf8'));
const runtime = compileSpawnLocationRuntime({ location, assets });

function topHeight(x, z) {
    // Exposed local peak west of origin: high, flat, navigable, but isolated.
    if (Math.hypot(x + 8, z) <= 3.2) return 11;
    // Preferred enclave east of origin: lower roof pocket.
    const d = Math.hypot(x - 8, z);
    if (d <= 3.4) return 6;
    // Taller neighboring masses around several sides of the enclave.
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
        const dt = steps.reduce((sum, step) => sum + step.dt, 0);
        const dx = steps.reduce((sum, step) => sum + step.wishVelocityX * step.dt, 0);
        const dz = steps.reduce((sum, step) => sum + step.wishVelocityZ * step.dt, 0);
        const distance = Math.hypot(dx, dz);
        const heading = Math.atan2(dz, dx);
        const inEnclave = Math.hypot(start.x - 8, start.z) < 4;
        // Enclave has four useful headings; peak has every direction, deliberately
        // proving that navigation alone must not beat the nested-city preference.
        const enclaveHeading = Math.cos(heading) > -0.45 || Math.sin(heading) > 0.35;
        const valid = !inEnclave || enclaveHeading;
        return {
            validStart: true,
            validEnd: valid,
            distance: valid ? distance : Math.min(0.6, distance),
            maxDistance: valid ? distance : Math.min(0.6, distance),
            completedSteps: steps.length,
            end: { x: start.x + dx, z: start.z + dz, feetY: start.feetY, grounded: true },
            dt,
        };
    },
};

const origin = { x: 0, z: 0, feetY: 0 };
const selected = selectSpawnEnclaveCandidate({ playerPhysics: physics, origin, locationRuntime: runtime });
assert.ok(selected, 'an authored elevated enclave should be found');
assert.ok(selected.x > 0, `nested east enclave should beat exposed west peak, got x=${selected.x}`);
assert.equal(selected.peakLike, false, 'selected spawn must not read as local peak');
assert.ok(selected.higherContextDirections >= 2, 'selected spawn should have taller neighboring context');
assert.ok(selected.navigation.successful.length >= 3, 'selected spawn needs multiple real movement headings');

const proof = provePlayableSpawn({ playerPhysics: physics, origin, locationRuntime: runtime });
assert.equal(proof.ok, true);
assert.equal(proof.routeKind, 'authored-elevated-enclave');
assert.equal(proof.locationSelection.mode, 'fabric-space:elevated-roof-enclave');
assert.ok(proof.location?.composition?.slots?.length > 0, 'binding must publish composition descriptors for later realizers');

console.log('[spawn-enclave-selftest] PASS', {
    pose: proof.pose,
    higherContextDirections: proof.locationSelection.higherContextDirections,
    navigableHeadings: proof.locationSelection.navigableHeadings,
    compositionSlots: proof.location.composition.slots.length,
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
const fallback = provePlayableSpawn({ playerPhysics: flatPhysics, origin, locationRuntime: runtime });
assert.equal(fallback.ok, true, 'absence of a qualifying elevated enclave must fall back to conservative local proof');
assert.equal(fallback.routeKind, 'straight');
