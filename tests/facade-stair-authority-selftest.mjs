import assert from 'node:assert/strict';
import { resolvePhysicalTruth } from '../world/physical-truth.js';
import {
  FACADE_STAIR_AUTHORITY_SCHEMA,
  assertFacadeStairAuthority,
  planAlternatingFacadeStair,
} from '../world/facade-stair-authority.js';

const truth = resolvePhysicalTruth({
  physicalUse: 'industrial-service', role: 'maintenance-access', weirdness: 0.42,
  stableKey: 'facade-stair-authority-selftest',
});

for (const side of ['north', 'south', 'west', 'east']) {
  const plan = planAlternatingFacadeStair({
    routeId: `authority:${side}`,
    fp: { cx: 0, cz: 0, halfX: 8, halfZ: 8 },
    side,
    floors: 4,
    floorH: 3.2,
    physicalTruth: truth,
    stableKey: `authority:${side}`,
    maxRun: 6.5,
  });
  assert.ok(plan, `${side}: generous facade must accept one shared wall stair`);
  assert.equal(plan.schema, FACADE_STAIR_AUTHORITY_SCHEMA);
  assert.equal(plan.topology, 'alternating-facade-zigzag');
  assert.equal(plan.flights.length, 4);
  assert.equal(plan.landingAnchors.length, 5);
  assert.equal(assertFacadeStairAuthority(plan), true);
  for (let i = 0; i < plan.flights.length; i++) {
    const flight = plan.flights[i];
    assert.equal(flight.rise, 3.2, `${side}:${i}: each flight is a full floor, not a half-rise prism`);
    assert.equal(flight.fixedCoord, plan.orientation.fixedCoord);
    if (i > 0) {
      const previous = plan.flights[i - 1];
      assert.equal(previous.to, flight.from, `${side}:${i}: adjacent flights share the end landing`);
      assert.notEqual(Math.sign(previous.to - previous.from), Math.sign(flight.to - flight.from), `${side}:${i}: direction must reverse`);
    }
    assert.ok(flight.arrivalThroat.hx > 0 && flight.arrivalThroat.hz > 0);
  }
}

const portalBiased = planAlternatingFacadeStair({
  routeId: 'authority:portal-bias',
  fp: { cx: 0, cz: 0, halfX: 9, halfZ: 4 },
  side: 'north', floors: 3, floorH: 3.2, physicalTruth: truth, stableKey: 'portal-bias',
  preferredLandingTangents: { 1: [4.2], 2: [-4.0], 3: [4.1] },
});
assert.ok(portalBiased);
assert.equal(portalBiased.placement.portalBiased, true);
assert.equal(portalBiased.placement.preferredLandingCount, 3);
assert.ok(portalBiased.placement.demandScore <= portalBiased.placement.alternateDemandScore + 1e-9,
  'portal-first demand must select the lower-error alternating placement rather than inventing a second stair author');
assert.ok(portalBiased.landingAnchors[1].tangent > portalBiased.tangentCenter
  && portalBiased.landingAnchors[2].tangent < portalBiased.tangentCenter
  && portalBiased.landingAnchors[3].tangent > portalBiased.tangentCenter,
  'preferred + / - / + portal demand should choose the matching alternating landing ends');

assert.equal(planAlternatingFacadeStair({
  routeId: 'authority:too-small', fp: { cx: 0, cz: 0, halfX: 1.0, halfZ: 1.0 },
  side: 'north', floors: 3, floorH: 3.2, physicalTruth: truth,
}), null, 'impossible facade must omit the stair rather than compress its truth');

console.log('[facade-stair-authority-selftest] PASS', {
  topology: 'alternating-facade-zigzag',
  invariant: 'one full-story wall flight per rise; end landings alternate; portal demand may bias the shared run',
});
