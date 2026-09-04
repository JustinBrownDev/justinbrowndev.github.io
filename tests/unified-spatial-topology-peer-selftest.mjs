import assert from 'node:assert/strict';
import {
    circulationPayloadScopes,
    compileSpatialTopologyGraph,
} from '../world/spatial-topology.js';

const hanging = {
    ownerId: 'hanging-owner',
    entities: [{ id: 'building:hanging', kind: 'building', footprintModules: [] }],
    semanticTopologySpaces: [
        { id: 'hanging:room', entityId: 'building:hanging', floor: 3, yBase: 9.45, adjacentSpaceIds: [] },
    ],
    semanticSpaces: [],
    semanticPlacements: [],
    physics: {
        semanticConnectors: [
            {
                id: 'ladder:cross-layer', kind: 'ladder', source: 'cavern-ladder-circulation',
                fromSpaceId: 'hanging:room', toSpaceId: 'ground:room', spaceIds: ['hanging:room', 'ground:room'],
                endpoints: [], reservations: [],
            },
        ],
        circulationReservations: [],
    },
};
const root = {
    ownerId: 'ground-owner',
    entities: [{ id: 'building:ground', kind: 'building', footprintModules: [] }],
    semanticTopologySpaces: [
        { id: 'ground:room', entityId: 'building:ground', floor: 0, yBase: 0, adjacentSpaceIds: [] },
    ],
    semanticSpaces: [],
    semanticPlacements: [],
    physics: {
        semanticConnectors: [
            {
                id: 'door:ground-world', kind: 'door', source: 'compound-entrance',
                fromSpaceId: 'ground:room', toSpaceId: 'chunk:test:street', spaceIds: ['ground:room', 'chunk:test:street'],
                endpoints: [], reservations: [],
            },
        ],
        circulationReservations: [],
    },
    hangingLayer: { payload: hanging },
};
// Deliberate cycle proves scope discovery cannot recursively duplicate authorities.
hanging.hangingLayer = { payload: root };

const scopes = circulationPayloadScopes(root);
assert.deepEqual(scopes.map(scope => scope.layer), ['ground', 'hanging']);
assert.deepEqual(scopes.map(scope => scope.payload), [root, hanging]);

const graph = compileSpatialTopologyGraph({ chunk: { key: 'test,0' }, payload: root });
assert.equal(graph.stats.payloadScopes, 2);
assert.deepEqual(graph.layers, ['ground', 'hanging']);
assert.equal(graph.spaces.find(space => space.id === 'ground:room').layer, 'ground');
assert.equal(graph.spaces.find(space => space.id === 'hanging:room').layer, 'hanging');
assert.equal(graph.circulation.stats.crossLayerEdges, 1);
assert.equal(graph.circulation.stats.worldNodes, 1);
assert.equal(graph.circulation.stats.reachableSpaces, 2);
assert.strictEqual(root.worldCirculation, hanging.worldCirculation, 'ground and hanging must publish one circulation authority');
assert.strictEqual(root.spatialTopology, hanging.spatialTopology, 'ground and hanging must publish one spatial topology authority');
assert.deepEqual(
    graph.circulation.routes['hanging:room']?.externalTargetIds,
    ['chunk:test:street'],
);
console.log('[unified-spatial-topology-peer-selftest] PASS', graph.circulation.stats);
