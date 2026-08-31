export const ACCESS_PORTAL_SCHEMA = 'jweb.access-portal.v1';

const CARDINAL = Object.freeze({
    north: Object.freeze({ x: 0, z: -1 }),
    east: Object.freeze({ x: 1, z: 0 }),
    south: Object.freeze({ x: 0, z: 1 }),
    west: Object.freeze({ x: -1, z: 0 }),
});

function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function text(value) {
    return String(value ?? '').toLowerCase();
}

function spaceMap(spaces = []) {
    return new Map(spaces.filter(item => item?.id).map(item => [String(item.id), item]));
}

function connectorSpaceIds(connector) {
    return [...new Set([
        connector?.fromSpaceId,
        connector?.toSpaceId,
        ...(connector?.spaceIds ?? []),
    ].filter(Boolean).map(String))];
}

function entityForConnector(connector, spacesById, entities = []) {
    const explicit = connector?.metadata?.entityId ?? connector?.metadata?.buildingId ?? null;
    if (explicit) return entities.find(entity => String(entity?.id) === String(explicit)) ?? { id: explicit };

    for (const id of connectorSpaceIds(connector)) {
        const entityId = spacesById.get(id)?.entityId;
        if (entityId) return entities.find(entity => String(entity?.id) === String(entityId)) ?? { id: entityId };
    }

    const moduleKey = connector?.metadata?.moduleKey;
    if (moduleKey) {
        const match = entities.find(entity => entity?.footprintModules?.some(module => module?.key === moduleKey));
        if (match) return match;
    }
    return null;
}

function explicitPortalFamily(connector) {
    const value = connector?.metadata?.portalFamily ?? connector?.metadata?.accessFamily;
    return value ? String(value) : null;
}


function inferredPortalFamily(connector) {
    const explicit = explicitPortalFamily(connector);
    if (explicit) return explicit;
    const kind = text(connector?.kind);
    const words = [
        connector?.source, connector?.visualRole, connector?.metadata?.role,
        connector?.metadata?.accessRole, connector?.metadata?.semanticRole,
    ]
        .map(text).join(' ');

    if (kind === 'door') {
        if (words.includes('loading')) return 'loading-service-access';
        if (words.includes('service') || words.includes('maintenance') || words.includes('utility')) return 'service-entrance';
        if (words.includes('storefront') || words.includes('shop') || words.includes('retail')) return 'storefront-entrance';
        if (words.includes('roof')) return 'roof-access';
        return 'entrance';
    }
    if (kind === 'bridge') return 'bridge-portal';
    if (kind === 'fire-escape' || words.includes('scaffold') || words.includes('fire-escape')) return 'scaffold-fire-escape-access';
    if (kind === 'stair') return words.includes('roof') ? 'roof-access' : 'stair-arrival';
    if (kind === 'landing') return words.includes('scaffold') || words.includes('fire-escape')
        ? 'scaffold-fire-escape-access'
        : 'stair-arrival';
    if (kind.includes('mezzanine') || words.includes('mezzanine')) return 'mezzanine-access';
    if (kind === 'ramp') return 'ramp-access';
    return `${kind || 'circulation'}-access`;
}

function traversalRole(family, connector) {
    const kind = text(connector?.kind);
    if (family === 'service-entrance' || family === 'loading-service-access') return 'service';
    if (family === 'scaffold-fire-escape-access') return 'emergency';
    if (family === 'bridge-portal') return 'bridge';
    if (kind === 'stair' || kind === 'landing' || kind.includes('ramp') || family === 'roof-access') return 'vertical-circulation';
    return 'public-access';
}

function normalizedReservationRef(reservation, connectorId) {
    if (!reservation) return null;
    const halfX = Number.isFinite(Number(reservation.halfX)) ? Number(reservation.halfX) : null;
    const halfZ = Number.isFinite(Number(reservation.halfZ)) ? Number(reservation.halfZ) : null;
    return {
        id: reservation.id ?? null,
        kind: reservation.kind ?? 'circulation',
        connectorId: reservation.connectorId ?? reservation.metadata?.connectorId ?? connectorId ?? null,
        source: reservation.source ?? null,
        x: Number.isFinite(Number(reservation.x)) ? Number(reservation.x) : null,
        z: Number.isFinite(Number(reservation.z)) ? Number(reservation.z) : null,
        halfX,
        halfZ,
        minX: Number.isFinite(Number(reservation.minX)) ? Number(reservation.minX) : (halfX != null ? finite(reservation.x) - halfX : null),
        maxX: Number.isFinite(Number(reservation.maxX)) ? Number(reservation.maxX) : (halfX != null ? finite(reservation.x) + halfX : null),
        minZ: Number.isFinite(Number(reservation.minZ)) ? Number(reservation.minZ) : (halfZ != null ? finite(reservation.z) - halfZ : null),
        maxZ: Number.isFinite(Number(reservation.maxZ)) ? Number(reservation.maxZ) : (halfZ != null ? finite(reservation.z) + halfZ : null),
        yMin: Number.isFinite(Number(reservation.yMin)) ? Number(reservation.yMin) : null,
        yMax: Number.isFinite(Number(reservation.yMax)) ? Number(reservation.yMax) : null,
        axis: reservation.axis ?? null,
        from: Number.isFinite(Number(reservation.from)) ? Number(reservation.from) : null,
        to: Number.isFinite(Number(reservation.to)) ? Number(reservation.to) : null,
        fixedCoord: Number.isFinite(Number(reservation.fixedCoord)) ? Number(reservation.fixedCoord) : null,
        spatialClaimId: reservation.spatialClaimId ?? reservation.spatialClaim?.id ?? null,
    };
}

function endpointView(endpoint, index, connector, spacesById) {
    const explicitSpaceId = index === 0 ? connector?.fromSpaceId : index === 1 ? connector?.toSpaceId : null;
    const spaceId = explicitSpaceId ?? connector?.spaceIds?.[index] ?? null;
    const space = spaceId ? spacesById.get(String(spaceId)) : null;
    return {
        id: endpoint?.id ?? `${connector.id}:endpoint:${index}`,
        kind: endpoint?.kind ?? 'access-endpoint',
        x: finite(endpoint?.x),
        y: finite(endpoint?.y),
        z: finite(endpoint?.z),
        side: CARDINAL[endpoint?.side] ? endpoint.side : null,
        normalX: Number.isFinite(Number(endpoint?.normalX)) ? Number(endpoint.normalX) : (CARDINAL[endpoint?.side]?.x ?? null),
        normalZ: Number.isFinite(Number(endpoint?.normalZ)) ? Number(endpoint.normalZ) : (CARDINAL[endpoint?.side]?.z ?? null),
        width: Number.isFinite(Number(endpoint?.width)) ? Number(endpoint.width) : null,
        height: Number.isFinite(Number(endpoint?.height)) ? Number(endpoint.height) : null,
        depth: Number.isFinite(Number(endpoint?.depth)) ? Number(endpoint.depth) : null,
        moduleKey: endpoint?.moduleKey ?? connector?.metadata?.moduleKey ?? null,
        entityId: endpoint?.entityId ?? connector?.metadata?.entityId ?? space?.entityId ?? null,
        spaceId: spaceId ? String(spaceId) : null,
        buildingPlanId: space?.buildingPlanId ?? null,
        floor: Number.isFinite(Number(space?.floor)) ? Number(space.floor) : null,
    };
}

function doorThreshold(connector, endpointViews) {
    return endpointViews.find(endpoint => endpoint.side && CARDINAL[endpoint.side]) ?? null;
}

function doorEndpointPair(threshold, connector, spacesById) {
    if (!threshold) return { outsideEndpoint: null, insideEndpoint: null };
    const normal = CARDINAL[threshold.side];
    const depth = positive(connector?.aperture?.depth, positive(threshold.depth, 1.2));
    const insideSpaceId = connector?.fromSpaceId ?? connector?.spaceIds?.[0] ?? connector?.toSpaceId ?? null;
    const insideSpace = insideSpaceId ? spacesById.get(String(insideSpaceId)) : null;
    const offset = Math.max(0.12, Math.min(0.42, depth * 0.25));
    return {
        outsideEndpoint: {
            id: `${connector.id}:outside`, kind: 'outside-space-endpoint',
            x: threshold.x + normal.x * offset,
            y: threshold.y,
            z: threshold.z + normal.z * offset,
            side: threshold.side,
            spaceId: null,
            entityId: threshold.entityId,
        },
        insideEndpoint: {
            id: `${connector.id}:inside`, kind: 'inside-space-endpoint',
            x: threshold.x - normal.x * offset,
            y: threshold.y,
            z: threshold.z - normal.z * offset,
            side: threshold.side,
            spaceId: insideSpaceId ? String(insideSpaceId) : null,
            entityId: insideSpace?.entityId ?? threshold.entityId,
            buildingPlanId: insideSpace?.buildingPlanId ?? null,
            floor: Number.isFinite(Number(insideSpace?.floor)) ? Number(insideSpace.floor) : null,
        },
    };
}

function apertureGeometry(connector, threshold) {
    const width = positive(connector?.aperture?.width, positive(threshold?.width, null));
    const height = positive(connector?.aperture?.height, positive(threshold?.height, null));
    const depth = positive(connector?.aperture?.depth, positive(threshold?.depth, null));
    if (!(width && height)) return null;
    return {
        x: threshold ? threshold.x : null,
        y: threshold ? threshold.y : null,
        z: threshold ? threshold.z : null,
        side: threshold?.side ?? null,
        width,
        height,
        depth,
        moduleKey: threshold?.moduleKey ?? connector?.metadata?.moduleKey ?? null,
        source: 'semantic-connector-aperture',
    };
}

export function accessPortalFromConnector(connector, { spaces = [], entities = [] } = {}) {
    if (!connector?.id) throw new Error('access portal requires semantic connector id');
    const spacesById = spaceMap(spaces);
    const entity = entityForConnector(connector, spacesById, entities);
    const endpointViews = (connector.endpoints ?? []).map((endpoint, index) => endpointView(endpoint, index, connector, spacesById));
    const threshold = doorThreshold(connector, endpointViews);
    const pair = text(connector.kind) === 'door' ? doorEndpointPair(threshold, connector, spacesById) : { outsideEndpoint: null, insideEndpoint: null };
    const family = inferredPortalFamily(connector);
    const linkedSpaces = connectorSpaceIds(connector);
    const linkedEntities = [...new Set(linkedSpaces.map(id => spacesById.get(id)?.entityId).filter(Boolean).map(String))];
    const linkedPlans = [...new Set(linkedSpaces.map(id => spacesById.get(id)?.buildingPlanId).filter(Boolean).map(String))];
    const linkedFloors = linkedSpaces.map(id => spacesById.get(id)?.floor).filter(Number.isFinite);
    const reservationRefs = (connector.reservations ?? []).map(item => normalizedReservationRef(item, connector.id)).filter(Boolean);
    const floorH = positive(entity?.floorH, positive(threshold?.floorH, 3.15));
    const floor = Number.isFinite(Number(connector?.metadata?.floor))
        ? Math.max(0, Math.floor(Number(connector.metadata.floor)))
        : linkedFloors.length
            ? Math.max(0, Math.floor(Number(linkedFloors[0])))
            : threshold
                ? Math.max(0, Math.round(finite(threshold.y) / Math.max(0.01, floorH)))
                : 0;

    return {
        schema: ACCESS_PORTAL_SCHEMA,
        authority: 'access-portal',
        id: String(connector.id),
        stableId: String(connector.id),
        buildingId: entity?.id ? String(entity.id) : (connector?.metadata?.entityId ?? null),
        buildingIds: linkedEntities.length ? linkedEntities : (entity?.id ? [String(entity.id)] : []),
        buildingPlanId: linkedPlans[0] ?? connector?.metadata?.buildingPlanId ?? null,
        buildingPlanIds: linkedPlans,
        structuralConnectorId: String(connector.id),
        connectorType: connector.kind ?? 'circulation',
        family,
        declaredFamily: family,
        semanticRole: family,
        floor,
        directionality: connector?.metadata?.directionality ?? 'bidirectional',
        traversal: {
            traversable: text(connector.kind) !== 'window',
            role: traversalRole(family, connector),
            accessible: connector?.metadata?.accessible
                ?? !(['stair', 'fire-escape'].includes(text(connector.kind)) || family === 'scaffold-fire-escape-access'),
        },
        outsideEndpoint: pair.outsideEndpoint,
        insideEndpoint: pair.insideEndpoint,
        endpoints: endpointViews,
        facadeEndpoint: threshold,
        apertureGeometry: apertureGeometry(connector, threshold),
        clearanceGeometry: {
            reservationIds: reservationRefs.map(item => item.id).filter(Boolean),
            reservations: reservationRefs,
            sweep: connector.sweep ? { ...connector.sweep } : null,
        },
        structuralReservationRefs: reservationRefs.map(item => ({
            id: item.id,
            kind: item.kind,
            spatialClaimId: item.spatialClaimId,
        })),
        linkedSpaceIds: linkedSpaces,
        provenance: {
            authority: 'access-portal',
            structuralAuthority: 'semantic-connector',
            sourceSchema: connector.schema ?? null,
            source: connector.source ?? null,
            structuralConnectorId: String(connector.id),
            dimensionAuthority: connector?.physicalTruth?.architecturalAuthority === false
                ? 'explicit-legacy-fallback'
                : 'resolved-physical-truth-or-connector',
        },
        metadata: connector.metadata ? { ...connector.metadata } : null,
    };
}

function portalGroupKey(portal) {
    return String(portal.buildingId ?? portal.metadata?.entityId ?? 'unbound');
}

export function normalizeAccessPortalSet(portals = []) {
    const result = portals.map(portal => {
        const declaredFamily = portal?.declaredFamily ?? portal?.family ?? 'circulation-access';
        return { ...portal, declaredFamily, family: declaredFamily, semanticRole: declaredFamily };
    });
    const genericEntrances = new Map();
    for (const portal of result) {
        if (portal.connectorType !== 'door' || portal.family !== 'entrance') continue;
        const key = portalGroupKey(portal);
        const list = genericEntrances.get(key) ?? [];
        list.push(portal);
        genericEntrances.set(key, list);
    }
    for (const list of genericEntrances.values()) {
        list.sort((a, b) => String(a.id).localeCompare(String(b.id)));
        list.forEach((portal, index) => {
            portal.family = index === 0 ? 'main-entrance' : 'secondary-entrance';
            portal.semanticRole = portal.family;
            portal.traversal = { ...portal.traversal, role: 'public-access' };
        });
    }
    result.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    return result;
}

export function compileAccessPortals({ physics = null, connectors = null, spaces = [], entities = [] } = {}) {
    const source = connectors ?? physics?.semanticConnectors ?? [];
    return normalizeAccessPortalSet(source.map(connector => accessPortalFromConnector(connector, { spaces, entities })));
}

export function publishAccessPortals(physics, { spaces = [], entities = [] } = {}) {
    if (!physics) throw new Error('access portal publication requires physics payload');
    const portals = compileAccessPortals({ physics, spaces, entities });
    physics.accessPortals = portals;
    const byId = new Map(portals.map(portal => [portal.id, portal]));
    for (const connector of physics.semanticConnectors ?? []) connector.accessPortal = byId.get(String(connector.id)) ?? null;
    return portals;
}

export function accessAnchorsForBuildingPortals(portals = [], buildingId = null) {
    const families = new Set([
        'main-entrance', 'secondary-entrance', 'storefront-entrance',
        'service-entrance', 'loading-service-access', 'roof-access',
    ]);
    return portals
        .filter(portal => portal?.connectorType === 'door' && portal.facadeEndpoint && families.has(portal.family))
        .filter(portal => !buildingId || String(portal.buildingId) === String(buildingId))
        .map(portal => ({
            id: portal.id,
            portalId: portal.id,
            kind: portal.family === 'main-entrance' ? 'main-entry'
                : portal.family === 'service-entrance' || portal.family === 'loading-service-access' ? 'service-entry'
                    : portal.family === 'storefront-entrance' ? 'storefront-entry'
                        : portal.family === 'roof-access' ? 'roof-entry'
                            : 'secondary-entry',
            x: portal.facadeEndpoint.x,
            z: portal.facadeEndpoint.z,
            side: portal.facadeEndpoint.side,
            dc: finite(portal.facadeEndpoint.dc),
            dr: finite(portal.facadeEndpoint.dr),
            floor: portal.floor,
            connectorId: portal.structuralConnectorId,
            insideSpaceId: portal.insideEndpoint?.spaceId ?? null,
            semanticRole: portal.semanticRole,
        }));
}

function surfaceTangent(surface) {
    return surface?.side === 'north' || surface?.side === 'south' ? { x: 1, z: 0 } : { x: 0, z: 1 };
}

function clamp(value, lo, hi) {
    return Math.max(lo, Math.min(hi, value));
}

export function portalApertureForSurface(portal, surface, index = 0) {
    const endpoint = portal?.facadeEndpoint;
    const geometry = portal?.apertureGeometry;
    if (!portal || !surface || !endpoint || !geometry) return null;
    if (endpoint.side && surface.side !== endpoint.side) return null;
    const tangent = surfaceTangent(surface);
    const u = (finite(endpoint.x) - finite(surface.x)) * tangent.x + (finite(endpoint.z) - finite(surface.z)) * tangent.z;
    const half = Math.max(0, finite(surface.half));
    const width = Math.max(0.5, positive(geometry.width, 1.2));
    const height = Math.max(1.2, positive(geometry.height, 2.2));
    const uMin = clamp(u - width * 0.5, -half, half);
    const uMax = clamp(u + width * 0.5, -half, half);
    if (!(uMax > uMin)) return null;
    return {
        id: `${portal.id}:aperture:${index}`,
        kind: portal.connectorType === 'door' ? 'entrance'
            : portal.connectorType === 'stair' ? 'stair-opening'
                : portal.connectorType === 'bridge' ? 'bridge-entry'
                    : 'connector-opening',
        portalId: portal.id,
        connectorId: portal.structuralConnectorId,
        surfaceId: surface.id,
        entityId: surface.entityId,
        moduleKey: surface.moduleKey,
        traversable: portal.traversal?.traversable !== false,
        uMin,
        uMax,
        vMin: finite(endpoint.y, finite(surface.yMin)),
        vMax: finite(endpoint.y, finite(surface.yMin)) + height,
        clearance: [...(portal.clearanceGeometry?.reservationIds ?? [])],
        authority: 'access-portal',
        apertureGeometry: { ...geometry },
    };
}

export function portalNoClutterRegions(portal) {
    if (!portal?.id) return [];
    const regions = [];
    for (const [index, reservation] of (portal.clearanceGeometry?.reservations ?? []).entries()) {
        if (![reservation.minX, reservation.maxX, reservation.minZ, reservation.maxZ].every(Number.isFinite)) continue;
        regions.push({
            id: `${portal.id}:access-protection:${index}`,
            kind: 'access-no-clutter',
            portalId: portal.id,
            connectorId: portal.structuralConnectorId,
            reservationId: reservation.id ?? null,
            minX: reservation.minX,
            maxX: reservation.maxX,
            minZ: reservation.minZ,
            maxZ: reservation.maxZ,
            yMin: reservation.yMin,
            yMax: reservation.yMax,
            decorationMayIntrude: false,
            spatialClaimId: reservation.spatialClaimId ?? null,
            authority: 'access-portal-clearance',
        });
    }
    if (!regions.length && portal.facadeEndpoint && portal.apertureGeometry) {
        const endpoint = portal.facadeEndpoint;
        const width = positive(portal.apertureGeometry.width, 1.2);
        const depth = positive(portal.apertureGeometry.depth, 1.2);
        const normal = CARDINAL[endpoint.side] ?? { x: 0, z: 0 };
        const horizontal = endpoint.side === 'north' || endpoint.side === 'south';
        const x = endpoint.x + normal.x * depth * 0.15;
        const z = endpoint.z + normal.z * depth * 0.15;
        regions.push({
            id: `${portal.id}:access-protection:fallback`,
            kind: 'access-no-clutter',
            portalId: portal.id,
            connectorId: portal.structuralConnectorId,
            reservationId: null,
            minX: x - (horizontal ? width * 0.5 : depth * 0.5),
            maxX: x + (horizontal ? width * 0.5 : depth * 0.5),
            minZ: z - (horizontal ? depth * 0.5 : width * 0.5),
            maxZ: z + (horizontal ? depth * 0.5 : width * 0.5),
            yMin: finite(endpoint.y),
            yMax: finite(endpoint.y) + positive(portal.apertureGeometry.height, 2.2),
            decorationMayIntrude: false,
            spatialClaimId: null,
            authority: 'access-portal-clearance-fallback',
        });
    }
    return regions;
}

export function portalCollisionOpeningWidth(portal, fallback = 0) {
    const width = Number(portal?.apertureGeometry?.width);
    return Number.isFinite(width) && width > 0 ? width : fallback;
}

export function assertAccessPortal(portal) {
    if (!portal || portal.schema !== ACCESS_PORTAL_SCHEMA || !portal.id) throw new Error('invalid access portal');
    if (portal.structuralConnectorId !== portal.id) throw new Error(`access portal ${portal.id} must share structural connector identity`);
    if (portal.connectorType === 'door' && !portal.facadeEndpoint) throw new Error(`door access portal ${portal.id} requires facade endpoint`);
    if (portal.connectorType === 'door' && !portal.apertureGeometry) throw new Error(`door access portal ${portal.id} requires aperture geometry`);
    return true;
}
