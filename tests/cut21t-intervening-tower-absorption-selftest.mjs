import assert from 'node:assert/strict';
import { composeCityRoutes } from '../world/city-route-composer.js';

const bridgePlans = [];
for (let i = 0; i < 5; i++) {
  const id = `route-edge:${i}`;
  bridgePlans.push({
    id, aSiteId: i, bSiteId: i + 1,
    aEndpoint: { id: `${id}:a` }, bEndpoint: { id: `${id}:b` },
  });
}
const siteGeometry = new Map();
for (let i = 0; i <= 5; i++) {
  siteGeometry.set(String(i), {
    bounds: { minX: i * 10 - 3, maxX: i * 10 + 3, minZ: -3, maxZ: 3 },
  });
}
const composition = composeCityRoutes({
  bridgePlans, field: 'ceiling', siteGeometry, stableKey: 'cut21t:absorption',
});
assert.equal(composition.routes.length, 1);
const route = composition.routes[0];
assert.equal(route.primaryEdgeIds.length, 5, 'the desired district route should span all six aligned towers');
assert.ok(route.absorbedInterveningTowerIds.length >= 4,
  'towers lying in the direct desire line must be recognized as intentional route absorption opportunities');
for (const siteId of route.absorbedInterveningTowerIds) {
  const demand = composition.siteRouteDemands.find(item => String(item.siteId) === String(siteId));
  assert.ok(demand, `${siteId}: absorbed tower must publish route-driven massing demand`);
  assert.equal(demand.role, 'transfer');
  assert.equal(demand.absorbedInterveningTower, true);
}
assert.equal(composition.absorbedInterveningTowerCount, route.absorbedInterveningTowerIds.length);
console.log('[cut21t-intervening-tower-absorption-selftest] PASS', {
  routeSpan: route.routeSpan,
  absorbedTowers: route.absorbedInterveningTowerIds.length,
  invariant: 'a tower in the desired route line is valuable transfer infrastructure, not only a VOLUME_BLOCKED failure',
});
