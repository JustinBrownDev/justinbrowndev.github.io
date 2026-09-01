import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoPath = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const repo = path.resolve(repoPath);
const url = rel => pathToFileURL(path.join(repo, rel)).href;

globalThis.window = {};
globalThis.location = { search: '?generationProfile=skeleton&buildBudgetMs=5.5' };

const [{ createKowloonFabricEngine }, THREE, stream, perf, vertical, physical] = await Promise.all([
  import(url('kowloon-fabric-engine.js') + '?broad-vertical-graph-selftest=1'),
  import(url('vendor/three/three.module.js') + '?broad-vertical-graph-selftest=1'),
  import(url('world-chunk-streamer.js') + '?broad-vertical-graph-selftest=1'),
  import(url('config/performance-isolation.js') + '?broad-vertical-graph-selftest=1'),
  import(url('world/fast-vertical-route.js') + '?broad-vertical-graph-selftest=1'),
  import(url('world/physical-truth.js') + '?broad-vertical-graph-selftest=1'),
]);

assert.equal(perf.GENERATION_PROFILE_NAME, 'skeleton');
assert.equal(perf.GENERATION_LANES.broadStrokesOnly, true, 'graph correction must stay on the fast shell');
assert.equal(perf.GENERATION_LANES.microEnrichment, false);
assert.equal(perf.GENERATION_LANES.authoredDecoration, false);
assert.equal(perf.GENERATION_LANES.signatureContent, false);

const truth = physical.resolvePhysicalTruth({
  physicalUse: 'industrial-service', role: 'maintenance-access', weirdness: 0.35,
  stableKey: 'broad-vertical-graph-selftest',
});
const fp = { cx: 0, cz: 0, halfX: 4.2, halfZ: 3.2 };
const floorH = 3.35;
const northPortal = floor => ({
  id: `unit:north:${floor}`,
  x: 0, y: floor * floorH, z: -fp.halfZ,
  width: 1.25, height: 2.2, depth: 1.2,
  side: 'north', normalX: 0, normalZ: -1,
});

// Unit contract: rooms/doors exist first; one wall-hugging trunk may service
// several room portals. Every floor transition remains a real flight.
const sharedStops = [1, 2, 3].map(floor => ({
  floor,
  roomSpaceId: `unit:room:${floor}`,
  source: 'fast-vertical-room-portal',
  openingKey: `m:N:${floor}`,
  portal: northPortal(floor),
}));
const shared = vertical.planSharedVerticalTrunk({
  routeId: 'unit:shared-trunk', family: 'shared-room-stair', fp,
  moduleKey: 'm', dirKey: 'N', floorH, physicalTruth: truth,
  portalStops: sharedStops, maxRun: 6.2,
});
assert.ok(shared, 'three-room shared wall trunk should fit the unit facade');
assert.equal(vertical.assertFastVerticalRoute(shared), true);
assert.equal(shared.graphAuthority, 'room-portal-first');
assert.equal(shared.portalStops.length, 3, 'three emitted room doors are serviced by one staircase');
assert.equal(shared.flights.length, 3, 'ground->1, 1->2, and 2->3 are distinct real flights');
assert.equal(shared.generatedLandings.length, 3, 'each serviced room floor owns a real exterior landing/deck');
assert.equal(shared.graph.nodes.filter(node => node.kind === 'room').length, 3);
assert.equal(shared.graph.nodes.filter(node => node.kind === 'portal').length, 3);
assert.equal(shared.graph.edges.filter(edge => edge.kind === 'stair-flight').length, 3);
assert.equal(shared.orientation.ascent, 'along-facade-shared-trunk');
for (const flight of shared.flights) {
  assert.equal(flight.axis, 'x', 'north facade stair flights run along the wall, never through the room');
  assert.ok(flight.fixedCoord + flight.halfWidth < -fp.halfZ,
    'north wall stair inner edge must remain outside the host footprint');
}

// A bridge/catwalk portal is already an authoritative support + wall opening.
// The stair binds to it and must not create a competing balcony/deck.
const bridgeStop = {
  floor: 1,
  roomSpaceId: 'unit:bridge-room:1',
  source: 'bridge-portal',
  openingKey: 'm:N:1',
  portal: northPortal(1),
  support: { kind: 'existing-bridge-deck', existing: true, id: 'unit:bridge-support', floor: 1, y: floorH },
};
const bridge = vertical.planSharedVerticalTrunk({
  routeId: 'unit:bridge-trunk', family: 'bridge-access-stair', fp: { ...fp, halfX: 6.2 },
  moduleKey: 'm', dirKey: 'N', floorH, physicalTruth: truth,
  portalStops: [bridgeStop], maxRun: 6.2,
});
assert.ok(bridge);
assert.equal(bridge.flights.length, 1);
assert.equal(bridge.generatedLandings.length, 0, 'existing bridge deck outranks and replaces a generated landing deck');
assert.equal(bridge.upperSupport.kind, 'existing-bridge-deck');

function wallBlocksPortal(wall, portal) {
  const probeY = portal.y + Math.min(1.0, portal.height * 0.5);
  if (!(wall.yMin < probeY && wall.yMax > probeY)) return false;
  if (portal.side === 'north' || portal.side === 'south') {
    if (Math.abs(wall.z1 - portal.z) > 0.05 || Math.abs(wall.z2 - portal.z) > 0.05) return false;
    const lo = Math.min(wall.x1, wall.x2), hi = Math.max(wall.x1, wall.x2);
    return portal.x >= lo - 0.02 && portal.x <= hi + 0.02;
  }
  if (Math.abs(wall.x1 - portal.x) > 0.05 || Math.abs(wall.x2 - portal.x) > 0.05) return false;
  const lo = Math.min(wall.z1, wall.z2), hi = Math.max(wall.z1, wall.z2);
  return portal.z >= lo - 0.02 && portal.z <= hi + 0.02;
}

function flightOutsideHost(route, flight) {
  const fp = route.hostRect;
  const { normalAxis, outward } = route.orientation;
  if (normalAxis === 'z') {
    const face = fp.cz + outward * fp.halfZ;
    return outward < 0
      ? flight.fixedCoord + flight.halfWidth < face - 0.05
      : flight.fixedCoord - flight.halfWidth > face + 0.05;
  }
  const face = fp.cx + outward * fp.halfX;
  return outward < 0
    ? flight.fixedCoord + flight.halfWidth < face - 0.05
    : flight.fixedCoord - flight.halfWidth > face + 0.05;
}

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
let sharedTrunksSeen = 0;
let roomPortalsSeen = 0;
let bridgeAccessSeen = 0;
let routeDecksSeen = 0;
let scaffoldRoutesSeen = 0;

for (const [x, z] of samples) {
  const c = chunk(x, z);
  const payload = await factory.build(c);
  const routes = payload.physics.fastVerticalRoutes ?? [];
  const stairRamps = (payload.physics.ramps ?? []).filter(ramp => ramp.supportKind === 'broad-vertical-stair');
  const landingPlatforms = (payload.physics.platforms ?? []).filter(platform => platform.supportKind === 'broad-vertical-landing');
  const decks = payload.physics.fastExteriorDecks ?? [];
  const semanticConnectors = payload.physics.semanticConnectors ?? [];
  const bridgeFaceKeys = new Set(payload.physics.fastBridgeFaceKeys ?? []);
  const scaffoldRoutes = payload.physics.scaffoldCirculationRoutes ?? [];
  const walls = payload.physics.mazeWalls ?? [];

  for (const scaffoldRoute of scaffoldRoutes) {
    scaffoldRoutesSeen++;
    assert.equal(scaffoldRoute.topology, 'alternating-straight',
      `${c.key}:${scaffoldRoute.id}: switchback fire-escape debt remains parked`);
  }

  for (const route of routes) {
    routesSeen++;
    assert.equal(vertical.assertFastVerticalRoute(route), true);
    assert.equal(route.graphAuthority, 'room-portal-first', `${c.key}:${route.id}: rooms/doors must precede stair geometry`);
    assert.equal(route.shape, 'wall-trunk');
    assert.ok(route.portalStops.length >= 1);
    assert.equal(route.flights.length, route.portalStops.length,
      `${c.key}:${route.id}: every serviced floor transition must own a real flight`);
    assert.ok(route.flights.every(flight => flightOutsideHost(route, flight)),
      `${c.key}:${route.id}: unsupported stair geometry may not enter the host footprint`);
    if (route.portalStops.length > 1) sharedTrunksSeen++;

    const routeFaceKey = `${route.moduleKey}:${route.dirKey}`;
    if (route.family !== 'bridge-access-stair') {
      assert.equal(bridgeFaceKeys.has(routeFaceKey), false,
        `${c.key}:${route.id}: generic stairs/decks may not compete with bridge/catwalk faces`);
    }

    for (const flight of route.flights) {
      assert.ok(stairRamps.some(ramp => ramp.routeId === route.id && ramp.flightId === flight.id),
        `${c.key}:${flight.id}: planned flight missing traversable physics ramp`);
    }

    for (const stop of route.portalStops) {
      if (stop.source === 'bridge-portal') {
        bridgeAccessSeen++;
        continue;
      }
      roomPortalsSeen++;
      assert.ok(semanticConnectors.some(connector => connector.source === 'fast-vertical-room-portal'
          && connector.metadata?.routeId === route.id && connector.metadata?.portalId === stop.portal.id),
        `${c.key}:${route.id}:${stop.portal.id}: room portal connector must publish before the staircase`);
      assert.equal(walls.some(wall => wallBlocksPortal(wall, stop.portal)), false,
        `${c.key}:${route.id}:${stop.portal.id}: stair-served doorway must be a real wall void`);
    }

    for (const landing of route.generatedLandings) {
      routeDecksSeen++;
      assert.ok(landingPlatforms.some(platform => platform.routeId === route.id && platform.landingId === landing.id),
        `${c.key}:${route.id}: generated shared landing/deck must be traversable`);
      assert.ok(decks.some(deck => deck.routeId === route.id && deck.landingId === landing.id),
        `${c.key}:${route.id}: route landing must publish as a circulation-owned balcony/deck`);
    }

    if (route.family === 'bridge-access-stair') {
      assert.equal(route.generatedLandings.length, 0,
        `${c.key}:${route.id}: bridge/catwalk support must win over duplicate deck geometry`);
    }
  }
  await factory.unload(c, payload);
}

assert.ok(routesSeen > 0, 'browser skeleton sample must publish graph-derived vertical routes');
assert.ok(sharedTrunksSeen > 0, 'sample must contain one staircase servicing several room doors/landings');
assert.ok(roomPortalsSeen > 0, 'sample must publish room-derived exterior stair portals');
assert.ok(routeDecksSeen > 0, 'shared stair landings must also restore navigable balconies/decks');
assert.ok(scaffoldRoutesSeen > 0, 'existing fire-escape family must remain present');
console.log('[broad-vertical-movement-selftest] PASS', {
  samples: samples.length,
  routesSeen,
  sharedTrunksSeen,
  roomPortalsSeen,
  bridgeAccessSeen,
  routeDecksSeen,
  scaffoldRoutesSeen,
  invariant: 'room/floor occupancy -> portals -> shared wall stair trunk -> circulation-owned landing decks',
});
