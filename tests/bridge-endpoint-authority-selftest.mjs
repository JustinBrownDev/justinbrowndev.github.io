import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { resolvePhysicalTruth } from '../world/physical-truth.js';
import { planExteriorStreetLayerTrunk } from '../world/fast-vertical-route.js';

const EPS = 1e-6;
const near = (a, b, eps = EPS) => Math.abs(Number(a) - Number(b)) <= eps;

// Planner-level contract: reuse the exact bridge-anchor geometry that already
// survived 10's hard-fit code in the 09 regression. 10 adds the stronger label
// and doorway-containment assertions without inventing a second planner fixture.
const truth = resolvePhysicalTruth({
  physicalUse: 'industrial-service', role: 'maintenance-access', weirdness: 0.31,
  stableKey: '09-circulation-aperture-authority',
});
const anchorTangent = 12.6;
const direct = planExteriorStreetLayerTrunk({
  routeId: '09:bridge-route',
  family: 'walkway-anchored-street-trunk',
  fp: { cx: 10, cz: -4, halfX: 6, halfZ: 3 },
  siteId: 1,
  moduleKey: 'm',
  dirKey: 'N',
  side: 'north',
  floorH: 3.2,
  physicalTruth: truth,
  layerStops: [{
    floor: 1,
    accessDemands: [{
      floor: 1,
      roomSpaceId: 'room:1',
      landingSpaceId: 'street:1',
      source: 'bridge-portal',
      openingKey: 'm:N:1',
      portalId: 'bridge:door:1',
      width: truth.door.clearWidth.realizedSI,
      height: truth.door.clearHeight.realizedSI,
      depth: truth.door.approachDepthSI,
      preferredTangent: anchorTangent,
      placementAuthority: 'external-anchor',
    }],
    transportKind: 'bridge-anchored-street-layer',
  }],
  stableKey: '09:bridge-route',
  maxRun: 6.5,
});
assert.ok(direct, 'the known-good bridge anchor must remain satisfiable under hard landing-fit authority');
const directStop = direct.portalStops[0];
assert.equal(directStop.portal.placementAuthority, 'external-anchor');
assert.ok(near(directStop.portal.tangent, anchorTangent), 'circulation may not move an external bridge endpoint');
const directLanding = direct.generatedLandings.find(item => item.id === directStop.portal.landingId);
assert.ok(directLanding?.geometry, 'external bridge endpoint requires a physical landing');
const directCenter = direct.orientation.tangentAxis === 'x' ? directLanding.geometry.x : directLanding.geometry.z;
const directHalf = direct.orientation.tangentAxis === 'x' ? directLanding.geometry.hx : directLanding.geometry.hz;
assert.ok(anchorTangent - directStop.portal.width * 0.5 >= directCenter - directHalf - EPS);
assert.ok(anchorTangent + directStop.portal.width * 0.5 <= directCenter + directHalf + EPS);

// Runtime contract: bridge plan, endpoint shell, stair landing and bridge deck all
// share the exact same endpoint objects and planar facade coordinates.
const scene = new THREE.Scene();
const owners = new Map();
const playerPhysics = {
  registerOwnedWorld(id, data) { owners.set(id, data); },
  unregisterOwnedWorld(id) { return owners.delete(id); },
};
const factory = createKowloonFabricEngine({
  THREE,
  scene,
  playerPhysics,
  directSceneAdd: scene.add.bind(scene),
  worldSeed: 0x10B01D6E,
  chunkSize: 64,
  yieldControl: null,
});

const grid = Array.from({ length: 7 }, () => Array(7).fill(false));
const siteIdOf = Array.from({ length: 7 }, () => Array(7).fill(-1));
const sites = [];
let siteId = 300;
for (let row = 1; row < 6; row += 2) {
  for (let col = 1; col < 6; col += 2) {
    grid[row][col] = true;
    siteIdOf[row][col] = siteId;
    sites.push({ id: siteId, cells: [{ col, row }] });
    siteId++;
  }
}
const relationship = factory.planAuthoredBridgeNetwork({ sites, siteIdOf, grid, weirdness: 1, maxBridges: 18 });
assert.ok(relationship.bridgePlans.length > 0, 'fixture must produce a bridge');
const bridge = relationship.bridgePlans[0];
assert.equal(bridge.endpointAuthority, 'bridge-facade-endpoint-v1');
assert.ok(bridge.aEndpoint && bridge.bEndpoint, 'bridge plan must own both endpoint records');
const aListed = relationship.bridgePortalsBySite.get(bridge.aSiteId)?.find(item => item.id === bridge.aEndpoint.id);
const bListed = relationship.bridgePortalsBySite.get(bridge.bSiteId)?.find(item => item.id === bridge.bEndpoint.id);
assert.strictEqual(aListed, bridge.aEndpoint, 'site A must receive the same endpoint object owned by the bridge plan');
assert.strictEqual(bListed, bridge.bEndpoint, 'site B must receive the same endpoint object owned by the bridge plan');

const cellToWorld = (col, row) => ({ x: (col - 3) * 20, z: (row - 3) * 20 });
const colHalf = () => 8;
const rowHalf = () => 8;
const endpointSites = sites.filter(site => site.id === bridge.aSiteId || site.id === bridge.bSiteId);
const payloadBySite = new Map();
let routedRuntimeEndpoints = 0;
for (const site of endpointSites) {
  const cell = site.cells[0];
  const moduleKey = `${cell.col},${cell.row}`;
  const payload = factory.buildAuthoredSite({
    site,
    siteIdOf,
    grid,
    cellToWorld,
    colHalf,
    rowHalf,
    ownerId: `bridge-endpoint-site:${site.id}`,
    weirdness: 0.42,
    bridgePortalsBySite: relationship.bridgePortalsBySite,
    structureProfile: {
      primaryFloors: 3,
      // Deliberately disagree. A bridge-linked authored tower must join the
      // shared exchange datum rather than carrying private story-height drift
      // into a supposedly flat sky street.
      floorHeight: site.id === bridge.aSiteId ? 3.0 : 4.1,
      floorCountByCell: { [moduleKey]: 3 },
    },
  });
  assert.ok(payload?.entity, `endpoint site ${site.id} must build`);
  assert.ok(near(payload.entity.floorH, 3.15), 'bridge-linked authored tower must adopt the shared 3.15m exchange grid');
  payloadBySite.set(site.id, payload);
}

for (const endpoint of [bridge.aEndpoint, bridge.bEndpoint]) {
  assert.equal(endpoint.resolved, true, `${endpoint.id}: endpoint must resolve before shell publication`);
  assert.equal(endpoint.endpointAuthority, 'bridge-facade-endpoint-v1');
  assert.equal(endpoint.placementAuthority, 'external-anchor');
  for (const field of ['x', 'y', 'z', 'tangent', 'width', 'height']) assert.ok(Number.isFinite(Number(endpoint[field])), `${endpoint.id}: ${field} missing`);

  const siteIdForEndpoint = endpoint.endpointRole === 'a' ? bridge.aSiteId : bridge.bSiteId;
  const payload = payloadBySite.get(siteIdForEndpoint);
  const route = (payload.physics.fastVerticalRoutes ?? []).find(candidate =>
    candidate.portalStops?.some(stop => stop.source === 'bridge-portal' && stop.metadata?.anchorPortalId === endpoint.id));
  // Exterior stair service is optional. When circulation elects to service this
  // already-physical bridge endpoint, the endpoint is a hard anchor: the stair
  // may reject the route but may never move the bridge doorway.
  if (route) {
    routedRuntimeEndpoints++;
    const stop = route.portalStops.find(item => item.source === 'bridge-portal' && item.metadata?.anchorPortalId === endpoint.id);
    assert.equal(stop.portal.placementAuthority, 'external-anchor');
    assert.ok(near(stop.portal.tangent, endpoint.tangent), `${endpoint.id}: stair route moved the bridge endpoint`);
    const landing = route.generatedLandings.find(item => item.id === stop.portal.landingId);
    assert.ok(landing?.geometry, `${endpoint.id}: bridge route landing missing`);
    const center = route.orientation.tangentAxis === 'x' ? landing.geometry.x : landing.geometry.z;
    const half = route.orientation.tangentAxis === 'x' ? landing.geometry.hx : landing.geometry.hz;
    assert.ok(endpoint.tangent - endpoint.width * 0.5 >= center - half - EPS, `${endpoint.id}: doorway starts outside landing`);
    assert.ok(endpoint.tangent + endpoint.width * 0.5 <= center + half + EPS, `${endpoint.id}: doorway ends outside landing`);
  }

  // At doorway body height the exterior shell must not cross the endpoint point.
  const probeY = endpoint.y + Math.min(1.0, endpoint.height * 0.5);
  const shellBlocksEndpoint = (payload.physics.mazeWalls ?? []).some(wall => {
    if (wall.supportKind) return false;
    if (!(probeY > Number(wall.yMin) + 0.02 && probeY < Number(wall.yMax) - 0.02)) return false;
    const horizontal = Math.abs(Number(wall.z1) - Number(wall.z2)) <= EPS;
    if (horizontal) {
      return Math.abs(endpoint.z - Number(wall.z1)) <= 0.03
        && endpoint.x >= Math.min(Number(wall.x1), Number(wall.x2)) - EPS
        && endpoint.x <= Math.max(Number(wall.x1), Number(wall.x2)) + EPS;
    }
    return Math.abs(endpoint.x - Number(wall.x1)) <= 0.03
      && endpoint.z >= Math.min(Number(wall.z1), Number(wall.z2)) - EPS
      && endpoint.z <= Math.max(Number(wall.z1), Number(wall.z2)) + EPS;
  });
  assert.equal(shellBlocksEndpoint, false, `${endpoint.id}: wall aperture is not centered on resolved bridge endpoint`);
}

if (bridge.axis === 'x') {
  assert.ok(near(bridge.aEndpoint.z, bridge.bEndpoint.z), 'x bridge endpoint tangents must share z');
} else {
  assert.ok(near(bridge.aEndpoint.x, bridge.bEndpoint.x), 'z bridge endpoint tangents must share x');
}

const bridgePayload = factory.buildAuthoredBridge({ bridge, payloadBySite, ownerId: 'bridge-endpoint-link' });
assert.ok(bridgePayload, 'resolved bridge must build');
const bridgePlatform = bridgePayload.physics.platforms.find(platform => ['guarded-catwalk', 'hanging-bridge'].includes(platform.supportKind));
assert.ok(bridgePlatform, 'resolved bridge must publish a walkable platform');
const bridgeConnector = bridgePayload.physics.semanticConnectors.find(connector => connector.kind === 'bridge');
assert.ok(bridgeConnector, 'resolved bridge must publish a semantic bridge connector');
assert.equal(bridgeConnector.metadata?.endpointAuthority, 'bridge-facade-endpoint-v1');
assert.equal(bridgeConnector.metadata?.aEndpointId, bridge.aEndpoint.id);
assert.equal(bridgeConnector.metadata?.bEndpointId, bridge.bEndpoint.id);

if (bridge.axis === 'x') {
  assert.ok(near(bridgePlatform.x - bridgePlatform.hx, bridge.aEndpoint.x), 'bridge slab must start at endpoint A wall plane');
  assert.ok(near(bridgePlatform.x + bridgePlatform.hx, bridge.bEndpoint.x), 'bridge slab must end at endpoint B wall plane');
  assert.ok(near(bridgePlatform.z, bridge.aEndpoint.z), 'bridge slab fixed coordinate must equal facade endpoint tangent');
  assert.ok(near(bridgeConnector.endpoints[0].x, bridge.aEndpoint.x));
  assert.ok(near(bridgeConnector.endpoints[0].z, bridge.aEndpoint.z));
  assert.ok(near(bridgeConnector.endpoints[1].x, bridge.bEndpoint.x));
  assert.ok(near(bridgeConnector.endpoints[1].z, bridge.bEndpoint.z));
} else {
  assert.ok(near(bridgePlatform.z - bridgePlatform.hz, bridge.aEndpoint.z), 'bridge slab must start at endpoint A wall plane');
  assert.ok(near(bridgePlatform.z + bridgePlatform.hz, bridge.bEndpoint.z), 'bridge slab must end at endpoint B wall plane');
  assert.ok(near(bridgePlatform.x, bridge.aEndpoint.x), 'bridge slab fixed coordinate must equal facade endpoint tangent');
  assert.ok(near(bridgeConnector.endpoints[0].x, bridge.aEndpoint.x));
  assert.ok(near(bridgeConnector.endpoints[0].z, bridge.aEndpoint.z));
  assert.ok(near(bridgeConnector.endpoints[1].x, bridge.bEndpoint.x));
  assert.ok(near(bridgeConnector.endpoints[1].z, bridge.bEndpoint.z));
}

factory.disposeShared();
console.log('[bridge-endpoint-authority-selftest] PASS', {
  bridgeId: bridge.id,
  axis: bridge.axis,
  aEndpoint: { x: bridge.aEndpoint.x, z: bridge.aEndpoint.z, tangent: bridge.aEndpoint.tangent },
  bEndpoint: { x: bridge.bEndpoint.x, z: bridge.bEndpoint.z, tangent: bridge.bEndpoint.tangent },
  routedRuntimeEndpoints,
  invariant: 'bridge plan endpoint = facade aperture = bridge deck endpoint; if exterior circulation services it, the endpoint is an immovable external anchor',
});
