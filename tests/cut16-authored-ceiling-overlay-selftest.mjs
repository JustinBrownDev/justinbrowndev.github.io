import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { HANGING_CITY_CEILING_Y } from '../world/hanging-city-topology.js';
const worldSeed = 0xdecafbad;
const scene = new THREE.Scene();
const rawAdd = scene.add.bind(scene);
const owners = new Map();
const playerPhysics = {
  registerOwnedWorld(id, data, lifecycle={}) { owners.set(id,data); const record={activationState:'active'}; lifecycle.onActivationChange?.(record); return record; },
  unregisterOwnedWorld(id) { return owners.delete(id); },
};
const factory = createKowloonFabricEngine({ THREE, scene, playerPhysics, directSceneAdd: rawAdd, worldSeed, chunkSize: 64, yieldControl: null });
const origin = factory.buildAuthoredOriginChunk();
await factory.commit(origin.chunk, origin);
const groundEntities = [{
  id:'authored-ground', kind:'building', floors:4, floorH:3.15, x:0,z:0,halfX:6,halfZ:6,
  compoundBounds:{minX:-6,maxX:6,minZ:-6,maxZ:6},
}];
const overlay = await factory.buildAuthoredCeilingOverlay({ groundEntities, ownerId:'authored-ceiling-test' });
assert.ok(overlay?.root);
assert.equal(overlay.root.userData.worldChunkKey, '0,0');
assert.ok(overlay.root.children.some(child => child.name?.startsWith('ceiling-plane:')));
assert.ok(overlay.entities.some(entity => entity.kind === 'building'));
await factory.commit(overlay.chunk, overlay);
assert.equal(overlay.root.parent, origin.root, 'authored ceiling overlay must publish as an origin component');
assert.ok(owners.has('authored-ceiling-test'));
assert.ok(overlay.entities.filter(e=>e.kind==='building').every(e=>e.ceilingY===HANGING_CITY_CEILING_Y));
await factory.unload(origin.chunk, origin);
assert.equal(owners.has('authored-ceiling-test'), false);
factory.disposeShared();
console.log('[cut16-authored-ceiling-overlay-selftest] PASS', { buildings: overlay.buildings, ceilingY: HANGING_CITY_CEILING_Y });
