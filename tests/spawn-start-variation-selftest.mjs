import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compileSpawnLocationRuntime, createSpawnComposition } from '../world/spawn-location-runtime.js';

const location = JSON.parse(fs.readFileSync(new URL('../jweb-authored-location-data-pack/locations/spawn-rooftop-reality-leak.json', import.meta.url), 'utf8'));
const assets = JSON.parse(fs.readFileSync(new URL('../jweb-authored-location-data-pack/assets/spawnpoint-asset-families.json', import.meta.url), 'utf8'));
const runtime = compileSpawnLocationRuntime({ location, assets });

const profiles = new Set();
const mediaFamilies = new Set();
const mediaScales = new Set();
const supports = new Set();
const seats = new Set();
for (let i = 0; i < 96; i++) {
    const composition = createSpawnComposition(runtime, `variation-${i}`);
    profiles.add(composition.startProfile.id);
    mediaScales.add(composition.startProfile.mediaScale);
    const media = composition.slots.find(slot => slot.slot === 'primary-tv')?.picks?.[0];
    const support = composition.slots.find(slot => slot.slot === 'tv-support')?.picks?.[0];
    for (const seat of composition.slots.find(slot => slot.slot === 'seating')?.picks ?? []) seats.add(seat.variantId);
    if (media) mediaFamilies.add(media.familyId);
    if (support) supports.add(support.variantId);
}

assert.ok(profiles.size >= 4, `expected broad start-profile variety, got ${[...profiles]}`);
assert.ok(mediaFamilies.has('spawn.media.television'), 'television starts must remain in the mix');
assert.ok(mediaFamilies.has('spawn.media.radio'), 'radio-only starts must exist');
assert.ok(mediaScales.has(1.25), 'big-TV profile must exist');
assert.ok(mediaScales.has(0.78), 'small-TV profile must exist');
assert.ok(supports.size >= 5, `expected varied tables/supports, got ${supports.size}`);
assert.ok(seats.size >= 8, `expected varied chairs/seating, got ${seats.size}`);

console.log('[spawn-start-variation-selftest] PASS', {
    profiles: [...profiles].sort(),
    mediaFamilies: [...mediaFamilies].sort(),
    supports: supports.size,
    seats: seats.size,
});
