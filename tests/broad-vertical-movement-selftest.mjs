import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoPath = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const repo = path.resolve(repoPath);
const url = rel => pathToFileURL(path.join(repo, rel)).href;

// Exercise the browser-default fast shell, not the richer Node/full profile.
globalThis.window = {};
globalThis.location = { search: '?generationProfile=skeleton&buildBudgetMs=5.5' };

const [{ createKowloonFabricEngine }, THREE, stream, perf, vertical, physical] = await Promise.all([
  import(url('kowloon-fabric-engine.js') + '?broad-vertical-selftest=1'),
  import(url('vendor/three/three.module.js') + '?broad-vertical-selftest=1'),
  import(url('world-chunk-streamer.js') + '?broad-vertical-selftest=1'),
  import(url('config/performance-isolation.js') + '?broad-vertical-selftest=1'),
  import(url('world/fast-vertical-route.js') + '?broad-vertical-selftest=1'),
  import(url('world/physical-truth.js') + '?broad-vertical-selftest=1'),
]);

assert.equal(perf.GENERATION_PROFILE_NAME, 'skeleton');
assert.equal(perf.GENERATION_LANES.broadStrokesOnly, true, 'vertical restoration must stay on the fast shell');
assert.equal(perf.GENERATION_LANES.microEnrichment, false);
assert.equal(perf.GENERATION_LANES.authoredDecoration, false);
assert.equal(perf.GENERATION_LANES.signatureContent, false);

const truth = physical.resolvePhysicalTruth({
  physicalUse: 'industrial-service', role: 'maintenance-access', weirdness: 0.35,
  stableKey: 'broad-vertical-movement-selftest',
});
const fp = { cx: 0, cz: 0, halfX: 8, halfZ: 6 };

// The hard invariant: even the minimal stair has a real flight. Endpoint landing
// semantics always exist, but existing support surfaces replace duplicate geometry.
const existingFloor = {
  kind: 'existing-floor', existing: true, id: 'unit:floor:1', moduleKey: 'm', floor: 1,
  y: 3.35, tangent: 0, normalCoord: -6,
};
const minimal = vertical.planFastVerticalRoute({
  routeId: 'unit:minimal', family: 'minimal-existing-support', shape: 'direct',
  fp, moduleKey: 'm', dirKey: 'north', side: 'north', floorH: 3.35,
  targetFloor: 1, physicalTruth: truth, maxRun: 6.2, upperSupport: existingFloor,
});
assert.ok(minimal);
assert.equal(vertical.assertFastVerticalRoute(minimal), true);
assert.equal(minimal.flights.length, 1, 'minimal stair still requires one real flight');
assert.equal(minimal.endpointLandings.length, 2, 'landing semantics exist at both endpoints');
assert.equal(minimal.generatedLandings.length, 0, 'existing ground/floor replace both endpoint landing meshes');

const directDeck = vertical.planFastVerticalRoute({
  routeId: 'unit:direct-deck', family: 'broad-facade-stair', shape: 'direct',
  fp, moduleKey: 'm', dirKey: 'north', side: 'north', floorH: 3.35,
  targetFloor: 1, physicalTruth: truth, maxRun: 6.2,
});
assert.ok(directDeck);
assert.equal(directDeck.flights.length, 1);
assert.equal(directDeck.generatedLandings.length, 1, 'no upper support means a real terminal landing is required');

const sideDeck = vertical.planFastVerticalRoute({
  routeId: 'unit:side-deck', family: 'service-side-stair', shape: 'side-run',
  fp, moduleKey: 'm', dirKey: 'south', side: 'south', floorH: 3.35,
  targetFloor: 1, physicalTruth: truth, maxRun: 6.2,
});
assert.ok(sideDeck);
assert.equal(sideDeck.flights.length, 1);
assert.equal(sideDeck.generatedLandings.length, 1);
assert.equal(sideDeck.orientation.ascent, 'along-facade');

const bridgeSupport = {
  kind: 'existing-bridge-deck', existing: true, id: 'unit:bridge', moduleKey: 'm', floor: 1,
  y: 3.35, tangent: 0, normalCoord: 6.42,
};
const bridgeRoute = vertical.planFastVerticalRoute({
  routeId: 'unit:bridge', family: 'bridge-access-stair', shape: 'side-run',
  fp, moduleKey: 'm', dirKey: 'south', side: 'south', floorH: 3.35,
  targetFloor: 1, physicalTruth: truth, maxRun: 6.2, upperSupport: bridgeSupport,
});
assert.ok(bridgeRoute);
assert.equal(bridgeRoute.flights.length, 1);
assert.equal(bridgeRoute.generatedLandings.length, 0, 'bridge deck replaces duplicate upper landing geometry');
assert.equal(bridgeRoute.upperSupport.kind, 'existing-bridge-deck');

const worldSeed = 0x73A1B00C;
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

const samples = [
  [0,0], [1,0], [-1,0], [0,1], [0,-1],
  [2,2], [-2,2], [2,-2], [-2,-2],
  [5,0], [0,5], [-5,0], [0,-5],
];
let routesSeen = 0;
let directSeen = 0;
let sideRunSeen = 0;
let bridgeAccessSeen = 0;
let scaffoldRoutesSeen = 0;
let generatedLandingsSeen = 0;

for (const [x, z] of samples) {
  const c = chunk(x, z);
  const payload = await factory.build(c);
  const routes = payload.physics.fastVerticalRoutes ?? [];
  const stairRamps = (payload.physics.ramps ?? []).filter(ramp => ramp.supportKind === 'broad-vertical-stair');
  const landingPlatforms = (payload.physics.platforms ?? []).filter(platform => platform.supportKind === 'broad-vertical-landing');
  const scaffoldRoutes = payload.physics.scaffoldCirculationRoutes ?? [];

  for (const scaffoldRoute of scaffoldRoutes) {
    scaffoldRoutesSeen++;
    assert.equal(scaffoldRoute.topology, 'alternating-straight',
      `${c.key}:${scaffoldRoute.id}: skeleton keeps one fire-escape family; switchback debt stays parked`);
  }

  for (const route of routes) {
    routesSeen++;
    assert.equal(vertical.assertFastVerticalRoute(route), true);
    assert.ok(route.flights.length >= 1, `${c.key}:${route.id}: no stair route may be flightless`);
    assert.equal(route.flights.length, 1, `${c.key}:${route.id}: current fast families are single-flight routes`);
    assert.equal(route.endpointLandings.length, 2, `${c.key}:${route.id}: both endpoints retain landing semantics`);
    assert.equal(route.endpointLandings[0].generated, false, `${c.key}:${route.id}: existing ground replaces lower landing geometry`);

    for (const flight of route.flights) {
      assert.ok(stairRamps.some(ramp => ramp.routeId === route.id && ramp.flightId === flight.id),
        `${c.key}:${flight.id}: every planned flight must own a traversable physics ramp`);
    }
    for (const landing of route.generatedLandings) {
      generatedLandingsSeen++;
      assert.ok(landingPlatforms.some(platform => platform.routeId === route.id && platform.landingId === landing.id),
        `${c.key}:${route.id}: generated endpoint landing must be a real traversable platform`);
    }

    if (route.shape === 'direct') directSeen++;
    if (route.shape === 'side-run') sideRunSeen++;
    if (route.family === 'bridge-access-stair') {
      bridgeAccessSeen++;
      assert.equal(route.upperSupport.kind, 'existing-bridge-deck');
      assert.equal(route.endpointLandings[1].generated, false,
        `${c.key}:${route.id}: bridge deck must replace duplicate upper landing geometry`);
      assert.equal(route.generatedLandings.length, 0);
    } else {
      assert.equal(route.endpointLandings[1].generated, true,
        `${c.key}:${route.id}: ordinary fast stair needs a real exterior destination landing because broad shell has no interior floor plate`);
    }
  }
  await factory.unload(c, payload);
}

assert.ok(routesSeen > 0, 'browser skeleton sample must publish non-fire-escape vertical routes');
assert.ok(directSeen > 0, 'sample must contain direct broad exterior stairs');
assert.ok(sideRunSeen > 0, 'sample must contain side-run service/bridge stairs');
assert.ok(scaffoldRoutesSeen > 0, 'existing fire-escape family must remain present');
assert.ok(generatedLandingsSeen > 0, 'ordinary stairs must publish real upper destination landings');
console.log('[broad-vertical-movement-selftest] PASS', {
  samples: samples.length,
  routesSeen,
  directSeen,
  sideRunSeen,
  bridgeAccessSeen,
  scaffoldRoutesSeen,
  generatedLandingsSeen,
  invariant: 'every stair route has >= 1 flight; existing supports replace duplicate endpoint landing geometry',
});
