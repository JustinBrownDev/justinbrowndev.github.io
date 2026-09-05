import assert from 'node:assert/strict';
import { planBuildingSidecar } from '../world/architecture/building-plan-sidecar.js';
import { promoteBuildingPlanAuthority } from '../world/architecture/building-plan-authority.js';
import {
  applyTowerTransferAuthority,
  cityExchangeAnchorsForPortals,
  TOWER_TRANSFER_AUTHORITY_SCHEMA,
} from '../world/architecture/tower-transfer-authority.js';

const floorH = 3.15;
const core = {
  id: 'cut21r:core:shaft', kind: 'stair-shaft',
  x: 0, z: 0, halfX: 0.85, halfZ: 1.65,
  yMin: 0, yMax: floorH * 4 + 2.1,
  openingWidth: 1.7, openingDepth: 3.3, rampHalfWidth: 0.72,
  integratedFloorLanding: true,
};
const physicalTruth = {
  floorHeight: { realizedSI: floorH },
  door: { clearWidth: { realizedSI: 1.05 }, clearHeight: { realizedSI: 2.1 } },
  route: { clearWidthSI: 0.91 },
};
const portals = [
  {
    id: 'cut21r:west-low', bridgeId: 'bridge-west', resolved: true,
    x: -7.0, z: 1.0, side: 'west', floor: 1, globalFloor: 1,
    routeCharacter: 'TOWER_TRANSFER', traversalPermission: 'PUBLIC_THROUGH',
  },
  {
    id: 'cut21r:north-high', bridgeId: 'bridge-north', resolved: true,
    x: 2.0, z: -7.0, side: 'north', floor: 3, globalFloor: 3,
    routeCharacter: 'VERTICAL_COLLECTOR', traversalPermission: 'PUBLIC_THROUGH',
  },
];
const exchangeAnchors = cityExchangeAnchorsForPortals(portals, { siteId: 21, field: 'ground' });

const hangingAnchor = cityExchangeAnchorsForPortals([{
  id: 'cut21r:hanging-exchange', bridgeId: 'bridge-hanging', resolved: true,
  x: 4, z: -2, side: 'east', floor: 0, globalFloor: 5,
}], { siteId: 22, field: 'ceiling' })[0];
assert.equal(hangingAnchor.floor, 5,
  'hanging city exchange must bind the shared Building Plan/global floor, not its ceiling-local floor number');

const sidecar = planBuildingSidecar({
  worldSeed: 0x21_12,
  chunkKey: 'cut21r:chunk', chunkX: 0, chunkZ: 0,
  entityId: 'cut21r:tower',
  programHint: 'electronics_repair',
  physicalTruth,
  floorHeight: floorH,
  modules: [{ key: 'tower', cx: 0, cz: 0, halfX: 7, halfZ: 7, floors: 4, floorBase: 0 }],
  accessAnchors: [
    { id: 'cut21r:street-entry', kind: 'main-entry', x: 0, z: 7, side: 'south', floor: 0 },
    ...exchangeAnchors,
  ],
  circulationReservations: [core],
});
const plan = promoteBuildingPlanAuthority(sidecar, {
  coreReservationId: core.id,
  coreReservation: core,
  chunkKey: 'cut21r:chunk',
  entityId: 'cut21r:tower',
});

const demand = {
  schema: 'jweb.circulation-demand.v1',
  id: 'cut21r:demand:0',
  fromEndpointId: portals[0].id,
  toEndpointId: portals[1].id,
  requiresVerticalTransfer: true,
  requiresFacadeChange: true,
  routeCharacter: 'TOWER_TRANSFER',
  traversalPermission: 'PUBLIC_THROUGH',
  verificationAuthority: 'compileWorldCirculationGraph',
};
const authority = applyTowerTransferAuthority(plan, { demands: [demand], portals });
assert.equal(authority.schema, TOWER_TRANSFER_AUTHORITY_SCHEMA);
assert.equal(authority.requested, 1);
assert.equal(authority.realized, 1);
assert.equal(plan.diagnostics.cityTransferAuthorityReady, true);
assert.equal(authority.routes[0].verticalTransfers, 2, 'floor 1 -> 3 must consume two canonical vertical-core handoffs');
assert.ok(authority.routes[0].edgeKinds.every(kind => kind === 'vertical-core' || kind === 'interior-door'));

for (const portal of portals) {
  const binding = authority.bindings.find(item => item.endpointId === portal.id);
  assert.ok(binding, `${portal.id}: exchange must bind to the Building Plan`);
  const space = plan.topologySpaces.find(item => item.id === binding.spaceId);
  assert.ok(space, `${portal.id}: bound semantic space must exist`);
  assert.ok(['circulation', 'entry'].includes(space.role), `${portal.id}: bridge must not open into arbitrary program/private room`);
  assert.equal(space.traversalPermission, 'PUBLIC_THROUGH');
  assert.equal(space.cityTransferSpine, true);
  assert.ok(space.structuralReservationIds.some(id => id === core.id), `${portal.id}: facade branch must physically reach the persistent core on its floor`);
  const floor = plan.floors.find(item => item.floor === binding.floor);
  const opening = floor.openings.find(item => item.endpointId === portal.id && item.kind === 'city-exchange');
  assert.ok(opening, `${portal.id}: floor plan must own an explicit city-exchange threshold`);
  assert.equal(opening.toSpaceKey, binding.spaceKey);
  const route = floor.cityTransferRoutes.find(item => item.endpointId === portal.id);
  assert.ok(route?.cellKeys?.length >= 2, `${portal.id}: facade-to-core route needs real plan cells`);
  assert.ok(['orthogonal-direct', 'grid-detour'].includes(route.directness));
}

const broken = structuredClone(plan);
broken.floors.find(floor => floor.floor === 3).cityExchangeBindings = [];
assert.throws(
  () => applyTowerTransferAuthority(broken, { demands: [demand], portals }),
  error => error?.code === 'JWEB_TOWER_TRANSFER_PORTAL_UNBOUND',
  'missing exchange binding must reject the promised city transfer instead of silently keeping the skybridge intent',
);

assert.throws(
  () => applyTowerTransferAuthority(structuredClone(plan), { demands: [], portals: [...portals, {
    id: 'cut21r:unbound-single', resolved: true, x: 7, z: 0, side: 'east', floor: 1, globalFloor: 1,
  }] }),
  error => error?.code === 'JWEB_TOWER_TRANSFER_PORTAL_UNBOUND',
  'even a single accepted facade exchange must fail closed when Building Plan did not reserve a public branch for it',
);

console.log('[cut21r-transfer-serving-tower-selftest] PASS', {
  route: authority.routes[0].spacePath,
  verticalTransfers: authority.routes[0].verticalTransfers,
  invariant: 'accepted exchange -> preclaimed public interior spine -> locked persistent stair/core -> public interior spine -> accepted exchange',
});
