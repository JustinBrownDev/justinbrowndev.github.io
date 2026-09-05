import assert from 'node:assert/strict';
import {
  assignBridgeSectionBands,
  towerTransferDemandsForPortals,
  CIRCULATION_CLASS,
  TRAVERSAL_PERMISSION,
} from '../world/sectional-circulation.js';

function fixture(field, count = 180, floors = 10) {
  const plans = [];
  const portals = new Map();
  const capacity = new Map();
  const add = (siteId, endpoint) => {
    if (!portals.has(siteId)) portals.set(siteId, []);
    portals.get(siteId).push(endpoint);
  };
  for (let i = 0; i <= count; i++) capacity.set(i, floors);
  for (let i = 0; i < count; i++) {
    const aSiteId = i;
    const bSiteId = i + 1;
    const id = `${field}:bridge:${i}`;
    const aEndpoint = { id: `${id}:a`, bridgeId: id, endpointRole: 'a', dirKey: i % 2 ? 'E' : 'N', floor: null, ceilingDepthBand: null };
    const bEndpoint = { id: `${id}:b`, bridgeId: id, endpointRole: 'b', dirKey: i % 3 ? 'W' : 'S', floor: null, ceilingDepthBand: null };
    plans.push({ id, aSiteId, bSiteId, aEndpoint, bEndpoint, floor: null, ceilingDepthBand: null });
    add(aSiteId, aEndpoint); add(bSiteId, bEndpoint);
  }
  return { plans, portals, capacity };
}

for (const field of ['ground', 'ceiling']) {
  const { plans, portals, capacity } = fixture(field);
  const summary = assignBridgeSectionBands({
    bridgePlans: plans,
    bridgePortalsBySite: portals,
    field,
    siteFloorCapacity: capacity,
    floorHeight: 3.15,
    ceilingY: 34.02,
    weirdness: 0.42,
    stableKey: `cut21q:${field}`,
  });
  assert.ok(summary.active > 100, `${field}: population must survive band planning`);
  assert.ok(summary.bands.length >= 3, `${field}: bridge network must use multiple vertical bands`);
  assert.ok(summary.skyStreets > 0 && summary.collectors > 0 && summary.local > 0, `${field}: hierarchy must contain local, collector and sky-street routes`);
  const near = plans.filter(p => p.midpointScore >= 0.72);
  const far = plans.filter(p => p.midpointScore <= 0.48);
  assert.ok(near.length > 0 && far.length > 0, `${field}: fixture must exercise middle and edge bands`);
  const average = items => items.reduce((sum, p) => sum + p.width, 0) / items.length;
  assert.ok(average(near) > average(far), `${field}: fatter circulation must statistically favor the vertical midpoint`);
  assert.ok(new Set(plans.map(p => p.architectureFamily)).size >= 4, `${field}: bridge architecture needs multiple large-form families`);
  for (const plan of plans) {
    assert.equal(plan.circulationClass, CIRCULATION_CLASS.EXTERIOR);
    assert.equal(plan.exchangeClass, CIRCULATION_CLASS.EXCHANGE);
    assert.equal(plan.traversalPermission, TRAVERSAL_PERMISSION.PUBLIC_THROUGH);
    if (field === 'ceiling') {
      assert.ok(plan.ceilingDepthBand >= 2, 'hanging bridge may not cling to the ceiling/top band');
      assert.equal(plan.floor, null);
    } else {
      assert.ok(plan.floor >= 1, 'upright bridge remains elevated above floor zero');
    }
  }
}

const transferPortals = [
  { id: 'west-low', dirKey: 'W', floor: 2, routeCharacter: 'DIRECT' },
  { id: 'north-high', dirKey: 'N', floor: 6, routeCharacter: 'VERTICAL_COLLECTOR' },
  { id: 'east-mid', dirKey: 'E', floor: 4, routeCharacter: 'TOWER_TRANSFER' },
];
const demands = towerTransferDemandsForPortals(transferPortals, { siteId: 77, field: 'ground', stableKey: 'cut21q:transfer' });
assert.ok(demands.length >= 1, 'multi-exchange tower must publish a through-building circulation demand');
assert.ok(demands.some(d => d.requiresVerticalTransfer && d.requiresFacadeChange));
assert.deepEqual(demands[0].requestedCirculation, ['boundary-exchange', 'interior', 'boundary-exchange']);
assert.equal(demands[0].verificationAuthority, 'compileWorldCirculationGraph');

console.log('[cut21q-sectional-circulation-selftest] PASS', {
  invariant: 'multi-band exterior routes; midpoint-attracted fat sky streets; explicit tower-transfer demand; no ceiling promenade clamp',
});
