import assert from 'node:assert/strict';
import { resolveCeilingDepthBand } from '../world/sectional-circulation.js';

const primaryFloors = 7;
const depthBand = 3;
const modules = [
  resolveCeilingDepthBand({ moduleFloors: 7, primaryFloors, depthBand }),
  resolveCeilingDepthBand({ moduleFloors: 5, primaryFloors, depthBand }),
  resolveCeilingDepthBand({ moduleFloors: 3, primaryFloors, depthBand }),
  resolveCeilingDepthBand({ moduleFloors: 2, primaryFloors, depthBand }),
];
assert.deepEqual(modules.map(m => m.localFloor), [4, 2, 0, 0], 'local floor indices should adapt to module depth');
assert.ok(modules.every(m => m.occupiedFloors >= depthBand), 'too-shallow module must deepen to requested ceiling band');
assert.ok(modules.every(m => m.worldFloorBand === primaryFloors - depthBand), 'all local floor variants must resolve to one shared physical band');
assert.ok(new Set(modules.map(m => m.floorBase)).size > 1, 'fixture must exercise unequal ceiling-rooted module bases');
console.log('[cut21q-hanging-exchange-band-selftest] PASS', {
  localFloors: modules.map(m => m.localFloor),
  floorBases: modules.map(m => m.floorBase),
  worldFloorBand: modules[0].worldFloorBand,
  invariant: 'ceiling depth is world-height authority; local hanging floor index is implementation detail',
});
