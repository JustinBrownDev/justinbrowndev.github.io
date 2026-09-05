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

// A same-level link may have empty roof-to-roof 2D space while still crossing
// through the body of a taller third building.  This is the generated chunk 1,0
// failure that laid a transport rail across a compound stair mouth.
const volumeLeft = s('volume:left', 0, 4, 1.5, 1.0, 6.4, {
  siteId: 91, kind: 'clear-roof-street-layer', reachable: true, priority: 'circulation-candidate',
});
const volumeRight = s('volume:right', 8, 4, 1.5, 1.0, 6.4, {
  siteId: 92, kind: 'clear-roof-street-layer', reachable: false, priority: 'circulation-candidate',
});
assert.equal(classifyTransportConnection(volumeLeft, volumeRight)?.kind, 'walkway-link');
const throughBuildingPlan = planExteriorTransportNetwork({
  surfaces: [volumeLeft, volumeRight],
  blockedVolumes: [{
    id: 'volume:middle-building', x: 4, z: 4, hx: 1.4, hz: 1.4,
    yMin: 0, yMax: 12.8, surfaceId: 'volume:middle-roof', moduleKey: 'middle', siteId: 93,
  }],
  maxLinks: 4, maxStairLinks: 4, stableKey: 'third-building-volume-canary',
});
assert.equal(throughBuildingPlan.links.length, 0,
  'roof transport must not pass through an unrelated taller building volume');
assert.ok(throughBuildingPlan.rejectionCounts.volumeBlocked >= 1,
  'building-volume rejection must remain visible in planner diagnostics');

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

// A third upper roof spanning the nominal 2D gap must invalidate a straight
// stair instead of allowing the graph to route a player underneath solid floor.
const underRoofLower = s('under-roof:lower', 5.4, 4.0, 1.6, 0.9, 3.2, { siteId: 81, reachable: true });
const underRoofUpper = s('under-roof:upper', 13.6, 4.0, 1.6, 0.9, 6.4, { siteId: 82, reachable: false });
const underRoofBlocker = s('under-roof:blocker', 9.5, 4.0, 1.55, 0.20, 6.4, {
  siteId: 83, kind: 'guarded-catwalk', reachable: false,
});
assert.equal(classifyTransportConnection(underRoofLower, underRoofUpper)?.kind, 'stair-link',
  'endpoint-only classification still sees a geometrically plausible stair');
const underRoofPlan = planExteriorTransportNetwork({
  surfaces: [underRoofLower, underRoofUpper, underRoofBlocker],
  maxLinks: 4, maxStairLinks: 4, stableKey: 'third-surface-headroom-canary',
});
assert.equal(underRoofPlan.links.some(link => link.aId === underRoofLower.id && link.bId === underRoofUpper.id
  || link.aId === underRoofUpper.id && link.bId === underRoofLower.id), false,
  'planner must reject a stair corridor occluded by an unrelated upper transport slab');
assert.ok(underRoofPlan.rejectionCounts.surfaceBlocked >= 1,
  'surface-blocked stair rejection should remain observable in diagnostics');

// Lane shifting remains a planner capability, but it should be tested directly
// rather than requiring one whole generated chunk to happen to need it after
// solid-volume rejection removes bad branches earlier.
const laneShiftPlan = planExteriorTransportNetwork({
  surfaces: [
    s('lane:A', 0, 0, 2.2, 2.2, 4, { reachable: true }),
    s('lane:B', 1.7851193131230851, -3.070662363766893, 1.8748865616507828, 1.4081337285460904, 4, { reachable: false }),
    s('lane:C', 4.051004419211848, 2.894272467690238, 1.7598039988661185, 1.1053145851474255, 4.047907078638673, { reachable: false }),
    s('lane:D', 3.336906621088425, 0.023136613447517565, 1.0820552714867517, 1.904873444698751, 4, { reachable: false }),
    s('lane:E', 5.03126840776295, -4.288856964326886, 2.028535591904074, 1.0602160879643634, 3.72317528212443, { reachable: false }),
  ],
  maxLinks: 4, maxStairLinks: 4, maxJumpLinks: 0, maxArterialSpan: 12,
  stableKey: 'lane-shift-direct-canary',
});
assert.ok(laneShiftPlan.planning.laneShiftedLinks >= 1,
  'planner must retain collision-safe lane shifting when a valid alternate stair lane exists');
assert.ok(laneShiftPlan.links.some(link => link.laneShifted === true));

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


const chainA = s('chain:A', 0, 20, 1.0, 1.2, 4.0, { siteId: 30, kind: 'balcony-street-layer', reachable: true });
const chainB = s('chain:B', 4.2, 20, 1.0, 1.2, 4.0, { siteId: 31, kind: 'balcony-street-layer', reachable: false });
const chainC = s('chain:C', 7.3, 20, 1.0, 1.2, 4.0, { siteId: 32, kind: 'balcony-street-layer', reachable: false });
const frontierPlan = planExteriorTransportNetwork({
  surfaces: [chainA, chainB, chainC], maxLinks: 2, maxStairLinks: 0, stableKey: 'frontier-rescan-network',
});
assert.equal(frontierPlan.links.length, 2, 'frontier planning must reconsider a cheap deferred B->C link after A->B becomes live');
assert.deepEqual(new Set(frontierPlan.reachableSurfaceIds), new Set([chainA.id, chainB.id, chainC.id]));

const routeSeed = s('route:seed', 0, 24, 1.0, 1.0, 4.0, { siteId: 40, kind: 'guarded-catwalk', reachable: true, routeId: 'shared-route' });
const routePeer = s('route:peer', 20, 24, 1.0, 1.0, 4.0, { siteId: 40, kind: 'guarded-catwalk', reachable: false, routeId: 'shared-route' });
const componentSeedPlan = planExteriorTransportNetwork({ surfaces: [routeSeed, routePeer], maxLinks: 0, stableKey: 'component-seed-network' });
assert.deepEqual(new Set(componentSeedPlan.reachableSurfaceIds), new Set([routeSeed.id, routePeer.id]),
  'reachability must propagate across a pre-existing route component before new links are planned');

const arterialA = s('arterial:A', 0, 28, 2.0, 1.2, 4.0, { siteId: 50, kind: 'balcony-street-layer', reachable: true });
const arterialB = s('arterial:B', 20, 28, 2.0, 1.2, 4.0, { siteId: 51, kind: 'balcony-street-layer', reachable: false });
const arterialPlan = planExteriorTransportNetwork({ surfaces: [arterialA, arterialB], maxLinks: 1, stableKey: 'arterial-fallback-network' });
assert.equal(arterialPlan.links.length, 1, 'a required long-span component may use the deferred arterial tier after local candidates are exhausted');
assert.equal(arterialPlan.links[0].kind, 'walkway-link');
assert.equal(arterialPlan.links[0].arterial, true);
assert.equal(arterialPlan.planning.arterialLinks, 1);
assert.ok(arterialPlan.reachableSurfaceIds.includes(arterialB.id));


const closureRoofA = s('closure:A', 0, 32, 1.4, 1.2, 4.0, {
  siteId: 60, kind: 'clear-roof-street-layer', reachable: true, priority: 'circulation-candidate',
});
const closureRoofB = s('closure:B', 4.5, 32, 1.4, 1.2, 4.0, {
  siteId: 61, kind: 'clear-roof-street-layer', reachable: false, priority: 'circulation-candidate',
});
const closureOptional = s('closure:optional', 8.8, 32, 1.4, 1.2, 4.0, {
  siteId: 62, kind: 'balcony-street-layer', reachable: false, priority: 'circulation-owned',
});
const closureOnlyPlan = planExteriorTransportNetwork({
  surfaces: [closureRoofA, closureRoofB, closureOptional], maxLinks: 8, maxStairLinks: 0,
  stopWhenRequiredReachable: true, restrictArterialsToRequiredClosure: true,
  stableKey: 'required-closure-stop-network',
});
assert.equal(closureOnlyPlan.closure.unreachableRequired, 0);
assert.equal(closureOnlyPlan.links.length, 1,
  'required-closure mode must stop immediately after the last required roof becomes reachable');
assert.ok(!closureOnlyPlan.reachableSurfaceIds.includes(closureOptional.id),
  'required-closure mode must not grow optional low-level branches after roof closure is satisfied');
assert.equal(closureOnlyPlan.planning.stopWhenRequiredReachable, true);

const cappedArterialPlan = planExteriorTransportNetwork({
  surfaces: [
    s('cap:A', 0, 36, 2.0, 1.2, 4.0, { siteId: 70, kind: 'clear-roof-street-layer', reachable: true, priority: 'circulation-candidate' }),
    s('cap:B', 20, 36, 2.0, 1.2, 4.0, { siteId: 71, kind: 'clear-roof-street-layer', reachable: false, priority: 'circulation-candidate' }),
  ],
  maxLinks: 4, maxStairLinks: 0, maxArterialWalkwaySpan: 10,
  stopWhenRequiredReachable: true, restrictArterialsToRequiredClosure: true,
  stableKey: 'ground-arterial-walkway-cap-network',
});
assert.equal(cappedArterialPlan.links.filter(link => link.kind === 'walkway-link' && link.arterial).length, 0,
  'ground-style closure may cap fabricated same-level arterial catwalk spans independently from stair reach');

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
  invariant: 'component-aware frontier closure grows cheap local links first, then deterministic arterial fallbacks, while preserving blocked-throat and overlap safety',
});
