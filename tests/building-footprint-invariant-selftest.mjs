import assert from 'node:assert/strict';
import { assertBuildingFootprintsDoNotOverlap } from '../world/building-footprint-invariant.js';

const moduleAt = (key, cx, cz, halfX = 1, halfZ = 1) => ({ key, cx, cz, halfX, halfZ });
const building = (id, modules) => ({ id, kind: 'building', footprintModules: modules });

const clean = assertBuildingFootprintsDoNotOverlap([
    building('a', [moduleAt('a0', 0, 0)]),
    building('b', [moduleAt('b0', 2, 0)]),
]);
assert.equal(clean.overlaps, 0, 'edge touching must be legal');
assert.equal(clean.buildings, 2);

assert.doesNotThrow(() => assertBuildingFootprintsDoNotOverlap([
    building('compound', [moduleAt('m0', 0, 0, 1.2, 1.2), moduleAt('m1', 0.6, 0, 1.2, 1.2)]),
]), 'modules owned by the same compound may overlap');

assert.throws(() => assertBuildingFootprintsDoNotOverlap([
    building('left', [moduleAt('l0', 0, 0)]),
    building('right', [moduleAt('r0', 1.7, 0)]),
]), /\[building-footprint\] overlap left\/l0 <-> right\/r0|\[building-footprint\] overlap right\/r0 <-> left\/l0/);

assert.throws(() => assertBuildingFootprintsDoNotOverlap([
    { id: 'bad', kind: 'building', footprintModules: [] },
]), /has no footprint modules/);

console.log('[building-footprint-invariant-selftest] PASS', clean);
