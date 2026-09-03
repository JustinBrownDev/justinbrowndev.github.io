import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';
import { HANGING_CITY_CEILING_Y } from '../world/hanging-city-topology.js';

const worldSeed = 0x13572468;
const scene = new THREE.Scene();
const owners = new Map();
const physics = {
  registerOwnedWorld(id, data, lifecycle = {}) {
    owners.set(id, data);
    const record = { ownerId: id, data, activationState: 'active' };
    lifecycle.onActivationChange?.(record);
    return record;
  },
  unregisterOwnedWorld(id) { return owners.delete(id); },
};
const factory = createKowloonFabricEngine({
  THREE, scene, playerPhysics: physics, directSceneAdd: scene.add.bind(scene),
  worldSeed, chunkSize: 64, landmarkSpacingChunks: 3, yieldControl: null,
});
const chunk = {
  key: '1,0', x: 1, z: 0, centerX: 64, centerZ: 0,
  seed: deterministicChunkSeed(worldSeed, 1, 0),
  weirdness: worldWeirdnessAt(1, 0, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
};
const payload = await factory.build(chunk);
const ceiling = payload.hangingLayer?.payload;
assert.ok(ceiling, 'streamed chunk must include the ceiling peer');
const buildings = ceiling.entities.filter(entity => entity.kind === 'building');
assert.ok(buildings.length > 0);

let variedCompound = null;
let moduleCount = 0;
for (const entity of buildings) {
  assert.equal(entity.floorAlignment, 'ceiling');
  const modules = entity.footprintModules ?? [];
  moduleCount += modules.length;
  const bases = new Set();
  for (const module of modules) {
    const expectedBase = HANGING_CITY_CEILING_Y - module.floors * entity.floorH;
    assert.ok(Math.abs(module.baseY - expectedBase) < 1e-8,
      `${entity.id}:${module.key} must individually anchor its own roof to the white plane`);
    assert.ok(Math.abs(module.roofY - HANGING_CITY_CEILING_Y) < 1e-8);
    assert.equal(module.floorBase, entity.floors - module.floors,
      `${entity.id}:${module.key} must occupy the top-aligned global floor bands`);
    bases.add(module.baseY.toFixed(6));
    const facade = entity.facades?.find(face => face.moduleKey === module.key);
    if (facade) {
      assert.ok(Math.abs(facade.yMin - module.baseY) < 1e-8, 'facade must begin at its module tip/base');
      assert.ok(Math.abs(facade.yMax - HANGING_CITY_CEILING_Y) < 1e-8, 'facade must terminate at the white plane');
    }
  }
  if (bases.size > 1) variedCompound = entity;
}
assert.ok(variedCompound, 'sample must contain a compound whose modules terminate at different downward depths');

const tipPlatforms = ceiling.physics.platforms.filter(item => item.ceilingTipCollision === true);
assert.ok(tipPlatforms.length >= moduleCount, 'every ceiling module must publish a real floor-0/tip collision platform');
for (const entity of buildings) for (const module of entity.footprintModules ?? []) {
  const tip = tipPlatforms.find(item => item.moduleKey === module.key && Math.abs(item.y - module.baseY) < 1e-8);
  assert.ok(tip, `${entity.id}:${module.key} missing floor-0/tip collision`);
  assert.equal(tip.supportKind, 'ceiling-building-tip');
  assert.equal(tip.supportMargin, 0);
}

const roofTasks = (ceiling.refinement?.tasks ?? []).filter(task => task.kind === 'roof-clutter' || task.kind === 'roof-topper');
assert.equal(roofTasks.length, 0, 'ordinary right-side-up rooftop clutter/antennae must never be planned for ceiling-rooted buildings');
const engineSource = fs.readFileSync(new URL('../kowloon-fabric-engine.js', import.meta.url), 'utf8');
assert.doesNotMatch(engineSource, /ceilingRootMass/, 'retired gray root-fill geometry must be absent from the engine');

await factory.commit(chunk, payload);
assert.ok(owners.has(ceiling.ownerId));
await factory.unload(chunk, payload);
factory.disposeShared();
console.log('[cut17-ceiling-module-anchor-selftest] PASS', {
  buildings: buildings.length,
  modules: moduleCount,
  variedCompoundModules: variedCompound.footprintModules.length,
  tipPlatforms: tipPlatforms.length,
  invariant: 'each module roof kisses the white plane; variable module depth creates the stalactite taper; every tip is collidable',
});
