import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createPlayerPhysics } from '../player-physics.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';

const position = { x: 0, y: 1.65, z: 0 };
const playerPhysics = createPlayerPhysics({
  position, eyeHeight: 1.65, playerRadius: 0.22, wallThickness: 0.12,
  worldToCell: () => ({ col: 0, row: 0 }), grid: [[true]], buildingWallSegments: new Map(),
  propColliders: [], elevatedPlatforms: [], rampRuns: [], overheadCeilings: [], boundsHalf: 100,
  maxStepHeight: 0.65, stepDownTolerance: 0.5, jumpSpeed: 5.5, gravity: -16,
  maxSubstepSeconds: 1 / 90, maxHorizontalSubstep: 0.09, maxVerticalSubstep: 0.1, maxSubsteps: 32,
});
const scene = new THREE.Scene();
const fabric = createKowloonFabricEngine({ THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene), worldSeed: 0xA11CE, chunkSize: 64, yieldControl: null });
const root = new THREE.Group();
root.userData.worldChunkRoot = true; root.userData.worldChunkKey = '1,0'; root.userData.worldChunkOwnerId = 'selftest:partial';
root.userData.renderAuthority = 'KowloonFabricEngine'; root.userData.streamAuthority = 'WorldChunkStreamer'; root.visible = false;
const overlap = { x: 0, z: 0, radius: 0.55, yMin: 0, height: 3 };
const sibling = { x: 4, z: 0, radius: 0.55, yMin: 0, height: 3 };
const payload = { ownerId: 'selftest:partial', root, physics: { platforms: [], ceilings: [], ramps: [], props: [overlap, sibling], mazeWalls: [] }, committed: false, disposed: false, worldMatricesReady: false, physicsPublished: false };
const chunk = { key: '1,0', x: 1, z: 0 };

await fabric.commit(chunk, payload);
assert.equal(payload.physicsActivationState, 'active', 'partial overlap must not stage the whole chunk');
assert.equal(overlap.__physicsDisabled, true);
assert.equal(sibling.__physicsDisabled, false);
assert.equal(playerPhysics.ownedWorldStats().deferredItems, 1);
fabric.setVisible(chunk, payload, true);
assert.equal(root.visible, true, 'visible chunk publishes even while its exact overlapping primitive waits');
assert.equal(fabric.verifyReady(chunk, payload, true), true);

position.x = 7;
playerPhysics.syncFromPosition({ forceAirborne: false, resetVelocity: true });
assert.equal(overlap.__physicsDisabled, false, 'overlap primitive activates after the player clears it');
assert.equal(playerPhysics.ownedWorldStats().deferredItems, 0);
assert.equal(root.visible, true);
fabric.setVisible(chunk, payload, false); assert.equal(root.visible, false);
fabric.setVisible(chunk, payload, true); assert.equal(root.visible, true);
console.log('[render-collision-activation-selftest] PASS', { activationState: payload.physicsActivationState, owned: playerPhysics.ownedWorldStats() });
