import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  gitBlobShaFromBytes,
  normalizeRepoPath,
  sha256File,
  treeDigest,
  verifyCnameExact,
} from './runner.mjs';

export const JWEB_PUSHZIP_AUTHORING_SCHEMA = 'jweb.pushzip-authoring.v1';
const DEFAULT_REPO = 'https://github.com/JustinBrownDev/justinbrowndev.github.io.git';

function fail(message) { throw new Error(`[jweb-pushzip-builder] ${message}`); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function sameBytes(a, b) { return fs.existsSync(a) && fs.existsSync(b) && fs.readFileSync(a).equals(fs.readFileSync(b)); }

function collectFiles(root, dir = root, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' && dir === root) continue;
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) fail(`symlink not permitted: ${full}`);
    if (entry.isDirectory()) collectFiles(root, full, out);
    else if (entry.isFile()) out.push(normalizeRepoPath(path.relative(root, full)));
    else fail(`unsupported filesystem entry: ${full}`);
  }
  return out.sort();
}

function gitBlobFromBase(baseRoot, expectedSha, rel) {
  if (fs.existsSync(path.join(baseRoot, '.git'))) {
    const result = spawnSync('git', ['rev-parse', `${expectedSha}:${rel}`], { cwd: baseRoot, encoding: 'utf8' });
    if (result.status === 0) return result.stdout.trim();
  }
  const file = path.join(baseRoot, ...rel.split('/'));
  if (!fs.existsSync(file)) return null;
  return gitBlobShaFromBytes(fs.readFileSync(file));
}

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isSymbolicLink()) fail(`symlink not permitted: ${from}`);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) { fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(from, to); }
    else fail(`unsupported filesystem entry: ${from}`);
  }
}

function changedPaths(baseRoot, candidateRoot) {
  const base = new Set(collectFiles(baseRoot));
  const candidate = new Set(collectFiles(candidateRoot));
  const all = [...new Set([...base, ...candidate])].sort();
  return all.filter(rel => {
    if (!base.has(rel) || !candidate.has(rel)) return true;
    return !sameBytes(path.join(baseRoot, ...rel.split('/')), path.join(candidateRoot, ...rel.split('/')));
  });
}

function validateSpec(spec) {
  if (spec.schema !== JWEB_PUSHZIP_AUTHORING_SCHEMA) fail(`unsupported spec schema: ${spec.schema}`);
  if (!['overlay', 'exact-release'].includes(spec.mode)) fail('mode must be overlay or exact-release');
  if (!/^[0-9a-f]{40}$/i.test(spec.expectedSha ?? '')) fail('expectedSha must be 40 hex characters');
  if (!spec.name || !/^[A-Za-z0-9._-]+$/.test(spec.name)) fail('name must be a filesystem-safe package directory name');
  if (!spec.launcher || !/^PUSH-[A-Za-z0-9._-]+\.cmd$/i.test(spec.launcher)) fail('launcher must be PUSH-*.cmd');
  if (!spec.commitMessage) fail('commitMessage is required');
  for (const key of ['preflightSyntax', 'baselineTests', 'syntax', 'tests', 'protectedPrefixes', 'successNotes']) {
    if (spec[key] !== undefined && !Array.isArray(spec[key])) fail(`${key} must be an array`);
  }
  if (spec.mode === 'overlay') {
    if (!Array.isArray(spec.copy)) fail('overlay spec requires copy array');
    if (!Array.isArray(spec.delete)) spec.delete = [];
  }
  return spec;
}

function launcherText() {
  return `@echo off\r\nsetlocal EnableExtensions\r\nset "PACKAGE_ROOT=%~dp0."\r\nwhere git >nul 2>nul || (echo [JWEB pushzip] Git was not found on PATH.& exit /b 1)\r\nwhere node >nul 2>nul || (echo [JWEB pushzip] Node.js was not found on PATH.& exit /b 1)\r\nnode "%PACKAGE_ROOT%\\bootstrap\\jweb-pushzip-runner.mjs" "%PACKAGE_ROOT%"\r\nexit /b %ERRORLEVEL%\r\n`;
}

function readmeText(spec) {
  return `JWEB PUSHZIP\n\nPackage: ${spec.name}\nBase: ${spec.expectedSha}\nMode: ${spec.mode}\nCommit: ${spec.commitMessage}\n\nThis package is self-contained. It fresh-clones main, refuses base drift, requires exact CNAME bytes, runs configured checks, stages only the manifest, rechecks origin/main, counts down 5 to 1, then commits and pushes once.\n\nRun the root ${spec.launcher} from cmd.exe. The launcher contains no inline JavaScript and does not use delayed expansion.\n`;
}

export function buildPackage({ specPath, outRoot = null }) {
  const specFile = path.resolve(specPath);
  const spec = validateSpec(readJson(specFile));
  const specDir = path.dirname(specFile);
  const baseRoot = path.resolve(specDir, spec.baseRoot);
  const candidateRoot = path.resolve(specDir, spec.candidateRoot);
  const targetParent = outRoot ? path.resolve(outRoot) : path.resolve(specDir, 'dist');
  const packageRoot = path.join(targetParent, spec.name);
  if (!fs.existsSync(baseRoot) || !fs.existsSync(candidateRoot)) fail('baseRoot/candidateRoot must exist');
  verifyCnameExact(path.join(baseRoot, 'CNAME'));
  verifyCnameExact(path.join(candidateRoot, 'CNAME'));
  fs.rmSync(packageRoot, { recursive: true, force: true });
  fs.mkdirSync(packageRoot, { recursive: true });

  const runnerSource = path.join(candidateRoot, 'tools', 'jweb-pushzip', 'runner.mjs');
  if (!fs.existsSync(runnerSource)) fail('candidate canonical runner missing');
  const bootstrap = path.join(packageRoot, 'bootstrap', 'jweb-pushzip-runner.mjs');
  fs.mkdirSync(path.dirname(bootstrap), { recursive: true });
  fs.copyFileSync(runnerSource, bootstrap);
  fs.writeFileSync(path.join(packageRoot, spec.launcher), launcherText());
  fs.writeFileSync(path.join(packageRoot, 'README.txt'), readmeText(spec));

  let paths;
  const files = [];
  if (spec.mode === 'overlay') {
    const copies = spec.copy.map(normalizeRepoPath);
    const deletes = spec.delete.map(normalizeRepoPath);
    const overlap = copies.find(rel => deletes.includes(rel));
    if (overlap) fail(`path cannot be both copied and deleted: ${overlap}`);
    paths = [...copies, ...deletes].sort();
    if (!paths.length) fail('overlay has no changed paths');
    for (const rel of copies) {
      const src = path.join(candidateRoot, ...rel.split('/'));
      if (!fs.existsSync(src) || !fs.statSync(src).isFile()) fail(`copy source missing/not file: ${rel}`);
      const dst = path.join(packageRoot, 'payload', ...rel.split('/'));
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
      const baseBlob = gitBlobFromBase(baseRoot, spec.expectedSha, rel);
      files.push({ path: rel, operation: 'copy', sha256: sha256File(dst), ...(baseBlob ? { baseBlob } : { baseAbsent: true }) });
    }
    for (const rel of deletes) {
      const baseFile = path.join(baseRoot, ...rel.split('/'));
      if (!fs.existsSync(baseFile)) fail(`delete target absent from base: ${rel}`);
      const baseBlob = gitBlobFromBase(baseRoot, spec.expectedSha, rel);
      if (!baseBlob) fail(`could not compute base blob for deletion: ${rel}`);
      files.push({ path: rel, operation: 'delete', baseBlob });
    }
  } else {
    paths = changedPaths(baseRoot, candidateRoot);
    if (!paths.length) fail('exact-release candidate has no changes from base');
    copyTree(candidateRoot, path.join(packageRoot, 'release'));
    for (const rel of paths) {
      const baseFile = path.join(baseRoot, ...rel.split('/'));
      const candidateFile = path.join(candidateRoot, ...rel.split('/'));
      const baseBlob = fs.existsSync(baseFile) ? gitBlobFromBase(baseRoot, spec.expectedSha, rel) : null;
      if (fs.existsSync(candidateFile)) {
        files.push({ path: rel, operation: 'copy', sha256: sha256File(candidateFile), ...(baseBlob ? { baseBlob } : { baseAbsent: true }) });
      } else {
        if (!baseBlob) fail(`could not compute base blob for exact-release deletion: ${rel}`);
        files.push({ path: rel, operation: 'delete', baseBlob });
      }
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  const config = {
    schema: 'jweb.pushzip-package.v2',
    label: spec.label ?? spec.name,
    repoUrl: spec.repoUrl ?? DEFAULT_REPO,
    expectedSha: spec.expectedSha,
    commitMessage: spec.commitMessage,
    applyMode: spec.mode,
    preflightSyntax: spec.preflightSyntax ?? [],
    baselineTests: spec.baselineTests ?? [],
    syntax: spec.syntax ?? [],
    tests: spec.tests ?? [],
    protectedPrefixes: spec.protectedPrefixes ?? [],
    successNotes: spec.successNotes ?? [],
    ...(spec.mode === 'exact-release' ? { releaseTreeSha256: treeDigest(path.join(packageRoot, 'release')) } : {}),
  };
  writeJson(path.join(packageRoot, 'manifest', 'pushzip.json'), config);
  writeJson(path.join(packageRoot, 'manifest', 'files.json'), { schema: 'jweb.pushzip-files.v2', files });

  console.log('[jweb-pushzip-builder] built', {
    packageRoot,
    mode: spec.mode,
    changedPaths: files.length,
    bootstrapRunnerSha256: sha256File(bootstrap),
  });
  return packageRoot;
}

async function main() {
  const [command, specPath, outRoot] = process.argv.slice(2);
  if (command !== 'build' || !specPath) {
    console.error('usage: node tools/jweb-pushzip/package-builder.mjs build <spec.json> [out-root]');
    process.exit(2);
  }
  buildPackage({ specPath, outRoot });
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) main().catch(error => { console.error(error.stack || error.message); process.exit(1); });
