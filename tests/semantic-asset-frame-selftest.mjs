import assert from 'node:assert/strict';
import { semanticAssetAlignment, semanticAssetFitScale } from '../world/semantic-asset-frame.js';

const floorDef = {
    dimensionsXYZ: [1, 1, 1],
    boundsMin: [-0.5, 0, -0.5],
};

assert.equal(semanticAssetFitScale(floorDef, {
    min: { x: -0.5, y: -0.4, z: -0.5 },
    max: { x: 0.5, y: 0.6, z: 0.5 },
}), 1, 'correctly sized assets must not be rescaled');

assert.deepEqual(semanticAssetAlignment(floorDef, {
    min: { x: -0.5, y: -0.4, z: -0.5 },
    max: { x: 0.5, y: 0.6, z: 0.5 },
}), { x: 0, y: 0.4, z: 0 }, 'floor support must align the measured mesh bottom to catalog boundsMinY');

assert.equal(semanticAssetFitScale(floorDef, {
    min: { x: -1, y: 0, z: -1 },
    max: { x: 1, y: 2, z: 1 },
}), 0.5, 'oversized loaded geometry must fit inside the reserved catalog envelope');

assert.equal(semanticAssetFitScale(floorDef, {
    min: { x: -0.25, y: 0, z: -0.25 },
    max: { x: 0.25, y: 0.5, z: 0.25 },
}), 1, 'small geometry must not be inflated beyond its authored scale');

const offsetDef = {
    dimensionsXYZ: [2, 3, 4],
    boundsMin: [1, -0.25, 2],
};
assert.deepEqual(semanticAssetAlignment(offsetDef, {
    min: { x: 4, y: -2, z: 5 },
    max: { x: 6, y: 1, z: 9 },
}), { x: -5, y: 1.75, z: -7 }, 'horizontal placement is center-based while vertical support honors catalog boundsMinY');

console.log('[semantic-asset-frame-selftest] PASS', {
    floorSupport: 'measured-bottom-aligned',
    oversizePolicy: 'downscale-only',
    horizontalFrame: 'planner-centered',
});
