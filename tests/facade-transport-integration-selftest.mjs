import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoPath = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const repo = path.resolve(repoPath);
const url = rel => pathToFileURL(path.join(repo, rel)).href;

globalThis.window = {};
globalThis.location = { search: '?generationProfile=skeleton&buildBudgetMs=5.5' };
const [{ createKowloonFabricEngine }, THREE, stream, perf] = await Promise.all([
  import(url('kowloon-fabric-engine.js') + '?facade-transport-integration=1'),
  import(url('vendor/three/three.module.js') + '?facade-transport-integration=1'),
  import(url('world-chunk-streamer.js') + '?facade-transport-integration=1'),
  import(url('config/performance-isolation.js') + '?facade-transport-integration=1'),
]);
assert.equal(perf.GENERATION_PROFILE_NAME, 'skeleton');
assert.equal(perf.GENERATION_LANES.broadStrokesOnly, true);

const worldSeed = 0x7FACAD07;
const scene = new THREE.Scene();
const owners = new Map();
const playerPhysics = {
  registerOwnedWorld(id, data) { owners.set(id, data); return { activationState: 'active', deferredReason: null }; },
  unregisterOwnedWorld(id) { return owners.delete(id); },
};
const factory = createKowloonFabricEngine({
  THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene), worldSeed,
  chunkSize: 64, landmarkSpacingChunks: 4, yieldControl: null,
});
const chunk = (x, z) => ({
  key: `${x},${z}`, x, z, centerX: x * 64, centerZ: z * 64,
  seed: stream.deterministicChunkSeed(worldSeed, x, z),
  weirdness: stream.worldWeirdnessAt(x, z, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
});

let portalFrames = 0;
let frontage = 0;
let windows = 0;
let snapshots = 0;
let loggedTransportIssues = 0;
for (const [x, z] of [[0,0], [1,0], [0,1], [-1,0]]) {
  const c = chunk(x, z);
  const payload = await factory.build(c);
  const snapshot = payload.physics.exteriorDebugSnapshot;
  assert.ok(snapshot, `${c.key}: exterior debug snapshot must publish`);
  snapshots++;
  loggedTransportIssues += snapshot.issues?.length ?? 0;
  // Transport anomalies are deliberately logged rather than made a new 07 gate.
  // The existing 06 transport-engine + stair-volume tests remain the blocking guards;
  // this broader snapshot is retained so the next visual check-in can diagnose both passes.
  assert.equal(snapshot.facade.newPortalCount, 0, `${c.key}: facade architecture invented a circulation portal`);

  const treatments = payload.physics.fastFacadeArchitecture ?? [];
  for (const treatment of treatments) {
    assert.notEqual(treatment.kind, 'new-portal');
    if (treatment.kind === 'portal-frame') {
      portalFrames++;
      assert.ok(treatment.openingKey, `${c.key}:${treatment.id}: portal frame must bind an already-authorized wall opening`);
    }
    if (treatment.kind === 'storefront' || treatment.kind === 'service-shutter') frontage++;
    if (treatment.kind === 'window') windows++;
  }
  await factory.unload(c, payload);
}
assert.ok(snapshots >= 4);
assert.ok(portalFrames > 0, 'sample must visually frame real circulation openings');
assert.ok(frontage > 0, 'sample must regain closed storefront/service frontage');
assert.ok(windows > 0, 'sample must regain inhabited window rhythm');
assert.ok(Array.isArray(globalThis.__JWEB_EXTERIOR_DEBUG__) && globalThis.__JWEB_EXTERIOR_DEBUG__.length >= snapshots,
  'browser diagnostics must retain snapshots for next check-in');
console.log('[facade-transport-integration-selftest] PASS', {
  snapshots, portalFrames, frontage, windows, loggedTransportIssues,
  invariant: '07 facade architecture consumes leftover wall space while 06 transport remains authoritative and logged',
});
