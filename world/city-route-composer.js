export const CITY_ROUTE_COMPOSER_SCHEMA = 'jweb.city-route-composer.v2';

function stableHash(text) {
  let h = 2166136261 >>> 0;
  for (const ch of String(text ?? '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function unit(hash, shift = 0) { return ((hash >>> shift) & 0xffff) / 0xffff; }
function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function edgeKey(edge) { return String(edge?.id ?? `${edge?.aSiteId}:${edge?.bSiteId}`); }
function nodeKey(value) { return String(value); }

function normalizedGeometry(siteGeometry) {
  if (siteGeometry instanceof Map) return siteGeometry;
  const out = new Map();
  for (const [key, value] of Object.entries(siteGeometry ?? {})) out.set(nodeKey(key), value);
  return out;
}
function geometryFor(map, siteId) { return map.get(siteId) ?? map.get(nodeKey(siteId)) ?? null; }
function centerOf(raw) {
  if (!raw) return null;
  const bounds = raw.bounds ?? raw;
  const minX = finite(bounds.minX, NaN), maxX = finite(bounds.maxX, NaN);
  const minZ = finite(bounds.minZ, NaN), maxZ = finite(bounds.maxZ, NaN);
  if ([minX, maxX, minZ, maxZ].every(Number.isFinite)) return { x: (minX + maxX) * 0.5, z: (minZ + maxZ) * 0.5 };
  const x = finite(raw.x, NaN), z = finite(raw.z, NaN);
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}
function boundsOf(raw, margin = 0) {
  if (!raw) return null;
  const b = raw.bounds ?? raw;
  let minX = finite(b.minX, NaN), maxX = finite(b.maxX, NaN), minZ = finite(b.minZ, NaN), maxZ = finite(b.maxZ, NaN);
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) {
    const c = centerOf(raw); const hx = finite(raw.halfX, NaN), hz = finite(raw.halfZ, NaN);
    if (!c || !Number.isFinite(hx) || !Number.isFinite(hz)) return null;
    minX = c.x - hx; maxX = c.x + hx; minZ = c.z - hz; maxZ = c.z + hz;
  }
  return { minX: minX - margin, maxX: maxX + margin, minZ: minZ - margin, maxZ: maxZ + margin };
}
function segmentHitsRect(a, b, rect) {
  if (!a || !b || !rect) return false;
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dz = b.z - a.z;
  const clips = [
    [-dx, a.x - rect.minX], [dx, rect.maxX - a.x],
    [-dz, a.z - rect.minZ], [dz, rect.maxZ - a.z],
  ];
  for (const [p, q] of clips) {
    if (Math.abs(p) < 1e-9) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t0 <= t1;
}

function componentsFor(plans) {
  const adjacency = new Map();
  const edgesByNode = new Map();
  const addNode = id => {
    const key = nodeKey(id);
    if (!adjacency.has(key)) adjacency.set(key, new Set());
    if (!edgesByNode.has(key)) edgesByNode.set(key, []);
    return key;
  };
  for (const edge of plans) {
    const a = addNode(edge.aSiteId), b = addNode(edge.bSiteId);
    adjacency.get(a).add(b); adjacency.get(b).add(a);
    edgesByNode.get(a).push(edge); edgesByNode.get(b).push(edge);
  }
  const seen = new Set();
  const out = [];
  for (const start of [...adjacency.keys()].sort()) {
    if (seen.has(start)) continue;
    const nodes = [], edgeSet = new Map(), queue = [start]; seen.add(start);
    while (queue.length) {
      const node = queue.shift(); nodes.push(node);
      for (const edge of edgesByNode.get(node) ?? []) edgeSet.set(edgeKey(edge), edge);
      for (const next of adjacency.get(node) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
    out.push({ nodes, edges: [...edgeSet.values()], adjacency, edgesByNode });
  }
  return out;
}

function shortestPath(component, start, goal) {
  const queue = [start];
  const parent = new Map([[start, null]]);
  while (queue.length) {
    const node = queue.shift();
    if (node === goal) break;
    for (const next of component.adjacency.get(node) ?? []) {
      if (!component.nodes.includes(next) || parent.has(next)) continue;
      parent.set(next, node); queue.push(next);
    }
  }
  if (!parent.has(goal)) return null;
  const nodes = [];
  let cursor = goal;
  while (cursor !== null) { nodes.push(cursor); cursor = parent.get(cursor) ?? null; }
  nodes.reverse();
  const edges = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i], b = nodes[i + 1];
    const edge = (component.edgesByNode.get(a) ?? []).find(candidate => {
      const ca = nodeKey(candidate.aSiteId), cb = nodeKey(candidate.bSiteId);
      return (ca === a && cb === b) || (ca === b && cb === a);
    });
    if (edge) edges.push(edge);
  }
  return { nodes, edges };
}

function pathGeometry(path, geometry) {
  const first = centerOf(geometryFor(geometry, path.nodes[0]));
  const last = centerOf(geometryFor(geometry, path.nodes.at(-1)));
  if (!first || !last) return { span: path.edges.length, absorbed: [] };
  const absorbed = [];
  for (const siteId of path.nodes.slice(1, -1)) {
    const rect = boundsOf(geometryFor(geometry, siteId), 0.75);
    if (rect && segmentHitsRect(first, last, rect)) absorbed.push(siteId);
  }
  return { span: Math.hypot(last.x - first.x, last.z - first.z), absorbed };
}

function primaryPath(component, stableKey, geometry) {
  if (component.nodes.length < 2) return { nodes: [...component.nodes], edges: [], absorbed: [], span: 0 };
  let best = null;
  for (let i = 0; i < component.nodes.length; i++) {
    for (let j = i + 1; j < component.nodes.length; j++) {
      const path = shortestPath(component, component.nodes[i], component.nodes[j]);
      if (!path) continue;
      const geo = pathGeometry(path, geometry);
      const endpointDegree = (component.adjacency.get(path.nodes[0])?.size ?? 0) + (component.adjacency.get(path.nodes.at(-1))?.size ?? 0);
      const tie = stableHash(`${stableKey}:${path.nodes.join('>')}`);
      // Long district paths still dominate, but a path whose direct desire would
      // physically run through intermediate tower mass is especially valuable:
      // those towers can become route segments instead of obstacles.
      const score = path.edges.length * 100 + geo.absorbed.length * 42 + Math.min(36, geo.span * 0.20) - endpointDegree * 2;
      if (!best || score > best.score || (score === best.score && tie < best.tie)) best = { ...path, ...geo, score, tie };
    }
  }
  if (!best) return { nodes: [...component.nodes.slice(0, 1)], edges: [], absorbed: [], span: 0 };
  // Keep hierarchy, but permit a genuinely long thoroughfare. The ceiling city
  // gets the longest cap because its primary gallery is meant to read as a street
  // threading several buildings, not a two-building landing pair.
  const cap = 7 + (stableHash(`${stableKey}:primary-span-cap`) % 4);
  if (best.edges.length <= cap) return best;
  const maxStart = best.edges.length - cap;
  const centerStart = Math.floor(maxStart * 0.5);
  const jitter = (stableHash(`${stableKey}:primary-window`) % 3) - 1;
  const start = Math.max(0, Math.min(maxStart, centerStart + jitter));
  const sliced = { ...best, edges: best.edges.slice(start, start + cap), nodes: best.nodes.slice(start, start + cap + 1) };
  const geo = pathGeometry(sliced, geometry);
  return { ...sliced, ...geo };
}

/**
 * Composes local bridge candidates into district-scale route intent before any
 * individual bridge chooses its elevation or architecture. Buildings on the
 * primary path are intentional route segments; crossing spans remain exterior.
 */
export function composeCityRoutes({ bridgePlans = [], field = 'ground', stableKey = 'city-routes', siteGeometry = null } = {}) {
  const plans = Array.isArray(bridgePlans) ? bridgePlans : [];
  const geometry = normalizedGeometry(siteGeometry);
  const components = componentsFor(plans);
  const routeSummaries = [];
  const transferSites = new Set();
  const absorbedInterveningTowerIds = new Set();
  const siteDemand = new Map();
  let primaryEdges = 0, branchEdges = 0, lateralThroughputSites = 0;

  components.forEach((component, componentIndex) => {
    const primary = primaryPath(component, `${stableKey}:component:${componentIndex}`, geometry);
    const primaryEdgeIds = new Set(primary.edges.map(edgeKey));
    const routeHash = stableHash(`${stableKey}:${field}:${componentIndex}:${primary.nodes.join('|')}`);
    const routeId = `${stableKey}:route:${componentIndex}`;
    const preferredBandNorm = 0.5 + (unit(routeHash, 8) - 0.5) * 0.20;
    const routeStrength = Math.min(1, 0.40 + primary.edges.length * 0.095 + component.edges.length * 0.025 + primary.absorbed.length * 0.055);

    const primaryDegree = new Map();
    for (const edge of primary.edges) {
      const a = nodeKey(edge.aSiteId), b = nodeKey(edge.bSiteId);
      primaryDegree.set(a, (primaryDegree.get(a) ?? 0) + 1);
      primaryDegree.set(b, (primaryDegree.get(b) ?? 0) + 1);
    }
    const absorbed = new Set(primary.absorbed);
    for (const [siteId, degree] of primaryDegree) {
      if (degree >= 2) transferSites.add(siteId);
      if (absorbed.has(siteId)) absorbedInterveningTowerIds.add(siteId);
      const role = degree >= 2 ? 'transfer' : 'endpoint';
      siteDemand.set(siteId, Object.freeze({
        siteId, routeId, field, role, primaryDegree: degree,
        strength: routeStrength,
        preferredBandNorm,
        absorbedInterveningTower: absorbed.has(siteId),
        routeEdgeCount: primary.edges.length,
        routeSpan: primary.span,
      }));
    }

    const siteGalleryDemand = field === 'ceiling' && primary.edges.length >= 2;
    for (const edge of component.edges) {
      const primaryRole = primaryEdgeIds.has(edgeKey(edge));
      Object.assign(edge, {
        cityRouteComposer: CITY_ROUTE_COMPOSER_SCHEMA,
        cityRouteId: routeId,
        cityRouteRole: primaryRole ? 'primary-spine' : 'branch',
        cityRouteComponent: componentIndex,
        cityRoutePreferredBandNorm: primaryRole ? preferredBandNorm : null,
        cityRouteStrength: primaryRole ? routeStrength : Math.max(0.20, routeStrength * 0.44),
        routeCompositionOrder: primaryRole ? primary.edges.findIndex(candidate => edgeKey(candidate) === edgeKey(edge)) : null,
        cityRoutePrimaryEdgeCount: primary.edges.length,
        cityRouteSpan: primary.span,
        cityRouteAbsorbedTowerCount: primary.absorbed.length,
        intermediateTowerRoute: primaryRole && primary.nodes.length >= 3,
        hangingLateralThroughput: primaryRole && siteGalleryDemand,
      });
      for (const endpoint of [edge.aEndpoint, edge.bEndpoint]) {
        if (!endpoint) continue;
        const siteId = endpoint === edge.aEndpoint ? nodeKey(edge.aSiteId) : nodeKey(edge.bSiteId);
        endpoint.cityRouteId = routeId;
        endpoint.cityRouteRole = edge.cityRouteRole;
        endpoint.hangingLateralThroughput = edge.hangingLateralThroughput;
        endpoint.cityRouteStrength = edge.cityRouteStrength;
        endpoint.cityRouteSpan = primary.span;
        endpoint.absorbedInterveningTower = absorbed.has(siteId);
      }
      if (primaryRole) primaryEdges++; else branchEdges++;
    }
    if (siteGalleryDemand) lateralThroughputSites += [...primaryDegree.values()].filter(value => value >= 1).length;
    routeSummaries.push(Object.freeze({
      id: routeId,
      component: componentIndex,
      nodes: Object.freeze([...component.nodes]),
      primaryNodes: Object.freeze([...primary.nodes]),
      primaryEdgeIds: Object.freeze(primary.edges.map(edgeKey)),
      branchEdgeIds: Object.freeze(component.edges.filter(edge => !primaryEdgeIds.has(edgeKey(edge))).map(edgeKey)),
      absorbedInterveningTowerIds: Object.freeze([...primary.absorbed]),
      preferredBandNorm,
      routeStrength,
      routeSpan: primary.span,
      field,
    }));
  });

  return Object.freeze({
    schema: CITY_ROUTE_COMPOSER_SCHEMA,
    field,
    components: components.length,
    routes: Object.freeze(routeSummaries),
    primaryEdges,
    branchEdges,
    transferSiteIds: Object.freeze([...transferSites]),
    absorbedInterveningTowerIds: Object.freeze([...absorbedInterveningTowerIds]),
    absorbedInterveningTowerCount: absorbedInterveningTowerIds.size,
    siteRouteDemands: Object.freeze([...siteDemand.values()]),
    lateralThroughputSites,
    invariant: 'district route intent prefers long multi-building spines; towers lying in the direct desire line are intentionally absorbed as transfer segments',
  });
}
