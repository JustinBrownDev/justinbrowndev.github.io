import assert from 'node:assert/strict';
import { assertWorldCirculationGraph, circulationRouteForSpace, compileWorldCirculationGraph } from '../world/circulation-graph.js';

const topology = {
  schema: 'jweb.spatial-topology.v1',
  chunkKey: 'roof-jump:test',
  spaces: [
    { id: 'space:entry', entityId: 'building:a', layer: 'ground', floor: 0, yBase: 0 },
    { id: 'space:roof-a', entityId: 'building:a', layer: 'ground', floor: 2, yBase: 6.4 },
    { id: 'space:isolated', entityId: 'building:b', layer: 'ground', floor: 2, yBase: 6.4 },
  ],
  connectors: [
    { id: 'stair:a', kind: 'stair', source: 'compound-stair', spaceIds: ['space:entry', 'space:roof-a'] },
    { id: 'landing:roof-a', kind: 'landing', source: 'exterior-transport-network', spaceIds: ['space:roof-a'], transportSurfaceIds: ['transport:ground:roof:A'] },
    { id: 'landing:isolated', kind: 'landing', source: 'exterior-transport-network', spaceIds: ['space:isolated'], transportSurfaceIds: ['transport:ground:roof:C'] },
  ],
  portals: [{
    id: 'door:world', connectorType: 'door', family: 'main-entrance', buildingIds: ['building:a'],
    traversal: { traversable: true, role: 'public-access' }, linkedSpaceIds: ['space:entry', 'street:test'],
  }],
  edges: [],
  transportSurfaces: [
    { id: 'transport:ground:roof:A', sourceId: 'roof:A', layer: 'ground', kind: 'clear-roof-street-layer', x: 0, z: 0, y: 6.4 },
    { id: 'transport:ground:roof:B', sourceId: 'roof:B', layer: 'ground', kind: 'clear-roof-street-layer', x: 5.7, z: 0, y: 6.4 },
    { id: 'transport:ground:roof:C', sourceId: 'roof:C', layer: 'ground', kind: 'clear-roof-street-layer', x: 20, z: 0, y: 6.4 },
  ],
  transportEdges: [{
    id: 'jump:A:B', kind: 'jump-link', source: 'jump-link', layer: 'ground',
    aId: 'transport:ground:roof:A', bId: 'transport:ground:roof:B', gap: 2.0, rise: 0,
    traversalAuthority: 'gameplay-controller-ballistic-envelope',
  }],
};

const graph = compileWorldCirculationGraph(topology);
assertWorldCirculationGraph(graph);
assert.equal(graph.stats.transportNodes, 3);
assert.equal(graph.stats.transportEdges, 1);
assert.equal(graph.stats.transportJunctionEdges, 2);
assert.equal(graph.stats.jumpEdges, 1);
assert.equal(graph.stats.reachableTransportNodes, 2);
assert.equal(graph.stats.unreachableTransportNodes, 1);
assert.ok(graph.routes['transport:ground:roof:B'], 'jump-connected peer roof must inherit a route to the real world root');
assert.equal(graph.routes['transport:ground:roof:C'], undefined, 'transport surface is never a root merely because it exists');
assert.equal(graph.routes['space:isolated'], undefined, 'an isolated roof surface may not falsely prove building egress');
assert.deepEqual(
  circulationRouteForSpace(graph, 'space:roof-a').map(item => item.nodeId),
  ['space:roof-a', 'space:entry', 'street:test'],
  'shortest room route may remain interior while the same graph also publishes the roof network',
);
const roofBRoute = [];
let cursor = graph.routes['transport:ground:roof:B'];
while (cursor) {
  roofBRoute.push(cursor.nodeId);
  cursor = cursor.nextNodeId ? graph.routes[cursor.nextNodeId] : null;
}
assert.deepEqual(roofBRoute, [
  'transport:ground:roof:B',
  'transport:ground:roof:A',
  'space:roof-a',
  'space:entry',
  'street:test',
]);
console.log('[roof-jump-unified-circulation-selftest] PASS', graph.stats);
