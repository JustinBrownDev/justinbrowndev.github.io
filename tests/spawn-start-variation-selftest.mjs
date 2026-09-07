import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileSpawnLocationRuntime, createSpawnComposition } from '../world/spawn-location-runtime.js';

const location = JSON.parse(fs.readFileSync(new URL('../jweb-authored-location-data-pack/locations/spawn-rooftop-reality-leak.json', import.meta.url), 'utf8'));
const assets = JSON.parse(fs.readFileSync(new URL('../jweb-authored-location-data-pack/assets/spawnpoint-asset-families.json', import.meta.url), 'utf8'));
const runtime = compileSpawnLocationRuntime({ location, assets });

function wall(length, yMin = 6, yMax = 9.15) {
    return { x1: -length * 0.5, z1: 0, x2: length * 0.5, z2: 0, yMin, yMax };
}

const exposedHost = {
    hostArchetype: 'exposed-roof', supportAreaM2: 42, largestSupportPatchAreaM2: 42,
    maxWallSpanM: 0, overheadCovered: false, nearbyWalls: [],
};
const shelteredHost = {
    hostArchetype: 'sheltered-roof', supportAreaM2: 42, largestSupportPatchAreaM2: 36,
    maxWallSpanM: 7, overheadCovered: true, overheadClearanceM: 3.2, nearbyWalls: [wall(7)],
};
const gigaHost = {
    hostArchetype: 'hanging-storefront', supportAreaM2: 48, largestSupportPatchAreaM2: 42,
    maxWallSpanM: 8, overheadCovered: true, overheadClearanceM: 3.15, nearbyWalls: [wall(8)],
};
const terraHost = {
    hostArchetype: 'deep-backroom', supportAreaM2: 120, largestSupportPatchAreaM2: 120,
    maxSupportSpanM: 12, maxWallSpanM: 12, overheadCovered: true, overheadClearanceM: 3.1, nearbyWalls: [wall(12)],
};

const exposedProfiles = new Set();
const exposedFamilies = new Set();
const supports = new Set();
const seats = new Set();
for (let i = 0; i < 256; i++) {
    const composition = createSpawnComposition(runtime, `exposed-${i}`, exposedHost);
    exposedProfiles.add(composition.startProfile.id);
    const media = composition.slots.find(slot => slot.slot === 'primary-tv')?.picks?.[0];
    const support = composition.slots.find(slot => slot.slot === 'tv-support')?.picks?.[0];
    for (const seat of composition.slots.find(slot => slot.slot === 'seating')?.picks ?? []) seats.add(seat.variantId);
    if (media) {
        exposedFamilies.add(media.familyId);
        assert.notEqual(media.placement?.mount, 'wall', 'wall-only television cannot be selected on a wall-less exposed roof');
    }
    if (support) supports.add(support.variantId);
}
for (const required of ['small-tv-roof', 'normal-tv-roof', 'big-tv-roof', 'super-big-tv-roof', 'radio-roof']) {
    assert.ok(exposedProfiles.has(required), `exposed roof should be able to roll ${required}`);
}
assert.deepEqual([...exposedFamilies].sort(), ['spawn.media.radio', 'spawn.media.television']);
assert.ok(supports.size >= 7, `expected varied exposed tables/supports, got ${supports.size}`);
assert.ok(seats.size >= 10, `expected varied exposed chairs/seating, got ${seats.size}`);

const shelteredProfiles = new Set();
for (let i = 0; i < 128; i++) shelteredProfiles.add(createSpawnComposition(runtime, `shelter-${i}`, shelteredHost).startProfile.id);
assert.ok(shelteredProfiles.has('mega-big-shelter'), 'MEGA BIG must be in the overhead-sheltered pool');
assert.ok(shelteredProfiles.has('super-big-shelter'), 'SUPER BIG must remain possible under shelter');
assert.ok(shelteredProfiles.has('radio-under-shelter'), 'sheltered rooms can still roll audio-only radio');
assert.ok([...shelteredProfiles].every(id => !id.includes('giga') && !id.includes('terra')), 'shelter alone must not unlock GIGA/TERRA');

const giga = createSpawnComposition(runtime, 'giga-shop', gigaHost);
assert.equal(giga.startProfile.id, 'giga-shopfront');
const gigaMedia = giga.slots.find(slot => slot.slot === 'primary-tv')?.picks?.[0];
assert.equal(gigaMedia?.variantId, 'tv.flat.wall-salvage');
assert.ok(gigaMedia.dimensionsM[0] >= 3.4, `GIGA should read as storefront-scale, width=${gigaMedia.dimensionsM[0]}`);
assert.equal(gigaMedia.placement?.mount, 'wall');

const terra = createSpawnComposition(runtime, 'terra-room', terraHost);
assert.equal(terra.startProfile.id, 'terra-backroom');
const terraMedia = terra.slots.find(slot => slot.slot === 'primary-tv')?.picks?.[0];
assert.equal(terraMedia?.variantId, 'tv.flat.wall-salvage');
assert.ok(terraMedia.dimensionsM[0] >= 8.0, `TERRA should start at eight meters wide, width=${terraMedia.dimensionsM[0]}`);
assert.ok(terraMedia.dimensionsM[1] < 2.9, `TERRA should fit a plausible room height, height=${terraMedia.dimensionsM[1]}`);
assert.equal(terra.slots.find(slot => slot.slot === 'seating')?.picks?.length, 4, 'TERRA must provision a real four-seat hangout, not a screen-only closet');

const undersizedTerraHost = { ...terraHost, supportAreaM2: 96, largestSupportPatchAreaM2: 84, maxSupportSpanM: 9.5, maxWallSpanM: 9.0 };
for (let i = 0; i < 24; i++) {
    assert.notEqual(createSpawnComposition(runtime, `terra-too-small-${i}`, undersizedTerraHost).startProfile.id, 'terra-backroom', 'undersized rooms must not unlock TERRA');
}

const unknownHostProfiles = new Set(Array.from({ length: 64 }, (_, i) => createSpawnComposition(runtime, `unknown-${i}`).startProfile.id));
assert.ok([...unknownHostProfiles].every(id => ['small-tv-roof', 'normal-tv-roof', 'radio-roof'].includes(id)), 'unknown host geometry must stay conservative');

console.log('[spawn-start-variation-selftest] PASS', {
    exposedProfiles: [...exposedProfiles].sort(),
    shelteredProfiles: [...shelteredProfiles].sort(),
    supports: supports.size,
    seats: seats.size,
    gigaWidth: gigaMedia.dimensionsM[0],
    terraWidth: terraMedia.dimensionsM[0],
});
