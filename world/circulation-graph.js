export const WORLD_CIRCULATION_SCHEMA = 'jweb.world-circulation.v1';

// JWEB CIRCULATION BACKLOG:
// TODO(JWEB-CIRCULATION-SKY-TRUNK): Add a thick, blocky, high-capacity sky-route
//   arterial/catwalk class. Smaller catwalks, stairs, ladders and traversals branch
//   from it; graph capacity/route class should be authoritative before geometry.
// TODO(JWEB-CIRCULATION-ROOF-HOPS): Make roof-to-roof traversal systematic.
//   Publish legal parapet jump/crossover edges and shape eligible parapets to be
//   jumpable. Never infer traversability from visual proximity alone.
// TODO(JWEB-CIRCULATION-PRIORITY): Once unified circulation readiness is stable,
//   schedule it after structural liveness and before ordinary visible refinement.

function text(value) { return String(value ?? ''); }
function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}
function sortedUnique(values) {
    return [...new Set((values ?? []).filter(Boolean).map(text))].sort((a, b) => a.localeCompare(b));
}
function pairKey(a, b) { return a < b ? `${a}\u001f${b}` : `${b}\u001f${a}`; }

function addNode(adjacency, nodeById, id, node) {
    id = text(id);
    if (!id) return null;
    if (!nodeById.has(id)) nodeById.set(id, { id, ...node });
    if (!adjacency.has(id)) adjacency.set(id, new Set());
    return id;
}

function addUndirected(adjacency, edgeByPair, a, b, metadata) {
    a = text(a); b = text(b);
    if (!a || !b || a === b || !adjacency.has(a) || !adjacency.has(b)) return false;
    const pair = pairKey(a, b);
    if (!edgeByPair.has(pair)) edgeByPair.set(pair, { a: a < b ? a : b, b: a < b ? b : a, links: [] });
    const record = edgeByPair.get(pair);
    const identity = `${metadata.kind ?? 'circulation'}:${metadata.id ?? ''}`;
    if (!record.links.some(link => `${link.kind}:${link.id ?? ''}` === identity)) record.links.push({ ...metadata });
    adjacency.get(a).add(b);
    adjacency.get(b).add(a);
    return true;
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

function portalWorldLinks(portal, spaceById) {
    if (portal?.traversal?.traversable === false) return [];
    const linked = sortedUnique(portal?.linkedSpaceIds ?? []);
    const internal = linked.filter(id => spaceById.has(id));
    const external = linked.filter(id => !spaceById.has(id));
    if (!internal.length || !external.length) return [];
    const links = [];
    for (const spaceId of internal) for (const worldId of external) links.push([spaceId, worldId]);
    return links;
}

function explicitExitPortals(portals, spaceById) {
    const exits = [];
    for (const portal of portals ?? []) {
        if (portal?.traversal?.traversable === false || String(portal?.connectorType ?? '').toLowerCase() !== 'door') continue;
        const linked = sortedUnique(portal.linkedSpaceIds ?? []);
        const internal = linked.filter(id => spaceById.has(id));
        const external = linked.filter(id => !spaceById.has(id));
        // Explicit building egress remains door-specific. The unified world graph
        // may also contain bridges/ladders to world targets, but an exterior door
        // is still the compatibility signal for "this building has an entrance".
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

function components(adjacency, nodeById) {
    const componentByNode = new Map();
    const members = [];
    for (const start of [...adjacency.keys()].sort((a, b) => a.localeCompare(b))) {
        if (componentByNode.has(start)) continue;
        const id = `component:${members.length}`;
        const queue = [start];
        const nodeIds = [];
        componentByNode.set(start, id);
        for (let qi = 0; qi < queue.length; qi++) {
            const current = queue[qi];
            nodeIds.push(current);
            for (const next of [...adjacency.get(current)].sort((a, b) => a.localeCompare(b))) {
                if (componentByNode.has(next)) continue;
                componentByNode.set(next, id);
                queue.push(next);
            }
        }
        nodeIds.sort((a, b) => a.localeCompare(b));
        members.push({
            id,
            nodeIds,
            spaceIds: nodeIds.filter(nodeId => nodeById.get(nodeId)?.kind === 'space'),
            worldNodeIds: nodeIds.filter(nodeId => nodeById.get(nodeId)?.kind === 'world'),
        });
    }
    return { componentByNode, members };
}

function physicalLinkFor(edgeByPair, a, b) {
    const links = edgeByPair.get(pairKey(a, b))?.links ?? [];
    return links.find(link => link.kind === 'portal') ?? links[0] ?? null;
}

export function compileWorldCirculationGraph(spatialTopology = {}) {
    const spaces = spatialTopology.spaces ?? [];
    const spaceById = new Map(spaces.filter(space => space?.id).map(space => [text(space.id), space]));
    const nodeById = new Map();
    const adjacency = new Map();
    for (const [id, space] of spaceById) addNode(adjacency, nodeById, id, {
        kind: 'space', entityId: space?.entityId ?? null, layer: space?.layer ?? 'ground',
    });
    const edgeByPair = new Map();

    // Planned adjacency is architectural intent only. It may drive door/hall
    // generation, but it MUST NOT prove that a human can move between spaces.
    const plannedAdjacencies = (spatialTopology.edges ?? []).filter(edge => edge?.kind === 'adjacent-space');

    let physicalConnectorEdges = 0;
    let crossLayerEdges = 0;
    for (const connector of spatialTopology.connectors ?? []) {
        for (const [a, b] of connectorPairs(connector, spaceById)) {
            const added = addUndirected(adjacency, edgeByPair, a, b, {
                kind: connector.kind ?? 'connector', id: connector.id ?? null,
                authority: 'semantic-connector', source: connector.source ?? null,
            });
            if (!added) continue;
            physicalConnectorEdges++;
            if ((spaceById.get(a)?.layer ?? 'ground') !== (spaceById.get(b)?.layer ?? 'ground')) crossLayerEdges++;
        }
    }

    let portalEdges = 0;
    for (const portal of spatialTopology.portals ?? []) {
        for (const [spaceId, worldId] of portalWorldLinks(portal, spaceById)) {
            addNode(adjacency, nodeById, worldId, { kind: 'world', layer: 'world', external: true });
            const added = addUndirected(adjacency, edgeByPair, spaceId, worldId, {
                kind: 'portal', id: portal.id ?? null, portalId: portal.id ?? null,
                connectorType: portal.connectorType ?? null, family: portal.family ?? null,
                role: portal.traversal?.role ?? null, authority: 'access-portal',
            });
            if (added) portalEdges++;
        }
    }

    // Routes are rooted in actual world nodes, not merely in a room that happens
    // to have a door. Ground streets, roof/bridge continuations and future peer
    // chunk targets therefore live in the same authority as hanging circulation.
    const route = new Map();
    const queue = [];
    const worldIds = [...nodeById.values()].filter(node => node.kind === 'world').map(node => node.id).sort((a, b) => a.localeCompare(b));
    for (const worldId of worldIds) {
        route.set(worldId, {
            nodeId: worldId, spaceId: null,
            distanceToWorld: 0, distanceToExit: 0,
            nextNodeId: null, nextSpaceId: null, via: null,
            exitPortalId: null, externalTargetIds: [worldId],
        });
        queue.push(worldId);
    }
    for (let qi = 0; qi < queue.length; qi++) {
        const current = queue[qi];
        const currentRoute = route.get(current);
        for (const neighbor of [...(adjacency.get(current) ?? [])].sort((a, b) => a.localeCompare(b))) {
            if (route.has(neighbor)) continue;
            const physical = physicalLinkFor(edgeByPair, current, neighbor);
            const neighborNode = nodeById.get(neighbor);
            const distanceToWorld = currentRoute.distanceToWorld + 1;
            const exitPortalId = currentRoute.exitPortalId ?? (physical?.kind === 'portal' ? text(physical.portalId || physical.id) : null);
            route.set(neighbor, {
                nodeId: neighbor,
                spaceId: neighborNode?.kind === 'space' ? neighbor : null,
                distanceToWorld,
                distanceToExit: neighborNode?.kind === 'space' ? Math.max(0, distanceToWorld - 1) : 0,
                nextNodeId: current,
                nextSpaceId: nodeById.get(current)?.kind === 'space' ? current : null,
                via: physical ? { ...physical } : null,
                exitPortalId,
                externalTargetIds: [...currentRoute.externalTargetIds],
            });
            queue.push(neighbor);
        }
    }

    const { componentByNode, members: componentList } = components(adjacency, nodeById);
    const entities = new Map();
    for (const space of spaces) {
        const entityId = text(space?.entityId || 'unbound');
        if (!entities.has(entityId)) entities.set(entityId, []);
        entities.get(entityId).push(text(space.id));
    }
    const exits = explicitExitPortals(spatialTopology.portals ?? [], spaceById);
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
            componentIds: sortedUnique(ids.map(id => componentByNode.get(id))),
            layers: sortedUnique(ids.map(id => spaceById.get(id)?.layer ?? 'ground')),
        };
    });

    const routes = Object.fromEntries([...route.entries()].sort((a, b) => a[0].localeCompare(b[0])));
    const edgeRecords = [...edgeByPair.values()].sort((a, b) => a.a.localeCompare(b.a) || a.b.localeCompare(b.b));
    const explicitBuildings = buildings.filter(building => building.explicitEgress);
    const explicitFailures = explicitBuildings.filter(building => building.disconnectedSpaceIds.length);
    const reachableSpaces = [...spaceById.keys()].filter(id => route.has(id)).length;
    const nodes = [...nodeById.values()].sort((a, b) => a.id.localeCompare(b.id)).map(node => ({
        ...node,
        spaceId: node.kind === 'space' ? node.id : null,
        floor: node.kind === 'space' ? finite(spaceById.get(node.id)?.floor) : null,
        degree: adjacency.get(node.id)?.size ?? 0,
        componentId: componentByNode.get(node.id) ?? null,
        route: routes[node.id] ?? null,
    }));
    return {
        schema: WORLD_CIRCULATION_SCHEMA,
        authority: 'physical-connectors-and-access-portals',
        unifiedLayers: true,
        sourceSchema: spatialTopology.schema ?? null,
        chunkKey: spatialTopology.chunkKey ?? null,
        nodes,
        edges: edgeRecords,
        exits,
        routes,
        components: componentList,
        buildings,
        diagnostics: {
            plannedAdjacencies: plannedAdjacencies.map(edge => ({
                id: edge.id ?? null, fromId: edge.fromId ?? null, toId: edge.toId ?? null,
                authority: edge.metadata?.authority ?? 'building-plan',
            })),
        },
        stats: {
            spaces: spaceById.size,
            worldNodes: worldIds.length,
            circulationNodes: nodeById.size,
            circulationEdges: edgeRecords.length,
            physicalConnectorEdges,
            portalEdges,
            plannedAdjacencies: plannedAdjacencies.length,
            crossLayerEdges,
            components: componentList.length,
            explicitExitPortals: sortedUnique(exits.map(exit => exit.portalId)).length,
            explicitEgressBuildings: explicitBuildings.length,
            explicitEgressFailures: explicitFailures.length,
            reachableSpaces,
            unreachableSpaces: Math.max(0, spaceById.size - reachableSpaces),
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
        const nodeId = text(current.nodeId ?? current.spaceId);
        if (!nodeId) break;
        if (seen.has(nodeId)) throw new Error(`circulation route cycle at ${nodeId}`);
        seen.add(nodeId);
        result.push({ ...current });
        const nextId = current.nextNodeId ?? current.nextSpaceId;
        current = nextId ? graph.routes?.[nextId] ?? null : null;
    }
    return result;
}

export function assertWorldCirculationGraph(graph, { requireExplicitEgress = false } = {}) {
    if (!graph || graph.schema !== WORLD_CIRCULATION_SCHEMA) throw new Error('invalid world circulation graph');
    const nodeIds = new Set((graph.nodes ?? []).map(node => text(node.id ?? node.spaceId)).filter(Boolean));
    for (const [nodeId, route] of Object.entries(graph.routes ?? {})) {
        if (!nodeIds.has(nodeId)) throw new Error(`circulation route references missing source ${nodeId}`);
        const nextId = route.nextNodeId ?? route.nextSpaceId;
        if (nextId && !nodeIds.has(nextId)) throw new Error(`circulation route ${nodeId} points to missing ${nextId}`);
        if (route.spaceId) circulationRouteForSpace(graph, route.spaceId);
    }
    for (const edge of graph.edges ?? []) {
        for (const link of edge.links ?? []) {
            if (link.kind === 'planned-adjacency') throw new Error('planned adjacency leaked into traversable circulation edges');
        }
    }
    if (requireExplicitEgress && graph.stats?.explicitEgressFailures) {
        const failed = (graph.buildings ?? []).filter(building => building.explicitEgress && building.disconnectedSpaceIds.length);
        throw new Error(`world circulation has ${failed.length} explicit-egress building failures: ${failed.map(item => item.entityId).join(', ')}`);
    }
    return true;
}
