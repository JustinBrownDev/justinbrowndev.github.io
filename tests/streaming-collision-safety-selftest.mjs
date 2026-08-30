import assert from 'node:assert/strict';
import { createPlayerPhysics } from '../player-physics.js';

function makePhysics(position) {
  return createPlayerPhysics({
    position,
    eyeHeight: 1.65,
    playerRadius: 0.22,
    wallThickness: 0.12,
    worldToCell: () => ({ col: 0, row: 0 }),
    grid: [[true]],
    buildingWallSegments: new Map(),
    propColliders: [],
    elevatedPlatforms: [],
    rampRuns: [],
    overheadCeilings: [],
    boundsHalf: Infinity,
    maxStepHeight: 0.65,
    stepDownTolerance: 0.5,
    jumpSpeed: 5.5,
    gravity: -16,
    maxSubstepSeconds: 1 / 90,
    maxHorizontalSubstep: 0.09,
    maxVerticalSubstep: 0.1,
    maxSubsteps: 32,
  });
}

const position = { x: 0, y: 1.65, z: 0 };
const physics = makePhysics(position);
const overlap = { x: 0, z: 0, radius: 0.35, yMin: 0, height: 1.0 };
const sibling = { x: 3, z: 0, radius: 0.35, yMin: 0, height: 1.0 };
const record = physics.registerOwnedWorld('chunk:new', { props: [overlap, sibling] });
assert.equal(record.activationState, 'active', 'a chunk remains authoritative even when one primitive overlaps the player');
assert.equal(overlap.__physicsDisabled, true, 'only the overlapping primitive defers');
assert.equal(sibling.__physicsDisabled, false, 'non-overlapping sibling collision activates immediately');
assert.equal(physics.ownedWorldStats().deferredItems, 1);
assert.equal(physics.poseIsValid(0, 0, 0), true, 'new collision must not invalidate the current capsule');

for (let i = 0; i < 90; i++) physics.step(1 / 60, 2, 0);
assert.ok(position.x > 1.2, 'player can leave a newly generated overlap without an invisible frontier');
assert.equal(physics.ownedWorldStats().deferredItems, 0, 'deferred primitive activates after clearance');

for (let i = 0; i < 180; i++) physics.step(1 / 60, -2, 0);
assert.ok(position.x > 0.5, 'activated overlap collider blocks re-entry after safe handoff');

console.log('[streaming-collision-safety-selftest] PASS', { position, owned: physics.ownedWorldStats() });
