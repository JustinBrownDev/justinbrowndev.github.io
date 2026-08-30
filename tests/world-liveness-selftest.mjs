import assert from 'node:assert/strict';
import { createPlayerPhysics } from '../player-physics.js';
import { CHUNK_STATE, WORLD_SPACE_STATE, createWorldChunkStreamer } from '../world-chunk-streamer.js';

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
    boundsHalf: 500,
    ...extra,
  };
}

function makePhysics(position, availability) {
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
    isWorldPositionAvailable: availability,
    ...emptyWorld(),
  });
}

function wireOwnedPayload(physics, payload) {
  const update = record => {
    payload.physicsActivationState = record?.activationState ?? 'active';
    payload.physicsDeferredReason = record?.deferredReason ?? null;
    payload.renderPublished = !!payload.requestedVisible && payload.physicsActivationState === 'active';
  };
  const record = physics.registerOwnedWorld(payload.ownerId, payload.physics, { onActivationChange: update });
  update(record);
  payload.committed = true;
  return record;
}

function setPayloadVisible(_chunk, payload, visible) {
  payload.requestedVisible = !!visible;
  payload.renderPublished = !!visible && (!payload.physics || payload.physicsActivationState === 'active');
  return payload.renderPublished;
}

// Integration proof: a real player controller cannot occupy an unbuilt destination.
// The destination is demand-prioritized, builds while the player is held at the
// frontier, then publishes with active physics and traversal resumes.
const position = { x: 31.55, y: 1.65, z: 0 };
let streamer;
const physics = makePhysics(position, (x, z) => streamer?.isWorldPositionAvailable(x, z) ?? true);
streamer = createWorldChunkStreamer({
  chunkSize: 64,
  worldSeed: 0x1A11CE,
  getPlayerPosition: () => position,
  getPlayerHeading: () => ({ x: 1, z: 0 }),
  renderRadiusChunks: 1,
  prefetchRadiusChunks: 1,
  retentionRadiusChunks: 3,
  buildChunk: async chunk => ({
    ownerId: `owner:${chunk.key}`,
    physics: {
      platforms: [], ceilings: [], ramps: [], mazeWalls: [],
      props: chunk.key === '1,0' ? [{ x: 34, z: 0, radius: 0.45, yMin: 0, height: 2.2 }] : [],
    },
    requestedVisible: false,
    renderPublished: false,
    physicsActivationState: 'staged',
    committed: false,
    entities: [{ id: `entity:${chunk.key}` }],
  }),
  commitChunk: async (_chunk, payload) => wireOwnedPayload(physics, payload),
  setChunkVisibility: setPayloadVisible,
});
streamer.markChunkReady(0, 0, {
  ownerId: 'spawn', physics: null, requestedVisible: false, renderPublished: false,
  physicsActivationState: 'active', committed: true, entities: [],
});

for (let i = 0; i < 60; i++) physics.step(1 / 60, 2.4, 0);
assert.ok(position.x < 32.01, `player must wait at generation frontier instead of entering future-solid space, x=${position.x}`);
assert.equal(streamer.classifyWorldPosition(33, 0).state, WORLD_SPACE_STATE.UNKNOWN);
assert.equal(streamer.chunks.get('1,0')?.state, CHUNK_STATE.QUEUED, 'frontier contact must demand the destination chunk');
assert.equal(streamer.nearestQueuedChunk()?.key, '1,0', 'caught frontier must become the highest-priority build');

await streamer.buildOne(streamer.chunks.get('1,0'));
const east = streamer.chunks.get('1,0');
assert.equal(east.state, CHUNK_STATE.READY, 'destination shell must structurally finish');
assert.equal(east.renderRequested, true, 'destination inside render ring must request publication');
assert.equal(east.renderPublished, true, 'actual publication must be recorded from the visibility/physics contract');
assert.equal(east.physicsAuthoritative, true, 'destination collision must be authoritative before traversal resumes');
assert.equal(streamer.classifyWorldPosition(33, 0).state, WORLD_SPACE_STATE.AUTHORITATIVE);

for (let i = 0; i < 30; i++) physics.step(1 / 60, 2.4, 0);
assert.ok(position.x > 32.05, `player must cross once published authority exists, x=${position.x}`);
assert.ok(position.x < 33.5, `published destination collider should still be physically real, x=${position.x}`);
await streamer.dispose();

// Adversarial proof of the old blind spot: force a player to already occupy future
// geometry, then build. READY is allowed to be structural, but the streamer must NOT
// call the chunk visible/published/authoritative and the render-ring milestone must fail.
const trappedPosition = { x: 64, y: 1.65, z: 0 };
let trappedStreamer;
const trappedPhysics = makePhysics(trappedPosition, (x, z) => trappedStreamer?.isWorldPositionAvailable(x, z) ?? true);
const stalls = [];
trappedStreamer = createWorldChunkStreamer({
  chunkSize: 64,
  worldSeed: 0xDEAD10CC,
  getPlayerPosition: () => trappedPosition,
  renderRadiusChunks: 0,
  prefetchRadiusChunks: 0,
  retentionRadiusChunks: 1,
  publicationWarnAfterMs: 1,
  onPublicationStall: diagnostic => stalls.push(diagnostic),
  buildChunk: async chunk => ({
    ownerId: `trapped:${chunk.key}`,
    physics: {
      platforms: [], ceilings: [], ramps: [], mazeWalls: [],
      props: [{ x: trappedPosition.x, z: trappedPosition.z, radius: 0.6, yMin: 0, height: 2.4 }],
    },
    requestedVisible: false,
    renderPublished: false,
    physicsActivationState: 'staged',
    committed: false,
    entities: [{ id: 'forced-overlap' }],
  }),
  commitChunk: async (_chunk, payload) => wireOwnedPayload(trappedPhysics, payload),
  setChunkVisibility: setPayloadVisible,
});
const trapped = trappedStreamer.ensureChunk(1, 0);
await trappedStreamer.buildOne(trapped);
assert.equal(trapped.state, CHUNK_STATE.READY, 'forced overlap can still be structurally READY');
assert.equal(trapped.renderRequested, true);
assert.equal(trapped.renderPublished, false, 'READY must not masquerade as actual pixels');
assert.equal(trapped.visible, false, 'compatibility visible flag must now mean real publication');
assert.equal(trapped.physicsAuthoritative, false, 'deferred owner must remain explicitly non-authoritative');
assert.equal(trapped.publicationReason, 'player-capsule-overlap');
assert.deepEqual(trappedStreamer.publicationWithinRadius(0), {
  ready: 0,
  total: 1,
  structuralReady: 1,
  requested: 1,
  published: 0,
  physicsAuthoritative: 0,
  complete: false,
});
assert.equal(trappedStreamer.classifyWorldPosition(64, 0).state, WORLD_SPACE_STATE.UNKNOWN, 'hidden/deferred READY chunk remains a frontier, not authoritative world');
assert.equal(trappedStreamer.isWorldPositionAvailable(64, 0), false, 'player may not deepen the overlap deadlock');
trapped.renderRequestedAt -= 10;
trappedStreamer.updateVisibility();
assert.ok(stalls.length >= 1, 'persistent requested-visible/nonpublished chunk must trip the liveness watchdog');
assert.equal(stalls.at(-1).deferredReason, 'player-capsule-overlap');
assert.equal(trappedStreamer.stats().publication.stalledRequestedVisible, 1);
await trappedStreamer.dispose();

console.log('[world-liveness-selftest] PASS', {
  frontierReleasedAtX: Number(position.x.toFixed(3)),
  trappedPublication: {
    ready: trapped.state,
    renderRequested: trapped.renderRequested,
    renderPublished: trapped.renderPublished,
    physicsAuthoritative: trapped.physicsAuthoritative,
  },
  watchdogEvents: stalls.length,
});
