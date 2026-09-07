// JWEB system observatory: semantic/topology/circulation diagnostics.
// Pure data + SVG/HTML; intentionally does not depend on DOM or THREE.

export const JWEB_SYSTEM_OBSERVATORY_SCHEMA = 'jweb.system-observatory.v1';

const esc = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const arr = value => Array.isArray(value) ? value : [];
const unique = values => [...new Set(values.filter(value => value != null))];
const pairKey = (a, b) => [String(a ?? ''), String(b ?? '')].sort().join('\u001f');

export function countBy(items, keyOrFn = 'kind') {
  const fn = typeof keyOrFn === 'function' ? keyOrFn : item => item?.[keyOrFn];
  const map = new Map();
  for (const item of arr(items)) {
    const key = String(fn(item) ?? '(none)');
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function shortEntity(entityId) {
  const id = String(entityId ?? 'unknown');
  const compactModules = (prefix, value) => {
    const modules = String(value ?? '').split('|').filter(Boolean);
    if (!modules.length) return prefix;
    return `${prefix}:${modules[0]}${modules.length > 1 ? ` +${modules.length - 1}` : ''}`;
  };
  const ceiling = id.match(/ceiling-building(?:-plan)?:([^:]+)/);
  if (ceiling) return compactModules('H', ceiling[1]);
  const ground = id.match(/:building:([^:]+)/);
  if (ground) return compactModules('G', ground[1]);
  return id.length > 42 ? `…${id.slice(-39)}` : id;
}

function connectorSpaceIds(connector) {
  return unique([
    ...arr(connector?.spaceIds),
    connector?.fromSpaceId,
    connector?.toSpaceId,
    ...arr(connector?.endpoints).map(endpoint => endpoint?.spaceId),
  ].filter(value => value != null && String(value).length).map(String));
}

function portalBuildingIds(portal) {
  return unique([
    portal?.buildingId,
    ...arr(portal?.buildingIds),
  ].filter(value => value != null && String(value).length).map(String));
}

function roleClass(role) {
  const value = String(role ?? '').toLowerCase();
  if (/circul|core|route|hall|entry/.test(value)) return 'circulation';
  if (/service|storage|utility|support/.test(value)) return 'service';
  if (/private|dwelling|occupiable/.test(value)) return 'private';
  if (/public|work|program|gallery|meeting|reception|shared/.test(value)) return 'public';
  return 'other';
}

function knownRefDiagnostics(spatialTopology, worldCirculation) {
  const st = spatialTopology ?? {};
  const wc = worldCirculation ?? {};
  const spaces = arr(st.spaces);
  const connectors = arr(st.connectors);
  const portals = arr(st.portals);
  const reservations = arr(st.reservations);
  const apertures = arr(st.apertures);
  const spaceIds = new Set(spaces.map(space => String(space?.id ?? '')).filter(Boolean));
  const worldNodeIds = new Set(arr(wc.nodes).map(node => String(node?.id ?? '')).filter(Boolean));
  const knownCirculationIds = new Set([...spaceIds, ...worldNodeIds]);
  const connectorIds = new Set(connectors.map(connector => String(connector?.id ?? '')).filter(Boolean));
  const portalIds = new Set(portals.map(portal => String(portal?.id ?? '')).filter(Boolean));
  const aperturePortalIds = new Set(apertures.map(aperture => String(aperture?.portalId ?? '')).filter(Boolean));
  const unresolvedConnectorRefs = [];
  const promotedConnectorWorldRefs = [];
  for (const connector of connectors) {
    for (const spaceId of unique(arr(connector?.spaceIds).filter(value => value != null && String(value).length).map(String))) {
      if (spaceIds.has(spaceId)) continue;
      const row = { connectorId: connector.id ?? null, spaceId, kind: connector.kind ?? null, source: connector.source ?? null };
      if (knownCirculationIds.has(spaceId)) promotedConnectorWorldRefs.push(row);
      else unresolvedConnectorRefs.push(row);
    }
  }
  const unresolvedPortalRefs = [];
  const promotedPortalWorldRefs = [];
  for (const portal of portals) {
    for (const spaceId of arr(portal?.linkedSpaceIds).filter(value => value != null && String(value).length).map(String)) {
      if (spaceIds.has(spaceId)) continue;
      const row = { portalId: portal.id ?? null, spaceId, family: portal.family ?? null };
      if (knownCirculationIds.has(spaceId)) promotedPortalWorldRefs.push(row);
      else unresolvedPortalRefs.push(row);
    }
  }
  const orphanReservations = reservations.filter(reservation => !reservation?.connectorId);
  const orphanApertures = apertures.filter(aperture => !aperture?.connectorId || !aperture?.portalId);
  // Every door - interior or exterior - carries a facadeEndpoint/apertureGeometry
  // shape (access-portals.js computes both from generic door threshold geometry,
  // regardless of whether the door is actually on the building envelope). Binding
  // to a real facade aperture is only a meaningful expectation for portal families
  // that are actually supposed to sit on the facade; an ordinary interior-doorway
  // has no facade to cut a hole in, so excluding it here is what makes this a
  // real "binding gap" signal instead of counting every interior door in the city.
  const FACADE_ELIGIBLE_PORTAL_FAMILIES = new Set([
    'main-entrance', 'secondary-entrance', 'storefront-entrance',
    'service-entrance', 'loading-service-access', 'roof-access',
  ]);
  const unboundPortalApertures = portals.filter(portal => portal?.facadeEndpoint && portal?.apertureGeometry
    && FACADE_ELIGIBLE_PORTAL_FAMILIES.has(portal?.family) && !aperturePortalIds.has(String(portal.id)));
  return { unresolvedConnectorRefs, unresolvedPortalRefs, promotedConnectorWorldRefs, promotedPortalWorldRefs, orphanReservations, orphanApertures, unboundPortalApertures };
}

function worldEdgePairs(worldCirculation) {
  const map = new Map();
  for (const edge of arr(worldCirculation?.edges)) map.set(pairKey(edge?.a, edge?.b), edge);
  return map;
}

function plannedAdjacencyDiagnostics(spatialTopology, worldCirculation) {
  const planned = arr(spatialTopology?.edges).filter(edge => edge?.kind === 'adjacent-space');
  const actual = worldEdgePairs(worldCirculation);
  const unmatched = planned.filter(edge => !actual.has(pairKey(edge?.fromId, edge?.toId)));
  return { planned, unmatched, matchedCount: planned.length - unmatched.length };
}

function buildBuildingSummaries(payload, diagnostics) {
  const st = payload?.spatialTopology ?? {};
  const wc = payload?.worldCirculation ?? {};
  const spaces = arr(st.spaces);
  const spaceById = new Map(spaces.map(space => [String(space?.id ?? ''), space]));
  const worldBuildings = new Map(arr(wc.buildings).map(item => [String(item?.entityId ?? ''), item]));
  const entityIds = unique([
    ...spaces.map(space => space?.entityId),
    ...arr(wc.buildings).map(item => item?.entityId),
  ].map(String).filter(Boolean)).sort();
  const routes = wc.routes && typeof wc.routes === 'object' && !Array.isArray(wc.routes) ? wc.routes : {};
  const connectors = arr(st.connectors);
  const portals = arr(st.portals);
  const missingPairs = new Set(diagnostics.plannedAdjacency.unmatched.map(edge => pairKey(edge.fromId, edge.toId)));
  const worldEdges = arr(wc.edges);

  const out = [];
  for (const entityId of entityIds) {
    const ownedSpaces = spaces.filter(space => String(space?.entityId ?? '') === entityId);
    const ownedSpaceIds = new Set(ownedSpaces.map(space => String(space.id)));
    const wcb = worldBuildings.get(entityId) ?? {};
    const floors = [...new Set(ownedSpaces.map(space => finite(space?.floor, 0)))].sort((a, b) => a - b);
    const layer = unique(ownedSpaces.map(space => space?.layer ?? 'ground')).join('+') || 'unknown';
    const floorRows = floors.map(floor => {
      const floorSpaces = ownedSpaces.filter(space => finite(space?.floor, 0) === floor);
      const ids = new Set(floorSpaces.map(space => String(space.id)));
      const yValues = floorSpaces.map(space => finite(space?.yBase, 0));
      const localConnectors = connectors.filter(connector => connectorSpaceIds(connector).some(id => ids.has(id)));
      const localPortals = portals.filter(portal => arr(portal?.linkedSpaceIds).some(id => ids.has(String(id))));
      const exits = arr(wc.exits).filter(exit => String(exit?.spaceId ?? '') && ids.has(String(exit.spaceId)));
      const missingAdj = diagnostics.plannedAdjacency.unmatched.filter(edge => ids.has(String(edge.fromId)) || ids.has(String(edge.toId)));
      const hopValues = floorSpaces.map(space => finite(routes[String(space.id)]?.distanceToExit, -1)).filter(value => value >= 0);
      const classes = countBy(floorSpaces, space => roleClass(space?.role ?? space?.spaceType ?? space?.semanticProgram));
      const roles = countBy(floorSpaces, space => space?.role ?? space?.spaceType ?? '(none)');
      return {
        floor,
        yBase: yValues.length ? Math.min(...yValues) : 0,
        spaceCount: floorSpaces.length,
        classes,
        roles,
        connectorKinds: countBy(localConnectors),
        portalFamilies: countBy(localPortals, 'family'),
        exits: exits.length,
        missingPhysicalAdjacencies: missingAdj.length,
        maxHopsToExit: hopValues.length ? Math.max(...hopValues) : null,
      };
    });

    const verticalLinks = [];
    for (const connector of connectors) {
      const ids = connectorSpaceIds(connector).filter(id => ownedSpaceIds.has(id));
      if (ids.length < 2) continue;
      const linkedSpaces = ids.map(id => spaceById.get(id)).filter(Boolean);
      const linkedFloors = unique(linkedSpaces.map(space => finite(space.floor, 0))).sort((a, b) => a - b);
      if (linkedFloors.length < 2) continue;
      verticalLinks.push({ id: connector.id ?? null, kind: connector.kind ?? 'connector', fromFloor: linkedFloors[0], toFloor: linkedFloors.at(-1) });
    }

    const directWorldEdges = worldEdges.filter(edge => ownedSpaceIds.has(String(edge.a)) && ownedSpaceIds.has(String(edge.b)));
    const missingBuildingAdj = diagnostics.plannedAdjacency.unmatched.filter(edge => ownedSpaceIds.has(String(edge.fromId)) || ownedSpaceIds.has(String(edge.toId)));
    const ownedPortals = portals.filter(portal => portalBuildingIds(portal).includes(entityId));
    const routeValues = ownedSpaces.map(space => routes[String(space.id)]).filter(Boolean);
    const disconnected = arr(wcb.disconnectedSpaceIds);
    const attention = disconnected.length * 100 + missingBuildingAdj.length * 25 + (wcb.explicitEgress && !arr(wcb.exitPortalIds).length ? 80 : 0);
    out.push({
      entityId,
      shortId: shortEntity(entityId),
      layer,
      floors: floorRows,
      floorCount: floors.length,
      spaceCount: ownedSpaces.length,
      portalCount: ownedPortals.length,
      exitPortalCount: arr(wcb.exitPortalIds).length,
      explicitEgress: !!wcb.explicitEgress,
      disconnectedSpaceCount: disconnected.length,
      maxHopsToExit: routeValues.length ? Math.max(...routeValues.map(route => finite(route.distanceToExit, 0))) : finite(wcb.maxHopsToExit, 0),
      componentCount: arr(wcb.componentIds).length,
      verticalLinks,
      directPhysicalEdges: directWorldEdges.length,
      missingPhysicalAdjacencies: missingBuildingAdj.length,
      attention,
    });
  }
  return out.sort((a, b) => b.attention - a.attention || b.spaceCount - a.spaceCount || a.shortId.localeCompare(b.shortId));
}

export function analyzeChunkPayload(payload, chunk = {}) {
  const st = payload?.spatialTopology ?? {};
  const wc = payload?.worldCirculation ?? {};
  const refs = knownRefDiagnostics(st, wc);
  const plannedAdjacency = plannedAdjacencyDiagnostics(st, wc);
  const stStats = st.stats ?? {};
  const wcStats = wc.stats ?? stStats.circulation ?? {};
  const hard = {
    unreachableSpaces: finite(wcStats.unreachableSpaces, 0),
    unreachableTransportNodes: finite(wcStats.unreachableTransportNodes, 0),
    explicitEgressFailures: finite(wcStats.explicitEgressFailures, 0),
  };
  const relational = {
    plannedAdjacenciesWithoutPhysicalEdge: plannedAdjacency.unmatched.length,
    danglingConnectorSpaceRefs: refs.unresolvedConnectorRefs.length,
    danglingPortalSpaceRefs: refs.unresolvedPortalRefs.length,
  };
  const binding = {
    orphanReservations: refs.orphanReservations.length,
    orphanApertures: refs.orphanApertures.length,
    unboundPortalApertures: refs.unboundPortalApertures.length,
    unboundEntranceFaces: finite(stStats.unboundEntranceFaces, 0),
  };
  const duplicates = {
    entityIds: finite(stStats.duplicateEntityIds, 0),
    spaceIds: finite(stStats.duplicateSpaceIds, 0),
    connectorIds: finite(stStats.duplicateConnectorIds, 0),
    transportSurfaceIds: finite(stStats.duplicateTransportSurfaceIds, 0),
  };
  const worldRoutes = wc.routes && typeof wc.routes === 'object' && !Array.isArray(wc.routes) ? wc.routes : {};
  const circulationNodes = arr(wc.nodes);
  const nodeById = new Map(circulationNodes.map(node => [String(node?.id ?? ''), node]));
  const unreachableTransportNodes = circulationNodes.filter(node => node?.kind === 'transport' && !worldRoutes[String(node?.id ?? '')]);
  const componentRows = arr(wc.components).map(component => {
    const nodes = arr(component?.nodeIds).map(id => nodeById.get(String(id))).filter(Boolean);
    const transport = nodes.filter(node => node?.kind === 'transport');
    const worlds = nodes.filter(node => node?.kind === 'world');
    const spacesInComponent = nodes.filter(node => node?.kind === 'space');
    const unreachableTransport = transport.filter(node => !worldRoutes[String(node?.id ?? '')]);
    return {
      id: component?.id ?? null,
      nodes: nodes.length,
      spaces: spacesInComponent.length,
      worldNodes: worlds.length,
      transportNodes: transport.length,
      unreachableTransportNodes: unreachableTransport.length,
      transportKinds: countBy(transport, 'transportKind'),
      layers: countBy(nodes, 'layer'),
    };
  }).sort((a, b) => b.unreachableTransportNodes - a.unreachableTransportNodes || b.transportNodes - a.transportNodes || b.spaces - a.spaces);
  const unreachableTransportGroups = Object.values(unreachableTransportNodes.reduce((groups, node) => {
    const key = `${node?.layer ?? 'unknown'}|${node?.siteId ?? 'none'}|${node?.moduleKey ?? 'none'}|${node?.transportKind ?? 'transport'}`;
    const row = groups[key] ??= { key, layer: node?.layer ?? null, siteId: node?.siteId ?? null, moduleKey: node?.moduleKey ?? null, kind: node?.transportKind ?? 'transport', count: 0, yMin: Infinity, yMax: -Infinity, componentIds: new Set() };
    row.count += 1; row.yMin = Math.min(row.yMin, finite(node?.y, 0)); row.yMax = Math.max(row.yMax, finite(node?.y, 0)); if (node?.componentId) row.componentIds.add(node.componentId); return groups;
  }, {})).map(row => ({ ...row, componentIds: [...row.componentIds].sort(), yMin: Number(row.yMin.toFixed(2)), yMax: Number(row.yMax.toFixed(2)) })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const attention = hard.unreachableSpaces * 120
    + hard.unreachableTransportNodes * 120
    + hard.explicitEgressFailures * 100
    + relational.plannedAdjacenciesWithoutPhysicalEdge * 30
    + relational.danglingConnectorSpaceRefs * 8
    + relational.danglingPortalSpaceRefs * 8
    + binding.orphanApertures * 10
    + binding.orphanReservations * 3
    + binding.unboundPortalApertures
    + binding.unboundEntranceFaces * 5
    + Object.values(duplicates).reduce((sum, value) => sum + value * 50, 0);

  const summary = {
    schema: JWEB_SYSTEM_OBSERVATORY_SCHEMA,
    chunk: {
      key: String(chunk?.key ?? ''),
      x: finite(chunk?.x, 0),
      z: finite(chunk?.z, 0),
      seed: chunk?.seed ?? null,
      weirdness: chunk?.weirdness?.value ?? chunk?.weirdness ?? null,
    },
    counts: {
      groundEntities: arr(payload?.entities).length,
      spaces: arr(st.spaces).length,
      surfaces: arr(st.surfaces).length,
      apertures: arr(st.apertures).length,
      portals: arr(st.portals).length,
      connectors: arr(st.connectors).length,
      reservations: arr(st.reservations).length,
      transportSurfaces: arr(st.transportSurfaces).length,
      transportEdges: arr(st.transportEdges).length,
      worldNodes: arr(wc.nodes).length,
      worldEdges: arr(wc.edges).length,
      stairs: arr(payload?.physics?.stairOwnership).length,
      hangingBuildings: finite(payload?.hangingCity?.buildings, 0),
      hangingBridges: finite(payload?.hangingCity?.skybridges, 0),
    },
    kinds: {
      spaceRoles: countBy(st.spaces, space => space?.role ?? '(none)'),
      connectors: countBy(st.connectors),
      connectorSources: countBy(st.connectors, 'source'),
      orphanReservationKinds: countBy(refs.orphanReservations),
      unboundPortalApertureFamilies: countBy(refs.unboundPortalApertures, 'family'),
      portalFamilies: countBy(st.portals, 'family'),
      transportSurfaces: countBy(st.transportSurfaces),
      transportEdges: countBy(st.transportEdges),
      worldLinks: countBy(arr(wc.edges).flatMap(edge => arr(edge?.links)), 'kind'),
      spatialEdges: countBy(st.edges),
      layers: countBy(st.spaces, space => space?.layer ?? 'ground'),
    },
    hard,
    relational,
    binding,
    duplicates,
    boundary: {
      promotedConnectorWorldRefs: refs.promotedConnectorWorldRefs.length,
      promotedPortalWorldRefs: refs.promotedPortalWorldRefs.length,
      topologyRawDanglingConnectorSpaces: finite(stStats.danglingConnectorSpaces, 0),
      topologyRawDanglingPortalSpaces: finite(stStats.danglingPortalSpaces, 0),
    },
    attention,
    circulation: {
      components: finite(wcStats.components, 0),
      reachableSpaces: finite(wcStats.reachableSpaces, 0),
      unreachableSpaces: finite(wcStats.unreachableSpaces, 0),
      reachableTransportNodes: finite(wcStats.reachableTransportNodes, 0),
      unreachableTransportNodes: finite(wcStats.unreachableTransportNodes, 0),
      maxHopsToExit: finite(wcStats.maxHopsToExit, 0),
      explicitExitPortals: finite(wcStats.explicitExitPortals, 0),
      explicitEgressBuildings: finite(wcStats.explicitEgressBuildings, 0),
      explicitEgressFailures: finite(wcStats.explicitEgressFailures, 0),
      crossLayerEdges: finite(wcStats.crossLayerEdges, 0),
      roofCrossoverEdges: finite(wcStats.roofCrossoverEdges, 0),
      portalEdges: finite(wcStats.portalEdges, 0),
      physicalConnectorEdges: finite(wcStats.physicalConnectorEdges, 0),
    },
    transportAnatomy: {
      componentCount: componentRows.length,
      components: componentRows,
      unreachableGroups: unreachableTransportGroups,
      unreachableTransportKinds: countBy(unreachableTransportNodes, 'transportKind'),
    },
    samples: {
      missingPhysicalAdjacencies: plannedAdjacency.unmatched.slice(0, 20),
      danglingConnectorSpaceRefs: refs.unresolvedConnectorRefs.slice(0, 20),
      danglingPortalSpaceRefs: refs.unresolvedPortalRefs.slice(0, 20),
      promotedConnectorWorldRefs: refs.promotedConnectorWorldRefs.slice(0, 20),
      promotedPortalWorldRefs: refs.promotedPortalWorldRefs.slice(0, 20),
      orphanReservations: refs.orphanReservations.slice(0, 20).map(item => ({ id: item?.id ?? null, kind: item?.kind ?? null, connectorId: item?.connectorId ?? null })),
      unboundPortalApertures: refs.unboundPortalApertures.slice(0, 20).map(item => ({ id: item?.id ?? null, family: item?.family ?? null, floor: item?.floor ?? null, buildingId: item?.buildingId ?? null })),
    },
  };
  summary.buildings = buildBuildingSummaries(payload, { refs, plannedAdjacency });
  summary.buildingCount = summary.buildings.length;
  return summary;
}

export function buildSweepAnalysis(chunks) {
  const list = arr(chunks);
  const metricKeys = [
    ['attention', item => item.attention],
    ['unboundPortalApertures', item => item.binding.unboundPortalApertures],
    ['orphanReservations', item => item.binding.orphanReservations],
    ['danglingRefs', item => item.relational.danglingConnectorSpaceRefs + item.relational.danglingPortalSpaceRefs],
    ['missingPhysicalAdjacencies', item => item.relational.plannedAdjacenciesWithoutPhysicalEdge],
    ['maxHopsToExit', item => item.circulation.maxHopsToExit],
    ['spaces', item => item.counts.spaces],
    ['connectors', item => item.counts.connectors],
  ];
  const ranges = {};
  for (const [key, get] of metricKeys) {
    const values = list.map(get).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    const median = values.length ? values[Math.floor(values.length / 2)] : 0;
    const deviations = values.map(value => Math.abs(value - median)).sort((a, b) => a - b);
    const mad = deviations.length ? deviations[Math.floor(deviations.length / 2)] : 0;
    ranges[key] = { min: values[0] ?? 0, max: values.at(-1) ?? 0, median, mad };
  }
  const outliers = [];
  for (const summary of list) {
    for (const [key, get] of metricKeys) {
      const value = get(summary);
      const { median, mad } = ranges[key];
      const robustZ = mad > 0 ? 0.6745 * (value - median) / mad : value === median ? 0 : (value > median ? Infinity : -Infinity);
      if (robustZ >= 2.5 || (key === 'attention' && value === ranges[key].max && value > 0)) {
        outliers.push({ chunkKey: summary.chunk.key, metric: key, value, median, robustZ: Number.isFinite(robustZ) ? Number(robustZ.toFixed(2)) : robustZ });
      }
    }
  }
  outliers.sort((a, b) => (Number.isFinite(b.robustZ) ? b.robustZ : 999) - (Number.isFinite(a.robustZ) ? a.robustZ : 999) || b.value - a.value);
  const aggregateKindMap = key => {
    const counts = {};
    for (const item of list) for (const [kind, value] of Object.entries(item?.kinds?.[key] ?? {})) counts[kind] = (counts[kind] ?? 0) + finite(value, 0);
    return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  };
  const aggregateTransportKinds = () => {
    const counts = {};
    for (const item of list) for (const [kind, value] of Object.entries(item?.transportAnatomy?.unreachableTransportKinds ?? {})) counts[kind] = (counts[kind] ?? 0) + finite(value, 0);
    return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  };
  return {
    schema: 'jweb.system-observatory-sweep.v1',
    chunks: list,
    ranges,
    outliers,
    prevalence: {
      chunksWithUnreachableSpaces: list.filter(item => item.hard.unreachableSpaces > 0).length,
      chunksWithUnreachableTransport: list.filter(item => item.hard.unreachableTransportNodes > 0).length,
      chunksWithExplicitEgressFailures: list.filter(item => item.hard.explicitEgressFailures > 0).length,
      chunksWithMissingPhysicalAdjacencies: list.filter(item => item.relational.plannedAdjacenciesWithoutPhysicalEdge > 0).length,
      chunksWithUnresolvedRefs: list.filter(item => item.relational.danglingConnectorSpaceRefs + item.relational.danglingPortalSpaceRefs > 0).length,
      chunksWithUnboundPortalApertures: list.filter(item => item.binding.unboundPortalApertures > 0).length,
      chunksWithOrphanReservations: list.filter(item => item.binding.orphanReservations > 0).length,
    },
    distributions: {
      unreachableTransportKinds: aggregateTransportKinds(),
      unboundPortalApertureFamilies: aggregateKindMap('unboundPortalApertureFamilies'),
      orphanReservationKinds: aggregateKindMap('orphanReservationKinds'),
    },
    totals: {
      chunks: list.length,
      spaces: list.reduce((sum, item) => sum + item.counts.spaces, 0),
      connectors: list.reduce((sum, item) => sum + item.counts.connectors, 0),
      portals: list.reduce((sum, item) => sum + item.counts.portals, 0),
      missingPhysicalAdjacencies: list.reduce((sum, item) => sum + item.relational.plannedAdjacenciesWithoutPhysicalEdge, 0),
      danglingRefs: list.reduce((sum, item) => sum + item.relational.danglingConnectorSpaceRefs + item.relational.danglingPortalSpaceRefs, 0),
      unboundPortalApertures: list.reduce((sum, item) => sum + item.binding.unboundPortalApertures, 0),
      orphanReservations: list.reduce((sum, item) => sum + item.binding.orphanReservations, 0),
      hardConnectivityFailures: list.reduce((sum, item) => sum + item.hard.unreachableSpaces + item.hard.unreachableTransportNodes + item.hard.explicitEgressFailures, 0),
    },
  };
}

function severity(summary) {
  if (summary.hard.unreachableSpaces || summary.hard.unreachableTransportNodes || summary.hard.explicitEgressFailures) return 'hard';
  if (summary.relational.plannedAdjacenciesWithoutPhysicalEdge || summary.relational.danglingConnectorSpaceRefs || summary.relational.danglingPortalSpaceRefs) return 'relational';
  if (summary.binding.orphanReservations || summary.binding.unboundPortalApertures || summary.binding.orphanApertures) return 'binding';
  return 'clean';
}

function paletteForSeverity(value) {
  return {
    hard: ['#3b0710', '#ff496d'],
    relational: ['#311b06', '#ffb43b'],
    binding: ['#161d30', '#6ca8ff'],
    clean: ['#0d241c', '#4ddf9b'],
  }[value] ?? ['#202020', '#aaa'];
}

export function renderChunkMatrixSvg(sweep, { cellWidth = 245, cellHeight = 178, gap = 12 } = {}) {
  const chunks = arr(sweep?.chunks);
  const failures = arr(sweep?.failures);
  const xs = unique([...chunks.map(item => item.chunk.x), ...failures.map(item => item.x)]).sort((a, b) => a - b);
  const zs = unique([...chunks.map(item => item.chunk.z), ...failures.map(item => item.z)]).sort((a, b) => a - b);
  const width = 76 + xs.length * (cellWidth + gap) + 30;
  const height = 108 + zs.length * (cellHeight + gap) + 56;
  const byKey = new Map(chunks.map(item => [`${item.chunk.x},${item.chunk.z}`, item]));
  const failureByKey = new Map(failures.map(item => [String(item.chunkKey), item]));
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="100%" height="100%" fill="#090b10"/>`,
    `<style>text{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;fill:#eef2ff}.muted{fill:#8d96aa}.tiny{font-size:10px}.small{font-size:12px}.med{font-size:15px}.big{font-size:24px;font-weight:700}.title{font-size:22px;font-weight:700}</style>`,
    `<text x="30" y="34" class="title">JWEB multi-chunk system matrix</text>`,
    `<text x="30" y="57" class="small muted">Red = compiled connectivity failure. Amber = plan/physical mismatch or unresolved refs. Blue = binding debt. Raw topology world-boundary refs are not scored. Score is triage only.</text>`];
  xs.forEach((x, i) => parts.push(`<text x="${76 + i * (cellWidth + gap) + cellWidth / 2}" y="91" class="small muted" text-anchor="middle">x=${x}</text>`));
  zs.forEach((z, row) => {
    parts.push(`<text x="52" y="${108 + row * (cellHeight + gap) + cellHeight / 2}" class="small muted" text-anchor="middle">z=${z}</text>`);
    xs.forEach((x, col) => {
      const key = `${x},${z}`;
      const s = byKey.get(key);
      const failed = failureByKey.get(key);
      const ox = 76 + col * (cellWidth + gap), oy = 108 + row * (cellHeight + gap);
      if (!s && failed) {
        const message = String(failed.message ?? 'build failed').split('\n')[0].replace(/^Error:\s*/, '');
        const compact = message.length > 94 ? `${message.slice(0, 91)}…` : message;
        parts.push(`<rect x="${ox}" y="${oy}" width="${cellWidth}" height="${cellHeight}" rx="9" fill="#3b0710" stroke="#ff496d" stroke-width="3"/>`,
          `<text x="${ox + 14}" y="${oy + 25}" class="med" font-weight="700">chunk ${esc(key)}</text>`,
          `<text x="${ox + 14}" y="${oy + 58}" class="big" fill="#ff496d">BUILD FAILED</text>`,
          `<text x="${ox + 14}" y="${oy + 84}" class="small" fill="#ff9aae">tower-transfer / plan realization</text>`,
          `<text x="${ox + 14}" y="${oy + 110}" class="tiny muted">${esc(compact.slice(0, 38))}</text>`,
          `<text x="${ox + 14}" y="${oy + 126}" class="tiny muted">${esc(compact.slice(38, 76))}</text>`,
          `<text x="${ox + 14}" y="${oy + 142}" class="tiny muted">${esc(compact.slice(76, 114))}</text>`);
        return;
      }
      if (!s) return;
      const sev = severity(s), [bg, accent] = paletteForSeverity(sev);
      const dangling = s.relational.danglingConnectorSpaceRefs + s.relational.danglingPortalSpaceRefs;
      parts.push(`<a href="chunks/${esc(s.chunk.key)}/index.html">`,
        `<rect x="${ox}" y="${oy}" width="${cellWidth}" height="${cellHeight}" rx="9" fill="${bg}" stroke="${accent}" stroke-width="2"/>`,
        `<text x="${ox + 14}" y="${oy + 25}" class="med" font-weight="700">chunk ${esc(s.chunk.key)}</text>`,
        `<text x="${ox + cellWidth - 14}" y="${oy + 27}" class="big" fill="${accent}" text-anchor="end">${s.attention}</text>`,
        `<text x="${ox + 14}" y="${oy + 48}" class="tiny muted">${s.counts.spaces} spaces · ${s.counts.connectors} connectors · ${s.counts.portals} portals</text>`,
        `<text x="${ox + 14}" y="${oy + 76}" class="small">HARD</text><text x="${ox + 80}" y="${oy + 76}" class="small" fill="#ff718a">${s.hard.unreachableSpaces + s.hard.unreachableTransportNodes + s.hard.explicitEgressFailures}</text>`,
        `<text x="${ox + 14}" y="${oy + 98}" class="small">adj≠phys</text><text x="${ox + 80}" y="${oy + 98}" class="small" fill="#ffcf6b">${s.relational.plannedAdjacenciesWithoutPhysicalEdge}</text>`,
        `<text x="${ox + 124}" y="${oy + 98}" class="small">unresolved</text><text x="${ox + 196}" y="${oy + 98}" class="small" fill="#ffcf6b">${dangling}</text>`,
        `<text x="${ox + 14}" y="${oy + 120}" class="small">unbound portal aperture</text><text x="${ox + 196}" y="${oy + 120}" class="small" fill="#8ab8ff">${s.binding.unboundPortalApertures}</text>`,
        `<text x="${ox + 14}" y="${oy + 142}" class="small">orphan reservation</text><text x="${ox + 196}" y="${oy + 142}" class="small" fill="#8ab8ff">${s.binding.orphanReservations}</text>`,
        `<text x="${ox + 14}" y="${oy + 164}" class="tiny muted">components ${s.circulation.components} · max exit hops ${s.circulation.maxHopsToExit} · cross-layer ${s.circulation.crossLayerEdges}</text>`,
        `</a>`);
    });
  });
  parts.push(`</svg>`);
  return parts.join('\n');
}

function textRows(obj, limit = 5) {
  return Object.entries(obj ?? {}).slice(0, limit).map(([key, value]) => `${key} ${value}`);
}

export function renderSystemStorySvg(summary, { width = 1450, height = 630 } = {}) {
  const stages = [
    { title: 'BUILDING / SPACE PLAN', file: 'space-plan.js + building-plan authority', count: `${summary.buildingCount} hosts · ${summary.counts.spaces} spaces`, rows: textRows(summary.kinds.spaceRoles, 6), accent: '#5ac8fa' },
    { title: 'SEMANTIC CONNECTORS', file: 'semantic-connectors.js', count: `${summary.counts.connectors} connectors`, rows: textRows(summary.kinds.connectors, 6), accent: '#c778ff' },
    { title: 'ACCESS PORTALS', file: 'access-portals.js', count: `${summary.counts.portals} portals`, rows: textRows(summary.kinds.portalFamilies, 6), accent: '#ff9b59' },
    { title: 'SPATIAL TOPOLOGY', file: 'spatial-topology.js', count: `${summary.counts.worldNodes} nodes published downstream`, rows: [`${summary.binding.orphanReservations} orphan reservations`, `${summary.relational.danglingConnectorSpaceRefs} unresolved connector refs`, `${summary.relational.danglingPortalSpaceRefs} unresolved portal refs`, `${summary.binding.unboundPortalApertures} unbound portal apertures`, `${summary.relational.plannedAdjacenciesWithoutPhysicalEdge} planned adjacency ≠ physical edge`], accent: '#ffcf6b' },
    { title: 'WORLD CIRCULATION', file: 'circulation-graph.js', count: `${summary.circulation.components} components · max ${summary.circulation.maxHopsToExit} hops`, rows: [`${summary.circulation.physicalConnectorEdges} physical connector edges`, `${summary.circulation.portalEdges} portal edges`, `${summary.circulation.roofCrossoverEdges} roof crossovers`, `${summary.circulation.crossLayerEdges} cross-layer edges`, `${summary.hard.unreachableSpaces} unreachable spaces`], accent: '#5ce6a8' },
  ];
  const boxW = 250, gap = 28, x0 = 42, y = 118;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`, `<rect width="100%" height="100%" fill="#090b10"/>`, `<style>text{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;fill:#edf1fb}.muted{fill:#8f98aa}.small{font-size:12px}.tiny{font-size:10px}.title{font-size:24px;font-weight:700}.stage{font-size:14px;font-weight:700}</style>`, `<text x="42" y="42" class="title">Chunk ${esc(summary.chunk.key)} — actual semantic/circulation pipeline</text>`, `<text x="42" y="69" class="small muted">This collapses published JWEB truth into the systems that produced it. Counts are real payload data; amber/red annotations are diagnostic debts, not automatically bugs.</text>`];
  stages.forEach((stage, i) => {
    const x = x0 + i * (boxW + gap);
    if (i) {
      const ax = x - gap + 3;
      parts.push(`<line x1="${ax - 17}" y1="250" x2="${ax + 5}" y2="250" stroke="#596173" stroke-width="3"/>`, `<path d="M ${ax + 5} 250 l -9 -6 l 0 12 z" fill="#596173"/>`);
    }
    parts.push(`<rect x="${x}" y="${y}" width="${boxW}" height="330" rx="12" fill="#111622" stroke="${stage.accent}" stroke-width="2"/>`, `<text x="${x + 16}" y="${y + 30}" class="stage" fill="${stage.accent}">${esc(stage.title)}</text>`, `<text x="${x + 16}" y="${y + 51}" class="tiny muted">${esc(stage.file)}</text>`, `<text x="${x + 16}" y="${y + 84}" class="small">${esc(stage.count)}</text>`);
    stage.rows.forEach((row, index) => parts.push(`<text x="${x + 16}" y="${y + 118 + index * 28}" class="small">${esc(row)}</text>`));
  });
  const hard = Object.entries(summary.hard).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  parts.push(`<rect x="42" y="486" width="1362" height="100" rx="10" fill="${hard.length ? '#2f0c14' : '#102219'}" stroke="${hard.length ? '#ff5b78' : '#45d996'}"/>`, `<text x="60" y="516" class="stage" fill="${hard.length ? '#ff718a' : '#5ce6a8'}">COMPILED CONNECTIVITY VERDICT</text>`, `<text x="60" y="544" class="small">${hard.length ? esc(hard.join(' · ')) : 'No compiled unreachable-space / unreachable-transport / explicit-egress failure in this chunk.'}</text>`, `<text x="60" y="570" class="tiny muted">The observatory keeps this verdict separate from relational and binding debt so a big count cannot masquerade as a proven gameplay failure.</text>`, `</svg>`);
  return parts.join('\n');
}

const ROLE_COLORS = { circulation: '#58c7ff', service: '#f6bd60', private: '#b58cff', public: '#5ce6a8', other: '#9da6b8' };

export function renderBuildingStacksSvg(summary, { width = 1500, rowHeight = 44, maxBuildings = 18 } = {}) {
  const buildings = summary.buildings.slice(0, maxBuildings);
  const panelGap = 18, panelW = (width - 84 - panelGap) / 2;
  const panels = buildings.map((b, index) => ({ b, col: index % 2, row: Math.floor(index / 2) }));
  const rowHeights = new Map();
  for (const { b, row } of panels) rowHeights.set(row, Math.max(rowHeights.get(row) ?? 0, 100 + Math.max(1, b.floors.length) * rowHeight));
  const rowY = new Map(); let yCursor = 96;
  [...rowHeights.keys()].sort((a, b) => a - b).forEach(row => { rowY.set(row, yCursor); yCursor += rowHeights.get(row) + 20; });
  const height = yCursor + 70;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`, `<rect width="100%" height="100%" fill="#090b10"/>`, `<style>text{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;fill:#edf1fb}.muted{fill:#8f98aa}.tiny{font-size:10px}.small{font-size:12px}.med{font-size:14px;font-weight:700}.title{font-size:23px;font-weight:700}</style>`, `<text x="42" y="38" class="title">Building floor stacks — chunk ${esc(summary.chunk.key)}</text>`, `<text x="42" y="64" class="small muted">Each row is an authored semantic floor. Role chips show space composition; vertical lines are real connectors that span floors. Red ! = planned adjacency without a direct physical graph edge.</text>`];
  const legend = Object.entries(ROLE_COLORS).map(([key, color], i) => `<rect x="${930 + i * 104}" y="28" width="12" height="12" rx="2" fill="${color}"/><text x="${948 + i * 104}" y="39" class="tiny muted">${key}</text>`).join(''); parts.push(legend);

  for (const { b, col, row } of panels) {
    const x = 42 + col * (panelW + panelGap), y = rowY.get(row), h = 78 + Math.max(1, b.floors.length) * rowHeight;
    const bad = b.disconnectedSpaceCount || b.missingPhysicalAdjacencies || (b.explicitEgress && !b.exitPortalCount);
    parts.push(`<rect x="${x}" y="${y}" width="${panelW}" height="${h}" rx="10" fill="#111622" stroke="${bad ? '#ff6b82' : '#384054'}" stroke-width="${bad ? 2.4 : 1}"/>`, `<text x="${x + 14}" y="${y + 24}" class="med">${esc(b.shortId)}</text>`, `<text x="${x + panelW - 14}" y="${y + 24}" class="tiny muted" text-anchor="end">${esc(b.layer)} · ${b.spaceCount} spaces · ${b.portalCount} portals · exit hops ${b.maxHopsToExit}</text>`);
    if (bad) parts.push(`<text x="${x + 14}" y="${y + 45}" class="small" fill="#ff718a">${b.disconnectedSpaceCount ? `${b.disconnectedSpaceCount} disconnected spaces  ` : ''}${b.missingPhysicalAdjacencies ? `${b.missingPhysicalAdjacencies} adj≠phys  ` : ''}${b.explicitEgress && !b.exitPortalCount ? 'explicit egress but no exit portal' : ''}</text>`);
    const floorY = new Map();
    b.floors.forEach((floor, index) => {
      const fy = y + 68 + index * rowHeight; floorY.set(floor.floor, fy);
      parts.push(`<line x1="${x + 12}" y1="${fy + 14}" x2="${x + panelW - 12}" y2="${fy + 14}" stroke="#273044"/>`, `<text x="${x + 14}" y="${fy + 7}" class="tiny muted">F${floor.floor} y=${floor.yBase.toFixed(1)}</text>`);
      let chipX = x + 114;
      for (const [cls, count] of Object.entries(floor.classes)) {
        const w = 28 + String(cls).length * 6.5;
        parts.push(`<rect x="${chipX}" y="${fy - 7}" width="${w}" height="22" rx="5" fill="${ROLE_COLORS[cls] ?? ROLE_COLORS.other}" opacity="0.88"/>`, `<text x="${chipX + 7}" y="${fy + 8}" class="tiny" fill="#071018">${esc(cls)} ${count}</text>`); chipX += w + 7;
      }
      parts.push(`<text x="${x + panelW - 16}" y="${fy + 7}" class="tiny" text-anchor="end" fill="${floor.missingPhysicalAdjacencies ? '#ff718a' : '#aab4c6'}">doors ${floor.connectorKinds.door ?? 0} · portals ${Object.values(floor.portalFamilies).reduce((a, v) => a + v, 0)} · exits ${floor.exits}${floor.missingPhysicalAdjacencies ? ` · !${floor.missingPhysicalAdjacencies}` : ''}</text>`);
    });
    const linkBaseX = x + panelW - 54;
    b.verticalLinks.slice(0, 12).forEach((link, index) => {
      const y1 = floorY.get(link.fromFloor), y2 = floorY.get(link.toFloor); if (y1 == null || y2 == null) return;
      const lx = linkBaseX - index * 7;
      parts.push(`<line x1="${lx}" y1="${y1 + 14}" x2="${lx}" y2="${y2 + 14}" stroke="${link.kind === 'stair' ? '#c778ff' : link.kind === 'ladder' ? '#ff9b59' : '#5ac8fa'}" stroke-width="3"/>`);
    });
  }
  parts.push(`</svg>`); return parts.join('\n');
}

export function renderTransportAnatomySvg(summary, { width = 1380 } = {}) {
  const anatomy = summary.transportAnatomy ?? { components: [], unreachableGroups: [] };
  const components = arr(anatomy.components);
  const groups = arr(anatomy.unreachableGroups);
  const height = 260 + Math.max(components.length, groups.length, 1) * 46 + 90;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`, `<rect width="100%" height="100%" fill="#090b10"/>`, `<style>text{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;fill:#edf1fb}.muted{fill:#8f98aa}.tiny{font-size:10px}.small{font-size:12px}.med{font-size:15px;font-weight:700}.big{font-size:34px;font-weight:800}.title{font-size:23px;font-weight:700}</style>`, `<text x="38" y="38" class="title">Exterior transport reachability — chunk ${esc(summary.chunk.key)}</text>`, `<text x="38" y="64" class="small muted">A component with transport but no world route is a marooned exterior-circulation island. Interior spaces are counted separately.</text>`, `<text x="38" y="116" class="big" fill="${summary.hard.unreachableTransportNodes ? '#ff5b78' : '#5ce6a8'}">${summary.hard.unreachableTransportNodes}</text>`, `<text x="110" y="108" class="med">unreachable transport nodes</text>`, `<text x="38" y="140" class="small muted">${summary.circulation.reachableSpaces}/${summary.counts.spaces} spaces reachable · ${summary.circulation.components} graph components</text>`, `<text x="38" y="186" class="med">GRAPH COMPONENTS</text>`, `<text x="720" y="186" class="med">UNREACHABLE TRANSPORT GROUPS</text>`];
  components.forEach((c, i) => {
    const y = 210 + i * 46; const bad = c.unreachableTransportNodes > 0; const accent = bad ? '#ff5b78' : '#5ce6a8';
    parts.push(`<rect x="38" y="${y}" width="630" height="36" rx="7" fill="#111622" stroke="${accent}"/>`, `<text x="50" y="${y + 15}" class="small" fill="${accent}">${esc(c.id)}</text>`, `<text x="50" y="${y + 29}" class="tiny muted">spaces ${c.spaces} · world ${c.worldNodes} · transport ${c.transportNodes} · unreachable transport ${c.unreachableTransportNodes}</text>`);
  });
  if (!groups.length) parts.push(`<text x="720" y="230" class="small" fill="#5ce6a8">none — every exterior transport node has a route to world authority</text>`);
  groups.forEach((g, i) => {
    const y = 210 + i * 46;
    parts.push(`<rect x="720" y="${y}" width="620" height="36" rx="7" fill="#2b1018" stroke="#ff5b78"/>`, `<text x="732" y="${y + 15}" class="small" fill="#ff8da0">${g.count} × ${esc(g.kind)}</text>`, `<text x="732" y="${y + 29}" class="tiny muted">${esc(g.layer)} · site ${esc(g.siteId)} · module ${esc(g.moduleKey)} · y ${g.yMin}..${g.yMax}</text>`);
  });
  parts.push(`</svg>`); return parts.join('\n');
}

export function renderAttentionLedgerSvg(summary, { width = 1180, height = 720 } = {}) {
  const groups = [
    { name: 'HARD CONNECTIVITY', color: '#ff5b78', items: summary.hard, note: 'Compiled graph failures. These are the closest things here to a direct bug signal.' },
    { name: 'RELATIONAL MISMATCH', color: '#ffbd59', items: summary.relational, note: 'Plans/references disagree with physical graph publication. Investigate exact objects.' },
    { name: 'BINDING DEBT', color: '#6ca8ff', items: summary.binding, note: 'Authority exists but is not fully bound to another authority. May be tolerated/intentional.' },
    { name: 'DUPLICATE IDS', color: '#d38cff', items: summary.duplicates, note: 'Identity collisions. Any nonzero count deserves immediate scrutiny.' },
  ];
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`, `<rect width="100%" height="100%" fill="#090b10"/>`, `<style>text{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;fill:#edf1fb}.muted{fill:#8f98aa}.small{font-size:12px}.tiny{font-size:10px}.med{font-size:15px;font-weight:700}.num{font-size:28px;font-weight:700}.title{font-size:24px;font-weight:700}</style>`, `<text x="40" y="40" class="title">Attention ledger — chunk ${esc(summary.chunk.key)}</text>`, `<text x="40" y="67" class="small muted">Triage score ${summary.attention}. Categories are intentionally separated so visual noise cannot be mistaken for a proven connectivity failure.</text>`];
  groups.forEach((group, gi) => {
    const y = 100 + gi * 148;
    parts.push(`<rect x="40" y="${y}" width="1100" height="128" rx="10" fill="#111622" stroke="${group.color}"/>`, `<text x="58" y="${y + 28}" class="med" fill="${group.color}">${group.name}</text>`, `<text x="58" y="${y + 50}" class="tiny muted">${esc(group.note)}</text>`);
    Object.entries(group.items).forEach(([key, value], index) => {
      const x = 58 + index * 260;
      parts.push(`<text x="${x}" y="${y + 88}" class="num" fill="${value ? group.color : '#5d6576'}">${value}</text>`, `<text x="${x + 48}" y="${y + 82}" class="tiny">${esc(key)}</text>`);
    });
  });
  parts.push(`</svg>`); return parts.join('\n');
}

export function renderAuthorityPipelineSvg(sweep, { width = 1540, height = 930 } = {}) {
  const built = finite(sweep?.totals?.chunks, 0), failed = finite(sweep?.totals?.buildFailures, 0);
  const p = sweep?.prevalence ?? {};
  const nodes = [
    { id:'demand', x:55, y:125, w:270, h:92, title:'CITY / SECTIONAL DEMANDS', sub:'exchange pairs · vertical intent', tone:'#74b8ff' },
    { id:'transfer', x:385, y:125, w:285, h:92, title:'TOWER-TRANSFER AUTHORITY', sub:`fail-closed: ${failed} / ${built+failed} chunks rejected`, tone:'#ff496d' },
    { id:'plan', x:730, y:125, w:285, h:92, title:'BUILDING PLAN', sub:'spaces · adjacency · public spine', tone:'#ffbd59' },
    { id:'layout', x:1075, y:125, w:390, h:92, title:'SEMANTIC LAYOUT', sub:`${finite(sweep?.totals?.spaces,0)} spaces across ${built} built chunks`, tone:'#e0c46c' },
    { id:'connectors', x:110, y:330, w:330, h:105, title:'SEMANTIC CONNECTORS', sub:`${finite(sweep?.totals?.connectors,0)} connectors`, note:`${finite(sweep?.totals?.orphanReservations,0)} unowned stair-clearance reservations`, tone:'#9a8cff' },
    { id:'portals', x:605, y:330, w:330, h:105, title:'ACCESS PORTALS / APERTURES', sub:`${finite(sweep?.totals?.portals,0)} portals`, note:`${finite(sweep?.totals?.unboundPortalApertures,0)} portal→aperture binding gaps`, tone:'#6ca8ff' },
    { id:'transport', x:1100, y:330, w:330, h:105, title:'EXTERIOR TRANSPORT', sub:'catwalk · scaffold · balcony · roof layer', note:`${sumHard(sweep,'unreachableTransportNodes')} stranded nodes in ${p.chunksWithUnreachableTransport ?? 0} chunks`, tone:'#ff5b78' },
    { id:'topology', x:390, y:565, w:390, h:115, title:'SPATIAL TOPOLOGY', sub:'joins semantic authority into one topology graph', note:`${finite(sweep?.totals?.missingPhysicalAdjacencies,0)} planned adjacencies lack a direct physical pair`, tone:'#ffbd59' },
    { id:'circulation', x:880, y:565, w:390, h:115, title:'WORLD CIRCULATION GRAPH', sub:'space + world + transport nodes', note:`physical routes · ${built}/${built} built chunks: all spaces reach world`, tone:'#5ce6a8' },
    { id:'assert', x:880, y:780, w:390, h:92, title:'PRODUCTION HARD GATE', sub:'assertWorldCirculationGraph(requireExplicitEgress)', note:'rejects false / partial interior egress graphs', tone:'#5ce6a8' },
    { id:'strict', x:70, y:770, w:610, h:112, title:'STRICT TOPOLOGY ASSERTION EXISTS — BUT IS OFF THE COMPILE PATH', sub:'rejects orphan reservations / apertures / entrance faces', note:'production compiler does not invoke this stricter gate here', tone:'#d38cff' },
  ];
  const byId = new Map(nodes.map(n => [n.id,n]));
  const edges = [
    ['demand','transfer','#74b8ff','requested exchanges'], ['transfer','plan','#ff496d','must realize public route'], ['plan','layout','#ffbd59','space plan'],
    ['layout','connectors','#9a8cff','space authority'], ['layout','portals','#6ca8ff','facade endpoints'], ['layout','transport','#ff5b78','exterior context'],
    ['connectors','topology','#9a8cff','connectors + reservations'], ['portals','topology','#6ca8ff','portals + apertures'], ['transport','topology','#ff5b78','transport surfaces + edges'],
    ['topology','circulation','#aab4c8','compileWorldCirculationGraph'], ['circulation','assert','#5ce6a8','hard egress gate'],
  ];
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`, `<rect width="100%" height="100%" fill="#090b10"/>`, `<defs><marker id="arr" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto"><path d="M0,0 L0,8 L9,4 z" fill="#77839a"/></marker></defs>`, `<style>text{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;fill:#edf1fb}.muted{fill:#8f98aa}.tiny{font-size:10px}.small{font-size:12px}.med{font-size:15px;font-weight:700}.title{font-size:25px;font-weight:800}</style>`, `<text x="38" y="40" class="title">JWEB authority pipeline — code/data shape, with runtime faults pinned to the owning seam</text>`, `<text x="38" y="66" class="small muted">This is intentionally not a geometry picture. Boxes are production subsystems/data products; arrows describe the handoff the source actually compiles.</text>`];
  for (const [from,to,color,label] of edges) {
    const a=byId.get(from), b=byId.get(to); if(!a||!b) continue;
    const ax=a.x+a.w/2, ay=a.y+a.h, bx=b.x+b.w/2, by=b.y;
    const mid=(ay+by)/2;
    parts.push(`<path d="M ${ax} ${ay} C ${ax} ${mid}, ${bx} ${mid}, ${bx} ${by}" fill="none" stroke="${color}" stroke-width="2.1" marker-end="url(#arr)" opacity="0.9"/>`);
  }
  for (const n of nodes) parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="11" fill="#111622" stroke="${n.tone}" stroke-width="2"/>`, `<text x="${n.x+16}" y="${n.y+28}" class="med" fill="${n.tone}">${esc(n.title)}</text>`, `<text x="${n.x+16}" y="${n.y+53}" class="small">${esc(n.sub)}</text>`, n.note ? `<text x="${n.x+16}" y="${n.y+78}" class="tiny muted">${esc(n.note)}</text>` : '');
  parts.push(`<path d="M 680 826 C 760 826, 790 826, 880 826" fill="none" stroke="#d38cff" stroke-width="2" stroke-dasharray="7 7"/>`, `<text x="780" y="814" text-anchor="middle" class="tiny" fill="#d38cff">not called by compiler</text>`, `</svg>`);
  return parts.join('\n');
}

export function renderTransportFailureAtlasSvg(sweep, { width = 1540, rowHeight = 106 } = {}) {
  const problem = [...arr(sweep?.chunks)].filter(s => finite(s?.hard?.unreachableTransportNodes,0) > 0).sort((a,b) => b.hard.unreachableTransportNodes-a.hard.unreachableTransportNodes || String(a.chunk.key).localeCompare(String(b.chunk.key)));
  const height = 135 + problem.length * rowHeight + 40;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`, `<rect width="100%" height="100%" fill="#090b10"/>`, `<style>text{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;fill:#edf1fb}.muted{fill:#8f98aa}.tiny{font-size:10px}.small{font-size:12px}.med{font-size:15px;font-weight:700}.big{font-size:27px;font-weight:800}.title{font-size:24px;font-weight:800}</style>`, `<text x="38" y="40" class="title">Exterior circulation failure atlas — healthy graph removed</text>`, `<text x="38" y="65" class="small muted">Only chunks with unreachable transport are shown. Interior authored spaces are world-reachable in every built chunk in this sweep.</text>`, `<text x="38" y="95" class="tiny muted">CHUNK / COUNT</text><text x="260" y="95" class="tiny muted">DISCONNECTED TRANSPORT COMPONENTS / GROUPS</text>`];
  problem.forEach((s, i) => {
    const y = 112 + i * rowHeight;
    const groups = arr(s?.transportAnatomy?.unreachableGroups).sort((a,b)=>finite(b.count)-finite(a.count));
    parts.push(`<rect x="38" y="${y}" width="1464" height="88" rx="9" fill="#111622" stroke="#ff5b78"/>`, `<text x="58" y="${y+31}" class="med">${esc(s.chunk.key)}</text>`, `<text x="58" y="${y+66}" class="big" fill="#ff718a">${s.hard.unreachableTransportNodes}</text>`, `<text x="112" y="${y+63}" class="tiny muted">transport nodes · ${groups.length} group${groups.length===1?'':'s'}</text>`);
    let x = 260;
    const shown = groups.slice(0, 3);
    for (const g of shown) {
      const w = 392;
      const line1 = `${g.count}× ${g.kind}`;
      const line2 = `site ${g.siteId ?? '—'} · module ${g.moduleKey ?? '—'} · y ${finite(g.yMin).toFixed(1)}..${finite(g.yMax).toFixed(1)} · ${arr(g.componentIds).join(', ')}`;
      parts.push(`<rect x="${x}" y="${y+14}" width="${w}" height="60" rx="7" fill="#260c14" stroke="#b93c55"/>`, `<text x="${x+12}" y="${y+37}" class="small" fill="#ff8da0">${esc(line1)}</text>`, `<text x="${x+12}" y="${y+58}" class="tiny muted">${esc(line2)}</text>`);
      x += w + 10;
    }
  });
  if (!problem.length) parts.push(`<text x="38" y="145" class="med" fill="#5ce6a8">No unreachable exterior transport nodes in this sweep.</text>`);
  parts.push(`</svg>`); return parts.join('\n');
}

export function renderValidationSeamsSvg(sweep, { width = 1540, height = 1020 } = {}) {
  const built = Math.max(1, finite(sweep?.totals?.chunks, 0));
  const requested = built + finite(sweep?.totals?.buildFailures, 0);
  const prevalence = sweep?.prevalence ?? {};
  const distributions = sweep?.distributions ?? {};
  const transportKinds = Object.entries(distributions.unreachableTransportKinds ?? {});
  const apertureFamilies = Object.entries(distributions.unboundPortalApertureFamilies ?? {});
  const reservationKinds = Object.entries(distributions.orphanReservationKinds ?? {});
  const fmtKinds = entries => entries.length ? entries.slice(0, 3).map(([k,v]) => `${k} ${v}`).join(' · ') : 'none';
  const seams = [
    { label:'BUILDING PLAN → TOWER TRANSFER', tone:'#ff496d', big:`${finite(sweep?.totals?.buildFailures,0)} / ${requested}`, title:'chunks rejected before topology', detail:'same public-through-route realization contract', code:'tower-transfer-authority → Building Plan public path' },
    { label:'EXTERIOR TRANSPORT → WORLD CIRCULATION', tone:'#ff5b78', big:`${prevalence.chunksWithUnreachableTransport ?? 0} / ${built}`, title:`built chunks contain ${finite(sweep?.totals?.hardConnectivityFailures,0)} marooned graph nodes`, detail:fmtKinds(transportKinds), code:'transport surface → junction/network → world graph' },
    { label:'SPACE → EXPLICIT WORLD EGRESS', tone:'#5ce6a8', big:`${built} / ${built}`, title:'built chunks keep every authored interior space world-reachable', detail:`unreachable spaces ${sumHard(sweep,'unreachableSpaces')} · explicit egress failures ${sumHard(sweep,'explicitEgressFailures')}`, code:'world graph → explicit-egress assertion' },
    { label:'ACCESS PORTAL → FACADE APERTURE', tone:'#6ca8ff', big:`${prevalence.chunksWithUnboundPortalApertures ?? 0} / ${built}`, title:`built chunks contain ${finite(sweep?.totals?.unboundPortalApertures,0)} unbound portal apertures`, detail:fmtKinds(apertureFamilies), code:'access-portals → spatial-topology aperture ownership' },
    { label:'EXTERIOR STAIR CLEARANCE → CONNECTOR OWNER', tone:'#9a8cff', big:`${prevalence.chunksWithOrphanReservations ?? 0} / ${built}`, title:`built chunks contain ${finite(sweep?.totals?.orphanReservations,0)} orphan reservations`, detail:fmtKinds(reservationKinds), code:'exterior stair reservation → connectorId ownership' },
    { label:'PLANNED ADJACENCY → DIRECT PHYSICAL EDGE', tone:'#ffbd59', big:`${prevalence.chunksWithMissingPhysicalAdjacencies ?? 0} / ${built}`, title:`built chunks contain ${finite(sweep?.totals?.missingPhysicalAdjacencies,0)} plan/physical mismatches`, detail:'plan says neighboring spaces; published physical graph lacks the direct pair', code:'space plan adjacency → semantic connector → world edge' },
  ];
  const rowH = 126, top = 112;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`, `<rect width="100%" height="100%" fill="#090b10"/>`, `<style>text{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;fill:#edf1fb}.muted{fill:#8f98aa}.tiny{font-size:11px}.small{font-size:13px}.med{font-size:16px;font-weight:700}.big{font-size:31px;font-weight:800}.title{font-size:25px;font-weight:800}</style>`, `<text x="38" y="40" class="title">JWEB system seams — what is actually failing, and where</text>`, `<text x="38" y="67" class="small muted">Read top-to-bottom as contracts between subsystems. Counts are from the many-chunk runtime sweep; green is a useful negative result.</text>`];
  seams.forEach((row, i) => {
    const y = top + i * rowH;
    parts.push(`<rect x="38" y="${y}" width="1464" height="108" rx="10" fill="#111622" stroke="${row.tone}" stroke-width="2"/>`, `<rect x="38" y="${y}" width="10" height="108" rx="5" fill="${row.tone}"/>`, `<text x="66" y="${y+28}" class="med" fill="${row.tone}">${esc(row.label)}</text>`, `<text x="66" y="${y+62}" class="big" fill="${row.tone}">${esc(row.big)}</text>`, `<text x="245" y="${y+55}" class="med">${esc(row.title)}</text>`, `<text x="245" y="${y+79}" class="small muted">${esc(row.detail)}</text>`, `<text x="1010" y="${y+55}" class="small">${esc(row.code)}</text>`);
  });
  const gateY = top + seams.length * rowH + 5;
  const strictCalled = sweep?.validation?.compilerCallsStrictSpatialAssert;
  const worldCalled = sweep?.validation?.compilerCallsWorldAssert;
  parts.push(`<rect x="38" y="${gateY}" width="1464" height="126" rx="10" fill="#17131f" stroke="#c08cff" stroke-width="2"/>`, `<text x="66" y="${gateY+29}" class="med" fill="#d7a9ff">VALIDATION GATE SHAPE</text>`, `<text x="66" y="${gateY+57}" class="small">compileSpatialTopologyGraph → ${worldCalled ? 'assertWorldCirculationGraph ✓' : 'world assertion not detected'} → publish topology</text>`, `<text x="66" y="${gateY+82}" class="small">assertSpatialTopologyGraph exists, but compiler invokes it here: ${strictCalled ? 'YES' : 'NO'}</text>`, `<text x="66" y="${gateY+105}" class="tiny muted">So strong egress reachability can be fail-closed while orphan reservations / entrance binding debt remain observable in successfully built chunks. That is a validation seam, not by itself proof every nonzero binding count is wrong.</text>`, `</svg>`);
  return parts.join('\n');
}

function sumHard(sweep, key) {
  return arr(sweep?.chunks).reduce((sum, item) => sum + finite(item?.hard?.[key], 0), 0);
}

export function renderSweepFingerprintSvg(sweep, { width = 1500, rowHeight = 30 } = {}) {
  const failures = arr(sweep?.failures).map(f => ({ kind: 'failure', key: f.chunkKey, failure: f }));
  const built = [...arr(sweep?.chunks)].sort((a, b) => b.attention - a.attention).map(s => ({ kind: 'built', key: s.chunk.key, summary: s }));
  const rows = [...failures, ...built];
  const height = 125 + rows.length * rowHeight + 55;
  const metrics = [
    { key: 'transport', label: 'UNREACHABLE TRANSPORT', color: '#ff5b78', get: s => s.hard.unreachableTransportNodes, max: Math.max(1, ...built.map(r => r.summary.hard.unreachableTransportNodes)) },
    { key: 'adj', label: 'ADJ ≠ PHYSICAL', color: '#ffbd59', get: s => s.relational.plannedAdjacenciesWithoutPhysicalEdge, max: Math.max(1, ...built.map(r => r.summary.relational.plannedAdjacenciesWithoutPhysicalEdge)) },
    { key: 'aperture', label: 'UNBOUND APERTURE', color: '#6ca8ff', get: s => s.binding.unboundPortalApertures, max: Math.max(1, ...built.map(r => r.summary.binding.unboundPortalApertures)) },
    { key: 'reservation', label: 'UNOWNED RESERVATION', color: '#9a8cff', get: s => s.binding.orphanReservations, max: Math.max(1, ...built.map(r => r.summary.binding.orphanReservations)) },
    { key: 'hops', label: 'MAX EXIT HOPS', color: '#5ce6a8', get: s => s.circulation.maxHopsToExit, max: Math.max(1, ...built.map(r => r.summary.circulation.maxHopsToExit)) },
  ];
  const left = 126, metricW = 248, gap = 14;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`, `<rect width="100%" height="100%" fill="#090b10"/>`, `<style>text{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;fill:#edf1fb}.muted{fill:#8f98aa}.tiny{font-size:10px}.small{font-size:12px}.med{font-size:14px;font-weight:700}.title{font-size:23px;font-weight:700}</style>`, `<text x="34" y="36" class="title">System fingerprint — failures first, then built chunks by attention</text>`, `<text x="34" y="60" class="small muted">Long bars make recurring failure shapes visible without reading raw graph objects.</text>`];
  metrics.forEach((m, i) => parts.push(`<text x="${left + i * (metricW + gap)}" y="100" class="tiny muted">${m.label}</text>`));
  rows.forEach((row, ri) => {
    const y = 116 + ri * rowHeight;
    parts.push(`<text x="34" y="${y + 17}" class="small" fill="${row.kind === 'failure' ? '#ff718a' : '#cbd3e3'}">${esc(row.key)}</text>`);
    if (row.kind === 'failure') {
      parts.push(`<rect x="${left}" y="${y + 4}" width="${metrics.length * metricW + (metrics.length - 1) * gap}" height="20" rx="4" fill="#3b0710" stroke="#ff496d"/>`, `<text x="${left + 10}" y="${y + 18}" class="small" fill="#ff8da0">BUILD FAILED · tower-transfer / public through-route realization</text>`);
      return;
    }
    metrics.forEach((m, i) => {
      const x = left + i * (metricW + gap), value = m.get(row.summary), ratio = Math.max(0, Math.min(1, value / m.max));
      parts.push(`<rect x="${x}" y="${y + 5}" width="${metricW}" height="18" rx="4" fill="#151b27"/>`, `<rect x="${x}" y="${y + 5}" width="${Math.max(value ? 3 : 0, ratio * metricW)}" height="18" rx="4" fill="${m.color}" opacity="${value ? 0.88 : 0}"/>`, `<text x="${x + 7}" y="${y + 18}" class="tiny" fill="${value ? '#071018' : '#657087'}">${value}</text>`);
    });
  });
  parts.push(`</svg>`); return parts.join('\n');
}

export function renderCodeSystemMapSvg(scan, { width = 1450, height = 820 } = {}) {
  const nodes = arr(scan?.nodes);
  const byPath = new Map(nodes.map(node => [node.path, node]));
  const lanes = [
    ['GENERATOR / GEOMETRY', ['kowloon-fabric-engine.js']],
    ['SEMANTIC PLAN', ['world/semantic-layout.js', 'world/space-plan.js', 'world/semantic-connectors.js']],
    ['ACCESS / CONTEXT', ['world/access-portals.js', 'world/semantic-context.js']],
    ['UNIFIED TOPOLOGY', ['world/spatial-topology.js']],
    ['ROUTING', ['world/circulation-graph.js', 'world/sectional-circulation.js']],
    ['PHYSICAL EXTERIOR', ['world/exterior-transport-network.js', 'world/scaffold-circulation-plan.js', 'world/circulation-collision-authority.js']],
  ];
  const boxW = 315, boxH = 76, left = 310, top = 92, vgap = 112;
  const positions = new Map();
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`, `<rect width="100%" height="100%" fill="#090b10"/>`, `<style>text{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;fill:#edf1fb}.muted{fill:#8f98aa}.tiny{font-size:10px}.small{font-size:12px}.med{font-size:14px;font-weight:700}.title{font-size:23px;font-weight:700}</style>`, `<text x="38" y="38" class="title">JWEB circulation/spatial code map — imports scanned from this checkout</text>`, `<text x="38" y="63" class="small muted">Arrows below are real ES-module imports among the selected system files. This is code structure, not a guessed architecture diagram.</text>`];
  lanes.forEach(([name, paths], laneIndex) => {
    const y = top + laneIndex * vgap;
    parts.push(`<text x="38" y="${y + 29}" class="med" fill="#9fb0cc">${name}</text>`, `<line x1="38" y1="${y + 44}" x2="1398" y2="${y + 44}" stroke="#1e2634"/>`);
    paths.forEach((path, i) => {
      const x = left + i * 360; positions.set(path, { x, y });
      const node = byPath.get(path); const schema = node?.schemas?.[0] ?? '';
      parts.push(`<rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="9" fill="#111622" stroke="#3a465f"/>`, `<text x="${x + 14}" y="${y + 27}" class="med">${esc(path.replace('world/', ''))}</text>`, `<text x="${x + 14}" y="${y + 48}" class="tiny muted">${esc(schema || `${node?.imports?.length ?? 0} selected imports`)}</text>`);
    });
  });
  for (const edge of arr(scan?.edges)) {
    const a = positions.get(edge.from), b = positions.get(edge.to); if (!a || !b) continue;
    const x1 = a.x + boxW / 2, y1 = a.y + boxH, x2 = b.x + boxW / 2, y2 = b.y;
    const mid = (y1 + y2) / 2;
    parts.push(`<path d="M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}" fill="none" stroke="#67728a" stroke-width="1.6" marker-end="url(#arrow)" opacity="0.85"/>`);
  }
  parts.splice(3, 0, `<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="#67728a"/></marker></defs>`);
  parts.push(`</svg>`); return parts.join('\n');
}

export function renderSweepIndexHtml(sweep, { title = 'JWEB system observatory' } = {}) {
  const rows = arr(sweep?.chunks).sort((a, b) => b.attention - a.attention).map(s => {
    const sev = severity(s), hard = Object.values(s.hard).reduce((a, v) => a + v, 0), unresolved = s.relational.danglingConnectorSpaceRefs + s.relational.danglingPortalSpaceRefs;
    return `<tr data-sev="${sev}" data-score="${s.attention}"><td><a href="chunks/${esc(s.chunk.key)}/index.html">${esc(s.chunk.key)}</a></td><td class="score ${sev}">${s.attention}</td><td>${hard}</td><td>${s.hard.unreachableTransportNodes}</td><td>${s.relational.plannedAdjacenciesWithoutPhysicalEdge}</td><td>${unresolved}</td><td>${s.binding.unboundPortalApertures}</td><td>${s.binding.orphanReservations}</td><td>${s.circulation.maxHopsToExit}</td><td>${s.counts.spaces}</td></tr>`;
  }).join('\n');
  const outlierRows = arr(sweep?.outliers).slice(0, 60).map(o => `<tr><td><a href="chunks/${esc(o.chunkKey)}/index.html">${esc(o.chunkKey)}</a></td><td>${esc(o.metric)}</td><td>${o.value}</td><td>${o.median}</td><td>${esc(o.robustZ)}</td></tr>`).join('\n');
  const failureRows = arr(sweep?.failures).map(f => `<tr><td>${esc(f.chunkKey)}</td><td class="score hard">BUILD FAILED</td><td style="text-align:left">${esc(String(f.message ?? '').split('\n')[0].replace(/^Error:\s*/, ''))}</td></tr>`).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
  :root{color-scheme:dark}body{margin:0;background:#090b10;color:#edf1fb;font:14px ui-monospace,SFMono-Regular,Consolas,monospace}main{max-width:1900px;margin:auto;padding:28px}a{color:#82c5ff}h1{margin:0 0 8px}.muted{color:#8f98aa}.cards{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin:22px 0}.card{background:#111622;border:1px solid #2f394c;border-radius:10px;padding:15px}.card.fail{border-color:#ff496d;background:#250910}.big{font-size:28px;font-weight:700}img{max-width:100%;background:#090b10;border:1px solid #283145;border-radius:10px}table{border-collapse:collapse;width:100%;margin:16px 0 30px}th,td{border-bottom:1px solid #232b3a;padding:8px 9px;text-align:right}th:first-child,td:first-child{text-align:left}.score.hard{color:#ff718a}.score.relational{color:#ffcf6b}.score.binding{color:#8ab8ff}.score.clean{color:#5ce6a8}.links{display:flex;gap:16px;flex-wrap:wrap}@media(max-width:1200px){.cards{grid-template-columns:repeat(3,1fr)}}@media(max-width:800px){.cards{grid-template-columns:1fr 1fr}}</style></head><body><main>
  <h1>${esc(title)}</h1><p class="muted">Many chunks first, exact geometry second. Build failures and marooned circulation are visually privileged over large but ambiguous authority counts.</p>
  <div class="links"><a href="authority-pipeline.svg">authority pipeline</a><a href="validation-seams.svg">system seams</a><a href="transport-failure-atlas.svg">transport islands</a><a href="chunk-matrix.svg">chunk matrix</a><a href="system-fingerprint.svg">system fingerprint</a><a href="code-system-map.svg">code system map</a><a href="sweep.json">raw sweep JSON</a><a href="SWEEP-FINDINGS.md">findings</a></div>
  <div class="cards"><div class="card"><div class="big">${sweep.totals.chunks}</div><div>built chunks</div></div><div class="card fail"><div class="big">${sweep.totals.buildFailures ?? 0}</div><div>generator build failures</div></div><div class="card"><div class="big">${sweep.totals.hardConnectivityFailures}</div><div>unreachable circulation nodes</div></div><div class="card"><div class="big">${sweep.totals.missingPhysicalAdjacencies}</div><div>plan adjacency ≠ physical edge</div></div><div class="card"><div class="big">${sweep.totals.unboundPortalApertures}</div><div>portal/aperture binding gaps</div></div><div class="card"><div class="big">${sweep.totals.orphanReservations}</div><div>unowned reservations</div></div></div>
  <h2>Authority pipeline</h2><p class="muted">The actual subsystem handoffs, with sweep findings attached where they originate.</p><img src="authority-pipeline.svg" alt="authority pipeline">
  <h2>System seams</h2><p class="muted">Start here. This collapses thousands of graph objects into the six subsystem boundaries that explain the sweep.</p><img src="validation-seams.svg" alt="validation seams">
  <h2>Exterior circulation islands</h2><p class="muted">Only failed exterior transport is shown; healthy graph nodes are deliberately omitted.</p><img src="transport-failure-atlas.svg" alt="transport failure atlas">
  ${failureRows ? `<h2>Generator failures</h2><p class="muted">These never reach the topology/circulation report: the building-plan/tower-transfer contract rejects the chunk during generation.</p><table><thead><tr><th>chunk</th><th>status</th><th style="text-align:left">failure</th></tr></thead><tbody>${failureRows}</tbody></table>` : ''}
  <h2>Chunk matrix</h2><p class="muted">Red BUILD FAILED cards are generator failures. Red numbered cards built but contain unreachable compiled circulation. Click built cards for system anatomy.</p><img src="chunk-matrix.svg" alt="chunk matrix">
  <h2>System fingerprint</h2><p class="muted">Failure signatures first; then built chunks ranked by attention. Bar length is normalized within this sweep.</p><img src="system-fingerprint.svg" alt="system fingerprint"><h2>Ranked built chunks</h2><table><thead><tr><th>chunk</th><th>score</th><th>hard</th><th>unreachable transport</th><th>adj≠phys</th><th>unresolved refs</th><th>unbound aperture</th><th>orphan reservation</th><th>max hops</th><th>spaces</th></tr></thead><tbody>${rows}</tbody></table>
  <h2>Robust outliers across built chunks</h2><p class="muted">Median/MAD comparison. This finds system-shape outliers even when they still compile.</p><table><thead><tr><th>chunk</th><th>metric</th><th>value</th><th>median</th><th>robust z</th></tr></thead><tbody>${outlierRows}</tbody></table>
  <h2>Code shape</h2><img src="code-system-map.svg" alt="code system map">
  </main></body></html>`;
}

export function renderChunkIndexHtml(summary) {
  const samples = [
    ['planned adjacency without physical edge', summary.samples.missingPhysicalAdjacencies],
    ['unresolved connector-space refs after world-node promotion', summary.samples.danglingConnectorSpaceRefs],
    ['unresolved portal-space refs after world-node promotion', summary.samples.danglingPortalSpaceRefs],
    ['promoted connector refs to world nodes', summary.samples.promotedConnectorWorldRefs],
    ['promoted portal refs to world nodes', summary.samples.promotedPortalWorldRefs],
    ['orphan reservations', summary.samples.orphanReservations],
    ['unbound portal apertures', summary.samples.unboundPortalApertures],
  ].map(([title, items]) => `<details ${items.length ? 'open' : ''}><summary>${esc(title)} (${items.length})</summary><pre>${esc(JSON.stringify(items, null, 2))}</pre></details>`).join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>JWEB chunk ${esc(summary.chunk.key)} systems</title><style>:root{color-scheme:dark}body{margin:0;background:#090b10;color:#edf1fb;font:14px ui-monospace,SFMono-Regular,Consolas,monospace}main{max-width:1550px;margin:auto;padding:26px}a{color:#82c5ff}.muted{color:#8f98aa}.views{display:grid;gap:20px}img{width:100%;border:1px solid #2b3447;border-radius:10px;background:#090b10}details{background:#111622;border:1px solid #2b3447;border-radius:8px;margin:10px 0;padding:10px}summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px}</style></head><body><main><p><a href="../../index.html">← sweep</a></p><h1>Chunk ${esc(summary.chunk.key)}</h1><p class="muted">Simplified system truth. Use this page to choose a target; then use the exact geometry/visual harness for the physical proof.</p><div class="views"><img src="system-story.svg"><img src="transport-anatomy.svg"><img src="attention-ledger.svg"><img src="building-stacks.svg"></div><h2>Exact diagnostic samples</h2>${samples}<p><a href="summary.json">raw chunk summary JSON</a></p></main></body></html>`;
}

export function renderSweepFindingsMarkdown(sweep) {
  const ranked = [...arr(sweep?.chunks)].sort((a, b) => b.attention - a.attention).slice(0, 12);
  const lines = [
    '# JWEB system observatory sweep findings', '',
    '> Diagnostic triage only. Build failures and unreachable compiled circulation are hard signals. Relational/binding counts are narrower clues that still require exact geometry inspection.', '',
    `Requested chunks: **${(sweep.totals.chunks ?? 0) + (sweep.totals.buildFailures ?? 0)}**`,
    `Built chunks: **${sweep.totals.chunks}**`,
    `Generator build failures: **${sweep.totals.buildFailures ?? 0}**`,
    `Unreachable compiled circulation nodes / egress failures: **${sweep.totals.hardConnectivityFailures}**`,
    `Planned adjacency without direct physical graph edge: **${sweep.totals.missingPhysicalAdjacencies}**`,
    `Unresolved connector/portal references after world-node promotion: **${sweep.totals.danglingRefs}**`,
    `Unbound portal apertures: **${sweep.totals.unboundPortalApertures}**`,
    `Orphan reservations: **${sweep.totals.orphanReservations}**`, '',
  ];
  if (arr(sweep.failures).length) {
    lines.push('## Generator build failures', '');
    for (const f of sweep.failures) lines.push(`- **${f.chunkKey}** — ${String(f.message ?? '').split('\n')[0].replace(/^Error:\s*/, '')}`);
    lines.push('');
  }
  lines.push('## Highest-attention built chunks', '');
  for (const s of ranked) lines.push(`- **${s.chunk.key}** score ${s.attention}: unreachableSpace=${s.hard.unreachableSpaces}, unreachableTransport=${s.hard.unreachableTransportNodes}, egressFail=${s.hard.explicitEgressFailures}, adj≠phys=${s.relational.plannedAdjacenciesWithoutPhysicalEdge}, unboundPortalApertures=${s.binding.unboundPortalApertures}, orphanReservations=${s.binding.orphanReservations}, maxExitHops=${s.circulation.maxHopsToExit}`);
  lines.push('', '## Strong robust outliers', '');
  for (const o of arr(sweep.outliers).slice(0, 30)) lines.push(`- ${o.chunkKey}: ${o.metric}=${o.value} (median ${o.median}, robust z ${o.robustZ})`);
  return lines.join('\n') + '\n';
}
