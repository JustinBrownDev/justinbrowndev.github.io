import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { createWorldChunkStreamer, CHUNK_STATE, deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(here);
const fabric = fs.readFileSync(path.join(root, 'kowloon-fabric-engine.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');

// Scheduler intent must be available before READY/publication so BUILDING can show
// render-only geometry without pretending collision is authoritative.
const seen = [];
const streamer = createWorldChunkStreamer({
  chunkSize: 64,
  worldSeed: 0x5150,
  getPlayerPosition: () => ({ x: 0, z: 0 }),
  renderRadiusChunks: 0,
  prefetchRadiusChunks: 1,
  retentionRadiusChunks: 2,
  buildChunk: async chunk => {
    seen.push({ key: chunk.key, provisional: chunk.provisionalRenderRequested, state: chunk.state });
    return { key: chunk.key };
  },
});
const center = streamer.ensureChunk(0, 0);
await streamer.buildOne(center, 'preview-center');
assert.equal(seen[0].provisional, true, 'current render-ring chunk should request a build-time visual preview');
assert.equal(seen[0].state, CHUNK_STATE.BUILDING, 'preview intent must exist while structural state is still BUILDING');
const east = streamer.ensureChunk(1, 0);
await streamer.buildOne(east, 'preview-prefetch');
assert.equal(seen[1].provisional, false, 'prefetch-only chunk should remain off-scene during BUILDING');
assert.equal(center.provisionalRenderRequested, false, 'preview intent must clear after READY');
await streamer.dispose();

// Exercise the real fabric engine as well: preview pixels must exist during a
// BUILDING yield, while the authoritative root and physics owner remain absent.
const previewScene = new THREE.Scene();
const rawAdd = previewScene.add.bind(previewScene);
const ownedPhysics = new Map();
const playerPhysics = {
  registerOwnedWorld(id, data, lifecycle = {}) {
    ownedPhysics.set(id, data);
    const record = { activationState: 'active', deferredReason: null };
    lifecycle.onActivationChange?.(record);
    return record;
  },
  unregisterOwnedWorld(id) { return ownedPhysics.delete(id); },
};
let sawLivePreview = false;
let sawBasicPreviewMaterial = false;
const previewChunk = {
  key: '1,0', x: 1, z: 0,
  centerX: 64, centerZ: 0,
  seed: deterministicChunkSeed(0x5150, 1, 0),
  weirdness: worldWeirdnessAt(1, 0, { worldSeed: 0x5150, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
  provisionalRenderRequested: true,
};
const engine = createKowloonFabricEngine({
  THREE, scene: previewScene, playerPhysics, directSceneAdd: rawAdd,
  worldSeed: 0x5150, chunkSize: 64, landmarkSpacingChunks: 3,
  yieldControl: async () => {
    const preview = previewScene.getObjectByName('world-chunk-preview:1,0');
    if (!preview) return true;
    sawLivePreview = true;
    assert.equal(preview.userData.speculativeVisualOnly, true);
    assert.equal(preview.userData.collisionAuthority, 'none');
    assert.equal(preview.userData.traversalAuthority, 'none');
    preview.traverse(object => {
      if (object?.material?.isMeshBasicMaterial) sawBasicPreviewMaterial = true;
    });
    assert.equal(ownedPhysics.size, 0, 'BUILDING preview must not publish physics ownership');
    return true;
  },
});
const payload = await engine.build(previewChunk);
const previewBeforeCommit = previewScene.getObjectByName('world-chunk-preview:1,0');
assert.equal(sawLivePreview, true, 'real fabric build should expose preview geometry before it completes');
assert.equal(sawBasicPreviewMaterial, true, 'live preview should actually render with Basic proxy materials');
assert.ok(previewBeforeCommit, 'preview should remain visible until the authoritative commit boundary');
const boundedStats = engine.speculativePreviewStats();
assert.ok(boundedStats.activeGroups <= boundedStats.maxGroupsPerChunk,
  `preview groups must stay bounded (${boundedStats.activeGroups}/${boundedStats.maxGroupsPerChunk})`);
assert.equal(boundedStats.maxGroupsPerChunk, 24);
assert.equal(payload.root.parent, null, 'authoritative root must remain off-scene during BUILDING');
assert.equal(ownedPhysics.size, 0, 'physics must remain unpublished until commit');
await engine.commit(previewChunk, payload);
assert.equal(previewScene.getObjectByName('world-chunk-preview:1,0'), undefined,
  'commit must remove the speculative root before final authority publishes');
assert.equal(payload.root.parent, previewScene, 'authoritative root should attach at commit');
assert.ok(ownedPhysics.has(payload.ownerId), 'physics ownership should publish only at commit');
assert.equal(engine.verifyReady(previewChunk, payload, false), true);
await engine.unload(previewChunk, payload);
engine.disposeShared();

// A rejected/failed build may flash provisional pixels, but it must not leave a
// ghost root behind. Force an error at the first live-preview yield to exercise
// the same cleanup path a structural feasibility failure uses.
const failedScene = new THREE.Scene();
let failAfterPreview = false;
const failedEngine = createKowloonFabricEngine({
  THREE, scene: failedScene, playerPhysics, directSceneAdd: failedScene.add.bind(failedScene),
  worldSeed: 0x5150, chunkSize: 64, landmarkSpacingChunks: 3,
  yieldControl: async () => {
    if (!failedScene.getObjectByName('world-chunk-preview:1,0')) return;
    failAfterPreview = true;
    throw Object.assign(new Error('intentional speculative cleanup failure'), { code: 'TEST_SPECULATIVE_CLEANUP' });
  },
});
await assert.rejects(
  failedEngine.build({ ...previewChunk, provisionalRenderRequested: true }),
  error => error?.code === 'TEST_SPECULATIVE_CLEANUP',
);
assert.equal(failAfterPreview, true, 'failure fixture must throw only after provisional pixels exist');
assert.equal(failedScene.getObjectByName('world-chunk-preview:1,0'), undefined,
  'failed build must tear down all provisional pixels');
assert.equal(failedEngine.speculativePreviewStats().activeChunks, 0,
  'failed build must leave no active speculative authority record');
failedEngine.disposeShared();

assert.match(fabric, /new THREE\.MeshBasicMaterial\([\s\S]{0,500}speculative-color-proxy/,
  'build preview must use cheap color-preserving Basic materials');
assert.match(fabric, /root\.userData\.speculativeVisualOnly = true;[\s\S]{0,180}collisionAuthority = 'none';[\s\S]{0,180}traversalAuthority = 'none';/,
  'preview roots must explicitly disclaim collision and traversal authority');
assert.match(fabric, /yieldedFrame = await yieldControl[\s\S]{0,400}SPECULATIVE_PREVIEW_YIELD_STRIDE/,
  'ground compounds should publish only on selected real cooperative frame yields');
assert.match(fabric, /MAX_SPECULATIVE_PREVIEW_GROUPS = 24/,
  'build preview must declare a hard transient group cap');
assert.match(fabric, /record\.groups >= MAX_SPECULATIVE_PREVIEW_GROUPS/,
  'build preview must enforce the transient group cap');
const ceilingTranslateIndex = fabric.indexOf('translateFabricBuffersY(local, baseY);');
const ceilingPreviewIndex = fabric.indexOf("phase: 'ceiling-building-final'", ceilingTranslateIndex);
assert.ok(ceilingTranslateIndex >= 0 && ceilingPreviewIndex > ceilingTranslateIndex,
  'hanging compounds should publish only after their final ceiling-aligned world-Y translation');
assert.match(fabric, /discardSpeculativePreview\(chunk, 'build-failed'\)/,
  'failed structural builds must remove any ghost preview');
assert.match(fabric, /discardSpeculativePreview\(chunk, 'commit-start'\)/,
  'authoritative commit must replace—not overlap—the build preview');
assert.match(fabric, /discardSpeculativePreview\(chunk, 'unload'\)/,
  'unload must clean any surviving preview defensively');
assert.match(main, /preview chunks=' \+ \(speculative\.activeChunks \?\? 0\)/,
  'runtime diagnostics must expose active speculative build publication');

console.log('[speculative-build-publication-selftest] PASS', {
  policy: 'BUILDING pixels are allowed; READY/collision truth is not faked',
  centerPreview: seen[0],
  prefetchPreview: seen[1],
  liveFabricPreview: sawLivePreview,
  basicPreviewMaterial: sawBasicPreviewMaterial,
});
