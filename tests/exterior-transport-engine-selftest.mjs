import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoPath = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const repo = path.resolve(repoPath);
const url = rel => pathToFileURL(path.join(repo, rel)).href;

const engineSource = fs.readFileSync(path.join(repo, 'kowloon-fabric-engine.js'), 'utf8');
assert.match(engineSource, /realizeExteriorTransportNetwork/);
assert.match(engineSource, /publishTransportSurfaceSlab/);
assert.match(engineSource, /clear-roof-street-layer/);
assert.match(engineSource, /canonical-scaffold-switchback/);
assert.doesNotMatch(engineSource, /switchback composition debt remains parked/);

// Browser skeleton is the restoration target for this sweep.
globalThis.window = {};
globalThis.location = { search: '?generationProfile=skeleton&buildBudgetMs=5.5' };
const [{ createKowloonFabricEngine }, THREE, stream, perf] = await Promise.all([
  import(url('kowloon-fabric-engine.js') + '?transport-engine-selftest=1'),
  import(url('vendor/three/three.module.js') + '?transport-engine-selftest=1'),
  import(url('world-chunk-streamer.js') + '?transport-engine-selftest=1'),
  import(url('config/performance-isolation.js') + '?transport-engine-selftest=1'),
]);
assert.equal(perf.GENERATION_PROFILE_NAME, 'skeleton');
assert.equal(perf.GENERATION_LANES.broadStrokesOnly, true);

const worldSeed = 0x61A7B00C;
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

let surfacesSeen = 0;
let roofsSeen = 0;
let routeDecksSeen = 0;
let scaffoldRoutesSeen = 0;
let linksSeen = 0;
for (const [x, z] of [[0,0], [1,0], [0,1]]) {
  const c = chunk(x, z);
  const payload = await factory.build(c);
  const surfaces = payload.physics.exteriorTransportSurfaces ?? [];
  surfacesSeen += surfaces.length;
  roofsSeen += surfaces.filter(surface => surface.kind === 'clear-roof-street-layer').length;
  routeDecksSeen += surfaces.filter(surface => surface.kind === 'balcony-street-layer').length;
  // Same-height transport overlaps are unions: at an overlap sample point there
  // may be one collision slab or a deliberate throat void, but never two stacked plates.
  const transportPlatforms = (payload.physics.platforms ?? []).filter(platform => platform.surfaceId);
  for (let i = 0; i < surfaces.length; i++) {
    for (let j = i + 1; j < surfaces.length; j++) {
      const a = surfaces[i], b = surfaces[j];
      if (Math.abs(a.y - b.y) > 0.12) continue;
      const minX = Math.max(a.x - a.hx, b.x - b.hx), maxX = Math.min(a.x + a.hx, b.x + b.hx);
      const minZ = Math.max(a.z - a.hz, b.z - b.hz), maxZ = Math.min(a.z + a.hz, b.z + b.hz);
      if (!(maxX > minX + 0.02) || !(maxZ > minZ + 0.02)) continue;
      const px = (minX + maxX) * 0.5, pz = (minZ + maxZ) * 0.5;
      const stacked = transportPlatforms.filter(platform => (platform.surfaceId === a.id || platform.surfaceId === b.id)
        && Math.abs(platform.y - a.y) <= 0.12
        && px >= platform.x - platform.hx - 1e-6 && px <= platform.x + platform.hx + 1e-6
        && pz >= platform.z - platform.hz - 1e-6 && pz <= platform.z + platform.hz + 1e-6);
      assert.ok(stacked.length <= 1,
        `${c.key}:${a.id}<->${b.id}: transport union left duplicate collision slabs in the overlap`);
    }
  }

  const scaffoldRoutes = payload.physics.scaffoldCirculationRoutes ?? [];
  scaffoldRoutesSeen += scaffoldRoutes.length;
  for (const route of scaffoldRoutes) assert.equal(route.topology, 'canonical-scaffold-switchback');
  const network = payload.physics.exteriorTransportNetwork ?? payload.exteriorTransportNetwork;
  assert.ok(network, `${c.key}: exterior transport network result must publish`);
  linksSeen += network.links?.length ?? 0;
  for (const edge of payload.physics.exteriorTransportEdges ?? []) {
    if (edge.kind !== 'stair-link') continue;
    assert.ok((payload.physics.ramps ?? []).some(ramp => ramp.transportLinkId === edge.id),
      `${c.key}:${edge.id}: cross-layer stair edge must own a real physics ramp`);
  }
  await factory.unload(c, payload);
}

assert.ok(surfacesSeen > 0, 'skeleton must publish exterior transport surfaces');
assert.ok(roofsSeen > 0, 'clear roofs must enter the street-layer candidate registry');
assert.ok(routeDecksSeen > 0, 'balcony street layers must enter the same transport registry');
console.log('[exterior-transport-engine-selftest] PASS', {
  surfacesSeen, roofsSeen, routeDecksSeen, scaffoldRoutesSeen, linksSeen,
  invariant: 'balconies + scaffold landings + catwalks + clear roofs share one late-stitch transport graph',
});
