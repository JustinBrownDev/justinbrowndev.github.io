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
assert.equal(union.kind, 'surface-union', 'usable balcony/catwalk overlap becomes a deliberate junction');
assert.ok(transportSurfaceIntersection(balconyA, catwalkOverlap));

const barelyTouching = s('catwalk:micro', 3.95, 0, 2.0, 0.9, 3.2, { siteId: 6 });
assert.ok(transportSurfaceIntersection(balconyA, barelyTouching), 'raw rectangles do overlap slightly');
assert.equal(classifyTransportConnection(balconyA, barelyTouching), null,
  'a paper-thin overlap is not a traversable surface union');

const balconyB = s('balcony:B', 5.4, 0, 1.6, 0.9, 3.2, { siteId: 3 });
const walkway = classifyTransportConnection(balconyA, balconyB);
assert.equal(walkway.kind, 'walkway-link', 'same-height separated street layers get a horizontal connector');

const sliverThroat = {
  id: 'existing-trunk:sliver-throat',
  x: (walkway.aEdge + walkway.bEdge) * 0.5,
  z: walkway.fixedCoord + walkway.halfWidth + 0.20 - 0.017,
  hx: 0.20, hz: 0.20, y: walkway.y0,
};
const sliverBlockedPlan = planExteriorTransportNetwork({
  surfaces: [balconyA, balconyB],
  blockedRects: [sliverThroat],
  maxLinks: 4,
  maxStairLinks: 4,
  stableKey: 'sliver-blocked-network',
});
assert.equal(sliverBlockedPlan.links.length, 0,
  'transport must keep a safety margin around stair throats, not accept a threshold sliver');
assert.ok(sliverBlockedPlan.rejectionCounts.blocked >= 1);

const upperC = s('balcony:C', 13.6, 0, 1.6, 0.9, 6.4, { siteId: 4, reachable: false });
const stair = classifyTransportConnection(balconyB, upperC);
assert.equal(stair.kind, 'stair-link', 'different-height street layers may connect by a stair when the run fits truth');
assert.equal(stair.stairFlight.fitClassification, 'fits-resolved-truth');

const blockingThroat = {
  id: 'existing-trunk:floor2:throat',
  x: stair.upperPoint.x,
  z: stair.upperPoint.z,
  hx: stair.halfWidth + 0.18,
  hz: stair.halfWidth + 0.18,
  y: stair.y1,
};
const blockedPlan = planExteriorTransportNetwork({
  surfaces: [balconyB, upperC],
  blockedRects: [blockingThroat],
  maxLinks: 4,
  maxStairLinks: 4,
  stableKey: 'blocked-network',
});
assert.equal(blockedPlan.links.length, 0, 'a new transport stair may not claim an existing stair headroom/throat mouth');
assert.ok(blockedPlan.rejectionCounts.blocked >= 1);

const roof = s('roof:D', 14.0, 0.2, 2.0, 1.6, 6.4, {
  siteId: 5, kind: 'clear-roof-street-layer', reachable: false, routeId: null,
});
const roofUnion = classifyTransportConnection({ ...upperC, reachable: true }, roof);
assert.equal(roofUnion.kind, 'surface-union', 'clear roof may join a live street layer through a real usable overlap');

const plan = planExteriorTransportNetwork({
  surfaces: [balconyA, catwalkOverlap, balconyB, { ...upperC, reachable: true }, roof],
  maxLinks: 8,
  maxStairLinks: 4,
  stableKey: 'unit-network',
});
assert.ok(plan.links.some(link => link.kind === 'surface-union'));
assert.ok(plan.links.some(link => link.kind === 'walkway-link'));
assert.ok(plan.links.some(link => link.kind === 'stair-link'));
assert.ok(plan.links.some(link => link.aId === roof.id || link.bId === roof.id),
  'an unreachable clear roof becomes transport only through a selected live junction');

console.log('[exterior-transport-network-selftest] PASS', {
  links: plan.links.map(link => link.kind),
  rejections: plan.rejectionCounts,
  invariant: 'junctions need usable overlap; selected links keep clearance around reserved stair throats and cannot pile onto the same mouth',
});
