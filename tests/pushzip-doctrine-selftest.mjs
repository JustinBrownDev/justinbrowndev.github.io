import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = rel => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const runner = read('tools/jweb-pushzip/runner.mjs');
const readme = read('tools/jweb-pushzip/README.md');
const doctrine = read('tools/jweb-pushzip/DOCTRINE.md');
const launcherUrl = new URL('../tools/jweb-pushzip/PUSH-TEMPLATE.cmd', import.meta.url);
const launcher = fs.existsSync(launcherUrl) ? fs.readFileSync(launcherUrl, 'utf8') : null;

assert.match(runner, /jweb\.pushzip-runner\.v3/);
assert.match(runner, /baselineTests/);
assert.match(runner, /compareBaseline/);
assert.match(runner, /PRE baseline debt recorded/);
assert.match(runner, /NEW failure after cut/);
assert.match(runner, /baseline failure worsened\/changed/);
assert.match(runner, /required Cut-specific tests failed/);
assert.match(runner, /assertTransactionalApplyFailure/);
assert.match(runner, /verifyBootstrapRunnerParity/);
assert.match(runner, /Every configured check runs before this phase gets a test-derived verdict/);
assert.match(runner, /POST is intentionally not run against a nonexistent candidate/);
assert.ok(runner.includes("['diff', '--cached', '--name-only', '-z']"));
assert.ok(runner.includes("['diff', '--cached', '--check']"));
assert.doesNotMatch(runner, /Downloads/i, 'canonical runner must never depend on an operator Downloads path');
assert.match(doctrine, /Living document/i);
assert.match(doctrine, /Dirty baseline is evidence, not automatically a blocker/i);
assert.match(doctrine, /Baseline-differential gate/i);
assert.match(doctrine, /Test cost is structural/i);
assert.match(doctrine, /Required cut tests are strict/i);
assert.match(doctrine, /Cut 12 R3 dirty baseline and test cost/i);
assert.match(doctrine, /author-local executed/i);
assert.match(doctrine, /clean-clone-only/i);
assert.match(doctrine, /Cut 12 R4 author-local versus clean-clone coverage/i);
assert.match(doctrine, /Cut 12 R5 unscoped transform deleted `planFloor`/i);
assert.match(doctrine, /bounded by explicit owning start\/end markers/i);
assert.match(doctrine, /critical transformed-source symbols\/boundaries/i);
assert.match(doctrine, /Cut 12 R6 immutable collision record entered a mutable legacy registry/i);
assert.match(doctrine, /semanticConnectorEligible: false/i);
assert.match(doctrine, /Cut 12 R7 reservation substrate stranded raster pockets/i);
assert.match(doctrine, /claimed before leftover flood\/closure/i);
assert.match(doctrine, /bootstrap.*payload.*runner parity/i);
assert.match(readme, /living document/i);
assert.match(readme, /Runner v3/);
assert.match(readme, /baseline-differential gate/i);
if (launcher !== null) {
  assert.match(launcher, /%~dp0\./);
  assert.match(launcher, /bootstrap\\jweb-pushzip-runner\.mjs/);
}

console.log('[pushzip-doctrine-selftest] PASS', {
  invariant: 'living doctrine + pinned clean base + cost-aware PRE + differential baseline + strict required POST + transactional apply + exact staging',
});
