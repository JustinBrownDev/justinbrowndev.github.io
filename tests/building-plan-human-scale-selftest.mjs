import assert from 'node:assert/strict';
import { planBuildingSidecar } from '../world/architecture/building-plan-sidecar.js';
import { assertBuildingPlanAuthority, promoteBuildingPlanAuthority } from '../world/architecture/building-plan-authority.js';

const stair = {
  id: 'human-scale:stair-shaft',
  kind: 'stair-shaft',
  x: 0,
  z: 0,
  halfX: 0.58,
  halfZ: 2.55,
  openingWidth: 1.16,
  openingDepth: 5.10,
  rampHalfWidth: 0.45,
  yMin: 0,
  yMax: 22,
};
const physicalTruth = {
  schema: 'jweb.physical-truth.v1',
  floorHeight: { realizedSI: 3.15 },
  door: { clearWidth: { realizedSI: 0.91 }, clearHeight: { realizedSI: 2.08 } },
  route: { clearWidthSI: 0.91, headroomSI: 2.05 },
};

const sidecar = planBuildingSidecar({
  worldSeed: 0x12c0111,
  chunkKey: '12,0', chunkX: 12, chunkZ: 0,
  entityId: 'human-scale-building',
  programHint: 'residential-lodging',
  physicalUse: { family: 'residential-lodging' },
  physicalTruth,
  floorHeight: 3.15,
  modules: [
    { key: '0,0', cx: -3.5, cz: 0, halfX: 3.5, halfZ: 3.5, floors: 4 },
    { key: '1,0', cx: 3.5, cz: 0, halfX: 3.5, halfZ: 3.5, floors: 4 },
    { key: '0,1', cx: -3.5, cz: 7, halfX: 3.5, halfZ: 3.5, floors: 4 },
    { key: '1,1', cx: 3.5, cz: 7, halfX: 3.5, halfZ: 3.5, floors: 4 },
  ],
  accessAnchors: [{ id: 'main', kind: 'main-entry', x: -3.5, z: -3.5, side: 'north', floor: 0 }],
  circulationReservations: [stair],
});

assert.equal(sidecar.floors.length, 4);
for (const floor of sidecar.floors) {
  assert.equal(floor.diagnostics.minimumAreaHealthy, true, `floor ${floor.floor}: room floor-area minimum`);
  assert.equal(floor.diagnostics.minimumVolumeHealthy, true, `floor ${floor.floor}: room enclosed-volume minimum`);
  assert.equal(floor.diagnostics.minimumProgramShortfallCells, 0, `floor ${floor.floor}: floor plate must fit the minimum program`);
  assert.ok(floor.diagnostics.stairCirculationApronCellCount > 0,
    `floor ${floor.floor}: persistent stair must own a walk-around circulation apron`);
  for (const space of floor.spaces) {
    assert.ok(space.realizedArea + 1e-7 >= space.minimumArea, `${space.id}: squeezed below minimum area`);
    assert.ok(space.realizedVolume + 1e-7 >= space.minimumVolume, `${space.id}: squeezed below minimum volume`);
  }
}

const promoted = promoteBuildingPlanAuthority(sidecar, {
  coreReservationId: stair.id,
  coreReservation: stair,
  chunkKey: '12,0',
  entityId: 'human-scale-building',
});
assert.equal(assertBuildingPlanAuthority(promoted), true);
assert.equal(promoted.verticalCore.floorSpaceIds.length, 4);

console.log('[building-plan-human-scale-selftest] PASS', {
  floors: sidecar.floors.length,
  spaces: sidecar.floors.reduce((sum, floor) => sum + floor.spaces.length, 0),
  invariant: 'larger floor plate -> minimum room volume/area -> protected stair walk-around apron -> reachable doors',
});
