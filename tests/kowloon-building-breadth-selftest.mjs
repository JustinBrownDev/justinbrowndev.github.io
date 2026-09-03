import assert from 'node:assert/strict';
import { chooseKowloonCompoundTargetSize } from '../world/kowloon-structure.js';

const rolls = [0, 0.001, 0.05, 0.15, 0.33, 0.5, 0.72, 0.9, 0.999999];
for (const weirdness of [0, 0.5, 1]) {
  for (const roll of rolls) {
    const size = chooseKowloonCompoundTargetSize(() => roll, weirdness);
    assert.ok(size >= 20, `target size ${size} is narrower than the 4x twenty-cell real-building baseline`);
    assert.ok(size <= 48, `target size ${size} escaped the forty-eight-cell upper bound`);
  }
}
assert.equal(chooseKowloonCompoundTargetSize(() => 0, 0), 20,
  'the lowest roll should begin at a twenty-cell building target');

console.log('[kowloon-building-breadth-selftest] PASS', {
  invariant: 'ordinary compound target size is 20..48 cells (exact 4x of prior 5..12 targets); constrained partition leftovers may still be smaller',
});
