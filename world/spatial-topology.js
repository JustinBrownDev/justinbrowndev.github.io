import {
    compileAccessPortals,
    portalApertureForSurface,
    portalNoClutterRegions,
} from './access-portals.js';
import { assertWorldCirculationGraph, compileWorldCirculationGraph } from './circulation-graph.js';

export const SPATIAL_TOPOLOGY_SCHEMA = 'jweb.spatial-topology.v1';

const SIDES = Object.freeze(['north', 'east', 'south', 'west']);
const NORMAL = Object.freeze({
    north: Object.freeze({ x: 0, z: -1, ry: 0 }),
    east: Object.freeze({ x: 1, z: 0, ry: -Math.PI * 0.5 }),
    south: Object.freeze({ x: 0, z: 1, ry: Math.PI }),
    west: Object.freeze({ x: -1, z: 0, ry: Math.PI * 0.5 }),
});

function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
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
        apertureIds: [], connectorIds: [], portalIds: [], accessNoClutterRegionIds: [], spaceIds: [],
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
        apertureIds: [], connectorIds: [], portalIds: [], accessNoClutterRegionIds: [], spaceIds: [],
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

function surfaceDistance(surface, endpoint) {
    return Math.hypot(surface.x - finite(endpoint?.x), surface.z - finite(endpoint?.z));
}

const TOPOLOGY_JOIN_SEPARATOR = '\u001f';
function topologyJoinKey(...parts) { return parts.map(value => String(value ?? '')).join(TOPOLOGY_JOIN_SEPARATOR); }
function pushIndexed(map, key, value) {
    const list = map.get(key) ?? [];
    list.push(value);
    map.set(key, list);
}

function indexSurfacesForPortalJoin(surfaces) {
    const bySide = new Map();
    const byEntitySide = new Map();
    const byModuleSide = new Map();
    const byEntityModuleSide = new Map();
    for (const surface of surfaces) {
        pushIndexed(bySide, surface.side, surface);
        if (surface.entityId) pushIndexed(byEntitySide, topologyJoinKey(surface.entityId, surface.side), surface);
        if (surface.moduleKey) pushIndexed(byModuleSide, topologyJoinKey(surface.moduleKey, surface.side), surface);
        if (surface.entityId && surface.moduleKey) {
            pushIndexed(byEntityModuleSide, topologyJoinKey(surface.entityId, surface.moduleKey, surface.side), surface);
        }
    }
    return { bySide, byEntitySide, byModuleSide, byEntityModuleSide };
}

function nearestSurface(candidates, endpoint) {
    let best = null;
    let bestDistance = Infinity;
    for (const surface of candidates ?? []) {
        const distance = surfaceDistance(surface, endpoint);
        if (distance < bestDistance || (distance === bestDistance && (!best || surface.id.localeCompare(best.id) < 0))) {
            best = surface;
            bestDistance = distance;
        }
    }
    return best;
}

function bestSurface(surfaceIndex, connector, endpoint) {
    if (!endpoint?.side) return null;
    const entityId = connector?.metadata?.entityId ?? endpoint?.entityId ?? null;
    const moduleKey = connector?.metadata?.moduleKey ?? endpoint?.moduleKey ?? null;
    const exactPool = entityId && moduleKey
        ? surfaceIndex.byEntityModuleSide.get(topologyJoinKey(entityId, moduleKey, endpoint.side))
        : entityId
            ? surfaceIndex.byEntitySide.get(topologyJoinKey(entityId, endpoint.side))
            : moduleKey
                ? surfaceIndex.byModuleSide.get(topologyJoinKey(moduleKey, endpoint.side))
                : surfaceIndex.bySide.get(endpoint.side);
    const exact = nearestSurface(exactPool, endpoint);
    if (exact) return exact;
    const fallbackPool = entityId
        ? surfaceIndex.byEntitySide.get(topologyJoinKey(entityId, endpoint.side))
        : surfaceIndex.bySide.get(endpoint.side);
    return nearestSurface(fallbackPool, endpoint);
}

function normalizeSpace(space, layer = 'ground') {
    return {
        id: space.id, kind: 'space', layer, chunkKey: space.chunkKey ?? null, entityId: space.entityId ?? null,
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

function indexSpacesForSurfaceJoin(spaces) {
    const byEntity = new Map();
    const byEntityModule = new Map();
    for (const space of spaces) {
        if (!space.entityId) continue;
        pushIndexed(byEntity, space.entityId, space);
        if (space.moduleKey) pushIndexed(byEntityModule, topologyJoinKey(space.entityId, space.moduleKey), space);
    }
    return { byEntity, byEntityModule };
}

function spacesForSurface(spaceIndex, surface) {
    if (!surface?.entityId) return [];
    return surface.moduleKey
        ? spaceIndex.byEntityModule.get(topologyJoinKey(surface.entityId, surface.moduleKey)) ?? []
        : spaceIndex.byEntity.get(surface.entityId) ?? [];
}

function accessEndpointNodes(portals) {
    const byId = new Map();
    const add = (portalId, endpoint, role) => {
        if (!endpoint?.id) return;
        byId.set(String(endpoint.id), {
            ...endpoint,
            id: String(endpoint.id),
            kind: endpoint.kind ?? 'access-endpoint',
            portalId,
            role,
        });
    };
    for (const portal of portals) {
        add(portal.id, portal.outsideEndpoint, 'outside');
        add(portal.id, portal.insideEndpoint, 'inside');
        for (const endpoint of portal.endpoints ?? []) add(portal.id, endpoint, 'connector-endpoint');
    }
    return [...byId.values()];
}

export function circulationPayloadScopes(payload) {
    const scopes = [];
    const seen = new Set();
    const visit = (candidate, layer) => {
        if (!candidate || typeof candidate !== 'object' || seen.has(candidate)) return;
        seen.add(candidate);
        scopes.push({ layer, payload: candidate });
        const hanging = candidate?.hangingLayer?.payload;
        if (hanging) visit(hanging, layer === 'ground' ? 'hanging' : `${layer}:hanging`);
    };
    visit(payload, 'ground');
    return scopes;
}

export function compileSpatialTopologyGraph({ chunk, payload } = {}) {
    if (!chunk || !payload) throw new Error('compileSpatialTopologyGraph requires chunk and payload');
    const scopes = circulationPayloadScopes(payload);
    const entityById = new Map();
    let duplicateEntityIds = 0;
    for (const scope of scopes) for (const entity of scope.payload.entities ?? []) {
        const id = String(entity?.id ?? '');
        if (!id) continue;
        if (entityById.has(id)) { duplicateEntityIds++; continue; }
        entityById.set(id, entity);
    }
    const entities = [...entityById.values()];

    const spaces = [];
    const seenSpaceIds = new Set();
    let duplicateSpaceIds = 0;
    for (const scope of scopes) {
        const sourceSpaces = scope.payload.semanticTopologySpaces?.length
            ? scope.payload.semanticTopologySpaces
            : (scope.payload.semanticSpaces ?? []);
        for (const sourceSpace of sourceSpaces) {
            const id = String(sourceSpace?.id ?? '');
            if (!id) continue;
            if (seenSpaceIds.has(id)) { duplicateSpaceIds++; continue; }
            seenSpaceIds.add(id);
            spaces.push(normalizeSpace(sourceSpace, scope.layer));
        }
    }

    const rawConnectorById = new Map();
    const rawConnectorLayerById = new Map();
    let duplicateConnectorIds = 0;
    for (const scope of scopes) for (const raw of scope.payload.physics?.semanticConnectors ?? []) {
        const id = String(raw?.id ?? '');
        if (!id) continue;
        if (rawConnectorById.has(id)) { duplicateConnectorIds++; continue; }
        rawConnectorById.set(id, raw);
        rawConnectorLayerById.set(id, scope.layer);
    }
    const rawConnectors = [...rawConnectorById.values()];

    const transportSurfaces = [];
    const transportSurfaceNodeByLayerId = new Map();
    let duplicateTransportSurfaceIds = 0;
    for (const scope of scopes) for (const raw of scope.payload.physics?.exteriorTransportSurfaces ?? []) {
        const sourceId = String(raw?.id ?? '');
        if (!sourceId) continue;
        const lookupKey = `${scope.layer}\u001f${sourceId}`;
        if (transportSurfaceNodeByLayerId.has(lookupKey)) { duplicateTransportSurfaceIds++; continue; }
        const id = `transport:${scope.layer}:${sourceId}`;
        transportSurfaceNodeByLayerId.set(lookupKey, id);
        transportSurfaces.push({
            id, sourceId, layer: scope.layer, kind: raw.kind ?? 'exterior-street-layer',
            x: finite(raw.x), z: finite(raw.z), hx: finite(raw.hx), hz: finite(raw.hz), y: finite(raw.y),
            reachable: raw.reachable !== false, siteId: raw.siteId ?? null, moduleKey: raw.moduleKey ?? null,
            routeId: raw.routeId ?? null, networkKey: raw.networkKey ?? null, priority: raw.priority ?? null,
        });
    }
    const transportEdges = [];
    for (const scope of scopes) for (const raw of scope.payload.physics?.exteriorTransportEdges ?? []) {
        const aId = transportSurfaceNodeByLayerId.get(`${scope.layer}\u001f${String(raw?.aId ?? '')}`);
        const bId = transportSurfaceNodeByLayerId.get(`${scope.layer}\u001f${String(raw?.bId ?? '')}`);
        if (!aId || !bId || aId === bId) continue;
        transportEdges.push({
            ...raw,
            id: String(raw?.id ?? `transport-edge:${scope.layer}:${transportEdges.length}`),
            layer: scope.layer, aId, bId,
            sourceAId: String(raw?.aId ?? ''), sourceBId: String(raw?.bId ?? ''),
        });
    }

    const surfaces = compileSurfaces({ entities });
    const surfaceById = new Map(surfaces.map(item => [item.id, item]));
    const surfaceJoinIndex = indexSurfacesForPortalJoin(surfaces);
    const spaceById = new Map(spaces.map(item => [item.id, item]));
    const spaceJoinIndex = indexSpacesForSurfaceJoin(spaces);
    const portals = compileAccessPortals({ connectors: rawConnectors, spaces, entities });
    const portalById = new Map(portals.map(item => [item.id, item]));
    const accessEndpoints = accessEndpointNodes(portals);
    const noClutterRegions = portals.flatMap(portalNoClutterRegions);
    const protectionByPortal = new Map();
    for (const region of noClutterRegions) {
        const list = protectionByPortal.get(region.portalId) ?? [];
        list.push(region);
        protectionByPortal.set(region.portalId, list);
    }

    for (const scope of scopes) {
        if (scope.payload.physics) {
            scope.payload.physics.accessPortals = portals;
            for (const raw of scope.payload.physics.semanticConnectors ?? []) raw.accessPortal = portalById.get(String(raw.id)) ?? null;
        }
        scope.payload.accessPortals = portals;
    }

    const apertures = [];
    const connectors = [];
    const connectorById = new Map();
    const reservations = [];
    const instances = [];
    const edges = [];
    const reservationOwner = new Map();

    for (const raw of rawConnectors) {
        const portal = portalById.get(String(raw.id)) ?? null;
        const connectorLayer = rawConnectorLayerById.get(String(raw.id)) ?? 'ground';
        const connectorTransportSurfaceId = raw.metadata?.surfaceId
            ? transportSurfaceNodeByLayerId.get(`${connectorLayer}\u001f${String(raw.metadata.surfaceId)}`) ?? null
            : null;
        const connector = {
            id: raw.id, kind: raw.kind, source: raw.source ?? null, visualRole: raw.visualRole ?? null, layer: connectorLayer,
            fromSpaceId: raw.fromSpaceId ?? null, toSpaceId: raw.toSpaceId ?? null,
            spaceIds: [...(raw.spaceIds ?? [])], transportSurfaceIds: connectorTransportSurfaceId ? [connectorTransportSurfaceId] : [],
            reservationIds: [], apertureIds: [], portalIds: portal ? [portal.id] : [], endpointCount: raw.endpoints?.length ?? 0,
            metadata: raw.metadata ?? null,
        };
        pushUnique(connector.spaceIds, connector.fromSpaceId);
        pushUnique(connector.spaceIds, connector.toSpaceId);
        for (const reservation of raw.reservations ?? []) {
            connector.reservationIds.push(reservation.id);
            reservationOwner.set(reservation.id, raw.id);
        }
        for (const spaceId of connector.spaceIds) {
            const space = spaceById.get(spaceId);
            if (space) pushUnique(space.connectorIds, connector.id);
        }
        connectors.push(connector);
        connectorById.set(String(connector.id), connector);
    }

    // Facade openings are a derived view of Portal identity. Raw connector
    // endpoints no longer independently reconstruct another entrance aperture.
    for (const portal of portals) {
        const endpoint = portal.facadeEndpoint;
        if (!endpoint) continue;
        const surface = bestSurface(surfaceJoinIndex, {
            metadata: {
                entityId: portal.buildingId ?? endpoint.entityId ?? null,
                moduleKey: endpoint.moduleKey ?? portal.apertureGeometry?.moduleKey ?? null,
            },
        }, endpoint);
        const aperture = portalApertureForSurface(portal, surface, 0);
        if (!aperture || !surface) continue;
        apertures.push(aperture);
        portal.facadeBinding = {
            surfaceId: surface.id,
            apertureId: aperture.id,
            entityId: surface.entityId,
            moduleKey: surface.moduleKey,
            side: surface.side,
            authority: 'access-portal',
        };
        const connector = connectorById.get(String(portal.structuralConnectorId));
        if (connector) pushUnique(connector.apertureIds, aperture.id);
        pushUnique(surface.apertureIds, aperture.id);
        pushUnique(surface.connectorIds, portal.structuralConnectorId);
        pushUnique(surface.portalIds, portal.id);
        for (const region of protectionByPortal.get(portal.id) ?? []) {
            region.surfaceId = surface.id;
            region.entityId = surface.entityId;
            pushUnique(surface.accessNoClutterRegionIds, region.id);
        }
    }

    for (const scope of scopes) for (const raw of scope.payload.physics?.circulationReservations ?? []) {
        reservations.push({
            id: raw.id ?? null, kind: raw.kind ?? 'circulation', connectorId: raw.connectorId ?? raw.metadata?.connectorId ?? reservationOwner.get(raw.id) ?? null,
            source: raw.source ?? null, x: finite(raw.x, null), z: finite(raw.z, null), halfX: finite(raw.halfX, null), halfZ: finite(raw.halfZ, null),
            yMin: finite(raw.yMin), yMax: finite(raw.yMax), axis: raw.axis ?? null, from: finite(raw.from, null), to: finite(raw.to, null), fixedCoord: finite(raw.fixedCoord, null),
        });
    }

    for (const scope of scopes) for (const placement of scope.payload.semanticPlacements ?? []) {
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
    // already-rendered wall boxes. Publish one undirected graph relationship per
    // authored room pair while retaining access identity separately below.
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
        for (const space of spacesForSurface(spaceJoinIndex, surface)) pushUnique(surface.spaceIds, space.id);
    }
    for (const aperture of apertures) {
        edges.push(edge(`edge:surface-aperture:${aperture.surfaceId}:${aperture.id}`, 'has-aperture', aperture.surfaceId, aperture.id));
        edges.push(edge(`edge:connector-aperture:${aperture.connectorId}:${aperture.id}`, 'owns-aperture', aperture.connectorId, aperture.id));
        edges.push(edge(`edge:portal-aperture:${aperture.portalId}:${aperture.id}`, 'owns-access-aperture', aperture.portalId, aperture.id, {
            authority: 'access-portal',
        }));
    }
    for (const connector of connectors) {
        for (const spaceId of connector.spaceIds) edges.push(edge(`edge:connector-space:${connector.id}:${spaceId}`, 'connects-space', connector.id, spaceId));
        for (const reservationId of connector.reservationIds) edges.push(edge(`edge:connector-reservation:${connector.id}:${reservationId}`, 'owns-reservation', connector.id, reservationId));
    }
    for (const portal of portals) {
        for (const spaceId of portal.linkedSpaceIds ?? []) {
            edges.push(edge(`edge:portal-space:${portal.id}:${spaceId}`, 'connects-access-space', portal.id, spaceId, { authority: 'access-portal' }));
        }
        if (portal.outsideEndpoint) edges.push(edge(`edge:outside-portal:${portal.id}`, 'approaches-access-portal', portal.outsideEndpoint.id, portal.id));
        if (portal.insideEndpoint) {
            edges.push(edge(`edge:portal-inside:${portal.id}`, 'enters-access-endpoint', portal.id, portal.insideEndpoint.id));
            if (portal.insideEndpoint.spaceId) edges.push(edge(
                `edge:inside-space:${portal.insideEndpoint.id}:${portal.insideEndpoint.spaceId}`,
                'terminates-in-space', portal.insideEndpoint.id, portal.insideEndpoint.spaceId,
                { authority: 'access-portal' },
            ));
        }
        for (const region of protectionByPortal.get(portal.id) ?? []) {
            edges.push(edge(`edge:portal-protection:${portal.id}:${region.id}`, 'protects-access-region', portal.id, region.id, {
                reservationId: region.reservationId ?? null,
                spatialClaimId: region.spatialClaimId ?? null,
            }));
        }
    }
    for (const instance of instances) {
        if (instance.spaceId) edges.push(edge(`edge:space-instance:${instance.spaceId}:${instance.id}`, 'contains-instance', instance.spaceId, instance.id));
    }

    let unboundEntranceFaces = 0;
    for (const entity of entities) {
        for (const face of entity.entranceFaces ?? []) {
            const matched = apertures.some(aperture => aperture.entityId === entity.id
                && aperture.moduleKey === face.moduleKey
                && surfaceById.get(aperture.surfaceId)?.side === face.side);
            if (!matched) unboundEntranceFaces++;
        }
    }

    const orphanReservations = reservations.filter(item => !item.connectorId).length;
    const orphanApertures = apertures.filter(item => !item.connectorId || !item.portalId).length;
    const danglingConnectorSpaces = connectors.reduce((count, connector) => count + connector.spaceIds.filter(id => !spaceById.has(id)).length, 0);
    const danglingPortalSpaces = portals.reduce((count, portal) => count + (portal.linkedSpaceIds ?? []).filter(id => !spaceById.has(id)).length, 0);
    const unboundPortalApertures = portals.filter(portal => portal.facadeEndpoint && portal.apertureGeometry
        && !apertures.some(aperture => aperture.portalId === portal.id)).length;
    const graph = {
        schema: SPATIAL_TOPOLOGY_SCHEMA,
        ownerId: payload.ownerId ?? null,
        chunkKey: chunk.key,
        layers: scopes.map(scope => scope.layer),
        spaces, surfaces, apertures, portals, accessEndpoints, noClutterRegions, connectors, reservations, instances, edges,
        transportSurfaces, transportEdges,
        stats: {
            payloadScopes: scopes.length, duplicateEntityIds, duplicateSpaceIds, duplicateConnectorIds, duplicateTransportSurfaceIds,
            spaces: spaces.length, surfaces: surfaces.length, apertures: apertures.length, portals: portals.length,
            transportSurfaces: transportSurfaces.length, transportEdges: transportEdges.length,
            accessEndpoints: accessEndpoints.length, noClutterRegions: noClutterRegions.length, connectors: connectors.length,
            reservations: reservations.length, instances: instances.length, edges: edges.length,
            orphanReservations, orphanApertures, unboundEntranceFaces, danglingConnectorSpaces, danglingPortalSpaces, unboundPortalApertures,
        },
    };
    const circulation = compileWorldCirculationGraph(graph);
    // Once a building declares a real exterior egress portal, every authored
    // interior space must reach it through physical connector authority. Buildings
    // with no declared exterior portal remain observable rather than hard-failed;
    // this gate specifically prevents partial/false egress graphs from shipping.
    assertWorldCirculationGraph(circulation, { requireExplicitEgress: true });
    graph.circulation = circulation;
    graph.stats.circulation = circulation.stats;
    for (const scope of scopes) {
        scope.payload.worldCirculation = circulation;
        scope.payload.spatialTopology = graph;
        for (const entity of scope.payload.entities ?? []) entity.spatialTopologyId = entity.id;
        for (const space of scope.payload.semanticSpaces ?? []) space.spatialTopologyId = space.id;
        for (const space of scope.payload.semanticTopologySpaces ?? []) space.spatialTopologyId = space.id;
        for (const placement of scope.payload.semanticPlacements ?? []) placement.spatialTopologyId = placement.instanceId;
    }
    return graph;
}

export function assertSpatialTopologyGraph(graph, { requireEntranceAuthority = true } = {}) {
    if (!graph || graph.schema !== SPATIAL_TOPOLOGY_SCHEMA) throw new Error('invalid spatial topology graph');
    if (graph.stats.orphanReservations) throw new Error(`spatial topology has ${graph.stats.orphanReservations} orphan reservations`);
    if (graph.stats.orphanApertures) throw new Error(`spatial topology has ${graph.stats.orphanApertures} orphan apertures`);
    if (requireEntranceAuthority && graph.stats.unboundEntranceFaces) throw new Error(`spatial topology has ${graph.stats.unboundEntranceFaces} unbound entrance faces`);
    if (graph.circulation) assertWorldCirculationGraph(graph.circulation);
    return true;
}
