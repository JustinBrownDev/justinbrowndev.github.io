export const SPATIAL_TOPOLOGY_SCHEMA = 'jweb.spatial-topology.v1';

const SIDES = Object.freeze(['north', 'east', 'south', 'west']);
const NORMAL = Object.freeze({
    north: Object.freeze({ x: 0, z: -1, ry: 0 }),
    east: Object.freeze({ x: 1, z: 0, ry: -Math.PI * 0.5 }),
    south: Object.freeze({ x: 0, z: 1, ry: Math.PI }),
    west: Object.freeze({ x: -1, z: 0, ry: Math.PI * 0.5 }),
});

function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }
function pushUnique(array, value) { if (value && !array.includes(value)) array.push(value); }

function surfaceFromExisting(entity, facade, index) {
    const side = SIDES.includes(facade?.side) ? facade.side : entity?.doorSide ?? 'north';
    const horizontal = side === 'north' || side === 'south';
    const halfX = finite(facade?.halfX, finite(entity?.halfX, 2));
    const halfZ = finite(facade?.halfZ, finite(entity?.halfZ, 2));
    return {
        id: `${entity.id}:surface:facade:${index}`,
        kind: 'facade', entityId: entity.id, moduleKey: facade?.moduleKey ?? null, facadeIndex: index, side,
        x: finite(facade?.x, finite(facade?.cx, finite(entity?.x, 0))),
        z: finite(facade?.z, finite(facade?.cz, finite(entity?.z, 0))),
        normalX: finite(facade?.normalX, NORMAL[side].x),
        normalZ: finite(facade?.normalZ, NORMAL[side].z),
        rotY: finite(facade?.rotY, NORMAL[side].ry),
        half: finite(facade?.half, horizontal ? halfX : halfZ),
        yMin: finite(facade?.yMin, 0),
        yMax: finite(facade?.yMax, Math.max(2.6, finite(entity?.height, finite(entity?.floorH, 3.15)))),
        exposure: facade?.exposure ?? (side === entity?.doorSide ? 'street' : 'exterior'),
        apertureIds: [], connectorIds: [], spaceIds: [],
    };
}

function surfaceFromModule(entity, module, side) {
    const v = NORMAL[side];
    const horizontal = side === 'north' || side === 'south';
    return {
        id: `${entity.id}:surface:${module.key}:${side}`,
        kind: 'facade', entityId: entity.id, moduleKey: module.key, facadeIndex: null, side,
        x: module.cx + v.x * (horizontal ? 0 : module.halfX),
        z: module.cz + v.z * (horizontal ? module.halfZ : 0),
        normalX: v.x, normalZ: v.z, rotY: v.ry,
        half: horizontal ? module.halfX : module.halfZ,
        yMin: 0,
        yMax: Math.max(2.6, finite(module.floors, 1) * finite(entity.floorH, 3.15)),
        exposure: side === entity?.doorSide ? 'street' : 'exterior',
        apertureIds: [], connectorIds: [], spaceIds: [],
    };
}

function compileSurfaces(payload) {
    const result = [];
    for (const entity of payload?.entities ?? []) {
        if (entity.kind !== 'building' && entity.kind !== 'district-landmark') continue;
        if (Array.isArray(entity.facades) && entity.facades.length) {
            entity.facades.forEach((facade, index) => result.push(surfaceFromExisting(entity, facade, index)));
        } else {
            for (const module of entity.footprintModules ?? []) for (const side of SIDES) result.push(surfaceFromModule(entity, module, side));
        }
    }
    return result;
}

function surfaceTangent(surface) {
    return surface.side === 'north' || surface.side === 'south' ? { x: 1, z: 0 } : { x: 0, z: 1 };
}

function surfaceDistance(surface, endpoint) {
    return Math.hypot(surface.x - finite(endpoint?.x), surface.z - finite(endpoint?.z));
}

function bestSurface(surfaces, connector, endpoint) {
    if (!endpoint?.side) return null;
    const entityId = connector?.metadata?.entityId ?? endpoint?.entityId ?? null;
    const moduleKey = connector?.metadata?.moduleKey ?? endpoint?.moduleKey ?? null;
    const ranked = surfaces
        .filter(surface => surface.side === endpoint.side)
        .filter(surface => !entityId || surface.entityId === entityId)
        .filter(surface => !moduleKey || surface.moduleKey === moduleKey)
        .sort((a, b) => surfaceDistance(a, endpoint) - surfaceDistance(b, endpoint) || a.id.localeCompare(b.id));
    if (ranked.length) return ranked[0];
    const fallback = surfaces
        .filter(surface => surface.side === endpoint.side && (!entityId || surface.entityId === entityId))
        .sort((a, b) => surfaceDistance(a, endpoint) - surfaceDistance(b, endpoint) || a.id.localeCompare(b.id));
    return fallback[0] ?? null;
}

function apertureFor(connector, endpoint, surface, index) {
    if (!surface || !endpoint) return null;
    const tangent = surfaceTangent(surface);
    const u = (finite(endpoint.x) - surface.x) * tangent.x + (finite(endpoint.z) - surface.z) * tangent.z;
    const width = Math.max(0.5, finite(endpoint.width, finite(connector?.aperture?.width, 1.2)));
    const yMin = finite(endpoint.y, surface.yMin);
    const height = Math.max(1.2, finite(endpoint.height, finite(connector?.aperture?.height, 2.2)));
    const uMin = clamp(u - width * 0.5, -surface.half, surface.half);
    const uMax = clamp(u + width * 0.5, -surface.half, surface.half);
    if (!(uMax > uMin)) return null;
    return {
        id: `${connector.id}:aperture:${index}`,
        kind: connector.kind === 'door' ? 'entrance' : connector.kind === 'stair' ? 'stair-opening' : connector.kind === 'bridge' ? 'bridge-entry' : 'connector-opening',
        connectorId: connector.id, surfaceId: surface.id, entityId: surface.entityId, moduleKey: surface.moduleKey,
        traversable: connector.kind !== 'window',
        uMin, uMax, vMin: yMin, vMax: yMin + height,
        clearance: (connector.reservations ?? []).map(item => item.id),
        authority: 'semantic-connector',
    };
}

function normalizeSpace(space) {
    return {
        id: space.id, kind: 'space', chunkKey: space.chunkKey ?? null, entityId: space.entityId ?? null,
        moduleKey: space.moduleKey ?? null, moduleKeys: [...(space.moduleKeys ?? (space.moduleKey ? [space.moduleKey] : []))],
        floor: finite(space.floor), yBase: finite(space.yBase),
        floorH: finite(space.floorH, 3.15), bounds: space.bounds ? { ...space.bounds } : null,
        buildingPlanId: space.buildingPlanId ?? null,
        buildingPlanFingerprint: space.buildingPlanFingerprint ?? null,
        role: space.role ?? null,
        spaceType: space.spaceType ?? null,
        semanticProgram: space.semanticProgram ?? space.program ?? null,
        privacy: space.privacy ?? null,
        daylight: space.daylight ?? null,
        centroid: space.centroid ? { ...space.centroid } : null,
        regions: (space.regions ?? []).map(region => ({ ...region })),
        structuralReservationIds: [...(space.structuralReservationIds ?? [])],
        adjacentSpaceIds: [...(space.adjacentSpaceIds ?? [])],
        connectorIds: [...(space.connectorIds ?? [])], instanceIds: [...(space.instanceIds ?? [])], destinationId: space.destinationId ?? null,
        sourceSchema: space.schema ?? space.spacePlanSchema ?? null,
        source: space.source ?? null,
        architecturalAuthority: space.architecturalAuthority ?? (space.buildingPlanId ? 'building-plan' : null),
    };
}

function edge(id, kind, fromId, toId, metadata = null) {
    return { id, kind, fromId, toId, metadata };
}

export function compileSpatialTopologyGraph({ chunk, payload } = {}) {
    if (!chunk || !payload) throw new Error('compileSpatialTopologyGraph requires chunk and payload');
    const surfaces = compileSurfaces(payload);
    const surfaceById = new Map(surfaces.map(item => [item.id, item]));
    const sourceSpaces = payload.semanticTopologySpaces?.length ? payload.semanticTopologySpaces : (payload.semanticSpaces ?? []);
    const spaces = sourceSpaces.map(normalizeSpace);
    const spaceById = new Map(spaces.map(item => [item.id, item]));
    const apertures = [];
    const connectors = [];
    const reservations = [];
    const instances = [];
    const edges = [];
    const reservationOwner = new Map();

    for (const raw of payload.physics?.semanticConnectors ?? []) {
        const connector = {
            id: raw.id, kind: raw.kind, source: raw.source ?? null, visualRole: raw.visualRole ?? null,
            fromSpaceId: raw.fromSpaceId ?? null, toSpaceId: raw.toSpaceId ?? null,
            spaceIds: [...(raw.spaceIds ?? [])], reservationIds: [], apertureIds: [], endpointCount: raw.endpoints?.length ?? 0,
            metadata: raw.metadata ?? null,
        };
        pushUnique(connector.spaceIds, connector.fromSpaceId);
        pushUnique(connector.spaceIds, connector.toSpaceId);
        for (const reservation of raw.reservations ?? []) {
            connector.reservationIds.push(reservation.id);
            reservationOwner.set(reservation.id, raw.id);
        }
        (raw.endpoints ?? []).forEach((endpoint, index) => {
            const surface = bestSurface(surfaces, raw, endpoint);
            const aperture = apertureFor(raw, endpoint, surface, index);
            if (!aperture) return;
            apertures.push(aperture);
            connector.apertureIds.push(aperture.id);
            pushUnique(surface.apertureIds, aperture.id);
            pushUnique(surface.connectorIds, raw.id);
        });
        for (const spaceId of connector.spaceIds) {
            const space = spaceById.get(spaceId);
            if (space) pushUnique(space.connectorIds, connector.id);
        }
        connectors.push(connector);
    }

    for (const raw of payload.physics?.circulationReservations ?? []) {
        reservations.push({
            id: raw.id ?? null, kind: raw.kind ?? 'circulation', connectorId: raw.connectorId ?? raw.metadata?.connectorId ?? reservationOwner.get(raw.id) ?? null,
            source: raw.source ?? null, x: finite(raw.x, null), z: finite(raw.z, null), halfX: finite(raw.halfX, null), halfZ: finite(raw.halfZ, null),
            yMin: finite(raw.yMin), yMax: finite(raw.yMax), axis: raw.axis ?? null, from: finite(raw.from, null), to: finite(raw.to, null), fixedCoord: finite(raw.fixedCoord, null),
        });
    }

    for (const placement of payload.semanticPlacements ?? []) {
        const instance = {
            id: placement.instanceId, kind: 'instance', assetId: placement.assetId ?? null, entityId: placement.entityId ?? null,
            spaceId: placement.spaceId ?? null, moduleKey: placement.moduleKey ?? null, floor: finite(placement.floor),
            x: finite(placement.x), y: finite(placement.y), z: finite(placement.z), rotY: finite(placement.rotY),
            relationTo: placement.relationTo ?? null,
        };
        instances.push(instance);
        const space = spaceById.get(instance.spaceId);
        if (space) pushUnique(space.instanceIds, instance.id);
    }

    for (const space of spaces) {
        if (space.entityId) edges.push(edge(`edge:entity-space:${space.entityId}:${space.id}`, 'contains-space', space.entityId, space.id));
    }
    // Planned adjacency is semantic truth, not something to rediscover by testing
    // already-rendered wall boxes.  Publish one undirected graph relationship per
    // authored room pair while retaining connector ownership separately below.
    const plannedAdjacencyPairs = new Set();
    for (const space of spaces) {
        for (const adjacentId of space.adjacentSpaceIds ?? []) {
            if (!spaceById.has(adjacentId) || adjacentId === space.id) continue;
            const pair = [space.id, adjacentId].sort();
            const pairId = pair.join('|');
            if (plannedAdjacencyPairs.has(pairId)) continue;
            plannedAdjacencyPairs.add(pairId);
            edges.push(edge(`edge:space-adjacency:${pair[0]}:${pair[1]}`, 'adjacent-space', pair[0], pair[1], {
                authority: 'building-plan',
            }));
        }
    }
    for (const surface of surfaces) {
        edges.push(edge(`edge:entity-surface:${surface.entityId}:${surface.id}`, 'has-surface', surface.entityId, surface.id));
        for (const space of spaces) {
            if (space.entityId === surface.entityId && (!surface.moduleKey || space.moduleKey === surface.moduleKey)) pushUnique(surface.spaceIds, space.id);
        }
    }
    for (const aperture of apertures) {
        edges.push(edge(`edge:surface-aperture:${aperture.surfaceId}:${aperture.id}`, 'has-aperture', aperture.surfaceId, aperture.id));
        edges.push(edge(`edge:connector-aperture:${aperture.connectorId}:${aperture.id}`, 'owns-aperture', aperture.connectorId, aperture.id));
    }
    for (const connector of connectors) {
        for (const spaceId of connector.spaceIds) edges.push(edge(`edge:connector-space:${connector.id}:${spaceId}`, 'connects-space', connector.id, spaceId));
        for (const reservationId of connector.reservationIds) edges.push(edge(`edge:connector-reservation:${connector.id}:${reservationId}`, 'owns-reservation', connector.id, reservationId));
    }
    for (const instance of instances) {
        if (instance.spaceId) edges.push(edge(`edge:space-instance:${instance.spaceId}:${instance.id}`, 'contains-instance', instance.spaceId, instance.id));
    }

    const apertureByConnector = new Map();
    for (const aperture of apertures) {
        const list = apertureByConnector.get(aperture.connectorId) ?? [];
        list.push(aperture);
        apertureByConnector.set(aperture.connectorId, list);
    }
    let unboundEntranceFaces = 0;
    for (const entity of payload.entities ?? []) {
        for (const face of entity.entranceFaces ?? []) {
            const matched = apertures.some(aperture => aperture.entityId === entity.id
                && aperture.moduleKey === face.moduleKey
                && surfaceById.get(aperture.surfaceId)?.side === face.side);
            if (!matched) unboundEntranceFaces++;
        }
    }

    const orphanReservations = reservations.filter(item => !item.connectorId).length;
    const orphanApertures = apertures.filter(item => !item.connectorId).length;
    const danglingConnectorSpaces = connectors.reduce((count, connector) => count + connector.spaceIds.filter(id => !spaceById.has(id)).length, 0);
    const graph = {
        schema: SPATIAL_TOPOLOGY_SCHEMA,
        ownerId: payload.ownerId ?? null,
        chunkKey: chunk.key,
        spaces, surfaces, apertures, connectors, reservations, instances, edges,
        stats: {
            spaces: spaces.length, surfaces: surfaces.length, apertures: apertures.length, connectors: connectors.length,
            reservations: reservations.length, instances: instances.length, edges: edges.length,
            orphanReservations, orphanApertures, unboundEntranceFaces, danglingConnectorSpaces,
        },
    };
    payload.spatialTopology = graph;
    for (const entity of payload.entities ?? []) entity.spatialTopologyId = entity.id;
    for (const space of payload.semanticSpaces ?? []) space.spatialTopologyId = space.id;
    for (const placement of payload.semanticPlacements ?? []) placement.spatialTopologyId = placement.instanceId;
    return graph;
}

export function assertSpatialTopologyGraph(graph, { requireEntranceAuthority = true } = {}) {
    if (!graph || graph.schema !== SPATIAL_TOPOLOGY_SCHEMA) throw new Error('invalid spatial topology graph');
    if (graph.stats.orphanReservations) throw new Error(`spatial topology has ${graph.stats.orphanReservations} orphan reservations`);
    if (graph.stats.orphanApertures) throw new Error(`spatial topology has ${graph.stats.orphanApertures} orphan apertures`);
    if (requireEntranceAuthority && graph.stats.unboundEntranceFaces) throw new Error(`spatial topology has ${graph.stats.unboundEntranceFaces} unbound entrance faces`);
    return true;
}
