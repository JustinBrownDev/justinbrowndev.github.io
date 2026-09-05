import assert from 'node:assert/strict';
import { resolvePhysicalTruth } from '../world/physical-truth.js';
import { planExteriorScaffoldRoute } from '../world/scaffold-circulation-plan.js';
import { planSkybridgeArchitecture } from '../world/skybridge-architecture.js';

const truth = resolvePhysicalTruth({ physicalUse: 'industrial-service', role: 'maintenance-access', weirdness: 0.38, stableKey: 'cut21s:bulk' });
const base = planExteriorScaffoldRoute({
  fp: { cx: 0, cz: 0, halfX: 14, halfZ: 8 }, siteId: 1, moduleKey: 'm', floors: 4,
  floorH: 3.2, side: 'north', seed: 11, physicalTruth: truth, maxExteriorDepth: 5.5,
  routeId: 'cut21s:scaffold:base',
});
const fat = planExteriorScaffoldRoute({
  fp: { cx: 0, cz: 0, halfX: 14, halfZ: 8 }, siteId: 1, moduleKey: 'm', floors: 4,
  floorH: 3.2, side: 'north', seed: 11, physicalTruth: truth, maxExteriorDepth: 5.5,
  clearWidthOverride: Math.min(2.0, truth.stair.widthSI * 1.65), routeId: 'cut21s:scaffold:fat',
});
assert.ok(base && fat);
assert.ok(fat.clearWidth > base.clearWidth * 1.35, 'bulkier stair style must widen the actual walkable flight');
assert.ok(fat.flights.every(flight => Math.abs(flight.clearWidth - fat.clearWidth) < 1e-9));
assert.ok(fat.landings.every(landing => landing.normalSize > base.landings[0].normalSize),
  'landings must grow with stair width rather than leaving a fat frame around a skinny path');
assert.equal(fat.flights[0].stairFlight.riserHeight, base.flights[0].stairFlight.riserHeight,
  'width scaling may not reinvent the proven riser/tread kernel');
assert.equal(fat.flights[0].stairFlight.treadDepth, base.flights[0].stairFlight.treadDepth,
  'width scaling may not reinvent the proven riser/tread kernel');

const bridge = planSkybridgeArchitecture({
  id: 'cut21s:supported-bridge', axis: 'x', from: 0, to: 18, fixedCoord: 0, y: 14,
  width: 3.4, family: 'heavy-beam', widthClass: 'sky-street', stableKey: 'cut21s:supported-bridge',
  supportModeHint: 'braced-from-below',
});
assert.equal(bridge.supportMode, 'braced-from-below');
assert.ok(bridge.supportParts >= 6, 'bulkier bridge must acquire real visible support structure');
assert.ok(bridge.metal.some(part => part.bridgeSupport === true));

console.log('[cut21s-bulk-coupling-selftest] PASS', {
  baseStairWidth: base.clearWidth,
  fatStairWidth: fat.clearWidth,
  bridgeSupportParts: bridge.supportParts,
  invariant: 'architectural bulk scales the path and landings while canonical stair rise/run physics remain unchanged',
});
