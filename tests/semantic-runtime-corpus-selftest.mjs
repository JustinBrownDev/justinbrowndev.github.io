import assert from 'node:assert/strict';
import {
    SEMANTIC_RUNTIME_PROP_ASSETS,
    SEMANTIC_RUNTIME_PROP_ASSET_BY_ID,
} from '../vendor/city-pack/semantic-megapack/runtime-props-v6.js';

assert.ok(Array.isArray(SEMANTIC_RUNTIME_PROP_ASSETS), 'runtime semantic corpus must be an array');
assert.ok(SEMANTIC_RUNTIME_PROP_ASSETS.length >= 3000, 'runtime-safe semantic corpus unexpectedly shrank below 3000 assets');
assert.equal(SEMANTIC_RUNTIME_PROP_ASSET_BY_ID.size, SEMANTIC_RUNTIME_PROP_ASSETS.length, 'runtime semantic asset map must cover the entire safe corpus');
assert.ok(SEMANTIC_RUNTIME_PROP_ASSETS.every(def => def?.id && def?.file), 'every runtime semantic asset needs an id and GLB file');
assert.ok(SEMANTIC_RUNTIME_PROP_ASSETS.every(def => def?.semanticGraph?.roles?.includes?.('semantic-prop')), 'runtime corpus must remain semantic-prop-only');

const collisionFree = SEMANTIC_RUNTIME_PROP_ASSETS.filter(def => (def.collision ?? 'none') === 'none').length;
const precommitRecommended = SEMANTIC_RUNTIME_PROP_ASSETS.length - collisionFree;
assert.ok(collisionFree > 0, 'context multiplier needs a nonblocking visual subset');

console.log('[semantic-runtime-corpus-selftest] PASS', {
    assets: SEMANTIC_RUNTIME_PROP_ASSETS.length,
    collisionFree,
    precommitRecommended,
});
