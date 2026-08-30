import assert from 'node:assert/strict';
import { createPlayerPhysics } from '../player-physics.js';
import { CHUNK_STATE, WORLD_SPACE_STATE, createWorldChunkStreamer } from '../world-chunk-streamer.js';

const streamPosition = { x: 0, z: 0 };
const built = [];
const streamer = createWorldChunkStreamer({
  chunkSize: 64,
  worldSeed: 0x515AFE,
  getPlayerPosition: () => streamPosition,
  getPlayerHeading: () => ({ x: 1, z: 0 }),
  renderRadiusChunks: 0,
  prefetchRadiusChunks: 0,
  retentionRadiusChunks: 4,
  buildChunk: async chunk => { built.push(chunk.key); return { key: chunk.key }; },
});
streamer.markChunkReady(0, 0, { spawn: true });
const frontierX = 64 * 2;
const unknown = streamer.classifyWorldPosition(frontierX, 0);
assert.equal(unknown.state, WORLD_SPACE_STATE.UNKNOWN, 'unbuilt frontier must classify as unknown');
assert.equal(streamer.isWorldPositionAvailable(frontierX, 0), false, 'unknown frontier must hold movement until deterministic authority is published');
assert.equal(streamer.chunks.get('2,0')?.state, CHUNK_STATE.QUEUED, 'touching unknown frontier must queue its destination chunk');
assert.equal(streamer.nearestQueuedChunk()?.key, '2,0', 'player-demanded destination must outrank speculative neighbors');
await streamer.buildOne(streamer.chunks.get('2,0'));
assert.equal(streamer.classifyWorldPosition(frontierX, 0).state, WORLD_SPACE_STATE.UNKNOWN, 'structural READY outside the render ring must not masquerade as published authority');
streamPosition.x = frontierX;
streamer.updateVisibility();
assert.equal(streamer.classifyWorldPosition(frontierX, 0).state, WORLD_SPACE_STATE.AUTHORITATIVE, 'frontier becomes authoritative only after actual publication');
await streamer.dispose();

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

const playerPosition = { x: 0, y: 1.65, z: 0 };
const physics = createPlayerPhysics({
  position: playerPosition,
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
  ...emptyWorld(),
});

const overlapProp = { x: 0, z: 0, radius: 0.35, yMin: 0, height: 1.0 };
const record = physics.registerOwnedWorld('late:overlap', { props: [overlapProp] });
assert.equal(record.activationState, 'deferred-player-overlap', 'late collision overlapping the current capsule must defer');
assert.equal(physics.ownedWorldStats().deferredItems, 1, 'deferred collision must stay outside active broadphase');
assert.equal(physics.poseIsValid(0, 0, 0), true, 'late geometry must not invalidate an already-valid player pose');
assert.equal(playerPosition.x, 0, 'registering late geometry must not move the player');

for (let i = 0; i < 90; i++) physics.step(1 / 60, 2, 0);
assert.ok(playerPosition.x > 1.2, 'player must be able to leave deferred geometry, x=' + playerPosition.x);
assert.equal(physics.ownedWorldStats().deferredItems, 0, 'deferred collision must activate after the capsule clears it');

for (let i = 0; i < 90; i++) physics.step(1 / 60, -2, 0);
assert.ok(playerPosition.x > 0.5, 'activated late collider must block re-entry after safe handoff, x=' + playerPosition.x);
assert.ok(physics.getState().feetY >= 0, 'late collision handoff must never eject the player below support');

console.log('[streaming-collision-safety-selftest] PASS', {
  built,
  frontier: streamer.stats?.() ?? null,
  playerX: playerPosition.x,
  owned: physics.ownedWorldStats(),
});
