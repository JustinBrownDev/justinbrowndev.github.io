import assert from 'node:assert/strict';
import { resolvePhysicalTruth } from '../world/physical-truth.js';
import {
  classifyRoofJumpConnection,
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



const crossoverRoofA = s('roof:cross:A', 0, 12, 2.0, 1.5, 6.4, {
  siteId: 20, kind: 'clear-roof-street-layer', reachable: true, routeId: null,
});
const crossoverRoofB = s('roof:cross:B', 4.0, 12, 2.0, 1.5, 6.4, {
  siteId: 21, kind: 'clear-roof-street-layer', reachable: false, routeId: null,
});
const crossover = classifyTransportConnection(crossoverRoofA, crossoverRoofB);
assert.equal(crossover.kind, 'roof-crossover-link', 'touching roof plates are parapet crossovers, not fake zero-distance jumps');
assert.equal(crossover.gap, 0);

const jumpRoofA = s('roof:jump:A', 0, 8, 2.0, 1.5, 6.4, {
  siteId: 10, kind: 'clear-roof-street-layer', reachable: true, routeId: null,
});
const jumpRoofB = s('roof:jump:B', 5.7, 8, 1.7, 1.5, 6.4, {
  siteId: 11, kind: 'clear-roof-street-layer', reachable: false, routeId: null,
});
const jump = classifyTransportConnection(jumpRoofA, jumpRoofB);
assert.equal(jump.kind, 'jump-link', 'near same-height clear roofs use the conservative gameplay jump envelope before a built walkway');
assert.ok(jump.gap > 1.9 && jump.gap < 2.1);
assert.ok(jump.gap <= jump.maxRange);
assert.equal(jump.traversalAuthority, 'gameplay-controller-ballistic-envelope');

const farJumpRoof = s('roof:jump:far', 6.25, 8, 1.7, 1.5, 6.4, {
  siteId: 12, kind: 'clear-roof-street-layer', reachable: false, routeId: null,
});
assert.equal(classifyTransportConnection(jumpRoofA, farJumpRoof).kind, 'walkway-link',
  'a roof gap beyond the conservative jump range must fall back to built transport, not inferred jumping');

const raisedJumpRoof = s('roof:jump:raised', 5.15, 8, 1.7, 1.5, 6.8, {
  siteId: 13, kind: 'clear-roof-street-layer', reachable: false, routeId: null,
});
const raisedRelation = classifyTransportConnection(jumpRoofA, raisedJumpRoof);
assert.equal(raisedRelation.kind, 'jump-link', 'small bidirectional roof rise remains a legal conservative jump');
assert.ok(raisedRelation.rise > 0.39 && raisedRelation.rise < 0.41);

const tooHighRoof = s('roof:jump:high', 5.15, 8, 1.7, 1.5, 7.25, {
  siteId: 14, kind: 'clear-roof-street-layer', reachable: false, routeId: null,
});
assert.notEqual(classifyTransportConnection(jumpRoofA, tooHighRoof)?.kind, 'jump-link',
  'height difference outside the bidirectional envelope must not become a jump');

const jumpPlan = planExteriorTransportNetwork({
  surfaces: [jumpRoofA, jumpRoofB], maxLinks: 4, maxStairLinks: 2, maxJumpLinks: 2,
  stableKey: 'roof-jump-network',
});
assert.equal(jumpPlan.linkCounts.jump, 1);
assert.equal(jumpPlan.links[0].kind, 'jump-link');

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
  invariant: 'junctions need usable overlap; roof jumps require the gameplay ballistic envelope and real landing depth; selected links keep clearance around reserved stair throats',
});
