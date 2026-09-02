import assert from 'node:assert/strict';
import { planBuildingSidecar } from '../world/architecture/building-plan-sidecar.js';
import { assertBuildingPlanAuthority, promoteBuildingPlanAuthority } from '../world/architecture/building-plan-authority.js';

const reservation = {
  id: 'stair:subcell-core', kind: 'stair-shaft',
  x: 0, z: 0, halfX: 0.12, halfZ: 0.12, yMin: 0, yMax: 50,
};
const physicalTruth = {
  schema: 'jweb.physical-truth.v1',
  floorHeight: { realizedSI: 3.15 },
  door: { clearWidth: { realizedSI: 0.91 }, clearHeight: { realizedSI: 2.08 } },
  route: { clearWidthSI: 0.91, headroomSI: 2.05 },
};
const sidecar = planBuildingSidecar({
  worldSeed: 0x08c0a11,
  chunkKey: '0,0', chunkX: 0, chunkZ: 0, isSpawn: true,
  entityId: 'subcell-core-building', signatureType: 'systemsWorkshop',
  physicalUse: { family: 'industrial-service' },
  physicalTruth, floorHeight: 3.15,
  modules: [{ key: '0,0', cx: 0, cz: 0, halfX: 4, halfZ: 4, floors: 12 }],
  accessAnchors: [{ id: 'main', kind: 'main-entry', x: 0, z: -4, side: 'north', floor: 0 }],
  circulationReservations: [reservation],
});

assert.equal(sidecar.floors.length, 12);
assert.ok(sidecar.floors.every(floor => floor.diagnostics.structuralReservationCellCount > 0),
  'a narrow authoritative shaft must survive rasterization on every occupied floor');
assert.ok(sidecar.floors.every(floor => floor.spaces.some(space =>
  space.structuralReservationIds.includes(reservation.id))),
  'every floor must assign the persistent shaft cells to an eligible entry/circulation space');

const promoted = promoteBuildingPlanAuthority(sidecar, {
  coreReservationId: reservation.id,
  coreReservation: reservation,
  chunkKey: '0,0',
  entityId: 'subcell-core-building',
});
assertBuildingPlanAuthority(promoted);
assert.equal(promoted.verticalCore.reservationId, reservation.id);
assert.equal(promoted.verticalCore.floorSpaceIds.length, 12,
  'persistent vertical core must reach all twelve floors even when its footprint is narrower than a planning cell');

console.log('[building-plan-reservation-raster-selftest] PASS', {
  floors: sidecar.floors.length,
  coreFloors: promoted.verticalCore.floorSpaceIds.length,
  invariant: 'authoritative stair/shaft reservations are conservatively rasterized by cell intersection, never lost between cell centers',
});
