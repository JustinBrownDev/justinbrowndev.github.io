import { spacePlanAcceptsBox, spacePlanCandidateCells, spacePlanWallSegments } from './space-plan.js';

const TAU = Math.PI * 2;
const QUARTER = Math.PI * 0.5;

function normalizeAngle(value) {
    let v = value % TAU;
    if (v > Math.PI) v -= TAU;
    if (v < -Math.PI) v += TAU;
    return v;
}

function dimsOf(def) {
    const dims = def?.dimensionsXYZ ?? [0.6, 0.8, 0.6];
    return [
        Math.max(0.04, Number(dims[0]) || 0.6),
        Math.max(0.04, Number(dims[1]) || 0.8),
        Math.max(0.04, Number(dims[2]) || 0.6),
    ];
}

function minOf(def, dims = dimsOf(def)) {
    const min = def?.boundsMin ?? [-dims[0] * 0.5, 0, -dims[2] * 0.5];
    return [Number(min[0]) || 0, Number(min[1]) || 0, Number(min[2]) || 0];
}

function graphList(graph, key) {
    return Array.isArray(graph?.[key]) ? graph[key] : [];
}

function hasGraphValue(graph, key, value) {
    return graphList(graph, key).includes(value);
}

function frontVector(rotY) {
    return { x: Math.sin(rotY), z: Math.cos(rotY) };
}

function rightVector(rotY) {
    return { x: Math.cos(rotY), z: -Math.sin(rotY) };
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return function rng() {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function sameSemanticRoom(placement, context) {
    if (!placement) return false;
    if (context.spaceId && placement.spaceId) return placement.spaceId === context.spaceId;
    return placement.entityId === context.entityId
        && placement.moduleKey === context.moduleKey
        && placement.floor === context.floor;
}

function physicalBottom(placement) {
    return placement.y + minOf(placement.def)[1];
}

function physicalTop(placement) {
    return physicalBottom(placement) + dimsOf(placement.def)[1];
}

function supportsWorkSurface(placement) {
    if (!placement) return false;
    if (placement.def?.sockets?.topSurface === true) return true;
    const graph = placement.graph;
    if (!hasGraphValue(graph, 'capabilities', 'support-surface-provider')) return false;
    return /(desk|table|counter|bench|workbench|cabinet)/i.test(String(placement.def?.kind ?? placement.def?.semanticClass ?? ''));
}

function rowCompatible(placement) {
    return placement && hasGraphValue(placement.graph, 'relationships', 'row-alignable');
}

function candidateBodyBox(def, candidate) {
    const [width, height, depth] = dimsOf(def);
    const min = minOf(def, [width, height, depth]);
    const front = frontVector(candidate.rotY);
    const right = rightVector(candidate.rotY);
    const halfX = Math.abs(right.x) * width * 0.5 + Math.abs(front.x) * depth * 0.5;
    const halfZ = Math.abs(right.z) * width * 0.5 + Math.abs(front.z) * depth * 0.5;
    const yMin = candidate.y + min[1];
    return {
        x: candidate.x, z: candidate.z, halfX, halfZ,
        minX: candidate.x - halfX, maxX: candidate.x + halfX,
        minZ: candidate.z - halfZ, maxZ: candidate.z + halfZ,
        yMin, yMax: yMin + height,
    };
}

function candidateEnvelope(def, graph, candidate) {
    const [width, height, depth] = dimsOf(def);
    const min = minOf(def, [width, height, depth]);
    const front = frontVector(candidate.rotY);
    const right = rightVector(candidate.rotY);
    const clearance = def?.clearance ?? {};
    const keepClear = graph?.circulation?.keepClear ?? [];
    let frontClear = Math.max(0, Number(clearance.front) || 0);
    let rearClear = Math.max(0, Number(clearance.rear) || 0);
    let sideClear = Math.max(0, Number(clearance.sides) || 0);
    for (const item of keepClear) {
        const depthValue = Math.max(0, Number(item?.depth) || 0);
        if (item?.side === 'front') frontClear = Math.max(frontClear, depthValue);
        else if (item?.side === 'rear') rearClear = Math.max(rearClear, depthValue);
        else if (item?.side === 'side' || item?.side === 'sides') sideClear = Math.max(sideClear, depthValue);
    }
    const localHalfX = width * 0.5 + sideClear;
    const localFront = depth * 0.5 + frontClear;
    const localRear = depth * 0.5 + rearClear;
    const localCenterShift = (localFront - localRear) * 0.5;
    const localHalfZ = (localFront + localRear) * 0.5;
    const centerX = candidate.x + front.x * localCenterShift;
    const centerZ = candidate.z + front.z * localCenterShift;
    const halfX = Math.abs(right.x) * localHalfX + Math.abs(front.x) * localHalfZ;
    const halfZ = Math.abs(right.z) * localHalfX + Math.abs(front.z) * localHalfZ;
    const yMin = candidate.y + min[1];
    return { x: centerX, z: centerZ, halfX, halfZ, yMin, yMax: yMin + height };
}

function candidateFitsModule(def, candidate, module, spacePlan = null) {
    // Building Plan Authority may assign one authored room across multiple envelope
    // modules. Once that room owns placement geometry, its SpacePlan is the tighter
    // authority; a single legacy module rectangle must not clip valid room space.
    if (spacePlan?.architecturalAuthority === 'building-plan') return true;
    if (!module) return true;
    const body = candidateBodyBox(def, candidate);
    return body.minX >= module.cx - module.halfX + 0.03
        && body.maxX <= module.cx + module.halfX - 0.03
        && body.minZ >= module.cz - module.halfZ + 0.03
        && body.maxZ <= module.cz + module.halfZ - 0.03;
}

function candidateFitsSpacePlan(def, candidate, spacePlan) {
    if (!spacePlan) return true;
    return spacePlanAcceptsBox(spacePlan, candidateBodyBox(def, candidate), { allowCirculation: false, requireSameRegion: true });
}

function tryCandidate(def, graph, candidate, tryReserve, module, spacePlan) {
    if (!candidateFitsModule(def, candidate, module, spacePlan)) return null;
    if (!candidateFitsSpacePlan(def, candidate, spacePlan)) return null;
    const reservation = candidateEnvelope(def, graph, candidate);
    if (typeof tryReserve === 'function' && !tryReserve(reservation)) return null;
    return { ...candidate, reservation };
}

function moduleWallCandidates(def, module, yBase, floorH, seed) {
    const [width, height, depth] = dimsOf(def);
    const min = minOf(def, [width, height, depth]);
    const rng = mulberry32(seed ^ 0x4d9f3b21);
    const sides = ['north', 'east', 'south', 'west'];
    const start = seed % sides.length;
    const result = [];
    for (let i = 0; i < sides.length; i++) {
        const side = sides[(start + i) % sides.length];
        const horizontal = side === 'north' || side === 'south';
        const avail = (horizontal ? module.halfX : module.halfZ) - width * 0.5 - 0.18;
        if (avail <= 0.04) continue;
        const along = (rng() - 0.5) * 2 * avail;
        let x = module.cx;
        let z = module.cz;
        let rotY = 0;
        if (side === 'north') { x += along; z -= module.halfZ - depth * 0.5 - 0.07; rotY = 0; }
        else if (side === 'south') { x -= along; z += module.halfZ - depth * 0.5 - 0.07; rotY = Math.PI; }
        else if (side === 'west') { z += along; x -= module.halfX - depth * 0.5 - 0.07; rotY = QUARTER; }
        else { z -= along; x += module.halfX - depth * 0.5 - 0.07; rotY = -QUARTER; }
        const bottom = def.mount === 'wall'
            ? yBase + Math.min(Math.max(0, floorH - height - 0.24), Math.max(1.10, floorH * 0.42))
            : yBase;
        result.push({ x, y: bottom - min[1], z, rotY, mode: 'wall-context' });
    }
    return result;
}

function fabricWallCandidates(def, spacePlan, yBase, floorH, seed) {
    if (!spacePlan) return [];
    const [width, height, depth] = dimsOf(def);
    const min = minOf(def, [width, height, depth]);
    const rng = mulberry32(seed ^ 0x5a31f2c7);
    const walls = spacePlanWallSegments(spacePlan, width + 0.25);
    if (!walls.length) return [];
    const start = (seed >>> 0) % walls.length;
    const result = [];
    for (let i = 0; i < walls.length; i++) {
        const wall = walls[(start + i) % walls.length];
        const dx = wall.x2 - wall.x1;
        const dz = wall.z2 - wall.z1;
        const horizontal = Math.abs(dx) >= Math.abs(dz);
        const length = Math.hypot(dx, dz);
        const alongAvail = Math.max(0, length - width - 0.20);
        const t = length <= 1e-6 ? 0.5 : 0.5 + (rng() - 0.5) * (alongAvail / length);
        const wx = wall.x1 + dx * t;
        const wz = wall.z1 + dz * t;
        const bottom = def.mount === 'wall'
            ? yBase + Math.min(Math.max(0, floorH - height - 0.24), Math.max(1.10, floorH * 0.42))
            : yBase;
        const offset = depth * 0.5 + 0.075;
        const signs = ((seed + i) & 1) ? [1, -1] : [-1, 1];
        for (const sign of signs) {
            if (horizontal) {
                result.push({ x: wx, y: bottom - min[1], z: wz + sign * offset, rotY: sign > 0 ? 0 : Math.PI, mode: 'fabric-wall' });
            } else {
                result.push({ x: wx + sign * offset, y: bottom - min[1], z: wz, rotY: sign > 0 ? QUARTER : -QUARTER, mode: 'fabric-wall' });
            }
        }
    }
    return result;
}

function genericCandidates(def, module, yBase, seed, spacePlan) {
    const min = minOf(def);
    const rng = mulberry32(seed ^ 0x8ca5b713);
    const result = [];
    if (spacePlan) {
        const seen = new Set();
        const passes = [0, 0x9e3779b9, 0x7f4a7c15, 0x51ed270b];
        for (const salt of passes) {
            for (const cell of spacePlanCandidateCells(spacePlan, (seed ^ salt) >>> 0)) {
                const firstRot = Math.floor(rng() * 4);
                for (let r = 0; r < 4 && result.length < 128; r++) {
                    const rot = ((firstRot + r) % 4) * QUARTER;
                    const key = cell.col + ':' + cell.row + ':' + rot;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    result.push({
                        x: cell.x,
                        y: yBase - min[1],
                        z: cell.z,
                        rotY: rot,
                        mode: 'space-plan-region',
                        regionId: cell.regionId,
                    });
                }
                if (result.length >= 128) break;
            }
            if (result.length >= 128) break;
        }
        return result;
    }

    const [width, , depth] = dimsOf(def);
    const clearance = def?.clearance ?? {};
    const marginX = width * 0.5 + Math.max(0.10, Number(clearance.sides) || 0);
    const marginZ = depth * 0.5 + Math.max(0.10, Number(clearance.front) || 0, Number(clearance.rear) || 0);
    const availX = module.halfX - marginX;
    const availZ = module.halfZ - marginZ;
    if (availX <= 0.04 || availZ <= 0.04) return [];
    for (let attempt = 0; attempt < 36; attempt++) {
        result.push({
            x: module.cx + (rng() - 0.5) * 2 * availX,
            y: yBase - min[1],
            z: module.cz + (rng() - 0.5) * 2 * availZ,
            rotY: Math.floor(rng() * 4) * QUARTER,
            mode: 'context-free-fallback',
        });
    }
    return result;
}

export function resolveSemanticPlacement({
    def,
    graph = def?.semanticGraph ?? null,
    module,
    spacePlan = null,
    yBase = 0,
    floorH = 3.15,
    seed = 0,
    placements = [],
    entityId = null,
    moduleKey = module?.key ?? null,
    floor = 0,
    spaceId = spacePlan?.id ?? null,
    tryReserve = null,
} = {}) {
    if (!def || !module) return null;
    const context = { entityId, moduleKey, floor, spaceId };
    const roomPlacements = placements.filter(item => sameSemanticRoom(item, context));
    const requirements = graphList(graph, 'requirements');
    const relationships = graphList(graph, 'relationships');
    const [width, , depth] = dimsOf(def);
    const min = minOf(def);

    if (requirements.includes('support-surface') || relationships.includes('sits-on-work-surface')) {
        const providers = roomPlacements.filter(supportsWorkSurface).reverse();
        for (const provider of providers) {
            const [pw, , pd] = dimsOf(provider.def);
            if (pw + 0.08 < width || pd + 0.08 < depth) continue;
            const candidate = {
                x: provider.x,
                y: physicalTop(provider) - min[1],
                z: provider.z,
                rotY: provider.rotY,
                mode: 'support-surface',
                relationTo: provider.instanceId ?? provider.assetId,
            };
            const placed = tryCandidate(def, graph, candidate, tryReserve, module, spacePlan);
            if (placed) return placed;
        }
        return null;
    }

    if (relationships.includes('faces-work-or-social-surface')) {
        const targets = roomPlacements.filter(supportsWorkSurface).reverse();
        for (const target of targets) {
            const front = frontVector(target.rotY);
            const [, , targetDepth] = dimsOf(target.def);
            const gap = targetDepth * 0.5 + depth * 0.5 + 0.18;
            const candidate = {
                x: target.x + front.x * gap,
                y: yBase - min[1],
                z: target.z + front.z * gap,
                rotY: normalizeAngle(target.rotY + Math.PI),
                mode: 'faces-surface',
                relationTo: target.instanceId ?? target.assetId,
            };
            const placed = tryCandidate(def, graph, candidate, tryReserve, module, spacePlan);
            if (placed) return placed;
        }
    }

    if (relationships.includes('row-alignable')) {
        const anchors = roomPlacements.filter(rowCompatible).reverse();
        for (const anchor of anchors) {
            const right = rightVector(anchor.rotY);
            const [anchorWidth] = dimsOf(anchor.def);
            const spacing = anchorWidth * 0.5 + width * 0.5
                + Math.max(0.04, Number(anchor.def?.clearance?.sides) || 0)
                + Math.max(0.04, Number(def?.clearance?.sides) || 0)
                + 0.04;
            const firstSign = ((seed ^ placements.length) & 1) ? 1 : -1;
            for (const multiple of [1, 2, 3]) {
                for (const sign of [firstSign, -firstSign]) {
                    const candidate = {
                        x: anchor.x + right.x * spacing * multiple * sign,
                        y: yBase - min[1],
                        z: anchor.z + right.z * spacing * multiple * sign,
                        rotY: anchor.rotY,
                        mode: 'row-aligned',
                        relationTo: anchor.instanceId ?? anchor.assetId,
                    };
                    const placed = tryCandidate(def, graph, candidate, tryReserve, module, spacePlan);
                    if (placed) return placed;
                }
            }
        }
    }

    const supportMode = graph?.support?.mode;
    const wallBiased = def.mount === 'wall'
        || supportMode === 'wall'
        || relationships.includes('wall-anchored')
        || relationships.includes('utility-zone-compatible');
    if (wallBiased) {
        const candidates = spacePlan
            ? fabricWallCandidates(def, spacePlan, yBase, floorH, seed)
            : moduleWallCandidates(def, module, yBase, floorH, seed);
        for (const candidate of candidates) {
            const placed = tryCandidate(def, graph, candidate, tryReserve, module, spacePlan);
            if (placed) return placed;
        }
        if (graph?.support?.required && supportMode === 'wall') return null;
    }

    for (const candidate of genericCandidates(def, module, yBase, seed, spacePlan)) {
        const placed = tryCandidate(def, graph, candidate, tryReserve, module, spacePlan);
        if (placed) return placed;
    }
    return null;
}

export function createSemanticPlacementRecord({ def, graph, placement, instanceId = null, spaceId = null, entityId, moduleKey, floor, program }) {
    return {
        instanceId,
        spaceId,
        assetId: def?.id ?? null,
        def,
        graph,
        entityId,
        moduleKey,
        floor,
        program,
        x: placement.x,
        y: placement.y,
        z: placement.z,
        rotY: placement.rotY,
        mode: placement.mode,
        relationTo: placement.relationTo ?? null,
        reservation: placement.reservation ?? null,
    };
}
