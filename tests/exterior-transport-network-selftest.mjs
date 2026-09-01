import assert from 'node:assert/strict';
import { resolvePhysicalTruth } from '../world/physical-truth.js';
import {
  classifyTransportConnection,
  planExteriorTransportNetwork,
  transportSurfaceIntersection,
} from '../world/exterior-transport-network.js';

const truth = resolvePhysicalTruth({
  physicalUse: 'industrial-service', role: 'maintenance-access', weirdness: 0.20,
  stableKey: 'transport-network-selftest',
});
const s = (id, x, z, hx, hz, y, extra = {}) => ({
  id, x, z, hx, hz, y, siteId: extra.siteId ?? id,
  moduleKey: extra.moduleKey ?? id,
  routeId: extra.routeId ?? id,
  kind: extra.kind ?? 'balcony-street-layer',
  reachable: extra.reachable ?? true,
  physicalTruth: truth,
  ...extra,
});

const balconyA = s('balcony:A', 0, 0, 2.0, 0.9, 3.2, { siteId: 1 });
const catwalkOverlap = s('catwalk:overlap', 1.4, 0, 1.2, 0.65, 3.2, { siteId: 2, kind: 'guarded-catwalk' });
const union = classifyTransportConnection(balconyA, catwalkOverlap);
assert.equal(union.kind, 'surface-union', 'balcony/catwalk overlap must become one transport surface union, not a collision');
assert.ok(transportSurfaceIntersection(balconyA, catwalkOverlap));

const balconyB = s('balcony:B', 5.4, 0, 1.6, 0.9, 3.2, { siteId: 3 });
const walkway = classifyTransportConnection(balconyA, balconyB);
assert.equal(walkway.kind, 'walkway-link', 'same-height separated street layers should get a horizontal connector');

const upperC = s('balcony:C', 13.6, 0, 1.6, 0.9, 6.4, { siteId: 4 });
const stair = classifyTransportConnection(balconyB, upperC);
assert.equal(stair.kind, 'stair-link', 'different-height street layers should be connectable by an arbitrary cross-building stair');
assert.equal(stair.stairFlight.fitClassification, 'fits-resolved-truth');

const roof = s('roof:D', 14.0, 0.2, 2.0, 1.6, 6.4, {
  siteId: 5, kind: 'clear-roof-street-layer', reachable: false, routeId: null,
});
const roofUnion = classifyTransportConnection(upperC, roof);
assert.equal(roofUnion.kind, 'surface-union', 'clear roof may join the same street layer by geometric union');

const plan = planExteriorTransportNetwork({
  surfaces: [balconyA, catwalkOverlap, balconyB, upperC, roof],
  maxLinks: 8, maxStairLinks: 4, stableKey: 'unit-network',
});
assert.ok(plan.links.some(link => link.kind === 'surface-union'));
assert.ok(plan.links.some(link => link.kind === 'walkway-link'));
assert.ok(plan.links.some(link => link.kind === 'stair-link'));
assert.ok(plan.links.some(link => link.aId === roof.id || link.bId === roof.id),
  'an unreachable clear roof should become transport only by being connected to a live layer');

console.log('[exterior-transport-network-selftest] PASS', {
  links: plan.links.map(link => link.kind),
  invariant: 'balcony/catwalk/roof surfaces union when intersecting; street layers may connect horizontally or by arbitrary inter-layer stairs',
});
