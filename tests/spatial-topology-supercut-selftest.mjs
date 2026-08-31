import assert from 'node:assert/strict';
import { SPATIAL_TOPOLOGY_SCHEMA, assertSpatialTopologyGraph, compileSpatialTopologyGraph } from '../world/spatial-topology.js';

const chunk = { key: '0,0', x: 0, z: 0, seed: 123 };
const space0 = '0,0:site:a:m0:floor:0';
const space1 = '0,0:site:a:m0:floor:1';
const reservation = {
    id: 'door:a:sweep', kind: 'portal-sweep', x: 0, z: -2.5, halfX: 0.65, halfZ: 0.9,
    yMin: 0, yMax: 2.2, source: 'entrance', connectorId: 'door:a',
};
const payload = {
    ownerId: 'chunk:0,0',
    entities: [{
        id: 'building:a', kind: 'building', semanticSiteKey: 'site:a', doorSide: 'north', floorH: 3.15,
        footprintModules: [{ key: 'm0', cx: 0, cz: 0, halfX: 3, halfZ: 2.5, floors: 2 }],
        facades: [{ side: 'north', moduleKey: 'm0', x: 0, z: -2.5, halfX: 3, halfZ: 2.5, yMin: 0, yMax: 6.3 }],
        entranceFaces: [{ moduleKey: 'm0', side: 'north' }],
    }],
    semanticTopologySpaces: [
        { schema: 'jweb.space-plan-topology.v1', id: space0, chunkKey: chunk.key, entityId: 'building:a', moduleKey: 'm0', floor: 0, floorH: 3.15, yBase: 0, bounds: { minX: -2.88, maxX: 2.88, minZ: -2.38, maxZ: 2.38, yMin: 0, yMax: 3.15 } },
        { schema: 'jweb.space-plan-topology.v1', id: space1, chunkKey: chunk.key, entityId: 'building:a', moduleKey: 'm0', floor: 1, floorH: 3.15, yBase: 3.15, bounds: { minX: -2.88, maxX: 2.88, minZ: -2.38, maxZ: 2.38, yMin: 3.15, yMax: 6.3 } },
    ],
    semanticSpaces: [{ id: space0, entityId: 'building:a', moduleKey: 'm0', floor: 0 }],
    semanticPlacements: [{ instanceId: 'chair:a', assetId: 'chair', entityId: 'building:a', spaceId: space0, moduleKey: 'm0', floor: 0, x: 1, y: 0, z: 1, rotY: 0 }],
    physics: {
        circulationReservations: [reservation],
        semanticConnectors: [{
            id: 'door:a', kind: 'door', source: 'entrance', visualRole: 'doorway',
            fromSpaceId: space0, toSpaceId: null, spaceIds: [space0],
            endpoints: [{ id: 'door:a:endpoint', x: 0, y: 0, z: -2.5, width: 1.3, height: 2.2, depth: 1.2, side: 'north', moduleKey: 'm0' }],
            aperture: { width: 1.3, height: 2.2, depth: 1.2 }, reservations: [reservation], metadata: { entityId: 'building:a', moduleKey: 'm0' },
        }],
    },
};

const graph = compileSpatialTopologyGraph({ chunk, payload });
assert.equal(graph.schema, SPATIAL_TOPOLOGY_SCHEMA);
assertSpatialTopologyGraph(graph);
assert.equal(graph.stats.orphanReservations, 0);
assert.equal(graph.stats.orphanApertures, 0);
assert.equal(graph.stats.unboundEntranceFaces, 0);
assert.equal(graph.apertures.length, 1);
assert.equal(graph.apertures[0].kind, 'entrance');
assert.equal(graph.apertures[0].connectorId, 'door:a');
assert.ok(graph.edges.some(item => item.kind === 'owns-aperture' && item.fromId === 'door:a'));
assert.ok(graph.edges.some(item => item.kind === 'owns-reservation' && item.fromId === 'door:a'));
assert.ok(graph.edges.some(item => item.kind === 'contains-instance' && item.toId === 'chair:a'));
assert.equal(payload.semanticPlacements[0].spatialTopologyId, 'chair:a');
console.log('PASS spatial topology supercut', graph.stats);
