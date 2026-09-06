#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  analyzeChunkPayload,
  buildSweepAnalysis,
  renderAttentionLedgerSvg,
  renderAuthorityPipelineSvg,
  renderBuildingStacksSvg,
  renderChunkIndexHtml,
  renderChunkMatrixSvg,
  renderCodeSystemMapSvg,
  renderSweepFindingsMarkdown,
  renderSweepIndexHtml,
  renderSweepFingerprintSvg,
  renderSystemStorySvg,
  renderTransportAnatomySvg,
  renderTransportFailureAtlasSvg,
  renderValidationSeamsSvg,
} from '../system-observatory-core.js';

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : fallback;
}
function intArg(name, fallback) {
  const value = Number(arg(name, fallback));
  return Number.isFinite(value) ? Math.trunc(value) : fallback;
}
function relImport(fromPath, spec) {
  if (!spec.startsWith('.')) return null;
  let resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), spec));
  if (!path.posix.extname(resolved)) resolved += '.js';
  return resolved;
}
function scanSelectedCode(repo, selected) {
  const selectedSet = new Set(selected);
  const nodes = [];
  const edges = [];
  const importRe = /(?:import\s+(?:[^'";]+?\s+from\s+)?|export\s+[^'";]+?\s+from\s+)["']([^"']+)["']/g;
  for (const rel of selected) {
    const file = path.join(repo, rel);
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const imports = [];
    for (const match of text.matchAll(importRe)) {
      const resolved = relImport(rel, match[1]);
      if (!resolved) continue;
      imports.push(resolved);
      if (selectedSet.has(resolved)) edges.push({ from: rel, to: resolved });
    }
    const schemas = [...text.matchAll(/(?:SCHEMA|schema|formatVersion)\s*[:=]\s*["'`]([^"'`]+)["'`]/g)].map(match => match[1]).slice(0, 4);
    const exports = [...text.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z0-9_$]+)/g)].map(match => match[1]).slice(0, 24);
    nodes.push({ path: rel, bytes: Buffer.byteLength(text), imports, schemas, exports });
  }
  return { generatedAt: new Date().toISOString(), nodes, edges };
}

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRepo = path.resolve(here, '../../..');
const repo = path.resolve(arg('--repo', defaultRepo));
const out = path.resolve(arg('--out', path.join(repo, '.visual-probe-output', 'system-observatory')));
const seed = intArg('--seed', 671278205);
const centerX = intArg('--center-x', 4);
const centerZ = intArg('--center-z', 3);
const radius = Math.max(0, intArg('--radius', 2));
const chunkSize = Math.max(16, intArg('--chunk-size', 64));
const landmarkSpacingChunks = Math.max(1, intArg('--landmark-spacing-chunks', 3));
const resume = process.argv.includes('--resume');
const failOnBuildError = process.argv.includes('--fail-on-build-error');

for (const rel of ['vendor/three/three.module.js', 'kowloon-fabric-engine.js', 'world-contract.js']) {
  if (!fs.existsSync(path.join(repo, rel))) throw new Error(`JWEB repo missing ${rel}: ${repo}`);
}

const THREE = await import(pathToFileURL(path.join(repo, 'vendor/three/three.module.js')));
const { createKowloonFabricEngine } = await import(pathToFileURL(path.join(repo, 'kowloon-fabric-engine.js')));
const { deterministicChunkSeed, worldWeirdnessAt } = await import(pathToFileURL(path.join(repo, 'world-contract.js')));

const scene = new THREE.Scene();
const playerPhysics = {
  registerOwnedWorld() { return { activationState: 'active' }; },
  unregisterOwnedWorld() { return true; },
};
const worldSeed = Number(seed) | 0;
const engine = createKowloonFabricEngine({
  THREE,
  scene,
  playerPhysics,
  directSceneAdd: scene.add.bind(scene),
  worldSeed,
  chunkSize,
  landmarkSpacingChunks,
  yieldControl: null,
});

const summaries = [];
fs.mkdirSync(out, { recursive: true });
const partialFailureFile = path.join(out, 'build-failures.partial.json');
const failures = resume && fs.existsSync(partialFailureFile) ? JSON.parse(fs.readFileSync(partialFailureFile, 'utf8')) : [];
const failedKeys = new Set(failures.map(item => String(item.chunkKey)));
for (let z = centerZ - radius; z <= centerZ + radius; z += 1) {
  for (let x = centerX - radius; x <= centerX + radius; x += 1) {
    const chunk = {
      key: `${x},${z}`,
      x,
      z,
      centerX: x * chunkSize,
      centerZ: z * chunkSize,
      seed: deterministicChunkSeed(worldSeed, x, z),
      weirdness: worldWeirdnessAt(x, z, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
    };
    const chunkOut = path.join(out, 'chunks', chunk.key);
    const existingSummaryFile = path.join(chunkOut, 'summary.json');
    if (resume && fs.existsSync(existingSummaryFile)) {
      summaries.push(JSON.parse(fs.readFileSync(existingSummaryFile, 'utf8')));
      process.stdout.write(`chunk ${chunk.key} reused\n`);
      continue;
    }
    if (resume && failedKeys.has(chunk.key)) {
      process.stdout.write(`chunk ${chunk.key} known-failure reused\n`);
      continue;
    }
    let payload = null;
    try {
      const started = performance.now();
      payload = await engine.build(chunk);
      const summary = analyzeChunkPayload(payload, chunk);
      summary.buildMs = Number((performance.now() - started).toFixed(3));
      summaries.push(summary);
      fs.mkdirSync(chunkOut, { recursive: true });
      fs.writeFileSync(path.join(chunkOut, 'summary.json'), JSON.stringify(summary, null, 2));
      fs.writeFileSync(path.join(chunkOut, 'system-story.svg'), renderSystemStorySvg(summary));
      fs.writeFileSync(path.join(chunkOut, 'attention-ledger.svg'), renderAttentionLedgerSvg(summary));
      fs.writeFileSync(path.join(chunkOut, 'transport-anatomy.svg'), renderTransportAnatomySvg(summary));
      fs.writeFileSync(path.join(chunkOut, 'building-stacks.svg'), renderBuildingStacksSvg(summary));
      fs.writeFileSync(path.join(chunkOut, 'index.html'), renderChunkIndexHtml(summary));
      process.stdout.write(`chunk ${chunk.key} score=${summary.attention} spaces=${summary.counts.spaces} connectors=${summary.counts.connectors}\n`);
    } catch (error) {
      failures.push({ chunkKey: chunk.key, x: chunk.x, z: chunk.z, message: error?.stack ?? String(error) });
      failedKeys.add(chunk.key);
      fs.writeFileSync(partialFailureFile, JSON.stringify(failures, null, 2));
      process.stderr.write(`chunk ${chunk.key} FAILED: ${error?.message ?? error}\n`);
    } finally {
      if (payload) {
        try { await engine.unload?.(chunk, payload); } catch (error) { process.stderr.write(`unload ${chunk.key}: ${error?.message ?? error}\n`); }
      }
    }
  }
}
engine.disposeShared?.();

const selectedCode = [
  'kowloon-fabric-engine.js',
  'world/semantic-layout.js',
  'world/space-plan.js',
  'world/semantic-connectors.js',
  'world/access-portals.js',
  'world/semantic-context.js',
  'world/spatial-topology.js',
  'world/circulation-graph.js',
  'world/sectional-circulation.js',
  'world/exterior-transport-network.js',
  'world/scaffold-circulation-plan.js',
  'world/circulation-collision-authority.js',
];
const codeScan = scanSelectedCode(repo, selectedCode);
const spatialTopologySource = fs.readFileSync(path.join(repo, 'world/spatial-topology.js'), 'utf8');
const compileStart = spatialTopologySource.indexOf('export function compileSpatialTopologyGraph');
const strictStart = spatialTopologySource.indexOf('export function assertSpatialTopologyGraph');
const compilerSlice = compileStart >= 0 && strictStart > compileStart ? spatialTopologySource.slice(compileStart, strictStart) : '';
const sweep = buildSweepAnalysis(summaries);
sweep.failures = failures;
sweep.validation = {
  strictSpatialAssertExists: strictStart >= 0,
  compilerCallsStrictSpatialAssert: /assertSpatialTopologyGraph\s*\(/.test(compilerSlice),
  compilerCallsWorldAssert: /assertWorldCirculationGraph\s*\(\s*circulation/.test(compilerSlice),
  compilerPublishesAfterWorldAssert: compilerSlice.indexOf('assertWorldCirculationGraph') >= 0 && compilerSlice.indexOf('scope.payload.spatialTopology = graph') > compilerSlice.indexOf('assertWorldCirculationGraph'),
};
sweep.totals.buildFailures = failures.length;
sweep.source = { repo, seed: worldSeed, centerX, centerZ, radius, chunkSize, requestedChunks: (radius * 2 + 1) ** 2, failedChunks: failures.length };
sweep.codeScan = codeScan;

fs.writeFileSync(path.join(out, 'sweep.json'), JSON.stringify(sweep, null, 2));
fs.writeFileSync(path.join(out, 'build-failures.json'), JSON.stringify(failures, null, 2));
fs.writeFileSync(partialFailureFile, JSON.stringify(failures, null, 2));
fs.writeFileSync(path.join(out, 'code-scan.json'), JSON.stringify(codeScan, null, 2));
fs.writeFileSync(path.join(out, 'authority-pipeline.svg'), renderAuthorityPipelineSvg(sweep));
fs.writeFileSync(path.join(out, 'validation-seams.svg'), renderValidationSeamsSvg(sweep));
fs.writeFileSync(path.join(out, 'transport-failure-atlas.svg'), renderTransportFailureAtlasSvg(sweep));
fs.writeFileSync(path.join(out, 'chunk-matrix.svg'), renderChunkMatrixSvg(sweep));
fs.writeFileSync(path.join(out, 'code-system-map.svg'), renderCodeSystemMapSvg(codeScan));
fs.writeFileSync(path.join(out, 'system-fingerprint.svg'), renderSweepFingerprintSvg(sweep));
fs.writeFileSync(path.join(out, 'SWEEP-FINDINGS.md'), renderSweepFindingsMarkdown(sweep));
fs.writeFileSync(path.join(out, 'index.html'), renderSweepIndexHtml(sweep, { title: `JWEB system observatory — ${summaries.length} chunks around ${centerX},${centerZ}` }));

console.log(JSON.stringify({
  pass: failures.length === 0,
  out,
  seed: worldSeed,
  chunks: summaries.length,
  failedChunks: failures.length,
  totals: sweep.totals,
  topChunks: [...summaries].sort((a, b) => b.attention - a.attention).slice(0, 8).map(item => ({ key: item.chunk.key, score: item.attention })),
}, null, 2));
if (failures.length && failOnBuildError) process.exitCode = 2;
