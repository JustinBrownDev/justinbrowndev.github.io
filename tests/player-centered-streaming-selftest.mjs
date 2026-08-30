import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { createWorldChunkStreamer, deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';
import {
  WORLD_STREAMING_GEAR,
  choosePlayerCenteredStreamingGear,
  pointNearRegion,
  shouldRunAuthoredLocalWork,
} from '../world/player-centered-streaming.js';

const gear = choosePlayerCenteredStreamingGear;
assert.equal(gear({}), WORLD_STREAMING_GEAR.VISIBLE_STRUCTURE);
assert.equal(gear({ renderComplete: true }), WORLD_STREAMING_GEAR.VISIBLE_FIRST_PASS);
assert.equal(gear({ renderComplete: true, visibleFirstPassComplete: true }), WORLD_STREAMING_GEAR.PREFETCH_STRUCTURE);
assert.equal(gear({ renderComplete: true, visibleFirstPassComplete: true, prefetchComplete: true }), WORLD_STREAMING_GEAR.LOCAL_DEEPEN);
assert.equal(gear({ renderComplete: true, visibleFirstPassComplete: true, prefetchComplete: true, authoredStructuralComplete: false }), WORLD_STREAMING_GEAR.LOCAL_DEEPEN,
  'finite authored completion must never become a global world-streaming gate');

assert.equal(pointNearRegion({ x: 0, z: 0 }, { halfX: 25, halfZ: 25, margin: 10 }), true);
assert.equal(pointNearRegion({ x: 34, z: 0 }, { halfX: 25, halfZ: 25, margin: 10 }), true);
assert.equal(pointNearRegion({ x: 50, z: 0 }, { halfX: 25, halfZ: 25, margin: 10 }), false);
assert.equal(shouldRunAuthoredLocalWork({ gear: WORLD_STREAMING_GEAR.LOCAL_DEEPEN, playerNearAuthoredRegion: true }), true);
assert.equal(shouldRunAuthoredLocalWork({ gear: WORLD_STREAMING_GEAR.LOCAL_DEEPEN, playerNearAuthoredRegion: false }), false,
  'spawn work must stop being a default background sink when the player leaves it');
assert.equal(shouldRunAuthoredLocalWork({ gear: WORLD_STREAMING_GEAR.VISIBLE_FIRST_PASS, playerNearAuthoredRegion: true }), false,
  'nearby procedural first-pass population outranks authored background work even at spawn');

// Exact user-reported seed: preserve the deterministic corpus, but ensure the
// first semantic layer touches every entity before deepening one tower.
const worldSeed = 1895616516;
const chunkSize = 53;
const scene = new THREE.Scene();
const playerPhysics = {
  registerOwnedWorld() { return { activationState: 'active', deferredReason: null }; },
  unregisterOwnedWorld() { return true; },
};
const engine = createKowloonFabricEngine({
  THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene),
  chunkSize, worldSeed, landmarkSpacingChunks: 3, yieldControl: null,
});
const chunk = {
  key: '0,-1', x: 0, z: -1, centerX: 0, centerZ: -chunkSize,
  seed: deterministicChunkSeed(worldSeed, 0, -1),
  weirdness: worldWeirdnessAt(0, -1, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
};
const payload = await engine.build(chunk);
assert.equal(payload.buildings, 13, 'regression chunk structure changed unexpectedly');
assert.equal(payload.plazas, 3, 'regression chunk plaza plan changed unexpectedly');
assert.equal(payload.refinement.tasks.length, 129, 'player-centered ordering must not delete deterministic detail work');
assert.equal(payload.refinement.firstPassTaskCount, 16, '13 buildings + 3 plazas must each own one first-pass detail turn');
const firstPass = payload.refinement.tasks.slice(0, payload.refinement.firstPassTaskCount);
assert.equal(new Set(firstPass.map(task => task.entityId)).size, payload.refinement.firstPassTaskCount,
  'first pass must touch every entity exactly once before any second detail layer');
assert.equal(firstPass.some(task => task.kind === 'interior-prop'), false,
  'readable/exterior detail must beat hidden interior work in the first pass');

// The streamer must honor the semantic first-pass target instead of the old
// fixed turn count. A payload declaring 12 entities is not locally populated at 8.
const position = { x: 0, y: 1.65, z: 0 };
const streamer = createWorldChunkStreamer({
  chunkSize: 64,
  worldSeed: 7,
  getPlayerPosition: () => position,
  getPlayerHeading: () => ({ x: 1, z: 0 }),
  renderRadiusChunks: 0,
  prefetchRadiusChunks: 0,
  retentionRadiusChunks: 1,
  minimumVisibleRefinementTurns: 8,
  buildChunk: async () => null,
  setChunkVisibility: (_chunk, p, visible) => {
    p.renderPublished = !!visible;
    return p.renderPublished;
  },
  refineChunk: async (_chunk, p) => {
    p.refinement.cursor++;
    return { progressed: true, steps: 1, complete: p.refinement.cursor >= p.refinement.tasks.length, lastKind: 'test-detail' };
  },
  hasPendingRefinement: (_chunk, p) => p.refinement.cursor < p.refinement.tasks.length,
  refineAfterPrefetchReady: false,
});
const semanticPayload = {
  renderPublished: false,
  physicsActivationState: 'active',
  refinement: { tasks: Array.from({ length: 20 }, (_, i) => ({ i })), cursor: 0, firstPassTaskCount: 12 },
};
streamer.markChunkReady(0, 0, semanticPayload);
assert.equal(streamer.chunkVisibleFirstPassComplete(streamer.chunks.get('0,0')), false);
for (let i = 0; i < 8; i++) await streamer.refineOne(streamer.chunks.get('0,0'), { maxMillis: 100 });
assert.equal(streamer.stats().localRenderRefinement.floorComplete, false, 'legacy eight-turn floor must not fake semantic population');
for (let i = 8; i < 12; i++) await streamer.refineOne(streamer.chunks.get('0,0'), { maxMillis: 100 });
assert.equal(streamer.stats().localRenderRefinement.floorComplete, true, 'semantic first-pass target should complete exactly when every declared entity has one layer');
await streamer.dispose();

console.log('[player-centered-streaming-selftest] PASS', {
  gearOrder: Object.values(WORLD_STREAMING_GEAR),
  exactSeed: worldSeed,
  detailTasks: payload.refinement.tasks.length,
  firstPassEntities: payload.refinement.firstPassTaskCount,
  semanticFloorTurns: 12,
});
