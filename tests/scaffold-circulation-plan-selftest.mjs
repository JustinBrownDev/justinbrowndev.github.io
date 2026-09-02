import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolvePhysicalTruth } from '../world/physical-truth.js';
import { FACADE_STAIR_AUTHORITY_SCHEMA } from '../world/facade-stair-authority.js';
import { planExteriorScaffoldRoute, scaffoldRouteIsContinuous } from '../world/scaffold-circulation-plan.js';
import { assertCanonicalFacadeZigzag } from '../world/stair-volume-contract.js';

const truth = resolvePhysicalTruth({
  physicalUse: 'industrial-service', role: 'maintenance-access', weirdness: 0.42,
  stableKey: 'scaffold-graph-paper-selftest',
});

for (const side of ['north', 'south', 'west', 'east']) {
  const plan = planExteriorScaffoldRoute({
    fp: { cx: 0, cz: 0, halfX: 8.5, halfZ: 8.5 }, siteId: 4, moduleKey: `module:${side}`,
    floors: 4, floorH: 3.2, side, seed: 808, physicalTruth: truth, maxExteriorDepth: 3.0,
    routeId: `canonical:${side}`,
  });
  assert.ok(plan, `${side}: graph-paper scaffold must fit the generous facade`);
  assert.equal(plan.topology, 'canonical-facade-zigzag');
  assert.equal(plan.geometryAuthority, FACADE_STAIR_AUTHORITY_SCHEMA);
  assert.equal(plan.flights.length, 4, 'one full-story flight per floor rise');
  assert.equal(plan.landings.length, 5, 'one end landing at each floor elevation');
  assert.equal(plan.openings.length, 4);
  assert.equal(scaffoldRouteIsContinuous(plan), true);
  assert.equal(assertCanonicalFacadeZigzag(plan), true);
  for (let i = 0; i < plan.flights.length; i++) {
    const flight = plan.flights[i];
    assert.equal(flight.segment, 0);
    assert.equal(flight.rise, 3.2);
    assert.equal(flight.fixedCoord, plan.scaffoldEnvelope.fixedCoord);
    const lower = plan.landings[i];
    const upper = plan.landings[i + 1];
    assert.notEqual(lower.landingPosition, upper.landingPosition, 'end landing must alternate left/right along the facade');
  }
  const repeat = planExteriorScaffoldRoute({
    fp: { cx: 0, cz: 0, halfX: 8.5, halfZ: 8.5 }, siteId: 4, moduleKey: `module:${side}`,
    floors: 4, floorH: 3.2, side, seed: 808, physicalTruth: truth, maxExteriorDepth: 3.0,
    routeId: `canonical:${side}`,
  });
  assert.deepEqual(repeat, plan, `${side}: route must remain deterministic`);
}

assert.equal(planExteriorScaffoldRoute({
  fp: { cx: 0, cz: 0, halfX: 1.2, halfZ: 1.2 }, floors: 4, floorH: 3.2,
  side: 'north', seed: 809, physicalTruth: truth, maxExteriorDepth: 3.0,
}), null, 'impossible facade is omitted instead of reverting to the old compact prism');

const source = fs.readFileSync(new URL('../world/scaffold-circulation-plan.js', import.meta.url), 'utf8');
assert.match(source, /planAlternatingFacadeStair/);
assert.doesNotMatch(source, /splitRiseA|streetLaneCoord|buildingLaneCoord|two-half-lane/,
  'the retired half-rise/two-lane scaffold author must not survive in the planner');

console.log('[scaffold-circulation-plan-selftest] PASS', {
  sides: 4,
  topology: 'canonical-facade-zigzag',
  concept: 'X landing -> full-story A diagonal -> X landing -> full-story B diagonal -> X landing',
});
