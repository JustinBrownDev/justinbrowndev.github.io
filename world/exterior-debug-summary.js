export const EXTERIOR_DEBUG_SNAPSHOT_SCHEMA = 'jweb.exterior-debug-snapshot.v1';

function countBy(items, keyFn) {
  const out = {};
  for (const item of items ?? []) {
    const key = String(keyFn(item) ?? 'unknown');
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}
function rectOverlap(a, b, epsilon = 0.025) {
  return Math.abs(Number(a.x) - Number(b.x)) < Number(a.hx) + Number(b.hx) - epsilon
    && Math.abs(Number(a.z) - Number(b.z)) < Number(a.hz) + Number(b.hz) - epsilon;
}
function sameLevel(a, b, tolerance = 0.08) { return Math.abs(Number(a.y) - Number(b.y)) <= tolerance; }
function transportPlatforms(physics) {
  return (physics?.platforms ?? []).filter(item => item?.surfaceId);
}
function duplicateTransportOverlaps(physics) {
  const platforms = transportPlatforms(physics);
  const pairs = [];
  for (let i = 0; i < platforms.length; i++) {
    for (let j = i + 1; j < platforms.length; j++) {
      const a = platforms[i], b = platforms[j];
      if (!a.surfaceId || !b.surfaceId || a.surfaceId === b.surfaceId || !sameLevel(a, b)) continue;
      if (!rectOverlap(a, b)) continue;
      pairs.push(`${a.surfaceId}<->${b.surfaceId}`);
      if (pairs.length >= 8) return pairs;
    }
  }
  return pairs;
}
function throatConflicts(physics) {
  const platforms = (physics?.platforms ?? []).filter(item => item?.surfaceId || item?.supportKind === 'broad-vertical-landing' || item?.supportKind === 'scaffold');
  const conflicts = [];
  for (const throat of physics?.fastStairThroats ?? []) {
    for (const platform of platforms) {
      if (!sameLevel(throat, platform, 0.06)) continue;
      if (!rectOverlap(throat, platform, 0.015)) continue;
      conflicts.push(`${throat.routeId ?? 'route'}:${throat.landingId ?? 'landing'}<->${platform.surfaceId ?? platform.supportKind ?? 'platform'}`);
      if (conflicts.length >= 8) return conflicts;
    }
  }
  return conflicts;
}
function aggregateFacade(entities) {
  const metrics = {
    buildings: 0, faces: 0, portalFrames: 0, groundPortalFrames: 0, upperPortalFrames: 0,
    storefronts: 0, serviceShutters: 0, canopies: 0, stoops: 0, windows: 0,
    protectedOpeningFloors: 0, newPortalCount: 0,
  };
  for (const entity of entities ?? []) {
    const m = entity?.fastFacadeArchitectureMetrics;
    if (!m) continue;
    metrics.buildings++;
    for (const key of Object.keys(metrics)) {
      if (key === 'buildings') continue;
      metrics[key] += Number(m[key]) || 0;
    }
  }
  return metrics;
}

export function buildExteriorDebugSnapshot({ chunk, physics = {}, entities = [], exteriorTransportNetwork = null } = {}) {
  const surfaces = physics.exteriorTransportSurfaces ?? [];
  const network = exteriorTransportNetwork ?? physics.exteriorTransportNetwork ?? {};
  const edges = physics.exteriorTransportEdges ?? [];
  const networkReachable = new Set(Array.isArray(network.reachableSurfaceIds) ? network.reachableSurfaceIds.map(String) : []);
  const plannedSurfaceIds = new Set(Array.isArray(network.surfaces) ? network.surfaces.map(surface => String(surface.id)) : []);
  const surfaceReachable = surface => {
    const id = String(surface.id);
    if (!networkReachable.size) return surface.reachable !== false;
    if (networkReachable.has(id)) return true;
    // Walkway slabs are published while the selected plan is being realized, so
    // they are not present in the planner's pre-realization reachable ID set.
    if (!plannedSurfaceIds.has(id)) return surface.reachable !== false;
    return false;
  };
  const scaffoldRoutes = physics.scaffoldCirculationRoutes ?? [];
  const fastRoutes = physics.fastVerticalRoutes ?? [];
  const guardSpans = physics.guardSpans ?? [];
  const duplicatePairs = duplicateTransportOverlaps(physics);
  const headroomPairs = throatConflicts(physics);
  const nonCanonicalScaffolds = scaffoldRoutes.filter(route => route.topology !== 'canonical-facade-zigzag').map(route => route.id).slice(0, 8);
  const facade = aggregateFacade(entities);
  const issues = [];
  if (duplicatePairs.length) issues.push(`duplicate-transport-overlaps:${duplicatePairs.length}`);
  if (headroomPairs.length) issues.push(`stair-throat-conflicts:${headroomPairs.length}`);
  if (nonCanonicalScaffolds.length) issues.push(`noncanonical-scaffolds:${nonCanonicalScaffolds.length}`);
  if (facade.newPortalCount) issues.push(`facade-invented-portals:${facade.newPortalCount}`);

  return Object.freeze({
    schema: EXTERIOR_DEBUG_SNAPSHOT_SCHEMA,
    chunk: chunk?.key ?? null,
    transport: Object.freeze({
      surfaces: surfaces.length,
      surfaceKinds: countBy(surfaces, item => item.kind),
      reachableSurfaces: surfaces.filter(surfaceReachable).length,
      unreachableClearRoofs: surfaces.filter(item => item.kind === 'clear-roof-street-layer' && !surfaceReachable(item)).length,
      edges: edges.length,
      edgeKinds: countBy(edges, item => item.kind ?? item.source),
      plannedLinks: Array.isArray(network.links) ? network.links.length : 0,
      realizedLinks: Number(network.realized) || 0,
      unions: Number(network.unions) || 0,
      walkways: Number(network.walkwayLinks) || 0,
      stairLinks: Number(network.stairLinks) || 0,
      roofCrossovers: Number(network.roofCrossovers) || 0,
      jumpLinks: Number(network.jumpLinks) || 0,
      requiredSurfaces: Number(network.closure?.required) || 0,
      reachableRequiredSurfaces: Number(network.closure?.reachableRequired) || 0,
      unreachableRequiredSurfaces: Number(network.closure?.unreachableRequired) || 0,
      arterialLinks: Number(network.planning?.arterialLinks) || 0,
      laneShiftedLinks: Number(network.planning?.laneShiftedLinks) || 0,
      rejectedBlockedLinks: Number(network.rejectionCounts?.blocked) || 0,
      rejectedOverlappingLinks: Number(network.rejectionCounts?.overlapping) || 0,
      reconciledTransportPlatformsBefore: Number(network.surfaceOwnership?.before) || 0,
      reconciledTransportPlatformsAfter: Number(network.surfaceOwnership?.after) || 0,
      reconciledTransportSplitPieces: Number(network.surfaceOwnership?.splitPieces) || 0,
      localStreetRoutes: fastRoutes.length,
      scaffoldRoutes: scaffoldRoutes.length,
      stairThroats: (physics.fastStairThroats ?? []).length,
      guardSpans: guardSpans.length,
      guardFamilies: countBy(guardSpans, item => item.family),
      flightGuards: guardSpans.filter(item => item.role === 'flight-side').length,
      duplicatePlatformOverlaps: duplicatePairs.length,
      duplicatePlatformSamples: Object.freeze(duplicatePairs),
      stairThroatConflicts: headroomPairs.length,
      stairThroatConflictSamples: Object.freeze(headroomPairs),
      nonCanonicalScaffolds: nonCanonicalScaffolds.length,
      nonCanonicalScaffoldSamples: Object.freeze(nonCanonicalScaffolds),
    }),
    facade: Object.freeze(facade),
    issues: Object.freeze(issues),
  });
}

let emitted = 0;
export function emitExteriorDebugSnapshot(snapshot, { maxConsoleSnapshots = 24, retain = 40 } = {}) {
  if (!snapshot) return snapshot;
  const bag = globalThis.__JWEB_EXTERIOR_DEBUG__ ?? (globalThis.__JWEB_EXTERIOR_DEBUG__ = []);
  bag.push(snapshot);
  while (bag.length > retain) bag.shift();
  if (emitted < maxConsoleSnapshots) {
    console.log(`[exterior-debug] ${JSON.stringify(snapshot)}`);
    emitted++;
  }
  if (snapshot.issues?.length) {
    console.warn(`[exterior-debug:issues] ${JSON.stringify({ chunk: snapshot.chunk, issues: snapshot.issues, transport: snapshot.transport, facade: snapshot.facade })}`);
  }
  return snapshot;
}
