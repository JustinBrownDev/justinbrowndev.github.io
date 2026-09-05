export const CITY_ROUTE_COMPOSER_SCHEMA = 'jweb.city-route-composer.v1';

function stableHash(text) {
  let h = 2166136261 >>> 0;
  for (const ch of String(text ?? '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
function unit(hash, shift = 0) { return ((hash >>> shift) & 0xffff) / 0xffff; }
function edgeKey(edge) { return String(edge?.id ?? `${edge?.aSiteId}:${edge?.bSiteId}`); }
function nodeKey(value) { return String(value); }

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

function primaryPath(component, stableKey) {
  if (component.nodes.length < 2) return { nodes: [...component.nodes], edges: [] };
  let best = null;
  for (let i = 0; i < component.nodes.length; i++) {
    for (let j = i + 1; j < component.nodes.length; j++) {
      const path = shortestPath(component, component.nodes[i], component.nodes[j]);
      if (!path) continue;
      const endpointDegree = (component.adjacency.get(path.nodes[0])?.size ?? 0) + (component.adjacency.get(path.nodes.at(-1))?.size ?? 0);
      const tie = stableHash(`${stableKey}:${path.nodes.join('>')}`);
      const score = path.edges.length * 100 - endpointDegree * 2;
      if (!best || score > best.score || (score === best.score && tie < best.tie)) best = { ...path, score, tie };
    }
  }
  if (!best) return { nodes: [...component.nodes.slice(0, 1)], edges: [] };
  // A connected component is not automatically one arterial. Keep a strong
  // multi-building spine, but leave the rest as local/branch circulation so the
  // route hierarchy does not swallow an entire district into one giant skyway.
  const cap = 6 + (stableHash(`${stableKey}:primary-span-cap`) % 4);
  if (best.edges.length <= cap) return best;
  const maxStart = best.edges.length - cap;
  const centerStart = Math.floor(maxStart * 0.5);
  const jitter = (stableHash(`${stableKey}:primary-window`) % 3) - 1;
  const start = Math.max(0, Math.min(maxStart, centerStart + jitter));
  return {
    ...best,
    edges: best.edges.slice(start, start + cap),
    nodes: best.nodes.slice(start, start + cap + 1),
  };
}

/**
 * Composes local bridge candidates into district-scale route intent before any
 * individual bridge chooses its elevation or architecture. Buildings on the
 * primary path are intentional route segments; crossing spans remain exterior.
 */
export function composeCityRoutes({ bridgePlans = [], field = 'ground', stableKey = 'city-routes' } = {}) {
  const plans = Array.isArray(bridgePlans) ? bridgePlans : [];
  const components = componentsFor(plans);
  const routeSummaries = [];
  const transferSites = new Set();
  let primaryEdges = 0, branchEdges = 0, lateralThroughputSites = 0;

  components.forEach((component, componentIndex) => {
    const primary = primaryPath(component, `${stableKey}:component:${componentIndex}`);
    const primaryEdgeIds = new Set(primary.edges.map(edgeKey));
    const routeHash = stableHash(`${stableKey}:${field}:${componentIndex}:${primary.nodes.join('|')}`);
    const routeId = `${stableKey}:route:${componentIndex}`;
    // Major routes generally live near the overlap-rich middle, but retain enough
    // deterministic spread to avoid creating one magic pedestrian altitude.
    const preferredBandNorm = 0.5 + (unit(routeHash, 8) - 0.5) * 0.22;
    const routeStrength = Math.min(1, 0.35 + primary.edges.length * 0.16 + component.edges.length * 0.035);

    const primaryDegree = new Map();
    for (const edge of primary.edges) {
      const a = nodeKey(edge.aSiteId), b = nodeKey(edge.bSiteId);
      primaryDegree.set(a, (primaryDegree.get(a) ?? 0) + 1);
      primaryDegree.set(b, (primaryDegree.get(b) ?? 0) + 1);
    }
    for (const [siteId, degree] of primaryDegree) {
      if (degree >= 2) transferSites.add(siteId);
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
        cityRouteStrength: primaryRole ? routeStrength : Math.max(0.20, routeStrength * 0.48),
        routeCompositionOrder: primaryRole ? primary.edges.findIndex(candidate => edgeKey(candidate) === edgeKey(edge)) : null,
        cityRoutePrimaryEdgeCount: primary.edges.length,
        intermediateTowerRoute: primaryRole && primary.nodes.length >= 3,
        hangingLateralThroughput: primaryRole && siteGalleryDemand,
      });
      for (const endpoint of [edge.aEndpoint, edge.bEndpoint]) {
        if (!endpoint) continue;
        endpoint.cityRouteId = routeId;
        endpoint.cityRouteRole = edge.cityRouteRole;
        endpoint.hangingLateralThroughput = edge.hangingLateralThroughput;
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
      preferredBandNorm,
      routeStrength,
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
    lateralThroughputSites,
    invariant: 'local exterior crossings compose into multi-building routes; intermediate towers are intentional transfer segments',
  });
}
