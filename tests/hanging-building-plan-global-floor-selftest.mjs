import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';

const worldSeed = 0x13572468;
const chunkSize = 64;
const scene = new THREE.Scene();
const playerPhysics = {
  registerOwnedWorld() { return { activationState: 'active' }; },
  unregisterOwnedWorld() { return true; },
};
const factory = createKowloonFabricEngine({
  THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene),
  worldSeed, chunkSize, landmarkSpacingChunks: 3, yieldControl: null,
});
const chunk = {
  key: '1,0', x: 1, z: 0, centerX: 64, centerZ: 0,
  seed: deterministicChunkSeed(worldSeed, 1, 0),
  weirdness: worldWeirdnessAt(1, 0, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
};
const payload = await factory.build(chunk);
const hanging = payload.hangingLayer?.payload;
assert.ok(hanging, 'fixture must publish hanging peer payload');
const buildings = hanging.entities.filter(entity => entity.kind === 'building' && entity.buildingPlan);
assert.ok(buildings.length > 0, 'fixture must contain hanging buildings with BuildingPlan authority');

let variedBuildings = 0;
let deferredModuleBands = 0;
let activeBands = 0;
for (const entity of buildings) {
  const modules = entity.footprintModules ?? [];
  const plan = entity.buildingPlan;
  assert.equal(plan.envelope.verticalAuthority, 'global-floor-bands');
  assert.equal(plan.envelope.moduleCount, modules.length, `${entity.id} BuildingPlan must see the full hanging compound, not only the primary module`);
  assert.equal(plan.envelope.modules.length, modules.length);
  assert.equal(plan.diagnostics.unclaimedRasterCellCount, 0);
  assert.equal(plan.diagnostics.authorityReady, true);

  const footprintByKey = new Map(modules.map(module => [module.key, module]));
  if (new Set(modules.map(module => module.floorBase)).size > 1) variedBuildings++;
  for (const module of plan.envelope.modules) {
    const physical = footprintByKey.get(module.key);
    assert.ok(physical, `${entity.id}:${module.key} plan module must map to a physical footprint module`);
    assert.equal(module.floorBase, physical.floorBase);
    assert.equal(module.floorTop, physical.floorBase + physical.floors);
    assert.equal(module.floors, physical.floors);
  }

  for (const floor of plan.floors) {
    const expectedActive = modules
      .filter(module => floor.floor >= module.floorBase && floor.floor < module.floorBase + module.floors)
      .map(module => module.key).sort();
    assert.deepEqual([...floor.activeModuleKeys].sort(), expectedActive, `${entity.id}:f${floor.floor} active modules must follow physical global floor bands`);
    const planned = new Set(floor.plannedModuleKeys);
    const deferred = new Set(floor.circulationDeferredModuleKeys);
    assert.ok([...planned].every(key => expectedActive.includes(key)));
    assert.ok([...deferred].every(key => expectedActive.includes(key)));
    assert.equal(planned.size + deferred.size, expectedActive.length, `${entity.id}:f${floor.floor} every active module must be planned or explicitly circulation-deferred`);
    deferredModuleBands += deferred.size;
    activeBands += expectedActive.length;

    const floorSpaces = plan.topologySpaces.filter(space => space.floor === floor.floor);
    assert.ok(floorSpaces.every(space => space.moduleKeys.every(key => planned.has(key))), `${entity.id}:f${floor.floor} occupied spaces may only bind modules in the circulation-served component`);
  }
}

assert.ok(variedBuildings > 0, 'fixture must exercise ceiling-aligned modules with different floorBase values');
assert.ok(deferredModuleBands > 0, 'fixture must exercise at least one lower hanging tip deferred until a circulation-connected floor');

console.log('[hanging-building-plan-global-floor-selftest] PASS', {
  buildings: buildings.length,
  variedBuildings,
  activeModuleFloorBands: activeBands,
  circulationDeferredModuleBands: deferredModuleBands,
  invariant: 'hanging BuildingPlan sees every module on its real global floor band; disconnected tips do not become fake occupied rooms',
});
