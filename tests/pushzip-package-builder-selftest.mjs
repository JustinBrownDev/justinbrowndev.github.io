import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildPackage } from '../tools/jweb-pushzip/package-builder.mjs';
import { applyBuiltInPackage, validatePackage, verifyPackageOnly } from '../tools/jweb-pushzip/runner.mjs';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'jweb pushzip selftest '));
const base = path.join(temp, 'base tree');
const candidate = path.join(temp, 'candidate tree');
const out = path.join(temp, 'output packages');
fs.mkdirSync(path.join(base, 'tools', 'jweb-pushzip'), { recursive: true });
fs.mkdirSync(path.join(candidate, 'tools', 'jweb-pushzip'), { recursive: true });
for (const root of [base, candidate]) {
  fs.writeFileSync(path.join(root, 'CNAME'), 'jweb.dev');
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
  fs.writeFileSync(path.join(root, 'main.js'), 'export const base = true;\n');
}
const runnerBytes = fs.readFileSync(new URL('../tools/jweb-pushzip/runner.mjs', import.meta.url));
fs.writeFileSync(path.join(base, 'tools', 'jweb-pushzip', 'runner.mjs'), runnerBytes);
fs.writeFileSync(path.join(candidate, 'tools', 'jweb-pushzip', 'runner.mjs'), runnerBytes);
fs.writeFileSync(path.join(base, 'old.txt'), 'remove me\r\n');
fs.writeFileSync(path.join(candidate, 'main.js'), 'export const base = false;\r\n');
fs.writeFileSync(path.join(candidate, 'new.txt'), 'new\r\n');

const specPath = path.join(temp, 'overlay-spec.json');
fs.writeFileSync(specPath, JSON.stringify({
  schema: 'jweb.pushzip-authoring.v1',
  name: 'JWEB-SELFTEST-R1-SINGLEFILE',
  launcher: 'PUSH-JWEB-SELFTEST.cmd',
  label: 'JWEB SELFTEST',
  mode: 'overlay',
  expectedSha: '0123456789abcdef0123456789abcdef01234567',
  baseRoot: './base tree',
  candidateRoot: './candidate tree',
  copy: ['main.js', 'new.txt'],
  delete: ['old.txt'],
  commitMessage: 'test: pushzip builder',
  protectedPrefixes: ['tools/visual-harness/'],
}, null, 2));

const packageRoot = buildPackage({ specPath, outRoot: out });
const { config, files } = validatePackage(packageRoot);
assert.equal(config.applyMode, 'overlay');
assert.deepEqual(files.map(x => [x.path, x.operation]), [['main.js', 'copy'], ['new.txt', 'copy'], ['old.txt', 'delete']]);
assert.equal(verifyPackageOnly(packageRoot).files.length, 3);
const launcher = fs.readFileSync(path.join(packageRoot, 'PUSH-JWEB-SELFTEST.cmd'), 'utf8');
assert.ok(!/EnableDelayedExpansion/i.test(launcher));
assert.ok(!/node\s+-e/i.test(launcher));

const work = path.join(temp, 'work tree with spaces');
fs.cpSync(base, work, { recursive: true });
applyBuiltInPackage({ packageRoot, work, config, files });
assert.equal(fs.readFileSync(path.join(work, 'main.js'), 'utf8'), 'export const base = false;\r\n');
assert.equal(fs.readFileSync(path.join(work, 'new.txt'), 'utf8'), 'new\r\n');
assert.equal(fs.existsSync(path.join(work, 'old.txt')), false);
assert.equal(fs.readFileSync(path.join(work, 'CNAME'), 'utf8'), 'jweb.dev');


// Rollback contract: if a later copy fails verification, earlier writes are restored.
const rollbackWork = path.join(temp, 'rollback work');
fs.cpSync(base, rollbackWork, { recursive: true });
const tamperedPackage = path.join(temp, 'tampered package');
fs.cpSync(packageRoot, tamperedPackage, { recursive: true });
fs.writeFileSync(path.join(tamperedPackage, 'payload', 'new.txt'), 'tampered');
assert.throws(() => applyBuiltInPackage({ packageRoot: tamperedPackage, work: rollbackWork, config, files }), /copy verification failed/);
assert.equal(fs.readFileSync(path.join(rollbackWork, 'main.js'), 'utf8'), 'export const base = true;\n');
assert.equal(fs.existsSync(path.join(rollbackWork, 'new.txt')), false);
assert.equal(fs.readFileSync(path.join(rollbackWork, 'old.txt'), 'utf8'), 'remove me\r\n');

// Exact-release is built from the same base/candidate pair and carries a full release tree plus exact changed-path manifest.
const exactSpec = path.join(temp, 'exact-spec.json');
fs.writeFileSync(exactSpec, JSON.stringify({
  schema: 'jweb.pushzip-authoring.v1', name: 'JWEB-EXACT-R1-SINGLEFILE', launcher: 'PUSH-JWEB-EXACT.cmd', label: 'JWEB EXACT',
  mode: 'exact-release', expectedSha: '0123456789abcdef0123456789abcdef01234567', baseRoot: './base tree', candidateRoot: './candidate tree',
  commitMessage: 'test: exact release'
}, null, 2));
const exactRoot = buildPackage({ specPath: exactSpec, outRoot: out });
const exactData = verifyPackageOnly(exactRoot);
assert.equal(exactData.config.applyMode, 'exact-release');
const exactWork = path.join(temp, 'exact work');
fs.cpSync(base, exactWork, { recursive: true });
fs.mkdirSync(path.join(exactWork, '.git'));
applyBuiltInPackage({ packageRoot: exactRoot, work: exactWork, ...exactData });
assert.equal(fs.readFileSync(path.join(exactWork, 'main.js'), 'utf8'), 'export const base = false;\r\n');
assert.equal(fs.existsSync(path.join(exactWork, 'old.txt')), false);
assert.equal(fs.existsSync(path.join(exactWork, '.git')), true);

const badCname = path.join(temp, 'bad-cname');
fs.writeFileSync(badCname, 'jweb.dev\n');
assert.throws(() => {
  const badCandidate = path.join(temp, 'bad candidate');
  fs.cpSync(candidate, badCandidate, { recursive: true });
  fs.copyFileSync(badCname, path.join(badCandidate, 'CNAME'));
  const badSpec = path.join(temp, 'bad.json');
  fs.writeFileSync(badSpec, JSON.stringify({
    schema: 'jweb.pushzip-authoring.v1', name: 'BAD', launcher: 'PUSH-BAD.cmd', mode: 'overlay',
    expectedSha: '0123456789abcdef0123456789abcdef01234567', baseRoot: './base tree', candidateRoot: './bad candidate',
    copy: ['main.js'], delete: [], commitMessage: 'bad'
  }));
  buildPackage({ specPath: badSpec, outRoot: out });
}, /CNAME must be exact bytes/);

console.log('[pushzip-package-builder-selftest] PASS', { temp, operations: files.length, spaces: true, crlfPayload: true });
