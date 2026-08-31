import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bindSpawnLocationRuntime, compileSpawnLocationRuntime, createSpawnComposition } from '../world/spawn-location-runtime.js';

const location = JSON.parse(fs.readFileSync(new URL('../jweb-authored-location-data-pack/locations/spawn-rooftop-reality-leak.json', import.meta.url), 'utf8'));
const assets = JSON.parse(fs.readFileSync(new URL('../jweb-authored-location-data-pack/assets/spawnpoint-asset-families.json', import.meta.url), 'utf8'));
const runtime = compileSpawnLocationRuntime({ location, assets });

assert.equal(runtime.schema, 'jweb.spawn-location-runtime.v2');
assert.equal(runtime.location.id, 'spawn.rooftop-reality-leak');
assert.equal(runtime.location.binding.authority, 'fabric-space');
assert.equal(runtime.location.binding.geometryOwnership, 'external-fabric-and-connectors');
assert.equal(runtime.location.locationClass, 'elevated-roof-enclave');
assert.ok(runtime.selectionPolicy.minNavigableHeadings >= 3);
assert.equal(runtime.selectionPolicy.requireFabricConnector, true);
assert.ok(runtime.location.spatialFingerprint.stronglyRejected.some(value => /highest isolated roof/i.test(value)));

const a1 = createSpawnComposition(runtime, 'seed-A:pose-1');
const a2 = createSpawnComposition(runtime, 'seed-A:pose-1');
const b = createSpawnComposition(runtime, 'seed-B:pose-2');
assert.deepEqual(a1, a2, 'same bound location must compile the same composition descriptor');
for (const slot of runtime.slots.filter(slot => slot.required)) {
    const compiled = a1.slots.find(item => item.slot === slot.slot);
    assert.ok(compiled, `missing required slot ${slot.slot}`);
    assert.ok(compiled.picks.length >= slot.count[0], `required slot ${slot.slot} under minimum count`);
}
const signature = composition => composition.slots.flatMap(slot => slot.picks.map(pick => pick.variantId)).join('|');
assert.notEqual(signature(a1), signature(b), 'different bindings should be able to vary exact evidence');

const proof = {
    pose: { x: 8, z: 0, feetY: 6 },
    fabricSpace: {
        spaceId: 'entity-east:8,0:roof', payloadKey: 'site-east', siteId: 'site-east', entityId: 'entity-east', moduleKey: '8,0',
        surfaceClass: 'roof', exposure: 'exterior', surfaceY: 6,
        bounds: { x: 8, z: 0, halfX: 3, halfZ: 3, minX: 5, maxX: 11, minZ: -3, maxZ: 3, yMin: 6, yMax: 8.2 },
        supportPatches: [{ x: 8, z: 0, halfX: 3, halfZ: 3, minX: 5, maxX: 11, minZ: -3, maxZ: 3, yMin: 6, yMax: 6.12 }],
        connectorIds: ['stair'], reservations: [], existingDetailReservations: [],
    },
    routeFan: [
        { heading: 0, distance: 2.8, deltaY: 0, end: { x: 10.8, z: 0, feetY: 6, grounded: true } },
        { heading: Math.PI / 2, distance: 2.8, deltaY: 0, end: { x: 8, z: 2.8, feetY: 6, grounded: true } },
        { heading: -Math.PI / 2, distance: 2.8, deltaY: 0, end: { x: 8, z: -2.8, feetY: 6, grounded: true } },
    ],
};
const bound1 = bindSpawnLocationRuntime(runtime, proof);
const bound2 = bindSpawnLocationRuntime(runtime, proof);
assert.equal(bound1.schema, 'jweb.bound-spawn-location.v2');
assert.equal(bound1.hostSpace.spaceId, proof.fabricSpace.spaceId);
assert.deepEqual(bound1.routeFan, proof.routeFan);
assert.deepEqual(bound1.spatialPlan, bound2.spatialPlan, 'bound spatial plan must be deterministic');
assert.ok(bound1.spatialPlan.ready, `representative spatial plan unresolved: ${bound1.spatialPlan.unresolved.join(', ')}`);

console.log('[spawn-location-runtime-selftest] PASS', {
    location: runtime.location.id,
    slots: runtime.slots.length,
    hostSpace: bound1.hostSpace.spaceId,
    spatialPlacements: bound1.spatialPlan.placements.length,
});
