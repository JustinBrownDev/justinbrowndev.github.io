import assert from 'node:assert/strict';
import * as THREE from './vendor/three/three.module.js';
import { createInfiniteCityChunkFactory } from './infinite-city-chunks.js';
import { deterministicChunkSeed, worldWeirdnessAt } from './world-chunk-streamer.js';
import { WORLD_FORMAT_VERSION, worldChunkOwnerId } from './world-contract.js';

const worldSeed = 0x13572468;
const scene = new THREE.Scene();
const rawSceneAdd = scene.add.bind(scene);
const fakeLegacyPerfGroup = new THREE.Group();
fakeLegacyPerfGroup.name = 'perf-chunk:fake';
fakeLegacyPerfGroup.userData.__perfChunkGroup = true;
rawSceneAdd(fakeLegacyPerfGroup);
let interceptedSceneAdds = 0;
scene.add = function (...objects) {
  interceptedSceneAdds += objects.length;
  for (const object of objects) fakeLegacyPerfGroup.add(object);
  return this;
};
const owners = new Map();
const physics = {
  registerOwnedWorld(id, data) { owners.set(id, data); },
  unregisterOwnedWorld(id) { return owners.delete(id); },
};
const factory = createInfiniteCityChunkFactory({
  THREE, scene, playerPhysics: physics, directSceneAdd: rawSceneAdd, worldSeed, chunkSize: 64,
  landmarkSpacingChunks: 3,
  yieldControl: null,
});

function chunk(x, z) {
  return {
    key: `${x},${z}`, x, z,
    centerX: x * 64, centerZ: z * 64,
    seed: deterministicChunkSeed(worldSeed, x, z),
    weirdness: worldWeirdnessAt(x, z, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
  };
}

const a = chunk(1, 0), east = chunk(2, 0), south = chunk(1, 1);
const pa = factory.planChunk(a);
const paAgain = factory.planChunk(chunk(1, 0));
const pe = factory.planChunk(east);
const ps = factory.planChunk(south);
assert.deepEqual(pa, paAgain, 'same coordinate must produce identical road plan');
assert.equal(pa.portals.east, pe.portals.west, 'east/west neighbors must share one boundary portal');
assert.equal(pa.portals.south, ps.portals.north, 'north/south neighbors must share one boundary portal');
assert.equal(pa.portals.west, 3, 'east-of-spawn chunk must center its west portal on the authored spawn gateway');
assert.equal(factory.planChunk(chunk(-1, 0)).portals.east, 3, 'west-of-spawn chunk must center its east portal on the authored spawn gateway');
assert.equal(factory.planChunk(chunk(0, 1)).portals.north, 3, 'south-of-spawn chunk must center its north portal on the authored spawn gateway');
assert.equal(factory.planChunk(chunk(0, -1)).portals.south, 3, 'north-of-spawn chunk must center its south portal on the authored spawn gateway');
assert.ok(pa.roads.length > 4, 'chunk must contain a real internal road graph');

 
 
for (const [macroX, macroZ] of [[0, 0], [1, 0], [0, 1], [-1, -1]]) {
  let count = 0;
  for (let z = macroZ * 3; z < macroZ * 3 + 3; z++) {
    for (let x = macroX * 3; x < macroX * 3 + 3; x++) {
      if (factory.districtLandmarkFor(chunk(x, z))) count++;
    }
  }
  assert.equal(count, 1, `macrocell ${macroX},${macroZ} must own exactly one district landmark`);
}
const landmarkChunk = (() => {
  for (let z = 0; z < 3; z++) for (let x = 0; x < 3; x++) {
    if (x === 0 && z === 0) continue;
    const c = chunk(x, z);
    if (factory.districtLandmarkFor(c)) return c;
  }
  return null;
})();
assert.ok(landmarkChunk, 'spawn-adjacent macrocell must provide a non-singular district landmark');

function reachableRoads(plan) {
  const roads = new Set(plan.roads);
  const first = plan.roads[0];
  const seen = new Set(first ? [first] : []);
  const queue = first ? [first] : [];
  while (queue.length) {
    const k = queue.shift();
    const [c, r] = k.split(',').map(Number);
    for (const n of [`${c+1},${r}`, `${c-1},${r}`, `${c},${r+1}`, `${c},${r-1}`]) {
      if (roads.has(n) && !seen.has(n)) { seen.add(n); queue.push(n); }
    }
  }
  return seen.size;
}
assert.equal(reachableRoads(pa), pa.roads.length, 'all road cells must be one connected local network');

const payloadA = await factory.build(a);
assert.equal(payloadA.formatVersion, WORLD_FORMAT_VERSION, 'payload must carry stable world format version');
assert.equal(payloadA.ownerId, worldChunkOwnerId(worldSeed, a.x, a.z), 'chunk owner id must be deterministic');
assert.equal(scene.children.includes(payloadA.root), false, 'build must stay off-scene until atomic commit');
assert.equal(owners.has(payloadA.ownerId), false, 'build must not publish physics before commit');
assert.ok(payloadA.entities.length > 0, 'chunk must expose stable high-level entity metadata');
assert.equal(new Set(payloadA.entities.map(e => e.id)).size, payloadA.entities.length, 'entity ids must be unique inside chunk');
assert.equal(scene.children.includes(payloadA.root), false, 'atomic off-scene build must remain invisible until commit');
await factory.commit(a, payloadA);
assert.equal(interceptedSceneAdds, 0, 'streamed commit must bypass intercepted scene.add entirely');
assert.equal(scene.children.includes(payloadA.root), true, 'commit must publish complete root atomically');
assert.equal(payloadA.root.parent, scene, 'streamed root must remain a direct scene child');
assert.equal(payloadA.root.userData.worldChunkRoot, true, 'streamed root must carry explicit ownership identity');
assert.equal(payloadA.root.userData.renderAuthority, 'WorldChunkStreamer');
assert.equal(owners.has(payloadA.ownerId), true, 'commit must publish chunk-owned collision');
factory.setVisible(a, payloadA, true);
assert.equal(payloadA.root.visible, true, 'streamer visibility callback must directly control root visibility');
assert.equal(factory.verifyReady(a, payloadA, true), true, 'READY contract must verify parentage, matrices, physics and visibility');
assert.ok(payloadA.buildings > 0, 'generic chunk must contain enterable building fabric');
assert.ok(payloadA.roadCells > 0, 'generic chunk must render deterministic roads');
assert.ok(payloadA.drawBatches < 16, `chunk must remain aggressively batched, got ${payloadA.drawBatches}`);
assert.ok(owners.get(payloadA.ownerId).ramps.length > 0, 'streamed buildings must include stair/ramp physics');
assert.ok(owners.get(payloadA.ownerId).platforms.length > 0, 'streamed buildings must include upper-floor/roof supports');
assert.ok(payloadA.root.children.some(o => o.isInstancedMesh), 'streamed fabric must use instancing');
assert.ok(payloadA.root.children.every(o => o.matrixAutoUpdate === false), 'committed chunk objects must be statically frozen');

const richBuildings = payloadA.entities.filter(e => e.kind === 'building');
assert.ok(richBuildings.some(e => e.compoundCells?.length > 1), 'generic fabric must contain real multi-cell compound buildings, not one-cell boxes');
assert.ok(richBuildings.some(e => e.internalOpenFaces > 0), 'same-site compound modules must share open internal circulation edges');
assert.ok(richBuildings.some(e => e.serviceCages > 0), 'generic compounds must grow structural service cages/ledges on exposed facades');
assert.ok(richBuildings.some(e => e.modularSetbacks > 0), 'generic fabric must contain stacked modular/setback building silhouettes');
assert.ok(richBuildings.some(e => e.partitionSegments > 0), 'generic interiors must include real partition-wall maze structure');
assert.ok(richBuildings.some(e => e.balconySide), 'generic buildings must include navigable structural balcony modules');
assert.ok(payloadA.physics.mazeWalls.length > payloadA.buildings * 8, 'rich building walls/parapets/partitions must publish paired collision');
assert.ok(payloadA.refinement.tasks.length > payloadA.buildings * 2, 'each chunk must own a substantial resumable detail queue after structural READY');
assert.ok(richBuildings.some(e => e.scaffoldLandings > 0), 'generic buildings must include climbable exterior scaffold/fire-escape structures');
assert.ok(payloadA.entities.some(e => e.kind === 'plaza' && e.climbTiers >= 3), 'generic plazas must include climbable stacked junk topology');
const detailKinds = new Set(payloadA.refinement.tasks.map(task => task.kind));
for (const kind of ['sign', 'graffiti', 'pipe', 'awning', 'ivy']) assert.ok(detailKinds.has(kind), `chunk refinement must include ${kind} work`);
const stableTaskContract = payloadA.refinement.tasks.map(({ kind, entityId, seed }) => ({ kind, entityId, seed }));
const pendingBefore = payloadA.refinement.tasks.length - payloadA.refinement.cursor;
for (let i = 0; i < 8; i++) {
  const step = factory.refine(a, payloadA, { maxSteps: 1, maxMillis: 10 });
  assert.equal(step.steps, 1, 'one chunk refinement turn must execute one semantic task');
}
assert.equal(payloadA.detailRoot.children.length, 8, 'chunk must reveal details incrementally rather than all at once');
assert.equal(payloadA.refinement.tasks.length - payloadA.refinement.cursor, pendingBefore - 8);

await factory.unload(a, payloadA);
assert.equal(scene.children.includes(payloadA.root), false, 'unload must remove chunk root');
assert.equal(owners.has(payloadA.ownerId), false, 'unload must deactivate chunk-owned collision');
assert.equal(payloadA.refinement.phase, 'disposed', "unload must cancel the chunk's independent refinement state");
assert.equal(payloadA.detailRoot.children.length, 0, 'unload must release progressive detail objects');

const payloadA2 = await factory.build(chunk(1, 0));
assert.equal(payloadA2.portals.east, payloadA.portals.east, 'revisit must regenerate same boundary contract');
assert.equal(payloadA2.buildings, payloadA.buildings, 'revisit must regenerate same building count');
assert.deepEqual(payloadA2.entities.map(e => e.id), payloadA.entities.map(e => e.id), 'revisit must regenerate stable entity ids');
assert.deepEqual(payloadA2.refinement.tasks.map(({ kind, entityId, seed }) => ({ kind, entityId, seed })), stableTaskContract, 'revisit must regenerate the exact same independent detail work contract');
await factory.commit(a, payloadA2);
await factory.unload(a, payloadA2);

const eastPayload = await factory.build(east);
assert.ok(eastPayload.skybridges > 0, 'sample outer chunk must contain a real upper-level skybridge with paired wall openings/collision');
assert.ok(eastPayload.entities.some(e => e.kind === 'skybridge'), 'skybridge must be represented as stable chunk-owned structural metadata');
await factory.commit(east, eastPayload);
await factory.unload(east, eastPayload);

const landmarkPayload = await factory.build(landmarkChunk);
assert.ok(landmarkPayload.districtLandmark, 'selected landmark chunk must materialize its landmark');
assert.equal(landmarkPayload.districtLandmark.id, factory.districtLandmarkFor(landmarkChunk).id, 'landmark identity must be coordinate deterministic');
assert.ok(landmarkPayload.districtLandmark.floors >= 5, 'district landmark must read larger than ordinary low-rise filler');
await factory.commit(landmarkChunk, landmarkPayload);
await factory.unload(landmarkChunk, landmarkPayload);
factory.disposeShared();

console.log('[infinite-city-chunks-selftest] PASS', {
  portals: pa.portals,
  roadCells: pa.roads.length,
  buildings: payloadA.buildings,
  plazas: payloadA.plazas,
  drawBatches: payloadA.drawBatches,
  ramps: payloadA.physics.ramps.length,
  modularBuildings: richBuildings.filter(e => e.modularSetbacks > 0).length,
  partitionSegments: richBuildings.reduce((n, e) => n + e.partitionSegments, 0),
  refinementTasks: stableTaskContract.length,
  scaffoldBuildings: richBuildings.filter(e => e.scaffoldLandings > 0).length,
  climbablePlazas: payloadA.entities.filter(e => e.kind === 'plaza' && e.climbTiers > 0).length,
  multiCellCompounds: richBuildings.filter(e => e.compoundCells?.length > 1).length,
  serviceCages: richBuildings.reduce((n, e) => n + (e.serviceCages || 0), 0),
  sampledSkybridges: eastPayload.skybridges,
});
