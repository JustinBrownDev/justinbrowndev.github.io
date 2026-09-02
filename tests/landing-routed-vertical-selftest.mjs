import assert from 'node:assert/strict';
import { resolvePhysicalTruth } from '../world/physical-truth.js';
import { planExteriorStreetLayerTrunk } from '../world/fast-vertical-route.js';

const truth = resolvePhysicalTruth({ physicalUse: 'industrial-service', role: 'maintenance-access', weirdness: 0.35, stableKey: 'landing-routed-vertical-selftest' });
const portal = (id, floor, x) => ({ roomSpaceId: `room:${floor}`, portal: { id, x, z: -5, width: 1.0, height: 2.1 }, source: 'unit-room' });
const route = planExteriorStreetLayerTrunk({
  routeId: 'unit:landing-routed',
  fp: { cx: 0, cz: 0, halfX: 12, halfZ: 5 },
  moduleKey: 'm', dirKey: 'north', side: 'north', floorH: 3.2, physicalTruth: truth,
  layerStops: [
    { floor: 1, portals: [portal('p1', 1, 5.5)] },
    { floor: 2, portals: [portal('p2', 2, -5.5)] },
    { floor: 3, portals: [portal('p3', 3, 5.5)], support: { id: 'roof-target', existing: true, kind: 'clear-roof-edge-layer' } },
  ],
});
assert.ok(route);
assert.equal(route.requiresLandingThroats, false);
assert.equal(route.generatedLandings.length, 3, 'target supports do not eliminate required stair landings');
assert.equal(route.flightHeadroomClearances.length, route.flights.length);
assert.ok(route.generatedLandings.every(l => l.stairThroat === null && l.stairCarveAllowed === false));
assert.ok(route.generatedLandings.every(l => l.geometry.hx > 0 && l.geometry.hz > 0));
for (let i = 1; i < route.flights.length; i++) {
  assert.notEqual(route.flights[i - 1].fixedCoord, route.flights[i].fixedCoord, 'return flight must move to other lane');
  assert.notEqual(route.landings[i].incomingMouth.laneIndex, route.landings[i].outgoingMouth.laneIndex, 'landing owns the horizontal turn');
}
assert.equal(route.generatedLandings.at(-1).targetSupport.id, 'roof-target');
console.log('[landing-routed-vertical-selftest] PASS', { flights: route.flights.length, landings: route.generatedLandings.length, invariant: 'destination -> landing -> stair mouth -> flight; no stair-through-landing carve' });
