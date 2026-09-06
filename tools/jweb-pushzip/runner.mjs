import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const JWEB_PUSHZIP_RUNNER_SCHEMA = 'jweb.pushzip-runner.v5';
const PACKAGE_SCHEMA_V1 = 'jweb.pushzip-package.v1';
const PACKAGE_SCHEMA_V2 = 'jweb.pushzip-package.v2';
const FILES_SCHEMA_V1 = 'jweb.pushzip-files.v1';
const FILES_SCHEMA_V2 = 'jweb.pushzip-files.v2';
const EXACT_CNAME = Buffer.from('jweb.dev');

function die(message, work = null, code = 1) {
  console.error(`\n[jweb-pushzip] FAILED / ABORTED: ${message}`);
  if (work) console.error(`[jweb-pushzip] Preserved worktree: ${work}`);
  process.exit(code);
}

function run(command, args, { cwd, inherit = true, encoding = null, maxBuffer = 32 * 1024 * 1024 } = {}) {
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

export function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function gitBlobShaFromBytes(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`);
  return crypto.createHash('sha1').update(header).update(bytes).digest('hex');
}

function readJson(file, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error(`${label} unreadable: ${error.message}`); }
}

export function normalizeRepoPath(value) {
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

function validatePrefixList(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map(item => {
    const normalized = normalizeRepoPath(item);
    return normalized.endsWith('/') ? normalized : `${normalized}/`;
  });
}

export function verifyCnameExact(file) {
  const actual = fs.readFileSync(file);
  if (!actual.equals(EXACT_CNAME)) {
    throw new Error(`CNAME must be exact bytes "jweb.dev" with no newline: ${file} (got ${JSON.stringify(actual.toString())})`);
  }
}

function collectFiles(root, dir = root, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' && dir === root) continue;
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`symlink not permitted in packaged tree: ${full}`);
    if (entry.isDirectory()) collectFiles(root, full, out);
    else if (entry.isFile()) out.push(normalizeRepoPath(path.relative(root, full)));
    else throw new Error(`unsupported packaged entry: ${full}`);
  }
  return out.sort();
}

export function treeDigest(root) {
  const hash = crypto.createHash('sha256');
  for (const rel of collectFiles(root)) {
    const bytes = fs.readFileSync(path.join(root, ...rel.split('/')));
    hash.update(Buffer.from(`${rel}\0${bytes.length}\0`));
    hash.update(bytes);
  }
  return hash.digest('hex');
}

function validateV1(config, manifest) {
  if (manifest.schema !== FILES_SCHEMA_V1 || !Array.isArray(manifest.files) || !manifest.files.length) {
    throw new Error('legacy file manifest is missing or empty');
  }
  if (config.applicatorAudit !== true) {
    throw new Error('legacy schema requires applicatorAudit=true; custom applicators must prove their complete mutation plan before PRE');
  }
  config.applyMode = 'legacy-applicator';
  config.applyScript = normalizeRepoPath(config.applyScript);
  const seen = new Set();
  const files = manifest.files.map(entry => {
    const repoPath = normalizeRepoPath(entry.path);
    if (seen.has(repoPath)) throw new Error(`duplicate manifest path: ${repoPath}`);
    seen.add(repoPath);
    if (!['payload', 'mutated'].includes(entry.mode)) throw new Error(`${repoPath}: mode must be payload or mutated`);
    if (entry.mode === 'payload' && !/^[0-9a-f]{64}$/i.test(entry.sha256 ?? '')) throw new Error(`${repoPath}: payload sha256 missing`);
    if (entry.baseBlob !== undefined && !/^[0-9a-f]{40}$/i.test(entry.baseBlob)) throw new Error(`${repoPath}: baseBlob must be a 40-character blob SHA`);
    const baseContains = entry.baseContains === undefined ? [] : entry.baseContains;
    if (!Array.isArray(baseContains) || baseContains.some(value => typeof value !== 'string' || !value.length)) {
      throw new Error(`${repoPath}: baseContains must be an array of non-empty strings`);
    }
    if (entry.mode === 'mutated' && !entry.baseBlob && !baseContains.length) {
      throw new Error(`${repoPath}: mutated files require baseBlob or baseContains guards`);
    }
    return { ...entry, path: repoPath, baseContains, operation: entry.mode === 'payload' ? 'copy' : 'legacy-mutated' };
  });
  return files;
}

function validateV2(config, manifest) {
  if (manifest.schema !== FILES_SCHEMA_V2 || !Array.isArray(manifest.files) || !manifest.files.length) {
    throw new Error('v2 file manifest is missing or empty');
  }
  if (!['overlay', 'exact-release'].includes(config.applyMode)) {
    throw new Error('v2 applyMode must be overlay or exact-release');
  }
  if (config.applyScript !== undefined || config.applicatorAudit !== undefined) {
    throw new Error('v2 packages use the built-in applicator; do not specify applyScript/applicatorAudit');
  }
  if (config.applyMode === 'exact-release' && !/^[0-9a-f]{64}$/i.test(config.releaseTreeSha256 ?? '')) {
    throw new Error('exact-release packages require releaseTreeSha256');
  }
  const seen = new Set();
  return manifest.files.map(entry => {
    const repoPath = normalizeRepoPath(entry.path);
    if (seen.has(repoPath)) throw new Error(`duplicate manifest path: ${repoPath}`);
    seen.add(repoPath);
    if (!['copy', 'delete'].includes(entry.operation)) throw new Error(`${repoPath}: operation must be copy or delete`);
    if (entry.operation === 'copy' && !/^[0-9a-f]{64}$/i.test(entry.sha256 ?? '')) throw new Error(`${repoPath}: copy sha256 missing`);
    if (entry.operation === 'delete' && entry.sha256 !== undefined) throw new Error(`${repoPath}: delete entries must not declare sha256`);
    if (entry.baseBlob !== undefined && !/^[0-9a-f]{40}$/i.test(entry.baseBlob)) throw new Error(`${repoPath}: baseBlob must be a 40-character blob SHA`);
    if (entry.baseAbsent !== undefined && entry.baseAbsent !== true) throw new Error(`${repoPath}: baseAbsent may only be true`);
    if (entry.baseBlob && entry.baseAbsent) throw new Error(`${repoPath}: choose baseBlob or baseAbsent, not both`);
    if (!entry.baseBlob && !entry.baseAbsent) throw new Error(`${repoPath}: v2 entries require baseBlob for existing files or baseAbsent=true for additions`);
    if (entry.operation === 'delete' && entry.baseAbsent) throw new Error(`${repoPath}: cannot delete a path declared absent on base`);
    return { ...entry, path: repoPath };
  });
}

export function validatePackage(packageRoot) {
  const configPath = path.join(packageRoot, 'manifest', 'pushzip.json');
  const filesPath = path.join(packageRoot, 'manifest', 'files.json');
  const config = readJson(configPath, 'pushzip config');
  const manifest = readJson(filesPath, 'file manifest');
  if (![PACKAGE_SCHEMA_V1, PACKAGE_SCHEMA_V2].includes(config.schema)) throw new Error(`unsupported package schema: ${config.schema}`);
  if (!/^[0-9a-f]{40}$/i.test(config.expectedSha ?? '')) throw new Error('expectedSha must be a 40-character commit SHA');
  if (!config.repoUrl || typeof config.repoUrl !== 'string') throw new Error('repoUrl is required');
  if (!config.commitMessage || typeof config.commitMessage !== 'string') throw new Error('commitMessage is required');
  config.preflightSyntax = validateCheckList(config.preflightSyntax, 'preflightSyntax');
  config.baselineTests = validateCheckList(config.baselineTests, 'baselineTests');
  config.syntax = validateCheckList(config.syntax, 'syntax');
  config.tests = validateCheckList(config.tests, 'tests');
  config.protectedPrefixes = validatePrefixList(config.protectedPrefixes, 'protectedPrefixes');
  const files = config.schema === PACKAGE_SCHEMA_V1 ? validateV1(config, manifest) : validateV2(config, manifest);
  const allowed = new Set(files.map(entry => entry.path));
  for (const prefix of config.protectedPrefixes) {
    const violation = [...allowed].find(rel => rel.startsWith(prefix));
    if (violation) throw new Error(`protected prefix ${prefix} overlaps manifest path ${violation}`);
  }
  return { config, files };
}

function packagePayloadRoot(packageRoot, config) {
  return path.join(packageRoot, config.applyMode === 'exact-release' ? 'release' : 'payload');
}

function verifyPackagedBytes(packageRoot, config, files) {
  if (config.schema === PACKAGE_SCHEMA_V1) {
    for (const entry of files.filter(item => item.mode === 'payload')) {
      const packaged = path.join(packageRoot, 'payload', ...entry.path.split('/'));
      if (!fs.existsSync(packaged)) throw new Error(`${entry.path}: packaged payload missing before clone`);
      const actual = sha256File(packaged);
      if (actual !== entry.sha256) throw new Error(`${entry.path}: packaged payload hash mismatch before clone (manifest ${entry.sha256}, actual ${actual})`);
    }
    return;
  }
  const root = packagePayloadRoot(packageRoot, config);
  if (config.applyMode === 'exact-release') {
    if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('exact-release package is missing release/index.html');
    verifyCnameExact(path.join(root, 'CNAME'));
    const digest = treeDigest(root);
    if (digest !== config.releaseTreeSha256) throw new Error(`release tree hash mismatch (manifest ${config.releaseTreeSha256}, actual ${digest})`);
  }
  for (const entry of files.filter(item => item.operation === 'copy')) {
    const packaged = path.join(root, ...entry.path.split('/'));
    if (!fs.existsSync(packaged)) throw new Error(`${entry.path}: packaged copy source missing`);
    const actual = sha256File(packaged);
    if (actual !== entry.sha256) throw new Error(`${entry.path}: packaged copy hash mismatch (manifest ${entry.sha256}, actual ${actual})`);
  }
  const cnameEntry = files.find(entry => entry.path === 'CNAME');
  if (cnameEntry?.operation === 'delete') throw new Error('CNAME may not be deleted');
  if (cnameEntry?.operation === 'copy') verifyCnameExact(path.join(root, 'CNAME'));
}

function verifyBootstrapRunnerParity(packageRoot, config, files) {
  const runnerEntry = files.find(entry => entry.operation === 'copy' && entry.path === 'tools/jweb-pushzip/runner.mjs');
  if (!runnerEntry) return;
  const bootstrap = fileURLToPath(import.meta.url);
  const candidate = path.join(packagePayloadRoot(packageRoot, config), 'tools', 'jweb-pushzip', 'runner.mjs');
  if (!fs.existsSync(candidate)) throw new Error('runner upgrade declares payload but candidate runner bytes are missing');
  const bootstrapHash = sha256File(bootstrap);
  const candidateHash = sha256File(candidate);
  if (bootstrapHash !== candidateHash) {
    throw new Error(`runner upgrade bootstrap/payload fork detected\nBootstrap: ${bootstrapHash}\nPayload:   ${candidateHash}`);
  }
  if (candidateHash !== runnerEntry.sha256) throw new Error(`runner upgrade payload hash does not match manifest: ${candidateHash}`);
}

function gitPathExists(repo, spec) {
  const result = run('git', ['cat-file', '-e', spec], { cwd: repo, inherit: false, encoding: 'utf8' });
  return result.status === 0;
}

function verifyBaseGuards(repo, files) {
  for (const entry of files) {
    if (entry.baseBlob) {
      const actual = output('git', ['rev-parse', `HEAD:${entry.path}`], repo);
      if (actual.toLowerCase() !== String(entry.baseBlob).toLowerCase()) {
        throw new Error(`${entry.path}: base blob drifted (expected ${entry.baseBlob}, got ${actual})`);
      }
    }
    if (entry.baseAbsent && gitPathExists(repo, `HEAD:${entry.path}`)) {
      throw new Error(`${entry.path}: expected to be absent on pinned base`);
    }
    if (entry.baseContains?.length) {
      const target = path.join(repo, ...entry.path.split('/'));
      if (!fs.existsSync(target)) throw new Error(`${entry.path}: baseContains target missing`);
      const source = fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n');
      for (const rawAnchor of entry.baseContains) {
        const anchor = rawAnchor.replace(/\r\n/g, '\n');
        const count = source.split(anchor).length - 1;
        if (count !== 1) throw new Error(`${entry.path}: normalized base anchor expected exactly once, found ${count}: ${rawAnchor}`);
      }
    }
  }
}

function verifyAppliedBytes(repo, packageRoot, config, files) {
  const root = packagePayloadRoot(packageRoot, config);
  for (const entry of files) {
    const working = path.join(repo, ...entry.path.split('/'));
    if (entry.operation === 'delete') {
      if (fs.existsSync(working)) throw new Error(`${entry.path}: deletion target still exists after apply`);
      continue;
    }
    if (entry.operation === 'legacy-mutated') continue;
    const packaged = path.join(root, ...entry.path.split('/'));
    if (!fs.existsSync(working)) throw new Error(`${entry.path}: applied working file missing`);
    if (sha256File(packaged) !== entry.sha256) throw new Error(`${entry.path}: manifest hash does not match packaged bytes`);
    if (sha256File(working) !== entry.sha256) throw new Error(`${entry.path}: applied bytes do not match packaged payload`);
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
    else if (/^(?:AssertionError|TypeError|ReferenceError|SyntaxError|RangeError|Error)(?:\s+\[[^\]]+\])?:\s+/.test(line)) issues.push(line.replace(/\s+/g, ' '));
    else if (/^\[[^\]]+\]\s+FAIL(?:\s+\(\d+\))?\s*$/.test(line)) issues.push(line.replace(/\s+/g, ' '));
  }
  const unique = [...new Set(issues)];
  if (unique.length) return unique;
  const digest = crypto.createHash('sha256').update(normalized).digest('hex');
  return [`fallback-exit-${status}:${digest}`];
}

function uniqueChecks(syntax, tests) {
  const out = [];
  const seen = new Set();
  for (const check of [
    ...syntax.map(file => ({ kind: 'syntax', file, args: ['--check', file] })),
    ...tests.map(file => ({ kind: 'test', file, args: [file] })),
  ]) {
    const key = `${check.kind}:${check.file}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...check, key });
  }
  return out;
}

function runCheckList({ repo, label, syntax = [], tests = [] }) {
  const checks = uniqueChecks(syntax, tests);
  const results = new Map();
  console.log(`\n[${label}] Running ${checks.length} checks. Every configured check runs before this phase gets a test-derived verdict.`);
  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];
    const target = path.join(repo, ...check.file.split('/'));
    console.log(`\n[${label}] ${i + 1}/${checks.length} ${check.kind.toUpperCase()} ${check.file}`);
    if (!fs.existsSync(target)) {
      const result = { ...check, passed: false, status: -1, infrastructureFailure: true, issues: ['missing-file'] };
      results.set(check.key, result);
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
      passed: status === 0 && !infrastructureFailure,
      status,
      infrastructureFailure,
      reason: child.error?.message ?? null,
      issues: status === 0 && !infrastructureFailure ? [] : failureIssues(combined, repo, status),
    };
    results.set(check.key, result);
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

function assertProtectedPaths(actualPaths, prefixes) {
  for (const rel of actualPaths) {
    const hit = prefixes.find(prefix => rel.startsWith(prefix));
    if (hit) throw new Error(`protected path changed: ${rel} (prefix ${hit})`);
  }
}

function assertWorkingSet(repo, expectedPaths, protectedPrefixes = []) {
  const result = run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: repo, inherit: false, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'git status failed');
  const actual = [...new Set(parseStatusPaths(result.stdout))].sort();
  const unexpected = actual.filter(item => !expectedPaths.has(item));
  if (unexpected.length) throw new Error(`unexpected working-tree changes:\n  ${unexpected.join('\n  ')}`);
  assertProtectedPaths(actual, protectedPrefixes);
  return actual;
}

function assertTransactionalApplyFailure(repo, protectedPrefixes = []) {
  const changed = assertWorkingSet(repo, new Set(), protectedPrefixes);
  if (changed.length) throw new Error(`apply failed after modifying the worktree; apply scripts must be transactional:\n  ${changed.join('\n  ')}`);
}

function runLegacyApplicatorAudit({ packageRoot, work, config }) {
  const applyScript = path.join(packageRoot, ...config.applyScript.split('/'));
  if (!fs.existsSync(applyScript)) throw new Error(`apply script missing: ${config.applyScript}`);
  const syntax = run(process.execPath, ['--check', applyScript], { cwd: packageRoot, inherit: false, encoding: 'utf8' });
  if (syntax.status !== 0) throw new Error(`apply script syntax failed before clone audit:\n${syntax.stderr || syntax.stdout || ''}`);
  const beforeHead = output('git', ['rev-parse', 'HEAD'], work);
  assertWorkingSet(work, new Set(), config.protectedPrefixes);
  console.log(`\n[${config.label}] LEGACY APPLICATOR AUDIT: exercising the complete mutation plan without writing...`);
  const audit = run(process.execPath, [applyScript, work, '--audit'], { cwd: packageRoot, inherit: true });
  if (audit.status !== 0) {
    assertTransactionalApplyFailure(work, config.protectedPrefixes);
    throw new Error(`legacy applicator AUDIT failed before PRE (exit ${audit.status ?? 'unknown'})`);
  }
  const afterHead = output('git', ['rev-parse', 'HEAD'], work);
  if (afterHead !== beforeHead) throw new Error(`legacy applicator AUDIT changed HEAD (${beforeHead} -> ${afterHead})`);
  const changed = assertWorkingSet(work, new Set(), config.protectedPrefixes);
  if (changed.length) throw new Error(`legacy applicator AUDIT dirtied the worktree:\n  ${changed.join('\n  ')}`);
  console.log(`[${config.label}] LEGACY APPLICATOR AUDIT PASS.`);
}

function copyFileVerified(src, dst, expectedSha) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  if (sha256File(dst) !== expectedSha) throw new Error(`copy verification failed: ${dst}`);
}

export function auditBuiltInApply({ packageRoot, work, config, files }) {
  const root = packagePayloadRoot(packageRoot, config);
  verifyPackagedBytes(packageRoot, config, files);
  verifyBaseGuards(work, files);
  if (config.applyMode === 'overlay') {
    for (const entry of files) {
      const target = path.join(work, ...entry.path.split('/'));
      if (entry.operation === 'delete' && !fs.existsSync(target)) throw new Error(`${entry.path}: deletion target missing from pinned base`);
    }
  }
  if (config.applyMode === 'exact-release') {
    if (!fs.existsSync(path.join(root, 'main.js'))) throw new Error('exact-release package is missing release/main.js');
  }
  console.log(`[${config.label}] BUILT-IN APPLICATOR AUDIT PASS (${config.applyMode}; ${files.length} changed paths).`);
}

export function applyBuiltInPackage({ packageRoot, work, config, files }) {
  const root = packagePayloadRoot(packageRoot, config);
  const rollbackRoot = path.join(path.dirname(work), `.jweb-pushzip-rollback-${process.pid}-${crypto.randomBytes(3).toString('hex')}`);
  fs.mkdirSync(rollbackRoot, { recursive: true });
  let committed = false;
  try {
    if (config.applyMode === 'overlay') {
      const existed = new Map();
      for (const entry of files) {
        const target = path.join(work, ...entry.path.split('/'));
        const present = fs.existsSync(target);
        existed.set(entry.path, present);
        if (present) {
          const backup = path.join(rollbackRoot, ...entry.path.split('/'));
          fs.mkdirSync(path.dirname(backup), { recursive: true });
          fs.cpSync(target, backup, { recursive: true, dereference: false });
        }
      }
      try {
        for (const entry of files) {
          const target = path.join(work, ...entry.path.split('/'));
          if (entry.operation === 'copy') {
            const src = path.join(root, ...entry.path.split('/'));
            copyFileVerified(src, target, entry.sha256);
          } else {
            if (!fs.existsSync(target)) throw new Error(`${entry.path}: deletion target missing during apply`);
            fs.rmSync(target, { recursive: true, force: false });
          }
        }
        verifyCnameExact(path.join(work, 'CNAME'));
        verifyAppliedBytes(work, packageRoot, config, files);
      } catch (error) {
        for (const entry of [...files].reverse()) {
          const target = path.join(work, ...entry.path.split('/'));
          fs.rmSync(target, { recursive: true, force: true });
          if (existed.get(entry.path)) {
            const backup = path.join(rollbackRoot, ...entry.path.split('/'));
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.cpSync(backup, target, { recursive: true, dereference: false });
          }
        }
        throw error;
      }
    } else if (config.applyMode === 'exact-release') {
      const topEntries = fs.readdirSync(work, { withFileTypes: true }).filter(entry => entry.name !== '.git');
      try {
        for (const entry of topEntries) fs.renameSync(path.join(work, entry.name), path.join(rollbackRoot, entry.name));
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
          fs.cpSync(path.join(root, entry.name), path.join(work, entry.name), { recursive: true, force: true, dereference: false });
        }
        if (!fs.existsSync(path.join(work, '.git'))) throw new Error('exact-release install lost .git');
        verifyCnameExact(path.join(work, 'CNAME'));
        verifyAppliedBytes(work, packageRoot, config, files);
      } catch (error) {
        for (const entry of fs.readdirSync(work, { withFileTypes: true })) {
          if (entry.name === '.git') continue;
          fs.rmSync(path.join(work, entry.name), { recursive: true, force: true });
        }
        for (const entry of fs.readdirSync(rollbackRoot, { withFileTypes: true })) {
          fs.renameSync(path.join(rollbackRoot, entry.name), path.join(work, entry.name));
        }
        throw error;
      }
    } else {
      throw new Error(`built-in apply does not support mode ${config.applyMode}`);
    }
    committed = true;
  } finally {
    if (committed || fs.existsSync(rollbackRoot)) fs.rmSync(rollbackRoot, { recursive: true, force: true });
  }
}

function stageAndValidate(repo, files, protectedPrefixes = []) {
  const expected = files.map(entry => entry.path).sort();
  const add = run('git', ['add', '-A', '-f', '--', ...expected], { cwd: repo, inherit: true });
  if (add.status !== 0) throw new Error('git add -A -f failed');
  const stagedRaw = output('git', ['diff', '--cached', '--name-only', '-z'], repo);
  const actual = stagedRaw.split('\0').filter(Boolean).map(normalizeRepoPath).sort();
  if (actual.length !== expected.length || actual.some((item, index) => item !== expected[index])) {
    throw new Error(`staged allowlist mismatch\nExpected:\n  ${expected.join('\n  ')}\nActual:\n  ${actual.join('\n  ')}`);
  }
  assertProtectedPaths(actual, protectedPrefixes);
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

export function verifyPackageOnly(packageRoot) {
  const packageData = validatePackage(packageRoot);
  const { config, files } = packageData;
  verifyPackagedBytes(packageRoot, config, files);
  verifyBootstrapRunnerParity(packageRoot, config, files);
  if (config.applyMode === 'legacy-applicator') {
    const applyScript = path.join(packageRoot, ...config.applyScript.split('/'));
    if (!fs.existsSync(applyScript)) throw new Error(`apply script missing: ${config.applyScript}`);
    const check = run(process.execPath, ['--check', applyScript], { cwd: packageRoot, inherit: false, encoding: 'utf8' });
    if (check.status !== 0) throw new Error(`apply script syntax invalid:\n${check.stderr || check.stdout || ''}`);
  }
  return packageData;
}

async function runTransaction(packageRoot) {
  let packageData;
  try { packageData = verifyPackageOnly(packageRoot); }
  catch (error) { die(`package integrity gate: ${error.message}`); }
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
    verifyCnameExact(path.join(work, 'CNAME'));
    console.log(`[${label}] CNAME exact: jweb.dev`);
    verifyBaseGuards(work, files);
    if (config.applyMode === 'legacy-applicator') runLegacyApplicatorAudit({ packageRoot, work, config });
    else auditBuiltInApply({ packageRoot, work, config, files });
  } catch (error) {
    die(error.message, work);
  }

  const preResults = runCheckList({
    repo: work,
    label: `${label} PRE`,
    syntax: config.preflightSyntax,
    tests: config.baselineTests,
  });
  const preInfrastructure = [...preResults.values()].filter(item => item.infrastructureFailure);
  const preSyntaxFailures = resultsForKind(preResults, 'syntax').filter(item => !item.passed);
  if (preInfrastructure.length || preSyntaxFailures.length) {
    die('clean-base PRE infrastructure/syntax gate failed after every configured PRE check ran', work);
  }
  const baselineDebtCount = resultsForKind(preResults, 'test').filter(item => !item.passed).length;
  if (baselineDebtCount) {
    console.warn(`\n[${label}] PRE baseline debt recorded: ${baselineDebtCount}/${config.baselineTests.length} baseline tests currently fail on the pinned clean base. This is evidence, not an automatic blocker.`);
  }

  console.log(`\n[${label}] Applying package (${config.applyMode}) transactionally...`);
  if (config.applyMode === 'legacy-applicator') {
    const applyScript = path.join(packageRoot, ...config.applyScript.split('/'));
    result = run(process.execPath, [applyScript, work], { cwd: packageRoot, inherit: true });
    if (result.status !== 0) {
      try { assertTransactionalApplyFailure(work, config.protectedPrefixes); }
      catch (error) { die(`${error.message}\nOriginal apply exit: ${result.status ?? 'unknown'}`, work); }
      die(`payload application failed cleanly after PRE completed (exit ${result.status ?? 'unknown'}); POST is intentionally not run against a nonexistent candidate`, work);
    }
  } else {
    try { applyBuiltInPackage({ packageRoot, work, config, files }); }
    catch (error) {
      try { assertTransactionalApplyFailure(work, config.protectedPrefixes); }
      catch (dirtyError) { die(`${dirtyError.message}\nOriginal apply error: ${error.message}`, work); }
      die(`built-in payload application failed cleanly: ${error.message}`, work);
    }
  }

  try {
    verifyAppliedBytes(work, packageRoot, config, files);
    assertWorkingSet(work, new Set(files.map(entry => entry.path)), config.protectedPrefixes);
  } catch (error) {
    die(error.message, work);
  }

  const postResults = runCheckList({
    repo: work,
    label: `${label} POST`,
    syntax: config.syntax,
    tests: [...config.baselineTests, ...config.tests],
  });
  const postInfrastructure = [...postResults.values()].filter(item => item.infrastructureFailure);
  const postSyntaxFailures = resultsForKind(postResults, 'syntax').filter(item => !item.passed);
  const requiredFailures = config.tests.map(file => postResults.get(`test:${file}`)).filter(item => !item || !item.passed);
  const differential = compareBaseline(preResults, postResults, config.baselineTests, label);
  const blockers = [];
  if (postInfrastructure.length) blockers.push(`${postInfrastructure.length} POST infrastructure failures`);
  if (postSyntaxFailures.length) blockers.push(`${postSyntaxFailures.length} POST syntax failures`);
  if (requiredFailures.length) blockers.push(`${requiredFailures.length} required cut-specific tests failed`);
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
    assertWorkingSet(work, new Set(files.map(entry => entry.path)), config.protectedPrefixes);
    staged = stageAndValidate(work, files, config.protectedPrefixes);
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

  console.log(`\n[${label}] Gate passed. Ctrl+C is the only abort during countdown.`);
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

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] === 'verify-package' ? 'verify-package' : 'run';
  const packageArg = command === 'verify-package' ? args[1] : args[0];
  const packageRoot = resolvePackageRootArg(packageArg);
  if (command === 'verify-package') {
    try {
      const { config, files } = verifyPackageOnly(packageRoot);
      console.log(`[jweb-pushzip] PACKAGE PASS: ${config.schema} ${config.applyMode} ${files.length} changed path(s)`);
      return;
    } catch (error) {
      die(error.message);
    }
  }
  await runTransaction(packageRoot);
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) main().catch(error => die(error?.stack || error?.message || String(error)));
