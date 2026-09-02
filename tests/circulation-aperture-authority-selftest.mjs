import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoPath = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const repo = path.resolve(repoPath);
const url = rel => pathToFileURL(path.join(repo, rel)).href;

const [{ semanticPortalForRect }, vertical, physical, facade] = await Promise.all([
  import(url('world/semantic-connectors.js') + '?09=1'),
  import(url('world/fast-vertical-route.js') + '?09=1'),
  import(url('world/physical-truth.js') + '?09=1'),
  import(url('world/fast-facade-architecture.js') + '?09=1'),
]);

const truth = physical.resolvePhysicalTruth({
  physicalUse: 'industrial-service', role: 'maintenance-access', weirdness: 0.31,
  stableKey: '09-circulation-aperture-authority',
});
const rect = { cx: 10, cz: -4, halfX: 6.0, halfZ: 3.0 };
const centered = semanticPortalForRect({
  id: 'centered', rect, side: 'north', floor: 1, floorH: 3.2, physicalTruth: truth,
});
const explicitNull = semanticPortalForRect({
  id: 'explicit-null', rect, side: 'north', floor: 1, floorH: 3.2, tangent: null, physicalTruth: truth,
});
const explicit = semanticPortalForRect({
  id: 'explicit', rect, side: 'north', floor: 1, floorH: 3.2, tangent: 13.2, physicalTruth: truth,
});
assert.equal(centered.x, rect.cx, 'legacy/default semantic portal placement must remain centered');
assert.equal(explicitNull.x, rect.cx, 'null tangent must mean no placement preference, never world-coordinate zero');
assert.equal(explicit.x, 13.2, 'semantic portal must consume circulation-selected facade tangent');
assert.equal(explicit.tangent, 13.2);
assert.equal(explicit.z, rect.cz - rect.halfZ);

const demand = floor => ({
  floor,
  roomSpaceId: `room:${floor}`,
  landingSpaceId: `street:${floor}`,
  source: 'fast-vertical-room-portal',
  openingKey: `m:N:${floor}`,
  portalId: `door:${floor}`,
  width: truth.door.clearWidth.realizedSI,
  height: truth.door.clearHeight.realizedSI,
  depth: truth.door.approachDepthSI,
  placementAuthority: 'occupancy-access-demand',
  preferredTangent: null,
});
const route = vertical.planExteriorStreetLayerTrunk({
  routeId: '09:route', family: 'shared-exterior-street-trunk', fp: rect,
  moduleKey: 'm', dirKey: 'N', side: 'north', floorH: 3.2, physicalTruth: truth,
  layerStops: [
    { floor: 1, transportKind: 'balcony-street-layer', accessDemands: [demand(1)] },
    { floor: 2, transportKind: 'balcony-street-layer', accessDemands: [] },
    { floor: 3, transportKind: 'balcony-street-layer', accessDemands: [demand(3)] },
  ],
  maxRun: 6.5,
});
assert.ok(route, 'circulation route must satisfy occupancy access demands without pre-placed portals');
assert.equal(vertical.assertFastVerticalRoute(route), true);
assert.equal(route.portalStops.length, 2);
for (const stop of route.portalStops) {
  assert.equal(stop.placementAuthority, 'occupancy-access-demand');
  assert.equal(stop.preferredTangent, null);
  assert.equal(stop.portal.placementAuthority, 'circulation-landing');
  assert.equal(stop.portal.id, stop.portalId);
  const landing = route.landings.find(item => Number(item.floor) === Number(stop.floor));
  assert.ok(landing, `${stop.portalId}: destination landing missing`);
  assert.equal(stop.portal.landingId, landing.id);
  assert.equal(stop.portal.tangent, landing.targetPoint.x,
    `${stop.portalId}: north-facade door must be placed from the accepted landing target`);
  assert.equal(stop.portal.x, landing.targetPoint.x);
  assert.equal(stop.portal.z, rect.cz - rect.halfZ);
}

const bridgeAnchorTangent = 12.6;
const bridgeDemand = {
  ...demand(1),
  source: 'bridge-portal',
  placementAuthority: 'external-anchor',
  preferredTangent: bridgeAnchorTangent,
  portalId: 'bridge:door:1',
};
const bridgeRoute = vertical.planExteriorStreetLayerTrunk({
  routeId: '09:bridge-route', family: 'walkway-anchored-street-trunk', fp: rect,
  moduleKey: 'm', dirKey: 'N', side: 'north', floorH: 3.2, physicalTruth: truth,
  layerStops: [{ floor: 1, transportKind: 'bridge-anchored-street-layer', accessDemands: [bridgeDemand] }],
  maxRun: 6.5,
});
assert.ok(bridgeRoute, 'existing bridge anchor must remain a satisfiable circulation demand');
assert.equal(bridgeRoute.portalStops.length, 1);
assert.equal(bridgeRoute.portalStops[0].portal.tangent, bridgeAnchorTangent,
  'existing bridge/catwalk anchors must keep their explicit facade tangent');
assert.equal(bridgeRoute.portalStops[0].portal.placementAuthority, 'external-anchor');

const facadePlan = facade.planFastFacadeArchitecture({
  stableKey: '09:facade', floorH: 3.2,
  faces: [{ moduleKey: 'm', dirKey: 'N', side: 'north', floors: 4, rect, openings: [] }],
  defaultDoorWidth: truth.door.clearWidth.realizedSI,
  defaultDoorHeight: truth.door.clearHeight.realizedSI,
});
assert.ok(facadePlan.metrics.windows > 0, 'fixture must generate inhabited windows');
assert.equal(facadePlan.apertures.length, facadePlan.metrics.windows,
  'every inhabited facade window must publish one structural aperture');
assert.ok(facadePlan.apertures.every(item => item.kind === 'window' && item.bottom > 0 && item.height > 0));

const engine = fs.readFileSync(path.join(repo, 'kowloon-fabric-engine.js'), 'utf8');
assert.match(engine, /function addCompoundSideWall[\s\S]*const rawOpenings = Array\.isArray\(opening\)/,
  'shell must consume a multi-aperture schedule');
assert.match(engine, /makeRoomAccessDemand/,
  'occupancy must emit access demands');
assert.doesNotMatch(engine, /makeRoomPortalStop/,
  'occupancy may not pre-place a concrete room portal');
assert.match(engine, /facadeAperturesByKey/,
  'window aperture schedule must be available before wall emission');
assert.ok((engine.match(/\[landing\.incomingMouth, landing\.outgoingMouth\]/g) ?? []).length >= 2,
  'fast vertical and scaffold landing guards must both consume incoming + outgoing planner mouths');
assert.doesNotMatch(engine, /const incomingFlight = plan\.flights\.find\(flight => flight\.toLandingId === landing\.id\)/,
  'runtime may not rescan flights and open only the downward mouth');
assert.match(engine, /height: physicalTruth\?\.door\?\.clearHeight\?\.realizedSI/,
  'primary door shell opening must carry clear height for lintel reconstruction');
assert.match(engine, /height: servicePhysicalTruth\?\.door\?\.clearHeight\?\.realizedSI/,
  'service\/bridge door shell opening must carry clear height for lintel reconstruction');

console.log('[circulation-aperture-authority-selftest] PASS', {
  invariant: 'occupancy access demand -> circulation placement -> semantic portal -> rectangular shell aperture -> exact landing mouths',
  placedDoors: route.portalStops.length,
  windowApertures: facadePlan.apertures.length,
});
