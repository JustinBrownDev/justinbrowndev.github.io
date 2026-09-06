import assert from 'node:assert/strict';
import { analyzeChunkPayload, buildSweepAnalysis, renderAttentionLedgerSvg, renderAuthorityPipelineSvg, renderBuildingStacksSvg, renderChunkMatrixSvg, renderSystemStorySvg, renderTransportFailureAtlasSvg, renderValidationSeamsSvg } from '../system-observatory-core.js';
const payload = {
  entities: [{ id: 'e1' }], physics: { stairOwnership: [{}] },
  spatialTopology: {
    spaces: [
      { id: 'a', entityId: 'chunk:building:1|2', floor: 0, yBase: 0, role: 'entry', layer: 'ground' },
      { id: 'b', entityId: 'chunk:building:1|2', floor: 1, yBase: 3, role: 'private', layer: 'ground' },
    ], surfaces: [], apertures: [], transportSurfaces: [], transportEdges: [],
    connectors: [
      { id: 'door1', kind: 'door', fromSpaceId: 'a', toSpaceId: 'b', spaceIds: ['a','b'], source: 'test' },
      { id: 'badref', kind: 'door', fromSpaceId: 'a', toSpaceId: 'missing', spaceIds: ['a','missing'], source: 'test' },
    ],
    portals: [{ id: 'p1', family: 'main-entrance', linkedSpaceIds: ['missing'], facadeEndpoint: {}, apertureGeometry: {}, buildingId: 'chunk:building:1|2' }],
    reservations: [{ id: 'r1' }],
    edges: [{ kind: 'adjacent-space', fromId: 'a', toId: 'b' }], stats: { unboundEntranceFaces: 0 },
  },
  worldCirculation: {
    nodes: [{ id: 'a' }, { id: 'b' }], edges: [],
    buildings: [{ entityId: 'chunk:building:1|2', explicitEgress: true, exitPortalIds: ['p1'], componentIds: ['c1'], disconnectedSpaceIds: [] }],
    routes: { a: { distanceToExit: 0 }, b: { distanceToExit: 1 } }, exits: [{ spaceId: 'a' }],
    stats: { components: 1, unreachableSpaces: 0, unreachableTransportNodes: 0, explicitEgressFailures: 0, maxHopsToExit: 1 },
  },
};
const summary = analyzeChunkPayload(payload, { key: '1,2', x: 1, z: 2 });
assert.equal(summary.hard.unreachableSpaces, 0);
assert.equal(summary.relational.plannedAdjacenciesWithoutPhysicalEdge, 1);
assert.equal(summary.relational.danglingConnectorSpaceRefs, 1);
assert.equal(summary.relational.danglingPortalSpaceRefs, 1);
assert.equal(summary.binding.orphanReservations, 1);
assert.equal(summary.binding.unboundPortalApertures, 1);
assert.equal(summary.buildings[0].verticalLinks.length, 1);
const sweep = buildSweepAnalysis([summary]);
assert.equal(sweep.totals.chunks, 1);
for (const svg of [renderChunkMatrixSvg(sweep), renderSystemStorySvg(summary), renderAttentionLedgerSvg(summary), renderBuildingStacksSvg(summary)]) assert.match(svg, /<svg/);
for (const svg of [renderAuthorityPipelineSvg(sweep), renderValidationSeamsSvg(sweep), renderTransportFailureAtlasSvg(sweep)]) assert.match(svg, /<svg/);
console.log('system observatory selftest PASS');
