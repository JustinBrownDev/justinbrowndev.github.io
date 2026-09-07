import assert from 'node:assert/strict';
import {
    applySpawnProfileProgression,
    progressionSlotCountRange,
    shapeSpawnPickForProgression,
} from '../world/spawn-profile-progression.js';

const small = applySpawnProfileProgression({ id: 'small-tv-roof', mediaScale: 1, mediaVariantIds: [] });
assert.equal(small.progressionRank, 1);
assert.deepEqual(small.mediaVariantIds, ['tv.flat.office-monitor']);
const laptop = shapeSpawnPickForProgression(small, 'primary-tv', 0, {
    familyId: 'spawn.media.television', variantId: 'tv.flat.office-monitor', dimensionsM: [0.6, 0.4, 0.2], tags: ['lcd'],
});
assert.equal(laptop.variantId, 'media.laptop-salvage');
assert.ok(laptop.tags.includes('laptop'));
assert.equal(laptop.constructionRecipe, 'laptop');

const radio = applySpawnProfileProgression({ id: 'radio-roof' });
assert.deepEqual(progressionSlotCountRange(radio, 'drink-evidence', [1, 4]), [2, 4]);
const water = shapeSpawnPickForProgression(radio, 'drink-evidence', 0, { variantId: 'whatever' });
const ashtray = shapeSpawnPickForProgression(radio, 'drink-evidence', 1, { variantId: 'whatever-2' });
assert.equal(water.variantId, 'drink.water-bottle');
assert.equal(ashtray.variantId, 'clutter.ashtray-metal');

const terra = applySpawnProfileProgression({ id: 'terra-backroom', mediaVariantIds: ['tv.flat.wall-salvage'], mediaScale: [10, 4.9, 3] });
assert.equal(terra.progressionRank, 7);
assert.equal(terra.groundMedia, true, 'TERRA cabinet belongs directly on the structural floor');
assert.ok(terra.mediaVariantIds.every(id => id.startsWith('tv.crt.')));
assert.deepEqual(terra.mediaRecipes, ['crt-box']);
assert.ok(terra.mediaScale[2] >= 5, 'TERRA CRT must retain extreme cabinet depth');
assert.ok(terra.artPartBudget >= 400, 'TERRA gets a deliberately larger visual budget');
console.log('[spawn-progression-profile-selftest] PASS', { small: laptop.variantId, radio: [water.variantId, ashtray.variantId], terra: terra.mediaScale });
