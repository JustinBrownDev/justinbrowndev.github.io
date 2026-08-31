import { compileSpatialTopologyGraph } from './spatial-topology.js';
import { bindSemanticExteriorPlacement, chooseSemanticExteriorOpportunity } from './semantic-exterior-authority.js';

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

function facadeHardwareSlots(surface, lo, hi, intervalIndex) {
    const width = Math.max(0, hi - lo);
    const yMin = finite(surface.yMin);
    const yMax = finite(surface.yMax, yMin + 2.6);
    const low = Math.min(yMax - 0.35, yMin + 2.05);
    const high = yMax - 0.45;
    if (width < 0.55 || high < low) return [];

    // Facades are two-dimensional decoration surfaces. Density is derived from
    // physical width/height, not from how many payload objects happen to own the
    // same neighborhood. This keeps authored spawn and ordinary streamed chunks
    // on the same visual law.
    const columns = clamp(Math.ceil(width / 2.65), 1, 4);
    const rows = clamp(Math.floor((high - low) / 2.55) + 1, 1, 7);
    const slots = [];
    for (let row = 0; row < rows; row++) {
        const y = rows === 1 ? low : low + (high - low) * (row / Math.max(1, rows - 1));
        const floor = Math.max(0, Math.floor((y - yMin) / 3.15));
        for (let col = 0; col < columns; col++) {
            const cellLo = lo + width * (col / columns);
            const cellHi = lo + width * ((col + 1) / columns);
            const u = (cellLo + cellHi) * 0.5;
            slots.push({
                id: `${surface.id}:hardware-grid:${intervalIndex}:${row}:${col}`,
                role: 'wall-mounted-prop-zone',
                surfaceId: surface.id,
                hostId: surface.entityId,
                entityId: surface.entityId,
                moduleKey: surface.moduleKey,
                facadeIndex: surface.facadeIndex,
                side: surface.side,
                exposure: surface.exposure,
                u,
                along: surface.half > 0 ? clamp(u / surface.half, -0.94, 0.94) : 0,
                availableWidth: cellHi - cellLo,
                contextId: null,
                spatialTopologyHostId: surface.id,
                transform: pointForSurface(surface, u, y, 0.045),
                clearanceBudget: {
                    width: Math.max(0.48, Math.min(1.75, (cellHi - cellLo) * 0.82)),
                    height: Math.max(0.58, Math.min(1.65, rows > 1 ? 1.45 : high - low + 0.45)),
                },
                layer: verticalLayer(y, floor),
                facadeBand: row === 0 ? 'street' : y >= 18 ? 'upper' : y >= 7 ? 'mid' : 'lower',
                shellPriority: row < 2 ? 'first-pass' : 'deepen',
            });
        }
    }
    return slots;
}

function facadeOpportunities(surfaces, apertures, contextByEntity) {
    const opportunities = [];
    for (const surface of surfaces) {
        const context = contextByEntity.get(surface.entityId);
        const intervals = freeIntervals(surface, apertures);
        const tangent = surfaceTangent(surface);
        const surfaceFrame = {
            tangentX: tangent.x, tangentZ: tangent.z,
            normalX: surface.normalX, normalZ: surface.normalZ,
        };
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
                surfaceFrame,
                decorationMayIntrude: true,
            };
            const signY = clamp(surface.yMin + 2.3 + index * 0.7, surface.yMin + 1.9, Math.max(surface.yMin + 2, surface.yMax - 0.55));
            opportunities.push({
                id: `${surface.id}:sign:${index}`, role: 'facade-sign-zone', ...base,
                transform: pointForSurface(surface, u, signY, 0.035),
                region: { uMin: lo, uMax: hi, vMin: Math.max(surface.yMin + 1.8, signY - 1.2), vMax: surface.yMax },
                clearanceBudget: { width, height: Math.max(0.5, surface.yMax - signY) },
                layer: verticalLayer(signY), shellPriority: 'first-pass',
            });
            opportunities.push({
                id: `${surface.id}:poster:${index}`, role: 'facade-poster-zone', ...base,
                transform: pointForSurface(surface, u, clamp(surface.yMin + 1.45, surface.yMin + 1, surface.yMax - 0.4), 0.025),
                region: { uMin: lo, uMax: hi, vMin: surface.yMin + 0.35, vMax: Math.min(surface.yMax, surface.yMin + 2.5) },
                clearanceBudget: { width, height: 1.2 },
                layer: 'street', shellPriority: 'deepen',
            });
            opportunities.push({
                id: `${surface.id}:service-band:${index}`, role: 'facade-service-band', ...base,
                transform: pointForSurface(surface, u, clamp(surface.yMin + 2.4, surface.yMin + 1.8, surface.yMax - 0.55), 0.045),
                region: { uMin: lo, uMax: hi, vMin: surface.yMin + 0.35, vMax: Math.max(surface.yMin + 0.5, surface.yMax - 0.35) },
                clearanceBudget: { width, height: Math.max(0.6, surface.yMax - surface.yMin - 0.7) },
                layer: verticalLayer(surface.yMin + 2.4), shellPriority: 'first-pass',
            });
            opportunities.push({
                id: `${surface.id}:ground-edge:${index}`, role: 'ground-edge-zone', ...base,
                transform: pointForSurface(surface, u, surface.yMin, 0.42),
                region: { uMin: lo, uMax: hi, vMin: surface.yMin, vMax: surface.yMin + 2.1 },
                clearanceBudget: { width, depth: 0.85, height: 2.1 },
                layer: 'street', shellPriority: 'deepen',
            });
            for (const slot of facadeHardwareSlots(surface, lo, hi, index)) {
                slot.contextId = context?.id ?? null;
                slot.surfaceFrame = surfaceFrame;
                slot.decorationMayIntrude = true;
                opportunities.push(slot);
            }
        });

        for (const aperture of apertures.filter(item => item.surfaceId === surface.id && item.traversable)) {
            const reservationIds = [...(aperture.clearance ?? [])];
            const connectorHost = aperture.connectorId ?? surface.id;
            const left = aperture.uMin - 0.58;
            const right = aperture.uMax + 0.58;
            for (const [ordinal, u] of [left, right].entries()) {
                if (u <= -surface.half + 0.25 || u >= surface.half - 0.25) continue;
                const common = {
                    surfaceId: surface.id, hostId: surface.entityId, entityId: surface.entityId, moduleKey: surface.moduleKey,
                    facadeIndex: surface.facadeIndex, side: surface.side, exposure: surface.exposure,
                    u, along: surface.half > 0 ? clamp(u / surface.half, -0.92, 0.92) : 0,
                    contextId: context?.id ?? null, apertureId: aperture.id, connectorId: aperture.connectorId ?? null,
                    reservationIds, spatialTopologyHostId: connectorHost, surfaceFrame, decorationMayIntrude: true,
                };
                opportunities.push({
                    id: `${aperture.id}:ground-flank:${ordinal}`, role: 'portal-flank-ground-zone', ...common,
                    transform: pointForSurface(surface, u, surface.yMin, 0.38),
                    clearanceBudget: { width: 0.72, depth: 0.82, height: 2.05 },
                    layer: 'street', shellPriority: 'first-pass', navigationalPriority: 'portal-adjacent',
                });
                opportunities.push({
                    id: `${aperture.id}:beside:${ordinal}`, role: 'beside-door-zone', ...common,
                    transform: pointForSurface(surface, u, surface.yMin, 0.38),
                    clearanceBudget: { width: 0.72, depth: 0.82, height: 2.05 },
                    layer: 'street', shellPriority: 'deepen', navigationalPriority: 'portal-adjacent',
                });
                const flankY = clamp(aperture.vMin + Math.min(1.35, Math.max(0.75, (aperture.vMax - aperture.vMin) * 0.58)), surface.yMin + 0.7, surface.yMax - 0.35);
                opportunities.push({
                    id: `${aperture.id}:wall-flank:${ordinal}`, role: 'portal-flank-wall-zone', ...common,
                    transform: pointForSurface(surface, u, flankY, 0.04),
                    clearanceBudget: { width: 0.62, height: 1.25, depth: 0.42 },
                    layer: verticalLayer(flankY), shellPriority: 'first-pass', navigationalPriority: 'portal-adjacent',
                });
            }
            const lintelY = aperture.vMax + 0.34;
            if (lintelY < surface.yMax - 0.24) {
                const u = (aperture.uMin + aperture.uMax) * 0.5;
                opportunities.push({
                    id: `${aperture.id}:lintel`, role: 'portal-lintel-zone',
                    surfaceId: surface.id, hostId: surface.entityId, entityId: surface.entityId, moduleKey: surface.moduleKey,
                    facadeIndex: surface.facadeIndex, side: surface.side, exposure: surface.exposure,
                    u, along: surface.half > 0 ? clamp(u / surface.half, -0.92, 0.92) : 0,
                    contextId: context?.id ?? null, apertureId: aperture.id, connectorId: aperture.connectorId ?? null,
                    reservationIds, spatialTopologyHostId: connectorHost, surfaceFrame, decorationMayIntrude: true,
                    transform: pointForSurface(surface, u, lintelY, 0.045),
                    clearanceBudget: { width: Math.max(0.8, aperture.uMax - aperture.uMin + 0.4), height: Math.max(0.45, surface.yMax - lintelY), depth: 0.5 },
                    layer: verticalLayer(lintelY), shellPriority: 'first-pass', navigationalPriority: 'portal-adjacent',
                });
            }
        }
    }
    return opportunities;
}

function groundOpportunities(payload, contextByEntity) {
    const result = [];
    for (const entity of payload?.entities ?? []) {
        if (entity.kind !== 'plaza') continue;
        const halfX = Math.max(0.65, finite(entity.halfX, 2) - 0.45);
        const halfZ = Math.max(0.65, finite(entity.halfZ, 2) - 0.45);
        result.push({
            id: `${entity.id}:ground:open`, role: 'ground-open-zone', hostId: entity.id, entityId: entity.id,
            contextId: contextByEntity.get(entity.id)?.id ?? null, spatialTopologyHostId: entity.id,
            transform: { x: finite(entity.x), y: 0, z: finite(entity.z), rotY: 0 },
            bounds: { x: finite(entity.x), z: finite(entity.z), halfX, halfZ, y: 0 },
            clearanceBudget: { width: halfX * 2, depth: halfZ * 2, height: 3.0 },
            layer: 'street', shellPriority: 'first-pass', decorationMayIntrude: true,
        });
    }
    return result;
}

function spanOpportunities(payload, tasks, contextByEntity) {
    const result = [];
    for (const task of tasks) {
        if (task.kind !== 'overhead-cable') continue;
        const a = entityById(payload, task.entityId);
        const b = entityById(payload, task.otherEntityId);
        if (!a || !b) continue;
        const dx = finite(b.x) - finite(a.x), dz = finite(b.z) - finite(a.z);
        const axisX = Math.abs(dx) >= Math.abs(dz);
        const sx = axisX ? Math.sign(dx || 1) : 0;
        const sz = axisX ? 0 : Math.sign(dz || 1);
        const ay = Math.min(finite(a.floors, 2) * finite(a.floorH, 3.15), 8.5) * 0.52;
        const by = Math.min(finite(b.floors, 2) * finite(b.floorH, 3.15), 8.5) * 0.52;
        const start = { x: finite(a.x) + sx * finite(a.halfX, 2), y: ay, z: finite(a.z) + sz * finite(a.halfZ, 2) };
        const end = { x: finite(b.x) - sx * finite(b.halfX, 2), y: by, z: finite(b.z) - sz * finite(b.halfZ, 2) };
        result.push({
            id: `${task.entityId}:service-span:${task.otherEntityId}:${task.seed >>> 0}`, role: 'inter-entity-service-span',
            hostId: task.entityId, entityId: task.entityId, otherEntityId: task.otherEntityId,
            contextId: contextByEntity.get(task.entityId)?.id ?? null, spatialTopologyHostId: task.entityId,
            transform: { x: (start.x + end.x) * 0.5, y: (start.y + end.y) * 0.5, z: (start.z + end.z) * 0.5, rotY: Math.atan2(end.x - start.x, end.z - start.z) },
            span: { start, end }, decorationMayIntrude: true, layer: verticalLayer((start.y + end.y) * 0.5), shellPriority: 'deepen',
        });
    }
    return result;
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
        const reservationIds = connector.reservations?.map(item => item.id) ?? [];
        (connector.endpoints ?? []).forEach((endpoint, index) => {
            const surface = endpoint?.side ? bestSurfaceForEndpoint(surfaces, endpoint, connector.metadata?.entityId ?? null) : null;
            const entityId = surface?.entityId ?? connector.metadata?.entityId ?? null;
            result.push({
                id: `${connector.id}:approach:${index}`, role: 'connector-adjacent-zone', connectorId: connector.id,
                hostId: entityId, entityId, surfaceId: surface?.id ?? null, contextId: contextByEntity.get(entityId)?.id ?? null,
                spatialTopologyHostId: connector.id,
                transform: { x: finite(endpoint?.x), y: finite(endpoint?.y), z: finite(endpoint?.z), rotY: finite(endpoint?.rotY) },
                reservationIds,
                layer: verticalLayer(finite(endpoint?.y)),
                navigationalPriority: connector.kind === 'stair' || connector.kind === 'bridge' || connector.kind === 'fire-escape' ? 'high' : 'secondary',
                decorationMayIntrude: false,
            });
        });

        const sweep = connector.sweep ?? {};
        const entityId = connector.metadata?.entityId ?? null;
        const contextId = contextByEntity.get(entityId)?.id ?? null;
        if ((connector.kind === 'stair' || connector.kind === 'bridge' || connector.kind === 'fire-escape' || connector.kind === 'landing') && sweep.axis && Number.isFinite(sweep.from) && Number.isFinite(sweep.to)) {
            const mid = (sweep.from + sweep.to) * 0.5;
            const offset = Math.max(0.72, finite(sweep.halfWidth, 0.45) + finite(connector.solverEnvelope?.capsuleRadius, 0.28) + 0.42);
            for (const sign of [-1, 1]) {
                const x = sweep.axis === 'x' ? mid : finite(sweep.fixedCoord) + sign * offset;
                const z = sweep.axis === 'x' ? finite(sweep.fixedCoord) + sign * offset : mid;
                result.push({
                    id: `${connector.id}:service-edge:${sign < 0 ? 0 : 1}`, role: 'connector-service-zone', connectorId: connector.id,
                    hostId: entityId, entityId, contextId, spatialTopologyHostId: connector.id,
                    transform: { x, y: finite(sweep.y0), z, rotY: sweep.axis === 'x' ? Math.PI * 0.5 : 0 },
                    reservationIds, clearanceBudget: { width: 0.72, depth: 0.72, height: 2.0 },
                    layer: verticalLayer(finite(sweep.y0)), navigationalPriority: 'high', decorationMayIntrude: true,
                });
            }
        } else if ((connector.kind === 'fire-escape' || connector.kind === 'landing') && Number.isFinite(sweep.x) && Number.isFinite(sweep.z)) {
            const hx = Math.max(0.4, finite(sweep.halfX, 0.5));
            const hz = Math.max(0.4, finite(sweep.halfZ, 0.5));
            const y = finite(sweep.y0);
            const edges = [
                { x: sweep.x - hx - 0.42, z: sweep.z, rotY: Math.PI * 0.5 },
                { x: sweep.x + hx + 0.42, z: sweep.z, rotY: -Math.PI * 0.5 },
                { x: sweep.x, z: sweep.z - hz - 0.42, rotY: 0 },
                { x: sweep.x, z: sweep.z + hz + 0.42, rotY: Math.PI },
            ];
            edges.forEach((point, index) => result.push({
                id: `${connector.id}:service-edge:${index}`, role: 'connector-service-zone', connectorId: connector.id,
                hostId: entityId, entityId, contextId, spatialTopologyHostId: connector.id,
                transform: { ...point, y }, reservationIds,
                clearanceBudget: { width: 0.7, depth: 0.7, height: 2.0 },
                layer: verticalLayer(y), navigationalPriority: 'high', decorationMayIntrude: true,
            }));
        }
    }
    return result;
}

function chooseOpportunity(task, opportunities, claimedOpportunityIds = null) {
    return chooseSemanticExteriorOpportunity(task, opportunities, claimedOpportunityIds);
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
        ...groundOpportunities(payload, contextByEntity),
        ...roofOpportunities(payload, contextByEntity),
        ...connectorOpportunities(payload, surfaces, contextByEntity),
        ...spanOpportunities(payload, tasks, contextByEntity),
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
    const claimedExteriorOpportunities = new Set();
    let debugSigns = 0;
    const debugEnabled = (hash32(`${chunk.key}:semantic-debug`) % 10000) < Math.floor(clamp(debugWeight, 0, 1) * 10000);
    let debugClaimed = false;
    for (const task of tasks) {
        const entity = entityById(payload, task.entityId);
        const opportunity = chooseOpportunity(task, opportunities, claimedExteriorOpportunities);
        const context = task.spaceId ? contextBySpace.get(task.spaceId) : contextByEntity.get(task.entityId);
        task.semanticContext = context ?? null;
        task.semanticContextId = context?.id ?? null;
        task.semanticOpportunityId = opportunity?.id ?? null;
        task.semanticHostId = opportunity?.surfaceId ?? opportunity?.hostId ?? task.entityId ?? null;
        task.spatialTopologyHostId = opportunity?.spatialTopologyHostId ?? task.spaceId ?? task.semanticHostId ?? null;
        if (!opportunity) continue;
        integrated++;
        bindSemanticExteriorPlacement(task, opportunity);
        claimedExteriorOpportunities.add(opportunity.id);
        // Compatibility mirrors only. Realization consumes semanticPlacement.
        if (Number.isInteger(opportunity.facadeIndex)) task.facadeIndex = opportunity.facadeIndex;
        if (opportunity.side) task.side = opportunity.side;
        if (Number.isFinite(opportunity.along)) task.along = opportunity.along;
        if (Number.isFinite(opportunity.transform?.y)) task.y = opportunity.transform.y;
        if (String(task.kind ?? '').startsWith('plaza-')) { task.x = opportunity.transform.x; task.z = opportunity.transform.z; }
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
