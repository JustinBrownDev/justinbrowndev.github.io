import assert from 'node:assert/strict';
import {
  buildConservativeBuildingObstacles,
  evaluateExteriorRouteCollision,
  exteriorRouteClearanceReservations,
  firstCirculationVolumeConflict,
  publishedCirculationReservation,
  wallSegmentBuildingObstacles,
} from '../world/circulation-collision-authority.js';

const hostRect = { cx: 0, cz: 0, halfX: 6, halfZ: 3 };
const route = {
  id: 'cut12:north-route',
  side: 'north',
  hostRect,
  physicalTruth: { stair: { headroomSI: 2.05 } },
  flights: [{
    id: 'flight:0', axis: 'x', from: -2.2, to: 2.2, fixedCoord: -3.75,
    halfWidth: 0.45, y0: 0, y1: 3.2, headroom: 2.05,
  }],
  generatedLandings: [{
    id: 'landing:1', y: 3.2,
    geometry: { x: 2.9, z: -4.0, hx: 0.7, hz: 0.92 },
  }],
};

const clearances = exteriorRouteClearanceReservations(route);
assert.equal(clearances.length, 2, 'flight + landing must publish candidate clearance volumes before acceptance');
assert.ok(clearances.every(item => item.maxZ < -3), 'north exterior circulation must stop outside the facade plane');
assert.ok(clearances.every(item => Object.isFrozen(item)), 'collision authority records remain immutable');
const published = publishedCirculationReservation(clearances[0]);
assert.notEqual(published, clearances[0], 'legacy circulation publication must not share the immutable authority object');
assert.equal(Object.isExtensible(published), true, 'legacy circulation publication must remain annotatable');
assert.equal(published.semanticConnectorEligible, false, 'collision-only clearance must not synthesize a semantic access connector');
published.connectorId = 'selftest:connector';
assert.equal(published.connectorId, 'selftest:connector');
assert.equal(clearances[0].connectorId, undefined, 'legacy annotation must not mutate collision authority truth');

const hostObstacle = [{
  id: 'host', minX: -6, maxX: 6, minZ: -3, maxZ: 3, yMin: 0, yMax: 12,
}];
const clear = evaluateExteriorRouteCollision({ plan: route, obstacles: hostObstacle, hostRect, side: 'north' });
assert.equal(clear.accepted, true, 'a route separated from the host facade by a real wall gap must be valid');
assert.equal(clear.apertureExceptionAllowed, false, 'doors are handoffs, never permission for a stair solid to enter the building');

const foreignObstacle = [{
  id: 'foreign', minX: -3, maxX: 3, minZ: -4.6, maxZ: -3.35, yMin: 0, yMax: 20,
}];
const blocked = evaluateExteriorRouteCollision({ plan: route, obstacles: [...hostObstacle, ...foreignObstacle], hostRect, side: 'north' });
assert.equal(blocked.accepted, false, 'flight/landing volume intersecting another building must be rejected');
assert.equal(blocked.blockers[0].obstacle.id, 'foreign');

const penetrating = {
  ...route,
  id: 'cut12:penetrating',
  flights: [{ ...route.flights[0], id: 'flight:bad', fixedCoord: -2.95 }],
  generatedLandings: [],
};
const penetration = evaluateExteriorRouteCollision({ plan: penetrating, obstacles: [], hostRect, side: 'north' });
assert.equal(penetration.accepted, false, 'host aperture may not legalize a flight that crosses the facade plane');
assert.ok(penetration.hostBoundaryViolations.length > 0);

const obstacles = buildConservativeBuildingObstacles({
  currentSiteId: 3,
  modulePlans: [{ key: 'host-module', rect: hostRect, floors: 4 }],
  floorH: 3.2,
  siteIdOf: [[3, -1, 8]],
  openSiteIds: new Set(),
  cx0: 0, cz0: 0, half: 10.5, cellSize: 7,
});
assert.ok(obstacles.some(item => item.moduleKey === 'host-module'));
assert.ok(obstacles.some(item => item.siteId === 8 && item.obstacleSource === 'pre-massing-site-cell'));

assert.equal(firstCirculationVolumeConflict(clearances, [{
  id: 'far', minX: 30, maxX: 31, minZ: 30, maxZ: 31, yMin: 0, yMax: 10,
}]), null);
assert.ok(firstCirculationVolumeConflict(clearances, foreignObstacle));

const wallObstacles = wallSegmentBuildingObstacles([{
  x1: -3, z1: -3.6, x2: 3, z2: -3.6, yMin: 0, yMax: 8, supportKind: 'building-shell',
}]);
assert.equal(wallObstacles.length, 1);
assert.ok(firstCirculationVolumeConflict(clearances, wallObstacles),
  'already-published exact wall geometry must participate in the same collision contract');

console.log('[circulation-collision-authority-selftest] PASS', {
  invariant: 'exterior flight/landing clearance -> facade termination -> building-envelope rejection -> interior handoff only',
  candidateVolumes: clearances.length,
});
