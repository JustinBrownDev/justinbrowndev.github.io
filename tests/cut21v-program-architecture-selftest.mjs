import assert from 'node:assert/strict';
import { planBuildingSidecar } from '../world/architecture/building-plan-sidecar.js';
import { promoteBuildingPlanAuthority } from '../world/architecture/building-plan-authority.js';
import { deriveBuildingSemanticTruth } from '../world/building-semantic-truth.js';

const floorH = 3.15;
const physicalTruth = {
  floorHeight: { realizedSI: floorH },
  door: { clearWidth: { realizedSI: 0.91 }, clearHeight: { realizedSI: 2.08 } },
  route: { clearWidthSI: 0.91, headroomSI: 2.05 },
};
const core = {
  id: 'cut21v:core', kind: 'stair-shaft',
  x: 0, z: 0, halfX: 0.7, halfZ: 1.7,
  yMin: 0, yMax: 40,
  openingWidth: 1.4, openingDepth: 3.4, rampHalfWidth: 0.6,
  integratedFloorLanding: true,
};

function plan(programHint, family, { skyFloor = null, entityId = programHint } = {}) {
  const anchors = [{ id: `${entityId}:main`, kind: 'main-entry', x: 0, z: 8, side: 'south', floor: 0 }];
  if (skyFloor != null) anchors.push({
    id: `${entityId}:sky`, kind: 'city-exchange', endpointId: `${entityId}:endpoint`, bridgeId: `${entityId}:bridge`,
    x: -9, z: 0, side: 'west', floor: skyFloor, traversalPermission: 'PUBLIC_THROUGH', routeCharacter: 'VERTICAL_COLLECTOR',
  });
  return planBuildingSidecar({
    worldSeed: 0x21_16_21_22,
    chunkKey: '0,0', chunkX: 0, chunkZ: 0,
    entityId: `cut21v:${entityId}`,
    programHint,
    physicalUse: { family },
    physicalTruth,
    floorHeight: floorH,
    modules: [{ key: 'main', cx: 0, cz: 0, halfX: 9, halfZ: 8, floors: 3 }],
    accessAnchors: anchors,
    circulationReservations: [core],
  });
}

// Generic family truth must no longer invent a specific tenant/program.
const generic = deriveBuildingSemanticTruth({
  worldSeed: 1, chunkKey: '1,1', entityId: 'generic-industrial', physicalUse: { family: 'industrial-service' },
});
assert.equal(generic.program, 'generic_industrial');
assert.equal(generic.programSpecificity, 'generic-family-program');

// Program and morphology are separate: related bay-hall programs share morphology
// options but retain different operational plans.
const fire = plan('fire_station', 'industrial-service');
const auto = plan('auto_shop', 'industrial-service');
assert.equal(fire.programArchitecture.id, 'fire-station');
assert.equal(auto.programArchitecture.id, 'auto-shop');
assert.ok(['clear-span-industrial', 'service-band-workshop'].includes(fire.grammar.id));
assert.ok(['clear-span-industrial', 'service-band-workshop'].includes(auto.grammar.id));
assert.ok(fire.floors[0].spaces.some(space => space.templateKey === 'apparatus-bay'));
assert.ok(auto.floors[0].spaces.some(space => space.templateKey === 'repair-bay'));
assert.ok(fire.programArchitectureEvidence.flowHealthy);
assert.ok(auto.programArchitectureEvidence.flowHealthy);
assert.ok(fire.programArchitectureEvidence.identityFixtures.includes('apparatus-bay-clear-span'));

// Clinic operational flow is not a generic institutional-room cluster.
const clinic = plan('clinic', 'assembly-institutional', { skyFloor: 1 });
assert.equal(clinic.programArchitecture.id, 'clinic');
for (const key of ['waiting', 'reception', 'patient-corridor', 'exam-room', 'nurse-work', 'clean-supply', 'soiled-utility']) {
  assert.ok(clinic.floors[0].spaces.some(space => space.templateKey === key), `clinic missing ${key}`);
}
assert.ok(clinic.programArchitectureEvidence.directTransitionRatio >= 0.75);
assert.ok(clinic.programArchitectureEvidence.serviceSpineSpaceCount >= 2);

// An elevated public route becomes a real public program floor, not merely an
// upper generic floor with a bridge hole in it.
const retail = plan('convenience', 'mercantile-public', { skyFloor: 1, entityId: 'sky-retail' });
const routeFloor = retail.floors.find(floor => floor.floor === 1);
const salesFloor = routeFloor.spaces.find(space => space.templateKey === 'sales-floor');
assert.ok(salesFloor, 'route-served retail floor should contain a sales floor');
assert.equal(salesFloor.frontagePriority, 'required');
assert.ok(salesFloor.circulationFrontage?.eligible, 'sales floor must front the actual public route spine');
assert.ok(salesFloor.circulationFrontage.routeBoundaryEdges > 0);
assert.ok(routeFloor.spaces.some(space => space.templateKey === 'route-spine' && space.traversalPermission === 'PUBLIC_THROUGH'));

// Court programs retain three semantically distinct circulation regimes.
const court = plan('courtroom', 'assembly-institutional');
const courtGround = court.floors[0];
assert.equal(courtGround.spaces.find(space => space.templateKey === 'public-corridor')?.traversalPermission, 'PUBLIC_THROUGH');
assert.equal(courtGround.spaces.find(space => space.templateKey === 'judge-route')?.traversalPermission, 'STAFF_THROUGH');
assert.equal(courtGround.spaces.find(space => space.templateKey === 'secure-route')?.traversalPermission, 'SECURE');
assert.equal(courtGround.spaces.find(space => space.templateKey === 'holding')?.traversalPermission, 'SECURE');
assert.ok(court.programArchitectureEvidence.flowHealthy);

// Warehouse semantics expose the actual goods path instead of storage-stack aliases.
const warehouse = plan('warehouse', 'storage');
for (const key of ['receiving', 'staging-in', 'aisle-grid', 'storage', 'pick-pack', 'staging-out', 'shipping']) {
  assert.ok(warehouse.floors[0].spaces.some(space => space.templateKey === key), `warehouse missing ${key}`);
}
assert.ok(warehouse.programArchitectureEvidence.flowHealthy);
assert.ok(warehouse.programArchitectureEvidence.identityFixtures.includes('loading-dock'));

// A dwelling is now an envelope with a nested room plan. Promotion emits those
// room partitions as actual wall geometry while the whole unit remains private
// to the city circulation graph.
const apartment = plan('apartment', 'residential-lodging');
const units = apartment.spaces.filter(space => space.templateKey === 'dwelling-unit');
assert.ok(units.length >= 3, 'larger domestic envelopes should reduce unit count before they reduce unit size');
assert.ok(units.every(space => space.traversalPermission === 'PRIVATE_DESTINATION_ONLY'));
assert.ok(units.every(space => space.realizedArea + 1e-7 >= 48), 'dwelling envelopes must retain the real-space area floor');
assert.ok(units.every(space => space.realizedShortDimension + 1e-7 >= 4.2), 'dwelling envelopes must not become pencil strips');
const nestedUnits = units.filter(space => space.unitPlan?.roomCount === 5);
assert.ok(nestedUnits.length >= 1, 'a sufficiently deep dwelling should still realize a real nested room plan');
assert.ok(nestedUnits.every(space => space.unitPlan.rooms.some(room => room.key === 'entry')));
assert.ok(nestedUnits.every(space => space.unitPlan.rooms.some(room => room.key === 'bedroom')));
assert.ok(nestedUnits.every(space => space.unitPlan.rooms.some(room => room.key === 'bathroom')));
for (const unit of nestedUnits) {
  assert.ok(unit.unitPlan.rooms.every(room => room.shortDimension + 1e-7 >= room.minimumShortDimension),
    `dwelling unit ${unit.key}: nested rooms must satisfy their metre-scale short dimension`);
  const keys = new Set(unit.unitPlan.rooms.map(room => room.key));
  const neighbors = new Map([...keys].map(key => [key, []]));
  for (const [a, b] of unit.unitPlan.adjacency) {
    if (!keys.has(a) || !keys.has(b)) continue;
    neighbors.get(a).push(b);
    neighbors.get(b).push(a);
  }
  const seen = new Set(['entry']);
  const queue = ['entry'];
  while (queue.length) {
    const next = queue.shift();
    for (const neighbor of neighbors.get(next) ?? []) {
      if (seen.has(neighbor)) continue;
      seen.add(neighbor);
      queue.push(neighbor);
    }
  }
  assert.equal(seen.size, keys.size, `dwelling unit ${unit.key} nested room graph must be connected from its entry`);
  const entryRoom = unit.unitPlan.rooms.find(room => room.key === 'entry');
  const minX = Math.min(...unit.regions.map(region => region.minX));
  const maxX = Math.max(...unit.regions.map(region => region.maxX));
  const minZ = Math.min(...unit.regions.map(region => region.minZ));
  const maxZ = Math.max(...unit.regions.map(region => region.maxZ));
  if (unit.unitPlan.corridorSide === 'north') assert.ok(Math.abs(entryRoom.minZ - minZ) < 1e-6);
  if (unit.unitPlan.corridorSide === 'south') assert.ok(Math.abs(entryRoom.maxZ - maxZ) < 1e-6);
  if (unit.unitPlan.corridorSide === 'west') assert.ok(Math.abs(entryRoom.minX - minX) < 1e-6);
  if (unit.unitPlan.corridorSide === 'east') assert.ok(Math.abs(entryRoom.maxX - maxX) < 1e-6);
}
assert.equal(apartment.programArchitectureEvidence.nestedDwellingUnitCount, nestedUnits.length);
const promotedApartment = promoteBuildingPlanAuthority(apartment, {
  coreReservationId: core.id,
  coreReservation: core,
  chunkKey: '0,0',
  entityId: 'cut21v:apartment',
});
const unitWalls = promotedApartment.wallRuns.filter(run => run.unitPlan === true);
assert.ok(unitWalls.length >= nestedUnits.length * 2, 'only physically deep apartment envelopes should emit interior partitions');
assert.ok(unitWalls.some(run => run.gaps.length > 0), 'nested unit partitions should own real interior door gaps');

console.log('[cut21v-program-architecture-selftest] PASS', {
  fireMorphology: fire.grammar.id,
  autoMorphology: auto.grammar.id,
  clinicFlowRatio: clinic.programArchitectureEvidence.directTransitionRatio,
  elevatedRetailFrontage: salesFloor.circulationFrontage.routeBoundaryEdges,
  courtPermissions: Object.fromEntries(['public-corridor', 'judge-route', 'secure-route'].map(key => [key, courtGround.spaces.find(space => space.templateKey === key)?.traversalPermission])),
  warehouseFlowRatio: warehouse.programArchitectureEvidence.directTransitionRatio,
  apartmentUnits: units.length,
  apartmentNestedUnits: nestedUnits.length,
  apartmentAdaptableUnits: units.length - nestedUnits.length,
  apartmentUnitWalls: unitWalls.length,
});
