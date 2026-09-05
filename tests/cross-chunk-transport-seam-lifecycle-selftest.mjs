import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';

globalThis.window = {};
globalThis.location = { search: '?generationProfile=skeleton&buildBudgetMs=5.5' };
const { createKowloonFabricEngine } = await import('../kowloon-fabric-engine.js?cross-chunk-seam-lifecycle-selftest=1');

const worldSeed = 0x51CEB00C;
const chunkSize = 64;
const scene = new THREE.Scene();
const owners = new Map();
const playerPhysics = {
  registerOwnedWorld(id, data, lifecycle = {}) {
    assert.ok(!owners.has(id), `duplicate owner registration: ${id}`);
    owners.set(id, data);
    const record = { activationState: 'active', deferredReason: null };
    lifecycle.onActivationChange?.(record);
    return record;
  },
  unregisterOwnedWorld(id) { return owners.delete(id); },
};
const factory = createKowloonFabricEngine({
  THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene), worldSeed, chunkSize,
});

const chunk = (x, z) => ({ key: `${x},${z}`, x, z, centerX: x * chunkSize, centerZ: z * chunkSize });
const roof = (id, x, z) => ({ id, kind: 'clear-roof-street-layer', x, z, y: 34.02, hx: 3.4, hz: 3.5, reachable: true });
const emptyPhysics = () => ({
  mazeWalls: [], platforms: [], ramps: [], ceilings: [], props: [], guardSpans: [],
  circulationReservations: [], semanticConnectors: [], structuralSurfaceClaims: [],
});

function payloadFor(c, { eastLane = 4, westLane = 4, roofSurface } = {}) {
  const root = new THREE.Group();
  root.name = `synthetic-chunk:${c.key}`;
  root.visible = true;
  const ground = emptyPhysics();
  const hanging = { ...emptyPhysics(), exteriorTransportSurfaces: [roofSurface] };
  return {
    ownerId: `synthetic:${c.key}`,
    root,
    physics: ground,
    portals: { north: 4, south: 4, west: westLane, east: eastLane },
    hangingLayer: { payload: { ownerId: `synthetic:${c.key}:hanging`, physics: hanging, committed: false } },
    committed: false,
    disposed: false,
  };
}

const westChunk = chunk(0, 0);
const eastChunk = chunk(1, 0);
const westPayload = payloadFor(westChunk, { eastLane: 7, roofSurface: roof('west-roof', 28.28, 1.5) });
const eastPayload = payloadFor(eastChunk, { westLane: 7, roofSurface: roof('east-roof', 35.72, 1.6) });

await factory.commit(eastChunk, eastPayload); // reverse order on purpose
assert.equal(factory.crossChunkSeamStats().activePairs, 0);
await factory.commit(westChunk, westPayload);
factory.setVisible(eastChunk, eastPayload, true);
factory.setVisible(westChunk, westPayload, true);
let stats = factory.crossChunkSeamStats();
assert.deepEqual({
  activePairs: stats.activePairs,
  groundRoadHandoffs: stats.groundRoadHandoffs,
  skyStreetSeams: stats.skyStreetSeams,
  visibleSkyStreetSeams: stats.visibleSkyStreetSeams,
  edgeKeys: stats.edgeKeys,
}, {
  activePairs: 1,
  groundRoadHandoffs: 1,
  skyStreetSeams: 1,
  visibleSkyStreetSeams: 1,
  edgeKeys: ['V:1:0'],
});
const sky = westPayload.crossChunkTransportSeams.find(item => item.kind === 'hanging-sky-street-seam');
const ground = westPayload.crossChunkTransportSeams.find(item => item.kind === 'ground-road-handoff');
assert.equal(ground.lane, 7);
assert.equal(sky.id, 'cross-chunk-sky-street:V:1:0');
assert.equal(sky.ownerId, `cross-chunk-seam:${worldSeed}:V:1:0:hanging`);
assert.ok(owners.has(sky.ownerId));
const firstRoot = scene.children.find(child => child.userData?.crossChunkEdgeKey === 'V:1:0');
assert.ok(firstRoot?.visible);

factory.setVisible(eastChunk, eastPayload, false);
assert.equal(firstRoot.visible, false);
factory.setVisible(eastChunk, eastPayload, true);
assert.equal(firstRoot.visible, true);

await factory.unload(eastChunk, eastPayload);
assert.equal(factory.crossChunkSeamStats().activePairs, 0);
assert.equal(owners.has(sky.ownerId), false);
assert.equal(firstRoot.parent, null);
assert.equal(westPayload.crossChunkTransportSeams.length, 0);

const eastReloaded = payloadFor(eastChunk, { westLane: 7, roofSurface: roof('east-roof', 35.72, 1.6) });
await factory.commit(eastChunk, eastReloaded);
factory.setVisible(eastChunk, eastReloaded, true);
stats = factory.crossChunkSeamStats();
assert.equal(stats.activePairs, 1);
const reloadedSky = westPayload.crossChunkTransportSeams.find(item => item.kind === 'hanging-sky-street-seam');
assert.equal(reloadedSky.id, sky.id, 'reload must reconstruct the same canonical seam id');
assert.equal(reloadedSky.ownerId, sky.ownerId, 'reload must reconstruct the same seam physics owner');
assert.notEqual(scene.children.find(child => child.userData?.crossChunkEdgeKey === 'V:1:0'), firstRoot,
  'reload must create a fresh render root rather than resurrect disposed scene state');

await factory.unload(eastChunk, eastReloaded);
await factory.unload(westChunk, westPayload);
assert.equal(factory.crossChunkSeamStats().committedChunks, 0);
assert.equal(factory.crossChunkSeamStats().activePairs, 0);

console.log('[cross-chunk-transport-seam-lifecycle-selftest] PASS', {
  edgeKey: sky.edgeKey,
  groundLane: ground.lane,
  skyGap: sky.gap,
  stableOwner: sky.ownerId,
  reverseCommitOrder: true,
  unloadReloadStable: true,
});
