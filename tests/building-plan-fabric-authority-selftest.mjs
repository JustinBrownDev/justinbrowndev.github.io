import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { createKowloonFabricEnrichment } from '../world/kowloon-fabric-enrichment.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';

const worldSeed = 0x13572468;
const chunkSize = 64;
function chunk(x, z) {
  return {
    key: `${x},${z}`, x, z,
    centerX: x * chunkSize, centerZ: z * chunkSize,
    seed: deterministicChunkSeed(worldSeed, x, z),
    weirdness: worldWeirdnessAt(x, z, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
  };
}

async function buildAndEnrich() {
  const scene = new THREE.Scene();
  const playerPhysics = {
    registerOwnedWorld() { return { activationState: 'active' }; },
    unregisterOwnedWorld() { return true; },
  };
  const fabric = createKowloonFabricEngine({
    THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene),
    worldSeed, chunkSize, landmarkSpacingChunks: 3, yieldControl: null,
  });
  const descriptor = chunk(1, 0);
  const payload = await fabric.build(descriptor);
  const enrichment = createKowloonFabricEnrichment({ THREE, worldSeed });
  const state = enrichment.initializePayload(descriptor, payload);
  return { payload, state, enrichment };
}

function authoritySnapshot(payload, state) {
  const plannedEntities = payload.entities.filter(entity => entity.buildingPlan?.authoritySchema === 'jweb.building-plan-authority.v1');
  const roomIds = new Set(plannedEntities.flatMap(entity => entity.buildingPlan.topologySpaces.map(space => space.id)));
  const semanticTasks = state.tasks.filter(task => String(task.kind).startsWith('semantic-'));
  return {
    fingerprints: plannedEntities.map(entity => [entity.id, entity.buildingPlan.fingerprint]).sort((a, b) => a[0].localeCompare(b[0])),
    rooms: [...roomIds].sort(),
    semanticTasks: semanticTasks.map(task => [task.entityId, task.kind, task.spaceId, task.program, task.assetId, task.seed >>> 0]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    semanticSpaces: payload.semanticSpaces.map(space => [space.id, space.role, space.spaceType, space.semanticProgram]).sort((a, b) => a[0].localeCompare(b[0])),
  };
}

const first = await buildAndEnrich();
const plannedEntities = first.payload.entities.filter(entity => entity.buildingPlan?.authoritySchema === 'jweb.building-plan-authority.v1');
assert.ok(plannedEntities.length > 0, 'real KFE chunk must publish authoritative building plans');
for (const entity of plannedEntities) {
  assert.equal(entity.buildingPlan.diagnostics.authorityReady, true, `${entity.id} plan must be authority-ready`);
  assert.equal(entity.buildingPlan.diagnostics.unclaimedRasterCellCount, 0, `${entity.id} may not leave raster cells unowned`);
}

const roomIds = new Set(plannedEntities.flatMap(entity => entity.buildingPlan.topologySpaces.map(space => space.id)));
const plannedEntityIds = new Set(plannedEntities.map(entity => entity.id));
const topologyForBuildings = first.payload.semanticTopologySpaces.filter(space => plannedEntityIds.has(space.entityId));
assert.ok(topologyForBuildings.length > 0, 'semantic topology must expose planned rooms');
assert.ok(topologyForBuildings.every(space => roomIds.has(space.id)), 'planned buildings must not regress to module/floor semantic topology');
assert.ok(topologyForBuildings.every(space => space.architecturalAuthority === 'building-plan'), 'room topology must retain Building Plan provenance');

const plansForBuildings = first.payload.spacePlans.filter(plan => plannedEntityIds.has(plan.entityId));
assert.ok(plansForBuildings.length > 0, 'semantic placement must rasterize at least one planned room');
assert.ok(plansForBuildings.every(plan => roomIds.has(plan.id)), 'placement grids must be keyed by authored room IDs');
assert.ok(plansForBuildings.every(plan => plan.architecturalAuthority === 'building-plan'), 'placement grids must retain Building Plan authority');

const semanticTasks = first.state.tasks.filter(task => String(task.kind).startsWith('semantic-'));
assert.ok(semanticTasks.length > 0, 'real enrichment should retain solved semantic tasks');
assert.ok(semanticTasks.every(task => !task.spaceId || roomIds.has(task.spaceId)), 'semantic tasks must target authored rooms rather than module/floor boxes');
assert.ok(semanticTasks.some(task => task.spaceId && task.architecturalSpaceType), 'semantic tasks should carry authored room identity metadata');

assert.ok(first.payload.semanticSpaces.length > 0, 'solved destinations must publish semantic spaces');
assert.ok(first.payload.semanticSpaces.every(space => !plannedEntityIds.has(space.entityId) || roomIds.has(space.id)), 'published building destinations must use authored room IDs');
assert.ok(first.payload.semanticSpaces.some(space => space.architecturalAuthority === 'building-plan' && space.spaceType), 'destination spaces must preserve room role/type metadata');

const interiorDoors = first.payload.physics.semanticConnectors.filter(connector => connector.source === 'building-plan-authority' && connector.kind === 'door');
assert.ok(interiorDoors.length > 0, 'planned interior openings must be semantic connectors');
assert.ok(interiorDoors.every(connector => roomIds.has(connector.fromSpaceId) && roomIds.has(connector.toSpaceId)), 'interior door endpoints must reference authored room IDs');

const second = await buildAndEnrich();
assert.deepEqual(authoritySnapshot(second.payload, second.state), authoritySnapshot(first.payload, first.state), 'same chunk seed must reproduce building plans and room-targeted semantic tasks');

console.log('[building-plan-fabric-authority-selftest] PASS', {
  buildings: plannedEntities.length,
  authoredRooms: roomIds.size,
  rasterizedRooms: plansForBuildings.length,
  publishedDestinations: first.payload.semanticSpaces.length,
  solvedSemanticTasks: semanticTasks.length,
  interiorDoors: interiorDoors.length,
  semanticLayout: first.state.semanticLayout,
});

first.enrichment.disposePayload(first.payload);
first.enrichment.disposeShared();
second.enrichment.disposePayload(second.payload);
second.enrichment.disposeShared();
