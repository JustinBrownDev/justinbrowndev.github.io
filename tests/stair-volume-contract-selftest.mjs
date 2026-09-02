import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolvePhysicalTruth } from '../world/physical-truth.js';
import { createStairShaftReservation } from '../world/circulation-reservations.js';
import { planExteriorScaffoldRoute, scaffoldRouteIsContinuous } from '../world/scaffold-circulation-plan.js';
import {
  assertCanonicalFacadeZigzag,
  assertLandingThroatClearsFlight,
  assertStairShaftContainsFlight,
} from '../world/stair-volume-contract.js';

const truth = resolvePhysicalTruth({
  physicalUse: 'industrial-service', role: 'maintenance-access', weirdness: 0.25,
  stableKey: 'stair-volume-contract-selftest',
});

const plan = planExteriorScaffoldRoute({
  fp: { cx: 0, cz: 0, halfX: 8.5, halfZ: 3.2 },
  siteId: 7, moduleKey: 'm', floors: 3, floorH: 3.2, side: 'north', seed: 123,
  physicalTruth: truth, maxExteriorDepth: 3.0, routeId: 'unit:scaffold',
});
assert.ok(plan, 'canonical facade zigzag should fit the unit facade');
assert.equal(plan.topology, 'canonical-facade-zigzag');
assert.equal(assertCanonicalFacadeZigzag(plan), true);
assert.equal(scaffoldRouteIsContinuous(plan), true);
assert.equal(plan.flights.length, 3, 'three stories require exactly three full-story flights');
for (let level = 0; level < plan.floors; level++) {
  const flight = plan.flights[level];
  assert.equal(flight.fixedCoord, plan.scaffoldEnvelope.fixedCoord);
  assert.equal(flight.rise, plan.floorH);
  if (level > 0) {
    const previous = plan.flights[level - 1];
    assert.equal(previous.to, flight.from);
    assert.notEqual(Math.sign(previous.to - previous.from), Math.sign(flight.to - flight.from));
  }
}
for (const landing of plan.landings) {
  const lo = landing.tangentCenter - landing.tangentSize * 0.5;
  const hi = landing.tangentCenter + landing.tangentSize * 0.5;
  if (landing.landingPosition === 'run-low-beyond') assert.ok(Math.abs(hi - plan.scaffoldEnvelope.runLow) < 1e-6);
  else assert.ok(Math.abs(lo - plan.scaffoldEnvelope.runHigh) < 1e-6);
}

const scaffoldSource = fs.readFileSync(new URL('../world/scaffold-circulation-plan.js', import.meta.url), 'utf8');
const fastSource = fs.readFileSync(new URL('../world/fast-vertical-route.js', import.meta.url), 'utf8');
assert.match(scaffoldSource, /planAlternatingFacadeStair/);
assert.match(fastSource, /planAlternatingFacadeStair/);
assert.doesNotMatch(scaffoldSource, /splitRiseA|streetLaneCoord|buildingLaneCoord/,
  'retired two-half-lane scaffold geometry must not remain active');
assert.doesNotMatch(fastSource, /export function planFastVerticalRoute\s*\(/,
  'obsolete 03 direct/side-run stair author must not return');
assert.doesNotMatch(fastSource, /export function planSharedVerticalTrunk\s*\(/,
  'obsolete 04 per-door stair author must not return');

const mainSource = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
assert.doesNotMatch(mainSource, /vertical-circulation\.js|building-construction\.js/,
  'historical geometry-first stair builders must remain outside the runtime graph');
const buildingSource = fs.readFileSync(new URL('../world/building-construction.js', import.meta.url), 'utf8');
assert.match(buildingSource, /legacyFireEscapeSuppressed/,
  'legacy building-construction fire escape must stay explicitly suppressed');

const shaft = createStairShaftReservation({
  id: 'unit:shaft', x: 0, z: 0,
  openingWidth: 1.4, openingDepth: 5.8,
  baseY: 0, roofY: 3.2, exitHeadroom: 2.05,
  rampAxis: 'z', rampFrom: -2.5, rampTo: 2.5, rampHalfWidth: 0.55,
});
assert.equal(assertStairShaftContainsFlight({
  id: 'unit:shaft', reservation: shaft,
  axis: 'z', from: -2.5, to: 2.5, fixedCoord: 0, halfWidth: 0.55, y0: 0, y1: 3.2,
}), true);
assert.throws(() => assertStairShaftContainsFlight({
  id: 'unit:bad-shaft', reservation: shaft,
  axis: 'x', from: -4, to: 4, fixedCoord: 0, halfWidth: 0.8, y0: 0, y1: 3.2,
}), /does not contain/);

const landing = {
  id: 'unit:landing', generated: true,
  stairThroat: { x: 1.55, z: 0, hx: 1.8, hz: 0.65 },
};
const flight = {
  axis: 'x', from: -2, to: 3, fixedCoord: 0, halfWidth: 0.5,
  y0: 0, y1: 3.2, headroom: 2.0,
};
assert.equal(assertLandingThroatClearsFlight({ id: landing.id, landing, flight }), true);
assert.throws(() => assertLandingThroatClearsFlight({
  id: 'unit:bad-throat', landing: { ...landing, stairThroat: { x: 2.9, z: 0, hx: 0.15, hz: 0.6 } }, flight,
}), /headroom sweep/);

console.log('[stair-volume-contract-selftest] PASS', {
  topology: plan.topology,
  stories: plan.floors,
  flights: plan.flights.length,
  invariant: 'one shared full-story wall zigzag; end landings live beyond the run; generated decks carry explicit headroom throats',
});
