import assert from 'node:assert/strict';
import {
    WORLD_CIRCULATION_SCHEMA,
    assertWorldCirculationGraph,
    circulationRouteForSpace,
    compileWorldCirculationGraph,
} from '../world/circulation-graph.js';

const spaces = [
    { id: 'ground:entry', entityId: 'building:ground', layer: 'ground', floor: 0, yBase: 0 },
    { id: 'ground:room', entityId: 'building:ground', layer: 'ground', floor: 1, yBase: 3.15 },
    { id: 'hanging:room', entityId: 'building:hanging', layer: 'hanging', floor: 4, yBase: 12.6 },
    { id: 'ground:isolated', entityId: 'building:ground', layer: 'ground', floor: 0, yBase: 0 },
];
const base = {
    schema: 'jweb.spatial-topology.v1',
    chunkKey: '2,0',
    spaces,
    // This is intent only. If it enters the traversable graph, the isolated room
    // would falsely pass egress.
    edges: [
        { id: 'adj:false-proof', kind: 'adjacent-space', fromId: 'ground:entry', toId: 'ground:isolated', metadata: { authority: 'building-plan' } },
    ],
    connectors: [
        { id: 'stair:ground', kind: 'stair', source: 'compound-stair', spaceIds: ['ground:entry', 'ground:room'] },
        { id: 'ladder:cross-layer', kind: 'ladder', source: 'cavern-ladder-circulation', spaceIds: ['ground:room', 'hanging:room'] },
    ],
    portals: [
        {
            id: 'door:world', connectorType: 'door', family: 'main-entrance',
            traversal: { traversable: true, role: 'public-access' },
            linkedSpaceIds: ['ground:entry', '2,0:street'], buildingIds: ['building:ground'],
        },
        {
            id: 'door:inside', connectorType: 'door', family: 'entrance',
            traversal: { traversable: true }, linkedSpaceIds: ['ground:entry', 'ground:room'], buildingIds: ['building:ground'],
        },
    ],
};

const graph = compileWorldCirculationGraph(base);
assert.equal(graph.schema, WORLD_CIRCULATION_SCHEMA);
assert.equal(graph.unifiedLayers, true);
assert.equal(graph.authority, 'physical-connectors-access-portals-and-exterior-transport');
assert.equal(graph.stats.worldNodes, 1);
assert.equal(graph.stats.plannedAdjacencies, 1);
assert.equal(graph.stats.physicalConnectorEdges, 2);
assert.equal(graph.stats.portalEdges, 1);
assert.equal(graph.stats.crossLayerEdges, 1);
assert.equal(graph.stats.explicitExitPortals, 1);
assert.equal(graph.stats.reachableSpaces, 3);
assert.equal(graph.stats.unreachableSpaces, 1);
assert.ok(graph.nodes.some(node => node.kind === 'world' && node.id === '2,0:street'));
assert.ok(graph.edges.every(edge => edge.links.every(link => link.kind !== 'planned-adjacency')));
assert.equal(graph.routes['ground:entry'].nextNodeId, '2,0:street');
assert.equal(graph.routes['ground:entry'].distanceToExit, 0);
assert.equal(graph.routes['hanging:room'].distanceToExit, 2);
assert.equal(graph.routes['ground:isolated'], undefined, 'planned adjacency must not prove traversal');
assert.deepEqual(
    circulationRouteForSpace(graph, 'hanging:room').map(item => item.nodeId),
    ['hanging:room', 'ground:room', 'ground:entry', '2,0:street'],
);
assertWorldCirculationGraph(graph);

const broken = compileWorldCirculationGraph({
    ...base,
    spaces: [...spaces, { id: 'ground:orphan', entityId: 'building:ground', layer: 'ground', floor: 2, yBase: 6.3 }],
});
assert.equal(broken.stats.explicitEgressFailures, 1);
assert.throws(() => assertWorldCirculationGraph(broken, { requireExplicitEgress: true }), /explicit-egress building failures/);

const repeat = compileWorldCirculationGraph(base);
assert.deepEqual(repeat, graph, 'unified circulation graph must be deterministic');
console.log('[world-circulation-graph-selftest] PASS', graph.stats);
