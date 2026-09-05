import assert from 'node:assert/strict';
import { carveJunctionYieldingParts } from '../world/transport-junction-clearance.js';

const parts = [
  { id: 'post-in-opening', x: 0, y: 1.2, z: 0, sx: 0.2, sy: 2.4, sz: 0.2, junctionYield: true },
  { id: 'structural-girder-under-deck', x: 0, y: -0.35, z: 0, sx: 3, sy: 0.3, sz: 0.2, junctionYield: false },
  { id: 'far-post', x: 5, y: 1.2, z: 0, sx: 0.2, sy: 2.4, sz: 0.2, junctionYield: true },
];
const result = carveJunctionYieldingParts(parts, {
  intersection: { x: 0, z: 0, hx: 0.8, hz: 0.8 }, y: 0, padding: 0.25,
});
assert.equal(result.removed, 1);
assert.deepEqual(result.parts.map(part => part.id), ['structural-girder-under-deck', 'far-post']);
console.log('[cut21t-junction-clearance-selftest] PASS', {
  removed: result.removed,
  invariant: 'public surface intersections carve decorative/upper structure while retaining non-obstructing structural mass',
});
