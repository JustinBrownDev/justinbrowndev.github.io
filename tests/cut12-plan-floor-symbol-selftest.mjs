import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../world/architecture/building-plan-sidecar.js', import.meta.url), 'utf8');
const count = needle => source.split(needle).length - 1;

assert.equal(count('function planFloor({'), 1,
  'Building Plan transform must preserve exactly one planFloor declaration');
assert.equal(count('function attemptMinimumProgramPlacement({'), 1,
  'Building Plan transform must preserve exactly one minimum-placement helper');
assert.equal(count('function verticalEdgesForFloors('), 1,
  'Building Plan transform must preserve exactly one vertical-floor boundary');
assert.ok(source.indexOf('function planFloor({') < source.indexOf('function verticalEdgesForFloors('),
  'planFloor must remain inside its expected source region');
assert.match(source, /export function planBuildingSidecar\(/,
  'Building Plan public planner must remain exported');
assert.match(source, /claimUnassignedRasterToEligibleSpaces\(\{/,
  'Building Plan must use structural-first raster closure after allocation');

console.log('[cut12-plan-floor-symbol-selftest] PASS', {
  invariant: 'scoped applicator preserves planFloor and its owning source boundaries',
});
