import assert from 'node:assert/strict';
import { composeCityRoutes, CITY_ROUTE_COMPOSER_SCHEMA } from '../world/city-route-composer.js';
import { assignBridgeSectionBands, towerTransferDemandsForPortals } from '../world/sectional-circulation.js';

const bridgePlans = [];
const portals = new Map();
const capacity = new Map();
const addPortal = (siteId, endpoint) => {
  if (!portals.has(siteId)) portals.set(siteId, []);
  portals.get(siteId).push(endpoint);
};
for (let i = 0; i <= 12; i++) capacity.set(i, 10);
for (let i = 0; i < 12; i++) {
  const id = `cut21s:bridge:${i}`;
  const aEndpoint = { id: `${id}:a`, bridgeId: id, dirKey: i % 2 ? 'E' : 'N' };
  const bEndpoint = { id: `${id}:b`, bridgeId: id, dirKey: i % 2 ? 'W' : 'S' };
  bridgePlans.push({ id, aSiteId: i, bSiteId: i + 1, aEndpoint, bEndpoint });
  addPortal(i, aEndpoint); addPortal(i + 1, bEndpoint);
}
const composition = composeCityRoutes({ bridgePlans, field: 'ceiling', stableKey: 'cut21s' });
assert.equal(composition.schema, CITY_ROUTE_COMPOSER_SCHEMA);
assert.equal(composition.components, 1);
assert.ok(composition.primaryEdges >= 6 && composition.primaryEdges <= 9,
  'one component should produce a meaningful arterial, not make the entire network one arterial');
assert.ok(composition.branchEdges > 0, 'local/branch circulation must survive route composition');
assert.ok(composition.transferSiteIds.length >= 4, 'primary route should intentionally use intermediate towers as transfer segments');
const primary = bridgePlans.filter(plan => plan.cityRouteRole === 'primary-spine');
assert.ok(primary.every(plan => plan.intermediateTowerRoute === true));
assert.ok(primary.every(plan => plan.hangingLateralThroughput === true));
assert.equal(new Set(primary.map(plan => plan.cityRouteId)).size, 1, 'primary segments must belong to one composed city route');

const summary = assignBridgeSectionBands({
  bridgePlans, bridgePortalsBySite: portals, field: 'ceiling', siteFloorCapacity: capacity,
  floorHeight: 3.15, ceilingY: 34.02, weirdness: 0.42, stableKey: 'cut21s:bands',
});
const primaryAfterBands = bridgePlans.filter(plan => plan.cityRouteRole === 'primary-spine');
assert.ok(primaryAfterBands.every(plan => plan.widthClass !== 'sky-street'),
  'hanging point-to-point crossings must not consume the fat sky-street width');
assert.ok(primaryAfterBands.some(plan => Number(plan.facadeGalleryWidth) > Number(plan.width) + 0.35),
  'major hanging route bulk must move to facade-running galleries');
assert.ok(primaryAfterBands.every(plan => plan.crossingRole === 'catwalk-crossing'));
const routeBands = new Set(primaryAfterBands.map(plan => plan.ceilingDepthBand));
assert.ok(routeBands.size <= 3, 'a short composed arterial should hold a coherent vertical band');
assert.ok(summary.cityRouteComposition.transferSiteIds.length >= 4);
const transferSite = summary.cityRouteComposition.transferSiteIds[0];
const transferPortals = (portals.get(Number(transferSite)) ?? portals.get(transferSite) ?? []).filter(endpoint => endpoint.cityRouteRole === 'primary-spine');
assert.ok(transferPortals.length >= 2, 'composed intermediate tower must have incoming/outgoing primary-route exchanges');
for (let i = 0; i < transferPortals.length; i++) {
  transferPortals[i].globalFloor = transferPortals[i].ceilingDepthBand;
  transferPortals[i].floor = Math.max(0, 9 - transferPortals[i].ceilingDepthBand);
}
const routeDemands = towerTransferDemandsForPortals(transferPortals, { siteId: transferSite, field: 'ceiling', stableKey: 'cut21s:route-transfer' });
assert.ok(routeDemands.some(demand => demand.composedRouteTransfer === true && demand.cityRouteId === primaryAfterBands[0].cityRouteId),
  'route composer must become an authoritative 21R through-tower transfer demand');

console.log('[cut21s-city-route-composer-selftest] PASS', {
  primaryEdges: composition.primaryEdges,
  branchEdges: composition.branchEdges,
  transferTowers: composition.transferSiteIds.length,
  routeBands: [...routeBands],
  invariant: 'compose route first; intermediate tower is a route segment; hanging bulk runs laterally at buildings while gap crossings stay catwalk-scale',
});
