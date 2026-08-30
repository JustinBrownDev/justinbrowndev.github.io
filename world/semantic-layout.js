import { createSemanticPlacementRecord, resolveSemanticPlacement } from './semantic-placement.js';

function semanticTask(task) {
    return String(task?.kind ?? '').startsWith('semantic-');
}

function phaseRank(task) {
    if (task?.kind === 'semantic-identity') return 0;
    if (task?.kind === 'semantic-functional') return 1;
    if (task?.kind === 'semantic-life') return 2;
    return 3;
}

function roomKey(siteKey, moduleKey, floor) {
    return `${siteKey}:${moduleKey}:floor:${floor}`;
}

export function semanticSpaceId(chunkKey, siteKey, moduleKey, floor) {
    return `${chunkKey}:${roomKey(siteKey, moduleKey, floor)}`;
}

function structuralIntersects(reservation, box) {
    if (box.yMin >= reservation.yMax || box.yMax <= reservation.yMin) return false;
    const minX = reservation.minX ?? reservation.x - reservation.halfX;
    const maxX = reservation.maxX ?? reservation.x + reservation.halfX;
    const minZ = reservation.minZ ?? reservation.z - reservation.halfZ;
    const maxZ = reservation.maxZ ?? reservation.z + reservation.halfZ;
    return box.x + box.halfX > minX && box.x - box.halfX < maxX && box.z + box.halfZ > minZ && box.z - box.halfZ < maxZ;
}

function reservationOverlaps(a, b) {
    if (a.yMin >= b.yMax || a.yMax <= b.yMin) return false;
    return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

function reserveSemanticEnvelope(payload, reservation, ownerId) {
    const structural = payload?.physics?.circulationReservations ?? [];
    if (structural.some(item => structuralIntersects(item, reservation))) return false;
    const detail = payload.detailReservations ?? (payload.detailReservations = []);
    const next = {
        id: `${ownerId}:envelope`,
        kind: 'semantic-envelope',
        ownerId,
        x: reservation.x,
        z: reservation.z,
        halfX: reservation.halfX,
        halfZ: reservation.halfZ,
        minX: reservation.x - reservation.halfX,
        maxX: reservation.x + reservation.halfX,
        minZ: reservation.z - reservation.halfZ,
        maxZ: reservation.z + reservation.halfZ,
        yMin: reservation.yMin,
        yMax: reservation.yMax,
    };
    for (const other of detail) {
        const normalized = Number.isFinite(other.minX) ? other : {
            ...other,
            minX: other.x - other.halfX,
            maxX: other.x + other.halfX,
            minZ: other.z - other.halfZ,
            maxZ: other.z + other.halfZ,
        };
        if (reservationOverlaps(next, normalized)) return false;
    }
    detail.push(next);
    return true;
}

function shouldCollide(def) {
    if (!def || def.mount === 'wall') return false;
    if (def.collision === 'decorative-box-recommended') return true;
    const kind = String(def.kind || def.semanticClass || '');
    return /(chair|stool|table|desk|bench|counter|cabinet|rack|bed|boiler|machine|lift|stove|washer|dryer|shelf|chest|locker|case|plinth|safe|piano|pool_table|workbench|cart|pew|sofa|armchair|bookcase|gondola|freezer|refrigerator|press|projector|console)/i.test(kind);
}

function collisionItems(def, placement) {
    if (!shouldCollide(def)) return [];
    const dims = def.dimensionsXYZ ?? [0.6, 0.8, 0.6];
    const min = def.boundsMin ?? [-dims[0] * 0.5, 0, -dims[2] * 0.5];
    const width = Math.max(0.18, Number(dims[0]) || 0.6);
    const height = Math.max(0.12, Number(dims[1]) || 0.8);
    const depth = Math.max(0.18, Number(dims[2]) || 0.6);
    const major = Math.max(width, depth);
    const minor = Math.min(width, depth);
    const pieces = major / Math.max(0.12, minor) > 2.2 ? Math.min(3, Math.ceil(major / Math.max(0.55, minor * 1.6))) : 1;
    const result = [];
    const alongX = width >= depth;
    const yMin = placement.y + (Number(min[1]) || 0);
    for (let i = 0; i < pieces; i++) {
        const t = pieces === 1 ? 0 : (i / (pieces - 1) - 0.5) * Math.max(0, major - minor);
        const lx = alongX ? t : 0;
        const lz = alongX ? 0 : t;
        const x = placement.x + Math.cos(placement.rotY) * lx + Math.sin(placement.rotY) * lz;
        const z = placement.z - Math.sin(placement.rotY) * lx + Math.cos(placement.rotY) * lz;
        result.push({ x, z, radius: Math.max(0.16, Math.min(0.62, minor * 0.46)), yMin, height: yMin + height, supportKind: 'semantic-prop' });
    }
    return result;
}

function findEntity(payload, id) {
    return payload?.entities?.find(entity => entity.id === id) ?? null;
}

function findModule(entity, key) {
    return entity?.footprintModules?.find(module => module.key === key) ?? null;
}

export function solveSemanticLayout({ chunk, payload, tasks, assetById } = {}) {
    if (!chunk || !payload || !Array.isArray(tasks) || !assetById) {
        throw new Error('solveSemanticLayout requires chunk, payload, tasks, and assetById');
    }
    const placements = payload.semanticPlacements ?? (payload.semanticPlacements = []);
    const spaces = payload.semanticSpaces ?? (payload.semanticSpaces = []);
    const spaceById = new Map(spaces.map(space => [space.id, space]));
    const pending = tasks.filter(semanticTask).sort((a, b) => phaseRank(a) - phaseRank(b) || (a.seed >>> 0) - (b.seed >>> 0));
    let solved = 0;
    let passes = 0;

    for (let pass = 0; pass < Math.max(2, pending.length + 1) && pending.length; pass++) {
        passes++;
        let progress = 0;
        for (let i = 0; i < pending.length;) {
            const task = pending[i];
            const entity = findEntity(payload, task.entityId);
            const module = findModule(entity, task.moduleKey);
            const def = assetById.get ? assetById.get(task.assetId) : assetById[task.assetId];
            if (!entity || !module || !def) {
                pending.splice(i, 1);
                continue;
            }
            const floorH = entity.floorH || 3.15;
            const floor = Math.max(0, Math.min((module.floors || 1) - 1, task.floor || 0));
            const siteKey = entity.semanticSiteKey ?? entity.siteId ?? entity.id;
            const spaceId = task.spaceId || semanticSpaceId(chunk.key, siteKey, module.key, floor);
            const instanceId = task.instanceId || `${spaceId}:semantic:${task.seed >>> 0}`;
            if (!spaceById.has(spaceId)) {
                const space = {
                    id: spaceId,
                    kind: 'destination-space',
                    chunkKey: chunk.key,
                    entityId: task.entityId,
                    moduleKey: module.key,
                    floor,
                    floorH,
                    yBase: floor * floorH,
                    program: task.program,
                };
                spaces.push(space);
                spaceById.set(spaceId, space);
                const entitySpaces = entity.semanticSpaceIds ?? (entity.semanticSpaceIds = []);
                if (!entitySpaces.includes(spaceId)) entitySpaces.push(spaceId);
            }
            const placement = resolveSemanticPlacement({
                def,
                graph: def.semanticGraph ?? null,
                module,
                yBase: floor * floorH,
                floorH,
                seed: task.seed,
                placements,
                entityId: task.entityId,
                moduleKey: module.key,
                floor,
                tryReserve: reservation => reserveSemanticEnvelope(payload, reservation, instanceId),
            });
            if (!placement) {
                i++;
                continue;
            }
            task.spaceId = spaceId;
            task.instanceId = instanceId;
            task.semanticPlacement = {
                x: placement.x,
                y: placement.y,
                z: placement.z,
                rotY: placement.rotY,
                mode: placement.mode,
                relationTo: placement.relationTo ?? null,
                reservation: placement.reservation ?? null,
                spaceId,
                instanceId,
            };
            const record = createSemanticPlacementRecord({
                def,
                graph: def.semanticGraph ?? null,
                placement: task.semanticPlacement,
                instanceId,
                spaceId,
                entityId: task.entityId,
                moduleKey: module.key,
                floor,
                program: task.program,
            });
            placements.push(record);
            for (const item of collisionItems(def, task.semanticPlacement)) payload.physics?.props?.push?.(item);
            pending.splice(i, 1);
            solved++;
            progress++;
        }
        if (!progress) break;
    }

    return {
        schema: 'jweb.semantic-layout.v1',
        planned: tasks.filter(semanticTask).length,
        solved,
        unresolved: pending.length,
        passes,
        spaces: spaces.length,
        placements: placements.length,
    };
}
