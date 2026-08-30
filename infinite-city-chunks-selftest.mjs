import assert from 'node:assert/strict';
import * as THREE from './vendor/three/three.module.js';
import { createKowloonFabricEngine } from './kowloon-fabric-engine.js';
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
const factory = createKowloonFabricEngine({
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
assert.equal(pa.portals.west, 4, 'east-of-spawn chunk must center its west portal on the authored spawn gateway');
assert.equal(factory.planChunk(chunk(-1, 0)).portals.east, 4, 'west-of-spawn chunk must center its east portal on the authored spawn gateway');
assert.equal(factory.planChunk(chunk(0, 1)).portals.north, 4, 'south-of-spawn chunk must center its north portal on the authored spawn gateway');
assert.equal(factory.planChunk(chunk(0, -1)).portals.south, 4, 'north-of-spawn chunk must center its south portal on the authored spawn gateway');
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
assert.equal(payloadA.root.userData.renderAuthority, 'KowloonFabricEngine');
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

const skybridgeChunk = chunk(0, -1);
const eastPayload = await factory.build(skybridgeChunk);
assert.ok(eastPayload.skybridges > 0, 'sample outer chunk must contain a real upper-level skybridge with paired wall openings/collision');
assert.ok(eastPayload.entities.some(e => e.kind === 'skybridge'), 'skybridge must be represented as stable chunk-owned structural metadata');
await factory.commit(skybridgeChunk, eastPayload);
await factory.unload(skybridgeChunk, eastPayload);

const landmarkPayload = await factory.build(landmarkChunk);
assert.ok(landmarkPayload.districtLandmark, 'selected landmark chunk must materialize its landmark');
assert.equal(landmarkPayload.districtLandmark.id, factory.districtLandmarkFor(landmarkChunk).id, 'landmark identity must be coordinate deterministic');
assert.ok(landmarkPayload.districtLandmark.floors >= 5, 'district landmark must read larger than ordinary low-rise filler');
await factory.commit(landmarkChunk, landmarkPayload);
await factory.unload(landmarkChunk, landmarkPayload);

// The authored origin itself is a normal streamer-owned composite chunk, not a
// fake markChunkReady payload. Its child components use the same commit seam.
const originPayload = factory.buildAuthoredOriginChunk({ singulars: [{ type: 'selftest-singular' }] });
assert.equal(originPayload.committed, false, 'origin composite must build off-scene');
assert.equal(scene.children.includes(originPayload.root), false, 'origin composite must remain invisible before commit');
assert.equal(owners.has(originPayload.ownerId), false, 'origin composite owner must remain unpublished before commit');
await factory.commit(originPayload.chunk, originPayload);
factory.setVisible(originPayload.chunk, originPayload, true);
assert.equal(scene.children.includes(originPayload.root), true, 'origin composite must publish through common commit');
assert.equal(owners.has(originPayload.ownerId), true, 'origin composite must publish its stable chunk owner through common commit');
assert.equal(factory.verifyReady(originPayload.chunk, originPayload, true), true, 'origin composite must satisfy the normal READY verification contract');

// Ordinary authored spawn fabric must use the exact same compound renderer and
// publisher as infinity.  This is the one-way-total regression, not a planner-only
// assertion.  The legacy authored ordinary builder is not involved here.
const authoredGrid = Array.from({ length: 5 }, () => Array(5).fill(false));
const authoredSiteIdOf = Array.from({ length: 5 }, () => Array(5).fill(-1));
const authoredSite = { id: 77, cells: [
  { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 1, row: 2 }, { col: 2, row: 2 },
] };
for (const cell of authoredSite.cells) { authoredGrid[cell.row][cell.col] = true; authoredSiteIdOf[cell.row][cell.col] = authoredSite.id; }
const authoredPayload = factory.buildAuthoredSite({
  site: authoredSite, siteIdOf: authoredSiteIdOf, grid: authoredGrid,
  cellToWorld: (col, row) => ({ x: (col - 2) * 8, z: (row - 2) * 8 }),
  colHalf: () => 4, rowHalf: () => 4, ownerId: 'selftest:spawn-fabric:77', weirdness: 0.46,
});
assert.ok(authoredPayload?.entity, 'authored ordinary site must compile through shared fabric engine');
assert.equal(authoredPayload.root.userData.renderAuthority, 'KowloonFabricEngine', 'spawn ordinary geometry must be owned by common fabric renderer');
assert.equal(authoredPayload.entity.moduleCount, authoredSite.cells.length, 'spawn ordinary site must retain its multi-cell compound modules');
assert.ok(authoredPayload.root.children.some(o => o.isInstancedMesh), 'spawn ordinary fabric must use the same batched instanced renderer');
assert.ok(authoredPayload.physics.platforms.length > 0 && authoredPayload.physics.ramps.length > 0, 'spawn ordinary fabric must publish the same navigable floor/stair physics');
assert.ok(authoredPayload.refinement.tasks.length > 0, 'spawn ordinary fabric must receive the same resumable enrichment contract');
assert.equal(authoredPayload.committed, false, 'authored ordinary build must remain uncommitted until the shared publication boundary');
assert.equal(scene.children.includes(authoredPayload.root), false, 'authored ordinary build must stay off-scene before shared commit');
assert.equal(owners.has(authoredPayload.ownerId), false, 'authored ordinary build must not publish collision before shared commit');
factory.commit(authoredPayload.chunk, authoredPayload);
assert.equal(authoredPayload.committed, true, 'authored ordinary fabric must commit through the shared lifecycle');
assert.equal(authoredPayload.root.parent, originPayload.root, 'authored ordinary commit must publish under the normal origin chunk root');
assert.equal(owners.has(authoredPayload.ownerId), true, 'authored ordinary commit must publish chunk-owned collision atomically');
const authoredDetailStep = factory.refine(authoredPayload.chunk, authoredPayload, { maxSteps: 1, maxMillis: 10 });
assert.equal(authoredDetailStep.steps, 1, 'spawn ordinary fabric detail must refine through common engine');
await factory.unload(authoredPayload.chunk, authoredPayload);
assert.equal(owners.has(authoredPayload.ownerId), false, 'spawn ordinary fabric owner must be cleanly removable by common lifecycle');

// Origin cross-site relationships use the same preplanned opening + bridge
// publisher as infinite chunks.  Build a deterministic mini-district with several
// bridge opportunities, then prove both endpoint shells and the link are owned by
// the one fabric engine.
const linkGrid = Array.from({ length: 7 }, () => Array(7).fill(false));
const linkSiteIdOf = Array.from({ length: 7 }, () => Array(7).fill(-1));
const linkSites = [];
let linkSiteId = 100;
for (let row = 1; row < 6; row += 2) {
  for (let col = 1; col < 6; col += 2) {
    linkGrid[row][col] = true;
    linkSiteIdOf[row][col] = linkSiteId;
    linkSites.push({ id: linkSiteId, cells: [{ col, row }] });
    linkSiteId++;
  }
}
const linkPlan = factory.planAuthoredBridgeNetwork({
  sites: linkSites, siteIdOf: linkSiteIdOf, grid: linkGrid, weirdness: 1, maxBridges: 18,
});
assert.ok(linkPlan.bridgePlans.length > 0, 'authored origin must preplan upper-level links through common bridge planner');
const bridge = linkPlan.bridgePlans[0];
const endpointSites = linkSites.filter(site => site.id === bridge.aSiteId || site.id === bridge.bSiteId);
assert.equal(endpointSites.length, 2, 'bridge plan must resolve both authored endpoint sites');
const linkPayloads = new Map();
for (const site of endpointSites) {
  const payload = factory.buildAuthoredSite({
    site, siteIdOf: linkSiteIdOf, grid: linkGrid,
    cellToWorld: (col, row) => ({ x: (col - 3) * 8, z: (row - 3) * 8 }),
    colHalf: () => 4, rowHalf: () => 4,
    ownerId: `selftest:link-site:${site.id}`, weirdness: 1,
    bridgePortalsBySite: linkPlan.bridgePortalsBySite,
  });
  assert.ok(payload.entity.bridgePortalCount > 0, 'bridge endpoint shell must reserve its wall opening before publication');
  assert.equal(payload.committed, false, 'authored bridge endpoint must build off-scene');
  assert.equal(scene.children.includes(payload.root), false, 'authored bridge endpoint root must remain invisible before commit');
  assert.equal(owners.has(payload.ownerId), false, 'authored bridge endpoint collision must remain unpublished before commit');
  factory.commit(payload.chunk, payload);
  assert.equal(payload.root.parent, originPayload.root, 'authored bridge endpoint must publish under the normal origin chunk root');
  assert.equal(owners.has(payload.ownerId), true, 'authored bridge endpoint collision must publish through shared commit');
  linkPayloads.set(site.id, payload);
}
const bridgePayload = factory.buildAuthoredBridge({ bridge, payloadBySite: linkPayloads, ownerId: 'selftest:spawn-link' });
assert.ok(bridgePayload, 'authored link must compile through common skybridge publisher');
assert.equal(bridgePayload.root.userData.renderAuthority, 'KowloonFabricEngine', 'authored link must have the same geometry authority as spawn/infinity');
assert.ok(bridgePayload.physics.platforms.some(platform => ['guarded-catwalk', 'hanging-bridge'].includes(platform.supportKind)), 'authored link must publish a real walkable collision platform');
assert.equal(bridgePayload.committed, false, 'authored link must build off-scene before shared commit');
assert.equal(scene.children.includes(bridgePayload.root), false, 'authored link must remain invisible before commit');
assert.equal(owners.has(bridgePayload.ownerId), false, 'authored link collision must remain unpublished before commit');
factory.commit({ key: 'selftest:spawn-link' }, bridgePayload);
assert.equal(bridgePayload.root.parent, originPayload.root, 'authored link render must publish under the normal origin chunk root');
assert.equal(owners.has(bridgePayload.ownerId), true, 'authored link collision must publish through shared commit');
await factory.unload({ key: 'selftest:spawn-link' }, bridgePayload);
assert.equal(owners.has(bridgePayload.ownerId), false, 'authored link owner must unload through common lifecycle');
for (const payload of linkPayloads.values()) await factory.unload(payload.chunk, payload);

// Spawn ground keeps its authored road/crosswalk material planning, but mesh
// publication itself is the same KowloonFabricEngine authority rather than a
// second GroundSurfaceSystem renderer.
const surfaceGeo = new THREE.BoxGeometry(1, 1, 1);
const surfaceMat = new THREE.MeshStandardMaterial({ color: 0x555555 });
const surfacePayload = factory.buildAuthoredSurfacePatch({
  patchKey: 'selftest:surface',
  ownerId: 'selftest:spawn-surface',
  buckets: [{
    kind: 'road', geometry: surfaceGeo, material: surfaceMat,
    transforms: [
      { x: 0, y: 0, z: 0, sx: 3, sy: 0.1, sz: 3 },
      { x: 3, y: 0, z: 0, sx: 3, sy: 0.1, sz: 3 },
    ],
  }],
});
assert.equal(surfacePayload.draws, 1, 'common surface publisher must batch one material bucket into one draw');
assert.equal(surfacePayload.instances, 2, 'common surface publisher must retain all authored surface instances');
assert.equal(surfacePayload.root.userData.renderAuthority, 'KowloonFabricEngine', 'spawn ground must have the same render authority as buildings/chunks');
assert.ok(surfacePayload.root.children[0]?.isInstancedMesh, 'spawn ground publication must use common instanced renderer');
assert.equal(surfacePayload.committed, false, 'authored surface patch must build off-scene before shared commit');
assert.equal(scene.children.includes(surfacePayload.root), false, 'authored surface patch must remain invisible before commit');
factory.commit({ key: 'selftest:surface' }, surfacePayload);
assert.equal(surfacePayload.committed, true, 'authored surface patch must use shared commit lifecycle');
assert.equal(surfacePayload.root.parent, originPayload.root, 'authored surface patch must publish under the normal origin chunk root');
await factory.unload({ key: 'selftest:surface' }, surfacePayload);
surfaceGeo.dispose(); surfaceMat.dispose();

await factory.unload(originPayload.chunk, originPayload);
assert.equal(scene.children.includes(originPayload.root), false, 'origin composite must unload through the same owner lifecycle');
assert.equal(owners.has(originPayload.ownerId), false, 'origin composite owner must unregister on unload');

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
