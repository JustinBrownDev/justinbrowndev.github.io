import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const JWEB_PUSHZIP_RUNNER_SCHEMA = 'jweb.pushzip-runner.v1';

function die(message, work = null, code = 1) {
  console.error(`\n[jweb-pushzip] FAILED / ABORTED: ${message}`);
  if (work) console.error(`[jweb-pushzip] Preserved worktree: ${work}`);
  process.exit(code);
}

function run(command, args, { cwd, inherit = true, encoding = null } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    encoding: encoding ?? (inherit ? undefined : 'utf8'),
    shell: false,
  });
  return result;
}

function output(command, args, cwd) {
  const result = run(command, args, { cwd, inherit: false, encoding: 'utf8' });
  if (result.status !== 0) throw new Error((result.stderr || result.stdout || `${command} failed`).trim());
  return String(result.stdout ?? '').trim();
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function readJson(file, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`${label} unreadable: ${error.message}`); }
}

function normalizeRepoPath(value) {
  const rel = String(value ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel || rel.includes('..') || path.isAbsolute(rel)) throw new Error(`unsafe manifest path: ${value}`);
  return rel;
}

function parseStatusPaths(text) {
  return String(text ?? '').split('\0').filter(Boolean).map(entry => {
    const body = entry.length >= 3 ? entry.slice(3) : entry;
    const arrow = body.lastIndexOf(' -> ');
    return normalizeRepoPath(arrow >= 0 ? body.slice(arrow + 4) : body);
  });
}

function validatePackage(packageRoot) {
  const configPath = path.join(packageRoot, 'manifest', 'pushzip.json');
  const filesPath = path.join(packageRoot, 'manifest', 'files.json');
  const config = readJson(configPath, 'pushzip config');
  const manifest = readJson(filesPath, 'file manifest');
  if (config.schema !== 'jweb.pushzip-package.v1') throw new Error(`unsupported package schema: ${config.schema}`);
  if (manifest.schema !== 'jweb.pushzip-files.v1' || !Array.isArray(manifest.files) || !manifest.files.length) {
    throw new Error('file manifest is missing or empty');
  }
  if (!/^[0-9a-f]{40}$/i.test(config.expectedSha ?? '')) throw new Error('expectedSha must be a 40-character commit SHA');
  const seen = new Set();
  const files = manifest.files.map(entry => {
    const repoPath = normalizeRepoPath(entry.path);
    if (seen.has(repoPath)) throw new Error(`duplicate manifest path: ${repoPath}`);
    seen.add(repoPath);
    if (!['payload', 'mutated'].includes(entry.mode)) throw new Error(`${repoPath}: mode must be payload or mutated`);
    if (entry.mode === 'payload' && !/^[0-9a-f]{64}$/i.test(entry.sha256 ?? '')) throw new Error(`${repoPath}: payload sha256 missing`);
    return { ...entry, path: repoPath };
  });
  return { config, files };
}

function verifyBaseBlobs(repo, files) {
  for (const entry of files) {
    if (!entry.baseBlob) continue;
    const actual = output('git', ['rev-parse', `HEAD:${entry.path}`], repo);
    if (actual.toLowerCase() !== String(entry.baseBlob).toLowerCase()) {
      throw new Error(`${entry.path}: base blob drifted (expected ${entry.baseBlob}, got ${actual})`);
    }
  }
}

function verifyPayloadBytes(repo, packageRoot, files) {
  for (const entry of files.filter(item => item.mode === 'payload')) {
    const packaged = path.join(packageRoot, 'payload', ...entry.path.split('/'));
    const working = path.join(repo, ...entry.path.split('/'));
    if (!fs.existsSync(packaged)) throw new Error(`${entry.path}: packaged payload missing`);
    if (!fs.existsSync(working)) throw new Error(`${entry.path}: applied working file missing`);
    const packageHash = sha256(packaged);
    const workingHash = sha256(working);
    if (packageHash !== entry.sha256) throw new Error(`${entry.path}: manifest hash does not match packaged bytes`);
    if (workingHash !== entry.sha256) throw new Error(`${entry.path}: applied bytes do not match packaged payload`);
  }
}

export function runAllChecks({ repo, label, syntax = [], tests = [] }) {
  const failures = [];
  const checks = [
    ...syntax.map(file => ({ kind: 'syntax', label: `node --check ${file}`, file, args: ['--check', file] })),
    ...tests.map(file => ({ kind: 'test', label: `node ${file}`, file, args: [file] })),
  ];
  console.log(`\n[${label}] Running ${checks.length} checks. Failures are accumulated; abort happens only after the final check.`);
  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];
    const target = path.join(repo, ...check.file.split('/'));
    console.log(`\n[${label}] ${i + 1}/${checks.length} ${check.kind.toUpperCase()} ${check.file}`);
    if (!fs.existsSync(target)) {
      failures.push({ ...check, status: -1, reason: 'missing file' });
      console.error(`[${label}] MISSING ${check.file}`);
      continue;
    }
    const result = run(process.execPath, check.args, { cwd: repo, inherit: true });
    if (result.status !== 0) {
      failures.push({ ...check, status: result.status ?? -1, reason: result.error?.message ?? null });
      console.error(`[${label}] FAIL ${check.file} (exit ${result.status ?? 'unknown'})`);
    } else {
      console.log(`[${label}] PASS ${check.file}`);
    }
  }
  console.log(`\n[${label}] CHECK SUMMARY: ${checks.length - failures.length}/${checks.length} passed`);
  for (const failure of failures) {
    console.error(`  - ${failure.kind}: ${failure.file} (exit ${failure.status})${failure.reason ? `: ${failure.reason}` : ''}`);
  }
  return failures;
}

function assertWorkingSet(repo, expectedPaths) {
  const result = run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: repo, inherit: false, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'git status failed');
  const actual = [...new Set(parseStatusPaths(result.stdout))].sort();
  const unexpected = actual.filter(item => !expectedPaths.has(item));
  if (unexpected.length) throw new Error(`unexpected working-tree changes:\n  ${unexpected.join('\n  ')}`);
}

function stageAndValidate(repo, files) {
  const expected = files.map(entry => entry.path).sort();
  const add = run('git', ['add', '-f', '--', ...expected], { cwd: repo, inherit: true });
  if (add.status !== 0) throw new Error('git add -f failed');
  const stagedRaw = output('git', ['diff', '--cached', '--name-only', '-z'], repo);
  const actual = stagedRaw.split('\0').filter(Boolean).map(normalizeRepoPath).sort();
  if (actual.length !== expected.length || actual.some((item, index) => item !== expected[index])) {
    throw new Error(`staged allowlist mismatch\nExpected:\n  ${expected.join('\n  ')}\nActual:\n  ${actual.join('\n  ')}`);
  }
  const diffCheck = run('git', ['diff', '--cached', '--check'], { cwd: repo, inherit: true });
  if (diffCheck.status !== 0) throw new Error('git diff --cached --check failed');
  return actual;
}

function sleepSecond() {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
}

function resolvePackageRootArg(value) {
  // Windows CommandLineToArgvW-style parsing can leave a literal terminal quote
  // when a quoted argument ends in a backslash (for example a raw %~dp0 value).
  // New launchers avoid that shape, but keep the runner tolerant of old packages.
  let raw = String(value ?? process.cwd()).trim();
  raw = raw.replace(/^"+|"+$/g, '');
  return path.resolve(raw || process.cwd());
}

async function main() {
  const packageRoot = resolvePackageRootArg(process.argv[2]);
  let packageData;
  try { packageData = validatePackage(packageRoot); }
  catch (error) { die(error.message); }
  const { config, files } = packageData;
  const label = config.label ?? 'JWEB';
  const workParent = path.join(packageRoot, 'work');
  fs.mkdirSync(workParent, { recursive: true });
  const work = path.join(workParent, `repo-${process.pid}-${crypto.randomBytes(3).toString('hex')}`);

  console.log(`[${label}] Runner: ${JWEB_PUSHZIP_RUNNER_SCHEMA}`);
  console.log(`[${label}] Fresh clone: ${work}`);
  let result = run('git', ['clone', '--quiet', '--branch', 'main', '--single-branch', config.repoUrl, work], { inherit: true });
  if (result.status !== 0) die('fresh clone failed', work);

  try {
    const head = output('git', ['rev-parse', 'HEAD'], work);
    if (head.toLowerCase() !== config.expectedSha.toLowerCase()) {
      throw new Error(`origin/main moved before package execution\nExpected: ${config.expectedSha}\nActual:   ${head}`);
    }
    console.log(`[${label}] Pinned head confirmed: ${head}`);
    const cname = fs.readFileSync(path.join(work, 'CNAME'), 'utf8').replace(/\r/g, '');
    if (cname !== 'jweb.dev' && cname !== 'jweb.dev\n') throw new Error('CNAME must be exactly jweb.dev');
    console.log(`[${label}] CNAME confirmed: jweb.dev`);
    verifyBaseBlobs(work, files);
  } catch (error) {
    die(error.message, work);
  }

  const applyScript = path.join(packageRoot, ...normalizeRepoPath(config.applyScript).split('/'));
  console.log(`\n[${label}] Applying package payload...`);
  result = run(process.execPath, [applyScript, work], { cwd: packageRoot, inherit: true });
  if (result.status !== 0) die('payload application failed; tests cannot safely run against a partial patch', work);

  try {
    verifyPayloadBytes(work, packageRoot, files);
    assertWorkingSet(work, new Set(files.map(entry => entry.path)));
  } catch (error) {
    die(error.message, work);
  }

  const failures = runAllChecks({ repo: work, label, syntax: config.syntax ?? [], tests: config.tests ?? [] });
  if (failures.length) die(`${failures.length} checks failed after the complete test list ran`, work);

  let staged;
  try {
    assertWorkingSet(work, new Set(files.map(entry => entry.path)));
    staged = stageAndValidate(work, files);
  } catch (error) {
    die(error.message, work);
  }

  console.log(`\n[${label}] Exact staged payload:`);
  for (const file of staged) console.log(`  ${file}`);
  console.log(`[${label}] Commit: ${config.commitMessage}`);

  console.log(`\n[${label}] Re-reading remote main before commit/push...`);
  result = run('git', ['fetch', '--quiet', 'origin', 'main'], { cwd: work, inherit: true });
  if (result.status !== 0) die('remote main fetch failed', work);
  const remote = output('git', ['rev-parse', 'origin/main'], work);
  if (remote.toLowerCase() !== config.expectedSha.toLowerCase()) {
    die(`origin/main changed while checks were running\nExpected: ${config.expectedSha}\nActual:   ${remote}`, work);
  }

  console.log(`\n[${label}] All checks passed. Ctrl+C is the only abort during countdown.`);
  for (const n of [5, 4, 3, 2, 1]) {
    console.log(`[${label}] pushing in ${n}...`);
    sleepSecond();
  }

  result = run('git', ['commit', '-m', config.commitMessage], { cwd: work, inherit: true });
  if (result.status !== 0) die('git commit failed', work);
  result = run('git', ['push', 'origin', 'HEAD:main'], { cwd: work, inherit: true });
  if (result.status !== 0) die('git push failed', work);
  const newSha = output('git', ['rev-parse', 'HEAD'], work);
  console.log(`\n[${label}] PUSHED: ${newSha}`);
  console.log(`[${label}] Commit: ${config.commitMessage}`);
  for (const line of config.successNotes ?? []) console.log(`[${label}] ${line}`);
  console.log(`[${label}] Worktree retained at: ${work}`);
}

main().catch(error => die(error?.stack || error?.message || String(error)));
