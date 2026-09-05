import assert from 'node:assert/strict';
import {
  canonicalChunkAdjacency,
  planCrossChunkGroundRoadHandoff,
  planCrossChunkSkyStreetSeam,
  planCrossChunkTransportPair,
} from '../world/cross-chunk-transport-seams.js';

const chunk = (x, z) => ({ key: `${x},${z}`, x, z });
const west = chunk(0, 0);
const east = chunk(1, 0);
const south = chunk(0, 1);
const diagonal = chunk(1, 1);

assert.deepEqual(canonicalChunkAdjacency(west, east), canonicalChunkAdjacency(east, west),
  'canonical adjacency must not depend on caller/build order');
assert.equal(canonicalChunkAdjacency(west, east).edgeKey, 'V:1:0');
assert.equal(canonicalChunkAdjacency(west, south).edgeKey, 'H:0:1');
assert.equal(canonicalChunkAdjacency(west, diagonal), null, 'diagonal chunks are not seam peers');

const roadA = { north: 4, south: 4, west: 4, east: 6 };
const roadB = { north: 1, south: 3, west: 6, east: 2 };
const groundForward = planCrossChunkGroundRoadHandoff({ aChunk: west, aPortals: roadA, bChunk: east, bPortals: roadB });
const groundReverse = planCrossChunkGroundRoadHandoff({ aChunk: east, aPortals: roadB, bChunk: west, bPortals: roadA });
assert.deepEqual(groundForward, groundReverse, 'ground road handoff must be order independent');
assert.equal(groundForward.id, 'cross-chunk-ground-road:V:1:0:lane:6');
assert.equal(groundForward.physicalGeometry, 'existing-road-edge');
assert.equal(planCrossChunkGroundRoadHandoff({ aChunk: west, aPortals: roadA, bChunk: east, bPortals: { ...roadB, west: 5 } }), null,
  'mismatched edge lanes fail closed');

const roof = (id, x, z, y = 34.02, hx = 3.4, hz = 3.4) => ({
  id, kind: 'clear-roof-street-layer', x, z, y, hx, hz, reachable: true,
});
const aPhysics = {
  exteriorTransportSurfaces: [
    roof('west:preferred', 28.28, 2.0, 34.02, 3.40, 3.50), // edge x=31.68
    roof('west:worse', 27.2, -8.0, 34.02, 3.40, 3.10),
    { ...roof('west:wrong-kind', 28.4, 12), kind: 'balcony-street-layer' },
  ],
  mazeWalls: [],
};
const bPhysics = {
  exteriorTransportSurfaces: [
    roof('east:preferred', 35.72, 2.1, 34.02, 3.40, 3.55), // edge x=32.32, gap=.64
    roof('east:worse', 36.0, -8.0, 34.02, 3.40, 3.10),
  ],
  mazeWalls: [],
};

const skyForward = planCrossChunkSkyStreetSeam({
  aChunk: west, aPhysics, bChunk: east, bPhysics, chunkSize: 64, worldSeed: 99,
});
const skyReverse = planCrossChunkSkyStreetSeam({
  aChunk: east, aPhysics: bPhysics, bChunk: west, bPhysics: aPhysics, chunkSize: 64, worldSeed: 99,
});
assert.deepEqual(skyForward, skyReverse, 'sky seam must be exactly order independent');
assert.equal(skyForward.edgeKey, 'V:1:0');
assert.equal(skyForward.firstSurfaceId, 'west:preferred');
assert.equal(skyForward.secondSurfaceId, 'east:preferred');
assert.ok(Math.abs(skyForward.gap - 0.64) < 1e-9);
assert.ok(Math.abs(skyForward.y - 34.02) < 1e-9);
assert.equal(skyForward.rise, 0);
assert.ok(skyForward.from < 32 && skyForward.to > 32, 'deck must span the shared chunk boundary');
assert.ok(skyForward.halfWidth >= 0.6 && skyForward.halfWidth <= 1.2);

const southPhysics = {
  exteriorTransportSurfaces: [roof('south:preferred', 2.1, 35.72, 34.02, 3.55, 3.40)],
  mazeWalls: [],
};
const northPhysics = {
  exteriorTransportSurfaces: [roof('north:preferred', 2.0, 28.28, 34.02, 3.50, 3.40)],
  mazeWalls: [],
};
const skySouth = planCrossChunkSkyStreetSeam({
  aChunk: west, aPhysics: northPhysics, bChunk: south, bPhysics: southPhysics, chunkSize: 64, worldSeed: 99,
});
assert.equal(skySouth.edgeKey, 'H:0:1');
assert.equal(skySouth.axis, 'z');
assert.ok(skySouth.from < 32 && skySouth.to > 32, 'north-south seam must cross z=32 boundary');
assert.ok(Math.abs(skySouth.gap - 0.64) < 1e-9);

const tooHigh = { ...bPhysics, exteriorTransportSurfaces: [roof('east:rise', 35.72, 2.1, 34.3, 3.4, 3.55)] };
assert.equal(planCrossChunkSkyStreetSeam({ aChunk: west, aPhysics, bChunk: east, bPhysics: tooHigh, chunkSize: 64 }), null,
  'non-level peers must not invent a cross-chunk stair');
const tooFar = { ...bPhysics, exteriorTransportSurfaces: [roof('east:far', 38.2, 2.1, 34.02, 3.4, 3.55)] };
assert.equal(planCrossChunkSkyStreetSeam({ aChunk: west, aPhysics, bChunk: east, bPhysics: tooFar, chunkSize: 64 }), null,
  'long cross-chunk catwalk fallback is forbidden');

const blockedA = {
  ...aPhysics,
  mazeWalls: [{
    surfaceId: 'west:preferred', transportRailId: 'end-guard',
    x1: 31.68, z1: 0, x2: 31.68, z2: 4, thickness: 0.12,
  }],
};
const blockedPlan = planCrossChunkSkyStreetSeam({ aChunk: west, aPhysics: blockedA, bChunk: east, bPhysics, chunkSize: 64 });
assert.notEqual(blockedPlan?.firstSurfaceId, 'west:preferred', 'a cross-travel endpoint guard must disqualify that roof mouth');

const pairForward = planCrossChunkTransportPair({
  aChunk: west,
  aPayload: { portals: roadA, hangingLayer: { payload: { physics: aPhysics } } },
  bChunk: east,
  bPayload: { portals: roadB, hangingLayer: { payload: { physics: bPhysics } } },
  chunkSize: 64,
  worldSeed: 99,
});
const pairReverse = planCrossChunkTransportPair({
  aChunk: east,
  aPayload: { portals: roadB, hangingLayer: { payload: { physics: bPhysics } } },
  bChunk: west,
  bPayload: { portals: roadA, hangingLayer: { payload: { physics: aPhysics } } },
  chunkSize: 64,
  worldSeed: 99,
});
assert.deepEqual(pairForward, pairReverse, 'whole transport pair authority must be independent of commit order');
assert.equal(pairForward.groundRoad.lane, 6);
assert.equal(pairForward.skyStreet.kind, 'hanging-sky-street-seam');

console.log('[cross-chunk-transport-seams-selftest] PASS', {
  edgeKey: pairForward.edgeKey,
  groundLane: pairForward.groundRoad.lane,
  skyGap: pairForward.skyStreet.gap,
  skyY: pairForward.skyStreet.y,
  invariant: pairForward.invariant,
});
