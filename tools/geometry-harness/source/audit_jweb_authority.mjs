#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function die(msg) { console.error(msg); process.exit(2); }
function argValue(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
function parseChunks(text) {
  return String(text ?? '0,0').split(';').map((part) => {
    const [x, z] = part.split(',').map(Number);
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z)) die(`invalid chunk ${part}; expected x,z;x,z`);
    return { x, z, key: `${x},${z}` };
  });
}
function finiteBox(r) {
  const values = [r?.minX, r?.maxX, r?.minZ, r?.maxZ, r?.yMin, r?.yMax];
  return values.every(Number.isFinite) && r.maxX > r.minX && r.maxZ > r.minZ && r.yMax > r.yMin;
}

const repo = path.resolve(argValue('--repo') ?? '');
if (!repo || !fs.existsSync(path.join(repo, 'kowloon-fabric-engine.js'))) die('--repo must point at a JWEB checkout');
const worldSeed = Number(argValue('--seed', '671278205'));
if (!Number.isSafeInteger(worldSeed)) die('--seed must be a safe integer');
const chunks = parseChunks(argValue('--chunks', '0,0'));
const outPath = argValue('--out');
const strict = process.argv.includes('--strict');

const realLog = console.log;
const realWarn = console.warn;
console.log = () => {};
console.warn = () => {};

let THREE, createKowloonFabricEngine, deterministicChunkSeed, worldWeirdnessAt;
try {
  THREE = await import(pathToFileURL(path.join(repo, 'vendor/three/three.module.js')));
  ({ createKowloonFabricEngine } = await import(pathToFileURL(path.join(repo, 'kowloon-fabric-engine.js'))));
  ({ deterministicChunkSeed, worldWeirdnessAt } = await import(pathToFileURL(path.join(repo, 'world-chunk-streamer.js'))));
} catch (error) {
  console.log = realLog; console.warn = realWarn;
  throw error;
}

const results = [];
for (const coord of chunks) {
  const scene = new THREE.Scene();
  const playerPhysics = {
    registerOwnedWorld() { return { activationState: 'active' }; },
    unregisterOwnedWorld() { return true; },
  };
  const engine = createKowloonFabricEngine({
    THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene),
    worldSeed, chunkSize: 64, landmarkSpacingChunks: 3, yieldControl: null,
  });
  const chunk = {
    key: coord.key, x: coord.x, z: coord.z,
    centerX: coord.x * 64, centerZ: coord.z * 64,
    seed: deterministicChunkSeed(worldSeed, coord.x, coord.z),
    weirdness: worldWeirdnessAt(coord.x, coord.z, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
  };
  const item = { chunk: coord.key, pass: false, build: { pass: false }, authority: null, failures: [] };
  try {
    const payload = await engine.build(chunk);
    item.build = { pass: true };
    const connectors = payload.physics?.semanticConnectors ?? [];
    const stairs = connectors.filter((c) => c?.stairFlight);
    const fitBad = stairs.filter((c) => c.stairFlight?.fitClassification === 'geometry-fit-outside-truth');
    const widthBad = stairs.filter((c) => Number.isFinite(c.sweep?.halfWidth)
      && Number.isFinite(c.stairFlight?.clearWidth)
      && c.sweep.halfWidth * 2 + 1e-9 < c.stairFlight.clearWidth);
    // createStairConnector represents an entire switchback core in sweep.y0/y1
    // while its stairFlight describes one flight segment. A direct rise comparison
    // is only authoritative for ramp-style single-flight connectors.
    const riseBad = stairs.filter((c) => c.sweep?.type !== 'stair'
      && Number.isFinite(c.sweep?.y0) && Number.isFinite(c.sweep?.y1)
      && Number.isFinite(c.stairFlight?.rise)
      && Math.abs(Math.abs(c.sweep.y1 - c.sweep.y0) - c.stairFlight.rise) > 1e-8);
    const reservations = payload.physics?.circulationReservations ?? [];
    const reservationBad = reservations.filter((r) => !finiteBox(r));

    for (const c of fitBad) item.failures.push({
      type: 'stair-fit-outside-truth', id: c.id, source: c.source, kind: c.kind,
      realizedTreadDepth: c.stairFlight.realizedTreadDepth,
      fitThresholdTreadDepth: c.stairFlight.fitThresholdTreadDepth,
      realizedRun: c.stairFlight.realizedRun,
    });
    for (const c of widthBad) item.failures.push({
      type: 'stair-clear-width-below-truth', id: c.id, source: c.source, kind: c.kind,
      realizedWidth: c.sweep.halfWidth * 2, clearWidth: c.stairFlight.clearWidth,
    });
    for (const c of riseBad) item.failures.push({ type: 'stair-rise-authority-mismatch', id: c.id, source: c.source, kind: c.kind });
    for (const r of reservationBad) item.failures.push({ type: 'invalid-circulation-reservation', id: r.id ?? null, reservation: r });

    item.authority = {
      connectors: connectors.length,
      stairConnectors: stairs.length,
      circulationReservations: reservations.length,
      stairFitOutsideTruth: fitBad.length,
      stairClearWidthBelowTruth: widthBad.length,
      stairRiseMismatch: riseBad.length,
      invalidReservations: reservationBad.length,
    };
    item.pass = item.failures.length === 0;
  } catch (error) {
    item.build = { pass: false, code: error?.code ?? null, name: error?.name ?? 'Error', message: String(error?.message ?? error) };
    item.failures.push({ type: 'chunk-build-error', ...item.build });
    item.pass = false;
  } finally {
    try { engine.disposeShared?.(); } catch {}
  }
  results.push(item);
}

console.log = realLog;
console.warn = realWarn;
const failed = results.filter((r) => !r.pass).length;
const report = {
  schema: 'jweb.geometry-authority-audit.v1',
  repo, worldSeed,
  summary: { pass: failed === 0, chunks: results.length, passed: results.length - failed, failed },
  chunks: results,
};
const text = JSON.stringify(report, null, 2) + '\n';
if (outPath) {
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(path.resolve(outPath), text);
}
realLog(text.trimEnd());
if (strict && failed) process.exit(1);
