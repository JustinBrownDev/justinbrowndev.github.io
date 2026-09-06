import assert from 'node:assert/strict';
import { planCrossChunkSkyStreetSeam } from '../world/cross-chunk-transport-seams.js';

const routeId = 'district-route:test:ceiling:x:1';
const materialFamily = 'market-frontage-frame';
const west = { x:0, z:0, key:'0,0' };
const east = { x:1, z:0, key:'1,0' };
const surface = (id, kind, x, z, hx, hz, extra={}) => ({ id, kind, x, z, hx, hz, y:12.6, reachable:true, ...extra });
const westPhysics = { exteriorTransportSurfaces:[
  // Unrelated roof mouth is geometrically closer, but should not steal the district seam.
  surface('west:roof','clear-roof-street-layer',30.9,9,0.9,1.5,{networkKey:'local:west'}),
  surface('west:arterial','hanging-facade-route-gallery',29.6,0,2.0,1.8,{districtRouteId:routeId,networkKey:routeId,materialFamily}),
] };
const eastPhysics = { exteriorTransportSurfaces:[
  surface('east:roof','clear-roof-street-layer',33.1,9,0.9,1.5,{networkKey:'local:east'}),
  surface('east:arterial','hanging-facade-route-gallery',34.4,0,2.0,1.8,{districtRouteId:routeId,networkKey:routeId,materialFamily}),
] };
const seam = planCrossChunkSkyStreetSeam({ aChunk:west, aPhysics:westPhysics, bChunk:east, bPhysics:eastPhysics, chunkSize:64, maxGap:2.0, worldSeed:99 });
assert.ok(seam, 'compatible district facade galleries should stitch across the cardinal boundary');
assert.equal(seam.firstSurfaceId, 'west:arterial');
assert.equal(seam.secondSurfaceId, 'east:arterial');
assert.equal(seam.firstSurfaceKind, 'hanging-facade-route-gallery');
assert.equal(seam.secondSurfaceKind, 'hanging-facade-route-gallery');
assert.equal(seam.districtRouteId, routeId);
assert.equal(seam.networkKey, routeId);
assert.equal(seam.materialFamilyHint, materialFamily);
assert.ok(seam.gap > 0.04 && seam.gap <= 2.0);
assert.ok(seam.halfWidth <= 1.2, 'boundary connector should remain catwalk-scale rather than become the fat arterial itself');
console.log('[cut21z-cross-chunk-district-arterial-selftest] PASS', {
  routeId:seam.districtRouteId,
  surfaces:[seam.firstSurfaceKind,seam.secondSurfaceKind],
  gap:seam.gap,
  deckWidth:seam.halfWidth*2,
  materialFamily:seam.materialFamilyHint,
});
