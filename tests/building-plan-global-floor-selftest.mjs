import assert from 'node:assert/strict';
import { planBuildingSidecar } from '../world/architecture/building-plan-sidecar.js';
import { promoteBuildingPlanAuthority } from '../world/architecture/building-plan-authority.js';

const floorH = 3.15;
const modules = [
  { key: 'core', cx: 0, cz: 0, halfX: 4, halfZ: 4, floors: 4, floorBase: 0 },
  { key: 'east', cx: 8, cz: 0, halfX: 4, halfZ: 4, floors: 4, floorBase: 0 },
  { key: 'upper-connector', cx: -8, cz: 0, halfX: 4, halfZ: 4, floors: 3, floorBase: 1 },
  { key: 'isolated-tip', cx: -8, cz: 8, halfX: 4, halfZ: 4, floors: 4, floorBase: 0 },
];
const coreReservation = {
  id: 'selftest:stair:shaft', kind: 'stair-shaft',
  x: 0, z: 0, halfX: 0.9, halfZ: 1.5,
  yMin: 0, yMax: floorH * 4 + 2.1,
  openingWidth: 1.8, openingDepth: 3.0, rampHalfWidth: 0.75,
  integratedFloorLanding: true,
};

const sidecar = planBuildingSidecar({
  worldSeed: 0x21d21d,
  chunkKey: 'selftest:global-floor', chunkX: 1, chunkZ: 0,
  entityId: 'selftest:staggered-building',
  programHint: 'electronics_repair',
  floorHeight: floorH,
  modules,
  circulationReservations: [coreReservation],
});
const plan = promoteBuildingPlanAuthority(sidecar, {
  coreReservationId: coreReservation.id,
  coreReservation,
  chunkKey: 'selftest:global-floor',
  entityId: 'selftest:staggered-building',
});

assert.equal(plan.envelope.verticalAuthority, 'global-floor-bands');
assert.equal(plan.envelope.floorCount, 4);
assert.equal(plan.envelope.minGlobalFloor, 0);
assert.equal(plan.envelope.maxGlobalFloorExclusive, 4);
assert.deepEqual(plan.envelope.modules.map(module => [module.key, module.floorBase, module.floorTop]), [
  ['core', 0, 4],
  ['east', 0, 4],
  ['upper-connector', 1, 4],
  ['isolated-tip', 0, 4],
]);

const floor0 = plan.floors.find(floor => floor.floor === 0);
const floor1 = plan.floors.find(floor => floor.floor === 1);
assert.ok(floor0 && floor1);
assert.deepEqual([...floor0.activeModuleKeys].sort(), ['core', 'east', 'isolated-tip']);
assert.deepEqual([...floor0.plannedModuleKeys].sort(), ['core', 'east']);
assert.deepEqual(floor0.circulationDeferredModuleKeys, ['isolated-tip']);
assert.equal(floor0.diagnostics.unclaimedCellCount, 0);
assert.equal(floor0.diagnostics.circulationDeferredModuleCount, 1);
assert.equal(floor0.yBase, 0);

assert.deepEqual([...floor1.activeModuleKeys].sort(), ['core', 'east', 'isolated-tip', 'upper-connector']);
assert.deepEqual([...floor1.plannedModuleKeys].sort(), ['core', 'east', 'isolated-tip', 'upper-connector']);
assert.deepEqual(floor1.circulationDeferredModuleKeys, []);
assert.equal(floor1.yBase, floorH);
assert.ok(floor1.approximateArea > floor0.approximateArea, 'upper connector must activate the formerly isolated tip as occupied floor area');

const floor0Spaces = plan.topologySpaces.filter(space => space.floor === 0);
assert.ok(floor0Spaces.length > 0);
assert.ok(floor0Spaces.every(space => !space.moduleKeys.includes('isolated-tip')), 'deferred tip must not manufacture occupied floor-0 rooms');
assert.ok(plan.topologySpaces.filter(space => space.floor === 1).some(space => space.moduleKeys.includes('isolated-tip')), 'tip may become occupied once a real same-floor path connects it to the core');
assert.equal(plan.diagnostics.circulationDeferredModuleBands, 1);
assert.equal(plan.diagnostics.unclaimedRasterCellCount, 0);
assert.equal(plan.diagnostics.authorityReady, true);
assert.equal(plan.verticalCore.floorSpaceIds.length, 4);

const elevatedReservation = {
  id: 'selftest:elevated:stair:shaft', kind: 'stair-shaft',
  x: 30, z: 0, halfX: 0.9, halfZ: 1.4,
  yMin: floorH * 2, yMax: floorH * 4 + 2.1,
  openingWidth: 1.8, openingDepth: 2.8, rampHalfWidth: 0.75,
  integratedFloorLanding: true,
};
const elevated = promoteBuildingPlanAuthority(planBuildingSidecar({
  worldSeed: 0x21d21e,
  chunkKey: 'selftest:elevated-global-floor', chunkX: 2, chunkZ: 0,
  entityId: 'selftest:elevated-building',
  programHint: 'electronics_repair',
  floorHeight: floorH,
  modules: [{ key: 'elevated', cx: 30, cz: 0, halfX: 5, halfZ: 5, floors: 2, floorBase: 2 }],
  accessAnchors: [{ id: 'elevated:entry', kind: 'main-entry', x: 25, z: 0, side: 'west', floor: 2 }],
  circulationReservations: [elevatedReservation],
}), {
  coreReservationId: elevatedReservation.id,
  coreReservation: elevatedReservation,
  chunkKey: 'selftest:elevated-global-floor',
  entityId: 'selftest:elevated-building',
});
assert.deepEqual(elevated.floors.map(floor => floor.floor), [2, 3]);
assert.equal(elevated.envelope.floorCount, 2);
assert.equal(elevated.envelope.minGlobalFloor, 2);
assert.equal(elevated.envelope.maxGlobalFloorExclusive, 4);
assert.ok(elevated.floors[0].spaces.some(space => space.role === 'entry'), 'lowest occupied global floor must receive base/entry grammar even when it is not floor 0');
assert.ok(elevated.floors[0].openings.some(opening => opening.id.includes('entrance:elevated:entry')), 'base-floor access anchor must bind at its actual global floor');
assert.ok(elevated.verticalEdges.some(edge => edge.id.endsWith(':vertical:2-3')), 'vertical edge IDs must retain actual global floor bands');

console.log('[building-plan-global-floor-selftest] PASS', {
  floors: plan.floors.map(floor => ({
    floor: floor.floor,
    active: floor.activeModuleKeys.length,
    planned: floor.plannedModuleKeys.length,
    deferred: floor.circulationDeferredModuleKeys.length,
  })),
  elevatedFloors: elevated.floors.map(floor => floor.floor),
  deferredModuleBands: plan.diagnostics.circulationDeferredModuleBands,
  coreFloors: plan.verticalCore.floorSpaceIds.length,
  invariant: 'floorBase/floorTop define real global bands; disconnected hanging tips stay non-occupied until circulation reaches them',
});
