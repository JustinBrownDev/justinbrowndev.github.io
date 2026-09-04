export const WORLD_CIRCULATION_SCHEMA = 'jweb.world-circulation.v1';

function text(value) { return String(value ?? ''); }
function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}
function sortedUnique(values) {
    return [...new Set(values.filter(Boolean).map(text))].sort((a, b) => a.localeCompare(b));
}

function addUndirected(adjacency, edgeByPair, a, b, metadata) {
    a = text(a); b = text(b);
    if (!a || !b || a === b || !adjacency.has(a) || !adjacency.has(b)) return;
    const pair = a < b ? `${a}\u001f${b}` : `${b}\u001f${a}`;
    if (!edgeByPair.has(pair)) edgeByPair.set(pair, { a: a < b ? a : b, b: a < b ? b : a, links: [] });
    const record = edgeByPair.get(pair);
    const identity = `${metadata.kind ?? 'circulation'}:${metadata.id ?? ''}`;
    if (!record.links.some(link => `${link.kind}:${link.id ?? ''}` === identity)) record.links.push({ ...metadata });
    adjacency.get(a).add(b);
    adjacency.get(b).add(a);
}

function connectorPairs(connector, spaceById) {
    const ids = sortedUnique(connector?.spaceIds ?? []).filter(id => spaceById.has(id));
    if (ids.length < 2) return [];
    if (ids.length === 2) return [[ids[0], ids[1]]];
    const ordered = [...ids].sort((a, b) => {
        const as = spaceById.get(a), bs = spaceById.get(b);
        return finite(as?.floor) - finite(bs?.floor)
            || finite(as?.yBase) - finite(bs?.yBase)
            || a.localeCompare(b);
    });
    const result = [];
    for (let i = 1; i < ordered.length; i++) result.push([ordered[i - 1], ordered[i]]);
    return result;
}

function explicitExitPortals(portals, spaceById) {
    const exits = [];
    for (const portal of portals ?? []) {
        if (portal?.traversal?.traversable === false || String(portal?.connectorType ?? '').toLowerCase() !== 'door') continue;
        const linked = sortedUnique(portal.linkedSpaceIds ?? []);
        const internal = linked.filter(id => spaceById.has(id));
        const external = linked.filter(id => !spaceById.has(id));
        // A real exterior entrance connects an authored space to a non-space world
        // target such as "chunk:street". Interior doors have two authored spaces
        // and therefore never become egress roots merely because they have a side.
        if (!internal.length || !external.length) continue;
        for (const spaceId of internal) exits.push({
            id: `${portal.id}:exit:${spaceId}`,
            portalId: String(portal.id),
            spaceId,
            externalTargetIds: external,
            buildingIds: sortedUnique(portal.buildingIds?.length ? portal.buildingIds : [spaceById.get(spaceId)?.entityId]),
            family: portal.family ?? null,
            role: portal.traversal?.role ?? null,
        });
    }
    exits.sort((a, b) => a.spaceId.localeCompare(b.spaceId) || a.portalId.localeCompare(b.portalId));
    return exits;
}

function components(adjacency) {
    const componentBySpace = new Map();
    const members = [];
    for (const start of [...adjacency.keys()].sort((a, b) => a.localeCompare(b))) {
        if (componentBySpace.has(start)) continue;
        const id = `component:${members.length}`;
        const queue = [start];
        const list = [];
        componentBySpace.set(start, id);
        for (let qi = 0; qi < queue.length; qi++) {
            const current = queue[qi];
            list.push(current);
            for (const next of [...adjacency.get(current)].sort((a, b) => a.localeCompare(b))) {
                if (componentBySpace.has(next)) continue;
                componentBySpace.set(next, id);
                queue.push(next);
            }
        }
        members.push({ id, spaceIds: list.sort((a, b) => a.localeCompare(b)) });
    }
    return { componentBySpace, members };
}

export function compileWorldCirculationGraph(spatialTopology = {}) {
    const spaces = spatialTopology.spaces ?? [];
    const spaceById = new Map(spaces.filter(space => space?.id).map(space => [text(space.id), space]));
    const adjacency = new Map([...spaceById.keys()].map(id => [id, new Set()]));
    const edgeByPair = new Map();

    for (const edge of spatialTopology.edges ?? []) {
        if (edge?.kind !== 'adjacent-space') continue;
        addUndirected(adjacency, edgeByPair, edge.fromId, edge.toId, {
            kind: 'planned-adjacency', id: edge.id ?? null, authority: edge.metadata?.authority ?? 'building-plan',
        });
    }
    for (const connector of spatialTopology.connectors ?? []) {
        for (const [a, b] of connectorPairs(connector, spaceById)) addUndirected(adjacency, edgeByPair, a, b, {
            kind: connector.kind ?? 'connector', id: connector.id ?? null, authority: 'semantic-connector', source: connector.source ?? null,
        });
    }

    const exits = explicitExitPortals(spatialTopology.portals ?? [], spaceById);
    const route = new Map();
    const queue = [];
    for (const exit of exits) {
        const existing = route.get(exit.spaceId);
        if (existing && existing.exitPortalId.localeCompare(exit.portalId) <= 0) continue;
        route.set(exit.spaceId, {
            spaceId: exit.spaceId,
            distanceToExit: 0,
            nextSpaceId: null,
            via: null,
            exitPortalId: exit.portalId,
            externalTargetIds: [...exit.externalTargetIds],
        });
    }
    queue.push(...[...route.keys()].sort((a, b) => a.localeCompare(b)));
    for (let qi = 0; qi < queue.length; qi++) {
        const current = queue[qi];
        const currentRoute = route.get(current);
        for (const neighbor of [...adjacency.get(current)].sort((a, b) => a.localeCompare(b))) {
            if (route.has(neighbor)) continue;
            const pair = current < neighbor ? `${current}\u001f${neighbor}` : `${neighbor}\u001f${current}`;
            const physical = edgeByPair.get(pair)?.links?.[0] ?? null;
            route.set(neighbor, {
                spaceId: neighbor,
                distanceToExit: currentRoute.distanceToExit + 1,
                nextSpaceId: current,
                via: physical ? { ...physical } : null,
                exitPortalId: currentRoute.exitPortalId,
                externalTargetIds: [...currentRoute.externalTargetIds],
            });
            queue.push(neighbor);
        }
    }

    const { componentBySpace, members: componentList } = components(adjacency);
    const entities = new Map();
    for (const space of spaces) {
        const entityId = text(space?.entityId || 'unbound');
        if (!entities.has(entityId)) entities.set(entityId, []);
        entities.get(entityId).push(text(space.id));
    }
    const exitsByBuilding = new Map();
    for (const exit of exits) {
        for (const buildingId of exit.buildingIds.length ? exit.buildingIds : [text(spaceById.get(exit.spaceId)?.entityId || 'unbound')]) {
            if (!exitsByBuilding.has(buildingId)) exitsByBuilding.set(buildingId, []);
            exitsByBuilding.get(buildingId).push(exit);
        }
    }

    const buildings = [...entities.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([entityId, ids]) => {
        ids.sort((a, b) => a.localeCompare(b));
        const buildingExits = exitsByBuilding.get(entityId) ?? [];
        const reachable = ids.filter(id => route.has(id));
        const disconnected = buildingExits.length ? ids.filter(id => !route.has(id)) : [];
        const maxHops = reachable.reduce((max, id) => Math.max(max, route.get(id)?.distanceToExit ?? 0), 0);
        return {
            entityId,
            spaceIds: ids,
            exitPortalIds: sortedUnique(buildingExits.map(exit => exit.portalId)),
            explicitEgress: buildingExits.length > 0,
            reachableSpaceCount: reachable.length,
            disconnectedSpaceIds: disconnected,
            maxHopsToExit: maxHops,
            componentIds: sortedUnique(ids.map(id => componentBySpace.get(id))),
        };
    });

    const routes = Object.fromEntries([...route.entries()].sort((a, b) => a[0].localeCompare(b[0])));
    const edgeRecords = [...edgeByPair.values()].sort((a, b) => a.a.localeCompare(b.a) || a.b.localeCompare(b.b));
    const explicitBuildings = buildings.filter(building => building.explicitEgress);
    const explicitFailures = explicitBuildings.filter(building => building.disconnectedSpaceIds.length);
    return {
        schema: WORLD_CIRCULATION_SCHEMA,
        sourceSchema: spatialTopology.schema ?? null,
        chunkKey: spatialTopology.chunkKey ?? null,
        nodes: [...spaceById.keys()].sort((a, b) => a.localeCompare(b)).map(id => ({
            spaceId: id,
            entityId: spaceById.get(id)?.entityId ?? null,
            floor: finite(spaceById.get(id)?.floor),
            degree: adjacency.get(id).size,
            componentId: componentBySpace.get(id) ?? null,
            route: routes[id] ?? null,
        })),
        edges: edgeRecords,
        exits,
        routes,
        components: componentList,
        buildings,
        stats: {
            spaces: spaceById.size,
            circulationEdges: edgeRecords.length,
            components: componentList.length,
            explicitExitPortals: sortedUnique(exits.map(exit => exit.portalId)).length,
            explicitEgressBuildings: explicitBuildings.length,
            explicitEgressFailures: explicitFailures.length,
            reachableSpaces: route.size,
            unreachableSpaces: Math.max(0, spaceById.size - route.size),
            maxHopsToExit: buildings.reduce((max, building) => Math.max(max, building.maxHopsToExit), 0),
        },
    };
}

export function circulationRouteForSpace(graph, spaceId) {
    if (!graph || graph.schema !== WORLD_CIRCULATION_SCHEMA) throw new Error('invalid world circulation graph');
    const start = text(spaceId);
    const result = [];
    const seen = new Set();
    let current = graph.routes?.[start] ?? null;
    while (current) {
        if (seen.has(current.spaceId)) throw new Error(`circulation route cycle at ${current.spaceId}`);
        seen.add(current.spaceId);
        result.push({ ...current });
        current = current.nextSpaceId ? graph.routes?.[current.nextSpaceId] ?? null : null;
    }
    return result;
}

export function assertWorldCirculationGraph(graph, { requireExplicitEgress = false } = {}) {
    if (!graph || graph.schema !== WORLD_CIRCULATION_SCHEMA) throw new Error('invalid world circulation graph');
    const nodeIds = new Set((graph.nodes ?? []).map(node => node.spaceId));
    for (const [spaceId, route] of Object.entries(graph.routes ?? {})) {
        if (!nodeIds.has(spaceId)) throw new Error(`circulation route references missing source ${spaceId}`);
        if (route.nextSpaceId && !nodeIds.has(route.nextSpaceId)) throw new Error(`circulation route ${spaceId} points to missing ${route.nextSpaceId}`);
        circulationRouteForSpace(graph, spaceId);
    }
    if (requireExplicitEgress && graph.stats?.explicitEgressFailures) {
        const failed = (graph.buildings ?? []).filter(building => building.explicitEgress && building.disconnectedSpaceIds.length);
        throw new Error(`world circulation has ${failed.length} explicit-egress building failures: ${failed.map(item => item.entityId).join(', ')}`);
    }
    return true;
}
