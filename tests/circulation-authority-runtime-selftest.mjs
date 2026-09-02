import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = rel => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const engine = read('kowloon-fabric-engine.js');
const scaffold = read('world/scaffold-circulation-plan.js');
const fast = read('world/fast-vertical-route.js');
const transport = read('world/exterior-transport-network.js');
const runner = read('tools/jweb-pushzip/runner.mjs');
const sidecar = read('world/architecture/building-plan-sidecar.js');

assert.match(scaffold, /from '\.\/facade-stair-authority\.js'/);
assert.match(fast, /from '\.\/facade-stair-authority\.js'/);
assert.match(scaffold, /planAlternatingFacadeStair/);
assert.match(fast, /planAlternatingFacadeStair/);
assert.doesNotMatch(scaffold, /splitRiseA|splitRiseB|streetLaneCoord|buildingLaneCoord/);
assert.match(engine, /canonical-facade-zigzag/);
assert.doesNotMatch(engine, /plan\.topology !== 'canonical-scaffold-switchback'/,
  'runtime acceptance may not keep the retired prism topology gate');
assert.match(engine, /blockedRects:\s*physics\.fastStairThroats/);
assert.match(engine, /reconcileTransportPlatformOwnership/);
assert.match(transport, /candidateBlocked/);
assert.match(transport, /linksConflict/);
assert.match(transport, /BLOCKED_CLEARANCE/);
assert.match(sidecar, /cellIntersectsReservation/);
assert.match(sidecar, /cellSize \* 0\.5/);
assert.match(runner, /runAllChecks/);
assert.ok(runner.includes("['diff', '--cached', '--name-only', '-z']"),
  'runner must validate the exact staged allowlist using NUL-delimited git diff output');
assert.ok(runner.includes("['diff', '--cached', '--check']"),
  'runner must run staged diff whitespace validation');

console.log('[circulation-authority-runtime-selftest] PASS', {
  invariant: 'one facade flight author; conservative core raster; throat-clearance transport; reusable repo-versioned push runner',
});
