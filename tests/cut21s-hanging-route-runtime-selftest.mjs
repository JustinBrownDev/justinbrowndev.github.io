import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { deterministicChunkSeed, worldWeirdnessAt } from '../world-chunk-streamer.js';

const worldSeed = 671278205;
const x = 16, z = 0;
const scene = new THREE.Scene();
const playerPhysics = { registerOwnedWorld() { return { activationState: 'active' }; }, unregisterOwnedWorld() { return true; } };
const factory = createKowloonFabricEngine({
  THREE, scene, playerPhysics, directSceneAdd: scene.add.bind(scene), worldSeed,
  chunkSize: 64, landmarkSpacingChunks: 3, yieldControl: null,
});
const chunk = {
  key: `${x},${z}`, x, z, centerX: x * 64, centerZ: z * 64,
  seed: deterministicChunkSeed(worldSeed, x, z),
  weirdness: worldWeirdnessAt(x, z, { worldSeed, startRadius: 1.5, fullRadius: 36, curve: 1.3 }),
};
const payload = await factory.build(chunk);
const hanging = payload.hangingLayer?.payload;
assert.ok(hanging?.ceilingCity);
const gallerySummary = hanging.facadeRouteGalleries;
assert.ok(gallerySummary?.realized > 0, 'composed hanging route must realize at least one facade-running gallery');
const galleries = hanging.physics.facadeRouteGalleries ?? [];
assert.equal(galleries.length, gallerySummary.realized);
assert.ok(galleries.some(gallery => gallery.widthClass === 'sky-street'));
assert.ok(galleries.every(gallery => gallery.supportMode === 'hung-from-above'));
assert.ok(galleries.every(gallery => gallery.width > 2.1 && gallery.length > gallery.width),
  'hanging route bulk must read as a lateral street rather than a point landing');
const surfaces = hanging.physics.exteriorTransportSurfaces ?? [];
for (const gallery of galleries) {
  const surface = surfaces.find(candidate => candidate.id === gallery.surfaceId);
  assert.ok(surface, `${gallery.id}: gallery must publish canonical transport surface`);
  assert.equal(surface.kind, 'hanging-facade-route-gallery');
  assert.equal(surface.networkKey, gallery.routeId);
}
const transferBuildings = hanging.entities.filter(entity => entity.kind === 'building' && (entity.cityTransferDemands ?? []).some(demand => demand.composedRouteTransfer === true));
assert.ok(transferBuildings.length > 0, 'at least one intermediate hanging tower must consume the composed route as an authoritative through-building demand');
for (const entity of transferBuildings) {
  const routeDemandIds = new Set((entity.cityTransferDemands ?? []).filter(demand => demand.composedRouteTransfer === true).map(demand => demand.id));
  assert.ok((entity.cityTransferAuthority?.routes ?? []).some(route => routeDemandIds.has(route.demandId)),
    `${entity.id}: composed route demand must be realized by 21R transfer authority`);
}
const crossingBridges = hanging.entities.filter(entity => entity.kind === 'skybridge' && entity.hangingLateralThroughput === true);
assert.ok(crossingBridges.length > 0);
assert.ok(crossingBridges.every(bridge => bridge.widthClass !== 'sky-street'),
  'fat hanging route must not be represented by an oversized point-to-point crossing');
assert.ok(crossingBridges.some(bridge => Number(bridge.facadeGalleryWidth) > Number(bridge.width) + 0.35));

factory.disposeShared();
console.log('[cut21s-hanging-route-runtime-selftest] PASS', {
  hangingBridges: hanging.skybridges,
  composedCrossings: crossingBridges.length,
  galleries: galleries.length,
  transferBuildings: transferBuildings.length,
  supportedGalleryParts: gallerySummary.supportParts,
  invariant: 'hanging arterial = facade-running supported gallery + bridge-scale exterior crossings + 21R transfer-serving towers',
});
