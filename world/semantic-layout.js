import { ensureSemanticConnectorAuthority } from './semantic-connectors.js';
import { compileSemanticContext } from './semantic-context.js';
import { createSemanticPlacementRecord, resolveSemanticPlacement } from './semantic-placement.js';
import { compileSpacePlans, spacePlanAcceptsBox } from './space-plan.js';
import { chooseCompatibleProgram, programCompatibleWithPhysicalUse, programsForPhysicalUse } from './physical-use.js';

function semanticTask(task) {
    return String(task?.kind ?? '').startsWith('semantic-');
}

function phaseRank(task) {
    if (task?.kind === 'semantic-identity') return 0;
    if (task?.kind === 'semantic-functional') return 1;
    if (task?.kind === 'semantic-life') return 2;
    return 3;
}

const SEMANTIC_DENSITY_MULTIPLIER = Object.freeze({ identity: 2, functional: 3, life: 4 });
function densityCopies(task) { return SEMANTIC_DENSITY_MULTIPLIER[semanticPhase(task)] ?? 1; }
function densitySeed(seed, ordinal) {
    let x = ((seed >>> 0) ^ Math.imul(ordinal + 1, 0x9e3779b1)) >>> 0;
    x ^= x >>> 16; x = Math.imul(x, 0x85ebca6b) >>> 0;
    x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35) >>> 0;
    return (x ^ (x >>> 16)) >>> 0;
}

function roomKey(siteKey, moduleKey, floor) {
    return `${siteKey}:${moduleKey}:floor:${floor}`;
}

export function semanticSpaceId(chunkKey, siteKey, moduleKey, floor) {
    return `${chunkKey}:${roomKey(siteKey, moduleKey, floor)}`;
}

function reservationOverlaps(a, b) {
    if (a.yMin >= b.yMax || a.yMax <= b.yMin) return false;
    return a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;
}

function normalizedReservation(reservation, ownerId) {
    return {
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
}

function reserveSemanticEnvelope(payload, reservation, ownerId, spacePlan) {
    const next = normalizedReservation(reservation, ownerId);
    if (spacePlan && !spacePlanAcceptsBox(spacePlan, next, { allowCirculation: false, requireSameRegion: true })) return false;
    const detail = payload.detailReservations ?? (payload.detailReservations = []);
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

function semanticPhase(task) {
    if (task?.kind === 'semantic-identity') return 'identity';
    if (task?.kind === 'semantic-life') return 'life';
    return 'functional';
}

function assetPhase(def) {
    if (def?.importance === 'identity') return 'identity';
    if (def?.importance === 'narrative') return 'life';
    return 'functional';
}

function assetValues(assetById) {
    if (assetById?.values) return [...assetById.values()];
    return Object.values(assetById ?? {});
}

function destinationTaskGroupKey(chunk, payload, task) {
    const entity = findEntity(payload, task.entityId);
    const module = findModule(entity, task.moduleKey);
    if (!entity || !module) return `missing:${task.entityId}:${task.moduleKey}:${task.floor ?? 0}`;
    const floor = Math.max(0, Math.min((module.floors || 1) - 1, task.floor || 0));
    const siteKey = entity.semanticSiteKey ?? entity.siteId ?? entity.id;
    return semanticSpaceId(chunk.key, siteKey, module.key, floor);
}

function compileDestinationCompatibility({ chunk, payload, tasks, assetById }) {
    const raw = tasks.filter(semanticTask);
    const groups = new Map();
    for (const task of raw) {
        const key = destinationTaskGroupKey(chunk, payload, task);
        const group = groups.get(key) ?? [];
        group.push(task);
        groups.set(key, group);
    }

    const allAssets = assetValues(assetById).filter(def => def?.id);
    const poolCache = new Map();
    const poolFor = (program, phase) => {
        const key = `${program}:${phase}`;
        if (poolCache.has(key)) return poolCache.get(key);
        const pool = allAssets
            .filter(def => (def.programs ?? []).includes(program) && assetPhase(def) === phase)
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));
        poolCache.set(key, pool);
        return pool;
    };

    const compiled = [];
    let remappedSpaces = 0;
    let remappedTasks = 0;
    let rejectedTasks = 0;

    for (const [spaceKey, group] of groups) {
        const entity = findEntity(payload, group[0]?.entityId);
        const physicalUse = entity?.physicalUse ?? null;
        const requestedProgram = group[0]?.program ?? null;
        if (!physicalUse || !requestedProgram || programCompatibleWithPhysicalUse(requestedProgram, physicalUse)) {
            for (const task of group) {
                task.physicalUseFamily = physicalUse?.family ?? null;
                compiled.push(task);
            }
            continue;
        }

        const availablePrograms = programsForPhysicalUse(physicalUse).filter(program =>
            allAssets.some(def => (def.programs ?? []).includes(program)));
        const program = chooseCompatibleProgram({
            programs: availablePrograms,
            physicalUse,
            stableKey: `${spaceKey}:destination`,
        });
        if (!program) {
            for (const task of group) {
                task.destinationRejectedReason = 'no-program-compatible-with-physical-use';
                rejectedTasks++;
            }
            continue;
        }

        remappedSpaces++;
        for (const task of group) {
            const phase = semanticPhase(task);
            const pool = poolFor(program, phase);
            if (!pool.length) {
                task.destinationRejectedReason = `no-${phase}-assets-for-compatible-program`;
                rejectedTasks++;
                continue;
            }
            const replacement = pool[(task.seed >>> 0) % pool.length];
            task.requestedProgram = task.program;
            task.program = program;
            task.assetId = replacement.id;
            task.physicalUseFamily = physicalUse.family;
            task.destinationCompatibility = 'remapped-before-realization';
            compiled.push(task);
            remappedTasks++;
        }
    }

    return { tasks: compiled, remappedSpaces, remappedTasks, rejectedTasks };
}

function publishSpace(payload, spaceById, plan, task) {
    if (spaceById.has(plan.id)) return spaceById.get(plan.id);
    const entity = findEntity(payload, plan.entityId);
    const space = {
        id: plan.id,
        kind: 'destination-space',
        spacePlanId: plan.id,
        spacePlanSchema: plan.schema,
        chunkKey: plan.chunkKey,
        entityId: plan.entityId,
        moduleKey: plan.moduleKey,
        floor: plan.floor,
        floorH: plan.floorH,
        yBase: plan.yBase,
        program: task.program,
        requestedProgram: task.requestedProgram ?? task.program,
        physicalUse: entity?.physicalUse ?? null,
        physicalTruth: entity?.physicalTruth ?? null,
        bounds: { ...plan.bounds },
        regionCount: plan.regions.length,
        usableCellCount: plan.usableCells.length,
        connectorIds: [...(plan.connectorIds ?? [])],
    };
    const spaces = payload.semanticSpaces ?? (payload.semanticSpaces = []);
    spaces.push(space);
    spaceById.set(space.id, space);
    const entitySpaces = entity?.semanticSpaceIds ?? (entity ? (entity.semanticSpaceIds = []) : null);
    if (entitySpaces && !entitySpaces.includes(space.id)) entitySpaces.push(space.id);
    return space;
}

export function solveSemanticLayout({ chunk, payload, tasks, assetById } = {}) {
    if (!chunk || !payload || !Array.isArray(tasks) || !assetById) {
        throw new Error('solveSemanticLayout requires chunk, payload, tasks, and assetById');
    }
    const placements = payload.semanticPlacements ?? (payload.semanticPlacements = []);
    const spaces = payload.semanticSpaces ?? (payload.semanticSpaces = []);
    const spaceById = new Map(spaces.map(space => [space.id, space]));

    const destinationCompatibility = compileDestinationCompatibility({ chunk, payload, tasks, assetById });
    const baseSemanticTasks = destinationCompatibility.tasks;
    const semanticTasks = baseSemanticTasks;
    const densityReplicas = [];
    const densityPlanned = baseSemanticTasks.reduce((sum, task) => sum + densityCopies(task), 0);
    const activeSpaceIds = new Set();
    for (const task of semanticTasks) {
        const entity = findEntity(payload, task.entityId);
        const module = findModule(entity, task.moduleKey);
        if (!entity || !module) continue;
        const floor = Math.max(0, Math.min((module.floors || 1) - 1, task.floor || 0));
        const siteKey = entity.semanticSiteKey ?? entity.siteId ?? entity.id;
        activeSpaceIds.add(task.spaceId || semanticSpaceId(chunk.key, siteKey, module.key, floor));
    }
    const spacePlans = compileSpacePlans({ chunk, payload, activeSpaceIds });
    const planById = new Map(spacePlans.map(plan => [plan.id, plan]));
    const connectorAuthority = ensureSemanticConnectorAuthority(payload.physics, payload.semanticTopologySpaces ?? spacePlans);
    for (const plan of spacePlans) {
        plan.connectorIds = (payload.physics?.semanticConnectors ?? [])
            .filter(connector => connector.spaceIds?.includes(plan.id) || connector.fromSpaceId === plan.id || connector.toSpaceId === plan.id)
            .map(connector => connector.id);
    }

    const pending = [...semanticTasks].sort((a, b) => phaseRank(a) - phaseRank(b) || Number(!!a.densityReplica) - Number(!!b.densityReplica) || (a.seed >>> 0) - (b.seed >>> 0));
    let solved = 0;
    let densitySolved = 0;
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
            const spacePlan = planById.get(spaceId);
            if (!spacePlan || !spacePlan.usableCells.length) {
                i++;
                continue;
            }
            publishSpace(payload, spaceById, spacePlan, task);
            const instanceId = task.instanceId || `${spaceId}:semantic:${task.seed >>> 0}`;
            const placement = resolveSemanticPlacement({
                def,
                graph: def.semanticGraph ?? null,
                module,
                spacePlan,
                yBase: floor * floorH,
                floorH,
                seed: task.seed,
                placements,
                entityId: task.entityId,
                moduleKey: module.key,
                floor,
                spaceId,
                tryReserve: reservation => reserveSemanticEnvelope(payload, reservation, instanceId, spacePlan),
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
            const semanticCollision = collisionItems(def, task.semanticPlacement);
            task.topologyDescriptors = semanticCollision.map((item, index) => {
                const id = `${instanceId}:collider:${index}`;
                return {
                    id, kind: 'props', taskKind: task.kind, entityId: task.entityId,
                    spaceId, moduleKey: module.key, floor,
                    item: { ...item, topologyDescriptorId: id, topologyTaskKind: task.kind, topologyOwnerId: instanceId },
                };
            });
            task.topologySolved = true;
            for (const descriptor of task.topologyDescriptors) payload.physics?.props?.push?.(descriptor.item);
            pending.splice(i, 1);
            if (task.densityReplica) {
                densitySolved++;
            } else {
                solved++;
                const copies = densityCopies(task);
                for (let ordinal = 1; ordinal < copies; ordinal++) {
                    const replica = {
                        ...task,
                        seed: densitySeed(task.seed, ordinal),
                        densityReplica: ordinal,
                        densityParentSeed: task.seed >>> 0,
                        instanceId: null,
                        semanticPlacement: null,
                        topologyDescriptors: null,
                        topologySolved: false,
                    };
                    densityReplicas.push(replica);
                    tasks.push(replica);
                    pending.push(replica);
                }
            }
            progress++;
        }
        if (!progress) break;
    }

    const semanticContext = compileSemanticContext({ chunk, payload, tasks });

    return {
        schema: 'jweb.semantic-layout.v2',
        planned: baseSemanticTasks.length,
        solved,
        unresolved: pending.filter(task => !task.densityReplica).length,
        densityPlanned,
        densitySolved: solved + densitySolved,
        densityUnresolved: Math.max(0, densityPlanned - solved - densitySolved),
        densityReplicas: densityReplicas.length,
        passes,
        spaces: spaces.length,
        spacePlans: spacePlans.length,
        topologySpaces: payload.semanticTopologySpaces?.length ?? spacePlans.length,
        placements: placements.length,
        destinationCompatibility: {
            remappedSpaces: destinationCompatibility.remappedSpaces,
            remappedTasks: destinationCompatibility.remappedTasks,
            rejectedTasks: destinationCompatibility.rejectedTasks,
        },
        connectorAuthority,
        semanticContext: semanticContext.stats,
    };
}
