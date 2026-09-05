import assert from 'node:assert/strict';
import { planBuildingSidecar } from '../world/architecture/building-plan-sidecar.js';
import { promoteBuildingPlanAuthority } from '../world/architecture/building-plan-authority.js';

const floorH = 3.15;
const physicalTruth = {
  floorHeight: { realizedSI: floorH },
  door: { clearWidth: { realizedSI: 0.91 }, clearHeight: { realizedSI: 2.08 } },
  route: { clearWidthSI: 0.91, headroomSI: 2.05 },
};
const core = {
  id: 'cut21u:core', kind: 'stair-shaft',
  x: 0, z: 0, halfX: 0.7, halfZ: 1.7,
  yMin: 0, yMax: 40,
  openingWidth: 1.4, openingDepth: 3.4, rampHalfWidth: 0.6,
  integratedFloorLanding: true,
};

const lodging = planBuildingSidecar({
  worldSeed: 0x21_15,
  chunkKey: '0,0', chunkX: 0, chunkZ: 0,
  entityId: 'cut21u:lodging',
  programHint: 'motel_room',
  physicalUse: { family: 'residential-lodging' },
  physicalTruth,
  floorHeight: floorH,
  modules: [{ key: 'lodging', cx: 0, cz: 0, halfX: 7, halfZ: 7, floors: 5 }],
  accessAnchors: [{ id: 'main', kind: 'main-entry', x: 0, z: 7, side: 'south', floor: 0 }],
  circulationReservations: [core],
});

assert.equal(lodging.architecturalField.phase, 'forensic-spawn');
assert.ok(lodging.floors.every(floor => floor.diagnostics.rectangleFirstPreferred === true));
const privateRooms = lodging.floors.flatMap(floor => floor.spaces.filter(space => space.role === 'private'));
assert.ok(privateRooms.length >= 15, 'fixture must exercise a repeated residential population');
assert.ok(privateRooms.every(space => space.regions.length === 1), 'ordinary near-city private rooms should be one rectangular region');
assert.ok(privateRooms.every(space => space.regularity.rectangularity >= 0.999), 'ordinary near-city private rooms should fill their bounding rectangle');
assert.ok(privateRooms.every(space => space.regularity.neckCellCount === 0), 'ordinary near-city private rooms must not contain neck cells');
assert.ok(lodging.floors.every(floor => !floor.diagnostics.occupancyHallway
  || floor.diagnostics.occupancyHallway.directlyServedOccupancyCount === floor.diagnostics.occupancyHallway.occupancyCount),
'packed residential bays must retain direct hallway frontage');

for (const room of privateRooms) {
  assert.equal(room.traversalPermission, 'PRIVATE_DESTINATION_ONLY');
  assert.equal(room.throughRoutingEligible, false);
}
const services = lodging.floors.flatMap(floor => floor.spaces.filter(space => space.role === 'service'));
assert.ok(services.length > 0);
assert.ok(services.every(space => space.traversalPermission === 'SERVICE_THROUGH'));
const publicRouteSpaces = lodging.floors.flatMap(floor => floor.spaces.filter(space => ['entry', 'circulation', 'public'].includes(space.role)));
assert.ok(publicRouteSpaces.every(space => space.traversalPermission === 'PUBLIC_THROUGH'));

const interiorDoors = lodging.floors.flatMap(floor => floor.openings.filter(opening => opening.kind === 'interior-door'));
assert.ok(interiorDoors.length > 0);
assert.ok(interiorDoors.every(opening => opening.doorPlacementAuthority === 'architectural-wall-return-and-directness'));
assert.ok(interiorDoors.some(opening => Number(opening.wallReturn) > 0), 'door scorer should prefer a real wall return when the shared wall permits it');

const skyPublic = planBuildingSidecar({
  worldSeed: 0x21_16,
  chunkKey: '0,0', chunkX: 0, chunkZ: 0,
  entityId: 'cut21u:sky-public',
  programHint: 'bar',
  physicalUse: { family: 'mercantile-public' },
  physicalTruth,
  floorHeight: floorH,
  modules: [{ key: 'public', cx: 0, cz: 0, halfX: 7, halfZ: 6, floors: 5 }],
  accessAnchors: [
    { id: 'street', kind: 'main-entry', x: 0, z: 6, side: 'south', floor: 0 },
    {
      id: 'sky-route', kind: 'city-exchange', endpointId: 'sky-route:endpoint', bridgeId: 'sky-route:bridge',
      x: -7, z: 0, side: 'west', floor: 2, traversalPermission: 'PUBLIC_THROUGH', routeCharacter: 'VERTICAL_COLLECTOR',
    },
  ],
  circulationReservations: [core],
});
const skyFloor = skyPublic.floors.find(floor => floor.floor === 2);
assert.ok(skyFloor, 'upper circulation-route floor must exist');
assert.equal(skyFloor.cityExchangeBindings.length, 1);
const upperFrontage = skyFloor.spaces.filter(space => space.circulationFrontage?.eligible);
assert.ok(upperFrontage.length > 0, 'upper public route should create circulation-frontage opportunities');
const publicFrontage = upperFrontage.find(space => space.role === 'public');
assert.ok(publicFrontage, 'public program envelope should be able to front an elevated city route');
assert.equal(publicFrontage.regularity.rectangularity, 1, 'route-front public envelope should remain rectangular near spawn');
assert.ok(publicFrontage.circulationFrontage.routeBoundaryEdges >= 2);
assert.ok(publicFrontage.circulationFrontage.exposedFacadeEdges > 0);
assert.equal(publicFrontage.circulationFrontage.programAuthority, 'frontage-only-program-deferred-to-21v');

const promoted = promoteBuildingPlanAuthority(skyPublic, {
  coreReservationId: core.id,
  coreReservation: core,
  chunkKey: '0,0',
  entityId: 'cut21u:sky-public',
});
const promotedFrontage = promoted.topologySpaces.find(space => space.id === publicFrontage.id);
assert.ok(promotedFrontage?.circulationFrontage?.eligible, 'circulation frontage must survive Building Plan promotion');
assert.equal(promotedFrontage.traversalPermission, 'PUBLIC_THROUGH');

const far = planBuildingSidecar({
  worldSeed: 0x21_17,
  chunkKey: '50,50', chunkX: 50, chunkZ: 50,
  distanceChunks: Math.hypot(50, 50), weirdnessSampled: 1,
  entityId: 'cut21u:far',
  programHint: 'motel_room',
  physicalUse: { family: 'residential-lodging' },
  physicalTruth,
  floorHeight: floorH,
  modules: [{ key: 'far', cx: 0, cz: 0, halfX: 7, halfZ: 7, floors: 3 }],
  accessAnchors: [{ id: 'far-main', kind: 'main-entry', x: 0, z: 7, side: 'south', floor: 0 }],
  circulationReservations: [core],
});
assert.ok(far.architecturalField.inversion >= 0.82);
assert.ok(far.floors.every(floor => floor.diagnostics.rectangleFirstPreferred === false),
  'far reversal must retain permission to loosen rectangle-first invariants instead of globally sterilizing the city');

console.log('[cut21u-believable-building-plans-selftest] PASS', {
  privateRooms: privateRooms.length,
  privateRectangles: privateRooms.filter(space => space.regularity.rectangularity >= 0.999).length,
  privateNeckCells: privateRooms.reduce((sum, space) => sum + space.regularity.neckCellCount, 0),
  elevatedFrontageFloor: skyFloor.floor,
  elevatedFrontageSpaces: upperFrontage.map(space => space.key),
  permissions: [...new Set(lodging.spaces.map(space => space.traversalPermission))].sort(),
});
