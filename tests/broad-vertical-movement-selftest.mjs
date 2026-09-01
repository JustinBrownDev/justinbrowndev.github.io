import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoPath = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const repo = path.resolve(repoPath);
const url = rel => pathToFileURL(path.join(repo, rel)).href;

globalThis.window = {};
globalThis.location = { search: '?generationProfile=skeleton&buildBudgetMs=5.5' };

const [{ createKowloonFabricEngine }, THREE, stream, perf, vertical, policyMod, physical] = await Promise.all([
  import(url('kowloon-fabric-engine.js') + '?street-layer-selftest=1'),
  import(url('vendor/three/three.module.js') + '?street-layer-selftest=1'),
  import(url('world-chunk-streamer.js') + '?street-layer-selftest=1'),
  import(url('config/performance-isolation.js') + '?street-layer-selftest=1'),
  import(url('world/fast-vertical-route.js') + '?street-layer-selftest=1'),
  import(url('world/exterior-street-layer-policy.js') + '?street-layer-selftest=1'),
  import(url('world/physical-truth.js') + '?street-layer-selftest=1'),
]);

assert.equal(perf.GENERATION_PROFILE_NAME, 'skeleton');
assert.equal(perf.GENERATION_LANES.broadStrokesOnly, true, 'street-layer rewrite must stay on the fast shell');
assert.equal(perf.GENERATION_LANES.microEnrichment, false);
assert.equal(perf.GENERATION_LANES.authoredDecoration, false);

const noBridgePolicy = policyMod.planExteriorStreetLayerPolicy({ floors: 5, maxLayers: 4, maxExteriorConnections: 2 });
assert.deepEqual([...noBridgePolicy.layerFloors], [1, 2, 3, 4]);
assert.deepEqual([...noBridgePolicy.occupancyPortalFloors], [1, 4], 'four transport layers should still emit at most two occupancy doors');
const bridgePolicy = policyMod.planExteriorStreetLayerPolicy({ floors: 5, existingPortalFloors: [1], maxLayers: 4, maxExteriorConnections: 2 });
assert.deepEqual([...bridgePolicy.layerFloors], [1, 2, 3, 4]);
assert.deepEqual([...bridgePolicy.occupancyPortalFloors], [4], 'existing walkway portal consumes the exterior-connection budget first');
assert.ok(policyMod.EXTERIOR_CIRCULATION_DEBT.some(item => item.tag === 'CIRC_DEBT_REAL_ROOM_AUTHORITY'));
assert.ok(policyMod.EXTERIOR_CIRCULATION_DEBT.some(item => item.tag === 'CIRC_DEBT_STANDALONE_FIRE_ESCAPE_HEADROOM'));

const truth = physical.resolvePhysicalTruth({
  physicalUse: 'industrial-service', role: 'maintenance-access', weirdness: 0.35,
  stableKey: 'street-layer-selftest',
});
const fp = { cx: 0, cz: 0, halfX: 5.8, halfZ: 3.2 };
const floorH = 3.35;
const northPortal = floor => ({
  id: `unit:north:${floor}`,
  x: 0, y: floor * floorH, z: -fp.halfZ,
  width: 1.25, height: 2.2, depth: 1.2,
  side: 'north', normalX: 0, normalZ: -1,
});
const roomStop = floor => ({
  floor,
  roomSpaceId: `unit:occupancy:${floor}`,
  source: 'fast-vertical-room-portal',
  openingKey: `m:N:${floor}`,
  portal: northPortal(floor),
});
const unitLayers = [
  { floor: 1, transportKind: 'balcony-street-layer', portals: [roomStop(1)] },
  { floor: 2, transportKind: 'balcony-street-layer', portals: [] },
  { floor: 3, transportKind: 'balcony-street-layer', portals: [roomStop(3)] },
];
const shared = vertical.planExteriorStreetLayerTrunk({
  routeId: 'unit:street-layers', family: 'shared-exterior-street-trunk', fp,
  moduleKey: 'm', dirKey: 'N', side: 'north', floorH, physicalTruth: truth,
  layerStops: unitLayers, maxRun: 6.2,
});
assert.ok(shared, 'three stacked transport layers should fit the unit facade');
assert.equal(vertical.assertFastVerticalRoute(shared), true);
assert.equal(shared.graphAuthority, 'exterior-street-layer-first');
assert.equal(shared.shape, 'street-layer-trunk');
assert.equal(shared.streetLayers.length, 3, 'transport layers are independent of the number of occupancy doors');
assert.equal(shared.portalStops.length, 2, 'one occupancy should not receive a door at every transport layer');
assert.equal(shared.flights.length, 3, 'ground->1->2->3 uses one vertical edge per neighboring street layer');
assert.equal(shared.graph.edges.filter(edge => edge.kind === 'vertical-layer-neighbor').length, 3);
assert.equal(shared.graph.edges.filter(edge => edge.kind === 'occupancy-threshold').length, 2);
assert.ok(shared.generatedLandings.every(landing => landing.stairThroat), 'every generated street layer must carve a stair-headroom throat');
for (const flight of shared.flights) {
  assert.equal(flight.axis, 'x', 'north facade street trunk must run along the wall');
  assert.ok(flight.fixedCoord + flight.halfWidth < -fp.halfZ,
    'unsupported wall stair must remain outside the occupancy footprint');
}

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
  const host = route.hostRect;
  const { normalAxis, outward } = route.orientation;
  if (normalAxis === 'z') {
    const face = host.cz + outward * host.halfZ;
    return outward < 0
      ? flight.fixedCoord + flight.halfWidth < face - 0.05
      : flight.fixedCoord - flight.halfWidth > face + 0.05;
  }
  const face = host.cx + outward * host.halfX;
  return outward < 0
    ? flight.fixedCoord + flight.halfWidth < face - 0.05
    : flight.fixedCoord - flight.halfWidth > face + 0.05;
}

function rectOverlap(a, b, epsilon = 0.015) {
  return Math.abs(a.x - b.x) < a.hx + b.hx - epsilon
    && Math.abs(a.z - b.z) < a.hz + b.hz - epsilon;
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
let multiLayerRoutesSeen = 0;
let occupancyPortalsSeen = 0;
let bridgeAccessSeen = 0;
let streetLayerDecksSeen = 0;
let throatsSeen = 0;
let scaffoldRoutesSeen = 0;
let consumedScaffoldChecks = 0;

for (const [x, z] of samples) {
  const c = chunk(x, z);
  const payload = await factory.build(c);
  const routes = payload.physics.fastVerticalRoutes ?? [];
  const stairRamps = (payload.physics.ramps ?? []).filter(ramp => ramp.supportKind === 'broad-vertical-stair');
  const landingPlatforms = (payload.physics.platforms ?? []).filter(platform => platform.supportKind === 'broad-vertical-landing');
  const decks = payload.physics.fastExteriorDecks ?? [];
  const throats = payload.physics.fastStairThroats ?? [];
  const semanticConnectors = payload.physics.semanticConnectors ?? [];
  const scaffoldRoutes = payload.physics.scaffoldCirculationRoutes ?? [];
  const walls = payload.physics.mazeWalls ?? [];

  for (const scaffoldRoute of scaffoldRoutes) {
    scaffoldRoutesSeen++;
    assert.equal(scaffoldRoute.topology, 'alternating-straight',
      `${c.key}:${scaffoldRoute.id}: switchback composition debt remains parked`);
  }

  for (const route of routes) {
    routesSeen++;
    assert.equal(vertical.assertFastVerticalRoute(route), true);
    assert.equal(route.graphAuthority, 'exterior-street-layer-first');
    assert.equal(route.shape, 'street-layer-trunk');
    assert.ok(route.streetLayers.length >= 1);
    assert.equal(route.flights.length, route.streetLayers.length,
      `${c.key}:${route.id}: vertical movement must connect neighboring street layers, not individual doors`);
    assert.ok(route.portalStops.filter(stop => stop.source !== 'bridge-portal').length <= 2,
      `${c.key}:${route.id}: occupancy exterior-door budget exceeded`);
    assert.ok(route.flights.every(flight => flightOutsideHost(route, flight)),
      `${c.key}:${route.id}: unsupported stair geometry may not enter occupancy footprint`);
    if (route.streetLayers.length > 1) multiLayerRoutesSeen++;

    const sameModuleScaffold = scaffoldRoutes.some(scaffold => scaffold.moduleKey === route.moduleKey);
    assert.equal(sameModuleScaffold, false,
      `${c.key}:${route.id}: accepted balcony street trunk must consume redundant fire escape on the same occupancy module`);
    consumedScaffoldChecks++;

    for (const flight of route.flights) {
      assert.ok(stairRamps.some(ramp => ramp.routeId === route.id && ramp.flightId === flight.id),
        `${c.key}:${flight.id}: planned layer-neighbor flight missing traversable physics ramp`);
    }

    for (const stop of route.portalStops) {
      if (stop.source === 'bridge-portal') {
        bridgeAccessSeen++;
        continue;
      }
      occupancyPortalsSeen++;
      assert.ok(semanticConnectors.some(connector => connector.source === 'fast-vertical-room-portal'
          && connector.metadata?.routeId === route.id && connector.metadata?.portalId === stop.portal.id),
        `${c.key}:${route.id}:${stop.portal.id}: selected occupancy portal must publish`);
      assert.equal(walls.some(wall => wallBlocksPortal(wall, stop.portal)), false,
        `${c.key}:${route.id}:${stop.portal.id}: selected occupancy doorway must be a real wall void`);
    }

    for (const landing of route.generatedLandings) {
      streetLayerDecksSeen++;
      const pieces = landingPlatforms.filter(platform => platform.routeId === route.id && platform.landingId === landing.id);
      assert.ok(pieces.length > 0, `${c.key}:${route.id}:${landing.id}: street layer must retain walkable deck pieces`);
      assert.ok(decks.some(deck => deck.routeId === route.id && deck.landingId === landing.id && deck.kind === 'exterior-street-layer'),
        `${c.key}:${route.id}:${landing.id}: generated balcony must publish as a transport layer`);
      assert.ok(landing.stairThroat, `${c.key}:${route.id}:${landing.id}: stair throat missing`);
      const throat = throats.find(item => item.routeId === route.id && item.landingId === landing.id);
      assert.ok(throat, `${c.key}:${route.id}:${landing.id}: realized throat registry missing`);
      throatsSeen++;
      assert.equal(pieces.some(piece => rectOverlap(piece, throat)), false,
        `${c.key}:${route.id}:${landing.id}: deck slab still caps the stair headroom throat`);
    }
  }
  await factory.unload(c, payload);
}

assert.ok(routesSeen > 0, 'browser skeleton sample must publish exterior street-layer routes');
assert.ok(multiLayerRoutesSeen > 0, 'sample must get off the one-floor pattern and publish stacked exterior street layers');
assert.ok(occupancyPortalsSeen > 0, 'sample must attach sparse occupancy doors to street layers');
assert.ok(streetLayerDecksSeen > 0, 'sample must publish balconies/decks as horizontal transport');
assert.ok(throatsSeen > 0, 'generated street layers must expose stair headroom throats');
assert.ok(consumedScaffoldChecks > 0, 'sample must verify street-layer trunks consume redundant same-module fire escapes');
console.log('[broad-vertical-movement-selftest] PASS', {
  samples: samples.length,
  routesSeen,
  multiLayerRoutesSeen,
  occupancyPortalsSeen,
  bridgeAccessSeen,
  streetLayerDecksSeen,
  throatsSeen,
  scaffoldRoutesSeen,
  debtTags: policyMod.EXTERIOR_CIRCULATION_DEBT.map(item => item.tag),
  invariant: 'occupancy demand -> sparse portals -> stacked street layers -> neighbor flights; balconies are transport, not per-door decoration',
});
