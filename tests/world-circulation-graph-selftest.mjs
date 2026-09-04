import assert from 'node:assert/strict';
import {
    WORLD_CIRCULATION_SCHEMA,
    assertWorldCirculationGraph,
    circulationRouteForSpace,
    compileWorldCirculationGraph,
} from '../world/circulation-graph.js';

const spaces = [
    { id: 'b:entry', entityId: 'building:b', floor: 0, yBase: 0 },
    { id: 'b:room0', entityId: 'building:b', floor: 0, yBase: 0 },
    { id: 'b:core1', entityId: 'building:b', floor: 1, yBase: 3.15 },
    { id: 'b:room1', entityId: 'building:b', floor: 1, yBase: 3.15 },
    { id: 'sealed:room', entityId: 'building:sealed', floor: 0, yBase: 0 },
];
const base = {
    schema: 'jweb.spatial-topology.v1',
    chunkKey: '2,0',
    spaces,
    edges: [
        { id: 'adj:0', kind: 'adjacent-space', fromId: 'b:entry', toId: 'b:room0', metadata: { authority: 'building-plan' } },
        { id: 'adj:1', kind: 'adjacent-space', fromId: 'b:core1', toId: 'b:room1', metadata: { authority: 'building-plan' } },
    ],
    connectors: [
        { id: 'stair:b', kind: 'stair', source: 'compound-stair', spaceIds: ['b:entry', 'b:core1'] },
        { id: 'door:entry', kind: 'door', source: 'compound-entrance', spaceIds: ['b:entry'], fromSpaceId: 'b:entry', toSpaceId: '2,0:street' },
    ],
    portals: [
        {
            id: 'door:entry', connectorType: 'door', family: 'main-entrance',
            traversal: { traversable: true, role: 'public-access' },
            linkedSpaceIds: ['b:entry', '2,0:street'], buildingIds: ['building:b'],
        },
        // Interior door-like data must NOT become an exit because both endpoints
        // are real authored spaces.
        {
            id: 'door:inside', connectorType: 'door', family: 'entrance',
            traversal: { traversable: true }, linkedSpaceIds: ['b:entry', 'b:room0'], buildingIds: ['building:b'],
        },
    ],
};

const graph = compileWorldCirculationGraph(base);
assert.equal(graph.schema, WORLD_CIRCULATION_SCHEMA);
assert.equal(graph.stats.explicitExitPortals, 1);
assert.equal(graph.stats.explicitEgressBuildings, 1);
assert.equal(graph.stats.explicitEgressFailures, 0);
assert.equal(graph.routes['b:entry'].distanceToExit, 0);
assert.equal(graph.routes['b:room0'].nextSpaceId, 'b:entry');
assert.equal(graph.routes['b:room1'].distanceToExit, 2);
assert.deepEqual(circulationRouteForSpace(graph, 'b:room1').map(item => item.spaceId), ['b:room1', 'b:core1', 'b:entry']);
assert.equal(graph.buildings.find(item => item.entityId === 'building:sealed').explicitEgress, false);
assertWorldCirculationGraph(graph, { requireExplicitEgress: true });

const broken = compileWorldCirculationGraph({
    ...base,
    spaces: [...spaces, { id: 'b:orphan', entityId: 'building:b', floor: 2, yBase: 6.3 }],
});
assert.equal(broken.stats.explicitEgressFailures, 1);
assert.throws(() => assertWorldCirculationGraph(broken, { requireExplicitEgress: true }), /explicit-egress building failures/);

const repeat = compileWorldCirculationGraph(base);
assert.deepEqual(repeat, graph, 'circulation graph must be deterministic');
console.log('world-circulation-graph-selftest: ok', graph.stats);
