import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { createKowloonFabricEngine } from '../kowloon-fabric-engine.js';
import { compileWorldCirculationGraph } from '../world/circulation-graph.js';

const scene = new THREE.Scene();
const playerPhysics = { registerOwnedWorld() {}, unregisterOwnedWorld() { return true; } };
const factory = createKowloonFabricEngine({
  THREE,
  scene,
  playerPhysics,
  directSceneAdd: scene.add.bind(scene),
  worldSeed: 0x10B01D6E,
  chunkSize: 64,
  yieldControl: null,
});

const grid = Array.from({ length: 7 }, () => Array(7).fill(false));
const siteIdOf = Array.from({ length: 7 }, () => Array(7).fill(-1));
const sites = [];
let siteId = 300;
for (let row = 1; row < 6; row += 2) {
  for (let col = 1; col < 6; col += 2) {
    grid[row][col] = true;
    siteIdOf[row][col] = siteId;
    sites.push({ id: siteId, cells: [{ col, row }] });
    siteId++;
  }
}
const relationship = factory.planAuthoredBridgeNetwork({ sites, siteIdOf, grid, weirdness: 1, maxBridges: 18 });
const collectorSiteId = 304;
const collectorPortals = relationship.bridgePortalsBySite.get(collectorSiteId) ?? [];
assert.ok(collectorPortals.length >= 3, 'fixture must produce a multi-exchange collector tower');
const touchingBridges = relationship.bridgePlans.filter(bridge => bridge.aSiteId === collectorSiteId || bridge.bSiteId === collectorSiteId);
assert.ok(touchingBridges.length >= 3, 'collector fixture must have at least three exterior bridge links');
const neededSiteIds = new Set([collectorSiteId, ...touchingBridges.flatMap(bridge => [bridge.aSiteId, bridge.bSiteId])]);
const payloadBySite = new Map();
const cellToWorld = (col, row) => ({ x: (col - 3) * 20, z: (row - 3) * 20 });
for (const site of sites.filter(item => neededSiteIds.has(item.id))) {
  const cell = site.cells[0];
  const moduleKey = `${cell.col},${cell.row}`;
  const payload = factory.buildAuthoredSite({
    site,
    siteIdOf,
    grid,
    cellToWorld,
    colHalf: () => 8,
    rowHalf: () => 8,
    ownerId: `cut21r-site:${site.id}`,
    weirdness: 0.42,
    bridgePortalsBySite: relationship.bridgePortalsBySite,
    structureProfile: { primaryFloors: 6, floorCountByCell: { [moduleKey]: 6 } },
  });
  assert.ok(payload?.entity, `${site.id}: authored site failed`);
  payloadBySite.set(site.id, payload);
}

const collectorPayload = payloadBySite.get(collectorSiteId);
const collector = collectorPayload.entity;
assert.ok(collector.cityTransferAuthority?.requested >= 1, 'multi-exchange tower must consume at least one city transfer demand');
assert.equal(collector.cityTransferAuthority.realized, collector.cityTransferAuthority.requested,
  'every accepted collector demand must be realized by Building Plan authority');
assert.equal(collector.cityTransferAuthority.bindings.length, collectorPortals.length,
  'every exterior bridge endpoint must bind to the interior public spine');
const bindingByEndpoint = new Map(collector.cityTransferAuthority.bindings.map(binding => [binding.endpointId, binding]));
for (const portal of collectorPortals) {
  const binding = bindingByEndpoint.get(portal.id);
  assert.ok(binding, `${portal.id}: missing collector exchange binding`);
  const space = collector.buildingPlan.topologySpaces.find(candidate => candidate.id === binding.spaceId);
  assert.equal(space?.traversalPermission, 'PUBLIC_THROUGH');
  assert.equal(space?.cityTransferSpine, true);
}

const bridgePayloads = [];
for (const bridge of touchingBridges) {
  const payload = factory.buildAuthoredBridge({ bridge, payloadBySite, ownerId: `cut21r-bridge:${bridge.id}` });
  assert.ok(payload, `${bridge.id}: bridge failed after transfer-serving tower planning`);
  bridgePayloads.push(payload);
  const connector = payload.physics.semanticConnectors.find(item => item.kind === 'bridge');
  assert.ok(connector, `${bridge.id}: bridge semantic connector missing`);
  const aAuthority = payloadBySite.get(bridge.aSiteId).entity.cityTransferAuthority;
  const bAuthority = payloadBySite.get(bridge.bSiteId).entity.cityTransferAuthority;
  const aBinding = aAuthority.bindings.find(binding => binding.endpointId === bridge.aEndpoint.id);
  const bBinding = bAuthority.bindings.find(binding => binding.endpointId === bridge.bEndpoint.id);
  assert.ok(aBinding && bBinding, `${bridge.id}: both facade endpoints require authoritative public bindings`);
  assert.equal(connector.fromSpaceId, aBinding.spaceId, `${bridge.id}: A endpoint must terminate in its Building Plan exchange binding`);
  assert.equal(connector.toSpaceId, bBinding.spaceId, `${bridge.id}: B endpoint must terminate in its Building Plan exchange binding`);
  const collectorEndpoint = bridge.aSiteId === collectorSiteId ? bridge.aEndpoint : bridge.bEndpoint;
  const binding = bindingByEndpoint.get(collectorEndpoint.id);
  assert.ok([connector.fromSpaceId, connector.toSpaceId].includes(binding.spaceId), `${bridge.id}: bridge connector must terminate in collector PUBLIC_THROUGH spine`);
}

const spaces = [...payloadBySite.values()].flatMap(payload => payload.entity.buildingPlan.topologySpaces);
const connectors = [
  ...[...payloadBySite.values()].flatMap(payload => payload.physics.semanticConnectors ?? []),
  ...bridgePayloads.flatMap(payload => payload.physics.semanticConnectors ?? []),
];
// compileWorldCirculationGraph consumes the normalized spatial-topology form.
// Preserve the explicit semantic endpoint bindings exactly as spatial-topology.js
// does before asking the world graph to prove physical connectivity.
const normalizedConnectors = connectors.map(connector => ({
  ...connector,
  spaceIds: [...new Set([connector.fromSpaceId, ...(connector.spaceIds ?? []), connector.toSpaceId].filter(Boolean))],
}));
const graph = compileWorldCirculationGraph({
  schema: 'cut21r-runtime-fixture',
  spaces,
  connectors: normalizedConnectors,
  transportSurfaces: [],
  transportEdges: [],
  portals: [],
  edges: [],
});
const collectorBindingSpaceIds = new Set(collector.cityTransferAuthority.bindings.map(binding => binding.spaceId));
const collectorNodes = graph.nodes.filter(node => collectorBindingSpaceIds.has(node.id));
assert.equal(collectorNodes.length, collectorBindingSpaceIds.size);
assert.equal(new Set(collectorNodes.map(node => node.componentId)).size, 1,
  'all collector bridge exchanges must compile into one physically connected world-circulation component');
for (const bridgePayload of bridgePayloads) {
  const connector = bridgePayload.physics.semanticConnectors.find(item => item.kind === 'bridge');
  const nodes = [connector.fromSpaceId, connector.toSpaceId].map(id => graph.nodes.find(node => node.id === id));
  assert.ok(nodes.every(Boolean));
  assert.equal(nodes[0].componentId, nodes[1].componentId, 'bridge endpoint spaces must be physically connected in compiled world graph');
}

factory.disposeShared();
console.log('[cut21r-runtime-transfer-network-selftest] PASS', {
  collectorSiteId,
  exchanges: collector.cityTransferAuthority.bindings.length,
  requestedTransfers: collector.cityTransferAuthority.requested,
  realizedTransfers: collector.cityTransferAuthority.realized,
  bridgeLinks: touchingBridges.length,
  circulationComponent: collectorNodes[0]?.componentId,
  invariant: 'bridge connector -> public transfer spine -> Building Plan/core physical connectors -> other bridge connector compiles as one real circulation component',
});
