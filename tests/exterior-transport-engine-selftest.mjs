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
assert.match(engineSource, /reconcileTransportPlatformOwnership/);
assert.match(engineSource, /clear-roof-street-layer/);
assert.match(engineSource, /canonical-facade-zigzag/);
assert.match(engineSource, /blockedRects:\s*\[\.\.\.\(physics\.fastStairThroats/,
  'late transport planner must receive existing stair throat reservations before selecting links');
assert.match(engineSource, /physics\.roofTransportBlockers/,
  'late transport planner must also receive roof blockers before selecting links');
assert.match(engineSource, /blockedVolumes:\s*physics\.exteriorTransportVolumeBlockers/,
  'transport planning must reject routes through unrelated solid building volumes');
assert.doesNotMatch(engineSource, /switchback composition debt remains parked/);

globalThis.window = {};
globalThis.location = { search: '?generationProfile=skeleton&buildBudgetMs=5.5' };
const [{ createKowloonFabricEngine }, THREE, stream, perf] = await Promise.all([
  import(url('kowloon-fabric-engine.js') + '?transport-engine-selftest=08b'),
  import(url('vendor/three/three.module.js') + '?transport-engine-selftest=08b'),
  import(url('world-chunk-streamer.js') + '?transport-engine-selftest=08b'),
  import(url('config/performance-isolation.js') + '?transport-engine-selftest=08b'),
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
const rectOverlap = (a, b, epsilon = 0.015) =>
  Math.abs(Number(a.x) - Number(b.x)) < Number(a.hx) + Number(b.hx) - epsilon
  && Math.abs(Number(a.z) - Number(b.z)) < Number(a.hz) + Number(b.hz) - epsilon;

let surfacesSeen = 0;
let roofsSeen = 0;
let routeDecksSeen = 0;
let scaffoldRoutesSeen = 0;
let linksSeen = 0;
let blockedCandidatesSeen = 0;
for (const [x, z] of [[0,0], [1,0], [0,1], [0,5]]) {
  const c = chunk(x, z);
  const payload = await factory.build(c);
  const surfaces = payload.physics.exteriorTransportSurfaces ?? [];
  surfacesSeen += surfaces.length;
  roofsSeen += surfaces.filter(surface => surface.kind === 'clear-roof-street-layer').length;
  routeDecksSeen += surfaces.filter(surface => surface.kind === 'balcony-street-layer').length;

  const transportPlatforms = (payload.physics.platforms ?? []).filter(platform => platform.surfaceId);
  for (let i = 0; i < transportPlatforms.length; i++) {
    for (let j = i + 1; j < transportPlatforms.length; j++) {
      const a = transportPlatforms[i], b = transportPlatforms[j];
      if (a.surfaceId === b.surfaceId || Math.abs(a.y - b.y) > 0.12) continue;
      assert.equal(rectOverlap(a, b, 0.025), false,
        `${c.key}:${a.surfaceId}<->${b.surfaceId}: transport realization left stacked collision slabs`);
    }
  }

  const throats = payload.physics.fastStairThroats ?? [];
  for (const throat of throats) {
    for (const platform of transportPlatforms) {
      if (Math.abs(Number(throat.y) - Number(platform.y)) > 0.06) continue;
      assert.equal(rectOverlap(throat, platform), false,
        `${c.key}:${throat.routeId}:${throat.landingId}<->${platform.surfaceId}: late transport refilled an existing stair headroom throat`);
    }
  }

  const scaffoldRoutes = payload.physics.scaffoldCirculationRoutes ?? [];
  scaffoldRoutesSeen += scaffoldRoutes.length;
  for (const route of scaffoldRoutes) {
    assert.equal(route.topology, 'canonical-facade-zigzag');
    assert.equal(route.flights.length, route.floors, `${c.key}:${route.id}: exactly one full-story flight per rise`);
  }
  const network = payload.physics.exteriorTransportNetwork ?? payload.exteriorTransportNetwork;
  assert.ok(network, `${c.key}: exterior transport network result must publish`);
  assert.ok(network.surfaceOwnership, `${c.key}: physical street-layer ownership reconciliation must run before network selection`);
  linksSeen += network.links?.length ?? 0;
  blockedCandidatesSeen += Number(network.rejectionCounts?.blocked) || 0;
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
  surfacesSeen, roofsSeen, routeDecksSeen, scaffoldRoutesSeen, linksSeen, blockedCandidatesSeen,
  canary: 'chunk 0,5 has no stair-throat/platform conflict',
  invariant: 'one facade stair geometry + clearance-aware late transport + non-overlapping physical surface pieces',
});
