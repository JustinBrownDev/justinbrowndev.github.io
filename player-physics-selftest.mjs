import { createPlayerPhysics } from './player-physics.js';
import assert from 'node:assert/strict';

function emptyWorld(extra = {}) {
  return {
    worldToCell: () => ({ col: 0, row: 0 }),
    grid: [[true]],
    buildingWallSegments: new Map(),
    mazeSealWalls: [],
    propColliders: [],
    elevatedPlatforms: [],
    rampRuns: [],
    overheadCeilings: [],
    boundsHalf: 100,
    ...extra,
  };
}

function makeController(position, world) {
  return createPlayerPhysics({
    position,
    eyeHeight: 1.65,
    playerRadius: 0.22,
    wallThickness: 0.12,
    maxStepHeight: 0.65,
    stepDownTolerance: 0.5,
    jumpSpeed: 5.5,
    gravity: -16,
    maxSubstepSeconds: 1 / 90,
    maxHorizontalSubstep: 0.09,
    maxVerticalSubstep: 0.1,
    maxSubsteps: 32,
    ...world,
  });
}

function runStair(fps) {
  const position = { x: 0, y: 1.65, z: 0 };
  const world = emptyWorld({
    rampRuns: [{ axis: 'x', from: 0, to: 3, fixedCoord: 0, halfWidth: 0.65, y0: 0, y1: 2.4 }],
    elevatedPlatforms: [{ x: 3.5, z: 0, hx: 1.0, hz: 1.0, y: 2.4 }],
  });
  const physics = makeController(position, world);
  const dt = 1 / fps;
  const total = 1.5;
  for (let t = 0; t < total - 1e-9; t += dt) physics.step(Math.min(dt, total - t), 2, 0);
  return { position, state: physics.getState() };
}

const stair10 = runStair(10);
const stair20 = runStair(20);
const stair144 = runStair(144);
assert.ok(stair10.state.grounded, '10 FPS stair traversal should stay grounded');
assert.ok(stair20.state.grounded, '20 FPS stair traversal should stay grounded');
assert.ok(stair144.state.grounded, '144 FPS stair traversal should stay grounded');
assert.ok(Math.abs(stair10.state.feetY - 2.4) < 0.06, `10 FPS stair top expected ~2.4, got ${stair10.state.feetY}`);
assert.ok(Math.abs(stair20.state.feetY - 2.4) < 0.06, `20 FPS stair top expected ~2.4, got ${stair20.state.feetY}`);
assert.ok(Math.abs(stair144.state.feetY - 2.4) < 0.06, `144 FPS stair top expected ~2.4, got ${stair144.state.feetY}`);
assert.ok(Math.abs(stair10.state.feetY - stair144.state.feetY) < 0.03, '10/144 FPS stair result should be frame-rate stable');
assert.ok(Math.abs(stair20.state.feetY - stair144.state.feetY) < 0.03, '20/144 FPS stair result should be frame-rate stable');

function runRoofJump(fps) {
  const position = { x: -1, y: 5 + 1.65, z: 0 };
  const targetWalls = new Map([
    ['0,0', { floors: [{ yMin: 2.5, yMax: 5, segments: [
      { x1: 1, z1: -1, x2: 1, z2: 1 },
      { x1: 3, z1: -1, x2: 3, z2: 1 },
    ] }] }],
  ]);
  const world = emptyWorld({
    buildingWallSegments: targetWalls,
    elevatedPlatforms: [
      { x: -1, z: 0, hx: 1, hz: 1, y: 5 },
      { x: 2, z: 0, hx: 1, hz: 1, y: 5 },
    ],
  });
  const physics = makeController(position, world);
  physics.bufferJump();
  const dt = 1 / fps;
  let t = 0;
  while (t < 0.75 - 1e-9) {
    const h = Math.min(dt, 0.75 - t);
    physics.step(h, 4, 0);
    t += h;
  }
  while (t < 1.2 - 1e-9) {
    const h = Math.min(dt, 1.2 - t);
    physics.step(h, 0, 0);
    t += h;
  }
  return { position, state: physics.getState() };
}

const roof10 = runRoofJump(10);
const roof20 = runRoofJump(20);
const roof144 = runRoofJump(144);
assert.ok(roof10.state.grounded, `10 FPS roof jump should land; state=${JSON.stringify(roof10.state)}`);
assert.ok(roof20.state.grounded, `20 FPS roof jump should land; state=${JSON.stringify(roof20.state)}`);
assert.ok(roof144.state.grounded, '144 FPS roof jump should land');
assert.ok(Math.abs(roof10.state.feetY - 5) < 0.03, `10 FPS roof landing expected y=5, got ${roof10.state.feetY}`);
assert.ok(Math.abs(roof20.state.feetY - 5) < 0.03, `20 FPS roof landing expected y=5, got ${roof20.state.feetY}`);
assert.ok(Math.abs(roof144.state.feetY - 5) < 0.03, `144 FPS roof landing expected y=5, got ${roof144.state.feetY}`);
assert.ok(roof20.position.x > 1 && roof20.position.x < 3.2, `20 FPS should be on second roof, x=${roof20.position.x}`);

function runLowCeiling(fps) {
  const position = { x: 0, y: 1.65, z: 0 };
  const world = emptyWorld({
    elevatedPlatforms: [{ x: 2, z: 0, hx: 0.8, hz: 1, y: 1.0 }],
  });
  const physics = makeController(position, world);
  const dt = 1 / fps;
  for (let t = 0; t < 1; t += dt) physics.step(dt, 3, 0);
  return { position, state: physics.getState() };
}

const low20 = runLowCeiling(20);
const low144 = runLowCeiling(144);
assert.ok(low20.position.x < 1.05, `20 FPS low ceiling should block entry, x=${low20.position.x}`);
assert.ok(low144.position.x < 1.05, `144 FPS low ceiling should block entry, x=${low144.position.x}`);
assert.ok(low20.state.feetY >= -1e-6, `low ceiling must never push feet below floor, y=${low20.state.feetY}`);
assert.ok(low144.state.feetY >= -1e-6, `low ceiling must never push feet below floor, y=${low144.state.feetY}`);

function runWallSlide() {
  const position = { x: 0, y: 1.65, z: 0 };
  const walls = new Map([
    ['0,0', { floors: [{ yMin: 0, yMax: 3, segments: [{ x1: 1, z1: -5, x2: 1, z2: 5 }] }] }],
  ]);
  const physics = makeController(position, emptyWorld({ buildingWallSegments: walls }));
  for (let i = 0; i < 60; i++) physics.step(1 / 60, 2, 2);
  return { position, state: physics.getState() };
}

const slide = runWallSlide();
assert.ok(slide.position.x < 0.75, `wall should stop x, got ${slide.position.x}`);
assert.ok(slide.position.z > 1.2, `wall should preserve slide along z, got ${slide.position.z}`);
assert.ok(slide.state.feetY >= 0, 'wall slide must not alter vertical support');

function runLadder(fps) {
  const position = { x: 0, y: 1.65, z: 0 };
  const ladder = [0.48, 0.96, 1.44, 1.92, 2.4].map(y => ({
    x: 0.2, z: 0, hx: 0.4, hz: 0.4, y,
    blocksFromBelow: false,
    supportKind: 'ladder',
  }));
  const physics = makeController(position, emptyWorld({ elevatedPlatforms: ladder }));
  const dt = 1 / fps;
  let t = 0;
  while (t < 0.5 - 1e-9) {
    const h = Math.min(dt, 0.5 - t);
    physics.step(h, 1, 0);
    t += h;
  }
  return { position, state: physics.getState() };
}

const ladder20 = runLadder(20);
const ladder144 = runLadder(144);
assert.ok(ladder20.state.feetY > 0.8 && ladder20.state.feetY < 1.5, `ladder 20 FPS should climb at bounded rate, got ${ladder20.state.feetY}`);
assert.ok(ladder144.state.feetY > 0.8 && ladder144.state.feetY < 1.5, `ladder 144 FPS should climb at bounded rate, got ${ladder144.state.feetY}`);
assert.ok(Math.abs(ladder20.state.feetY - ladder144.state.feetY) < 0.08, `ladder should be frame-rate stable: ${ladder20.state.feetY} vs ${ladder144.state.feetY}`);

function runInvalidResyncRollback() {
  const position = { x: 0, y: 1.65, z: 0 };
  const world = emptyWorld({
    elevatedPlatforms: [{ x: 2, z: 0, hx: 0.8, hz: 1, y: 1.0 }],
  });
  const physics = makeController(position, world);
  physics.step(1 / 60, 0.5, 0); // establish a recent safe pose
  const safe = { ...physics.getState().lastSafe };
  position.x = 2;
  position.z = 0;
  position.y = 1.65; // impossible standing pose under the 1m slab
  physics.syncFromPosition({ forceAirborne: true, resetVelocity: true });
  return { position, state: physics.getState(), safe };
}

// Elevated/stacked junk uses yMin so a rooftop pile does not become an
// invisible collision column through every floor below it.
function runUnderElevatedProp() {
  const position = { x: 0, y: 1.65, z: 0 };
  const physics = makeController(position, emptyWorld({
    propColliders: [{ x: 0.8, z: 0, radius: 0.28, yMin: 5.0, height: 5.5 }],
  }));
  for (let i = 0; i < 60; i++) physics.step(1 / 60, 1.5, 0);
  return { position, state: physics.getState() };
}
const underElevatedProp = runUnderElevatedProp();
assert.ok(underElevatedProp.position.x > 1.0, `elevated prop must not block ground-level passage, x=${underElevatedProp.position.x}`);
assert.ok(underElevatedProp.state.feetY >= 0, 'elevated prop test must remain on ground');

function runLateColliderSync() {
  const position = { x: 0, y: 1.65, z: 0 };
  const props = [];
  const physics = makeController(position, emptyWorld({ propColliders: props }));
  props.push({ x: 1, z: 0, radius: 0.3, height: 1.0 });
  physics.syncDynamicWorld();
  for (let i = 0; i < 60; i++) physics.step(1 / 60, 2, 0);
  return { position, state: physics.getState() };
}
const lateCollider = runLateColliderSync();
assert.ok(lateCollider.position.x < 0.55, `late-streamed prop should enter physics broadphase after sync, x=${lateCollider.position.x}`);


function runOwnedChunkLifecycle() {
  const position = { x: 0, y: 1.65, z: 0 };
  const physics = makeController(position, emptyWorld({ ownedCompactionThreshold: 8 }));
  const streamedProp = { x: 1, z: 0, radius: 0.3, height: 1.0 };
  physics.registerOwnedWorld('chunk:1,0', { props: [streamedProp] });
  for (let i = 0; i < 60; i++) physics.step(1 / 60, 2, 0);
  const blockedX = position.x;

  physics.unregisterOwnedWorld('chunk:1,0');
  position.x = 0; position.z = 0; position.y = 1.65;
  physics.syncFromPosition({ resetVelocity: true });
  for (let i = 0; i < 60; i++) physics.step(1 / 60, 2, 0);
  const unloadedX = position.x;

  // Re-registering an un-compacted owner reactivates the exact prior collider
  // record instead of duplicating it in the broadphase.
  physics.registerOwnedWorld('chunk:1,0', { props: [{ x: 99, z: 99, radius: 1, height: 1 }] });
  position.x = 0; position.z = 0; position.y = 1.65;
  physics.syncFromPosition({ resetVelocity: true });
  for (let i = 0; i < 60; i++) physics.step(1 / 60, 2, 0);
  const revisitedX = position.x;

  physics.unregisterOwnedWorld('chunk:1,0');
  for (let i = 0; i < 8; i++) {
    const id = `dead:${i}`;
    physics.registerOwnedWorld(id, { props: [{ x: 20 + i, z: 20, radius: 0.2, height: 0.5 }] });
    physics.unregisterOwnedWorld(id);
  }
  const compacted = physics.compactOwnedWorld();
  return { blockedX, unloadedX, revisitedX, stats: physics.ownedWorldStats(), compacted };
}

const ownedChunk = runOwnedChunkLifecycle();
assert.ok(ownedChunk.blockedX < 0.55, `resident chunk collider must block, x=${ownedChunk.blockedX}`);
assert.ok(ownedChunk.unloadedX > 1.0, `unloaded chunk collider must deactivate, x=${ownedChunk.unloadedX}`);
assert.ok(ownedChunk.revisitedX < 0.55, `revisited chunk collider must reactivate without duplication, x=${ownedChunk.revisitedX}`);
assert.equal(ownedChunk.stats.inactiveOwners, 0, 'compaction must discard inactive chunk-owner records');
assert.ok(ownedChunk.stats.owners <= ownedChunk.stats.activeOwners, 'only resident owners should remain after explicit compaction');

const rollback = runInvalidResyncRollback();
assert.ok(Math.abs(rollback.position.x - rollback.safe.x) < 1e-6, 'invalid resync should return to last safe X, not depenetrate arbitrarily');
assert.ok(Math.abs(rollback.state.feetY - rollback.safe.feetY) < 1e-6, 'invalid resync should preserve last safe feet Y');
assert.ok(rollback.state.feetY >= 0, 'invalid resync must never eject through the floor');

console.log(JSON.stringify({
  stair10: stair10.state,
  stair20: stair20.state,
  stair144: stair144.state,
  roof10: roof10.state,
  roof20: roof20.state,
  roof144: roof144.state,
  low20: low20.state,
  low144: low144.state,
  slide: { x: slide.position.x, z: slide.position.z, state: slide.state },
  ladder20: ladder20.state,
  ladder144: ladder144.state,
  underElevatedProp: underElevatedProp.state,
  lateCollider: lateCollider.state,
  rollback: rollback.state,
  ownedChunk,
}, null, 2));
console.log('player-physics self-tests: PASS');
