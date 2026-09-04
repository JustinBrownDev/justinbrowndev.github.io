import assert from 'node:assert/strict';
import { buildExteriorDebugSnapshot, EXTERIOR_DEBUG_SNAPSHOT_SCHEMA } from '../world/exterior-debug-summary.js';

const clean = buildExteriorDebugSnapshot({
  chunk: { key: 'clean' },
  physics: {
    exteriorTransportSurfaces: [
      { id: 'a', kind: 'balcony-street-layer', x: 0, z: 0, hx: 1, hz: 1, y: 3, reachable: true },
      { id: 'b', kind: 'clear-roof-street-layer', x: 3, z: 0, hx: 1, hz: 1, y: 3, reachable: false },
    ],
    exteriorTransportNetwork: { links: [], realized: 0, unions: 0, walkwayLinks: 0, stairLinks: 0, jumpLinks: 0 },
    platforms: [
      { surfaceId: 'a', x: 0, z: 0, hx: 1, hz: 1, y: 3 },
      { surfaceId: 'b', x: 3, z: 0, hx: 1, hz: 1, y: 3 },
    ],
    fastStairThroats: [], scaffoldCirculationRoutes: [], fastVerticalRoutes: [],
  },
  entities: [{ kind: 'building', fastFacadeArchitectureMetrics: { faces: 2, portalFrames: 1, windows: 4, newPortalCount: 0 } }],
});
assert.equal(clean.schema, EXTERIOR_DEBUG_SNAPSHOT_SCHEMA);
assert.equal(clean.transport.duplicatePlatformOverlaps, 0);
assert.equal(clean.transport.stairThroatConflicts, 0);
assert.equal(clean.transport.unreachableClearRoofs, 1);
assert.equal(clean.transport.roofCrossovers, 0);
assert.equal(clean.transport.jumpLinks, 0);
assert.equal(clean.facade.portalFrames, 1);
assert.deepEqual(clean.issues, []);

const bad = buildExteriorDebugSnapshot({
  chunk: { key: 'bad' },
  physics: {
    exteriorTransportSurfaces: [
      { id: 'a', kind: 'balcony-street-layer', x: 0, z: 0, hx: 1, hz: 1, y: 3, reachable: true },
      { id: 'b', kind: 'guarded-catwalk', x: 0.5, z: 0, hx: 1, hz: 0.5, y: 3, reachable: true },
    ],
    platforms: [
      { surfaceId: 'a', x: 0, z: 0, hx: 1, hz: 1, y: 3 },
      { surfaceId: 'b', x: 0.5, z: 0, hx: 1, hz: 0.5, y: 3 },
    ],
    fastStairThroats: [{ x: 0, z: 0, hx: 0.4, hz: 0.4, y: 3, routeId: 'r', landingId: 'l' }],
    scaffoldCirculationRoutes: [{ id: 'old', topology: 'alternating-straight' }],
  },
  entities: [{ kind: 'building', fastFacadeArchitectureMetrics: { newPortalCount: 1 } }],
});
assert.ok(bad.transport.duplicatePlatformOverlaps > 0);
assert.ok(bad.transport.stairThroatConflicts > 0);
assert.equal(bad.transport.nonCanonicalScaffolds, 1);
assert.ok(bad.issues.some(issue => issue.startsWith('duplicate-transport-overlaps:')));
assert.ok(bad.issues.some(issue => issue.startsWith('stair-throat-conflicts:')));
assert.ok(bad.issues.some(issue => issue.startsWith('noncanonical-scaffolds:')));
assert.ok(bad.issues.some(issue => issue.startsWith('facade-invented-portals:')));
console.log('[exterior-debug-summary-selftest] PASS', {
  cleanIssues: clean.issues.length,
  badIssues: bad.issues,
  invariant: 'one compact snapshot catches 06 transport/stair regressions and 07 facade portal regressions together',
});
