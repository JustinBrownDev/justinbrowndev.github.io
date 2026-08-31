import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileSpawnLocationRuntime, createSpawnComposition } from '../world/spawn-location-runtime.js';

const location = JSON.parse(fs.readFileSync(new URL('../jweb-authored-location-data-pack/locations/spawn-rooftop-reality-leak.json', import.meta.url), 'utf8'));
const assets = JSON.parse(fs.readFileSync(new URL('../jweb-authored-location-data-pack/assets/spawnpoint-asset-families.json', import.meta.url), 'utf8'));
const runtime = compileSpawnLocationRuntime({ location, assets });

assert.equal(runtime.location.id, 'spawn.rooftop-reality-leak');
assert.equal(runtime.location.binding.authority, 'fabric-space');
assert.equal(runtime.location.binding.geometryOwnership, 'external-fabric-and-connectors');
assert.equal(runtime.location.locationClass, 'elevated-roof-enclave');
assert.ok(runtime.selectionPolicy.minNavigableHeadings >= 3);
assert.ok(runtime.selectionPolicy.preferredHigherContextDirections >= 2);
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
console.log('[spawn-location-runtime-selftest] PASS', {
    location: runtime.location.id,
    slots: runtime.slots.length,
    firstStory: a1.story?.id ?? null,
    secondStory: b.story?.id ?? null,
});
