import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = rel => fs.readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
const runner = read('tools/jweb-pushzip/runner.mjs');
const builder = read('tools/jweb-pushzip/package-builder.mjs');
const readme = read('tools/jweb-pushzip/README.md');
const doctrine = read('tools/jweb-pushzip/DOCTRINE.md');
const entrypoint = read('tools/jweb-pushzip/GPT-ENTRYPOINT.md');
const agents = read('AGENTS.md');
const launcher = read('tools/jweb-pushzip/PUSH-TEMPLATE.cmd');

assert.match(runner, /jweb\.pushzip-runner\.v5/);
assert.match(runner, /jweb\.pushzip-package\.v2/);
assert.match(runner, /applyMode.*overlay.*exact-release/s);
assert.match(runner, /applyBuiltInPackage/);
assert.match(runner, /baseAbsent/);
assert.match(runner, /git add -A -f failed/);
assert.match(runner, /\['add', '-A', '-f', '--'/);
assert.match(runner, /verifyCnameExact/);
assert.match(runner, /exact bytes "jweb\.dev" with no newline/);
assert.match(runner, /protectedPrefixes/);
assert.match(runner, /baselineTests/);
assert.match(runner, /compareBaseline/);
assert.match(runner, /PRE baseline debt recorded/);
assert.match(runner, /NEW failure after cut/);
assert.match(runner, /required cut-specific tests failed/);
assert.match(runner, /verifyBootstrapRunnerParity/);
assert.match(runner, /origin\/main changed while checks were running/);
assert.match(runner, /for \(const n of \[5, 4, 3, 2, 1\]\)/);
assert.doesNotMatch(runner, /Downloads/i, 'canonical runner must not depend on operator Downloads path');

assert.match(builder, /jweb\.pushzip-authoring\.v1/);
assert.match(builder, /mode must be overlay or exact-release/);
assert.match(builder, /jweb-pushzip-runner\.mjs/);
assert.match(builder, /baseRoot/);
assert.match(builder, /candidateRoot/);
assert.match(builder, /releaseTreeSha256/);
assert.match(builder, /PUSH-.*\\\.cmd/);

assert.match(doctrine, /CRLF checkout broke exact source-string patching/i);
assert.match(doctrine, /inline JavaScript \+ delayed expansion corrupted the launcher/i);
assert.match(doctrine, /undeclared TypeScript dependency blocked a clean push gate/i);
assert.match(doctrine, /broad replacement versus moving-main overlay/i);
assert.match(doctrine, /canonical tooling had drifted behind successful practice/i);
assert.match(readme, /runner v5/i);
assert.match(readme, /built-in applicator/i);
assert.match(readme, /package-builder\.mjs/i);
assert.match(entrypoint, /No inline `node -e` JavaScript/i);
assert.match(entrypoint, /Do not enable delayed expansion/i);
assert.match(entrypoint, /exact bytes/i);
assert.match(entrypoint, /Always give the user the ZIP/i);
assert.match(agents, /If the user asks for a \*\*pushzip\*\*/i);

assert.match(launcher, /setlocal EnableExtensions/);
assert.doesNotMatch(launcher, /EnableDelayedExpansion/i);
assert.doesNotMatch(launcher, /node\s+-e/i);
assert.match(launcher, /%~dp0\./);
assert.match(launcher, /where git/);
assert.match(launcher, /where node/);
assert.match(launcher, /bootstrap\\jweb-pushzip-runner\.mjs/);

console.log('[pushzip-doctrine-selftest] PASS', {
  runner: 'v5',
  default: 'built-in overlay/exact-release',
  windows: 'no inline JS / no delayed expansion / quoted argv',
});
