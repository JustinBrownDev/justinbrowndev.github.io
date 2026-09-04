// JWEB_INTENT: STAIR_WALKABILITY_V1
import assert from 'node:assert/strict';
import { resolvePhysicalTruth } from '../world/physical-truth.js';
import { FACADE_STAIR_AUTHORITY_SCHEMA, assertFacadeStairAuthority, planAlternatingFacadeStair } from '../world/facade-stair-authority.js';

const truth = resolvePhysicalTruth({ physicalUse: 'industrial-service', role: 'maintenance-access', weirdness: 0.42, stableKey: 'facade-stair-authority-selftest' });
const overlaps = (a, b) => Math.abs(a.x - b.x) < a.hx + b.hx - 1e-7 && Math.abs(a.z - b.z) < a.hz + b.hz - 1e-7;
const flightRect = f => f.axis === 'x'
  ? { x: (f.from + f.to) * 0.5, z: f.fixedCoord, hx: Math.abs(f.to - f.from) * 0.5, hz: f.halfWidth }
  : { x: f.fixedCoord, z: (f.from + f.to) * 0.5, hx: f.halfWidth, hz: Math.abs(f.to - f.from) * 0.5 };

for (const side of ['north', 'south', 'west', 'east']) {
  const plan = planAlternatingFacadeStair({ routeId: `authority:${side}`, fp: { cx: 0, cz: 0, halfX: 10, halfZ: 8 }, side, floors: 4, floorH: 3.2, physicalTruth: truth, stableKey: `authority:${side}`, maxRun: 6.5 });
  assert.ok(plan, `${side}: generous facade must accept landing-routed stair`);
  assert.equal(plan.schema, FACADE_STAIR_AUTHORITY_SCHEMA);
  assert.equal(plan.topology, 'landing-routed-facade-zigzag');
  assert.equal(plan.flights.length, 4);
  assert.equal(plan.landings.length, 5);
  assert.ok(plan.landingNormalSize > plan.clearWidth * 2, 'landing is horizontal circulation space, not stair width');
  assert.equal(assertFacadeStairAuthority(plan), true);
  for (let i = 0; i < plan.flights.length; i++) {
    const f = plan.flights[i];
    assert.equal(f.rise, 3.2);
    assert.equal(f.laneIndex, i % 2);
    assert.equal(f.fixedCoord, plan.laneCoords[i % 2]);
    assert.equal(f.fromMouth.laneIndex, i % 2);
    assert.equal(f.toMouth.laneIndex, i % 2);
    assert.equal(overlaps(flightRect(f), plan.landings[i].geometry), false, 'flight cannot carve lower landing');
    assert.equal(overlaps(flightRect(f), plan.landings[i + 1].geometry), false, 'flight cannot carve upper landing');
    assert.equal(overlaps(f.headroomClearance, plan.landings[i + 1].geometry), false, 'headroom reservation must stop at upper landing edge');
    if (i > 0) {
      assert.notEqual(Math.sign(plan.flights[i - 1].to - plan.flights[i - 1].from), Math.sign(f.to - f.from));
      assert.equal(overlaps(flightRect(plan.flights[i - 1]), flightRect(f)), false, 'return flight must sit beside prior flight, never overhead');
      assert.notEqual(plan.landings[i].incomingMouth.laneIndex, plan.landings[i].outgoingMouth.laneIndex, 'turn landing transfers horizontally between lanes');
    }
  }
}

const portalBiased = planAlternatingFacadeStair({ routeId: 'authority:portal-bias', fp: { cx: 0, cz: 0, halfX: 12, halfZ: 4 }, side: 'north', floors: 3, floorH: 3.2, physicalTruth: truth, stableKey: 'portal-bias', preferredLandingTangents: { 1: [5.5], 2: [-5.5], 3: [5.5] } });
assert.ok(portalBiased);
assert.equal(portalBiased.placement.portalBiased, true);
assert.ok(portalBiased.placement.demandScore <= portalBiased.placement.alternateDemandScore + 1e-9);
assert.equal(planAlternatingFacadeStair({ routeId: 'authority:too-small', fp: { cx: 0, cz: 0, halfX: 2.0, halfZ: 1.0 }, side: 'north', floors: 3, floorH: 3.2, physicalTruth: truth }), null);

console.log('[facade-stair-authority-selftest] PASS', { topology: 'landing-routed-facade-zigzag', invariant: 'targets create horizontal landings first; stairs hook to landing edges; alternating flights use separate lanes' });
