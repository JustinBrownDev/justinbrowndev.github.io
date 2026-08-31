import assert from 'node:assert/strict';
import { createCooperativeBuildYield } from '../systems/cooperative-build-yield.js';

let clock = 0;
let scheduled = 0;
const slow = [];
const checkpoint = createCooperativeBuildYield({
    budgetMs: 5,
    warnUnitMs: 7,
    now: () => clock,
    schedule: async () => { scheduled++; clock += 1; },
    onSlowUnit: detail => slow.push(detail),
});

clock = 2;
assert.equal(await checkpoint('site-a', 1, 3), false);
clock = 5.2;
assert.equal(await checkpoint('site-b', 2, 3), true);
assert.equal(scheduled, 1);
clock = 14;
assert.equal(await checkpoint('site-c', 3, 3), true);
assert.equal(scheduled, 2);
assert.equal(slow.length, 1);
assert.equal(slow[0].stage, 'site-c');
const stats = checkpoint.snapshot();
assert.equal(stats.boundaryCount, 3);
assert.equal(stats.yieldCount, 2);
assert.ok(stats.worstUnitMs >= 7);

console.log('cooperative-build-yield-selftest: ok');
