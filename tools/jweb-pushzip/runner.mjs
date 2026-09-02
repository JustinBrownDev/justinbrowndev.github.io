import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const JWEB_PUSHZIP_RUNNER_SCHEMA = 'jweb.pushzip-runner.v3';

function die(message, work = null, code = 1) {
  console.error(`\n[jweb-pushzip] FAILED / ABORTED: ${message}`);
  if (work) console.error(`[jweb-pushzip] Preserved worktree: ${work}`);
  process.exit(code);
}

function run(command, args, { cwd, inherit = true, encoding = null, maxBuffer = 16 * 1024 * 1024 } = {}) {
  return spawnSync(command, args, {
    cwd,
    stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'],
    encoding: encoding ?? (inherit ? undefined : 'utf8'),
    shell: false,
    maxBuffer,
  });
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

function validateCheckList(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map(normalizeRepoPath);
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
  config.preflightSyntax = validateCheckList(config.preflightSyntax, 'preflightSyntax');
  config.baselineTests = validateCheckList(config.baselineTests, 'baselineTests');
  config.syntax = validateCheckList(config.syntax, 'syntax');
  config.tests = validateCheckList(config.tests, 'tests');
  const seen = new Set();
  const files = manifest.files.map(entry => {
    const repoPath = normalizeRepoPath(entry.path);
    if (seen.has(repoPath)) throw new Error(`duplicate manifest path: ${repoPath}`);
    seen.add(repoPath);
    if (!['payload', 'mutated'].includes(entry.mode)) throw new Error(`${repoPath}: mode must be payload or mutated`);
    if (entry.mode === 'payload' && !/^[0-9a-f]{64}$/i.test(entry.sha256 ?? '')) throw new Error(`${repoPath}: payload sha256 missing`);
    const baseContains = entry.baseContains === undefined ? [] : entry.baseContains;
    if (!Array.isArray(baseContains) || baseContains.some(value => typeof value !== 'string' || !value.length)) {
      throw new Error(`${repoPath}: baseContains must be an array of non-empty strings`);
    }
    if (entry.mode === 'mutated' && !entry.baseBlob && !baseContains.length) {
      throw new Error(`${repoPath}: mutated files require baseBlob or baseContains guards`);
    }
    return { ...entry, path: repoPath, baseContains };
  });
  return { config, files };
}

function verifyBaseGuards(repo, files) {
  for (const entry of files) {
    if (entry.baseBlob) {
      const actual = output('git', ['rev-parse', `HEAD:${entry.path}`], repo);
      if (actual.toLowerCase() !== String(entry.baseBlob).toLowerCase()) {
        throw new Error(`${entry.path}: base blob drifted (expected ${entry.baseBlob}, got ${actual})`);
      }
    }
    if (entry.baseContains?.length) {
      const target = path.join(repo, ...entry.path.split('/'));
      if (!fs.existsSync(target)) throw new Error(`${entry.path}: baseContains target missing`);
      const source = fs.readFileSync(target, 'utf8');
      for (const anchor of entry.baseContains) {
        const count = source.split(anchor).length - 1;
        if (count !== 1) throw new Error(`${entry.path}: base anchor expected exactly once, found ${count}: ${anchor}`);
      }
    }
  }
}

function verifyBootstrapRunnerParity(packageRoot, files) {
  const runnerEntry = files.find(entry => entry.mode === 'payload' && entry.path === 'tools/jweb-pushzip/runner.mjs');
  if (!runnerEntry) return;
  const bootstrap = fileURLToPath(import.meta.url);
  const candidate = path.join(packageRoot, 'payload', 'tools', 'jweb-pushzip', 'runner.mjs');
  if (!fs.existsSync(candidate)) throw new Error('runner upgrade declares payload but candidate runner bytes are missing');
  const bootstrapHash = sha256(bootstrap);
  const candidateHash = sha256(candidate);
  if (bootstrapHash !== candidateHash) {
    throw new Error(`runner upgrade bootstrap/payload fork detected\nBootstrap: ${bootstrapHash}\nPayload:   ${candidateHash}`);
  }
  if (candidateHash !== runnerEntry.sha256) {
    throw new Error(`runner upgrade payload hash does not match manifest: ${candidateHash}`);
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

function normalizeFailureText(text, repo) {
  let value = String(text ?? '').replace(/\x1b\[[0-9;]*m/g, '').replace(/\r\n/g, '\n').replace(/\\/g, '/');
  const normalizedRepo = String(repo ?? '').replace(/\\/g, '/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (normalizedRepo) value = value.replace(new RegExp(normalizedRepo, 'gi'), '<REPO>');
  value = value.replace(/file:\/\/[A-Za-z]:\/[^\s:)]+/g, '<FILE>');
  return value;
}

function failureIssues(text, repo, status) {
  const normalized = normalizeFailureText(text, repo);
  const issues = [];
  for (const raw of normalized.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/^-\s+/.test(line)) issues.push(line.replace(/\s+/g, ' '));
    else if (/^(?:AssertionError|TypeError|ReferenceError|SyntaxError|RangeError|Error)(?:\s+\[[^\]]+\])?:\s+/.test(line)) {
      issues.push(line.replace(/\s+/g, ' '));
    } else if (/^\[[^\]]+\]\s+FAIL(?:\s+\(\d+\))?\s*$/.test(line)) {
      issues.push(line.replace(/\s+/g, ' '));
    }
  }
  const unique = [...new Set(issues)];
  if (unique.length) return unique;
  const digest = crypto.createHash('sha256').update(normalized).digest('hex');
  return [`fallback-exit-${status}:${digest}`];
}

function runCheckList({ repo, label, syntax = [], tests = [] }) {
  const checks = [
    ...syntax.map(file => ({ kind: 'syntax', file, args: ['--check', file] })),
    ...tests.map(file => ({ kind: 'test', file, args: [file] })),
  ];
  const results = new Map();
  console.log(`\n[${label}] Running ${checks.length} checks. Every configured check runs before this phase gets a test-derived verdict.`);
  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];
    const key = `${check.kind}:${check.file}`;
    const target = path.join(repo, ...check.file.split('/'));
    console.log(`\n[${label}] ${i + 1}/${checks.length} ${check.kind.toUpperCase()} ${check.file}`);
    if (!fs.existsSync(target)) {
      const result = { ...check, key, passed: false, status: -1, infrastructureFailure: true, issues: ['missing-file'] };
      results.set(key, result);
      console.error(`[${label}] MISSING ${check.file}`);
      continue;
    }
    const child = run(process.execPath, check.args, { cwd: repo, inherit: false, encoding: 'utf8' });
    if (child.stdout) process.stdout.write(child.stdout);
    if (child.stderr) process.stderr.write(child.stderr);
    const status = child.status ?? -1;
    const infrastructureFailure = Boolean(child.error) || child.status === null;
    const combined = `${child.stdout ?? ''}\n${child.stderr ?? ''}`;
    const result = {
      ...check,
      key,
      passed: status === 0 && !infrastructureFailure,
      status,
      infrastructureFailure,
      reason: child.error?.message ?? null,
      issues: status === 0 && !infrastructureFailure ? [] : failureIssues(combined, repo, status),
    };
    results.set(key, result);
    if (result.passed) console.log(`[${label}] PASS ${check.file}`);
    else console.error(`[${label}] FAIL ${check.file} (exit ${status})${result.reason ? `: ${result.reason}` : ''}`);
  }
  const failed = [...results.values()].filter(item => !item.passed);
  console.log(`\n[${label}] CHECK SUMMARY: ${checks.length - failed.length}/${checks.length} passed`);
  for (const failure of failed) console.error(`  - ${failure.kind}: ${failure.file} (exit ${failure.status})`);
  return results;
}

function resultsForKind(results, kind) {
  return [...results.values()].filter(result => result.kind === kind);
}

function compareBaseline(preResults, postResults, baselineTests, label) {
  const blocking = [];
  const debt = [];
  const improved = [];
  console.log(`\n[${label}] BASELINE DIFFERENTIAL`);
  for (const file of baselineTests) {
    const key = `test:${file}`;
    const pre = preResults.get(key);
    const post = postResults.get(key);
    if (!pre || !post) {
      blocking.push(`${file}: baseline result missing from PRE or POST`);
      continue;
    }
    if (pre.infrastructureFailure || post.infrastructureFailure) {
      blocking.push(`${file}: test infrastructure failure`);
      continue;
    }
    if (pre.passed && post.passed) {
      console.log(`  HEALTHY   ${file}`);
      continue;
    }
    if (pre.passed && !post.passed) {
      blocking.push(`${file}: NEW failure after cut (${post.issues.join(' | ')})`);
      console.error(`  REGRESSED ${file}`);
      continue;
    }
    if (!pre.passed && post.passed) {
      improved.push(`${file}: baseline debt resolved`);
      console.log(`  IMPROVED  ${file}`);
      continue;
    }
    const preSet = new Set(pre.issues);
    const postSet = new Set(post.issues);
    const added = [...postSet].filter(issue => !preSet.has(issue));
    const removed = [...preSet].filter(issue => !postSet.has(issue));
    if (added.length) {
      blocking.push(`${file}: baseline failure worsened/changed; new issue(s): ${added.join(' | ')}`);
      console.error(`  WORSENED  ${file}`);
    } else if (removed.length) {
      improved.push(`${file}: fewer baseline failure assertions remain`);
      debt.push(`${file}: baseline debt remains, but improved`);
      console.log(`  IMPROVED  ${file} (still baseline debt)`);
    } else {
      debt.push(`${file}: unchanged baseline debt`);
      console.warn(`  DEBT      ${file} (unchanged; non-blocking)`);
    }
  }
  return { blocking, debt, improved };
}

function assertWorkingSet(repo, expectedPaths) {
  const result = run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: repo, inherit: false, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'git status failed');
  const actual = [...new Set(parseStatusPaths(result.stdout))].sort();
  const unexpected = actual.filter(item => !expectedPaths.has(item));
  if (unexpected.length) throw new Error(`unexpected working-tree changes:\n  ${unexpected.join('\n  ')}`);
  return actual;
}

function assertTransactionalApplyFailure(repo) {
  const changed = assertWorkingSet(repo, new Set());
  if (changed.length) throw new Error(`apply failed after modifying the worktree; apply scripts must be transactional:\n  ${changed.join('\n  ')}`);
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
  try { verifyBootstrapRunnerParity(packageRoot, files); }
  catch (error) { die(error.message); }
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
    verifyBaseGuards(work, files);
  } catch (error) {
    die(error.message, work);
  }

  const preResults = runCheckList({
    repo: work,
    label: `${label} PRE`,
    syntax: config.preflightSyntax,
    tests: config.baselineTests,
  });
  const preInfrastructure = [...preResults.values()].filter(result => result.infrastructureFailure);
  const preSyntaxFailures = resultsForKind(preResults, 'syntax').filter(result => !result.passed);
  if (preInfrastructure.length || preSyntaxFailures.length) {
    die(`clean-base PRE infrastructure/syntax gate failed after every configured PRE check ran`, work);
  }
  const baselineDebtCount = resultsForKind(preResults, 'test').filter(result => !result.passed).length;
  if (baselineDebtCount) {
    console.warn(`\n[${label}] PRE baseline debt recorded: ${baselineDebtCount}/${config.baselineTests.length} baseline tests currently fail on the pinned clean base. This is evidence, not an automatic blocker.`);
  }

  const applyScript = path.join(packageRoot, ...normalizeRepoPath(config.applyScript).split('/'));
  console.log(`\n[${label}] Applying package payload transactionally...`);
  result = run(process.execPath, [applyScript, work], { cwd: packageRoot, inherit: true });
  if (result.status !== 0) {
    try { assertTransactionalApplyFailure(work); }
    catch (error) { die(`${error.message}\nOriginal apply exit: ${result.status ?? 'unknown'}`, work); }
    die(`payload application failed cleanly after PRE completed (exit ${result.status ?? 'unknown'}); POST is intentionally not run against a nonexistent candidate`, work);
  }

  try {
    verifyPayloadBytes(work, packageRoot, files);
    assertWorkingSet(work, new Set(files.map(entry => entry.path)));
  } catch (error) {
    die(error.message, work);
  }

  const postResults = runCheckList({
    repo: work,
    label: `${label} POST`,
    syntax: config.syntax,
    tests: [...config.baselineTests, ...config.tests],
  });

  const postInfrastructure = [...postResults.values()].filter(result => result.infrastructureFailure);
  const postSyntaxFailures = resultsForKind(postResults, 'syntax').filter(result => !result.passed);
  const requiredFailures = config.tests
    .map(file => postResults.get(`test:${file}`))
    .filter(result => !result || !result.passed);
  const differential = compareBaseline(preResults, postResults, config.baselineTests, label);
  const blockers = [];
  if (postInfrastructure.length) blockers.push(`${postInfrastructure.length} POST infrastructure failures`);
  if (postSyntaxFailures.length) blockers.push(`${postSyntaxFailures.length} POST syntax failures`);
  if (requiredFailures.length) blockers.push(`${requiredFailures.length} required Cut-specific tests failed`);
  blockers.push(...differential.blocking);
  if (blockers.length) {
    console.error(`\n[${label}] BLOCKING POST VERDICT:`);
    for (const blocker of blockers) console.error(`  - ${blocker}`);
    die(`${blockers.length} blocking POST condition(s) after every configured POST check ran`, work);
  }
  if (differential.debt.length) {
    console.warn(`\n[${label}] NON-BLOCKING BASELINE DEBT:`);
    for (const item of differential.debt) console.warn(`  - ${item}`);
  }

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

  console.log(`\n[${label}] Differential gate passed. Ctrl+C is the only abort during countdown.`);
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
