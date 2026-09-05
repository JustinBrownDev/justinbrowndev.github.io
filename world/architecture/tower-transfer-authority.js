import { CIRCULATION_CLASS, TRAVERSAL_PERMISSION } from '../sectional-circulation.js';

export const TOWER_TRANSFER_AUTHORITY_SCHEMA = 'jweb.tower-transfer-authority.v1';

function finite(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sideVector(side) {
  if (side === 'north') return { dc: 0, dr: -1 };
  if (side === 'south') return { dc: 0, dr: 1 };
  if (side === 'west') return { dc: -1, dr: 0 };
  return { dc: 1, dr: 0 };
}

export function cityExchangeAnchorsForPortals(portals = [], { siteId = null, field = 'ground' } = {}) {
  return Object.freeze((portals ?? [])
    .filter(portal => portal?.resolved === true && finite(portal.x) !== null && finite(portal.z) !== null)
    .map((portal, index) => {
      const floor = finite(portal.globalFloor) ?? finite(portal.floor);
      if (floor === null) throw new Error(`${portal.id ?? `portal-${index}`}: resolved city exchange lacks Building Plan floor`);
      const dir = sideVector(portal.side);
      return Object.freeze({
        id: `${portal.id}:building-plan-anchor`,
        kind: 'city-exchange',
        endpointId: portal.id,
        bridgeId: portal.bridgeId ?? null,
        siteId,
        field,
        x: Number(portal.x),
        z: Number(portal.z),
        side: portal.side ?? null,
        dc: dir.dc,
        dr: dir.dr,
        floor: Math.max(0, Math.floor(floor)),
        connectorId: portal.bridgeId ? `${portal.bridgeId}:connector` : null,
        routeCharacter: portal.routeCharacter ?? 'TOWER_TRANSFER',
        traversalPermission: portal.traversalPermission ?? TRAVERSAL_PERMISSION.PUBLIC_THROUGH,
        circulationClass: CIRCULATION_CLASS.EXCHANGE,
        authority: TOWER_TRANSFER_AUTHORITY_SCHEMA,
      });
    }));
}

function transferBindings(plan) {
  const bindings = [];
  for (const floor of plan?.floors ?? []) {
    for (const binding of floor.cityExchangeBindings ?? []) {
      if (!binding?.endpointId || !binding?.spaceId) continue;
      bindings.push({ ...binding, floor: floor.floor });
    }
  }
  return bindings;
}

function allowedThroughSpace(space) {
  if (!space) return false;
  if (space.traversalPermission === TRAVERSAL_PERMISSION.NO_THROUGH
      || space.traversalPermission === TRAVERSAL_PERMISSION.PRIVATE_DESTINATION_ONLY
      || space.traversalPermission === TRAVERSAL_PERMISSION.SECURE) return false;
  return ['circulation', 'entry', 'public', 'shared'].includes(space.role)
    || space.traversalPermission === TRAVERSAL_PERMISSION.PUBLIC_THROUGH;
}

function circulationGraph(plan) {
  const spaces = new Map((plan?.topologySpaces ?? []).map(space => [space.id, space]));
  const edges = new Map([...spaces.keys()].map(id => [id, []]));
  const link = (a, b, kind) => {
    if (!spaces.has(a) || !spaces.has(b) || a === b) return;
    edges.get(a)?.push({ to: b, kind });
    edges.get(b)?.push({ to: a, kind });
  };
  for (const floor of plan?.floors ?? []) {
    const byKey = new Map((floor.spaces ?? []).map(space => [space.key, space.id]));
    for (const edge of floor.edges ?? []) {
      const a = byKey.get(edge.a), b = byKey.get(edge.b);
      if (a && b) link(a, b, 'interior-door');
    }
  }
  const coreIds = plan?.verticalCore?.floorSpaceIds ?? [];
  for (let i = 1; i < coreIds.length; i++) link(coreIds[i - 1], coreIds[i], 'vertical-core');
  return { spaces, edges };
}

function findPublicPath(graph, from, to) {
  if (from === to) return { spaces: [from], edgeKinds: [] };
  const queue = [from];
  const parent = new Map([[from, null]]);
  const parentEdge = new Map();
  while (queue.length) {
    const current = queue.shift();
    for (const edge of graph.edges.get(current) ?? []) {
      if (parent.has(edge.to)) continue;
      if (!allowedThroughSpace(graph.spaces.get(edge.to))) continue;
      parent.set(edge.to, current);
      parentEdge.set(edge.to, edge.kind);
      if (edge.to === to) {
        const spaces = [to];
        const edgeKinds = [];
        let cursor = to;
        while (parent.get(cursor)) {
          edgeKinds.push(parentEdge.get(cursor));
          cursor = parent.get(cursor);
          spaces.push(cursor);
        }
        spaces.reverse(); edgeKinds.reverse();
        return { spaces, edgeKinds };
      }
      queue.push(edge.to);
    }
  }
  return null;
}

export function applyTowerTransferAuthority(plan, { demands = [], portals = [] } = {}) {
  const requested = [...(demands ?? [])];
  const bindings = transferBindings(plan);
  const bindingByEndpoint = new Map(bindings.map(binding => [String(binding.endpointId), binding]));
  const resolvedPortals = (portals ?? []).filter(portal => portal?.resolved === true && portal?.id);
  const portalIds = new Set(resolvedPortals.map(portal => String(portal.id)));

  // A single skybridge endpoint is already a city/exterior exchange even when
  // there is no second endpoint on this tower to form a transfer-demand pair.
  // Fail closed here too: every accepted facade portal must terminate in the
  // Building Plan's PUBLIC_THROUGH spine, and no such binding may be orphaned.
  for (const portal of resolvedPortals) {
    if (!bindingByEndpoint.has(String(portal.id))) {
      const error = new Error(`${portal.id}: resolved exterior exchange lacks an authoritative Building Plan binding`);
      error.code = 'JWEB_TOWER_TRANSFER_PORTAL_UNBOUND';
      throw error;
    }
  }
  for (const binding of bindings) {
    if (portalIds.size && binding.endpointId && !portalIds.has(String(binding.endpointId))) {
      const error = new Error(`${binding.endpointId}: Building Plan transfer binding has no resolved exterior exchange portal`);
      error.code = 'JWEB_TOWER_TRANSFER_ORPHAN_BINDING';
      throw error;
    }
  }

  if (!requested.length) {
    const authority = Object.freeze({
      schema: TOWER_TRANSFER_AUTHORITY_SCHEMA,
      bindings: Object.freeze(bindings.map(binding => Object.freeze({ ...binding }))),
      routes: Object.freeze([]), requested: 0, realized: 0, failed: 0,
      persistentVerticalCoreId: plan?.verticalCore?.id ?? null,
      verificationAuthority: 'building-plan+compileWorldCirculationGraph',
      invariant: 'every city exchange binds to a public interior transfer spine even when no cross-tower transfer pair is requested',
    });
    plan.cityTransferAuthority = authority;
    if (plan.inspection) plan.inspection.cityTransfers = { requested: 0, realized: 0, routeIds: [] };
    plan.diagnostics = {
      ...plan.diagnostics,
      cityTransferRequested: 0,
      cityTransferRealized: 0,
      cityTransferAuthorityReady: true,
      cityExchangeBindingCount: bindings.length,
    };
    return authority;
  }

  const graph = circulationGraph(plan);
  const routes = [];
  for (const demand of requested) {
    const from = bindingByEndpoint.get(String(demand.fromEndpointId));
    const to = bindingByEndpoint.get(String(demand.toEndpointId));
    if (!from || !to) {
      const error = new Error(`${demand.id}: city transfer endpoint lacks an authoritative Building Plan exchange binding`);
      error.code = 'JWEB_TOWER_TRANSFER_BINDING_MISSING';
      throw error;
    }
    if (!allowedThroughSpace(graph.spaces.get(from.spaceId)) || !allowedThroughSpace(graph.spaces.get(to.spaceId))) {
      const error = new Error(`${demand.id}: city transfer endpoint landed in a non-through space`);
      error.code = 'JWEB_TOWER_TRANSFER_PRIVATE_ROUTE';
      throw error;
    }
    const path = findPublicPath(graph, from.spaceId, to.spaceId);
    if (!path) {
      const error = new Error(`${demand.id}: Building Plan cannot realize a public through-route between requested exchanges`);
      error.code = 'JWEB_TOWER_TRANSFER_UNREALIZED';
      throw error;
    }
    const verticalTransfers = path.edgeKinds.filter(kind => kind === 'vertical-core').length;
    if (demand.requiresVerticalTransfer && verticalTransfers < 1) {
      const error = new Error(`${demand.id}: requested vertical transfer does not traverse the persistent vertical core`);
      error.code = 'JWEB_TOWER_TRANSFER_VERTICAL_CORE_MISSING';
      throw error;
    }
    routes.push(Object.freeze({
      id: `${demand.id}:realized`,
      demandId: demand.id,
      fromEndpointId: demand.fromEndpointId,
      toEndpointId: demand.toEndpointId,
      fromSpaceId: from.spaceId,
      toSpaceId: to.spaceId,
      fromFloor: from.floor,
      toFloor: to.floor,
      spacePath: Object.freeze([...path.spaces]),
      edgeKinds: Object.freeze([...path.edgeKinds]),
      verticalTransfers,
      circulationClass: CIRCULATION_CLASS.INTERIOR,
      traversalPermission: TRAVERSAL_PERMISSION.PUBLIC_THROUGH,
      routeCharacter: demand.routeCharacter,
      physicalRouteAuthority: 'building-plan-preclaimed-transfer-spine',
      verificationAuthority: demand.verificationAuthority ?? 'compileWorldCirculationGraph',
    }));
  }

  const authority = Object.freeze({
    schema: TOWER_TRANSFER_AUTHORITY_SCHEMA,
    bindings: Object.freeze(bindings.map(binding => Object.freeze({ ...binding }))),
    routes: Object.freeze(routes),
    requested: requested.length,
    realized: routes.length,
    failed: 0,
    persistentVerticalCoreId: plan?.verticalCore?.id ?? null,
    verificationAuthority: 'building-plan+compileWorldCirculationGraph',
    invariant: 'every accepted city transfer binds exterior exchange -> public interior spine -> persistent core as required -> public interior spine -> exterior exchange',
  });
  plan.cityTransferAuthority = authority;
  if (plan.inspection) {
    plan.inspection.cityTransfers = {
      requested: authority.requested,
      realized: authority.realized,
      routeIds: authority.routes.map(route => route.id),
    };
  }
  plan.diagnostics = {
    ...plan.diagnostics,
    cityTransferRequested: requested.length,
    cityTransferRealized: routes.length,
    cityTransferAuthorityReady: routes.length === requested.length,
    cityExchangeBindingCount: bindings.length,
  };
  return authority;
}
