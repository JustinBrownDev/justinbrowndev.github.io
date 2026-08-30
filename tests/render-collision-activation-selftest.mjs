import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createPlayerPhysics } from '../player-physics.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';

const position = { x: 0, y: 1.65, z: 0 };
const playerPhysics = createPlayerPhysics({
  position,
  eyeHeight: 1.65,
  playerRadius: 0.22,
  wallThickness: 0.12,
  worldToCell: () => ({ col: 0, row: 0 }),
  grid: [[true]],
  buildingWallSegments: new Map(),
  mazeSealWalls: [],
  propColliders: [],
  elevatedPlatforms: [],
  rampRuns: [],
  overheadCeilings: [],
  boundsHalf: 100,
  maxStepHeight: 0.65,
  stepDownTolerance: 0.5,
  jumpSpeed: 5.5,
  gravity: -16,
  maxSubstepSeconds: 1 / 90,
  maxHorizontalSubstep: 0.09,
  maxVerticalSubstep: 0.1,
  maxSubsteps: 32,
});

const scene = new THREE.Scene();
const rawSceneAdd = scene.add.bind(scene);
const fabric = createKowloonFabricEngine({
  THREE,
  scene,
  playerPhysics,
  directSceneAdd: rawSceneAdd,
  worldSeed: 0xA11CE,
  chunkSize: 64,
  yieldControl: null,
});

const root = new THREE.Group();
root.name = 'selftest:late-owner';
root.userData.worldChunkRoot = true;
root.userData.worldChunkKey = '1,0';
root.userData.worldChunkOwnerId = 'selftest:late-owner';
root.userData.renderAuthority = 'KowloonFabricEngine';
root.userData.streamAuthority = 'WorldChunkStreamer';
root.visible = false;

const overlap = { x: 0, z: 0, radius: 0.55, yMin: 0, height: 3 };
const sibling = { x: 4, z: 0, radius: 0.55, yMin: 0, height: 3 };
const payload = {
  ownerId: 'selftest:late-owner',
  root,
  physics: { platforms: [], ceilings: [], ramps: [], props: [overlap, sibling], mazeWalls: [] },
  committed: false,
  disposed: false,
  worldMatricesReady: false,
  physicsPublished: false,
};
const chunk = { key: '1,0', x: 1, z: 0 };

await fabric.commit(chunk, payload);
assert.equal(payload.physicsActivationState, 'deferred-player-overlap', 'owner intersecting the current player must stage instead of materializing through them');
assert.equal(overlap.__physicsDisabled, true, 'overlapping collider must remain non-authoritative while staged');
assert.equal(sibling.__physicsDisabled, true, 'non-overlapping sibling collider must also remain staged with its owner');
assert.equal(playerPhysics.ownedWorldStats().deferredItems, 2, 'the entire two-collider owner must be deferred as one authority unit');

fabric.setVisible(chunk, payload, true);
assert.equal(payload.requestedVisible, true, 'streamer visibility request must be retained while owner is staged');
assert.equal(root.visible, false, 'staged collision owner must not publish visible geometry');
assert.equal(fabric.verifyReady(chunk, payload, true), true, 'READY may be structurally complete while player-conflicting authority remains safely staged');

// Move the already-valid player occupancy away, then force the normal physics sync.
// player-physics owns the transition and Kowloon receives it through the activation hook.
position.x = 7;
playerPhysics.syncFromPosition({ forceAirborne: false, resetVelocity: true });
assert.equal(payload.physicsActivationState, 'active', 'owner must activate after player clears every collider');
assert.equal(overlap.__physicsDisabled, false, 'overlap collider must activate with the owner');
assert.equal(sibling.__physicsDisabled, false, 'sibling collider must activate on the same transition');
assert.equal(root.visible, true, 'render root must publish on the same owner-level activation transition');
assert.equal(playerPhysics.ownedWorldStats().deferredItems, 0, 'activation must leave no deferred fragments behind');
assert.equal(fabric.verifyReady(chunk, payload, true), true, 'active render/collision owner must satisfy READY parity');

// Streamer hide/show remains a request layered over physics authority.
fabric.setVisible(chunk, payload, false);
assert.equal(root.visible, false, 'streamer may hide an active owner normally');
fabric.setVisible(chunk, payload, true);
assert.equal(root.visible, true, 'streamer may reveal an active owner normally');

console.log('[render-collision-activation-selftest] PASS', {
  activationState: payload.physicsActivationState,
  requestedVisible: payload.requestedVisible,
  visible: root.visible,
  owned: playerPhysics.ownedWorldStats(),
});
