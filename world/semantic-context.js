import { compileSpatialTopologyGraph } from './spatial-topology.js';

export const SEMANTIC_CONTEXT_SCHEMA = 'jweb.semantic-context.v1';

const SIDES = Object.freeze(['north', 'east', 'south', 'west']);
const NORMAL = Object.freeze({
    north: Object.freeze({ x: 0, z: -1, ry: 0 }),
    east: Object.freeze({ x: 1, z: 0, ry: -Math.PI * 0.5 }),
    south: Object.freeze({ x: 0, z: 1, ry: Math.PI }),
    west: Object.freeze({ x: -1, z: 0, ry: Math.PI * 0.5 }),
});

function hash32(value) {
    let h = 2166136261 >>> 0;
    const text = String(value ?? '');
    for (let i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
}

function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }
function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
function entityById(payload, id) { return payload?.entities?.find(entity => entity.id === id) ?? null; }
function moduleByKey(entity, key) { return entity?.footprintModules?.find(module => module.key === key) ?? null; }

function verticalLayer(y, floor = 0) {
    if (y >= 18 || floor >= 5) return 'upper';
    if (y >= 7 || floor >= 2) return 'mid';
    if (y < -1) return 'undercity';
    return 'street';
}

function districtFamily(chunk) {
    const families = ['network', 'market', 'service', 'industrial', 'residential', 'transit', 'mechanical', 'archive'];
    return families[hash32(`district:${chunk?.key ?? 'world'}`) % families.length];
}

function programForEntity(entity) {
    const family = entity?.physicalUse?.family;
    if (family === 'residential-lodging') return 'residential';
    if (family === 'mercantile-public') return 'commercial';
    if (family === 'business') return 'office';
    if (family === 'assembly-institutional') return 'public';
    if (family === 'industrial-service') return 'industrial';
    return entity?.archetype ?? 'mixed';
}

function facadeFromExisting(entity, facade, index) {
    const side = SIDES.includes(facade?.side) ? facade.side : entity?.doorSide ?? 'north';
    const horizontal = side === 'north' || side === 'south';
    const halfX = finite(facade?.halfX, finite(entity?.halfX, 2));
    const halfZ = finite(facade?.halfZ, finite(entity?.halfZ, 2));
    const half = finite(facade?.half, horizontal ? halfX : halfZ);
    return {
        id: `${entity.id}:surface:facade:${index}`,
        kind: 'facade',
        entityId: entity.id,
        moduleKey: facade?.moduleKey ?? null,
        facadeIndex: index,
        side,
        x: finite(facade?.x, finite(facade?.cx, finite(entity?.x, 0))),
        z: finite(facade?.z, finite(facade?.cz, finite(entity?.z, 0))),
        normalX: finite(facade?.normalX, NORMAL[side].x),
        normalZ: finite(facade?.normalZ, NORMAL[side].z),
        rotY: finite(facade?.rotY, NORMAL[side].ry),
        half,
        yMin: finite(facade?.yMin, 0),
        yMax: finite(facade?.yMax, Math.max(2.6, finite(entity?.height, finite(entity?.floorH, 3.15)))),
        exposure: facade?.exposure ?? (side === entity?.doorSide ? 'street' : 'exterior'),
    };
}

function facadeFromModule(entity, module, side, index) {
    const v = NORMAL[side];
    const horizontal = side === 'north' || side === 'south';
    return {
        id: `${entity.id}:surface:${module.key}:${side}`,
        kind: 'facade', entityId: entity.id, moduleKey: module.key, facadeIndex: index, side,
        x: module.cx + v.x * (horizontal ? 0 : module.halfX),
        z: module.cz + v.z * (horizontal ? module.halfZ : 0),
        normalX: v.x, normalZ: v.z, rotY: v.ry,
        half: horizontal ? module.halfX : module.halfZ,
        yMin: 0,
        yMax: Math.max(2.6, finite(module.floors, 1) * finite(entity.floorH, 3.15)),
        exposure: side === entity?.doorSide ? 'street' : 'exterior',
    };
}

function compileSurfaces(payload) {
    const surfaces = [];
    for (const entity of payload?.entities ?? []) {
        if (entity.kind !== 'building' && entity.kind !== 'district-landmark') continue;
        if (Array.isArray(entity.facades) && entity.facades.length) {
            entity.facades.forEach((facade, index) => surfaces.push(facadeFromExisting(entity, facade, index)));
            continue;
        }
        for (const module of entity.footprintModules ?? []) {
            for (const side of SIDES) surfaces.push(facadeFromModule(entity, module, side, null));
        }
    }
    return surfaces;
}

function surfaceTangent(surface) {
    return surface.side === 'north' || surface.side === 'south' ? { x: 1, z: 0 } : { x: 0, z: 1 };
}

function surfaceDistance(surface, point) {
    return Math.hypot(surface.x - finite(point?.x), surface.z - finite(point?.z));
}

function bestSurfaceForEndpoint(surfaces, endpoint, entityId = null) {
    const candidates = surfaces.filter(surface => (!entityId || surface.entityId === entityId)
        && (!endpoint?.side || surface.side === endpoint.side));
    const pool = candidates.length ? candidates : surfaces.filter(surface => !entityId || surface.entityId === entityId);
    pool.sort((a, b) => surfaceDistance(a, endpoint) - surfaceDistance(b, endpoint) || a.id.localeCompare(b.id));
    return pool[0] ?? null;
}

function apertureForEndpoint(connector, endpoint, surface, index) {
    if (!surface || !endpoint) return null;
    const tangent = surfaceTangent(surface);
    const u = (finite(endpoint.x) - surface.x) * tangent.x + (finite(endpoint.z) - surface.z) * tangent.z;
    const width = Math.max(0.5, finite(endpoint.width, finite(connector?.aperture?.width, 1.2)));
    const yMin = finite(endpoint.y, surface.yMin);
    const height = Math.max(1.2, finite(endpoint.height, finite(connector?.aperture?.height, 2.2)));
    return {
        id: `${connector.id}:aperture:${index}`,
        kind: connector.kind === 'stair' ? 'stair-opening' : connector.kind === 'bridge' ? 'bridge-entry' : 'connector-opening',
        connectorId: connector.id,
        surfaceId: surface.id,
        entityId: surface.entityId,
        moduleKey: surface.moduleKey,
        traversable: connector.kind !== 'window',
        uMin: clamp(u - width * 0.5, -surface.half, surface.half),
        uMax: clamp(u + width * 0.5, -surface.half, surface.half),
        vMin: yMin,
        vMax: yMin + height,
        clearance: connector.reservations?.map(item => item.id) ?? [],
    };
}

function compileApertures(payload, surfaces) {
    const apertures = [];
    const seen = new Set();
    for (const connector of payload?.physics?.semanticConnectors ?? []) {
        const entityId = connector.metadata?.entityId ?? null;
        (connector.endpoints ?? []).forEach((endpoint, index) => {
            if (!endpoint?.side) return;
            const surface = bestSurfaceForEndpoint(surfaces, endpoint, entityId);
            const aperture = apertureForEndpoint(connector, endpoint, surface, index);
            if (aperture && aperture.uMax > aperture.uMin && !seen.has(aperture.id)) {
                apertures.push(aperture); seen.add(aperture.id);
            }
        });
    }
    for (const entity of payload?.entities ?? []) {
        for (const face of entity.entranceFaces ?? []) {
            const surface = surfaces.find(item => item.entityId === entity.id && item.moduleKey === face.moduleKey && item.side === face.side)
                ?? surfaces.find(item => item.entityId === entity.id && item.side === face.side);
            if (!surface) continue;
            const width = Math.max(0.7, finite(entity?.physicalTruth?.door?.clearWidth?.realizedSI, 1.2));
            const id = `${entity.id}:entrance:${face.moduleKey}:${face.side}`;
            if (seen.has(id)) continue;
            apertures.push({
                id, kind: 'entrance', connectorId: null, surfaceId: surface.id, entityId: entity.id,
                moduleKey: face.moduleKey, traversable: true,
                uMin: -width * 0.5, uMax: width * 0.5,
                vMin: surface.yMin, vMax: surface.yMin + Math.max(2, finite(entity?.physicalTruth?.door?.clearHeight?.realizedSI, 2.2)),
                clearance: [],
            });
            seen.add(id);
        }
    }
    return apertures;
}

function freeIntervals(surface, apertures, padding = 0.22) {
    const blocked = apertures
        .filter(aperture => aperture.surfaceId === surface.id)
        .map(aperture => [clamp(aperture.uMin - padding, -surface.half, surface.half), clamp(aperture.uMax + padding, -surface.half, surface.half)])
        .sort((a, b) => a[0] - b[0]);
    const result = [];
    let cursor = -surface.half;
    for (const [lo, hi] of blocked) {
        if (lo > cursor) result.push([cursor, lo]);
        cursor = Math.max(cursor, hi);
    }
    if (cursor < surface.half) result.push([cursor, surface.half]);
    return result.filter(([lo, hi]) => hi - lo >= 0.5);
}

function pointForSurface(surface, u, y, outward = 0.03) {
    const t = surfaceTangent(surface);
    return {
        x: surface.x + t.x * u + surface.normalX * outward,
        y,
        z: surface.z + t.z * u + surface.normalZ * outward,
        rotY: surface.rotY,
    };
}

function facadeOpportunities(surfaces, apertures, contextByEntity) {
    const opportunities = [];
    for (const surface of surfaces) {
        const context = contextByEntity.get(surface.entityId);
        const intervals = freeIntervals(surface, apertures);
        intervals.forEach(([lo, hi], index) => {
            const u = (lo + hi) * 0.5;
            const width = hi - lo;
            const base = {
                surfaceId: surface.id, hostId: surface.entityId, entityId: surface.entityId, moduleKey: surface.moduleKey,
                facadeIndex: surface.facadeIndex, side: surface.side, exposure: surface.exposure,
                u, along: surface.half > 0 ? clamp(u / surface.half, -0.92, 0.92) : 0,
                availableWidth: width,
                contextId: context?.id ?? null,
                spatialTopologyHostId: surface.id,
            };
            const signY = clamp(surface.yMin + 2.3 + index * 0.7, surface.yMin + 1.9, Math.max(surface.yMin + 2, surface.yMax - 0.55));
            opportunities.push({
                id: `${surface.id}:sign:${index}`, role: 'facade-sign-zone', ...base,
                transform: pointForSurface(surface, u, signY, 0.035),
                clearanceBudget: { width, height: Math.max(0.5, surface.yMax - signY) },
            });
            opportunities.push({
                id: `${surface.id}:poster:${index}`, role: 'facade-poster-zone', ...base,
                transform: pointForSurface(surface, u, clamp(surface.yMin + 1.45, surface.yMin + 1, surface.yMax - 0.4), 0.025),
                clearanceBudget: { width, height: 1.2 },
            });
            opportunities.push({
                id: `${surface.id}:hardware:${index}`, role: 'wall-mounted-prop-zone', ...base,
                transform: pointForSurface(surface, u, clamp(surface.yMin + 2.05, surface.yMin + 1.2, surface.yMax - 0.35), 0.04),
                clearanceBudget: { width, height: 1.4 },
            });
        });

        for (const aperture of apertures.filter(item => item.surfaceId === surface.id && item.traversable)) {
            const left = aperture.uMin - 0.55;
            const right = aperture.uMax + 0.55;
            for (const [ordinal, u] of [left, right].entries()) {
                if (u <= -surface.half + 0.25 || u >= surface.half - 0.25) continue;
                opportunities.push({
                    id: `${aperture.id}:beside:${ordinal}`, role: 'beside-door-zone', surfaceId: surface.id,
                    hostId: surface.entityId, entityId: surface.entityId, moduleKey: surface.moduleKey,
                    facadeIndex: surface.facadeIndex, side: surface.side, exposure: surface.exposure,
                    u, along: surface.half > 0 ? clamp(u / surface.half, -0.92, 0.92) : 0,
                    contextId: context?.id ?? null, apertureId: aperture.id,
                    spatialTopologyHostId: surface.id,
                    transform: pointForSurface(surface, u, surface.yMin, 0.16),
                    clearanceBudget: { width: 0.55, depth: 0.65 },
                });
            }
        }
    }
    return opportunities;
}

function roofOpportunities(payload, contextByEntity) {
    const opportunities = [];
    for (const entity of payload?.entities ?? []) {
        if (entity.kind !== 'building' && entity.kind !== 'district-landmark') continue;
        const floorH = finite(entity.floorH, 3.15);
        for (const module of entity.footprintModules ?? []) {
            const y = Math.max(0, finite(module.floors, 1)) * floorH;
            if (module.halfX < 0.45 || module.halfZ < 0.45) continue;
            opportunities.push({
                id: `${entity.id}:roof:${module.key}:utility`, role: 'roof-utility-zone', hostId: entity.id,
                entityId: entity.id, moduleKey: module.key, floor: Math.max(0, finite(module.floors, 1) - 1),
                contextId: contextByEntity.get(entity.id)?.id ?? null,
                transform: { x: module.cx, y, z: module.cz, rotY: 0 },
                bounds: { x: module.cx, z: module.cz, halfX: Math.max(0.2, module.halfX - 0.28), halfZ: Math.max(0.2, module.halfZ - 0.28), y },
                clearanceBudget: { width: Math.max(0.4, module.halfX * 2 - 0.56), depth: Math.max(0.4, module.halfZ * 2 - 0.56) },
                layer: verticalLayer(y, module.floors),
            });
        }
    }
    return opportunities;
}

function connectorOpportunities(payload, surfaces, contextByEntity) {
    const result = [];
    for (const connector of payload?.physics?.semanticConnectors ?? []) {
        (connector.endpoints ?? []).forEach((endpoint, index) => {
            const surface = endpoint?.side ? bestSurfaceForEndpoint(surfaces, endpoint, connector.metadata?.entityId ?? null) : null;
            const entityId = surface?.entityId ?? connector.metadata?.entityId ?? null;
            result.push({
                id: `${connector.id}:approach:${index}`, role: 'connector-adjacent-zone', connectorId: connector.id,
                hostId: entityId, entityId, surfaceId: surface?.id ?? null, contextId: contextByEntity.get(entityId)?.id ?? null,
                spatialTopologyHostId: connector.id,
                transform: { x: finite(endpoint?.x), y: finite(endpoint?.y), z: finite(endpoint?.z), rotY: finite(endpoint?.rotY) },
                reservationIds: connector.reservations?.map(item => item.id) ?? [],
                layer: verticalLayer(finite(endpoint?.y)),
                navigationalPriority: connector.kind === 'stair' || connector.kind === 'bridge' ? 'high' : 'secondary',
                decorationMayIntrude: false,
            });
        });
    }
    return result;
}

function roleForTask(task) {
    if (task.kind === 'sign' || task.kind === 'awning') return 'facade-sign-zone';
    if (task.kind === 'flyer' || task.kind === 'graffiti') return 'facade-poster-zone';
    if (task.kind === 'security' || task.kind === 'pipe') return 'wall-mounted-prop-zone';
    if (task.kind === 'street-fixture') return 'beside-door-zone';
    if (task.kind === 'roof-clutter' || task.kind === 'roof-topper') return 'roof-utility-zone';
    if (String(task.kind ?? '').startsWith('semantic-')) return 'interior-floor-zone';
    return null;
}

function chooseOpportunity(task, opportunities) {
    const role = roleForTask(task);
    if (!role || role === 'interior-floor-zone') return null;
    const entityPool = opportunities.filter(item => item.role === role && (!task.entityId || item.entityId === task.entityId));
    if (!entityPool.length) return null;
    const sidePool = task.side ? entityPool.filter(item => item.side === task.side) : [];
    const pool = sidePool.length ? sidePool : entityPool;
    pool.sort((a, b) => a.id.localeCompare(b.id));
    return pool[(finite(task.seed) >>> 0) % pool.length];
}

function compactContext({ chunk, entity, program = null, floor = 0, y = 0, district }) {
    const resolvedProgram = program ?? programForEntity(entity);
    return {
        id: `${chunk.key}:${entity?.id ?? 'world'}:context:${floor}:${resolvedProgram}`,
        chunkKey: chunk.key,
        districtId: `district:${chunk.key}`,
        districtFamily: district.family,
        entityId: entity?.id ?? null,
        structureId: entity?.id ?? null,
        program: resolvedProgram,
        physicalUseFamily: entity?.physicalUse?.family ?? null,
        archetype: entity?.archetype ?? null,
        floor,
        elevation: y,
        layer: verticalLayer(y, floor),
        provenance: entity?.semanticChunkKey ? 'procedural-fabric' : 'generated',
    };
}

function debugLabel(context, opportunity) {
    const district = String(context?.districtFamily ?? 'UNKNOWN').toUpperCase();
    const program = String(context?.program ?? 'MIXED').replace(/_/g, ' ').toUpperCase();
    const layer = String(context?.layer ?? opportunity?.layer ?? 'STREET').toUpperCase();
    return [`[ DISTRICT: ${district} ]`, `PROGRAM: ${program}  LAYER: ${layer}`];
}

export function compileSemanticContext({ chunk, payload, tasks = [], debugWeight = 0.18 } = {}) {
    if (!chunk || !payload || !Array.isArray(tasks)) throw new Error('compileSemanticContext requires chunk, payload, and tasks');
    const district = { id: `district:${chunk.key}`, family: districtFamily(chunk), chunkKey: chunk.key, seed: chunk.seed >>> 0 };
    const entityContexts = [];
    const contextByEntity = new Map();
    for (const entity of payload.entities ?? []) {
        const context = compactContext({ chunk, entity, district });
        entityContexts.push(context);
        contextByEntity.set(entity.id, context);
        entity.semanticContextId = context.id;
    }

    const spatialTopology = compileSpatialTopologyGraph({ chunk, payload });
    const surfaces = spatialTopology.surfaces;
    const apertures = spatialTopology.apertures;
    for (const surface of surfaces) surface.apertureIds = apertures.filter(item => item.surfaceId === surface.id).map(item => item.id);

    const opportunities = [
        ...facadeOpportunities(surfaces, apertures, contextByEntity),
        ...roofOpportunities(payload, contextByEntity),
        ...connectorOpportunities(payload, surfaces, contextByEntity),
    ];

    const destinations = (payload.semanticSpaces ?? []).map(space => ({
        id: `${space.id}:destination`, kind: 'semantic-destination', spaceId: space.id, entityId: space.entityId,
        program: space.program ?? 'mixed', requestedProgram: space.requestedProgram ?? space.program ?? 'mixed',
        connectorIds: [...(space.connectorIds ?? [])], bounds: { ...space.bounds },
        layer: verticalLayer(space.yBase, space.floor),
        contextId: `${chunk.key}:${space.entityId}:context:${space.floor}:${space.program ?? 'mixed'}`,
    }));

    const contextBySpace = new Map();
    for (const space of payload.semanticSpaces ?? []) {
        const entity = entityById(payload, space.entityId);
        const context = compactContext({ chunk, entity, program: space.program, floor: space.floor, y: space.yBase, district });
        context.spaceId = space.id;
        context.destinationId = `${space.id}:destination`;
        contextBySpace.set(space.id, context);
        space.semanticContext = context;
        space.semanticContextId = context.id;
    }

    let integrated = 0;
    let debugSigns = 0;
    const debugEnabled = (hash32(`${chunk.key}:semantic-debug`) % 10000) < Math.floor(clamp(debugWeight, 0, 1) * 10000);
    let debugClaimed = false;
    for (const task of tasks) {
        const entity = entityById(payload, task.entityId);
        const opportunity = chooseOpportunity(task, opportunities);
        const context = task.spaceId ? contextBySpace.get(task.spaceId) : contextByEntity.get(task.entityId);
        task.semanticContext = context ?? null;
        task.semanticContextId = context?.id ?? null;
        task.semanticOpportunityId = opportunity?.id ?? null;
        task.semanticHostId = opportunity?.surfaceId ?? opportunity?.hostId ?? task.entityId ?? null;
        task.spatialTopologyHostId = opportunity?.spatialTopologyHostId ?? task.spaceId ?? task.semanticHostId ?? null;
        if (!opportunity) continue;
        integrated++;
        if (Number.isInteger(opportunity.facadeIndex)) task.facadeIndex = opportunity.facadeIndex;
        if (opportunity.side) task.side = opportunity.side;
        if (Number.isFinite(opportunity.along)) task.along = opportunity.along;
        if (Number.isFinite(opportunity.transform?.y) && task.kind !== 'street-fixture') task.y = opportunity.transform.y;
        if (task.kind === 'sign' && debugEnabled && !debugClaimed) {
            const [title, subtitle] = debugLabel(context ?? contextByEntity.get(task.entityId), opportunity);
            task.title = title;
            task.subtitle = subtitle;
            task.semanticDebug = true;
            debugClaimed = true;
            debugSigns++;
        }
    }

    const instances = [];
    for (const placement of payload.semanticPlacements ?? []) {
        const context = contextBySpace.get(placement.spaceId) ?? contextByEntity.get(placement.entityId) ?? null;
        placement.semanticContextId = context?.id ?? null;
        placement.semanticHostId = placement.spaceId ?? placement.entityId ?? null;
        instances.push({
            id: placement.instanceId, assetId: placement.assetId, entityId: placement.entityId, spaceId: placement.spaceId,
            hostId: placement.semanticHostId, contextId: placement.semanticContextId,
            spatialTopologyId: placement.spatialTopologyId ?? placement.instanceId,
            deterministicSeedBasis: placement.instanceId,
            transform: { x: placement.x, y: placement.y, z: placement.z, rotY: placement.rotY },
            role: placement.mode ?? 'semantic-placement', relationTo: placement.relationTo ?? null,
            reservationId: placement.reservation?.ownerId ? `${placement.reservation.ownerId}:envelope` : null,
        });
    }

    const reservations = spatialTopology.reservations.map(item => ({
        id: item.id ?? null, kind: item.kind ?? 'circulation', connectorId: item.connectorId ?? item.metadata?.connectorId ?? null,
        source: item.source ?? null, yMin: finite(item.yMin), yMax: finite(item.yMax),
    }));
    const connectors = spatialTopology.connectors.map(connector => ({
        id: connector.id, kind: connector.kind, fromSpaceId: connector.fromSpaceId ?? null, toSpaceId: connector.toSpaceId ?? null,
        apertureIds: [...(connector.apertureIds ?? [])],
        reservationIds: [...(connector.reservationIds ?? [])],
        realized: true,
    }));

    const semanticContext = {
        schema: SEMANTIC_CONTEXT_SCHEMA,
        ownerId: payload.ownerId ?? null,
        chunk: { key: chunk.key, x: chunk.x ?? null, z: chunk.z ?? null, seed: chunk.seed >>> 0 },
        district,
        entities: entityContexts,
        spaces: [...contextBySpace.values()],
        surfaces,
        apertures,
        connectors,
        reservations,
        destinations,
        opportunities,
        instances,
        spatialTopology,
        stats: { integratedTasks: integrated, debugSigns, surfaces: surfaces.length, apertures: apertures.length, opportunities: opportunities.length, destinations: destinations.length, instances: instances.length, topologyEdges: spatialTopology.edges.length, topologyOrphans: spatialTopology.stats.orphanReservations + spatialTopology.stats.orphanApertures + spatialTopology.stats.unboundEntranceFaces },
    };
    payload.semanticContext = semanticContext;
    return semanticContext;
}
