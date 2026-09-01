import assert from 'node:assert/strict';
import {
    GENERATION_PROFILE_NAME,
    GENERATION_LANES,
    CUT_AUTHORED_SPAWN_DECORATION,
    CUT_COMMON_KOWLOON_ENRICHMENT,
    resolveGenerationProfile,
} from '../config/performance-isolation.js';

// Node stays full-fidelity so the existing semantic suite is not silently neutered.
assert.equal(GENERATION_PROFILE_NAME, 'full');
assert.equal(GENERATION_LANES.broadStrokesOnly, false);
assert.equal(CUT_AUTHORED_SPAWN_DECORATION, false);
assert.equal(CUT_COMMON_KOWLOON_ENRICHMENT, false);

const skeleton = resolveGenerationProfile({ browser: true, search: '' });
assert.equal(skeleton.name, 'skeleton');
assert.equal(skeleton.lanes.broadStrokesOnly, true);
assert.equal(skeleton.lanes.macroSignage, true);
assert.equal(skeleton.lanes.spectacle, true);
assert.equal(skeleton.lanes.signatureContent, false);
assert.equal(skeleton.lanes.microEnrichment, false);
assert.equal(skeleton.lanes.authoredDecoration, false);
assert.equal(skeleton.lanes.plazaClutter, true);
assert.equal(skeleton.lanes.moderateProps, true);
assert.equal(skeleton.lanes.signageStress, true);

const override = resolveGenerationProfile({
    browser: true,
    search: '?generationProfile=skeleton&laneSignature=1&laneMacro=0&lanePlaza=0&laneProps=0&signageStress=0',
});
assert.equal(override.lanes.signatureContent, true);
assert.equal(override.lanes.macroSignage, false);
assert.equal(override.lanes.plazaClutter, false);
assert.equal(override.lanes.moderateProps, false);
assert.equal(override.lanes.signageStress, false);

const full = resolveGenerationProfile({ browser: true, search: '?generationProfile=full' });
assert.equal(full.name, 'full');
assert.equal(full.lanes.broadStrokesOnly, false);
assert.equal(full.lanes.signatureContent, true);
assert.equal(full.lanes.microEnrichment, true);
assert.equal(full.lanes.signageStress, false);

console.log('generation-profile-selftest: ok');
