import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const harness = path.resolve(here, '..');
const repo = path.resolve(harness, '../..');

const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const full = path.join(dir, entry.name);
  if (entry.isDirectory()) return walk(full);
  return [full];
});

const scripts = walk(harness).filter(file => /\.(?:js|mjs)$/i.test(file));
for (const file of scripts) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(check.status, 0, `syntax check failed: ${path.relative(repo, file)}\n${check.stderr || check.stdout}`);
}

const runtime = fs.readFileSync(path.join(harness, 'runtime-visual-probe.js'), 'utf8');
const specimen = fs.readFileSync(path.join(harness, 'specimen.js'), 'utf8');
const generator = fs.readFileSync(path.join(harness, 'jweb-generator-adapter.js'), 'utf8');
const integration = fs.readFileSync(path.join(harness, 'INTEGRATION.md'), 'utf8');

assert.doesNotMatch(runtime, /(?:from\s+['"]|import\s*\(\s*['"])[^'"]*main\.js/, 'runtime probe must not import main.js');
assert.doesNotMatch(specimen, /(?:from\s+['"]|import\s*\(\s*['"])[^'"]*main\.js/, 'specimen mode must not import main.js');
assert.match(generator, /kowloon-fabric-engine\.js/, 'generator specimen bridge must remain explicit and narrow');
assert.match(generator, /world-contract\.js/, 'generator specimen bridge must use deterministic world helpers');
assert.match(integration, /intentionally does not modify `main\.js`/i, 'integration guide must state the parked cut is runtime-inert');

const mainPath = path.join(repo, 'main.js');
const mainMentionsHarness = fs.existsSync(mainPath) && fs.readFileSync(mainPath, 'utf8').includes('tools/visual-harness');
console.log(JSON.stringify({
  pass: true,
  syntaxChecked: scripts.length,
  mainMentionsHarness,
  note: mainMentionsHarness
    ? 'current repo already references visual-harness; this test does not mutate or judge that host state'
    : 'current repo does not reference visual-harness; parked tool remains unhooked from normal boot',
}, null, 2));
